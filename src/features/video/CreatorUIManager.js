/**
 * MediaFlow - CreatorUIManager
 * 核心调度器：负责 DOM 缓存、界面状态管理及子模块分发
 * 遵循单文件 < 300 行规范，业务逻辑已解耦至 ui/ 目录下
 */

class CreatorUIManager {
    constructor(app) {
        this.app = app;
        this.mode = 'quick'; // 'quick' | 'edit'
        this.elements = {};

        // 子管理器初始化
        this.dialogs = new window.DialogManager(this);
        this.inspector = new window.InspectorManager(this);
        this.quickTools = new window.QuickToolsRenderer(this);
        this.toolSettings = new window.ToolSettingsManager(this);
        this.exportManager = new window.CreatorExportManager(this);
    }

    translateOrFallback(key, fallback) {
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : fallback;
    }

    /**
     * 初始化 UI 系统
     */
    init() {
        this.cacheElements();
        this.inspector.init();
        this.toolSettings.init();
        this.exportManager.init();
        this.setupDragDrop();
        this.setupModeToggle();
        this.setupFloatingPreviewControls();
        window.addEventListener('languageChanged', () => this.refreshI18n());

        // 初始 UI 状态
        this.resetUI();
        this.setMode('quick');
    }

    /**
     * 缓存 DOM 元素引用
     */
    cacheElements() {
        this.elements = {
            mainLayout: document.getElementById('view-single-tool'),
            uploadZone: document.getElementById('creator-upload-zone'),
            batchPanel: document.getElementById('batch-panel'),
            videoInfo: document.getElementById('creator-video-info'),
            quickToolsGrid: document.getElementById('creator-quick-tools'),
            timelineContainer: document.getElementById('creator-timeline-container'),
            btnSelectMedia: document.getElementById('btn-creator-select-media'),
            fileInput: document.getElementById('creator-video-file'),
            rootContainer: document.getElementById('page-creator'),
            singleView: document.getElementById('creator-single-view'),
            batchView: document.getElementById('creator-batch-view'),

            // Header & Tools
            btnToggleInspector: document.getElementById('creator-btn-toggle-inspector'),
            btnToggleMode: document.getElementById('btn-toggle-creator-mode'),
            headerExportBtn: document.getElementById('btn-creator-export-dialog'),

            // Meta Bar Quick Tools
            btnQuickRotate: document.getElementById('btn-quick-rotate'),
            btnQuickMirror: document.getElementById('btn-quick-mirror'),
            btnQuickCrop: document.getElementById('btn-quick-crop'),

            // Inspector Tabs
            inspectorTabs: document.querySelectorAll('#page-creator .inspector-tab'),
            tabPanels: document.querySelectorAll('#page-creator .tab-content'),
            btnPropertiesTab: document.getElementById('tab-btn-properties'),

            // Tool Inputs
            rotateSelect: document.getElementById('prop-rotate-angle'),
            mirrorSection: document.getElementById('prop-section-mirror'),
            propCropW: document.getElementById('prop-crop-w'),
            propCropH: document.getElementById('prop-crop-h'),
            propCropRatio: document.getElementById('prop-crop-ratio'),
            propCropOrigRes: document.getElementById('prop-crop-orig-res'),
            btnLockCropRatio: document.getElementById('btn-lock-crop-ratio'),
            btnApplyCrop: document.getElementById('btn-prop-apply-crop'),
            speedSlider: document.getElementById('prop-speed-slider'),
            speedValue: document.getElementById('prop-speed-value'),
            clipStart: document.getElementById('clip-start-time'),
            clipEnd: document.getElementById('clip-end-time'),
            btnMakeVertical: document.getElementById('btn-make-vertical')
        };
    }

    /**
     * 设置创作模式 (快捷 vs 精修)
     */
    setMode(mode) {
        this.mode = mode;
        const { mainLayout, rootContainer, timelineContainer, btnToggleMode, quickToolsGrid } = this.elements;
        if (!mainLayout || !rootContainer) return;

        const hasFile = !!this.app.videoFile;
        rootContainer.classList.toggle('no-video', !hasFile);
        mainLayout.classList.toggle('no-video', !hasFile);

        // 更新模式按钮文字与状态
        if (btnToggleMode) {
            const label = this.translateOrFallback('creator.mode.openEditor', '打开精修');
            btnToggleMode.innerHTML = `<i class="fa-solid fa-clapperboard"></i> <span>${label}</span>`;
            btnToggleMode.classList.remove('active');
        }

        // 应用模式类名 (用于 CSS 控制按钮显隐)
        rootContainer.classList.remove('mode-quick', 'mode-edit');
        rootContainer.classList.add(mode === 'quick' ? 'mode-quick' : 'mode-edit');
        mainLayout.classList.remove('mode-quick', 'mode-edit');
        mainLayout.classList.add(mode === 'quick' ? 'mode-quick' : 'mode-edit');

        // 🚀 模式感应：切换检查器项目页的引导/工具箱内容 (物理隔离快捷/精修模式)
        const quickGuide = document.getElementById('inspector-guide-quick');
        const editToolbox = document.getElementById('inspector-guide-edit');
        if (quickGuide && editToolbox) {
            quickGuide.style.display = mode === 'quick' ? 'block' : 'none';
            editToolbox.style.display = mode === 'edit' ? 'block' : 'none';
        }

        // 切换视图内容
        if (mode === 'quick') {
            timelineContainer?.classList.add('hidden');
            if (hasFile) {
                quickToolsGrid?.classList.remove('hidden');
                this.quickTools.render();
            } else {
                quickToolsGrid?.classList.add('hidden');
            }
            this.inspector.focusTool(null);
            mainLayout.classList.remove('inspector-active');
        } else {
            timelineContainer?.classList.remove('hidden');
            quickToolsGrid?.classList.add('hidden');

            // 🚀 核心联动：在侧边栏渲染紧凑工具箱
            this.quickTools.renderInInspector();
            this.inspector.focusTool(null);

            if (hasFile) {
                mainLayout.classList.add('inspector-active');
                this.inspector.syncButtonState();

                // 🚀 优化：进入精修模式时按需加载波形
                if (this.app.timelineManager && !this.app.timelineManager.hasWaveform) {
                    this.app.timelineManager.extractAudioWaveform(this.app.videoFile);
                }
            }
        }

        if (!hasFile) return;
    }

    /**
     * 模式切换监听
     */
    setupModeToggle() {
        this.elements.btnToggleMode?.addEventListener('click', () => {
            const mediaFile = this.app.videoFile || this.app.audioFile || null;
            this.app.app?.navigateTo?.('editor', {
                source: 'creator',
                mediaFile,
                videoPath: mediaFile?.path || ''
            });
        });
    }

    setupFloatingPreviewControls() {
        const root = this.elements.rootContainer || document.getElementById('page-creator');
        root?.addEventListener('click', (event) => {
            const closeButton = event.target?.closest?.('.btn-close-preview');
            if (!closeButton) return;
            closeButton.closest('.preview-float-window')?.classList.add('hidden');
        });
    }

    /**
     * 业务逻辑委派 (Delegation)
     */
    showProgress(s, p, c, o) { this.dialogs.showProgress(s, p, c, o); }
    updateProgress(p, s) { this.dialogs.updateProgress(p, s); }
    hideProgress() { this.dialogs.hideProgress(); }
    showInputDialog(t, p, d) { return this.dialogs.showInputDialog(t, p, d); }
    askConfirm(m) { return this.dialogs.askConfirm(m); }
    askFolderPath() { return this.dialogs.askFolderPath(); }

    focusTool(id) { this.inspector.focusTool(id); }
    hideProperties() { this.inspector.focusTool(null); }
    showOnlySections(ids) { this.inspector.showOnlySections(ids); }
    showAllSections() { this.inspector.showAllSections(); }
    showProperties(t, d) { this.toolSettings.showProperties(t, d); }
    updateCropUIFromMedia(w, h) { this.toolSettings.updateCropUIFromMedia(w, h); }
    updateClipInputs(s, e) { this.toolSettings.updateClipInputs(s, e); }
    updateToolState(isAudio) { this.quickTools.updateToolState(isAudio); }

    // 基础 UI 重置
    resetUI() {
        const { uploadZone, mainLayout, rootContainer, videoInfo, batchPanel, quickToolsGrid, timelineContainer, fileInput } = this.elements;
        uploadZone?.classList.remove('hidden');
        videoInfo?.classList.add('hidden');
        batchPanel?.classList.add('hidden');
        quickToolsGrid?.classList.add('hidden');
        timelineContainer?.classList.add('hidden');
        this.elements.singleView?.classList.remove('hidden');
        this.elements.batchView?.classList.add('hidden');

        if (rootContainer) {
            rootContainer.classList.add('no-video', 'mode-quick');
            rootContainer.classList.remove('mode-edit');
        }

        if (mainLayout) {
            mainLayout.classList.add('no-video', 'mode-quick');
            mainLayout.classList.remove('inspector-active', 'mode-edit');
        }

        // 关键：清空 fileInput.value，否则第二次选择同路径文件时
        // 浏览器认为 value 未变，不会触发 change 事件，导致无法重新导入
        if (fileInput) fileInput.value = '';
    }

    setupDragDrop() {
        const { uploadZone, fileInput } = this.elements;
        if (!uploadZone) return;

        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer?.files?.length > 0) this.app.handleFileSelect(e.dataTransfer.files);
        });

        // 点击整个区域触发文件选择
        uploadZone.addEventListener('click', () => {
            // 如果点击的是按钮本身，由按钮事件冒泡处理（或者统一处理）
            fileInput?.click();
        });

        // 文件选择变更
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.app.handleFileSelect(e.target.files);
        });
    }

    showSingleModeUI() {
        const { uploadZone, videoInfo, mainLayout, singleView, batchView } = this.elements;
        uploadZone?.classList.add('hidden');
        videoInfo?.classList.remove('hidden');
        mainLayout?.classList.remove('hidden');
        singleView?.classList.remove('hidden');
        batchView?.classList.add('hidden');
        this.setMode(this.mode);
    }

    refreshI18n() {
        const { rootContainer, btnToggleMode } = this.elements;
        if (rootContainer && window.i18n?.updateUI) {
            window.i18n.updateUI(rootContainer);
        }

        if (btnToggleMode) {
            const label = this.translateOrFallback('creator.mode.openEditor', '打开精修');
            btnToggleMode.innerHTML = `<i class="fa-solid fa-clapperboard"></i> <span>${label}</span>`;
            btnToggleMode.classList.remove('active');
        }

        this.inspector.syncButtonState();
        this.app.timelineManager?.refreshI18n?.();

        if (this.app.videoFile) {
            if (this.mode === 'edit') {
                this.quickTools.renderInInspector();
            } else {
                this.quickTools.render();
            }
            this.quickTools.updateToolState(!!this.app.isAudioOnly);
        }
    }
}

window.CreatorUIManager = CreatorUIManager;
