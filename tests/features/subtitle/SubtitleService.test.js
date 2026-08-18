/** @jest-environment jsdom */

describe('SubtitleService translation memory', () => {
    beforeEach(() => {
        jest.resetModules();

        window.TranslationService = {
            translateSubtitles: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleService.js');
    });

    afterEach(() => {
        delete window.TranslationService;
        delete window.SubtitleService;
    });

    test('retranslate reuses exact translation memory hits before calling AI', async () => {
        const flow = {
            trackManager: {
                tracks: [{
                    type: 'main',
                    subtitles: [{
                        originalText: 'Hello there',
                        translatedText: '你好呀',
                        reviewStatus: 'approved',
                        locked: true,
                        translationTargetLang: 'zh-Hans'
                    }]
                }]
            },
            preferenceManager: {
                get: jest.fn(() => null)
            },
            aiHandler: {
                retranslateSubtitle: jest.fn()
            }
        };

        const service = new window.SubtitleService(flow);
        const result = await service.retranslate('Hello there', 'zh-Hans');

        expect(result).toBe('你好呀');
        expect(flow.aiHandler.retranslateSubtitle).not.toHaveBeenCalled();
    });

    test('resolveSegmentTranslations only sends untranslated misses to AI', async () => {
        window.TranslationService.translateSubtitles.mockResolvedValue([
            {
                originalText: 'Goodbye',
                translatedText: '再见',
                text: '再见'
            }
        ]);

        const flow = {
            trackManager: {
                tracks: [{
                    type: 'main',
                    subtitles: [{
                        originalText: 'Hello there',
                        translatedText: '你好呀',
                        reviewStatus: 'approved',
                        locked: false,
                        translationTargetLang: 'zh-Hans'
                    }]
                }]
            },
            preferenceManager: {
                get: jest.fn(() => null)
            },
            aiHandler: {
                retranslateSubtitle: jest.fn()
            }
        };

        const service = new window.SubtitleService(flow);
        const resolution = await service.resolveSegmentTranslations([
            { originalText: 'Hello there', text: 'Hello there' },
            { originalText: 'Goodbye', text: 'Goodbye' }
        ], 'zh-Hans', { provider: 'groq' });

        expect(window.TranslationService.translateSubtitles).toHaveBeenCalledWith(
            [{ originalText: 'Goodbye', text: 'Goodbye', translatedText: '' }],
            'zh-Hans',
            expect.objectContaining({ provider: 'groq' })
        );
        expect(resolution.memoryHits).toBe(1);
        expect(resolution.segments[0].translatedText).toBe('你好呀');
        expect(resolution.segments[0].translationSource).toBe('memory');
        expect(resolution.segments[1].translatedText).toBe('再见');
        expect(resolution.segments[1].translationSource).toBe('ai');
    });

    test('resolveSegmentTranslations applies exact fixed translations before memory and AI', async () => {
        const flow = {
            trackManager: {
                tracks: []
            },
            preferenceManager: {
                get: jest.fn((key) => {
                    if (key === 'fixedTranslationsEnabled') return true;
                    if (key === 'fixedTranslations') {
                        return [{ source: '大哥', target: 'Big brother' }];
                    }
                    return null;
                })
            },
            aiStyleHint: { value: '口语化，简洁一点' },
            aiHandler: {
                retranslateSubtitle: jest.fn()
            }
        };

        const service = new window.SubtitleService(flow);
        const resolution = await service.resolveSegmentTranslations([
            { originalText: '大哥', text: '大哥' }
        ], 'en', { provider: 'groq' });

        expect(window.TranslationService.translateSubtitles).not.toHaveBeenCalled();
        expect(resolution.fixedTranslationHits).toBe(1);
        expect(resolution.segments[0].translatedText).toBe('Big brother');
        expect(resolution.segments[0].translationSource).toBe('fixed');
    });
});