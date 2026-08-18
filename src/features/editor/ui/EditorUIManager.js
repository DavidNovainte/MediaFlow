class EditorUIManager {
    static ASSETS_WIDTH_MIN = 180;
    static ASSETS_WIDTH_MAX = 420;
    static ASSETS_WIDTH_DEFAULT = 240;
    static INSPECTOR_WIDTH_MIN = 240;
    static INSPECTOR_WIDTH_MAX = 480;
    static INSPECTOR_WIDTH_DEFAULT = 300;

    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.assetContextMenuState = { assetId: null };
        this.lastAssetRenderSignature = '';
        this.layoutResizeState = null;
        this.currentTimelineLayoutHeight = null;
        this.boundLayoutResizeMove = this.handleLayoutResizeMove.bind(this);
        this.boundLayoutResizeEnd = this.handleLayoutResizeEnd.bind(this);
        this.columnResizeState = null;
        this.assetsWidth = EditorUIManager.ASSETS_WIDTH_DEFAULT;
        this.inspectorWidth = EditorUIManager.INSPECTOR_WIDTH_DEFAULT;
        this.boundColumnResizeMove = this.handleColumnResizeMove.bind(this);
        this.boundColumnResizeEnd = this.handleColumnResizeEnd.bind(this);
        this.boundWindowResize = () => this.applyColumnLayout();
    }

    truncateLabel(value, maxLength = 64) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(1, maxLength - 3))}...`;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    t(key, fallback = '', params) {
        const text = window.i18n?.t?.(key, params);
        if (text && text !== key) return text;
        return fallback || key;
    }

    stripExtension(value) {
        const text = String(value || '').trim();
        return text.replace(/\.[a-z0-9]{2,5}$/i, '');
    }

    getAssetKindLabel(kind) {
        if (kind === 'audio') return this.t('editor.kindAudio', '音频');
        if (kind === 'image') return this.t('editor.kindImage', '图片');
        if (kind === 'video') return this.t('editor.kindVideo', '视频');
        return this.t('editor.kindMedia', '素材');
    }

    getCleanAssetLabel(asset, fallback) {
        const fb = fallback || this.t('editor.kindMedia', '素材');
        const text = this.stripExtension(asset?.name || '').replace(/\s+/g, ' ').trim();
        if (!text) return fb;
        if (/(views?|reactions?|likes?|comments?)/i.test(text) && text.length > 20) {
            if (asset?.kind === 'audio') return this.t('editor.clipAudio', '音频片段');
            if (asset?.kind === 'image') return this.t('editor.kindImage', '图片');
            return fb;
        }
        return text;
    }

    getAssetDisplayTitle(asset, fallback) {
        const fb = fallback || this.t('editor.untitledAsset', '未命名素材');
        const text = this.stripExtension(asset?.name || '').replace(/\s+/g, ' ').trim();
        return text || fb;
    }

    getPrimaryAssetLabel(state) {
        const assets = Array.isArray(state?.assets) ? state.assets : [];
        if (!assets.length) return '';

        const selectedAsset = assets.find(asset => asset.id === state?.selectedAssetId);
        const candidate = selectedAsset || assets[0];
        return this.stripExtension(candidate?.name || '');
    }

    formatDuration(value) {
        const duration = Math.max(Number(value) || 0, 0);
        if (!duration) return this.t('editor.pendingDuration', '待识别');
        if (duration < 60) return `${duration.toFixed(1)}s`;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    getAssetIcon(kind) {
        if (kind === 'audio') return 'fa-waveform-lines';
        if (kind === 'image') return 'fa-image';
        return 'fa-film';
    }

    renderAssetVisual(asset) {
        if (asset.kind === 'video' && asset.src) {
            const src = this.escapeHtml(asset.src);
            return `
                <div class="editor-asset-visual editor-asset-visual-video">
                    <video src="${src}" muted preload="metadata" playsinline></video>
                </div>
            `;
        }

        if (asset.kind === 'image' && asset.src) {
            const src = this.escapeHtml(asset.src);
            const name = this.escapeHtml(asset.name || '');
            return `
                <div class="editor-asset-visual editor-asset-visual-image">
                    <img src="${src}" alt="${name}">
                </div>
            `;
        }

        const kindClass = this.escapeHtml(String(asset.kind || 'media').replace(/[^\w-]/g, ''));
        return `
            <div class="editor-asset-visual editor-asset-visual-${kindClass}">
                <i class="fa-solid ${this.getAssetIcon(asset.kind)}"></i>
                <span>${this.getAssetKindLabel(asset.kind)}</span>
            </div>
        `;
    }

    buildProjectTitle(state) {
        const explicitName = String(state?.name || '').trim();
        const primaryAssetLabel = this.getPrimaryAssetLabel(state);
        const normalizedExplicit = this.stripExtension(explicitName).toLowerCase();
        const normalizedAsset = primaryAssetLabel.toLowerCase();
        const assetCount = Array.isArray(state?.assets) ? state.assets.length : 0;

        // Imported media filenames are terrible chrome titles — treat as generic project labels.
        const looksLikeImportedSourceName = !!(
            normalizedExplicit
            && (
                normalizedExplicit === normalizedAsset
                || (normalizedAsset && (
                    normalizedExplicit.includes(normalizedAsset.slice(0, Math.min(24, normalizedAsset.length)))
                    || normalizedAsset.includes(normalizedExplicit.slice(0, Math.min(24, normalizedExplicit.length)))
                ))
                || explicitName.length > 36
                || /[_-]360p|[_-]720p|[_-]1080p|[_-]4k|\.(mp4|mov|mkv|mp3|wav|m4a)$/i.test(explicitName)
            )
        );

        if (explicitName && explicitName !== '未命名剪辑' && !looksLikeImportedSourceName) {
            return explicitName;
        }

        if (assetCount > 1) return this.t('editor.projectMulti', '时间线剪辑');
        if (assetCount === 1) return this.t('editor.projectSingle', '单片段剪辑');
        return this.t('editor.workbench', '精修工作台');
    }

    describeSelection(state) {
        const selectedClip = state.selectedClipId ? this.flow.store.getSelectedClip() : null;
        if (selectedClip) {
            return this.t('editor.selectedDuration', `已选中 · ${selectedClip.duration.toFixed(2)}s`, {
                duration: selectedClip.duration.toFixed(2)
            });
        }

        const selectedAsset = state.assets.find(asset => asset.id === state.selectedAssetId);
        if (selectedAsset) {
            return this.t('editor.assetReady', `${this.getAssetKindLabel(selectedAsset.kind)}可用`, {
                kind: this.getAssetKindLabel(selectedAsset.kind)
            });
        }

        return this.t('editor.nothingSelected', '未选择内容');
    }

    buildProjectMeta(state) {
        const assetCount = state.assets.length;
        const clipCount = this.flow.store.getTimelineClipCount();
        return this.t('editor.metaCounts', `${assetCount} 个素材 · ${clipCount} 个片段`, {
            assets: assetCount,
            clips: clipCount
        });
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        this.elements = {
            page: document.getElementById('page-editor'),
            importBtn: document.getElementById('btn-editor-import'),
            backBtn: document.getElementById('btn-editor-back-to-creator'),
            fileInput: document.getElementById('editor-file-input'),
            assetList: document.getElementById('editor-asset-list'),
            assetsCount: document.getElementById('editor-assets-count'),
            projectName: document.getElementById('editor-project-name'),
            projectMeta: document.getElementById('editor-project-meta'),
            projectStatus: document.getElementById('editor-project-status'),
            shellGrid: document.querySelector('#page-editor .editor-shell-grid'),
            workArea: document.querySelector('#page-editor .editor-work-area'),
            layoutResizer: document.getElementById('editor-layout-resizer'),
            assetsResizer: document.getElementById('editor-assets-resizer'),
            inspectorResizer: document.getElementById('editor-inspector-resizer'),
            timelineShell: document.querySelector('#page-editor .editor-timeline-shell')
        };
    }

    bindEvents() {
        this.applySavedTimelineLayoutHeight();
        this.applySavedColumnWidths();
        this.elements.layoutResizer?.addEventListener('pointerdown', (event) => this.handleLayoutResizeStart(event));
        this.elements.layoutResizer?.addEventListener('keydown', (event) => this.handleLayoutResizeKeydown(event));
        this.elements.assetsResizer?.addEventListener('pointerdown', (event) => this.handleColumnResizeStart(event, 'assets'));
        this.elements.inspectorResizer?.addEventListener('pointerdown', (event) => this.handleColumnResizeStart(event, 'inspector'));
        this.elements.assetsResizer?.addEventListener('keydown', (event) => this.handleColumnResizeKeydown(event, 'assets'));
        this.elements.inspectorResizer?.addEventListener('keydown', (event) => this.handleColumnResizeKeydown(event, 'inspector'));
        this.elements.importBtn?.addEventListener('click', () => this.elements.fileInput?.click());
        this.elements.fileInput?.addEventListener('change', (event) => {
            if (event.target.files?.length) {
                this.flow.handleFileSelect(event.target.files);
            }

            event.target.value = '';
        });
        this.elements.backBtn?.addEventListener('click', () => {
            this.flow.app?.navigateTo?.('creator');
        });

        if (!this._assetContextMenuEventsBound) {
            this._assetContextMenuEventsBound = true;
            document.addEventListener('click', (event) => {
                if (event.target?.closest?.('#editor-asset-context-menu')) return;
                this.hideAssetContextMenu();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.hideAssetContextMenu();
                }
            });
            document.addEventListener('scroll', () => this.hideAssetContextMenu(), true);
            window.addEventListener('resize', () => {
                this.hideAssetContextMenu();
                this.boundWindowResize();
            });
        }
    }

    getAssetsWidthStorageKey() {
        return 'mediaflow.editor.assetsWidth';
    }

    getInspectorWidthStorageKey() {
        return 'mediaflow.editor.inspectorWidth';
    }

    isInspectorStacked() {
        return window.matchMedia?.('(max-width: 1180px)')?.matches === true;
    }

    clampAssetsWidth(width) {
        const value = Number(width);
        if (!Number.isFinite(value)) return EditorUIManager.ASSETS_WIDTH_DEFAULT;
        const workWidth = Number(this.elements.workArea?.clientWidth) || Number(window.innerWidth) || 1200;
        const maxByViewport = Math.max(
            EditorUIManager.ASSETS_WIDTH_MIN,
            Math.min(EditorUIManager.ASSETS_WIDTH_MAX, Math.floor(workWidth * 0.42))
        );
        return Math.round(Math.min(maxByViewport, Math.max(EditorUIManager.ASSETS_WIDTH_MIN, value)));
    }

    clampInspectorWidth(width) {
        const value = Number(width);
        if (!Number.isFinite(value)) return EditorUIManager.INSPECTOR_WIDTH_DEFAULT;
        const workWidth = Number(this.elements.workArea?.clientWidth) || Number(window.innerWidth) || 1200;
        const maxByViewport = Math.max(
            EditorUIManager.INSPECTOR_WIDTH_MIN,
            Math.min(EditorUIManager.INSPECTOR_WIDTH_MAX, Math.floor(workWidth * 0.45))
        );
        return Math.round(Math.min(maxByViewport, Math.max(EditorUIManager.INSPECTOR_WIDTH_MIN, value)));
    }

    readSavedColumnWidth(key, fallback) {
        try {
            const raw = window.localStorage?.getItem(key);
            const parsed = Number(raw);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
        } catch (error) {
            void error;
            return fallback;
        }
    }

    saveColumnWidths() {
        try {
            window.localStorage?.setItem(this.getAssetsWidthStorageKey(), String(Math.round(this.assetsWidth)));
            window.localStorage?.setItem(this.getInspectorWidthStorageKey(), String(Math.round(this.inspectorWidth)));
        } catch (error) {
            void error;
        }
    }

    applyColumnLayout() {
        const workArea = this.elements.workArea || document.querySelector('#page-editor .editor-work-area');
        if (!workArea) return;

        this.assetsWidth = this.clampAssetsWidth(this.assetsWidth);
        this.inspectorWidth = this.clampInspectorWidth(this.inspectorWidth);

        workArea.style.setProperty('--editor-assets-width', `${this.assetsWidth}px`);
        workArea.style.setProperty('--editor-inspector-width', `${this.inspectorWidth}px`);

        if (this.isInspectorStacked()) {
            workArea.style.gridTemplateColumns = `${this.assetsWidth}px minmax(0, 1fr)`;
        } else {
            workArea.style.gridTemplateColumns = `${this.assetsWidth}px minmax(0, 1fr) ${this.inspectorWidth}px`;
        }

        if (this.elements.assetsResizer) {
            this.elements.assetsResizer.setAttribute('aria-valuenow', String(this.assetsWidth));
            this.elements.assetsResizer.setAttribute('aria-valuemin', String(EditorUIManager.ASSETS_WIDTH_MIN));
            this.elements.assetsResizer.setAttribute('aria-valuemax', String(EditorUIManager.ASSETS_WIDTH_MAX));
        }
        if (this.elements.inspectorResizer) {
            this.elements.inspectorResizer.setAttribute('aria-valuenow', String(this.inspectorWidth));
            this.elements.inspectorResizer.setAttribute('aria-valuemin', String(EditorUIManager.INSPECTOR_WIDTH_MIN));
            this.elements.inspectorResizer.setAttribute('aria-valuemax', String(EditorUIManager.INSPECTOR_WIDTH_MAX));
        }
    }

    applySavedColumnWidths() {
        this.assetsWidth = this.readSavedColumnWidth(
            this.getAssetsWidthStorageKey(),
            EditorUIManager.ASSETS_WIDTH_DEFAULT
        );
        this.inspectorWidth = this.readSavedColumnWidth(
            this.getInspectorWidthStorageKey(),
            EditorUIManager.INSPECTOR_WIDTH_DEFAULT
        );
        this.applyColumnLayout();
    }

    handleColumnResizeStart(event, side) {
        if (!this.elements.workArea) return;
        if (side === 'inspector' && this.isInspectorStacked()) return;

        event.preventDefault();
        event.currentTarget?.setPointerCapture?.(event.pointerId);

        this.columnResizeState = {
            side,
            startX: Number(event.clientX) || 0,
            startAssetsWidth: this.assetsWidth,
            startInspectorWidth: this.inspectorWidth
        };

        this.elements.assetsResizer?.classList.toggle('is-active', side === 'assets');
        this.elements.inspectorResizer?.classList.toggle('is-active', side === 'inspector');
        document.body.classList.add('editor-col-resizing');
        document.addEventListener('pointermove', this.boundColumnResizeMove);
        document.addEventListener('pointerup', this.boundColumnResizeEnd, { once: true });
        document.addEventListener('pointercancel', this.boundColumnResizeEnd, { once: true });
    }

    handleColumnResizeMove(event) {
        if (!this.columnResizeState) return;

        event.preventDefault();
        const deltaX = (Number(event.clientX) || 0) - this.columnResizeState.startX;

        if (this.columnResizeState.side === 'assets') {
            this.assetsWidth = this.clampAssetsWidth(this.columnResizeState.startAssetsWidth + deltaX);
        } else {
            // Dragging inspector left edge: move right → narrower inspector
            this.inspectorWidth = this.clampInspectorWidth(this.columnResizeState.startInspectorWidth - deltaX);
        }

        this.applyColumnLayout();
    }

    handleColumnResizeEnd() {
        if (!this.columnResizeState) return;

        this.columnResizeState = null;
        this.elements.assetsResizer?.classList.remove('is-active');
        this.elements.inspectorResizer?.classList.remove('is-active');
        document.body.classList.remove('editor-col-resizing');
        document.removeEventListener('pointermove', this.boundColumnResizeMove);
        document.removeEventListener('pointerup', this.boundColumnResizeEnd);
        document.removeEventListener('pointercancel', this.boundColumnResizeEnd);
        this.applyColumnLayout();
        this.saveColumnWidths();
        window.dispatchEvent(new Event('resize'));
    }

    handleColumnResizeKeydown(event, side) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        if (side === 'inspector' && this.isInspectorStacked()) return;

        event.preventDefault();
        const step = event.shiftKey ? 32 : 12;

        if (side === 'assets') {
            if (event.key === 'Home') this.assetsWidth = EditorUIManager.ASSETS_WIDTH_MIN;
            else if (event.key === 'End') this.assetsWidth = EditorUIManager.ASSETS_WIDTH_MAX;
            else this.assetsWidth += event.key === 'ArrowRight' ? step : -step;
        } else {
            if (event.key === 'Home') this.inspectorWidth = EditorUIManager.INSPECTOR_WIDTH_MIN;
            else if (event.key === 'End') this.inspectorWidth = EditorUIManager.INSPECTOR_WIDTH_MAX;
            else this.inspectorWidth += event.key === 'ArrowLeft' ? step : -step;
        }

        this.applyColumnLayout();
        this.saveColumnWidths();
        window.dispatchEvent(new Event('resize'));
    }

    getTimelineLayoutStorageKey() {
        return 'mediaflow.editor.timelineHeight';
    }

    readSavedTimelineLayoutHeight() {
        try {
            const value = window.localStorage?.getItem(this.getTimelineLayoutStorageKey());
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        } catch (error) {
            void error;
            return null;
        }
    }

    saveTimelineLayoutHeight(height) {
        const rounded = Math.round(Number(height) || 0);
        if (!rounded) return;
        try {
            window.localStorage?.setItem(this.getTimelineLayoutStorageKey(), String(rounded));
        } catch (error) {
            void error;
        }
    }

    getTimelineLayoutLimits() {
        const grid = this.elements.shellGrid;
        const rect = grid?.getBoundingClientRect?.();
        const gridHeight = Math.max(
            Number(rect?.height) || 0,
            Number(grid?.clientHeight) || 0,
            Number(window.innerHeight) || 0,
            520
        );
        const resizerHeight = Math.max(
            Number(this.elements.layoutResizer?.getBoundingClientRect?.().height) || 0,
            Number(this.elements.layoutResizer?.offsetHeight) || 0,
            10
        );
        const preferredMinTimeline = 240;
        const preferredMinWorkArea = 260;
        const maxTimeline = Math.max(160, gridHeight - resizerHeight - preferredMinWorkArea);
        const minTimeline = Math.min(preferredMinTimeline, Math.max(160, maxTimeline));

        return {
            min: minTimeline,
            max: Math.max(minTimeline, maxTimeline)
        };
    }

    clampTimelineLayoutHeight(height) {
        const value = Number(height);
        if (!Number.isFinite(value)) return null;

        const limits = this.getTimelineLayoutLimits();
        return Math.round(Math.min(Math.max(value, limits.min), limits.max));
    }

    getCurrentTimelineLayoutHeight() {
        if (Number.isFinite(this.currentTimelineLayoutHeight) && this.currentTimelineLayoutHeight > 0) {
            return this.currentTimelineLayoutHeight;
        }

        const rectHeight = Number(this.elements.timelineShell?.getBoundingClientRect?.().height) || 0;
        if (rectHeight > 0) return rectHeight;

        const computed = Number.parseFloat(window.getComputedStyle(this.elements.shellGrid)?.getPropertyValue('--editor-timeline-shell-height'));
        return Number.isFinite(computed) && computed > 0 ? computed : 360;
    }

    applyTimelineLayoutHeight(height, options = {}) {
        const nextHeight = this.clampTimelineLayoutHeight(height);
        if (!nextHeight || !this.elements.shellGrid) return null;

        this.currentTimelineLayoutHeight = nextHeight;
        this.elements.shellGrid.style.setProperty('--editor-timeline-shell-height', `${nextHeight}px`);
        if (this.elements.layoutResizer) {
            const limits = this.getTimelineLayoutLimits();
            this.elements.layoutResizer.setAttribute('aria-valuenow', String(nextHeight));
            this.elements.layoutResizer.setAttribute('aria-valuemin', String(Math.round(limits.min)));
            this.elements.layoutResizer.setAttribute('aria-valuemax', String(Math.round(limits.max)));
        }

        if (options.persist) {
            this.saveTimelineLayoutHeight(nextHeight);
        }

        this.refreshTimelineLayout();
        return nextHeight;
    }

    applySavedTimelineLayoutHeight() {
        const savedHeight = this.readSavedTimelineLayoutHeight();
        if (!savedHeight) return;
        this.applyTimelineLayoutHeight(savedHeight, { persist: false });
    }

    refreshTimelineLayout() {
        this.flow.timelineManager?.updatePlayheadOverlay?.();
        this.flow.timelineViewportManager?.syncLockedGutterMask?.();
        if (typeof this.flow.timelineViewportManager?.scheduleLayoutRefresh === 'function') {
            this.flow.timelineViewportManager.scheduleLayoutRefresh();
        }
    }

    handleLayoutResizeStart(event) {
        if (!this.elements.shellGrid || !this.elements.timelineShell) return;

        event.preventDefault();
        event.currentTarget?.setPointerCapture?.(event.pointerId);
        this.layoutResizeState = {
            startY: Number(event.clientY) || 0,
            startHeight: this.getCurrentTimelineLayoutHeight()
        };

        document.body.classList.add('editor-layout-resizing');
        document.addEventListener('pointermove', this.boundLayoutResizeMove);
        document.addEventListener('pointerup', this.boundLayoutResizeEnd, { once: true });
        document.addEventListener('pointercancel', this.boundLayoutResizeEnd, { once: true });
    }

    handleLayoutResizeMove(event) {
        if (!this.layoutResizeState) return;

        event.preventDefault();
        const deltaY = (Number(event.clientY) || 0) - this.layoutResizeState.startY;
        this.applyTimelineLayoutHeight(this.layoutResizeState.startHeight - deltaY, { persist: false });
    }

    handleLayoutResizeKeydown(event) {
        if (!this.elements.shellGrid || !this.elements.timelineShell) return;
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;

        event.preventDefault();
        const limits = this.getTimelineLayoutLimits();
        const current = this.getCurrentTimelineLayoutHeight();
        const step = event.shiftKey ? 48 : 24;
        const nextHeight = event.key === 'Home'
            ? limits.min
            : event.key === 'End'
                ? limits.max
                : current + (event.key === 'ArrowUp' ? step : -step);
        const applied = this.applyTimelineLayoutHeight(nextHeight, { persist: true });
        if (applied && typeof this.flow.renderCurrentState === 'function') {
            this.flow.renderCurrentState();
        }
    }

    handleLayoutResizeEnd() {
        if (!this.layoutResizeState) return;

        const currentHeight = this.applyTimelineLayoutHeight(this.getCurrentTimelineLayoutHeight(), { persist: true });
        this.layoutResizeState = null;
        document.body.classList.remove('editor-layout-resizing');
        document.removeEventListener('pointermove', this.boundLayoutResizeMove);
        document.removeEventListener('pointerup', this.boundLayoutResizeEnd);
        document.removeEventListener('pointercancel', this.boundLayoutResizeEnd);

        if (currentHeight && typeof this.flow.renderCurrentState === 'function') {
            this.flow.renderCurrentState();
        }
    }

    ensureAssetContextMenu() {
        const scope = document.querySelector('#page-editor .editor-scope');
        if (!scope) return null;

        let menu = scope.querySelector('#editor-asset-context-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'editor-asset-context-menu';
            menu.className = 'editor-asset-context-menu hidden';
            scope.appendChild(menu);
        }

        this.elements.assetContextMenu = menu;
        return menu;
    }

    hideAssetContextMenu() {
        const menu = this.elements.assetContextMenu;
        if (!menu) return;
        menu.classList.add('hidden');
        menu.innerHTML = '';
        this.assetContextMenuState.assetId = null;
    }

    getTrackOptionLabel(trackId) {
        const meta = this.flow.store.getTrackMeta(trackId);
        return meta?.name || String(trackId || '').toUpperCase();
    }

    getContextTrackOptions(asset) {
        if (!asset) return [];
        const trackType = asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video';
        return this.flow.store.getTrackIdsByType(trackType).map((trackId) => {
            const meta = this.flow.store.getTrackMeta(trackId);
            const controls = this.flow.store.getTrackControl?.(trackId) || {};
            return {
                trackId,
                label: meta?.name || trackId.toUpperCase(),
                disabled: !!controls.locked
            };
        });
    }

    formatTimelineClock(seconds) {
        const total = Math.max(0, Number(seconds) || 0);
        const mins = Math.floor(total / 60);
        const secs = Math.floor(total % 60);
        const ms = Math.round((total - Math.floor(total)) * 1000);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    scrollTimelineToClip(clipId) {
        if (!clipId) return;
        requestAnimationFrame(() => {
            const clipEl = document.querySelector(`#page-editor [data-clip-id="${CSS.escape?.(clipId) || clipId}"]`);
            clipEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        });
    }

    insertAssetAtPlayhead(assetId, requestedTrackId = null) {
        return this.insertAssetAtPlayheadToTrack(assetId, requestedTrackId);
    }

    insertAssetAtPlayheadToTrack(assetId, requestedTrackId = null) {
        if (!assetId) return null;
        const asset = this.flow.store.getAssetById?.(assetId);
        if (!asset) {
            window.app?.showToast?.(this.t('editor.assetMissing', '素材不存在'), 'warning');
            return null;
        }

        const trackId = requestedTrackId || this.flow.store.getTrackNameForKind?.(asset.kind);
        if (trackId && this.flow.store.isTrackLocked?.(trackId)) {
            window.app?.showToast?.(this.t('editor.trackLocked', '目标轨道已锁定'), 'warning');
            return null;
        }

        const targetStart = Number(this.flow.store.getState?.().playheadTime) || 0;
        let inserted = null;
        try {
            inserted = this.flow.store.insertAssetAtTime?.(assetId, targetStart, requestedTrackId || null);
        } catch (error) {
            console.error('[EditorUIManager] insertAssetAtPlayhead failed:', error);
            window.app?.showToast?.(this.t('editor.insertFailed', '无法加入时间线'), 'error');
            return null;
        }

        if (!inserted) {
            window.app?.showToast?.(this.t('editor.insertFailed', '无法加入时间线'), 'warning');
            return null;
        }

        const startLabel = this.formatTimelineClock(inserted.timelineStart);
        const kindLabel = this.getAssetKindLabel(asset.kind);
        const trackLabel = this.getTrackOptionLabel?.(trackId) || trackId || '';
        window.app?.showToast?.(
            this.t(
                'editor.insertedAt',
                trackLabel
                    ? `已加入时间线 · ${kindLabel} · ${trackLabel} · ${startLabel}`
                    : `已加入时间线 · ${kindLabel} · ${startLabel}`,
                {
                    kind: kindLabel,
                    time: startLabel,
                    track: trackLabel
                }
            ),
            'success'
        );
        this.scrollTimelineToClip(inserted.id);
        // Nudge playhead slightly so timeline/preview refresh is obvious
        try {
            this.flow.store.setPlayheadTime?.(Number(inserted.timelineStart) || targetStart);
        } catch (error) {
            void error;
        }
        return inserted;
    }

    showAssetContextMenu(asset, event) {
        const menu = this.ensureAssetContextMenu();
        if (!menu || !asset?.id) return;

        const trackOptions = this.getContextTrackOptions(asset);
        const defaultTrackId = this.flow.store.getTrackNameForKind(asset.kind);
        const defaultTrackLabel = defaultTrackId ? this.getTrackOptionLabel(defaultTrackId) : null;
        const assetTitle = this.getAssetDisplayTitle(asset);
        const safeAssetTitle = this.escapeHtml(assetTitle);
        const safeAssetShortTitle = this.escapeHtml(this.truncateLabel(assetTitle, 26));
        const safeDefaultTrackLabel = defaultTrackLabel ? this.escapeHtml(defaultTrackLabel) : '';
        const safeTrackOptions = trackOptions.map((option) => ({
            ...option,
            trackId: this.escapeHtml(option.trackId),
            label: this.escapeHtml(option.label)
        }));

        this.assetContextMenuState.assetId = asset.id;
        menu.innerHTML = `
            <div class="editor-asset-context-menu-title" title="${safeAssetTitle}">${safeAssetShortTitle}</div>
            <div class="editor-asset-context-menu-label">${this.t('editor.timeline', '时间线')}</div>
            <button
                type="button"
                class="editor-asset-context-menu-item"
                data-action="insert-default"
                ${defaultTrackId ? '' : 'disabled'}
            >${this.t('editor.insertAtPlayhead', '插入到播放头')}${safeDefaultTrackLabel ? ` - ${safeDefaultTrackLabel}` : ''}</button>
            ${safeTrackOptions.length ? `<div class="editor-asset-context-menu-label">${this.t('editor.existingTracks', '现有轨道')}</div>` : ''}
            ${safeTrackOptions.map((option) => `
                <button
                    type="button"
                    class="editor-asset-context-menu-item${option.disabled ? ' is-disabled' : ''}"
                    data-action="insert-track"
                    data-track-id="${option.trackId}"
                    ${option.disabled ? 'disabled' : ''}
                >${this.t('editor.addToTrack', '添加到')} ${option.label}</button>
            `).join('')}
            <div class="editor-asset-context-menu-separator" aria-hidden="true"></div>
            <button type="button" class="editor-asset-context-menu-item is-danger" data-action="delete-asset">${this.t('editor.deleteFromLibraryAndTimeline', '从素材库和时间线删除')}</button>
        `;

        menu.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const assetId = this.assetContextMenuState.assetId;
                const action = button.dataset.action;
                const trackId = button.dataset.trackId;
                this.hideAssetContextMenu();
                if (!assetId || !action) return;

                if (action === 'delete-asset') {
                    this.flow.store.deleteAsset(assetId);
                    return;
                }

                this.flow.store.selectAsset(assetId);

                if (action === 'insert-default') {
                    this.insertAssetAtPlayhead(assetId, defaultTrackId || null);
                    return;
                }

                if (action === 'insert-track' && trackId) {
                    this.insertAssetAtPlayheadToTrack(assetId, trackId);
                }
            });
        });

        menu.classList.remove('hidden');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = menu.getBoundingClientRect();
        const left = Math.min(event.clientX, viewportWidth - rect.width - 8);
        const top = Math.min(event.clientY, viewportHeight - rect.height - 8);
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
    }

    getAssetRenderSignature(state) {
        const assets = Array.isArray(state?.assets) ? state.assets : [];
        const assetSignature = assets.map((asset) => [
            asset.id,
            asset.name,
            asset.kind,
            Number(asset.duration) || 0,
            asset.src || '',
            asset.waveformStatus || ''
        ].join('|')).join('||');
        return `${state?.selectedAssetId || ''}::${assetSignature}`;
    }

    buildAssetUsageMap(state) {
        const usage = new Map();
        const trackOrder = Array.isArray(state?.trackOrder) ? state.trackOrder : [];
        trackOrder.forEach((trackId) => {
            const clips = state?.timeline?.[trackId] || [];
            clips.forEach((clip) => {
                if (!clip?.assetId) return;
                usage.set(clip.assetId, (usage.get(clip.assetId) || 0) + 1);
            });
        });
        return usage;
    }

    getAssetDensityClass() {
        // Always dense media-browser layout (NLE-style)
        return 'is-dense';
    }

    updateAssetPanelState(state) {
        const assetCount = Array.isArray(state?.assets) ? state.assets.length : 0;
        const densityClass = this.getAssetDensityClass(assetCount);
        const panelBody = this.elements.assetList;

        if (this.elements.assetsCount) {
            this.elements.assetsCount.textContent = String(assetCount);
        }

        if (panelBody) {
            panelBody.classList.remove('is-single', 'is-comfortable', 'is-dense');
            panelBody.classList.add(densityClass);
        }
    }

    renderAssets(state) {
        if (!this.elements.assetList) return;

        this.updateAssetPanelState(state);
        const renderSignature = this.getAssetRenderSignature(state);

        if (!state.assets.length) {
            this.lastAssetRenderSignature = 'empty';
            this.elements.assetList.innerHTML = `
                <div class="editor-empty-panel">
                    <strong>${this.escapeHtml(this.t('editor.emptyLibraryTitle', '素材库为空。'))}</strong>
                    <span>${this.escapeHtml(this.t('editor.emptyLibraryBody', '使用导入添加首个视频、音频或图片。'))}</span>
                </div>
            `;
            return;
        }

        if (this.lastAssetRenderSignature === renderSignature) {
            return;
        }

        this.lastAssetRenderSignature = renderSignature;

        this.elements.assetList.innerHTML = '';
        state.assets.forEach((asset) => {
            const isSelected = state.selectedAssetId === asset.id;
            const assetTitle = this.getAssetDisplayTitle(asset);
            const safeAssetTitle = this.escapeHtml(assetTitle);
            const safeAssetShortTitle = this.escapeHtml(this.truncateLabel(assetTitle, 28));
            const item = document.createElement('article');
            item.className = `editor-asset-card${isSelected ? ' is-selected' : ''}`;
            item.draggable = true;
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `预览 ${assetTitle}`);
            item.dataset.assetId = asset.id;
            item.innerHTML = `
                <div class="editor-asset-visual-frame">
                    ${this.renderAssetVisual(asset)}
                    <span class="editor-asset-duration">${this.formatDuration(asset.duration)}</span>
                </div>
                <div class="editor-asset-copy">
                    <div class="editor-asset-meta-row">
                        <span class="editor-asset-kind">${this.getAssetKindLabel(asset.kind)}</span>
                    </div>
                    <div class="editor-asset-name-row">
                        <div class="editor-asset-name" title="${safeAssetTitle}">${safeAssetShortTitle}</div>
                        <button class="editor-asset-inline-action" type="button" draggable="false" data-action="insert-playhead" title="在播放头加入时间线（+）" aria-label="在播放头加入时间线">
                            <i class="fa-solid fa-plus" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                this.flow.store.selectAsset(asset.id);
            });

            item.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.flow.store.selectAsset(asset.id);
            });

            const addBtn = item.querySelector('.editor-asset-inline-action');
            // Nested button inside draggable card: stop drag so click always fires
            const stopCardDrag = (event) => {
                event.stopPropagation();
            };
            addBtn?.addEventListener('pointerdown', stopCardDrag);
            addBtn?.addEventListener('mousedown', stopCardDrag);
            addBtn?.addEventListener('dragstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            addBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.flow.store.selectAsset(asset.id);
                addBtn.classList.add('is-active');
                window.setTimeout(() => addBtn.classList.remove('is-active'), 180);
                this.insertAssetAtPlayhead(asset.id);
            });

            item.addEventListener('dragstart', (event) => {
                if (event.target?.closest?.('.editor-asset-inline-action')) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                event.dataTransfer?.setData('text/editor-asset-id', asset.id);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
                item.classList.add('is-dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('is-dragging');
            });

            item.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                this.flow.store.selectAsset(asset.id);
                this.showAssetContextMenu(asset, event);
            });

            this.elements.assetList.appendChild(item);
        });
    }

    renderHeader(state) {
        const projectTitle = this.buildProjectTitle(state);
        const projectMeta = this.buildProjectMeta(state);
        const clipCount = this.flow.store.getTimelineClipCount();
        const statusLabel = state.selectedClipId
            ? this.t('editor.editing', '编辑中')
            : clipCount > 0
                ? this.t('editor.readyExport', '可导出')
                : this.t('editor.draft', '草稿');

        if (this.elements.projectName) {
            // Full name only in tooltip — display uses CSS ellipsis so toolbar never reflows
            this.elements.projectName.textContent = projectTitle;
            this.elements.projectName.title = projectTitle;
            this.elements.projectName.setAttribute('aria-label', projectTitle);
        }

        if (this.elements.projectMeta) {
            this.elements.projectMeta.textContent = projectMeta;
            this.elements.projectMeta.title = projectMeta;
        }

        if (this.elements.projectStatus) {
            this.elements.projectStatus.textContent = statusLabel;
            this.elements.projectStatus.title = statusLabel;
        }
    }

    render(state) {
        this.renderHeader(state);
        this.renderAssets(state);
    }
}

window.EditorUIManager = EditorUIManager;

if (typeof module !== 'undefined') {
    module.exports = EditorUIManager;
}
