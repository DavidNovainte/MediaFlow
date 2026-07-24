/**
 * scriptLoader.js — sequential classic-script loader with de-dupe.
 * Used for feature-bundle lazy load (no bundler).
 */
(function (root) {
    const loaded = new Set();
    /** @type {Map<string, Promise<void>>} */
    const inflight = new Map();

    function normalizeSrc(src) {
        if (!src) return '';
        // Strip query for de-dupe key, keep full src for load
        return String(src).split('?')[0];
    }

    /**
     * @param {string} src
     * @returns {Promise<void>}
     */
    function loadScript(src) {
        const key = normalizeSrc(src);
        if (!key) return Promise.resolve();
        if (loaded.has(key)) return Promise.resolve();
        if (inflight.has(key)) return inflight.get(key);

        // Already in DOM?
        const existing = document.querySelector(`script[src^="${key}"]`);
        if (existing) {
            loaded.add(key);
            return Promise.resolve();
        }

        const promise = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.async = false;
            el.onload = () => {
                loaded.add(key);
                inflight.delete(key);
                resolve();
            };
            el.onerror = () => {
                inflight.delete(key);
                reject(new Error(`[scriptLoader] Failed to load: ${src}`));
            };
            document.head.appendChild(el);
        });

        inflight.set(key, promise);
        return promise;
    }

    /**
     * Load scripts in order (preserve dependency order).
     * @param {string[]} srcs
     * @returns {Promise<void>}
     */
    async function loadScripts(srcs) {
        const list = Array.isArray(srcs) ? srcs : [];
        for (const src of list) {
            await loadScript(src);
        }
    }

    root.ScriptLoader = {
        loadScript,
        loadScripts,
        isLoaded: (src) => loaded.has(normalizeSrc(src)),
        _loaded: loaded
    };
})(typeof window !== 'undefined' ? window : globalThis);
