/** @jest-environment jsdom */

describe('SubtitleExportHandler', () => {
    let mockFlow;

    beforeAll(() => {
        require('../../../src/features/subtitle/SubtitleExportHandler');

        window.app = {
            getPath: jest.fn().mockReturnValue('/mock/path'),
            showToast: jest.fn()
        };
        window.i18n = { t: jest.fn(key => key) };
        window.ErrorUtils = { formatError: jest.fn(e => e.message) };

        window.mediaflow = {
            subtitle: {
                burn: jest.fn().mockResolvedValue({ success: true }),
                cancel: jest.fn().mockResolvedValue(true),
                onBurnProgress: jest.fn().mockReturnValue(() => {})
            },
            system: { syncSubtitleCache: jest.fn() },
            path: { join: jest.fn((...args) => args.join('/')) },
            dialog: { selectFolder: jest.fn().mockResolvedValue('/selected') }
        };

        Object.defineProperty(document, 'getElementById', {
            value: jest.fn().mockReturnValue({ value: '' })
        });
        Object.defineProperty(document, 'querySelector', {
            value: jest.fn().mockReturnValue({ value: '' })
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockFlow = {
            isProcessing: false,
            videoFile: { name: 'test.mp4', path: '/path/to/test.mp4', duration: 100 },
            tracks: [
                { id: 1, type: 'main', subtitles: [{ text: 'Hello' }], style: {} }
            ],
            outputPath: { value: '' },
            preferences: {},
            showProgress: jest.fn(),
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            video: { videoWidth: 1280, videoHeight: 720 },
            parseTime: jest.fn(() => 0)
        };
    });

    it('does not start again while processing', async () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        mockFlow.isProcessing = true;
        await handler.startBurnProcess();
        expect(mockFlow.showProgress).not.toHaveBeenCalled();
    });

    it('shows a warning when no video is selected', async () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        mockFlow.videoFile = null;
        await handler.startBurnProcess();
        expect(window.app.showToast).toHaveBeenCalledWith('subtitle.messages.noFile', 'warning');
    });

    it('invokes burn IPC with the current video path', async () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        mockFlow.outputPath.value = '/output';
        // Pre-burn gate: valid timings + approved review so confirm is not required
        mockFlow.tracks = [
            {
                id: 1,
                type: 'main',
                subtitles: [{ text: 'Hello', start: 0, end: 1, reviewStatus: 'approved' }],
                style: {}
            }
        ];
        window.app.showConfirm = jest.fn().mockResolvedValue(true);
        window.confirm = jest.fn(() => true);
        await handler.startBurnProcess();

        expect(window.mediaflow.subtitle.burn).toHaveBeenCalledWith(expect.objectContaining({
            videoPath: '/path/to/test.mp4'
        }));
    });

    it('strips oversized subtitle fields before invoking burn IPC', () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        const tracks = [
            {
                id: 'track-1',
                type: 'main',
                style: { enableKaraoke: false },
                subtitles: [
                    {
                        id: 'sub-1',
                        start: '1.25',
                        end: '2.75',
                        text: '原文',
                        originalText: '原文',
                        translatedText: 'Translated',
                        words: [{ text: '原', start: 1.25, end: 1.5 }],
                        waveform: new Array(1000).fill(1),
                        giantDebugBlob: 'x'.repeat(2000)
                    }
                ]
            }
        ];

        const result = handler.buildExportTracksData(tracks, {
            showOriginal: false,
            showTranslation: true
        });

        expect(result).toEqual([
            {
                id: 'track-1',
                type: 'main',
                style: { enableKaraoke: false },
                subtitles: [
                    {
                        id: 'sub-1',
                        start: 1.25,
                        end: 2.75,
                        text: 'Translated',
                        karaokeText: 'Translated',
                        karaokeSecondaryText: '',
                        words: []
                    }
                ]
            }
        ]);
        expect(result[0].subtitles[0].waveform).toBeUndefined();
        expect(result[0].subtitles[0].giantDebugBlob).toBeUndefined();
    });

    it('remaps subtitle and dubbing clips into the kept source segments', () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        const tracks = [
            {
                id: 'main-track',
                type: 'main',
                style: {},
                subtitles: [
                    { id: 'sub-1', start: 2, end: 4, text: 'A' },
                    { id: 'sub-2', start: 8, end: 10, text: 'B' }
                ]
            },
            {
                id: 'audio-track',
                type: 'audio',
                style: null,
                subtitles: [
                    { id: 'audio-1', start: 4, end: 8, text: 'Dub', audioStartOffset: 1, audioEndOffset: 5 }
                ]
            }
        ];

        const remapped = handler.remapTracksToSourceSegments(tracks, [
            { start: 0, end: 5 },
            { start: 7, end: 10 }
        ]);

        expect(remapped).toHaveLength(2);
        expect(remapped[0].subtitles.map((sub) => ({ start: sub.start, end: sub.end }))).toEqual([
            { start: 2, end: 4 },
            { start: 6, end: 8 }
        ]);
        expect(remapped[1].subtitles.map((sub) => ({
            start: sub.start,
            end: sub.end,
            audioStartOffset: sub.audioStartOffset,
            audioEndOffset: sub.audioEndOffset
        }))).toEqual([
            { start: 4, end: 5, audioStartOffset: 1, audioEndOffset: 2 },
            { start: 5, end: 6, audioStartOffset: 4, audioEndOffset: 5 }
        ]);
    });

    it('marks cancel as pending without hiding progress early', async () => {
        const handler = new window.SubtitleExportHandler(mockFlow);
        mockFlow.isProcessing = true;

        let resolveCancel;
        window.mediaflow.subtitle.cancel.mockReturnValueOnce(new Promise((resolve) => {
            resolveCancel = resolve;
        }));

        const cancelPromise = handler.cancelProcess();
        expect(window.mediaflow.subtitle.cancel).toHaveBeenCalledTimes(1);
        expect(mockFlow.hideProgress).not.toHaveBeenCalled();

        resolveCancel(true);
        await cancelPromise;

        expect(mockFlow.updateProgress).toHaveBeenCalled();
        expect(mockFlow.hideProgress).not.toHaveBeenCalled();
        expect(mockFlow.isProcessing).toBe(true);
    });
});
