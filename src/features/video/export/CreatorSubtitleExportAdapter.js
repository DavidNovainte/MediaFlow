class CreatorSubtitleExportAdapter {
    static buildTracks(core) {
        const project = core?.localizedEditProject;
        const timeline = core?.timelineManager;
        const sourceVideoPath = this._getPath(project?.video?.path || core?.videoFile || core?.audioFile);

        if (!project || !timeline?.tracks || !sourceVideoPath) {
            return [];
        }

        const videoTrack = this._getPrimaryVideoTrack(timeline.tracks);
        if (!videoTrack?.segments?.length) {
            return [];
        }

        const tracks = this._getRenderableTracks(project);
        return tracks
            .filter((track) => track && track.visible !== false)
            .map((track) => this._buildTrackExport(track, videoTrack.segments, sourceVideoPath, project.displayMode))
            .filter((track) => Array.isArray(track.subtitles) && track.subtitles.length > 0);
    }

    static _buildTrackExport(track, videoSegments, sourceVideoPath, displayMode) {
        const subtitles = [];
        const segments = this._getTrackSegments(track);

        segments.forEach((segment) => {
            const mappedParts = this._mapSubtitleSegment(segment, videoSegments, sourceVideoPath);
            if (!mappedParts.length) return;

            mappedParts.forEach((mappedPart, index) => {
                subtitles.push(this._buildMappedSubtitle(track, segment, mappedPart, displayMode, index));
            });
        });

        subtitles.sort((left, right) => {
            if (left.start !== right.start) return left.start - right.start;
            return left.end - right.end;
        });

        return {
            id: track.id,
            type: track.type || 'subtitle',
            style: this._clone(track.style) || {},
            subtitles
        };
    }

    static _buildMappedSubtitle(track, segment, mappedPart, displayMode, index) {
        const fallbackText = this._buildDisplayText(segment, displayMode);
        return {
            id: mappedPart.id || `${track.id || 'track'}_${segment.id || 'sub'}_${index}`,
            start: mappedPart.start,
            end: mappedPart.end,
            text: String(segment.text || fallbackText || ''),
            originalText: String(segment.originalText || ''),
            translatedText: String(segment.translatedText || ''),
            karaokeText: String(segment.karaokeText || segment.originalText || segment.text || ''),
            karaokeSecondaryText: String(segment.karaokeSecondaryText || segment.translatedText || ''),
            words: mappedPart.words
        };
    }

    static _mapSubtitleSegment(segment, videoSegments, sourceVideoPath) {
        const sourceStart = Number(segment?.start ?? 0);
        const sourceEnd = Number(segment?.end ?? sourceStart);
        if (!(sourceEnd > sourceStart)) {
            return [];
        }

        const mapped = [];
        videoSegments.forEach((clip, clipIndex) => {
            const clipPath = this._getPath(clip?.file) || sourceVideoPath;
            if (clipPath !== sourceVideoPath) return;

            const clipTimelineStart = Number(clip?.start ?? 0);
            const clipTimelineEnd = Number(clip?.end ?? clipTimelineStart);
            const clipSpeed = this._normalizeSpeed(clip?.speed);
            const clipSourceStart = Number(clip?.sourceStart ?? 0);
            const clipSourceEnd = clipSourceStart + Math.max(0, clipTimelineEnd - clipTimelineStart) * clipSpeed;

            const overlapStart = Math.max(sourceStart, clipSourceStart);
            const overlapEnd = Math.min(sourceEnd, clipSourceEnd);
            if (!(overlapEnd > overlapStart)) {
                return;
            }

            const timelineStart = clipTimelineStart + ((overlapStart - clipSourceStart) / clipSpeed);
            const timelineEnd = clipTimelineStart + ((overlapEnd - clipSourceStart) / clipSpeed);

            mapped.push({
                id: `${segment.id || 'subtitle'}_${clipIndex}`,
                start: timelineStart,
                end: timelineEnd,
                words: this._mapWords(segment.words, overlapStart, overlapEnd, clipSourceStart, clipTimelineStart, clipSpeed)
            });
        });

        return mapped;
    }

    static _mapWords(words, overlapStart, overlapEnd, clipSourceStart, clipTimelineStart, clipSpeed) {
        if (!Array.isArray(words) || !words.length) {
            return [];
        }

        return words
            .filter(Boolean)
            .map((word) => ({
                text: String(word.text || ''),
                start: Number(word.start ?? 0),
                end: Number(word.end ?? word.start ?? 0)
            }))
            .filter((word) => word.text && word.end > word.start)
            .map((word) => {
                const wordOverlapStart = Math.max(word.start, overlapStart);
                const wordOverlapEnd = Math.min(word.end, overlapEnd);
                if (!(wordOverlapEnd > wordOverlapStart)) {
                    return null;
                }

                return {
                    text: word.text,
                    start: clipTimelineStart + ((wordOverlapStart - clipSourceStart) / clipSpeed),
                    end: clipTimelineStart + ((wordOverlapEnd - clipSourceStart) / clipSpeed)
                };
            })
            .filter(Boolean);
    }

    static _buildDisplayText(segment, displayMode) {
        if (segment?.karaokeSecondaryText) {
            return String(segment.text || '');
        }

        if (segment?.displayText) {
            return String(segment.displayText);
        }

        if (window.SubtitleSegmentAdapter?.buildDisplayText) {
            return window.SubtitleSegmentAdapter.buildDisplayText(segment, displayMode || 'translated');
        }

        const originalText = String(segment?.originalText || segment?.text || '');
        const translatedText = String(segment?.translatedText || '');
        if (displayMode === 'original') {
            return originalText;
        }
        if (displayMode === 'bilingual') {
            return translatedText ? `${originalText}\n${translatedText}` : originalText;
        }
        return translatedText || originalText;
    }

    static _getPrimaryVideoTrack(tracks) {
        const trackIds = Object.keys(tracks || {})
            .filter((trackId) => trackId.startsWith('v'))
            .sort((left, right) => this._parseTrackNumber(left) - this._parseTrackNumber(right));
        const primaryId = trackIds.find((trackId) => tracks[trackId]?.enabled !== false && tracks[trackId]?.muted !== true);
        return primaryId ? tracks[primaryId] : null;
    }

    static _getRenderableTracks(project) {
        if (Array.isArray(project?.renderTracks) && project.renderTracks.length > 0) {
            return project.renderTracks;
        }
        return Array.isArray(project?.subtitleTracks) ? project.subtitleTracks : [];
    }

    static _getTrackSegments(track) {
        if (Array.isArray(track?.segments)) {
            return track.segments;
        }
        return Array.isArray(track?.subtitles) ? track.subtitles : [];
    }

    static _parseTrackNumber(trackId) {
        return parseInt(String(trackId || '').slice(1), 10) || 1;
    }

    static _normalizeSpeed(speed) {
        const normalized = Number(speed);
        return normalized > 0 ? normalized : 1;
    }

    static _getPath(fileLike) {
        if (!fileLike) return '';
        if (typeof fileLike === 'string') return fileLike;
        return fileLike.path || '';
    }

    static _clone(value) {
        if (value === null || value === undefined) return value;
        return JSON.parse(JSON.stringify(value));
    }
}

if (typeof window !== 'undefined') {
    window.CreatorSubtitleExportAdapter = CreatorSubtitleExportAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreatorSubtitleExportAdapter;
}
