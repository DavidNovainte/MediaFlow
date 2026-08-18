class EditorTimelineManager {
    static BASE_PIXELS_PER_SECOND = 56;
    static MIN_ZOOM = 5;
    static MAX_ZOOM = 400;

    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.debugEnabled = window.__EDITOR_TIMELINE_DEBUG__ === true;
        this.contextMenuState = { trackId: null, clipId: null, mergeClipIds: [], mergePrimaryClipId: null };
        const DragManager = window.EditorTimelineDragManager || class {
            attachClip() {}
        };
        const TrimManager = window.EditorTimelineTrimManager || class {
            attachHandle() {}
        };
        const DropManager = window.EditorTimelineDropManager || class {
            attachLane() {}
        };
        const PlayheadManager = window.EditorTimelinePlayheadManager || class {
            attachTarget() {}
            updateDuration() {}
        };
        this.dragManager = new DragManager(flow);
        this.trimManager = new TrimManager(flow);
        this.dropManager = new DropManager(flow);
        this.playheadManager = new PlayheadManager(flow);
        this.lastRenderedState = null;
    }

    t(key, fallback = '') {
        const text = window.i18n?.t?.(key);
        return text && text !== key ? text : fallback || key;
    }

    init() {
        this.elements = {
            timelineBody: document.getElementById('editor-timeline-body'),
            tracksRoot: document.getElementById('editor-timeline-tracks'),
            playheadOverlay: document.getElementById('editor-timeline-playhead-overlay'),
            ruler: document.getElementById('editor-timeline-ruler'),
            playheadTime: document.getElementById('editor-playhead-time'),
            debug: null,
            trackContextMenu: null,
            clipContextMenu: null
        };

        this.ensureTrackContextMenu();
        this.ensureClipContextMenu();
        this.bindGlobalContextMenuEvents();
        window.addEventListener('languageChanged', () => {
            this.elements.trackContextMenu?.remove();
            this.elements.trackContextMenu = null;
            this.ensureTrackContextMenu();
        });

        if (this.elements.timelineBody) {
            if (this.elements.timelineBody.querySelector('#editor-timeline-debug')) {
                this.elements.debug = this.elements.timelineBody.querySelector('#editor-timeline-debug');
                this.elements.debug.classList.toggle('hidden', !this.debugEnabled);
                return;
            }

            const debug = document.createElement('div');
            debug.id = 'editor-timeline-debug';
            debug.classList.toggle('hidden', !this.debugEnabled);
            this.elements.timelineBody.prepend(debug);
            this.elements.debug = debug;
        }
    }

    ensureElements() {
        const timelineBody = document.getElementById('editor-timeline-body');
        const tracksRoot = document.getElementById('editor-timeline-tracks');
        const playheadOverlay = document.getElementById('editor-timeline-playhead-overlay');
        const ruler = document.getElementById('editor-timeline-ruler');
        const playheadTime = document.getElementById('editor-playhead-time');

        this.elements.timelineBody = timelineBody;
        this.elements.tracksRoot = tracksRoot;
        this.elements.playheadOverlay = playheadOverlay;
        this.elements.ruler = ruler;
        this.elements.playheadTime = playheadTime;
        this.ensureTrackContextMenu();
        this.ensureClipContextMenu();

        if (timelineBody) {
            let debug = timelineBody.querySelector('#editor-timeline-debug');
            if (!debug) {
                debug = document.createElement('div');
                debug.id = 'editor-timeline-debug';
                debug.classList.toggle('hidden', !this.debugEnabled);
                timelineBody.prepend(debug);
            }
            this.elements.debug = debug;
        } else {
            this.elements.debug = null;
        }

        this.dropManager.attachTimelineBody?.(timelineBody);

        return !!(timelineBody && tracksRoot && ruler);
    }

    ensureTrackContextMenu() {
        const scope = document.querySelector('#page-editor .editor-scope');
        if (!scope) return;

        let menu = scope.querySelector('#editor-track-context-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'editor-track-context-menu';
            menu.className = 'editor-track-context-menu hidden';
            menu.innerHTML = `
                <button type="button" class="editor-track-context-menu-item" data-action="add-above">${this.t('editor.addTrackAbove', '在上方添加轨道')}</button>
                <button type="button" class="editor-track-context-menu-item" data-action="add-below">${this.t('editor.addTrackBelow', '在下方添加轨道')}</button>
                <div class="editor-track-context-menu-sep" aria-hidden="true"></div>
                <button type="button" class="editor-track-context-menu-item" data-action="rename-track">${this.t('editor.renameTrack', '修改名称')}</button>
                <button type="button" class="editor-track-context-menu-item" data-action="toggle-lock">${this.t('editor.lockTrack', '锁定轨道')}</button>
                <div class="editor-track-context-menu-sep" aria-hidden="true"></div>
                <button type="button" class="editor-track-context-menu-item is-danger" data-action="delete-track">${this.t('editor.deleteTrack', '删除轨道')}</button>
            `;
            scope.appendChild(menu);
        }

        this.elements.trackContextMenu = menu;
    }

    ensureClipContextMenu() {
        const scope = document.querySelector('#page-editor .editor-scope');
        if (!scope) return;

        let menu = scope.querySelector('#editor-clip-context-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'editor-clip-context-menu';
            menu.className = 'editor-track-context-menu editor-clip-context-menu hidden';
            scope.appendChild(menu);
        }

        this.elements.clipContextMenu = menu;
    }

    bindGlobalContextMenuEvents() {
        if (this._contextMenuEventsBound) return;
        this._contextMenuEventsBound = true;

        document.addEventListener('click', (event) => {
            if (event.target?.closest?.('#editor-track-context-menu')) return;
            if (event.target?.closest?.('#editor-clip-context-menu')) return;
            this.hideTrackContextMenu();
            this.hideClipContextMenu();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.hideTrackContextMenu();
                this.hideClipContextMenu();
            }
        });

        document.addEventListener('scroll', () => {
            this.hideTrackContextMenu();
            this.hideClipContextMenu();
        }, true);
        window.addEventListener('resize', () => {
            this.hideTrackContextMenu();
            this.hideClipContextMenu();
        });
    }

    showTrackContextMenu(trackId, event) {
        this.ensureTrackContextMenu();
        const menu = this.elements.trackContextMenu;
        if (!menu || !trackId) return;

        const control = this.flow.store.getTrackControl(trackId) || {};
        const lockButton = menu.querySelector('[data-action="toggle-lock"]');
        if (lockButton) {
            lockButton.textContent = control.locked ? (window.i18n?.t('editor.unlockTrack') || 'Unlock track') : (window.i18n?.t('editor.lockTrack') || 'Lock track');
        }

        this.contextMenuState.trackId = trackId;
        menu.classList.remove('hidden');

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(event.clientX, viewportWidth - menuRect.width - 8);
        const top = Math.min(event.clientY, viewportHeight - menuRect.height - 8);
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
    }

    hideTrackContextMenu() {
        const menu = this.elements.trackContextMenu;
        if (!menu) return;
        menu.classList.add('hidden');
        this.contextMenuState.trackId = null;
    }

    resolveClipContextDetails(clipId) {
        if (!clipId) {
            return {
                primaryClipId: null,
                contextClipIds: [],
                linkedClipIds: [],
                hasContextGroup: false,
                hasLinkedGroup: false,
                isLinkedContext: false,
                canRelink: false
            };
        }

        const selectedClipIds = [...new Set((this.flow.store.getState().selectedClipIds || []).filter(Boolean))];
        const relinkableClipIds = this.flow.store.getRelinkableClipIds?.(selectedClipIds) || [];
        const contextClipIds = relinkableClipIds.length === 2 && relinkableClipIds.includes(clipId)
            ? relinkableClipIds
            : (this.flow.store.getDraggedClipIds?.(clipId, [clipId]) || [clipId]);
        const normalizedContextClipIds = [...new Set(contextClipIds.filter(Boolean))];
        const linkedClipIds = [...new Set((this.flow.store.getLinkedClipIds?.(clipId) || [clipId]).filter(Boolean))];
        const linkedClipSet = new Set(linkedClipIds);
        const primaryClipId = normalizedContextClipIds.includes(clipId) ? clipId : (normalizedContextClipIds[0] || clipId);
        const hasContextGroup = normalizedContextClipIds.length > 1;
        const hasLinkedGroup = linkedClipIds.length > 1;
        const isLinkedContext = hasContextGroup && normalizedContextClipIds.every((contextClipId) => linkedClipSet.has(contextClipId));
        const canRelink = !hasLinkedGroup && (this.flow.store.getRelinkableClipIds?.(normalizedContextClipIds) || []).length === 2;

        return {
            primaryClipId,
            contextClipIds: normalizedContextClipIds,
            linkedClipIds,
            hasContextGroup,
            hasLinkedGroup,
            isLinkedContext,
            canRelink
        };
    }

    resolveMergeContextDetails(clipId) {
        const state = this.flow.store.getState();
        const selectedClipIds = [...new Set((state.selectedClipIds || []).filter(Boolean))];
        if (selectedClipIds.includes(clipId) && this.flow.store.canMergeSelectedClips?.(selectedClipIds)) {
            return {
                mergeClipIds: selectedClipIds,
                mergePrimaryClipId: selectedClipIds.includes(state.selectedClipId) ? state.selectedClipId : clipId
            };
        }

        const adjacentMergeClipIds = this.flow.store.getAdjacentMergeableClipIds?.(clipId) || [];
        return adjacentMergeClipIds.length
            ? { mergeClipIds: adjacentMergeClipIds, mergePrimaryClipId: clipId }
            : { mergeClipIds: [], mergePrimaryClipId: null };
    }

    hasLockedClipIds(clipIds = []) {
        return [...new Set((Array.isArray(clipIds) ? clipIds : []).filter(Boolean))]
            .some((candidateClipId) => {
                const candidateMatch = this.flow.store.findClipById?.(candidateClipId);
                return !!candidateMatch?.trackName && !!this.flow.store.isTrackLocked?.(candidateMatch.trackName);
            });
    }

    showClipContextMenu(clipId, event) {
        this.ensureClipContextMenu();
        const menu = this.elements.clipContextMenu;
        if (!menu || !clipId) return;

        const match = this.flow.store.findClipById(clipId);
        if (!match?.clip) return;

        const {
            primaryClipId,
            contextClipIds,
            hasLinkedGroup,
            isLinkedContext,
            canRelink
        } = this.resolveClipContextDetails(clipId);
        const { mergeClipIds, mergePrimaryClipId } = this.resolveMergeContextDetails(clipId);
        const hasCopiedClips = !!this.flow.store.hasCopiedClips?.();
        const canDetach = hasLinkedGroup;
        const effectiveContextClipIds = mergeClipIds.length ? mergeClipIds : contextClipIds;
        const effectivePrimaryClipId = mergeClipIds.length ? mergePrimaryClipId : primaryClipId;
        const effectiveHasContextGroup = effectiveContextClipIds.length > 1;
        const canMergeContext = mergeClipIds.length > 0 || !!this.flow.store.canMergeSelectedClips?.(effectiveContextClipIds);
        const effectiveIsLinkedContext = mergeClipIds.length ? false : isLinkedContext;
        const contextLocked = this.hasLockedClipIds(effectiveContextClipIds);

        if (effectiveContextClipIds.length) {
            this.flow.store.setSelectedClips?.(effectiveContextClipIds, effectivePrimaryClipId, { preservePlayhead: true });
        }

        const copyLabel = effectiveIsLinkedContext
            ? this.t('editor.copyLinkedGroup', '复制音视频组')
            : (effectiveHasContextGroup ? this.t('editor.copySelectedClips', '复制所选片段') : this.t('editor.copyClip', '复制片段'));
        const deleteLabel = effectiveIsLinkedContext
            ? this.t('editor.deleteLinkedGroup', '删除音视频组')
            : (effectiveHasContextGroup ? this.t('editor.deleteSelectedClips', '删除所选片段') : this.t('editor.deleteClip', '删除片段'));

        this.contextMenuState.mergeClipIds = mergeClipIds.length ? [...mergeClipIds] : [];
        this.contextMenuState.mergePrimaryClipId = mergePrimaryClipId || null;

        menu.innerHTML = `
            <button type="button" class="editor-track-context-menu-item" data-action="split-clip" ${contextLocked ? 'disabled' : ''}>${this.t('editor.splitClip', '分割片段')} · S</button>
            ${canMergeContext ? `<button type="button" class="editor-track-context-menu-item" data-action="merge-context" ${contextLocked ? 'disabled' : ''}>${this.t('editor.mergeClip', '合并片段')}</button>` : ''}
            ${canRelink ? `<button type="button" class="editor-track-context-menu-item" data-action="relink-linked" ${contextLocked ? 'disabled' : ''}>${this.t('editor.relinkAudioVideo', '重新联动音视频')}</button>` : ''}
            ${canDetach ? `<button type="button" class="editor-track-context-menu-item" data-action="detach-linked" ${contextLocked ? 'disabled' : ''}>${this.t('editor.detachAudioVideo', '音视频分离')}</button>` : ''}
            <button type="button" class="editor-track-context-menu-item" data-action="copy-context" ${contextLocked ? 'disabled' : ''}>${copyLabel} · Ctrl/Cmd+C</button>
            <button type="button" class="editor-track-context-menu-item" data-action="paste-clip" ${!hasCopiedClips ? 'disabled' : ''}>${this.t('editor.pasteAtPlayhead', '粘贴到播放头')} · Ctrl/Cmd+V</button>
            <button type="button" class="editor-track-context-menu-item" data-action="paste-clip-forward" ${!hasCopiedClips ? 'disabled' : ''}>${this.t('editor.pasteForward', '向后连续粘贴')} · Ctrl/Cmd+Shift+V</button>
            <button type="button" class="editor-track-context-menu-item is-danger" data-action="delete-context" ${contextLocked ? 'disabled' : ''}>${deleteLabel}</button>
        `;

        menu.querySelectorAll('[data-action]').forEach((button) => {
            button.onclick = (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                const action = button.dataset.action;
                const targetClipId = this.contextMenuState.clipId;
                this.hideClipContextMenu();
                this.runClipContextMenuAction(action, targetClipId);
            };
        });

        this.hideTrackContextMenu();
        this.contextMenuState.clipId = clipId;
        menu.classList.remove('hidden');

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(event.clientX, viewportWidth - menuRect.width - 8);
        const top = Math.min(event.clientY, viewportHeight - menuRect.height - 8);
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
    }

    hideClipContextMenu() {
        const menu = this.elements.clipContextMenu;
        if (!menu) return;
        menu.classList.add('hidden');
        menu.innerHTML = '';
        this.contextMenuState.clipId = null;
        this.contextMenuState.mergeClipIds = [];
        this.contextMenuState.mergePrimaryClipId = null;
    }

    promptTrackRename(currentName = '') {
        return new Promise((resolve) => {
            const scope = document.querySelector('#page-editor .editor-scope') || document.body;
            const overlay = document.createElement('div');
            overlay.className = 'editor-track-rename-overlay';
            overlay.innerHTML = `
                <div class="editor-track-rename-dialog" role="dialog" aria-modal="true" aria-label="修改轨道名称">
                    <div class="editor-track-rename-title">修改轨道名称</div>
                    <input
                        type="text"
                        class="editor-track-rename-input"
                        value="${String(currentName || '').replace(/"/g, '&quot;')}"
                        placeholder="输入轨道名称"
                        maxlength="40"
                    >
                    <div class="editor-track-rename-actions">
                        <button type="button" class="editor-track-rename-btn" data-action="cancel">取消</button>
                        <button type="button" class="editor-track-rename-btn is-primary" data-action="confirm">确定</button>
                    </div>
                </div>
            `;

            const input = overlay.querySelector('.editor-track-rename-input');
            const close = (value) => {
                overlay.remove();
                resolve(value);
            };

            overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));
            overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => close(input?.value ?? ''));
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    close(null);
                }
            });
            input?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    close(input.value);
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(null);
                }
            });

            scope.appendChild(overlay);
            input?.focus();
            input?.select();
        });
    }

    async runTrackContextMenuAction(action, trackId) {
        const targetTrackId = this.flow.store.normalizeTrackId(trackId);
        if (!targetTrackId) return;

        if (action === 'add-above') {
            this.flow.store.createTrackAdjacent(targetTrackId, 'above');
            return;
        }

        if (action === 'add-below') {
            this.flow.store.createTrackAdjacent(targetTrackId, 'below');
            return;
        }

        if (action === 'toggle-lock') {
            this.flow.store.selectTrack(targetTrackId);
            this.flow.store.toggleTrackLocked(targetTrackId);
            return;
        }

        if (action === 'rename-track') {
            const trackMeta = this.flow.store.getTrackMeta(targetTrackId);
            const currentName = String(trackMeta?.name || '').trim();
            const nextName = String(await this.promptTrackRename(currentName) || '').trim();

            if (!nextName || nextName === currentName) {
                return;
            }

            const renamed = this.flow.store.renameTrack(targetTrackId, nextName);
            if (!renamed) {
                window.app?.showToast?.('轨道名称更新失败', 'warning');
                return;
            }

            this.flow.store.selectTrack(targetTrackId);
            window.app?.showToast?.('轨道名称已更新', 'success');
            return;
        }

        if (action === 'delete-track') {
            const deleted = this.flow.store.deleteTrack(targetTrackId, { force: true });
            if (!deleted) {
                window.app?.showToast?.('不能删除该类型唯一剩余的轨道', 'warning');
                return;
            }
            // Stop timeline transport; preview may still show media-bin asset (now playable as 素材预览).
            this.flow.playbackManager?.stop?.(true);
            if (this.flow.store.getAllClips?.().length === 0) {
                window.app?.showToast?.(
                    '轨道已删除。素材仍在素材库，可点播放试看，或拖回时间线继续剪辑。',
                    'info'
                );
            }
        }
    }

    runClipContextMenuAction(action, clipId) {
        if (!clipId || !action) return;

        const {
            primaryClipId,
            contextClipIds,
            hasContextGroup,
            isLinkedContext
        } = this.resolveClipContextDetails(clipId);
        const mergeClipIds = this.contextMenuState.mergeClipIds?.length
            ? [...this.contextMenuState.mergeClipIds]
            : ((this.flow.store.canMergeSelectedClips?.(this.flow.store.getState().selectedClipIds || []))
                ? [...(this.flow.store.getState().selectedClipIds || [])]
                : []);
        const mergePrimaryClipId = this.contextMenuState.mergePrimaryClipId || this.flow.store.getState().selectedClipId || clipId;

        if (contextClipIds.length) {
            this.flow.store.setSelectedClips?.(contextClipIds, primaryClipId, { preservePlayhead: true });
        }

        if (action === 'duplicate-clip') {
            const duplicated = this.flow.store.duplicateClipOnly?.(clipId);
            if (!duplicated?.length) {
                window.app?.showToast?.('当前片段无法重复', 'warning');
                return;
            }
            window.app?.showToast?.('当前片段已重复到后面', 'success');
            return;
        }

        if (action === 'duplicate-clip-group') {
            const duplicated = this.flow.store.duplicateSelectedClipGroup?.(clipId);
            if (!duplicated?.length) {
                window.app?.showToast?.('当前片段组无法重复', 'warning');
                return;
            }
            window.app?.showToast?.('联动片段组已重复到后面', 'success');
            return;
        }

        if (action === 'copy-clip') {
            const copied = this.flow.store.copyClipOnly?.(clipId);
            if (!copied) {
                window.app?.showToast?.('当前片段无法复制', 'warning');
                return;
            }
            window.app?.showToast?.('当前片段已复制', 'success');
            return;
        }

        if (action === 'copy-clip-group') {
            const copied = this.flow.store.copySelectedClipGroup?.(clipId);
            if (!copied) {
                window.app?.showToast?.('当前片段组无法复制', 'warning');
                return;
            }
            window.app?.showToast?.('联动片段组已复制', 'success');
            return;
        }

        if (action === 'copy-context') {
            const copied = hasContextGroup
                ? this.flow.store.copyClipSelection?.(contextClipIds, primaryClipId)
                : this.flow.store.copyClipOnly?.(primaryClipId);
            if (!copied) {
                window.app?.showToast?.(hasContextGroup ? '当前片段无法复制' : '当前片段无法复制', 'warning');
                return;
            }
            const successMessage = isLinkedContext
                ? '音视频组已复制'
                : (hasContextGroup ? '所选片段已复制' : '当前片段已复制');
            window.app?.showToast?.(successMessage, 'success');
            return;
        }

        if (action === 'paste-clip') {
            const pasted = this.flow.store.pasteCopiedClips?.(Number(this.flow.store.getState().playheadTime) || 0);
            if (!pasted?.length) {
                window.app?.showToast?.('当前播放头无法粘贴片段', 'warning');
                return;
            }
            window.app?.showToast?.('片段已粘贴到播放头', 'success');
            return;
        }

        if (action === 'paste-clip-forward') {
            const pasted = this.flow.store.pasteCopiedClipsForward?.();
            if (!pasted?.length) {
                window.app?.showToast?.('当前无法连续粘贴片段', 'warning');
                return;
            }
            window.app?.showToast?.('已向后连续粘贴一份', 'success');
            return;
        }

        if (action === 'split-clip') {
            const playheadTime = Number(this.flow.store.getState().playheadTime) || 0;
            const splitAtPlayhead = this.flow.store.splitClipAtTime(clipId, playheadTime);
            if (splitAtPlayhead) return;
            window.app?.showToast?.('请把红线移到片段内部再分割', 'warning');
            return;
        }

        if (action === 'merge-context') {
            if (mergeClipIds.length) {
                this.flow.store.setSelectedClips?.(mergeClipIds, mergePrimaryClipId, { preservePlayhead: true });
            }

            const merged = this.flow.store.mergeSelectedClips?.(mergeClipIds.length ? mergeClipIds : undefined);
            if (!merged) {
                window.app?.showToast?.('请先选中同轨相邻的两个连续片段', 'warning');
                return;
            }

            window.app?.showToast?.('片段已合并', 'success');
            return;
        }

        if (action === 'relink-linked') {
            const relinked = this.flow.store.relinkSelectedClips?.(contextClipIds);
            if (!relinked?.length) {
                window.app?.showToast?.('请先选中一条视频和一条音频', 'warning');
                return;
            }
            window.app?.showToast?.('音视频已重新联动', 'success');
            return;
        }

        if (action === 'detach-linked') {
            const detached = this.flow.store.detachLinkedClipGroup?.(clipId);
            if (!detached) {
                window.app?.showToast?.('当前片段没有可分离的音视频', 'warning');
                return;
            }
            window.app?.showToast?.('音视频已分离', 'success');
            return;
        }

        if (action === 'ripple-delete-clip') {
            this.flow.store.deleteClip(clipId, { ripple: true });
            return;
        }

        if (action === 'ripple-delete-clip-group') {
            const draggedClipIds = this.flow.store.getDraggedClipIds?.(clipId, [clipId]) || [clipId];
            if (draggedClipIds.length > 1) {
                this.flow.store.setSelectedClips(draggedClipIds, clipId);
                this.flow.store.deleteSelectedClips({ ripple: true });
                return;
            }
            this.flow.store.deleteClip(clipId, { ripple: true });
            return;
        }

        if (action === 'delete-clip') {
            this.flow.store.deleteClip(clipId);
            return;
        }

        if (action === 'delete-context') {
            if (hasContextGroup) {
                this.flow.store.deleteSelectedClips();
                return;
            }
            this.flow.store.deleteClip(primaryClipId);
            return;
        }

        if (action === 'delete-clip-group') {
            const draggedClipIds = this.flow.store.getDraggedClipIds?.(clipId, [clipId]) || [clipId];
            if (draggedClipIds.length > 1) {
                this.flow.store.setSelectedClips(draggedClipIds, clipId);
                this.flow.store.deleteSelectedClips();
                return;
            }
            this.flow.store.deleteClip(clipId);
        }
    }

    getTrackHeight(trackId, state = null) {
        const snapshot = state || this.flow.store.getState();
        const height = Number(snapshot?.trackMeta?.[trackId]?.height || this.flow.store.getTrackHeight?.(trackId) || 64);
        return Math.min(Math.max(height, 52), 180);
    }

    getTrackOffsetWidth() {
        const styles = this.elements.timelineBody ? window.getComputedStyle(this.elements.timelineBody) : null;
        const offset = Number.parseFloat(styles?.getPropertyValue('--editor-track-offset'));
        if (Number.isFinite(offset)) return offset;

        const labelWidth = Number.parseFloat(styles?.getPropertyValue('--editor-track-label-width'));
        const trackGap = Number.parseFloat(styles?.getPropertyValue('--editor-track-gap'));
        return (Number.isFinite(labelWidth) ? labelWidth : 96) + (Number.isFinite(trackGap) ? trackGap : 8);
    }

    resolveTimelineMetrics(totalDuration, zoom) {
        const safeDuration = Math.max(Number(totalDuration) || 0, 10);
        const parsedZoom = Number(zoom);
        const safeZoom = Math.min(
            Math.max(Number.isFinite(parsedZoom) ? parsedZoom : 100, EditorTimelineManager.MIN_ZOOM),
            EditorTimelineManager.MAX_ZOOM
        );
        const pixelsPerSecond = EditorTimelineManager.BASE_PIXELS_PER_SECOND * (safeZoom / 100);
        const timelineBodyWidth = this.elements.timelineBody?.clientWidth || this.elements.timelineBody?.offsetWidth || 0;
        const viewportLaneWidth = Math.max(timelineBodyWidth - this.getTrackOffsetWidth(), 0);
        const minimumLaneWidth = Math.max(720, viewportLaneWidth);
        const renderDuration = Math.max(safeDuration, minimumLaneWidth / Math.max(pixelsPerSecond, 1));
        const laneWidth = Math.max(minimumLaneWidth, Math.round(renderDuration * pixelsPerSecond));

        return {
            safeDuration,
            renderDuration,
            laneWidth
        };
    }

    applyTrackRowLayout(row, label, lane, trackHeight, laneWidth = null) {
        const resolvedHeight = Math.min(Math.max(Number(trackHeight) || 64, 52), 180);
        row.style.setProperty('--editor-track-row-height', `${resolvedHeight}px`);
        row.style.minHeight = `${resolvedHeight}px`;
        if (Number.isFinite(laneWidth)) {
            row.style.width = `${Math.round(this.getTrackOffsetWidth() + Math.max(Number(laneWidth) || 0, 0))}px`;
        } else {
            row.style.width = '';
        }
        label.style.minHeight = `${Math.max(resolvedHeight - 4, 48)}px`;
        lane.style.minHeight = `${resolvedHeight}px`;
    }

    attachTrackResizeHandle(handle, trackName, state) {
        if (!handle) return;
        handle.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.hideTrackContextMenu();
            this.flow.store.selectTrack(trackName);

            const startY = event.clientY;
            const startHeight = this.getTrackHeight(trackName, state);
            const previousCursor = document.body.style.cursor;
            const previousUserSelect = document.body.style.userSelect;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            const onMouseMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startY;
                this.flow.store.setTrackHeight(trackName, startHeight + deltaY);
            };

            const onMouseUp = () => {
                document.body.style.cursor = previousCursor;
                document.body.style.userSelect = previousUserSelect;
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    applyTracksRootFallback(active) {
        if (!this.elements.tracksRoot) return;

        const rootStyle = this.elements.tracksRoot.style;
        rootStyle.display = active ? 'grid' : '';
        rootStyle.gap = active ? '6px' : '';
        rootStyle.minHeight = active ? '180px' : '';
        rootStyle.paddingBottom = active ? '6px' : '';

        this.elements.tracksRoot.querySelectorAll('.editor-timeline-track').forEach((row) => {
            row.style.outline = active ? '1px dashed rgba(77, 130, 201, 0.55)' : '';
            row.style.minHeight = active ? '52px' : '';
        });
    }

    // 调度一个延迟检测，一旦 DOM 排版高度就绪且不再是 0，自动升级为完整渲染
    scheduleVisibilityCheck(state) {
        if (this._visibilityCheckPending) return;
        this._visibilityCheckPending = true;
        requestAnimationFrame(() => {
            this._visibilityCheckPending = false;
            if (!this.elements.tracksRoot) return;
            const firstTrack = this.elements.tracksRoot.querySelector('.editor-timeline-track');
            const hasHeight = this.elements.tracksRoot.offsetHeight > 0 
                && (!firstTrack || firstTrack.offsetHeight > 0);
            if (hasHeight) {
                this.render(state);
            }
        });
    }

    getRenderableTrackIds(state) {
        // Always show every track in order — never hide empty / default tracks
        // (old logic dropped v1 when adding v2 because v1 isUserCreated=false).
        const explicitTrackOrder = Array.isArray(state?.trackOrder)
            ? state.trackOrder.filter((trackId) => trackId && state?.timeline && Object.prototype.hasOwnProperty.call(state.timeline, trackId))
            : [];
        if (explicitTrackOrder.length) {
            return explicitTrackOrder;
        }

        return Object.keys(state?.timeline || {}).filter((trackId) => !['video', 'audio', 'image'].includes(trackId));
    }

    renderFallbackRuler(totalDuration, laneWidth) {
        if (!this.elements.ruler) return;

        this.elements.ruler.style.minWidth = `${laneWidth}px`;
        this.elements.ruler.style.width = `${laneWidth}px`;
        this.elements.ruler.innerHTML = `
            <div class="editor-ruler-ticks">
                <div class="editor-ruler-tick is-major is-origin" style="left: 0px;">
                    <span class="editor-ruler-label">${this.formatRulerLabel(0)}</span>
                </div>
                <div class="editor-ruler-tick is-major is-end" style="left: ${Math.max(laneWidth - 1, 0)}px;">
                    <span class="editor-ruler-label">${this.formatRulerLabel(totalDuration)}</span>
                </div>
            </div>
            <div class="editor-ruler-anchor" aria-hidden="true">
                <div class="editor-ruler-origin-label">${this.formatRulerLabel(0)}</div>
            </div>
        `;
    }

    renderMinimalTimeline(state, options = {}) {
        if (!this.ensureElements()) return;

        const totalDuration = Math.max(10, Number(this.flow.store.getTimelineDuration?.()) || 0);
        const parsedZoom = Number(state?.timelineZoom);
        const metrics = this.resolveTimelineMetrics(totalDuration, Number.isFinite(parsedZoom) ? parsedZoom : 100);
        const laneWidth = metrics.laneWidth;
        const renderDuration = metrics.renderDuration;
        const trackIds = this.getRenderableTrackIds(state);
        const clipCount = trackIds.reduce((sum, trackId) => sum + ((state?.timeline?.[trackId] || []).length), 0);
        const fallbackReason = options.reason ? `fallback:${options.reason}` : 'fallback';

        this.renderFallbackRuler(renderDuration, laneWidth);

        if (!this.elements.tracksRoot) return;

        this.elements.tracksRoot.innerHTML = '';
        this.elements.tracksRoot.classList.add('is-fallback-visible');

        const status = document.createElement('div');
        status.className = 'editor-track-debug-row';
        status.textContent = `${fallbackReason} tracks:${trackIds.length} clips:${clipCount}`;
        if (this.debugEnabled || clipCount > 0) {
            this.elements.tracksRoot.appendChild(status);
        }

        trackIds.forEach((trackId) => {
            const row = document.createElement('div');
            row.className = 'editor-timeline-track';
            const gutterShield = document.createElement('div');
            gutterShield.className = 'editor-track-gutter-shield';
            gutterShield.setAttribute('aria-hidden', 'true');
            const label = document.createElement('div');
            label.className = 'editor-track-label';
            this.renderTrackLabel(label, trackId, this.getTrackDisplayName(trackId, state), state);

            const lane = document.createElement('div');
            lane.className = 'editor-track-lane';
            lane.dataset.trackId = trackId;
            lane.dataset.trackType = this.flow.store.getTrackType(trackId) || state.trackMeta?.[trackId]?.type || 'video';
            lane.style.minWidth = `${laneWidth}px`;
            lane.style.width = `${laneWidth}px`;

            const clips = state?.timeline?.[trackId] || [];
            if (!clips.length) {
                const emptyHint = window.i18n?.t?.('editor.dropHint') || '把素材拖到这里，或使用“插入”加入时间线。';
                lane.innerHTML = `<div class="editor-track-empty">${emptyHint}</div>`;
            } else {
                const selectedClipIds = state.selectedClipIds || [];
                const selectedLinkedGroupIds = new Set(
                    selectedClipIds
                        .map((selectedClipId) => this.flow.store.findClipById?.(selectedClipId)?.clip?.linkGroupId)
                        .filter(Boolean)
                );
                clips.forEach((clip) => {
                    const asset = (state?.assets || []).find((item) => item.id === clip.assetId);
                    const isSelected = selectedClipIds.includes(clip.id);
                    const isPrimary = state.selectedClipId === clip.id;
                    const linkedClipIds = clip.linkGroupId ? (this.flow.store.getLinkedClipIds?.(clip.id) || []) : [];
                    const isLinkedGroup = linkedClipIds.length > 1;
                    const isLinkedCompanion = !isSelected && !!clip.linkGroupId && selectedLinkedGroupIds.has(clip.linkGroupId);
                    const block = document.createElement('button');
                    block.type = 'button';
                    block.dataset.clipId = clip.id;
                    if (clip.linkGroupId) {
                        block.dataset.linkGroupId = clip.linkGroupId;
                    }
                    const clipKind = clip.kind || asset?.kind || this.flow.store.getTrackType(trackId) || 'video';
                    block.className = `editor-clip editor-clip-${clipKind}${isSelected ? ' is-selected' : ''}${isPrimary ? ' is-primary-selected' : ''}${isLinkedGroup ? ' is-linked-group' : ''}${isLinkedCompanion ? ' is-linked-companion' : ''}`;
                    block.style.left = `${(Math.max(Number(clip.timelineStart) || 0, 0) / renderDuration) * laneWidth}px`;
                    const clipPixelWidth = Math.max(((Number(clip.duration) || 0) / renderDuration) * laneWidth, 48);
                    const clipPixelHeight = Math.max(64 - 10, 24);
                    block.style.width = `${clipPixelWidth}px`;
                    const clipMarkup = this.buildClipMarkup(clip, asset, {
                        clipPixelWidth,
                        clipPixelHeight,
                        isLinkedGroup
                    });
                    block.title = clipMarkup.title;
                    block.innerHTML = clipMarkup.content;
                    lane.appendChild(block);
                });
            }

            row.appendChild(gutterShield);
            row.appendChild(label);
            row.appendChild(lane);
            this.applyTrackRowLayout(row, label, lane, 64, laneWidth);
            this.elements.tracksRoot.appendChild(row);
        });

        this.applyTracksRootFallback(true);
        this.updatePlayheadOverlay();
    }

    formatTimelineTime(value) {
        const time = Math.max(Number(value) || 0, 0);
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.round((time - Math.floor(time)) * 1000);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }

    updatePlayheadOverlay() {
        if (!this.elements.playheadOverlay || !this.elements.timelineBody) return;

        const bodyStyles = window.getComputedStyle(this.elements.timelineBody);
        const padding = Number.parseFloat(bodyStyles.getPropertyValue('--editor-timeline-body-padding')) || 0;
        const rulerStyles = this.elements.ruler ? window.getComputedStyle(this.elements.ruler) : null;
        const rulerHeight = this.elements.ruler?.offsetHeight || 0;
        const rulerGap = rulerStyles ? Number.parseFloat(rulerStyles.marginBottom) || 0 : 0;
        const overlayTop = padding + rulerHeight + rulerGap;
        const contentHeight = this.elements.timelineBody.scrollHeight;
        const overlayHeight = Math.max(0, contentHeight - overlayTop - padding);

        this.elements.playheadOverlay.style.top = `${overlayTop}px`;
        this.elements.playheadOverlay.style.height = `${overlayHeight}px`;
    }

    renderRuler(totalDuration, playheadTime) {
        if (!this.elements.ruler) return;

        const parsedZoom = Number(this.flow.store.getState().timelineZoom);
        const zoom = Math.min(
            Math.max(Number.isFinite(parsedZoom) ? parsedZoom : 100, EditorTimelineManager.MIN_ZOOM),
            EditorTimelineManager.MAX_ZOOM
        );
        const metrics = this.resolveTimelineMetrics(totalDuration, zoom);
        const safeDuration = metrics.safeDuration;
        const renderDuration = metrics.renderDuration;
        const laneWidth = metrics.laneWidth;
        const tickStep = this.resolveRulerTickStep(renderDuration, laneWidth);
        const ticks = [];
        for (let value = 0; value <= renderDuration + 0.001; value += tickStep) {
            const position = (value / renderDuration) * laneWidth;
            const isMajor = this.isMajorTick(value, tickStep, renderDuration);
            const isOrigin = value <= 0.001;
            ticks.push(`
                <div class="editor-ruler-tick${isMajor ? ' is-major' : ''}${isOrigin ? ' is-origin' : ''}" style="left: ${position}px;">
                    ${isMajor || isOrigin ? `<span class="editor-ruler-label">${this.formatRulerLabel(value)}</span>` : ''}
                </div>
            `);
        }

        const playheadOffset = (Math.max(playheadTime || 0, 0) / renderDuration) * laneWidth;
        this.elements.ruler.style.minWidth = `${laneWidth}px`;
        this.elements.ruler.style.width = `${laneWidth}px`;
        this.elements.ruler.dataset.renderDuration = String(renderDuration);
        this.elements.ruler.innerHTML = `
            <div class="editor-ruler-ticks">${ticks.join('')}</div>
            <div class="editor-ruler-anchor" aria-hidden="true">
                <div class="editor-ruler-origin-label">${this.formatRulerLabel(0)}</div>
            </div>
        `;
        if (this.elements.timelineBody) {
            this.elements.timelineBody.style.setProperty('--editor-playhead-x', `${Math.max(0, Math.min(laneWidth, playheadOffset))}px`);
        }
        this.playheadManager.attachTarget(this.elements.ruler, renderDuration);
        this.playheadManager.updateDuration(renderDuration);
        return { safeDuration, renderDuration, laneWidth };
    }

    resolveRulerTickStep(renderDuration, laneWidth) {
        const safeDuration = Math.max(Number(renderDuration) || 0, 1);
        const safeLaneWidth = Math.max(Number(laneWidth) || 0, 1);
        const pixelsPerSecond = safeLaneWidth / safeDuration;
        const minLabelSpacingPx = 72;
        const minTickSpacingPx = 28;
        const candidateSteps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800];

        const labelStep = candidateSteps.find((step) => step * pixelsPerSecond >= minLabelSpacingPx)
            || candidateSteps[candidateSteps.length - 1];
        const minorDivisor = labelStep >= 60 ? 3 : labelStep >= 10 ? 2 : 1;
        const minorStep = Math.max(labelStep / minorDivisor, 1);

        if (minorStep * pixelsPerSecond >= minTickSpacingPx) {
            return minorStep;
        }

        return labelStep;
    }

    truncateLabel(value, maxLength = 34) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(1, maxLength - 3))}...`;
    }

    clearTrackReorderState() {
        this.elements.tracksRoot?.querySelectorAll('.editor-track-label').forEach((label) => {
            label.classList.remove('is-track-reorder-dragging', 'is-track-reorder-target-above', 'is-track-reorder-target-below');
            delete label.dataset.reorderPosition;
        });
    }

    resolveTrackReorderPosition(container, clientY) {
        const rect = container?.getBoundingClientRect?.() || { top: 0, height: 0 };
        const midpoint = (Number(rect.top) || 0) + ((Number(rect.height) || 0) / 2);
        return clientY < midpoint ? 'above' : 'below';
    }

    attachTrackReorder(container, trackName) {
        if (!container || container.dataset.reorderBound === 'true') return;
        container.dataset.reorderBound = 'true';
        container.draggable = true;

        const isControlTarget = (target) => !!target?.closest?.('.editor-track-label-btn, .editor-track-resize-handle');

        container.addEventListener('dragstart', (event) => {
            if (isControlTarget(event.target)) {
                event.preventDefault();
                return;
            }

            event.dataTransfer?.setData('text/editor-track-id', trackName);
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
            this.flow.store.selectTrack(trackName);
            this.clearTrackReorderState();
            container.classList.add('is-track-reorder-dragging');
        });

        container.addEventListener('dragover', (event) => {
            const draggedTrackId = event.dataTransfer?.getData('text/editor-track-id');
            if (!draggedTrackId || draggedTrackId === trackName) return;

            event.preventDefault();
            const position = this.resolveTrackReorderPosition(container, Number(event.clientY) || 0);
            this.clearTrackReorderState();
            container.classList.add(position === 'above' ? 'is-track-reorder-target-above' : 'is-track-reorder-target-below');
            container.dataset.reorderPosition = position;
        });

        container.addEventListener('dragleave', (event) => {
            if (event.currentTarget !== container) return;
            if (event.relatedTarget && container.contains(event.relatedTarget)) return;
            container.classList.remove('is-track-reorder-target-above', 'is-track-reorder-target-below');
            delete container.dataset.reorderPosition;
        });

        container.addEventListener('drop', (event) => {
            const draggedTrackId = event.dataTransfer?.getData('text/editor-track-id');
            if (!draggedTrackId || draggedTrackId === trackName) return;

            event.preventDefault();
            const position = container.dataset.reorderPosition || this.resolveTrackReorderPosition(container, Number(event.clientY) || 0);
            this.flow.store.moveTrack?.(draggedTrackId, trackName, position);
            this.clearTrackReorderState();
        });

        container.addEventListener('dragend', () => {
            this.clearTrackReorderState();
        });
    }

    stripExtension(value) {
        return String(value || '').trim().replace(/\.[a-z0-9]{2,5}$/i, '');
    }

    getTrackTypeLabel(type) {
        if (type === 'audio') return '音频';
        if (type === 'image') return '图像';
        return '视频';
    }

    getTrackDisplayName(trackName, state) {
        return String(state?.trackMeta?.[trackName]?.name || trackName || '').toUpperCase();
    }

    getCleanClipLabel(clip, asset) {
        const kind = clip?.kind || asset?.kind || 'video';
        const text = this.stripExtension(clip?.name || asset?.name || '').replace(/\s+/g, ' ').trim();
        if (!text) {
            if (kind === 'audio') return '音频片段';
            if (kind === 'image') return '图片';
            return '视频片段';
        }
        if (/(views?|reactions?|likes?|comments?)/i.test(text) && text.length > 20) {
            if (kind === 'audio') return '音频片段';
            if (kind === 'image') return '图片';
            return '视频片段';
        }
        return text;
    }

    formatRulerLabel(value) {
        const time = Math.max(Number(value) || 0, 0);
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    formatClipDuration(value) {
        return `${Math.max(Number(value) || 0, 0).toFixed(1)}s`;
    }

    escapeMediaUrl(source) {
        const value = String(source || '').trim();
        if (!value) return '';
        return value.replace(/"/g, '&quot;');
    }

    getClipVisualSource(asset) {
        const source = String(asset?.src || '').trim();
        if (!source) return '';
        return this.escapeMediaUrl(source);
    }

    isMajorTick(value, tickStep, safeDuration) {
        const majorStep = tickStep === 1 ? 5 : tickStep * 2;
        if (value <= 0.001) return true;
        if (value + tickStep > safeDuration) return true;
        return Math.abs(value % majorStep) < 0.001;
    }

    buildClipMarkup(clip, asset, options = {}) {
        const clipKind = clip?.kind || asset?.kind || 'video';
        const cleanLabel = this.getCleanClipLabel(clip, asset);
        const linkedBadge = options.isLinkedGroup
            ? '<span class="editor-clip-link-badge" aria-hidden="true"><i class="fa-solid fa-link"></i></span>'
            : '';
        const visual = clipKind === 'video'
            ? this.buildVideoFilmstripMarkup(clip, asset, options.clipPixelWidth, options.clipPixelHeight)
            : '';
        // Kick off peak extraction for A-track (video source or pure audio)
        if (clipKind === 'audio' && asset) {
            this.flow.ensureWaveformForAsset?.(asset);
        }
        const waveform = clipKind === 'audio' ? this.buildWaveformMarkup(clip, asset, options) : '';
        const overlayContent = clipKind === 'video'
            ? ''
            : `
                ${waveform}
                <span class="editor-clip-topline">
                    <span class="editor-clip-kind">${this.getTrackTypeLabel(clipKind)}</span>
                    <span class="editor-clip-meta">${this.formatClipDuration(clip?.duration)}</span>
                </span>
                <span class="editor-clip-name">${this.truncateLabel(cleanLabel, 24)}</span>
            `;
        return {
            title: cleanLabel,
            content: `
                <span class="editor-clip-handle editor-clip-handle-start" data-edge="start" aria-hidden="true"></span>
                ${visual}
                ${linkedBadge}
                <span class="editor-clip-content">
                    ${overlayContent}
                </span>
                <span class="editor-clip-handle editor-clip-handle-end" data-edge="end" aria-hidden="true"></span>
            `
        };
    }

    /**
     * Pro-NLE style waveform:
     * - Peaks are a compact pyramid (fixed sample budget for the whole media)
     * - Canvas only covers the *visible* intersection of each clip with the timeline viewport
     * - Bitmap resolution matches visible CSS pixels (1 bar ≈ 1 px) so long clips stay sharp when scrolling
     * Never paint a multi-hour clip as one giant stretched texture.
     */
    static WAVEFORM_CANVAS_MAX_CSS_W = 2400;
    static WAVEFORM_CANVAS_MAX_CSS_H = 96;
    static WAVEFORM_VIEW_PAD_PX = 80;

    buildWaveformMarkup(clip, asset, options = {}) {
        if (this.flow.timelineViewportManager?.zoomOptimizer?.isZooming) {
            return this.flow.timelineViewportManager.zoomOptimizer.buildZoomingWaveform();
        }
        const h = Math.min(
            Math.max(28, Math.round(Number(options.clipPixelHeight) || 44)),
            EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_H
        );
        const assetId = String(asset?.id || '').replace(/"/g, '');
        const clipId = String(clip?.id || '').replace(/"/g, '');
        // Initial stub size; paintClipWaveforms repositions + resizes to the visible slice.
        return `
            <canvas
                class="editor-clip-waveform-canvas"
                data-clip-id="${clipId}"
                data-asset-id="${assetId}"
                width="320"
                height="${h}"
                aria-hidden="true"
            ></canvas>
        `;
    }

    normalizeWaveformPeaks(rawPeaks) {
        if (!Array.isArray(rawPeaks) || !rawPeaks.length) return null;
        const peaks = rawPeaks.map((p) => {
            if (Array.isArray(p)) return Math.max(...p.map((n) => Math.abs(Number(n) || 0)));
            if (p && typeof p === 'object') return Math.abs(Number(p.max ?? p.peak ?? p.v ?? 0) || 0);
            return Math.abs(Number(p) || 0);
        });
        // Some extractors return 0–255 integers; normalize to 0–1 when needed.
        let max = 0;
        for (let i = 0; i < peaks.length; i += 1) {
            if (peaks[i] > max) max = peaks[i];
        }
        if (max > 1.5) {
            const scale = 1 / max;
            return peaks.map((p) => p * scale);
        }
        return peaks;
    }

    scheduleWaveformPaint(state = null) {
        if (this._waveformPaintRaf) return;
        this._waveformPaintRaf = requestAnimationFrame(() => {
            this._waveformPaintRaf = 0;
            const nextState = state || this.flow.store?.getState?.() || this.lastRenderedState;
            if (nextState) this.paintClipWaveforms(nextState);
        });
    }

    /**
     * Visible media-stage rect (excludes sticky track-label gutter when possible).
     */
    getTimelineViewportRect() {
        const body = this.elements?.timelineBody
            || document.querySelector('#page-editor .editor-timeline-body');
        if (!body) return null;
        const bodyRect = body.getBoundingClientRect();
        const gutter = Number(this.flow.timelineViewportManager?.getTrackOffsetWidth?.(body))
            || Number.parseFloat(getComputedStyle(body).getPropertyValue('--editor-track-label-width'))
            || 84;
        const pad = EditorTimelineManager.WAVEFORM_VIEW_PAD_PX;
        return {
            left: bodyRect.left + gutter - pad,
            right: bodyRect.right + pad,
            top: bodyRect.top,
            bottom: bodyRect.bottom,
            width: Math.max(1, bodyRect.width - gutter)
        };
    }

    /**
     * Paint every audio-clip canvas for the current viewport only (Pro NLE approach).
     * Uses getBoundingClientRect so sticky gutters / scroll don't desync content coords.
     */
    paintClipWaveforms(state) {
        const root = this.elements?.tracksRoot;
        if (!root) return;
        const assets = state?.assets || [];
        const view = this.getTimelineViewportRect();
        const canvases = root.querySelectorAll('canvas.editor-clip-waveform-canvas');

        canvases.forEach((canvas) => {
            const clipEl = canvas.closest?.('.editor-clip');
            if (!clipEl) return;

            const clipWidth = Math.max(
                1,
                Number.parseFloat(clipEl.style.width) || clipEl.offsetWidth || 120
            );
            const clipRect = clipEl.getBoundingClientRect();

            if (!view || clipRect.right < view.left || clipRect.left > view.right) {
                canvas.style.visibility = 'hidden';
                return;
            }
            canvas.style.visibility = 'visible';

            // Visible slice in clip-local CSS pixels
            const localStart = Math.max(0, view.left - clipRect.left);
            const localEnd = Math.min(clipWidth, view.right - clipRect.left);
            const visibleW = Math.max(1, localEnd - localStart);
            const paintW = Math.min(visibleW, EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_W);
            const paintH = Math.min(
                Math.max(24, clipEl.clientHeight - 4 || 40),
                EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_H
            );

            // Pin canvas to the visible window inside the clip (not full-clip stretch)
            canvas.style.left = `${Math.round(localStart)}px`;
            canvas.style.width = `${Math.round(paintW)}px`;
            canvas.style.right = 'auto';
            canvas.style.top = '2px';
            canvas.style.bottom = '2px';
            canvas.style.height = 'auto';

            const assetId = canvas.dataset.assetId;
            const asset = assets.find((a) => a.id === assetId);
            const peaks = this.normalizeWaveformPeaks(asset?.waveformPeaks);

            // Peak range for this visible time slice of the whole media
            const peakStart = localStart / clipWidth;
            const peakEnd = localEnd / clipWidth;

            this.paintWaveformCanvas(canvas, peaks, assetId || canvas.dataset.clipId || '', {
                cssW: paintW,
                cssH: paintH,
                peakStart,
                peakEnd
            });
        });
    }

    paintWaveformCanvas(canvas, peaks, seedKey = '', options = {}) {
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.max(
            1,
            Math.min(
                Number(options.cssW) || canvas.clientWidth || Number(canvas.getAttribute('width')) || 120,
                EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_W
            )
        );
        const cssH = Math.max(
            1,
            Math.min(
                Number(options.cssH) || canvas.clientHeight || Number(canvas.getAttribute('height')) || 40,
                EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_H
            )
        );
        const w = Math.max(8, Math.round(cssW * dpr));
        const h = Math.max(8, Math.round(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Opaque dark lane — never leave transparent (button default can flash white underneath)
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(0, 0, w, h);

        // Mid line
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = Math.max(1, dpr * 0.6);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // 1 bar per device-independent CSS pixel for sharp professional density
        const cols = Math.max(12, Math.min(EditorTimelineManager.WAVEFORM_CANVAS_MAX_CSS_W, Math.round(cssW)));
        const samples = new Array(cols).fill(0);
        const peakStart = Math.min(1, Math.max(0, Number(options.peakStart) || 0));
        const peakEnd = Math.min(1, Math.max(peakStart + 0.0001, Number(options.peakEnd) || 1));

        if (peaks && peaks.length) {
            const rangeStart = peakStart * peaks.length;
            const rangeEnd = peakEnd * peaks.length;
            const rangeLen = Math.max(1, rangeEnd - rangeStart);
            for (let i = 0; i < cols; i += 1) {
                const start = Math.floor(rangeStart + (i / cols) * rangeLen);
                const end = Math.max(start + 1, Math.floor(rangeStart + ((i + 1) / cols) * rangeLen));
                let max = 0;
                for (let p = start; p < end && p < peaks.length; p += 1) {
                    if (peaks[p] > max) max = peaks[p];
                }
                samples[i] = max;
            }
        } else {
            // Quiet placeholder until real peaks land — speech-like, not solid bars
            let seed = 0;
            for (let i = 0; i < seedKey.length; i += 1) seed = (seed + seedKey.charCodeAt(i) * (i + 3)) % 9973;
            for (let i = 0; i < cols; i += 1) {
                const t = peakStart + ((i / Math.max(cols - 1, 1)) * (peakEnd - peakStart));
                const env = Math.sin(Math.PI * Math.min(1, t * 1.02));
                const grain = 0.2 + 0.8 * (((seed + i * 47) % 100) / 100);
                const pulse = Math.abs(Math.sin(t * Math.PI * 14 + seed * 0.02));
                samples[i] = Math.max(0.04, env * grain * (0.25 + pulse * 0.75));
            }
        }

        let localMax = 0.05;
        for (let i = 0; i < samples.length; i += 1) {
            if (samples[i] > localMax) localMax = samples[i];
        }

        // Filled envelope (Pro-style solid wave, not sparse sticks)
        const mid = h / 2;
        const maxH = h * 0.44;
        const barGap = Math.max(0, dpr * 0.25);
        const barW = Math.max(dpr * 0.85, (w / cols) - barGap);

        ctx.fillStyle = peaks ? 'rgba(96, 165, 250, 0.88)' : 'rgba(96, 165, 250, 0.42)';
        for (let i = 0; i < cols; i += 1) {
            const ratio = Math.min(1, samples[i] / localMax);
            const shaped = Math.pow(ratio, 0.65);
            const amp = Math.max(dpr * 1.1, shaped * maxH);
            const x = (i / cols) * w + barGap * 0.5;
            ctx.fillRect(x, mid - amp, barW, amp * 2);
        }

        // Soft highlight top edge for depth
        if (peaks) {
            ctx.fillStyle = 'rgba(191, 219, 254, 0.35)';
            for (let i = 0; i < cols; i += 1) {
                const ratio = Math.min(1, samples[i] / localMax);
                const shaped = Math.pow(ratio, 0.65);
                const amp = Math.max(dpr * 1.1, shaped * maxH);
                const x = (i / cols) * w + barGap * 0.5;
                ctx.fillRect(x, mid - amp, barW, Math.max(dpr, amp * 0.18));
            }
        }
    }

    getVideoFilmstripAspectRatio(asset) {
        const width = Math.max(Number(asset?.width) || 0, 0);
        const height = Math.max(Number(asset?.height) || 0, 0);
        if (width > 0 && height > 0) {
            return Number((width / height).toFixed(4));
        }
        return 16 / 9;
    }

    getVideoFilmstripLayout(asset, clipPixelWidth = 0, clipPixelHeight = 0, sourceFrameCount = 1) {
        const safeSourceFrameCount = Math.max(Number(sourceFrameCount) || 0, 1);
        const safeClipWidth = Math.max(Number(clipPixelWidth) || 0, 0);
        const safeClipHeight = Math.max(Number(clipPixelHeight) || 0, 24);
        const aspectRatio = this.getVideoFilmstripAspectRatio(asset);
        const naturalFrameWidth = Number((safeClipHeight * aspectRatio).toFixed(3)) || 0;
        const minimumReadableWidth = aspectRatio < 1 ? 76 : 104;
        const frameWidth = Math.max(naturalFrameWidth, minimumReadableWidth);
        const requiredFrameCount = safeClipWidth > 0
            ? Math.max(Math.ceil(safeClipWidth / frameWidth), 1)
            : safeSourceFrameCount;

        return {
            frameWidth,
            renderedFrameCount: Math.min(Math.max(requiredFrameCount, 1), 240)
        };
    }

    getClipFilmstripSourceRange(clip, asset) {
        const sourceStart = Math.max(Number(clip?.sourceStart) || 0, 0);
        const speed = Math.max(Number(clip?.speed) || 1, 0.01);
        const timelineDuration = Math.max(Number(clip?.duration) || 0, 0.1);
        const fallbackEnd = sourceStart + (timelineDuration * speed);
        const rawSourceEnd = Number(clip?.sourceEnd);
        const sourceEnd = Number.isFinite(rawSourceEnd) && rawSourceEnd > sourceStart
            ? rawSourceEnd
            : fallbackEnd;
        const durationCandidates = [
            Number(asset?.duration) || 0,
            Number(clip?.sourceDuration) || 0,
            sourceEnd,
            fallbackEnd
        ];
        const sourceDuration = Math.max(...durationCandidates, 0.1);
        const clampedStart = Math.min(Math.max(sourceStart, 0), Math.max(sourceDuration - 0.001, 0));
        const clampedEnd = Math.min(Math.max(sourceEnd, clampedStart + 0.001), sourceDuration);

        return {
            start: clampedStart,
            end: clampedEnd,
            duration: Math.max(sourceDuration, clampedEnd, 0.1)
        };
    }

    resolveFilmstripSourceIndex(renderIndex, renderedFrameCount, sourceFrameCount, clip, asset) {
        const safeSourceFrameCount = Math.max(Number(sourceFrameCount) || 0, 1);
        if (safeSourceFrameCount <= 1) return 0;

        const range = this.getClipFilmstripSourceRange(clip, asset);
        const safeRenderedFrameCount = Math.max(Number(renderedFrameCount) || 0, 1);
        const frameProgress = safeRenderedFrameCount > 1
            ? Math.min(Math.max(renderIndex / (safeRenderedFrameCount - 1), 0), 1)
            : 0.5;
        const sourceTime = range.start + ((range.end - range.start) * frameProgress);
        const sourceProgress = range.duration > 0
            ? Math.min(Math.max(sourceTime / range.duration, 0), 1)
            : frameProgress;

        return Math.min(
            safeSourceFrameCount - 1,
            Math.max(0, Math.round(sourceProgress * (safeSourceFrameCount - 1)))
        );
    }

    buildVideoFilmstripMarkup(clip, asset, clipPixelWidth = 0, clipPixelHeight = 0) {
        if (this.flow.timelineViewportManager?.zoomOptimizer?.isZooming) {
            return this.flow.timelineViewportManager.zoomOptimizer.buildZoomingVideoFilmstrip();
        }
        const spriteSource = this.escapeMediaUrl(asset?.filmstripSprite?.src);
        const spriteFrameCount = Math.max(Number(asset?.filmstripSprite?.frameCount) || 0, 0);
        if (spriteSource && spriteFrameCount) {
            const layout = this.getVideoFilmstripLayout(asset, clipPixelWidth, clipPixelHeight, spriteFrameCount);
            const frames = Array.from({ length: layout.renderedFrameCount }, (_, index) => {
                const sourceIndex = this.resolveFilmstripSourceIndex(index, layout.renderedFrameCount, spriteFrameCount, clip, asset);
                const position = spriteFrameCount > 1
                    ? Number(((sourceIndex / (spriteFrameCount - 1)) * 100).toFixed(4))
                    : 50;
                return `
                    <span
                        class="editor-clip-filmstrip-frame is-sprite"
                        style="background-image:url(&quot;${spriteSource}&quot;); background-size:${spriteFrameCount * 100}% 100%; background-position:${position}% center; --filmstrip-frame-offset:${index};"
                    ></span>
                `;
            }).join('');

            return `<span class="editor-clip-filmstrip" style="--editor-filmstrip-frame-count:${layout.renderedFrameCount}; --editor-filmstrip-frame-width:${layout.frameWidth}px;" aria-hidden="true">${frames}</span>`;
        }

        const frameSources = Array.isArray(asset?.filmstripFrames)
            ? asset.filmstripFrames.map((frame) => this.escapeMediaUrl(frame)).filter(Boolean)
            : [];
        if (!frameSources.length) {
            if (asset?.src) {
                this.flow.ensureFilmstripForAsset?.(asset);
            }
            return '<span class="editor-clip-filmstrip editor-clip-filmstrip-fallback" aria-hidden="true"></span>';
        }

        const layout = this.getVideoFilmstripLayout(asset, clipPixelWidth, clipPixelHeight, frameSources.length);
        const frames = Array.from({ length: layout.renderedFrameCount }, (_, index) => {
            const sourceIndex = this.resolveFilmstripSourceIndex(index, layout.renderedFrameCount, frameSources.length, clip, asset);
            const frameSource = frameSources[sourceIndex];
            return `
                <span
                    class="editor-clip-filmstrip-frame"
                    style="background-image:url(&quot;${frameSource}&quot;); --filmstrip-frame-offset:${index};"
                ></span>
            `;
        }).join('');

        return `<span class="editor-clip-filmstrip" style="--editor-filmstrip-frame-count:${layout.renderedFrameCount}; --editor-filmstrip-frame-width:${layout.frameWidth}px;" aria-hidden="true">${frames}</span>`;
    }

    renderTrackLabel(container, trackName, label, state) {
        if (!container) return;
        const control = state.trackControls?.[trackName] || { muted: false, locked: false, hidden: false, solo: false };
        const soloClass = control.solo ? ' is-active' : '';
        const mutedClass = control.muted ? ' is-active' : '';
        const hiddenClass = control.hidden ? ' is-active' : '';
        const soloLabel = control.solo ? '取消独听轨道' : '独听轨道';
        const hiddenLabel = control.hidden ? '显示轨道' : '隐藏轨道';
        const mutedLabel = control.muted ? '取消静音轨道' : '静音轨道';
        const trackType = this.flow.store.getTrackType(trackName) || state.trackMeta?.[trackName]?.type || 'video';
        container.dataset.track = trackName;
        container.dataset.trackType = trackType;
        container.classList.toggle('is-locked', !!control.locked);
        container.classList.toggle('is-selected', state.selectedTrackName === trackName);

        container.innerHTML = `
            <div class="editor-track-label-copy">
                <div class="editor-track-label-head">
                    <div class="editor-track-label-title-row">
                        <span class="editor-track-label-chip">${this.getTrackDisplayName(trackName, state) || label || trackName.toUpperCase()}</span>
                        <span class="editor-track-label-kind">${this.getTrackTypeLabel(trackType)}</span>
                    </div>
                    <div class="editor-track-label-actions">
                        <button type="button" class="editor-track-label-btn${soloClass}" data-track-action="solo" title="${soloLabel}" aria-label="${soloLabel}" aria-pressed="${control.solo ? 'true' : 'false'}">
                            <i class="fa-solid fa-bullseye"></i>
                        </button>
                        <button type="button" class="editor-track-label-btn${hiddenClass}" data-track-action="hide" title="${hiddenLabel}" aria-label="${hiddenLabel}" aria-pressed="${control.hidden ? 'true' : 'false'}">
                            <i class="fa-solid ${control.hidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button type="button" class="editor-track-label-btn${mutedClass}" data-track-action="mute" title="${mutedLabel}" aria-label="${mutedLabel}" aria-pressed="${control.muted ? 'true' : 'false'}">
                            <i class="fa-solid ${control.muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>
                        </button>
                    </div>
                    <div class="editor-track-resize-handle" data-track-action="resize" title="调整轨道高度" aria-hidden="true"></div>
                </div>
            </div>
        `;

        container.addEventListener('click', (event) => {
            const onControl = event.target?.closest?.('.editor-track-label-btn');
            if (onControl) return;
            this.flow.store.selectTrack(trackName);
        });

        container.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const onControl = event.target?.closest?.('.editor-track-label-btn');
            if (onControl) return;
            this.flow.store.selectTrack(trackName);
            this.showTrackContextMenu(trackName, event);
        });

        this.elements.trackContextMenu?.querySelectorAll('[data-action]')?.forEach((button) => {
            button.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const action = button.dataset.action;
                const targetTrackId = this.contextMenuState.trackId;
                this.hideTrackContextMenu();
                this.runTrackContextMenuAction(action, targetTrackId);
            };
        });

        container.querySelector('[data-track-action="solo"]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.flow.store.selectTrack(trackName);
            this.flow.store.toggleTrackSolo(trackName);
        });

        container.querySelector('[data-track-action="hide"]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.flow.store.selectTrack(trackName);
            this.flow.store.toggleTrackHidden(trackName);
        });

        container.querySelector('[data-track-action="mute"]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.flow.store.selectTrack(trackName);
            this.flow.store.toggleTrackMuted(trackName);
        });

        this.attachTrackResizeHandle(container.querySelector('[data-track-action="resize"]'), trackName, state);
        this.attachTrackReorder(container, trackName);
    }

    createTrackRow(trackId) {
        const row = document.createElement('div');
        row.className = 'editor-timeline-track';
        const gutterShield = document.createElement('div');
        gutterShield.className = 'editor-track-gutter-shield';
        gutterShield.setAttribute('aria-hidden', 'true');

        const label = document.createElement('div');
        label.className = 'editor-track-label';
        label.dataset.trackId = trackId;

        const lane = document.createElement('div');
        lane.className = 'editor-track-lane';
        lane.dataset.trackId = trackId;

        row.appendChild(gutterShield);
        row.appendChild(label);
        row.appendChild(lane);
        return { row, label, lane };
    }

    renderTrack(container, trackName, clips = [], assets = [], selectedClipIds = [], primarySelectedClipId = null, state, renderDuration, laneWidth, trackHeight = 64) {
        if (!container) return;
        container.innerHTML = '';

        const safeDuration = Math.max(Number(renderDuration) || 0, 10);
        const safeLaneWidth = Math.max(Number(laneWidth) || 0, 720);
        const trackType = this.flow.store.getTrackType(trackName) || state.trackMeta?.[trackName]?.type || 'video';
        const playheadOffset = (Math.max(state.playheadTime || 0, 0) / safeDuration) * safeLaneWidth;
        container.style.minWidth = `${safeLaneWidth}px`;
        container.style.width = `${safeLaneWidth}px`;
        container.style.minHeight = `${Math.min(Math.max(trackHeight, 52), 180)}px`;
        container.style.setProperty('--editor-playhead-x', `${Math.max(0, Math.min(safeLaneWidth, playheadOffset))}px`);
        container.dataset.trackType = trackType;
        container.classList.toggle('is-track-hidden', !!state.trackControls?.[trackName]?.hidden);
        container.classList.toggle('is-track-inactive', !this.flow.store.isTrackActive(trackName));
        container.classList.toggle('is-selected-track', state.selectedTrackName === trackName);
        container.onclick = (event) => {
            const target = event.target;
            if (!target?.closest?.('.editor-clip')) {
                this.flow.store.clearClipSelection();
                this.flow.store.selectTrack(trackName);
            }
        };
        this.playheadManager.attachTarget(container, safeDuration);

        if (state.trackControls?.[trackName]?.hidden) {
            container.innerHTML = '<div class="editor-track-empty">' + (window.i18n?.t('editor.trackHidden') || 'Track is hidden.') + '</div>';
            return;
        }

        if (!this.flow.store.isTrackActive(trackName)) {
            container.innerHTML = '<div class="editor-track-empty">' + (window.i18n?.t('editor.trackSoloInactive') || 'Track is inactive outside solo.') + '</div>';
            return;
        }

        if (clips.length === 0) {
            const lockText = state.trackControls?.[trackName]?.locked
                ? (window.i18n?.t?.('editor.trackLocked') || '轨道已锁定。')
                : (window.i18n?.t?.('editor.dropHint') || '把素材拖到这里，或使用“插入”加入时间线。');
            container.innerHTML = `<div class="editor-track-empty">${lockText}</div>`;
            return;
        }

        const trackLocked = !!state.trackControls?.[trackName]?.locked;
        const pulsePrimarySelection = this.shouldPulsePrimarySelection(state);
        const selectedLinkedGroupIds = new Set(
            (selectedClipIds || [])
                .map((selectedClipId) => this.flow.store.findClipById?.(selectedClipId)?.clip?.linkGroupId)
                .filter(Boolean)
        );

        clips.forEach((clip) => {
            const asset = assets.find(item => item.id === clip.assetId);
            const isSelected = selectedClipIds.includes(clip.id);
            const isPrimary = primarySelectedClipId === clip.id;
            const linkedClipIds = clip.linkGroupId ? (this.flow.store.getLinkedClipIds?.(clip.id) || []) : [];
            const isLinkedGroup = linkedClipIds.length > 1;
            const isLinkedCompanion = !isSelected && !!clip.linkGroupId && selectedLinkedGroupIds.has(clip.linkGroupId);
            const block = document.createElement('button');
            block.type = 'button';
            block.dataset.clipId = clip.id;
            if (clip.linkGroupId) {
                block.dataset.linkGroupId = clip.linkGroupId;
            }
            const clipKind = clip.kind || asset?.kind || this.flow.store.getTrackType(trackName) || 'video';
            block.className = `editor-clip editor-clip-${clipKind}${isSelected ? ' is-selected' : ''}${isPrimary ? ' is-primary-selected' : ''}${isPrimary && pulsePrimarySelection ? ' is-feedback-pulse' : ''}${trackLocked ? ' is-track-locked' : ''}${isLinkedGroup ? ' is-linked-group' : ''}${isLinkedCompanion ? ' is-linked-companion' : ''}`;
            block.style.left = `${(clip.timelineStart / safeDuration) * safeLaneWidth}px`;
            const clipPixelWidth = Math.max((clip.duration / safeDuration) * safeLaneWidth, 48);
            const clipPixelHeight = Math.max(Math.min(Math.max(trackHeight, 52), 180) - 10, 24);
            block.style.width = `${clipPixelWidth}px`;
            const clipMarkup = this.buildClipMarkup(clip, asset, {
                clipPixelWidth,
                clipPixelHeight,
                isLinkedGroup
            });
            block.title = clipMarkup.title;
            block.innerHTML = clipMarkup.content;
            block.addEventListener('click', (event) => {
                const additive = event.ctrlKey || event.metaKey;
                this.flow.store.setClipSelection(clip.id, {
                    additive,
                    toggle: additive,
                    preservePlayhead: true
                });
            });
            block.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const currentSelection = this.flow.store.getState().selectedClipIds || [];
                if (!currentSelection.includes(clip.id)) {
                    this.flow.store.setSelectedClips([clip.id], clip.id);
                }
                this.showClipContextMenu(clip.id, event);
            });
            this.dragManager.attachClip(block, clip, safeDuration);
            this.trimManager.attachHandle(block.querySelector('[data-edge="start"]'), clip, safeDuration, 'start');
            this.trimManager.attachHandle(block.querySelector('[data-edge="end"]'), clip, safeDuration, 'end');
            container.appendChild(block);
        });
    }

    // 比较选中的片段列表是否相同
    areClipSelectionsEqual(prev, next) {
        if (prev.selectedClipId !== next.selectedClipId) return false;
        const prevIds = prev.selectedClipIds || [];
        const nextIds = next.selectedClipIds || [];
        if (prevIds.length !== nextIds.length) return false;
        const prevSet = new Set(prevIds);
        return nextIds.every(id => prevSet.has(id));
    }

    shouldPulsePrimarySelection(state) {
        if (!this.lastRenderedState || !state?.selectedClipId) return false;
        if (this.lastRenderedState.selectedClipId !== state.selectedClipId) return true;

        const prevIds = this.lastRenderedState.selectedClipIds || [];
        const nextIds = state.selectedClipIds || [];
        if (prevIds.length !== nextIds.length) return true;

        const prevSet = new Set(prevIds);
        return nextIds.some((clipId) => !prevSet.has(clipId));
    }

    // 比较轨道配置信息（排序、高度、静音、锁定等）是否相同
    areTrackConfigsEqual(prev, next) {
        const prevOrder = prev.trackOrder || [];
        const nextOrder = next.trackOrder || [];
        if (prevOrder.length !== nextOrder.length) return false;
        for (let i = 0; i < prevOrder.length; i++) {
            if (prevOrder[i] !== nextOrder[i]) return false;
        }
        for (const trackId of nextOrder) {
            const pc = prev.trackControls?.[trackId] || {};
            const nc = next.trackControls?.[trackId] || {};
            if (pc.muted !== nc.muted || pc.locked !== nc.locked ||
                pc.hidden !== nc.hidden || pc.solo !== nc.solo) return false;
            const pm = prev.trackMeta?.[trackId] || {};
            const nm = next.trackMeta?.[trackId] || {};
            if (pm.name !== nm.name || pm.height !== nm.height) return false;
        }
        return true;
    }

    // 比较所有轨道中的片段列表及属性是否相同
    areTimelineClipsEqual(prev, next) {
        const trackIds = next.trackOrder || [];
        for (const trackId of trackIds) {
            const pc = prev.timeline?.[trackId] || [];
            const nc = next.timeline?.[trackId] || [];
            if (pc.length !== nc.length) return false;
            for (let i = 0; i < pc.length; i++) {
                const pClip = pc[i];
                const nClip = nc[i];
                if (pClip.id !== nClip.id ||
                    pClip.assetId !== nClip.assetId ||
                    pClip.timelineStart !== nClip.timelineStart ||
                    pClip.duration !== nClip.duration ||
                    pClip.kind !== nClip.kind ||
                    pClip.trimStart !== nClip.trimStart ||
                    pClip.trimEnd !== nClip.trimEnd) return false;
            }
        }
        return true;
    }

    // 比较素材资源列表和关键生成状态是否相同
    areAssetsEqual(prev, next) {
        const prevAssets = prev.assets || [];
        const nextAssets = next.assets || [];
        if (prevAssets.length !== nextAssets.length) return false;
        for (let i = 0; i < prevAssets.length; i++) {
            const pa = prevAssets[i];
            const na = nextAssets[i];
            if (pa.id !== na.id || pa.name !== na.name ||
                pa.kind !== na.kind || pa.duration !== na.duration ||
                (Number(pa.width) || 0) !== (Number(na.width) || 0) ||
                (Number(pa.height) || 0) !== (Number(na.height) || 0)) return false;
            const paFrames = Array.isArray(pa.filmstripFrames) ? pa.filmstripFrames.length : 0;
            const naFrames = Array.isArray(na.filmstripFrames) ? na.filmstripFrames.length : 0;
            if (paFrames !== naFrames) return false;
            const paSpriteSrc = pa.filmstripSprite?.src || '';
            const naSpriteSrc = na.filmstripSprite?.src || '';
            const paSpriteCount = pa.filmstripSprite?.frameCount || 0;
            const naSpriteCount = na.filmstripSprite?.frameCount || 0;
            if (paSpriteSrc !== naSpriteSrc || paSpriteCount !== naSpriteCount) return false;
        }
        return true;
    }

    // 快速判断时间线结构是否发生变动以决定是否进行全量渲染
    shouldPerformFullRender(prev, next) {
        if (prev.timelineZoom !== next.timelineZoom) return true;
        if (prev.selectedTrackName !== next.selectedTrackName) return true;
        if (!this.areClipSelectionsEqual(prev, next)) return true;
        if (!this.areTrackConfigsEqual(prev, next)) return true;
        if (!this.areTimelineClipsEqual(prev, next)) return true;
        if (!this.areAssetsEqual(prev, next)) return true;
        return false;
    }

    // 仅更新播放指针的位置和对应的时间显示，避免 DOM 重建
    updatePlayheadOnly(playheadTime) {
        const totalDuration = Math.max(10, Number(this.flow.store.getTimelineDuration?.()) || 0);
        const zoom = Number(this.flow.store.getState().timelineZoom);
        const metrics = this.resolveTimelineMetrics(totalDuration, zoom);
        const renderDuration = metrics.renderDuration;
        const laneWidth = metrics.laneWidth;
        const playheadOffset = (Math.max(playheadTime || 0, 0) / renderDuration) * laneWidth;

        if (this.elements.timelineBody) {
            this.elements.timelineBody.style.setProperty('--editor-playhead-x', `${Math.max(0, Math.min(laneWidth, playheadOffset))}px`);
        }

        if (this.elements.playheadTime) {
            this.elements.playheadTime.textContent = this.formatTimelineTime(playheadTime);
        }
    }

    // 缓存当前已渲染状态的摘要以作为下一次比对的基准
    cacheRenderedState(state) {
        if (!state) {
            this.lastRenderedState = null;
            return;
        }

        const cachedAssets = (state.assets || []).map(asset => {
            const rest = { ...asset };
            delete rest.waveformPeaks;
            return {
                ...rest,
                filmstripFrames: Array.isArray(asset.filmstripFrames) ? [...asset.filmstripFrames] : undefined,
                filmstripSprite: asset.filmstripSprite ? { ...asset.filmstripSprite } : undefined
            };
        });

        const cachedTimeline = {};
        if (state.timeline) {
            for (const trackId in state.timeline) {
                if (Object.prototype.hasOwnProperty.call(state.timeline, trackId)) {
                    cachedTimeline[trackId] = (state.timeline[trackId] || []).map(clip => ({ ...clip }));
                }
            }
        }

        const cachedControls = {};
        const cachedMeta = {};
        const trackIds = state.trackOrder || [];
        trackIds.forEach(trackId => {
            if (state.trackControls?.[trackId]) {
                cachedControls[trackId] = { ...state.trackControls[trackId] };
            }
            if (state.trackMeta?.[trackId]) {
                cachedMeta[trackId] = { ...state.trackMeta[trackId] };
            }
        });

        this.lastRenderedState = {
            timelineZoom: state.timelineZoom,
            selectedTrackName: state.selectedTrackName,
            selectedClipId: state.selectedClipId,
            selectedClipIds: Array.isArray(state.selectedClipIds) ? [...state.selectedClipIds] : [],
            trackOrder: [...trackIds],
            playheadTime: state.playheadTime || 0,
            assets: cachedAssets,
            timeline: cachedTimeline,
            trackControls: cachedControls,
            trackMeta: cachedMeta
        };
    }

    render(state) {
        if (!this.ensureElements()) return;

        // 如果上次渲染的状态存在，并且除了 playheadTime 之外其他属性都没有改变，则走 Fast Path 仅更新指针
        if (this.lastRenderedState && !this.shouldPerformFullRender(this.lastRenderedState, state)) {
            this.updatePlayheadOnly(state.playheadTime || 0);
            this.lastRenderedState.playheadTime = state.playheadTime || 0;
            return;
        }

        try {
            const totalDuration = Math.max(10, this.flow.store.getTimelineDuration());
            const trackIds = this.getRenderableTrackIds(state);
            const selectedClipCount = state.selectedClipIds?.length || 0;

            if (this.elements.timelineBody) {
                this.elements.timelineBody.classList.toggle('has-single-selected-clip', selectedClipCount === 1);
                this.elements.timelineBody.classList.toggle('has-multi-selected-clips', selectedClipCount > 1);
            }

            if (this.elements.playheadTime) {
                this.elements.playheadTime.textContent = this.formatTimelineTime(state.playheadTime || 0);
            }

            const { renderDuration, laneWidth } = this.renderRuler(totalDuration, state.playheadTime || 0) || { renderDuration: totalDuration, laneWidth: 720 };
            if (this.elements.tracksRoot) {
                this.elements.tracksRoot.classList.remove('is-fallback-visible');
                this.elements.tracksRoot.innerHTML = '';

                if (this.debugEnabled) {
                    const debugRow = document.createElement('div');
                    debugRow.className = 'editor-track-debug-row';
                    debugRow.textContent = `tracks-root visible | tracks:${trackIds.length}`;
                    this.elements.tracksRoot.appendChild(debugRow);
                }

                trackIds.forEach((trackId) => {
                    const { row, label, lane } = this.createTrackRow(trackId);
                    const trackHeight = this.getTrackHeight(trackId, state);
                    this.applyTrackRowLayout(row, label, lane, trackHeight, laneWidth);
                    this.elements.tracksRoot.appendChild(row);
                    this.renderTrackLabel(label, trackId, trackId.toUpperCase(), state);
                    this.dropManager.attachLane(lane, trackId);
                    this.renderTrack(lane, trackId, state.timeline[trackId] || [], state.assets, state.selectedClipIds || [], state.selectedClipId, state, renderDuration, laneWidth, trackHeight);
                });

                const clipCount = trackIds.reduce((sum, trackId) => sum + ((state.timeline?.[trackId] || []).length), 0);
                const firstTrack = this.elements.tracksRoot.querySelector('.editor-timeline-track');
                const firstLane = this.elements.tracksRoot.querySelector('.editor-track-lane');
                const missingVisibleStructure = this.elements.tracksRoot.childElementCount === 0
                    || !this.elements.ruler?.innerHTML?.trim()
                    || (trackIds.length > 0 && (
                        this.elements.tracksRoot.offsetHeight === 0
                        || this.elements.tracksRoot.getClientRects().length === 0
                        || !firstTrack
                        || firstTrack.offsetHeight === 0
                        || firstTrack.getClientRects().length === 0
                        || !firstLane
                        || firstLane.offsetHeight === 0
                        || firstLane.getClientRects().length === 0
                    ));

                if (missingVisibleStructure && (trackIds.length > 0 || clipCount > 0)) {
                    this.renderMinimalTimeline(state, { reason: 'empty-structure' });
                    this.lastRenderedState = null;
                    this.scheduleVisibilityCheck(state);
                } else {
                    const shouldForceVisibility = trackIds.length > 0
                        && (this.elements.tracksRoot.offsetHeight === 0 || this.elements.tracksRoot.getClientRects().length === 0);
                    this.applyTracksRootFallback(shouldForceVisibility);
                    // 在成功完成一次全量重绘后，缓存当前结构状态的摘要
                    this.cacheRenderedState(state);
                }

                this.elements.tracksRoot.dataset.debugRendered = String(this.elements.tracksRoot.childElementCount);
                // Paint canvas waveforms after DOM is ready (rAF so layout sizes are final)
                requestAnimationFrame(() => this.paintClipWaveforms(state));
            }

            if (this.elements.debug) {
                const clipCounts = Object.fromEntries(this.getRenderableTrackIds(state).map((trackId) => [trackId, (state.timeline?.[trackId] || []).length]));
                this.elements.debug.textContent = `tracks:${this.elements.tracksRoot?.childElementCount || 0} clips:${Object.values(clipCounts).reduce((sum, count) => sum + count, 0)} left:${this.elements.timelineBody?.scrollLeft || 0} top:${this.elements.timelineBody?.scrollTop || 0} rootH:${this.elements.tracksRoot?.offsetHeight || 0}`;
            }
            this.updatePlayheadOverlay();
        } catch (error) {
            console.error('[EditorTimelineManager] Render failed, using fallback:', error);
            this.lastRenderedState = null;
            this.renderMinimalTimeline(state, { reason: error?.message || 'render-error' });
            if (this.elements.debug) {
                this.elements.debug.textContent = 'timeline fallback active';
                this.elements.debug.classList.remove('hidden');
            }
        }
    }
}

window.EditorTimelineManager = EditorTimelineManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineManager;
}
