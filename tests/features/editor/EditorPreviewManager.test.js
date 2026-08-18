/** @jest-environment jsdom */

describe('EditorPreviewManager', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/preview/EditorPreviewManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="editor-preview-stage">
                <div id="editor-preview-empty"></div>
                <video id="editor-preview-video"></video>
                <audio id="editor-preview-audio"></audio>
                <img id="editor-preview-image" alt="" />
            </div>
            <div id="editor-preview-context"></div>
            <div id="editor-preview-meta"></div>
            <div id="editor-preview-selection"></div>
            <select id="editor-preview-mode"><option value="fit">fit</option></select>
            <span id="editor-preview-current-time"></span>
            <span id="editor-preview-duration"></span>
            <button id="btn-editor-preview-safe-frame" type="button"></button>
            <button id="btn-editor-preview-fullscreen" type="button"></button>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12, src: 'file:///C:/media/clip.mp4', width: 0, height: 0 },
            { id: 'asset-other', name: 'other.mp4', kind: 'video', duration: 20, src: 'file:///C:/media/other.mp4', width: 0, height: 0 },
            { id: 'asset-image', name: 'still.png', kind: 'image', duration: 5, src: 'file:///C:/media/still.png', width: 0, height: 0 }
        ]);

        this.manager = new window.EditorPreviewManager({
            store: this.store,
            playbackManager: {},
            app: { router: { currentPage: 'editor' } }
        });
        this.manager.init();
    });

    it('syncs video metadata to the asset currently loaded in preview', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectAsset('asset-other');
        this.store.selectClip(clip.id);

        const video = document.getElementById('editor-preview-video');
        Object.defineProperty(video, 'duration', { configurable: true, value: 15 });
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });

        this.manager.render(this.store.getState());
        video.dispatchEvent(new Event('loadedmetadata'));

        expect(this.store.getAssetById('asset-video').duration).toBe(15);
        expect(this.store.getAssetById('asset-video').width).toBe(1920);
        expect(this.store.getAssetById('asset-video').height).toBe(1080);
        expect(this.store.getAssetById('asset-other').duration).toBe(20);
        expect(this.store.getAssetById('asset-other').width).toBe(0);
        expect(this.store.getAssetById('asset-other').height).toBe(0);
    });

    it('syncs image metadata to the rendered image asset instead of the selected asset', () => {
        const clip = this.store.addAssetToTimeline('asset-image');
        this.store.selectAsset('asset-other');
        this.store.selectClip(clip.id);

        const image = document.getElementById('editor-preview-image');
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 800 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1200 });

        this.manager.render(this.store.getState());
        image.dispatchEvent(new Event('load'));

        expect(this.store.getAssetById('asset-image').width).toBe(800);
        expect(this.store.getAssetById('asset-image').height).toBe(1200);
        expect(this.store.getAssetById('asset-other').width).toBe(0);
        expect(this.store.getAssetById('asset-other').height).toBe(0);
    });

    it('sets the audio element source when linked audio shares the current video asset id', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClip = this.store.getTrack('audio')[0];
        this.store.selectClip(videoClip.id);
        this.manager.render(this.store.getState());

        this.store.toggleTrackHidden('video');
        this.store.selectClip(linkedAudioClip.id);
        this.manager.render(this.store.getState());

        const audio = document.getElementById('editor-preview-audio');
        expect(audio.classList.contains('hidden')).toBe(false);
        expect(audio.getAttribute('src')).toBe('file:///C:/media/clip.mp4');
        expect(audio.dataset.assetId).toBe('asset-video');
    });

    it('keeps late video metadata attached to the video asset after rendering an image', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(videoClip.id);
        this.manager.render(this.store.getState());

        const imageClip = this.store.addAssetToTimeline('asset-image');
        this.store.selectClip(imageClip.id);
        this.manager.render(this.store.getState());

        const video = document.getElementById('editor-preview-video');
        Object.defineProperty(video, 'duration', { configurable: true, value: 15 });
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
        video.dispatchEvent(new Event('loadedmetadata'));

        expect(this.store.getAssetById('asset-video').duration).toBe(15);
        expect(this.store.getAssetById('asset-video').width).toBe(1920);
        expect(this.store.getAssetById('asset-video').height).toBe(1080);
        expect(this.store.getAssetById('asset-image').duration).toBe(5);
        expect(this.store.getAssetById('asset-image').width).toBe(0);
        expect(this.store.getAssetById('asset-image').height).toBe(0);
    });

    it('does not nudge the selected visual clip from arrow keys while a preview button has focus', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        const event = {
            key: 'ArrowRight',
            target: document.getElementById('btn-editor-preview-safe-frame'),
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn()
        };

        this.manager.handleKeydown(event);

        expect(this.store.getSelectedClip().x || 0).toBe(0);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('still nudges the selected visual clip from arrow keys outside focused controls', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        const event = {
            key: 'ArrowRight',
            target: document.body,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn()
        };

        this.manager.handleKeydown(event);

        expect(this.store.getSelectedClip().x).toBe(1);
        expect(event.preventDefault).toHaveBeenCalled();
    });
});
