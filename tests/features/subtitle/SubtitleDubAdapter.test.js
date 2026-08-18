/** @jest-environment jsdom */

describe('SubtitleDubAdapter', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/dubbing/SubtitleDubSegmentPlanner.js');
        require('../../../src/features/subtitle/dubbing/SubtitleDubTimingPlanner.js');
        require('../../../src/features/subtitle/dubbing/SubtitleDubGroupPlanner.js');
        require('../../../src/features/subtitle/dubbing/SubtitleDubAdapter.js');
    });

    afterEach(() => {
        delete window.SubtitleDubSegmentPlanner;
        delete window.SubtitleDubTimingPlanner;
        delete window.SubtitleDubGroupPlanner;
        delete window.SubtitleDubAdapter;
    });

    test('compresses translated dubbing text when estimated to overflow the slot', async () => {
        const flow = {
            service: {
                compressTranslation: jest.fn().mockResolvedValue('Short dub line')
            },
            preferenceManager: {
                get: jest.fn(() => null)
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        jest.spyOn(adapter, 'shouldAttemptCompression').mockReturnValue(true);
        jest.spyOn(adapter, 'shouldPreserveMeaning').mockReturnValue(false);
        const subtitles = [{
            id: 1,
            start: 0,
            end: 1.8,
            text: 'This line needs a shorter dub right now.',
            translatedText: 'This line needs a shorter dub right now.',
            ttsSource: 'translated',
            ttsSourceUserSet: true
        }];

        const prepared = await adapter.prepareSubtitlesForTts(subtitles, {
            settings: {
                mode: 'strict',
                autoCompress: true,
                allowSpeedUp: true,
                allowGapBorrow: false
            }
        });

        expect(flow.service.compressTranslation).toHaveBeenCalled();
        expect(prepared[0].dubText).toBe('Short dub line');
        expect(prepared[0].text).toBe('Short dub line');
        expect(prepared[0].targetDuration).toBeGreaterThan(0);
        expect(prepared[0].dubStatus).toBe('compressed');
    });

    test('builds a preview inspector state before TTS generation runs', () => {
        const subtitles = [{
            id: 1,
            start: 0,
            end: 1.1,
            text: 'Do not be fooled by his appearance of enjoyment',
            translatedText: 'Do not be fooled by his appearance of enjoyment',
            ttsSource: 'translated'
        }];

        const flow = {
            editor: {
                activeSubtitleIndex: 0,
                subtitles
            },
            preferenceManager: {
                get: jest.fn((key) => ({
                    dubAdaptationMode: 'strict',
                    dubAutoCompress: true,
                    dubAutoSpeedUp: true,
                    dubAllowGapExtension: true
                })[key])
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        jest.spyOn(adapter, 'shouldPreserveMeaning').mockReturnValue(false);
        const state = adapter.getInspectorState(subtitles[0]);

        expect(state.title).toBe('Compression likely needed');
        expect(state.durationText).not.toBe('Not calculated');
        expect(state.ratioText).not.toBe('--');
        expect(state.sourceText).toContain('Do not be fooled');
        expect(state.dubText).toContain('Do not be fooled');
        expect(state.segmentText).toContain('single dubbed segment');
    });

    test('explains when the current subtitle is still using original speech text', () => {
        const subtitles = [{
            id: 1,
            start: 0,
            end: 1.5,
            text: 'Original Chinese line',
            originalText: 'Original Chinese line',
            translatedText: 'Translated line',
            ttsSource: 'original'
        }];

        const flow = {
            editor: {
                activeSubtitleIndex: 0,
                subtitles
            },
            preferenceManager: {
                get: jest.fn((key) => ({
                    dubAdaptationMode: 'balanced',
                    dubAutoCompress: true,
                    dubAutoSpeedUp: true,
                    dubAllowGapExtension: true
                })[key])
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        const state = adapter.getInspectorState(subtitles[0]);

        expect(state.title).toBe('Using original text for dubbing');
        expect(state.durationText).toBe('Original timing');
        expect(state.dubText).toBe('Original Chinese line');
        expect(state.segmentText).toContain('original text as a single segment');
    });

    test('tracks intra-line speech segments and pause budget for translated dubbing text', async () => {
        const flow = {
            service: {
                compressTranslation: jest.fn().mockResolvedValue('First clause, second clause.')
            },
            preferenceManager: {
                get: jest.fn(() => null)
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        const subtitles = [{
            id: 1,
            start: 0,
            end: 3.2,
            text: 'First clause, second clause.',
            translatedText: 'First clause, second clause.',
            ttsSource: 'translated'
        }];

        const prepared = await adapter.prepareSubtitlesForTts(subtitles, {
            settings: {
                mode: 'balanced',
                autoCompress: true,
                allowSpeedUp: true,
                allowGapBorrow: true
            }
        });

        expect(prepared[0].dubSegments).toHaveLength(2);
        expect(prepared[0].dubSegmentMeta).toEqual(expect.objectContaining({
            segmentCount: 2,
            isSegmented: true
        }));
        expect(prepared[0].dubTiming.pauseDuration).toBeGreaterThan(0);
        expect(prepared[0].dubTiming.speakingDuration).toBeLessThan(prepared[0].dubTiming.availableDuration);

        const state = adapter.getInspectorState(prepared[0]);
        expect(state.segmentText).toContain('2 speech segments');
        expect(state.segmentText).toContain('pause');
    });

    test('does not force aggressive auto speed-up when the line is still far over budget', async () => {
        const flow = {
            service: {
                compressTranslation: jest.fn().mockResolvedValue('still too long to fit naturally into this tiny slot')
            },
            preferenceManager: {
                get: jest.fn(() => null)
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        const prepared = await adapter.prepareSubtitlesForTts([{
            id: 1,
            start: 0,
            end: 0.8,
            text: 'This is a very long translated sentence that should not be forced into a tiny slot with extreme speed-up.',
            translatedText: 'This is a very long translated sentence that should not be forced into a tiny slot with extreme speed-up.',
            ttsSource: 'translated',
            ttsSourceUserSet: true
        }], {
            settings: {
                mode: 'strict',
                autoCompress: true,
                allowSpeedUp: true,
                allowGapBorrow: false
            }
        });

        expect(prepared[0].targetDuration).toBeGreaterThan(prepared[0].dubTiming.availableDuration);
        expect(prepared[0].targetDuration).toBeLessThanOrEqual(prepared[0].dubTiming.availableDuration * adapter.softTargetStretchRatio);
        expect(prepared[0].maxRatePercent).toBe(adapter.severeOverflowRateCapPercent);
        expect(prepared[0].dubStatus).toBe('preserve-meaning');
    });

    test('preserve mode disables compression and speed-up for overlong dubbing lines', async () => {
        const flow = {
            service: {
                compressTranslation: jest.fn().mockResolvedValue('compressed but should not be used')
            },
            preferenceManager: {
                get: jest.fn(() => null)
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        const prepared = await adapter.prepareSubtitlesForTts([{
            id: 1,
            start: 0,
            end: 1.1,
            text: 'Keep every detail in this translated dubbing line even if it becomes longer.',
            translatedText: 'Keep every detail in this translated dubbing line even if it becomes longer.',
            ttsSource: 'translated',
            ttsSourceUserSet: true
        }], {
            settings: {
                mode: 'preserve',
                autoCompress: true,
                allowSpeedUp: true,
                allowGapBorrow: true
            }
        });

        expect(flow.service.compressTranslation).not.toHaveBeenCalled();
        expect(prepared[0].targetDuration).toBeGreaterThan(prepared[0].dubTiming.availableDuration);
        expect(prepared[0].targetDuration).toBeLessThanOrEqual(prepared[0].dubTiming.availableDuration * adapter.softTargetStretchRatio);
        expect(prepared[0].maxRatePercent).toBe(adapter.preserveModeRateCapPercent);
        expect(prepared[0].dubText).toContain('Keep every detail');
        expect(prepared[0].dubStatus).toBe('preserve-meaning');
    });

    test('reallocates pooled timing across adjacent translated subtitles when grouped dubbing helps', async () => {
        const flow = {
            service: {
                compressTranslation: jest.fn().mockResolvedValue('This tiny line should stay short. This second line needs much more shared dubbing time to remain natural.')
            },
            preferenceManager: {
                get: jest.fn(() => null)
            }
        };

        const adapter = new window.SubtitleDubAdapter(flow);
        const prepared = await adapter.prepareSubtitlesForTts([
            {
                id: 1,
                start: 0,
                end: 0.7,
                text: 'Short line.',
                translatedText: 'Short line.',
                ttsSource: 'translated',
                ttsSourceUserSet: true
            },
            {
                id: 2,
                start: 0.82,
                end: 1.52,
                text: 'This second translated sentence is much longer and should receive more pooled dubbing time than the short line before it.',
                translatedText: 'This second translated sentence is much longer and should receive more pooled dubbing time than the short line before it.',
                ttsSource: 'translated',
                ttsSourceUserSet: true
            }
        ], {
            settings: {
                mode: 'strict',
                autoCompress: true,
                allowSpeedUp: true,
                allowGapBorrow: false
            }
        });

        expect(prepared[0].dubTiming.availableDuration).toBeLessThan(prepared[0].dubTiming.originalDuration);
        expect(prepared[1].dubTiming.availableDuration).toBeGreaterThan(prepared[1].dubTiming.originalDuration);
        expect(prepared[0].dubTiming.groupedWindow).toBe(true);
        expect(prepared[1].dubTiming.groupedWindow).toBe(true);
        expect(prepared[0].dubText).toBeTruthy();
        expect(prepared[1].dubText).toBeTruthy();
    });
});