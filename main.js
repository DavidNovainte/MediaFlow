/**
 * MediaFlow - Electron 主进程
 * 视频下载、音频转文字、图片压缩多功能媒体工具
 */

const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const { initBinaries } = require('./src/utils/binaries');
const clipboardWatcher = require('./src/utils/clipboardWatcher');
const Logger = require('./src/utils/logger');
const ProcessManager = require('./src/utils/ProcessManager');

// 🛡️ 启用防爆截断，防止终端假死
Logger.setupGlobalConsoleAntiExplosion();

process.on('uncaughtException', (error) => {
    Logger.error(`[Main] uncaughtException: ${error?.stack || error?.message || error}`);
});

process.on('unhandledRejection', (reason) => {
    Logger.error(`[Main] unhandledRejection: ${reason?.stack || reason?.message || reason}`);
});

// 必须在 app.ready 之前注册：让 media-file 协议享有与 https 相同的权限
// 包括：支持 Range Request（<audio>/<video> 流式播放必须）、ServiceWorker、fetch 等
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'media-file',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true          // ← 关键：启用流式响应，支持 Range Request
        }
    }
]);

// Handlers
const { setupVideoHandlers } = require('./src/handlers/videoHandler');
const { setupCreatorHandlers } = require('./src/handlers/creatorHandler');
const { setupDownloadHandlers } = require('./src/handlers/downloadHandler');
const { setupTranscribeHandlers } = require('./src/handlers/transcribeHandler');
const { setupImageHandlers } = require('./src/handlers/imageHandler');
const { setupMobileHandlers, startMobileServer } = require('./src/handlers/mobileHandler');
const { setupSystemHandlers, performCleanup } = require('./src/handlers/systemHandler');
const { setupAudioHandlers } = require('./src/handlers/audioHandler');
const { setupSubtitleHandlers } = require('./src/handlers/subtitle/subtitleHandler');
const { setupTTSHandlers } = require('./src/handlers/subtitle/ttsHandler');
const { setupEnhanceHandlers } = require('./src/handlers/enhance');
const engineManager = require('./src/handlers/EngineManager');

// Settings store
const store = new Store();

const forceSoftwareRendering = store.get('subtitleSoftwareRenderMode', false);
if (forceSoftwareRendering) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    console.log('[Main] Hardware acceleration disabled for CPU-safe subtitle rendering');
}

// Inject Store into MobileFlow Server
const mobileFlowServer = require('./services/server');
mobileFlowServer.setStore(store);

let mainWindow = null;
const recentProtocolLogTimes = new Map();
// Capture real console before any filtering / production silence.
const nativeConsoleLog = console.log.bind(console);
const nativeConsoleDebug = console.debug.bind(console);
const nativeConsoleInfo = console.info.bind(console);

function shouldLogProtocolRequest(requestUrl, filePath) {
    const debugEnabled = process.env.MEDIAFLOW_DEBUG_PROTOCOL === '1';
    if (!debugEnabled) return false;

    const now = Date.now();
    const key = `${requestUrl}::${filePath}`;
    const lastLoggedAt = recentProtocolLogTimes.get(key) || 0;
    if (now - lastLoggedAt < 2000) return false;

    recentProtocolLogTimes.set(key, now);

    if (recentProtocolLogTimes.size > 200) {
        for (const [cacheKey, timestamp] of recentProtocolLogTimes.entries()) {
            if (now - timestamp > 10000) recentProtocolLogTimes.delete(cacheKey);
        }
    }

    return true;
}

// Production: silence noisy logs (keep warn/error for diagnostics).
// Dev: filter high-volume [Protocol] URL spam unless MEDIAFLOW_DEBUG_PROTOCOL=1.
if (app.isPackaged) {
    const noop = () => {};
    try {
        console.log = noop;
        console.debug = noop;
        console.info = noop;
    } catch {
        /* ignore */
    }
} else {
    console.log = (...args) => {
        if (
            typeof args[0] === 'string' &&
            args[0].startsWith('[Protocol]') &&
            String(args[0]).includes('URL:')
        ) {
            const requestUrl = args[1];
            const filePath = args[3];
            if (!shouldLogProtocolRequest(requestUrl, filePath)) {
                return;
            }
        }
        nativeConsoleLog(...args);
    };
    // keep debug/info as native in dev
    console.debug = nativeConsoleDebug;
    console.info = nativeConsoleInfo;
}

const gotTheLock = app.requestSingleInstanceLock();

// 初始化二进制路径 & 根据设置决定是否启动移动端服务
app.whenReady().then(async () => {
    if (!gotTheLock) {
        return;
    }

    // 设置 AppUserModelId (仅限 Windows)，解决固定到任务栏后图标变为默认 Electron 图标的问题
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.mediaflow.app');
    }

    app.on('child-process-gone', (_event, details) => {
        Logger.error(`[Main] child-process-gone: ${JSON.stringify(details)}`);
    });

    app.on('render-process-gone', (_event, webContents, details) => {
        Logger.error(
            `[Main] render-process-gone: ${JSON.stringify({
                reason: details?.reason,
                exitCode: details?.exitCode,
                url: webContents?.getURL?.()
            })}`
        );
    });

    app.on('browser-window-created', (_event, window) => {
        window.webContents.on('render-process-gone', (_wcEvent, details) => {
            Logger.error(
                `[Main] browser-window render-process-gone: ${JSON.stringify({
                    reason: details?.reason,
                    exitCode: details?.exitCode,
                    url: window.webContents?.getURL?.()
                })}`
            );
        });
    });

    initBinaries();

    // 🧹 Auto-clean old temp files on startup (Optional, already handled in systemHandler locally or on exit)
    // Removed direct tempCleaner.clean() call as it causes ReferenceError

    // Load saved PIN code for MobileFlow authentication
    const savedPin = store.get('mobileflowPin', '');
    if (savedPin && /^[0-9]{4,6}$/.test(savedPin)) {
        const mobileFlowServer = require('./services/server');
        mobileFlowServer.setPin(savedPin);
        console.log('[Main] MobileFlow PIN protection enabled');
    }

    // Always start the dedicated lightweight Localhost Server for the Browser Extension
    try {
        const extensionServer = require('./services/ExtensionServer');
        extensionServer.start();
    } catch (e) {
        console.error('[Main] Failed to start ExtensionServer:', e);
    }

    // Check if user enabled auto-start for MobileFlow (Mobile/PC local LAN server)
    const autoStart = store.get('mobileflowAutostart', false);
    if (autoStart) {
        try {
            let port = Number(store.get('mobileflowPort', 8765));
            if (!Number.isFinite(port) || port < 1024 || port > 65535) port = 8765;
            await startMobileServer(Math.floor(port));
            console.log(`[Main] MobileFlow server auto-started on port ${Math.floor(port)}`);
        } catch (e) {
            console.error('[Main] Failed to auto-start MobileFlow server:', e);
        }
    } else {
        console.log('[Main] MobileFlow auto-start disabled');
    }
});

/**
 * 创建主窗口
 */
function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
        return mainWindow;
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        frame: false, // 无边框窗口
        titleBarStyle: 'hidden',
        backgroundColor: '#1a1a2e',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icons/mediaflow-studio-icon.png')
    });

    mainWindow.once('ready-to-show', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
        console.log('[Main] Main window ready-to-show');
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error('[Main] did-fail-load:', { errorCode, errorDescription, validatedURL });
    });

    mainWindow.loadFile('src/index.html').catch((err) => {
        console.error('[Main] loadFile failed:', err);
        // Still show a shell so startup never looks like a silent hang
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Prevent ALL navigation to fix blank screen when files are dropped
    mainWindow.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
    });

    // Open any target="_blank" external link in the system browser, never in-app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Development Tools & Menu Handling
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // 🔒 生产环境下安全性增强
        mainWindow.setMenu(null);
        
        // 禁用开发者工具快捷键 (F12, Ctrl+Shift+I 等)
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.control && input.shift && input.key.toLowerCase() === 'i') event.preventDefault();
            if (input.key === 'F12') event.preventDefault();
            if (input.control && input.shift && input.key.toLowerCase() === 'j') event.preventDefault();
            if (input.control && input.key.toLowerCase() === 'u') event.preventDefault();
        });

        // 拦截并关闭任何意外打开的 DevTools (兜底)
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow.webContents.closeDevTools();
        });
    }

    // Link clipboard watcher
    clipboardWatcher.setMainWindow(mainWindow);
    try {
        require('./services/ExtensionServer').setMainWindow(mainWindow);
    } catch (e) {
        console.warn('[Main] ExtensionServer.setMainWindow failed:', e);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        try {
            require('./services/ExtensionServer').setMainWindow(null);
        } catch (_) {}
        clipboardWatcher.setMainWindow(null);
    });
}

/**
 * 注册协议处理 (mediaflow://)
 */
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('mediaflow', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('mediaflow');
}

// macOS 专属：通过事件捕获协议链接 (应用已运行时)
app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('[Main] open-url event received:', url);
    if (mainWindow) {
        handleProtocolUrl(url);
    } else {
        // 如果窗口还没创建，存入 argv 模拟启动参数 (或者在 ready 后处理)
        process.argv.push(url);
    }
});

if (!gotTheLock) {
    // Another MediaFlow/Electron instance already holds the lock.
    // Without a clear log this looks like "npm run dev did nothing".
    console.warn('[Main] Another MediaFlow instance is already running.');
    console.warn('[Main] Focusing the existing window and exiting this process.');
    console.warn('[Main] If you see no window: taskkill /F /IM electron.exe  then npm run dev again.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 当运行第二个实例时，确保主窗口存在并置前
        console.log('[Main] second-instance: bringing main window to front');
        try {
            if (!mainWindow || mainWindow.isDestroyed()) {
                createWindow();
            } else {
                if (mainWindow.isMinimized()) mainWindow.restore();
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.setAlwaysOnTop(true);
                mainWindow.focus();
                mainWindow.setAlwaysOnTop(false);
            }

            // 处理协议链接
            const url = commandLine.find(arg => arg.startsWith('mediaflow://'));
            if (url) handleProtocolUrl(url);
        } catch (e) {
            console.error('[Main] second-instance focus failed:', e);
        }
    });

    /**
     * 应用就绪
     */
    app.whenReady().then(() => {
        // 注册媒体文件访问协议
        // 必须使用 protocol.handle 而非 registerFileProtocol
        // 因为 registerFileProtocol 不支持 HTTP Range Request，
        // 导致 <audio>/<video> 标签无法流式播放（只能播放但无法 seek）
        protocol.handle('media-file', async (request) => {
            const fs = require('fs');
            const mime = require('mime-types');

            try {
                // 使用标准的 URL 解析器来解析路径，处理 host 和 pathname
                const urlObj = new URL(request.url);
                let filePath = '';
                
                if (process.platform === 'win32') {
                    // 在 Windows 下，如果是 media-file:///C:/... 格式，urlObj.pathname 为 /C:/...
                    // 如果是 media-file://c/Users/... 这种被误识别为 host 的格式
                    if (urlObj.host && !urlObj.pathname.startsWith('/' + urlObj.host)) {
                        // host 被误认为盘符
                        filePath = urlObj.host + ':' + urlObj.pathname;
                    } else {
                        filePath = urlObj.pathname;
                        // 移除领先的斜杠 (如 /C:/... -> C:/...)
                        if (filePath.startsWith('/')) filePath = filePath.substring(1);
                    }
                } else {
                    filePath = urlObj.pathname;
                }
                
                filePath = decodeURIComponent(filePath);
                if (process.platform === 'win32') {
                    filePath = filePath.replace(/\//g, '\\');
                }

                console.log('[Protocol] 原始URL:', request.url, '| 解析后磁盘路径:', filePath);

                // 检查文件是否存在
                if (!fs.existsSync(filePath)) {
                    console.error('[Protocol] 404 文件物理路径不存在:', filePath);
                    return new Response('File not found: ' + filePath, { 
                        status: 404,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }

                const stat = fs.statSync(filePath);
                const fileSize = stat.size;
                const mimeType = mime.lookup(filePath) || 'application/octet-stream';

                // 处理 Range 请求（<audio>/<video> 流式播放必须）
                const rangeHeader = request.headers.get('range');
                if (rangeHeader) {
                    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
                    if (rangeMatch) {
                        const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
                        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;
                        const chunkSize = end - start + 1;

                        const readStream = fs.createReadStream(filePath, { start, end });
                        const readableStream = new ReadableStream({
                            start(controller) {
                                readStream.on('data', (chunk) => controller.enqueue(chunk));
                                readStream.on('end', () => controller.close());
                                readStream.on('error', (err) => controller.error(err));
                            },
                            cancel() { readStream.destroy(); }
                        });

                        return new Response(readableStream, {
                            status: 206,
                            headers: {
                                'Content-Type': mimeType,
                                'Content-Length': String(chunkSize),
                                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                                'Accept-Ranges': 'bytes',
                                'Access-Control-Allow-Origin': '*'
                            }
                        });
                    }
                }

                // 无 Range 请求：返回整个文件
                const readStream = fs.createReadStream(filePath);
                const readableStream = new ReadableStream({
                    start(controller) {
                        readStream.on('data', (chunk) => controller.enqueue(chunk));
                        readStream.on('end', () => controller.close());
                        readStream.on('error', (err) => controller.error(err));
                    },
                    cancel() { readStream.destroy(); }
                });

                return new Response(readableStream, {
                    status: 200,
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': String(fileSize),
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*'
                    }
                });

            } catch (e) {
                console.error('[Protocol] 处理失败:', e.message, '| URL:', request.url);
                return new Response('Protocol error: ' + e.message, { status: 500 });
            }
        });

        console.log('[Main] Creating main window...');
        createWindow();
        // Fallback: if ready-to-show never fires (rare GPU/driver issues), force show
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                console.warn('[Main] Window still hidden after 3s — forcing show');
                mainWindow.show();
                mainWindow.focus();
            }
        }, 3000);

        // 启动剪贴板监听
        clipboardWatcher.start();

        // 🚀 初始化自动更新
        const { initAutoUpdater } = require('./src/core/AutoUpdater');
        initAutoUpdater(mainWindow);

        // 处理启动时的协议链接 (Windows/Linux)
        const url = process.argv.find(arg => arg.startsWith('mediaflow://'));
        if (url) {
            // 等待窗口加载完成
            mainWindow.webContents.once('did-finish-load', () => {
                handleProtocolUrl(url);
            });
        }

        app.on('activate', () => {
            if (mainWindow === null) {
                createWindow();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    });
}

/**
 * 验证媒体 URL 是否安全
 */
function isValidMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

/**
 * 处理协议链接 (带安全验证)
 */
function handleProtocolUrl(uri) {
    try {
        const urlObj = new URL(uri);

        // 验证协议
        if (urlObj.protocol !== 'mediaflow:') {
            console.warn('[Protocol] Invalid protocol:', urlObj.protocol);
            return;
        }

        const action = urlObj.host; // download or batch
        const searchParams = urlObj.searchParams;

        if (action === 'download') {
            const videoUrl = searchParams.get('url');
            console.log('[Main] Protocol: Received download request for:', videoUrl);
            if (videoUrl && isValidMediaUrl(videoUrl)) {
                console.log('[Main] Protocol: Valid URL, sending to renderer...');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    let silent = false;
                    try {
                        const ext = require('./services/ExtensionServer');
                        silent = ext.getExternalReceiveMode() === 'silent';
                        ext.bringMainWindowToFront({ silent });
                    } catch (_) {
                        if (!silent) {
                            if (mainWindow.isMinimized()) mainWindow.restore();
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    }
                    mainWindow.webContents.send('protocol:action', {
                        type: 'download',
                        url: videoUrl,
                        autoDownload: true,
                        source: 'protocol',
                        silent
                    });
                }
            } else {
                console.warn('[Protocol] Invalid video URL:', videoUrl);
            }
        } else if (action === 'batch') {
            const videoUrls = searchParams.get('urls');
            const dateAfter = searchParams.get('dateAfter');
            if (videoUrls) {
                // Determine format: JSON array (from extension) or comma-separated (legacy/manual)
                let urlList = [];
                try {
                    const parsed = JSON.parse(videoUrls);
                    if (Array.isArray(parsed)) urlList = parsed;
                    else urlList = videoUrls.split(',');
                } catch (e) {
                    urlList = videoUrls.split(',');
                }

                const validUrls = urlList.map(u => u.trim()).filter(isValidMediaUrl);
                if (validUrls.length > 0) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        let silent = false;
                        try {
                            const ext = require('./services/ExtensionServer');
                            silent = ext.getExternalReceiveMode() === 'silent';
                            ext.bringMainWindowToFront({ silent });
                        } catch (_) {
                            if (!silent) {
                                if (mainWindow.isMinimized()) mainWindow.restore();
                                mainWindow.show();
                                mainWindow.focus();
                            }
                        }
                        mainWindow.webContents.send('protocol:action', {
                            type: 'batch',
                            urls: validUrls.join(','),
                            dateAfter,
                            autoDownload: true,
                            source: 'protocol',
                            silent
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to parse protocol URL:', e);
    }
}

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', async () => {
    // 🧹 Smart Cleanup: 退出前自动清理临时文件
    await performCleanup();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    try {
        require('./services/ExtensionServer').stop();
    } catch (e) {
        console.error('[Main] Failed to stop ExtensionServer:', e);
    }
    // 🔪 彻底清理所有残留子进程
    ProcessManager.killAll();
});

// Register all handlers
setupVideoHandlers(ipcMain);
setupCreatorHandlers(ipcMain);
setupDownloadHandlers(ipcMain);
setupTranscribeHandlers(ipcMain);
setupImageHandlers(ipcMain);
setupMobileHandlers(ipcMain, () => mainWindow);
setupSystemHandlers(ipcMain); // Includes Window, Dialog, Shell, Store, App, License, Clipboard logic
setupAudioHandlers(ipcMain);
setupSubtitleHandlers(ipcMain);
setupTTSHandlers(ipcMain);
setupEnhanceHandlers(ipcMain);  // 🆕 AI 画质增强
try {
    engineManager.setupHandlers(ipcMain); // 🆕 核心引擎组件管理
} catch (e) {
    console.error('[Main] Failed to setup EngineManager handlers:', e);
}

// 🎬 PiP 画中画窗口
let pipWindow = null;

ipcMain.handle('pip:open', async (event, payload) => {
    try {
        const { videoSrc, currentTime } = payload || {};
        if (!videoSrc) return { success: false, error: 'Missing videoSrc' };
    if (pipWindow && !pipWindow.isDestroyed()) {
        pipWindow.close();
    }

    pipWindow = new BrowserWindow({
        width: 400,
        height: 225, // 16:9 比例
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        minimizable: false,
        maximizable: false,
        transparent: false,
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 编码视频源路径
    const encodedSrc = encodeURIComponent(videoSrc);
    pipWindow.loadFile('src/pages/pip.html', {
        query: { src: encodedSrc, time: String(currentTime) }
    });

    pipWindow.on('closed', () => {
        pipWindow = null;
        // 通知主窗口 PiP 已关闭
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pip:closed');
        }
    });

    return { success: true };
    } catch (e) {
        console.error('[PiP] pip:open failed:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pip:close', async () => {
    if (pipWindow && !pipWindow.isDestroyed()) {
        pipWindow.close();
        pipWindow = null;
    }
    return { success: true };
});
