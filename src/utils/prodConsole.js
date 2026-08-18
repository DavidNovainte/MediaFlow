/**
 * Silence noisy console methods in packaged / production builds.
 * Keeps error + warn. Dev (unpackaged) stays verbose.
 *
 * Load early in renderer (index.html) and optionally call from main.
 */
(function (root) {
    function isProd() {
        try {
            // Renderer: set by preload when available
            if (typeof root.__MEDIAFLOW_PACKAGED__ === 'boolean') {
                return root.__MEDIAFLOW_PACKAGED__;
            }
            // Heuristic: file:// packaged app path
            if (typeof location !== 'undefined' && location.protocol === 'file:') {
                const p = location.pathname || '';
                if (/app\.asar|resources/i.test(p)) return true;
            }
        } catch {
            /* ignore */
        }
        return false;
    }

    function silenceConsole(force) {
        if (!force && !isProd()) return false;
        const c = root.console || console;
        if (!c || c.__mfSilenced) return !!c?.__mfSilenced;
        const noop = function () {};
        try {
            c.log = noop;
            c.debug = noop;
            c.info = noop;
            // keep warn + error
            c.__mfSilenced = true;
        } catch {
            /* ignore */
        }
        return true;
    }

    // Auto-run in browser/renderer when packaged
    if (typeof window !== 'undefined') {
        const trySilence = async () => {
            try {
                if (window.mediaflow?.app?.isPackaged) {
                    const packaged = await window.mediaflow.app.isPackaged();
                    if (packaged) {
                        window.__MEDIAFLOW_PACKAGED__ = true;
                        silenceConsole(true);
                        return;
                    }
                }
            } catch {
                /* ignore */
            }
            silenceConsole(false);
        };
        trySilence();
        setTimeout(trySilence, 100);
        setTimeout(trySilence, 800);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { silenceConsole, isProd };
    }
    if (root) {
        root.MediaFlowProdConsole = { silenceConsole, isProd };
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
