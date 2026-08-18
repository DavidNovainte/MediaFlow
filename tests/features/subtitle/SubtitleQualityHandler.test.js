/** @jest-environment jsdom */

describe('SubtitleQualityHandler review queue helpers', () => {
    beforeEach(() => {
        jest.resetModules();

        HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
            measureText: jest.fn(() => ({ width: 80 }))
        }));

        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.app = {
            showToast: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleQualityHandler.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.app;
        delete window.SubtitleQualityHandler;
    });

    test('fixShort does not modify locked subtitles', () => {
        const subtitles = [
            { start: 0, end: 0.5, text: 'short', locked: true }
        ];
        const editor = {
            subtitles,
            addToHistory: jest.fn(),
            render: jest.fn(),
            setActive: jest.fn(),
            isSubtitleLocked: jest.fn(() => true),
            flow: {
                updateSubtitlePreview: jest.fn(),
                maxChars: { value: '30' },
                maxLines: { value: '2' },
                styleManager: { currentStyle: {} }
            }
        };

        const handler = new window.SubtitleQualityHandler(editor);
        expect(handler.fixShort(0)).toBe(false);
        expect(subtitles[0].end).toBe(0.5);
    });

    test('exposes error queue metadata including locked state', () => {
        const subtitles = [
            { start: 0, end: 0.3, text: 'first subtitle', locked: false },
            { start: 0.2, end: 1.0, text: 'second subtitle', locked: true }
        ];
        const editor = {
            subtitles,
            addToHistory: jest.fn(),
            render: jest.fn(),
            setActive: jest.fn(),
            isSubtitleLocked: jest.fn((index) => !!subtitles[index]?.locked),
            flow: {
                updateSubtitlePreview: jest.fn(),
                maxChars: { value: '200' },
                maxLines: { value: '2' },
                styleManager: { currentStyle: {} }
            }
        };

        const handler = new window.SubtitleQualityHandler(editor);
        const errors = handler.runQC();
        const errorSet = handler.getErrorIndexSet();
        const entries = handler.getErrorEntries();

        expect(errors.length).toBeGreaterThan(0);
        expect(errorSet.has(0)).toBe(true);
        expect(errorSet.has(1)).toBe(true);
        expect(entries.some((entry) => entry.index === 1 && entry.locked === true)).toBe(true);
        expect(handler.focusError(0)).toBe(entries[0].index);
        expect(editor.setActive).toHaveBeenCalled();
    });
});