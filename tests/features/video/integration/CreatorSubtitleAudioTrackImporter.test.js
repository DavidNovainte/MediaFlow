/** @jest-environment jsdom */

describe('CreatorSubtitleAudioTrackImporter', () => {
    beforeAll(() => {
        require('../../../../src/features/video/integration/CreatorSubtitleProject');
        require('../../../../src/features/video/integration/CreatorSubtitleAudioTrackImporter');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="track-a2"></div>
            <div id="creator-timeline-workspace">
                <div class="timeline-body"></div>
            </div>
        `;
    });

    it('imports subtitle audio tracks as creator audio tracks in source timeline mode', () => {
        const flow = {
            isAudioOnly: false,
            videoFile: { path: 'C:/video/sample.mp4' },
            audioFile: null,
            createMediaFileRef: jest.fn((filePath) => ({
                path: filePath,
                name: filePath.split(/[\\/]/).pop(),
                type: 'audio/mp3'
            })),
            audioMixer: {
                registerTrack: jest.fn(),
                unregisterTrack: jest.fn()
            },
            timelineManager: {
                tracks: {
                    v1: { id: 'v1', segments: [] },
                    a1: { id: 'a1', segments: [] }
                },
                createLinkedTrackDOM: jest.fn(),
                updateLabelContextMenus: jest.fn(),
                renderAll: jest.fn()
            }
        };
        const project = {
            metadata: { activeTrackId: 'main-1' },
            subtitleTracks: [
                {
                    id: 'main-1',
                    visible: true,
                    segments: [
                        { id: 'sub-1', start: 4, end: 6 }
                    ]
                }
            ],
            audioTracks: [
                {
                    id: 'audio-1',
                    name: 'TTS Main',
                    segments: [
                        {
                            id: 'clip-1',
                            originId: 'sub-1',
                            start: 4,
                            end: 5.8,
                            audioPath: 'C:/tts/main.wav',
                            audioStartOffset: 0.3,
                            audioEndOffset: 2.1
                        }
                    ]
                }
            ]
        };

        const importer = new window.CreatorSubtitleAudioTrackImporter(flow);
        const created = importer.syncProject(project, { timelineMode: 'source' });

        expect(created).toEqual(['a2']);
        expect(flow.timelineManager.tracks.a2).toEqual(expect.objectContaining({
            subtitleImport: true,
            subtitleSourceTrackId: 'audio-1'
        }));
        expect(flow.timelineManager.tracks.a2.segments[0]).toEqual(expect.objectContaining({
            start: 4,
            end: 5.8,
            sourceStart: 0.3,
            sourceEnd: 2.1,
            subtitleOriginId: 'sub-1'
        }));
        expect(flow.audioMixer.registerTrack).toHaveBeenCalledWith('a2', 'C:/tts/main.wav');
    });

    it('remaps imported audio tracks into compact subtitle timeline mode', () => {
        const flow = {
            isAudioOnly: false,
            videoFile: { path: 'C:/video/sample.mp4' },
            audioFile: null,
            createMediaFileRef: jest.fn((filePath) => ({
                path: filePath,
                name: filePath.split(/[\\/]/).pop(),
                type: 'audio/mp3'
            })),
            audioMixer: {
                registerTrack: jest.fn(),
                unregisterTrack: jest.fn()
            },
            timelineManager: {
                tracks: {
                    v1: { id: 'v1', segments: [] },
                    a1: { id: 'a1', segments: [] }
                },
                createLinkedTrackDOM: jest.fn(),
                updateLabelContextMenus: jest.fn(),
                renderAll: jest.fn()
            }
        };
        const project = {
            metadata: { activeTrackId: 'main-1' },
            subtitleTracks: [
                {
                    id: 'main-1',
                    visible: true,
                    segments: [
                        { id: 'sub-1', start: 10, end: 12 },
                        { id: 'sub-2', start: 20, end: 23 }
                    ]
                }
            ],
            audioTracks: [
                {
                    id: 'audio-1',
                    name: 'TTS Main',
                    segments: [
                        {
                            id: 'clip-1',
                            originId: 'sub-1',
                            start: 10,
                            end: 11.5,
                            audioPath: 'C:/tts/main.wav',
                            audioStartOffset: 0,
                            audioEndOffset: 1.5
                        },
                        {
                            id: 'clip-2',
                            originId: 'sub-2',
                            start: 20.2,
                            end: 22.0,
                            audioPath: 'C:/tts/main.wav',
                            audioStartOffset: 1.5,
                            audioEndOffset: 3.3
                        }
                    ]
                }
            ]
        };

        const importer = new window.CreatorSubtitleAudioTrackImporter(flow);
        importer.syncProject(project, { timelineMode: 'compact' });

        expect(flow.timelineManager.tracks.a2.segments[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 1.5
        }));
        expect(flow.timelineManager.tracks.a2.segments[1].start).toBeCloseTo(2.2, 5);
        expect(flow.timelineManager.tracks.a2.segments[1].end).toBeCloseTo(4.0, 5);
    });
});
