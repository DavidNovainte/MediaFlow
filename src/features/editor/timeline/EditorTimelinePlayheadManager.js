class EditorTimelinePlayheadManager {
    constructor(flow) {
        this.flow = flow;
        this.dragState = null;
        this.totalDuration = 0.1;
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
    }

    measureTarget(element) {
        const rect = element?.getBoundingClientRect?.() || { left: 0, width: 0 };
        const contentWidth = Math.max(
            element?.clientWidth || 0,
            element?.offsetWidth || 0,
            rect.width || 0,
            1
        );

        return {
            left: Number(rect.left) || 0,
            contentWidth
        };
    }

    safeSetPointerCapture(element, pointerId) {
        if (!element?.setPointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.setPointerCapture(pointerId);
        } catch {
            // Some browsers report InvalidStateError for non-active pointers on simple clicks.
        }
    }

    safeReleasePointerCapture(element, pointerId) {
        if (!element?.releasePointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.releasePointerCapture(pointerId);
        } catch {
            // Ignore capture release failures when capture was never established.
        }
    }

    matchesActivePointer(event) {
        if (!this.dragState) return false;
        if (!Number.isFinite(this.dragState.pointerId)) return true;
        return event.pointerId === this.dragState.pointerId;
    }

    attachTarget(element, totalDuration) {
        this.totalDuration = Math.max(Number(totalDuration) || 0, 0.1);
        if (!element) return;
        if (element.dataset.playheadBound === 'true') return;
        element.dataset.playheadBound = 'true';

        element.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (this.flow.timelineSelectionManager?.shouldStartSelection?.(event)) return;
            const target = event.target;
            const onClip = target?.closest?.('.editor-clip');
            const onClipHandle = target?.closest?.('.editor-clip-handle');
            const onTrackControl = target?.closest?.('.editor-track-label-btn');
            if (onClip || onClipHandle || onTrackControl) return;

            this.dragState = {
                element,
                totalDuration: this.totalDuration,
                pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
                metrics: this.measureTarget(element)
            };
            this.updatePlayheadFromEvent(event);
            this.safeSetPointerCapture(element, event.pointerId);
            document.addEventListener('pointermove', this.boundPointerMove);
            document.addEventListener('pointerup', this.boundPointerUp);
            event.preventDefault();
        });
    }

    updateDuration(totalDuration) {
        this.totalDuration = Math.max(Number(totalDuration) || 0, 0.1);
        if (this.dragState) {
            this.dragState.totalDuration = this.totalDuration;
        }
    }

    getTimelineCoordinate(event) {
        if (!this.dragState?.element) return 0;

        const metrics = this.dragState.metrics || this.measureTarget(this.dragState.element);

        return Math.min(Math.max(event.clientX - metrics.left, 0), metrics.contentWidth);
    }

    updatePlayheadFromEvent(event) {
        if (!this.dragState?.element) return;

        const metrics = this.dragState.metrics || this.measureTarget(this.dragState.element);
        const relativeX = this.getTimelineCoordinate(event);
        const timelineTime = (relativeX / metrics.contentWidth) * this.dragState.totalDuration;
        this.flow.store.setPlayheadTime(timelineTime);
    }

    handlePointerMove(event) {
        if (!this.dragState || !this.matchesActivePointer(event)) return;
        this.updatePlayheadFromEvent(event);
    }

    handlePointerUp(event) {
        if (!this.dragState || !this.matchesActivePointer(event)) return;
        document.removeEventListener('pointermove', this.boundPointerMove);
        document.removeEventListener('pointerup', this.boundPointerUp);
        this.safeReleasePointerCapture(this.dragState.element, this.dragState.pointerId);
        this.dragState = null;
    }
}

window.EditorTimelinePlayheadManager = EditorTimelinePlayheadManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelinePlayheadManager;
}
