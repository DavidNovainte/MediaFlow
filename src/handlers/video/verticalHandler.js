/**
 * verticalHandler - 竖屏转换处理器
 * 处理 video:makeVertical IPC 调用
 */

const { spawn, spawnSync } = require('child_process');
const binaries = require('../../utils/binaries');

/**
 * Normalize CSS hex (#RRGGBB) → ffmpeg color token (0xRRGGBB or named).
 */
function toFfmpegColor(color, fallback = '0x000000') {
    if (!color || typeof color !== 'string') return fallback;
    const c = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return `0x${c.slice(1)}`;
    if (/^0x[0-9a-fA-F]{6}$/i.test(c)) return c;
    if (/^[0-9a-fA-F]{6}$/.test(c)) return `0x${c}`;
    // named colors / already valid tokens
    return c.replace(/[^a-zA-Z0-9_#x]/g, '') || fallback;
}

function clampNum(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/**
 * Build 9:16 vertical filter_complex from UI options.
 * UI sends: bgStyle blur|color|gradient|black, bgColor, bgColor2, blurRadius,
 * scaleX/scaleY/contentScale (%), offsetX/contentOffset (%).
 */
function buildVerticalFilterComplex(options = {}) {
    let style = String(options.bgStyle || 'blur').toLowerCase();
    if (style === 'solid') style = 'color';

    const blurRadius = clampNum(options.blurRadius, 0, 50, 20);
    const blurPasses = Math.max(1, Math.floor(blurRadius / 2) || 1);
    const color1 = toFfmpegColor(options.bgColor, '0x000000');
    const color2 = toFfmpegColor(options.bgColor2, '0x16213E');

    // Prefer independent scale axes; fall back to uniform contentScale
    const uniform = clampNum(options.contentScale, 10, 150, 100) / 100;
    const sx = clampNum(options.scaleX, 10, 150, uniform * 100) / 100;
    const sy = clampNum(options.scaleY, 10, 150, uniform * 100) / 100;
    const ox = clampNum(options.offsetX, -100, 100, 0);
    const oy = clampNum(
        options.contentOffset !== undefined ? options.contentOffset : options.offsetY,
        -100,
        100,
        0
    );

    let bg;
    if (style === 'blur') {
        bg = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=${blurRadius}:${blurPasses}[bg]`;
    } else if (style === 'gradient') {
        // Vertical gradient from color1 (top) to color2 (bottom)
        bg =
            `color=c=${color1}:s=1080x1920[c1];` +
            `color=c=${color2}:s=1080x1920[c2];` +
            `[c1][c2]blend=all_expr='A*(1-Y/H)+B*(Y/H)'[bg]`;
    } else {
        // color / black / unknown → solid color
        const solid = style === 'black' ? '0x000000' : color1;
        bg = `color=c=${solid}:s=1080x1920[bg]`;
    }

    // Fit into 9:16 then apply user scale
    const fg =
        `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `scale=iw*${sx}:ih*${sy}[fg]`;

    // Center + percentage offsets of canvas size
    const overlay =
        `[bg][fg]overlay=` +
        `x='(W-w)/2+W*${ox}/100':` +
        `y='(H-h)/2+H*${oy}/100':` +
        `shortest=1[out]`;

    return `${bg};${fg};${overlay}`;
}

/** @deprecated static presets kept for tests / external callers */
const BG_STYLE_FILTERS = {
    blur: buildVerticalFilterComplex({ bgStyle: 'blur' }).split(';'),
    gradient: buildVerticalFilterComplex({ bgStyle: 'gradient' }).split(';'),
    color: buildVerticalFilterComplex({ bgStyle: 'color', bgColor: '#000000' }).split(';'),
    black: buildVerticalFilterComplex({ bgStyle: 'black' }).split(';')
};

/**
 * 质量到预设映射
 */
const QUALITY_PRESETS = {
    high: { crf: '18', preset: 'slow' },
    medium: { crf: '23', preset: 'medium' },
    low: { crf: '28', preset: 'ultrafast' }
};

let activeVerticalProcess = null;

// 移除全局 activeVerticalProcess，使用 FFmpegRunner

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
        console.warn('[video:makeVertical] Duration detection failed:', e.message);
    }
    return 0;
}

/**
 * 一键竖屏转换 (横屏 → 9:16 竖屏)
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @param {string} options.bgStyle - 背景样式 (blur/gradient/black)
 * @param {string} options.quality - 质量级别 (high/medium/low)
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleMakeVertical(event, options) {
    const { input, output, quality, taskId = 'default' } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        const ffmpegPath = binaries.getFfmpegPath();

        // 获取视频时长用于进度计算
        let duration = getVideoDuration(input);

        // Dynamic filter from full UI options (style/color/blur/scale/offset)
        const filterComplex = buildVerticalFilterComplex(options);

        // 获取质量配置
        const qualityConfig = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;

        const args = [
            '-y',
            '-i', input,
            '-filter_complex', filterComplex,
            '-map', '[out]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-crf', qualityConfig.crf,
            '-preset', qualityConfig.preset,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            output
        ];

        return new Promise((resolve) => {
            const proc = spawn(ffmpegPath, args);
            activeVerticalProcess = proc;
            // 注册进程
            const FFmpegRunner = require('./FFmpegRunner');
            FFmpegRunner.setProcess(taskId, proc);

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

                // 解析进度并发送到前端
                if (duration > 0) {
                    for (const line of lines) {
                        const timeMatch = line.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                        if (timeMatch) {
                            const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                            const percent = Math.min(Math.floor((currentTime / duration) * 100), 99);
                            if (!isNaN(percent) && percent > lastPercent) {
                                lastPercent = percent;
                                // 发送进度到前端，附带 taskId
                                if (event.sender && !event.sender.isDestroyed()) {
                                    event.sender.send('vertical:progress', { taskId, progress: lastPercent });
                                }
                            }
                        }
                    }
                }
            });

            proc.on('close', (code) => {
                activeVerticalProcess = null;
                const FFmpegRunner = require('./FFmpegRunner');
                FFmpegRunner.activeProcesses.delete(taskId);

                if (code === 0) {
                    // 完成时发送100%
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('vertical:progress', { taskId, progress: 100 });
                    }
                    resolve({ success: true, output });
                } else if (code === null) {
                    resolve({ success: false, error: 'Process cancelled' });
                } else {
                    console.error('[video:makeVertical] FFmpeg error:', errorOutput);
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            proc.on('error', (err) => {
                activeVerticalProcess = null;
                resolve({ success: false, error: err.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 取消竖屏转换
 */
function cancelVertical() {
    if (activeVerticalProcess) {
        try {
            activeVerticalProcess.kill('SIGKILL');
            activeVerticalProcess = null;
            console.log('[video:makeVertical] Process cancelled');
            return true;
        } catch (e) {
            console.error('[video:makeVertical] Failed to cancel:', e);
            return false;
        }
    }
    return false;
}

module.exports = {
    handleMakeVertical,
    cancelVertical,
    BG_STYLE_FILTERS,
    QUALITY_PRESETS,
    buildVerticalFilterComplex,
    toFfmpegColor
};
