/** @jest-environment jsdom */

function withRendererGlobals(callback) {
    const originalProcess = global.process;
    const originalWindowProcess = window.process;

    global.process = undefined;
    window.process = undefined;

    try {
        return callback();
    } finally {
        global.process = originalProcess;
        window.process = originalWindowProcess;
    }
}

function installCommonRendererMocks() {
    window.i18n = {
        t: jest.fn(key => key),
        updateUI: jest.fn(),
        init: jest.fn().mockResolvedValue()
    };

    window.mediaflow = {
        store: {
            get: jest.fn().mockResolvedValue(false),
            set: jest.fn().mockResolvedValue(true)
        },
        subtitle: {
            burn: jest.fn().mockResolvedValue({ success: true }),
            cancel: jest.fn(),
            onBurnProgress: jest.fn(() => () => {})
        },
        compress: {
            onProgress: jest.fn()
        },
        system: {
            syncSubtitleCache: jest.fn(),
            cleanup: jest.fn()
        },
        path: {
            join: jest.fn((...args) => args.join('/'))
        },
        fs: {
            mkdir: jest.fn().mockResolvedValue(true)
        },
        dialog: {
            selectFolder: jest.fn().mockResolvedValue('/selected')
        },
        mobileflow: {
            onUrlReceived: jest.fn()
        },
        window: {
            minimize: jest.fn(),
            maximize: jest.fn(),
            close: jest.fn()
        },
        shell: {
            openExtensionFolder: jest.fn(),
            openExternal: jest.fn(),
            showItemInFolder: jest.fn()
        },
        app: {
            getAppPath: jest.fn().mockResolvedValue('C:/Users/Test/Downloads'),
            getVersion: jest.fn().mockResolvedValue('2.3.0'),
            isPackaged: jest.fn().mockResolvedValue(false),
            platform: 'win32'
        }
    };

    window.app = {
        showToast: jest.fn(),
        navigateTo: jest.fn(),
        };

    window.ErrorUtils = { formatError: jest.fn(error => error?.message || String(error)) };
    window.dispatchEvent = window.dispatchEvent.bind(window);
    window.scrollTo = jest.fn();
    navigator.clipboard = { readText: jest.fn().mockResolvedValue('') };
    window.platformRegistry = { init: jest.fn() };
    window.PageLoader = {
        loadAll: jest.fn().mockResolvedValue(),
        loadCritical: jest.fn().mockResolvedValue(),
        prefetchRest: jest.fn().mockResolvedValue(),
        ensurePage: jest.fn().mockResolvedValue()
    };
    window.queueAnimation = {
        init: jest.fn(),
        updateBadge: jest.fn(),
        flyToQueue: jest.fn()
    };
    window.EnhanceFlow = { init: jest.fn() };
}

function installSubtitleMocks() {
    class SubtitleEditor {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
        render() {}
        toggleViewMode() {}
        addSubtitle() {}
        compressAllOverLimit() {}
        toggleOriginal() {}
        toggleTranslation() {}
        setTextLayoutMode() {}
        setDisplayMode() {}
    }

    class SubtitleTrackManager {
        constructor(flow) {
            this.flow = flow;
            this.tracks = [{ id: 1, subtitles: [] }];
            this.activeTrackId = 1;
        }
        init() {}
        importSubtitle() {}
    }

    class SubtitleStyleManager {
        constructor() {
            this.currentStyle = {};
            this.styleTemplates = [];
        }
        init() {}
    }

    class SubtitleAudioManager {
        syncTracks() {}
    }

    class SubtitleTimeline {
        init() {}
    }

    class SubtitlePreferenceManager {
        constructor() {
            this.preferences = { enableTTS: false };
        }
        async init() {}
    }

    class SubtitleUIManager {
        bindElements() {}
    }

    class SubtitleTTSHandler {
        init() {}
        syncWithTargetLanguage() {}
        loadVoices() {}
    }

    const emptyClass = class {
        constructor() {}
        init() {}
    };

    window.SubtitleEditor = SubtitleEditor;
    window.SubtitleTrackManager = SubtitleTrackManager;
    window.SubtitleAudioManager = SubtitleAudioManager;
    window.SubtitleAudioActionHandler = emptyClass;
    window.SubtitleStyleManager = SubtitleStyleManager;
    window.SubtitleTimeline = SubtitleTimeline;
    window.SubtitlePreferenceManager = SubtitlePreferenceManager;
    window.SubtitleSearchHandler = emptyClass;
    window.SubtitleQualityHandler = emptyClass;
    window.SubtitleContextMenu = emptyClass;
    window.SubtitleUIManager = SubtitleUIManager;
    window.SubtitleService = emptyClass;
    window.SubtitleDubAdapter = emptyClass;
    window.SubtitleVisualOptimizer = emptyClass;
    window.SubtitleDraftManager = class {
        async init() {}
    };
    window.SubtitleBatchHandler = emptyClass;
    window.SubtitleAIHandler = emptyClass;
    window.SubtitleMediaHandler = emptyClass;
    window.SubtitleTTSHandler = SubtitleTTSHandler;
}

function installCreatorMocks() {
    window.CreatorService = class {};
    window.CreatorUIManager = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
        showProperties() {}
    };
    window.HistoryManager = class {
        constructor() {
            this.onStateChange = null;
        }
    };
    window.CreatorPreview = class {
        constructor() {
            this.audioCtx = {};
            this.gainNode = {};
        }
        init() {}
    };
    window.CreatorAudioHandler = class {
        init() {}
    };
    window.TimelineAudioMixer = class {
        init() {}
    };
    window.SilenceProcessor = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };
    window.VideoProcessor = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };
    window.CreatorTimelineManager = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };
    window.BatchCreatorFlow = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };
}

function installAppCoreMocks() {
    const makeInitClass = (extra = {}) => class {
        constructor(app) {
            this.app = app;
            Object.assign(this, extra);
        }
        async init() {}
    };

    window.UIManager = class {
        constructor(app) {
            this.app = app;
        }
        init() {}
        toggleSidebar() {}
        toggleQueueDrawer() {}
        showToast() {}
        showConfirm() { return Promise.resolve(true); }
        showPrompt() { return Promise.resolve(''); }
    };

    window.ClipboardAssistant = class {
        constructor(app) {
            this.app = app;
        }
        checkClipboard() {}
    };

    window.ProtocolHandler = class {
        constructor(app) {
            this.app = app;
        }
        init() {}
    };

    window.DownloadManager = class {
        constructor(app) {
            this.app = app;
            this.ui = { hideAllDownloadUI: jest.fn() };
            this.videoInfo = null;
            this.playlistInfo = null;
        }
        async init() {}
        pasteAndParse() {}
        togglePause() {}
        cancel() {}
        startDownloadWithOptions() {}
    };

    window.TranslationManager = makeInitClass({ init() {} });
    window.DragDropManager = makeInitClass({ init() {} });
    window.HistoryFlow = class {
        constructor(app) {
            this.app = app;
            this.checkFilesExistence = jest.fn();
        }
        init() {}
    };
    window.UpdateManager = makeInitClass({ init() {} });
    window.SettingsFlow = class {
        constructor(app) {
            this.app = app;
        }
        async init() {}
    };
    window.ShortcutsManager = makeInitClass({ init() {} });
}

function installDownloadMocks() {
    window.SpeedMonitor = class {};
    window.DownloadService = class {
        constructor(flow) {
            this.flow = flow;
        }
        isValidUrl() { return true; }
        extractUrlFromText(text) { return text; }
        async getInfo() { return { success: true, title: 'Smoke Video' }; }
        async getPlaylistInfo() { return { success: true, count: 1, items: [{}] }; }
    };
    window.DownloadUIManager = class {
        constructor(flow) {
            this.flow = flow;
            this.elements = {
                urlInput: { value: '' },
                btnCheck: { disabled: false, innerHTML: '' },
                trimStart: { value: 0, max: 100 },
                trimEnd: { value: 10 }
            };
            this.updateProgress = jest.fn();
            this.showErrorState = jest.fn();
            this.showSkeleton = jest.fn();
            this.renderPlaylistInfo = jest.fn();
            this.renderVideoInfo = jest.fn();
            this.updateTrimUI = jest.fn();
            this.showProgressUI = jest.fn();
        }
        cacheElements() {}
        bindEvents() {}
    };
    window.DownloadExecutor = class {
        constructor(flow) {
            this.flow = flow;
        }
        async startDownload() { return { success: true }; }
        async downloadPlaylist() { return { success: true }; }
    };
    window.DownloadActionHandler = class {
        constructor(flow) {
            this.flow = flow;
        }
        sendToCreator() {}
        sendToTranscribe() {}
        sendToSubtitle() {}
        openFolder() {}
        addToQueue() {}
    };

    window.mediaflow.video = {
        onProgress: jest.fn()
    };
}

function installHistoryMocks() {
    window.HistoryUI = class {
        constructor(app, thumbnail) {
            this.app = app;
            this.thumbnail = thumbnail;
        }
    };
    window.HistoryService = class {
        constructor(app, ui) {
            this.app = app;
            this.ui = ui;
            this.history = [];
        }
        async loadHistory() {}
        applyFilters() {}
        addToHistory(item) { return item; }
        removeFromHistory(id) { return id; }
    };
    window.HistoryEvents = class {
        constructor(app, service, ui) {
            this.app = app;
            this.service = service;
            this.ui = ui;
        }
        bindAll() {}
    };
}

function installSettingsMocks() {
    window.Logger = { toggleReporting: jest.fn() };
    window.mediaflow.downloader = {
        check: jest.fn().mockResolvedValue({ installed: true, version: 'stable' })
    };
    window.mediaflow.engine = {
        getDetailedStatus: jest.fn().mockResolvedValue({}),
        checkUpdates: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({ success: true }),
        performUpdate: jest.fn().mockResolvedValue({ success: true }),
        onUpdateProgress: jest.fn(() => jest.fn())
    };
    window.mediaflow.video = {
        ...(window.mediaflow.video || {}),
        testProxy: jest.fn().mockResolvedValue({ success: true })
    };
    window.mediaflow.system = {
        ...(window.mediaflow.system || {}),
        getStorageStats: jest.fn().mockResolvedValue({ success: true, totalMB: 12.3 }),
        cleanup: jest.fn().mockResolvedValue({ success: true, results: {} }),
        openLogsDir: jest.fn().mockResolvedValue({ success: true, path: 'C:/logs' }),
        reportError: jest.fn().mockResolvedValue({ success: true })
    };
    window.mediaflow.clipboard = {
        ...(window.mediaflow.clipboard || {}),
        getEnabled: jest.fn().mockResolvedValue(false),
        setEnabled: jest.fn().mockResolvedValue(false)
    };
    window.mediaflow.notification = {
        show: jest.fn()
    };
    window.mediaflow.shell = {
        ...(window.mediaflow.shell || {}),
        openExternal: jest.fn(),
        openExtensionFolder: jest.fn()
    };
    window.i18n.setLanguage = jest.fn();
}

function installMobileScribePixelMocks() {
    window.MobileFlowService = class {
        constructor(flow) {
            this.flow = flow;
        }
        handleReceivedUrl() {}
        async startServer() { return { success: true }; }
        async stopServer() { return { success: true }; }
    };
    window.MobileFlowUIManager = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };

    const initClass = class {
        constructor(flow) {
            this.flow = flow;
        }
        init() {}
    };
    window.ScribeService = {
        filterHallucinations: jest.fn(segments => segments)
    };
    window.ScribeUIManager = class {
        constructor(flow) {
            this.flow = flow;
        }
        updateProgress() {}
        render() {}
        resetUI() {}
        showResults() {}
        switchVersion() {}
    };
    window.ScribeSettingsManager = initClass;
    window.ScribeModelManager = initClass;
    window.ScribeClipHandler = initClass;
    window.ScribeExporter = initClass;
    window.ScribeTranslator = initClass;
    window.ScribeAIHandler = initClass;
    window.ScribeQueueManager = class extends initClass {
        handleFilesSelect() {}
        clearQueue() {}
    };
    window.ScribeTranscriber = class extends initClass {
        async startTranscribe() {}
    };
    window.ScribeEventManager = initClass;
    window.ScribeMediaPlayer = class extends initClass {
        loadMedia() {}
        reset() {}
    };
    window.ScribeSearchReplace = initClass;
    window.ScribeSpeakerManager = class {
        constructor(uiManager) {
            this.uiManager = uiManager;
        }
    };

    window.PixelService = class {
        constructor(flow) {
            this.flow = flow;
        }
        clearCache() {}
    };
    window.PixelFileManager = class {
        constructor(flow) {
            this.flow = flow;
            this.files = [];
            this.selectedIndex = 0;
        }
        getFiles() { return this.files; }
        clear() {}
    };
    window.PixelUIManager = class {
        constructor(flow) {
            this.flow = flow;
            this.listRenderer = { render: jest.fn(), updateSelection: jest.fn() };
        }
        init() {}
        updateOutputDir() {}
        resetUI() {}
        showProgress() {}
        showResult() {}
        updateProgressBar() {}
        updateOriginalSize() {}
        getCompressOptions() { return {}; }
        updatePreview() {}
        updateProPreview() {}
        formatSize(size) { return `${size}`; }
    };
    window.PixelAIMediator = class {
        constructor(flow) {
            this.flow = flow;
        }
        async process(path, options) {
            return { success: true, path, finalOptions: options };
        }
    };
    window.PixelCompareManager = class {
        constructor(flow) {
            this.flow = flow;
            this.mode = 'single';
        }
        syncActiveConfig() {}
        getPreviewConfigs() { return { A: {}, B: {} }; }
    };
    window.PixelPresetManager = class {
        constructor(flow) {
            this.flow = flow;
        }
        async init() {}
    };
}

describe('Renderer smoke tests', () => {
    let logSpy;
    let warnSpy;
    let errorSpy;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        document.body.innerHTML = `
            <button id="btn-minimize"></button>
            <button id="btn-maximize"></button>
            <button id="btn-close"></button>
            <button id="btn-toggle-sidebar"></button>
            <button id="btn-toggle-queue"></button>
            <button id="btn-close-drawer"></button>
            <button id="mode-single"></button>
            <button id="mode-batch"></button>
            <button id="btn-open-extension-folder"></button>
            <button id="btn-paste-clipboard"></button>
            <button id="btn-clear-all-queue"></button>
            <button id="batch-btn-pause-all"></button>
            <button id="batch-btn-cancel-all"></button>
            <button id="btn-reset-download"></button>
            <input id="video-url" />
            <div id="single-input-area"></div>
            <div id="batch-input-area" class="hidden"></div>
            <div id="download-video-info"></div>
            <div id="download-options"></div>
            <div id="playlist-info"></div>
            <div id="app-version-display"></div>
            <button class="nav-item" data-page="download"></button>
            <button class="nav-item" data-page="history"></button>
            <section class="page" id="page-download"></section>
            <section class="page" id="page-history"></section>
            <div id="subtitle-export-modal"></div>
            <button id="btn-close-export-modal"></button>
            <button id="btn-cancel-export"></button>
            <button id="btn-confirm-export"></button>
            <button id="btn-export-change-path"></button>
            <select id="export-format-select"><option value="mp4">mp4</option></select>
            <select id="export-type-select"><option value="burn">burn</option></select>
            <input id="export-output-path" value="" />
            <div id="subtitle-list-container"></div>
            <div id="subtitle-timeline-container"></div>
            <button id="btn-reset-video"></button>
            <div id="video-resize-handle"></div>
            <div class="creator-main-layout"></div>
            <button id="btn-pip-video"></button>
            <video id="creator-video-preview"></video>
        `;

        installCommonRendererMocks();
        require('../../src/utils/downloadErrorMap');
        installSubtitleMocks();
        installCreatorMocks();
        installAppCoreMocks();
        installDownloadMocks();
        installHistoryMocks();
        installSettingsMocks();
        installMobileScribePixelMocks();
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('initializes SubtitleFlow without Node process globals', async () => {
        require('../../src/features/subtitle/SubtitleExportHandler');
        require('../../src/features/subtitle/SubtitleFlow');

        const flow = new window.SubtitleFlow(window.app);

        await withRendererGlobals(() => flow.init());

        expect(flow.exportHandler).toBeDefined();
        expect(flow.videoSettings).toEqual({ inputMode: 'single', isMirrored: false });
    });

    it('initializes CreatorFlow without Node process globals', () => {
        require('../../src/features/video/CreatorFlow');

        const flow = new window.CreatorFlow(window.app);

        expect(() => withRendererGlobals(() => flow.init())).not.toThrow();
        expect(flow.batchFlow).toBeDefined();
        expect(flow.videoProcessor).toBeDefined();
    });

    it('switches Router pages and refreshes history safely', async () => {
        require('../../src/core/Router');

        const app = {
            downloadManager: {
                videoInfo: null,
                playlistInfo: null,
                ui: { hideAllDownloadUI: jest.fn() }
            },
            historyManager: {
                checkFilesExistence: jest.fn()
            },
            showToast: jest.fn()
        };

        const router = new window.Router(app);
        await expect(router.switchPage('history')).resolves.not.toThrow();

        expect(router.currentPage).toBe('history');
        expect(app.historyManager.checkFilesExistence).toHaveBeenCalled();
        expect(document.getElementById('page-history').classList.contains('active')).toBe(true);
    });

    it('initializes MediaFlowApp without Node process globals', async () => {
        require('../../src/core/Router');
        require('../../src/features/subtitle/SubtitleExportHandler');
        require('../../src/features/subtitle/SubtitleFlow');
        require('../../src/features/video/CreatorFlow');
        require('../../src/core/App');

        const app = new window.MediaFlowApp();

        await withRendererGlobals(() => app.init());

        expect(window.platformRegistry.init).toHaveBeenCalled();
        expect(window.PageLoader.loadCritical).toHaveBeenCalled();
        expect(window.PageLoader.prefetchRest).toHaveBeenCalled();
        expect(app.router.currentPage).toBe('download');
        expect(app.creatorFlow).toBeDefined();
        expect(app.subtitleFlow).toBeDefined();
    });

    it('initializes DownloadFlow and registers progress listeners safely', () => {
        require('../../src/features/download/DownloadManager');

        const flow = new window.DownloadManager(window.app);

        expect(() => withRendererGlobals(() => flow.init())).not.toThrow();
        expect(window.mediaflow.video.onProgress).toHaveBeenCalled();
        expect(flow.ui.elements.urlInput).toBeDefined();
    });

    it('initializes HistoryFlow and binds history events safely', async () => {
        require('../../src/features/history/HistoryFlow');

        const flow = new window.HistoryFlow(window.app);

        await withRendererGlobals(() => flow.init());

        expect(flow.service).toBeDefined();
        expect(flow.events).toBeDefined();
    });

    it('initializes SettingsFlow and loads settings safely', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <div id="test-report-setting-item"></div>
            <button id="btn-send-test-report"></button>
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);

        await withRendererGlobals(() => flow.init());

        expect(flow.elements.currentPath.textContent).toBeTruthy();
        expect(window.mediaflow.downloader.check).toHaveBeenCalled();
        expect(window.mediaflow.system.getStorageStats).toHaveBeenCalled();
        expect(window.mediaflow.engine.getDetailedStatus).toHaveBeenCalled();
    });

    it('hides test-report controls in packaged mode', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <div id="test-report-setting-item"></div>
            <button id="btn-send-test-report"></button>
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);
        flow.cacheElements();

        await flow.updateDevOnlyVisibility();
        expect(flow.elements.testReportSettingItem.classList.contains('hidden')).toBe(false);

        window.mediaflow.app.isPackaged.mockResolvedValueOnce(true);
        await flow.updateDevOnlyVisibility();
        expect(flow.elements.testReportSettingItem.classList.contains('hidden')).toBe(true);
    });

    it('initializes MobileFlow and registers URL receiver safely', () => {
        require('../../src/features/mobile/MobileFlow');

        const flow = new window.MobileFlow(window.app);

        expect(() => withRendererGlobals(() => flow.init())).not.toThrow();
        expect(window.mediaflow.mobileflow.onUrlReceived).toHaveBeenCalled();
        expect(flow.service).toBeDefined();
    });

    it('initializes ScribeFlow safely', () => {
        require('../../src/features/scribe/ScribeFlow');

        const flow = new window.ScribeFlow(window.app);

        expect(() => withRendererGlobals(() => flow.init())).not.toThrow();
        expect(flow.uiManager).toBeDefined();
        expect(flow.queueManager).toBeDefined();
    });

    it('initializes PixelFlow and auto-configures output dir safely', async () => {
        require('../../src/features/image/PixelFlow');

        const flow = new window.PixelFlow(window.app);

        await withRendererGlobals(() => flow.init());

        expect(flow.outputDir).toBe('C:/Users/Test/Downloads/MediaFlow/ImageCompress');
        expect(window.mediaflow.fs.mkdir).toHaveBeenCalled();
        expect(window.mediaflow.compress.onProgress).toHaveBeenCalled();
    });

    it('keeps MediaFlowApp bootable when optional modules are missing', async () => {
        require('../../src/core/Router');
        require('../../src/core/App');

        const previousCreatorFlow = window.CreatorFlow;
        const previousSubtitleFlow = window.SubtitleFlow;
        const previousPixelFlow = window.PixelFlow;
        const previousScribeFlow = window.ScribeFlow;
        const previousMobileFlow = window.MobileFlow;

        window.CreatorFlow = undefined;
        window.SubtitleFlow = undefined;
        window.PixelFlow = undefined;
        window.ScribeFlow = undefined;
        window.MobileFlow = undefined;

        try {
            const app = new window.MediaFlowApp();
            await withRendererGlobals(() => app.init());

            expect(app.router.currentPage).toBe('download');
            // Creator / Editor / Subtitle are lazy-loaded; boot leaves them null/undefined
            expect(app.creatorFlow == null).toBe(true);
            expect(app.subtitleFlow == null).toBe(true);
            expect(app.editorFlow == null).toBe(true);
            expect(app.pixelFlow).toBeUndefined();
        } finally {
            window.CreatorFlow = previousCreatorFlow;
            window.SubtitleFlow = previousSubtitleFlow;
            window.PixelFlow = previousPixelFlow;
            window.ScribeFlow = previousScribeFlow;
            window.MobileFlow = previousMobileFlow;
        }
    });

    it('updates download path from SettingsFlow change-path action', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);
        await withRendererGlobals(() => flow.init());

        window.mediaflow.dialog.selectFolder.mockResolvedValueOnce('D:/MediaFlowDownloads');
        flow.elements.btnChangePath.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(window.mediaflow.store.set).toHaveBeenCalledWith('downloadPath', 'D:/MediaFlowDownloads');
        expect(flow.elements.currentPath.textContent).toBe('D:/MediaFlowDownloads');
        expect(window.app.defaultDownloadPath).toBe('D:/MediaFlowDownloads');
    });

    it('warns when DownloadFlow checks an empty URL', async () => {
        require('../../src/features/download/DownloadManager');

        const flow = new window.DownloadManager(window.app);
        flow.init();
        flow.ui.elements.urlInput.value = '   ';

        await withRendererGlobals(() => flow.checkVideo());

        expect(window.app.showToast).toHaveBeenCalledWith('download.errors.noUrl', 'warning');
    });

    it('handles DownloadFlow success and failure analysis paths', async () => {
        require('../../src/features/download/DownloadManager');

        const successFlow = new window.DownloadManager(window.app);
        successFlow.init();
        successFlow.ui.elements.urlInput.value = 'https://example.com/video';

        await withRendererGlobals(() => successFlow.checkVideo());

        expect(successFlow.videoInfo).toEqual(expect.objectContaining({ success: true, title: 'Smoke Video' }));
        expect(successFlow.ui.renderVideoInfo).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(window.app.showToast).toHaveBeenCalledWith('download.videoInfoSuccess', 'success');

        jest.clearAllMocks();

        const failureFlow = new window.DownloadManager(window.app);
        failureFlow.init();
        failureFlow.ui.elements.urlInput.value = 'https://example.com/private';
        failureFlow.service.getInfo = jest.fn().mockRejectedValue(new Error('Private video'));

        await withRendererGlobals(() => failureFlow.checkVideo());

        expect(failureFlow.ui.showErrorState).toHaveBeenCalledWith('download.errors.privateVideo');
        expect(window.app.showToast).toHaveBeenCalledWith(
            'download.errors.privateVideo',
            'error',
            expect.any(Object)
        );
    });

    it('routes received mobile URLs through MobileFlow service callback', () => {
        require('../../src/features/mobile/MobileFlow');

        let receivedCallback;
        window.mediaflow.mobileflow.onUrlReceived.mockImplementation((callback) => {
            receivedCallback = callback;
        });

        const flow = new window.MobileFlow(window.app);
        const handleSpy = jest.spyOn(flow.service, 'handleReceivedUrl');

        flow.init();
        receivedCallback?.('https://example.com/share');

        expect(handleSpy).toHaveBeenCalledWith('https://example.com/share');
    });

    it('runs SettingsFlow testProxy and cleanup action chains safely', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="127.0.0.1" />
            <input id="setting-proxy-port" value="7890" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);
        await withRendererGlobals(() => flow.init());

        flow.elements.proxyType.value = 'http';
        flow.elements.proxyHost.value = '127.0.0.1';
        flow.elements.proxyPort.value = '7890';
        flow.elements.proxyUser.value = '';
        flow.elements.proxyPass.value = '';

        await withRendererGlobals(() => flow.testProxy());
        expect(window.mediaflow.video.testProxy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'http',
            host: '127.0.0.1',
            port: '7890'
        }));
        expect(flow.elements.proxyStatus.textContent).toBe('settings.testSuccess');

        jest.spyOn(flow, 'showConfirmDialog').mockResolvedValue(true);
        await withRendererGlobals(() => flow.handleCleanup());
        expect(window.mediaflow.system.cleanup).toHaveBeenCalled();
        expect(window.mediaflow.notification.show).toHaveBeenCalled();

        await withRendererGlobals(() => flow.sendTestReport());
        expect(window.mediaflow.system.reportError).toHaveBeenCalledWith(expect.objectContaining({
            type: 'TEST_REPORT'
        }));
    });

    it('checks downloader status successfully in SettingsFlow', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);
        flow.cacheElements();
        window.mediaflow.downloader.check.mockResolvedValueOnce({ installed: true, version: '2026.04.02' });

        await withRendererGlobals(() => flow.checkYtdlp());

        expect(window.mediaflow.downloader.check).toHaveBeenCalled();
        expect(flow.elements.ytdlpStatus.textContent).toBe('settings.statusRunning (v2026.04.02)');
    });

    it('loads app version into the settings header', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        window.mediaflow.app.getVersion.mockResolvedValueOnce('2.3.0');

        const flow = new window.SettingsFlow(window.app);
        flow.cacheElements();
        await withRendererGlobals(() => flow.loadAppVersion());

        expect(document.getElementById('app-version-display').textContent).toBe('v2.3.0');
    });

    it('checks engine updates and notifies when updates are available', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        window.mediaflow.engine.getDetailedStatus.mockResolvedValueOnce({
            ffmpeg: {
                name: 'FFmpeg',
                version: '6.0',
                installed: true,
                updateMethod: 'auto'
            }
        });
        window.mediaflow.engine.checkUpdates.mockResolvedValueOnce({
            ffmpeg: '6.1'
        });

        const flow = new window.SettingsFlow(window.app);
        flow.cacheElements();

        await withRendererGlobals(() => flow.checkEngineUpdates());

        expect(window.mediaflow.engine.checkUpdates).toHaveBeenCalled();
        expect(window.mediaflow.notification.show).toHaveBeenCalledWith({
            title: 'settings.engineCheckDone',
            body: 'settings.engineUpdateFound'
        });
        expect(flow.elements.engineContainer.innerHTML).toContain('FFmpeg');
    });

    it('performs engine updates and refreshes engine status afterwards', async () => {
        require('../../src/features/settings/SettingsFlow');

        document.body.innerHTML += `
            <button id="btn-change-path"></button>
            <div id="current-download-path"></div>
            <button id="btn-open-extension-folder"></button>
            <select id="setting-language"><option value="en-US">en-US</option></select>
            <input id="setting-playlist-limit" value="1000" />
            <input id="setting-create-channel-folder" type="checkbox" />
            <select id="setting-time-group"><option value="none">none</option></select>
            <input id="setting-use-archive" type="checkbox" />
            <input id="setting-filename-template" value="%(title)s.%(ext)s" />
            <select id="setting-download-completion-action"><option value="none">none</option></select>
            <input id="setting-proxy-enabled" type="checkbox" />
            <div id="proxy-config-area" class="hidden"></div>
            <select id="setting-proxy-type"><option value="http">http</option></select>
            <input id="setting-proxy-host" value="" />
            <input id="setting-proxy-port" value="" />
            <input id="setting-proxy-user" value="" />
            <input id="setting-proxy-pass" value="" />
            <button id="btn-test-proxy"></button>
            <div id="proxy-test-status"></div>
            <div id="downloader-status"></div>
            <input id="setting-log-reporting-enabled" type="checkbox" />
            <input id="setting-download-speed-limit" value="0" />
            <input id="setting-concurrent-fragments" value="3" />
            <input id="setting-force-multithread" type="checkbox" />
            <div id="storage-stats-text"></div>
            <button id="btn-cleanup-now"></button>
            <div id="custom-modal"></div>
            <div id="modal-title"></div>
            <div id="modal-message"></div>
            <button id="btn-modal-confirm"></button>
            <button id="btn-modal-cancel"></button>
            <div id="engine-list-container"></div>
            <button id="btn-check-engine-updates"></button>
            <input id="check-auto-update-engines" type="checkbox" />
            <div id="engine-update-log-box" class="hidden"></div>
            <div id="engine-update-log-content"></div>
        `;

        const flow = new window.SettingsFlow(window.app);
        flow.cacheElements();
        const loadEngineStatusSpy = jest.spyOn(flow, 'loadEngineStatus').mockResolvedValue();

        flow.bindEvents();
        const progressCallback = window.mediaflow.engine.onUpdateProgress.mock.calls.at(-1)[0];
        progressCallback({ log: '[ffmpeg] downloading\n' });
        expect(flow.elements.engineLogContent.textContent).toContain('[ffmpeg] downloading');

        await withRendererGlobals(() => flow.performEngineUpdate('ffmpeg'));

        expect(window.mediaflow.engine.performUpdate).toHaveBeenCalledWith('ffmpeg');
        expect(window.mediaflow.notification.show).toHaveBeenCalledWith({
            title: 'settings.updateSuccess',
            body: 'settings.engineUpdateSuccess'
        });
        expect(loadEngineStatusSpy).toHaveBeenCalled();
        expect(flow.elements.engineLogContent.textContent).toContain('settings.engineUpdating');
    });

    it('routes downloaded files into CreatorFlow automatically', () => {
        jest.useFakeTimers();
        try {
            require('../../src/features/download/DownloadActionHandler');

            const app = {
                switchPage: jest.fn(),
                showToast: jest.fn()
            };
            const manager = {
                app,
                ui: {},
                service: {},
                lastDownloadedFilePath: 'C:/Downloads/sample.mp4'
            };

            window.creatorFlow = {
                addLocalFile: jest.fn()
            };

            const handler = new window.DownloadActionHandler(manager);
            handler.sendToCreator();

            expect(app.switchPage).toHaveBeenCalledWith('creator');

            jest.runAllTimers();

            expect(window.creatorFlow.addLocalFile).toHaveBeenCalledWith('C:/Downloads/sample.mp4');
        } finally {
            jest.useRealTimers();
            delete window.creatorFlow;
        }
    });

    it('routes downloaded files into ScribeFlow automatically', () => {
        jest.useFakeTimers();
        try {
            require('../../src/features/download/DownloadActionHandler');

            const app = {
                switchPage: jest.fn(),
                showToast: jest.fn()
            };
            const manager = {
                app,
                ui: {},
                service: {},
                lastDownloadedFilePath: 'C:/Downloads/sample.mp4'
            };

            window.scribeFlow = {
                handleFilesSelect: jest.fn()
            };

            const handler = new window.DownloadActionHandler(manager);
            handler.sendToTranscribe();

            expect(app.switchPage).toHaveBeenCalledWith('transcribe');

            jest.runAllTimers();

            expect(window.scribeFlow.handleFilesSelect).toHaveBeenCalledWith([
                expect.objectContaining({
                    path: 'C:/Downloads/sample.mp4',
                    name: 'sample.mp4',
                    type: 'video/mp4'
                })
            ]);
        } finally {
            jest.useRealTimers();
            delete window.scribeFlow;
        }
    });

    it('routes downloaded files into SubtitleFlow automatically', async () => {
        require('../../src/features/download/DownloadActionHandler');

        const app = {
            switchPage: jest.fn().mockResolvedValue(undefined),
            showToast: jest.fn()
        };
        const manager = {
            app,
            ui: {},
            service: {},
            lastDownloadedFilePath: 'C:/Downloads/sample.mp4'
        };

        window.subtitleFlow = {
            loadVideo: jest.fn().mockResolvedValue(undefined)
        };
        window.FeatureLoader = {
            ensureSubtitle: jest.fn().mockResolvedValue(window.subtitleFlow)
        };

        try {
            const handler = new window.DownloadActionHandler(manager);
            await handler.sendToSubtitle();

            expect(app.switchPage).toHaveBeenCalledWith('subtitle');
            expect(window.FeatureLoader.ensureSubtitle).toHaveBeenCalled();
            expect(window.subtitleFlow.loadVideo).toHaveBeenCalledWith('C:/Downloads/sample.mp4');
        } finally {
            delete window.subtitleFlow;
            delete window.FeatureLoader;
        }
    });

    it('opens the downloaded file location from DownloadActionHandler', () => {
        require('../../src/features/download/DownloadActionHandler');

        const app = {
            switchPage: jest.fn(),
            showToast: jest.fn()
        };
        const manager = {
            app,
            ui: {},
            service: {},
            lastDownloadedFilePath: 'C:/Downloads/sample.mp4',
            lastOutputDir: 'C:/Downloads'
        };

        const handler = new window.DownloadActionHandler(manager);
        handler.openFolder();

        expect(window.mediaflow.shell.showItemInFolder).toHaveBeenCalledWith('C:/Downloads/sample.mp4');
        expect(app.showToast).not.toHaveBeenCalled();
    });

    it('adds detected downloads into the queue automatically', async () => {
        require('../../src/features/download/DownloadActionHandler');

        const app = {
            queueManager: {
                add: jest.fn()
            },
            showToast: jest.fn()
        };
        const manager = {
            app,
            videoInfo: {
                title: 'Smoke Video',
                duration: 120
            },
            selectedQuality: '1080',
            downloadFormat: 'video',
            audioFormat: 'mp3',
            audioQuality: '192',
            ui: {
                elements: {
                    urlInput: { value: 'https://example.com/video' },
                    downloadThumbnail: { checked: true },
                    downloadSubtitles: { checked: false },
                    trimGroup: { classList: { contains: jest.fn().mockReturnValue(true) } },
                    trimStart: { value: 0 },
                    trimEnd: { value: 120 },
                    thumbnail: { id: 'thumb' }
                }
            },
            service: {
                buildDownloadOptions: jest.fn().mockResolvedValue({
                    url: 'https://example.com/video',
                    title: 'Smoke Video',
                    thumbnail: 'thumb.jpg',
                    platform: 'youtube',
                    outputDir: 'C:/Downloads'
                })
            }
        };

        const handler = new window.DownloadActionHandler(manager);
        handler.addToQueue();
        await Promise.resolve();
        await Promise.resolve();

        expect(manager.service.buildDownloadOptions).toHaveBeenCalledWith(
            manager.videoInfo,
            expect.objectContaining({
                rawUrl: 'https://example.com/video',
                selectedQuality: '1080'
            })
        );
        expect(window.queueAnimation.flyToQueue).toHaveBeenCalledWith(manager.ui.elements.thumbnail);
        expect(app.queueManager.add).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://example.com/video',
            title: 'Smoke Video',
            platform: 'youtube',
            priority: 1
        }));
        expect(app.showToast).toHaveBeenCalledWith('download.addedToQueue', 'success');
    });

    it('handles protocol download actions and auto-checks the URL', () => {
        jest.useFakeTimers();
        try {
            require('../../src/core/ProtocolHandler');

            const app = {
                router: {
                    switchMode: jest.fn(),
                    navigateTo: jest.fn()
                },
                downloadManager: {
                    checkVideo: jest.fn()
                },
                pushCleanup: jest.fn()
            };

            const handler = new window.ProtocolHandler(app);
            handler._handleAction({
                type: 'download',
                url: 'https://example.com/from-protocol'
            });

            expect(app.router.switchMode).toHaveBeenCalledWith('single');
            expect(app.router.navigateTo).toHaveBeenCalledWith('download', {
                url: 'https://example.com/from-protocol'
            });

            jest.advanceTimersByTime(300);

            expect(document.getElementById('video-url').value).toBe('https://example.com/from-protocol');
            expect(app.downloadManager.checkVideo).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('handles protocol batch actions and forwards URLs to batch manager', () => {
        jest.useFakeTimers();
        try {
            require('../../src/core/ProtocolHandler');

            window.batchManager = {
                inputManager: {
                    clear: jest.fn(),
                    processInput: jest.fn()
                },
                handleStartClick: jest.fn()
            };

            const app = {
                router: {
                    switchMode: jest.fn(),
                    navigateTo: jest.fn()
                },
                pushCleanup: jest.fn()
            };

            const handler = new window.ProtocolHandler(app);
            handler._handleAction({
                type: 'batch',
                urls: ['https://example.com/a', 'https://example.com/b']
            });

            expect(app.router.switchMode).toHaveBeenCalledWith('batch');

            jest.advanceTimersByTime(500);

            expect(window.batchManager.inputManager.clear).toHaveBeenCalled();
            expect(window.batchManager.inputManager.processInput).toHaveBeenCalledWith(
                'https://example.com/a\nhttps://example.com/b'
            );
            expect(window.batchManager.handleStartClick).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
            delete window.batchManager;
        }
    });

});
