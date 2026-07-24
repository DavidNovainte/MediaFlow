/**
 * featureFlags.js — Community edition overlay
 * Free surface: single download, history, transcribe, image compress, settings.
 * (upgrade page kept for Pro CTA only)
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
    const COMMUNITY_PAGES = Object.freeze([
        'download',
        'history',
        'transcribe',
        'compress',
        'settings',
        'upgrade'
    ]);

    // Not shipped in Community source / nav (full product only)
    const PRO_PAGES = Object.freeze([
        'enhance',
        'creator',
        'editor',
        'subtitle',
        'mobile',
        'extension'
    ]);

    const FREE_DAILY_DOWNLOAD_LIMIT = 0;
    const PRO_PRODUCT_URL = 'https://mediaflowing.com/';

    function isProPage(pageId) {
        return PRO_PAGES.includes(pageId);
    }

    function isCommunityPage(pageId) {
        return COMMUNITY_PAGES.includes(pageId);
    }

    return Object.freeze({
        COMMUNITY_PAGES,
        PRO_PAGES,
        FREE_DAILY_DOWNLOAD_LIMIT,
        PRO_PRODUCT_URL,
        isProPage,
        isCommunityPage,
        EDITION: 'community'
    });
});
