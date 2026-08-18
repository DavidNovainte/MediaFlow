/**
 * MediaFlowApp.js (Refactored)
 */
console.log('[MediaFlowApp] Script started');
class MediaFlowApp {
    constructor() {
        console.log('[MediaFlowApp] Constructor starting...');
        window.app = this; // Set early for dependencies

        // 核心服务 (Core Services)
        this.ui = new window.UIManager(this);
        this.router = new window.Router(this);
        this.clipboard = new window.ClipboardAssistant(this);
        this.protocol = new window.ProtocolHandler(this);

        // 业务模块 (Feature Managers)
        this.downloadManager = new window.DownloadManager(this);
        this.translationManager = new window.TranslationManager(this);
        this.dragDropManager = new window.DragDropManager(this);
        this.historyManager = new window.HistoryFlow(this);
        this.updateManager = new window.UpdateManager(this);

        // Feature Flows — heavy toolboxes lazy-loaded via FeatureLoader
        this.creatorFlow = null;
        window.creatorFlow = null;
        this.editorFlow = null;
        window.editorFlow = null;
        this.subtitleFlow = null;
        window.subtitleFlow = null;
        if (window.PixelFlow) {
            this.pixelFlow = new window.PixelFlow(this);
            window.pixelFlow = this.pixelFlow;
        }
        if (window.ScribeFlow) {
            this.scribeFlow = new window.ScribeFlow(this);
            window.scribeFlow = this.scribeFlow;
        }
        if (window.MobileFlow) {
            this.mobileFlow = new window.MobileFlow(this);
            window.mobileFlow = this.mobileFlow;
        }

        // 全局状态
        this.mode = 'single';
        this._cleanupFns = [];
        console.log('[MediaFlowApp] Constructor complete');
    }

    /**
     * 初始化应用入口
     */
    async init() {
        console.log('[MediaFlowApp] Starting init sequence...');
        try {
            // 1. 系统级初始化
            if (window.platformRegistry) window.platformRegistry.init();
            console.log('[App] Platform registry initialized');

            // Theme before first paint of pages (default light if unset)
            try {
                if (window.ThemeManager?.init) {
                    await window.ThemeManager.init();
                } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                }
            } catch (themeInitErr) {
                console.warn('[App] theme init skipped:', themeInitErr);
                document.documentElement.setAttribute('data-theme', 'light');
            }

            await window.i18n.init();
            console.log('[App] i18n initialized');

            // 2. Phase A: load only first-interactive HTML, then warm the rest
            let pagesPrefetch = Promise.resolve();
            if (window.PageLoader) {
                console.log('[App] Loading critical pages...');
                if (typeof window.PageLoader.loadCritical === 'function') {
                    await window.PageLoader.loadCritical();
                    console.log('[App] Critical pages loaded');
                    // Background prefetch — must finish before feature Flow.init needs DOM
                    pagesPrefetch = typeof window.PageLoader.prefetchRest === 'function'
                        ? window.PageLoader.prefetchRest()
                        : window.PageLoader.loadAll?.() || Promise.resolve();
                } else {
                    // Legacy fallback
                    await window.PageLoader.loadAll();
                    console.log('[App] All pages loaded (legacy loadAll)');
                }
                if (window.i18n) window.i18n.updateUI();
            }

            // 3. 初始化核心（下载页此时已可交互）
            console.log('[App] Initializing core services...');
            this.ui.init?.();
            console.log('[App] UIManager initialized');
            await this.router.switchPage('download');
            console.log('[App] Router switched to download');

            // 4. 初始化业务 Manager（依赖 download / settings DOM）
            if (window.QueueManager) {
                this.queueManager = new window.QueueManager(this);
                await this.queueManager.init();

                // 🆕 绑定队列 UI 渲染回调 (委托给 QueueUIManager)
                this.queueManager.on('update', (queue) => {
                    this.queueManager.ui.render(queue);
                    // 🆕 更新队列徽章
                    window.queueAnimation?.updateBadge?.(queue.length);
                });

                // 🆕 绑定暂停状态变化回调 (更新暂停按钮图标)
                this.queueManager.on('pauseChange', (isPaused) => {
                    const pauseBtn = document.getElementById('batch-btn-pause-all');
                    if (pauseBtn) {
                        const iconPause = pauseBtn.querySelector('.icon-pause');
                        const iconPlay = pauseBtn.querySelector('.icon-play');
                        if (iconPause) iconPause.style.display = isPaused ? 'none' : 'block';
                        if (iconPlay) iconPlay.style.display = isPaused ? 'block' : 'none';
                    }
                });

                // 初始渲染
                this.queueManager.ui.render(this.queueManager.queue);

                // 🆕 初始化队列动画
                window.queueAnimation?.init?.();
                window.queueAnimation?.updateBadge?.(this.queueManager.queue.length);
            }


            await this.downloadManager.init();
            this.settingsManager = new window.SettingsFlow(this);
            await this.settingsManager.init();

            if (window.DownloadBatchManager) {
                this.batchManager = new window.DownloadBatchManager(this);
                this.batchManager.init();
                window.batchManager = this.batchManager;
            }

            this.translationManager.init();
            this.dragDropManager.init();
            this.updateManager.init();

            // Ensure remaining page HTML exists before history / Feature Flow DOM binding
            try {
                await pagesPrefetch;
                console.log('[App] Remaining pages prefetched');
            } catch (prefetchErr) {
                console.warn('[App] Page prefetch incomplete:', prefetchErr);
                // Last resort: force-load any still-missing pages
                if (window.PageLoader?.loadAll) {
                    await window.PageLoader.loadAll();
                }
            }

            // History binds list UI — needs #page-history fragment
            this.historyManager.init();

            // 5. 初始化 Feature Flows 
            // creator / editor / subtitle init deferred to FeatureLoader on first open
            if (this.pixelFlow) await this.pixelFlow.init?.();
            // scribeFlow often auto-inits or has complex flow, check scribeFlow.js if needed
            if (this.scribeFlow) await this.scribeFlow.init?.();
            if (this.mobileFlow) await this.mobileFlow.init?.();

            if (window.ShortcutsManager) {
                this.shortcutsManager = new window.ShortcutsManager(this);
                this.shortcutsManager.init();
            }

            // 6. 绑定全局事件
            this.bindEvents();

            // 7. 开启后台监听服务
            this.protocol.init();

            // 8. 恢复侧边栏状态
            const isCollapsed = await window.mediaflow?.store?.get('sidebarCollapsed');
            if (isCollapsed) this.ui.toggleSidebar(true);

            window.app = this;
            this.setupCleanup();

            // 动态加载版本号 & 平台样式
            try {
                const platform = window.mediaflow?.app?.platform;
                if (platform === 'darwin') {
                    document.body.classList.add('platform-darwin');
                }
                
                const ver = await window.mediaflow?.app?.getVersion?.();
                const verEl = document.getElementById('app-version-display');
                if (ver && verEl) verEl.textContent = `v${ver}`;
            } catch (platformError) {
                void platformError;
            }

            console.log('[MediaFlowApp] Init sequence complete successfully');

            // Soft notice when core tools are missing (does not block startup)
            let missingBins = [];
            try {
                const bin = await window.mediaflow?.system?.getBinaryStatus?.();
                if (bin && bin.ready === false && Array.isArray(bin.missing) && bin.missing.length) {
                    missingBins = bin.missing;
                    const list = missingBins.join(', ');
                    this.showToast(
                        window.i18n?.t?.('settings.binaryMissingToast', { list })
                            || `Missing tools: ${list}. Open Settings → Core engines to fix.`,
                        'warning',
                        {
                            duration: 8000,
                            buttons: [{
                                text: window.i18n?.t?.('common.openSettings') || 'Open Settings',
                                onClick: () => this.router?.switchPage?.('settings')
                            }]
                        }
                    );
                }
            } catch (binCheckErr) {
                console.warn('[App] binary status check skipped:', binCheckErr);
            }

            // First-run onboarding (once)
            try {
                const done = await window.mediaflow?.store?.get?.('onboardingComplete');
                if (!done && window.Onboarding) {
                    await new window.Onboarding(this).show({ missing: missingBins });
                }
            } catch (onboardingErr) {
                console.warn('[App] onboarding skipped:', onboardingErr);
            }

        } catch (err) {
            console.error('[MediaFlowApp] Init sequence failed:', err);
            // Fallback: at least try to switch to download page if possible
            try {
                await this.router.switchPage('download');
            } catch (switchErr) {
                console.error('[MediaFlowApp] Fallback switchPage failed:', switchErr);
            }
        }
    }

    /**
     * 绑定全局 UI 事件
     */
    bindEvents() {
        // 窗口控制
        document.getElementById('btn-minimize')?.addEventListener('click', () => window.mediaflow.window.minimize());
        document.getElementById('btn-maximize')?.addEventListener('click', () => window.mediaflow.window.maximize());
        document.getElementById('btn-close')?.addEventListener('click', () => window.mediaflow.window.close());

        // 侧边栏折叠
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => this.ui.toggleSidebar());

        // 下载侧边栏切换
        document.getElementById('btn-toggle-queue')?.addEventListener('click', () => this.ui.toggleQueueDrawer());
        document.getElementById('btn-close-drawer')?.addEventListener('click', () => this.ui.toggleQueueDrawer(false));
        window.toggleQueueDrawer = (show) => this.ui.toggleQueueDrawer(show);

        // 侧边栏导航
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
            btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
        });

        // 模式切换
        document.getElementById('mode-single')?.addEventListener('click', () => this.switchMode('single'));
        document.getElementById('mode-batch')?.addEventListener('click', () => this.switchMode('batch'));

        // 输入框右键粘贴增强
        const urlInput = document.getElementById('video-url');
        urlInput?.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const extracted = window.downloadFlow?.service?.extractUrlFromText(text);
                    urlInput.value = extracted || text;
                    urlInput.focus();
                }
            } catch (clipboardContextError) {
                void clipboardContextError;
            }
        });

        // 窗口聚焦时检测剪贴板
        window.addEventListener('focus', () => this.clipboard.checkClipboard());

        // 扩展文件夹
        document.getElementById('btn-open-extension-folder')?.addEventListener('click', () => {
            window.mediaflow.shell?.openExtensionFolder();
        });

        // 🆕 功能卡片点击跳转
        document.querySelectorAll('.feature-card[data-page]').forEach(card => {
            card.addEventListener('click', () => this.switchPage(card.dataset.page));
        });

        // 🆕 剪贴板快捷粘贴按钮（智能识别模式）
        document.getElementById('btn-paste-clipboard')?.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text || !text.trim()) {
                    this.showToast(window.i18n?.t('download.clipboardEmpty') || 'Notification', 'info');
                    return;
                }

                // 检查当前是否在批量模式
                const batchTab = document.getElementById('mode-batch');
                const isBatchMode = batchTab?.classList.contains('active');

                if (isBatchMode && window.batchManager?.inputManager) {
                    // 批量模式：粘贴到 Smart Input
                    window.batchManager.inputManager.processInput(text);
                    this.showToast(window.i18n?.t('download.pasteSuccess') || 'Notification', 'success');
                } else {
                    // 单视频模式：粘贴到 URL 输入框
                    const urlInput = document.getElementById('video-url');
                    if (urlInput) {
                        const extracted = window.downloadFlow?.service?.extractUrlFromText(text);
                        urlInput.value = extracted || text;
                        urlInput.focus();
                        // 自动触发检测
                        document.getElementById('btn-check')?.click();
                    }
                }
            } catch {
                this.showToast(window.i18n?.t('common.errors.clipboardRead') || 'Notification', 'warning');
            }
        });

        // Browser extension page (loaded dynamically) — open store in system browser
        document.addEventListener('click', (event) => {
            const link = event.target?.closest?.('#btn-extension-chrome-store');
            if (!link) return;
            const href = link.getAttribute?.('href');
            if (!href || !window.mediaflow?.shell?.openExternal) return;
            event.preventDefault();
            window.mediaflow.shell.openExternal(href);
        });

        // 🆕 队列控制按钮
        document.getElementById('btn-open-local')?.addEventListener('click', () => {
            this.switchPage('creator');
        });

        document.getElementById('btn-clear-all-queue')?.addEventListener('click', () => {
            this.queueManager?.clearCompleted?.();
            this.showToast(window.i18n?.t('download.clearSuccess') || 'Operation failed', 'success');
        });

        document.getElementById('batch-btn-pause-all')?.addEventListener('click', () => {
            this.queueManager?.togglePause?.();
        });

        document.getElementById('batch-btn-cancel-all')?.addEventListener('click', async () => {
            const confirmMsg = window.i18n?.t('download.cancelAllConfirm') || 'Notification';
            const confirm = await this.showConfirm(confirmMsg);
            if (confirm) {
                this.queueManager?.cancelAll?.();
                const successMsg = window.i18n?.t('download.cancelAllSuccess') || 'Notification';
                this.showToast(successMsg, 'warning');
            }
        });

        // 🆕 遗漏的功能绑定
        // 1. 单视频重置按钮
        document.getElementById('btn-reset-download')?.addEventListener('click', () => {
            const urlInput = document.getElementById('video-url');
            if (urlInput) {
                urlInput.value = '';
                urlInput.focus();
            }
            this.downloadManager?.ui?.hideAllDownloadUI?.();
        });

        // 🆕 批量下载粘贴按钮事件已移至 BatchManager.init()
    }

    /**
     * 路由与模式别名 (兼容旧代码直接调用 this.app.xxx)
     */
    async switchPage(page) {
        await this.router.switchPage(page);
    }
    switchMode(mode) { this.router.switchMode(mode); }
    navigateTo(page, params) { this.router.navigateTo(page, params); }

    /**
     * UI 反馈别名
     */
    showToast(msg, type, opts) { return this.ui.showToast(msg, type, opts); }
    showConfirm(msg) { return this.ui.showConfirm(msg); }
    showChoice(title, msg, choices) { return this.ui.showChoice(title, msg, choices); }
    showPrompt(title, msg, def) { return this.ui.showPrompt(title, msg, def); }

    /**
     * 工具方法与处理器
     */
    isValidUrl(text) {
        try {
            const url = new URL(text);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch { return false; }
    }

    async handleAudioFile(file) {
        this.switchPage('transcribe');
        if (window.scribeFlow) {
            window.scribeFlow.handleFilesSelect([file]);
        } else {
            this.showToast(window.i18n?.t('common.errors.moduleNotLoaded') || 'Notification', 'error');
        }
    }

    startDownloadWithOptions(url, options = {}) {
        if (this.downloadManager?.startDownloadWithOptions) {
            return this.downloadManager.startDownloadWithOptions(url, options);
        }
    }

    /**
     * 渲染全局下载队列 UI
     * @param {Array} queue 队列数据
     */


    pushCleanup(fn) {
        if (typeof fn === 'function') this._cleanupFns.push(fn);
    }

    setupCleanup() {
        window.addEventListener('beforeunload', () => {
            console.log('[App] Performing cleanup before unload...');
            this._cleanupFns.forEach(fn => {
                try { fn(); } catch (e) { console.warn('[App] Cleanup task failed:', e); }
            });
            // 触发主进程清理 (防火墙性质的统一回收)
            window.mediaflow?.system?.cleanup();
        });
    }
}

// 导出全局构造器
window.MediaFlowApp = MediaFlowApp;

// 初始化应用单例 (自启动)
document.addEventListener('DOMContentLoaded', () => {
    if (!window.app) {
        console.log('[MediaFlow] Starting application...');
        const app = new MediaFlowApp();
        app.init().then(() => {
            console.log('[MediaFlow] App initialization complete');
        }).catch(err => {
            console.error('[MediaFlow] Critical initialization error:', err);
        });
    }
});
