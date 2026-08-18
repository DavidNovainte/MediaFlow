/** @jest-environment jsdom */

describe('EditorTimelineDragManager', () => {
    const createPointerLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true });
        Object.entries(init).forEach(([key, value]) => {
            if (key === 'target') return;
            event[key] = value;
        });
        return event;
    };

    const getTranslate = (value) => {
        const match = String(value || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (!match) return { x: 0, y: 0 };
        return {
            x: Number.parseFloat(match[1]) || 0,
            y: Number.parseFloat(match[2]) || 0
        };
    };

    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineSnapUtils');
        require('../../../src/features/editor/timeline/EditorTimelineDragManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="editor-timeline-body" id="editor-timeline-body">
                <div class="editor-track-lane" id="lane">
                    <button id="clip-block" type="button"></button>
                </div>
                <div class="editor-track-lane" id="lane-v2"></div>
                <div class="editor-track-lane" id="lane-a1">
                    <button id="audio-clip-block" type="button"></button>
                </div>
                <div class="editor-track-lane" id="lane-a2"></div>
            </div>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 }
        ]);
        this.targetTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        this.targetAudioTrackId = this.store.createTrackAdjacent('a1', 'below', 'A2');
        this.store.selectTrack('v1');
        this.clip = this.store.addAssetToTimeline('asset-video');
        this.audioClip = this.store.getTrack('a1')[0];
        this.block = document.getElementById('clip-block');
        this.lane = document.getElementById('lane');
        this.targetLane = document.getElementById('lane-v2');
        this.audioBlock = document.getElementById('audio-clip-block');
        this.audioLane = document.getElementById('lane-a1');
        this.targetAudioLane = document.getElementById('lane-a2');
        this.timelineBody = document.getElementById('editor-timeline-body');
        this.lane.dataset.trackId = 'v1';
        this.lane.dataset.trackType = 'video';
        this.lane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1120, bottom: 80, width: 1120, height: 80 });
        this.targetLane.dataset.trackId = this.targetTrackId;
        this.targetLane.dataset.trackType = 'video';
        this.targetLane.getBoundingClientRect = () => ({ left: 0, top: 90, right: 1120, bottom: 170, width: 1120, height: 80 });
        this.audioLane.dataset.trackId = 'a1';
        this.audioLane.dataset.trackType = 'audio';
        this.audioLane.getBoundingClientRect = () => ({ left: 0, top: 180, right: 1120, bottom: 260, width: 1120, height: 80 });
        this.targetAudioLane.dataset.trackId = this.targetAudioTrackId;
        this.targetAudioLane.dataset.trackType = 'audio';
        this.targetAudioLane.getBoundingClientRect = () => ({ left: 0, top: 270, right: 1120, bottom: 350, width: 1120, height: 80 });
        this.block.className = 'editor-clip editor-clip-video';
        this.block.dataset.clipId = this.clip.id;
        this.block.style.left = '0px';
        this.block.getBoundingClientRect = () => ({
            left: Number.parseFloat(this.block.style.left) || 0,
            top: 5,
            right: (Number.parseFloat(this.block.style.left) || 0) + 672,
            bottom: 75,
            width: 672,
            height: 70
        });
        this.audioBlock.className = 'editor-clip editor-clip-audio';
        this.audioBlock.dataset.clipId = this.audioClip.id;
        this.audioBlock.style.left = '0px';
        this.audioBlock.getBoundingClientRect = () => ({
            left: Number.parseFloat(this.audioBlock.style.left) || 0,
            top: 185,
            right: (Number.parseFloat(this.audioBlock.style.left) || 0) + 672,
            bottom: 255,
            width: 672,
            height: 70
        });
        this.block.setPointerCapture = jest.fn();
        this.block.releasePointerCapture = jest.fn();
        document.elementFromPoint = jest.fn((_x, y) => (y >= 90 ? this.targetLane : this.lane));

        this.manager = new window.EditorTimelineDragManager({
            store: this.store
        });
        this.manager.attachClip(this.block, this.clip, 20);
    });

    it('does not duplicate clips when Alt is held without starting a drag', () => {
        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            altKey: true,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
    });

    it('selects the clip on plain pointer up even without a drag move', () => {
        this.store.clearClipSelection();

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const state = this.store.getState();
        expect(state.selectedClipId).toBe(this.clip.id);
        expect(state.selectedClipIds).toContain(this.clip.id);
    });

    it('ignores move and up events from a different pointer', () => {
        this.store.clearClipSelection();

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 2,
            clientX: 56,
            clientY: 20
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 2
        }));

        expect(this.manager.dragState).not.toBeNull();
        expect(this.manager.dragState.hasStartedDrag).toBe(false);
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(0);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const state = this.store.getState();
        expect(this.manager.dragState).toBeNull();
        expect(state.selectedClipId).toBe(this.clip.id);
        expect(state.timeline.video[0].timelineStart).toBe(0);
    });

    it('moves the original linked clip group during a normal drag', () => {
        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            target: this.block
        }));

        expect(this.timelineBody.classList.contains('is-dragging-clips')).toBe(true);
        expect(this.timelineBody.classList.contains('is-copy-dragging')).toBe(false);

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 56,
            clientY: 20
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {}));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].timelineStart).toBe(1);
        expect(state.timeline.audio[0].timelineStart).toBe(1);
        expect(this.timelineBody.classList.contains('is-dragging-clips')).toBe(false);
        expect(this.block.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('starts dragging on vertical movement when moving a linked group to another track', () => {
        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 0,
            clientY: 120,
            pointerId: 1
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const videoMatch = this.store.findClipById(this.clip.id);
        const audioMatch = this.store.findClipById(this.audioClip.id);
        expect(videoMatch.trackName).toBe(this.targetTrackId);
        expect(videoMatch.clip.timelineStart).toBe(0);
        expect(audioMatch.trackName).toBe(this.targetAudioTrackId);
        expect(audioMatch.clip.timelineStart).toBe(0);
    });

    it('does not treat a locked same-type target track as a drop target', () => {
        this.store.toggleTrackLocked(this.targetTrackId);

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 448,
            clientY: 120,
            pointerId: 1
        }));

        expect(this.manager.dragState.targetTrackId).toBe('v1');
        expect(this.targetLane.classList.contains('is-drop-target')).toBe(false);
        expect(this.lane.classList.contains('is-drop-target')).toBe(true);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const videoMatch = this.store.findClipById(this.clip.id);
        expect(videoMatch.trackName).toBe('v1');
    });

    it('does not start a drag preview when a linked companion track is locked', () => {
        this.store.toggleTrackLocked('a1');

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 56,
            clientY: 20,
            pointerId: 1
        }));

        expect(this.manager.dragState.hasStartedDrag).toBe(false);
        expect(this.timelineBody.querySelector('.editor-drag-preview-layer')).toBeNull();

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const state = this.store.getState();
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.audio[0].timelineStart).toBe(0);
        expect(state.selectedClipId).toBe(this.clip.id);
    });

    it('reuses an existing empty lower video track while dragging below visible video lanes', () => {
        const initialVideoTrackCount = this.store.getTrackIdsByType('video').length;
        document.elementFromPoint = jest.fn(() => this.timelineBody);

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 0,
            clientY: 230,
            pointerId: 1
        }));
        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 0,
            clientY: 250,
            pointerId: 1
        }));

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackCount);
        expect(this.manager.dragState.targetTrackId).toBe(this.targetTrackId);
        expect(this.manager.dragState.autoCreatedBoundaryTrackId).toBeFalsy();

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));
    });

    it('auto-creates at most one lower video track when the boundary track already has content', () => {
        this.store.insertAssetAtTime('asset-video', 13, this.targetTrackId);
        const initialVideoTrackCount = this.store.getTrackIdsByType('video').length;
        document.elementFromPoint = jest.fn(() => this.timelineBody);

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 0,
            clientY: 230,
            pointerId: 1
        }));
        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 0,
            clientY: 250,
            pointerId: 1
        }));

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackCount + 1);
        expect(this.manager.dragState.autoCreatedBoundaryTrackId).toBeTruthy();

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));
    });

    it('duplicates the linked clip group before dragging when Alt is held', () => {
        const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

        try {
            this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
                button: 0,
                pointerId: 1,
                clientX: 0,
                clientY: 20,
                altKey: true,
                target: this.block
            }));

            expect(this.timelineBody.classList.contains('is-dragging-clips')).toBe(true);
            expect(this.timelineBody.classList.contains('is-copy-dragging')).toBe(true);

            document.dispatchEvent(createPointerLikeEvent('pointermove', {
                clientX: 56,
                clientY: 20
            }));
            document.dispatchEvent(createPointerLikeEvent('pointerup', {}));

            const state = this.store.getState();
            expect(state.timeline.video).toHaveLength(2);
            expect(state.timeline.audio).toHaveLength(2);
            expect(state.timeline.video[0].timelineStart).toBe(0);
            expect(state.timeline.audio[0].timelineStart).toBe(0);
            expect(state.timeline.video[1].timelineStart).toBe(13);
            expect(state.timeline.audio[1].timelineStart).toBe(13);
            expect(state.selectedClipIds).toHaveLength(2);
            expect(this.timelineBody.classList.contains('is-copy-dragging')).toBe(false);
            expect(this.block.releasePointerCapture).toHaveBeenCalledWith(1);
        } finally {
            randomSpy.mockRestore();
            dateNowSpy.mockRestore();
        }
    });

    it('does not throw when pointer capture fails during clip drag start', () => {
        this.block.setPointerCapture = jest.fn(() => {
            throw new DOMException('InvalidStateError', 'InvalidStateError');
        });

        expect(() => {
            this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
                button: 0,
                pointerId: 1,
                clientX: 0,
                clientY: 20,
                target: this.block
            }));
        }).not.toThrow();

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 56,
            clientY: 20,
            pointerId: 1
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const state = this.store.getState();
        expect(state.timeline.video[0].timelineStart).toBe(1);
    });

    it('moves a detached clip onto another same-type track instead of pushing it to the source tail', () => {
        this.store.detachLinkedClipGroup(this.clip.id);
        const second = this.store.addAssetToTimeline('asset-video');

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 448,
            clientY: 120,
            pointerId: 1
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        const firstMatch = this.store.findClipById(this.clip.id);
        const secondMatch = this.store.findClipById(second.id);
        expect(firstMatch.trackName).toBe(this.targetTrackId);
        expect(firstMatch.clip.timelineStart).toBe(8);
        expect(secondMatch.trackName).toBe('v1');
        expect(secondMatch.clip.timelineStart).toBe(12);
    });

    it('renders overlay preview clones and hides the source clips only while dragging', () => {
        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 448,
            clientY: 120,
            pointerId: 1
        }));

        const previewLayer = this.timelineBody.querySelector('.editor-drag-preview-layer');
        expect(previewLayer).not.toBeNull();
        expect(previewLayer.querySelectorAll('.editor-drag-preview-clone')).toHaveLength(2);
        expect(this.block.classList.contains('is-drag-source-hidden')).toBe(true);
        expect(this.audioBlock.classList.contains('is-drag-source-hidden')).toBe(true);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        expect(this.timelineBody.querySelector('.editor-drag-preview-layer')).toBeNull();
        expect(this.block.classList.contains('is-drag-source-hidden')).toBe(false);
        expect(this.audioBlock.classList.contains('is-drag-source-hidden')).toBe(false);
    });

    it('marks the drop lane when the drag preview snaps to a sibling clip edge', () => {
        this.store.detachLinkedClipGroup(this.clip.id);
        this.store.addAssetToTimeline('asset-video');

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 658,
            clientY: 20,
            pointerId: 1
        }));

        expect(this.lane.classList.contains('is-drop-target')).toBe(true);
        expect(this.lane.classList.contains('is-snap-active')).toBe(true);
        expect(this.manager.dragState.pendingTargetStart).toBe(12);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        expect(this.lane.classList.contains('is-snap-active')).toBe(false);
    });

    it('auto-scrolls the timeline horizontally while dragging near the viewport edge', () => {
        Object.defineProperty(this.timelineBody, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(this.timelineBody, 'scrollWidth', { configurable: true, value: 1500 });
        this.timelineBody.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 360, width: 500, height: 360 });

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 496,
            clientY: 20,
            pointerId: 1
        }));

        expect(this.timelineBody.scrollLeft).toBeGreaterThan(0);
        expect(this.timelineBody.style.getPropertyValue('--editor-timeline-scroll-left')).toBe(`${this.timelineBody.scrollLeft}px`);
        expect(this.manager.dragState.pendingTargetStart).toBeGreaterThan(496 / 56);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));
    });

    it('re-aligns linked audio preview with the dragged video when stored starts have drifted', () => {
        const audioMatch = this.store.findClipById(this.audioClip.id);
        audioMatch.clip.timelineStart = 4;
        audioMatch.clip.timelineEnd = 16;
        this.audioBlock.style.left = '224px';
        document.elementFromPoint = jest.fn((_x, y) => (y >= 90 ? this.targetLane : this.lane));

        this.block.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            clientY: 20,
            target: this.block
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 448,
            clientY: 120,
            pointerId: 1
        }));

        const previewClones = [...this.timelineBody.querySelectorAll('.editor-drag-preview-clone')];
        const videoClone = previewClones.find((element) => element.classList.contains('editor-clip-video'));
        const audioClone = previewClones.find((element) => element.classList.contains('editor-clip-audio'));
        const videoTranslate = getTranslate(videoClone?.style.transform);
        const audioTranslate = getTranslate(audioClone?.style.transform);
        const videoPreviewLeft = videoTranslate.x + (Number.parseFloat(videoClone?.style.left) || 0);
        const audioPreviewLeft = audioTranslate.x + (Number.parseFloat(audioClone?.style.left) || 0);

        expect(videoPreviewLeft).toBeCloseTo(audioPreviewLeft, 3);
        expect(videoTranslate.y).toBeCloseTo(90, 3);
        expect(audioTranslate.y).toBeCloseTo(90, 3);
    });
});
