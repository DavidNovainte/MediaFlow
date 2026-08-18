/** @jest-environment jsdom */

describe('EditorExportManager', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/export/EditorExportManager');
    });

    beforeEach(() => {
        delete window.app;
        delete window.mediaflow;
        delete window.EditorTimelineProjectSnapshot;
        delete window.CreatorExportPlanner;
        delete window.CreatorExportCapabilityMatrix;

        document.body.innerHTML = '<button id="btn-editor-export" type="button"></button>';

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12, path: 'C:/media/clip.mp4' },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 6, path: 'C:/media/voice.mp3' }
        ]);

        this.manager = new window.EditorExportManager({
            store: this.store
        });
        this.manager.init();

        // Editor labels are localized via window.i18n; provide zh-CN so the
        // export button title asserts against the localized label.
        window.i18n = {
            t: (key) => ({
                'editor.exportMp4': '导出 MP4',
                'editor.exportMp3': '导出 MP3'
            }[key])
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete window.app;
        delete window.mediaflow;
        delete window.i18n;
        delete window.EditorTimelineProjectSnapshot;
        delete window.CreatorExportPlanner;
        delete window.CreatorExportCapabilityMatrix;
    });

    it('keeps export enabled when only a secondary video track has content', () => {
        const secondVideoTrackId = this.store.createTrack('video');
        this.store.insertAssetAtTime('asset-video', 0, secondVideoTrackId);

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(this.manager.getExportKind(state)).toBe('video+audio');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').textContent).toContain('MP4');
    });

    it('uses audio export when only a secondary audio track has content', () => {
        const secondAudioTrackId = this.store.createTrack('audio');
        this.store.insertAssetAtTime('asset-audio', 0, secondAudioTrackId);

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(this.manager.getExportKind(state)).toBe('audio');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').textContent).toContain('MP3');
    });

    it('uses video export when only an image track has content', () => {
        this.store.upsertAssets([
            { id: 'asset-image', name: 'cover.png', kind: 'image', duration: 5, path: 'C:/media/cover.png' }
        ]);
        this.store.addAssetToTimeline('asset-image');

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(this.manager.getExportKind(state)).toBe('video+audio');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').textContent).toContain('MP4');
    });

    it('allows export when multiple visual tracks have content (overlay path)', async () => {
        const secondVideoTrackId = this.store.createTrack('video');
        this.store.selectTrack('v1');
        this.store.addAssetToTimeline('asset-video');
        this.store.insertAssetAtTime('asset-video', 13, secondVideoTrackId);
        window.app = { showToast: jest.fn() };
        window.mediaflow = {
            dialog: { saveFile: jest.fn().mockResolvedValue('/tmp/out.mp4') },
            creator: { export: jest.fn().mockResolvedValue({ success: true }) }
        };
        window.EditorTimelineProjectSnapshot = {
            create: jest.fn(() => ({ tracks: [], timelineDuration: 1 }))
        };
        window.CreatorExportCapabilityMatrix = {};
        window.CreatorExportPlanner = jest.fn().mockImplementation(function Planner() {
            this.buildJob = jest.fn(() => ({
                jobId: 'job-multi',
                overlayVideoClips: [{ clipId: 'ov-1' }],
                primaryVideoClips: [{ clipId: 'pv-1' }]
            }));
        });

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(this.manager.summarizeExportTracks(state).activeVideoTrackCount).toBeGreaterThan(1);

        await this.manager.handleExport();

        expect(window.mediaflow.dialog.saveFile).toHaveBeenCalled();
        expect(window.mediaflow.creator.export).toHaveBeenCalledWith(
            expect.objectContaining({ jobId: 'job-multi' })
        );
        // Default fallback is English when window.i18n is absent in the test env
        expect(window.app.showToast).toHaveBeenCalledWith('Video exported successfully', 'success');
    });

    it('allows export when solo mode leaves one visual track active', () => {
        const secondVideoTrackId = this.store.createTrack('video');
        this.store.selectTrack('v1');
        this.store.addAssetToTimeline('asset-video');
        this.store.insertAssetAtTime('asset-video', 13, secondVideoTrackId);
        this.store.toggleTrackSolo(secondVideoTrackId);

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').title).toContain('导出');
    });

    it('uses audio export when the only video track is hidden', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackHidden('v1');

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(this.manager.getExportKind(state)).toBe('audio');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').textContent).toContain('MP3');
    });

    it('uses audio export when solo mode excludes the video track', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackSolo('a1');

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(true);
        expect(this.manager.getExportKind(state)).toBe('audio');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
        expect(document.getElementById('btn-editor-export').textContent).toContain('MP3');
    });

    it('keeps export disabled when active clips do not have a local source path', () => {
        this.store.upsertAssets([
            { id: 'asset-blob-video', name: 'blob-video.mp4', kind: 'video', duration: 8, src: 'blob:mediaflow-video' }
        ]);
        this.store.addAssetToTimeline('asset-blob-video');

        const state = this.store.getState();
        this.manager.render(state);

        expect(this.manager.hasExportableContent(state)).toBe(false);
        expect(document.getElementById('btn-editor-export').disabled).toBe(true);
    });

    it('reports save dialog failures without starting an export job', async () => {
        this.store.addAssetToTimeline('asset-video');
        window.mediaflow = {
            dialog: {
                saveFile: jest.fn().mockRejectedValue(new Error('dialog failed'))
            },
            creator: {
                export: jest.fn()
            }
        };
        window.EditorTimelineProjectSnapshot = {
            create: jest.fn()
        };
        window.CreatorExportPlanner = jest.fn().mockImplementation(() => ({
            buildJob: jest.fn(() => ({ jobId: 'job-1' }))
        }));
        window.CreatorExportCapabilityMatrix = {};
        window.app = {
            showToast: jest.fn()
        };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await this.manager.handleExport();

        errorSpy.mockRestore();
        expect(window.mediaflow.dialog.saveFile).toHaveBeenCalled();
        expect(window.mediaflow.creator.export).not.toHaveBeenCalled();
        expect(window.app.showToast).toHaveBeenCalledWith('dialog failed', 'error');
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);
    });
});
