class EditorTimelineSnapUtils {
    static SNAP_THRESHOLD = 0.25;

    static getTrackEdges(flow, clipId, excludedClipIds = [], targetTrackId = null) {
        const match = flow?.store?.findClipById?.(clipId);
        if (!match) return [];
        const excluded = new Set([clipId, ...(Array.isArray(excludedClipIds) ? excludedClipIds : [])]);
        const resolvedTrackId = targetTrackId && flow.store?.getTrack?.(targetTrackId)
            ? targetTrackId
            : match.trackName;

        return flow.store
            .getTrack(resolvedTrackId)
            .filter(clip => !excluded.has(clip.id))
            .flatMap(clip => [clip.timelineStart || 0, clip.timelineEnd || ((clip.timelineStart || 0) + (clip.duration || 0))]);
    }

    static snapValue(value, edges = [], threshold = EditorTimelineSnapUtils.SNAP_THRESHOLD) {
        let best = value;
        let bestDistance = threshold;

        edges.forEach((edge) => {
            const distance = Math.abs(edge - value);
            if (distance <= bestDistance) {
                best = edge;
                bestDistance = distance;
            }
        });

        if (Math.abs(value) <= bestDistance) {
            best = 0;
        }

        return Number(best.toFixed(3));
    }
}

window.EditorTimelineSnapUtils = EditorTimelineSnapUtils;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineSnapUtils;
}
