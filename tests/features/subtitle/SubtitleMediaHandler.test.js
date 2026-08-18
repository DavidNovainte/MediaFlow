/** @jest-environment jsdom */

describe('SubtitleMediaHandler source trim playback', () => {
    beforeAll(() => {
        require('../../../src/features/subtitle/SubtitleMediaHandler');
    });

    function createHandler({ currentTime, paused = false, playableTime }) {
        const video = {
            currentTime,
            paused,
            pause: jest.fn(function() {
                this.paused = true;
            })
        };

        const flow = {
            video,
            subtitleOverlay: document.createElement('div'),
            hasSourceTrim: jest.fn(() => true),
            getPlayableSourceTime: jest.fn(() => playableTime),
            timeline: {
                updateTime: jest.fn(),
                updatePlayPauseIcon: jest.fn()
            },
            audioManager: {
                syncPlayback: jest.fn()
            }
        };

        const handler = new window.SubtitleMediaHandler(flow);
        handler.renderCurrentSubtitle = jest.fn();

        return { handler, flow, video };
    }

    it('jumps over deleted source gaps during playback', () => {
        const { handler, flow, video } = createHandler({
            currentTime: 3.2,
            paused: false,
            playableTime: 5
        });

        const adjusted = handler._enforceTrimmedPlaybackBounds();

        expect(adjusted).toBe(true);
        expect(video.currentTime).toBe(5);
        expect(video.pause).not.toHaveBeenCalled();
        expect(flow.audioManager.syncPlayback).not.toHaveBeenCalled();
        expect(handler.renderCurrentSubtitle).toHaveBeenCalled();
        expect(flow.timeline.updateTime).toHaveBeenCalledWith(5);
    });

    it('stops at the trimmed end instead of continuing into deleted tail', () => {
        const { handler, flow, video } = createHandler({
            currentTime: 9.5,
            paused: false,
            playableTime: 8
        });

        const adjusted = handler._enforceTrimmedPlaybackBounds();

        expect(adjusted).toBe(true);
        expect(video.currentTime).toBe(8);
        expect(video.pause).toHaveBeenCalled();
        expect(flow.audioManager.syncPlayback).toHaveBeenCalledWith(false);
        expect(flow.timeline.updateTime).toHaveBeenCalledWith(8);
    });

    it('updates the subtitle video duration instead of a duplicate download page id', async () => {
        document.body.innerHTML = `
            <section id="page-download"><div id="video-duration">download duration</div></section>
            <section id="page-subtitle">
                <div id="video-duration">subtitle duration</div>
                <div id="video-name"></div>
            </section>
        `;
        window.app = { mobileFlow: { service: { isRunning: false } }, showToast: jest.fn() };
        window.urlUtils = { pathToMediaUrl: jest.fn((filePath) => `media://${filePath}`) };

        const video = {
            duration: 123,
            videoWidth: 1920,
            videoHeight: 1080,
            paused: true,
            pause: jest.fn(),
            removeAttribute: jest.fn(),
            load: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };
        const flow = {
            video,
            videoPlaceholder: document.createElement('div'),
            videoInfo: document.createElement('div'),
            subtitleOverlay: document.createElement('div'),
            trackManager: { clearAllTracks: jest.fn() },
            resetSourceSegments: jest.fn(),
            getElement: (id) => document.querySelector(`#page-subtitle #${id}`),
            timeline: {
                setDuration: jest.fn(),
                loadWaveform: jest.fn(),
                render: jest.fn()
            },
            styleManager: { updateSubtitlePreview: jest.fn() }
        };
        const handler = new window.SubtitleMediaHandler(flow);
        handler.renderCurrentSubtitle = jest.fn();
        handler.updateBlurPreview = jest.fn();

        await handler.loadVideo('C:/media/clip.mp4');
        video.onloadedmetadata();

        expect(document.querySelector('#page-download #video-duration').textContent).toBe('download duration');
        expect(document.querySelector('#page-subtitle #video-duration').textContent).toBe('00:02:03');
        expect(String(video.src || '')).not.toContain('localhost:8765');
        expect(window.urlUtils.pathToMediaUrl).toHaveBeenCalledWith('C:/media/clip.mp4');
    });

    it('uses media-file even when MobileFlow reports running', async () => {
        document.body.innerHTML = `
            <section id="page-subtitle">
                <div id="video-duration"></div>
                <div id="video-name"></div>
            </section>
        `;
        window.app = { mobileFlow: { service: { isRunning: true } }, showToast: jest.fn() };
        window.urlUtils = { pathToMediaUrl: jest.fn((filePath) => `media-file:///${filePath}`) };
        window.mediaflow = { subtitle: { getVideoInfo: jest.fn().mockResolvedValue({ width: 1280, height: 720 }) } };

        const video = {
            duration: 10,
            videoWidth: 1280,
            videoHeight: 720,
            paused: true,
            pause: jest.fn(),
            removeAttribute: jest.fn(),
            load: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };
        const flow = {
            video,
            videoPlaceholder: document.createElement('div'),
            videoInfo: document.createElement('div'),
            subtitleOverlay: document.createElement('div'),
            trackManager: { clearAllTracks: jest.fn() },
            resetSourceSegments: jest.fn(),
            getElement: (id) => document.querySelector(`#page-subtitle #${id}`),
            timeline: { setDuration: jest.fn(), loadWaveform: jest.fn(), render: jest.fn() },
            styleManager: { updateSubtitlePreview: jest.fn() }
        };
        const handler = new window.SubtitleMediaHandler(flow);
        handler.renderCurrentSubtitle = jest.fn();
        handler.updateBlurPreview = jest.fn();

        await handler.loadVideo('D:/clips/demo.mp4');

        expect(video.src).toContain('media-file://');
        expect(video.src).not.toContain('8765');
        expect(window.urlUtils.pathToMediaUrl).toHaveBeenCalled();
    });
});
