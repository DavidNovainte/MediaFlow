/**
 * speedHandler.js - 视频变速 + 截帧 + GIF 处理器
 * 合并处理以减少文件数量
 */

const { spawn, spawnSync } = require('child_process');
const binaries = require('../../utils/binaries');

// 活跃进程引用

/**
 * 获取视频时长
 */
function getVideoDuration(input) {
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
            return parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
        }
    } catch (e) {
        console.warn('[speedHandler] Duration detection failed:', e.message);
    }
    return 0;
}

/**
 * 视频变速
 * @param {Object} options
 * @param {string} options.input - 输入文件
 * @param {string} options.output - 输出文件
 * @param {number} options.speed - 速度倍率 (0.25 - 4.0)
 * @param {boolean} options.preservePitch - 保持音调 (默认true)
 */
async function handleChangeSpeed(event, options) {
    const { input, output, speed = 1.0 } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    if (speed < 0.25 || speed > 4.0) {
        return { success: false, error: 'Speed must be between 0.25 and 4.0' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();
        const duration = getVideoDuration(input);

        // 计算视频和音频滤镜
        // 视频: setpts=1/speed*PTS (速度越快,PTS系数越小)
        const videoPts = (1 / speed).toFixed(4);

        // 音频: atempo只支持0.5-2.0,需要链式处理
        let audioFilters = [];
        let remainingSpeed = speed;

        // 分解速度到atempo支持的范围
        while (remainingSpeed > 2.0) {
            audioFilters.push('atempo=2.0');
            remainingSpeed /= 2.0;
        }
        while (remainingSpeed < 0.5) {
            audioFilters.push('atempo=0.5');
            remainingSpeed /= 0.5;
        }
        audioFilters.push(`atempo=${remainingSpeed.toFixed(4)}`);

        const audioFilter = audioFilters.join(',');
        const filterComplex = `[0:v]setpts=${videoPts}*PTS[v];[0:a]${audioFilter}[a]`;

        const args = [
            '-y',
            '-i', input,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            output
        ];

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            // 🆕 使用 FFmpegRunner 管理进程
            const FFmpegRunner = require('./FFmpegRunner');
            FFmpegRunner.setProcess(options.taskId || 'speed', proc);

            let errorOutput = '';
            let lastPercent = 0;

            proc.stderr.on('data', (data) => {
                const str = data.toString('utf8');
                errorOutput += str;

                // 解析进度
                if (duration > 0) {
                    const timeMatch = str.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                    if (timeMatch) {
                        const currentTime = parseFloat(timeMatch[1]) * 3600 +
                            parseFloat(timeMatch[2]) * 60 +
                            parseFloat(timeMatch[3]);
                        // 输出时长 = 原时长 / 速度
                        const expectedDuration = duration / speed;
                        const percent = Math.min(Math.floor((currentTime / expectedDuration) * 100), 99);
                        if (percent > lastPercent) {
                            lastPercent = percent;
                            if (event.sender && !event.sender.isDestroyed()) {
                                event.sender.send('speed:progress', { progress: percent });
                            }
                        }
                    }
                }
            });

            proc.on('close', (code) => {
                FFmpegRunner.activeProcesses.delete(options.taskId || 'speed');
                if (code === 0) {
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('speed:progress', { progress: 100 });
                    }
                    resolve({ success: true, output });
                } else if (code === null) {
                    resolve({ success: false, cancelled: true, error: 'Process cancelled' });
                } else {
                    console.error('[speedHandler] FFmpeg error:', errorOutput.slice(-500));
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                FFmpegRunner.activeProcesses.delete(options.taskId || 'speed');
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 视频截帧
 * @param {Object} options
 * @param {string} options.input - 输入视频
 * @param {string} options.output - 输出图片路径
 * @param {number} options.time - 截取时间点(秒)
 */
async function handleExtractFrame(event, options) {
    const { input, output, time = 0 } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();

        const args = [
            '-y',
            '-ss', String(time),
            '-i', input,
            '-frames:v', '1',
            '-q:v', '2',
            output
        ];

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output });
                } else {
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 创建GIF
 * @param {Object} options
 * @param {string} options.input - 输入视频
 * @param {string} options.output - 输出GIF路径
 * @param {number} options.start - 起始时间(秒)
 * @param {number} options.duration - 持续时长(秒)
 * @param {number} options.fps - 帧率 (默认15)
 * @param {number} options.width - 宽度 (默认480, -1保持比例)
 */
async function handleCreateGIF(event, options) {
    const {
        input,
        output,
        start = 0,
        duration = 3,
        fps = 15,
        width = 480
    } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();

        // 高质量GIF生成 (使用调色板)
        const filterComplex = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

        const args = [
            '-y',
            '-ss', String(start),
            '-t', String(duration),
            '-i', input,
            '-vf', filterComplex,
            '-loop', '0',
            output
        ];

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            const FFmpegRunner = require('./FFmpegRunner');
            const gifTaskId = options.taskId || 'gif';
            FFmpegRunner.setProcess(gifTaskId, proc);
            let errorOutput = '';
            let lastPercent = 0;
            const total = Math.max(0.1, Number(duration) || 3);

            proc.stderr.on('data', (data) => {
                const str = data.toString('utf8');
                errorOutput += str;

                // 解析进度
                const timeMatch = str.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                if (timeMatch) {
                    const currentTime = parseFloat(timeMatch[1]) * 3600 +
                        parseFloat(timeMatch[2]) * 60 +
                        parseFloat(timeMatch[3]);
                    const percent = Math.min(Math.floor((currentTime / total) * 100), 99);
                    if (percent > lastPercent) {
                        lastPercent = percent;
                        if (event.sender && !event.sender.isDestroyed()) {
                            event.sender.send('gif:progress', { progress: percent, taskId: gifTaskId });
                        }
                    }
                }
            });

            proc.on('close', (code) => {
                FFmpegRunner.activeProcesses.delete(gifTaskId);
                if (code === 0) {
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('gif:progress', { progress: 100, taskId: gifTaskId });
                    }
                    resolve({ success: true, output });
                } else if (code === null) {
                    resolve({ success: false, cancelled: true, error: 'Process cancelled' });
                } else {
                    console.error('[speedHandler] GIF error:', errorOutput.slice(-500));
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                FFmpegRunner.activeProcesses.delete(gifTaskId);
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleChangeSpeed,
    handleExtractFrame,
    handleCreateGIF
};
