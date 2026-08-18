class EditorPreviewManager {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.currentAssetId = null;
        this.currentMediaAssetIds = {
            video: null,
            audio: null,
            image: null
        };
        this.playbackDriven = false;
        this.viewMode = 'fit';
        this.safeFrameVisible = false;
        this.dragState = null;
        this.boundKeydown = this.handleKeydown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }

    t(key, fallback = '') {
        const text = window.i18n?.t?.(key);
        if (text && text !== key) return text;
        return fallback || key;
    }

    cacheElements() {
        this.elements = {
            empty: document.getElementById('editor-preview-empty'),
            stage: document.querySelector('.editor-preview-stage'),
            video: document.getElementById('editor-preview-video'),
            audio: document.getElementById('editor-preview-audio'),
            image: document.getElementById('editor-preview-image'),
            context: document.getElementById('editor-preview-context'),
            meta: document.getElementById('editor-preview-meta'),
            selection: document.getElementById('editor-preview-selection'),
            modeSelect: document.getElementById('editor-preview-mode'),
            modeDropdown: document.getElementById('editor-preview-mode-dropdown'),
            modeTrigger: document.getElementById('editor-preview-mode-trigger'),
            modeMenu: document.getElementById('editor-preview-mode-menu'),
            modeLabel: document.getElementById('editor-preview-mode-label'),
            currentTime: document.getElementById('editor-preview-current-time'),
            duration: document.getElementById('editor-preview-duration')
        };
    }

    bindEvents() {
        document.addEventListener('keydown', this.boundKeydown);
        document.addEventListener('pointermove', this.boundPointerMove);
        document.addEventListener('pointerup', this.boundPointerUp);
        document.addEventListener('pointercancel', this.boundPointerUp);
        this.elements.modeSelect?.addEventListener('change', (event) => this.setViewMode(event.target.value));
        this.bindModeDropdown();

        [this.elements.video, this.elements.image].forEach((element) => {
            if (!element) return;
            element.draggable = false;
            element.addEventListener('dragstart', (event) => event.preventDefault());
            element.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        });

        this.elements.video?.addEventListener('loadedmetadata', () => {
            const assetId = this.elements.video?.dataset?.assetId || null;
            this.syncMediaDuration(this.elements.video.duration, assetId);
            this.syncVisualMetadata(this.elements.video.videoWidth, this.elements.video.videoHeight, assetId);
            this.applyClipPlaybackState();
        });

        this.elements.audio?.addEventListener('loadedmetadata', () => {
            this.syncMediaDuration(this.elements.audio.duration, this.elements.audio?.dataset?.assetId || null);
            this.applyClipPlaybackState();
        });

        this.elements.image?.addEventListener('load', () => {
            this.syncVisualMetadata(
                this.elements.image.naturalWidth,
                this.elements.image.naturalHeight,
                this.elements.image?.dataset?.assetId || null
            );
        });

        this.updateViewModeState();
    }

    isInteractiveShortcutTarget(target) {
        if (typeof target?.closest === 'function') {
            return !!target.closest('input, textarea, select, button, a[href], [role="button"], [role="menuitem"], [role="slider"], [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
        }
        return !!target?.parentElement?.closest?.('input, textarea, select, button, a[href], [role="button"], [role="menuitem"], [role="slider"], [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
    }

    handleKeydown(event) {
        const isEditorPage = this.flow.app?.router?.currentPage === 'editor';
        if (!isEditorPage || this.isInteractiveShortcutTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

        const scaleDirection = this.getScaleDirectionForKey(event);
        if (scaleDirection !== 0) {
            const draggableContext = this.getDraggableClipContext();
            if (!draggableContext?.clip?.id) return;

            event.preventDefault();
            this.adjustClipScale(draggableContext.clip.id, scaleDirection * 5);
            return;
        }

        const keyMap = {
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 }
        };
        const delta = keyMap[event.key];
        if (!delta) return;

        const state = this.flow.store.getState();
        const selectedClipIds = Array.isArray(state?.selectedClipIds) ? state.selectedClipIds : [];
        if (selectedClipIds.length !== 1) return;

        const clip = this.flow.store.getSelectedClip();
        if (!clip || clip.kind === 'audio') return;

        const match = this.flow.store.findClipById(clip.id);
        if (match?.trackName && this.flow.store.isTrackLocked(match.trackName)) return;

        const step = event.shiftKey ? 10 : 1;
        event.preventDefault();
        this.flow.store.updateClip(clip.id, {
            x: (Number(clip.x) || 0) + (delta.x * step),
            y: (Number(clip.y) || 0) + (delta.y * step)
        });
    }

    getScaleDirectionForKey(event) {
        if (!event) return 0;
        if (event.code === 'Equal' || event.code === 'NumpadAdd') return 1;
        if (event.code === 'Minus' || event.code === 'NumpadSubtract') return -1;
        return 0;
    }

    adjustClipScale(clipId, delta) {
        if (!clipId || !delta) return null;
        const clip = this.flow.store.findClipById(clipId)?.clip || null;
        if (!clip) return null;

        const nextScale = Math.min(Math.max((Number(clip.scale) || 100) + delta, 10), 400);
        if (Math.abs(nextScale - (Number(clip.scale) || 100)) < 0.001) return clip;
        return this.flow.store.updateClip(clipId, { scale: nextScale });
    }

    getPreviewContext(state = this.flow.store.getState()) {
        const selectedClip = state?.selectedClipId ? this.flow.store.getSelectedClip() : null;
        const playheadTime = Number(state?.playheadTime) || 0;
        const activeClip = this.flow.store.getActiveClipAtTime(playheadTime);
        const preferredClip = selectedClip && playheadTime >= selectedClip.timelineStart && playheadTime <= selectedClip.timelineEnd
            ? selectedClip
            : activeClip || selectedClip;
        const activeVisualClip = this.flow.store.getActiveClipAtTime(playheadTime, ['video', 'image']);
        const clip = preferredClip?.kind === 'audio' && activeVisualClip
            ? activeVisualClip
            : preferredClip;
        const asset = clip
            ? this.flow.store.getAssetById(clip.assetId)
            : (state?.assets?.find(item => item.id === state.selectedAssetId) || state?.assets?.[0] || null);
        const clipKind = clip?.kind || asset?.kind || 'video';
        return { state, selectedClip, activeClip, clip, asset, clipKind, playheadTime };
    }

    getDraggableClipContext(state = this.flow.store.getState()) {
        const context = this.getPreviewContext(state);
        const selectedClipIds = Array.isArray(context.state?.selectedClipIds) ? context.state.selectedClipIds : [];
        if (selectedClipIds.length !== 1) return null;
        if (!context.clip || !context.selectedClip || context.clip.id !== context.selectedClip.id) return null;
        if (context.clipKind === 'audio') return null;
        if (this.playbackDriven || this.flow.playbackManager?.isPlaying) return null;

        const match = this.flow.store.findClipById(context.clip.id);
        if (!match?.trackName) return null;
        if (this.flow.store.isTrackLocked(match.trackName)) return null;
        if (this.flow.store.isTrackHidden(match.trackName)) return null;
        if (!this.flow.store.isTrackActive(match.trackName)) return null;

        return {
            ...context,
            trackName: match.trackName
        };
    }

    syncInteractiveState(state = this.flow.store.getState()) {
        const draggableContext = this.getDraggableClipContext(state);
        const isDragging = !!this.dragState;

        this.elements.stage?.classList.toggle('has-draggable-media', !!draggableContext);
        this.elements.stage?.classList.toggle('is-dragging-media', isDragging);

        [this.elements.video, this.elements.image].forEach((element) => {
            if (!element) return;
            const isCurrentTarget = !!draggableContext && !element.classList.contains('hidden');
            element.classList.toggle('is-draggable', isCurrentTarget);
            element.classList.toggle('is-dragging', isCurrentTarget && isDragging);
        });
    }

    handlePointerDown(event) {
        if (event.button !== 0) return;

        const draggableContext = this.getDraggableClipContext();
        if (!draggableContext?.clip?.id) return;

        event.preventDefault();
        this.dragState = {
            pointerId: event.pointerId,
            clipId: draggableContext.clip.id,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: Number(draggableContext.clip.x) || 0,
            startY: Number(draggableContext.clip.y) || 0,
            target: event.currentTarget || null
        };

        try {
            this.dragState.target?.setPointerCapture?.(event.pointerId);
        } catch (error) {
            void error;
        }
        this.syncInteractiveState();
    }

    handlePointerMove(event) {
        if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;

        const nextX = Math.round(this.dragState.startX + (event.clientX - this.dragState.startClientX));
        const nextY = Math.round(this.dragState.startY + (event.clientY - this.dragState.startClientY));
        const clip = this.flow.store.getSelectedClip();
        if (!clip || clip.id !== this.dragState.clipId) {
            this.handlePointerUp(event);
            return;
        }

        if (nextX === (Number(clip.x) || 0) && nextY === (Number(clip.y) || 0)) return;
        this.flow.store.updateClip(this.dragState.clipId, { x: nextX, y: nextY });
    }

    handlePointerUp(event) {
        if (!this.dragState || (event.pointerId !== null && event.pointerId !== undefined && event.pointerId !== this.dragState.pointerId)) return;
        try {
            this.dragState.target?.releasePointerCapture?.(this.dragState.pointerId);
        } catch (error) {
            void error;
        }
        this.dragState = null;
        this.syncInteractiveState();
    }

    bindModeDropdown() {
        const dropdown = this.elements.modeDropdown;
        const trigger = this.elements.modeTrigger;
        const menu = this.elements.modeMenu;
        if (!dropdown || !trigger || !menu) return;

        const close = () => {
            dropdown.classList.remove('is-open');
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };

        const open = () => {
            dropdown.classList.add('is-open');
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
        };

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown.classList.contains('is-open')) close();
            else open();
        });

        menu.querySelectorAll('[data-mode]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setViewMode(btn.dataset.mode);
                close();
            });
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('is-open')) {
                close();
            }
        });
    }

    getViewModeLabel(mode) {
        if (mode === 'fill') return this.t('editor.fill', '填充');
        if (mode === 'actual') return this.t('editor.actual', '100%');
        return this.t('editor.fit', '适应');
    }

    setViewMode(mode) {
        const nextMode = ['fit', 'fill', 'actual'].includes(mode) ? mode : 'fit';
        this.viewMode = nextMode;
        this.updateViewModeState();
    }

    updateViewModeState() {
        if (!this.elements.stage) return;
        this.elements.stage.classList.toggle('is-view-fit', this.viewMode === 'fit');
        this.elements.stage.classList.toggle('is-view-fill', this.viewMode === 'fill');
        this.elements.stage.classList.toggle('is-view-actual', this.viewMode === 'actual');
        this.elements.stage.classList.toggle('is-safe-frame-hidden', !this.safeFrameVisible);
        if (this.elements.modeSelect) {
            this.elements.modeSelect.value = this.viewMode;
        }
        if (this.elements.modeLabel) {
            this.elements.modeLabel.textContent = this.getViewModeLabel(this.viewMode);
        }
        this.elements.modeMenu?.querySelectorAll('[data-mode]')?.forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.mode === this.viewMode);
        });
        if (this.elements.safeFrameButton) {
            this.elements.safeFrameButton.classList.toggle('is-active', this.safeFrameVisible);
            this.elements.safeFrameButton.setAttribute('aria-pressed', this.safeFrameVisible ? 'true' : 'false');
            this.elements.safeFrameButton.title = this.safeFrameVisible ? '隐藏安全框' : '显示安全框';
        }
    }

    truncateLabel(value, maxLength = 30) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(1, maxLength - 3))}...`;
    }

    getMediaKindLabel(kind, options = {}) {
        if (kind === 'audio') return options.clip ? this.t('editor.clipAudio', '音频片段') : this.t('editor.kindAudio', '音频');
        if (kind === 'image') return this.t('editor.kindImage', '图片');
        if (kind === 'video') return options.clip ? this.t('editor.clipVideo', '视频片段') : this.t('editor.kindVideo', '视频');
        return options.clip ? this.t('editor.clipMedia', '素材片段') : this.t('editor.kindMedia', '素材');
    }

    getCleanAssetLabel(asset, fallback = '已选素材') {
        const text = String(asset?.name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s+/g, ' ').trim();
        if (!text) return fallback;
        if (/(views?|reactions?|likes?|comments?)/i.test(text) && text.length > 20) {
            if (asset?.kind === 'audio') return '音频片段';
            if (asset?.kind === 'image') return '图片';
            return '视频片段';
        }
        return text;
    }

    describeResolution(asset) {
        const width = Number(asset?.width) || 0;
        const height = Number(asset?.height) || 0;
        if (!width || !height) return asset?.kind === 'audio' ? '音频监听' : '等待元数据';
        return `${width} × ${height}`;
    }

    toggleSafeFrame() {
        this.safeFrameVisible = !this.safeFrameVisible;
        this.updateViewModeState();
    }

    getMetadataAsset(assetId = null) {
        if (assetId) {
            return this.flow.store.getAssetById(assetId);
        }
        if (this.currentAssetId) {
            return this.flow.store.getAssetById(this.currentAssetId);
        }
        return this.flow.store.getPreferredPreviewAsset();
    }

    syncMediaDuration(duration, assetId = null) {
        const asset = this.getMetadataAsset(assetId);
        if (!asset || !duration || !Number.isFinite(duration)) return;
        if (Math.abs((asset.duration || 0) - duration) < 0.01) return;
        this.flow.store.updateAsset(asset.id, { duration });
    }

    syncVisualMetadata(width, height, assetId = null) {
        const asset = this.getMetadataAsset(assetId);
        if (!asset || !width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return;
        const nextW = Math.round(width);
        const nextH = Math.round(height);
        if (!nextW || !nextH) return;
        // Prefer real decode size over low-res filmstrip/poster dims that may have been cached earlier
        const prevW = Number(asset.width) || 0;
        const prevH = Number(asset.height) || 0;
        const isUpgrade = (nextW * nextH) >= (prevW * prevH);
        if (prevW === nextW && prevH === nextH) {
            this.updateStagePresentation(asset);
            return;
        }
        if (!isUpgrade && prevW > 0 && prevH > 0) return;
        this.flow.store.updateAsset(asset.id, { width: nextW, height: nextH });
        this.updateStagePresentation({ ...asset, width: nextW, height: nextH });
    }

    ensureElementSource(kind, element, asset) {
        if (!kind || !element || !asset) return;
        const assetId = asset.id || null;
        const source = asset.src || '';
        if (this.currentMediaAssetIds[kind] !== assetId || String(element.getAttribute?.('src') || '') !== source) {
            element.src = source;
        }
        this.currentMediaAssetIds[kind] = assetId;
        if (assetId) {
            element.dataset.assetId = assetId;
        } else {
            delete element.dataset.assetId;
        }
        this.currentAssetId = assetId;
    }

    updateStagePresentation(asset = null) {
        if (!this.elements.stage) return;

        const width = Math.max(Number(asset?.width) || 16, 1);
        const height = Math.max(Number(asset?.height) || 9, 1);
        const ratio = width / height;
        this.elements.stage.style.setProperty('--editor-preview-stage-aspect', `${width} / ${height}`);
        this.elements.stage.style.setProperty('--editor-preview-backdrop-image', asset?.src ? `url("${asset.src}")` : 'none');
        this.elements.stage.classList.toggle('has-media-backdrop', !!asset?.src);
        this.elements.stage.classList.toggle('is-portrait', ratio < 1);
        this.elements.stage.classList.toggle('is-landscape', ratio >= 1);
        this.updateViewModeState();
    }

    formatMonitorTime(value) {
        const time = Math.max(Number(value) || 0, 0);
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.round((time - Math.floor(time)) * 1000);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }

    renderPlaybackTick(state = this.flow.store.getState()) {
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = this.formatMonitorTime(state?.playheadTime || 0);
        }
    }

    hideAllMedia() {
        this.elements.video?.classList.add('hidden');
        this.elements.audio?.classList.add('hidden');
        this.elements.image?.classList.add('hidden');
        this.elements.empty?.classList.add('hidden');
    }

    applyClipPlaybackState() {
        if (this.playbackDriven) return;

        const state = this.flow.store.getState();
        const selectedClip = this.flow.store.getSelectedClip();
        const playheadTime = Number(state.playheadTime) || 0;
        const clip = selectedClip && playheadTime >= selectedClip.timelineStart && playheadTime <= selectedClip.timelineEnd
            ? selectedClip
            : this.flow.store.getActiveClipAtTime(playheadTime);

        // No timeline clip: scrub media-bin asset preview by playhead (1:1 media time).
        if (!clip) {
            const mediaTime = Math.max(playheadTime, 0);
            if (this.elements.video && !this.elements.video.classList.contains('hidden')) {
                try {
                    const max = Number(this.elements.video.duration);
                    this.elements.video.currentTime = Number.isFinite(max) && max > 0
                        ? Math.min(mediaTime, max)
                        : mediaTime;
                } catch (error) {
                    void error;
                }
            }
            if (this.elements.audio && !this.elements.audio.classList.contains('hidden')) {
                try {
                    const max = Number(this.elements.audio.duration);
                    this.elements.audio.currentTime = Number.isFinite(max) && max > 0
                        ? Math.min(mediaTime, max)
                        : mediaTime;
                } catch (error) {
                    void error;
                }
            }
            return;
        }

        const clipOffset = Math.max(playheadTime - (clip.timelineStart || 0), 0);
        const mediaTime = Math.min(
            (clip.sourceEnd || (clip.sourceStart || 0) + clip.duration),
            (clip.sourceStart || 0) + (clipOffset * (clip.speed || 1))
        );

        if (this.elements.video && !this.elements.video.classList.contains('hidden')) {
            try {
                this.elements.video.currentTime = Math.min(mediaTime, this.elements.video.duration || mediaTime);
            } catch (error) {
                void error;
            }
        }

        if (this.elements.audio && !this.elements.audio.classList.contains('hidden')) {
            try {
                this.elements.audio.currentTime = Math.min(mediaTime, this.elements.audio.duration || mediaTime);
            } catch (error) {
                void error;
            }
        }
    }

    render(state) {
        const {
            clip,
            asset,
            clipKind,
            playheadTime
        } = this.getPreviewContext(state);

        this.hideAllMedia();
        this.updateStagePresentation(asset);
        this.syncInteractiveState(state);

        if (!asset) {
            if (this.dragState) {
                this.dragState = null;
                this.syncInteractiveState(state);
            }
            this.currentAssetId = null;
            this.elements.empty?.classList.remove('hidden');
            if (this.elements.context) this.elements.context.textContent = this.t('editor.preview', 'Preview');
            if (this.elements.meta) this.elements.meta.textContent = this.t('editor.previewMetaIdle', 'Import media to start editing.');
            if (this.elements.selection) this.elements.selection.textContent = this.t('editor.noMedia', 'No media loaded');
            if (this.elements.currentTime) this.elements.currentTime.textContent = this.formatMonitorTime(0);
            if (this.elements.duration) this.elements.duration.textContent = this.formatMonitorTime(0);
            return;
        }

        if (this.elements.context) {
            const label = clip
                ? this.t('editor.clipSelected', '片段')
                : this.t('editor.assetPreview', '素材预览');
            this.elements.context.textContent = label;
            this.elements.context.title = clip
                ? label
                : (this.t('editor.assetPreviewHint', '时间线无片段 — 正在预览素材库选中项，可播放试看') || label);
        }

        if (this.elements.selection) {
            this.elements.selection.textContent = this.getMediaKindLabel(clipKind, { clip: !!clip });
        }

        if (this.elements.meta) {
            // Compact footer: duration · resolution; full name lives in title tooltip
            const fullName = this.getCleanAssetLabel(asset);
            const durationText = clip?.duration
                ? `${Number(clip.duration).toFixed(2)}s`
                : (asset.duration ? `${Number(asset.duration).toFixed(2)}s` : '—');
            const resolution = this.describeResolution(asset);
            const modeHint = clip ? null : '未上时间线';
            const parts = [durationText, resolution, modeHint].filter((part) => part && part !== '—');
            this.elements.meta.textContent = parts.join(' · ') || '—';
            this.elements.meta.title = fullName;
        }

        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = this.formatMonitorTime(playheadTime || 0);
        }

        if (this.elements.duration) {
            const totalTime = clip
                ? (clip.timelineEnd || clip.duration || asset.duration || 0)
                : (asset.duration || clip?.duration || 0);
            this.elements.duration.textContent = this.formatMonitorTime(totalTime);
        }

        const scale = (clip?.scale ?? 100) / 100;
        const scaleX = scale * (clip?.flipX ? -1 : 1);
        const scaleY = scale * (clip?.flipY ? -1 : 1);
        const rotation = clip?.rotation ?? 0;
        const translateX = clip?.x ?? 0;
        const translateY = clip?.y ?? 0;
        const opacity = Math.min(Math.max((clip?.opacity ?? 100) / 100, 0), 1);
        const transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`;
        const speed = Math.min(Math.max(clip?.speed ?? 1, 0.25), 4);
        const trackName = clip?.id
            ? (this.flow.store.findClipById(clip.id)?.trackName || this.flow.store.getTrackNameForKind(clipKind))
            : this.flow.store.getTrackNameForKind(clipKind);
        const audioReference = clipKind === 'video'
            ? this.flow.store.getAudioPlaybackReference?.(clip, trackName)
            : null;
        const effectiveAudioClip = audioReference?.clip || clip;
        const volume = Math.min(Math.max(((effectiveAudioClip?.volume ?? clip?.volume ?? 100) / 100), 0), 1);
        const trackMuted = this.flow.store.isTrackMuted(trackName);
        const trackHidden = this.flow.store.isTrackHidden(trackName);
        const trackActive = this.flow.store.isTrackActive(trackName);
        const audioTrackMuted = audioReference?.trackName ? this.flow.store.isTrackMuted(audioReference.trackName) : false;
        const muted = !!clip?.muted
            || !!effectiveAudioClip?.muted
            || trackMuted
            || audioTrackMuted
            || (audioReference !== null && audioReference !== undefined && audioReference.active === false);

        if (trackHidden || !trackActive) {
            if (this.dragState) {
                this.dragState = null;
                this.syncInteractiveState(state);
            }
            this.elements.empty?.classList.remove('hidden');
            if (this.elements.meta) {
                this.elements.meta.textContent = trackHidden
                    ? '当前轨道已隐藏。'
                    : '当前轨道在独听之外未激活。';
            }
            return;
        }

        if (clipKind === 'audio') {
            if (this.dragState) {
                this.dragState = null;
                this.syncInteractiveState(state);
            }
            if (this.elements.audio) {
                this.ensureElementSource('audio', this.elements.audio, asset);
                this.elements.audio.playbackRate = speed;
                this.elements.audio.volume = muted ? 0 : volume;
                this.elements.audio.muted = muted;
                this.elements.audio.classList.remove('hidden');
                this.applyClipPlaybackState();
            }
            return;
        }

        if (clipKind === 'image') {
            if (this.elements.image) {
                this.ensureElementSource('image', this.elements.image, asset);
                this.elements.image.style.transform = transform;
                this.elements.image.style.opacity = `${opacity}`;
                this.elements.image.classList.remove('hidden');
            }
            return;
        }

        if (this.elements.video) {
            this.ensureElementSource('video', this.elements.video, asset);
            this.elements.video.playbackRate = speed;
            this.elements.video.volume = muted ? 0 : volume;
            this.elements.video.muted = muted;
            this.elements.video.style.transform = transform;
            this.elements.video.style.opacity = `${opacity}`;
            this.elements.video.classList.remove('hidden');
            this.applyClipPlaybackState();
        }
    }

    setPlaybackDriven(active) {
        this.playbackDriven = !!active;
        if (!this.playbackDriven) {
            this.applyClipPlaybackState();
        }
    }
}

window.EditorPreviewManager = EditorPreviewManager;

if (typeof module !== 'undefined') {
    module.exports = EditorPreviewManager;
}
