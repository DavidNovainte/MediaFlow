class EditorTimelineActions {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.boundKeydown = this.handleKeydown.bind(this);
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }

    destroy() {
        document.removeEventListener('keydown', this.boundKeydown);
    }

    cacheElements() {
        this.elements = {
            addTrack: document.getElementById('btn-editor-add-track'),
            undo: document.getElementById('btn-editor-undo'),
            redo: document.getElementById('btn-editor-redo'),
            insertSelected: document.getElementById('btn-editor-insert-selected'),
            mergeClip: document.getElementById('btn-editor-merge-clip'),
            splitClip: document.getElementById('btn-editor-split-clip'),
            deleteClip: document.getElementById('btn-editor-delete-clip'),
            rippleDeleteClip: document.getElementById('btn-editor-ripple-delete-clip')
        };
    }

    bindEvents() {
        this.elements.addTrack?.addEventListener('click', () => {
            const state = this.flow.store.getState();
            const selectedTrackName = state.selectedTrackName;
            const nextType = this.flow.store.getTrackType(selectedTrackName) || 'video';
            const trackId = this.flow.store.createTrack(nextType);
            this.flow.store.selectTrack(trackId);
            this.flow.inspectorManager.render(this.flow.store.getState());
        });

        this.elements.undo?.addEventListener('click', () => {
            this.flow.store.undo?.();
        });

        this.elements.redo?.addEventListener('click', () => {
            this.flow.store.redo?.();
        });

        this.elements.insertSelected?.addEventListener('click', () => {
            const assetId = this.flow.store.getState().selectedAssetId;
            if (assetId && !this.isSelectedAssetTrackLocked()) {
                this.flow.store.insertAssetAtTime(assetId, Number(this.flow.store.getState().playheadTime) || 0);
            }
        });

        this.elements.mergeClip?.addEventListener('click', () => {
            const mergeClipIds = this.resolveMergeClipIdsForToolbar();
            if (mergeClipIds.length) {
                this.flow.store.mergeSelectedClips?.(mergeClipIds);
            }
        });

        this.elements.splitClip?.addEventListener('click', () => {
            const clipId = this.flow.store.getState().selectedClipId;
            if (clipId && !this.hasLockedSelectedClipOperation()) {
                this.splitSelectedClip();
            }
        });

        this.elements.deleteClip?.addEventListener('click', () => {
            const deleteClipIds = this.getSelectedClipDeleteIds();
            if (deleteClipIds.length && !this.hasLockedDeleteOperation()) {
                this.flow.store.deleteClips?.(deleteClipIds);
            }
        });

        this.elements.rippleDeleteClip?.addEventListener('click', () => {
            const deleteClipIds = this.getSelectedClipDeleteIds();
            if (deleteClipIds.length && !this.hasLockedDeleteOperation()) {
                this.flow.store.deleteClips?.(deleteClipIds, { ripple: true });
            }
        });

        document.addEventListener('keydown', this.boundKeydown);
    }

    isInteractiveShortcutTarget(target) {
        const closestFrom = (node, selector) => {
            if (typeof node?.closest === 'function') return node.closest(selector);
            return node?.parentElement?.closest?.(selector) || null;
        };
        const closest = (selector) => closestFrom(target, selector);

        if (closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')) {
            return true;
        }

        const interactive = closest('button, a[href], [role="button"], [role="menuitem"], [role="slider"]');
        return !!interactive && !closestFrom(interactive, '.editor-clip');
    }

    handleKeydown(event) {
        const isEditorPage = this.flow.app?.router?.currentPage === 'editor';
        if (!isEditorPage || this.isInteractiveShortcutTarget(event.target)) return;

        const state = this.flow.store.getState();
        const isSnapHotkey = !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'n' || event.key === 'N');
        if (isSnapHotkey) {
            event.preventDefault();
            const enabled = this.flow.store.toggleTimelineSnapEnabled?.();
            window.app?.showToast?.(enabled ? '时间线吸附已开启' : '时间线吸附已关闭', 'info');
            return;
        }

        const isUndoHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'z' || event.key === 'Z');
        const isRedoHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && (
            (event.shiftKey && (event.key === 'z' || event.key === 'Z'))
            || (!event.shiftKey && !event.metaKey && (event.key === 'y' || event.key === 'Y'))
        );

        if (isUndoHotkey) {
            event.preventDefault();
            this.flow.store.undo?.();
            return;
        }

        if (isRedoHotkey) {
            event.preventDefault();
            this.flow.store.redo?.();
            return;
        }

        const selectedClipIds = state.selectedClipIds || [];
        const hasSelectedClips = selectedClipIds.length > 0;
        const hasLockedSelectedClipOperation = hasSelectedClips && this.hasLockedSelectedClipOperation(state);
        const isCopyHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'c' || event.key === 'C');
        const isDuplicateHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'd' || event.key === 'D');
        const isPasteHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'v' || event.key === 'V');
        const isForwardPasteHotkey = (event.ctrlKey || event.metaKey) && !event.altKey && event.shiftKey && (event.key === 'v' || event.key === 'V');

        if (isCopyHotkey) {
            if (!hasSelectedClips || hasLockedSelectedClipOperation) return;
            event.preventDefault();
            this.copyCurrentSelection(state);
            return;
        }

        if (isDuplicateHotkey) {
            if (!hasSelectedClips || hasLockedSelectedClipOperation) return;
            event.preventDefault();
            this.duplicateCurrentSelection(state);
            return;
        }

        if (isPasteHotkey) {
            if (!this.flow.store.hasCopiedClips?.()) return;
            event.preventDefault();
            this.flow.store.pasteCopiedClips?.(Number(state.playheadTime) || 0);
            return;
        }

        if (isForwardPasteHotkey) {
            if (!this.flow.store.hasCopiedClips?.()) return;
            event.preventDefault();
            this.flow.store.pasteCopiedClipsForward?.();
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            const deleteClipIds = this.getSelectedClipDeleteIds(state);
            if (!deleteClipIds.length || this.hasLockedDeleteOperation(state)) return;
            event.preventDefault();
            this.flow.store.deleteClips?.(deleteClipIds);
        }

        if ((event.key === 's' || event.key === 'S') && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (event.repeat) {
                event.preventDefault();
                return;
            }
            if (!hasSelectedClips || hasLockedSelectedClipOperation) return;
            event.preventDefault();
            this.splitSelectedClip();
        }
    }

    render(state) {
        const hasSelectedAsset = !!state.selectedAssetId;
        const selectedClipIds = state.selectedClipIds || [];
        const hasSelectedClip = selectedClipIds.length > 0;
        const selectedAssetTrackLocked = this.isSelectedAssetTrackLocked(state);
        const selectedClipTrackLocked = this.hasLockedSelectedClipOperation(state);
        const selectedClipsTrackLocked = this.hasLockedDeleteOperation(state);
        const mergeClipIds = this.resolveMergeClipIdsForToolbar(state);

        this.setButtonAvailability(this.elements.addTrack, false, '添加轨道');
        this.setButtonAvailability(
            this.elements.undo,
            !state.canUndo,
            state.canUndo ? '撤销 · Ctrl/Cmd+Z' : '暂无可撤销操作'
        );
        this.setButtonAvailability(
            this.elements.redo,
            !state.canRedo,
            state.canRedo ? '重做 · Ctrl+Y / Cmd+Shift+Z' : '暂无可重做操作'
        );
        this.setButtonAvailability(
            this.elements.insertSelected,
            !hasSelectedAsset || selectedAssetTrackLocked,
            !hasSelectedAsset
                ? '先在素材库选择素材'
                : selectedAssetTrackLocked
                    ? '目标轨道已锁定'
                    : '在播放头加入选中素材'
        );
        this.setButtonAvailability(
            this.elements.mergeClip,
            !mergeClipIds.length,
            mergeClipIds.length ? '合并连续片段' : '选择相邻片段后合并'
        );
        this.setButtonAvailability(
            this.elements.splitClip,
            !hasSelectedClip || selectedClipTrackLocked,
            !hasSelectedClip
                ? '先选择片段'
                : selectedClipTrackLocked
                    ? '选中片段或关联轨道已锁定'
                    : '分割片段 · S'
        );
        this.setButtonAvailability(
            this.elements.deleteClip,
            !hasSelectedClip || selectedClipsTrackLocked,
            !hasSelectedClip
                ? '先选择片段'
                : selectedClipsTrackLocked
                    ? '选中片段或关联轨道已锁定'
                    : '删除片段'
        );
        this.setButtonAvailability(
            this.elements.rippleDeleteClip,
            !hasSelectedClip || selectedClipsTrackLocked,
            !hasSelectedClip
                ? '先选择片段'
                : selectedClipsTrackLocked
                    ? '选中片段或关联轨道已锁定'
                    : '波纹删除并接上后续片段'
        );
    }

    setButtonAvailability(button, disabled, title) {
        if (!button) return;

        button.disabled = !!disabled;
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        if (title) {
            button.title = title;
        }
    }

    isSelectedAssetTrackLocked(state = null) {
        const snapshot = state || this.flow.store.getState();
        const assetId = snapshot.selectedAssetId;
        if (!assetId) return false;

        const asset = this.flow.store.getAssetById(assetId);
        if (!asset) return false;

        const trackName = this.flow.store.getTrackNameForKind(asset.kind);
        return this.flow.store.isTrackLocked(trackName);
    }

    hasLockedSelectedClips(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = snapshot.selectedClipIds || [];
        if (!selectedClipIds.length) return false;

        return selectedClipIds.some((clipId) => {
            const match = this.flow.store.findClipById(clipId);
            return !!match?.trackName && this.flow.store.isTrackLocked(match.trackName);
        });
    }

    getSelectedClipOperationIds(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = [...new Set((snapshot.selectedClipIds || []).filter(Boolean))];
        if (selectedClipIds.length !== 1) return selectedClipIds;

        const primaryClipId = snapshot.selectedClipId || selectedClipIds[0];
        return this.flow.store.getDraggedClipIds?.(primaryClipId, [primaryClipId]) || selectedClipIds;
    }

    hasLockedSelectedClipOperation(state = null) {
        const operationClipIds = this.getSelectedClipOperationIds(state);
        if (!operationClipIds.length) return false;

        return operationClipIds.some((clipId) => {
            const match = this.flow.store.findClipById(clipId);
            return !!match?.trackName && this.flow.store.isTrackLocked(match.trackName);
        });
    }

    getSelectedClipDeleteIds(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = [...new Set((snapshot.selectedClipIds || []).filter(Boolean))];
        if (!selectedClipIds.length) return [];

        const expanded = new Set();
        selectedClipIds.forEach((clipId) => {
            const linkedClipIds = this.flow.store.getLinkedClipIds?.(clipId) || [clipId];
            linkedClipIds.forEach((linkedClipId) => expanded.add(linkedClipId));
        });

        return [...expanded].filter((clipId) => !!this.flow.store.findClipById(clipId));
    }

    hasLockedDeleteOperation(state = null) {
        const deleteClipIds = this.getSelectedClipDeleteIds(state);
        if (!deleteClipIds.length) return false;

        return deleteClipIds.some((clipId) => {
            const match = this.flow.store.findClipById(clipId);
            return !!match?.trackName && this.flow.store.isTrackLocked(match.trackName);
        });
    }

    resolveMergeClipIdsForToolbar(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = [...new Set((snapshot.selectedClipIds || []).filter(Boolean))];
        if (this.flow.store.canMergeSelectedClips?.(selectedClipIds)) {
            return selectedClipIds;
        }

        const primaryClipId = snapshot.selectedClipId || selectedClipIds[0];
        if (!primaryClipId) return [];

        return this.flow.store.getAdjacentMergeableClipIds?.(primaryClipId) || [];
    }

    copyCurrentSelection(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = snapshot.selectedClipIds || [];
        const primaryClipId = snapshot.selectedClipId;
        if (!selectedClipIds.length || !primaryClipId) return null;

        if (selectedClipIds.length > 1) {
            return this.flow.store.copyClipSelection?.(selectedClipIds, primaryClipId) || null;
        }

        return this.flow.store.copySelectedClipGroup?.(primaryClipId) || null;
    }

    duplicateCurrentSelection(state = null) {
        const snapshot = state || this.flow.store.getState();
        const selectedClipIds = snapshot.selectedClipIds || [];
        const primaryClipId = snapshot.selectedClipId;
        if (!selectedClipIds.length || !primaryClipId) return null;

        if (selectedClipIds.length > 1) {
            return this.flow.store.duplicateClipSelection?.(selectedClipIds, primaryClipId) || null;
        }

        return this.flow.store.duplicateSelectedClipGroup?.(primaryClipId) || null;
    }

    isPlayheadWithinClip(clip, playheadTime) {
        if (!clip) return false;
        const start = Number(clip.timelineStart) || 0;
        const end = Number(clip.timelineEnd) || (start + (Number(clip.duration) || 0));
        return playheadTime >= start && playheadTime <= end;
    }

    findClipOnTrackAtTime(trackName, playheadTime) {
        if (!trackName || !this.flow.store.isTrackActive?.(trackName)) return null;
        return this.flow.store.getTrack(trackName).find((clip) => {
            if (!this.isPlayheadWithinClip(clip, playheadTime)) return false;
            return this.flow.store.isClipReferenceActive?.(clip, trackName) !== false;
        }) || null;
    }

    resolveVisualPlayheadTime(state = this.flow.store.getState()) {
        const fallbackTime = Number(state?.playheadTime) || 0;
        const timelineBody = this.flow.timelineManager?.elements?.timelineBody || document.getElementById('editor-timeline-body');
        const ruler = this.flow.timelineManager?.elements?.ruler || document.getElementById('editor-timeline-ruler');
        if (!timelineBody || !ruler) return fallbackTime;

        const playheadOffset = Number.parseFloat(timelineBody.style.getPropertyValue('--editor-playhead-x'));
        const renderDuration = Math.max(Number(ruler.dataset.renderDuration) || 0, Number(this.flow.store.getTimelineDuration?.()) || 0);
        const laneWidth = Math.max(ruler.scrollWidth || ruler.clientWidth || ruler.offsetWidth || 0, 0);
        if (!Number.isFinite(playheadOffset) || !Number.isFinite(renderDuration) || !Number.isFinite(laneWidth) || renderDuration <= 0 || laneWidth <= 0) {
            return fallbackTime;
        }

        const visualTime = (Math.max(0, Math.min(playheadOffset, laneWidth)) / laneWidth) * renderDuration;
        return Number(visualTime.toFixed(3));
    }

    resolveSplitTargetClip(state = this.flow.store.getState(), playheadTime = Number(state?.playheadTime) || 0) {
        const selectedClipIds = Array.isArray(state?.selectedClipIds) ? state.selectedClipIds : [];
        const selectedMatches = selectedClipIds
            .map((clipId) => this.flow.store.findClipById(clipId))
            .filter(Boolean);
        const primaryMatch = state?.selectedClipId
            ? this.flow.store.findClipById(state.selectedClipId)
            : null;

        if (primaryMatch?.clip && this.isPlayheadWithinClip(primaryMatch.clip, playheadTime)) {
            return primaryMatch.clip;
        }

        const intersectingSelectedClip = selectedMatches.find((match) => this.isPlayheadWithinClip(match.clip, playheadTime))?.clip;
        if (intersectingSelectedClip) return intersectingSelectedClip;

        const preferredTrackClip = this.findClipOnTrackAtTime(state?.selectedTrackName, playheadTime);
        if (preferredTrackClip) return preferredTrackClip;

        return this.flow.store.getActiveClipAtTime?.(playheadTime) || primaryMatch?.clip || null;
    }

    splitSelectedClip() {
        const state = this.flow.store.getState();
        const storedPlayheadTime = Number(state.playheadTime) || 0;
        const playheadTime = this.resolveVisualPlayheadTime(state);
        if (Math.abs(playheadTime - storedPlayheadTime) > 0.01) {
            this.flow.store.setPlayheadTime(playheadTime);
        }

        const targetClip = this.resolveSplitTargetClip(this.flow.store.getState(), playheadTime);
        if (!targetClip?.id) return null;

        const splitAtPlayhead = this.flow.store.splitClipAtTime(targetClip.id, playheadTime);
        if (splitAtPlayhead) return splitAtPlayhead;

        window.app?.showToast?.('请把红线移到片段内部再分割', 'warning');
        return null;
    }
}

window.EditorTimelineActions = EditorTimelineActions;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineActions;
}
