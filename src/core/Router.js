/**
 * Router.js
 */
console.log('[Router] Script started');
class Router {
    constructor(app) {
        this.app = app;
        this.currentPage = 'download';
    }

    /**
     * 切换页面（异步：先 ensure HTML 片段再显隐，避免空壳页）
     * @param {string} pageId 页面ID
     * @returns {Promise<void>}
     */
    async switchPage(pageId) {
        if (!pageId) return;

        // Phase A: load fragment on demand (no-op if already loaded / prefetched)
        try {
            if (window.PageLoader?.ensurePage) {
                await window.PageLoader.ensurePage(pageId);
            }
        } catch (err) {
            console.error(`[Router] ensurePage(${pageId}) failed:`, err);
        }

        console.log(`[Router] Switching to page: ${pageId}`);
        this.currentPage = pageId;

        // 更新侧边栏状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        // 切换页面显隐
        document.querySelectorAll('.page').forEach(section => {
            section.classList.toggle('active', section.id === `page-${pageId}`);
        });

        // 如果切换到下载页，确保滚动到顶部
        if (pageId === 'download') {
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // 🆕 修复：当从其他页面返回下载页时，如果没有活跃的视频/播放列表信息，重置 UI
            const dm = this.app.downloadManager;
            if (dm && !dm.videoInfo && !dm.playlistInfo) {
                dm.ui?.hideAllDownloadUI?.();
            }
        }

        // AI 画质增强：按需加载脚本并 init（Phase D lazy load）
        if (pageId === 'enhance') {
            try {
                const flow = window.FeatureLoader?.ensureEnhance
                    ? await window.FeatureLoader.ensureEnhance()
                    : window.EnhanceFlow;
                if (flow?.init) {
                    console.log('[Router] Initializing EnhanceFlow...');
                    await flow.init();
                }
            } catch (enhanceErr) {
                console.error('[Router] Failed to load Enhance feature:', enhanceErr);
                this.app?.showToast?.(
                    window.i18n?.t?.('common.loadFailed') || 'Failed to load AI Enhance',
                    'error'
                );
            }
        }

        // 🆕 历史记录页面：自动检测文件是否已删除
        // HistoryFlow 本身没有 checkFilesExistence，真实实现在 HistoryService
        if (pageId === 'history' && this.app.historyManager) {
            console.log('[Router] Refreshing history file existence check...');
            const history = this.app.historyManager;
            if (typeof history.checkFilesExistence === 'function') {
                history.checkFilesExistence();
            } else {
                history.service?.checkFilesExistence?.();
            }
        }

        if (pageId === 'editor') {
            try {
                const flow = window.FeatureLoader?.ensureEditor
                    ? await window.FeatureLoader.ensureEditor(this.app)
                    : window.editorFlow;
                if (flow && !flow._featureLoaderInited && typeof flow.init === 'function') {
                    await flow.init();
                    flow._featureLoaderInited = true;
                }
                setTimeout(() => {
                    try {
                        flow?.renderCurrentState?.();
                    } catch (error) {
                        console.error('[Router] Failed to refresh editor view after page switch:', error);
                    }
                }, 0);
            } catch (editorErr) {
                console.error('[Router] Failed to load Editor feature:', editorErr);
                this.app?.showToast?.(
                    window.i18n?.t?.('common.loadFailed') || 'Failed to load Editor',
                    'error'
                );
            }
        }

        if (pageId === 'subtitle') {
            try {
                const flow = window.FeatureLoader?.ensureSubtitle
                    ? await window.FeatureLoader.ensureSubtitle(this.app)
                    : window.subtitleFlow;
                if (flow && !flow._featureLoaderInited && typeof flow.init === 'function') {
                    await flow.init();
                    flow._featureLoaderInited = true;
                }
            } catch (subtitleErr) {
                console.error('[Router] Failed to load Subtitle feature:', subtitleErr);
                this.app?.showToast?.(
                    window.i18n?.t?.('common.loadFailed') || 'Failed to load Subtitle tools',
                    'error'
                );
            }
        }

        if (pageId === 'creator') {
            try {
                const flow = window.FeatureLoader?.ensureCreator
                    ? await window.FeatureLoader.ensureCreator(this.app)
                    : window.creatorFlow;
                if (flow && !flow._featureLoaderInited && typeof flow.init === 'function') {
                    await flow.init();
                    flow._featureLoaderInited = true;
                }
            } catch (creatorErr) {
                console.error('[Router] Failed to load Creator feature:', creatorErr);
                this.app?.showToast?.(
                    window.i18n?.t?.('common.loadFailed') || 'Failed to load Creator tools',
                    'error'
                );
            }
        }

    }

    /**
     * 切换下载模式 (Single/Batch)
     * @returns {Promise<void>}
     */
    async switchMode(mode) {
        this.app.mode = mode;
        const singleArea = document.getElementById('single-input-area');
        const batchArea = document.getElementById('batch-input-area');
        const btnSingle = document.getElementById('mode-single');
        const btnBatch = document.getElementById('mode-batch');
        const videoInfo = document.getElementById('download-video-info');
        const downloadOptions = document.getElementById('download-options');
        const playlistInfo = document.getElementById('playlist-info');

        if (mode === 'single') {
            singleArea?.classList.remove('hidden');
            batchArea?.classList.add('hidden');
            btnSingle?.classList.add('active');
            btnBatch?.classList.remove('active');

            const dm = this.app.downloadManager;
            if (dm?.videoInfo) {
                videoInfo?.classList.remove('hidden');
                downloadOptions?.classList.remove('hidden');
            } else if (dm?.playlistInfo) {
                playlistInfo?.classList.remove('hidden');
            } else {
                // 🆕 修复：如果没有活跃内容，彻底重置 UI
                dm?.ui?.hideAllDownloadUI?.();
            }
        } else {
            singleArea?.classList.add('hidden');
            batchArea?.classList.remove('hidden');
            btnSingle?.classList.remove('active');
            btnBatch?.classList.add('active');
            videoInfo?.classList.add('hidden');
            downloadOptions?.classList.add('hidden');
            playlistInfo?.classList.add('hidden');
        }
    }

    /**
     * 导航并传参（先 await 切页，保证目标页 DOM 已注入）
     * @param {string} page
     * @param {object} [params]
     * @returns {Promise<void>}
     */
    async navigateTo(page, params = {}) {
        await this.switchPage(page);
        // 这里可以扩展处理 params 的逻辑
        if (page === 'download' && params.url) {
            const input = document.getElementById('video-url');
            if (input) {
                input.value = params.url;
                input.dispatchEvent(new Event('input'));
            }
        }

        // Enhance init already handled inside switchPage when page is enhance

        if (page === 'creator') {
            setTimeout(async () => {
                try {
                    const flow = window.FeatureLoader?.ensureCreator
                        ? await window.FeatureLoader.ensureCreator(this.app)
                        : window.creatorFlow;
                    if (!flow) return;

                    const imported = await flow.importPendingWorkflow?.({
                        navigationParams: params
                    });

                    if (!imported && params.videoPath) {
                        await flow.addLocalFile?.(params.videoPath);
                    }
                } catch (error) {
                    console.error('[Router] Failed to import creator workflow:', error);
                }
            }, 0);
        }

        if (page === 'compress') {
            const paths = Array.isArray(params.imagePaths)
                ? params.imagePaths.filter(Boolean)
                : (params.imagePath ? [params.imagePath] : []);
            if (paths.length) {
                setTimeout(async () => {
                    try {
                        if (window.pixelFlow?.importPaths) {
                            await window.pixelFlow.importPaths(paths);
                        } else if (window.pixelFlow?.addFiles) {
                            window.pixelFlow.addFiles(paths.map((p) => ({
                                path: p,
                                name: String(p).split(/[/\\]/).pop(),
                                size: 0
                            })));
                        }
                    } catch (error) {
                        console.error('[Router] Failed to import compress images:', error);
                    }
                }, 0);
            }
        }

        if (page === 'editor') {
            setTimeout(async () => {
                try {
                    const flow = window.FeatureLoader?.ensureEditor
                        ? await window.FeatureLoader.ensureEditor(this.app)
                        : window.editorFlow;
                    if (!flow) return;

                    if (params.mediaFile) {
                        await flow.handleFileSelect?.(params.mediaFile);
                        return;
                    }

                    if (params.videoPath) {
                        await flow.addLocalFile?.(params.videoPath);
                    }
                } catch (error) {
                    console.error('[Router] Failed to open editor media:', error);
                }
            }, 0);
        }
    }
}

window.Router = Router;
