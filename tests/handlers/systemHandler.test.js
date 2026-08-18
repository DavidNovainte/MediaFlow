// Mock electron-store FIRST before any requires to avoid loading real module
const mockStoreInstance = {
    get: jest.fn(),
    set: jest.fn()
};

const MockStore = jest.fn(() => mockStoreInstance);
MockStore.prototype = mockStoreInstance;

jest.mock('electron-store', () => MockStore);

const { setupSystemHandlers } = require('../../src/handlers/systemHandler');
const { shell, dialog, app, BrowserWindow } = require('electron');
const Store = require('electron-store');
const processQueue = require('../../src/utils/ProcessQueue');
const path = require('path');

// Mock dependencies
jest.mock('electron', () => ({
    dialog: { showOpenDialog: jest.fn(), showSaveDialog: jest.fn(), showMessageBox: jest.fn() },
    shell: { openPath: jest.fn(), showItemInFolder: jest.fn(), openExternal: jest.fn() },
    app: { getPath: jest.fn(), getLocale: jest.fn(), getVersion: jest.fn(), isPackaged: false },
    BrowserWindow: { fromWebContents: jest.fn() },
    clipboard: { writeText: jest.fn(), readText: jest.fn() },
    Notification: jest.fn(() => ({ show: jest.fn() }))
}));
jest.mock('electron-store');
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue([]),
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('{}'),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ isDirectory: () => false }),
    promises: {
        readdir: jest.fn().mockResolvedValue([]),
        stat: jest.fn().mockResolvedValue({ size: 100, isDirectory: () => false }),
        unlink: jest.fn().mockResolvedValue(true),
        copyFile: jest.fn().mockResolvedValue(true),
        readFile: jest.fn().mockResolvedValue('{}'),
        writeFile: jest.fn().mockResolvedValue(true),
        mkdir: jest.fn().mockResolvedValue(true)
    }
}));
jest.mock('../../src/utils/clipboardWatcher', () => ({ isEnabled: true, setEnabled: jest.fn() }));
jest.mock('../../src/utils/ProcessQueue', () => ({ setConcurrency: jest.fn(), getStatus: jest.fn(), cancelTask: jest.fn(), killAll: jest.fn() }));
	jest.mock('../../src/utils/logger', () => ({
	    info: jest.fn(),
	    warn: jest.fn(),
	    error: jest.fn(),
	    ffmpeg: jest.fn(),
	    reportToGoogleSheets: jest.fn(),
	    logDir: '/tmp/mediaflow-logs'
	}));

const logger = require('../../src/utils/logger');

describe('systemHandler', () => {
    let mockIpcMain;
    let handlers = {};
    let events = {};

    beforeEach(() => {
        jest.clearAllMocks();
        mockIpcMain = {
            handle: jest.fn((channel, handler) => {
                handlers[channel] = handler;
            }),
            on: jest.fn((channel, cb) => {
                events[channel] = cb;
            })
        };
        setupSystemHandlers(mockIpcMain);
    });

    describe('窗口控制', () => {
        it('应能正确调用最小化', () => {
            const mockWin = { minimize: jest.fn() };
            BrowserWindow.fromWebContents.mockReturnValue(mockWin);
            events['window:minimize']({ sender: {} });
            expect(mockWin.minimize).toHaveBeenCalled();
        });
    });

    describe('存储操作', () => {
        it('store:get 应返回存储的值', async () => {
            Store.prototype.get.mockReturnValue('test-value');
            const result = await handlers['store:get']({}, 'test-key');
            expect(result).toBe('test-value');
        });

        it('store:set 应正确调用存储', async () => {
            await handlers['store:set']({}, 'test-key', 'test-value');
            expect(Store.prototype.set).toHaveBeenCalledWith('test-key', 'test-value');
        });
    });

    describe('对话框操作', () => {
        it('dialog:selectFolder 应返回选择的路径', async () => {
            dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/selected/path'] });
            const result = await handlers['dialog:selectFolder']({ sender: {} });
            expect(result).toBe('/selected/path');
        });

        it('dialog:showMessageBox forwards safe options to Electron', async () => {
            const mockWin = {};
            BrowserWindow.fromWebContents.mockReturnValue(mockWin);
            dialog.showMessageBox.mockResolvedValue({ response: 1 });

            const result = await handlers['dialog:showMessageBox'](
                { sender: {} },
                {
                    type: 'question',
                    buttons: ['Cancel', 'Merge'],
                    defaultId: 1,
                    cancelId: 0,
                    title: 'Confirm',
                    message: 'Merge clips?'
                }
            );

            expect(dialog.showMessageBox).toHaveBeenCalledWith(mockWin, expect.objectContaining({
                type: 'question',
                buttons: ['Cancel', 'Merge'],
                defaultId: 1,
                cancelId: 0,
                title: 'Confirm',
                message: 'Merge clips?'
            }));
            expect(result).toEqual({ response: 1 });
        });
    });

    describe('文件系统操作', () => {
        it('opens the browser extension from extraResources in packaged builds', () => {
            const originalResourcesPath = process.resourcesPath;
            Object.defineProperty(process, 'resourcesPath', {
                configurable: true,
                value: 'C:\\Program Files\\MediaFlow\\resources'
            });
            app.isPackaged = true;

            events['shell:openExtensionFolder']();

            expect(shell.openPath).toHaveBeenCalledWith(path.join(process.resourcesPath, 'extension'));

            app.isPackaged = false;
            Object.defineProperty(process, 'resourcesPath', {
                configurable: true,
                value: originalResourcesPath
            });
        });

        it('fs:stat 应返回 size 和 mtime 信息', async () => {
            const fs = require('fs');
            fs.promises.stat.mockResolvedValueOnce({
                size: 2048,
                mtimeMs: 1710000000456,
                isDirectory: () => false
            });

            const result = await handlers['fs:stat']({}, '/video/clip.mp4');

            expect(result).toEqual({
                success: true,
                size: 2048,
                mtimeMs: 1710000000456,
                lastModified: 1710000000456,
                isDirectory: false
            });
        });

        it('fs:copyFile copies files through the safe path wrapper', async () => {
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const source = path.join(os.tmpdir(), 'mediaflow-source.mp4');
            const target = path.join(os.tmpdir(), 'mediaflow-target.mp4');

            const result = await handlers['fs:copyFile']({}, source, target);

            expect(fs.promises.copyFile).toHaveBeenCalledWith(source, target);
            expect(result).toEqual({ success: true, path: target });
        });
    });

    describe('清理逻辑', () => {
        it('system:cleanup 应调用进程清理', async () => {
            processQueue.getStatus.mockReturnValue({ running: 5 });
            app.getPath.mockReturnValue('/tmp');

            const result = await handlers['system:cleanup']();

            expect(result.success).toBe(true);
            expect(processQueue.killAll).toHaveBeenCalled();
        });
    });

    describe('logs folder', () => {
        it('system:openLogsDir opens the logger directory', async () => {
            shell.openPath.mockResolvedValue('');

            const result = await handlers['system:openLogsDir']();

            expect(shell.openPath).toHaveBeenCalledWith('/tmp/mediaflow-logs');
            expect(result).toEqual({ success: true, path: '/tmp/mediaflow-logs' });
        });
    });

    describe('error reporting', () => {
        it('system:reportError should forward payloads to logger.reportToGoogleSheets', async () => {
            logger.reportToGoogleSheets.mockResolvedValue({ success: true });

            const payload = { type: 'USER_REPORT', message: 'boom' };
            const result = await handlers['system:reportError']({}, payload);

            expect(logger.reportToGoogleSheets).toHaveBeenCalledWith(payload);
            expect(result).toEqual({ success: true });
        });
    });
});
