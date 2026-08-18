/**
 * TimelineStateSnapshot
 *
 * Owns timeline snapshot cloning/capture/apply so undo/redo state management
 * stays isolated from the manager's interaction logic.
 */
class TimelineStateSnapshot {
    static clone(source) {
        if (!source || typeof source !== 'object') return source;
        if (Array.isArray(source)) return source.map((item) => this.clone(item));

        if (
            source instanceof File ||
            source instanceof Blob ||
            (typeof AudioBuffer !== 'undefined' && source instanceof AudioBuffer) ||
            (source.buffer && source.buffer instanceof ArrayBuffer)
        ) {
            return source;
        }

        const target = {};
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = this.clone(source[key]);
            }
        }
        return target;
    }

    static capture(manager) {
        return {
            tracks: this.clone(manager.tracks),
            trackOrder: this.clone(manager.trackOrder),
            selectedTrackId: manager.selectedTrackId,
            selectedSegmentIndex: manager.selectedSegmentIndex,
            currentTime: manager.currentTime
        };
    }

    static apply(manager, state) {
        if (!state || !state.tracks) return;

        console.log('[Undo/Redo] Applying global state snapshot...');

        if (window.TimelineTrackRegistry) {
            window.TimelineTrackRegistry.applyState({
                state,
                manager,
                cloneState: (snapshot) => this.clone(snapshot),
                ensureTrackDOM: (trackId, type) => manager.createLinkedTrackDOM(trackId, type),
                renderAll: () => manager.renderAll(),
                syncSegmentsWithApp: () => manager.syncSegmentsWithApp(),
                updatePlayhead: (time) => manager.updatePlayhead(time),
                renderVideoTracks: () => manager.renderVideoTracks()
            });
            return;
        }

        manager.tracks = this.clone(state.tracks);
        manager.trackOrder = this.clone(state.trackOrder) || manager.trackOrder || { video: ['v1'], audio: ['a1'] };
        manager.selectedTrackId = state.selectedTrackId;
        manager.selectedSegmentIndex = state.selectedSegmentIndex;
        manager.currentTime = state.currentTime;
        if (window.TimelineTrackReorder) {
            window.TimelineTrackReorder.ensureState(manager);
            window.TimelineTrackReorder.applyToDOM(manager);
        }
        manager.renderAll();
        manager.syncSegmentsWithApp();
        manager.updatePlayhead(manager.currentTime);
        manager.renderVideoTracks();
    }
}

window.TimelineStateSnapshot = TimelineStateSnapshot;
