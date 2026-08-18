/**
 * TTS Handler
 * 处理语音合成 (Edge-TTS)
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getFfmpegPath, getFfprobePath, getScriptPath } = require('../../utils/binaries');
const demucsHandler = require('../audio/demucsHandler');


let currentTTSProc = null;
const AUTO_FIT_MIN_DURATION = 0.35;
const AUTO_FIT_TARGET_RATIO = 0.96;
const AUTO_FIT_MAX_RATE = 85;
const EDGE_HELPER_RETRYABLE_ERROR_MARKERS = [
    'NoAudioReceived',
    'No audio was received',
    'Service Unavailable',
    '503',
    'ClientConnectorError',
    'Timeout'
];
const EDGE_HELPER_RETRY_DELAY_MS = 350;
const EDGE_HELPER_MAX_RETRIES = 1;

function parseRatePercent(rate) {
    if (typeof rate === 'number' && Number.isFinite(rate)) {
        return Math.round(rate);
    }

    const match = String(rate ?? '').trim().match(/([+-]?\d+(?:\.\d+)?)/);
    return match ? Math.round(Number(match[1])) : 0;
}

function clampRatePercent(rate, maxRatePercent = AUTO_FIT_MAX_RATE) {
    const numericRate = Number.isFinite(rate) ? Math.round(rate) : 0;
    return Math.max(-95, Math.min(maxRatePercent, numericRate));
}

function ratePercentToSpeedFactor(ratePercent) {
    return Math.max(0.1, 1 + (parseRatePercent(ratePercent) / 100));
}

function speedFactorToRatePercent(speedFactor, maxRatePercent = AUTO_FIT_MAX_RATE) {
    if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
        return 0;
    }

    return clampRatePercent((speedFactor - 1) * 100, maxRatePercent);
}

function computeAutoFitRatePercent({ baseRatePercent = 0, measuredDuration = 0, targetDuration = 0, maxRatePercent = AUTO_FIT_MAX_RATE } = {}) {
    if (!Number.isFinite(measuredDuration) || !Number.isFinite(targetDuration) || targetDuration < AUTO_FIT_MIN_DURATION) {
        return null;
    }

    const safeTargetDuration = targetDuration * AUTO_FIT_TARGET_RATIO;
    if (measuredDuration <= safeTargetDuration) {
        return null;
    }

    const currentSpeedFactor = ratePercentToSpeedFactor(baseRatePercent);
    const requiredSpeedFactor = currentSpeedFactor * (measuredDuration / safeTargetDuration);
    const adjustedRatePercent = speedFactorToRatePercent(requiredSpeedFactor, maxRatePercent);
    const normalizedBaseRate = clampRatePercent(baseRatePercent, maxRatePercent);

    return adjustedRatePercent > normalizedBaseRate ? adjustedRatePercent : null;
}

function getSubtitleAutoFitRateCap(subtitle = {}) {
    const numericCap = Number(subtitle?.maxRatePercent);
    return Number.isFinite(numericCap) && numericCap > 0
        ? numericCap
        : AUTO_FIT_MAX_RATE;
}

function formatRatePercent(ratePercent) {
    const normalized = parseRatePercent(ratePercent);
    return `${normalized >= 0 ? '+' : ''}${normalized}%`;
}

function isRetryableEdgeHelperError(error) {
    const output = String(error?.message || error || '');
    return EDGE_HELPER_RETRYABLE_ERROR_MARKERS.some((marker) => output.includes(marker));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryEdgeHelperExecution(execute, options = {}) {
    const {
        maxRetries = EDGE_HELPER_MAX_RETRIES,
        retryDelayMs = EDGE_HELPER_RETRY_DELAY_MS
    } = options;

    let attempt = 0;
    while (true) {
        try {
            return await execute();
        } catch (error) {
            if (attempt >= maxRetries || !isRetryableEdgeHelperError(error)) {
                throw error;
            }

            attempt += 1;
            console.warn(`[TTS] Retrying Edge helper after transient failure (${attempt}/${maxRetries}):`, error.message || error);
            await wait(retryDelayMs);
        }
    }
}

function setupTTSHandlers(ipcMain) {

    const edgeHandler = require('./tts/EdgeTTSHandler');
    const openaiHandler = require('./tts/OpenAITTSHandler');
    const elevenHandler = require('./tts/ElevenLabsTTSHandler');

    // Helper: Select Handler
    const getHandler = (engine) => {
        switch (engine) {
        case 'openai':
            return openaiHandler;
        case 'elevenlabs':
            return elevenHandler;
        case 'edge':
        default:
            return edgeHandler;
        }
    };

    // 1. Get Voices
    ipcMain.handle('tts:voices', async (event, { engine, apiKey } = {}) => {
        try {
            const handler = getHandler(engine);
            // Some handlers need apiKey to list voices (ElevenLabs)
            // Edge doesn't need anything
            // OpenAI is static but we can pass key if needed contextually
            return await handler.getVoices(apiKey);
        } catch (e) {
            console.error(`[TTS] Voice List Failed (${engine}):`, e);
            return []; // Return empty on error
        }
    });

    ipcMain.handle('tts:edgeCheck', async () => {
        try {
            return await edgeHandler.checkAvailability();
        } catch (error) {
            return { available: false, error: error.message };
        }
    });

    ipcMain.handle('tts:edgeInstall', async (event) => {
        try {
            return await edgeHandler.installDependency((status) => {
                event.sender.send('tts:edgeInstallProgress', { status });
            });
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // 2. Preview (Generate Single Temp File)
    ipcMain.handle('tts:preview', async (event, { text, voice, rate, pitch, engine, apiKey }) => {
        const tempPath = path.join(require('os').tmpdir(), `preview_${Date.now()}.mp3`);
        try {
            const handler = getHandler(engine);
            await handler.generateAudio({
                text,
                voice,
                rate,
                pitch,
                outputPath: tempPath,
                apiKey
            });

            const audioBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath).catch(() => { });
            return { success: true, audioData: audioBuffer };

        } catch (error) {
            console.error('[TTS Preview] Error:', error);
            if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath).catch(() => { });
            return { success: false, error: error.message };
        }
    });

    // 3. Generate Single File (for export/internal use)
    ipcMain.handle('tts:generate', async (event, { text, voice, rate, pitch, engine, apiKey, outputPath, targetDuration, maxRatePercent }) => {
        try {
            const handler = getHandler(engine);
            const baseRatePercent = parseRatePercent(rate);
            await handler.generateAudio({
                text,
                voice,
                rate: baseRatePercent,
                pitch,
                outputPath,
                apiKey
            });

            if ((engine || 'edge') === 'edge') {
                const duration = await getAudioDuration(outputPath);
                const adjustedRatePercent = computeAutoFitRatePercent({
                    baseRatePercent,
                    measuredDuration: duration,
                    targetDuration: Number(targetDuration),
                    maxRatePercent: Number.isFinite(Number(maxRatePercent)) ? Number(maxRatePercent) : AUTO_FIT_MAX_RATE
                });

                if (adjustedRatePercent !== null) {
                    await handler.generateAudio({
                        text,
                        voice,
                        rate: adjustedRatePercent,
                        pitch,
                        outputPath,
                        apiKey
                    });
                }
            }

            return outputPath;
        } catch (error) {
            console.error('[TTS Generate] Error:', error);
            throw error;
        }
    });

    // 4. Stop / Cancel
    ipcMain.on('tts:stop', () => {
        if (currentTTSProc) {
            try {
                currentTTSProc.kill();
                console.log('[TTS] Process killed by user');
            } catch (e) {
                console.warn('[TTS] Failed to kill process:', e);
            }
        }
    });

    // 获取音频时长
    async function getAudioDuration(filePath) {
        return new Promise((resolve) => {
            const ffprobePath = getFfprobePath();
            const proc = spawn(ffprobePath, [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ]);
            let out = '';
            proc.stdout.on('data', d => out += d);
            proc.on('close', () => resolve(parseFloat(out.trim()) || 0));
        });
    }

    // 修剪片头静音，确保配音紧贴起始点
    async function trimLeadingSilence(filePath) {
        return new Promise((resolve, reject) => {
            const ffmpegPath = getFfmpegPath();
            const tempPath = filePath.replace('.mp3', '_tmp_trim.mp3');
            // silenceremove 滤镜：从起始点移除静音 (阈值 -45dB)
            const args = [
                '-i', filePath,
                '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0',
                '-y', tempPath
            ];
            const proc = spawn(ffmpegPath, args);
            proc.on('close', async (code) => {
                if (code === 0) {
                    try {
                        await fs.promises.unlink(filePath);
                        await fs.promises.rename(tempPath, filePath);
                        resolve();
                    } catch (e) { reject(e); }
                } else {
                    console.error('[TTS] Silence trim failed for:', filePath);
                    resolve(); // Skip on failure to keep flow
                }
            });
            proc.on('error', () => resolve());
        });
    }

    // 生成静音文件
    async function createSilenceFile(duration, outputPath) {
        return new Promise((resolve, reject) => {
            const ffmpegPath = getFfmpegPath();
            // Generate 1s silent mp3/wav to valid format
            const args = [
                '-f', 'lavfi',
                '-i', 'anullsrc=r=24000:cl=mono',
                '-t', duration.toString(),
                '-q:a', '9',
                '-y',
                outputPath
            ];
            const proc = spawn(ffmpegPath, args);
            proc.on('close', (code) => code === 0 ? resolve(outputPath) : reject(new Error('Silence gen failed')));
        });
    }

    // 批量生成并合并音频
    ipcMain.handle('tts:generateFullAudio', async (event, { subtitles, voice, rate, pitch, style }) => {
        const tempDir = require('os').tmpdir();
        const runId = Date.now();
        const baseDir = path.join(tempDir, `mediaflow_tts_${runId}`);
        const baseRatePercent = parseRatePercent(rate);

        await fs.promises.mkdir(baseDir, { recursive: true });

        const clips = []; // 重要：初始化片段数组
        try {
            // 1. Generate Audio for each subtitle
            // Parallelism optional but recommended. Limit concurrency?
            // For now specific sequential to avoid rate limits or CPU issues? edge-tts is binary, sequential is safer.
            let isCancelled = false;
            const python = await demucsHandler.findPython();
            const stopHandler = () => {
                isCancelled = true;
                console.log('[TTS] Cancellation signal received');
            };
            ipcMain.on('tts:stop', stopHandler);

            for (let i = 0; i < subtitles.length; i++) {
                if (isCancelled) {
                    console.log('[TTS] Generation aborted by user');
                    break;
                }

                const sub = subtitles[i];
                // Notify progress
                event.sender.send('tts:progress', {
                    index: i,
                    total: subtitles.length,
                    percent: (i / subtitles.length) * 100,
                    text: sub.text?.slice(0, 20)
                });

                if (!sub.text || sub.text.trim().length === 0) continue;

                const text = sub.text.replace(/[\r\n]/g, ' ');
                const filename = `seg_${i.toString().padStart(4, '0')}.mp3`;
                const filePath = path.join(baseDir, filename);
                const textFile = path.join(baseDir, `seg_${i}.txt`);

                // Write text to file to avoid command line encoding issues
                await fs.promises.writeFile(textFile, text, 'utf-8');

                // Use the helper script to get word-level timestamps
                const helperPath = getScriptPath('src/handlers/subtitle/tts/edge_tts_helper.py');
                const runEdgeHelper = (ratePercent) => new Promise((resolve, reject) => {
                    const args = [
                        ...python.args,
                        helperPath,
                        textFile,
                        voice || 'zh-CN-XiaoxiaoNeural',
                        filePath,
                        formatRatePercent(ratePercent),
                        pitch || '+0Hz',
                        style || 'general'
                    ];

                    const proc = spawn(python.cmd, args);
                    currentTTSProc = proc;
                    let stdout = '';
                    let stderr = '';
                    proc.stdout.on('data', d => stdout += d.toString());
                    proc.stderr.on('data', d => stderr += d.toString());

                    proc.on('close', code => {
                        currentTTSProc = null;
                        if (code === 0) {
                            try {
                                const trimStdout = stdout.trim();
                                const result = JSON.parse(trimStdout);
                                if (result.success) {
                                    resolve(result.words);
                                } else {
                                    console.error('[TTS Helper] Logic failure:', result.error, result.detail);
                                    reject(new Error(result.error || 'Helper failed'));
                                }
                            } catch {
                                console.error('[TTS Helper] JSON parse error. Raw stdout:', stdout);
                                console.error('[TTS Helper] Error output (stderr):', stderr);
                                resolve(null);
                            }
                        } else if (isCancelled) {
                            resolve(null);
                        } else {
                            let userFriendlyError = `TTS helper failed: ${stderr}`;
                            if (stderr.includes('503') || stderr.includes('Service Unavailable')) {
                                userFriendlyError = '微软语音服务暂时不可用 (503)，请检查网络或稍后再试。';
                            } else if (stderr.includes('ClientConnectorError')) {
                                userFriendlyError = '无法连接到微软语音服务，请检查网络或代理设置。';
                            }
                            reject(new Error(userFriendlyError));
                        }
                    });
                });

                let appliedRatePercent = baseRatePercent;
                let words = await retryEdgeHelperExecution(() => runEdgeHelper(appliedRatePercent));

                if (isCancelled) break;

                // 自动修剪前导静音 (消除片头空白，确保声音紧贴字幕块)
                await trimLeadingSilence(filePath);

                let duration = await getAudioDuration(filePath);
                const adjustedRatePercent = computeAutoFitRatePercent({
                    baseRatePercent: appliedRatePercent,
                    measuredDuration: duration,
                    targetDuration: Number(sub?.targetDuration),
                    maxRatePercent: getSubtitleAutoFitRateCap(sub)
                });

                if (adjustedRatePercent !== null) {
                    appliedRatePercent = adjustedRatePercent;
                    words = await retryEdgeHelperExecution(() => runEdgeHelper(appliedRatePercent));
                    if (isCancelled) break;
                    await trimLeadingSilence(filePath);
                    duration = await getAudioDuration(filePath);
                }

                clips.push({
                    id: sub.id,
                    startSeconds: typeof sub.start === 'number' ? sub.start : parseTime(sub.start),
                    duration: duration,
                    path: filePath,
                    words: words,
                    ratePercent: appliedRatePercent
                });
            }

            ipcMain.off('tts:stop', stopHandler);

            if (isCancelled || clips.length === 0) {
                // Cleanup partial files if cancelled? 
                return null;
            }

            // 2. Build Concat List
            const listPath = path.join(baseDir, 'concat_list.txt');
            // We need a silence file for padding.
            // Concat demuxer works best if files have same format/codec.
            // Edge-tts output mp3.
            const silencePath = path.join(baseDir, 'silence.mp3');
            await createSilenceFile(0.1, silencePath); // 0.1s base silence

            let fileContent = '';
            let currentTime = 0;

            for (const clip of clips) {
                const gap = clip.startSeconds - currentTime;
                if (gap > 0.05) { // Threshold 50ms
                    // Add silence
                    // Option A: Use 'duration' directive on a looping silence file?
                    // ffmpeg concat demuxer:
                    // file 'silence.mp3'
                    // duration 5.0
                    // file 'next.mp3'
                    fileContent += `file '${silencePath.replace(/\\/g, '/')}'\n`;
                    fileContent += `duration ${gap.toFixed(3)}\n`;
                }

                fileContent += `file '${clip.path.replace(/\\/g, '/')}'\n`;
                // fileContent += `duration ${clip.duration}\n`; // Not strictly needed if file is full read, but good for safety?
                // Actually 'duration' in concat demuxer forces the duration of the file entry. 
                // If omitted, it plays the whole file. That is what we want.

                currentTime = clip.startSeconds + clip.duration;
            }

            // Write list file
            await fs.promises.writeFile(listPath, fileContent);

            // 3. Concat using FFmpeg
            const outputAudioPath = path.join(baseDir, 'full_audio.mp3');
            const concatArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', listPath,
                '-c', 'copy', // Copy codec if possible (mp3 + mp3)
                '-y',
                outputAudioPath
            ];

            // 执行合并
            await new Promise((resolve, reject) => {
                const ffmpegPath = getFfmpegPath();
                const proc = spawn(ffmpegPath, concatArgs);
                proc.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`FFmpeg concat failed with code ${code}`));
                });
            });

            // 检查文件是否真的生成了
            if (!fs.existsSync(outputAudioPath)) {
                throw new Error('FFmpeg failed generated the final audio file');
            }

            // 4. Return results with synchronized timestamps
            const allWords = [];
            let currentFileTime = 0;
            currentTime = 0; // Reset for calculation

            const clipResults = [];
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                const gap = clip.startSeconds - currentTime;

                if (gap > 0) {
                    currentFileTime += gap;
                }

                const startInFull = currentFileTime;

                if (clip.words) {
                    for (const w of clip.words) {
                        allWords.push({
                            text: w.text,
                            start: w.start + currentFileTime,
                            end: w.end + currentFileTime
                        });
                    }
                }

                clipResults.push({
                    id: clip.id,
                    duration: clip.duration,
                    startInFull,
                    endInFull: startInFull + clip.duration,
                    sourceStart: clip.startSeconds
                });

                currentFileTime += clip.duration;
                currentTime = clip.startSeconds + clip.duration;
            }

            return {
                path: outputAudioPath,
                words: allWords,
                clips: clipResults
            };

        } catch (e) {
            console.error('TTS Generation Error:', e);
            throw e;
        }
    });

    console.log('[Main] TTS handlers setup');
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    // Handle "00:00:05,000" or "00:00:05.000"
    const parts = timeStr.replace(',', '.').split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
}

module.exports = {
    setupTTSHandlers,
    parseRatePercent,
    ratePercentToSpeedFactor,
    speedFactorToRatePercent,
    computeAutoFitRatePercent,
    formatRatePercent,
    isRetryableEdgeHelperError,
    retryEdgeHelperExecution
};
