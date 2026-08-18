class CreatorExportPlanner {
    constructor(capabilityMatrix) {
        this.capabilities = capabilityMatrix || window.CreatorExportCapabilityMatrix || {};
    }

    buildJob(snapshot, options = {}) {
        this._validateSnapshot(snapshot);

        const exportKind = options.type || 'video+audio';
        const format = (options.format || '').toLowerCase();
        const outputPath = options.outputPath || options.savePath;
        const normalizedFormat = this._normalizeFormat(exportKind, format);

        if (!outputPath) {
            throw new Error('Missing export output path');
        }

        const activeTracks = snapshot.tracks
            .filter((track) => track.enabled !== false && track.muted !== true)
            .map((track) => ({
                ...track,
                clips: track.clips.filter((clip) => clip.enabled !== false && !clip.muted)
            }))
            .filter((track) => track.clips.length > 0);

        if (activeTracks.length === 0) {
            throw new Error('Timeline is empty');
        }

        const videoTracks = activeTracks.filter((track) => track.trackType === 'video');
        const audioTracks = activeTracks.filter((track) => track.trackType === 'audio');

        this._validateExportType(exportKind, normalizedFormat, snapshot, videoTracks, audioTracks);

        // Bottom visual track = primary; higher tracks become overlays (PiP / multi-layer).
        const sortedVideoTracks = videoTracks.slice().sort((left, right) => {
            return this._parseTrackNumber(left.trackId) - this._parseTrackNumber(right.trackId);
        });
        const primaryVideoTrack = exportKind === 'audio'
            ? null
            : (sortedVideoTracks[0] || null);
        if (exportKind !== 'audio' && !primaryVideoTrack) {
            throw new Error('No video track available for export');
        }

        const primaryAudioTrack = exportKind === 'audio'
            ? this._pickPrimaryTrack(audioTracks, 'audio')
            : null;

        const primaryVideoClips = primaryVideoTrack?.clips || [];
        const primaryAudioClips = primaryAudioTrack?.clips || [];
        const overlayVideoClips = sortedVideoTracks
            .slice(1)
            .flatMap((track) => (track.clips || []).map((clip) => ({
                ...clip,
                trackId: clip.trackId || track.trackId
            })))
            .sort((left, right) => {
                const trackDelta = this._parseTrackNumber(left.trackId) - this._parseTrackNumber(right.trackId);
                if (trackDelta !== 0) return trackDelta;
                return (left.timelineStart || 0) - (right.timelineStart || 0);
            });

        this._validateClips(
            primaryVideoClips.length > 0
                ? primaryVideoClips
                : (primaryAudioClips.length > 0 ? primaryAudioClips : overlayVideoClips)
        );
        if (overlayVideoClips.length) {
            this._validateClips(overlayVideoClips);
        }
        this._validateTransitions(primaryVideoClips);

        const primaryGroupIds = new Set(primaryVideoClips.map((clip) => clip.groupId).filter(Boolean));
        let overlayAudioClips = audioTracks.flatMap((track) => {
            return track.clips.filter((clip) => {
                if (exportKind === 'audio' && primaryAudioTrack?.trackId === track.trackId) {
                    return false;
                }
                if (primaryGroupIds.has(clip.groupId)) {
                    return false;
                }
                return true;
            });
        });

        // Overlay visual tracks often carry usable audio (embedded or linked volume on the video clip).
        // Snapshot may exclude the separate linked audio row, so rehydrate mixable audio from overlay video.
        if (exportKind !== 'video' && overlayVideoClips.length) {
            overlayAudioClips = this._mergeEmbeddedOverlayVideoAudio(overlayVideoClips, overlayAudioClips);
        }

        return {
            jobId: options.jobId || `creator_export_${Date.now()}`,
            createdAt: new Date().toISOString(),
            output: {
                path: outputPath,
                format: normalizedFormat,
                type: exportKind
            },
            exportKind,
            timelineDuration: snapshot.timelineDuration,
            snapshot,
            primaryVideoTrackId: primaryVideoTrack?.trackId || null,
            primaryAudioTrackId: primaryAudioTrack?.trackId || null,
            primaryVideoClips,
            primaryAudioClips,
            overlayVideoClips,
            overlayAudioClips,
            subtitleTracks: Array.isArray(snapshot.subtitleTracks) ? snapshot.subtitleTracks : [],
            capabilities: this.capabilities,
            stages: this._buildStages(exportKind)
        };
    }

    _validateSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.tracks)) {
            throw new Error('Invalid timeline snapshot');
        }
    }

    _validateExportType(exportKind, format, snapshot, videoTracks, audioTracks) {
        const videoFormats = this.capabilities.videoFormats || ['mp4'];
        const audioFormats = this.capabilities.audioFormats || ['mp3'];

        if (exportKind === 'audio') {
            if (!audioTracks.length) {
                throw new Error('No audio clips available for export');
            }
            if (!audioFormats.includes(format)) {
                throw new Error(`Unsupported audio export format: ${format}`);
            }
            return;
        }

        if (!videoTracks.length || snapshot.isAudioOnly) {
            throw new Error('No video clips available for export');
        }

        if (!videoFormats.includes(format)) {
            throw new Error(`Unsupported video export format: ${format}`);
        }
        // Multi visual tracks are supported: lowest track is primary, others overlay.
    }

    _pickPrimaryTrack(tracks, expectedType) {
        if (!tracks.length) {
            throw new Error(`No ${expectedType} track available for export`);
        }

        return tracks.slice().sort((left, right) => {
            return this._parseTrackNumber(left.trackId) - this._parseTrackNumber(right.trackId);
        })[0];
    }

    _overlayAudioIdentity(clip) {
        return [
            clip?.assetPath || '',
            Number(clip?.timelineStart) || 0,
            Number(clip?.timelineEnd) || 0,
            Number(clip?.sourceStart) || 0,
            Number(clip?.sourceEnd) || 0
        ].join('|');
    }

    /**
     * Promote unmuted overlay video clips into overlayAudioClips so PiP / upper tracks keep sound.
     */
    _mergeEmbeddedOverlayVideoAudio(overlayVideoClips, overlayAudioClips = []) {
        const existing = Array.isArray(overlayAudioClips) ? overlayAudioClips.slice() : [];
        const seen = new Set(existing.map((clip) => this._overlayAudioIdentity(clip)));

        overlayVideoClips.forEach((clip) => {
            if (!clip?.assetPath) return;
            if (clip.assetKind === 'image') return;
            if (!(Number(clip.volume) > 0.000001)) return;
            if (clip.muted) return;

            const identity = this._overlayAudioIdentity(clip);
            if (seen.has(identity)) return;
            seen.add(identity);

            existing.push({
                clipId: `${clip.clipId || 'overlay'}_audio`,
                trackId: clip.trackId || null,
                trackType: 'audio',
                assetPath: clip.assetPath,
                timelineStart: clip.timelineStart,
                timelineEnd: clip.timelineEnd,
                sourceStart: clip.sourceStart,
                sourceEnd: clip.sourceEnd,
                speed: clip.speed || 1,
                volume: clip.volume,
                transition: { id: 'none', duration: 0 },
                enabled: true,
                muted: false,
                groupId: clip.groupId || null,
                assetKind: clip.assetKind || 'video',
                name: clip.name || null,
                audioSource: 'overlay-video'
            });
        });

        return existing;
    }

    _validateClips(clips) {
        if (!clips.length) {
            throw new Error('Timeline is empty');
        }

        clips.forEach((clip) => {
            if (!clip.assetPath) {
                throw new Error('A clip is missing its source asset');
            }
            if (clip.timelineEnd <= clip.timelineStart) {
                throw new Error(`Invalid clip range: ${clip.clipId}`);
            }
            if (clip.sourceEnd < clip.sourceStart) {
                throw new Error(`Invalid source range: ${clip.clipId}`);
            }
            if (clip.speed <= 0) {
                throw new Error(`Invalid speed: ${clip.clipId}`);
            }
        });
    }

    _validateTransitions(clips) {
        const supportedTransitions = new Set(this.capabilities.transitions || ['none', 'fade']);
        clips.forEach((clip) => {
            const transitionId = clip.transition?.id || 'none';
            if (!supportedTransitions.has(transitionId)) {
                throw new Error(`Unsupported transition: ${transitionId}`);
            }
        });
    }

    _normalizeFormat(exportKind, format) {
        if (exportKind === 'audio') {
            return format || (this.capabilities.audioFormats || ['mp3'])[0];
        }
        return format || (this.capabilities.videoFormats || ['mp4'])[0];
    }

    _buildStages(exportKind) {
        const stages = [
            { id: 'prepare', label: 'Preparing export', weight: 5 },
            { id: 'materialize', label: 'Rendering timeline clips', weight: 45 },
            { id: 'compose', label: 'Composing timeline', weight: exportKind === 'audio' ? 35 : 25 }
        ];

        if (exportKind !== 'video') {
            stages.push({ id: 'audio', label: 'Mixing audio', weight: exportKind === 'audio' ? 15 : 20 });
        }

        stages.push({ id: 'finalize', label: 'Finalizing export', weight: 10 });
        return stages;
    }

    _parseTrackNumber(trackId) {
        return parseInt(String(trackId || '').slice(1), 10) || 1;
    }
}

if (typeof window !== 'undefined') {
    window.CreatorExportPlanner = CreatorExportPlanner;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreatorExportPlanner;
}
