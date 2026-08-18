class EditorTimelineDropManager {
    static AUTO_SCROLL_EDGE_PX = 48;
    static AUTO_SCROLL_MAX_STEP_PX = 32;

    constructor(flow) {
        this.flow = flow;
        this.autoDropState = null;
        this.documentDropEventsBound = false;
    }

    attachTimelineBody(timelineBody) {
        if (!timelineBody || timelineBody.dataset.assetDropBodyBound === 'true') return;
        timelineBody.dataset.assetDropBodyBound = 'true';

        timelineBody.addEventListener('dragover', (event) => this.handleBodyDragOver(event, timelineBody));
        timelineBody.addEventListener('drop', (event) => this.handleBodyDrop(event, timelineBody));
        timelineBody.addEventListener('dragleave', (event) => {
            if (event.currentTarget !== timelineBody) return;
            if (event.relatedTarget && timelineBody.contains(event.relatedTarget)) return;
            this.clearAutoDropTargetPreview();
        });

        this.bindDocumentDropEvents();
    }

    bindDocumentDropEvents() {
        if (this.documentDropEventsBound) return;
        this.documentDropEventsBound = true;
        document.addEventListener('dragend', () => this.clearAutoDropState());
        document.addEventListener('drop', () => this.clearAutoDropState());
    }

    attachLane(lane, trackName) {
        if (!lane || lane.dataset.dropBound === 'true') return;
        lane.dataset.dropBound = 'true';

        lane.addEventListener('dragover', (event) => {
            const assetId = event.dataTransfer?.getData('text/editor-asset-id');
            if (!assetId) return;

            const asset = this.flow.store.getAssetById(assetId);
            if (!asset) return;
            if (this.flow.store.getTrackType(trackName) !== (asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video')) return;
            if (this.flow.store.isTrackLocked(trackName)) return;

            event.preventDefault();
            this.autoScrollTimelineBody(lane.closest?.('.editor-timeline-body'), event.clientX);
            lane.classList.add('is-drop-target');
            const targetStart = this.resolveTargetStart(lane, trackName, event.clientX, asset.duration || 5);
            lane.style.setProperty('--editor-drop-x', `${Math.max(0, Math.min(100, (targetStart.percent || 0)))}%`);
        });

        lane.addEventListener('dragleave', (event) => {
            if (event.currentTarget !== lane) return;
            if (event.relatedTarget && lane.contains(event.relatedTarget)) return;
            this.clearLaneState(lane);
        });

        lane.addEventListener('drop', (event) => {
            const assetId = event.dataTransfer?.getData('text/editor-asset-id');
            if (!assetId) return;

            const asset = this.flow.store.getAssetById(assetId);
            if (!asset) return;
            if (this.flow.store.getTrackType(trackName) !== (asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video')) return;
            if (this.flow.store.isTrackLocked(trackName)) return;

            event.preventDefault();
            const target = this.resolveTargetStart(lane, trackName, event.clientX, asset.duration || 5);
            this.flow.store.insertAssetAtTime(assetId, target.time, trackName);
            this.clearLaneState(lane);
        });

        lane.addEventListener('dragend', () => {
            this.clearLaneState(lane);
        });
    }

    clearLaneState(lane) {
        lane.classList.remove('is-drop-target');
        lane.style.removeProperty('--editor-drop-x');
    }

    getAssetTrackType(asset) {
        if (asset?.kind === 'audio') return 'audio';
        if (asset?.kind === 'image') return 'image';
        return 'video';
    }

    getDraggedAsset(event) {
        const assetId = event.dataTransfer?.getData('text/editor-asset-id');
        if (!assetId) return null;
        return this.flow.store.getAssetById(assetId);
    }

    getLaneSelector(trackId) {
        if (!trackId) return '';
        return `.editor-track-lane[data-track-id="${String(trackId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    }

    getLaneByTrackId(trackId) {
        const selector = this.getLaneSelector(trackId);
        return selector ? document.querySelector(selector) : null;
    }

    getPointedLane(event, timelineBody) {
        const pointedElement = document.elementFromPoint?.(event.clientX, event.clientY) || event.target;
        const lane = pointedElement?.closest?.('.editor-track-lane');
        return lane && timelineBody?.contains?.(lane) ? lane : null;
    }

    getBodyRect(timelineBody) {
        const rect = timelineBody?.getBoundingClientRect?.();
        if (!rect) return null;
        const width = Number(rect.width) || Math.max((Number(rect.right) || 0) - (Number(rect.left) || 0), 0);
        const height = Number(rect.height) || Math.max((Number(rect.bottom) || 0) - (Number(rect.top) || 0), 0);
        const left = Number(rect.left) || 0;
        const top = Number(rect.top) || 0;
        return {
            left,
            top,
            right: Number(rect.right) || left + width,
            bottom: Number(rect.bottom) || top + height,
            width,
            height
        };
    }

    autoScrollTimelineBody(timelineBody, clientX) {
        const body = timelineBody || document.getElementById('editor-timeline-body');
        const rect = this.getBodyRect(body);
        const pointerX = Number(clientX);
        if (!body || !rect || !Number.isFinite(pointerX)) return 0;

        const maxScrollLeft = Math.max(0, (body.scrollWidth || 0) - (body.clientWidth || 0));
        if (maxScrollLeft <= 0) return 0;

        const distanceToLeft = pointerX - rect.left;
        const distanceToRight = rect.right - pointerX;
        const edgeSize = EditorTimelineDropManager.AUTO_SCROLL_EDGE_PX;
        const maxStep = EditorTimelineDropManager.AUTO_SCROLL_MAX_STEP_PX;
        let scrollDelta = 0;

        if (distanceToRight < edgeSize) {
            scrollDelta = ((edgeSize - Math.max(distanceToRight, 0)) / edgeSize) * maxStep;
        } else if (distanceToLeft < edgeSize) {
            scrollDelta = -((edgeSize - Math.max(distanceToLeft, 0)) / edgeSize) * maxStep;
        }

        if (Math.abs(scrollDelta) < 0.5) return 0;

        const previousScrollLeft = body.scrollLeft || 0;
        const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, previousScrollLeft + scrollDelta));
        if (Math.abs(nextScrollLeft - previousScrollLeft) < 0.5) return 0;

        body.scrollLeft = nextScrollLeft;
        this.flow.timelineViewportManager?.syncLockedGutterMask?.();
        body.style.setProperty('--editor-timeline-scroll-left', `${Math.max(0, body.scrollLeft || 0)}px`);
        return nextScrollLeft - previousScrollLeft;
    }

    isInsideBody(event, timelineBody) {
        const rect = this.getBodyRect(timelineBody);
        if (!rect) return false;
        return event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom;
    }

    getSortedLanesByType(trackType) {
        return [...document.querySelectorAll(`.editor-track-lane[data-track-type="${trackType}"]`)]
            .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
    }

    isAutoTrackDropZone(event, timelineBody, trackType) {
        if (!this.isInsideBody(event, timelineBody)) return false;
        if (this.getPointedLane(event, timelineBody)) return false;

        const lanes = this.getSortedLanesByType(trackType);
        if (!lanes.length) return true;

        const topRect = lanes[0].getBoundingClientRect();
        const bottomRect = lanes[lanes.length - 1].getBoundingClientRect();
        return event.clientY < topRect.top - 16 || event.clientY > bottomRect.bottom + 16;
    }

    findReusableEmptyTrack(trackType) {
        const trackIds = this.flow.store.getTrackIdsByType?.(trackType) || [];
        return trackIds.find((trackId) => {
            if (this.flow.store.isTrackLocked?.(trackId)) return false;
            return (this.flow.store.getTrack?.(trackId) || []).length === 0;
        }) || null;
    }

    resolveAutoDropTrack(event, timelineBody, asset) {
        const trackType = this.getAssetTrackType(asset);
        if (!this.isAutoTrackDropZone(event, timelineBody, trackType)) return null;

        if (this.autoDropState?.assetId === asset.id && this.autoDropState?.trackType === trackType) {
            const existingTrackId = this.autoDropState.targetTrackId;
            if (existingTrackId && this.flow.store.getTrackMeta?.(existingTrackId)) {
                return existingTrackId;
            }
        }

        const reusableTrackId = this.findReusableEmptyTrack(trackType);
        if (reusableTrackId) {
            this.autoDropState = {
                assetId: asset.id,
                trackType,
                targetTrackId: reusableTrackId,
                createdTrackId: null,
                previewLane: null
            };
            return reusableTrackId;
        }

        if (this.autoDropState?.createdTrackId) {
            return this.autoDropState.trackType === trackType ? this.autoDropState.createdTrackId : null;
        }

        const sameTypeTrackIds = this.flow.store.getTrackIdsByType?.(trackType) || [];
        const referenceTrackId = sameTypeTrackIds[sameTypeTrackIds.length - 1] || null;
        const createdTrackId = referenceTrackId
            ? this.flow.store.createTrackAdjacent?.(referenceTrackId, 'below', '', { select: false, recordHistory: false })
            : this.flow.store.createTrack?.(trackType, '', { select: false, recordHistory: false });

        if (!createdTrackId) return null;

        this.autoDropState = {
            assetId: asset.id,
            trackType,
            targetTrackId: createdTrackId,
            createdTrackId,
            previewLane: null
        };
        return createdTrackId;
    }

    getTimelineReferenceRect(timelineBody, trackId = null) {
        const targetLane = this.getLaneByTrackId(trackId);
        if (targetLane) return targetLane.getBoundingClientRect();

        const firstLane = timelineBody?.querySelector?.('.editor-track-lane');
        if (firstLane) return firstLane.getBoundingClientRect();

        return this.getBodyRect(timelineBody);
    }

    resolveTargetStartFromRect(rect, trackName, clientX, clipDuration) {
        const safeRect = rect || { left: 0, width: 1 };
        const width = Math.max(Number(safeRect.width) || Math.max((Number(safeRect.right) || 0) - (Number(safeRect.left) || 0), 1), 1);
        const relativeX = Math.max(0, Math.min(clientX - (Number(safeRect.left) || 0), width));
        const track = this.flow.store.getTrack(trackName);
        const trackEnd = track.reduce((maxValue, clip) => Math.max(maxValue, clip.timelineEnd || 0), 0);
        const totalDuration = Math.max(10, trackEnd + Math.max(Number(clipDuration) || 0, 1));
        const time = (relativeX / width) * totalDuration;
        const percent = (time / Math.max(totalDuration, 0.001)) * 100;

        return { time, percent };
    }

    markAutoDropTarget(trackId, timelineBody, clientX, clipDuration) {
        this.clearAutoDropTargetPreview();
        const lane = this.getLaneByTrackId(trackId);
        const rect = this.getTimelineReferenceRect(timelineBody, trackId);
        const targetStart = this.resolveTargetStartFromRect(rect, trackId, clientX, clipDuration);

        if (lane) {
            lane.classList.add('is-drop-target');
            lane.style.setProperty('--editor-drop-x', `${Math.max(0, Math.min(100, targetStart.percent || 0))}%`);
            if (this.autoDropState) {
                this.autoDropState.previewLane = lane;
            }
        }

        return targetStart;
    }

    clearAutoDropTargetPreview() {
        const lane = this.autoDropState?.previewLane;
        if (!lane) return;
        this.clearLaneState(lane);
        this.autoDropState.previewLane = null;
    }

    clearAutoDropState() {
        const createdTrackId = this.autoDropState?.createdTrackId || null;
        this.clearAutoDropTargetPreview();
        if (createdTrackId) {
            const createdTrack = this.flow.store.getTrack?.(createdTrackId) || [];
            if (createdTrack.length === 0) {
                this.flow.store.deleteTrack?.(createdTrackId, { recordHistory: false });
            }
        }
        this.autoDropState = null;
    }

    handleBodyDragOver(event, timelineBody) {
        const asset = this.getDraggedAsset(event);
        if (!asset) return;

        this.autoScrollTimelineBody(timelineBody, event.clientX);
        const targetTrackId = this.resolveAutoDropTrack(event, timelineBody, asset);
        if (!targetTrackId || this.flow.store.isTrackLocked?.(targetTrackId)) return;

        event.preventDefault();
        this.markAutoDropTarget(targetTrackId, timelineBody, event.clientX, asset.duration || 5);
    }

    handleBodyDrop(event, timelineBody) {
        const asset = this.getDraggedAsset(event);
        if (!asset) return;
        if (this.getPointedLane(event, timelineBody)) return;

        const targetTrackId = this.autoDropState?.assetId === asset.id
            ? this.autoDropState.targetTrackId
            : this.resolveAutoDropTrack(event, timelineBody, asset);
        if (!targetTrackId || this.flow.store.isTrackLocked?.(targetTrackId)) return;

        event.preventDefault();
        const rect = this.getTimelineReferenceRect(timelineBody, targetTrackId);
        const target = this.resolveTargetStartFromRect(rect, targetTrackId, event.clientX, asset.duration || 5);
        this.flow.store.insertAssetAtTime(asset.id, target.time, targetTrackId);
        this.clearAutoDropState();
    }

    resolveTargetStart(lane, trackName, clientX, clipDuration) {
        return this.resolveTargetStartFromRect(lane.getBoundingClientRect(), trackName, clientX, clipDuration);
    }
}

window.EditorTimelineDropManager = EditorTimelineDropManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineDropManager;
}
