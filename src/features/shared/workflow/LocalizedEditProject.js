(function initLocalizedEditProject(globalScope) {
    const root = globalScope || window;

    function cloneValue(value) {
        if (value === null || value === undefined) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeSegment(segment = {}) {
        return {
            id: segment.id || `segment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            originId: segment.originId || null,
            start: Number(segment.start ?? 0),
            end: Number(segment.end ?? segment.start ?? 0),
            text: String(segment.text || ''),
            originalText: String(segment.originalText || ''),
            translatedText: String(segment.translatedText || ''),
            displayText: String(segment.displayText || segment.text || ''),
            karaokeText: String(segment.karaokeText || ''),
            karaokeSecondaryText: String(segment.karaokeSecondaryText || ''),
            words: Array.isArray(segment.words) ? cloneValue(segment.words) : [],
            audioPath: segment.audioPath || '',
            audioStartOffset: Number(segment.audioStartOffset ?? 0),
            audioEndOffset: Number(segment.audioEndOffset ?? 0)
        };
    }

    function normalizeTrack(track = {}) {
        return {
            id: track.id || `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: String(track.name || ''),
            type: String(track.type || 'subtitle'),
            visible: track.visible !== false,
            locked: !!track.locked,
            color: track.color || '',
            style: cloneValue(track.style) || null,
            segments: Array.isArray(track.segments)
                ? track.segments.map(normalizeSegment)
                : (Array.isArray(track.subtitles) ? track.subtitles.map(normalizeSegment) : [])
        };
    }

    function createProject(input = {}) {
        const subtitleTracks = Array.isArray(input.subtitleTracks)
            ? input.subtitleTracks.map(normalizeTrack)
            : [];
        const audioTracks = Array.isArray(input.audioTracks)
            ? input.audioTracks.map(normalizeTrack)
            : [];
        const renderTracks = Array.isArray(input.renderTracks)
            ? input.renderTracks.map(normalizeTrack)
            : [];

        return {
            id: input.id || `localized_edit_${Date.now()}`,
            source: input.source || 'subtitle',
            createdAt: input.createdAt || Date.now(),
            displayMode: input.displayMode || 'translated',
            video: input.video
                ? {
                    path: input.video.path || '',
                    name: input.video.name || '',
                    duration: Number(input.video.duration ?? 0)
                }
                : null,
            subtitleTracks,
            audioTracks,
            renderTracks,
            metadata: cloneValue(input.metadata) || {}
        };
    }

    function isValidProject(project) {
        return !!(project && project.video && project.video.path);
    }

    root.LocalizedEditProject = {
        clone: cloneValue,
        create: createProject,
        isValid: isValidProject
    };
}(window));
