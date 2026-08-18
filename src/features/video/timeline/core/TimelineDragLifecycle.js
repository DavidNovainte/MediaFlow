/**
 * TimelineDragLifecycle
 *
 * Separates drag commit/reset work from pointer-move calculations so the
 * "drop" phase can be reasoned about independently.
 */
class TimelineDragLifecycle {
    static cleanupAutoCreatedTracks(manager) {
        const createdTrackIds = Array.isArray(manager?.dragAutoCreatedTrackIds)
            ? [...manager.dragAutoCreatedTrackIds]
            : [];

        createdTrackIds.forEach((trackId) => {
            const track = manager.tracks?.[trackId];
            if (!track || (track.segments?.length || 0) > 0) {
                return;
            }

            delete manager.tracks[trackId];

            const row = document.getElementById(`track-${trackId}`);
            if (row) {
                row.remove();
            }

            if (manager.selectedTrackId === trackId) {
                manager.selectedTrackId = trackId.startsWith('a') ? 'a1' : 'v1';
                manager.selectedSegmentIndex = -1;
            }
        });
    }

    static commit(manager) {
        if (!manager || (!manager.isDraggingClip && !manager.isTrimmingClip)) {
            return false;
        }

        if (window.TimelineInteractionUtils) {
            window.TimelineInteractionUtils.normalizeTrackSegments(manager, true);
        } else {
            manager.normalizeTrackSegments(true);
        }
        this.cleanupAutoCreatedTracks(manager);
        manager.renderAll();
        manager.syncSegmentsWithApp();

        const oldSnapshot = manager.dragOldState;
        const newSnapshot = manager.captureState();

        if (oldSnapshot && JSON.stringify(oldSnapshot) !== JSON.stringify(newSnapshot)) {
            manager.app.history.push({
                execute: () => manager.applyState(newSnapshot),
                undo: () => manager.applyState(oldSnapshot)
            });
        }

        return true;
    }

    static reset(manager) {
        if (!manager) return;

        manager.isDraggingClip = false;
        manager.isTrimmingClip = false;
        manager.dragTargetTrackId = null;
        manager.dragTargetIndex = -1;
        manager.activeDragEl = null;
        manager.dragLinkedSegments = [];
        manager.dragAutoCreatedTrackIds = [];
        manager.dragAutoCreateLimit = null;
        manager.dragOriginalTrackIndex = -1;
        manager.dragOldState = null;

        if (manager.snapGuideLine) {
            manager.snapGuideLine.style.display = 'none';
        }

        if (manager.timelineBody) {
            const segments = manager.timelineBody.querySelectorAll('.timeline-segment');
            segments.forEach(seg => seg.classList.remove('dragging'));
        }
    }
}

window.TimelineDragLifecycle = TimelineDragLifecycle;
