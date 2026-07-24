/**
 * ScribeFlow.js
 * 转录功能主控制器 (MVC Pattern)
 */
class ScribeFlow {
    constructor() {
        this.audioFiles = [];
        this.segments = [];
        this.rawSegments = [];
        this.polishedSegments = [];
        this.translations = [];
        this.results = [];
        this.isProcessing = false;
        this.currentVersion = 'original';

        // 核心服务与 UI
        this.service = window.ScribeService;
        this.uiManager = new window.ScribeUIManager(this);

        // 别名兼容 (用于旧组件引用)
        this.editor = this.uiManager;

        // 辅助驱动 (已迁移)
        this.settingsManager = new window.ScribeSettingsManager(this);
        this.modelManager = new window.ScribeModelManager();
        this.clipHandler = new window.ScribeClipHandler(this);
        this.exporter = new window.ScribeExporter(this);
        this.translator = new window.ScribeTranslator(this);
        this.aiHandler = new window.ScribeAIHandler(this);
        this.queueManager = new window.ScribeQueueManager(this);
        this.transcriber = new window.ScribeTranscriber(this);
        this.eventManager = new window.ScribeEventManager(this);
        this.mediaPlayer = new window.ScribeMediaPlayer(this);
        this.searchReplace = new window.ScribeSearchReplace(this);
        this.speakerManager = new window.ScribeSpeakerManager(this.uiManager);
        this.uiManager.speakerManager = this.speakerManager;
        this.uiManager.updateProgress(0, window.i18n?.t('common.status.ready') || 'Ready');
    }

    init() {
        if (this.settingsManager) this.settingsManager.init();
        if (this.modelManager) this.modelManager.init();
        if (this.eventManager) this.eventManager.init();
        if (this.mediaPlayer) this.mediaPlayer.init();
        if (this.searchReplace) this.searchReplace.init();
        console.log('[ScribeFlow] Initialized');
    }

    // --- 代理调用领域 (Delegation) ---
    handleFilesSelect(files) { this.queueManager?.handleFilesSelect(files); }
    async startTranscribe() { await this.transcriber?.startTranscribe(); }
    async cancelTranscribe() { await this.transcriber?.cancel(); }
    async polishSubtitles() { await this.aiHandler?.polishSubtitles(); }
    async summarizeSubtitles() { await this.aiHandler?.summarizeSubtitles(); }
    async translateSegments(lang) { await this.translator?.translateSegments(lang); }
    async batchTranslate() { await this.translator?.batchTranslate(); }
    async exportSRT() { await this.exporter?.exportSRT(); }
    async exportTXT() { await this.exporter?.exportTXT(); }
    async exportAllZip() { await this.exporter?.exportAllZip(); }
    async copyText() { await this.exporter?.copyText(); }
    async copySummary() { await this.exporter?.copySummary(); }
    async exportSummaryTXT() { await this.exporter?.exportSummaryTXT(); }
    clearQueue() { this.queueManager?.clearQueue(); }

    switchVersion(v) { this.uiManager.switchVersion?.(v) || this.uiManager.render?.(v); }

    /**
     * 显示结果 (由 Transcriber 调用)
     */
    showResults(result) {
        this.uiManager.showResults(result);
        const fileObj = this.audioFiles.find(f => f.name === (result.file || result.filename));
        if (fileObj) this.mediaPlayer.loadMedia(fileObj.file || fileObj);

        const cleanSegs = this.service.filterHallucinations(result.segments || []);
        this.rawSegments = JSON.parse(JSON.stringify(cleanSegs));
        this.polishedSegments = JSON.parse(JSON.stringify(cleanSegs));
        this.currentVersion = 'original';
        this.uiManager.render();

        // 🆕 记录成就 (智能译者 / 记录学者)
    }

    reset() {
        this.audioFiles = []; this.segments = []; this.rawSegments = [];
        this.polishedSegments = []; this.translations = []; this.results = [];
        this.isProcessing = false;
        this.uiManager.resetUI();
        this.mediaPlayer.reset();
    }
}

window.ScribeFlow = ScribeFlow;
