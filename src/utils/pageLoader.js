/**
 * Page Loader Utility
 * Loads HTML fragments from src/pages/ into the main index.html.
 *
 * Phase A performance:
 * - loadCritical(): only first-interactive pages (download + settings + upgrade)
 * - ensurePage(): idempotent load with in-flight de-dupe
 * - prefetchRest(): background load of remaining FeatureFlags pages
 * - loadAll(): still available (compatibility) via ensurePage on every page
 */
class PageLoader {
    /** @type {Set<string>} */
    static _loaded = new Set();

    /** @type {Map<string, Promise<void>>} */
    static _inflight = new Map();

    /** Pages needed before the user can use the default shell */
    static CRITICAL_PAGES = Object.freeze(['download', 'settings', 'upgrade']);

    /**
     * Resolve the full page list for this edition (community omits pro pages).
     * @returns {string[]}
     */
    static getAllowedPages() {
        const flags = typeof window !== 'undefined' ? window.FeatureFlags : null;
        if (flags) {
            return [
                ...flags.COMMUNITY_PAGES,
                ...(flags.EDITION === 'community' ? [] : flags.PRO_PAGES)
            ];
        }
        return [
            'download',
            'transcribe',
            'compress',
            'creator',
            'editor',
            'mobile',
            'extension',
            'history',
            'settings',
            'upgrade',
            'subtitle',
            'enhance'
        ];
    }

    /**
     * True when the page section already has real content (not an empty shell).
     * @param {string} pageName
     * @returns {boolean}
     */
    static isPageReady(pageName) {
        if (this._loaded.has(pageName)) return true;
        const el = document.getElementById(`page-${pageName}`);
        if (!el) return false;
        // Empty shell sections in index.html have no meaningful children yet
        if (el.children.length === 0) return false;
        // Some shells exist with only whitespace / comments
        const text = (el.textContent || '').trim();
        if (el.children.length === 0 && !text) return false;
        // Heuristic: loaded fragments always introduce nested structure
        if (el.querySelector('.page-container, .enhance-container, form, .settings-group, .download-layout, header, .workspace-center-pro, .pro-monitor')) {
            this._loaded.add(pageName);
            return true;
        }
        // Non-empty custom content (e.g. inject without known class)
        if (el.children.length > 0 && el.innerHTML.trim().length > 80) {
            this._loaded.add(pageName);
            return true;
        }
        return false;
    }

    /**
     * Load one page fragment (always fetches). Prefer ensurePage().
     * @param {string} pageName
     * @param {string} [containerId='main-content']
     */
    static async loadPage(pageName, containerId = 'main-content') {
        try {
            // Cache-bust HTML templates during dev; keep stable enough for session via ensure de-dupe
            const response = await fetch(`pages/${pageName}.html?t=${Date.now()}`);
            if (!response.ok) throw new Error(`Failed to load ${pageName}: ${response.status}`);
            const html = await response.text();

            let container = document.getElementById(`page-${pageName}`);

            if (container) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newSection = doc.querySelector('section');

                if (newSection && newSection.id === container.id) {
                    container.replaceWith(newSection);
                    console.log(`[PageLoader] Replaced #page-${pageName} with loaded content`);
                } else {
                    container.innerHTML = html;
                    console.log(`[PageLoader] Injected content into #page-${pageName}`);
                }
            } else {
                const mainContainer = document.getElementById(containerId);
                if (mainContainer) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const section = tempDiv.querySelector('section');
                    if (section) {
                        mainContainer.appendChild(section);
                        console.log(`[PageLoader] Appended ${pageName} to ${containerId}`);
                    }
                }
            }

            this._loaded.add(pageName);

            if (window.i18n && typeof window.i18n.updateUI === 'function') {
                window.i18n.updateUI();
            }
        } catch (error) {
            console.error(`[PageLoader] Error loading ${pageName}:`, error);
            // Do not mark loaded on failure — allow retry
            this._loaded.delete(pageName);
        }
    }

    /**
     * Idempotent: load page if not already present. Concurrent callers share one promise.
     * @param {string} pageName
     * @param {string} [containerId='main-content']
     */
    static async ensurePage(pageName, containerId = 'main-content') {
        if (!pageName) return;
        if (this.isPageReady(pageName)) return;

        const existing = this._inflight.get(pageName);
        if (existing) return existing;

        const promise = this.loadPage(pageName, containerId)
            .catch((err) => {
                console.error(`[PageLoader] ensurePage(${pageName}) failed:`, err);
            })
            .finally(() => {
                this._inflight.delete(pageName);
            });

        this._inflight.set(pageName, promise);
        return promise;
    }

    /**
     * First-interactive shell only.
     */
    static async loadCritical(containerId = 'main-content') {
        const allowed = new Set(this.getAllowedPages());
        const critical = this.CRITICAL_PAGES.filter((p) => allowed.has(p));
        const mainContainer = document.querySelector('.main-content') || document.getElementById(containerId);
        if (!mainContainer) {
            console.error('[PageLoader] Main content container not found');
            return;
        }
        console.log('[PageLoader] Loading critical pages:', critical.join(', '));
        await Promise.all(critical.map((page) => this.ensurePage(page, containerId)));
    }

    /**
     * Background-load remaining allowed pages (does not block first paint if not awaited).
     */
    static async prefetchRest(containerId = 'main-content') {
        const allowed = this.getAllowedPages();
        const rest = allowed.filter((p) => !this.CRITICAL_PAGES.includes(p) && !this.isPageReady(p));
        if (rest.length === 0) return;

        const run = async () => {
            console.log('[PageLoader] Prefetching pages:', rest.join(', '));
            // Sequential soft-load to avoid burst disk; still faster than blocking startup
            for (const page of rest) {
                await this.ensurePage(page, containerId);
            }
        };

        if (typeof requestIdleCallback === 'function') {
            await new Promise((resolve) => {
                requestIdleCallback(() => {
                    run().then(resolve).catch(resolve);
                }, { timeout: 2000 });
            });
        } else {
            await new Promise((resolve) => {
                setTimeout(() => {
                    run().then(resolve).catch(resolve);
                }, 0);
            });
        }
    }

    /**
     * Load every allowed page (legacy / tests / full prewarm).
     */
    static async loadAll() {
        const pages = this.getAllowedPages();
        const container = document.querySelector('.main-content');
        if (!container) {
            console.error('[PageLoader] Main content container not found');
            return;
        }
        await Promise.all(pages.map((page) => this.ensurePage(page, 'main-content')));
    }
}

window.PageLoader = PageLoader;
