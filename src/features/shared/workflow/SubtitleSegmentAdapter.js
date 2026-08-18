(function initSubtitleSegmentAdapter(globalScope) {
    const root = globalScope || window;

    function sanitizeWords(words) {
        if (!Array.isArray(words)) return [];
        return words
            .filter(Boolean)
            .map((word) => ({
                text: String(word.text || ''),
                start: Number(word.start ?? 0),
                end: Number(word.end ?? word.start ?? 0)
            }))
            .filter((word) => word.text);
    }

    function buildDisplayText(segment = {}, displayMode = 'translated') {
        const originalText = String(segment.originalText || segment.text || '');
        const translatedText = String(segment.translatedText || '');

        if (displayMode === 'original') {
            return originalText;
        }

        if (displayMode === 'bilingual') {
            return translatedText ? `${originalText}\n${translatedText}` : originalText;
        }

        return translatedText || originalText;
    }

    function mapSubtitleSegment(segment = {}, displayMode = 'translated') {
        return {
            id: segment.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            start: Number(segment.start ?? 0),
            end: Number(segment.end ?? segment.start ?? 0),
            text: String(segment.text || ''),
            originalText: String(segment.originalText || segment.text || ''),
            translatedText: String(segment.translatedText || ''),
            displayText: buildDisplayText(segment, displayMode),
            words: sanitizeWords(segment.words)
        };
    }

    function mapAudioSegment(segment = {}) {
        return {
            id: segment.id || `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            originId: segment.originId || null,
            start: Number(segment.start ?? 0),
            end: Number(segment.end ?? segment.start ?? 0),
            text: String(segment.text || ''),
            originalText: String(segment.originalText || segment.text || ''),
            translatedText: String(segment.translatedText || ''),
            displayText: String(segment.text || ''),
            words: [],
            audioPath: String(segment.audioPath || ''),
            audioStartOffset: Number(segment.audioStartOffset ?? 0),
            audioEndOffset: Number(segment.audioEndOffset ?? 0)
        };
    }

    function mapSubtitleTrack(track = {}, displayMode = 'translated') {
        return {
            id: track.id,
            name: String(track.name || ''),
            type: String(track.type || 'subtitle'),
            visible: track.visible !== false,
            locked: !!track.locked,
            color: track.color || '',
            style: root.LocalizedEditProject?.clone
                ? root.LocalizedEditProject.clone(track.style || null)
                : (track.style ? JSON.parse(JSON.stringify(track.style)) : null),
            segments: Array.isArray(track.subtitles)
                ? track.subtitles.map((segment) => mapSubtitleSegment(segment, displayMode))
                : []
        };
    }

    function mapAudioTrack(track = {}) {
        return {
            id: track.id,
            name: String(track.name || ''),
            type: 'audio',
            visible: track.visible !== false,
            locked: !!track.locked,
            color: track.color || '',
            style: null,
            segments: Array.isArray(track.subtitles)
                ? track.subtitles.map(mapAudioSegment)
                : []
        };
    }

    function splitTracks(tracks = [], displayMode = 'translated') {
        const subtitleTracks = [];
        const audioTracks = [];

        tracks.forEach((track) => {
            if (!track) return;

            if (track.type === 'audio') {
                audioTracks.push(mapAudioTrack(track));
                return;
            }

            subtitleTracks.push(mapSubtitleTrack(track, displayMode));
        });

        return { subtitleTracks, audioTracks };
    }

    root.SubtitleSegmentAdapter = {
        buildDisplayText,
        mapSubtitleSegment,
        mapAudioSegment,
        mapSubtitleTrack,
        mapAudioTrack,
        splitTracks
    };
}(window));
