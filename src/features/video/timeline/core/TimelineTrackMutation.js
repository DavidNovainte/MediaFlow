/**
 * TimelineTrackMutation
 *
 * Keeps cross-track segment moves deterministic and index-safe.
 */
class TimelineTrackMutation {
    static findSegmentIndex(track, { groupId, index, originalStart, originalEnd, sourceStart }) {
        if (!track?.segments?.length) return -1;

        if (groupId && originalStart !== undefined && originalEnd !== undefined) {
            const exactIndex = track.segments.findIndex((seg) => {
                const sameRange = Math.abs((seg.start || 0) - originalStart) < 0.0001
                    && Math.abs((seg.end || 0) - originalEnd) < 0.0001;
                const sameSource = sourceStart === undefined
                    || Math.abs(((seg.sourceStart || 0) - sourceStart)) < 0.0001;
                return seg.groupId === groupId && sameRange && sameSource;
            });
            if (exactIndex !== -1) return exactIndex;
        }

        if (groupId) {
            const groupIndex = track.segments.findIndex((seg) => seg.groupId === groupId);
            if (groupIndex !== -1) return groupIndex;
        }

        if (Number.isInteger(index) && index >= 0 && index < track.segments.length) {
            return index;
        }

        return -1;
    }

    static insertSegment(track, segment) {
        if (!track?.segments || !segment) return -1;

        track.segments.push(segment);
        track.segments.sort((a, b) => {
            const startDiff = (a.start || 0) - (b.start || 0);
            if (startDiff !== 0) return startDiff;
            return (a.end || 0) - (b.end || 0);
        });

        return track.segments.indexOf(segment);
    }

    static moveSegment(tracks, { fromTrackId, toTrackId, groupId, index, originalStart, originalEnd, sourceStart }) {
        const fromTrack = tracks?.[fromTrackId];
        const toTrack = tracks?.[toTrackId];
        if (!fromTrack || !toTrack) {
            return { moved: false, segment: null, index: -1 };
        }

        const sourceIndex = this.findSegmentIndex(fromTrack, { groupId, index, originalStart, originalEnd, sourceStart });
        if (sourceIndex === -1) {
            return { moved: false, segment: null, index: -1 };
        }

        const [segment] = fromTrack.segments.splice(sourceIndex, 1);
        if (!segment) {
            return { moved: false, segment: null, index: -1 };
        }

        const targetIndex = this.insertSegment(toTrack, segment);
        return { moved: true, segment, index: targetIndex };
    }
}

window.TimelineTrackMutation = TimelineTrackMutation;
