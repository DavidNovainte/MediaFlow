class EditorTimelineSelectionManager {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.dragState = null;
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
    }

    init() {
        this.elements = {
            timelineBody: document.getElementById('editor-timeline-body')
        };

        this.elements.timelineBody?.addEventListener('pointerdown', (event) => {
            if (!this.shouldStartSelection(event)) return;

            const containerRect = this.elements.timelineBody.getBoundingClientRect();
            const startX = event.clientX - containerRect.left + this.elements.timelineBody.scrollLeft;
            const startY = event.clientY - containerRect.top + this.elements.timelineBody.scrollTop;

            this.dragState = {
                pointerId: event.pointerId,
                anchorX: startX,
                anchorY: startY,
                currentX: startX,
                currentY: startY,
                additive: !!(event.ctrlKey || event.metaKey),
                baseSelection: [...(this.flow.store.getState().selectedClipIds || [])]
            };

            this.ensureMarquee();
            this.updateMarquee();
            this.safeSetPointerCapture(this.elements.timelineBody, event.pointerId);
            document.addEventListener('pointermove', this.boundPointerMove);
            document.addEventListener('pointerup', this.boundPointerUp);
            event.preventDefault();
        });
    }

    safeSetPointerCapture(element, pointerId) {
        if (!element?.setPointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.setPointerCapture(pointerId);
        } catch {
            // Pointer capture can fail for stale or synthetic pointer events.
        }
    }

    safeReleasePointerCapture(element, pointerId) {
        if (!element?.releasePointerCapture || !Number.isFinite(pointerId)) return;
        try {
            element.releasePointerCapture(pointerId);
        } catch {
            // Ignore release failures when capture was not established.
        }
    }

    matchesActivePointer(event) {
        if (!this.dragState) return false;
        if (!Number.isFinite(this.dragState.pointerId)) return true;
        if (event?.pointerId === null || event?.pointerId === undefined) return true;
        return event.pointerId === this.dragState.pointerId;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    shouldStartSelection(event) {
        if (event.button !== 0 || !event.shiftKey) return false;
        const target = event.target;
        if (this.closest(target, '.editor-clip')) return false;
        if (this.closest(target, '.editor-clip-handle')) return false;
        if (this.closest(target, '.editor-track-label')) return false;
        if (this.closest(target, '.editor-timeline-actions')) return false;
        if (this.closest(target, '.editor-timeline-ruler')) return false;
        return !!this.closest(target, '.editor-track-lane, .editor-track-empty, .editor-timeline-body');
    }

    ensureMarquee() {
        if (this.elements.marquee?.isConnected) return;
        const marquee = document.createElement('div');
        marquee.className = 'editor-selection-marquee hidden';
        this.elements.timelineBody?.appendChild(marquee);
        this.elements.marquee = marquee;
    }

    updateMarquee() {
        if (!this.dragState || !this.elements.marquee) return;

        const left = Math.min(this.dragState.anchorX, this.dragState.currentX);
        const top = Math.min(this.dragState.anchorY, this.dragState.currentY);
        const width = Math.abs(this.dragState.currentX - this.dragState.anchorX);
        const height = Math.abs(this.dragState.currentY - this.dragState.anchorY);

        this.elements.marquee.classList.remove('hidden');
        this.elements.marquee.style.left = `${left}px`;
        this.elements.marquee.style.top = `${top}px`;
        this.elements.marquee.style.width = `${Math.max(width, 1)}px`;
        this.elements.marquee.style.height = `${Math.max(height, 1)}px`;
    }

    getIntersectingClipIds() {
        if (!this.dragState || !this.elements.timelineBody) return [];

        const containerRect = this.elements.timelineBody.getBoundingClientRect();
        const selectionLeft = Math.min(this.dragState.anchorX, this.dragState.currentX) - this.elements.timelineBody.scrollLeft;
        const selectionTop = Math.min(this.dragState.anchorY, this.dragState.currentY) - this.elements.timelineBody.scrollTop;
        const selectionRight = Math.max(this.dragState.anchorX, this.dragState.currentX) - this.elements.timelineBody.scrollLeft;
        const selectionBottom = Math.max(this.dragState.anchorY, this.dragState.currentY) - this.elements.timelineBody.scrollTop;

        return [...this.elements.timelineBody.querySelectorAll('.editor-clip[data-clip-id]')]
            .filter((clipElement) => {
                const rect = clipElement.getBoundingClientRect();
                const left = rect.left - containerRect.left;
                const right = rect.right - containerRect.left;
                const top = rect.top - containerRect.top;
                const bottom = rect.bottom - containerRect.top;

                return !(right < selectionLeft || left > selectionRight || bottom < selectionTop || top > selectionBottom);
            })
            .map((clipElement) => clipElement.dataset.clipId)
            .filter(Boolean);
    }

    handlePointerMove(event) {
        if (!this.dragState || !this.elements.timelineBody) return;
        if (!this.matchesActivePointer(event)) return;

        const containerRect = this.elements.timelineBody.getBoundingClientRect();
        this.dragState.currentX = event.clientX - containerRect.left + this.elements.timelineBody.scrollLeft;
        this.dragState.currentY = event.clientY - containerRect.top + this.elements.timelineBody.scrollTop;
        this.updateMarquee();

        const intersectingClipIds = this.getIntersectingClipIds();
        const nextSelection = this.dragState.additive
            ? [...new Set([...this.dragState.baseSelection, ...intersectingClipIds])]
            : intersectingClipIds;
        const primaryClipId = intersectingClipIds[intersectingClipIds.length - 1] || nextSelection[nextSelection.length - 1] || null;
        this.flow.store.setSelectedClips(nextSelection, primaryClipId);
    }

    handlePointerUp(event) {
        if (!this.dragState) return;
        if (!this.matchesActivePointer(event)) return;

        document.removeEventListener('pointermove', this.boundPointerMove);
        document.removeEventListener('pointerup', this.boundPointerUp);
        this.safeReleasePointerCapture(this.elements.timelineBody, this.dragState.pointerId);
        if (this.elements.marquee) {
            this.elements.marquee.classList.add('hidden');
            this.elements.marquee.style.width = '0px';
            this.elements.marquee.style.height = '0px';
        }
        this.dragState = null;
    }
}

window.EditorTimelineSelectionManager = EditorTimelineSelectionManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineSelectionManager;
}
