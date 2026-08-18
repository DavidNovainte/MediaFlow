/** @jest-environment jsdom */

describe('EditorMediaImporter', () => {
    beforeAll(() => {
        require('../../../src/features/editor/import/EditorMediaImporter');
    });

    beforeEach(() => {
        window.urlUtils = {
            getMediaSrc: jest.fn((file) => file?.path || '')
        };
        this.importer = new window.EditorMediaImporter({});
    });

    it('treats local flac paths as audio assets', () => {
        const [asset] = this.importer.importLocalPath('C:/music/voice-track.flac');

        expect(asset.kind).toBe('audio');
        expect(asset.path).toBe('C:/music/voice-track.flac');
    });

    it('treats local opus paths as audio assets', () => {
        const [asset] = this.importer.importLocalPath('C:/music/voice-track.opus');

        expect(asset.kind).toBe('audio');
    });

    it('uses a localized fallback name when imported media has no display name', () => {
        const asset = this.importer.normalizeFile({ name: '', path: '', type: 'video/mp4' });

        expect(asset.name).toBe('未命名素材');
    });
});
