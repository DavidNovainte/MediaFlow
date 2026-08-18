/** @jest-environment jsdom */

describe('EditorTimelineActions', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineActions');
        require('../../../src/features/editor/timeline/EditorTimelinePlayheadManager');
    });

    afterEach(() => {
        this.actions?.destroy?.();
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="btn-editor-undo"></button>
            <button id="btn-editor-redo"></button>
            <button id="btn-editor-insert-selected"></button>
            <button id="btn-editor-merge-clip"></button>
            <button id="btn-editor-split-clip"></button>
            <button id="btn-editor-delete-clip"></button>
            <button id="btn-editor-ripple-delete-clip"></button>
            <div class="editor-timeline-body" id="editor-timeline-body">
                <div id="editor-timeline-ruler"></div>
            </div>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 6 }
        ]);
        window.app = { showToast: jest.fn() };

        this.actions = new window.EditorTimelineActions({
            store: this.store,
            app: { router: { currentPage: 'editor' } }
        });
        this.actions.init();
    });

    it('disables insert when the selected asset track is locked', () => {
        this.store.selectAsset('asset-video');
        this.store.toggleTrackLocked('video');

        this.actions.render(this.store.getState());

        expect(document.getElementById('btn-editor-insert-selected').disabled).toBe(true);
        expect(document.getElementById('btn-editor-insert-selected').title).toBe('目标轨道已锁定');
        expect(document.getElementById('btn-editor-insert-selected').getAttribute('aria-disabled')).toBe('true');
    });

    it('explains disabled toolbar actions before a selection exists', () => {
        this.store.state.selectedAssetId = null;
        this.actions.render(this.store.getState());

        expect(document.getElementById('btn-editor-insert-selected').title).toBe('先在素材库选择素材');
        expect(document.getElementById('btn-editor-merge-clip').title).toBe('选择相邻片段后合并');
        expect(document.getElementById('btn-editor-split-clip').title).toBe('先选择片段');
        expect(document.getElementById('btn-editor-delete-clip').title).toBe('先选择片段');
        expect(document.getElementById('btn-editor-undo').title).toBe('暂无可撤销操作');
        expect(document.getElementById('btn-editor-redo').title).toBe('暂无可重做操作');
    });

    it('inserts the selected asset at the playhead from the toolbar', () => {
        this.store.selectAsset('asset-video');
        this.store.setPlayheadTime(5);

        this.actions.render(this.store.getState());
        document.getElementById('btn-editor-insert-selected').click();

        const state = this.store.getState();
        expect(state.timeline.video[0].timelineStart).toBe(5);
        expect(state.timeline.audio[0].timelineStart).toBe(5);
    });

    it('places toolbar inserts after existing linked clips instead of overlapping them', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.selectAsset('asset-video');
        this.store.setPlayheadTime(5);

        this.actions.render(this.store.getState());
        document.getElementById('btn-editor-insert-selected').click();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
    });

    it('disables clip actions when the selected clip track is locked', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.toggleTrackLocked('video');

        this.actions.render(this.store.getState());

        expect(document.getElementById('btn-editor-split-clip').disabled).toBe(true);
        expect(document.getElementById('btn-editor-delete-clip').disabled).toBe(true);
        expect(document.getElementById('btn-editor-ripple-delete-clip').disabled).toBe(true);
    });

    it('disables linked operations when a single selected clip has a locked companion', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(3);
        this.store.toggleTrackLocked('audio');

        this.actions.render(this.store.getState());
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

        expect(document.getElementById('btn-editor-split-clip').disabled).toBe(true);
        expect(document.getElementById('btn-editor-delete-clip').disabled).toBe(true);
        expect(document.getElementById('btn-editor-ripple-delete-clip').disabled).toBe(true);
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(this.store.getState().timeline.audio).toHaveLength(1);
    });

    it('deletes the linked source audio when deleting a selected video from the toolbar', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.getElementById('btn-editor-delete-clip').click();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(0);
        expect(state.selectedClipIds).toEqual([]);
        expect(state.selectedClipId).toBeNull();
    });

    it('deletes the linked source audio when deleting a selected video with the keyboard', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(0);
    });

    it('does not run destructive shortcuts from regular toolbar button focus', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.getElementById('btn-editor-delete-clip').dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Delete',
            bubbles: true
        }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
    });

    it('keeps destructive shortcuts active when a timeline clip itself has focus', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        const clipButton = document.createElement('button');
        clipButton.className = 'editor-clip';
        document.body.appendChild(clipButton);

        clipButton.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Delete',
            bubbles: true
        }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(0);
        expect(state.timeline.audio).toHaveLength(0);
    });

    it('splits a linked video selection together with its linked audio at the playhead time', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(3);

        this.actions.splitSelectedClip();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(3);
        expect(state.timeline.video[1].timelineStart).toBe(3);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.audio[0].timelineEnd).toBe(3);
        expect(state.timeline.audio[1].timelineStart).toBe(3);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('enables and runs merge for two adjacent selected clips', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.detachLinkedClipGroup(clip.id);
        this.store.splitClipAtTime(clip.id, 4);
        const [firstClip, secondClip] = this.store.getState().timeline.video;
        this.store.setSelectedClips([firstClip.id, secondClip.id], secondClip.id);

        this.actions.render(this.store.getState());
        expect(document.getElementById('btn-editor-merge-clip').disabled).toBe(false);

        document.getElementById('btn-editor-merge-clip').click();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
    });

    it('enables toolbar merge for a single selected segment when an adjacent split segment is mergeable', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.splitClipAtTime(clip.id, 4);
        const [, secondVideoClip] = this.store.getState().timeline.video;
        this.store.setSelectedClips([secondVideoClip.id], secondVideoClip.id);

        this.actions.render(this.store.getState());
        expect(document.getElementById('btn-editor-merge-clip').disabled).toBe(false);

        document.getElementById('btn-editor-merge-clip').click();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.audio[0].timelineEnd).toBe(12);
        expect(state.selectedClipIds).toEqual([state.timeline.video[0].id, state.timeline.audio[0].id]);
    });

    it('keeps merge disabled when the selection cannot be merged', () => {
        const first = this.store.addAssetToTimeline('asset-audio');
        const second = this.store.addAssetToTimeline('asset-audio');
        this.store.reorderClip(second.id, 8);
        this.store.setSelectedClips([first.id, second.id], second.id);

        this.actions.render(this.store.getState());

        expect(document.getElementById('btn-editor-merge-clip').disabled).toBe(true);
    });

    it('splits a linked audio selection together with its linked video at the playhead time', () => {
        this.store.addAssetToTimeline('asset-video');
        const audioClipId = this.store.getState().timeline.audio[0].id;
        this.store.selectClip(audioClipId);
        this.store.setPlayheadTime(4);

        this.actions.splitSelectedClip();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(4);
        expect(state.timeline.video[1].timelineStart).toBe(4);
        expect(state.timeline.audio[0].timelineEnd).toBe(4);
        expect(state.timeline.audio[1].timelineStart).toBe(4);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('splits a linked audio clip with S after timeline-style selection preserves the playhead', () => {
        this.store.addAssetToTimeline('asset-video');
        const audioClipId = this.store.getState().timeline.audio[0].id;
        this.store.setPlayheadTime(4);
        this.store.setClipSelection(audioClipId, { preservePlayhead: true });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = this.store.getState();
        expect(state.selectedTrackName).toBe(this.store.findClipById(state.selectedClipId)?.trackName);
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(4);
        expect(state.timeline.video[1].timelineStart).toBe(4);
        expect(state.timeline.audio[0].timelineEnd).toBe(4);
        expect(state.timeline.audio[1].timelineStart).toBe(4);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('does not split when the playhead is on the clip boundary', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(0);

        const result = this.actions.splitSelectedClip();

        const state = this.store.getState();
        expect(result).toBeNull();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(window.app.showToast).toHaveBeenCalledWith('请把红线移到片段内部再分割', 'warning');
    });

    it('keeps split enabled for the primary clip when multiple clips are selected', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');
        this.store.setSelectedClips([first.id, second.id], second.id);

        this.actions.render(this.store.getState());

        expect(document.getElementById('btn-editor-split-clip').disabled).toBe(false);
        expect(document.getElementById('btn-editor-delete-clip').disabled).toBe(false);
    });

    it('splits the primary selected linked group with the S shortcut even during multi-selection', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');
        this.store.setSelectedClips([first.id, second.id], second.id);
        this.store.setPlayheadTime(15);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[1].timelineEnd).toBe(15);
        expect(state.timeline.video[2].timelineStart).toBe(15);
        expect(state.timeline.audio[1].timelineEnd).toBe(15);
        expect(state.timeline.audio[2].timelineStart).toBe(15);
    });

    it('splits the clip under the playhead when the current primary selection no longer intersects it', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(4);
        this.actions.splitSelectedClip();

        this.store.setPlayheadTime(2);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[0].timelineEnd).toBe(2);
        expect(state.timeline.video[1].timelineStart).toBe(2);
        expect(state.timeline.video[1].timelineEnd).toBe(4);
        expect(state.timeline.audio[0].timelineEnd).toBe(2);
        expect(state.timeline.audio[1].timelineStart).toBe(2);
        expect(state.timeline.audio[1].timelineEnd).toBe(4);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('ignores repeated S keydown events so holding the key does not keep cutting to the right', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(2);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
        this.store.setPlayheadTime(5);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', repeat: true, bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(2);
        expect(state.timeline.video[1].timelineStart).toBe(2);
        expect(state.timeline.video[1].timelineEnd).toBe(12);
        expect(state.timeline.audio[0].timelineEnd).toBe(2);
        expect(state.timeline.audio[1].timelineStart).toBe(2);
        expect(state.timeline.audio[1].timelineEnd).toBe(12);
    });

    it('splits at the clicked ruler time even when a later segment remains selected', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(4);
        this.actions.splitSelectedClip();

        const playheadManager = new window.EditorTimelinePlayheadManager({
            store: this.store,
            timelineSelectionManager: { shouldStartSelection: jest.fn(() => false) }
        });
        const ruler = document.getElementById('editor-timeline-ruler');
        Object.defineProperty(ruler, 'clientWidth', {
            configurable: true,
            value: 1200
        });
        Object.defineProperty(ruler, 'offsetWidth', {
            configurable: true,
            value: 1200
        });
        ruler.getBoundingClientRect = () => ({ left: 100, top: 0, right: 1300, bottom: 24, width: 1200, height: 24 });
        ruler.setPointerCapture = jest.fn();
        ruler.releasePointerCapture = jest.fn();
        playheadManager.attachTarget(ruler, 24);

        const pointerDown = new Event('pointerdown', { bubbles: true });
        pointerDown.button = 0;
        pointerDown.pointerId = 1;
        pointerDown.clientX = 200;
        ruler.dispatchEvent(pointerDown);

        const pointerUp = new Event('pointerup', { bubbles: true });
        pointerUp.pointerId = 1;
        document.dispatchEvent(pointerUp);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = this.store.getState();
        expect(state.playheadTime).toBeCloseTo(2, 3);
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[0].timelineEnd).toBeCloseTo(2, 3);
        expect(state.timeline.video[1].timelineStart).toBeCloseTo(2, 3);
        expect(state.timeline.audio[0].timelineEnd).toBeCloseTo(2, 3);
        expect(state.timeline.audio[1].timelineStart).toBeCloseTo(2, 3);
    });

    it('prefers the visible playhead overlay position when it drifts from stored playhead time', () => {
        this.store.upsertAssets([
            { id: 'asset-long-video', name: 'long-clip.mp4', kind: 'video', duration: 24 }
        ]);
        const clip = this.store.addAssetToTimeline('asset-long-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(13.3);
        this.actions.splitSelectedClip();

        const timelineBody = document.getElementById('editor-timeline-body');
        const ruler = document.getElementById('editor-timeline-ruler');
        Object.defineProperty(ruler, 'clientWidth', {
            configurable: true,
            value: 1200
        });
        Object.defineProperty(ruler, 'offsetWidth', {
            configurable: true,
            value: 1200
        });
        ruler.dataset.renderDuration = '24';
        timelineBody.style.setProperty('--editor-playhead-x', `${(4.6 / 24) * 1200}px`);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = this.store.getState();
        expect(state.playheadTime).toBeCloseTo(4.6, 2);
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[0].timelineEnd).toBeCloseTo(4.6, 2);
        expect(state.timeline.audio[0].timelineEnd).toBeCloseTo(4.6, 2);
    });

    it('copies the selected clip group and pastes it at the playhead with keyboard shortcuts', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        this.store.setPlayheadTime(8);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
        expect(state.selectedClipIds).toHaveLength(2);
    });

    it('repeats pasted clips forward with Ctrl/Cmd+Shift+V', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        this.store.setPlayheadTime(8);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
        this.store.setPlayheadTime(1);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[2].timelineStart).toBe(24);
        expect(state.timeline.audio[2].timelineStart).toBe(24);
    });

    it('duplicates the selected clip group with Ctrl/Cmd+D', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
    });

    it('copies the full explicit multi-selection with Ctrl/Cmd+C', () => {
        const first = this.store.addAssetToTimeline('asset-audio');
        const second = this.store.addAssetToTimeline('asset-audio');
        this.store.setSelectedClips([first.id, second.id], second.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));

        expect(this.store.clipboard?.entries?.map((entry) => entry.sourceClipId)).toEqual([first.id, second.id]);
    });

    it('duplicates the full explicit multi-selection with Ctrl/Cmd+D', () => {
        const first = this.store.addAssetToTimeline('asset-audio');
        const second = this.store.addAssetToTimeline('asset-audio');
        this.store.setSelectedClips([first.id, second.id], second.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));

        const state = this.store.getState();
        expect(state.timeline.audio).toHaveLength(4);
        expect(state.selectedClipIds).toHaveLength(2);
        expect(state.timeline.audio[2].timelineStart).toBe(12);
        expect(state.timeline.audio[3].timelineStart).toBe(18);
    });

    it('undo and redo buttons follow history state and apply timeline changes', () => {
        const undoButton = document.getElementById('btn-editor-undo');
        const redoButton = document.getElementById('btn-editor-redo');

        this.actions.render(this.store.getState());
        expect(undoButton.disabled).toBe(true);
        expect(redoButton.disabled).toBe(true);

        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(1);

        this.actions.render(this.store.getState());
        expect(undoButton.disabled).toBe(false);
        expect(redoButton.disabled).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
        this.actions.render(this.store.getState());

        expect(undoButton.disabled).toBe(false);
        expect(redoButton.disabled).toBe(true);

        undoButton.click();
        this.actions.render(this.store.getState());
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(undoButton.disabled).toBe(false);
        expect(redoButton.disabled).toBe(false);

        redoButton.click();
        this.actions.render(this.store.getState());
        expect(this.store.getState().timeline.video).toHaveLength(2);
        expect(undoButton.disabled).toBe(false);
    });

    it('undoes and redoes timeline edits with Ctrl/Cmd+Z and Ctrl+Y', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.setPlayheadTime(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
        expect(this.store.getState().timeline.video).toHaveLength(2);
        expect(this.store.getState().timeline.audio).toHaveLength(2);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(this.store.getState().timeline.audio).toHaveLength(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
        expect(this.store.getState().timeline.video).toHaveLength(2);
        expect(this.store.getState().timeline.audio).toHaveLength(2);
    });

    it('toggles timeline snapping with the N shortcut even when no clip is selected', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));

        expect(this.store.getState().timelineSnapEnabled).toBe(false);
        expect(window.app.showToast).toHaveBeenCalledWith('时间线吸附已关闭', 'info');
    });

    it('toggles timeline snapping with the N shortcut when a clip is selected', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));

        expect(this.store.getState().timelineSnapEnabled).toBe(false);
        expect(window.app.showToast).toHaveBeenCalledWith('时间线吸附已关闭', 'info');
    });
});
