/** @jest-environment jsdom */

describe('timeline audio mute integration', () => {
    beforeAll(() => {
        require('../../../../src/features/video/timeline/core/TimelinePlaybackState');
        require('../../../../src/features/video/timeline/core/TimelinePlaybackMapping');
        require('../../../../src/features/video/timeline/core/TimelineTrackAudioControls');
    });

    beforeEach(() => {
        window.TimelineSelectionResolver = {
            getActiveAudioSegments: jest.fn(() => [
                {
                    trackId: 'a1',
                    activeSeg: {
                        start: 0,
                        end: 4,
                        sourceStart: 0,
                        groupId: 'g1',
                        file: { path: 'C:/video/sample.mp4' }
                    }
                }
            ])
        };
        window.TimelineNavigation = {
            isTimelinePlaybackActive: jest.fn(() => false)
        };
    });

    it('marks muted audio tracks as non-playable in the playback snapshot', () => {
        const states = window.TimelinePlaybackState.getAudioStates({
            videoFile: { path: 'C:/video/sample.mp4' },
            tracks: {
                a1: { id: 'a1', muted: true }
            }
        }, 1, (file) => file.path);

        expect(states).toHaveLength(1);
        expect(states[0].trackMuted).toBe(true);
        expect(states[0].shouldPlay).toBe(false);
    });

    it('keeps the video element muted when a linked audio track exists but is muted', () => {
        const player = { muted: false, volume: 1 };
        const manager = {
            app: {
                previewHandler: {
                    elements: {
                        video: player
                    }
                },
                audioMixer: {
                    audioTrackPlayers: {}
                }
            }
        };

        window.TimelinePlaybackMapping.syncAudioLevels(manager, 1.2, {
            video: {
                activeSeg: {
                    groupId: 'g1',
                    volume: 1
                }
            },
            audio: [
                {
                    trackId: 'a1',
                    activeSeg: { groupId: 'g1' },
                    trackMuted: true,
                    shouldPlay: false
                }
            ]
        });

        expect(player.muted).toBe(true);
        expect(player.volume).toBe(0);
    });

    it('toggles track mute and resyncs playback helpers', () => {
        const manager = {
            currentTime: 2,
            tracks: {
                a1: { id: 'a1', muted: false }
            },
            captureState: jest.fn(() => ({ tracks: { a1: { id: 'a1', muted: false } } })),
            app: {
                previewHandler: {
                    getPlaybackSnapshot: jest.fn(() => ({ audio: [] }))
                },
                audioMixer: {
                    sync: jest.fn()
                }
            },
            syncAudioLevels: jest.fn()
        };

        window.TimelineTrackAudioControls.toggleTrackMute(manager, 'a1');

        expect(manager.tracks.a1.muted).toBe(true);
        expect(manager.app.audioMixer.sync).toHaveBeenCalled();
        expect(manager.syncAudioLevels).toHaveBeenCalledWith(2, { audio: [] });
    });
});
