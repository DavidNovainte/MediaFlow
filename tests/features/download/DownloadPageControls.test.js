/** @jest-environment jsdom */

describe('DownloadProgressUI single-download controls', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/download/DownloadProgressUI.js');
    });

    afterEach(() => {
        delete window.DownloadProgressUI;
        document.body.innerHTML = '';
    });

    test('hides and disables the unsupported pause button for single downloads', () => {
        document.body.innerHTML = `
            <div id="download-progress" class="hidden"></div>
            <button id="btn-download"></button>
            <button id="btn-cancel" class="hidden"></button>
            <button id="btn-pause"></button>
        `;

        const elements = {
            progressArea: document.getElementById('download-progress'),
            btnDownload: document.getElementById('btn-download'),
            btnCancel: document.getElementById('btn-cancel'),
            btnPause: document.getElementById('btn-pause')
        };

        const progressUI = new window.DownloadProgressUI({ elements });

        progressUI.showProgressUI(true);

        expect(elements.progressArea.classList.contains('hidden')).toBe(false);
        expect(elements.btnDownload.classList.contains('hidden')).toBe(true);
        expect(elements.btnCancel.classList.contains('hidden')).toBe(false);
        expect(elements.btnPause.classList.contains('hidden')).toBe(true);
        expect(elements.btnPause.disabled).toBe(true);
        expect(elements.btnPause.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('DownloadFlow pause fallback', () => {
    beforeEach(() => {
        jest.resetModules();
        window.DownloadService = class {};
        window.DownloadUIManager = class {};
        window.DownloadExecutor = class {};
        window.DownloadActionHandler = class {};
        window.i18n = { t: jest.fn(() => null) };

        require('../../../src/features/download/DownloadManager.js');
    });

    afterEach(() => {
        delete window.DownloadService;
        delete window.DownloadUIManager;
        delete window.DownloadExecutor;
        delete window.DownloadActionHandler;
        delete window.DownloadFlow;
        delete window.DownloadManager;
        delete window.i18n;
    });

    test('does not throw if a stale pause event reaches the single-download flow', () => {
        const app = { showToast: jest.fn() };
        const flow = new window.DownloadFlow(app);

        expect(() => flow.togglePause()).not.toThrow();
        expect(app.showToast).toHaveBeenCalled();
        const [message, level] = app.showToast.mock.calls[0];
        expect(level).toBe('info');
        // i18n key may resolve; fallback is Chinese product default
        expect(String(message).length).toBeGreaterThan(0);
        expect(String(message)).toMatch(/pause|暂停|取消|Cancel/i);
    });
});

describe('DownloadUIManager error rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();

        window.PlaylistUIManager = class {};
        window.BatchSettingsModalUI = class {};
        window.DownloadProgressUI = class {};
        window.VideoInfoUIManager = class {
            hideSkeleton() {}
        };
        window.i18n = { t: jest.fn(() => null) };

        require('../../../src/features/download/DownloadUIManager.js');
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        delete window.PlaylistUIManager;
        delete window.BatchSettingsModalUI;
        delete window.DownloadProgressUI;
        delete window.VideoInfoUIManager;
        delete window.DownloadUIManager;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    test('escapes backend error text before injecting the error card', () => {
        document.body.innerHTML = `
            <input id="video-url">
            <div id="download-video-info" class="hidden"></div>
            <div id="download-options"></div>
            <section class="hero-section"></section>
        `;

        const ui = new window.DownloadUIManager({});
        ui.elements = {
            videoInfo: document.getElementById('download-video-info'),
            downloadOptions: document.getElementById('download-options'),
            heroSection: document.querySelector('.hero-section')
        };

        const message = 'bad"><img src=x onerror=alert(1)>';

        ui.showErrorState(message);

        expect(ui.elements.videoInfo.textContent).toContain(message);
        expect(ui.elements.videoInfo.querySelector('img')).toBeNull();
    });

    test('focuses the URL input from the error card without inline handlers', () => {
        document.body.innerHTML = `
            <input id="video-url">
            <div id="download-video-info" class="hidden"></div>
            <div id="download-options"></div>
            <section class="hero-section"></section>
        `;

        const ui = new window.DownloadUIManager({});
        ui.elements = {
            urlInput: document.getElementById('video-url'),
            videoInfo: document.getElementById('download-video-info'),
            downloadOptions: document.getElementById('download-options'),
            heroSection: document.querySelector('.hero-section')
        };

        ui.showErrorState('network failed');

        const button = ui.elements.videoInfo.querySelector('[data-action="focus-download-url"]');
        expect(button.getAttribute('onclick')).toBeNull();

        button.click();

        expect(document.activeElement).toBe(ui.elements.urlInput);
    });
});

describe('DownloadBatchUIManager list actions', () => {
    const batchModulePath = '../../../src/features/download/DownloadBatchUIManager.js';
    const batchModuleExists = (() => {
        try {
            require.resolve(batchModulePath);
            return true;
        } catch {
            return false;
        }
    })();
    const maybeTest = batchModuleExists ? test : test.skip;

    beforeEach(() => {
        if (!batchModuleExists) return;
        jest.resetModules();
        require(batchModulePath);
    });

    afterEach(() => {
        delete window.DownloadBatchUIManager;
        document.body.innerHTML = '';
    });

    maybeTest('delegates item selection and removal without inline handlers', () => {
        document.body.innerHTML = `
            <section id="page-download">
                <div id="batch-results-container"></div>
                <div id="batch-results-list"></div>
                <span id="batch-count"></span>
                <span id="batch-total-count"></span>
                <button id="btn-batch-start"></button>
                <button id="btn-batch-confirm"></button>
                <button id="btn-close-batch"></button>
                <button id="btn-clear-results"></button>
                <select id="batch-quality-select"></select>
            </section>
        `;

        const item = {
            id: 'item-1',
            selected: false,
            status: 'ready',
            title: '<unsafe title>',
            url: 'https://example.test/video'
        };
        const controller = {
            model: {
                queue: [item],
                getReadyItems: jest.fn(() => [item]),
                setQuality: jest.fn()
            },
            isProcessing: false,
            handleStartClick: jest.fn(),
            handleConfirmClick: jest.fn(),
            clearAll: jest.fn(),
            toggleItem: jest.fn(),
            removeItem: jest.fn()
        };
        const ui = new window.DownloadBatchUIManager(controller);

        ui.init();
        ui.render();

        const list = document.getElementById('batch-results-list');
        expect(list.querySelector('[onclick],[onchange]')).toBeNull();
        expect(list.textContent).toContain('<unsafe title>');

        list.querySelector('.batch-item-checkbox').dispatchEvent(new Event('change', { bubbles: true }));
        list.querySelector('[data-action="remove-batch-item"]').click();

        expect(controller.toggleItem).toHaveBeenCalledWith('item-1');
        expect(controller.removeItem).toHaveBeenCalledWith('item-1');
    });
});

describe('QueueUIManager queue actions', () => {
    const queueModulePath = '../../../src/features/download/QueueUIManager.js';
    const queueModuleExists = (() => {
        try {
            require.resolve(queueModulePath);
            return true;
        } catch {
            return false;
        }
    })();
    const maybeTest = queueModuleExists ? test : test.skip;

    beforeEach(() => {
        if (!queueModuleExists) return;
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        window.mediaflow = { shell: { showItemInFolder: jest.fn() } };
        require(queueModulePath);
    });

    afterEach(() => {
        delete window.QueueUIManager;
        delete window.i18n;
        delete window.mediaflow;
        document.body.innerHTML = '';
    });

    maybeTest('delegates queue controls and thumbnail fallback without inline handlers', () => {
        document.body.innerHTML = `
            <div id="global-queue-list"></div>
            <span id="queue-dash-count"></span>
            <span id="queue-dash-percent"></span>
            <div id="queue-global-progress"></div>
        `;

        const queueManager = {
            app: {
                downloadManager: {
                    service: { formatFileSize: jest.fn(() => '1 MB') }
                }
            },
            moveItem: jest.fn(),
            pauseTask: jest.fn(),
            resumeTask: jest.fn(),
            remove: jest.fn()
        };
        const ui = new window.QueueUIManager(queueManager);

        ui.render([
            { id: 'downloading', status: 'downloading', title: '<title>', progress: 8, thumbnail: 'bad.jpg' },
            { id: 'paused', status: 'paused', title: 'Paused' },
            { id: 'completed', status: 'completed', title: 'Done', result: { file: 'C:\\\\out.mp4' } },
            { id: 'failed', status: 'failed', title: 'Failed' }
        ]);

        const list = document.getElementById('global-queue-list');
        expect(list.querySelector('[onclick],[onerror]')).toBeNull();
        expect(list.textContent).toContain('<title>');

        list.querySelector('[data-id="downloading"] [data-action="move-up"]').click();
        list.querySelector('[data-id="downloading"] [data-action="move-down"]').click();
        list.querySelector('[data-id="downloading"] [data-action="pause"]').click();
        list.querySelector('[data-id="paused"] [data-action="resume"]').click();
        list.querySelector('[data-id="completed"] [data-action="show-file"]').click();
        list.querySelector('[data-id="failed"] [data-action="resume"]').click();
        list.querySelector('[data-id="failed"] [data-action="remove"]').click();

        expect(queueManager.moveItem).toHaveBeenCalledWith('downloading', 'up');
        expect(queueManager.moveItem).toHaveBeenCalledWith('downloading', 'down');
        expect(queueManager.pauseTask).toHaveBeenCalledWith('downloading');
        expect(queueManager.resumeTask).toHaveBeenCalledWith('paused');
        expect(queueManager.resumeTask).toHaveBeenCalledWith('failed');
        expect(window.mediaflow.shell.showItemInFolder).toHaveBeenCalledWith('C:\\\\out.mp4');
        expect(queueManager.remove).toHaveBeenCalledWith('failed');

        const image = list.querySelector('.queue-thumb-img');
        const fallback = image.nextElementSibling;
        image.dispatchEvent(new Event('error'));

        expect(image.style.display).toBe('none');
        expect(fallback.style.display).toBe('flex');
    });
});
