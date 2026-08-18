/**
 * audioHandler - 音频处理器
 * 处理 video:removeAudio 和 video:extractAudio IPC 调用
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);
const binaries = require('../../utils/binaries');

// 波形生成配置
const WAVEFORM_CONFIG = {
    PEAKS_COUNT: 800,
    SAMPLE_RATE: 16000,
    DEFAULT_SAMPLES_PER_SEC: 240
};

/**
 * 移除音频轨道
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleRemoveAudio(event, options) {
    const { input, output } = options;
    if (!input || !output) {
        return { success: false, error: 'Missing paths' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();
        const args = ['-y'];

        // 加入剪切参数 (ss 放在 -i 前以提高性能)
        if (options.startTime) args.push('-ss', options.startTime.toString());
        if (options.duration && options.duration > 0) args.push('-t', options.duration.toString());

        args.push('-i', input, '-c:v', 'copy', '-an', output);

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            let stderr = '';

            proc.stderr.on('data', d => stderr += d.toString());

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output });
                } else {
                    resolve({ success: false, error: stderr });
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
 * 提取音频波形数据（用于波形显示）
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object|string} options - 输入选项或文件路径
 * @returns {Promise<{success: boolean, peaks?: number[], duration?: number, error?: string}>}
 */
async function handleExtractAudio(event, options) {
    const input = options?.input || options;
    if (!input || typeof input !== 'string') {
        return { success: false, error: 'Missing or invalid input path' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();
        const ffprobePath = binaries.getFfprobePath();

        // 获取临时目录需要通过 electron app 模块
        const { app } = require('electron');
        const tempDir = app.getPath('temp');

        console.log('[ExtractAudio] FFmpeg:', ffmpegPath);
        console.log('[ExtractAudio] Input:', input);

        // 检查输入文件是否存在
        if (!fs.existsSync(input)) {
            return { success: false, error: `Input file not found: ${input}` };
        }

        // 1. 使用 ffprobe 获取时长
        let duration = 0;
        try {
            const { stdout } = await execFileAsync(ffprobePath, [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                input
            ]);
            duration = parseFloat(stdout.trim()) || 0;
        } catch (e) {
            console.error('[ExtractAudio] Failed to get duration:', e);
        }

        // 2. 提取 PCM 数据
        const pcmOutput = path.join(tempDir, `temp_pcm_${Date.now()}.raw`);

        await new Promise((resolve, reject) => {
            const proc = spawn(ffmpegPath, [
                '-y',
                '-i', input,
                '-vn',
                '-ac', '1',
                '-ar', String(WAVEFORM_CONFIG.SAMPLE_RATE),
                '-f', 's16le',
                '-acodec', 'pcm_s16le',
                pcmOutput
            ]);

            proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)));
            proc.on('error', reject);
        });

        // 3. 读取 PCM 并计算波峰
        const pcmData = fs.readFileSync(pcmOutput);
        const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);

        // 高精度波形：默认用更高密度的采样桶，为时间轴提供更清晰的包络数据
        const samplesPerSec = Math.max(60, options?.samplesPerSec || WAVEFORM_CONFIG.DEFAULT_SAMPLES_PER_SEC);
        let peakCount = Math.ceil(duration * samplesPerSec);

        // 如果时长为 0 或计算异常，才回退到固定点数
        if (peakCount <= 0) peakCount = WAVEFORM_CONFIG.PEAKS_COUNT;

        const peaks = [];
        const minPeaks = [];
        const maxPeaks = [];
        const samplesPerBar = Math.floor(samples.length / peakCount);

        for (let i = 0; i < peakCount; i++) {
            const start = i * samplesPerBar;
            const end = Math.min(start + samplesPerBar, samples.length);
            let maxAbs = 0;
            let min = 1;
            let max = -1;
            for (let j = start; j < end; j++) {
                const normalized = samples[j] / 32768;
                const absVal = Math.abs(normalized);
                if (absVal > maxAbs) maxAbs = absVal;
                if (normalized < min) min = normalized;
                if (normalized > max) max = normalized;
            }
            // 兼容旧逻辑：保留单值 peak；新逻辑：同时提供真实 min/max 包络
            peaks.push(Math.min(1.0, maxAbs));
            minPeaks.push(Math.max(-1.0, Math.min(0, min)));
            maxPeaks.push(Math.min(1.0, Math.max(0, max)));
        }

        // 清理临时文件
        try {
            fs.unlinkSync(pcmOutput);
        } catch (cleanupError) {
            void cleanupError;
        }

        console.log('[ExtractAudio] Generated', peaks.length, 'peaks, duration:', duration);

        return {
            success: true,
            peaks,
            duration,
            envelope: {
                min: minPeaks,
                max: maxPeaks,
                samplesPerSec
            }
        };
    } catch (error) {
        console.error('[ExtractAudio] Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleRemoveAudio,
    handleExtractAudio,
    WAVEFORM_CONFIG
};
