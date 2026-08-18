class EditorTimelineDragManager {
    static DRAG_START_THRESHOLD_PX = 3;
    static AUTO_SCROLL_EDGE_PX = 48;
    static AUTO_SCROLL_MAX_STEP_PX = 32;

    constructor(flow) {
        this.flow = flow;
        this.dragState = null;
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
            // Some click sequences report InvalidStateError for non-active pointers.
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
        if (!this.dragState) return false;
        if (!Number.isFinite(this.dragState.pointerId)) return true;
        if (event?.pointerId === null || event?.pointerId === undefined) return true;
        return event.pointerId === this.dragState.pointerId;
    }

    resolveTimelineBody(lane = null) {
        return this.flow?.timelineManager?.elements?.timelineBody
            || lane?.closest?.('.editor-timeline-body')
            || document.getElementById('editor-timeline-body')
            || null;
    }

    setDragUiState(target, options = {}) {
        if (!target?.classList) return;

        const isDragging = options.dragging !== false;
        const isCopyDrag = options.copyDrag === true;
        target.classList.toggle('is-dragging-clips', isDragging);
        target.classList.toggle('is-copy-dragging', isDragging && isCopyDrag);
    }

    getLaneSelector(trackId) {
        if (!trackId) return '';
        return `.editor-track-lane[data-track-id="${String(trackId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    }

    getLaneByTrackId(trackId) {
        const selector = this.getLaneSelector(trackId);
        return selector ? document.querySelector(selector) : null;
    }

    getClipElement(clipId) {
        if (!clipId) return null;
        return document.querySelector(`.editor-clip[data-clip-id="${String(clipId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]:not(.editor-drag-preview-clone)`);
    }

    ensurePreviewLayer() {
        if (!this.dragState) return null;
        if (this.dragState.previewLayer?.isConnected) {
            return this.dragState.previewLayer;
        }

        const timelineBody = this.dragState.timelineBody || this.resolveTimelineBody();
        if (!timelineBody) return null;

        const layer = document.createElement('div');
        layer.className = 'editor-drag-preview-layer';
        timelineBody.appendChild(layer);
        this.dragState.previewLayer = layer;
        return layer;
    }

    ensurePreviewClone(clipId, block) {
        if (!this.dragState || !clipId || !block) return null;
        if (!this.dragState.previewClones) {
            this.dragState.previewClones = new Map();
        }
        if (this.dragState.previewClones.has(clipId)) {
            return this.dragState.previewClones.get(clipId);
        }

        const layer = this.ensurePreviewLayer();
        if (!layer) return null;

        const clone = block.cloneNode(true);
        clone.classList.add('editor-drag-preview-clone', 'is-drag-preview');
        clone.classList.remove('is-selected', 'is-primary-selected', 'is-track-locked');
        clone.removeAttribute('data-clip-id');
        clone.style.pointerEvents = 'none';
        clone.style.position = 'absolute';
        clone.style.top = '0px';
        clone.style.bottom = 'auto';
        clone.style.margin = '0';
        clone.style.zIndex = '12';
        layer.appendChild(clone);
        this.dragState.previewClones.set(clipId, clone);
        return clone;
    }

    markSourceBlockHidden(block) {
        if (!block?.classList || !this.dragState) return;
        block.classList.add('is-drag-source-hidden');
        if (!this.dragState.hiddenSourceBlocks) {
            this.dragState.hiddenSourceBlocks = new Set();
        }
        this.dragState.hiddenSourceBlocks.add(block);
    }

    clearHiddenSourceBlocks() {
        if (!this.dragState?.hiddenSourceBlocks?.size) return;
        this.dragState.hiddenSourceBlocks.forEach((block) => {
            block?.classList?.remove('is-drag-source-hidden');
        });
        this.dragState.hiddenSourceBlocks.clear();
    }

    clearDropTargetPreview() {
        const previewLane = this.dragState?.previewLane;
        if (!previewLane) return;
        previewLane.classList.remove('is-drop-target');
        previewLane.classList.remove('is-snap-active');
        previewLane.style.removeProperty('--editor-drop-x');
        if (this.dragState) {
            this.dragState.previewLane = null;
        }
    }

    clearDragPreview() {
        if (!this.dragState?.draggedClipIds?.length) {
            this.clearDropTargetPreview();
            return;
        }

        this.dragState.draggedClipIds.forEach((clipId) => {
            const block = this.getClipElement(clipId);
            if (!block) return;
            block.classList.remove('is-drag-preview');
            block.style.removeProperty('transform');
            block.style.removeProperty('z-index');
        });

        this.dragState?.previewClones?.forEach((clone) => clone?.remove?.());
        this.dragState?.previewClones?.clear?.();
        this.dragState?.previewLayer?.remove?.();
        if (this.dragState) {
            this.dragState.previewLayer = null;
        }

        this.clearHiddenSourceBlocks();
        this.clearDropTargetPreview();
    }

    updateDropTargetPreview(lane, targetStart = 0, options = {}) {
        if (!lane) {
            this.clearDropTargetPreview();
            return;
        }

        if (this.dragState?.previewLane && this.dragState.previewLane !== lane) {
            this.dragState.previewLane.classList.remove('is-drop-target');
            this.dragState.previewLane.classList.remove('is-snap-active');
            this.dragState.previewLane.style.removeProperty('--editor-drop-x');
        }

        const percent = Math.max(0, Math.min(100, ((Number(targetStart) || 0) / Math.max(this.dragState?.totalDuration || 0, 0.1)) * 100));
        lane.classList.add('is-drop-target');
        lane.classList.toggle('is-snap-active', options.snapped === true);
        lane.style.setProperty('--editor-drop-x', `${percent}%`);
        if (this.dragState) {
            this.dragState.previewLane = lane;
        }
    }

    resolvePreviewTrackId(match, targetTrackId) {
        if (!match?.trackName || !targetTrackId || !this.dragState) return match?.trackName || null;
        if (match.trackName === this.dragState.anchorTrackId) return targetTrackId;
        if (this.dragState.anchorLinkGroupId && match.clip?.linkGroupId === this.dragState.anchorLinkGroupId) {
            return this.flow.store._resolveRelativeTrackId?.(
                this.dragState.anchorTrackId,
                targetTrackId,
                match.trackName,
                { createMissing: false }
            ) || match.trackName;
        }
        return match.trackName;
    }

    resolvePreviewTranslateX(match, targetStart, pixelsPerSecond) {
        if (!this.dragState) return 0;

        const currentStart = Number(match?.clip?.timelineStart) || 0;
        const resolvedTargetStart = Number(targetStart) || 0;

        if (this.dragState.anchorLinkGroupId && match?.clip?.linkGroupId === this.dragState.anchorLinkGroupId) {
            return (resolvedTargetStart - currentStart) * pixelsPerSecond;
        }

        return (resolvedTargetStart - (Number(this.dragState.clipStart) || 0)) * pixelsPerSecond;
    }

    resolvePreviewTargetStart(match, targetStart = 0) {
        if (!this.dragState) return Number(targetStart) || 0;

        const resolvedTargetStart = Number(targetStart) || 0;
        if (this.dragState.anchorLinkGroupId && match?.clip?.linkGroupId === this.dragState.anchorLinkGroupId) {
            return resolvedTargetStart;
        }

        const currentStart = Number(match?.clip?.timelineStart) || 0;
        return Number((currentStart + (resolvedTargetStart - (Number(this.dragState.clipStart) || 0))).toFixed(3));
    }

    resolvePreviewMetrics(block, currentLane, previewLane, match, targetStart) {
        const timelineBody = this.dragState?.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        const blockRect = block?.getBoundingClientRect?.();
        const currentLaneRect = currentLane?.getBoundingClientRect?.();
        const previewLaneRect = previewLane?.getBoundingClientRect?.() || currentLaneRect;
        const scrollLeft = timelineBody?.scrollLeft || 0;
        const scrollTop = timelineBody?.scrollTop || 0;
        const safeDuration = Math.max(this.dragState?.totalDuration || 0.1, 0.1);
        const previewStart = this.resolvePreviewTargetStart(match, targetStart);

        const currentLeft = (blockRect?.left || 0) - (bodyRect?.left || 0) + scrollLeft;
        const currentTop = (blockRect?.top || 0) - (bodyRect?.top || 0) + scrollTop;
        const laneTopOffset = Math.max((blockRect?.top || 0) - (currentLaneRect?.top || 0), 0);
        const previewLeft = ((previewLaneRect?.left || 0) - (bodyRect?.left || 0) + scrollLeft)
            + ((previewStart / safeDuration) * Math.max(previewLaneRect?.width || currentLaneRect?.width || 1, 1));
        const previewTop = ((previewLaneRect?.top || 0) - (bodyRect?.top || 0) + scrollTop) + laneTopOffset;

        return {
            currentLeft,
            currentTop,
            previewLeft: Number(previewLeft.toFixed(3)),
            previewTop: Number(previewTop.toFixed(3)),
            width: Math.max(blockRect?.width || block?.offsetWidth || 48, 1),
            height: Math.max(blockRect?.height || block?.offsetHeight || 1, 1)
        };
    }

    applyDragPreview(targetTrackId, targetStart = 0, options = {}) {
        if (!this.dragState?.draggedClipIds?.length) return;

        const targetLane = this.getLaneByTrackId(targetTrackId) || this.dragState.activeLane || null;
        this.updateDropTargetPreview(targetLane, targetStart, options);

        this.dragState.draggedClipIds.forEach((clipId) => {
            const block = this.getClipElement(clipId);
            const match = this.flow.store.findClipById?.(clipId);
            if (!block || !match) return;

            const currentLane = block.closest('.editor-track-lane');
            const previewTrackId = this.resolvePreviewTrackId(match, targetTrackId);
            const previewLane = this.getLaneByTrackId(previewTrackId) || currentLane;
            const clone = this.ensurePreviewClone(clipId, block);
            const metrics = this.resolvePreviewMetrics(block, currentLane, previewLane, match, targetStart);
            if (!clone) return;

            this.markSourceBlockHidden(block);
            clone.style.left = `${metrics.currentLeft}px`;
            clone.style.top = `${metrics.currentTop}px`;
            clone.style.width = `${metrics.width}px`;
            clone.style.height = `${metrics.height}px`;
            clone.style.transform = `translate(${metrics.previewLeft - metrics.currentLeft}px, ${metrics.previewTop - metrics.currentTop}px)`;
        });
    }

    isReusableBoundaryTrack(trackId, trackType) {
        if (!trackId || this.flow.store.getTrackType?.(trackId) !== trackType) return false;
        if (this.flow.store.isTrackLocked?.(trackId)) return false;
        return (this.flow.store.getTrack?.(trackId) || []).length === 0;
    }

    maybeCreateBoundaryTrack(clientX, clientY) {
        if (!this.dragState || this.dragState.autoCreatedBoundaryTrackId) return null;

        const anchorTrackType = this.flow.store.getTrackType?.(this.dragState.anchorTrackId);
        if (!anchorTrackType) return null;

        const timelineBody = this.dragState.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        if (!bodyRect || clientX < bodyRect.left || clientX > bodyRect.right) return null;

        const lanes = [...document.querySelectorAll(`.editor-track-lane[data-track-type="${anchorTrackType}"]`)]
            .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
        if (!lanes.length) return null;

        const topLane = lanes[0];
        const bottomLane = lanes[lanes.length - 1];
        const topRect = topLane.getBoundingClientRect();
        const bottomRect = bottomLane.getBoundingClientRect();

        let referenceTrackId = null;
        let position = null;
        if (clientY < topRect.top - 16) {
            referenceTrackId = topLane.dataset.trackId;
            position = 'above';
        } else if (clientY > bottomRect.bottom + 16) {
            referenceTrackId = bottomLane.dataset.trackId;
            position = 'below';
        }

        if (!referenceTrackId || !position) return null;

        const boundaryTrackId = position === 'above' ? topLane.dataset.trackId : bottomLane.dataset.trackId;
        if (this.isReusableBoundaryTrack(boundaryTrackId, anchorTrackType)) {
            this.dragState.targetTrackId = boundaryTrackId;
            return this.getLaneByTrackId(boundaryTrackId) || null;
        }

        const createdTrackId = this.flow.store.createTrackAdjacent?.(referenceTrackId, position, '', { select: false }) || null;
        if (!createdTrackId) return null;

        this.dragState.autoCreatedBoundaryTrackId = createdTrackId;
        this.dragState.targetTrackId = createdTrackId;
        return this.getLaneByTrackId(createdTrackId) || null;
    }

    maybeCreateLeadingTrack(clientX, clientY) {
        return this.maybeCreateBoundaryTrack(clientX, clientY);
    }

    autoScrollTimelineBody(clientX) {
        const timelineBody = this.dragState?.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        const pointerX = Number(clientX);
        if (!timelineBody || !bodyRect || !Number.isFinite(pointerX)) return 0;

        const maxScrollLeft = Math.max(0, (timelineBody.scrollWidth || 0) - (timelineBody.clientWidth || 0));
        if (maxScrollLeft <= 0) return 0;

        const edgeSize = EditorTimelineDragManager.AUTO_SCROLL_EDGE_PX;
        const maxStep = EditorTimelineDragManager.AUTO_SCROLL_MAX_STEP_PX;
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
        const timelineBody = this.dragState?.timelineBody || this.resolveTimelineBody();
        const bodyRect = timelineBody?.getBoundingClientRect?.();
        const pointerX = Number(clientX);
        if (!timelineBody || !bodyRect || !Number.isFinite(pointerX)) return false;

        const maxScrollLeft = Math.max(0, (timelineBody.scrollWidth || 0) - (timelineBody.clientWidth || 0));
        if (maxScrollLeft <= 0) return false;

        const edgeSize = EditorTimelineDragManager.AUTO_SCROLL_EDGE_PX;
        return pointerX - (Number(bodyRect.left) || 0) < edgeSize
            || (Number(bodyRect.right) || 0) - pointerX < edgeSize;
    }

    scheduleAutoScrollLoop() {
        if (!this.dragState || this.dragState.autoScrollFrameId !== null) return;
        if (!this.isPointerNearScrollableEdge(this.dragState.lastClientX)) return;

        const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
        this.dragState.autoScrollFrameId = requestFrame(this.boundAutoScrollFrame);
    }

    cancelAutoScrollLoop() {
        const frameId = this.dragState?.autoScrollFrameId;
        if (frameId === null || frameId === undefined) return;

        const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
        cancelFrame?.(frameId);
        if (this.dragState) {
            this.dragState.autoScrollFrameId = null;
        }
    }

    updateDragPreviewFromCurrentPointer() {
        if (!this.dragState?.hasStartedDrag) return;

        const { laneRect, totalDuration, snapEdges, pointerStartX, clipStart, targetTrackId } = this.dragState;
        const clientX = Number(this.dragState.lastClientX);
        if (!Number.isFinite(clientX)) return;

        const pixelsPerSecond = Math.max(laneRect?.width || 1, 1) / Math.max(totalDuration, 0.1);
        const scrollDeltaX = ((this.dragState.timelineBody?.scrollLeft || 0) - (this.dragState.pointerStartScrollLeft || 0));
        const deltaSeconds = ((clientX - pointerStartX) + scrollDeltaX) / pixelsPerSecond;
        const rawTargetStart = Math.max(clipStart + deltaSeconds, 0);
        const snapEnabled = this.flow.store.getState?.().timelineSnapEnabled !== false;
        const snappedTargetStart = snapEnabled
            ? (this.snapUtils?.snapValue?.(rawTargetStart, snapEdges) ?? rawTargetStart)
            : Number(rawTargetStart.toFixed(3));
        const snapped = snapEnabled && Math.abs(snappedTargetStart - rawTargetStart) > 0.001;
        const targetStart = snapEnabled ? snappedTargetStart : Number(rawTargetStart.toFixed(3));

        this.dragState.pendingTargetStart = targetStart;
        this.applyDragPreview(targetTrackId, targetStart, { snapped });
    }

    handleAutoScrollFrame() {
        if (!this.dragState) return;
        this.dragState.autoScrollFrameId = null;

        const scrollDelta = this.autoScrollTimelineBody(this.dragState.lastClientX);
        if (Math.abs(scrollDelta) >= 0.5) {
            this.updateDragPreviewFromCurrentPointer();
        }

        this.scheduleAutoScrollLoop();
    }

    resolveLaneUnderPointer(clientX, clientY, fallbackLane = null) {
        const pointedElement = document.elementFromPoint?.(clientX, clientY);
        const resolvedLane = pointedElement?.closest?.('.editor-track-lane');
        return resolvedLane || fallbackLane || null;
    }

    attachClip(block, clip, totalDuration) {
        if (!block || !clip) return;

        block.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (event.target?.closest?.('.editor-clip-handle')) return;
            const match = this.flow.store.findClipById(clip.id);
            if (match?.trackName && this.flow.store.isTrackLocked(match.trackName)) return;

            const lane = block.closest('.editor-track-lane');
            if (!lane) return;

            const currentSelection = this.flow.store.getState().selectedClipIds || [];
            const requestedClipIds = currentSelection.includes(clip.id) && currentSelection.length > 1
                ? currentSelection
                : [clip.id];
            const draggedClipIds = this.flow.store.getDraggedClipIds?.(clip.id, requestedClipIds) || requestedClipIds;
            const dragBlockedByLockedTrack = draggedClipIds.some((draggedClipId) => {
                const draggedMatch = this.flow.store.findClipById?.(draggedClipId);
                return !!draggedMatch?.trackName && !!this.flow.store.isTrackLocked?.(draggedMatch.trackName);
            });
            const isCopyDrag = !!event.altKey;

            const timelineBody = this.resolveTimelineBody(lane);
            this.setDragUiState(timelineBody, { dragging: true, copyDrag: isCopyDrag });

            this.dragState = {
                block,
                clipId: clip.id,
                additiveSelection: !!(event.ctrlKey || event.metaKey),
                anchorTrackId: match?.trackName || lane.dataset.trackId || null,
                anchorLinkGroupId: match?.clip?.linkGroupId || null,
                activeLane: lane,
                laneRect: lane.getBoundingClientRect(),
                totalDuration: Math.max(totalDuration, 0.1),
                pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
                pointerStartX: event.clientX,
                pointerStartY: event.clientY,
                pointerStartScrollLeft: timelineBody?.scrollLeft || 0,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
                clipStart: Number(match?.clip?.timelineStart) || 0,
                draggedClipIds,
                dragBlockedByLockedTrack,
                isCopyDrag,
                hasStartedDrag: false,
                transactionStarted: false,
                autoScrollFrameId: null,
                timelineBody,
                previewLane: null,
                previewLayer: null,
                previewClones: new Map(),
                hiddenSourceBlocks: new Set(),
                targetTrackId: match?.trackName || lane.dataset.trackId || null,
                pendingTargetStart: Number(match?.clip?.timelineStart) || 0,
                snapEdges: this.snapUtils?.getTrackEdges?.(
                    this.flow,
                    clip.id,
                    draggedClipIds.filter((selectedId) => selectedId !== clip.id),
                    match?.trackName || lane.dataset.trackId || null
                ) || []
            };

            this.safeSetPointerCapture(block, event.pointerId);
            document.addEventListener('pointermove', this.boundPointerMove);
            document.addEventListener('pointerup', this.boundPointerUp);
        });
    }

    handlePointerMove(event) {
        if (!this.dragState) return;
        if (!this.matchesActivePointer(event)) return;
        this.dragState.lastClientX = event.clientX;
        this.dragState.lastClientY = event.clientY;

        if (!this.dragState.hasStartedDrag) {
            const pointerDeltaX = (Number(event.clientX) || 0) - (this.dragState.pointerStartX || 0);
            const pointerDeltaY = (Number(event.clientY) || 0) - (this.dragState.pointerStartY || 0);
            const dragDistance = Math.hypot(pointerDeltaX, pointerDeltaY);
            if (dragDistance < EditorTimelineDragManager.DRAG_START_THRESHOLD_PX) {
                return;
            }

            if (this.dragState.dragBlockedByLockedTrack) {
                return;
            }

            this.flow.store.beginHistoryTransaction?.();
            this.dragState.transactionStarted = true;

            if (this.dragState.isCopyDrag) {
                const duplicated = this.flow.store.duplicateClipSelection?.(this.dragState.draggedClipIds, this.dragState.clipId);
                if (!duplicated?.length) {
                    this.flow.store.endHistoryTransaction?.({ discard: true });
                    this.dragState.transactionStarted = false;
                    this.cleanup();
                    return;
                }

                const duplicateState = this.flow.store.getState?.() || {};
                const activeClipId = duplicateState.selectedClipId || duplicated[0]?.id || this.dragState.clipId;
                const activeDraggedClipIds = duplicateState.selectedClipIds?.length
                    ? duplicateState.selectedClipIds
                    : duplicated.map((duplicatedClip) => duplicatedClip.id);

                this.dragState.clipId = activeClipId;
                this.dragState.draggedClipIds = activeDraggedClipIds;
                this.dragState.clipStart = Number(this.flow.store.findClipById?.(activeClipId)?.clip?.timelineStart) || this.dragState.clipStart;
                this.dragState.snapEdges = this.snapUtils?.getTrackEdges?.(
                    this.flow,
                    activeClipId,
                    activeDraggedClipIds.filter((selectedId) => selectedId !== activeClipId)
                ) || [];
            }
            this.dragState.hasStartedDrag = true;
        }

        const createdLane = this.maybeCreateBoundaryTrack(event.clientX, event.clientY);
        const targetLane = createdLane || this.resolveLaneUnderPointer(event.clientX, event.clientY, this.dragState.activeLane);
        const rawTargetTrackId = targetLane?.dataset?.trackId || this.dragState.targetTrackId || this.dragState.anchorTrackId;
        const anchorTrackType = this.flow.store.getTrackType?.(this.dragState.anchorTrackId);
        const targetTrackType = this.flow.store.getTrackType?.(rawTargetTrackId);
        const targetTrackLocked = !!rawTargetTrackId && this.flow.store.isTrackLocked?.(rawTargetTrackId);
        const resolvedTargetTrackId = targetTrackType === anchorTrackType
            && !targetTrackLocked
            ? rawTargetTrackId
            : this.dragState.anchorTrackId;

        this.autoScrollTimelineBody(event.clientX);
        this.dragState.activeLane = this.getLaneByTrackId(resolvedTargetTrackId) || targetLane || this.dragState.activeLane;
        this.dragState.targetTrackId = resolvedTargetTrackId;
        this.dragState.laneRect = this.dragState.activeLane?.getBoundingClientRect?.() || this.dragState.laneRect;
        this.dragState.snapEdges = this.snapUtils?.getTrackEdges?.(
            this.flow,
            this.dragState.clipId,
            this.dragState.draggedClipIds.filter((selectedId) => selectedId !== this.dragState.clipId),
            resolvedTargetTrackId
        ) || this.dragState.snapEdges;

        this.updateDragPreviewFromCurrentPointer();
        this.scheduleAutoScrollLoop();
    }

    handlePointerUp(event) {
        if (!this.dragState) return;
        if (!this.matchesActivePointer(event)) return;

        if (this.dragState && !this.dragState.hasStartedDrag) {
            this.flow.store.setClipSelection?.(this.dragState.clipId, {
                additive: this.dragState.additiveSelection,
                toggle: this.dragState.additiveSelection,
                preservePlayhead: true
            });
        } else if (this.dragState?.hasStartedDrag) {
            const { clipId, draggedClipIds, pendingTargetStart, targetTrackId } = this.dragState;
            this.clearDragPreview();
            if (draggedClipIds?.length) {
                this.flow.store.moveClipGroup?.(clipId, draggedClipIds, pendingTargetStart, {
                    targetTrackId
                });
            } else {
                this.flow.store.reorderClip?.(clipId, pendingTargetStart);
            }
        }
        this.cleanup();
    }

    cleanup() {
        document.removeEventListener('pointermove', this.boundPointerMove);
        document.removeEventListener('pointerup', this.boundPointerUp);
        this.cancelAutoScrollLoop();
        this.clearDragPreview();
        this.safeReleasePointerCapture(this.dragState?.block, this.dragState?.pointerId);
        this.setDragUiState(this.dragState?.timelineBody || this.resolveTimelineBody(), { dragging: false, copyDrag: false });
        if (this.dragState?.transactionStarted) {
            this.flow.store.endHistoryTransaction?.({ discard: this.dragState.hasStartedDrag !== true });
        }
        this.dragState = null;
    }
}

window.EditorTimelineDragManager = EditorTimelineDragManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineDragManager;
}
