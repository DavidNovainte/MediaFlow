describe('binaries utility', () => {
    afterEach(() => {
        jest.resetModules();
        jest.dontMock('electron');
    });

    test('falls back to development binary paths when electron app is unavailable', () => {
        jest.resetModules();
        jest.doMock('electron', () => ({}));

        const binaries = require('../../src/utils/binaries');

        expect(() => binaries.getFfmpegPath()).not.toThrow();
        expect(binaries.getFfmpegPath()).toContain('bin');
        expect(binaries.getFfprobePath()).toContain('bin');
    });
});
