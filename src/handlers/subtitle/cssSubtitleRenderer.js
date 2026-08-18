const path = require('path');
const fs = require('fs');
const os = require('os');
const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const { buildRenderIntervals, DEFAULT_RENDER_FPS } = require('./cssSubtitleRenderUtils');

function escapeForScript(json) {
    return JSON.stringify(json).replace(/</g, '\\u003C');
}

function escapeConcatPath(filePath) {
    // ffmpeg concat demuxer: paths in single quotes; escape ' as '\''
    // Also normalize Windows backslashes (and strip newlines that would break the list).
    return String(filePath || '')
        .replace(/[\r\n]+/g, '')
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\''");
}

function makeEven(value) {
    const numeric = Math.max(2, Math.round(Number(value) || 2));
    return numeric % 2 === 0 ? numeric : numeric - 1;
}

function getSafeRenderSize(width, height) {
    const sourceWidth = Math.max(2, Number(width || 1920));
    const sourceHeight = Math.max(2, Number(height || 1080));
    const maxLongSide = 1600;
    const maxPixels = 2_000_000;
    const longSide = Math.max(sourceWidth, sourceHeight);
    const pixelCount = sourceWidth * sourceHeight;
    const scaleByLongSide = maxLongSide / longSide;
    const scaleByPixels = Math.sqrt(maxPixels / pixelCount);
    const scale = Math.min(1, scaleByLongSide, scaleByPixels);

    return {
        width: makeEven(sourceWidth * scale),
        height: makeEven(sourceHeight * scale)
    };
}

function getAdaptiveRenderFps(duration, requestedFps) {
    const baseFps = Math.max(4, Math.round(Number(requestedFps || DEFAULT_RENDER_FPS)));
    const totalDuration = Math.max(0, Number(duration || 0));

    if (totalDuration >= 300) return Math.min(baseFps, 3);
    if (totalDuration >= 180) return Math.min(baseFps, 4);
    if (totalDuration >= 90) return Math.min(baseFps, 5);
    if (totalDuration >= 45) return Math.min(baseFps, 6);
    if (totalDuration >= 20) return Math.min(baseFps, 8);
    return baseFps;
}

function buildRendererHtml({ tracks, width, height, renderFps }) {
    const payload = escapeForScript({ tracks, width, height, renderFps });
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <title>Subtitle CSS Renderer</title>
    <style>
        html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: transparent;
        }
        body {
            font-smoothing: antialiased;
            -webkit-font-smoothing: antialiased;
            text-rendering: geometricPrecision;
        }
        #overlay {
            position: relative;
            width: 100%;
            height: 100%;
            background: transparent;
            overflow: hidden;
        }
        .subtitle-track-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }
        .subtitle-draggable {
            position: absolute;
            pointer-events: none;
            white-space: pre-wrap;
        }
        .subtitle-preview-text {
            display: inline-block;
            max-width: 100%;
            pointer-events: none;
            user-select: none;
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
            box-sizing: border-box;
        }
    </style>
</head>
<body>
    <div id="overlay"></div>
    <script id="subtitle-render-payload" type="application/json">${payload}</script>
    <script>
        (() => {
            const payload = JSON.parse(document.getElementById('subtitle-render-payload').textContent);
            const overlay = document.getElementById('overlay');
            const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
            const height = Number(payload.height || 1080);
            const renderFps = Math.max(1, Number(payload.renderFps || 10));
            const scale = height / 720;
            const COMPLEX_SCRIPT_RE = /[\\u3400-\\u9fff\\u3040-\\u30ff\\u31f0-\\u31ff\\uac00-\\ud7af\\u0e00-\\u0e7f\\u0600-\\u06ff]/i;

            function normalizeText(value) {
                return String(value || '').replace(/\\s+/g, '');
            }

            function usesComplexScript(text) {
                return COMPLEX_SCRIPT_RE.test(String(text || ''));
            }

            function escapeHtml(text) {
                return String(text || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            function plainHtml(text) {
                return escapeHtml(text).replace(/\\n/g, '<br>');
            }

            function hexToRgba(hex, opacityPercent = 100) {
                const value = String(hex || '#000000').trim();
                const rgbaMatch = value.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
                if (rgbaMatch) {
                    const alpha = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
                    return \`rgba(\${rgbaMatch[1]}, \${rgbaMatch[2]}, \${rgbaMatch[3]}, \${alpha * (opacityPercent / 100)})\`;
                }

                let normalized = value.replace('#', '');
                if (normalized.length === 3) normalized = normalized.split('').map(char => char + char).join('');
                const r = parseInt(normalized.slice(0, 2) || '00', 16);
                const g = parseInt(normalized.slice(2, 4) || '00', 16);
                const b = parseInt(normalized.slice(4, 6) || '00', 16);
                return \`rgba(\${r}, \${g}, \${b}, \${Math.max(0, Math.min(100, Number(opacityPercent || 0))) / 100})\`;
            }

            function tokenizeKaraokeText(text, style = {}) {
                const raw = String(text || '').replace(/\\r/g, '').trim();
                if (!raw) return [];

                const tokens = [];
                const styleMode = style.karaokeStyle || 'highlight';
                raw.split('\\n').forEach((line, lineIndex, lines) => {
                    const shouldSplitByWord = /\\s/.test(line.trim()) && styleMode !== 'progress';
                    if (shouldSplitByWord) {
                        line.split(/(\\s+)/).filter(Boolean).forEach((part) => {
                            if (/^\\s+$/.test(part)) tokens.push({ text: part, type: 'space' });
                            else tokens.push({ text: part, type: 'timed' });
                        });
                    } else if (usesComplexScript(line)) {
                        Array.from(line).forEach((char) => {
                            if (/^\\s$/.test(char)) tokens.push({ text: char, type: 'space' });
                            else tokens.push({ text: char, type: 'timed' });
                        });
                    } else {
                        tokens.push({ text: line, type: 'timed' });
                    }

                    if (lineIndex < lines.length - 1) {
                        tokens.push({ text: '\\n', type: 'break' });
                    }
                });

                return tokens;
            }

            function buildAlignedWordTokens(words = []) {
                const tokens = [];
                words.forEach((word, index) => {
                    tokens.push({ text: String(word.text || ''), type: 'timed' });
                    if (index < words.length - 1) tokens.push({ text: ' ', type: 'space' });
                });
                return tokens;
            }

            function getKaraokeTimeline(sub = {}, style = {}) {
                const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
                const secondaryText = sub.karaokeSecondaryText || '';
                const words = Array.isArray(sub.words)
                    ? sub.words.filter(Boolean).filter(word => String(word.text || '').trim())
                    : [];
                const canUseWordTimings = (
                    words.length > 1 &&
                    normalizeText(primaryText) &&
                    normalizeText(primaryText) === normalizeText(words.map(word => word.text || '').join('')) &&
                    !String(primaryText || '').includes('\\n')
                );

                if (canUseWordTimings) {
                    return {
                        primaryText,
                        secondaryText,
                        tokens: buildAlignedWordTokens(words),
                        segments: words
                            .map((word, timedIndex) => ({
                                start: Number(word.start ?? sub.start ?? 0),
                                end: Number(word.end ?? word.start ?? sub.end ?? 0),
                                timedIndex
                            }))
                            .filter(segment => segment.end > segment.start)
                    };
                }

                const tokens = tokenizeKaraokeText(primaryText, style);
                const timedTokens = tokens
                    .map((token, index) => ({ token, index }))
                    .filter(item => item.token.type === 'timed');
                if (timedTokens.length === 0) {
                    return { primaryText, secondaryText, tokens, segments: [] };
                }

                const subStart = Number(sub.start || 0);
                const subEnd = Number(sub.end || subStart);
                const totalDuration = Math.max(0.001, subEnd - subStart);
                const step = totalDuration / timedTokens.length;

                return {
                    primaryText,
                    secondaryText,
                    tokens,
                    segments: timedTokens.map((item, timedIndex) => ({
                        start: subStart + (step * timedIndex),
                        end: timedIndex === timedTokens.length - 1 ? subEnd : subStart + (step * (timedIndex + 1)),
                        timedIndex,
                        tokenIndex: item.index
                    })).filter(segment => segment.end > segment.start)
                };
            }

            function getActiveSegmentIndex(timeline, currentTime) {
                if (!timeline || !Array.isArray(timeline.segments)) return -1;
                return timeline.segments.findIndex(segment => currentTime >= segment.start && currentTime < segment.end);
            }

            function getStrokeCss(style = {}) {
                const stroke = Array.isArray(style.strokes) && style.strokes.length > 0
                    ? style.strokes[0]
                    : null;
                const fallbackWidth = Number(style.outlineWidth || 0);
                const fallbackColor = style.outlineColor || '#000000';
                const width = stroke ? Number(stroke.width || 0) : fallbackWidth;
                const color = stroke ? (stroke.color || fallbackColor) : fallbackColor;
                if (width <= 0) return '';
                return \`-webkit-text-stroke: \${width * scale}px \${color};\`;
            }

            function getShadowCss(style = {}) {
                const shadows = Array.isArray(style.shadows) ? style.shadows.filter(Boolean) : [];
                if (shadows.length === 0) return 'text-shadow: none;';
                return \`text-shadow: \${shadows.map(shadow => \`\${Number(shadow.x || 0) * scale}px \${Number(shadow.y || 0) * scale}px \${Number(shadow.blur || 0) * scale}px \${shadow.color || '#000000'}\`).join(', ')};\`;
            }

            function getWrapperStyle(style = {}) {
                const wrapWidth = Number(style.wrapWidth || 90);
                if (style.position === 'custom') {
                    return [
                        'position: absolute',
                        \`left: \${Number(style.marginH ?? 50)}%\`,
                        \`top: \${Number(style.marginV ?? 50)}%\`,
                        'transform: translate(-50%, -50%)',
                        \`width: \${wrapWidth}%\`,
                        \`max-width: \${wrapWidth}%\`,
                        \`text-align: \${style.textAlign || 'center'}\`,
                        'white-space: pre-wrap',
                        'pointer-events: none'
                    ].join('; ');
                }

                const position = String(style.position || '2');
                const textAlign = ({ '1': 'left', '4': 'left', '7': 'left', '3': 'right', '6': 'right', '9': 'right' })[position] || 'center';
                const horizontalPadding = Math.max(0, (100 - wrapWidth) / 2);
                const rules = [
                    'position: absolute',
                    'width: 100%',
                    'left: 0',
                    \`padding: 0 \${horizontalPadding}%\`,
                    \`text-align: \${textAlign}\`,
                    'white-space: pre-wrap',
                    'pointer-events: none'
                ];

                if (['7', '8', '9'].includes(position)) rules.push(\`top: \${Number(style.marginV ?? 10)}%\`);
                else if (['1', '2', '3'].includes(position)) rules.push(\`bottom: \${Number(style.marginV ?? 10)}%\`);
                else rules.push('top: 50%', 'transform: translateY(-50%)');

                return rules.join('; ');
            }

            function getAnimationState(sub = {}, style = {}, currentTime) {
                if (!style.animation || style.animation === 'none' || style.animation === 'karaoke') {
                    return { opacity: 1, transform: '' };
                }

                const durationMs = Math.max(1, Number(style.animationDuration || 300));
                const progress = Math.max(0, Math.min(1, ((currentTime - Number(sub.start || 0)) * 1000) / durationMs));
                if (style.animation === 'fade') {
                    return { opacity: progress, transform: '' };
                }
                if (style.animation === 'popup') {
                    const scaleValue = 0.9 + (0.1 * progress);
                    return { opacity: progress, transform: \`scale(\${scaleValue.toFixed(4)})\` };
                }
                return { opacity: 1, transform: '' };
            }

            function buildWordSpan(text, style = {}, isActive) {
                const safeText = plainHtml(text);
                if (!isActive) return safeText;

                const karaokeColor = style.karaokeColor || '#3d6eb8';
                const highlightRadius = Math.max(2, Math.round(4 * scale));
                return \`<span style="display:inline-block;background:\${karaokeColor};color:#fff;border-radius:\${highlightRadius}px;padding:0.08em 0.32em;margin:0 0.08em;box-decoration-break:clone;-webkit-box-decoration-break:clone;">\${safeText}</span>\`;
            }

            function renderHighlightPrimary(sub = {}, style = {}, currentTime) {
                const timeline = getKaraokeTimeline(sub, style);
                const activeTimedIndex = getActiveSegmentIndex(timeline, currentTime);
                let timedIndex = 0;

                return timeline.tokens.map((token) => {
                    if (token.type === 'break') return '<br>';
                    if (token.type === 'space') return escapeHtml(token.text);

                    const html = buildWordSpan(token.text, style, timedIndex === activeTimedIndex);
                    timedIndex += 1;
                    return html;
                }).join('');
            }

            function renderProgressPrimary(sub = {}, style = {}, currentTime) {
                const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
                const progress = Math.max(0, Math.min(100, ((currentTime - Number(sub.start || 0)) / Math.max(0.001, Number(sub.end || 0) - Number(sub.start || 0))) * 100));
                const karaokeColor = style.karaokeColor || '#3d6eb8';
                return \`<span style="background-image:linear-gradient(90deg,\${karaokeColor} 0%, \${karaokeColor} \${progress}%, \${style.fontColor || '#ffffff'} \${progress}%, \${style.fontColor || '#ffffff'} 100%);background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;">\${plainHtml(primaryText)}</span>\`;
            }

            function buildSubtitleContent(sub = {}, style = {}, currentTime) {
                const karaokeEnabled = !!style.enableKaraoke || style.animation === 'karaoke';
                if (!karaokeEnabled) {
                    return {
                        html: plainHtml(sub.text || sub.translatedText || sub.originalText || ''),
                        signature: \`plain:\${sub.id || ''}\`
                    };
                }

                const karaokeStyle = style.karaokeStyle || 'highlight';
                const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
                const secondaryText = sub.karaokeSecondaryText || '';
                const primaryHtml = karaokeStyle === 'progress'
                    ? renderProgressPrimary(sub, style, currentTime)
                    : renderHighlightPrimary(sub, style, currentTime);

                let signature = \`karaoke:\${sub.id || ''}\`;
                if (karaokeStyle === 'progress') {
                    const progressBucketCount = Math.max(12, Math.round(renderFps * 2));
                    const progressBucket = Math.round(Math.max(0, Math.min(progressBucketCount, ((currentTime - Number(sub.start || 0)) / Math.max(0.001, Number(sub.end || 0) - Number(sub.start || 0))) * progressBucketCount)));
                    signature += \`:p\${progressBucket}\`;
                } else {
                    signature += \`:h\${getActiveSegmentIndex(getKaraokeTimeline(sub, style), currentTime)}\`;
                }

                return {
                    html: secondaryText ? \`\${primaryHtml}<br>\${plainHtml(secondaryText)}\` : primaryHtml,
                    signature
                };
            }

            function getActiveSubtitle(track = {}, currentTime) {
                const subtitles = Array.isArray(track.subtitles) ? track.subtitles : [];
                const hits = subtitles.filter(sub => Number(sub.start || 0) <= currentTime && Number(sub.end || 0) > currentTime);
                if (hits.length === 0) return null;
                hits.sort((a, b) => Number(b.start || 0) - Number(a.start || 0));
                return hits[0];
            }

            function renderFrame(currentTime) {
                const layerHtml = [];
                const stateSignature = [];

                tracks.forEach((track) => {
                    const style = track.style || {};
                    const sub = getActiveSubtitle(track, currentTime);
                    if (!sub) return;

                    const fontSize = Math.max(12, (Number(style.fontSize || 28) * scale));
                    const animationState = getAnimationState(sub, style, currentTime);
                    const content = buildSubtitleContent(sub, style, currentTime);
                    const backgroundCss = style.enableBackground
                        ? \`background-color:\${hexToRgba(style.bgColor || '#000000', Number(style.bgOpacity ?? 50))};padding:0.15em 0.4em;border-radius:\${Math.max(4, Math.round(4 * scale))}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;\`
                        : '';

                    const transformCss = animationState.transform ? \`transform:\${animationState.transform};transform-origin:center center;\` : '';
                    const innerStyle = [
                        \`font-family:'\${String(style.fontFamily || 'Arial').replace(/'/g, "\\\\'")}', sans-serif\`,
                        \`font-size:\${fontSize}px\`,
                        \`font-weight:\${style.fontBold ? '700' : '400'}\`,
                        \`font-style:\${style.fontItalic ? 'italic' : 'normal'}\`,
                        \`color:\${style.fontColor || '#ffffff'}\`,
                        \`line-height:\${Number(style.lineHeight || 1.4)}\`,
                        \`letter-spacing:\${Number(style.letterSpacing || 0) * scale}px\`,
                        \`opacity:\${animationState.opacity.toFixed(4)}\`,
                        getStrokeCss(style),
                        getShadowCss(style),
                        backgroundCss,
                        transformCss
                    ].filter(Boolean).join('; ');

                    layerHtml.push(
                        \`<div class="subtitle-track-layer"><div class="subtitle-draggable" style="\${getWrapperStyle(style)}"><span class="subtitle-preview-text" style="\${innerStyle}">\${content.html}</span></div></div>\`
                    );
                    stateSignature.push([
                        track.id || 'track',
                        sub.id || \`\${sub.start}-\${sub.end}\`,
                        content.signature,
                        Math.round(animationState.opacity * Math.max(12, Math.round(renderFps * 2))),
                        animationState.transform
                    ].join('|'));
                });

                overlay.innerHTML = layerHtml.join('');
                return stateSignature.join('||') || 'blank';
            }

            window.__subtitleRenderer = { renderFrame };
            window.__subtitleRendererReady = true;
        })();
    </script>
</body>
</html>`;
}

function createCancelledError() {
    const error = new Error('Subtitle burn cancelled by user');
    error.code = 'SUBTITLE_BURN_CANCELLED';
    return error;
}

function withTimeout(promise, timeoutMs, message, controller = null) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            if (controller?.cancelled) {
                reject(createCancelledError());
                return;
            }
            reject(new Error(message));
        }, timeoutMs);
    });

    return Promise.race([
        Promise.race([
            promise,
            controller?.cancelPromise
        ].filter(Boolean)).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        }),
        timeoutPromise
    ]);
}

function throwIfCancelled(controller) {
    if (controller?.cancelled) {
        throw createCancelledError();
    }
}

function runFfmpeg(ffmpegPath, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, args, { windowsHide: true, ...options });
        let stderr = '';
        if (options.controller) {
            options.controller.renderFfmpegProc = proc;
        }

        proc.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            if (typeof options.onStderr === 'function') options.onStderr(output);
        });

        proc.on('close', (code) => {
            if (options.controller?.renderFfmpegProc === proc) {
                options.controller.renderFfmpegProc = null;
            }
            if (options.controller?.cancelled) {
                reject(createCancelledError());
                return;
            }
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`FFmpeg exited with code ${code}.\n${stderr.split('\n').slice(-20).join('\n')}`));
        });

        proc.on('error', (error) => {
            if (options.controller?.renderFfmpegProc === proc) {
                options.controller.renderFfmpegProc = null;
            }
            reject(error);
        });
    });
}

class CSSSubtitleRenderer {
    static getSafeRenderSize(width, height) {
        return getSafeRenderSize(width, height);
    }

    static async renderOverlayVideo({
        tracks = [],
        width = 1920,
        height = 1080,
        duration = 0,
        fps = DEFAULT_RENDER_FPS,
        ffmpegPath,
        progressCallback,
        controller = null
    }) {
        if (!ffmpegPath) {
            throw new Error('FFmpeg path is required for CSS subtitle rendering');
        }

        if (typeof progressCallback === 'function') progressCallback(1);
        const renderFps = getAdaptiveRenderFps(duration, fps);
        const renderSize = getSafeRenderSize(width, height);
        const renderWidth = renderSize.width;
        const renderHeight = renderSize.height;
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mediaflow_css_subtitles_'));
        const htmlPath = path.join(tempDir, 'renderer.html');
        const concatPath = path.join(tempDir, 'overlay_frames.txt');
        const overlayPath = path.join(tempDir, 'subtitle_overlay.mov');
        const intervals = buildRenderIntervals(tracks, duration, renderFps);
        if (typeof progressCallback === 'function') progressCallback(3);
        const html = buildRendererHtml({ tracks, width: renderWidth, height: renderHeight, renderFps });
        const cache = new Map();
        const concatEntries = [];
        let win = null;
        let rendererGoneError = null;

        await fs.promises.writeFile(htmlPath, html, 'utf8');
        if (typeof progressCallback === 'function') progressCallback(5);

        try {
            console.log(
                '[CSSSubtitleRenderer] Starting overlay render: ' +
                `${width}x${height} -> ${renderWidth}x${renderHeight} @ ${renderFps}fps, ` +
                `duration=${Number(duration || 0).toFixed(2)}s, intervals=${intervals.length}`
            );
            throwIfCancelled(controller);
            win = new BrowserWindow({
                show: false,
                frame: false,
                transparent: true,
                backgroundColor: '#00000000',
                width: renderWidth,
                height: renderHeight,
                useContentSize: true,
                paintWhenInitiallyHidden: true,
                webPreferences: {
                    backgroundThrottling: false,
                    contextIsolation: true,
                    sandbox: true,
                    spellcheck: false
                }
            });
            if (controller) {
                controller.rendererWindow = win;
            }
            win.webContents.on('render-process-gone', (_event, details) => {
                rendererGoneError = new Error(`Subtitle renderer process crashed: ${details?.reason || 'unknown'}`);
            });

            await withTimeout(
                win.loadFile(htmlPath),
                15000,
                'Subtitle renderer page load timed out',
                controller
            );
            if (typeof progressCallback === 'function') progressCallback(7);
            win.webContents.setZoomFactor(1);
            if (rendererGoneError) throw rendererGoneError;
            const isReady = await withTimeout(
                win.webContents.executeJavaScript('Boolean(window.__subtitleRendererReady)', true),
                10000,
                'Subtitle renderer page initialization timed out',
                controller
            );
            if (!isReady) {
                throw new Error('Subtitle renderer page did not initialize correctly');
            }
            if (typeof progressCallback === 'function') progressCallback(10);

            const totalFrames = Math.max(1, intervals.length);
            for (let index = 0; index < intervals.length; index += 1) {
                throwIfCancelled(controller);
                if (rendererGoneError) throw rendererGoneError;
                const interval = intervals[index];
                const signature = await withTimeout(
                    win.webContents.executeJavaScript(
                        `window.__subtitleRenderer.renderFrame(${JSON.stringify(interval.sampleTime)})`,
                        true
                    ),
                    15000,
                    `Subtitle renderer frame ${index + 1}/${totalFrames} timed out during renderFrame`,
                    controller
                );
                throwIfCancelled(controller);
                if (index === 0 && typeof progressCallback === 'function') progressCallback(12);

                let framePath = cache.get(signature);
                if (!framePath) {
                    await withTimeout(
                        // Hidden BrowserWindows can stall executeJavaScript
                        // while waiting for RAF. The DOM update is synchronous;
                        // give Chromium a short compositor window before capture.
                        new Promise(resolve => setTimeout(resolve, 150)),
                        15000,
                        `Subtitle renderer frame ${index + 1}/${totalFrames} timed out before capture`,
                        controller
                    );
                    throwIfCancelled(controller);
                    if (rendererGoneError) throw rendererGoneError;
                    let image = await withTimeout(
                        win.webContents.capturePage({ x: 0, y: 0, width: renderWidth, height: renderHeight }),
                        20000,
                        `Subtitle renderer frame ${index + 1}/${totalFrames} timed out during capturePage`,
                        controller
                    );
                    throwIfCancelled(controller);
                    const capturedSize = image.getSize();
                    if (capturedSize.width !== renderWidth || capturedSize.height !== renderHeight) {
                        image = image.resize({ width: renderWidth, height: renderHeight });
                    }

                    framePath = path.join(tempDir, `frame_${String(cache.size).padStart(6, '0')}.png`);
                    await fs.promises.writeFile(framePath, image.toPNG());
                    throwIfCancelled(controller);
                    cache.set(signature, framePath);
                }

                concatEntries.push({ path: framePath, duration: interval.duration });
                if (typeof progressCallback === 'function') {
                    progressCallback(10 + Math.round(((index + 1) / totalFrames) * 50));
                }
            }

            if (concatEntries.length === 0) {
                throwIfCancelled(controller);
                await withTimeout(
                    win.webContents.executeJavaScript('window.__subtitleRenderer.renderFrame(0)', true),
                    15000,
                    'Subtitle renderer blank frame timed out during renderFrame',
                    controller
                );
                await withTimeout(
                    new Promise(resolve => setTimeout(resolve, 150)),
                    15000,
                    'Subtitle renderer blank frame timed out before capture',
                    controller
                );
                throwIfCancelled(controller);
                if (rendererGoneError) throw rendererGoneError;
                const image = await withTimeout(
                    win.webContents.capturePage({ x: 0, y: 0, width: renderWidth, height: renderHeight }),
                    20000,
                    'Subtitle renderer blank frame timed out during capturePage',
                    controller
                );
                throwIfCancelled(controller);
                const blankPath = path.join(tempDir, 'frame_000000.png');
                await fs.promises.writeFile(blankPath, image.toPNG());
                throwIfCancelled(controller);
                concatEntries.push({ path: blankPath, duration: Math.max(0.04, Number(duration || 0.04)) });
            }

            const concatContent = concatEntries.map((entry) => {
                return `file '${escapeConcatPath(entry.path)}'\nduration ${Math.max(0.001, entry.duration).toFixed(6)}`;
            }).join('\n') + `\nfile '${escapeConcatPath(concatEntries[concatEntries.length - 1].path)}'\n`;
            await fs.promises.writeFile(concatPath, concatContent, 'utf8');
            throwIfCancelled(controller);

            if (typeof progressCallback === 'function') progressCallback(65);

            throwIfCancelled(controller);
            await runFfmpeg(ffmpegPath, [
                '-f', 'concat',
                '-safe', '0',
                '-i', concatPath,
                '-an',
                '-c:v', 'qtrle',
                '-pix_fmt', 'argb',
                '-y',
                overlayPath
            ], { controller });

            if (typeof progressCallback === 'function') progressCallback(75);

            return {
                overlayPath,
                cleanupPaths: [tempDir],
                renderFps,
                renderWidth,
                renderHeight
            };
        } catch (error) {
            if (controller?.cancelled) {
                throw createCancelledError();
            }
            throw error;
        } finally {
            if (controller?.rendererWindow === win) {
                controller.rendererWindow = null;
            }
            if (win && !win.isDestroyed()) {
                win.destroy();
            }
        }
    }
}

module.exports = CSSSubtitleRenderer;
