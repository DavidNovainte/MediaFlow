/**
 * featureLoader.js — Community stub
 * Full product lazy-loads enhance/editor/subtitle/creator; Community has no such pages.
 */
(function (root) {
    async function unavailable(name) {
        throw new Error(`[FeatureLoader] ${name} is not available in MediaFlow Community`);
    }

    root.FeatureLoader = {
        ENHANCE_SCRIPTS: Object.freeze([]),
        EDITOR_SCRIPTS: Object.freeze([]),
        SUBTITLE_SCRIPTS: Object.freeze([]),
        CREATOR_SCRIPTS: Object.freeze([]),
        ensureEnhance: () => unavailable('Enhance'),
        ensureEditor: () => unavailable('Editor'),
        ensureSubtitle: () => unavailable('Subtitle'),
        ensureCreator: () => unavailable('Creator')
    };
})(typeof window !== 'undefined' ? window : globalThis);
