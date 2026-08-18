const fs = require('fs');

jest.mock('../../../src/utils/binaries', () => ({
    getFfmpegPath: () => 'ffmpeg',
    getFfprobePath: () => 'ffprobe'
}));

jest.mock('../../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    ffmpeg: jest.fn()
}));

const runner = require('../../../src/services/export/CreatorExportRunner');

describe('CreatorExportRunner', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses an isolated temp directory instead of rewriting the output extension', async () => {
        jest.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/mediaflow-export');
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
        jest.spyOn(fs.promises, 'copyFile').mockResolvedValue();
        jest.spyOn(fs.promises, 'rm').mockResolvedValue();

        jest.spyOn(runner, '_resolveProfile').mockResolvedValue({
            width: 1280,
            height: 720,
            fps: 30,
            sampleRate: 48000,
            channels: 2
        });
        jest.spyOn(runner, '_buildPrimaryItems').mockReturnValue([
            { itemType: 'clip', duration: 5, timelineStart: 0, timelineEnd: 5, transition: { id: 'none', duration: 0 } }
        ]);
        jest.spyOn(runner, '_materializePrimaryItems').mockResolvedValue([
            { duration: 5, videoPath: '/tmp/mediaflow-export/001_video.mp4', audioPath: '/tmp/mediaflow-export/001_audio.m4a', transition: { id: 'none', duration: 0 } }
        ]);
        jest.spyOn(runner, '_warmVideoEncoder').mockResolvedValue(['-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
        jest.spyOn(runner, '_composeVideo').mockResolvedValue('/tmp/mediaflow-export/composed_video.mp4');
        jest.spyOn(runner, '_composeOverlayVideos').mockResolvedValue('/tmp/mediaflow-export/composed_video.mp4');
        jest.spyOn(runner, '_renderSubtitleTracks').mockResolvedValue('/tmp/mediaflow-export/composed_video.mp4');
        jest.spyOn(runner, '_composeBaseAudio').mockResolvedValue('/tmp/mediaflow-export/composed_audio.m4a');
        jest.spyOn(runner, '_mixOverlayAudio').mockResolvedValue('/tmp/mediaflow-export/composed_audio.m4a');
        jest.spyOn(runner, '_finalizeOutput').mockResolvedValue('/tmp/mediaflow-export/final_output.mp3');

        const job = {
            jobId: 'job-audio',
            exportKind: 'audio',
            output: { path: '/exports/final.mp3', format: 'mp3', type: 'audio' },
            timelineDuration: 5,
            primaryAudioClips: [
                {
                    assetPath: '/audio.wav',
                    timelineStart: 0,
                    timelineEnd: 5,
                    sourceStart: 0,
                    sourceEnd: 5,
                    speed: 1,
                    transition: { id: 'none', duration: 0 }
                }
            ],
            overlayAudioClips: [],
            subtitleTracks: [],
            stages: [
                { id: 'prepare', weight: 5 },
                { id: 'materialize', weight: 45 },
                { id: 'compose', weight: 35 },
                { id: 'audio', weight: 10 },
                { id: 'finalize', weight: 5 }
            ]
        };

        const result = await runner.run(job);

        expect(result.success).toBe(true);
        expect(fs.promises.copyFile).toHaveBeenCalledWith(
            '/tmp/mediaflow-export/final_output.mp3',
            '/exports/final.mp3'
        );
        expect(runner._finalizeOutput).toHaveBeenCalled();
        expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/mediaflow-export', { recursive: true, force: true });
    });

    test('materializes still image clips as looped video segments', async () => {
        const ffmpegSpy = jest.spyOn(runner, '_runFfmpeg').mockResolvedValue();
        const context = { tempDir: '/tmp/mediaflow-export' };

        const outputPath = await runner._materializeVideoClip(
            context,
            { width: 1280, height: 720, fps: 30 },
            {
                assetKind: 'image',
                assetPath: '/media/cover.png',
                timelineStart: 2,
                timelineEnd: 7,
                sourceStart: 0,
                sourceEnd: 5,
                speed: 1
            },
            '001_video.mp4'
        );

        expect(outputPath.replace(/\\/g, '/')).toBe('/tmp/mediaflow-export/001_video.mp4');
        expect(ffmpegSpy).toHaveBeenCalledWith(context, expect.arrayContaining([
            '-loop',
            '1',
            '-i',
            '/media/cover.png',
            '-t',
            '5',
            '-an'
        ]));
    });

    test('applies editor transform params in the clip video filter chain', () => {
        const filters = runner._buildClipVideoFilterChain({
            scale: 150,
            rotation: 90,
            opacity: 50,
            flipX: true,
            flipY: true,
            x: 100,
            y: -50,
            speed: 2,
            previewStageWidth: 500,
            previewStageHeight: 500
        }, { width: 1000, height: 1000, fps: 24 });

        const chain = filters.join(',');
        expect(chain).toContain('setpts=0.5*PTS');
        expect(chain).toContain('hflip');
        expect(chain).toContain('vflip');
        expect(chain).toContain('rotate=');
        expect(chain).toContain('scale=iw*1.5:ih*1.5');
        expect(chain).toContain('pad=1000:1000:(ow-iw)/2+200:(oh-ih)/2+-100:black');
        expect(chain).toContain("lutrgb=r='val*0.5'");
        expect(chain).toContain('fps=24');
    });

    test('renders advanced editor transitions with the matching xfade type', async () => {
        const ffmpegSpy = jest.spyOn(runner, '_runFfmpeg').mockResolvedValue();
        const context = { tempDir: '/tmp/mediaflow-export' };
        const job = {
            jobId: 'job-transition',
            stages: [{ id: 'compose', weight: 100 }]
        };

        await runner._composeVideo(job, context, {}, [
            {
                videoPath: '/tmp/mediaflow-export/000_video.mp4',
                duration: 4,
                transition: { id: 'wiperight', duration: 1 }
            },
            {
                videoPath: '/tmp/mediaflow-export/001_video.mp4',
                duration: 5,
                transition: { id: 'none', duration: 0 }
            }
        ], jest.fn());

        const ffmpegArgs = ffmpegSpy.mock.calls[0][1];
        const filterComplex = ffmpegArgs[ffmpegArgs.indexOf('-filter_complex') + 1];

        expect(filterComplex).toContain('xfade=transition=wiperight:duration=1:offset=3');
    });

    test('crossfades base audio when a supported visual transition overlaps clips', async () => {
        const ffmpegSpy = jest.spyOn(runner, '_runFfmpeg').mockResolvedValue();
        const context = { tempDir: '/tmp/mediaflow-export' };
        const job = {
            jobId: 'job-audio-transition',
            stages: [{ id: 'audio', weight: 100 }]
        };

        await runner._composeBaseAudio(job, context, {}, [
            {
                audioPath: '/tmp/mediaflow-export/000_audio.m4a',
                duration: 4,
                transition: { id: 'slideleft', duration: 0.5 }
            },
            {
                audioPath: '/tmp/mediaflow-export/001_audio.m4a',
                duration: 4,
                transition: { id: 'none', duration: 0 }
            }
        ], jest.fn());

        const ffmpegArgs = ffmpegSpy.mock.calls[0][1];
        const filterComplex = ffmpegArgs[ffmpegArgs.indexOf('-filter_complex') + 1];

        expect(filterComplex).toContain('acrossfade=d=0.5:c1=tri:c2=tri');
    });

    test('blends overlay video clips onto the primary composed track', async () => {
        const ffmpegSpy = jest.spyOn(runner, '_runFfmpeg').mockResolvedValue();
        jest.spyOn(runner, '_materializeOverlayVideoClip').mockResolvedValue('/tmp/mediaflow-export/ov.mp4');
        const context = { tempDir: '/tmp/mediaflow-export' };
        const job = {
            jobId: 'job-overlay',
            stages: [{ id: 'compose', weight: 100 }],
            overlayVideoClips: [
                {
                    clipId: 'ov-1',
                    assetPath: '/pip.mp4',
                    assetKind: 'video',
                    timelineStart: 1,
                    timelineEnd: 4,
                    sourceStart: 0,
                    sourceEnd: 3,
                    speed: 1,
                    scale: 50,
                    x: 40,
                    y: -20,
                    opacity: 80,
                    previewStageWidth: 1000,
                    previewStageHeight: 1000
                }
            ]
        };

        const output = await runner._composeOverlayVideos(
            job,
            context,
            { width: 1280, height: 720, fps: 30 },
            '/tmp/mediaflow-export/base.mp4',
            jest.fn()
        );

        expect(output).toContain('composed_with_overlay_');
        expect(ffmpegSpy).toHaveBeenCalled();
        const blendArgs = ffmpegSpy.mock.calls[0][1];
        const filterComplex = blendArgs[blendArgs.indexOf('-filter_complex') + 1];
        expect(filterComplex).toContain("enable='between(t,1,4)'");
        expect(filterComplex).toContain('colorchannelmixer=aa=0.8');
        expect(filterComplex).toContain('overlay=x=');
    });
});
