/**
 * mergeHandler - 视频合并处理器
 * 处理 video:merge 和 video:multiClip IPC 调用
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const binaries = require('../../utils/binaries');
const processQueue = require('../../utils/ProcessQueue');
const logger = require('../../utils/logger');
const { postProcessVideo } = require('../../utils/videoUtils');

// 使用集合追踪所有活跃的合并任务 ID (支持并发和队列管理)
const activeMergeTaskIds = new Set();

function escapeConcatPath(filePath) {
    return filePath.replace(/'/g, String.raw`'\\''`);
}

/**
 * 多段视频剪辑与合并 (Smart Multi-Clip)
 * 从单个视频中提取多段并合并
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @param {Array<{start: number, end: number}>} options.segments - 要提取的片段
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleMultiClip(event, options) {
    const { input, output, segments, accurate = false } = options;
    if (!input || !output || !segments || segments.length === 0) {
        return { success: false, error: 'Missing input, output or segments' };
    }

    const ffmpegPath = binaries.getFfmpegPath();
    const tempFiles = [];
    let listPath = null; // 在外部声明，确保 finally 可以访问

    try {
        // 1. 处理每个片段
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const tempOutput = path.join(path.dirname(output), `temp_seg_${Date.now()}_${i}.mp4`);
            tempFiles.push(tempOutput);

            await new Promise((resolve, reject) => {
                const args = ['-y'];

                if (accurate) {
                    const safeSeekStart = Math.max(0, seg.start - 10);
                    const duration = Math.max(0, seg.end - seg.start);

                    args.push(
                        '-ss', String(safeSeekStart),
                        '-i', input,
                        '-ss', String(seg.start - safeSeekStart),
                        '-t', String(duration),
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-crf', '22',
                        '-c:a', 'aac',
                        tempOutput
                    );
                } else {
                    args.push(
                        '-ss', String(seg.start),
                        '-to', String(seg.end),
                        '-i', input,
                        '-c', 'copy',
                        '-avoid_negative_ts', 'make_zero',
                        tempOutput
                    );
                }

                const proc = spawn(ffmpegPath, args);
                let errLog = '';
                proc.stderr.on('data', d => errLog += d.toString());
                proc.on('close', code => {
                    if (code === 0) resolve();
                    else reject(new Error(`Segment ${i} failed: ${errLog}`));
                });
            });
        }

        // 2. 创建合并列表
        listPath = path.join(path.dirname(output), `concat_list_${Date.now()}.txt`);
        const fileContent = tempFiles.map(p => `file '${escapeConcatPath(p)}'`).join('\n');
        fs.writeFileSync(listPath, fileContent, 'utf8');

        // 3. 合并片段
        await new Promise((resolve, reject) => {
            const args = [
                '-y',
                '-fflags', '+genpts+igndts',  // Fix timestamps
                '-f', 'concat',
                '-safe', '0',
                '-i', listPath,
                '-c:v', accurate ? 'libx264' : 'copy',
                '-c:a', 'aac', '-b:a', '192k',
                '-af', 'aresample=async=1:first_pts=0',
                '-movflags', '+faststart',
                output
            ];
            const proc = spawn(ffmpegPath, args);
            let errLog = '';
            proc.stderr.on('data', d => errLog += d.toString());
            proc.on('close', code => {
                if (code === 0) resolve();
                else {
                    const fullCmd = `${ffmpegPath} ${args.join(' ')}`;
                    logger.ffmpeg(fullCmd, errLog);
                    reject(new Error(`Merge failed: ${errLog}`));
                }
            });
        });

        if (fs.existsSync(output)) {
            await postProcessVideo(output);
        }
        return { success: true, output };

    } catch (error) {
        console.error('[video:multiClip] Error:', error.message);
        return { success: false, error: error.message };

    } finally {
        // 确保始终清理临时文件 (成功或失败都执行)
        const filesToClean = [...tempFiles];
        if (listPath) filesToClean.push(listPath);

        filesToClean.forEach(f => {
            try {
                if (fs.existsSync(f)) {
                    fs.unlinkSync(f);
                    console.log('[video:multiClip] Cleaned up:', path.basename(f));
                }
            } catch {
                console.warn('[video:multiClip] Failed to cleanup:', f);
            }
        });
    }
}

/**
 * 获取视频时长
 */
/**
 * 获取视频时长 (Async)
 */
async function getVideoDuration(filePath) {
    const ffmpegPath = binaries.getFfmpegPath();
    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, ['-i', filePath]);
        let output = '';
        proc.stderr.on('data', d => output += d.toString());
        proc.on('close', () => {
            const match = output.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
            if (match) {
                resolve(parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]));
            } else {
                resolve(0);
            }
        });
        proc.on('error', () => resolve(0));
    });
}

/**
 * 获取视频帧率
 */
async function getVideoFps(filePath) {
    const ffprobePath = binaries.getFfprobePath();
    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ];
        const proc = spawn(ffprobePath, args);
        let output = '';
        proc.stdout.on('data', d => output += d.toString());
        proc.on('close', () => {
            // Parse "30000/1001" or "24/1" format
            const parts = output.trim().split('/');
            if (parts.length === 2) {
                const fps = parseFloat(parts[0]) / parseFloat(parts[1]);
                resolve(Math.round(fps * 100) / 100); // Round to 2 decimals
            } else {
                resolve(parseFloat(output.trim()) || 0);
            }
        });
        proc.on('error', () => resolve(0));
    });
}

/**
 * 获取视频分辨率
 */
async function getVideoResolution(filePath) {
    const ffprobePath = binaries.getFfprobePath();
    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0',
            filePath
        ];
        const proc = spawn(ffprobePath, args);
        let output = '';
        proc.stdout.on('data', d => output += d.toString());
        proc.on('close', () => {
            // Parse "1920,1080" format
            const parts = output.trim().split(',');
            if (parts.length === 2) {
                resolve({ width: parseInt(parts[0]) || 0, height: parseInt(parts[1]) || 0 });
            } else {
                resolve({ width: 0, height: 0 });
            }
        });
        proc.on('error', () => resolve({ width: 0, height: 0 }));
    });
}

/**
 * 获取音频流信息 (用于智能合并)
 * @returns {Promise<{hasAudio: boolean, codec: string}>}
 */
async function getAudioInfo(filePath) {
    const ffprobePath = binaries.getFfprobePath();
    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=codec_name,sample_rate,channels',
            '-of', 'csv=p=0',
            filePath
        ];
        const proc = spawn(ffprobePath, args);
        let output = '';
        proc.stdout.on('data', d => output += d.toString());
        proc.on('close', () => {
            // output format: codec_name,sample_rate,channels
            const parts = output.trim().split(',');
            if (parts.length >= 3) {
                resolve({
                    hasAudio: true,
                    codec: parts[0],
                    sampleRate: parseInt(parts[1]),
                    channels: parseInt(parts[2])
                });
            } else {
                resolve({ hasAudio: false, codec: null, sampleRate: 0, channels: 0 });
            }
        });
        proc.on('error', () => resolve({ hasAudio: false, codec: null, sampleRate: 0, channels: 0 }));
    });
}

/**
 * 视频合并（智能检测帧率）
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string[]} options.inputs - 输入文件路径数组
 * @param {string} options.output - 输出文件路径
 * @param {boolean} options.forceReencode - 强制重新编码（用于帧率不一致时）
 * @param {number} options.targetFps - 用户选择的目标帧率
 * @param {boolean} options.checkOnly - 仅检测帧率，不合并
 * @returns {Promise<{success: boolean, output?: string, error?: string, fpsInfo?: Object}>}
 */
async function handleMerge(event, options) {
    const { inputs, output, forceReencode, checkOnly, transition, normalizeAudio } = options;
    if (!inputs || !inputs.length || !output) {
        return { success: false, error: 'Missing inputs or output' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();

        // 1. 检测所有视频的帧率、分辨率和音频信息
        const fpsResults = [];
        const resolutions = [];
        const audioInfos = [];
        const durations = [];

        for (const input of inputs) {
            const fps = await getVideoFps(input);
            const resolution = await getVideoResolution(input);
            const audio = await getAudioInfo(input);
            const duration = await getVideoDuration(input);

            fpsResults.push({ path: input, fps, name: path.basename(input) });
            resolutions.push(resolution);
            audioInfos.push(audio);
            durations.push(duration);
        }

        // 2. 分析帧率一致性
        const fpsList = fpsResults.map(r => r.fps).filter(f => f > 0);
        const modeMap = {};
        fpsList.forEach(f => {
            const rounded = Math.round(f);
            modeMap[rounded] = (modeMap[rounded] || 0) + 1;
        });
        const sortedModes = Object.entries(modeMap).sort((a, b) => b[1] - a[1]);
        const dominantFps = sortedModes[0] ? parseInt(sortedModes[0][0]) : 30;
        // 3. 分析分辨率方向 (竖屏 vs 横屏)
        let portraitCount = 0;
        let landscapeCount = 0;
        resolutions.forEach(res => {
            if (res.width > 0 && res.height > 0) {
                if (res.height > res.width) portraitCount++;
                else landscapeCount++;
            }
        });

        const isPortrait = portraitCount > landscapeCount;
        const outputWidth = isPortrait ? 1080 : 1920;
        const outputHeight = isPortrait ? 1920 : 1080;

        // Mark mismatched videos
        const mismatchedVideos = fpsResults.filter(r => {
            const rounded = Math.round(r.fps);
            return rounded !== dominantFps && r.fps > 0;
        });

        if (checkOnly) {
            return {
                success: true,
                fpsInfo: {
                    videos: fpsResults,
                    dominantFps,
                    hasMismatch: mismatchedVideos.length > 0,
                    mismatchedVideos
                }
            };
        }

        if (mismatchedVideos.length > 0 && !forceReencode) {
            return {
                success: false,
                error: 'FRAME_RATE_MISMATCH',
                fpsInfo: {
                    videos: fpsResults,
                    dominantFps,
                    hasMismatch: true,
                    mismatchedVideos
                }
            };
        }

        const SAFE_CODECS = ['aac', 'mp3'];
        const hasAnyAudio = audioInfos.some(a => a.hasAudio);
        const allHaveAudio = audioInfos.every(a => a.hasAudio);
        const firstAudio = audioInfos.find(a => a.hasAudio);
        const firstCodec = firstAudio?.codec;
        const firstRate = firstAudio?.sampleRate;
        const firstChannels = firstAudio?.channels;

        const sameCodec = audioInfos.every(a => !a.hasAudio || a.codec === firstCodec);
        const isSafeCodec = firstCodec && SAFE_CODECS.includes(firstCodec);
        const sameRate = audioInfos.every(a => !a.hasAudio || a.sampleRate === firstRate);
        const sameChannels = audioInfos.every(a => !a.hasAudio || a.channels === firstChannels);

        // 最终决定是否需要重编码
        let finalForceReencode = forceReencode || (transition && transition !== 'none') || normalizeAudio;
        if (mismatchedVideos.length > 0) {
            finalForceReencode = true;
        } else if (hasAnyAudio) {
            if (!allHaveAudio) {
                finalForceReencode = true;
            } else if (!sameCodec) {
                finalForceReencode = true;
            } else if (!isSafeCodec) {
                finalForceReencode = true;
            } else if (!sameRate) {
                finalForceReencode = true;
            } else if (!sameChannels) {
                finalForceReencode = true;
            }
        }

        // 6. 计算总时长（用于进度显示）
        const transDur = 1.0;
        let totalDuration = durations.reduce((a, b) => a + b, 0);
        if (transition && transition !== 'none' && inputs.length > 1) {
            totalDuration -= (inputs.length - 1) * transDur;
        }

        const listPath = path.join(path.dirname(output), `mediaflow_concat_list_${Date.now()}.txt`);
        const taskId = `merge_${Date.now()}`;
        activeMergeTaskIds.add(taskId);

        return processQueue.push(taskId, () => {
            return new Promise((resolve) => {
                let args;
                if (finalForceReencode) {
                    const inputArgs = [];
                    inputs.forEach(p => inputArgs.push('-i', p));

                    let filterParts = [];
                    const hasAnyVideo = resolutions.some(res => res.width > 0);

                    // 1. 各路视频与音频标准化
                    inputs.forEach((_, i) => {
                        // 处理视频流
                        if (hasAnyVideo) {
                            if (resolutions[i].width > 0) {
                                // 强制统一 Timebase (settb) 是解决合并视频无法播放的关键
                                filterParts.push(`[${i}:v]fps=${dominantFps},settb=1/90000,scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}];`);
                            } else {
                                // 针对无视频流的音频文件，生成黑色背景视频流以保持滤镜图对齐
                                filterParts.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${durations[i]},fps=${dominantFps},settb=1/90000,format=yuv420p[v${i}];`);
                            }
                        }

                        // 处理音频流
                        if (audioInfos[i] && audioInfos[i].hasAudio) {
                            filterParts.push(`[${i}:a]aresample=48000:async=1,asettb=1/48000,pan=stereo|c0=c0|c1=c1[a${i}];`);
                        } else {
                            filterParts.push(`anullsrc=r=48000:cl=stereo:d=${durations[i]},asettb=1/48000[a${i}];`);
                        }
                    });

                    // 2. 转场处理 (xfade)
                    let lastV = hasAnyVideo ? 'v0' : null;
                    let lastA = 'a0';
                    let currentOffset = durations[0];

                    if (transition && transition !== 'none' && inputs.length > 1) {
                        const xType = transition === 'fade' ? 'fade' : transition; // 简化映射

                        for (let i = 1; i < inputs.length; i++) {
                            const offset = currentOffset - transDur;
                            const nextV = `v${i}`;
                            const nextA = `a${i}`;
                            const outV = `vout${i}`;
                            const outA = `aout${i}`;

                            if (hasAnyVideo) {
                                // 关键：xfade 需要后续视频的时间戳偏移到 transition 开始的点
                                const delayedV = `v${i}d`;
                                filterParts.push(`[${nextV}]setpts=PTS-STARTPTS+${offset}/TB[${delayedV}];`);
                                filterParts.push(`[${lastV}][${delayedV}]xfade=transition=${xType}:duration=${transDur}:offset=${offset}[${outV}];`);
                                lastV = outV;
                            }

                            filterParts.push(`[${lastA}][${nextA}]acrossfade=d=${transDur}[${outA}];`);
                            lastA = outA;
                            currentOffset = currentOffset + durations[i] - transDur;
                        }
                    } else {
                        // 无转场则按顺序合并
                        let concatInputs = '';
                        inputs.forEach((_, i) => {
                            if (hasAnyVideo) concatInputs += `[v${i}]`;
                            concatInputs += `[a${i}]`;
                        });
                        const vOut = hasAnyVideo ? '[voutn]' : '';
                        filterParts.push(`${concatInputs}concat=n=${inputs.length}:v=${hasAnyVideo ? 1 : 0}:a=1${vOut}[aoutn];`);
                        if (hasAnyVideo) lastV = 'voutn';
                        lastA = 'aoutn';
                    }

                    // 3. 音量均衡与最终输出
                    let finalAudioFilter = `[${lastA}]`;
                    if (normalizeAudio) {
                        finalAudioFilter += 'loudnorm=I=-16:TP=-1.5:LRA=11[finalaudio]';
                    } else {
                        finalAudioFilter += 'anull[finalaudio]';
                    }
                    filterParts.push(finalAudioFilter);

                    const preset = options.isPreview ? 'ultrafast' : 'fast';
                    args = [
                        '-y', ...inputArgs,
                        '-filter_complex', filterParts.join('')
                    ];

                    // 映射流
                    if (hasAnyVideo) {
                        args.push('-map', `[${lastV}]`);
                    }
                    args.push('-map', '[finalaudio]');

                    // 编码参数
                    if (hasAnyVideo) {
                        args.push('-c:v', 'libx264', '-preset', preset, '-crf', '23', '-pix_fmt', 'yuv420p', '-vsync', 'cfr');
                    } else {
                        args.push('-vn'); // 无视频流
                    }

                    args.push(
                        '-c:a', 'aac', '-b:a', '128k',
                        '-movflags', '+faststart',
                        output
                    );

                    try {
                        fs.unlinkSync(listPath);
                    } catch {
                        // Best-effort cleanup for temporary concat list.
                    }
                } else {
                    const fileContent = inputs.map(p => {
                        const safePath = escapeConcatPath(p.replace(/\\/g, '/'));
                        return `file '${safePath}'`;
                    }).join('\n');
                    fs.writeFileSync(listPath, fileContent, 'utf8');

                    args = ['-y', '-fflags', '+genpts+igndts', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', output];
                }

                const proc = spawn(ffmpegPath, args);
                processQueue.registerProcess(taskId, proc);
                let errorOutput = '';
                let lastPercent = 0;

                proc.stderr.on('data', data => {
                    const str = data.toString('utf8');
                    errorOutput += str;
                    const match = str.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
                    if (match) {
                        const currentTime = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
                        const percent = Math.min(99, Math.round((currentTime / totalDuration) * 100));
                        if (percent > lastPercent) {
                            lastPercent = percent;
                            if (event.sender && (typeof event.sender.isDestroyed !== 'function' || !event.sender.isDestroyed())) {
                                event.sender.send('merge:progress', percent);
                            }
                        }
                    }
                });

                proc.on('close', async (code) => {
                    activeMergeTaskIds.delete(taskId);
                    try {
                        if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    } catch {
                        // Best-effort cleanup for temporary concat list.
                    }

                    if (event.sender && (typeof event.sender.isDestroyed !== 'function' || !event.sender.isDestroyed())) {
                        event.sender.send('merge:progress', 100);
                    }

                    if (code === 0 && fs.existsSync(output)) {
                        // 成功后执行品牌化处理 (封面提取与元数据清洗)
                        await postProcessVideo(output);
                        resolve({ success: true, output, reencoded: !!finalForceReencode, taskId });
                    } else {
                        // 记录失败的详细信息
                        const fullCmd = `${ffmpegPath} ${args.join(' ')}`;
                        logger.ffmpeg(fullCmd, errorOutput);
                        resolve({ success: false, error: `FFmpeg failed (Code ${code}): ${errorOutput.slice(-200)}`, taskId });
                    }
                });

                proc.on('error', err => {
                    activeMergeTaskIds.delete(taskId);
                    try {
                        if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    } catch {
                        // Best-effort cleanup for temporary concat list.
                    }
                    resolve({ success: false, error: err.message, taskId });
                });
            });
        });

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 取消所有活跃的合并任务
 */
function cancelMerge() {
    if (activeMergeTaskIds.size > 0) {
        console.log(`[video:merge] Cancelling all active tasks: ${activeMergeTaskIds.size}`);
        for (const taskId of activeMergeTaskIds) {
            processQueue.cancelTask(taskId);
        }
        activeMergeTaskIds.clear();
        return true;
    }
    return false;
}

module.exports = {
    handleMultiClip,
    handleMerge,
    cancelMerge
};
