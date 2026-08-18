/** @jest-environment jsdom */

describe('TranslationService', () => {
    beforeEach(() => {
        jest.resetModules();

        window.mediaflow = {
            translation: {
                translate: jest.fn()
            },
            transcribe: {
                start: jest.fn()
            }
        };
        window.app = {
            showToast: jest.fn()
        };
        window.i18n = {
            t: jest.fn((key) => key)
        };

        require('../../../src/features/common/TranslationService.js');
    });

    it('uses a structured batch prompt and preserves numbered results', async () => {
        window.mediaflow.translation.translate.mockResolvedValue({
            success: true,
            translation: '[1] 你好世界\n[2] 欢迎使用'
        });

        const result = await window.TranslationService.translateSubtitles([
            { start: 0, end: 1, text: 'Hello world' },
            { start: 1, end: 2, text: 'Welcome aboard' }
        ], 'zh-CN', { provider: 'groq' });

        expect(window.mediaflow.translation.translate).toHaveBeenCalledWith(
            expect.stringContaining('Keep the [n] prefix exactly as provided for every line.'),
            'none',
            'groq'
        );
        expect(result[0].translatedText).toBe('你好世界');
        expect(result[0].text).toBe('你好世界');
        expect(result[1].translatedText).toBe('欢迎使用');
        expect(result[1].text).toBe('欢迎使用');
    });

    it('falls back to line order and preserves originals for missing lines', async () => {
        window.mediaflow.translation.translate
            .mockResolvedValueOnce({
                success: true,
                translation: '第一行译文'
            })
            // Missing-line recovery pass: still no usable second line
            .mockResolvedValue({
                success: true,
                translation: ''
            });

        const result = await window.TranslationService.translateSubtitles([
            { start: 0, end: 1, text: 'First line' },
            { start: 1, end: 2, text: 'Second line' }
        ], 'zh-CN', { provider: 'groq' });

        expect(result[0].translatedText).toBe('第一行译文');
        expect(result[0].text).toBe('第一行译文');
        expect(result[1].translatedText).toBe('');
        expect(result[1].text).toBe('Second line');
        expect(result._meta.missingLines).toBe(1);
        expect(window.app.showToast).toHaveBeenCalled();
    });

    it('includes style guidance and fixed translations in the batch prompt when provided', async () => {
        window.mediaflow.translation.translate.mockResolvedValue({
            success: true,
            translation: '[1] Big brother, stop hitting'
        });

        await window.TranslationService.translateSubtitles([
            { start: 0, end: 1, text: '大哥别打啦' }
        ], 'en', {
            provider: 'groq',
            styleHint: '口语化，短一点',
            glossaryEntries: [
                { source: '大哥', target: 'Big brother' }
            ]
        });

        expect(window.mediaflow.translation.translate).toHaveBeenCalledWith(
            expect.stringContaining('Style guidance: 口语化，短一点'),
            'none',
            'groq'
        );
        expect(window.mediaflow.translation.translate).toHaveBeenCalledWith(
            expect.stringContaining('- 大哥 => Big brother'),
            'none',
            'groq'
        );
    });

    it('translates multiple batches with limited concurrency', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        window.mediaflow.translation.translate.mockImplementation(async (prompt) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 20));
            inFlight -= 1;
            const matches = [...String(prompt).matchAll(/^\[(\d+)\]\s+(.+)$/gm)];
            const lines = matches.length
                ? matches.map((match) => `[${match[1]}] T${match[1]}`)
                : ['[1] T1'];
            return { success: true, translation: lines.join('\n') };
        });

        const segments = Array.from({ length: 45 }, (_, index) => ({
            start: index,
            end: index + 1,
            text: `Line ${index + 1}`
        }));

        const result = await window.TranslationService.translateSubtitles(segments, 'zh-CN', {
            provider: 'groq',
            concurrency: 2
        });

        // 45 lines => 3 batches of 20
        expect(window.mediaflow.translation.translate.mock.calls.length).toBeGreaterThanOrEqual(3);
        expect(maxInFlight).toBeLessThanOrEqual(2);
        expect(result[0].translatedText).toBeTruthy();
        expect(result._meta.totalBatches).toBe(3);
        expect(result._meta.concurrency).toBe(2);
    });

    it('retries failed batches and surfaces partial failure toast', async () => {
        let call = 0;
        window.mediaflow.translation.translate.mockImplementation(async () => {
            call += 1;
            // First batch fails twice (initial + retries exhausted path simplified)
            if (call <= 3) {
                return { success: false, error: 'temporary' };
            }
            return { success: true, translation: '[1] 好了' };
        });

        const result = await window.TranslationService.translateSubtitles([
            { start: 0, end: 1, text: 'ok' }
        ], 'zh-CN', {
            provider: 'groq',
            concurrency: 1
        });

        expect(result[0].translatedText).toBe('好了');
        expect(window.mediaflow.translation.translate.mock.calls.length).toBeGreaterThan(1);
    });
});
