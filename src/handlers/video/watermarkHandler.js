const { spawn } = require('child_process');
const binaries = require('../../utils/binaries');
const fs = require('fs');

/**
 * Handle video watermark
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - Input file path
 * @param {string} options.output - Output file path
 * @param {string} options.type - 'image' or 'text'
 * @param {Object} options.config - Watermark configuration
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleWatermark(event, options) {
    const { input, output, type, config } = options;

    if (!input || !output || !type || !config) {
        return { success: false, error: 'Missing required parameters' };
    }

    const ffmpegPath = binaries.getFfmpegPath();
    const args = ['-y', '-i', input];

    let filterComplex = '';

    if (type === 'image') {
        const { imagePath, position = 'bottom-right', opacity = 1.0, scale = 0.2, margin = 20 } = config;

        if (!fs.existsSync(imagePath)) {
            return { success: false, error: 'Watermark image not found' };
        }

        args.push('-i', imagePath);

        // Position Logic (using ffmpeg variables W, H, w, h)
        // W/H = main video dimensions, w/h = watermark dimensions
        let overlayX = '';
        let overlayY = '';

        const m = parseInt(margin) || 20;

        switch (position) {
        case 'top-left': overlayX = `${m}`; overlayY = `${m}`; break;
        case 'top-center': overlayX = '(W-w)/2'; overlayY = `${m}`; break;
        case 'top-right': overlayX = `W-w-${m}`; overlayY = `${m}`; break;
        case 'center-left': overlayX = `${m}`; overlayY = '(H-h)/2'; break;
        case 'center': overlayX = '(W-w)/2'; overlayY = '(H-h)/2'; break;
        case 'center-right': overlayX = `W-w-${m}`; overlayY = '(H-h)/2'; break;
        case 'bottom-left': overlayX = `${m}`; overlayY = `H-h-${m}`; break;
        case 'bottom-center': overlayX = '(W-w)/2'; overlayY = `H-h-${m}`; break;
        case 'bottom-right': overlayX = `W-w-${m}`; overlayY = `H-h-${m}`; break;
        default: overlayX = `W-w-${m}`; overlayY = `H-h-${m}`; break;
        }

        // Processing chain:
        // [1:v] (image) -> scale (optional) -> format=rgba -> colorchannelmixer (opacity) -> [wm]
        // [0:v][wm] overlay -> [outv]

        // Note: scale uses relative resizing? Or fixed?
        // Usually scale is relative to input width, but here we scan scale the watermark itself.
        // Let's assume 'scale' is a factor of the watermark's original size (default 1.0)
        // OR better: scale relevant to VIDEO width. Users usually want "20% of video width".
        // Let's implement scale as "percent of video width" if > 0, else keep original? 
        // Simpler for now: Scale the watermark image by factor if < 1, or resizing to fixed info?
        // Let's start with simple scaling of watermark itself.
        // But better is [1:v][0:v]scale2ref=w=oh*mdar:h=ih*${scale}[wm][vid]... hard to do.

        // Let's try simple scaling filter on image input first.
        // If scale is 0.1 ~ 1.0

        const scaleFilter = `scale=iw*${scale}:-1`;
        const opacityFilter = `format=rgba,colorchannelmixer=aa=${opacity}`;

        filterComplex = `[1:v]${scaleFilter},${opacityFilter}[wm];[0:v][wm]overlay=x=${overlayX}:y=${overlayY}`;

    } else if (type === 'text') {
        const { text, fontSize = 24, fontColor = 'white', position = 'bottom-right', margin = 20, alpha = 1.0 } = config;

        // Escape text
        // raw text: "Hello 'World" -> need escaping for drawtext
        const escapedText = text.replace(/:/g, '\\:').replace(/'/g, '\'\\\'\'');

        // Font file? We might rely on default font if not provided.
        // Windows: C:\Windows\Fonts\arial.ttf usually exists.
        // Or assume ffmpeg has valid fontconfig.
        // Using 'fontfile' is safer if we can find one.
        // For portability, let's try without fontfile first (ffmpeg generic font).

        let x = '', y = '';
        const m = parseInt(margin) || 20;

        switch (position) {
        case 'top-left': x = `${m}`; y = `${m}`; break;
        case 'top-center': x = '(w-text_w)/2'; y = `${m}`; break;
        case 'top-right': x = `w-text_w-${m}`; y = `${m}`; break;
        case 'center-left': x = `${m}`; y = '(h-text_h)/2'; break;
        case 'center': x = '(w-text_w)/2'; y = '(h-text_h)/2'; break;
        case 'center-right': x = `w-text_w-${m}`; y = '(h-text_h)/2'; break;
        case 'bottom-left': x = `${m}`; y = `h-text_h-${m}`; break;
        case 'bottom-center': x = '(w-text_w)/2'; y = `h-text_h-${m}`; break;
        case 'bottom-right': x = `w-text_w-${m}`; y = `h-text_h-${m}`; break;
        }

        filterComplex = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:alpha=${alpha}:x=${x}:y=${y}`;
    }

    args.push('-filter_complex', filterComplex);
    args.push('-c:a', 'copy'); // Copy audio
    args.push(output);

    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args);
        let stderr = '';

        proc.stderr.on('data', d => {
            const str = d.toString();
            stderr += str;

            // Progress parsing (rough)
            // Duration logic exists in other handlers. Can reuse if needed, 
            // but for now simple progress is fine if we parse duration first.
            // ... omitting duration parsing here to keep it short, 
            // but could duplicate 'getVideoDuration' logic if needed.
            // For MVP, user will see spinner or indeterminate if we don't send progress.
            // Let's skip detailed progress for now unless requested.
        });

        proc.on('close', code => {
            if (code === 0) {
                resolve({ success: true, output });
            } else {
                resolve({ success: false, error: `FFmpeg exited with code ${code}\nLog: ${stderr.slice(-500)}` });
            }
        });

        proc.on('error', err => {
            resolve({ success: false, error: err.message });
        });
    });
}

module.exports = { handleWatermark };
