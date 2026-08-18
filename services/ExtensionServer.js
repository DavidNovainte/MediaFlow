const http = require('http');
const Store = require('electron-store');

const store = new Store();

class ExtensionServer {
    constructor() {
        this.port = 16412; // Dedicated port for Browser Extension
        this.server = null;
        this.mainWindow = null;
    }

    /**
     * @returns {'focus'|'silent'}
     */
    getExternalReceiveMode() {
        const mode = store.get('externalReceiveMode', 'focus');
        return mode === 'silent' ? 'silent' : 'focus';
    }

    /**
     * Wire Electron BrowserWindow so /api/open-* can deliver downloads without mediaflow://
     */
    setMainWindow(win) {
        this.mainWindow = win || null;
    }

    start() {
        if (this.server) return; // Already running

        const server = http.createServer(async (req, res) => {
            // CORS headers for browser extension (background / popup)
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                return res.end();
            }

            const urlPath = (req.url || '').split('?')[0];

            if (req.method === 'GET' && urlPath === '/api/status') {
                try {
                    // 完全免费开源：始终解锁，无 Pro 校验
                    const responseData = JSON.stringify({
                        success: true,
                        isPro: true,
                        isAnnual: false,
                        isLifetime: true,
                        planType: 'free',
                        licenseType: 'free',
                        version: '1.0',
                        hasWindow: !!(this.mainWindow && !this.mainWindow.isDestroyed())
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(responseData);
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, error: e.message }));
                }
            }

            // Open single download in desktop app (preferred over mediaflow://)
            if (req.method === 'POST' && urlPath === '/api/open-download') {
                return this._handleJsonPost(req, res, (body) => {
                    const videoUrl = body && (body.url || body.videoUrl);
                    if (!videoUrl || typeof videoUrl !== 'string' || !/^https?:\/\//i.test(videoUrl)) {
                        return { status: 400, data: { success: false, error: 'Invalid url' } };
                    }
                    const ok = this._sendToRenderer({
                        type: 'download',
                        url: videoUrl.trim(),
                        autoDownload: true,
                        source: 'extension'
                    });
                    return {
                        status: ok ? 200 : 503,
                        data: {
                            success: ok,
                            error: ok ? undefined : 'Desktop window not ready'
                        }
                    };
                });
            }

            // Open batch download
            if (req.method === 'POST' && urlPath === '/api/open-batch') {
                return this._handleJsonPost(req, res, (body) => {
                    let urls = body && body.urls;
                    if (typeof urls === 'string') {
                        try {
                            urls = JSON.parse(urls);
                        } catch {
                            urls = urls.split(/[\n\r,]+/).map((s) => s.trim()).filter(Boolean);
                        }
                    }
                    if (!Array.isArray(urls) || urls.length === 0) {
                        return { status: 400, data: { success: false, error: 'Invalid urls' } };
                    }
                    const clean = urls
                        .map((u) => String(u || '').trim())
                        .filter((u) => /^https?:\/\//i.test(u));
                    if (!clean.length) {
                        return { status: 400, data: { success: false, error: 'No valid urls' } };
                    }
                    const payload = {
                        type: 'batch',
                        urls: clean,
                        dateAfter: body.dateAfter || undefined,
                        autoDownload: true,
                        source: 'extension'
                    };
                    const ok = this._sendToRenderer(payload);
                    return {
                        status: ok ? 200 : 503,
                        data: {
                            success: ok,
                            count: clean.length,
                            error: ok ? undefined : 'Desktop window not ready'
                        }
                    };
                });
            }

            res.writeHead(404);
            res.end();
        });

        this.server = server;

        server.on('error', (err) => {
            console.error('[ExtensionServer] Failed to start:', err.message);
            if (this.server === server) {
                this.server = null;
            }
        });

        // ONLY bind to localhost (127.0.0.1) so it doesn't trigger Windows Firewall
        // and doesn't expose the endpoint to the LAN.
        server.listen(this.port, '127.0.0.1', () => {
            console.log(`[ExtensionServer] Running on http://127.0.0.1:${this.port}`);
        });
    }

    _readBody(req, limit = 2 * 1024 * 1024) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;
            req.on('data', (c) => {
                size += c.length;
                if (size > limit) {
                    reject(new Error('Body too large'));
                    try { req.destroy(); } catch (_) {}
                    return;
                }
                chunks.push(c);
            });
            req.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                if (!raw) {
                    resolve({});
                    return;
                }
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error('Invalid JSON body'));
                }
            });
            req.on('error', reject);
        });
    }

    async _handleJsonPost(req, res, handler) {
        try {
            const body = await this._readBody(req);
            const result = await handler(body);
            res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.data || {}));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message || 'Bad request' }));
        }
    }

    /**
     * Force the desktop window to the foreground (Windows often ignores plain focus()).
     * Same pattern as second-instance / tray restore.
     * @param {{ force?: boolean, silent?: boolean }} [opts]
     */
    bringMainWindowToFront(opts = {}) {
        const win = this.mainWindow;
        if (!win || win.isDestroyed()) return false;

        const silent =
            opts.silent === true ||
            (opts.force !== true && this.getExternalReceiveMode() === 'silent');

        try {
            if (silent) {
                // Keep working in background: only nudge taskbar, do not steal focus
                try {
                    win.flashFrame(true);
                    setTimeout(() => {
                        try {
                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                this.mainWindow.flashFrame(false);
                            }
                        } catch (__) {}
                    }, 1500);
                } catch (_) {}
                console.log('[ExtensionServer] Silent receive — skip window focus');
                return true;
            }

            if (win.isMinimized()) win.restore();
            if (typeof win.isVisible === 'function' && !win.isVisible()) win.show();
            else win.show();

            // Windows focus-stealing defense: alwaysOnTop flip is the reliable trick
            try {
                win.setSkipTaskbar(false);
            } catch (_) {}
            try {
                win.setAlwaysOnTop(true, 'screen-saver');
            } catch (_) {
                try { win.setAlwaysOnTop(true); } catch (__) {}
            }
            try {
                if (typeof win.moveTop === 'function') win.moveTop();
            } catch (_) {}
            win.focus();
            try {
                if (win.webContents && !win.webContents.isDestroyed()) {
                    win.webContents.focus();
                }
            } catch (_) {}
            try {
                win.flashFrame(true);
                setTimeout(() => {
                    try {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.flashFrame(false);
                        }
                    } catch (__) {}
                }, 1200);
            } catch (_) {}

            setTimeout(() => {
                try {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.setAlwaysOnTop(false);
                        this.mainWindow.focus();
                    }
                } catch (__) {}
            }, 80);
            return true;
        } catch (e) {
            console.warn('[ExtensionServer] bringMainWindowToFront failed:', e);
            return false;
        }
    }

    _sendToRenderer(payload) {
        try {
            const win = this.mainWindow;
            if (!win || win.isDestroyed()) {
                console.warn('[ExtensionServer] No main window for payload', payload?.type);
                return false;
            }
            const silent = this.getExternalReceiveMode() === 'silent';
            this.bringMainWindowToFront({ silent });
            win.webContents.send('protocol:action', {
                ...payload,
                silent,
                autoDownload: payload.autoDownload !== false
            });
            console.log(
                '[ExtensionServer] Sent protocol:action',
                payload.type,
                silent ? '(silent)' : '(focus)',
                payload.url || (payload.urls && payload.urls.length)
            );
            return true;
        } catch (e) {
            console.error('[ExtensionServer] send failed:', e);
            return false;
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

module.exports = new ExtensionServer();
