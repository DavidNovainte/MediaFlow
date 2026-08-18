class EditorTimelineTrimManager {
    static AUTO_SCROLL_EDGE_PX = 48;
    static AUTO_SCROLL_MAX_STEP_PX = 32;

    constructor(flow) {
        this.flow = flow;
        this.trimState = null;
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
        this.boundAutoScrollFrame = this.handleAutoScrollFrame.bind(this);
        this.snapUtils = window.EditorTimelineSnapUtils;
    }

    safeSetPointerCapture(element, pointerId) {
        if (!element?.setPointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.setPointerCapture(pointerId);
        } catch {
            // Pointer capture can fail when the browser no longer considers the pointer active.
        }
    }

    safeReleasePointerCapture(element, pointerId) {
        if (!element?.releasePointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.releasePointerCapture(pointerId);
        } catch {
            // Ignore release failures when capture was never established.
        }
    }

    matchesActivePointer(event) {
        if (!this.trimState) return false;
        if (!Number.isFinite(this.trimState.pointerId)) return true;
        if (event?.pointerId === null || event?.pointerId === undefined) return true;
        return event.pointerId === this.trimState.pointerId;
    }

    resolveTimelineBody(lane = null) {
        return this.flow?.timelineManager?.elements?.timelineBody
            || lane?.closest?.('.editor-timeline-body')
            || document.getElementById('editor-timeline-body')
            || null;
    }

    autoScrollTimelineBody(clientX) {
        const timelineBody = this.trimState?.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        const pointerX = Number(clientX);
        if (!timelineBody || !bodyRect || !Number.isFinite(pointerX)) return 0;

        const maxScrollLeft = Math.max(0, (timelineBody.scrollWidth || 0) - (timelineBody.clientWidth || 0));
        if (maxScrollLeft <= 0) return 0;

        const edgeSize = EditorTimelineTrimManager.AUTO_SCROLL_EDGE_PX;
        const maxStep = EditorTimelineTrimManager.AUTO_SCROLL_MAX_STEP_PX;
        const distanceToLeft = pointerX - (Number(bodyRect.left) || 0);
        const distanceToRight = (Number(bodyRect.right) || 0) - pointerX;
        let scrollDelta = 0;

        if (distanceToRight < edgeSize) {
            scrollDelta = ((edgeSize - Math.max(distanceToRight, 0)) / edgeSize) * maxStep;
        } else if (distanceToLeft < edgeSize) {
            scrollDelta = -((edgeSize - Math.max(distanceToLeft, 0)) / edgeSize) * maxStep;
        }

        if (Math.abs(scrollDelta) < 0.5) return 0;

        const previousScrollLeft = timelineBody.scrollLeft || 0;
        const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, previousScrollLeft + scrollDelta));
        if (Math.abs(nextScrollLeft - previousScrollLeft) < 0.5) return 0;

        timelineBody.scrollLeft = nextScrollLeft;
        this.flow.timelineViewportManager?.syncLockedGutterMask?.();
        timelineBody.style.setProperty('--editor-timeline-scroll-left', `${Math.max(0, timelineBody.scrollLeft || 0)}px`);
        return nextScrollLeft - previousScrollLeft;
    }

    isPointerNearScrollableEdge(clientX) {
        const timelineBody = this.trimState?.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        const pointerX = Number(clientX);
        if (!timelineBody || !bodyRect || !Number.isFinite(pointerX)) return false;

        const maxScrollLeft = Math.max(0, (timelineBody.scrollWidth || 0) - (timelineBody.clientWidth || 0));
        if (maxScrollLeft <= 0) return false;

        const edgeSize = EditorTimelineTrimManager.AUTO_SCROLL_EDGE_PX;
        return pointerX - (Number(bodyRect.left) || 0) < edgeSize
            || (Number(bodyRect.right) || 0) - pointerX < edgeSize;
    }

    scheduleAutoScrollLoop() {
        if (!this.trimState || this.trimState.autoScrollFrameId !== null) return;
        if (!this.isPointerNearScrollableEdge(this.trimState.lastClientX)) return;

        const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
        this.trimState.autoScrollFrameId = requestFrame(this.boundAutoScrollFrame);
    }

    cancelAutoScrollLoop() {
        const frameId = this.trimState?.autoScrollFrameId;
        if (frameId === null || frameId === undefined) return;

        const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
        cancelFrame?.(frameId);
        if (this.trimState) {
            this.trimState.autoScrollFrameId = null;
        }
    }

    updateTrimFromCurrentPointer() {
        if (!this.trimState) return;

        const { clipId, edge, laneRect, totalDuration, snapEdges, pointerStartX, pointerStartScrollLeft, edgeStartValue } = this.trimState;
        const clientX = Number(this.trimState.lastClientX);
        if (!Number.isFinite(clientX)) return;

        const pixelsPerSecond = Math.max(laneRect.width, 1) / Math.max(totalDuration, 0.1);
        const scrollDeltaX = ((this.trimState.timelineBody?.scrollLeft || 0) - (pointerStartScrollLeft || 0));
        const deltaSeconds = ((clientX - pointerStartX) + scrollDeltaX) / pixelsPerSecond;
        const rawTimelineValue = Math.max(edgeStartValue + deltaSeconds, 0);
        const snapEnabled = this.flow.store.getState?.().timelineSnapEnabled !== false;
        const timelineValue = snapEnabled
            ? (this.snapUtils?.snapValue?.(rawTimelineValue, snapEdges) ?? rawTimelineValue)
            : Number(rawTimelineValue.toFixed(3));
        this.flow.store.trimClipEdge(clipId, edge, timelineValue);
    }

    handleAutoScrollFrame() {
        if (!this.trimState) return;
        this.trimState.autoScrollFrameId = null;

        const scrollDelta = this.autoScrollTimelineBody(this.trimState.lastClientX);
        if (Math.abs(scrollDelta) >= 0.5) {
            this.updateTrimFromCurrentPointer();
        }

        this.scheduleAutoScrollLoop();
    }

    attachHandle(handle, clip, totalDuration, edge) {
        if (!handle || !clip || !edge) return;

        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            const match = this.flow.store.findClipById(clip.id);
            if (match?.trackName && this.flow.store.isTrackLocked(match.trackName)) return;

            const lane = handle.closest('.editor-track-lane');
            if (!lane) return;

            event.stopPropagation();
            this.flow.store.beginHistoryTransaction?.();
            const timelineBody = this.resolveTimelineBody(lane);

            this.trimState = {
                clipId: clip.id,
                edge,
                laneRect: lane.getBoundingClientRect(),
                totalDuration: Math.max(totalDuration, 0.1),
                handle,
                pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
                pointerStartX: event.clientX,
                pointerStartScrollLeft: timelineBody?.scrollLeft || 0,
                lastClientX: event.clientX,
                edgeStartValue: edge === 'start'
                    ? Number(match?.clip?.timelineStart) || 0
                    : Number(match?.clip?.timelineEnd) || ((Number(match?.clip?.timelineStart) || 0) + (Number(match?.clip?.duration) || 0)),
                snapEdges: this.snapUtils?.getTrackEdges?.(this.flow, clip.id) || [],
                autoScrollFrameId: null,
                timelineBody
            };

            this.safeSetPointerCapture(handle, event.pointerId);
            document.addEventListener('pointermove', this.boundPointerMove);
            document.addEventListener('pointerup', this.boundPointerUp);
        });
    }

    handlePointerMove(event) {
        if (!this.trimState) return;
        if (!this.matchesActivePointer(event)) return;
        this.trimState.lastClientX = event.clientX;

        this.autoScrollTimelineBody(event.clientX);
        this.updateTrimFromCurrentPointer();
        this.scheduleAutoScrollLoop();
    }

    handlePointerUp(event) {
        if (!this.trimState) return;
        if (!this.matchesActivePointer(event)) return;
        this.cleanup();
    }

    cleanup() {
        document.removeEventListener('pointermove', this.boundPointerMove);
        document.removeEventListener('pointerup', this.boundPointerUp);
        this.cancelAutoScrollLoop();
        this.safeReleasePointerCapture(this.trimState?.handle, this.trimState?.pointerId);
        this.trimState = null;
        this.flow.store.endHistoryTransaction?.();
    }
}

window.EditorTimelineTrimManager = EditorTimelineTrimManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineTrimManager;
}
