/** @jest-environment jsdom */

describe('SubtitleBatchHandler batch summary', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <label><input type="radio" name="input-mode" value="single"></label>
            <label><input type="radio" name="input-mode" value="batch" checked></label>
            <div id="batch-info-panel" style="display:none"></div>
            <span id="batch-count-value"></span>
            <div id="batch-status-summary"></div>
            <div id="batch-file-list"></div>
        `;

        window.SubtitleUtils = {
            translateOrFallback: jest.fn((key, fallback, params) => {
                if (params?.count !== undefined) {
                    return fallback.replace('{count}', params.count);
                }
                return fallback;
            })
        };
        window.i18n = {
            t: jest.fn((key, params) => {
                if (key === 'subtitle.batch.queue_label') {
                    return `Queue (${params?.count ?? 0})`;
                }
                if (key === 'subtitle.batch.apply_all') return 'Apply to All';
                if (key === 'subtitle.batch.apply_all_tip') return 'Apply current subtitle list to all videos';
                if (key === 'subtitle.batch.summary_pending') return `Pending: ${params?.count ?? 0}`;
                if (key === 'subtitle.batch.summary_processing') return `Processing: ${params?.count ?? 0}`;
                if (key === 'subtitle.batch.summary_success') return `Done: ${params?.count ?? 0}`;
                if (key === 'subtitle.batch.summary_error') return `Failed: ${params?.count ?? 0}`;
                return key;
            })
        };
        window.mediaflow = {
            store: {
                get: jest.fn().mockResolvedValue(null)
            },
            subtitle: {
                getVideoInfo: jest.fn(),
                burn: jest.fn().mockResolvedValue(undefined)
            }
        };
        window.TranslationService = {
            transcribe: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleBatchHandler.js');
    });

    afterEach(() => {
        delete window.SubtitleUtils;
        delete window.i18n;
        delete window.mediaflow;
        delete window.TranslationService;
        delete window.SubtitleBatchHandler;
    });

    test('renders batch summary counts when batch files exist', () => {
        const handler = new window.SubtitleBatchHandler({
            videoFile: null,
            loadVideo: jest.fn(),
            trackManager: { tracks: [] }
        });

        handler.batchFiles = [
            { name: 'a.mp4', path: 'a.mp4', status: 'pending' },
            { name: 'b.mp4', path: 'b.mp4', status: 'processing' },
            { name: 'c.mp4', path: 'c.mp4', status: 'success' },
            { name: 'd.mp4', path: 'd.mp4', status: 'error' }
        ];

        handler.renderBatchList();

        expect(document.getElementById('batch-info-panel').style.display).toBe('grid');
        expect(document.getElementById('batch-count-value').textContent).toBe('4');
        expect(document.getElementById('batch-status-summary').textContent).toContain('Pending: 1');
        expect(document.getElementById('batch-status-summary').textContent).toContain('Processing: 1');
        expect(document.getElementById('batch-status-summary').textContent).toContain('Done: 1');
        expect(document.getElementById('batch-status-summary').textContent).toContain('Failed: 1');
    });

    test('uses cached multi-track state during batch burn', async () => {
        const flow = {
            videoFile: null,
            loadVideo: jest.fn(),
            trackManager: { tracks: [] },
            tracks: [{ id: 'live-main', type: 'main', style: { fontSize: 32 } }],
            currentStyle: { fontSize: 28 },
            styleManager: { currentStyle: {}, blurOriginal: { checked: false } },
            enableTTS: { checked: false }
        };
        const handler = new window.SubtitleBatchHandler(flow);
        const file = {
            name: 'demo.mp4',
            path: 'demo.mp4',
            width: 1280,
            height: 720,
            duration: 12,
            cachedTrackState: {
                activeTrackId: 'secondary',
                tracks: [
                    {
                        id: 'main',
                        type: 'main',
                        style: { fontSize: 32 },
                        subtitles: [{ id: 'a', text: 'main', start: '0', end: '1.2' }]
                    },
                    {
                        id: 'secondary',
                        type: 'subtitle',
                        style: { fontSize: 24 },
                        subtitles: [{ id: 'b', text: 'secondary', start: '1.5', end: '2.3' }]
                    }
                ]
            },
            cachedSubtitles: [{ id: 'a', text: 'main', start: '0', end: '1.2' }]
        };

        await handler.processSingleFileBatch(file, 'C:\\out', jest.fn(), 'burn');

        expect(window.mediaflow.subtitle.burn).toHaveBeenCalledWith(expect.objectContaining({
            videoPath: 'demo.mp4',
            tracks: [
                expect.objectContaining({
                    id: 'main',
                    type: 'main',
                    subtitles: [{ id: 'a', text: 'main', start: 0, end: 1.2 }]
                }),
                expect.objectContaining({
                    id: 'secondary',
                    type: 'subtitle',
                    subtitles: [{ id: 'b', text: 'secondary', start: 1.5, end: 2.3 }]
                })
            ]
        }));
    });

    test('routes batch translation through subtitle translation memory resolution', async () => {
        const recognizedSegments = [
            { start: 0, end: 1.2, text: 'Hello there', originalText: 'Hello there' }
        ];
        const translatedSegments = [
            { start: 0, end: 1.2, text: '你好呀', originalText: 'Hello there', translatedText: '你好呀', translationTargetLang: 'zh-Hans' }
        ];

        window.TranslationService.transcribe.mockResolvedValue(recognizedSegments);

        const flow = {
            videoFile: null,
            loadVideo: jest.fn(),
            trackManager: { tracks: [] },
            tracks: [],
            currentStyle: { fontSize: 28 },
            styleManager: { currentStyle: {}, blurOriginal: { checked: false } },
            enableTTS: { checked: false },
            translationEngine: { value: 'groq' },
            sourceLanguage: { value: 'en' },
            aiStyleHint: { value: '' },
            targetLanguage: { value: 'zh-Hans' },
            keepBilingual: { checked: false },
            service: {
                resolveSegmentTranslations: jest.fn().mockResolvedValue({
                    memoryHits: 1,
                    segments: translatedSegments
                })
            }
        };

        const handler = new window.SubtitleBatchHandler(flow);
        handler.updateFileSubtitles = jest.fn();
        handler.getFileTrackState = jest.fn().mockReturnValue(null);

        const file = {
            name: 'demo.mp4',
            path: 'demo.mp4'
        };

        await handler.processSingleFileBatch(file, 'C:\\out', jest.fn(), 'recognize');

        expect(window.TranslationService.transcribe).toHaveBeenCalled();
        expect(flow.service.resolveSegmentTranslations).toHaveBeenCalledWith(
            recognizedSegments,
            'zh-Hans',
            expect.objectContaining({ provider: 'groq' })
        );
        expect(handler.updateFileSubtitles).toHaveBeenCalledWith('demo.mp4', translatedSegments);
    });
});