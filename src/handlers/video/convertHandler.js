/**
 * convertHandler - 格式转换处理器
 * 处理 video:convert IPC 调用
 */

const { spawnSync } = require('child_process');
const binaries = require('../../utils/binaries');

/**
 * 质量到 CRF 映射
 */
const CRF_MAPS = {
    webm: { high: '20', medium: '30', low: '40' },
    default: { high: '18', medium: '23', low: '28' }
};

// 移除全局变量

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
        const match = output.match(/Duration: (\d+):(\d+):(\d+)/);
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        }
    } catch (e) {
        console.warn('[video:convert] Duration detection failed:', e.message);
    }
    return 0;
}

/**
 * 格式转换
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @param {string} options.format - 目标格式 (mp3/webm/mp4等)
 * @param {string} options.quality - 质量级别
 */
async function handleConvert(event, options) {
    const { input, output, format, quality, taskId = 'default' } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        const FFmpegRunner = require('./FFmpegRunner');
        
        // 预探测时长 (可选，FFmpegRunner 会在流中解析)
        let duration = getVideoDuration(input);

        let attempts = 0;
        let tryHardware = true;
        let lastError = '';

        // 尝试循环：硬件加速 -> CPU 软解
        while (attempts < 2) {
            attempts++;
            // 针对 H264 探测最佳编码器
            const encoder = tryHardware ? (await FFmpegRunner.getBestEncoder('h264')) : 'libx264';
            const isHW = encoder.includes('nvenc') || encoder.includes('qsv') || encoder.includes('amf');

            let args = [];
            if (options.startTime) args.push('-ss', options.startTime.toString());
            if (options.duration && options.duration > 0) args.push('-t', options.duration.toString());
            args.push('-i', input);

            if (format === 'mp3') {
                args.push('-vn', '-acodec', 'libmp3lame', '-ab', '192k');
            } else if (format === 'webm') {
                if (quality === 'copy') {
                    args.push('-c', 'copy');
                } else {
                    const crf = CRF_MAPS.webm[quality] || '30';
                    args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k');
                }
            } else if (quality === 'copy') {
                args.push('-c', 'copy', '-map_metadata', '0');
            } else {
                const crf = CRF_MAPS.default[quality] || '23';
                args.push('-c:v', encoder);
                let ffPreset = 'medium';
                if (isHW) {
                    // NVENC does not accept x264-style "balanced" — use p1..p7
                    if (encoder.includes('nvenc')) {
                        args.push('-rc:v', 'constqp', '-qp:v', crf);
                        ffPreset = quality === 'high' ? 'p5' : (quality === 'low' ? 'p1' : 'p4');
                    } else if (encoder.includes('qsv')) {
                        args.push('-global_quality', crf);
                        ffPreset = quality === 'high' ? 'quality' : (quality === 'low' ? 'speed' : 'balanced');
                    } else if (encoder.includes('amf')) {
                        args.push('-rc', 'cqp', '-qv', crf);
                        ffPreset = quality === 'high' ? 'quality' : (quality === 'low' ? 'speed' : 'balanced');
                    } else {
                        args.push('-rc', 'vbr', '-cq', crf);
                        ffPreset = 'balanced';
                    }
                } else {
                    args.push('-crf', crf);
                    ffPreset = 'medium';
                }
                args.push('-preset', ffPreset, '-c:a', 'aac', '-b:a', '128k');
                // 强制偶数尺寸以防 libx264 报错
                args.push('-vf', 'scale=\'trunc(iw/2)*2:trunc(ih/2)*2\'');
            }

            args.push('-y', output);

            console.log(`[video:convert] Attempt ${attempts} (${isHW ? 'HW' : 'CPU'}):`, args.join(' '));

            let lastPercent = 0;
            let lastProgressAt = 0;
            const PROGRESS_MIN_MS = 200;
            const runResult = await FFmpegRunner.run(args, {
                taskId,
                onProgress: (str) => {
                    // 动态解析时长（如果之前没获取到）
                    if (duration === 0) {
                        const durMatch = str.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
                        if (durMatch) {
                            duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                        }
                    }

                    if (duration > 0) {
                        const timeMatch = str.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                        if (timeMatch) {
                            const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                            const percent = Math.min(Math.floor((currentTime / duration) * 100), 99);
                            const now = Date.now();
                            if (!isNaN(percent) && percent > lastPercent && (now - lastProgressAt >= PROGRESS_MIN_MS || percent >= 99)) {
                                lastPercent = percent;
                                lastProgressAt = now;
                                if (event.sender && !event.sender.isDestroyed()) {
                                    event.sender.send('convert:progress', { taskId, progress: lastPercent });
                                }
                            }
                        }
                    }
                }
            });

            if (runResult.success) {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('convert:progress', { taskId, progress: 100 });
                }
                return { success: true, output };
            } else {
                lastError = runResult.error;
                // 检测硬件初始化失败
                const isHWError = runResult.code === -22 || runResult.code === 4294967294 || runResult.code === 4294967295 ||
                                 /invalid argument|device|hwaccel|encoder|failed to setup|init.*failed/i.test(lastError);

                if (tryHardware && isHWError && format !== 'mp3' && format !== 'webm') {
                    console.warn(`[video:convert] HW acceleration failed, falling back to CPU. Error: ${lastError}`);
                    tryHardware = false;
                    continue;
                }

                console.error('[video:convert] Final Error:', lastError);
                return { success: false, error: lastError };
            }
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { handleConvert, CRF_MAPS };
