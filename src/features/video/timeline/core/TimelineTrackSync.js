/**
 * TimelineTrackSync
 *
 * Executes cross-track moves for the primary segment and its linked segments.
 */
class TimelineTrackSync {
    static clampAutoCreatedTrackId(manager, trackId, type) {
        if (!trackId || manager.tracks?.[trackId]) {
            return trackId;
        }

        const maxAllowed = manager.dragAutoCreateLimit?.[type];
        if (!maxAllowed) {
            return trackId;
        }

        const requestedNumber = manager.parseTrackNumber(trackId);
        if (requestedNumber <= maxAllowed) {
            return trackId;
        }

        const prefix = type === 'video' ? 'v' : 'a';
        return `${prefix}${maxAllowed}`;
    }

    static sync(manager, deltaTracks, primaryNewTrackId) {
        const primaryType = primaryNewTrackId.startsWith('v') ? 'video' : 'audio';
        primaryNewTrackId = this.clampAutoCreatedTrackId(manager, primaryNewTrackId, primaryType);
        const primaryTrackNumber = manager.parseTrackNumber(primaryNewTrackId);
        primaryNewTrackId = manager.ensureTrackNumber(primaryType, primaryTrackNumber);

        const oldMainTrack = manager.tracks[manager.dragTargetTrackId];
        const newMainTrack = manager.tracks[primaryNewTrackId];

        if (oldMainTrack && newMainTrack && oldMainTrack !== newMainTrack) {
            const mainGroupId = oldMainTrack.segments[manager.dragTargetIndex]?.groupId;
            const moveResult = window.TimelineTrackMutation
                ? window.TimelineTrackMutation.moveSegment(manager.tracks, {
                    fromTrackId: manager.dragTargetTrackId,
                    toTrackId: primaryNewTrackId,
                    groupId: mainGroupId,
                    index: manager.dragTargetIndex,
                    originalStart: manager.dragOriginalStart,
                    originalEnd: manager.dragOriginalEnd,
                    sourceStart: oldMainTrack.segments[manager.dragTargetIndex]?.sourceStart || 0
                })
                : { moved: false };

            if (!moveResult.moved) {
                const [seg] = oldMainTrack.segments.splice(manager.dragTargetIndex, 1);
                newMainTrack.segments.push(seg);
            }

            if (primaryType === 'audio' && oldMainTrack.peaks) {
                newMainTrack.peaks = oldMainTrack.peaks;
                newMainTrack.sourceDuration = oldMainTrack.sourceDuration;
            }

            manager.dragTargetTrackId = primaryNewTrackId;
        }

        manager.dragLinkedSegments.forEach((link) => {
            const linkType = link.trackId.startsWith('v') ? 'video' : 'audio';
            let newTrackId = window.TimelineDragResolver
                ? window.TimelineDragResolver.resolveLinkedTrackId({
                    linkType,
                    primaryType,
                    primaryTrackNumber,
                    deltaTracks,
                    originalTrackIndex: link.originalTrackIndex,
                    ensureTrackNumber: (type, number) => manager.ensureTrackNumber(type, number),
                    getTrackIdByIndex: (index, type) => manager.getTrackIdByIndex(index, type)
                })
                : null;

            if (!newTrackId && linkType !== primaryType) {
                newTrackId = manager.ensureTrackNumber(linkType, primaryTrackNumber);
            } else if (!newTrackId) {
                newTrackId = manager.getTrackIdByIndex(link.originalTrackIndex + deltaTracks, linkType);
            }

            newTrackId = this.clampAutoCreatedTrackId(manager, newTrackId, linkType);

            if (newTrackId) {
                manager.ensureLinkedTrackExists(newTrackId, linkType);
            }

            if (!newTrackId || newTrackId === link.trackId) return;

            const oldTrack = manager.tracks[link.trackId];
            const newTrack = manager.tracks[newTrackId];
            if (!oldTrack || !newTrack) return;

            const moveResult = window.TimelineTrackMutation
                ? window.TimelineTrackMutation.moveSegment(manager.tracks, {
                    fromTrackId: link.trackId,
                    toTrackId: newTrackId,
                    groupId: link.groupId,
                    index: link.index,
                    originalStart: link.originalStart,
                    originalEnd: link.originalEnd,
                    sourceStart: link.originalSourceStart || 0
                })
                : { moved: false };

            if (moveResult.moved) {
                link.trackId = newTrackId;
                link.index = moveResult.index;
            } else {
                const snapshotGroupId = oldTrack.segments[link.index]?.groupId;
                const currentIdx = snapshotGroupId
                    ? oldTrack.segments.findIndex((s) => s.groupId === snapshotGroupId)
                    : (link.index < oldTrack.segments.length ? link.index : -1);

                if (currentIdx === -1) return;

                const [seg] = oldTrack.segments.splice(currentIdx, 1);
                newTrack.segments.push(seg);
                link.trackId = newTrackId;
            }

            if (linkType === 'audio' && oldTrack.peaks) {
                newTrack.peaks = oldTrack.peaks;
                newTrack.sourceDuration = oldTrack.sourceDuration;
            }
        });

        return true;
    }
}

window.TimelineTrackSync = TimelineTrackSync;
