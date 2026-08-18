/**
 * TimelineTrackRegistry
 *
 * Keeps track data existence and matching DOM rows in sync.
 */
class TimelineTrackRegistry {
    static createEmptyTrack(trackId, type) {
        return {
            id: trackId,
            segments: [],
            ...(type === 'audio' ? { peaks: [], audioBuffer: null, sourceDuration: 0 } : {})
        };
    }

    static ensureTrackExists({
        trackId,
        type,
        tracks,
        isDragging,
        dragAutoCreatedTrackIds,
        onCreateDOM
    }) {
        const existingRow = document.getElementById(`track-${trackId}`);
        const trackAlreadyExists = !!tracks[trackId];

        if (!tracks[trackId]) {
            tracks[trackId] = this.createEmptyTrack(trackId, type);
        }

        if (!trackAlreadyExists && isDragging && Array.isArray(dragAutoCreatedTrackIds)) {
            if (!dragAutoCreatedTrackIds.includes(trackId)) {
                dragAutoCreatedTrackIds.push(trackId);
            }
        }

        if (!existingRow && onCreateDOM) {
            onCreateDOM(trackId, type);
        }
    }

    static ensureTrackDOM({
        trackId,
        type,
        getTrackInsertPosition,
        createTrackDOM,
        updateLabelContextMenus
    }) {
        if (document.getElementById(`track-${trackId}`)) return;

        const { relativeId, position } = getTrackInsertPosition(trackId, type);
        createTrackDOM(trackId, type, relativeId, position);
        updateLabelContextMenus?.();
    }

    static applyState({
        state,
        manager,
        cloneState,
        ensureTrackDOM,
        renderAll,
        syncSegmentsWithApp,
        updatePlayhead,
        renderVideoTracks
    }) {
        if (!state || !state.tracks || !manager) return;

        manager.tracks = cloneState(state.tracks);
        manager.trackOrder = cloneState(state.trackOrder) || manager.trackOrder || { video: ['v1'], audio: ['a1'] };
        manager.selectedTrackId = state.selectedTrackId;
        manager.selectedSegmentIndex = state.selectedSegmentIndex;
        manager.currentTime = state.currentTime;

        const trackDOMs = manager.timelineBody?.querySelectorAll('.timeline-track') || [];
        trackDOMs.forEach((el) => {
            const trackId = el.id.replace('track-', '');
            if (!trackId || trackId === 'ruler') return;
            if (!manager.tracks[trackId]) {
                el.remove();
            }
        });

        Object.keys(manager.tracks).forEach((trackId) => {
            if (!document.getElementById(`track-${trackId}`)) {
                const type = trackId.startsWith('v') ? 'video' : 'audio';
                ensureTrackDOM(trackId, type);
            }
        });

        if (window.TimelineTrackReorder) {
            window.TimelineTrackReorder.ensureState(manager);
            window.TimelineTrackReorder.applyToDOM(manager);
        }

        renderAll();
        syncSegmentsWithApp();
        updatePlayhead(manager.currentTime);
        renderVideoTracks();
    }
}

window.TimelineTrackRegistry = TimelineTrackRegistry;
