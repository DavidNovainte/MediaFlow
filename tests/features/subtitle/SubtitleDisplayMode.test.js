/** @jest-environment jsdom */

describe('SubtitleDisplayMode', () => {
    beforeAll(() => {
        require('../../../src/features/subtitle/shared/SubtitleDisplayMode');
    });

    it('maps editor flags to a normalized display mode', () => {
        expect(window.SubtitleDisplayMode.fromEditor({
            showOriginal: false,
            showTranslation: true
        })).toBe('translated');

        expect(window.SubtitleDisplayMode.fromEditor({
            showOriginal: true,
            showTranslation: true
        })).toBe('bilingual');

        expect(window.SubtitleDisplayMode.fromEditor({
            showOriginal: true,
            showTranslation: false
        })).toBe('original');
    });

    it('applies display modes back onto editor flags', () => {
        const editor = {};
        window.SubtitleDisplayMode.applyToEditor(editor, 'translated');
        expect(editor).toEqual(expect.objectContaining({
            showOriginal: false,
            showTranslation: true
        }));

        window.SubtitleDisplayMode.applyToEditor(editor, 'bilingual');
        expect(editor).toEqual(expect.objectContaining({
            showOriginal: true,
            showTranslation: true
        }));
    });
});
