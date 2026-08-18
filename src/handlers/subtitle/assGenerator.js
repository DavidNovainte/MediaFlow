/**
 * ASS Generator Utility
 * 用于生成 Advanced Substation Alpha (.ass) 字幕文件
 * 支持多轨道样式和卡拉OK特效
 */

class ASSGenerator {
    /**
     * 生成 ASS 文件内容
     * @param {Array} tracks 字幕轨道数组 [{id, style, subtitles}]
     * @param {Object} videoInfo 视频信息 {width, height} 
     * @returns {string} ASS 文件内容
     */
    static generate(tracks, videoInfo = { width: 1920, height: 1080 }) {
        // Debug: log style data received for each track
        tracks.forEach((track, i) => {
            const s = track.style || {};
            console.log(`[ASSGenerator] Track ${i} (id=${track.id}) style:`, JSON.stringify({
                enableBackground: s.enableBackground,
                bgColor: s.bgColor,
                bgOpacity: s.bgOpacity,
                shadows: s.shadows,
                animation: s.animation,
                animationDuration: s.animationDuration,
                enableKaraoke: s.enableKaraoke,
                karaokeStyle: s.karaokeStyle,
                strokes: s.strokes
            }));
        });

        const header = this.generateHeader(videoInfo);
        const styles = this.generateStyles(tracks, videoInfo);
        const events = this.generateEvents(tracks, videoInfo);

        console.log(`[ASSGenerator] Generated Styles section:\n${styles}`);
        return `${header}\n\n${styles}\n\n${events}`;
    }

    static generateHeader(videoInfo) {
        return `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoInfo.width}
PlayResY: ${videoInfo.height}
WrapStyle: 0
ScaledBorderAndShadow: yes`;
    }

    static generateStyles(tracks, videoInfo = { width: 1920, height: 1080 }) {
        let content = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`;

        tracks.forEach(track => {
            if (!track.subtitles || track.subtitles.length === 0) return;
            const s = track.style || {};
            const styleName = `Style_${track.id}`;
            const fontName = s.fontFamily || 'Arial';
            const shadows = Array.isArray(s.shadows) ? s.shadows.filter(Boolean) : [];
            const hasBackground = !!s.enableBackground;
            const highlightKaraoke = !!s.enableKaraoke && (s.karaokeStyle || 'highlight') === 'highlight';
            
            // Base scaling to match SubtitlePreviewHandler's 720p reference
            const scale = videoInfo.height / 720;
            const fontSize = Math.round((s.fontSize || 32) * scale);

            // --- 1. Colors & Alpha ---
            const primary = this.hexToASSColor(s.fontColor);
            const secondary = '&H000000FF'; // Unused

            // Outline: Prioritize strokes[0] over legacy outlineColor
            let outlineCol = s.outlineColor || '#000000';
            let outlineWidth = s.outlineWidth !== undefined ? s.outlineWidth : 2;
            if (s.strokes && s.strokes.length > 0) {
                outlineCol = s.strokes[0].color || outlineCol;
                outlineWidth = s.strokes[0].width !== undefined ? s.strokes[0].width : outlineWidth;
            }
            const outline = this.hexToASSColor(outlineCol);

            let back = '&H80000000'; // Default semi-transparent black

            if (hasBackground) {
                // Opaque Box Mode (BorderStyle: 3)
                const bgOpacity = s.bgOpacity !== null && s.bgOpacity !== undefined ? s.bgOpacity : 50;
                const alphaHex = Math.floor(255 - (bgOpacity * 2.55)).toString(16).padStart(2, '0').toUpperCase();
                const bgHex = s.bgColor || '#000000';
                back = this.hexToASSColor(bgHex, alphaHex);
            }

            const bold = s.fontBold ? -1 : 0;
            const italic = s.fontItalic ? -1 : 0;
            const boxPadding = Math.max(3, Math.round(fontSize * 0.16));
            const finalOutlineWidth = Math.round(outlineWidth * scale);
            
            // Letter Spacing
            const spacing = Math.round((s.letterSpacing || 0) * scale);

            // --- 2. Alignment & Margins ---
            let alignment = 2; // Bottom Center
            if (s.position === 'custom') {
                alignment = 5; // Middle Center for position-agnostic \pos
            } else {
                alignment = parseInt(s.position) || 2;
            }

            // Wrap Width: Emulated via Horizontal Margins
            // If wrapWidth is 80%, side margins should be 10% each
            const wrapW = s.wrapWidth || 90;
            const marginPercent = (100 - wrapW) / 2 / 100;
            const horizontalPadding = Math.round(marginPercent * videoInfo.width);
            const verticalMargin = Math.round((s.marginV !== undefined ? s.marginV : 10) / 100 * videoInfo.height);

            // Main text style: keep shadow disabled and render shadow layers separately so
            // multi-shadow CSS previews survive export more faithfully.
            content += `\nStyle: ${styleName},${fontName},${fontSize},${primary},${secondary},${outline},&H80000000,${bold},${italic},0,0,100,100,${spacing},0,1,${finalOutlineWidth},0,${alignment},${horizontalPadding},${horizontalPadding},${verticalMargin},1`;

            if (hasBackground) {
                content += `\nStyle: ${styleName}_bg,${fontName},${fontSize},${primary},${secondary},${back},${back},${bold},${italic},0,0,100,100,${spacing},0,3,${boxPadding},0,${alignment},${horizontalPadding},${horizontalPadding},${verticalMargin},1`;
            }

            if (highlightKaraoke) {
                const capsuleColor = this.hexToASSColor(s.karaokeColor || '#3d6eb8');
                content += `\nStyle: ${styleName}_kara,${fontName},${fontSize},&H00FFFFFF,${secondary},${capsuleColor},${capsuleColor},${bold},${italic},0,0,100,100,${spacing},0,3,${boxPadding},0,${alignment},${horizontalPadding},${horizontalPadding},${verticalMargin},1`;
            }

            shadows.forEach((shadow, index) => {
                const shadowBack = this.hexToASSColor(shadow.color || '#000000');
                content += `\nStyle: ${styleName}_shad_${index},${fontName},${fontSize},${primary},${secondary},${outline},${shadowBack},${bold},${italic},0,0,100,100,${spacing},0,1,0,0,${alignment},${horizontalPadding},${horizontalPadding},${verticalMargin},1`;
            });
        });

        return content;
    }

    static generateEvents(tracks, videoInfo = { width: 1920, height: 1080 }) {
        let content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

        tracks.forEach((track, trackIndex) => {
            if (!track.subtitles) return;
            const styleName = `Style_${track.id}`;

            const trackStyle = track.style || {};
            const shadows = Array.isArray(trackStyle.shadows) ? trackStyle.shadows.filter(Boolean) : [];
            const hasBackground = !!trackStyle.enableBackground;
            const highlightKaraoke = !!trackStyle.enableKaraoke && (trackStyle.karaokeStyle || 'highlight') === 'highlight';
            const layerBase = trackIndex * 100;

            track.subtitles.forEach(sub => {
                const startTimeNum = parseFloat(sub.start || 0);
                const endTimeNum = parseFloat(sub.end || 0);
                const start = this.formatTime(startTimeNum);
                const end = this.formatTime(endTimeNum);

                let text = '';
                const eventTags = this.buildEventTags(trackStyle, videoInfo);
                const displayText = this.escapeASSText(sub.text || sub.translatedText || sub.originalText || '');

                if (trackStyle.enableKaraoke) {
                    const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
                    const secondaryText = sub.karaokeSecondaryText || '';
                    const karaokeBody = highlightKaraoke ? '' : this.buildKaraokeText(sub, primaryText, trackStyle);
                    if (highlightKaraoke) {
                        text = displayText;
                    } else if (karaokeBody) {
                        text = karaokeBody;
                        if (secondaryText) {
                            text += `\\N${this.escapeASSText(secondaryText)}`;
                        }
                    } else {
                        text = displayText;
                    }
                } else {
                    text = displayText;
                }

                // --- Animation Support ---
                let animTags = '';
                const dur = trackStyle.animationDuration || 300;
                if (!highlightKaraoke && trackStyle.animation === 'fade') {
                    animTags += `\\fad(${dur},${dur})`;
                } else if (!highlightKaraoke && trackStyle.animation === 'popup') {
                    // Start from 90% scale and animate to 100%
                    animTags += `\\fscx90\\fscy90\\t(0,${dur},\\fscx100\\fscy100)`;
                }

                if (animTags) {
                    eventTags.push(animTags);
                }

                if (eventTags.length > 0) {
                    text = `{${eventTags.join('')}}${text}`;
                }

                if (hasBackground) {
                    if (shadows.length > 0) {
                        if (eventTags.length > 0) {
                            content += `\nDialogue: ${layerBase},${start},${end},${styleName}_bg,,0,0,0,,{${eventTags.join('')}}${displayText}`;
                        } else {
                            content += `\nDialogue: ${layerBase},${start},${end},${styleName}_bg,,0,0,0,,${displayText}`;
                        }
                    } else {
                        if (eventTags.length > 0) {
                            content += `\nDialogue: ${layerBase},${start},${end},${styleName}_bg,,0,0,0,,{${eventTags.join('')}}${displayText}`;
                        } else {
                            content += `\nDialogue: ${layerBase},${start},${end},${styleName}_bg,,0,0,0,,${text}`;
                        }
                    }
                }

                shadows.forEach((shadow, index) => {
                    const shadowTags = this.buildShadowTags(shadow, trackStyle, videoInfo);
                    if (animTags) shadowTags.push(animTags);
                    shadowTags.push('\\1a&HFE&\\3a&HFE&');
                    const shadowDialogueText = `{${shadowTags.join('')}}${displayText}`;
                    const shadowLayer = hasBackground ? layerBase + index + 1 : layerBase + index;
                    content += `\nDialogue: ${shadowLayer},${start},${end},${styleName}_shad_${index},,0,0,0,,${shadowDialogueText}`;
                });

                if (hasBackground && shadows.length === 0) {
                    return;
                }

                if (!hasBackground && shadows.length === 0) {
                    if (highlightKaraoke) {
                        content += `\nDialogue: ${layerBase},${start},${end},${styleName},,0,0,0,,${text}`;
                        const karaokeEvents = this.buildKaraokeHighlightEvents(sub, trackStyle, videoInfo, layerBase + 1);
                        karaokeEvents.forEach(evt => {
                            content += `\nDialogue: ${evt.layer},${evt.start},${evt.end},${styleName}_kara,,0,0,0,,${evt.text}`;
                        });
                    } else {
                        content += `\nDialogue: ${layerBase},${start},${end},${styleName},,0,0,0,,${text}`;
                    }
                } else {
                    const textLayer = hasBackground ? layerBase + shadows.length + 1 : layerBase + shadows.length;
                    if (highlightKaraoke) {
                        content += `\nDialogue: ${textLayer},${start},${end},${styleName},,0,0,0,,${text}`;
                        const karaokeEvents = this.buildKaraokeHighlightEvents(sub, trackStyle, videoInfo, textLayer + 1);
                        karaokeEvents.forEach(evt => {
                            content += `\nDialogue: ${evt.layer},${evt.start},${evt.end},${styleName}_kara,,0,0,0,,${evt.text}`;
                        });
                    } else {
                        content += `\nDialogue: ${textLayer},${start},${end},${styleName},,0,0,0,,${text}`;
                    }
                }
            });
        });

        return content;
    }

    static buildEventTags(trackStyle = {}, videoInfo = { width: 1920, height: 1080 }) {
        const tags = [];

        if (trackStyle.position === 'custom') {
            const x = Math.round((trackStyle.marginH || 50) / 100 * videoInfo.width);
            const y = Math.round((trackStyle.marginV || 50) / 100 * videoInfo.height);
            tags.push(`\\pos(${x},${y})`);
        }

        return tags;
    }

    static buildShadowTags(shadow = {}, trackStyle = {}, videoInfo = { width: 1920, height: 1080 }) {
        const tags = this.buildEventTags(trackStyle, videoInfo);
        const scale = (videoInfo.height || 1080) / 720;
        const xShadow = Number(shadow.x || 0) * scale;
        const yShadow = Number(shadow.y || 0) * scale;
        const blur = Number(shadow.blur || 0) * scale * 0.35;

        if (Math.abs(xShadow) > 0.01) tags.push(`\\xshad${this.formatASSNumber(xShadow)}`);
        if (Math.abs(yShadow) > 0.01) tags.push(`\\yshad${this.formatASSNumber(yShadow)}`);
        if (blur > 0.01) tags.push(`\\blur${this.formatASSNumber(Math.max(0.6, blur))}`);
        if (shadow.color) tags.push(`\\4c${this.hexToASSOverrideColor(shadow.color)}`);

        return tags;
    }

    static formatASSNumber(value) {
        const numeric = Math.round(Number(value || 0) * 100) / 100;
        if (Number.isInteger(numeric)) return String(numeric);
        return numeric.toFixed(2).replace(/\.?0+$/, '');
    }

    /**
     * Seconds to 0:00:00.00
     */
    static formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = ((seconds % 60)).toFixed(2);

        // s is "12.34"
        const [sec, ms] = s.split('.');

        return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
    }

    static escapeASSText(text) {
        return String(text || '')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/\n/g, '\\N');
    }

    static hexToASSOverrideColor(hex) {
        return `${this.hexToASSColor(hex)}&`;
    }

    static tokenizeKaraokeText(text, style = {}) {
        const raw = String(text || '').replace(/\r/g, '').trim();
        if (!raw) return [];

        const styleMode = style.karaokeStyle || 'highlight';
        const lines = raw.split('\n');
        const tokens = [];

        lines.forEach((line, lineIndex) => {
            const shouldSplitByWord = /\s/.test(line.trim()) && styleMode !== 'progress';
            const usesComplexScript = /[\u3400-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff]/i.test(line);
            if (shouldSplitByWord) {
                line.split(/(\s+)/).filter(Boolean).forEach((part) => {
                    if (/^\s+$/.test(part)) {
                        tokens.push({ text: part, type: 'space' });
                    } else {
                        tokens.push({ text: part, type: 'timed' });
                    }
                });
            } else if (usesComplexScript) {
                Array.from(line).forEach(char => tokens.push({ text: char, type: 'timed' }));
            } else {
                tokens.push({ text: line, type: 'timed' });
            }

            if (lineIndex < lines.length - 1) {
                tokens.push({ text: '\n', type: 'break' });
            }
        });

        return tokens;
    }

    static buildKaraokeText(sub, primaryText, trackStyle) {
        const highlightASS = this.hexToASSOverrideColor(trackStyle.karaokeColor || '#3d6eb8');
        const basePrimaryASS = this.hexToASSOverrideColor(trackStyle.fontColor || '#ffffff');
        const words = Array.isArray(sub.words) ? sub.words.filter(Boolean).filter(word => String(word.text || '').trim()) : [];
        let parts = `{\\2c${basePrimaryASS}\\1c${highlightASS}}`;
        const normalizedPrimary = String(primaryText || '').replace(/\s+/g, '');
        const normalizedWords = words.map(word => word.text || '').join('').replace(/\s+/g, '');
        const canUseWordTimings = words.length > 1 && normalizedPrimary && normalizedPrimary === normalizedWords && !String(primaryText || '').includes('\n');

        if (canUseWordTimings) {
            let lastTime = Number(sub.start || 0);
            words.forEach((word, index) => {
                const wordStart = Number(word.start || lastTime);
                const wordEnd = Number(word.end || wordStart);
                if (wordStart > lastTime + 0.01) {
                    const gap = Math.round((wordStart - lastTime) * 100);
                    if (gap > 0) parts += `{\\k${gap}}`;
                }

                const duration = Math.max(1, Math.round((wordEnd - wordStart) * 100));
                const safeText = this.escapeASSText(word.text || '');
                const spacer = index < words.length - 1 ? ' ' : '';
                parts += `{\\kf${duration}}${safeText}${spacer}`;
                lastTime = wordEnd;
            });
            return parts;
        }

        const tokens = this.tokenizeKaraokeText(primaryText, trackStyle);
        if (tokens.length === 0) return '';

        const timedTokens = tokens.filter(token => token.type === 'timed');
        const totalDurationCs = Math.max(1, Math.round((Number(sub.end || 0) - Number(sub.start || 0)) * 100));
        const baseDuration = Math.max(1, Math.floor(totalDurationCs / Math.max(1, timedTokens.length)));
        let remaining = totalDurationCs;

        tokens.forEach((token) => {
            if (token.type === 'break') {
                parts += '\\N';
                return;
            }

            if (token.type === 'space') {
                parts += this.escapeASSText(token.text);
                return;
            }

            const isLastTimed = timedTokens[timedTokens.length - 1] === token;
            const duration = isLastTimed ? Math.max(1, remaining) : baseDuration;
            remaining -= duration;
            parts += `{\\kf${duration}}${this.escapeASSText(token.text)}`;
        });

        return parts;
    }

    static buildKaraokeHighlightEvents(sub, trackStyle, videoInfo = { width: 1920, height: 1080 }, layer = 0) {
        const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
        const secondaryText = sub.karaokeSecondaryText || '';
        const segments = this.buildKaraokeHighlightSegments(sub, primaryText, trackStyle);
        const eventTags = this.buildEventTags(trackStyle, videoInfo);

        return segments.map(segment => {
            const lineText = `${segment.text}${secondaryText ? `\\N{\\alpha&HFF&}${this.escapeASSText(secondaryText)}` : ''}`;
            const fullText = eventTags.length > 0 ? `{${eventTags.join('')}}${lineText}` : lineText;
            return {
                layer,
                start: this.formatTime(segment.start),
                end: this.formatTime(segment.end),
                text: fullText
            };
        });
    }

    static buildKaraokeHighlightSegments(sub, primaryText, trackStyle = {}) {
        const normalizedPrimary = String(primaryText || '').replace(/\s+/g, '');
        const words = Array.isArray(sub.words) ? sub.words.filter(Boolean).filter(word => String(word.text || '').trim()) : [];
        const normalizedWords = words.map(word => word.text || '').join('').replace(/\s+/g, '');
        const canUseWordTimings = words.length > 1 && normalizedPrimary && normalizedPrimary === normalizedWords && !String(primaryText || '').includes('\n');

        if (canUseWordTimings) {
            return words.map((word, index) => {
                const plainLine = words.map((entry, wordIndex) => {
                    const safeWord = this.escapeASSText(entry.text || '');
                    const wrappedWord = wordIndex === index
                        ? `{\\alpha&H00&}${safeWord}`
                        : `{\\alpha&HFF&}${safeWord}`;
                    return `${wrappedWord}${wordIndex < words.length - 1 ? ' ' : ''}`;
                }).join('');

                return {
                    start: Number(word.start || sub.start || 0),
                    end: Number(word.end || word.start || sub.end || 0),
                    text: plainLine
                };
            }).filter(segment => segment.end > segment.start);
        }

        const tokens = this.tokenizeKaraokeText(primaryText, trackStyle);
        const timedTokenIndexes = tokens
            .map((token, index) => ({ token, index }))
            .filter(item => item.token.type === 'timed');

        if (timedTokenIndexes.length === 0) return [];

        const totalDuration = Math.max(0.001, Number(sub.end || 0) - Number(sub.start || 0));
        const step = totalDuration / timedTokenIndexes.length;

        return timedTokenIndexes.map((item, activeIndex) => {
            const start = Number(sub.start || 0) + (step * activeIndex);
            const end = activeIndex === timedTokenIndexes.length - 1
                ? Number(sub.end || start)
                : Number(sub.start || 0) + (step * (activeIndex + 1));

            const text = tokens.map((token, tokenIndex) => {
                if (token.type === 'break') return '\\N';
                if (token.type === 'space') return `{\\alpha&HFF&}${this.escapeASSText(token.text)}`;

                const safeText = this.escapeASSText(token.text);
                if (tokenIndex === item.index) {
                    return `{\\alpha&H00&}${safeText}`;
                }
                return `{\\alpha&HFF&}${safeText}`;
            }).join('');

            return { start, end, text };
        }).filter(segment => segment.end > segment.start);
    }

    /**
     * Hex #RRGGBB(AA) or rgba(...) to &HAABBGGRR
     */
    static hexToASSColor(hex, forceAlpha = null) {
        if (!hex) return '&H00FFFFFF';

        // Handle rgba() / rgb() format
        const rgbaMatch = String(hex).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
            let a = forceAlpha !== null ? forceAlpha : '00';
            if (rgbaMatch[4] !== undefined && forceAlpha === null) {
                const alphaVal = Math.round(parseFloat(rgbaMatch[4]) * 255);
                a = (255 - alphaVal).toString(16).padStart(2, '0').toUpperCase();
            }
            return `&H${a}${b}${g}${r}`.toUpperCase();
        }

        hex = hex.replace('#', '');

        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');

        let r = hex.substring(0, 2);
        let g = hex.substring(2, 4);
        let b = hex.substring(4, 6);
        let a = '00';

        // If hex has alpha
        if (hex.length === 8) {
            // CSS #RRGGBBAA -> AA is opacity (255=visible)
            // ASS &HAABBGGRR -> AA is transparency (00=visible)
            const alphaVal = parseInt(hex.substring(6, 8), 16);
            a = (255 - alphaVal).toString(16).padStart(2, '0').toUpperCase();
        }

        if (forceAlpha !== null) a = forceAlpha;

        return `&H${a}${b}${g}${r}`;
    }
}

module.exports = ASSGenerator;




