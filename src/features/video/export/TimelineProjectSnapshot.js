class TimelineProjectSnapshot {
    static create(core) {
        const timeline = core?.timelineManager;
        const tracks = timeline?.tracks || {};
        const orderedTrackIds = Object.keys(tracks).sort((left, right) => {
            const leftType = left.startsWith('v') ? 0 : 1;
            const rightType = right.startsWith('v') ? 0 : 1;
            if (leftType !== rightType) return leftType - rightType;
            return this._parseTrackNumber(left) - this._parseTrackNumber(right);
        });

        const snapshotTracks = orderedTrackIds.map((trackId) => {
            const track = tracks[trackId] || {};
            const trackType = trackId.startsWith('v') ? 'video' : 'audio';
            const segments = Array.isArray(track.segments) ? track.segments : [];

            const clips = segments
                .map((segment, index) => this._createClip(core, trackId, trackType, segment, index))
                .sort((left, right) => {
                    if (left.timelineStart !== right.timelineStart) return left.timelineStart - right.timelineStart;
                    return left.timelineEnd - right.timelineEnd;
                });

            return {
                trackId,
                trackType,
                enabled: track.enabled !== false,
                muted: !!track.muted,
                clips
            };
        });

        const allClips = snapshotTracks.flatMap((track) => track.clips);
        const timelineDuration = allClips.reduce((maxDuration, clip) => {
            return Math.max(maxDuration, clip.timelineEnd);
        }, timeline?.duration || core?.videoDuration || 0);

        return {
            version: 1,
            createdAt: new Date().toISOString(),
            isAudioOnly: !!core?.isAudioOnly,
            timelineDuration,
            sourceDuration: timeline?.duration || core?.videoDuration || timelineDuration,
            primarySourcePath: this._getFilePath(core?.videoFile || core?.audioFile),
            subtitleTracks: this._collectSubtitleTracks(core),
            tracks: snapshotTracks,
            assets: this._collectAssets(snapshotTracks)
        };
    }

    static _createClip(core, trackId, trackType, segment, index) {
        const fileRef = segment?.file || core?.videoFile || core?.audioFile || null;
        const assetPath = this._getFilePath(fileRef);
        const timelineStart = Number(segment?.start) || 0;
        const timelineEnd = Number(segment?.end) || timelineStart;
        const timelineDuration = Math.max(0, timelineEnd - timelineStart);
        const sourceStart = Number(segment?.sourceStart) || 0;
        const speed = this._normalizeSpeed(segment?.speed);
        const sourceEnd = sourceStart + (timelineDuration * speed);
        const transition = this._normalizeTransition(segment?.transition);

        return {
            clipId: `${trackId}-${index}`,
            trackId,
            trackType,
            assetPath,
            timelineStart,
            timelineEnd,
            timelineDuration,
            sourceStart,
            sourceEnd,
            speed,
            volume: this._normalizeVolume(segment?.volume),
            transition,
            enabled: segment?.enabled !== false,
            muted: !!segment?.muted,
            groupId: segment?.groupId || null,
            name: segment?.name || null
        };
    }

    static _collectAssets(tracks) {
        const seen = new Map();
        tracks.forEach((track) => {
            track.clips.forEach((clip) => {
                if (!clip.assetPath || seen.has(clip.assetPath)) return;
                seen.set(clip.assetPath, {
                    path: clip.assetPath,
                    trackTypes: [clip.trackType]
                });
            });
        });

        return Array.from(seen.values());
    }

    static _getFilePath(fileLike) {
        if (!fileLike) return '';
        if (typeof fileLike === 'string') return fileLike;
        return fileLike.path || '';
    }

    static _normalizeTransition(transition) {
        if (!transition || transition.id === 'none') {
            return { id: 'none', duration: 0 };
        }

        return {
            id: transition.id || 'none',
            duration: Math.max(0, Number(transition.duration) || 0)
        };
    }

    static _normalizeVolume(volume) {
        if (volume === undefined || volume === null || Number.isNaN(Number(volume))) {
            return 1;
        }

        return Number(volume);
    }

    static _normalizeSpeed(speed) {
        const normalized = Number(speed);
        if (!normalized || normalized <= 0) return 1;
        return normalized;
    }

    static _collectSubtitleTracks(core) {
        if (typeof window === 'undefined') {
            return [];
        }

        return window.CreatorSubtitleExportAdapter?.buildTracks?.(core) || [];
    }

    static _parseTrackNumber(trackId) {
        return parseInt(String(trackId || '').slice(1), 10) || 1;
    }
}

if (typeof window !== 'undefined') {
    window.TimelineProjectSnapshot = TimelineProjectSnapshot;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimelineProjectSnapshot;
}
