/** @jest-environment jsdom */

describe('SubtitleAIHandler target track routing', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <label><input type="radio" name="subtitle-mode" value="ai" checked></label>
        `;

        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.SubtitleUtils = {
            translateOrFallback: jest.fn((key, fallback) => fallback)
        };
        window.app = {
            showToast: jest.fn(),
            showChoice: jest.fn(),
            showPrompt: jest.fn()
        };
        window.mediaflow = {
            store: {
                get: jest.fn().mockResolvedValue(['demo-key'])
            }
        };
        window.TranslationService = {
            transcribe: jest.fn().mockResolvedValue([
                { id: 'seg-1', start: 0, end: 1.2, text: 'recognized line' }
            ])
        };

        require('../../../src/features/subtitle/SubtitleAIHandler.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.SubtitleUtils;
        delete window.app;
        delete window.mediaflow;
        delete window.TranslationService;
        delete window.SubtitleAIHandler;
    });

    test('writes AI recognition results into the currently active non-audio track', async () => {
        window.app.showChoice.mockResolvedValue('replace');

        const tracks = [
            { id: 'main-track', type: 'main', subtitles: [{ id: 'main-old', text: 'keep me' }] },
            { id: 'track-2', type: 'subtitle', subtitles: [{ id: 'old-2', text: 'replace me' }] }
        ];

        const flow = {
            videoFile: { path: 'demo.mp4', name: 'demo.mp4' },
            tracks,
            activeTrackId: 'track-2',
            translationEngine: { value: 'groq' },
            sourceLanguage: { value: 'auto' },
            targetLanguage: { value: 'none' },
            keepBilingual: { checked: false },
            aiStyleHint: { value: '' },
            lengthOptimize: { checked: false },
            qualityHandler: null,
            trackManager: {
                activeTrackId: 'track-2',
                tracks,
                renderTracks: jest.fn(),
                setActiveTrack: jest.fn()
            },
            service: {
                resolveSegmentTranslations: jest.fn()
            },
            batchHandler: {
                updateFileSubtitles: jest.fn()
            },
            showProgress: jest.fn(),
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            isProcessing: false
        };

        const handler = new window.SubtitleAIHandler(flow);
        await handler.runAIProcess();

        expect(tracks[0].subtitles).toEqual([{ id: 'main-old', text: 'keep me' }]);
        expect(tracks[1].subtitles).toEqual([
            expect.objectContaining({
                id: 'seg-1',
                originalText: 'recognized line',
                text: 'recognized line'
            })
        ]);
        expect(flow.trackManager.setActiveTrack).toHaveBeenCalledWith('track-2');
    });

    test('appends AI recognition results when the user keeps existing subtitles', async () => {
        window.app.showChoice.mockResolvedValue('append');

        const tracks = [
            { id: 'main-track', type: 'main', subtitles: [] },
            { id: 'track-2', type: 'subtitle', subtitles: [{ id: 'old-2', start: 2, end: 3, text: 'existing line', originalText: 'existing line', translatedText: '' }] }
        ];

        const flow = {
            videoFile: { path: 'demo.mp4', name: 'demo.mp4' },
            tracks,
            activeTrackId: 'track-2',
            translationEngine: { value: 'groq' },
            sourceLanguage: { value: 'auto' },
            targetLanguage: { value: 'none' },
            keepBilingual: { checked: false },
            aiStyleHint: { value: '' },
            lengthOptimize: { checked: false },
            qualityHandler: null,
            trackManager: {
                activeTrackId: 'track-2',
                tracks,
                renderTracks: jest.fn(),
                setActiveTrack: jest.fn()
            },
            service: {
                resolveSegmentTranslations: jest.fn()
            },
            batchHandler: {
                updateFileSubtitles: jest.fn()
            },
            showProgress: jest.fn(),
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            isProcessing: false
        };

        const handler = new window.SubtitleAIHandler(flow);
        await handler.runAIProcess();

        expect(tracks[1].subtitles).toHaveLength(2);
        expect(tracks[1].subtitles[0]).toEqual(expect.objectContaining({ id: 'seg-1' }));
        expect(tracks[1].subtitles[1]).toEqual(expect.objectContaining({ id: 'old-2' }));
        expect(flow.batchHandler.updateFileSubtitles).toHaveBeenCalledWith('demo.mp4', tracks[1].subtitles);
    });

    test('falls back to the main track when the active track is audio', async () => {
        const tracks = [
            { id: 'main-track', type: 'main', subtitles: [] },
            { id: 'audio-track', type: 'audio', subtitles: [] }
        ];

        const flow = {
            videoFile: { path: 'demo.mp4', name: 'demo.mp4' },
            tracks,
            activeTrackId: 'audio-track',
            translationEngine: { value: 'groq' },
            sourceLanguage: { value: 'auto' },
            targetLanguage: { value: 'none' },
            keepBilingual: { checked: false },
            aiStyleHint: { value: '' },
            lengthOptimize: { checked: false },
            qualityHandler: null,
            trackManager: {
                activeTrackId: 'audio-track',
                tracks,
                renderTracks: jest.fn(),
                setActiveTrack: jest.fn()
            },
            service: {
                resolveSegmentTranslations: jest.fn()
            },
            batchHandler: null,
            showProgress: jest.fn(),
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            isProcessing: false
        };

        const handler = new window.SubtitleAIHandler(flow);
        await handler.runAIProcess();

        expect(tracks[0].subtitles).toHaveLength(1);
        expect(flow.trackManager.setActiveTrack).toHaveBeenCalledWith('main-track');
    });

    test('rejects off-topic compression results and falls back to the original subtitle', async () => {
        window.mediaflow.translation = {
            translate: jest.fn().mockResolvedValue({
                success: true,
                translation: 'It seems like you\'re asking for information on how to compress English text. Here are some methods...'
            })
        };

        const handler = new window.SubtitleAIHandler({
            translationEngine: { value: 'groq' }
        });

        const result = await handler.compressSubtitle(
            'The two-legged creatures will bring them food.',
            24,
            false
        );

        expect(result).toBe('The two-legged creatures will bring them food.');
    });
});