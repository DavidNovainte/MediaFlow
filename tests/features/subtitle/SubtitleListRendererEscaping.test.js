/** @jest-environment jsdom */

describe('SubtitleListRenderer text escaping', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.SubtitleUtils = {
            formatTime: jest.fn((time) => String(time)),
            getCPS: jest.fn(() => 12),
            getCPSLimit: jest.fn(() => 20),
            parseTime: jest.fn(() => 0)
        };

        require('../../../src/features/subtitle/SubtitleListRenderer.js');
    });

    afterEach(() => {
        delete window.SubtitleListRenderer;
        delete window.SubtitleUtils;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    test('keeps subtitle text inside textareas even when it contains closing tags', () => {
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: {
                    getErrorsByIndex: jest.fn(() => [{
                        type: 'overflow',
                        message: 'too long <img src=x onerror=alert(1)>'
                    }])
                }
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            setActive: jest.fn(),
            updateSubtitleText: jest.fn(),
            addToHistory: jest.fn()
        };
        const renderer = new window.SubtitleListRenderer(editor);
        const original = 'hello </textarea><img src=x onerror=alert(1)>';
        const translated = 'translated </textarea><svg onload=alert(1)>';

        const element = renderer.createSubtitleElement({
            id: 's1',
            start: 0,
            end: 2,
            originalText: original,
            translatedText: translated
        }, 0);

        expect(element.querySelectorAll('textarea')).toHaveLength(2);
        expect(element.querySelector('.original-text').value).toBe(original);
        expect(element.querySelector('.translated-text').value).toBe(translated);
        expect(element.querySelector('img')).toBeNull();
        expect(element.querySelector('svg')).toBeNull();
        expect(element.querySelector('.qc-tag').textContent).toContain('too long <img src=x');
    });
});
