/** @jest-environment jsdom */

describe('SubtitleAudioManager', () => {
    let SubtitleAudioManager;

    beforeAll(() => {
        require('../../../src/features/subtitle/SubtitleAudioManager');
        SubtitleAudioManager = window.SubtitleAudioManager;
    });

    beforeEach(() => {
        document.body.innerHTML = '<select id="audio-mode"><option value="remove" selected>remove</option></select>';
    });

    it('restores original video volume when no visible audio tracks are present', () => {
        const flow = {
            video: {
                volume: 0,
                paused: false
            },
            trackManager: {
                tracks: []
            },
            ttsHandler: {
                getSettings: jest.fn(() => ({
                    audioMode: 'remove',
                    bgmVolume: 30
                }))
            }
        };

        const manager = new SubtitleAudioManager(flow);
        manager.originalVideoVolume = 0.85;
        manager.fadeVolume = jest.fn((element, targetVolume) => {
            element.volume = targetVolume;
        });

        manager.handleAutoDucking(false, false);

        expect(manager.fadeVolume).toHaveBeenCalledWith(flow.video, 0.85, 120);
        expect(flow.video.volume).toBe(0.85);
    });

    it('does not keep the video muted after stopAll', () => {
        const flow = {
            video: {
                volume: 0,
                paused: true
            },
            trackManager: {
                tracks: []
            }
        };

        const manager = new SubtitleAudioManager(flow);
        const fakeAudio = {
            pause: jest.fn(),
            currentTime: 5
        };
        manager.audioPool.set('a1', fakeAudio);
        manager.originalVideoVolume = 0.65;

        manager.stopAll();

        expect(fakeAudio.pause).toHaveBeenCalled();
        expect(fakeAudio.currentTime).toBe(0);
        expect(flow.video.volume).toBe(0.65);
    });

    it('only resumes audio clips active at the current video time', () => {
        const flow = {
            video: {
                currentTime: 12,
                volume: 1,
                paused: false
            },
            trackManager: {
                tracks: [
                    {
                        id: 'active-track',
                        type: 'audio',
                        visible: true,
                        ttsAudioPath: 'C:/audio/active.wav',
                        subtitles: [
                            { start: 10, end: 14, audioStartOffset: 2 }
                        ]
                    },
                    {
                        id: 'inactive-track',
                        type: 'audio',
                        visible: true,
                        ttsAudioPath: 'C:/audio/inactive.wav',
                        subtitles: [
                            { start: 20, end: 24, audioStartOffset: 1 }
                        ]
                    }
                ]
            },
            ttsHandler: {
                getSettings: jest.fn(() => ({
                    audioMode: 'remove',
                    bgmVolume: 30
                }))
            }
        };

        const manager = new SubtitleAudioManager(flow);
        manager.fadeVolume = jest.fn();

        const activeAudio = {
            _trackedSrc: '',
            currentTime: 0,
            paused: true,
            play: jest.fn(() => Promise.resolve()),
            pause: jest.fn(),
            src: ''
        };
        const inactiveAudio = {
            _trackedSrc: 'media-file:///C:/audio/inactive.wav',
            currentTime: 5,
            paused: false,
            play: jest.fn(() => Promise.resolve()),
            pause: jest.fn(),
            src: 'media-file:///C:/audio/inactive.wav'
        };

        manager.audioPool.set('active-track', activeAudio);
        manager.audioPool.set('inactive-track', inactiveAudio);

        manager.syncPlayback(true);

        expect(activeAudio.play).toHaveBeenCalledTimes(1);
        expect(activeAudio.currentTime).toBe(4);
        expect(activeAudio.src).toBe('media-file:///C:/audio/active.wav');
        expect(inactiveAudio.play).not.toHaveBeenCalled();
        expect(inactiveAudio.pause).toHaveBeenCalledTimes(1);
    });
});
