/** @jest-environment jsdom */

describe('Creator export snapshot and planner', () => {
    let TimelineProjectSnapshot;
    let CreatorExportPlanner;
    let CreatorExportCapabilityMatrix;
    let TransitionManager;

    beforeAll(() => {
        require('../../../../src/features/video/export/CreatorSubtitleExportAdapter');
        TimelineProjectSnapshot = require('../../../../src/features/video/export/TimelineProjectSnapshot');
        CreatorExportPlanner = require('../../../../src/features/video/export/CreatorExportPlanner');
        CreatorExportCapabilityMatrix = require('../../../../src/features/video/export/CreatorExportCapabilityMatrix');
        TransitionManager = require('../../../../src/features/video/TransitionManager');
    });

    test('builds a snapshot that preserves clip source assets', () => {
        window.CreatorSubtitleExportAdapter = {
            buildTracks: jest.fn(() => [])
        };
        const core = {
            videoFile: { path: '/video-a.mp4', name: 'video-a.mp4' },
            isAudioOnly: false,
            videoDuration: 20,
            timelineManager: {
                duration: 20,
                tracks: {
                    v1: {
                        segments: [
                            { start: 0, end: 5, sourceStart: 2, file: { path: '/video-a.mp4' }, groupId: 'g1' },
                            { start: 5, end: 10, sourceStart: 1, file: { path: '/video-b.mp4' }, groupId: 'g2' }
                        ]
                    },
                    a1: {
                        segments: [
                            { start: 0, end: 5, sourceStart: 2, file: { path: '/video-a.mp4' }, groupId: 'g1' },
                            { start: 5, end: 10, sourceStart: 1, file: { path: '/voice.mp3' }, groupId: 'voice' }
                        ]
                    }
                }
            }
        };

        const snapshot = TimelineProjectSnapshot.create(core);
        expect(snapshot.tracks[0].clips[0].assetPath).toBe('/video-a.mp4');
        expect(snapshot.tracks[0].clips[1].assetPath).toBe('/video-b.mp4');
        expect(snapshot.tracks[1].clips[1].assetPath).toBe('/voice.mp3');
    });

    test('snapshot includes exported subtitle tracks when a localized project is present', () => {
        window.CreatorSubtitleExportAdapter = {
            buildTracks: jest.fn(() => [
                {
                    id: 'sub-main',
                    style: { fontColor: '#ff00ff' },
                    subtitles: [{ id: 's1', start: 0, end: 1, text: 'Hello' }]
                }
            ])
        };

        const snapshot = TimelineProjectSnapshot.create({
            videoFile: { path: '/video-a.mp4', name: 'video-a.mp4' },
            timelineManager: {
                duration: 5,
                tracks: {
                    v1: {
                        segments: [
                            { start: 0, end: 5, sourceStart: 0, file: { path: '/video-a.mp4' } }
                        ]
                    }
                }
            }
        });

        expect(snapshot.subtitleTracks).toEqual([
            expect.objectContaining({
                id: 'sub-main',
                subtitles: [expect.objectContaining({ text: 'Hello' })]
            })
        ]);
    });

    test('planner rejects unsupported formats and transitions', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 5,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v1-0',
                            assetPath: '/video.mp4',
                            timelineStart: 0,
                            timelineEnd: 5,
                            sourceStart: 0,
                            sourceEnd: 5,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'wipe', duration: 1 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        expect(() => planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mov',
            outputPath: '/out.mov'
        })).toThrow('Unsupported video export format');

        expect(() => planner.buildJob({
            ...snapshot,
            tracks: [
                {
                    ...snapshot.tracks[0],
                    clips: [
                        {
                            ...snapshot.tracks[0].clips[0],
                            transition: { id: 'wipe', duration: 1 }
                        }
                    ]
                }
            ]
        }, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        })).toThrow('Unsupported transition');
    });

    test('export capability matrix supports every transition exposed by the editor UI', () => {
        const editorTransitionIds = TransitionManager.transitions.map((transition) => transition.id);

        expect(CreatorExportCapabilityMatrix.transitions).toEqual(
            expect.arrayContaining(editorTransitionIds)
        );
    });

    test('planner accepts advanced editor transitions that can be rendered with xfade', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 8,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v1-0',
                            assetPath: '/video-a.mp4',
                            timelineStart: 0,
                            timelineEnd: 4,
                            sourceStart: 0,
                            sourceEnd: 4,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'wiperight', duration: 0.75 },
                            enabled: true,
                            muted: false
                        },
                        {
                            clipId: 'v1-1',
                            assetPath: '/video-b.mp4',
                            timelineStart: 4,
                            timelineEnd: 8,
                            sourceStart: 0,
                            sourceEnd: 4,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        const job = planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        });

        expect(job.primaryVideoClips[0].transition).toEqual({ id: 'wiperight', duration: 0.75 });
    });

    test('planner rejects invalid clip ranges', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: true,
            timelineDuration: 0,
            tracks: [
                {
                    trackId: 'a1',
                    trackType: 'audio',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'a1-0',
                            assetPath: '/audio.mp3',
                            timelineStart: 5,
                            timelineEnd: 5,
                            sourceStart: 1,
                            sourceEnd: 1,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        expect(() => planner.buildJob(snapshot, {
            type: 'audio',
            format: 'mp3',
            outputPath: '/out.mp3'
        })).toThrow('Invalid clip range');
    });

    test('planner excludes linked primary audio from overlay tracks', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 8,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v1-0',
                            groupId: 'g1',
                            assetPath: '/video.mp4',
                            timelineStart: 0,
                            timelineEnd: 4,
                            sourceStart: 0,
                            sourceEnd: 4,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'fade', duration: 0.5 },
                            enabled: true,
                            muted: false
                        }
                    ]
                },
                {
                    trackId: 'a1',
                    trackType: 'audio',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'a1-0',
                            groupId: 'g1',
                            assetPath: '/video.mp4',
                            timelineStart: 0,
                            timelineEnd: 4,
                            sourceStart: 0,
                            sourceEnd: 4,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                },
                {
                    trackId: 'a2',
                    trackType: 'audio',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'a2-0',
                            groupId: 'music',
                            assetPath: '/music.mp3',
                            timelineStart: 1,
                            timelineEnd: 6,
                            sourceStart: 0,
                            sourceEnd: 5,
                            speed: 1,
                            volume: 0.7,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        const job = planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        });

        expect(job.overlayAudioClips).toHaveLength(1);
        expect(job.overlayAudioClips[0].assetPath).toBe('/music.mp3');
    });

    test('planner excludes muted tracks from export job planning', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 5,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v1-0',
                            groupId: 'g1',
                            assetPath: '/video.mp4',
                            timelineStart: 0,
                            timelineEnd: 5,
                            sourceStart: 0,
                            sourceEnd: 5,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                },
                {
                    trackId: 'a1',
                    trackType: 'audio',
                    enabled: true,
                    muted: true,
                    clips: [
                        {
                            clipId: 'a1-0',
                            groupId: 'g1',
                            assetPath: '/video.mp4',
                            timelineStart: 0,
                            timelineEnd: 5,
                            sourceStart: 0,
                            sourceEnd: 5,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        const job = planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        });

        expect(job.primaryVideoClips).toHaveLength(1);
        expect(job.primaryAudioClips).toHaveLength(0);
        expect(job.overlayAudioClips).toHaveLength(0);
    });

    test('planner supports multi video tracks as primary + overlays', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 10,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v1-0',
                            assetPath: '/base.mp4',
                            timelineStart: 0,
                            timelineEnd: 10,
                            sourceStart: 0,
                            sourceEnd: 10,
                            speed: 1,
                            volume: 1,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                },
                {
                    trackId: 'v2',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [
                        {
                            clipId: 'v2-0',
                            assetPath: '/pip.mp4',
                            timelineStart: 2,
                            timelineEnd: 6,
                            sourceStart: 0,
                            sourceEnd: 4,
                            speed: 1,
                            volume: 0.85,
                            scale: 40,
                            x: 120,
                            y: -40,
                            opacity: 90,
                            transition: { id: 'none', duration: 0 },
                            enabled: true,
                            muted: false
                        }
                    ]
                }
            ]
        };

        const job = planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        });

        expect(job.primaryVideoTrackId).toBe('v1');
        expect(job.primaryVideoClips).toHaveLength(1);
        expect(job.primaryVideoClips[0].assetPath).toBe('/base.mp4');
        expect(job.overlayVideoClips).toHaveLength(1);
        expect(job.overlayVideoClips[0]).toEqual(expect.objectContaining({
            clipId: 'v2-0',
            assetPath: '/pip.mp4',
            scale: 40,
            x: 120,
            y: -40
        }));
        // Unmuted overlay video carries embedded audio into the mix list
        expect(job.overlayAudioClips).toEqual(expect.arrayContaining([
            expect.objectContaining({
                assetPath: '/pip.mp4',
                timelineStart: 2,
                timelineEnd: 6,
                audioSource: 'overlay-video',
                volume: 0.85
            })
        ]));
    });

    test('planner skips muted overlay video audio promotion', () => {
        const planner = new CreatorExportPlanner(CreatorExportCapabilityMatrix);
        const snapshot = {
            isAudioOnly: false,
            timelineDuration: 5,
            tracks: [
                {
                    trackId: 'v1',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [{
                        clipId: 'v1-0',
                        assetPath: '/base.mp4',
                        timelineStart: 0,
                        timelineEnd: 5,
                        sourceStart: 0,
                        sourceEnd: 5,
                        speed: 1,
                        volume: 1,
                        transition: { id: 'none', duration: 0 },
                        enabled: true,
                        muted: false
                    }]
                },
                {
                    trackId: 'v2',
                    trackType: 'video',
                    enabled: true,
                    muted: false,
                    clips: [{
                        clipId: 'v2-0',
                        assetPath: '/silent-pip.mp4',
                        timelineStart: 0,
                        timelineEnd: 5,
                        sourceStart: 0,
                        sourceEnd: 5,
                        speed: 1,
                        volume: 0,
                        transition: { id: 'none', duration: 0 },
                        enabled: true,
                        muted: false
                    }]
                }
            ]
        };

        const job = planner.buildJob(snapshot, {
            type: 'video+audio',
            format: 'mp4',
            outputPath: '/out.mp4'
        });

        expect(job.overlayVideoClips).toHaveLength(1);
        expect(job.overlayAudioClips).toHaveLength(0);
    });
});
