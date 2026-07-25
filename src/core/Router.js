/**
 * Router.js — Community edition
 * Pages: download, history, transcribe, compress, settings, upgrade.
 * No Creator / Editor / Subtitle / Enhance lazy-load branches.
 */
class Router {
    constructor(app) {
        this.app = app;
        this.currentPage = 'download';
    }

    /**
     * @param {string} pageId
     * @returns {Promise<void>}
     */
    async switchPage(pageId) {
        if (!pageId) return;

        const proPages =
            this.app.licenseManager?._mf_p_ids ||
            (typeof window !== 'undefined' && window.FeatureFlags?.PRO_PAGES) ||
            [];
        const isProPage =
            typeof window !== 'undefined' && window.FeatureFlags?.isProPage
                ? window.FeatureFlags.isProPage(pageId)
                : proPages.includes(pageId);
        if (isProPage && !this.app.licenseManager?.checkFeatureAccess()) {
            this.app.showToast(window.i18n?.t('common.proOnly') || 'Pro feature', 'warning');
            pageId = 'upgrade';
        }

        try {
            if (window.PageLoader?.ensurePage) {
                await window.PageLoader.ensurePage(pageId);
            }
        } catch (err) {
            console.error(`[Router] ensurePage(${pageId}) failed:`, err);
        }

        this.currentPage = pageId;

        document.querySelectorAll('.nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        document.querySelectorAll('.page').forEach((section) => {
            section.classList.toggle('active', section.id === `page-${pageId}`);
        });

        if (pageId === 'download') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const dm = this.app.downloadManager;
            if (dm && !dm.videoInfo && !dm.playlistInfo) {
                dm.ui?.hideAllDownloadUI?.();
            }
        }

        if (pageId === 'history' && this.app.historyManager) {
            const history = this.app.historyManager;
            if (typeof history.checkFilesExistence === 'function') {
                history.checkFilesExistence();
            } else {
                history.service?.checkFilesExistence?.();
            }
        }
    }

    /**
     * Community: single-link only (batch mode UI is stripped).
     * @returns {Promise<void>}
     */
    async switchMode(mode) {
        if (mode === 'batch') {
            this.app.showToast(
                window.i18n?.t('download.multiUrlDetected') ||
                    'Batch capture is available in the official Pro build',
                'warning'
            );
            await this.switchPage('upgrade');
            return;
        }

        this.app.mode = 'single';
        document.getElementById('single-input-area')?.classList.remove('hidden');
        document.getElementById('batch-input-area')?.classList.add('hidden');
        document.getElementById('mode-single')?.classList.add('active');
        document.getElementById('mode-batch')?.classList.remove('active');

        const dm = this.app.downloadManager;
        if (dm?.videoInfo) {
            document.getElementById('download-video-info')?.classList.remove('hidden');
            document.getElementById('download-options')?.classList.remove('hidden');
        } else {
            dm?.ui?.hideAllDownloadUI?.();
        }
    }

    /**
     * @param {string} page
     * @param {object} [params]
     * @returns {Promise<void>}
     */
    async navigateTo(page, params = {}) {
        await this.switchPage(page);

        if (page === 'download' && params.url) {
            const input = document.getElementById('video-url');
            if (input) {
                input.value = params.url;
                input.dispatchEvent(new Event('input'));
            }
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
                            window.pixelFlow.addFiles(
                                paths.map((p) => ({
                                    path: p,
                                    name: String(p).split(/[/\\]/).pop(),
                                    size: 0
                                }))
                            );
                        }
                    } catch (error) {
                        console.error('[Router] Failed to import compress images:', error);
                    }
                }, 0);
            }
        }
    }
}

window.Router = Router;
