/**
 * ProtocolHandler.js
 * 兼容主进程 (Main Process) 和渲染进程 (Renderer Process)
 */

if (typeof window !== 'undefined') {
    /**
     * --- 渲染进程实现 ---
     * 处理外部协议 (mediaflow://) 触发的动作。
     * 同时处理剪贴板视频链接事件 (clipboard:videoUrl)。
     */
    class ProtocolHandler {
        constructor(app) {
            this.app = app;
        }

        init() {
            // --- 监听 mediaflow:// 协议事件 ---
            if (window.mediaflow?.video?.onProtocolAction) {
                const cleanup = window.mediaflow.video.onProtocolAction((data) => {
                    console.log('[Protocol] Action received:', data);
                    this._handleAction(data);
                });

                if (cleanup && this.app.pushCleanup) {
                    this.app.pushCleanup(cleanup);
                }
            }

            // --- 监听剪贴板视频链接事件 (ClipboardWatcher 自动检测) ---
            if (window.mediaflow?.video?.onClipboardUrl) {
                const cleanupClipboard = window.mediaflow.video.onClipboardUrl((data) => {
                    console.log('[Protocol] Clipboard event received:', data);
                    this._handleAction(data);
                });

                if (cleanupClipboard && this.app.pushCleanup) {
                    this.app.pushCleanup(cleanupClipboard);
                }
            }
        }

        /**
         * 处理下载/批量动作：导航到下载页面并填入 URL
         */
        _handleAction(data) {
            if (data.type === 'download' && data.url) {
                console.log('[Protocol] Handling download from extension:', data.url, data.silent ? 'silent' : 'focus');
                const silent = !!data.silent;
                try {
                    const msg = silent
                        ? (window.i18n?.t('download.receivedSilent') || 'Background download started')
                        : (window.i18n?.t('download.receivedFromExtension') || 'Received from extension');
                    this.app.showToast?.(msg, 'info');
                } catch (_) {}

                // 导航到下载页面（静默时也不跳页抢焦点，只在当前已是下载页时更新）
                try {
                    if (!silent) {
                        this.app.router.switchMode('single');
                        this.app.router.navigateTo('download', { url: data.url });
                    } else {
                        // Still switch route quietly so checkVideo UI elements exist
                        this.app.router.switchMode?.('single');
                        this.app.router.navigateTo?.('download', { url: data.url });
                    }
                } catch (e) {
                    console.warn('[Protocol] navigate failed:', e);
                }

                // Extension / deep-link: detect then auto-download (or queue if busy)
                const autoStart = data.autoDownload !== false;
                const source = data.source || 'extension';

                const tryPaste = (delay) => {
                    setTimeout(() => {
                        const urlInput = document.getElementById('video-url') || document.getElementById('url-input');
                        if (urlInput) {
                            urlInput.value = data.url;
                            urlInput.dispatchEvent(new Event('input'));
                            urlInput.dispatchEvent(new Event('change'));

                            if (this.app.downloadManager) {
                                this.app.downloadManager.checkVideo?.({
                                    autoStart,
                                    source
                                });
                            }
                            console.log(`[Protocol] Auto-pasted successfully after ${delay}ms autoStart=${autoStart}`);
                        } else if (delay < 2500) {
                            tryPaste(delay < 500 ? 600 : delay + 700);
                        } else {
                            console.warn('[Protocol] url input not found after retries');
                        }
                    }, delay);
                };
                tryPaste(200);

            } else if (data.type === 'batch' && data.urls) {
                this.app.router.switchMode('batch');
                let urls = data.urls;

                if (Array.isArray(urls)) {
                    urls = urls.join('\n');
                } else if (typeof urls === 'string') {
                    try {
                        if (urls.startsWith('[') && urls.includes('http')) {
                            const parsed = JSON.parse(urls);
                            if (Array.isArray(parsed)) urls = parsed.join('\n');
                        } else if (urls.includes(',')) {
                            urls = urls.split(',').join('\n');
                        }
                    } catch {
                        urls = urls.replace(/,/g, '\n');
                    }
                }

                // Batch from extension already auto-starts via handleStartClick
                setTimeout(() => {
                    if (window.batchManager && window.batchManager.inputManager) {
                        window.batchManager.inputManager.clear?.();
                        window.batchManager.inputManager.processInput?.(urls);
                        window.batchManager.handleStartClick?.();
                    }
                }, 500);
            }
        }
    }

    window.ProtocolHandler = ProtocolHandler;

} else if (typeof module !== 'undefined' && module.exports) {
    /**
     * --- 主进程实现 ---
     * 处理自定义协议注册与 URL 解析。
     */
    const { app } = require('electron');

    function initProtocolHandler(mainWindow) {
        if (!mainWindow) return;

        // macOS/Linux：通过 open-url 事件接收
        app.on('open-url', (event, url) => {
            event.preventDefault();
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
                handleProtocolUrl(mainWindow, url);
            }
        });

        // Windows：从命令行参数中解析
        app.on('second-instance', (_event, argv) => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }

            const url = argv.find(arg => arg.startsWith('mediaflow://'));
            if (url) handleProtocolUrl(mainWindow, url);
        });
    }

    function handleProtocolUrl(win, url) {
        try {
            const parsed = new URL(url);
            const action = parsed.hostname;
            const params = Object.fromEntries(parsed.searchParams.entries());

            console.log('[ProtocolHandler] action:', action, 'params:', params);

            switch (action) {
            case 'download':
                if (params.url) {
                    // URLSearchParams already decodes once — do not double-decode
                    win.webContents.send('protocol:action', { type: 'download', url: params.url });
                }
                break;
            case 'batch':
                win.webContents.send('protocol:action', { type: 'batch', urls: params.urls, dateAfter: params.dateAfter });
                break;
            case 'enhance':
                win.webContents.send('protocol:enhance', params);
                break;
            case 'open-settings':
                win.webContents.send('protocol:navigate', { page: 'settings' });
                break;
            default:
                console.warn('[ProtocolHandler] Unknown action:', action);
            }
        } catch (e) {
            console.error('[ProtocolHandler] Failed to parse URL:', url, e);
        }
    }

    module.exports = { initProtocolHandler };
}
