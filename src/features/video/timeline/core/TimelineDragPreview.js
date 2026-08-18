/**
 * TimelineDragPreview
 * Keeps drag/trim preview behavior isolated from the main timeline manager.
 */
class TimelineDragPreview {
    static collectMovingSegments(manager, mainSeg) {
        const movingSegments = [mainSeg];

        manager.dragLinkedSegments.forEach((link) => {
            const seg = this.findLinkedSegment(manager, link);
            if (seg) {
                movingSegments.push(seg);
            }
        });

        return movingSegments;
    }

    static clampDragStart(manager, hoveredTrackId, proposedStart, duration, totalDelta, movingSegments = []) {
        const targetTrack = manager.tracks?.[hoveredTrackId];
        if (!targetTrack?.segments?.length) {
            return Math.max(0, Math.min(proposedStart, Math.max(0, manager.duration - duration)));
        }

        const movingRight = totalDelta >= 0;
        let minStart = 0;
        let maxStart = Math.max(0, manager.duration - duration);

        targetTrack.segments.forEach((seg) => {
            if (!seg || movingSegments.includes(seg)) return;

            const overlaps = proposedStart < seg.end && proposedStart + duration > seg.start;
            if (overlaps) {
                if (movingRight) {
                    maxStart = Math.min(maxStart, seg.start - duration);
                } else {
                    minStart = Math.max(minStart, seg.end);
                }
                return;
            }

            if (seg.end <= proposedStart) {
                minStart = Math.max(minStart, seg.end);
            }

            if (seg.start >= proposedStart + duration) {
                maxStart = Math.min(maxStart, seg.start - duration);
            }
        });

        if (minStart > maxStart) {
            return movingRight ? minStart : maxStart;
        }

        return Math.max(minStart, Math.min(proposedStart, maxStart));
    }

    static applyAutoScroll(container, e) {
        if (!container) return;

        const edgeThreshold = 60;
        const scrollSpeed = 10;
        const rect = container.getBoundingClientRect();

        if (e.clientX < rect.left + edgeThreshold) {
            container.scrollLeft -= scrollSpeed;
        } else if (e.clientX > rect.right - edgeThreshold) {
            container.scrollLeft += scrollSpeed;
        }

        if (e.clientY < rect.top + edgeThreshold) {
            container.scrollTop -= scrollSpeed;
        } else if (e.clientY > rect.bottom - edgeThreshold) {
            container.scrollTop += scrollSpeed;
        }
    }

    static findLinkedSegment(manager, link) {
        const targetTrack = manager.tracks[link.trackId];
        if (!targetTrack) return null;

        let seg = null;
        if (link.groupId && link.originalStart !== undefined && link.originalEnd !== undefined) {
            seg = targetTrack.segments.find((s) =>
                s.groupId === link.groupId
                && Math.abs((s.start || 0) - link.originalStart) < 0.0001
                && Math.abs((s.end || 0) - link.originalEnd) < 0.0001
                && Math.abs(((s.sourceStart || 0) - (link.originalSourceStart || 0))) < 0.0001
            ) || null;
            if (seg) {
                link.index = targetTrack.segments.indexOf(seg);
            }
        }

        if (!seg && link.groupId) {
            seg = targetTrack.segments.find((s) => s.groupId === link.groupId) || null;
            if (seg) {
                link.index = targetTrack.segments.indexOf(seg);
            }
        }

        if (!seg && link.index < targetTrack.segments.length) {
            seg = targetTrack.segments[link.index];
        }

        return seg;
    }

    static previewDrag(manager, e, mainSeg, originalDuration, deltaTime) {
        let newStart = manager.dragOriginalStart + deltaTime;
        let snappedStart = manager.calculateSnap(newStart, manager.dragTargetTrackId, manager.dragTargetIndex);
        if (snappedStart < 0) snappedStart = 0;

        this.applyAutoScroll(manager.timelineBody, e);

        if (snappedStart + originalDuration > manager.duration) {
            snappedStart = Math.max(0, manager.duration - originalDuration);
        }

        const typePrefix = manager.dragTargetTrackId[0];
        const dragType = typePrefix === 'v' ? 'video' : 'audio';
        const trackRows = Array.from(document.querySelectorAll('.timeline-track:not(.ruler-track)'));

        const hoveredTrackId = window.TimelineDragResolver
            ? window.TimelineDragResolver.resolveHoveredTrackId({
                rows: trackRows,
                typePrefix,
                currentTrackId: manager.dragTargetTrackId,
                clientY: e.clientY,
                parseTrackNumber: (trackId) => manager.parseTrackNumber(trackId),
                maxAutoCreateNumber: manager.dragAutoCreateLimit?.[dragType] || null
            })
            : manager.dragTargetTrackId;

        const currentTrackIndex = window.TimelineDragResolver
            ? window.TimelineDragResolver.getTargetTrackIndex({
                trackId: hoveredTrackId,
                type: dragType,
                orderedTrackIds: manager.getTrackOrder(dragType),
                parseTrackNumber: (trackId) => manager.parseTrackNumber(trackId)
            })
            : Math.max(0, manager.getTrackIndex(hoveredTrackId));

        const deltaTrackIndex = currentTrackIndex - manager.dragOriginalTrackIndex;

        const movingSegments = this.collectMovingSegments(manager, mainSeg);
        snappedStart = this.clampDragStart(
            manager,
            hoveredTrackId,
            snappedStart,
            originalDuration,
            snappedStart - manager.dragOriginalStart,
            movingSegments
        );
        const totalDelta = snappedStart - manager.dragOriginalStart;

        mainSeg.start = snappedStart;
        mainSeg.end = mainSeg.start + originalDuration;

        manager.dragLinkedSegments.forEach((link) => {
            const seg = this.findLinkedSegment(manager, link);
            if (!seg) return;

            const linkedDuration = link.originalEnd - link.originalStart;
            seg.start = link.originalStart + totalDelta;
            seg.end = seg.start + linkedDuration;
        });

        return {
            hoveredTrackId,
            deltaTrackIndex
        };
    }

    static previewTrim(manager, mainSeg, deltaTime) {
        if (manager.trimEdge === 'left') {
            let newStart = manager.dragOriginalStart + deltaTime;
            newStart = manager.calculateSnap(newStart, manager.dragTargetTrackId, manager.dragTargetIndex);
            if (newStart < 0) newStart = 0;
            if (newStart > mainSeg.end - 0.2) newStart = mainSeg.end - 0.2;

            const delta = newStart - mainSeg.start;
            mainSeg.sourceStart = (mainSeg.sourceStart || 0) + delta;
            mainSeg.start = newStart;

            manager.dragLinkedSegments.forEach((link) => {
                const seg = manager.tracks[link.trackId]?.segments?.[link.index];
                if (!seg) return;

                seg.sourceStart = (seg.sourceStart || 0) + delta;
                seg.start = newStart;
            });

            return;
        }

        if (manager.trimEdge === 'right') {
            let newEnd = manager.dragOriginalEnd + deltaTime;
            newEnd = manager.calculateSnap(newEnd, manager.dragTargetTrackId, manager.dragTargetIndex);
            if (newEnd > manager.duration) newEnd = manager.duration;
            if (newEnd < mainSeg.start + 0.2) newEnd = mainSeg.start + 0.2;
            mainSeg.end = newEnd;

            manager.dragLinkedSegments.forEach((link) => {
                const seg = manager.tracks[link.trackId]?.segments?.[link.index];
                if (seg) seg.end = newEnd;
            });
        }
    }
}

window.TimelineDragPreview = TimelineDragPreview;
