/** @jest-environment jsdom */

describe('EditorInspectorManager', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/properties/EditorInspectorManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="editor-inspector-body"></div>
            <button class="editor-inspector-tab" data-tab="clip"></button>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 6 }
        ]);

        this.manager = new window.EditorInspectorManager({
            store: this.store
        });
        this.manager.init();
        this.unsubscribe = this.store.subscribe((state) => this.manager.render(state));
        this.manager.render(this.store.getState());
    });

    afterEach(() => {
        this.unsubscribe?.();
    });

    it('forces the inspector to stay on the single clip tab', () => {
        this.manager.activeTab = 'project';
        this.manager.render(this.store.getState());

        const tabs = document.querySelectorAll('.editor-inspector-tab');
        expect(tabs).toHaveLength(1);
        expect(this.manager.activeTab).toBe('clip');
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    });

    it('keeps secondary clip sections collapsed until toggled open', () => {
        const clip = this.store.insertAssetAtTime('asset-video', 0);

        this.manager.activeTab = 'clip';
        this.manager.render(this.store.getState());

        expect(document.querySelector('[data-section-key="transform"]')?.classList.contains('is-expanded')).toBe(true);
        expect(document.querySelector('[data-section-key="playback"]')?.classList.contains('is-collapsed')).toBe(true);
        expect(document.querySelector('[data-section-key="timing"]')?.classList.contains('is-collapsed')).toBe(true);

        document.querySelector('[data-inspector-action="toggle-section-playback"]')?.click();

        expect(this.store.getSelectedClip()?.id).toBe(clip.id);
        expect(document.querySelector('[data-section-key="playback"]')?.classList.contains('is-expanded')).toBe(true);
    });

    it('keeps showing the primary clip settings during multi-selection', () => {
        const videoClip = this.store.insertAssetAtTime('asset-video', 0);
        const audioClipId = this.store.getState().timeline.audio[0].id;

        this.store.setSelectedClips([videoClip.id, audioClipId], videoClip.id);
        this.manager.activeTab = 'clip';
        this.manager.render(this.store.getState());

        const inspectorText = document.getElementById('editor-inspector-body').textContent;
        expect(inspectorText).not.toContain('多选上下文');
        expect(inspectorText).toContain('缩放 %');
        expect(inspectorText).toContain('视频');
    });

    it('uses localized status messages for track panel actions', () => {
        this.store.selectTrack('v1');

        this.manager.trackDraftName = '';
        this.manager.handleAction('save-track-name');
        expect(this.manager.trackStatusMessage).toBe('轨道名称不能为空。');

        this.manager.trackDraftName = '主视频';
        this.manager.handleAction('save-track-name');
        expect(this.manager.trackStatusMessage).toBe('轨道名称已更新。');
        expect(this.store.getTrackMeta('v1').name).toBe('主视频');

        const extraTrackId = this.store.createTrack('video');
        this.store.selectTrack(extraTrackId);
        this.store.addAssetToTimeline('asset-video');
        this.manager.armedDeleteTrackId = extraTrackId;
        this.manager.handleAction('confirm-delete-track', extraTrackId);
        expect(this.manager.trackStatusMessage).toBe('轨道内还有片段，不能直接删除。');
    });

    it('does not treat playback speed changes as source trimming', () => {
        const clip = this.store.insertAssetAtTime('asset-video', 0);

        this.store.updateClip(clip.id, { speed: 2 });
        expect(this.manager.hasTrimmedSource(this.store.getSelectedClip())).toBe(false);

        this.store.updateClipTrim(clip.id, { sourceStart: 1, sourceEnd: 10 });
        expect(this.manager.hasTrimmedSource(this.store.getSelectedClip())).toBe(true);
    });

    it('shows the effective linked audio volume when a video clip is selected', () => {
        const clip = this.store.insertAssetAtTime('asset-video', 0);
        const linkedAudioClip = this.store.getState().timeline.audio[0];
        this.store.findClipById(linkedAudioClip.id).clip.volume = 35;

        this.manager.render(this.store.getState());

        expect(document.querySelector('input[data-field="volume"]')?.value).toBe('35');
    });

    it('copies effective linked audio playback settings from a selected video clip', () => {
        const clip = this.store.insertAssetAtTime('asset-video', 0);
        const linkedAudioClip = this.store.getState().timeline.audio[0];
        this.store.findClipById(linkedAudioClip.id).clip.volume = 35;
        this.store.findClipById(linkedAudioClip.id).clip.muted = true;

        const clipboard = this.manager.buildClipSettingsClipboard(clip);

        expect(clipboard.playback.volume).toBe(35);
        expect(clipboard.playback.muted).toBe(true);
    });
});
