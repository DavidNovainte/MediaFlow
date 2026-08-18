class CreatorSubtitleProject {
    static getPrimaryTrack(project) {
        const tracks = Array.isArray(project?.subtitleTracks) ? project.subtitleTracks : [];
        if (tracks.length === 0) return null;

        const preferredId = project?.metadata?.activeTrackId;
        if (preferredId) {
            const preferredTrack = tracks.find((track) => String(track.id) === String(preferredId));
            if (preferredTrack) return preferredTrack;
        }

        return tracks.find((track) => track.visible !== false) || tracks[0];
    }

    static getPrimarySegments(project) {
        const track = this.getPrimaryTrack(project);
        if (!track || !Array.isArray(track.segments)) {
            return [];
        }

        return [...track.segments]
            .filter(Boolean)
            .map((segment) => ({
                ...segment,
                start: Number(segment.start ?? 0),
                end: Number(segment.end ?? segment.start ?? 0)
            }))
            .filter((segment) => segment.end > segment.start)
            .sort((a, b) => a.start - b.start);
    }

    static buildCompactTimeline(project, fileRef, { includeAudio = true } = {}) {
        const track = this.getPrimaryTrack(project);
        const sourceSegments = this.getPrimarySegments(project);
        let timelineCursor = 0;

        const videoSegments = [];
        const audioSegments = [];

        sourceSegments.forEach((segment, index) => {
            const duration = Math.max(0.05, Number(segment.end - segment.start));
            const groupId = `subtitle_group_${Date.now()}_${index}`;
            const baseSegment = {
                start: timelineCursor,
                end: timelineCursor + duration,
                sourceStart: segment.start,
                sourceEnd: segment.end,
                file: fileRef,
                groupId,
                speed: 1,
                volume: 1,
                subtitleRef: {
                    trackId: track?.id || null,
                    segmentId: segment.id || null
                }
            };

            videoSegments.push({ ...baseSegment });
            if (includeAudio) {
                audioSegments.push({ ...baseSegment });
            }

            timelineCursor += duration;
        });

        return {
            track,
            sourceSegments,
            videoSegments,
            audioSegments,
            duration: timelineCursor,
            firstSourceStart: sourceSegments[0]?.start ?? 0
        };
    }
}

window.CreatorSubtitleProject = CreatorSubtitleProject;
