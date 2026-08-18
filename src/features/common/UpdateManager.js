/**
 * UpdateManager.js (Renderer)
 * 处理应用更新通知、UI 反馈及用户交互 logic。
 */
class UpdateManager {
    constructor(app) {
        this.app = app;
        this.isReady = false;
        this.updateInfo = null;
    }

    /**
     * 初始化监听器
     */
    init() {
        if (!window.mediaflow?.updater) {
            console.error('[UpdateManager] mediaflow.updater not found in window');
            return;
        }

        // 1. 发现新版本
        window.mediaflow.updater.onAvailable((info) => {
            console.log('[Update] New version available:', info.version);
            this.updateInfo = info;
            const msg =
                window.i18n?.t?.('update.available', { version: info.version }) ||
                `New version v${info.version} found. Preparing in the background...`;
            this.app.showToast(msg, 'info', { duration: 8000 });
            this._showUpdateBadge(false);
        });

        // 2. 下载完成，准备安装
        window.mediaflow.updater.onDownloaded((info) => {
            console.log('[Update] Version ready to install:', info.version);
            this.isReady = true;
            this.updateInfo = info;

            const msg =
                window.i18n?.t?.('update.downloaded', { version: info.version }) ||
                `New version v${info.version} is ready to install!`;
            this.app.showToast(msg, 'success', {
                sticky: true,
                action: {
                    text:
                        window.i18n?.t?.('update.restartAndInstall') ||
                        'Restart and update',
                    callback: () => this.installUpdate()
                }
            });
            this._showUpdateBadge(true);
        });

        // 3. 更新出错
        window.mediaflow.updater.onError((err) => {
            console.warn('[Update] Update error:', err);
            // 静默失败，不打扰用户，除非是手动检查
        });

        console.log('[UpdateManager] Initialized and listening for update events');
    }

    /**
     * 手动检查更新
     */
    async checkForUpdates() {
        try {
            this.app.showToast(window.i18n?.t('update.checking') || 'Checking for updates...', 'info');
            const result = await window.mediaflow.updater.check();
            if (!result || !result.updateInfo) {
                this.app.showToast(window.i18n?.t('update.latest') || 'Already up to date', 'success');
            }
        } catch {
            this.app.showToast(window.i18n?.t('update.failed') || 'Update check failed, try again later', 'error');
        }
    }

    /**
     * 执行安装并重启
     */
    installUpdate() {
        if (this.isReady) {
            window.mediaflow.updater.quitAndInstall();
        }
    }

    /**
     * 在 UI 上显示更新红点
     * @param {boolean} ready - 是否已下载完成 (就绪状态显示绿色，下载中显示橙色/红色)
     */
    _showUpdateBadge(ready = false) {
        // 找到设置或升级按钮
        const navItems = [
            document.querySelector('.nav-item[data-page="settings"]'),
            document.querySelector('.nav-item-upgrade')
        ];

        navItems.forEach(item => {
            if (item) {
                item.classList.add('has-update-indicator');
                if (ready) {
                    item.classList.add('update-ready');
                } else {
                    item.classList.remove('update-ready');
                }
            }
        });
    }
}

// 导出到全局
window.UpdateManager = UpdateManager;
