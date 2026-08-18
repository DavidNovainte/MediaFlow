/** @jest-environment jsdom */

describe('QueueManager history integration', () => {
    beforeEach(() => {
        jest.resetModules();

        window.QueueUIManager = class {
            constructor() {}
        };
        window.QueueStore = class {
            constructor() {}
        };
        window.QueueExecutionSvc = class {
            constructor() {}
        };
        window.i18n = { t: jest.fn(() => null) };
        window.mediaflow = {
            video: {
                cancelDownload: jest.fn().mockResolvedValue(undefined)
            },
            notification: {
                show: jest.fn()
            }
        };

        require('../../../src/features/download/QueueManager.js');
    });

    afterEach(() => {
        delete window.QueueUIManager;
        delete window.QueueStore;
        delete window.QueueExecutionSvc;
        delete window.QueueManager;
        delete window.i18n;
        delete window.mediaflow;
    });

    test('stores the completed file path in download history', async () => {
        const app = {
            showToast: jest.fn(),
            historyManager: {
                addToHistory: jest.fn()
            }
        };
        const manager = new window.QueueManager(app);
        manager.activeDownloads = 0;
        manager.emit = jest.fn();
        manager.saveQueue = jest.fn();
        manager.checkAllCompleted = jest.fn();
        manager.executionSvc.executeTask = jest.fn(async (item) => {
            item.result = {
                success: true,
                file: 'F:\\Downloads\\finished.mp4',
                path: 'F:\\Downloads'
            };
            return item.result;
        });
        manager.queue = [{
            id: 'q1',
            url: 'https://example.com/video',
            title: 'Queued video',
            status: 'pending',
            priority: 0,
            addedAt: 1,
            settings: {
                outputDir: 'F:\\Downloads'
            },
            thumbnail: 'thumb.jpg',
            platform: 'facebook'
        }];

        await manager.processQueue();

        expect(app.historyManager.addToHistory).toHaveBeenCalledWith(expect.objectContaining({
            filePath: 'F:\\Downloads\\finished.mp4',
            saveDir: 'F:\\Downloads'
        }));
    });

    test('keeps active download count at zero after cancelAll settles concurrent tasks', async () => {
        const app = {
            showToast: jest.fn()
        };
        const manager = new window.QueueManager(app);
        const resolvers = {};

        manager.emit = jest.fn();
        manager.saveQueue = jest.fn();
        manager.checkAllCompleted = jest.fn();
        manager.config.maxConcurrency = 2;
        manager.executionSvc.executeTask = jest.fn((item) => new Promise((resolve) => {
            resolvers[item.id] = resolve;
        }));
        manager.executionSvc.translateError = jest.fn((error) => error.message);
        manager.queue = [{
            id: 'q1',
            title: 'First',
            status: 'pending',
            retryCount: 0,
            priority: 0,
            addedAt: 1,
            settings: {}
        }, {
            id: 'q2',
            title: 'Second',
            status: 'pending',
            retryCount: 0,
            priority: 0,
            addedAt: 2,
            settings: {}
        }];

        const first = manager.processQueue();
        const second = manager.processQueue();

        expect(manager.activeDownloads).toBe(2);

        await manager.cancelAll();
        expect(manager.activeDownloads).toBe(0);

        resolvers.q1({ success: true });
        resolvers.q2({ success: true });
        await Promise.all([first, second]);

        expect(manager.activeDownloads).toBe(0);
        expect(manager._cancelledTaskIds.size).toBe(0);
    });

    test('does not decrement active downloads twice when removing a running task', async () => {
        const app = {
            showToast: jest.fn()
        };
        const manager = new window.QueueManager(app);
        let resolveTask;

        manager.emit = jest.fn();
        manager.saveQueue = jest.fn();
        manager.checkAllCompleted = jest.fn();
        manager.executionSvc.executeTask = jest.fn(() => new Promise((resolve) => {
            resolveTask = resolve;
        }));
        manager.executionSvc.translateError = jest.fn((error) => error.message);
        manager.queue = [{
            id: 'q1',
            title: 'Running',
            status: 'pending',
            retryCount: 0,
            priority: 0,
            addedAt: 1,
            settings: {}
        }];

        const running = manager.processQueue();
        expect(manager.activeDownloads).toBe(1);

        await manager.remove('q1');
        expect(manager.activeDownloads).toBe(0);

        resolveTask({ success: true });
        await running;

        expect(manager.activeDownloads).toBe(0);
        expect(manager._cancelledTaskIds.size).toBe(0);
    });
});
