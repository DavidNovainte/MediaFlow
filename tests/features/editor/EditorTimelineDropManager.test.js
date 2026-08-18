/** @jest-environment jsdom */

describe('EditorTimelineDropManager', () => {
    const createDragLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.entries(init).forEach(([key, value]) => {
            event[key] = value;
        });
        event.dataTransfer = {
            getData: jest.fn((key) => (key === 'text/editor-asset-id' ? init.assetId : ''))
        };
        return event;
    };

    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineDropManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="editor-timeline-body" id="editor-timeline-body">
                <div id="editor-timeline-tracks">
                    <div class="editor-track-lane" id="lane-v1" data-track-id="v1" data-track-type="video"></div>
                    <div class="editor-track-lane" id="lane-a1" data-track-id="a1" data-track-type="audio"></div>
                </div>
            </div>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 }
        ]);
        this.store.addAssetToTimeline('asset-video');

        this.timelineBody = document.getElementById('editor-timeline-body');
        this.videoLane = document.getElementById('lane-v1');
        this.audioLane = document.getElementById('lane-a1');
        this.timelineBody.getBoundingClientRect = () => ({ left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600 });
        this.videoLane.getBoundingClientRect = () => ({ left: 180, top: 120, right: 880, bottom: 190, width: 700, height: 70 });
        this.audioLane.getBoundingClientRect = () => ({ left: 180, top: 210, right: 880, bottom: 280, width: 700, height: 70 });
        document.elementFromPoint = jest.fn(() => this.timelineBody);

        this.manager = new window.EditorTimelineDropManager({
            store: this.store
        });
        this.manager.attachTimelineBody(this.timelineBody);
    });

    it('auto-creates only one video track when an asset is dragged below existing video lanes', () => {
        const initialVideoTrackCount = this.store.getTrackIdsByType('video').length;
        const firstDragOver = createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        });

        this.timelineBody.dispatchEvent(firstDragOver);

        const videoTrackIdsAfterCreate = this.store.getTrackIdsByType('video');
        const createdTrackId = videoTrackIdsAfterCreate[videoTrackIdsAfterCreate.length - 1];
        expect(firstDragOver.defaultPrevented).toBe(true);
        expect(videoTrackIdsAfterCreate).toHaveLength(initialVideoTrackCount + 1);
        expect(this.store.getTrack(createdTrackId)).toHaveLength(0);

        this.timelineBody.dispatchEvent(createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 540,
            clientY: 540
        }));

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackCount + 1);

        const drop = createDragLikeEvent('drop', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        });
        this.timelineBody.dispatchEvent(drop);

        expect(drop.defaultPrevented).toBe(true);
        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackCount + 1);
        expect(this.store.getTrack(createdTrackId)).toHaveLength(1);
        expect(this.store.getState().selectedTrackName).toBe(createdTrackId);
    });

    it('removes an auto-created empty track when the drag is canceled without changing history', () => {
        const initialVideoTrackIds = this.store.getTrackIdsByType('video');
        const initialUndoLength = this.store.undoStack.length;

        this.timelineBody.dispatchEvent(createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        }));

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackIds.length + 1);
        expect(this.store.undoStack).toHaveLength(initialUndoLength);

        document.dispatchEvent(createDragLikeEvent('dragend', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        }));

        expect(this.store.getTrackIdsByType('video')).toEqual(initialVideoTrackIds);
        expect(this.manager.autoDropState).toBeNull();
        expect(this.store.undoStack).toHaveLength(initialUndoLength);
    });

    it('undoes a successful auto-track drop as one edit including the new tracks', () => {
        const initialVideoTrackIds = this.store.getTrackIdsByType('video');
        const initialAudioTrackIds = this.store.getTrackIdsByType('audio');

        this.timelineBody.dispatchEvent(createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        }));

        const drop = createDragLikeEvent('drop', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        });
        this.timelineBody.dispatchEvent(drop);

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackIds.length + 1);
        expect(this.store.getTrackIdsByType('audio')).toHaveLength(initialAudioTrackIds.length + 1);

        expect(this.store.undo()).toBe(true);
        expect(this.store.getTrackIdsByType('video')).toEqual(initialVideoTrackIds);
        expect(this.store.getTrackIdsByType('audio')).toEqual(initialAudioTrackIds);
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(this.store.getState().timeline.audio).toHaveLength(1);
    });

    it('drops onto an existing lane with a single store update', () => {
        const updates = [];
        const unsubscribe = this.store.subscribe((state, metadata) => {
            if (metadata.changeType === 'update') {
                updates.push(state);
            }
        });
        this.manager.attachLane(this.videoLane, 'v1');

        this.videoLane.dispatchEvent(createDragLikeEvent('drop', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 150
        }));

        unsubscribe();
        expect(updates).toHaveLength(1);
        expect(this.store.getState().selectedClipId).toBe(this.store.getTrack('v1')[1].id);
    });

    it('auto-scrolls the timeline while dragging an asset near the viewport edge', () => {
        Object.defineProperty(this.timelineBody, 'clientWidth', { configurable: true, value: 800 });
        Object.defineProperty(this.timelineBody, 'scrollWidth', { configurable: true, value: 1800 });
        this.manager.attachLane(this.videoLane, 'v1');

        const dragOver = createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 896,
            clientY: 150
        });
        this.videoLane.dispatchEvent(dragOver);

        expect(dragOver.defaultPrevented).toBe(true);
        expect(this.timelineBody.scrollLeft).toBeGreaterThan(0);
        expect(this.timelineBody.style.getPropertyValue('--editor-timeline-scroll-left')).toBe(`${this.timelineBody.scrollLeft}px`);
        expect(this.videoLane.classList.contains('is-drop-target')).toBe(true);
    });

    it('reuses an existing empty video track instead of creating another one', () => {
        const reusableTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2', { select: false });
        const initialVideoTrackCount = this.store.getTrackIdsByType('video').length;

        this.timelineBody.dispatchEvent(createDragLikeEvent('dragover', {
            assetId: 'asset-video',
            clientX: 530,
            clientY: 520
        }));

        expect(this.store.getTrackIdsByType('video')).toHaveLength(initialVideoTrackCount);
        expect(this.manager.autoDropState.targetTrackId).toBe(reusableTrackId);
    });
});
