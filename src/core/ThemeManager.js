/**
 * ThemeManager — dark (default) + light UI themes.
 * Persists `uiTheme` in electron-store: 'dark' | 'light'
 */
(function (root) {
    const STORE_KEY = 'uiTheme';
    const VALID = new Set(['dark', 'light']);

    function normalize(theme) {
        const t = String(theme || '').toLowerCase();
        return VALID.has(t) ? t : 'light';
    }

    function apply(theme) {
        const t = normalize(theme);
        const rootEl = document.documentElement;
        rootEl.setAttribute('data-theme', t);
        if (document.body) {
            document.body.classList.toggle('theme-light', t === 'light');
            document.body.classList.toggle('theme-dark', t === 'dark');
        }
        try {
            rootEl.style.colorScheme = t;
        } catch {
            /* ignore */
        }
        return t;
    }

    async function init() {
        let stored = 'light';
        try {
            const v = await window.mediaflow?.store?.get?.(STORE_KEY);
            if (v) stored = v;
        } catch (e) {
            console.warn('[ThemeManager] read failed:', e);
        }
        const applied = apply(stored);
        console.log('[ThemeManager] applied', applied);
        return applied;
    }

    async function setTheme(theme) {
        const t = apply(theme);
        try {
            await window.mediaflow?.store?.set?.(STORE_KEY, t);
        } catch (e) {
            console.warn('[ThemeManager] save failed:', e);
        }
        try {
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: t } }));
        } catch {
            /* ignore */
        }
        return t;
    }

    function getTheme() {
        return normalize(document.documentElement.getAttribute('data-theme') || 'light');
    }

    const api = {
        STORE_KEY,
        init,
        apply,
        setTheme,
        getTheme,
        normalize
    };

    root.ThemeManager = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
