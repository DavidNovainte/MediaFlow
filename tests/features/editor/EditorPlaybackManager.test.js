/** @jest-environment jsdom */

describe('EditorPlaybackManager', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/playback/EditorPlaybackManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="btn-editor-play-toggle" type="button"></button>
            <video id="editor-preview-video"></video>
            <audio id="editor-preview-audio"></audio>
        `;

        this.video = document.getElementById('editor-preview-video');
        this.audio = document.getElementById('editor-preview-audio');

        Object.defineProperty(this.video, 'paused', { configurable: true, writable: true, value: false });
        Object.defineProperty(this.audio, 'paused', { configurable: true, writable: true, value: false });
        this.video.currentTime = 0;
        this.audio.currentTime = 0;
        this.video.play = jest.fn().mockResolvedValue(undefined);
        this.audio.play = jest.fn().mockResolvedValue(undefined);
        this.video.pause = jest.fn(() => {
            this.video.paused = true;
        });
        this.audio.pause = jest.fn(() => {
            this.audio.paused = true;
        });

        // 劫持 document.createElement 以便对动态创建的辅助 audio 元素进行 play/pause Mock
        this.originalCreateElement = document.createElement.bind(document);
        document.createElement = jest.fn((tagName) => {
            const el = this.originalCreateElement(tagName);
            if (tagName.toLowerCase() === 'audio') {
                el.play = jest.fn().mockResolvedValue(undefined);
                el.pause = jest.fn(() => {
                    Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: true });
                });
                Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: false });
            }
            return el;
        });

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12, src: 'file:///C:/media/clip.mp4' },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 8, src: 'file:///C:/media/voice.mp3' }
        ]);

        const videoClip = this.store.addAssetToTimeline('asset-video');
        const secondAudioTrackId = this.store.createTrack('audio');
        this.videoClip = videoClip;
        this.secondAudioTrackId = secondAudioTrackId;
        this.store.insertAssetAtTime('asset-audio', 0, secondAudioTrackId);
        this.store.selectClip(videoClip.id);
        this.store.setPlayheadTime(1);

        const stage = document.createElement('div');
        this.previewManager = {
            elements: {
                video: this.video,
                audio: this.audio,
                stage: stage
            },
            setPlaybackDriven: jest.fn()
        };

        this.manager = new window.EditorPlaybackManager({
            store: this.store,
            previewManager: this.previewManager,
            app: { router: { currentPage: 'editor' } }
        });
        this.manager.init();
    });

    afterEach(() => {
        document.createElement = this.originalCreateElement;
    });

    it('plays overlapping standalone audio alongside the primary video clip', async () => {
        await this.manager.togglePlayback();

        expect(this.video.play).toHaveBeenCalledTimes(1);
        const suppAudio = this.manager.supplementalAudioPool[0];
        expect(suppAudio).toBeDefined();
        expect(suppAudio.play).toHaveBeenCalledTimes(1);
        expect(suppAudio.getAttribute('src')).toBe('file:///C:/media/voice.mp3');
        expect(this.manager.supplementalAudioClipIds).toHaveLength(1);
    });

    it('plays the selected media-bin asset when the timeline is empty', async () => {
        // Clear every clip so preview falls back to asset review.
        const allIds = this.store.getAllClips().map((clip) => clip.id);
        this.store.deleteClips(allIds);
        this.store.selectAsset('asset-video');
        this.store.setPlayheadTime(2);

        await this.manager.togglePlayback();

        expect(this.video.play).toHaveBeenCalledTimes(1);
        expect(this.manager.playbackMode).toBe('asset');
        expect(this.manager.activeClipId).toBe('asset-preview:asset-video');
        expect(this.video.currentTime).toBeCloseTo(2, 3);

        this.video.currentTime = 3.5;
        this.manager.handleTimeUpdate();
        expect(this.store.getState().playheadTime).toBeCloseTo(3.5, 3);
    });

    it('pauses supplemental audio when playback stops', async () => {
        await this.manager.togglePlayback();
        const suppAudio = this.manager.supplementalAudioPool[0];
        this.manager.stop();

        expect(this.video.pause).toHaveBeenCalled();
        expect(suppAudio.pause).toHaveBeenCalled();
        expect(this.manager.supplementalAudioClipIds).toHaveLength(0);
    });

    it('mutes embedded video audio after deleting the linked source-audio clip', async () => {
        const linkedAudioClip = this.store.getTrack('a1')[0];
        this.store.deleteClip(linkedAudioClip.id);

        await this.manager.togglePlayback();

        expect(this.video.play).toHaveBeenCalledTimes(1);
        expect(this.video.muted).toBe(true);
        expect(this.video.volume).toBe(0);
        expect(this.manager.supplementalAudioClipIds).toHaveLength(1);
    });

    it('uses linked source-audio clip controls for embedded video audio', async () => {
        const linkedAudioClip = this.store.getTrack('a1')[0];
        this.store.updateClip(linkedAudioClip.id, { volume: 35 });

        await this.manager.togglePlayback();

        expect(this.video.muted).toBe(false);
        expect(this.video.volume).toBeCloseTo(0.35, 3);
    });

    it('respects a linked source-audio clip volume of zero', async () => {
        const linkedAudioClip = this.store.getTrack('a1')[0];
        this.store.updateClip(linkedAudioClip.id, { volume: 0 });

        await this.manager.togglePlayback();

        expect(this.video.muted).toBe(false);
        expect(this.video.volume).toBe(0);
    });

    it('does not play the selected video clip while its track is hidden', async () => {
        const linkedAudioClip = this.store.getTrack('a1')[0];
        const standaloneAudioClip = this.store.getTrack(this.secondAudioTrackId)[0];
        this.store.toggleTrackHidden('v1');

        await this.manager.togglePlayback();

        expect(this.video.play).not.toHaveBeenCalled();
        expect(this.audio.play).toHaveBeenCalledTimes(1);
        expect(this.manager.activeClipId).toBe(linkedAudioClip.id);
        expect(this.manager.supplementalAudioClipIds).toContain(standaloneAudioClip.id);
    });

    it('plays linked audio when its video track is hidden and no standalone audio overlaps', async () => {
        const standaloneAudioClip = this.store.getTrack(this.secondAudioTrackId)[0];
        const linkedAudioClip = this.store.getTrack('a1')[0];
        this.store.deleteClip(standaloneAudioClip.id);
        this.store.toggleTrackHidden('v1');

        await this.manager.togglePlayback();

        expect(this.video.play).not.toHaveBeenCalled();
        expect(this.audio.play).toHaveBeenCalledTimes(1);
        expect(this.audio.getAttribute('src')).toBe('file:///C:/media/clip.mp4');
        expect(this.manager.activeClipId).toBe(linkedAudioClip.id);
    });

    it('falls back to the active solo track instead of playing the excluded selection', async () => {
        this.store.toggleTrackSolo(this.secondAudioTrackId);

        await this.manager.togglePlayback();

        expect(this.video.play).not.toHaveBeenCalled();
        expect(this.audio.play).toHaveBeenCalledTimes(1);
        expect(this.manager.activeClipId).toBe(this.store.getTrack(this.secondAudioTrackId)[0].id);
    });

    it('does not toggle playback from Space while typing in an input', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        this.manager.togglePlayback = jest.fn();
        const event = {
            code: 'Space',
            target: input,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn()
        };

        this.manager.handleKeydown(event);

        expect(this.manager.togglePlayback).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('still toggles playback from Space outside text fields (including toolbar buttons)', () => {
        this.manager.togglePlayback = jest.fn();
        const event = {
            code: 'Space',
            target: document.body,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn()
        };

        this.manager.handleKeydown(event);

        expect(event.preventDefault).toHaveBeenCalled();
        expect(this.manager.togglePlayback).toHaveBeenCalledTimes(1);
    });
});
