class CreatorSubtitlePreviewOverlay {
    constructor(flow) {
        this.flow = flow;
        this.project = null;
        this.elements = {
            overlay: null,
            stage: null
        };
        this.activeTrackSignatures = new Map();
        this._resizeObserver = null;
    }

    init() {
        this.ensureElements();
        this.bindResizeObserver();
        this.syncProject(this.flow.localizedEditProject, { silent: true });
    }

    ensureElements() {
        const previewStage = document.querySelector('#page-creator .video-preview-full');
        if (!previewStage) return null;

        let overlay = document.getElementById('creator-subtitle-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'creator-subtitle-overlay';
            overlay.className = 'subtitle-overlay creator-subtitle-overlay hidden';
            overlay.innerHTML = '<div class="creator-subtitle-stage"></div>';
            previewStage.appendChild(overlay);
        }

        this.elements.overlay = overlay;
        this.elements.stage = overlay.querySelector('.creator-subtitle-stage');
        return overlay;
    }

    bindResizeObserver() {
        if (this._resizeObserver || typeof ResizeObserver === 'undefined') {
            return;
        }

        const previewStage = document.querySelector('#page-creator .video-preview-full');
        if (!previewStage) return;

        this._resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => this.render());
        });
        this._resizeObserver.observe(previewStage);

        const video = document.getElementById('creator-video-preview');
        if (video) {
            this._resizeObserver.observe(video);
        }
    }

    syncProject(project, { silent = false } = {}) {
        this.project = project || null;
        this.activeTrackSignatures.clear();
        this.render();

        if (!silent && project) {
            this.flow.showToast?.(
                window.i18n?.t('creator.toasts.subtitlePreviewReady') || 'Subtitle preview synced',
                'info'
            );
        }
    }

    clear() {
        this.project = null;
        this.activeTrackSignatures.clear();
        if (this.elements.stage) {
            this.elements.stage.innerHTML = '';
        }
        this.elements.overlay?.classList.add('hidden');
    }

    render(timelineTime = this.flow.timelineManager?.currentTime || 0) {
        this.ensureElements();
        this.updateLayout();
        this.updateActiveSubtitles(timelineTime);
    }

    updateLayout() {
        const overlay = this.elements.overlay;
        const stage = this.elements.stage;
        const previewStage = document.querySelector('#page-creator .video-preview-full');
        const video = document.getElementById('creator-video-preview');

        if (!overlay || !stage || !previewStage || !video || this.flow.isAudioOnly) {
            overlay?.classList.add('hidden');
            return;
        }

        const containerWidth = previewStage.clientWidth || 0;
        const containerHeight = previewStage.clientHeight || 0;
        const videoWidth = video.videoWidth || containerWidth;
        const videoHeight = video.videoHeight || containerHeight;

        if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
            overlay.classList.add('hidden');
            return;
        }

        const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
        const renderedWidth = Math.max(1, Math.round(videoWidth * scale));
        const renderedHeight = Math.max(1, Math.round(videoHeight * scale));
        const left = Math.round((containerWidth - renderedWidth) / 2);
        const top = Math.round((containerHeight - renderedHeight) / 2);

        stage.style.left = `${left}px`;
        stage.style.top = `${top}px`;
        stage.style.width = `${renderedWidth}px`;
        stage.style.height = `${renderedHeight}px`;
    }

    updateActiveSubtitles(timelineTime = this.flow.timelineManager?.currentTime || 0) {
        const overlay = this.elements.overlay;
        const stage = this.elements.stage;

        if (!overlay || !stage || !this.project || this.flow.isAudioOnly) {
            overlay?.classList.add('hidden');
            return;
        }

        const sourceTime = this.resolveSourceTime(timelineTime);
        const activeTracks = this.getRenderableTracks()
            .filter((track) => track && track.visible !== false)
            .map((track) => ({
                track,
                segment: this.findActiveSegment(track, sourceTime)
            }))
            .filter(({ segment }) => !!segment);

        if (!activeTracks.length) {
            this.activeTrackSignatures.clear();
            stage.innerHTML = '';
            overlay.classList.add('hidden');
            return;
        }

        this.syncTrackElements(activeTracks.map(({ track }) => String(track.id || 'track')));

        activeTracks.forEach(({ track, segment }) => {
            const trackId = String(track.id || 'track');
            const textEl = this.ensureTrackElement(trackId);
            const rendered = this.renderSegmentMarkup(segment, track.style || {}, sourceTime);
            const signature = `${segment.id || trackId}:${rendered.signature}`;

            if (this.activeTrackSignatures.get(trackId) !== signature || textEl.dataset.renderedSignature !== signature) {
                textEl.innerHTML = rendered.html;
                textEl.dataset.renderedSignature = signature;
                this.activeTrackSignatures.set(trackId, signature);
            }

            this.applyTrackStyle(textEl, track.style || {});
        });

        overlay.classList.remove('hidden');
    }

    getRenderableTracks() {
        if (Array.isArray(this.project?.renderTracks) && this.project.renderTracks.length > 0) {
            return this.project.renderTracks;
        }
        return Array.isArray(this.project?.subtitleTracks) ? this.project.subtitleTracks : [];
    }

    syncTrackElements(activeTrackIds) {
        const stage = this.elements.stage;
        if (!stage) return;

        const allowedIds = new Set(activeTrackIds);
        stage.querySelectorAll('.creator-subtitle-text').forEach((element) => {
            const trackId = element.dataset.trackId || '';
            if (!allowedIds.has(trackId)) {
                element.remove();
                this.activeTrackSignatures.delete(trackId);
            }
        });
    }

    ensureTrackElement(trackId) {
        const stage = this.elements.stage;
        let textEl = stage?.querySelector(`.creator-subtitle-text[data-track-id="${trackId}"]`);
        if (!textEl && stage) {
            textEl = document.createElement('div');
            textEl.className = 'creator-subtitle-text';
            textEl.dataset.trackId = trackId;
            textEl.setAttribute('aria-live', 'polite');
            stage.appendChild(textEl);
        }
        return textEl;
    }

    resolveSourceTime(timelineTime) {
        const manager = this.flow.timelineManager;
        if (!manager) return Number(timelineTime || 0);

        const mapped = manager.getMappedSourceTime?.(timelineTime);
        if (Number.isFinite(mapped)) {
            return mapped;
        }
        return Number(timelineTime || 0);
    }

    findActiveSegment(track, sourceTime) {
        const segments = Array.isArray(track?.segments)
            ? track.segments
            : (Array.isArray(track?.subtitles) ? track.subtitles : []);
        return segments.find((segment) => {
            const start = Number(segment.start ?? 0);
            const end = Number(segment.end ?? start);
            return sourceTime >= start && sourceTime < end;
        }) || null;
    }

    resolveDisplayText(segment) {
        const displayMode = this.project?.displayMode || 'translated';
        if (segment?.text) {
            return String(segment.text);
        }
        if (segment?.displayText) {
            return String(segment.displayText);
        }
        if (window.SubtitleSegmentAdapter?.buildDisplayText) {
            return window.SubtitleSegmentAdapter.buildDisplayText(segment, displayMode);
        }
        if (displayMode === 'original') {
            return String(segment.originalText || segment.text || '');
        }
        if (displayMode === 'bilingual') {
            const originalText = String(segment.originalText || segment.text || '');
            const translatedText = String(segment.translatedText || '');
            return translatedText ? `${originalText}\n${translatedText}` : originalText;
        }
        return String(segment.translatedText || segment.originalText || segment.text || '');
    }

    renderSegmentMarkup(segment, style = {}, currentTime = 0) {
        const karaokeEnabled = !!style.enableKaraoke || style.animation === 'karaoke';
        const displayText = this.resolveDisplayText(segment);

        if (!karaokeEnabled) {
            return {
                html: this.escapeHtml(displayText).replace(/\n/g, '<br>'),
                signature: `plain:${displayText}`
            };
        }

        const { primaryText, secondaryText } = this.resolveKaraokeLines(segment, displayText);
        const karaokeStyle = style.karaokeStyle || 'highlight';

        if (karaokeStyle === 'progress') {
            const duration = Math.max(0.001, Number(segment?.end || 0) - Number(segment?.start || 0));
            const progress = Math.max(0, Math.min(100, ((currentTime - Number(segment?.start || 0)) / duration) * 100));
            const karaokeColor = style.karaokeColor || '#3d6eb8';
            const fontColor = style.fontColor || '#ffffff';
            const primaryHtml = `<span style="background-image:linear-gradient(90deg,${karaokeColor} 0%, ${karaokeColor} ${progress}%, ${fontColor} ${progress}%, ${fontColor} 100%);background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;">${this.escapeHtml(primaryText).replace(/\n/g, '<br>')}</span>`;
            const progressBucket = Math.round(progress);
            return {
                html: secondaryText
                    ? `${primaryHtml}<br>${this.escapeHtml(secondaryText).replace(/\n/g, '<br>')}`
                    : primaryHtml,
                signature: `karaoke-progress:${progressBucket}:${primaryText}:${secondaryText}`
            };
        }

        const timeline = this.getKaraokeTimeline(segment, primaryText, style);
        const activeTimedIndex = this.getActiveKaraokeSegmentIndex(timeline, currentTime);
        let timedIndex = 0;
        const scale = this.getStageScale();
        const karaokeColor = style.karaokeColor || '#3d6eb8';
        const highlightRadius = Math.max(2, Math.round(4 * scale));

        const primaryHtml = timeline.tokens.map((token) => {
            if (token.type === 'break') return '<br>';
            if (token.type === 'space') return this.escapeHtml(token.text);

            const safeText = this.escapeHtml(token.text).replace(/\n/g, '<br>');
            const isActive = timedIndex === activeTimedIndex;
            timedIndex += 1;

            if (!isActive) return safeText;
            return `<span style="display:inline-block;background:${karaokeColor};color:#fff;border-radius:${highlightRadius}px;padding:0.08em 0.32em;margin:0 0.08em;box-decoration-break:clone;-webkit-box-decoration-break:clone;">${safeText}</span>`;
        }).join('');

        return {
            html: secondaryText
                ? `${primaryHtml}<br>${this.escapeHtml(secondaryText).replace(/\n/g, '<br>')}`
                : primaryHtml,
            signature: `karaoke-highlight:${activeTimedIndex}:${primaryText}:${secondaryText}`
        };
    }

    resolveKaraokeLines(segment, displayText = '') {
        const displayMode = this.project?.displayMode || 'translated';
        const hasExplicitKaraokeText = segment?.karaokeText || segment?.karaokeSecondaryText;

        if (hasExplicitKaraokeText) {
            return {
                primaryText: String(segment.karaokeText || segment.text || segment.originalText || segment.translatedText || displayText || ''),
                secondaryText: String(segment.karaokeSecondaryText || '')
            };
        }

        if (segment?.text && !segment?.originalText && !segment?.translatedText) {
            return {
                primaryText: String(segment.text || ''),
                secondaryText: ''
            };
        }

        if (displayMode === 'bilingual') {
            const originalText = String(segment?.originalText || segment?.text || displayText || '');
            const translatedText = String(segment?.translatedText || '');
            if (translatedText) {
                return { primaryText: originalText, secondaryText: translatedText };
            }

            const lines = String(displayText || '').split('\n');
            return {
                primaryText: lines[0] || '',
                secondaryText: lines.slice(1).join('\n')
            };
        }

        if (displayMode === 'original') {
            return {
                primaryText: String(segment?.originalText || segment?.text || displayText || ''),
                secondaryText: ''
            };
        }

        return {
            primaryText: String(segment?.translatedText || segment?.originalText || segment?.text || displayText || ''),
            secondaryText: ''
        };
    }

    getStageScale() {
        const stage = this.elements.stage;
        const stageHeight = stage?.clientHeight || parseFloat(stage?.style?.height || 0) || 720;
        return stageHeight / 720;
    }

    usesComplexScript(text) {
        return /[\u3400-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff]/i.test(String(text || ''));
    }

    tokenizeKaraokeText(text, style = {}) {
        const raw = String(text || '').replace(/\r/g, '').trim();
        if (!raw) return [];

        const styleMode = style.karaokeStyle || 'highlight';
        const tokens = [];

        raw.split('\n').forEach((line, lineIndex, lines) => {
            const shouldSplitByWord = /\s/.test(line.trim()) && styleMode !== 'progress';

            if (shouldSplitByWord) {
                line.split(/(\s+)/).filter(Boolean).forEach((part) => {
                    if (/^\s+$/.test(part)) tokens.push({ text: part, type: 'space' });
                    else tokens.push({ text: part, type: 'timed' });
                });
            } else if (this.usesComplexScript(line)) {
                Array.from(line).forEach((char) => {
                    if (/^\s$/.test(char)) tokens.push({ text: char, type: 'space' });
                    else tokens.push({ text: char, type: 'timed' });
                });
            } else {
                tokens.push({ text: line, type: 'timed' });
            }

            if (lineIndex < lines.length - 1) {
                tokens.push({ text: '\n', type: 'break' });
            }
        });

        return tokens;
    }

    getKaraokeTimeline(segment, primaryText, style = {}) {
        const normalizedPrimary = String(primaryText || '').replace(/\s+/g, '');
        const words = Array.isArray(segment?.words)
            ? segment.words.filter(Boolean).filter(word => String(word.text || '').trim())
            : [];
        const normalizedWords = words.map(word => word.text || '').join('').replace(/\s+/g, '');
        const canUseWordTimings = words.length > 1
            && normalizedPrimary
            && normalizedPrimary === normalizedWords
            && !String(primaryText || '').includes('\n');

        if (canUseWordTimings) {
            const tokens = [];
            words.forEach((word, index) => {
                tokens.push({ text: String(word.text || ''), type: 'timed' });
                const nextWord = words[index + 1];
                if (nextWord && !this.usesComplexScript(primaryText)) {
                    tokens.push({ text: ' ', type: 'space' });
                }
            });

            return {
                tokens,
                segments: words.map((word, timedIndex) => ({
                    start: Number(word.start ?? segment?.start ?? 0),
                    end: Number(word.end ?? word.start ?? segment?.end ?? 0),
                    timedIndex
                })).filter(entry => entry.end > entry.start)
            };
        }

        const tokens = this.tokenizeKaraokeText(primaryText, style);
        const timedTokens = tokens
            .map((token, index) => ({ token, index }))
            .filter(entry => entry.token.type === 'timed');

        if (timedTokens.length === 0) {
            return { tokens, segments: [] };
        }

        const start = Number(segment?.start || 0);
        const end = Number(segment?.end || start);
        const totalDuration = Math.max(0.001, end - start);
        const step = totalDuration / timedTokens.length;

        return {
            tokens,
            segments: timedTokens.map((entry, timedIndex) => ({
                start: start + (step * timedIndex),
                end: timedIndex === timedTokens.length - 1 ? end : start + (step * (timedIndex + 1)),
                timedIndex,
                tokenIndex: entry.index
            })).filter(item => item.end > item.start)
        };
    }

    getActiveKaraokeSegmentIndex(timeline, currentTime) {
        const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
        const active = segments.find((segment) => currentTime >= segment.start && currentTime < segment.end);
        return active ? active.timedIndex : -1;
    }

    applyTrackStyle(textEl, style = {}) {
        const stage = this.elements.stage;
        if (!textEl || !stage) return;

        const stageHeight = stage.clientHeight || parseFloat(stage.style.height) || 720;
        const scale = stageHeight / 720;
        const fontSize = Math.max(12, Math.round((Number(style.fontSize) || 32) * scale));
        const outlineWidth = this.resolveOutlineWidth(style, scale);
        const outlineColor = this.resolveOutlineColor(style);
        const wrapWidth = Math.max(20, Math.min(100, Number(style.wrapWidth) || 90));
        const lineHeight = Number(style.lineHeight) || 1.4;
        const letterSpacing = (Number(style.letterSpacing) || 0) * scale;
        const background = style.enableBackground
            ? this.withOpacity(style.bgColor || '#000000', Number(style.bgOpacity ?? 50) / 100)
            : 'transparent';

        textEl.style.fontFamily = style.fontFamily ? `"${String(style.fontFamily).replace(/"/g, '\\"')}", sans-serif` : 'sans-serif';
        textEl.style.fontSize = `${fontSize}px`;
        textEl.style.fontWeight = style.fontBold ? '700' : '400';
        textEl.style.fontStyle = style.fontItalic ? 'italic' : 'normal';
        textEl.style.color = style.fontColor || '#ffffff';
        textEl.style.lineHeight = String(lineHeight);
        textEl.style.letterSpacing = `${letterSpacing}px`;
        textEl.style.webkitTextStroke = outlineWidth > 0 ? `${outlineWidth}px ${outlineColor}` : '0 transparent';
        textEl.style.textShadow = this.buildTextShadow(style, scale);
        textEl.style.background = background;
        textEl.style.maxWidth = `${wrapWidth}%`;
        textEl.style.padding = style.enableBackground ? '0.25em 0.65em' : '0';

        this.applyPosition(textEl, style);
    }

    applyPosition(textEl, style = {}) {
        if (!textEl) return;

        const position = String(style.position || '2');
        const marginV = Math.max(0, Math.min(100, Number(style.marginV ?? 8)));
        const marginH = Math.max(0, Math.min(100, Number(style.marginH ?? 50)));

        if (position === 'custom') {
            textEl.style.left = `${marginH}%`;
            textEl.style.top = `${marginV}%`;
            textEl.style.right = 'auto';
            textEl.style.bottom = 'auto';
            textEl.style.transform = 'translate(-50%, -50%)';
            textEl.style.textAlign = style.textAlign || 'center';
            return;
        }

        const presets = {
            '1': { left: '8%', bottom: `${marginV}%`, transform: 'none', textAlign: 'left' },
            '2': { left: '50%', bottom: `${marginV}%`, transform: 'translateX(-50%)', textAlign: 'center' },
            '3': { right: '8%', bottom: `${marginV}%`, transform: 'none', textAlign: 'right' },
            '4': { left: '8%', top: '50%', transform: 'translateY(-50%)', textAlign: 'left' },
            '5': { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' },
            '6': { right: '8%', top: '50%', transform: 'translateY(-50%)', textAlign: 'right' },
            '7': { left: '8%', top: `${marginV}%`, transform: 'none', textAlign: 'left' },
            '8': { left: '50%', top: `${marginV}%`, transform: 'translateX(-50%)', textAlign: 'center' },
            '9': { right: '8%', top: `${marginV}%`, transform: 'none', textAlign: 'right' }
        };

        const preset = presets[position] || presets['2'];
        textEl.style.left = preset.left || 'auto';
        textEl.style.right = preset.right || 'auto';
        textEl.style.top = preset.top || 'auto';
        textEl.style.bottom = preset.bottom || 'auto';
        textEl.style.transform = preset.transform;
        textEl.style.textAlign = style.textAlign || preset.textAlign;
    }

    resolveOutlineWidth(style = {}, scale = 1) {
        const stroke = Array.isArray(style.strokes) && style.strokes.length > 0 ? style.strokes[0] : null;
        const width = Number(stroke?.width ?? style.outlineWidth ?? 0);
        return Math.max(0, width * scale);
    }

    resolveOutlineColor(style = {}) {
        const stroke = Array.isArray(style.strokes) && style.strokes.length > 0 ? style.strokes[0] : null;
        return stroke?.color || style.outlineColor || '#000000';
    }

    buildTextShadow(style = {}, scale = 1) {
        const shadows = [];
        const trackShadows = Array.isArray(style.shadows) ? style.shadows : [];

        trackShadows.forEach((shadow) => {
            const x = Math.round((Number(shadow.x) || 0) * scale);
            const y = Math.round((Number(shadow.y) || 0) * scale);
            const blur = Math.round((Number(shadow.blur) || 0) * scale);
            const color = shadow.color || 'rgba(0, 0, 0, 0.45)';
            shadows.push(`${x}px ${y}px ${blur}px ${color}`);
        });

        if (shadows.length === 0) {
            shadows.push(`0 ${Math.max(1, Math.round(scale))}px ${Math.max(3, Math.round(6 * scale))}px rgba(0, 0, 0, 0.45)`);
        }

        return shadows.join(', ');
    }

    withOpacity(color, opacity) {
        const safeOpacity = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 0.5));
        const hex = String(color || '#000000').trim();
        const normalized = hex.startsWith('#') ? hex.slice(1) : hex;

        if (normalized.length === 3) {
            const r = parseInt(normalized[0] + normalized[0], 16);
            const g = parseInt(normalized[1] + normalized[1], 16);
            const b = parseInt(normalized[2] + normalized[2], 16);
            return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
        }

        if (normalized.length === 6) {
            const r = parseInt(normalized.slice(0, 2), 16);
            const g = parseInt(normalized.slice(2, 4), 16);
            const b = parseInt(normalized.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
        }

        return color;
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

window.CreatorSubtitlePreviewOverlay = CreatorSubtitlePreviewOverlay;
