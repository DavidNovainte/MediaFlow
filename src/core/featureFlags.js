/**
 * featureFlags.js
 * MediaFlow 已完全免费开源：所有页面与功能一律开放，无 Pro/Community 之分。
 * 仍在浏览器渲染进程与 Node 主进程之间共享。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.FeatureFlags = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
    /** 全部可用页面（免费版 = 正式版） */
    const PAGES = Object.freeze([
        'download',
        'history',
        'transcribe',
        'compress',
        'enhance',
        'settings',
        'extension',
        'creator',
        'editor',
        'subtitle',
        'mobile',
        'donation'
    ]);

    function isAllowedPage(pageId) {
        return PAGES.includes(pageId);
    }

    return Object.freeze({
        PAGES,
        isAllowedPage
    });
});
