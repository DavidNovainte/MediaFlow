class EditorTimelineProjectSnapshot {
    static create(store) {
        const state = store?.getState?.();
        if (!state) {
            throw new Error('Missing editor project state');
        }

        const tracks = (state.trackOrder || [])
            .map((trackId) => this._createTrack(store, state, trackId))
            .filter((track) => ['video', 'audio'].includes(track.trackType))
            .filter((track) => track.clips.length > 0);
        const activeTracks = tracks.filter((track) => track.enabled !== false && track.muted !== true);
        const videoTracks = activeTracks.filter((track) => track.trackType === 'video');
        const audioTracks = activeTracks.filter((track) => track.trackType === 'audio');
        const exportClips = activeTracks.flatMap((track) => {
            return track.clips.filter((clip) => clip.enabled !== false && !clip.muted);
        });
        const timelineDuration = exportClips.reduce((maxValue, clip) => {
            return Math.max(maxValue, clip.timelineEnd || 0);
        }, 0);

        return {
            version: 1,
            createdAt: new Date().toISOString(),
            isAudioOnly: videoTracks.length === 0 && audioTracks.length > 0,
            timelineDuration,
            sourceDuration: timelineDuration,
            primarySourcePath: exportClips[0]?.assetPath || '',
            subtitleTracks: [],
            tracks,
            assets: this._collectAssets(exportClips)
        };
    }

    static _createTrack(store, state, trackId) {
        const trackType = state.trackMeta?.[trackId]?.type || 'video';
        const exportTrackType = trackType === 'image' ? 'video' : trackType;
        const trackMuted = !!state.trackControls?.[trackId]?.muted;
        const trackHidden = !!state.trackControls?.[trackId]?.hidden;
        const trackActive = store?.isTrackActive?.(trackId) !== false;
        const clips = (state.timeline?.[trackId] || [])
            .filter((clip) => this._shouldExportClip(store, state, trackId, trackType, clip))
            .map((clip) => this._createClip(store, trackId, exportTrackType, trackMuted, clip))
            .filter(Boolean)
            .sort((left, right) => left.timelineStart - right.timelineStart);

        return {
            trackId,
            trackType: exportTrackType,
            sourceTrackType: trackType,
            enabled: !trackHidden && trackActive,
            muted: false,
            clips
        };
    }

    static _shouldExportClip(store, state, trackId, trackType, clip) {
        if (!clip || trackType !== 'audio' || !clip.linkGroupId || !clip.assetId) {
            return true;
        }

        const linkedVideoExists = (state.trackOrder || [])
            .filter((candidateTrackId) => candidateTrackId !== trackId)
            .filter((candidateTrackId) => (state.trackMeta?.[candidateTrackId]?.type || 'video') === 'video')
            .filter((candidateTrackId) => {
                const trackHidden = !!state.trackControls?.[candidateTrackId]?.hidden;
                const trackActive = store?.isTrackActive?.(candidateTrackId) !== false;
                return !trackHidden && trackActive;
            })
            .some((candidateTrackId) => {
                return (state.timeline?.[candidateTrackId] || []).some((candidateClip) => {
                    return candidateClip?.linkGroupId === clip.linkGroupId
                        && candidateClip?.assetId === clip.assetId;
                });
            });

        return !linkedVideoExists;
    }

    static _createClip(store, trackId, trackType, trackMuted, clip) {
        const asset = store?.getAssetById?.(clip.assetId);
        const assetPath = asset?.path || asset?.file?.path || '';
        if (!assetPath) return null;

        const audioReference = trackType === 'video'
            ? (store?.getAudioPlaybackReference?.(clip, trackId) || null)
            : null;
        const effectiveAudioClip = audioReference?.clip || clip;
        const audioTrackMuted = audioReference?.trackName ? !!store?.isTrackMuted?.(audioReference.trackName) : false;
        const effectiveMuted = !!trackMuted
            || !!clip.muted
            || !!effectiveAudioClip?.muted
            || !!audioTrackMuted
            || (audioReference !== null && audioReference !== undefined && audioReference.active === false);

        const timelineStart = Number(clip.timelineStart) || 0;
        const timelineEnd = Number(clip.timelineEnd) || (timelineStart + (Number(clip.duration) || 0));
        const sourceStart = Number(clip.sourceStart) || 0;
        const sourceEnd = Number(clip.sourceEnd);
        const normalizedSourceEnd = Number.isFinite(sourceEnd)
            ? sourceEnd
            : sourceStart + Math.max(0, timelineEnd - timelineStart);

        return {
            clipId: clip.id,
            trackId,
            trackType,
            assetPath,
            timelineStart,
            timelineEnd,
            timelineDuration: Math.max(0, timelineEnd - timelineStart),
            sourceStart,
            sourceEnd: normalizedSourceEnd,
            speed: this._normalizeSpeed(clip.speed),
            volume: this._normalizeVolume(effectiveAudioClip?.volume, effectiveMuted),
            // Visual transform (preview inspector → export materialize)
            scale: this._normalizeScale(clip.scale),
            rotation: this._normalizeRotation(clip.rotation),
            opacity: this._normalizeOpacity(clip.opacity),
            flipX: !!clip.flipX,
            flipY: !!clip.flipY,
            x: this._normalizeOffset(clip.x),
            y: this._normalizeOffset(clip.y),
            previewStageWidth: this._normalizePositive(clip.previewStageWidth),
            previewStageHeight: this._normalizePositive(clip.previewStageHeight),
            assetKind: asset?.kind || clip.kind || trackType,
            transition: { id: 'none', duration: 0 },
            enabled: true,
            muted: false,
            groupId: null,
            name: clip.name || asset?.name || null
        };
    }

    static _normalizeScale(scale) {
        const value = Number(scale);
        if (!Number.isFinite(value)) return 100;
        return Math.min(400, Math.max(10, value));
    }

    static _normalizeRotation(rotation) {
        const value = Number(rotation);
        if (!Number.isFinite(value)) return 0;
        return Math.min(360, Math.max(-360, value));
    }

    static _normalizeOpacity(opacity) {
        const value = Number(opacity);
        if (!Number.isFinite(value)) return 100;
        return Math.min(100, Math.max(0, value));
    }

    static _normalizeOffset(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.min(4000, Math.max(-4000, parsed));
    }

    static _normalizePositive(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return parsed;
    }

    static _normalizeVolume(volume, muted) {
        if (muted) return 0;
        const normalized = Number(volume);
        if (!Number.isFinite(normalized)) return 1;
        return Math.max(0, normalized) / 100;
    }

    static _normalizeSpeed(speed) {
        const normalized = Number(speed);
        if (!Number.isFinite(normalized) || normalized <= 0) return 1;
        return normalized;
    }

    static _collectAssets(clips) {
        const seen = new Map();
        clips.forEach((clip) => {
            if (!clip.assetPath) return;
            const existing = seen.get(clip.assetPath);
            if (existing) {
                if (!existing.trackTypes.includes(clip.trackType)) {
                    existing.trackTypes.push(clip.trackType);
                }
                return;
            }

            seen.set(clip.assetPath, {
                path: clip.assetPath,
                trackTypes: [clip.trackType]
            });
        });

        return Array.from(seen.values());
    }
}

window.EditorTimelineProjectSnapshot = EditorTimelineProjectSnapshot;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineProjectSnapshot;
}
