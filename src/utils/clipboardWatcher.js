const { clipboard, Notification } = require('electron');
const Store = require('electron-store');
const path = require('path');
const {
    extractCapturableMediaUrls,
    detectPlatformLabel,
    normalizeMode,
    DEFAULT_MODE
} = require('./mediaUrlDetector');

const store = new Store();

class ClipboardWatcher {
    constructor() {
        this.lastContent = '';
        // Privacy default: off until the user opts in (onboarding or Settings).
        this.isEnabled = store.get('clipboardWatchEnabled', false);
        this.detectMode = normalizeMode(store.get('clipboardDetectMode', DEFAULT_MODE));
        this.interval = null;
        this.recentUrls = new Set(); // 防止重复提醒
        this.mainWindow = null;
    }

    setMainWindow(window) {
        this.mainWindow = window;
    }

    /**
     * @param {string} text
     * @returns {boolean}
     */
    isVideoUrl(text) {
        const { isCapturableMediaUrl } = require('./mediaUrlDetector');
        return isCapturableMediaUrl(text, this.detectMode);
    }

    start() {
        if (this.interval) return;
        this.lastContent = clipboard.readText();

        this.interval = setInterval(() => {
            if (!this.isEnabled) return;

            // Pick up mode changes from Settings without restart
            this.detectMode = normalizeMode(store.get('clipboardDetectMode', DEFAULT_MODE));

            const content = clipboard.readText();
            if (!content || content === this.lastContent) return;
            this.lastContent = content;

            const videoUrls = extractCapturableMediaUrls(content, this.detectMode);
            if (videoUrls.length === 0) return;

            if (videoUrls.length > 1) {
                const batchKey = videoUrls.join(',');
                if (this.recentUrls.has(batchKey)) return;
                this.recentUrls.add(batchKey);
                setTimeout(() => this.recentUrls.delete(batchKey), 5 * 60 * 1000);
                this.showBatchNotification(videoUrls);
            } else {
                const url = videoUrls[0];
                if (this.recentUrls.has(url)) return;
                this.recentUrls.add(url);
                setTimeout(() => this.recentUrls.delete(url), 5 * 60 * 1000);
                this.showNotification(url);
            }
        }, 1500);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        store.set('clipboardWatchEnabled', enabled);
    }

    setDetectMode(mode) {
        this.detectMode = normalizeMode(mode);
        store.set('clipboardDetectMode', this.detectMode);
        return this.detectMode;
    }

    getDetectMode() {
        this.detectMode = normalizeMode(store.get('clipboardDetectMode', DEFAULT_MODE));
        return this.detectMode;
    }

    showNotification(url) {
        if (!Notification.isSupported()) return;

        const platform = detectPlatformLabel(url);
        const short = url.length > 56 ? `${url.substring(0, 56)}…` : url;
        const iconPath = path.join(__dirname, '../../assets/icons/mediaflow-studio-icon.png');
        const notification = new Notification({
            title: '📹 检测到可采集链接',
            body: `${platform}: ${short}`,
            icon: iconPath,
            silent: false
        });

        notification.on('click', () => this.activateApp({ type: 'download', url }));
        notification.show();
    }

    showBatchNotification(urls) {
        if (!Notification.isSupported()) return;

        const iconPath = path.join(__dirname, '../../assets/icons/mediaflow-studio-icon.png');
        const notification = new Notification({
            title: '📦 检测到批量链接',
            body: `共 ${urls.length} 个链接，点击打开批量下载`,
            icon: iconPath,
            silent: false
        });

        notification.on('click', () => this.activateApp({ type: 'batch', urls }));
        notification.show();
    }

    activateApp(data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isMinimized()) this.mainWindow.restore();
            this.mainWindow.show();
            this.mainWindow.focus();
            this.mainWindow.webContents.send('clipboard:videoUrl', data);
        }
    }
}

const clipboardWatcher = new ClipboardWatcher();
module.exports = clipboardWatcher;
