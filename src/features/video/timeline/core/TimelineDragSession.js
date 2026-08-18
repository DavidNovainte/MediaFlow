/**
 * TimelineDragSession
 *
 * Initializes the shared drag snapshot for both video and audio segments.
 */
class TimelineDragSession {
    static getMaxTrackNumber(manager, type) {
        const prefix = type === 'video' ? 'v' : 'a';
        const trackIds = Object.keys(manager.tracks || {}).filter((trackId) => trackId.startsWith(prefix));
        if (!trackIds.length) return 1;

        return Math.max(...trackIds.map((trackId) => manager.parseTrackNumber(trackId)));
    }

    static collectLinkedSegments(manager, trackId, index, seg) {
        const linkedSegments = [];

        if (!seg?.groupId) {
            return linkedSegments;
        }

        Object.values(manager.tracks || {}).forEach((track) => {
            track.segments.forEach((linkedSeg, linkedIndex) => {
                if (linkedSeg.groupId === seg.groupId && (track.id !== trackId || linkedIndex !== index)) {
                    linkedSegments.push({
                        trackId: track.id,
                        index: linkedIndex,
                        groupId: linkedSeg.groupId,
                        originalStart: linkedSeg.start,
                        originalEnd: linkedSeg.end,
                        originalSourceStart: linkedSeg.sourceStart || 0,
                        originalTrackIndex: manager.getTrackIndex(track.id)
                    });
                }
            });
        });

        return linkedSegments;
    }

    static start(manager, { trackId, index, seg, clientX }) {
        manager.dragLinkedSegments = this.collectLinkedSegments(manager, trackId, index, seg);
        manager.dragTargetTrackId = trackId;
        manager.dragTargetIndex = index;
        manager.dragOriginalTrackIndex = manager.getTrackIndex(trackId);
        manager.dragAutoCreateLimit = {
            video: this.getMaxTrackNumber(manager, 'video') + 1,
            audio: this.getMaxTrackNumber(manager, 'audio') + 1
        };
        manager.dragStartX = clientX;
        manager.dragOriginalStart = seg.start;
        manager.dragOriginalEnd = seg.end;
        manager.dragOldState = manager.captureState();
    }
}

window.TimelineDragSession = TimelineDragSession;
