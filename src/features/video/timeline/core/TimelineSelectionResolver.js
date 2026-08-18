/**
 * TimelineSelectionResolver
 *
 * Keeps "which segment is active at this timeline time" in one place so
 * preview playback and audio mixing do not drift apart.
 */
class TimelineSelectionResolver {
    static getTrackNumber(trackId) {
        const match = String(trackId || '').match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    }

    static getTrackIdsByType(tracks, type, trackOrder = null) {
        const explicitType = type === 'v' ? 'video' : 'audio';
        const explicitOrder = Array.isArray(trackOrder?.[explicitType]) ? trackOrder[explicitType] : [];
        if (explicitOrder.length) {
            const existingIds = Object.keys(tracks || {}).filter((id) => id.startsWith(type));
            const ordered = explicitOrder.filter((id) => existingIds.includes(id));
            existingIds.forEach((id) => {
                if (!ordered.includes(id)) {
                    ordered.push(id);
                }
            });
            return ordered;
        }

        return Object.keys(tracks || {})
            .filter(id => id.startsWith(type))
            .sort((a, b) => this.getTrackNumber(b) - this.getTrackNumber(a));
    }

    static getActiveSegmentInTrack(track, timelineNow) {
        if (!track?.segments?.length) return null;
        return track.segments.find(seg => timelineNow >= seg.start && timelineNow < seg.end) || null;
    }

    static getActiveVideoSegment(tracks, timelineNow, trackOrder = null) {
        const videoTrackIds = this.getTrackIdsByType(tracks, 'v', trackOrder);

        for (const trackId of videoTrackIds) {
            const activeSeg = this.getActiveSegmentInTrack(tracks[trackId], timelineNow);
            if (activeSeg) {
                return { activeSeg, activeTrackId: trackId };
            }
        }

        return { activeSeg: null, activeTrackId: null };
    }

    static getActiveAudioSegments(tracks, timelineNow, trackOrder = null) {
        const audioTrackIds = this.getTrackIdsByType(tracks, 'a', trackOrder);

        return audioTrackIds.map(trackId => ({
            trackId,
            activeSeg: this.getActiveSegmentInTrack(tracks[trackId], timelineNow)
        }));
    }
}

window.TimelineSelectionResolver = TimelineSelectionResolver;
