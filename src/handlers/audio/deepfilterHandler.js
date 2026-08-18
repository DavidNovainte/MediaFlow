/**
 * DeepFilterNet Handler - 本地 AI 降噪
 * 使用 DeepFilterNet CLI 进行高质量音频降噪
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { isModelInstalled, getModelExecutable } = require('../../utils/modelManager');

// 活跃进程引用
let activeProcess = null;

/**
 * 检查 DeepFilterNet 是否可用
 */
function isAvailable() {
    return isModelInstalled('deepfilter');
}

/**
 * 使用 DeepFilterNet 处理音频
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 */
async function handleDeepFilter(event, options) {
    const { input, output, attenuation = 20 } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    if (!fs.existsSync(input)) {
        return { success: false, error: `Input file not found: ${input}` };
    }

    const executable = getModelExecutable('deepfilter');
    if (!executable || !fs.existsSync(executable)) {
        return { success: false, error: 'DeepFilterNet not installed' };
    }

    try {
        return new Promise((resolve) => {
            // DeepFilterNet CLI 参数
            // deep-filter -i input.wav -o output/ --atten-lim 20
            const outputDir = path.dirname(output);
            const args = [
                '-i', input,
                '-o', outputDir,
                '--atten-lim', String(attenuation)
            ];

            const proc = spawn(executable, args);
            activeProcess = proc;

            let stderr = '';
            let progressPercent = 0;

            proc.stderr.on('data', (data) => {
                const str = data.toString();
                stderr += str;

                // 尝试解析进度
                const match = str.match(/(\d+)%/);
                if (match) {
                    progressPercent = parseInt(match[1], 10);
                    event.sender.send('deepfilter:progress', { progress: progressPercent });
                }
            });

            proc.stdout.on('data', (data) => {
                // 有些进度可能在 stdout
                const str = data.toString();
                const match = str.match(/(\d+)%/);
                if (match) {
                    progressPercent = parseInt(match[1], 10);
                    event.sender.send('deepfilter:progress', { progress: progressPercent });
                }
            });

            proc.on('close', (code) => {
                activeProcess = null;

                if (code === 0) {
                    event.sender.send('deepfilter:progress', { progress: 100 });

                    // DeepFilterNet 输出文件名格式: inputname_DeepFilterNet3.wav
                    const inputBasename = path.basename(input, path.extname(input));
                    const expectedOutput = path.join(outputDir, `${inputBasename}_DeepFilterNet3.wav`);

                    // 重命名为用户期望的输出名
                    if (fs.existsSync(expectedOutput) && expectedOutput !== output) {
                        fs.renameSync(expectedOutput, output);
                    }

                    resolve({
                        success: true,
                        output,
                        engine: 'DeepFilterNet'
                    });
                } else if (code === null) {
                    resolve({ success: false, error: 'Process cancelled' });
                } else {
                    console.error('[DeepFilter] Error:', stderr);
                    resolve({ success: false, error: `DeepFilterNet exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                activeProcess = null;
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 取消处理
 */
function cancelDeepFilter() {
    if (activeProcess) {
        try {
            activeProcess.kill('SIGKILL');
            activeProcess = null;
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

module.exports = {
    isAvailable,
    handleDeepFilter,
    cancelDeepFilter
};
