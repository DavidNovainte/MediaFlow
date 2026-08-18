/** @jest-environment jsdom */

describe('user controlled labels render as text', () => {
    const unsafeText = 'bad"><img src=x onerror=alert(1)>';

    beforeAll(() => {
        require('../../../src/features/history/HistoryUI');
        require('../../../src/features/download/QueueUIManager');
        require('../../../src/features/download/PlaylistUIManager');
        require('../../../src/features/scribe/ScribeQueueManager');
        require('../../../src/features/enhance/EnhanceStateManager');
        require('../../../src/features/editor/ui/EditorUIManager');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        window.i18n = { t: jest.fn(() => null) };
        window.DEFAULT_THUMBNAIL = '';
    });

    afterEach(() => {
        delete window.i18n;
        delete window.DEFAULT_THUMBNAIL;
    });

    test('history rows escape external titles, platforms, and thumbnail attributes', () => {
        document.body.innerHTML = `
            <div id="history-list"></div>
            <div id="history-empty"></div>
            <div id="history-no-results"></div>
            <div id="history-stats"></div>
        `;

        const ui = new window.HistoryUI({}, 'fallback.png');
        ui.renderHistory([{
            id: 'history-1',
            title: unsafeText,
            platform: unsafeText,
            thumbnail: 'thumb.jpg" onerror="alert(2)',
            timestamp: Date.UTC(2026, 0, 1),
            fileSize: 1024
        }], new Set(), new Set(), 1);

        expect(document.querySelector('.history-title').textContent).toContain(unsafeText);
        expect(document.querySelector('.history-meta').textContent).toContain(unsafeText);
        expect(document.querySelectorAll('img')).toHaveLength(1);
        expect(document.querySelector('.history-thumb').getAttribute('onerror')).toBeNull();
    });

    test('download queue rows escape titles, errors, ids, and paths', () => {
        document.body.innerHTML = '<div id="global-queue-list"></div>';

        const ui = new window.QueueUIManager({
            app: {
                downloadManager: {
                    service: { formatFileSize: jest.fn(() => '1 MB') }
                }
            }
        });

        const unsafeFile = 'C:\\bad\\file\');alert(3);//.mp4';

        ui.render([{
            id: 'id\');alert(9);//',
            title: unsafeText,
            error: unsafeText,
            status: 'failed',
            totalBytes: 1024,
            result: { file: unsafeFile }
        }, {
            id: 'completed',
            title: 'Completed',
            status: 'completed',
            result: { file: unsafeFile }
        }]);

        expect(document.querySelector('.queue-item-title').textContent).toBe(unsafeText);
        expect(document.querySelector('.queue-item-error').textContent).toBe(unsafeText);
        expect(document.querySelectorAll('img')).toHaveLength(0);
        expect(document.querySelector('.queue-item').dataset.id).toBe('id\');alert(9);//');
        expect(document.querySelector('.q-remove').getAttribute('onclick')).toBeNull();
        expect(document.querySelector('[data-action="show-file"]').getAttribute('onclick')).toBeNull();
        expect(document.querySelector('[data-action="show-file"]').dataset.file).toBe(unsafeFile);
    });

    test('playlist rows escape titles and thumbnail attributes', () => {
        document.body.innerHTML = `
            <div id="playlist-items"></div>
            <div id="playlist-title"></div>
            <div id="playlist-count"></div>
            <input id="playlist-select-all" type="checkbox">
            <section id="playlist-info" class="hidden"></section>
            <button id="btn-download-all"></button>
        `;

        const manager = {
            service: { formatDuration: jest.fn(() => '1:00') },
            handlePlaylistSelectAll: jest.fn(),
            handlePlaylistItemSelect: jest.fn(),
            downloadPlaylist: jest.fn()
        };
        const ui = {
            hideSkeleton: jest.fn(),
            manager,
            resetUI: jest.fn(),
            elements: {
                heroSection: document.createElement('div'),
                videoInfo: document.createElement('div'),
                downloadOptions: document.createElement('div'),
                btnReset: document.createElement('button')
            }
        };

        new window.PlaylistUIManager(ui).renderPlaylistInfo({
            count: 1,
            items: [{
                title: unsafeText,
                thumbnail: 'thumb.jpg" onerror="alert(2)',
                duration: 60
            }]
        }, new Set([0]));

        expect(document.querySelector('.playlist-item-title').textContent).toBe(unsafeText);
        expect(document.querySelectorAll('img')).toHaveLength(1);
        expect(document.querySelector('.playlist-item-thumb').getAttribute('onerror')).toBeNull();
    });

    test('scribe queue rows escape local file names', () => {
        document.body.innerHTML = `
            <div id="scribe-file-queue"></div>
            <div id="scribe-queue-count"></div>
        `;

        const manager = new window.ScribeQueueManager({
            audioFiles: [{ name: `${unsafeText}.mp3`, size: 1024 }]
        });
        manager.renderQueue();

        expect(document.querySelector('.scribe-queue-item span[title]').textContent).toBe(`${unsafeText}.mp3`);
        expect(document.querySelectorAll('img')).toHaveLength(0);
    });

    test('enhance queue rows escape paths, file names, errors, and chips', () => {
        document.body.innerHTML = `
            <div id="enhance-file-list"></div>
            <div id="enhance-file-count"></div>
        `;

        const manager = new window.EnhanceStateManager({
            elements: {
                fileList: document.getElementById('enhance-file-list'),
                fileCount: document.getElementById('enhance-file-count')
            }
        });
        manager.fileData = [{
            path: `C:/assets/${unsafeText}.png`,
            engine: unsafeText,
            options: { scale: `2${unsafeText}`, format: unsafeText },
            result: { status: 'error', error: unsafeText }
        }];

        manager.updateFileList();

        expect(document.querySelector('.file-name').textContent).toBe(`${unsafeText}.png`);
        expect(document.querySelector('.file-item').getAttribute('title')).toBe(unsafeText);
        expect(document.querySelector('.file-item').getAttribute('onclick')).toBeNull();
        expect(document.querySelector('.btn-remove').getAttribute('onclick')).toBeNull();
        expect(document.querySelectorAll('img')).toHaveLength(0);

        manager.switchPreview = jest.fn();
        manager.removeFile = jest.fn();

        document.querySelector('.file-name').click();
        document.querySelector('.btn-remove').click();

        expect(manager.switchPreview).toHaveBeenCalledWith(0);
        expect(manager.removeFile).toHaveBeenCalledWith(0);
    });

    test('editor asset cards escape asset names and media attributes', () => {
        document.body.innerHTML = `
            <div id="editor-asset-list"></div>
            <div id="editor-assets-count"></div>
        `;

        const manager = new window.EditorUIManager({
            store: {
                selectAsset: jest.fn(),
                getState: jest.fn(() => ({ playheadTime: 0 })),
                insertAssetAtTime: jest.fn()
            }
        });
        manager.elements = {
            assetList: document.getElementById('editor-asset-list'),
            assetsCount: document.getElementById('editor-assets-count')
        };

        manager.renderAssets({
            assets: [{
                id: 'asset-1',
                name: `${unsafeText}.png`,
                kind: 'image',
                src: 'blob:image" onerror="alert(4)',
                duration: 1
            }],
            selectedAssetId: null
        });

        expect(document.querySelector('.editor-asset-name').getAttribute('title')).toBe(unsafeText);
        expect(document.querySelector('.editor-asset-name').textContent).toContain('bad">');
        expect(document.querySelectorAll('img')).toHaveLength(1);
        expect(document.querySelector('.editor-asset-visual-image img').getAttribute('onerror')).toBeNull();
    });
});
