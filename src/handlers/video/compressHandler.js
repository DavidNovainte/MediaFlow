/**
 * compressHandler - 视频压缩处理器
 * 处理 video:compress IPC 调用
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const binaries = require('../../utils/binaries');
const logger = require('../../utils/logger');
const { postProcessVideo } = require('../../utils/videoUtils');

// 已移除全局 activeCompressProcess，改用 FFmpegRunner 管理

/**
 * 编解码器配置
 */
const CODEC_CONFIGS = {
    'h264': {
        encoder: 'libx264',
        crfMap: { high: '23', medium: '28', low: '35', extreme: '42' },
        presetMap: { fast: 'veryfast', balanced: 'medium', extreme: 'slower' }
    },
    'hevc': {
        encoder: 'libx265',
        crfMap: { high: '26', medium: '32', low: '38', extreme: '42' },
        presetMap: { fast: 'veryfast', balanced: 'medium', extreme: 'slow' }
    },
    'av1': {
        encoder: 'libsvtav1',
        crfMap: { high: '32', medium: '42', low: '52', extreme: '60' },
        presetMap: { fast: '8', balanced: '5', extreme: '4' }
    }
};

/**
 * 获取媒体信息 (时长及轨道)
 * @param {string} input - 输入文件路径
 * @returns {Promise<{duration: number, hasVideo: boolean}>}
 */
async function getMediaInfo(input) {
    const ffprobePath = binaries.getFfprobePath();
    try {
        const result = spawnSync(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration:stream=codec_type',
            '-of', 'json',
            input
        ], { encoding: 'utf8', timeout: 10000 });
        
        const info = JSON.parse(result.stdout || '{}');
        const duration = parseFloat(info.format?.duration || 0);
        const hasVideo = info.streams?.some(s => s.codec_type === 'video') || false;
        
        return { duration, hasVideo };
    } catch (e) {
        console.warn('[video:compress] Probe failed, falling back to basic duration:', e.message);
        // Fallback: 仅尝试正则获取时长
        const ffmpegPath = binaries.getFfmpegPath();
        const res = spawnSync(ffmpegPath, ['-i', input], { encoding: 'utf8', timeout: 5000 });
        const match = (res.stderr || '').match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
        let duration = 0;
        if (match) duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        return { duration, hasVideo: true }; // 默认假设有视频以保持原有逻辑
    }
}

/**
 * 视频压缩 (高级)
 */
async function handleCompress(event, options) {
    const { input, output, quality, audio, codec = 'h264', preset = 'balanced', targetSize, taskId = 'default' } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        if (!fs.existsSync(input)) {
            return { success: false, error: `Input file not found: ${input}` };
        }

        const ffmpegPath = binaries.getFfmpegPath();
        const { duration, hasVideo } = await getMediaInfo(input);
        const outExt = path.extname(output).toLowerCase();
        const isOutputMP3 = outExt === '.mp3';
        
        const FFmpegRunner = require('./FFmpegRunner');

        let attempts = 0;
        let tryHardware = hasVideo; // 只有有视频且未被禁用才尝试硬件加速
        let lastError = '';

        // 尝试循环：最佳硬件加速 -> CPU 软解
        while (attempts < 2) {
            attempts++;
            
            // 编码器探测模块
            let currentEncoder = 'libx264';
            if (hasVideo) {
                currentEncoder = tryHardware ? (await FFmpegRunner.getBestEncoder(codec)) : (codec === 'hevc' ? 'libx265' : 'libx264');
            }
            
            const isHW = hasVideo && (currentEncoder.includes('nvenc') || currentEncoder.includes('qsv') || currentEncoder.includes('amf'));
            const activeConfig = CODEC_CONFIGS[codec] || CODEC_CONFIGS['h264'];
            const crf = activeConfig.crfMap[quality] || activeConfig.crfMap['medium'];
            let ffPreset = activeConfig.presetMap[preset] || activeConfig.presetMap['balanced'];

            if (isHW) {
                if (currentEncoder.includes('nvenc')) {
                    ffPreset = preset === 'fast' ? 'p1' : (preset === 'extreme' ? 'p7' : 'p4');
                } else if (currentEncoder.includes('qsv') || currentEncoder.includes('amf')) {
                    ffPreset = preset === 'fast' ? 'speed' : (preset === 'extreme' ? 'quality' : 'balanced');
                }
            }

            let args = [];
            if (options.startTime) args.push('-ss', options.startTime.toString());
            if (options.duration && options.duration > 0) args.push('-t', options.duration.toString());
            args.push('-i', input);

            // ==================== 核心逻辑分歧：视频处理器 ====================
            if (hasVideo) {
                if (targetSize && duration > 0 && !isHW) {
                    const targetBits = targetSize * 8 * 1024 * 1024;
                    const audioBitrate = audio === 'remove' ? 0 : (audio === 'low' ? 64000 : 128000);
                    const videoBitrate = Math.floor((targetBits / duration) - audioBitrate);
                    if (videoBitrate > 100000) {
                        args.push('-c:v', activeConfig.encoder, '-b:v', `${Math.floor(videoBitrate / 1000)}k`);
                        args.push('-maxrate', `${Math.floor(videoBitrate * 1.5 / 1000)}k`);
                        args.push('-bufsize', `${Math.floor(videoBitrate * 2 / 1000)}k`);
                    } else {
                        args.push('-c:v', currentEncoder, '-crf', crf);
                    }
                } else {
                    args.push('-c:v', currentEncoder);
                    if (isHW) {
                        if (currentEncoder.includes('nvenc')) args.push('-rc:v', 'constqp', '-qp:v', crf);
                        else if (currentEncoder.includes('qsv')) args.push('-global_quality', crf);
                        else if (currentEncoder.includes('amf')) args.push('-rc', 'cqp', '-qv', crf);
                        else args.push('-rc', 'vbr', '-cq', crf);
                    } else {
                        args.push('-crf', crf);
                    }
                }

                // 视频辅助参数
                if (codec === 'av1' && !isHW) {
                    args.push('-preset', ffPreset, '-svtav1-params', 'tune=0');
                } else if (codec === 'hevc' && !isHW) {
                    args.push('-preset', ffPreset, '-tag:v', 'hvc1', '-profile:v', 'main');
                } else {
                    args.push('-preset', ffPreset);
                    if (codec === 'hevc' && isHW) args.push('-tag:v', 'hvc1');
                    if (!isHW && codec === 'h264') args.push('-profile:v', 'high', '-level', '4.1');
                }
                args.push('-vf', 'scale=\'trunc(iw/2)*2:trunc(ih/2)*2\'');
            } else {
                // [优化] 纯音频模式：忽略视频流和视频参数
                args.push('-vn');
            }

            // ==================== 核心逻辑分歧：音频处理器 ====================
            const isWebM = output.toLowerCase().endsWith('.webm');
            if (audio === 'remove') {
                args.push('-an');
            } else {
                // 如果输出是 MP3，必须使用 libmp3lame
                const aEncoder = isOutputMP3 ? 'libmp3lame' : (isWebM ? 'libopus' : 'aac');
                const bitRate = audio === 'low' ? '64k' : '128k';
                
                if (audio === 'copy' && !isWebM && !isOutputMP3) {
                    args.push('-c:a', 'copy');
                } else {
                    args.push('-c:a', aEncoder, '-b:a', bitRate);
                }
            }

            args.push('-movflags', '+faststart', '-y', output);

            console.log(`[video:compress] Attempt ${attempts} (V:${hasVideo?'YES':'NO'}, HW:${isHW?'YES':'NO'}):`, args.join(' '));

            let lastPercent = 0;
            let lastProgressAt = 0;
            const PROGRESS_MIN_MS = 200;
            const runResult = await FFmpegRunner.run(args, {
                taskId,
                onProgress: (str) => {
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
                                    event.sender.send('video:compressProgress', { taskId, progress: lastPercent });
                                }
                            }
                        }
                    }
                }
            });

            if (runResult.success) {
                if (hasVideo) await postProcessVideo(output);
                const stats = fs.statSync(output);
                const inputStats = fs.statSync(input);
                return {
                    success: true,
                    output,
                    outputSize: stats.size,
                    inputSize: inputStats.size,
                    compressionRatio: `${((1 - stats.size / inputStats.size) * 100).toFixed(1)}%`
                };
            } else {
                lastError = runResult.error;
                const isHWError = runResult.code === -22 || runResult.code === 4294967295 || runResult.code === 4294967274 ||
                                 /invalid argument|device|hwaccel|encoder|failed to setup|init.*failed/i.test(lastError);
                
                if (tryHardware && isHWError && hasVideo) {
                    console.warn(`[video:compress] HW failed, retrying CPU: ${lastError}`);
                    tryHardware = false;
                    continue; 
                }
                
                const fullCmd = `${ffmpegPath} ${args.join(' ')}`;
                logger.ffmpeg(fullCmd, lastError);
                return { success: false, error: lastError };
            }
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleCompress,
    CODEC_CONFIGS
};
