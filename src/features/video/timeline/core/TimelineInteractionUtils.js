/**
 * TimelineInteractionUtils
 *
 * Shared interaction helpers for snap and drag-finalization housekeeping.
 */
class TimelineInteractionUtils {
    static normalizeTrackSegments(manager, preserveSelection = false) {
        let selectedSegment = null;
        if (preserveSelection && manager.selectedTrackId && manager.selectedSegmentIndex >= 0) {
            selectedSegment = manager.tracks[manager.selectedTrackId]?.segments?.[manager.selectedSegmentIndex] || null;
        }

        Object.values(manager.tracks).forEach((track) => {
            if (!Array.isArray(track.segments) || track.segments.length < 2) return;
            track.segments.sort((a, b) => {
                if (a.start !== b.start) return a.start - b.start;
                if (a.end !== b.end) return a.end - b.end;
                return (a.sourceStart || 0) - (b.sourceStart || 0);
            });
        });

        if (selectedSegment && manager.selectedTrackId && manager.tracks[manager.selectedTrackId]) {
            manager.selectedSegmentIndex = manager.tracks[manager.selectedTrackId].segments.indexOf(selectedSegment);
        }
    }

    static calculateSnap(manager, projectTime, ignoredTrackId = null, ignoredIndex = -1) {
        if (!manager.snapEnabled) return projectTime;

        const SNAP_THRESHOLD_PX = 10;
        const currentPixelsPerSecond = manager.pixelsPerSecond * (manager.zoomLevel / 100);
        const thresholdTime = SNAP_THRESHOLD_PX / currentPixelsPerSecond;

        const snapPoints = [0, manager.duration, manager.currentTime];
        Object.values(manager.tracks).forEach((track) => {
            track.segments.forEach((seg, idx) => {
                if (track.id === ignoredTrackId && idx === ignoredIndex) return;
                snapPoints.push(seg.start);
                snapPoints.push(seg.end);
            });
        });

        let bestSnap = projectTime;
        let minDiff = thresholdTime;

        snapPoints.forEach((pt) => {
            const diff = Math.abs(pt - projectTime);
            if (diff < minDiff) {
                minDiff = diff;
                bestSnap = pt;
            }
        });

        if (minDiff < thresholdTime && manager.snapGuideLine) {
            manager.snapGuideLine.style.left = `${bestSnap * currentPixelsPerSecond + 120}px`;
            manager.snapGuideLine.style.display = 'block';
        } else if (manager.snapGuideLine) {
            manager.snapGuideLine.style.display = 'none';
        }

        return bestSnap;
    }

    static finalizeDrag(manager) {
        if (window.TimelineDragLifecycle) {
            window.TimelineDragLifecycle.commit(manager);
            window.TimelineDragLifecycle.reset(manager);
            manager.renderVideoTracks();
            return;
        }

        if (manager.isDraggingClip || manager.isTrimmingClip) {
            this.normalizeTrackSegments(manager, true);
            manager.renderAll();
            manager.syncSegmentsWithApp();

            const newState = manager.captureState();
            if (JSON.stringify(manager.dragOldState) !== JSON.stringify(newState)) {
                const oldSnapshot = manager.dragOldState;
                const newSnapshot = newState;

                manager.app.history.push({
                    execute: () => manager.applyState(newSnapshot),
                    undo: () => manager.applyState(oldSnapshot)
                });
            }
        }

        manager.isDraggingClip = false;
        manager.isTrimmingClip = false;
        manager.dragTargetTrackId = null;
        manager.dragTargetIndex = -1;
        manager.activeDragEl = null;
        manager.dragLinkedSegments = [];
        manager.dragOriginalTrackIndex = -1;

        if (manager.snapGuideLine) {
            manager.snapGuideLine.style.display = 'none';
        }

        if (manager.timelineBody) {
            const segments = manager.timelineBody.querySelectorAll('.timeline-segment');
            segments.forEach((seg) => {
                seg.classList.remove('dragging', 'trimming');
            });
        }

        manager.renderVideoTracks();
    }
}

window.TimelineInteractionUtils = TimelineInteractionUtils;
