/** @jest-environment jsdom */

describe('EditorTimelineManager', () => {
    const createPointerLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true });
        Object.assign(event, init);
        return event;
    };
    const createDragLikeEvent = (type, dataTransfer, init = {}) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { dataTransfer }, init);
        return event;
    };

    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineDragManager');
        require('../../../src/features/editor/timeline/EditorTimelineManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-editor">
                <div class="editor-scope">
                    <div id="editor-timeline-body"></div>
                    <div id="editor-timeline-tracks"></div>
                    <div id="editor-timeline-playhead-overlay"></div>
                    <div id="editor-timeline-ruler"></div>
                    <div id="editor-playhead-time"></div>
                </div>
            </section>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 6 }
        ]);
        window.app = { showToast: jest.fn() };

        this.manager = new window.EditorTimelineManager({
            store: this.store
        });
        this.manager.init();

        Object.defineProperty(this.manager.elements.timelineBody, 'clientWidth', {
            configurable: true,
            value: 1200
        });
        Object.defineProperty(this.manager.elements.timelineBody, 'offsetWidth', {
            configurable: true,
            value: 1200
        });

    });

    it('renders dynamic track labels with type-aware metadata', () => {
        this.store.addAssetToTimeline('asset-video');

        this.manager.render(this.store.getState());

        const videoLabel = document.querySelector('.editor-track-label[data-track="v1"]');
        const gutterShield = document.querySelector('.editor-timeline-track .editor-track-gutter-shield');
        expect(gutterShield).toBeTruthy();
        expect(videoLabel).toBeTruthy();
        expect(videoLabel.dataset.trackType).toBe('video');
        expect(videoLabel.textContent).toContain('V1');
        expect(videoLabel.textContent).not.toContain('Active');
        const labelButtons = videoLabel.querySelectorAll('.editor-track-label-btn');
        expect(labelButtons).toHaveLength(3);
        labelButtons.forEach((button) => {
            expect(button.getAttribute('aria-pressed')).toBe('false');
        });
    });

    it('updates track toggle labels and pressed state when controls are active', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackSolo('v1');
        this.store.toggleTrackHidden('v1');
        this.store.toggleTrackMuted('v1');

        this.manager.render(this.store.getState());

        const videoLabel = document.querySelector('.editor-track-label[data-track="v1"]');
        const soloButton = videoLabel.querySelector('[data-track-action="solo"]');
        const hideButton = videoLabel.querySelector('[data-track-action="hide"]');
        const muteButton = videoLabel.querySelector('[data-track-action="mute"]');

        expect(soloButton.title).toBe('取消独听轨道');
        expect(hideButton.title).toBe('显示轨道');
        expect(muteButton.title).toBe('取消静音轨道');
        expect(soloButton.getAttribute('aria-pressed')).toBe('true');
        expect(hideButton.getAttribute('aria-pressed')).toBe('true');
        expect(muteButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('reorders visual tracks from the track header without mixing them into the audio section', () => {
        const topTrackId = this.store.createTrackAdjacent('v1', 'above', 'V3');
        const movedTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        this.store.selectTrack('v1');
        this.store.addAssetToTimeline('asset-video');

        this.manager.render(this.store.getState());

        const sourceLabel = document.querySelector(`.editor-track-label[data-track="${movedTrackId}"]`);
        const targetLabel = document.querySelector(`.editor-track-label[data-track="${topTrackId}"]`);
        const dataTransfer = {
            store: {},
            setData(type, value) {
                this.store[type] = value;
            },
            getData(type) {
                return this.store[type] || '';
            },
            effectAllowed: 'none'
        };

        sourceLabel.getBoundingClientRect = () => ({ top: 0, height: 60 });
        targetLabel.getBoundingClientRect = () => ({ top: 0, height: 60 });

        sourceLabel.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer, { clientY: 12 }));
        targetLabel.dispatchEvent(createDragLikeEvent('dragover', dataTransfer, { clientY: 48 }));
        targetLabel.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientY: 48 }));

        const state = this.store.getState();
        expect(state.trackOrder).toEqual([topTrackId, movedTrackId, 'v1', 'a1']);
        expect(state.selectedTrackName).toBe(movedTrackId);
    });

    it('marks the timeline body for single-clip visual focus', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.setSelectedClips([clip.id], clip.id);
        this.manager.render(this.store.getState());

        const timelineBody = document.getElementById('editor-timeline-body');
        expect(timelineBody.classList.contains('has-single-selected-clip')).toBe(true);
        expect(timelineBody.classList.contains('has-multi-selected-clips')).toBe(false);
    });

    it('selects the clicked track when clicking empty track content', () => {
        const audioTrackId = this.store.createTrackAdjacent('a1', 'below', 'A2');
        this.store.selectTrack('a1');
        const audioClip = this.store.addAssetToTimeline('asset-audio');
        this.store.selectClip(audioClip.id);
        this.store.selectTrack(audioTrackId);
        const stateBeforeRender = this.store.getState();
        const emptyAudioLane = document.createElement('div');

        this.manager.renderTrack(
            emptyAudioLane,
            audioTrackId,
            [],
            stateBeforeRender.assets,
            stateBeforeRender.selectedClipIds || [],
            stateBeforeRender.selectedClipId,
            stateBeforeRender,
            12,
            1200,
            64
        );
        emptyAudioLane.onclick({ target: emptyAudioLane, currentTarget: emptyAudioLane });

        const state = this.store.getState();
        expect(state.selectedTrackName).toBe(audioTrackId);
        expect(state.selectedClipId).toBeNull();
        expect(state.selectedClipIds).toEqual([]);
    });

    it('clicking a split clip selects only the clicked segment', () => {
        const clip = this.store.addAssetToTimeline('asset-audio');
        this.store.splitClipAtTime(clip.id, 2.5);
        const audioTrackId = this.store.getState().selectedTrackName;
        const [firstClip, secondClip] = this.store.getState().timeline[audioTrackId];

        this.manager.render(this.store.getState());

        const audioBlocks = [...document.querySelectorAll('.editor-clip-audio')];
        const secondBlock = audioBlocks[1];
        secondBlock.click();

        const state = this.store.getState();
        expect(state.selectedTrackName).toBe(audioTrackId);
        expect(state.selectedClipId).toBe(secondClip.id);
        expect(state.selectedClipIds).toEqual([secondClip.id]);
        expect(state.selectedClipIds).not.toContain(firstClip.id);
    });

    it('adds a pulse class to the new primary segment after a split changes selection', () => {
        const clip = this.store.addAssetToTimeline('asset-audio');
        const lane = document.createElement('div');
        lane.className = 'editor-track-lane';
        lane.dataset.trackId = 'a1';

        const initialState = this.store.getState();
        this.manager.renderTrack(
            lane,
            'a1',
            initialState.timeline.a1 || [],
            initialState.assets,
            initialState.selectedClipIds || [],
            initialState.selectedClipId,
            initialState,
            6,
            1200,
            64
        );
        this.manager.lastRenderedState = {
            selectedClipId: initialState.selectedClipId,
            selectedClipIds: [...(initialState.selectedClipIds || [])]
        };

        this.store.splitClipAtTime(clip.id, 2.5);

        const state = this.store.getState();
        lane.innerHTML = '';
        this.manager.renderTrack(
            lane,
            'a1',
            state.timeline.a1 || [],
            state.assets,
            state.selectedClipIds || [],
            state.selectedClipId,
            state,
            6,
            1200,
            64
        );

        const audioBlocks = [...lane.querySelectorAll('.editor-clip[data-clip-id]')]
            .filter((block) => block.classList.contains('editor-clip-audio'));
        const primaryBlock = audioBlocks.find((block) => block.classList.contains('is-primary-selected'));
        expect(audioBlocks).toHaveLength(2);
        expect(audioBlocks[0].classList.contains('is-feedback-pulse')).toBe(false);
        expect(primaryBlock).toBeTruthy();
        expect(primaryBlock.dataset.clipId).toBe(state.selectedClipId);
        expect(primaryBlock.classList.contains('is-primary-selected')).toBe(true);
        expect(primaryBlock.classList.contains('is-feedback-pulse')).toBe(true);
    });

    it('keeps a user-created empty track visible while another populated track is selected', () => {
        const customTrackId = this.store.createTrackAdjacent('v1', 'below', 'V3');
        this.store.selectTrack('v1');
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        const trackIds = this.manager.getRenderableTrackIds(this.store.getState());

        expect(trackIds).toContain('v1');
        expect(trackIds).toContain(customTrackId);
    });

    it('applies selected styling after a plain pointer click on a clip', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.clearClipSelection();

        const lane = document.createElement('div');
        lane.className = 'editor-track-lane';
        lane.dataset.trackId = 'v1';
        const initialState = this.store.getState();
        this.manager.renderTrack(
            lane,
            'v1',
            initialState.timeline.v1 || [],
            initialState.assets,
            initialState.selectedClipIds || [],
            initialState.selectedClipId,
            initialState,
            12,
            1200,
            64
        );

        const block = lane.querySelector(`.editor-clip[data-clip-id="${clip.id}"]`);
        block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 20
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const selectedState = this.store.getState();
        lane.innerHTML = '';
        this.manager.renderTrack(
            lane,
            'v1',
            selectedState.timeline.v1 || [],
            selectedState.assets,
            selectedState.selectedClipIds || [],
            selectedState.selectedClipId,
            selectedState,
            12,
            1200,
            64
        );
        this.manager.render(selectedState);

        const selectedBlock = lane.querySelector(`.editor-clip[data-clip-id="${clip.id}"]`);
        expect(selectedState.selectedClipId).toBe(clip.id);
        expect(document.getElementById('editor-timeline-body').classList.contains('has-single-selected-clip')).toBe(true);
        expect(selectedBlock.classList.contains('is-selected')).toBe(true);
    });

    it('keeps the playhead position when selecting a linked audio clip by pointer click', () => {
        this.store.addAssetToTimeline('asset-video');
        const audioClip = this.store.getState().timeline.audio[0];
        const audioTrackName = this.store.findClipById(audioClip.id).trackName;
        this.store.setPlayheadTime(5.8);
        this.store.clearClipSelection();

        const lane = document.createElement('div');
        lane.className = 'editor-track-lane';
        lane.dataset.trackId = audioTrackName;
        const initialState = this.store.getState();
        this.manager.renderTrack(
            lane,
            audioTrackName,
            initialState.timeline[audioTrackName] || [],
            initialState.assets,
            initialState.selectedClipIds || [],
            initialState.selectedClipId,
            initialState,
            12,
            1200,
            64
        );

        const block = lane.querySelector(`.editor-clip[data-clip-id="${audioClip.id}"]`);
        block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 240
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const selectedState = this.store.getState();
        lane.innerHTML = '';
        this.manager.renderTrack(
            lane,
            audioTrackName,
            selectedState.timeline[audioTrackName] || [],
            selectedState.assets,
            selectedState.selectedClipIds || [],
            selectedState.selectedClipId,
            selectedState,
            12,
            1200,
            64
        );

        const selectedBlock = lane.querySelector(`.editor-clip[data-clip-id="${audioClip.id}"]`);
        expect(selectedState.selectedClipId).toBe(audioClip.id);
        expect(selectedState.selectedTrackName).toBe(audioTrackName);
        expect(selectedState.playheadTime).toBe(5.8);
        expect(selectedBlock.classList.contains('is-selected')).toBe(true);
        expect(selectedBlock.classList.contains('is-primary-selected')).toBe(true);
    });

    it('marks linked clip groups and highlights the companion of the selected clip', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const audioClip = this.store.getState().timeline.audio[0];
        this.store.setSelectedClips([videoClip.id], videoClip.id);
        const state = this.store.getState();
        const videoTrackName = this.store.findClipById(videoClip.id).trackName;
        const audioTrackName = this.store.findClipById(audioClip.id).trackName;
        const videoLane = document.createElement('div');
        const audioLane = document.createElement('div');

        this.manager.renderTrack(
            videoLane,
            videoTrackName,
            state.timeline[videoTrackName] || [],
            state.assets,
            state.selectedClipIds || [],
            state.selectedClipId,
            state,
            12,
            1200,
            64
        );
        this.manager.renderTrack(
            audioLane,
            audioTrackName,
            state.timeline[audioTrackName] || [],
            state.assets,
            state.selectedClipIds || [],
            state.selectedClipId,
            state,
            12,
            1200,
            64
        );

        const videoBlock = videoLane.querySelector(`.editor-clip[data-clip-id="${videoClip.id}"]`);
        const audioBlock = audioLane.querySelector(`.editor-clip[data-clip-id="${audioClip.id}"]`);

        expect(videoBlock.classList.contains('is-linked-group')).toBe(true);
        expect(audioBlock.classList.contains('is-linked-group')).toBe(true);
        expect(videoBlock.classList.contains('is-linked-companion')).toBe(false);
        expect(audioBlock.classList.contains('is-linked-companion')).toBe(true);
        expect(videoBlock.dataset.linkGroupId).toBe(audioBlock.dataset.linkGroupId);
        expect(videoBlock.querySelector('.editor-clip-link-badge')).toBeTruthy();
        expect(audioBlock.querySelector('.editor-clip-link-badge')).toBeTruthy();
    });

    it('keeps filmstrip thumbnails at a readable minimum width', () => {
        const layout = this.manager.getVideoFilmstripLayout(
            { width: 1920, height: 1080 },
            640,
            34,
            24
        );

        expect(layout.frameWidth).toBeGreaterThanOrEqual(104);
        expect(layout.renderedFrameCount).toBeLessThanOrEqual(7);
    });

    it('renders extracted video filmstrip frames instead of repeating a single source', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            filmstripFrames: ['data:image/webp;base64,aaa', 'data:image/webp;base64,bbb', 'data:image/webp;base64,ccc']
        });

        this.manager.render(this.store.getState());

        const filmstrip = document.querySelector('.editor-clip-video .editor-clip-filmstrip');
        const frames = filmstrip.querySelectorAll('.editor-clip-filmstrip-frame');

        expect(frames.length).toBeGreaterThan(3);
        expect(frames[0].getAttribute('style')).toContain('data:image/webp;base64,aaa');
        expect(frames[Math.floor(frames.length / 2)].getAttribute('style')).toContain('data:image/webp;base64,bbb');
        expect(frames[frames.length - 1].getAttribute('style')).toContain('data:image/webp;base64,ccc');
    });

    it('renders sprite-backed video filmstrips from a single image source', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            filmstripFrames: [],
            filmstripSprite: {
                src: 'data:image/webp;base64,sprite-sheet',
                frameCount: 3
            }
        });

        this.manager.render(this.store.getState());

        const filmstrip = document.querySelector('.editor-clip-video .editor-clip-filmstrip');
        const frames = filmstrip.querySelectorAll('.editor-clip-filmstrip-frame');

        expect(frames.length).toBeGreaterThan(3);
        expect(frames[0].getAttribute('style')).toContain('data:image/webp;base64,sprite-sheet');
        expect(frames[0].getAttribute('style')).toContain('background-size:300% 100%');
        expect(frames[Math.floor(frames.length / 2)].getAttribute('style')).toContain('background-position:50% center');
        expect(frames[frames.length - 1].getAttribute('style')).toContain('background-position:100% center');
    });

    it('samples portrait video filmstrip frames across the clip width without stretching them into a full-width strip', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            width: 720,
            height: 1280,
            filmstripFrames: ['data:image/webp;base64,aaa', 'data:image/webp;base64,bbb', 'data:image/webp;base64,ccc']
        });

        this.manager.render(this.store.getState());

        const filmstrip = document.querySelector('.editor-clip-video .editor-clip-filmstrip');
        const frames = filmstrip.querySelectorAll('.editor-clip-filmstrip-frame');

        expect(frames.length).toBeGreaterThan(3);
        expect(filmstrip.getAttribute('style')).toContain('--editor-filmstrip-frame-width:');
        expect(frames[0].getAttribute('style')).toContain('data:image/webp;base64,aaa');
        expect(frames[Math.floor(frames.length / 2)].getAttribute('style')).toContain('data:image/webp;base64,bbb');
        expect(frames[frames.length - 1].getAttribute('style')).toContain('data:image/webp;base64,ccc');
    });

    it('samples portrait sprite filmstrip frames across the clip width without distorting each frame', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            width: 720,
            height: 1280,
            filmstripFrames: [],
            filmstripSprite: {
                src: 'data:image/webp;base64,portrait-sprite',
                frameCount: 3
            }
        });

        this.manager.render(this.store.getState());

        const filmstrip = document.querySelector('.editor-clip-video .editor-clip-filmstrip');
        const frames = filmstrip.querySelectorAll('.editor-clip-filmstrip-frame');

        expect(frames.length).toBeGreaterThan(3);
        expect(filmstrip.getAttribute('style')).toContain('--editor-filmstrip-frame-width:');
        expect(frames[0].getAttribute('style')).toContain('background-position:0% center');
        expect(frames[Math.floor(frames.length / 2)].getAttribute('style')).toContain('background-position:50% center');
        expect(frames[frames.length - 1].getAttribute('style')).toContain('background-position:100% center');
    });

    it('uses each split clip source range when rendering video filmstrips', () => {
        const frameSources = Array.from({ length: 12 }, (_, index) => `data:image/webp;base64,frame${String(index).padStart(2, '0')}`);
        const firstClip = this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            width: 1920,
            height: 1080,
            duration: 12,
            filmstripFrames: frameSources
        });
        this.store.splitClipAtTime(firstClip.id, 4);

        this.manager.render(this.store.getState());

        const videoClips = Array.from(document.querySelectorAll('.editor-clip-video'));
        const firstClipFrames = videoClips[0].querySelectorAll('.editor-clip-filmstrip-frame');
        const secondClipFrames = videoClips[1].querySelectorAll('.editor-clip-filmstrip-frame');

        expect(videoClips).toHaveLength(2);
        expect(firstClipFrames[0].getAttribute('style')).toContain('data:image/webp;base64,frame00');
        expect(firstClipFrames[firstClipFrames.length - 1].getAttribute('style')).toContain('data:image/webp;base64,frame04');
        expect(secondClipFrames[0].getAttribute('style')).toContain('data:image/webp;base64,frame04');
        expect(secondClipFrames[secondClipFrames.length - 1].getAttribute('style')).toContain('data:image/webp;base64,frame11');
    });

    it('renders video clips as pure filmstrips without overlay labels', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            filmstripFrames: ['data:image/webp;base64,aaa', 'data:image/webp;base64,bbb']
        });

        this.manager.render(this.store.getState());

        const videoClip = document.querySelector('.editor-clip-video');

        expect(videoClip.querySelector('.editor-clip-filmstrip')).toBeTruthy();
        expect(videoClip.querySelector('.editor-clip-kind')).toBeNull();
        expect(videoClip.querySelector('.editor-clip-meta')).toBeNull();
        expect(videoClip.querySelector('.editor-clip-name')).toBeNull();
    });

    it('treats video dimension changes as a full render trigger for timeline filmstrips', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            filmstripFrames: ['data:image/webp;base64,aaa', 'data:image/webp;base64,bbb', 'data:image/webp;base64,ccc']
        });

        const initialState = this.store.getState();
        this.manager.cacheRenderedState(initialState);

        this.store.updateAsset('asset-video', {
            width: 720,
            height: 1280
        });

        const nextState = this.store.getState();
        expect(this.manager.shouldPerformFullRender(this.manager.lastRenderedState, nextState)).toBe(true);
    });

    it('requests filmstrip generation again when a video clip still has no frames', () => {
        this.manager.flow.ensureFilmstripForAsset = jest.fn();
        this.store.addAssetToTimeline('asset-video');
        this.store.updateAsset('asset-video', {
            src: 'C:/clip.mp4',
            filmstripFrames: [],
            filmstripStatus: 'failed'
        });

        this.manager.render(this.store.getState());

        expect(this.manager.flow.ensureFilmstripForAsset).toHaveBeenCalledWith(expect.objectContaining({
            id: 'asset-video',
            filmstripStatus: 'failed'
        }));
    });

    it('keeps sticky track labels inside the timeline left gutter while horizontally scrolled', () => {
        const fs = require('fs');
        const path = require('path');
        const css = fs.readFileSync(path.join(__dirname, '../../../src/styles/editor.css'), 'utf8');

        expect(css).toContain('.editor-timeline-body::before');
        expect(css).toContain('width: calc(var(--editor-timeline-body-padding-inline) + var(--editor-track-offset) + var(--editor-timeline-scroll-left, 0px));');
        expect(css).toContain('width: 100%;');
        expect(css).toContain('max-width: 100%;');
        expect(css).toContain('left: 0;');
        expect(css).toContain('overflow: hidden;');
        expect(css).toContain('.editor-track-gutter-shield');
        expect(css).toContain('grid-column: 1 / span 2;');
        expect(css).toContain('position: sticky;');
        expect(css).toContain('.editor-ruler-anchor');
        expect(css).toContain('.editor-ruler-origin-label');
        expect(css).toContain('.editor-ruler-tick.is-origin .editor-ruler-label');
        expect(css).toContain('.editor-timeline-playhead-overlay');
        expect(css).toContain('z-index: 5;');
        expect(css).toMatch(/#editor-timeline-tracks\s*\{[^}]*position:\s*relative;[^}]*\}/s);
        expect(css).not.toMatch(/#editor-timeline-tracks\s*\{[^}]*z-index:\s*1;[^}]*\}/s);
    });

    it('keeps audio selection styling visibly brighter for clip, track head, and waveform', () => {
        const fs = require('fs');
        const path = require('path');
        const css = fs.readFileSync(path.join(__dirname, '../../../src/styles/editor.css'), 'utf8');

        expect(css).toContain('.editor-track-label[data-track-type="audio"].is-selected');
        expect(css).toContain('background: #141a1f !important');
        expect(css).toContain('.editor-track-label[data-track-type="audio"].is-selected .editor-track-label-chip');
        expect(css).toContain('.editor-clip-audio.is-selected .editor-clip-waveform');
        expect(css).toContain('filter: none');
        expect(css).toContain('.editor-clip-audio.is-primary-selected');
        expect(css).toContain('rgba(147, 197, 253, 0.55)');
    });

    it('renders a fixed ruler origin label for the timeline start', () => {
        this.store.addAssetToTimeline('asset-video');

        this.manager.render(this.store.getState());

        const originAnchor = document.querySelector('.editor-ruler-anchor');
        const originLabel = document.querySelector('.editor-ruler-origin-label');
        const originTick = document.querySelector('.editor-ruler-tick.is-origin');

        expect(originAnchor).toBeTruthy();
        expect(originLabel).toBeTruthy();
        expect(originLabel.textContent).toBe('00:00');
        expect(originTick).toBeTruthy();
    });

    it('toggles track mute from the track header action', () => {
        this.manager.render(this.store.getState());

        const muteButton = document.querySelector('.editor-track-label[data-track="v1"] [data-track-action="mute"]');
        muteButton.click();

        expect(this.store.isTrackMuted('v1')).toBe(true);
        expect(this.store.getState().selectedTrackName).toBe('v1');
    });

    it('keeps reduced-zoom lanes shrinkable while rows stay aligned with the ruler', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.setTimelineZoom(25, { mode: 'manual' });

        this.manager.render(this.store.getState());

        const ruler = document.getElementById('editor-timeline-ruler');
        const row = document.querySelector('.editor-timeline-track');
        const lane = document.querySelector('.editor-track-lane[data-track-id="v1"]');

        expect(ruler.style.width).toBe('1096px');
        expect(lane.style.width).toBe(ruler.style.width);
        expect(lane.style.minWidth).toBe(ruler.style.width);
        expect(row.style.width).toBe('1200px');
    });

    it('keeps clip width stable when moving a reduced-zoom clip later in the timeline', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setTimelineZoom(25, { mode: 'manual' });

        this.manager.render(this.store.getState());

        const initialClip = document.querySelector('.editor-clip-video');
        const initialWidth = initialClip.style.width;
        const initialLeft = initialClip.style.left;

        this.store.moveSelectedClips(clip.id, 20);
        this.manager.render(this.store.getState());

        const movedClip = document.querySelector('.editor-clip-video');
        expect(movedClip.style.width).toBe(initialWidth);
        expect(movedClip.style.left).not.toBe(initialLeft);
    });

    it('toggles track lock from the track header context menu', () => {
        this.manager.render(this.store.getState());

        const label = document.querySelector('.editor-track-label[data-track="v1"]');
        label.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        const lockButton = this.manager.elements.trackContextMenu.querySelector('[data-action="toggle-lock"]');
        lockButton.click();

        expect(this.store.isTrackLocked('v1')).toBe(true);
        expect(this.store.getState().selectedTrackName).toBe('v1');
    });

    it('renames a track through the in-app rename dialog instead of prompt', async () => {
        this.manager.render(this.store.getState());
        this.manager.promptTrackRename = jest.fn().mockResolvedValue('主视频轨');

        await this.manager.runTrackContextMenuAction('rename-track', 'v1');

        expect(this.manager.promptTrackRename).toHaveBeenCalledWith('V1');
        expect(this.store.getTrackMeta('v1').name).toBe('主视频轨');
        expect(window.app.showToast).toHaveBeenCalledWith('轨道名称已更新', 'success');
    });

    it('shows simplified linked clip actions and enables paste after copying the context group', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.manager.render(this.store.getState());

        this.manager.showClipContextMenu(clip.id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));
        const pasteBeforeCopy = this.manager.elements.clipContextMenu.querySelector('[data-action="paste-clip"]');
        const pasteForwardBeforeCopy = this.manager.elements.clipContextMenu.querySelector('[data-action="paste-clip-forward"]');
        const copyButton = this.manager.elements.clipContextMenu.querySelector('[data-action="copy-context"]');
        const splitButton = this.manager.elements.clipContextMenu.querySelector('[data-action="split-clip"]');
        const detachButton = this.manager.elements.clipContextMenu.querySelector('[data-action="detach-linked"]');
        const deleteButton = this.manager.elements.clipContextMenu.querySelector('[data-action="delete-context"]');

        expect(splitButton).toBeTruthy();
        expect(detachButton).toBeTruthy();
        expect(copyButton).toBeTruthy();
        expect(copyButton.textContent).toContain('复制音视频组');
        expect(deleteButton.textContent).toContain('删除音视频组');
        expect(pasteBeforeCopy.disabled).toBe(true);
        expect(pasteForwardBeforeCopy.disabled).toBe(true);
        expect(this.manager.elements.clipContextMenu.querySelector('[data-action="duplicate-clip"]')).toBeNull();
        expect(this.manager.elements.clipContextMenu.querySelector('[data-action="duplicate-clip-group"]')).toBeNull();
        expect(this.manager.elements.clipContextMenu.querySelector('[data-action="ripple-delete-clip"]')).toBeNull();
        expect(this.manager.elements.clipContextMenu.querySelector('[data-action="ripple-delete-clip-group"]')).toBeNull();
        expect(this.store.getState().selectedClipIds).toHaveLength(2);

        this.manager.runClipContextMenuAction('copy-context', clip.id);
        this.manager.showClipContextMenu(clip.id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));
        const pasteAfterCopy = this.manager.elements.clipContextMenu.querySelector('[data-action="paste-clip"]');
        const pasteForwardAfterCopy = this.manager.elements.clipContextMenu.querySelector('[data-action="paste-clip-forward"]');

        expect(pasteAfterCopy.disabled).toBe(false);
        expect(pasteForwardAfterCopy.disabled).toBe(false);
    });

    it('disables linked clip context actions when a companion track is locked', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackLocked('a1');
        this.manager.render(this.store.getState());

        this.manager.showClipContextMenu(clip.id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));

        const splitButton = this.manager.elements.clipContextMenu.querySelector('[data-action="split-clip"]');
        const detachButton = this.manager.elements.clipContextMenu.querySelector('[data-action="detach-linked"]');
        const copyButton = this.manager.elements.clipContextMenu.querySelector('[data-action="copy-context"]');
        const deleteButton = this.manager.elements.clipContextMenu.querySelector('[data-action="delete-context"]');

        expect(splitButton.disabled).toBe(true);
        expect(detachButton.disabled).toBe(true);
        expect(copyButton.disabled).toBe(true);
        expect(deleteButton.disabled).toBe(true);
        expect(this.store.getState().selectedClipIds).toHaveLength(2);
    });

    it('copies only the clicked clip when using the context action on an unlinked clip', () => {
        const clip = this.store.addAssetToTimeline('asset-audio');

        this.manager.runClipContextMenuAction('copy-context', clip.id);
        this.store.setPlayheadTime(8);
        this.manager.runClipContextMenuAction('paste-clip', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.audio[1].timelineStart).toBe(6);
        expect(window.app.showToast).toHaveBeenCalledWith('当前片段已复制', 'success');
    });

    it('copies and pastes a linked clip group from the clip context menu', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.manager.runClipContextMenuAction('copy-context', clip.id);
        this.store.setPlayheadTime(8);
        this.manager.runClipContextMenuAction('paste-clip', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
        expect(state.selectedClipIds).toHaveLength(2);
        expect(window.app.showToast).toHaveBeenCalledWith('音视频组已复制', 'success');
        expect(window.app.showToast).toHaveBeenCalledWith('片段已粘贴到播放头', 'success');
    });

    it('repeats pasted clips forward from the clip context menu', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.manager.runClipContextMenuAction('copy-context', clip.id);
        this.store.setPlayheadTime(8);
        this.manager.runClipContextMenuAction('paste-clip', clip.id);
        this.store.setPlayheadTime(1);
        this.manager.runClipContextMenuAction('paste-clip-forward', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[2].timelineStart).toBe(24);
        expect(state.timeline.audio[2].timelineStart).toBe(24);
        expect(window.app.showToast).toHaveBeenCalledWith('已向后连续粘贴一份', 'success');
    });

    it('splits the clicked linked video together with its audio from the clip context menu', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.setPlayheadTime(4);

        this.manager.runClipContextMenuAction('split-clip', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(4);
        expect(state.timeline.audio[0].timelineEnd).toBe(4);
        expect(state.timeline.audio[1].timelineStart).toBe(4);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('shows a merge action for a selected adjacent clip pair and merges them', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.detachLinkedClipGroup(clip.id);
        this.store.splitClipAtTime(clip.id, 4);
        const [firstClip, secondClip] = this.store.getState().timeline.video;
        this.store.setSelectedClips([firstClip.id, secondClip.id], secondClip.id);

        this.manager.showClipContextMenu(secondClip.id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));
        const mergeButton = this.manager.elements.clipContextMenu.querySelector('[data-action="merge-context"]');

        expect(mergeButton).toBeTruthy();

        this.manager.runClipContextMenuAction('merge-context', secondClip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(window.app.showToast).toHaveBeenCalledWith('片段已合并', 'success');
    });

    it('offers merge for a clicked split linked clip without preselecting the adjacent pair', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.splitClipAtTime(clip.id, 4);
        const secondVideoClip = this.store.getState().timeline.video[1];

        this.manager.render(this.store.getState());
        this.manager.showClipContextMenu(secondVideoClip.id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));
        const mergeButton = this.manager.elements.clipContextMenu.querySelector('[data-action="merge-context"]');

        expect(mergeButton).toBeTruthy();

        this.manager.runClipContextMenuAction('merge-context', secondVideoClip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.audio[0].timelineEnd).toBe(12);
        expect(state.timeline.video[0].linkGroupId).toBe(state.timeline.audio[0].linkGroupId);
    });

    it('shows a warning when merge is requested without a valid adjacent pair', () => {
        const clip = this.store.addAssetToTimeline('asset-audio');

        this.manager.runClipContextMenuAction('merge-context', clip.id);

        expect(window.app.showToast).toHaveBeenCalledWith('请先选中同轨相邻的两个连续片段', 'warning');
    });

    it('splits the clicked linked audio together with its video from the clip context menu', () => {
        this.store.addAssetToTimeline('asset-video');
        const audioClipId = this.store.getState().timeline.audio[0].id;
        this.store.setPlayheadTime(5);

        this.manager.runClipContextMenuAction('split-clip', audioClipId);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(5);
        expect(state.timeline.video[1].timelineStart).toBe(5);
        expect(state.timeline.audio[0].timelineEnd).toBe(5);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('does not split from the clip context menu when the playhead is on the clip boundary', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.setPlayheadTime(0);

        this.manager.runClipContextMenuAction('split-clip', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(window.app.showToast).toHaveBeenCalledWith('请把红线移到片段内部再分割', 'warning');
    });

    it('detaches linked audio and video from the clip context menu', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClipId = this.store.getState().timeline.audio[0].id;

        this.manager.runClipContextMenuAction('detach-linked', clip.id);

        this.store.moveSelectedClips(clip.id, 6);

        const state = this.store.getState();

        expect(this.store.getLinkedClipIds(clip.id)).toEqual([clip.id]);
        expect(state.selectedClipIds).toEqual([clip.id]);
        expect(state.timeline.video[0].timelineStart).toBe(6);
        expect(state.timeline.audio.find((audioClip) => audioClip.id === linkedAudioClipId)?.timelineStart).toBe(0);
    });

    it('deletes only the clicked clip when using the context action on an unlinked clip', () => {
        const clip = this.store.addAssetToTimeline('asset-audio');

        this.manager.runClipContextMenuAction('delete-context', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(0);
    });

    it('deletes the full linked group when using the context action on a linked clip', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.manager.runClipContextMenuAction('delete-context', clip.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(0);
    });

    it('splits linked group when playhead only intersects a subset of clips in the group', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const state1 = this.store.getState();
        const audioClip = state1.timeline.audio.find(c => c.linkGroupId === videoClip.linkGroupId);
        expect(audioClip).toBeTruthy();

        // 使用 store.updateClip 正确修改音频片段的位置与时长，使其只存在于 6-12s
        this.store.updateClip(audioClip.id, {
            timelineStart: 6,
            duration: 6
        });

        // 将播放头设置在 3s 处（此时与视频相交，但与音频不相交，音频在右侧）
        this.store.setPlayheadTime(3);

        // 执行分割操作
        this.manager.runClipContextMenuAction('split-clip', videoClip.id);

        const state2 = this.store.getState();
        // 视频被分割成两段，音频没有被分割（保持一段）
        expect(state2.timeline.video).toHaveLength(2);
        expect(state2.timeline.audio).toHaveLength(1);

        const firstVideoClip = state2.timeline.video[0];
        const secondVideoClip = state2.timeline.video[1];
        expect(firstVideoClip.timelineEnd).toBe(3);
        expect(secondVideoClip.timelineStart).toBe(3);

        // 验证由于音频位于分割线右侧，其 linkGroupId 应更新为新分割出的右侧视频片段的 linkGroupId
        const updatedAudioClip = state2.timeline.audio[0];
        expect(updatedAudioClip.linkGroupId).toBe(secondVideoClip.linkGroupId);
    });
});
