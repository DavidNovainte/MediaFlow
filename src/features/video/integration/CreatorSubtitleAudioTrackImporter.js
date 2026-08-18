class CreatorSubtitleAudioTrackImporter {
    constructor(flow) {
        this.flow = flow;
    }

    clearImportedTracks() {
        const manager = this.flow.timelineManager;
        if (!manager?.tracks) return;

        const importedTrackIds = Object.keys(manager.tracks).filter((trackId) => {
            const track = manager.tracks[trackId];
            return trackId.startsWith('a') && track?.subtitleImport === true;
        });

        importedTrackIds.forEach((trackId) => {
            delete manager.tracks[trackId];
            this.flow.audioMixer?.unregisterTrack?.(trackId);
            const row = document.getElementById(`track-${trackId}`);
            if (row) row.remove();
        });

        if (window.TimelineTrackReorder) {
            importedTrackIds.forEach((trackId) => window.TimelineTrackReorder.unregisterTrack(manager, trackId));
        }
    }

    syncProject(project, options = {}) {
        const manager = this.flow.timelineManager;
        if (!manager?.tracks) return [];

        this.clearImportedTracks();

        const audioTracks = Array.isArray(project?.audioTracks)
            ? project.audioTracks.filter((track) => Array.isArray(track.segments) && track.segments.length > 0)
            : [];

        if (!audioTracks.length) {
            manager.renderAll?.();
            return [];
        }

        const timingMap = this._buildTimingMap(project, options.timelineMode || 'source');
        const createdTrackIds = [];

        audioTracks.forEach((track) => {
            const trackId = this._allocateAudioTrackId(manager);
            manager.tracks[trackId] = {
                id: trackId,
                segments: this._buildTrackSegments(track, timingMap),
                peaks: [],
                audioBuffer: null,
                subtitleImport: true,
                subtitleSourceTrackId: track.id,
                name: track.name || trackId
            };

            manager.createLinkedTrackDOM?.(trackId, 'audio');
            this._syncTrackLabel(trackId, track.name || trackId);
            createdTrackIds.push(trackId);

            const firstSegment = manager.tracks[trackId].segments[0];
            const firstPath = firstSegment?.file?.path || firstSegment?.file;
            if (firstPath) {
                this.flow.audioMixer?.registerTrack?.(trackId, firstPath);
            }
        });

        manager.updateLabelContextMenus?.();
        manager.renderAll?.(true);
        return createdTrackIds;
    }

    _buildTimingMap(project, timelineMode) {
        const sourceSegments = window.CreatorSubtitleProject?.getPrimarySegments(project) || [];
        if (timelineMode !== 'compact') {
            return new Map(sourceSegments.map((segment) => [String(segment.id), {
                subtitleStart: Number(segment.start ?? 0),
                subtitleEnd: Number(segment.end ?? segment.start ?? 0),
                timelineStart: Number(segment.start ?? 0),
                timelineEnd: Number(segment.end ?? segment.start ?? 0)
            }]));
        }

        const compact = window.CreatorSubtitleProject?.buildCompactTimeline(project, this.flow.videoFile || this.flow.audioFile, {
            includeAudio: !this.flow.isAudioOnly
        });
        const map = new Map();
        (compact?.sourceSegments || []).forEach((segment, index) => {
            const videoSegment = compact?.videoSegments?.[index];
            if (!videoSegment) return;
            map.set(String(segment.id), {
                subtitleStart: Number(segment.start ?? 0),
                subtitleEnd: Number(segment.end ?? segment.start ?? 0),
                timelineStart: Number(videoSegment.start ?? 0),
                timelineEnd: Number(videoSegment.end ?? videoSegment.start ?? 0)
            });
        });
        return map;
    }

    _buildTrackSegments(track, timingMap) {
        return track.segments
            .map((segment, index) => this._buildSegment(track, segment, timingMap, index))
            .filter(Boolean);
    }

    _buildSegment(track, segment, timingMap, index) {
        const key = segment.originId ? String(segment.originId) : String(segment.id);
        const timing = timingMap.get(key);
        if (!timing) return null;

        const originalStart = Number(segment.start ?? 0);
        const originalEnd = Number(segment.end ?? originalStart);
        const originalDuration = Math.max(0.01, originalEnd - originalStart);
        const subtitleOffset = originalStart - timing.subtitleStart;
        const timelineStart = Math.max(0, timing.timelineStart + subtitleOffset);
        const timelineEnd = timelineStart + originalDuration;

        const audioPath = segment.audioPath || track.audioPath || track.ttsAudioPath || '';
        const sourceStart = Number(segment.audioStartOffset ?? 0);
        const sourceEnd = Number(segment.audioEndOffset ?? (sourceStart + originalDuration));
        const fileRef = this.flow.createMediaFileRef
            ? this.flow.createMediaFileRef(audioPath, { type: 'audio/mp3' })
            : { path: audioPath, name: audioPath.split(/[\\/]/).pop(), type: 'audio/mp3' };

        return {
            start: timelineStart,
            end: timelineEnd,
            sourceStart,
            sourceEnd,
            file: fileRef,
            speed: 1,
            volume: 1,
            subtitleImport: true,
            subtitleOriginId: segment.originId || segment.id || null,
            subtitleTrackId: track.id || null,
            groupId: `subtitle_audio_${track.id || 'track'}_${index}`
        };
    }

    _allocateAudioTrackId(manager) {
        let index = 2;
        while (manager.tracks[`a${index}`]) {
            index += 1;
        }
        return `a${index}`;
    }

    _syncTrackLabel(trackId, trackName) {
        const label = document.querySelector(`#track-${trackId} .timeline-sidebar-label span`);
        if (label) {
            label.textContent = trackName;
            label.title = trackName;
        }
    }
}

window.CreatorSubtitleAudioTrackImporter = CreatorSubtitleAudioTrackImporter;
