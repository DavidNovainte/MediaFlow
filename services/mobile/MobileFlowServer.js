/**
 * MediaFlow - MobileFlowServer Core
 * 局域网服务器 - 核心协调器 (通过模块化重构)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { app } = require('electron');

// 导入子模块
const authManager = require('./AuthManager');
const fileBrowseManager = require('./FileBrowseManager');
const mediaStreamManager = require('./MediaStreamManager');
const { getProxyUrl } = require('../../src/handlers/download/proxyUtils');

const remoteViewManager = require('./RemoteViewManager');
const clipboardManager = require('./ClipboardManager');

class MobileFlowServer {
    constructor() {
        this.app = null;
        this.server = null;
        this.port = 8765;
        this.isRunning = false;
        this.pendingUrls = [];
        this.onUrlReceived = null;
        this.onCookiesReceived = null;
    }

    /**
     * 设置 PIN 码 (通过认证管理器)
     */
    setPin(pin) {
        authManager.setPin(pin);
    }

    /**
     * 设置接收回调
     */
    setUrlReceivedCallback(callback) {
        this.onUrlReceived = callback;
    }

    /**
     * 注入 Electron Store (用于获取 Pro 状态)
     */
    setStore(store) {
        this.store = store;
    }

    /**
     * 启动服务器
     */
    async start(port = 8765) {
        this.port = port;
        if (this.isRunning) return { success: true, ...this.getNetworkInfo() };

        this.app = express();
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(cookieParser());
        this.app.use('/static', express.static(path.join(__dirname, '../../src/mobile')));

        // Enhanced CORS with LAN detection and OPTIONS handling
        this.app.use((req, res, next) => {
            const origin = req.headers.origin;
            const clientIp = req.socket.remoteAddress || '';
            const isLan = this.isPrivateLanIp(clientIp);

            if (isLan || !origin) {
                res.header("Access-Control-Allow-Origin", origin || "*");
                res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.header("Access-Control-Allow-Headers", "Content-Type, X-MF-Token, Authorization");
                res.header("Access-Control-Allow-Credentials", "true");

                if (req.method === 'OPTIONS') {
                    return res.sendStatus(200);
                }
                next();
            } else {
                console.warn('[Security] CORS blocked for external origin:', origin, 'from IP:', clientIp);
                res.status(403).json({ success: false, error: 'Access denied (CORS)' });
            }
        });

        // 1. 挂载公开路由 (无需认证: 遥控页、预览页、登录 API)
        remoteViewManager.mountRoutes(this.app, fileBrowseManager);
        authManager.mountRoutes(this.app);

        // 2. 挂载受保护路由中间件
        this.app.use('/api', (req, res, next) => {
            if (req.path.startsWith('/auth/')) return next();
            return authManager.getMiddleware()(req, res, next);
        });

        // 3. 挂载功能子模块路由
        fileBrowseManager.mountRoutes(this.app);

        mediaStreamManager.mountRoutes(this.app, fileBrowseManager);
        clipboardManager.mountRoutes(this.app);

        // 4. 定义核心 API (URL 推送、文件投屏、播放控制)
        this.mountCoreRoutes();

        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    const info = this.getNetworkInfo();
                    console.log(`[MobileFlow] Server started on port ${this.port}`);
                    console.log(`[MobileFlow] Primary IP: ${info.ip}`);
                    resolve({ success: true, ...info });
                });
                this.server.on('error', (err) => {
                    this.isRunning = false;
                    this.server = null;
                    if (err && err.code === 'EADDRINUSE') {
                        resolve({
                            success: false,
                            error: `Port ${this.port} is already in use. Close the other app or change the port.`
                        });
                        return;
                    }
                    reject(err);
                });
            } catch (error) { reject(error); }
        });
    }

    /**
     * True private LAN check (avoid naive includes('10.') matching 110.x / 210.x).
     */
    isPrivateLanIp(rawIp) {
        if (!rawIp) return false;
        let ip = String(rawIp).trim();
        if (ip === '::1' || ip === '127.0.0.1') return true;
        if (ip.startsWith('::ffff:')) ip = ip.slice(7);
        // IPv6 unique local / link-local — treat as local-ish for LAN apps
        if (ip.includes(':')) {
            const lower = ip.toLowerCase();
            if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
            return false;
        }
        const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return false;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        return false;
    }

    /**
     * 停止服务器
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('[MobileFlow] Server stopped');
                    resolve({ success: true });
                });
            } else resolve({ success: true });
        });
    }

    /**
     * 挂载核心 API 路由
     */
    mountCoreRoutes() {
        const upload = this.initMulter();

        // 完全免费开源：无 Pro 状态检查，始终可用
        this.app.get('/api/status', async (req, res) => {
            const helperStatus = await this.getHelperStatus();
            res.json({ success: true, isPro: true, planType: 'free', licenseType: 'free', ...helperStatus, version: '1.0' });
        });

        this.app.get('/api/resolve-download', async (req, res) => {
            const { url } = req.query;
            if (!url || typeof url !== 'string' || url.trim().startsWith('-')) {
                return res.status(400).json({ success: false, error: 'Invalid URL' });
            }

            try {
                const resolved = await this.resolveDownloadUrl(url);
                res.json({ success: true, ...resolved });
            } catch (error) {
                res.status(422).json({ success: false, error: error.message || 'Resolve failed' });
            }
        });

        // 接收链接 (下载或投屏)
        this.app.post('/api/push-url', (req, res) => {
            const { url, action } = req.body;
            if (!url) return res.status(400).json({ success: false, error: '无效请求' });

            if (action === 'play') {
                this.handleCastUrl(url, req.body, res);
            } else {
                this.pendingUrls.push(req.body);
                if (this.onUrlReceived) this.onUrlReceived(req.body);
                res.json({ success: true, message: '链接已发送到电脑' });
            }
        });

        // 投屏播放 PC 本地文件
        this.app.get('/api/files/cast', (req, res) => {
            const { id } = req.query;
            const filePath = fileBrowseManager.getFilePathById(id);
            if (filePath && fs.existsSync(filePath)) {
                this.castLocalFile(id, filePath);
                res.json({ success: true });
            } else res.status(404).json({ success: false, error: '未找到文件' });
        });

        // 接收文件上传 + 自动投屏
        this.app.post('/api/upload-file', upload.array('files'), (req, res) => {
            if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: '未接收到文件' });

            const file = req.files[req.files.length - 1]; // 投屏最后一个
            const fileId = fileBrowseManager.registerFile(file.path);

            if (this.onUrlReceived) {
                const ext = path.extname(file.path).toLowerCase();
                const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
                const isDoc = ['.pdf'].includes(ext);
                const hostIp = this.detectBestIp();

                // 决定流地址和类型
                let type = 'play';
                let streamPath = '/stream-compatible/';
                if (isImage) {
                    type = 'image';
                    streamPath = '/stream/';
                } else if (isDoc) {
                    type = 'file';
                    streamPath = '/stream/';
                }

                const streamUrl = `http://${hostIp}:${this.port}${streamPath}${fileId}`;
                this.onUrlReceived({ type, url: streamUrl, title: file.originalname });
            }
            res.json({ success: true, count: req.files.length });
        });

        // 播放器远程指令
        this.app.post('/api/player/command', (req, res) => {
            if (this.onUrlReceived) {
                this.onUrlReceived({ type: 'player_command', ...req.body });
                res.json({ success: true });
            } else res.status(500).json({ success: false });
        });

        // 同步 Cookie
        this.app.post('/api/sync-cookies', (req, res) => {
            if (this.onCookiesReceived) this.onCookiesReceived(req.body.cookies);
            res.json({ success: true });
        });

        // 健康检查
        this.app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.4.0' }));
    }

    /**
     * 处理外部 URL 投屏 (解析或直接播放)
     */
    async handleCastUrl(url, options, res) {
        const isMedia = /\.(jpg|jpeg|png|gif|webp|mp4|mkv|webm|m3u8)$/i.test(url.split('?')[0]);
        if (isMedia) {
            if (this.onUrlReceived) this.onUrlReceived({ type: 'play', url, resolved: false });
            return res.json({ success: true, message: '正在播放' });
        }

        // 安全校验：基本 URL 格式检查，防御参数注入
        if (!url || typeof url !== 'string' || url.trim().startsWith('-')) {
            if (this.onUrlReceived) this.onUrlReceived({ type: 'error', message: '非法 URL 地址' });
            return res.status(400).json({ success: false, error: 'Invalid URL' });
        }

        // 解析 URL (yt-dlp)
        res.json({ success: true, message: '正在解析内容...' });
        const { execFile } = require('child_process');
        const { getYtDlpPath } = require('../../src/utils/binaries');
        const ytDlp = getYtDlpPath();

        // 使用双破折号防止参数注入
        execFile(ytDlp, ['--dump-json', '-f', 'best', '--no-playlist', '--', url], (err, stdout) => {
            try {
                const info = JSON.parse(stdout);
                if (this.onUrlReceived) this.onUrlReceived({ type: 'play', url: info.url, title: info.title, resolved: true });
            } catch (e) {
                if (this.onUrlReceived) this.onUrlReceived({ type: 'error', message: '解析失败' });
            }
        });
    }

    async resolveDownloadUrl(url) {
        return new Promise((resolve, reject) => {
            const { execFile } = require('child_process');
            const { getYtDlpPath } = require('../../src/utils/binaries');
            const ytDlp = getYtDlpPath();
            const { targetUrl, args } = this.buildResolveDownloadArgs(url);

            execFile(ytDlp, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' } }, (err, stdout, stderr) => {
                if (err) {
                    return reject(this.createResolveError(this.mapResolveFailure(stderr, err), 'resolve_failed'));
                }

                try {
                    const info = this.extractResolveJson(stdout);
                    if (!info) {
                        return reject(this.createResolveError('Desktop helper could not parse the yt-dlp response.', 'resolve_parse_failed'));
                    }

                    if (!info.url) {
                        return reject(this.createResolveError('Desktop helper returned no direct media URL.', 'resolve_missing_url'));
                    }

                    resolve({
                        title: info.title || 'Resolved media',
                        resolvedUrl: info.url
                    });
                } catch (error) {
                    reject(this.createResolveError('Desktop helper failed to interpret the resolved media response.', 'resolve_parse_failed'));
                }
            });
        });
    }

    buildResolveDownloadArgs(url) {
        const targetUrl = this.normalizeResolveUrl(url);
        const isMobilePlatform = targetUrl.includes('tiktok.com');
        const userAgent = isMobilePlatform
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        const args = [
            '--dump-json',
            '-f', 'best',
            '--no-warnings',
            '--no-playlist',
            '--user-agent', userAgent,
        ];

        const lowerUrl = targetUrl.toLowerCase();
        if (lowerUrl.includes('bilibili.com')) {
            args.push('--add-header', 'Referer:https://www.bilibili.com/');
            args.push('--add-header', 'Origin:https://www.bilibili.com');
        } else if (lowerUrl.includes('tiktok.com')) {
            args.push('--add-header', 'Referer:https://www.tiktok.com/');
        } else if (lowerUrl.includes('instagram.com')) {
            args.push('--add-header', 'Referer:https://www.instagram.com/');
        } else if (lowerUrl.includes('douyin.com')) {
            args.push('--add-header', 'Referer:https://www.douyin.com/');
        }

        const proxy = getProxyUrl();
        if (proxy) {
            args.push('--proxy', proxy);
        }

        const cookiePath = this.getCookiesFilePath();
        if (cookiePath) {
            args.push('--cookies', cookiePath);
        }

        args.push('--', targetUrl);
        return { targetUrl, args };
    }

    normalizeResolveUrl(url) {
        if (!url || typeof url !== 'string') return url;
        const trimmedUrl = url.trim();

        if (trimmedUrl.includes('douyin')) {
            const idMatch = trimmedUrl.match(/(\d{15,22})/);
            if (idMatch) {
                return `https://www.douyin.com/video/${idMatch[1]}`;
            }

            if (trimmedUrl.includes('iesdouyin.com')) {
                return trimmedUrl.replace('iesdouyin.com', 'douyin.com');
            }
        }

        return trimmedUrl;
    }

    extractResolveJson(output) {
        if (!output || typeof output !== 'string') {
            return null;
        }

        const lines = output
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('{'));

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.url || parsed.title || parsed.id) {
                    return parsed;
                }
            } catch {
                // Keep trying remaining lines.
            }
        }

        const firstBrace = output.indexOf('{');
        if (firstBrace === -1) {
            return null;
        }

        for (let index = output.length - 1; index > firstBrace; index -= 1) {
            if (output[index] !== '}') {
                continue;
            }

            try {
                return JSON.parse(output.substring(firstBrace, index + 1));
            } catch {
                // Keep searching for a valid object boundary.
            }
        }

        return null;
    }

    getCookiesFilePath() {
        try {
            const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
            return fs.existsSync(cookiePath) ? cookiePath : null;
        } catch (error) {
            void error;
            return null;
        }
    }

    mapResolveFailure(stderr, error) {
        const detail = (stderr || error?.message || 'Resolve failed').trim();
        const lowerDetail = detail.toLowerCase();

        if (lowerDetail.includes('sign in to confirm') ||
            lowerDetail.includes('login required') ||
            lowerDetail.includes('cookies')) {
            return 'This page needs browser cookies. Sync cookies to the desktop helper and try again.';
        }

        if (lowerDetail.includes('unsupported url') || lowerDetail.includes('unsupported site')) {
            return 'Desktop helper could not parse this page link.';
        }

        if (lowerDetail.includes('unable to extract') ||
            lowerDetail.includes('no video formats') ||
            lowerDetail.includes('no suitable formats')) {
            return 'Desktop helper found the page, but no playable media stream was exposed.';
        }

        if (lowerDetail.includes('timed out') ||
            lowerDetail.includes('network') ||
            lowerDetail.includes('connection')) {
            return 'Desktop helper could not reach the source site.';
        }

        if (lowerDetail.includes('requested format is not available')) {
            return 'Desktop helper could not find a compatible media stream for this page.';
        }

        return detail || 'Desktop helper failed to resolve this link.';
    }

    createResolveError(message, code) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    async getHelperStatus() {
        const { execFile } = require('child_process');
        const { getYtDlpPath } = require('../../src/utils/binaries');
        const ytDlpPath = getYtDlpPath();

        if (!ytDlpPath || !fs.existsSync(ytDlpPath)) {
            return {
                helperConfigured: true,
                ytDlpAvailable: false,
                resolveReady: false,
                resolveMessage: 'yt-dlp is missing on the desktop helper.'
            };
        }

        return new Promise((resolve) => {
            execFile(ytDlpPath, ['--version'], (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        helperConfigured: true,
                        ytDlpAvailable: false,
                        resolveReady: false,
                        resolveMessage: (stderr || error.message || 'yt-dlp check failed').trim(),
                    });
                    return;
                }

                resolve({
                    helperConfigured: true,
                    ytDlpAvailable: true,
                    ytDlpVersion: stdout.trim(),
                    resolveReady: true,
                    resolveMessage: 'Desktop helper can resolve platform page links.'
                });
            });
        });
    }

    /**
     * 投屏本地文件
     */
    castLocalFile(id, filePath) {
        if (!this.onUrlReceived) return;
        const ext = path.extname(filePath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
        const isDoc = ['.pdf'].includes(ext);
        const hostIp = this.detectBestIp();

        let type = 'play';
        let streamPath = '/stream-compatible/';
        if (isImage) {
            type = 'image';
            streamPath = '/stream/';
        } else if (isDoc) {
            type = 'file';
            streamPath = '/stream/';
        }

        const streamUrl = `http://${hostIp}:${this.port}${streamPath}${id}`;
        this.onUrlReceived({ type, url: streamUrl, title: path.basename(filePath) });
    }

    /**
     * 初始化 Multer
     */
    initMulter() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                const dir = path.join(os.homedir(), 'Downloads', 'MediaFlow', 'Mobile Files');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (req, file, cb) => {
                const ext = path.extname(file.originalname);
                cb(null, `${path.basename(file.originalname, ext)}-${Date.now()}${ext}`);
            }
        });
        return multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
    }

    /**
     * IP 地址检测逻辑
     */
    getNetworkInfo() {
        const preferredIp = this.detectBestIp();
        const interfaces = os.networkInterfaces();
        const allIps = [];
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) allIps.push({ name, address: iface.address });
            }
        }
        return { port: this.port, ip: preferredIp, allIps, url: `http://${preferredIp}:${this.port}` };
    }

    detectBestIp() {
        const interfaces = os.networkInterfaces();
        let candidates = [];
        const vmBlacklist = ['vmware', 'vmnet', 'virtualbox', 'vbox', 'docker', 'hyper-v', 'vethernet', 'wsl', 'tailscale', 'zerotier', 'vpn'];

        for (const name of Object.keys(interfaces)) {
            if (vmBlacklist.some(p => name.toLowerCase().includes(p))) continue;
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    let score = 0;
                    const lowName = name.toLowerCase();
                    if (lowName.includes('wi-fi') || lowName.includes('wifi') || lowName.includes('wlan') || lowName.includes('无线')) score += 50;
                    if (lowName.includes('ethernet') || lowName.includes('以太网')) score += 40;
                    if (iface.address.startsWith('192.168.')) score += 20;
                    candidates.push({ address: iface.address, score });
                }
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
    }

    // 二维码生成代理
    async getRemoteQRCode(ip) { return remoteViewManager.getRemoteQRCode(this.port, ip || this.detectBestIp()); }
    async getFileQRCode(filePath) { return remoteViewManager.getFileQRCode(this.port, this.detectBestIp(), filePath, fileBrowseManager); }

    /**
     * 获取待处理的 URL 列表
     */
    getPendingUrls() {
        const urls = [...this.pendingUrls];
        this.pendingUrls = [];
        return urls;
    }
}

module.exports = new MobileFlowServer();
