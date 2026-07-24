/** @jest-environment jsdom */

describe('FeatureFlags', () => {
    beforeEach(() => {
        jest.resetModules();
        delete window.FeatureFlags;
    });

    it('exposes community and pro page lists with editor as Pro', () => {
        require('../../src/core/featureFlags.js');
        const flags = window.FeatureFlags;
        const edition = flags.EDITION || 'full';

        expect(flags.isProPage('editor')).toBe(true);
        expect(flags.isProPage('download')).toBe(false);
        expect(flags.FREE_DAILY_DOWNLOAD_LIMIT).toBe(0);
        expect(flags.PRO_PAGES).toEqual(
            expect.arrayContaining(['creator', 'editor', 'subtitle', 'mobile'])
        );
        expect(flags.COMMUNITY_PAGES).toEqual(
            expect.arrayContaining(['download', 'transcribe', 'compress', 'history', 'settings'])
        );

        if (edition === 'community') {
            // Slim Community: no enhance page; enhance is Pro-only (not shipped)
            expect(flags.COMMUNITY_PAGES).not.toEqual(expect.arrayContaining(['enhance']));
            expect(flags.isProPage('enhance')).toBe(true);
            expect(flags.EDITION).toBe('community');
        } else {
            // Full product: enhance is a free-tier *page*; engines still use withPro at IPC
            expect(flags.COMMUNITY_PAGES).toEqual(expect.arrayContaining(['enhance']));
            expect(flags.isProPage('enhance')).toBe(false);
            expect(flags.PRO_PAGES).not.toEqual(expect.arrayContaining(['enhance']));
        }
    });

    it('works via CommonJS require in Node', () => {
        const flags = require('../../src/core/featureFlags.js');
        expect(flags.isProPage('subtitle')).toBe(true);
        expect(flags.isCommunityPage('compress')).toBe(true);
    });
});
