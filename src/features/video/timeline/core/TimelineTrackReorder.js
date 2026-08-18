/**
 * TimelineTrackReorder
 *
 * Owns manual track ordering and drag-to-reorder interactions for timeline rows.
 */
class TimelineTrackReorder {
    static ensureState(manager) {
        if (!manager.trackOrder) {
            manager.trackOrder = { video: [], audio: [] };
        }

        ['video', 'audio'].forEach((type) => {
            const prefix = type === 'video' ? 'v' : 'a';
            const current = Array.isArray(manager.trackOrder[type]) ? manager.trackOrder[type] : [];
            const existingIds = Object.keys(manager.tracks || {})
                .filter((trackId) => trackId.startsWith(prefix))
                .sort((a, b) => manager.parseTrackNumber(a) - manager.parseTrackNumber(b));

            const filtered = current.filter((trackId) => existingIds.includes(trackId));
            existingIds.forEach((trackId) => {
                if (!filtered.includes(trackId)) {
                    filtered.push(trackId);
                }
            });

            manager.trackOrder[type] = filtered;
        });
    }

    static registerTrack(manager, trackId, type, relativeId = null, position = null) {
        this.ensureState(manager);
        const list = manager.trackOrder[type];
        if (list.includes(trackId)) return;

        const relativeIndex = relativeId ? list.indexOf(relativeId) : -1;
        if (relativeIndex >= 0) {
            const insertIndex = position === 'above' ? relativeIndex : relativeIndex + 1;
            list.splice(insertIndex, 0, trackId);
            return;
        }

        list.push(trackId);
    }

    static unregisterTrack(manager, trackId) {
        this.ensureState(manager);
        ['video', 'audio'].forEach((type) => {
            manager.trackOrder[type] = manager.trackOrder[type].filter((id) => id !== trackId);
        });
    }

    static applyToDOM(manager) {
        this.ensureState(manager);

        const body = manager.timelineBody;
        if (!body) return;

        const orderedRows = [
            ...manager.trackOrder.video,
            ...manager.trackOrder.audio
        ]
            .map((trackId) => document.getElementById(`track-${trackId}`))
            .filter(Boolean);

        orderedRows.forEach((row) => body.appendChild(row));
        manager.updateLabelContextMenus?.();
    }

    static moveTrack(manager, trackId, targetId, placement = 'before') {
        if (!trackId || !targetId || trackId === targetId) return false;

        this.ensureState(manager);

        const type = trackId.startsWith('v') ? 'video' : 'audio';
        if ((targetId.startsWith('v') ? 'video' : 'audio') !== type) return false;

        const list = [...manager.trackOrder[type]];
        const fromIndex = list.indexOf(trackId);
        const targetIndex = list.indexOf(targetId);
        if (fromIndex < 0 || targetIndex < 0) return false;

        list.splice(fromIndex, 1);
        const adjustedTargetIndex = list.indexOf(targetId);
        const insertIndex = placement === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;
        list.splice(insertIndex, 0, trackId);

        manager.trackOrder[type] = list;
        this.applyToDOM(manager);
        manager.renderAll();
        return true;
    }

    static bindLabel(manager, label) {
        const trackRow = label?.closest('.timeline-track');
        const trackId = trackRow?.id?.replace('track-', '');
        if (!trackId || trackRow?.classList.contains('ruler-track')) return;

        const type = trackId.startsWith('v') ? 'video' : 'audio';
        label.draggable = true;

        label.ondragstart = (e) => {
            this.ensureState(manager);
            manager.trackDragState = { trackId, type };
            trackRow.classList.add('track-row-dragging');
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', trackId);
            } catch (error) {
                void error;
            }
        };

        label.ondragover = (e) => {
            const dragState = manager.trackDragState;
            if (!dragState || dragState.type !== type || dragState.trackId === trackId) return;
            e.preventDefault();
            label.classList.add('track-row-drop-target');
        };

        label.ondragleave = () => {
            label.classList.remove('track-row-drop-target');
        };

        label.ondrop = (e) => {
            const dragState = manager.trackDragState;
            label.classList.remove('track-row-drop-target');
            if (!dragState || dragState.type !== type || dragState.trackId === trackId) return;

            e.preventDefault();
            const oldState = manager.captureState();
            const rect = label.getBoundingClientRect();
            const placement = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
            const moved = this.moveTrack(manager, dragState.trackId, trackId, placement);
            if (!moved) return;

            const newState = manager.captureState();
            manager.app.history.push({
                execute: () => manager.applyState(newState),
                undo: () => manager.applyState(oldState)
            });
        };

        label.ondragend = () => {
            manager.trackDragState = null;
            document.querySelectorAll('.track-row-drop-target, .track-row-dragging').forEach((el) => {
                el.classList.remove('track-row-drop-target', 'track-row-dragging');
            });
        };
    }
}

window.TimelineTrackReorder = TimelineTrackReorder;
