/** @jest-environment jsdom */

describe('SubtitleSearchHandler locked subtitle protection', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/SubtitleSearchHandler.js');
    });

    afterEach(() => {
        delete window.SubtitleSearchHandler;
    });

    test('replaceAll skips locked subtitles', () => {
        const subtitles = [
            { originalText: 'hello world', translatedText: '', locked: true },
            { originalText: 'hello world', translatedText: '', locked: false }
        ];
        const editor = {
            subtitles,
            addToHistory: jest.fn(),
            render: jest.fn(),
            syncSubtitleCompositeText: jest.fn(),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            isSubtitleLocked: jest.fn((index) => !!subtitles[index]?.locked),
            flow: {
                updateSubtitlePreview: jest.fn()
            }
        };

        const handler = new window.SubtitleSearchHandler(editor);
        const count = handler.replaceAll('hello', 'hi', { scope: 'original' });

        expect(count).toBe(1);
        expect(subtitles[0].originalText).toBe('hello world');
        expect(subtitles[1].originalText).toBe('hi world');
    });

    test('replaceCurrent returns false for a locked match', () => {
        const subtitles = [
            { originalText: 'hello world', translatedText: '', locked: true }
        ];
        const editor = {
            subtitles,
            addToHistory: jest.fn(),
            render: jest.fn(),
            syncSubtitleCompositeText: jest.fn(),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            isSubtitleLocked: jest.fn(() => true),
            flow: {
                updateSubtitlePreview: jest.fn()
            }
        };

        const handler = new window.SubtitleSearchHandler(editor);
        handler.search('hello', { scope: 'original' });
        handler.currentIndex = 0;

        expect(handler.replaceCurrent('hello', 'hi', { scope: 'original' })).toBe(false);
        expect(subtitles[0].originalText).toBe('hello world');
    });
});