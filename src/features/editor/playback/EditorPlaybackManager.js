class EditorPlaybackManager {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.isPlaying = false;
        this.activeElement = null;
        this.activeClipId = null;
        /** @type {'timeline'|'asset'|null} */
        this.playbackMode = null;
        this.supplementalAudioElements = [];
        this.supplementalAudioClipIds = [];
        this.supplementalAudioPool = [];
        this.isSwitchingClip = false;
        this.boundKeydown = this.handleKeydown.bind(this);
        this.boundTimeUpdate = this.handleTimeUpdate.bind(this);
        this.boundEnded = this.handleEnded.bind(this);
        this.boundPause = this.handlePause.bind(this);
    }

    isAssetPreviewClipId(clipId) {
        return String(clipId || '').startsWith('asset-preview:');
    }

    getAssetOnlyPlaybackContext() {
        const state = this.flow.store.getState();
        const asset = this.flow.store.getPreferredPreviewAsset?.()
            || this.flow.store.getAssetById?.(state?.selectedAssetId)
            || (Array.isArray(state?.assets) ? state.assets[0] : null)
            || null;
        if (!asset?.src) return null;

        const kind = asset.kind || 'video';
        if (kind === 'image') return null;

        const element = kind === 'audio'
            ? this.flow.previewManager?.elements?.audio
            : this.flow.previewManager?.elements?.video;
        if (!element) return null;

        const duration = Math.max(Number(asset.duration) || Number(element.duration) || 0, 0.1);
        const playheadTime = Math.min(Math.max(Number(state?.playheadTime) || 0, 0), duration);

        return {
            mode: 'asset',
            clip: {
                id: `asset-preview:${asset.id}`,
                assetId: asset.id,
                kind,
                timelineStart: 0,
                timelineEnd: duration,
                sourceStart: 0,
                sourceEnd: duration,
                duration,
                speed: 1,
                volume: 100,
                muted: false
            },
            asset,
            element,
            mediaTime: playheadTime,
            supplementalAudioContexts: []
        };
    }

    init() {
        this.elements = {
            playToggle: document.getElementById('btn-editor-play-toggle')
        };
        this.bindEvents();
    }

    bindEvents() {
        this.elements.playToggle?.addEventListener('click', () => {
            this.togglePlayback();
        });

        // Capture phase so Space isn't eaten by focused toolbar buttons
        document.addEventListener('keydown', this.boundKeydown, true);
    }

    isInteractiveShortcutTarget(target) {
        const closestFrom = (node, selector) => {
            if (typeof node?.closest === 'function') return node.closest(selector);
            return node?.parentElement?.closest?.(selector) || null;
        };
        // Only block Space when typing — buttons/clips should not swallow play/pause
        return !!closestFrom(target, 'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
    }

    handleKeydown(event) {
        const page = this.flow.app?.router?.currentPage;
        if (page !== 'editor' && page !== 'creator') return;
        if (this.isInteractiveShortcutTarget(event.target)) return;

        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault?.();
            event.stopPropagation?.();
            this.togglePlayback();
        }
    }

    getClipMediaTime(clip, playheadTime) {
        const clipOffset = Math.max((Number(playheadTime) || 0) - (clip.timelineStart || 0), 0);
        return Math.min(
            (clip.sourceEnd || (clip.sourceStart || 0) + clip.duration),
            (clip.sourceStart || 0) + (clipOffset * (clip.speed || 1))
        );
    }

    ensureMediaSource(element, asset) {
        if (!element || !asset?.src) return;
        if (String(element.getAttribute?.('src') || '') === asset.src) return;
        element.src = asset.src;
    }

    ensureAudioElementPoolSize(size) {
        const requiredSize = Math.max(Number(size) || 0, 0);
        const stage = this.flow.previewManager?.elements?.stage || null;
        if (!stage) return;

        while (this.supplementalAudioPool.length < requiredSize) {
            const element = document.createElement('audio');
            element.className = 'editor-preview-media hidden';
            element.preload = 'auto';
            stage.appendChild(element);
            this.supplementalAudioPool.push(element);
        }
    }

    applyElementPlaybackSettings(element, clip, trackId = null, audioReference = null) {
        if (!element || !clip) return;
        const speed = Math.min(Math.max(Number(clip.speed) || 1, 0.25), 4);
        const resolvedTrackId = trackId || this.flow.store.findClipById?.(clip.id)?.trackName || null;
        const effectiveAudioClip = audioReference?.clip || clip;
        const normalizedVolume = Number(effectiveAudioClip?.volume);
        const volume = Math.min(Math.max((Number.isFinite(normalizedVolume) ? normalizedVolume : 100) / 100, 0), 1);
        const primaryTrackMuted = resolvedTrackId ? this.flow.store.isTrackMuted?.(resolvedTrackId) : false;
        const audioTrackMuted = audioReference?.trackName ? this.flow.store.isTrackMuted?.(audioReference.trackName) : false;
        const muted = !!clip.muted
            || !!effectiveAudioClip?.muted
            || !!primaryTrackMuted
            || !!audioTrackMuted
            || (audioReference !== null && audioReference !== undefined && audioReference.active === false);
        element.playbackRate = speed;
        element.volume = muted ? 0 : volume;
        element.muted = muted;
    }

    getSupplementalAudioContexts(primaryClip, playheadTime) {
        if (!primaryClip) return [];

        const audioTrackIds = this.flow.store.resolveTrackIds?.(['audio'])
            || this.flow.store.getTrackIdsByType?.('audio')
            || [];
        const contexts = [];
        const excludedClipIds = new Set([primaryClip.id].filter(Boolean));

        for (const trackId of audioTrackIds) {
            if (!this.flow.store.isTrackActive(trackId)) continue;

            const candidates = this.flow.store.getTrack(trackId).filter((clip) => {
                if (!clip || excludedClipIds.has(clip.id)) return false;
                if ((Number(playheadTime) || 0) < (clip.timelineStart || 0) || (Number(playheadTime) || 0) > (clip.timelineEnd || 0)) {
                    return false;
                }
                if (primaryClip.linkGroupId && clip.linkGroupId && primaryClip.linkGroupId === clip.linkGroupId) {
                    return false;
                }
                return this.flow.store.isClipReferenceActive?.(clip, trackId) !== false;
            });

            if (!candidates.length) continue;

            candidates.forEach((candidate) => {
                const asset = this.flow.store.getAssetById(candidate.assetId);
                if (!asset) return;
                excludedClipIds.add(candidate.id);
                contexts.push({
                    clip: candidate,
                    asset,
                    trackId,
                    mediaTime: this.getClipMediaTime(candidate, playheadTime)
                });
            });
        }

        this.ensureAudioElementPoolSize(contexts.length);
        return contexts.map((context, index) => ({
            ...context,
            element: this.supplementalAudioPool[index]
        }));
    }

    isPlayableClip(clip) {
        if (!clip?.id) return false;
        const match = this.flow.store.findClipById?.(clip.id);
        if (!match?.trackName) return false;
        return this.flow.store.isClipReferenceActive?.(clip, match.trackName) !== false;
    }

    getPlaybackContext() {
        const state = this.flow.store.getState();
        const playheadTime = Number(state.playheadTime) || 0;
        const selectedClip = this.flow.store.getSelectedClip();
        const clip = selectedClip
            && playheadTime >= selectedClip.timelineStart
            && playheadTime <= selectedClip.timelineEnd
            && this.isPlayableClip(selectedClip)
            ? selectedClip
            : this.flow.store.getActiveClipAtTime(playheadTime);

        // Only fall back to media-bin asset review when the timeline has no clips at all.
        // If clips exist but none sit under the playhead (gap / muted-solo / hidden), do not
        // hijack into bin preview — that would ignore intentional track mute/hide.
        if (!clip) {
            const hasTimelineClips = typeof this.flow.store.getAllClips === 'function'
                ? this.flow.store.getAllClips().length > 0
                : false;
            if (!hasTimelineClips) {
                return this.getAssetOnlyPlaybackContext();
            }
            return null;
        }

        const asset = this.flow.store.getAssetById(clip.assetId);
        if (!asset) return null;

        const clipKind = clip.kind || asset.kind || 'video';

        const element = clipKind === 'audio'
            ? this.flow.previewManager?.elements?.audio
            : clipKind === 'video'
                ? this.flow.previewManager?.elements?.video
                : null;
        if (!element) return null;

        return {
            mode: 'timeline',
            clip,
            asset,
            element,
            mediaTime: this.getClipMediaTime(clip, playheadTime),
            supplementalAudioContexts: this.getSupplementalAudioContexts(clip, playheadTime)
        };
    }

    async togglePlayback() {
        if (this.isPlaying) {
            this.stop();
            return;
        }

        const context = this.getPlaybackContext();
        if (!context) {
            window.app?.showToast(
                window.i18n?.t('editor.nothingToPlay') ||
                    'Nothing to play (add clips to the timeline, or select video/audio in the library)',
                'warning'
            );
            return;
        }

        await this.startContext(context);
    }

    async startContext(context) {
        if (!context) return;

        this.detachActiveElement();
        this.detachSupplementalAudioElements();
        this.activeElement = context.element;
        this.activeClipId = context.clip.id;
        this.playbackMode = context.mode === 'asset' || this.isAssetPreviewClipId(context.clip?.id)
            ? 'asset'
            : 'timeline';
        this.supplementalAudioElements = (context.supplementalAudioContexts || []).map((entry) => entry.element).filter(Boolean);
        this.supplementalAudioClipIds = (context.supplementalAudioContexts || []).map((entry) => entry.clip?.id).filter(Boolean);
        this.flow.previewManager?.setPlaybackDriven?.(true);

        try {
            this.ensureMediaSource(context.element, context.asset);
            const primaryTrackId = this.playbackMode === 'asset'
                ? null
                : (this.flow.store.findClipById?.(context.clip.id)?.trackName || null);
            const primaryAudioReference = this.playbackMode === 'asset'
                ? null
                : (this.flow.store.getAudioPlaybackReference?.(context.clip, primaryTrackId) || null);
            this.applyElementPlaybackSettings(context.element, context.clip, primaryTrackId, primaryAudioReference);
            if (Math.abs((context.element.currentTime || 0) - context.mediaTime) > 0.05) {
                context.element.currentTime = context.mediaTime;
            }

            (context.supplementalAudioContexts || []).forEach((entry) => {
                if (!entry.element) return;
                this.ensureMediaSource(entry.element, entry.asset);
                this.applyElementPlaybackSettings(entry.element, entry.clip, entry.trackId);
                if (Math.abs((entry.element.currentTime || 0) - entry.mediaTime) > 0.05) {
                    entry.element.currentTime = entry.mediaTime;
                }
            });

            this.attachActiveElement();
            await context.element.play();
            for (const entry of (context.supplementalAudioContexts || [])) {
                if (!entry.element) continue;
                try {
                    await entry.element.play();
                } catch (secondaryError) {
                    console.warn('[EditorPlaybackManager] Supplemental audio playback failed:', secondaryError);
                }
            }
            this.isPlaying = true;
            this.render(this.flow.store.getState());
        } catch (error) {
            console.error('[EditorPlaybackManager] Playback failed:', error);
            this.flow.previewManager?.setPlaybackDriven?.(false);
            this.detachActiveElement();
            this.detachSupplementalAudioElements();
            this.activeElement = null;
            this.activeClipId = null;
            this.playbackMode = null;
            window.app?.showToast(
                error?.message || window.i18n?.t('editor.playFailed') || 'Playback failed',
                'error'
            );
        }
    }

    attachActiveElement() {
        if (!this.activeElement) return;
        this.activeElement.addEventListener('timeupdate', this.boundTimeUpdate);
        this.activeElement.addEventListener('ended', this.boundEnded);
        this.activeElement.addEventListener('pause', this.boundPause);
    }

    detachActiveElement() {
        if (!this.activeElement) return;
        this.activeElement.removeEventListener('timeupdate', this.boundTimeUpdate);
        this.activeElement.removeEventListener('ended', this.boundEnded);
        this.activeElement.removeEventListener('pause', this.boundPause);
    }

    detachSupplementalAudioElements() {
        this.supplementalAudioElements.forEach((element) => {
            if (!element) return;
            if (!element.paused) {
                element.pause();
            }
        });
        this.supplementalAudioElements = [];
        this.supplementalAudioClipIds = [];
    }

    handleTimeUpdate() {
        if (!this.isPlaying || !this.activeElement || !this.activeClipId || this.isSwitchingClip) return;

        // Media-bin asset review (timeline empty or no clip under playhead)
        if (this.playbackMode === 'asset' || this.isAssetPreviewClipId(this.activeClipId)) {
            const mediaTime = Math.max(Number(this.activeElement.currentTime) || 0, 0);
            const duration = Math.max(
                Number(this.activeElement.duration) || 0,
                mediaTime
            );
            this.flow.store.setPlayheadTime(Math.min(mediaTime, duration || mediaTime));
            if (duration > 0 && mediaTime >= duration - 0.05) {
                void this.handleEnded();
            }
            return;
        }

        const match = this.flow.store.findClipById(this.activeClipId);
        if (!match?.clip) {
            this.stop();
            return;
        }

        const clip = match.clip;
        const speed = clip.speed || 1;
        const timelineTime = clip.timelineStart + ((this.activeElement.currentTime - (clip.sourceStart || 0)) / speed);
        const clampedTime = Math.min(Math.max(timelineTime, clip.timelineStart), clip.timelineEnd);
        this.flow.store.setPlayheadTime(clampedTime);

        if (clampedTime >= clip.timelineEnd - 0.02) {
            void this.handleEnded();
        }
    }

    handlePause() {
        if (this.isSwitchingClip) return;
        if (this.isPlaying) {
            this.stop(false);
        }
    }

    async handleEnded() {
        if (!this.isPlaying || this.isSwitchingClip) return;

        // Asset-bin review does not advance to timeline clips.
        if (this.playbackMode === 'asset' || this.isAssetPreviewClipId(this.activeClipId)) {
            this.stop(false);
            return;
        }

        const match = this.activeClipId ? this.flow.store.findClipById(this.activeClipId) : null;
        const currentClip = match?.clip || null;
        const nextClip = this.flow.store.getNextClipAfterTime((currentClip?.timelineEnd || this.flow.store.getState().playheadTime || 0) + 0.001, ['video', 'audio']);
        if (!nextClip) {
            this.stop(false);
            return;
        }

        this.isSwitchingClip = true;
        this.flow.store.selectClip(nextClip.id);
        this.flow.store.setPlayheadTime(nextClip.timelineStart || 0);

        await Promise.resolve();

        const context = this.getPlaybackContext();
        if (!context) {
            this.isSwitchingClip = false;
            this.stop(false);
            return;
        }

        await this.startContext(context);
        this.isSwitchingClip = false;
    }

    stop(shouldPauseElement = true) {
        if (shouldPauseElement && this.activeElement && !this.activeElement.paused) {
            this.activeElement.pause();
        }

        this.detachActiveElement();
        this.detachSupplementalAudioElements();
        this.isPlaying = false;
        this.isSwitchingClip = false;
        this.activeElement = null;
        this.activeClipId = null;
        this.playbackMode = null;
        this.flow.previewManager?.setPlaybackDriven?.(false);
        this.render(this.flow.store.getState());
    }

    render() {
        if (!this.elements.playToggle) return;
        const icon = this.elements.playToggle.querySelector('i');
        if (icon) {
            icon.className = this.isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        } else {
            this.elements.playToggle.textContent = this.isPlaying
                ? window.i18n?.t('editor.pause') || 'Pause'
                : window.i18n?.t('editor.play') || 'Play';
        }
        const pausePrev = window.i18n?.t('editor.pausePreview') || 'Pause preview';
        const playPrev = window.i18n?.t('editor.playPreview') || 'Play preview';
        this.elements.playToggle.setAttribute(
            'aria-label',
            this.isPlaying ? pausePrev : playPrev
        );
        this.elements.playToggle.setAttribute('title', this.isPlaying ? pausePrev : playPrev);
    }
}

window.EditorPlaybackManager = EditorPlaybackManager;

if (typeof module !== 'undefined') {
    module.exports = EditorPlaybackManager;
}
