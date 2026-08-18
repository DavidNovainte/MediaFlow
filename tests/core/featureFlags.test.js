/** @jest-environment jsdom */

describe('FeatureFlags (fully free / open source)', () => {
    beforeEach(() => {
        jest.resetModules();
        delete window.FeatureFlags;
    });

    it('exposes all pages as allowed', () => {
        require('../../src/core/featureFlags.js');
        const flags = window.FeatureFlags;

        expect(flags.PAGES).toEqual(expect.arrayContaining([
            'download',
            'creator',
            'editor',
            'subtitle',
            'mobile',
            'donation',
            'settings',
            'enhance'
        ]));
        expect(flags.isAllowedPage('editor')).toBe(true);
        expect(flags.isAllowedPage('donation')).toBe(true);
        expect(flags.isAllowedPage('download')).toBe(true);
    });

    it('works via CommonJS require in Node', () => {
        const flags = require('../../src/core/featureFlags.js');
        expect(flags.isAllowedPage('subtitle')).toBe(true);
        expect(flags.isAllowedPage('compress')).toBe(true);
    });
});
