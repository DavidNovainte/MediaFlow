/**
 * MediaFlow - Image Service (PixelFlow)
 * 图片处理服务 - 支持 AI 抠图等功能
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
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

class ImageService {
    constructor() { }

    /**
     * AI 智能抠图 (使用 rembg)
     * @param {string} inputPath - 输入图片路径
     * @param {string} outputPath - 输出图片路径
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 处理结果
     */
    async removeBackground(inputPath, outputPath, options = {}) {
        const { model = 'u2net' } = options;

        return new Promise(async (resolve, reject) => {
            const fail = (code, detail) => {
                const err = new Error(detail || code);
                err.code = code;
                err.error = code;
                reject(err);
            };

            const scriptPath = getScriptPath('services/python/rembg_service.py');
            if (!scriptPath || !fs.existsSync(scriptPath)) {
                fail('SCRIPT_MISSING', 'rembg_service.py not found');
                return;
            }

            const python = await demucsHandler.findPython();
            const args = [
                ...python.args,
                scriptPath,
                '--input', inputPath,
                '--output', outputPath,
                '--model', model
            ];

            console.log('[ImageService] Starting background removal:', args);
            const pyProcess = spawn(python.cmd, args, { shell: process.platform === 'win32' });

            let stdoutData = '';
            let stderrData = '';

            pyProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            pyProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            pyProcess.on('close', (code) => {
                if (code !== 0) {
                    try {
                        const json = JSON.parse(stdoutData);
                        if (json.error) {
                            const msg = String(json.error);
                            if (/No module named ['"]?rembg|rembg/i.test(msg)) {
                                fail('REMBG_MISSING', msg);
                                return;
                            }
                            reject(new Error(msg));
                            return;
                        }
                    } catch (e) {
                        void e;
                    }
                    const combined = `${stdoutData}\n${stderrData}`;
                    if (/No module named ['"]?rembg|ModuleNotFoundError.*rembg/i.test(combined)) {
                        fail('REMBG_MISSING', combined.slice(0, 400));
                        return;
                    }
                    if (/python|not recognized|ENOENT/i.test(combined) && /python/i.test(combined)) {
                        fail('PYTHON_MISSING', combined.slice(0, 400));
                        return;
                    }
                    console.error('[ImageService] Python process error:', stderrData);
                    reject(new Error(`Process exited with code ${code}. ${stderrData || stdoutData}`.trim()));
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
                    console.error('[ImageService] JSON Parse Error:', e);
                    reject(new Error('Failed to parse background removal output'));
                }
            });

            pyProcess.on('error', (err) => {
                const msg = err?.message || String(err);
                if (/ENOENT|not recognized|not found/i.test(msg)) {
                    fail('PYTHON_MISSING', msg);
                    return;
                }
                reject(new Error(`Failed to start python process: ${msg}`));
            });
        });
    }
}

module.exports = new ImageService();
