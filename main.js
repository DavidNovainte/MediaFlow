/**
 * MediaFlow Community — Electron main process (Open Core)
 * Community tools only: single download, history, image compress, transcription,
 * settings (+ upgrade CTA). No enhance / creator / editor / subtitle / mobile.
 */
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const { initBinaries } = require('./src/utils/binaries');
const clipboardWatcher = require('./src/utils/clipboardWatcher');
const Logger = require('./src/utils/logger');
const ProcessManager = require('./src/utils/ProcessManager');

Logger.setupGlobalConsoleAntiExplosion();

process.on('uncaughtException', (error) => {
    Logger.error(`[Main] uncaughtException: ${error?.stack || error?.message || error}`);
});

process.on('unhandledRejection', (reason) => {
    Logger.error(`[Main] unhandledRejection: ${reason?.stack || reason?.message || reason}`);
});

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'media-file',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true
        }
    }
]);

const { setupDownloadHandlers } = require('./src/handlers/downloadHandler');
const { setupTranscribeHandlers } = require('./src/handlers/transcribeHandler');
const { setupImageHandlers } = require('./src/handlers/imageHandler');
const { setupSystemHandlers, performCleanup } = require('./src/handlers/systemHandler');

const store = new Store();
let mainWindow = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 720,
        frame: false,
        titleBarStyle: 'hidden',
        title: 'MediaFlow Community',
        backgroundColor: '#09090b',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icons/mediaflow-studio-icon.png')
    });

    try {
        mainWindow.setTitle('MediaFlow Community');
    } catch (_) {}

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    mainWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault();
    });

    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.setMenu(null);
    }

    clipboardWatcher.setMainWindow?.(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
        clipboardWatcher.setMainWindow?.(null);
    });
}

function registerMediaProtocol() {
    protocol.handle('media-file', async (request) => {
        try {
            const urlObj = new URL(request.url);
            let filePath = '';

            if (process.platform === 'win32') {
                if (urlObj.host && !urlObj.pathname.startsWith('/' + urlObj.host)) {
                    filePath = urlObj.host + ':' + urlObj.pathname;
                } else {
                    filePath = urlObj.pathname;
                    if (filePath.startsWith('/')) filePath = filePath.substring(1);
                }
            } else {
                filePath = urlObj.pathname;
            }

            filePath = decodeURIComponent(filePath);
            if (process.platform === 'win32') {
                filePath = filePath.replace(/\//g, '\\');
            }

            return net.fetch(url.pathToFileURL(filePath).href);
        } catch (error) {
            Logger.error(`[Main] media-file protocol error: ${error?.message || error}`);
            return new Response('Not found', { status: 404 });
        }
    });
}

// Community IPC: download + transcribe + image + system + engine status
setupDownloadHandlers(ipcMain);
setupTranscribeHandlers(ipcMain);
setupImageHandlers(ipcMain);
setupSystemHandlers(ipcMain);
try {
    const engineManager = require('./src/handlers/EngineManager');
    if (engineManager && typeof engineManager.setupHandlers === 'function') {
        engineManager.setupHandlers(ipcMain);
    }
} catch (error) {
    Logger.warn(`[Main] EngineManager not available: ${error?.message || error}`);
}

if (gotTheLock) {
    app.whenReady().then(() => {
        if (process.platform === 'win32') {
            app.setAppUserModelId('com.mediaflow.community');
        }

        try {
            initBinaries();
        } catch (error) {
            Logger.warn(`[Main] initBinaries: ${error?.message || error}`);
        }

        registerMediaProtocol();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.on('window-all-closed', async () => {
    try {
        await performCleanup();
    } catch (error) {
        Logger.warn(`[Main] performCleanup: ${error?.message || error}`);
    }
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    try {
        ProcessManager.killAll?.();
    } catch (error) {
        Logger.warn(`[Main] ProcessManager.killAll: ${error?.message || error}`);
    }
});
