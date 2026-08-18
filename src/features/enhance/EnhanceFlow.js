/**
 * EnhanceFlow.js - AI 画质增强前端控制器 (重构版)
 * 作为主协调器，将具体职责委派给各个子管理器。
 */

class EnhanceFlow {
    constructor() {
        // 1. 基础状态 (由 StateManager 扩展)
        this.currentEngine = 'cugan';
        this.options = {
            scale: 2, denoise: 0, format: 'auto',
            performanceMode: 'balanced', sharpen: false
        };
        this.isProcessing = false;

        // 2. 核心子模块 (Modules)
        this.stateManager = new window.EnhanceStateManager(this);
        this.settingsManager = new window.EnhanceSettingsManager(this);
        this.processManager = new window.EnhanceProcessManager(this);
        this.uiManager = new window.EnhanceUIManager(this);

        // 3. 辅助功能模块
        this.zoomViewer = new window.EnhanceZoomViewer(this);
        this.infoManager = new window.EnhanceInfoManager(this);
        this.exportManager = new window.EnhanceExportManager(this);
        this.smartSelector = new window.EnhanceSmartSelector(this); // 智能选型

        this.initialized = false;
        this.elements = {};
    }

    /**
     * 初始化：协调各个模块的启动流程
     */
    async init() {
        if (this.initialized) return;

        // UI 加载与缓存
        await this.uiManager.loadPage();
        this.uiManager.cacheElements();
        this.uiManager.initCategoryTabs();
        this.uiManager.initFileListToggle();

        // 绑定事件
        this.bindEvents();
        this.uiManager.initLayoutResizer();

        // 初始设置
        const defaultDir = await this.getDefaultOutputDir();
        this.outputDir = defaultDir;
        if (this.elements.outputPath) this.elements.outputPath.value = defaultDir || '';

        // 数据加载
        await this.settingsManager.loadEngines();

        // Pro boundary + limits chrome
        this.uiManager?.refreshProBanner?.();
        this.settingsManager?.updateSettingsUI?.();

        // 环境清理
        window.mediaflow.enhance.cleanup().catch(e => console.warn('[EnhanceFlow] Cleanup failed', e));

        this.initialized = true;
        console.log('[EnhanceFlow] Modular Architecture Ready');
    }

    /**
     * 事件绑定：将 DOM 事件分发到对应的处理器
     */
    bindEvents() {
        const els = this.elements;

        // 文件管理
        els.btnAddFiles?.addEventListener('click', () => this.openFileDialog());
        document.getElementById('btn-enhance-clear-finished')?.addEventListener('click', () => {
            this.stateManager.clearFinished();
        });
        document.getElementById('btn-enhance-clear-all')?.addEventListener('click', () => {
            this.stateManager.clearAll();
        });

        // 引擎与选项切换
        els.engineSelect?.addEventListener('change', (e) => {
            this.currentEngine = e.target.value;
            const currentItem = this.stateManager.getCurrentItem();
            if (currentItem) {
                currentItem.engine = this.currentEngine;
                this.updateFileList();
            }
            this.updateEngineOptions();
        });

        els.scaleButtons?.querySelectorAll('.scale-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const scale = parseInt(btn.dataset.scale);
                this.options.scale = scale;
                const currentItem = this.stateManager.getCurrentItem();
                if (currentItem) {
                    currentItem.options.scale = scale;
                    this.updateFileList();
                }
                this.updateSettingsUI();
                if (this.currentOriginalInfo) this.infoManager.updateResolution(this.currentOriginalInfo, scale);
            });
        });

        // 通用选项监听
        const syncOpt = (id, transform = v => v) => (e) => {
            const val = transform(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
            this.options[id] = val;
            const currentItem = this.stateManager.getCurrentItem();
            if (currentItem) currentItem.options[id] = val;
        };

        els.denoiseSlider?.addEventListener('input', syncOpt('denoise', parseInt));
        els.outputFormat?.addEventListener('change', syncOpt('format'));
        els.performanceMode?.addEventListener('change', syncOpt('performanceMode'));
        els.sharpenToggle?.addEventListener('change', syncOpt('sharpen'));

        // 执行操作
        els.btnPreview?.addEventListener('click', () => this.generatePreview());
        els.btnStart?.addEventListener('click', () => this.startEnhance());
        els.btnCancel?.addEventListener('click', () => this.cancel());
        els.btnSelectOutput?.addEventListener('click', () => this.selectOutputDir());
        els.btnSyncAll?.addEventListener('click', () => this.syncSettingsToAll());
        els.btnExportRegion?.addEventListener('click', () => this.exportSelection());

        // 工具栏
        els.btnZoomFit?.addEventListener('click', () => this.zoomViewer.reset());
        els.btnZoomIn?.addEventListener('click', () => this.zoomViewer.zoomIn());
        els.btnZoomOut?.addEventListener('click', () => this.zoomViewer.zoomOut());
        els.btnZoomReset?.addEventListener('click', () => this.zoomViewer.reset100());

        // 完成后快捷操作
        els.btnOpenDir?.addEventListener('click', () => {
            const dir = this.outputDir || this._lastOutputDir;
            if (dir) window.mediaflow.shell.openPath(dir);
        });
        els.btnRevealFile?.addEventListener('click', () => {
            const file = this._lastOutputFiles?.[0];
            if (file && window.mediaflow.shell?.showItemInFolder) {
                window.mediaflow.shell.showItemInFolder(file);
            } else if (this.outputDir) {
                window.mediaflow.shell.openPath(this.outputDir);
            }
        });
        els.btnToCompress?.addEventListener('click', () => this.sendResultsToCompress());

        // 拖放支持
        const dropZone = document.getElementById('page-enhance');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.emptyState?.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', () => els.emptyState?.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation(); // 阻止冒泡，防止被全局 DragDropManager 捕获
                els.emptyState?.classList.remove('dragover');
                this.handleFileDrop(e.dataTransfer?.files || []);
            });
        }

        // 内部模块初始化
        this.zoomViewer.init(els);
        this.infoManager.init();
        this.exportManager.init();
        this.uiManager.initQuickCompare(); // 初始化快速对比事件
    }

    // --- 代理方法：直接路由到子管理器 (Delegation) ---

    // 状态管理
    addFiles(paths) { this.stateManager.addFiles(paths); }
    removeFile(index) { this.stateManager.removeFile(index); }
    switchPreview(index) { this.stateManager.switchPreview(index); }
    updateFileList() { this.stateManager.updateFileList(); }
    syncSettingsToAll() { this.stateManager.syncSettingsToAll(); }

    // 设置管理
    updateEngineOptions() { return this.settingsManager.updateEngineOptions(); }
    updateSettingsUI() { return this.settingsManager.updateSettingsUI(); }
    downloadEngine() { return this.settingsManager.downloadEngine(); }

    // 执行管理
    startEnhance() { return this.processManager.start(); }
    generatePreview() { return this.processManager.generatePreview(); }
    cancel() { return this.processManager.cancel(); }
    getDefaultOutputDir() { return this.processManager.getDefaultOutputDir(); }
    showProgress(t) { this.processManager.showProgress(t); }
    updateProgress(p) { this.processManager.updateProgress(p); }
    hideProgress() { this.processManager.hideProgress(); }

    // UI 与导出
    updateUI() { this.uiManager.updateUI(); }
    showComparison(b, a) { this.uiManager.showComparison(b, a); }
    showOriginalPreview(p) { return this.uiManager.showOriginalPreview(p); }
    updateSettingsFromItem(i) { return this.uiManager.updateSettingsFromItem(i); }
    exportSelection() { return this.processManager.exportSelection(); }

    // 交互辅助
    async openFileDialog() {
        const res = await window.mediaflow.dialog.openFile({
            filters: [
                { name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] },
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
                { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }
            ],
            properties: ['openFile', 'multiSelections']
        });
        if (res?.length) this.addFiles(res);
    }

    async selectOutputDir() {
        const res = await window.mediaflow.dialog.selectFolder();
        if (res) { this.outputDir = res; if (this.elements.outputPath) this.elements.outputPath.value = res; }
    }

    /**
     * Send successful enhance outputs to Image Compress (PixelFlow).
     */
    async sendResultsToCompress() {
        const isImageOut = (p) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(String(p || ''));
        const isVideoOut = (p) => /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(p || ''));
        const paths = (this._lastOutputFiles || []).filter((p) => isImageOut(p) && !isVideoOut(p));
        const fromState = (this.stateManager?.fileData || [])
            .filter((item) => item?.result?.status === 'success' && !item.isVideo && !isVideoOut(item.result?.outputPath || item.result?.output))
            .map((item) => item.result?.outputPath || item.result?.output)
            .filter((p) => isImageOut(p) && !isVideoOut(p));
        const files = paths.length ? paths : fromState;
        if (!files.length) {
            window.app?.showToast(
                window.i18n?.t('enhance.noResultsToCompress') || 'No enhanced images to send (videos stay in output folder)',
                'info'
            );
            return;
        }
        try {
            if (window.app?.router?.navigateTo) {
                await window.app.router.navigateTo('compress', { imagePaths: files });
            } else if (window.pixelFlow?.importPaths) {
                await window.pixelFlow.importPaths(files);
            } else {
                throw new Error('Compress page unavailable');
            }
            window.app?.showToast(
                window.i18n?.t('enhance.sentToCompress', { count: files.length })
                    || `Sent ${files.length} file(s) to compress`,
                'success'
            );
        } catch (error) {
            console.error('[EnhanceFlow] sendResultsToCompress failed:', error);
            window.app?.showToast(
                window.i18n?.t('enhance.sendToCompressFail') || 'Could not open compress',
                'error'
            );
        }
    }

    handleFileDrop(files) {
        const valid = Array.from(files)
            .filter((f) => /\.(png|jpg|jpeg|webp|mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name))
            .map((f) => f.path)
            .filter(Boolean);
        if (valid.length) this.addFiles(valid);
    }
}

// Class only — instance created on first visit via FeatureLoader.ensureEnhance()
window.EnhanceFlowClass = EnhanceFlow;
// Back-compat for tests that still `new window.EnhanceFlow()` after assigning class name
if (typeof window.EnhanceFlow === 'undefined') {
    window.EnhanceFlow = null;
}
