/**
 * FFmpegRunner - 统一的 FFmpeg 进程管理器
 * 封装 FFmpeg 调用逻辑，避免在各 handler 中重复代码
 */

const { spawn } = require('child_process');
const binaries = require('../../utils/binaries');

class FFmpegRunner {
    // 活跃的 FFmpeg 进程 Map (taskId -> Process)
    static activeProcesses = new Map();

    /**
     * 执行 FFmpeg 命令
     * @param {string[]} args - FFmpeg 参数数组
     * @param {Object} options - 可选配置
     * @param {Function} options.onProgress - 进度回调 (stderrLine: string) => void
     * @param {Function} options.onStderr - stderr 数据回调
     * @returns {Promise<{success: boolean, error?: string, code?: number}>}
     */
    static async run(args, options = {}) {
        const { onProgress, onStderr, taskId = 'default' } = options;
        const ffmpegPath = binaries.getFfmpegPath();

        // 防御性检查：确保参数是数组且路径存在
        if (!Array.isArray(args)) {
            return { success: false, error: 'Invalid arguments: expected array' };
        }

        return new Promise((resolve) => {
            try {
                console.log(`[FFmpegRunner] Spawning: ${ffmpegPath} ${args.join(' ')}`);
                const proc = spawn(ffmpegPath, args);

                // 记录进程
                FFmpegRunner.activeProcesses.set(taskId, proc);

                let stderr = '';

                proc.stderr.on('data', (chunk) => {
                    const str = chunk.toString('utf8');
                    stderr += str;
                    if (onStderr) onStderr(str);
                    if (onProgress) onProgress(str);
                });

                proc.on('close', (code) => {
                    // 清理进程记录
                    if (FFmpegRunner.activeProcesses.get(taskId) === proc) {
                        FFmpegRunner.activeProcesses.delete(taskId);
                    }

                    if (code === 0) {
                        resolve({ success: true });
                    } else if (code === null) {
                        // Process was killed
                        resolve({ success: false, error: 'Process cancelled', code: -1 });
                    } else {
                        // 退出码 4294967295 在 Windows 下常代表 -1 (崩溃或异常退出)
                        const displayCode = code === 4294967295 ? -1 : code;
                        resolve({ success: false, error: stderr || `Process exited with code ${displayCode}`, code: displayCode });
                    }
                });

                proc.on('error', (err) => {
                    FFmpegRunner.activeProcesses.delete(taskId);
                    console.error(`[FFmpegRunner] Spawn error for ${taskId}:`, err);
                    resolve({ success: false, error: err.message });
                });
            } catch (e) {
                resolve({ success: false, error: `Critical failure: ${e.message}` });
            }
        });
    }

    /**
     * 取消活跃的 FFmpeg 进程
     * @param {string} [taskId] - 指定任务 ID，若不传则取消所有进程
     * @returns {boolean} 是否成功取消
     */
    static cancel(taskId) {
        if (taskId) {
            const proc = FFmpegRunner.activeProcesses.get(taskId);
            if (proc) {
                try {
                    FFmpegRunner._killProcess(proc, taskId);
                    FFmpegRunner.activeProcesses.delete(taskId);
                    return true;
                } catch (e) {
                    console.error(`[FFmpegRunner] Failed to cancel ${taskId}:`, e);
                    return false;
                }
            }
        } else {
            // 取消所有
            let success = false;
            for (const [id, proc] of FFmpegRunner.activeProcesses.entries()) {
                try {
                    FFmpegRunner._killProcess(proc, id);
                    success = true;
                } catch (cancelError) {
                    void cancelError;
                }
            }
            FFmpegRunner.activeProcesses.clear();
            console.log('[FFmpegRunner] All processes cancelled');
            return success;
        }
        return false;
    }

    /**
     * 内部杀进程逻辑 (封装平台差异)
     * @private
     */
    static _killProcess(proc, taskId) {
        if (!proc) return;
        try {
            if (process.platform === 'win32') {
                const { exec } = require('child_process');
                console.log(`[FFmpegRunner] Windows: killing process tree for PID ${proc.pid} (${taskId})`);
                exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
                    if (err) console.warn(`[FFmpegRunner] Taskkill warning for ${taskId}:`, err.message);
                });
                // 兜底立即清理
                proc.kill('SIGKILL');
            } else {
                proc.kill('SIGKILL');
            }
        } catch (e) {
            console.warn(`[FFmpegRunner] Kill error for ${taskId}:`, e.message);
        }
    }

    /**
     * 获取指定任务的进程
     * @param {string} taskId 
     * @returns {ChildProcess|null}
     */
    static getProcess(taskId) {
        return FFmpegRunner.activeProcesses.get(taskId) || null;
    }

    /**
     * 设置活跃进程
     * @param {string} taskId 
     * @param {ChildProcess} proc
     */
    static setProcess(taskId, proc) {
        FFmpegRunner.activeProcesses.set(taskId, proc);
    }
    /**
     * 检测系统支持的硬件加速编码器
     * @returns {Promise<Object>} 支持的编码器 Map
     */
    static async detectHardwareAcceleration() {
        if (this._hwCache) return this._hwCache;

        const ffmpegPath = binaries.getFfmpegPath();
        console.log(`[FFmpegRunner] Detecting HW support using: ${ffmpegPath}`);
        return new Promise((resolve) => {
            try {
                const proc = spawn(ffmpegPath, ['-encoders']);
                let output = '';

                // 设置 5 秒超时，防止探测过程卡死
                const timeout = setTimeout(() => {
                    console.warn('[FFmpegRunner] HW Detection timeout, killing process.');
                    proc.kill('SIGKILL');
                    resolve({});
                }, 5000);

                proc.stdout.on('data', data => output += data.toString());
                proc.stderr.on('data', () => { /* 忽略 stderr */ });

                proc.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        console.warn(`[FFmpegRunner] HW Detection exited with code ${code}`);
                    }
                    const support = {
                        h264_nvenc: output.includes('h264_nvenc'), // NVIDIA
                        hevc_nvenc: output.includes('hevc_nvenc'),
                        h264_qsv: output.includes('h264_qsv'),     // Intel
                        hevc_qsv: output.includes('hevc_qsv'),
                        h264_amf: output.includes('h264_amf'),     // AMD
                        hevc_amf: output.includes('hevc_amf')
                    };
                    this._hwCache = support;
                    console.log('[FFmpegRunner] Hardware Acceleration Support:', support);
                    resolve(support);
                });

                proc.on('error', (err) => {
                    clearTimeout(timeout);
                    console.error('[FFmpegRunner] HW Detection spawn error:', err);
                    resolve({});
                });
            } catch (e) {
                console.error('[FFmpegRunner] HW Detection critical error:', e);
                resolve({});
            }
        });
    }

    /**
     * 获取指定编码器的硬件加速版本
     * @param {string} codec - h264, hevc
     * @returns {Promise<string>} 编码器名称
     */
    static async getBestEncoder(codec) {
        const hw = await this.detectHardwareAcceleration();
        if (codec === 'h264') {
            if (hw.h264_nvenc) return 'h264_nvenc';
            if (hw.h264_qsv) return 'h264_qsv';
            if (hw.h264_amf) return 'h264_amf';
            return 'libx264';
        }
        if (codec === 'hevc') {
            if (hw.hevc_nvenc) return 'hevc_nvenc';
            if (hw.hevc_qsv) return 'hevc_qsv';
            if (hw.hevc_amf) return 'hevc_amf';
            return 'libx265';
        }
        if (codec === 'av1') return 'libsvtav1';
        return 'libx264';
    }
}

module.exports = FFmpegRunner;
