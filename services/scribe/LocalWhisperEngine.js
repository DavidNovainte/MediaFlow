/**
 * MediaFlow - LocalWhisperEngine
 * 音视频转录 - 本地 (faster-whisper) 引擎
 */

const { spawn } = require('child_process');
const path = require('path');
const { getScriptPath } = require('../../src/utils/binaries');

/** Optional: full product ships demucsHandler; Community may omit audio Pro modules. */
let demucsHandler;
try {
    demucsHandler = require('../../src/handlers/audio/demucsHandler');
} catch (error) {
    void error;
    demucsHandler = {
        async findPython() {
            const isWindows = process.platform === 'win32';
            return {
                cmd: isWindows ? 'python' : 'python3',
                args: [],
                version: 'fallback'
            };
        }
    };
}

/**
 * Turn raw Python / DLL crashes into short, readable toasts.
 * Strips long paths and mojibake from WinError messages.
 */
function formatLocalEngineError(code, stdoutData, stderrData) {
    const combined = `${stdoutData || ''}\n${stderrData || ''}`;

    // Prefer JSON error if present in mixed output
    try {
        const m = combined.match(/\{[\s\S]*"error"\s*:\s*"([^"]+)"[\s\S]*\}/);
        if (m && m[1]) return m[1];
    } catch (_) { /* ignore */ }

    const lower = combined.toLowerCase();
    if (
        lower.includes('winerror 126') ||
        lower.includes('shm.dll') ||
        lower.includes('torch_cpu.dll') ||
        lower.includes('ctranslate2') && lower.includes('dll')
    ) {
        return (
            '本地转录引擎安装不完整（PyTorch / ctranslate2 DLL 缺失）。' +
            '请在项目 .venv 执行: pip install --force-reinstall ctranslate2 faster-whisper torch --index-url https://download.pytorch.org/whl/cpu'
        );
    }
    if (lower.includes('faster_whisper') || lower.includes('no module named')) {
        return '本地转录依赖未安装。请在 .venv 执行: pip install faster-whisper ctranslate2';
    }
    if (lower.includes('modulenotfounderror') || lower.includes('import error')) {
        return '本地 Python 依赖缺失，请检查 .venv 中 faster-whisper / torch 是否可用';
    }

    // Keep message short for toast UI
    const oneLine = combined
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-3)
        .join(' | ')
        .slice(0, 280);

    return oneLine
        ? `本地转录失败 (code ${code}): ${oneLine}`
        : `本地转录进程退出 (code ${code})`;
}

class LocalWhisperEngine {
    constructor() {
        this.activeProcesses = new Set();
        this._userCancelled = false;
    }

    /**
     * 取消所有活跃进程
     */
    killAll() {
        console.log(`[LocalWhisperEngine] Killing ${this.activeProcesses.size} processes`);
        this._userCancelled = true;
        for (const proc of this.activeProcesses) {
            try {
                proc.kill();
            } catch (e) { /* ignore */ }
        }
        this.activeProcesses.clear();
    }

    /**
     * 本地转录 (使用 faster-whisper)
     */
    async transcribeLocal(filePath, options = {}) {
        const {
            model = 'base',
            device = 'auto',
            language = null,
            onProgress = () => { }
        } = options;

        this._userCancelled = false;

        return new Promise(async (resolve, reject) => {
            const scriptPath = getScriptPath('services/python/transcribe.py');
            const args = [
                scriptPath,
                '--input', filePath,
                '--model', model,
                '--device', device
            ];

            if (language) {
                args.push('--language', language);
            }

            if (options.diarize) {
                args.push('--diarize');
                const engine = options.diarizeEngine || 'sherpa';
                args.push('--diarize-engine', engine);
                if (engine === 'pyannote' && options.hfToken) {
                    args.push('--hf-token', options.hfToken);
                }
            }

            if (options.isolateVocals) {
                args.push('--isolate_vocals');
            }

            if (options.initialPrompt) {
                args.push('--initial_prompt', options.initialPrompt);
            }

            console.log('[LocalWhisperEngine] Starting local transcription:', args);
            const python = await demucsHandler.findPython();
            const pyProcess = spawn(python.cmd, [...python.args, ...args]);
            this.activeProcesses.add(pyProcess);

            let stdoutData = '';
            let stderrData = '';

            pyProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            pyProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                stderrData += msg;
                // Whisper time progress (seconds)
                const progressMatch = msg.match(/PROGRESS:(\d+(\.\d+)?)/);
                if (progressMatch) {
                    onProgress(parseFloat(progressMatch[1]));
                }
                // Lazy sherpa model download / diarize phases
                for (const line of msg.split(/\r?\n/)) {
                    const m = line.match(/^DIARIZE_MODEL:(\w+)\s*(.*)$/);
                    if (!m) continue;
                    const phase = m[1];
                    const detail = (m[2] || '').trim();
                    let percent = null;
                    const pct = detail.match(/([\d.]+)\s*$/);
                    if (pct && (phase === 'progress' || phase === 'run')) {
                        percent = parseFloat(pct[1]);
                    }
                    onProgress({
                        kind: 'diarize_model',
                        phase,
                        detail,
                        percent,
                        message: formatDiarizeModelMessage(phase, detail)
                    });
                }
            });

            pyProcess.on('close', (code) => {
                this.activeProcesses.delete(pyProcess);
                if (this._userCancelled || code === null) {
                    resolve({ success: false, cancelled: true, error: 'CANCELLED_BY_USER' });
                    return;
                }
                if (code !== 0) {
                    try {
                        const json = JSON.parse(stdoutData);
                        if (json.error) {
                            reject(new Error(json.error));
                            return;
                        }
                        resolve(json);
                        return;
                    } catch (e) { /* fall through to friendly message */ }
                    console.error('[LocalWhisperEngine] Local process error:', stderrData);
                    reject(new Error(formatLocalEngineError(code, stdoutData, stderrData)));
                    return;
                }

                try {
                    const result = JSON.parse(stdoutData);
                    if (result.success === false) {
                        reject(new Error(result.error || 'Unknown error'));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    console.error('[LocalWhisperEngine] JSON Parse Error:', e);
                    reject(new Error('Failed to parse local transcription output'));
                }
            });

            pyProcess.on('error', (err) => {
                this.activeProcesses.delete(pyProcess);
                reject(new Error(`Failed to start python process: ${err.message}`));
            });
        });
    }

    /**
     * 检查本地环境
     */
    async checkLocalEnv() {
        return new Promise((resolve) => {
            const py = spawn('python', ['--version']);
            this.activeProcesses.add(py);

            let error = '';
            py.on('error', (err) => {
                this.activeProcesses.delete(py);
                error = err.message;
            });
            py.on('close', async (code) => {
                this.activeProcesses.delete(py);
                if (code !== 0) {
                    resolve({ available: false, error: 'Python not found (ensure "python" is in PATH)' });
                    return;
                }
                const python = await demucsHandler.findPython();
                const check = spawn(python.cmd, [...python.args, '-c', 'import faster_whisper']);
                this.activeProcesses.add(check);
                check.on('close', (c) => {
                    this.activeProcesses.delete(check);
                    if (c === 0) resolve({ available: true });
                    else resolve({ available: false, error: 'Module "faster-whisper" not installed' });
                });
                check.on('error', () => {
                    this.activeProcesses.delete(check);
                    resolve({ available: false, error: 'Failed to check module' });
                });
            });
        });
    }

    /**
     * 获取已下载的本地模型列表
     */
    async getDownloadedModels() {
        return new Promise(async (resolve, reject) => {
            const scriptPath = getScriptPath('services/python/manage_models.py');
            const python = await demucsHandler.findPython();
            const pythonProcess = spawn(python.cmd, [...python.args, scriptPath, 'list']);
            this.activeProcesses.add(pythonProcess);

            let result = '';
            let error = '';

            pythonProcess.stdout.on('data', (data) => {
                result += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            pythonProcess.on('close', (code) => {
                this.activeProcesses.delete(pythonProcess);
                if (code !== 0) {
                    reject(new Error(error || `Process exited with code ${code}`));
                } else {
                    try {
                        resolve(JSON.parse(result));
                    } catch (e) {
                        reject(new Error('Failed to parse model list: ' + result));
                    }
                }
            });
            pythonProcess.on('error', (err) => {
                this.activeProcesses.delete(pythonProcess);
                reject(err);
            });
        });
    }

    /**
     * 删除本地模型
     */
    async deleteModel(modelId) {
        return new Promise(async (resolve, reject) => {
            const scriptPath = getScriptPath('services/python/manage_models.py');
            const python = await demucsHandler.findPython();
            const pythonProcess = spawn(python.cmd, [...python.args, scriptPath, 'delete', '--model', modelId]);
            this.activeProcesses.add(pythonProcess);

            let result = '';
            let error = '';

            pythonProcess.stdout.on('data', (data) => {
                result += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            pythonProcess.on('close', (code) => {
                this.activeProcesses.delete(pythonProcess);
                if (code !== 0) {
                    reject(new Error(error || `Process exited with code ${code}`));
                } else {
                    try {
                        const response = JSON.parse(result);
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse delete response: ' + result));
                    }
                }
            });
            pythonProcess.on('error', (err) => {
                this.activeProcesses.delete(pythonProcess);
                reject(err);
            });
        });
    }

    /**
     * 下载指定模型
     */
    async downloadModel(modelName, onProgress = () => { }) {
        return new Promise(async (resolve, reject) => {
            const scriptPath = getScriptPath('services/python/manage_models.py');
            const python = await demucsHandler.findPython();
            const pythonProcess = spawn(python.cmd, [...python.args, scriptPath, 'download', '--model', modelName]);
            this.activeProcesses.add(pythonProcess);

            let result = '';
            let stderrData = '';

            pythonProcess.stdout.on('data', (data) => {
                result += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
                const match = stderrData.match(/(\d+)%/);
                if (match) {
                    onProgress(parseInt(match[1]));
                }
            });

            pythonProcess.on('close', (code) => {
                this.activeProcesses.delete(pythonProcess);
                if (code !== 0) {
                    reject(new Error(stderrData || `Process exited with code ${code}`));
                } else {
                    try {
                        const response = JSON.parse(result);
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse download response: ' + result));
                    }
                }
            });

            pythonProcess.on('error', (err) => {
                this.activeProcesses.delete(pythonProcess);
                reject(new Error(`Failed to start download process: ${err.message}`));
            });
        });
    }

    /**
     * Sherpa diarization models — not bundled; user/lazy download into ~/.mediaflow/models/
     */
    async getSherpaModelStatus() {
        return this._runSherpaDiarizeCli(['--status']);
    }

    async downloadSherpaModels(onProgress = () => { }) {
        return this._runSherpaDiarizeCli(['--download'], onProgress);
    }

    async _runSherpaDiarizeCli(extraArgs = [], onProgress = () => { }) {
        return new Promise(async (resolve) => {
            try {
                const scriptPath = getScriptPath('services/python/sherpa_diarize.py');
                const python = await demucsHandler.findPython();
                const pyProcess = spawn(python.cmd, [...python.args, scriptPath, ...extraArgs], {
                    env: {
                        ...process.env,
                        // Optional mirror (also settable by user env)
                        // MEDIAFLOW_MODEL_MIRROR=https://ghproxy.net/
                    }
                });
                this.activeProcesses.add(pyProcess);

                let stdoutData = '';
                let stderrData = '';

                pyProcess.stdout.on('data', (data) => {
                    stdoutData += data.toString();
                });
                pyProcess.stderr.on('data', (data) => {
                    const msg = data.toString();
                    stderrData += msg;
                    for (const line of msg.split(/\r?\n/)) {
                        const m = line.match(/^DIARIZE_MODEL:(\w+)\s*(.*)$/);
                        if (!m) continue;
                        const phase = m[1];
                        const detail = (m[2] || '').trim();
                        let percent = null;
                        const pct = detail.match(/([\d.]+)\s*$/);
                        if (pct && phase === 'progress') {
                            percent = parseFloat(pct[1]);
                        }
                        try {
                            onProgress({
                                kind: 'diarize_model',
                                phase,
                                detail,
                                percent,
                                message: formatDiarizeModelMessage(phase, detail)
                            });
                        } catch (_) { /* ignore */ }
                    }
                });

                pyProcess.on('close', (code) => {
                    this.activeProcesses.delete(pyProcess);
                    try {
                        const json = JSON.parse(stdoutData.trim().split('\n').filter(Boolean).pop() || '{}');
                        if (code !== 0 && !json.success && !json.ready) {
                            resolve({
                                success: false,
                                error: json.error || stderrData || `exit ${code}`,
                                ...json
                            });
                            return;
                        }
                        resolve({ success: json.success !== false, ...json });
                    } catch (e) {
                        resolve({
                            success: code === 0,
                            error: code === 0 ? null : (stderrData || e.message),
                            raw: stdoutData
                        });
                    }
                });

                pyProcess.on('error', (err) => {
                    this.activeProcesses.delete(pyProcess);
                    resolve({ success: false, error: err.message });
                });
            } catch (e) {
                resolve({ success: false, error: e.message });
            }
        });
    }
}

function formatDiarizeModelMessage(phase, detail = '') {
    const labelMap = {
        segmentation: '分割模型',
        embedding: '声纹模型'
    };
    const parts = String(detail || '').split(/\s+/);
    const labelKey = parts[0];
    const label = labelMap[labelKey] || labelKey || '';

    switch (phase) {
    case 'start':
        return `正在下载说话人模型${label ? `（${label}）` : ''}…`;
    case 'progress': {
        const pct = parts[parts.length - 1];
        return `下载说话人模型${label ? `（${label}）` : ''} ${pct}%`;
    }
    case 'extract':
        return '正在解压说话人模型…';
    case 'done':
        return `说话人模型已下载${label ? `（${label}）` : ''}`;
    case 'ready':
        return '说话人模型已就绪';
    case 'run':
        return `正在区分说话人… ${parts[parts.length - 1] || ''}%`.trim();
    default:
        return detail || phase;
    }
}

module.exports = new LocalWhisperEngine();
