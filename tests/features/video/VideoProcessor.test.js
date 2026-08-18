/** @jest-environment jsdom */

describe('VideoProcessor', () => {
    let mockCore;

    beforeAll(() => {
        window.app = {
            showToast: jest.fn()
        };
        window.i18n = { t: jest.fn((key) => key) };
        window.ErrorUtils = { formatError: jest.fn((error) => error.message) };
        window.mediaflow = {
            video: { onMergeProgress: jest.fn(), onCompressProgress: jest.fn(() => jest.fn()), cancel: jest.fn() },
            creator: {
                onProgress: jest.fn(),
                export: jest.fn().mockResolvedValue({ success: true }),
                cancel: jest.fn()
            },
            file: { deleteFile: jest.fn() },
            fs: { stat: jest.fn() },
            shell: { fileExists: jest.fn().mockResolvedValue(false) },
            path: { join: jest.fn((...parts) => parts.join('/')) },
            dialog: { openFile: jest.fn() }
        };

        require('../../../src/features/video/export/CreatorSubtitleExportAdapter');
        require('../../../src/features/video/export/CreatorExportCapabilityMatrix');
        require('../../../src/features/video/export/TimelineProjectSnapshot');
        require('../../../src/features/video/export/CreatorExportPlanner');
        require('../../../src/features/video/VideoService');
        require('../../../src/features/video/VideoUIManager');
        require('../../../src/features/video/VideoProcessor');

        const mockService = {
            clip: jest.fn().mockResolvedValue({ success: true }),
            makeVertical: jest.fn().mockResolvedValue({ success: true }),
            compress: jest.fn().mockResolvedValue({ success: true }),
            convert: jest.fn().mockResolvedValue({ success: true }),
            watermark: jest.fn().mockResolvedValue({ success: true }),
            multiClip: jest.fn().mockResolvedValue({ success: true })
        };

        const mockUIManager = {
            init: jest.fn(),
            showProgress: jest.fn(),
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            showSuccess: jest.fn(),
            showToast: jest.fn(),
            showErrorDetails: jest.fn(),
            saveCurrentSettings: jest.fn(),
            askSavePath: jest.fn().mockResolvedValue('/save/path.mp4'),
            getUIOptions: jest.fn().mockReturnValue({}),
            showFpsMismatchDialog: jest.fn()
        };

        window.VideoService = jest.fn(() => mockService);
        window.VideoUIManager = jest.fn(() => mockUIManager);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        window.getClipSegments = undefined;
        window.mediaflow.dialog.openFile.mockResolvedValue('/assets/logo.png');

        mockCore = {
            videoFile: { name: 'test.mp4', path: '/path/to/test.mp4' },
            isProcessing: false,
            isAudioOnly: false,
            updateProgress: jest.fn(),
            hideProgress: jest.fn(),
            parseTime: jest.fn()
        };
    });

    it('calls makeVertical through the existing service path', async () => {
        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.makeVertical();

        expect(processor.ui.showProgress).toHaveBeenCalled();
        expect(processor.service.makeVertical).toHaveBeenCalled();
        expect(processor.ui.showSuccess).toHaveBeenCalledWith('creator.video.toastVerticalDone', '/save/path.mp4');
    });

    it('clips a selected range through smartClip', async () => {
        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        processor.ui.getUIOptions.mockReturnValue({ startTime: 0, endTime: 10, format: 'mp4' });

        await processor.smartClip();

        expect(processor.service.clip).toHaveBeenCalledWith(
            '/path/to/test.mp4',
            '/save/path.mp4',
            0,
            10
        );
    });

    it('merges provided clip segments without reading stale global range state', async () => {
        const segments = [
            { start: 1, end: 3, name: 'intro' },
            { start: 8, end: 12, name: 'outro' }
        ];
        window.getClipSegments = jest.fn(() => [
            { start: 99, end: 100, name: 'stale-global-segment' }
        ]);

        const processor = new window.VideoProcessor(mockCore);
        processor.init();
        processor.ui.getUIOptions.mockReturnValue({});

        await processor.smartClip({
            merge: true,
            format: 'mp4',
            savePath: '/save/merged.mp4',
            segments
        });

        expect(window.getClipSegments).not.toHaveBeenCalled();
        expect(processor.service.multiClip).toHaveBeenCalledWith(
            '/path/to/test.mp4',
            '/save/merged.mp4',
            segments
        );
    });

    it('hides progress when multi-clip merge fails', async () => {
        const segments = [{ start: 1, end: 3, name: 'intro' }];
        const processor = new window.VideoProcessor(mockCore);
        processor.init();
        processor.ui.getUIOptions.mockReturnValue({});
        processor.service.multiClip.mockRejectedValueOnce(new Error('merge failed'));

        await expect(processor.smartClip({
            merge: true,
            format: 'mp4',
            savePath: '/save/merged.mp4',
            segments
        })).rejects.toThrow('merge failed');

        expect(processor.ui.hideProgress).toHaveBeenCalled();
        expect(processor.ui.showToast).toHaveBeenCalledWith(expect.stringContaining('merge failed'), 'error');
    });

    it('shows compression savings using the supported fs stat API', async () => {
        window.mediaflow.fs.stat
            .mockResolvedValueOnce({ success: true, size: 500 })
            .mockResolvedValueOnce({ success: true, size: 1000 });

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.compressVideo();

        expect(window.mediaflow.fs.stat).toHaveBeenCalledWith('/save/path.mp4');
        expect(window.mediaflow.fs.stat).toHaveBeenCalledWith('/path/to/test.mp4');
        expect(processor.ui.showSuccess.mock.calls[0][0]).toContain('50%');
    });

    it('adds a text watermark through the video service', async () => {
        document.body.innerHTML = `
            <section id="page-compress">
                <input id="watermark-text" value="Wrong Page" />
            </section>
            <section id="page-creator">
                <label><input type="radio" name="watermark-type" value="text" checked></label>
                <input id="watermark-text" value="MediaFlow" />
            </section>
        `;

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.addWatermark();

        expect(processor.service.watermark).toHaveBeenCalledWith(
            '/path/to/test.mp4',
            '/save/path.mp4',
            'text',
            expect.objectContaining({
                text: 'MediaFlow',
                position: 'bottom-right',
                fontSize: 24,
                fontColor: 'white'
            }),
            expect.any(Object)
        );
        expect(processor.ui.showSuccess).toHaveBeenCalledWith('creator.video.toastWatermarkDone', '/save/path.mp4');
    });

    it('selects an image watermark path when image mode has no stored path', async () => {
        document.body.innerHTML = `
            <label><input type="radio" name="watermark-type" value="image" checked></label>
            <div id="watermark-image-path" data-path=""></div>
        `;

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.addWatermark();

        expect(window.mediaflow.dialog.openFile).toHaveBeenCalledWith(expect.objectContaining({
            properties: ['openFile']
        }));
        expect(processor.service.watermark).toHaveBeenCalledWith(
            '/path/to/test.mp4',
            '/save/path.mp4',
            'image',
            expect.objectContaining({
                imagePath: '/assets/logo.png'
            }),
            expect.any(Object)
        );
        expect(document.getElementById('watermark-image-path').dataset.path).toBe('/assets/logo.png');
        expect(document.getElementById('watermark-image-path').textContent).toBe('logo.png');
    });

    it('exports creator projects through snapshot/planner and creator.export', async () => {
        mockCore.timelineManager = {
            duration: 9,
            tracks: {
                v1: {
                    segments: [
                        {
                            start: 0,
                            end: 5,
                            sourceStart: 12,
                            speed: 1,
                            file: { path: '/path/to/test.mp4' },
                            groupId: 'g1',
                            transition: { id: 'fade', duration: 0.5 }
                        },
                        {
                            start: 5,
                            end: 9,
                            sourceStart: 30,
                            speed: 1,
                            file: { path: '/path/to/other.mp4' },
                            groupId: 'g2'
                        }
                    ]
                },
                a1: {
                    segments: [
                        {
                            start: 0,
                            end: 5,
                            sourceStart: 12,
                            speed: 1,
                            file: { path: '/path/to/test.mp4' },
                            groupId: 'g1'
                        }
                    ]
                }
            }
        };
        mockCore.localizedEditProject = {
            video: { path: '/path/to/test.mp4' },
            displayMode: 'bilingual',
            subtitleTracks: [
                {
                    id: 'sub-main',
                    visible: true,
                    style: { fontColor: '#ff00ff', enableBackground: true },
                    segments: [
                        {
                            id: 'sub-1',
                            start: 12,
                            end: 14,
                            originalText: 'Hello',
                            translatedText: '你好',
                            displayText: 'Hello\n你好'
                        }
                    ]
                }
            ]
        };

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.renderProject({
            format: 'mp4',
            type: 'video+audio',
            savePath: '/save/path.mp4'
        });

        expect(window.mediaflow.creator.export).toHaveBeenCalledTimes(1);
        const job = window.mediaflow.creator.export.mock.calls[0][0];
        expect(job.output.path).toBe('/save/path.mp4');
        expect(job.output.format).toBe('mp4');
        expect(job.primaryVideoClips.map((clip) => clip.assetPath)).toEqual([
            '/path/to/test.mp4',
            '/path/to/other.mp4'
        ]);
        expect(job.primaryVideoClips[0].transition).toEqual({ id: 'fade', duration: 0.5 });
        expect(job.subtitleTracks).toHaveLength(1);
        expect(job.subtitleTracks[0].subtitles[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 2,
            text: 'Hello\n你好'
        }));
        expect(processor.service.clip).not.toHaveBeenCalled();
        expect(processor.service.multiClip).not.toHaveBeenCalled();
    });

    it('shows detailed export errors when creator export fails', async () => {
        mockCore.timelineManager = {
            duration: 4,
            tracks: {
                v1: {
                    segments: [
                        { start: 0, end: 4, sourceStart: 0, speed: 1, file: { path: '/path/to/test.mp4' } }
                    ]
                }
            }
        };

        window.mediaflow.creator.export.mockResolvedValueOnce({
            success: false,
            error: 'Unsupported transition',
            details: 'Planner rejected wipe'
        });

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.renderProject({
            format: 'mp4',
            type: 'video+audio',
            savePath: '/save/path.mp4'
        });

        expect(processor.ui.showErrorDetails).toHaveBeenCalled();
    });

    it('falls back to the legacy export path when creator:export is unavailable', async () => {
        mockCore.timelineManager = {
            tracks: {
                v1: {
                    segments: [
                        { start: 0, end: 4, sourceStart: 10, speed: 1, file: { path: '/path/to/test.mp4' } },
                        { start: 4, end: 8, sourceStart: 20, speed: 1, file: { path: '/path/to/test.mp4' } }
                    ]
                }
            }
        };

        window.mediaflow.creator.export.mockRejectedValueOnce(
            new Error("Error invoking remote method 'creator:export': Error: No handler registered for 'creator:export'")
        );

        const processor = new window.VideoProcessor(mockCore);
        processor.init();

        await processor.renderProject({
            format: 'mp4',
            type: 'video+audio',
            savePath: '/save/path.mp4'
        });

        expect(processor.service.multiClip).toHaveBeenCalledWith(
            '/path/to/test.mp4',
            '/save/path.mp4',
            [
                { start: 10, end: 14, name: undefined },
                { start: 20, end: 24, name: undefined }
            ],
            { accurate: true }
        );
    });
});
