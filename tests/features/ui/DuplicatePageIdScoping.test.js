/** @jest-environment jsdom */

describe('duplicate page id scoping', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '';
        window.i18n = {
            t: jest.fn((key, params) => {
                if (key === 'history.batch.selected') return `selected ${params.count}`;
                return null;
            })
        };
    });

    afterEach(() => {
        delete window.BatchUIManager;
        delete window.BatchListRenderer;
        delete window.DownloadBatchUIManager;
        delete window.EnhanceUIManager;
        delete window.HistoryUI;
        delete window.SettingsFlow;
        delete window.PixelUIManager;
        delete window.PixelUIEvents;
        delete window.PixelWatermarkUI;
        delete window.PixelListRenderer;
        delete window.i18n;
    });

    test('creator batch UI count updates the creator page copy', () => {
        require('../../../src/features/video/BatchUIManager.js');
        document.body.innerHTML = `
            <section id="page-download">
                <span id="batch-count">download</span>
            </section>
            <section id="page-creator">
                <div id="batch-panel"></div>
                <span id="batch-count">creator</span>
            </section>
        `;

        const ui = new window.BatchUIManager({ creatorFlow: {} });

        ui.updateBatchCount(4);

        expect(document.querySelector('#page-creator #batch-count').textContent).toBe('4');
        expect(document.querySelector('#page-download #batch-count').textContent).toBe('download');
    });

    test('creator batch list count updates the creator page copy', () => {
        require('../../../src/features/video/BatchListRenderer.js');
        document.body.innerHTML = `
            <section id="page-download">
                <span id="batch-count">download</span>
                <span id="batch-total-duration">download-duration</span>
            </section>
            <section id="page-creator">
                <span id="batch-count">creator</span>
                <span id="batch-total-duration">creator-duration</span>
            </section>
        `;

        const renderer = new window.BatchListRenderer({ formatTime: (seconds) => `${seconds}s` });

        renderer.updateCount(3, 12);

        expect(document.querySelector('#page-creator #batch-count').textContent).toBe('3');
        expect(document.querySelector('#page-creator #batch-total-duration').textContent).toBe('12s');
        expect(document.querySelector('#page-download #batch-count').textContent).toBe('download');
        expect(document.querySelector('#page-download #batch-total-duration').textContent).toBe('download-duration');
    });

    test('download batch UI count updates the download page copy', () => {
        require('../../../src/features/download/DownloadBatchUIManager.js');
        document.body.innerHTML = `
            <section id="page-creator">
                <span id="batch-count">creator</span>
            </section>
            <section id="page-download">
                <div id="batch-results-container">
                    <div id="batch-results-list"></div>
                    <span id="batch-count">download</span>
                    <span id="batch-total-count">0</span>
                    <button id="btn-batch-start"></button>
                    <button id="btn-batch-confirm"></button>
                    <button id="btn-close-batch"></button>
                    <button id="btn-clear-results"></button>
                    <select id="batch-quality-select"></select>
                </div>
            </section>
        `;
        const controller = {
            isProcessing: false,
            handleStartClick: jest.fn(),
            handleConfirmClick: jest.fn(),
            clearAll: jest.fn(),
            model: {
                queue: [{ status: 'ready' }, { status: 'pending' }],
                getReadyItems: jest.fn(() => [{ status: 'ready' }]),
                setQuality: jest.fn()
            }
        };
        const ui = new window.DownloadBatchUIManager(controller);

        ui.init();
        ui.updateCounts();

        expect(document.querySelector('#page-download #batch-count').textContent).toBe('1');
        expect(document.querySelector('#page-download #batch-total-count').textContent).toBe('2');
        expect(document.querySelector('#page-creator #batch-count').textContent).toBe('creator');
    });

    test('history batch UI count updates the history page copy', () => {
        require('../../../src/features/history/HistoryUI.js');
        document.body.innerHTML = `
            <section id="page-download">
                <span id="batch-count">download</span>
                <button id="btn-batch-export"></button>
            </section>
            <section id="page-history">
                <span id="batch-count">history</span>
                <button id="btn-history-batch-delete" disabled></button>
                <button id="btn-batch-export" disabled></button>
            </section>
        `;
        const ui = new window.HistoryUI({}, '');

        ui.updateBatchUI(2);

        expect(document.querySelector('#page-history #batch-count').textContent).toBe('selected 2');
        expect(document.querySelector('#page-history #btn-history-batch-delete').disabled).toBe(false);
        expect(document.querySelector('#page-history #btn-batch-export').disabled).toBe(false);
        expect(document.querySelector('#page-download #batch-count').textContent).toBe('download');
    });

    test('enhance zoom buttons bind to the enhance page copy', () => {
        require('../../../src/features/enhance/EnhanceUIManager.js');
        document.body.innerHTML = `
            <section id="page-compress">
                <button id="btn-zoom-in">compress in</button>
                <button id="btn-zoom-out">compress out</button>
            </section>
            <section id="page-enhance">
                <button id="btn-zoom-in">enhance in</button>
                <button id="btn-zoom-out">enhance out</button>
            </section>
        `;
        const controller = {};
        const ui = new window.EnhanceUIManager(controller);

        const elements = ui.cacheElements();

        expect(elements.btnZoomIn).toBe(document.querySelector('#page-enhance #btn-zoom-in'));
        expect(elements.btnZoomOut).toBe(document.querySelector('#page-enhance #btn-zoom-out'));
        expect(elements.btnZoomIn.textContent).toBe('enhance in');
        expect(elements.btnZoomOut.textContent).toBe('enhance out');
    });

    test('settings modal fields are scoped to the settings page copy', () => {
        require('../../../src/features/settings/SettingsFlow.js');
        document.body.innerHTML = `
            <section id="page-download">
                <div id="modal-title">download title</div>
                <div id="modal-message">download message</div>
            </section>
            <section id="page-settings">
                <div id="custom-modal"></div>
                <div id="modal-title">settings title</div>
                <div id="modal-message">settings message</div>
                <button id="btn-modal-confirm"></button>
                <button id="btn-modal-cancel"></button>
            </section>
        `;

        const flow = new window.SettingsFlow({});
        flow.cacheElements();

        expect(flow.elements.modalTitle).toBe(document.querySelector('#page-settings #modal-title'));
        expect(flow.elements.modalMessage).toBe(document.querySelector('#page-settings #modal-message'));
        expect(flow.elements.modalTitle).not.toBe(document.querySelector('#page-download #modal-title'));
    });

    test('pixel controls and watermark options are scoped to the compress page copy', () => {
        require('../../../src/features/image/PixelWatermarkUI.js');
        require('../../../src/features/image/PixelUIEvents.js');
        window.PixelListRenderer = class {};
        require('../../../src/features/image/PixelUIManager.js');
        document.body.innerHTML = `
            <section id="page-compress">
                <button id="btn-zoom-in">compress in</button>
                <button id="btn-zoom-out">compress out</button>
                <input id="watermark-text" value="Compress watermark" />
                <input id="watermark-text-opacity" value="55" />
                <input id="watermark-text-size" value="24" />
                <input id="watermark-image-opacity" value="70" />
                <input id="watermark-image-size" value="30" />
                <input id="watermark-rotation" value="5" />
                <input id="watermark-margin" value="8" />
                <input id="watermark-font" value="serif" />
                <input id="watermark-color" value="#111111" />
                <input id="watermark-shadow" type="checkbox" checked />
                <input id="watermark-outline" type="checkbox" />
                <input id="watermark-tile" type="checkbox" />
                <input id="compress-quality" value="80" />
                <select id="compress-format"><option value="webp" selected>webp</option></select>
                <input id="resize-width" value="1280" />
                <input id="resize-height" value="720" />
                <input id="rename-keep-name" type="checkbox" checked />
                <input id="rename-add-suffix" type="checkbox" checked />
                <input id="rename-suffix" value="_small" />
                <input id="rename-add-index" type="checkbox" />
                <input id="rename-add-date" type="checkbox" />
                <input id="keep-icc" type="checkbox" />
                <input id="strip-exif" type="checkbox" checked />
                <button id="btn-view-slider"></button>
                <button id="btn-view-split"></button>
                <button id="btn-preview-reset"></button>
            </section>
            <section id="page-enhance">
                <button id="btn-zoom-in">enhance in</button>
                <button id="btn-zoom-out">enhance out</button>
            </section>
            <section id="page-creator">
                <input id="watermark-text" value="Creator watermark" />
            </section>
        `;
        const controller = {
            fileManager: { getCurrentFile: jest.fn(() => null) },
            preview: jest.fn()
        };
        const ui = new window.PixelUIManager(controller);
        ui.previewManager = { zoomIn: jest.fn(), zoomOut: jest.fn() };

        ui.events.bindPreviewToolbar();
        document.querySelector('#page-compress #btn-zoom-in').click();
        document.querySelector('#page-compress #btn-zoom-out').click();
        document.querySelector('#page-enhance #btn-zoom-in').click();

        const options = ui.getCompressOptions();

        expect(ui.previewManager.zoomIn).toHaveBeenCalledTimes(1);
        expect(ui.previewManager.zoomOut).toHaveBeenCalledTimes(1);
        expect(options.watermark.text).toBe('Compress watermark');
        expect(options.watermark.textOpacity).toBe(0.55);
        expect(options.watermark.textSize).toBe(24);
    });
});
