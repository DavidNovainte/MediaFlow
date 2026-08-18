/**
 * denoiseHandler - 音频降噪处理器
 * 使用 FFmpeg afftdn 滤镜进行自适应降噪
 */

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const binaries = require('../../utils/binaries');
const logger = require('../../utils/logger');

// 活跃进程引用（用于取消）
let activeDenoiseProcess = null;

/**
 * 降噪预设配置
 * nf: 噪声底限 (dB)，越低越激进
 * nt: 噪声类型 (w=白噪声, v=乙烯噪声, s=脉冲噪声)
 */
const DENOISE_PRESETS = {
    light: {
        name: '轻度',
        nf: -20,
        description: '保留更多原声，适合轻微背景噪音'
    },
    medium: {
        name: '中度',
        nf: -30,
        description: '平衡降噪，适合风扇/空调噪音'
    },
    strong: {
        name: '强力',
        nf: -40,
        description: '激进降噪，适合嘈杂环境'
    }
};

/**
 * 获取视频/音频时长
 */
function getMediaDuration(input) {
    const ffmpegPath = binaries.getFfmpegPath();
    try {
        const result = spawnSync(ffmpegPath, ['-i', input], {
            encoding: 'utf8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const output = result.stderr || '';
        const match = output.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        }
    } catch (e) {
        console.warn('[audio:denoise] Duration detection failed:', e.message);
    }
    return 0;
}

/**
 * 音频降噪
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @param {string} options.level - 降噪等级 (light/medium/strong)
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleDenoise(event, options) {
    const { input, output, level = 'medium' } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    // 检查文件是否存在
    if (!fs.existsSync(input)) {
        return { success: false, error: `Input file not found: ${input}` };
    }

    const preset = DENOISE_PRESETS[level] || DENOISE_PRESETS.medium;

    try {
        const ffmpegPath = binaries.getFfmpegPath();
        let duration = getMediaDuration(input);

        // 构建音频滤镜
        // afftdn: 自适应FFT降噪
        // highpass: 高通滤波去除极低频噪音
        // lowpass: 低通滤波去除极高频噪音 (可选)
        const audioFilter = [
            'highpass=f=80',
            `afftdn=nf=${preset.nf}:nt=w:om=o`,
            'lowpass=f=15000'
        ].join(',');

        const args = [
            '-y',
            '-i', input,
            '-af', audioFilter,
            '-c:v', 'copy',  // 视频流直接复制
            output
        ];

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            activeDenoiseProcess = proc;

            let errorOutput = '';
            let lastPercent = 0;
            let stderrBuffer = '';

            proc.stderr.on('data', (data) => {
                const str = data.toString('utf8');
                errorOutput += str;
                stderrBuffer += str;

                const lines = stderrBuffer.split(/[\r\n]+/);
                if (!str.endsWith('\n') && !str.endsWith('\r') && lines.length > 0) {
                    stderrBuffer = lines.pop();
                } else {
                    stderrBuffer = '';
                }

                // 尝试从流中解析时长
                if (duration === 0) {
                    for (const line of lines) {
                        const durMatch = line.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
                        if (durMatch) {
                            duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                            break;
                        }
                    }
                }

                // 解析进度并发送
                if (duration > 0) {
                    for (const line of lines) {
                        const timeMatch = line.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                        if (timeMatch) {
                            const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                            const percent = Math.min(Math.floor((currentTime / duration) * 100), 99);
                            if (!isNaN(percent) && percent > lastPercent) {
                                lastPercent = percent;
                                event.sender.send('denoise:progress', { progress: lastPercent });
                            }
                        }
                    }
                }
            });

            proc.on('close', (code) => {
                activeDenoiseProcess = null;

                if (code === 0) {
                    event.sender.send('denoise:progress', { progress: 100 });

                    // 计算文件大小
                    const inputStats = fs.statSync(input);
                    const outputStats = fs.statSync(output);

                    resolve({
                        success: true,
                        output,
                        inputSize: inputStats.size,
                        outputSize: outputStats.size,
                        level: preset.name
                    });
                } else if (code === null) {
                    resolve({ success: false, error: 'Process cancelled' });
                } else {
                    // 记录失败日志：降噪滤镜链通常比较脆弱，日志尤为重要
                    const fullCmd = `${ffmpegPath} ${args.join(' ')}`;
                    logger.ffmpeg(fullCmd, errorOutput);
                    console.error('[audio:denoise] Error:', errorOutput);
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                activeDenoiseProcess = null;
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 取消降噪处理
 */
function cancelDenoise() {
    if (activeDenoiseProcess) {
        try {
            activeDenoiseProcess.kill('SIGKILL');
            activeDenoiseProcess = null;
            console.log('[audio:denoise] Process cancelled');
            return true;
        } catch (e) {
            console.error('[audio:denoise] Failed to cancel:', e);
            return false;
        }
    }
    return false;
}

/**
 * 获取可用的降噪预设列表
 */
function getDenoisePresets() {
    return Object.entries(DENOISE_PRESETS).map(([key, value]) => ({
        id: key,
        name: value.name,
        description: value.description
    }));
}

module.exports = {
    handleDenoise,
    cancelDenoise,
    getDenoisePresets,
    DENOISE_PRESETS
};
