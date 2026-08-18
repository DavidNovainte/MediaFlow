/** @jest-environment jsdom */

describe('EditorFlow', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/import/EditorMediaImporter');
        require('../../../src/features/editor/export/EditorTimelineProjectSnapshot');
        require('../../../src/features/editor/export/EditorExportManager');
        require('../../../src/features/editor/preview/EditorPreviewManager');
        require('../../../src/features/editor/playback/EditorPlaybackManager');
        require('../../../src/features/editor/timeline/EditorTimelineSnapUtils');
        require('../../../src/features/editor/timeline/EditorTimelineDragManager');
        require('../../../src/features/editor/timeline/EditorTimelineDropManager');
        require('../../../src/features/editor/timeline/EditorTimelineSelectionManager');
        require('../../../src/features/editor/timeline/EditorTimelinePlayheadManager');
        require('../../../src/features/editor/timeline/EditorTimelineZoomOptimizer');
        require('../../../src/features/editor/timeline/EditorTimelineViewportManager');
        require('../../../src/features/editor/timeline/EditorTimelineTrimManager');
        require('../../../src/features/editor/timeline/EditorTimelineManager');
        require('../../../src/features/editor/timeline/EditorTimelineActions');
        require('../../../src/features/editor/properties/EditorInspectorManager');
        require('../../../src/features/editor/ui/EditorUIManager');
        require('../../../src/features/video/export/CreatorExportCapabilityMatrix');
        require('../../../src/features/video/export/CreatorExportPlanner');
        require('../../../src/features/editor/EditorFlow');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-editor">
                <button id="btn-editor-import"></button>
                <button id="btn-editor-back-to-creator"></button>
                <button id="btn-editor-export"></button>
                <button id="btn-editor-play-toggle"></button>
                <input id="editor-file-input" />
                <div id="editor-asset-list"></div>
                <div id="editor-project-name"></div>
                <div id="editor-project-meta"></div>
                <div id="editor-project-status"></div>
                <div id="editor-selected-summary"></div>
                <div id="editor-preview-empty"></div>
                <video id="editor-preview-video"></video>
                <audio id="editor-preview-audio"></audio>
                <img id="editor-preview-image" />
                <div id="editor-preview-name"></div>
                <div id="editor-preview-meta"></div>
                <div id="editor-timeline-playhead-overlay"></div>
                <div id="editor-timeline-ruler"></div>
                <div id="editor-timeline-body"></div>
                <div id="editor-timeline-tracks"></div>
                <div id="editor-playhead-time"></div>
                <input id="editor-timeline-zoom" type="range" />
                <div id="editor-timeline-zoom-value"></div>
                <div id="editor-track-video"></div>
                <div id="editor-track-audio"></div>
                <div id="editor-track-image"></div>
                <div id="editor-track-video-label"></div>
                <div id="editor-track-audio-label"></div>
                <div id="editor-track-image-label"></div>
                <button id="btn-editor-insert-selected"></button>
                <button id="btn-editor-merge-clip"></button>
                <button id="btn-editor-split-clip"></button>
                <button id="btn-editor-delete-clip"></button>
                <button id="btn-editor-ripple-delete-clip"></button>
                <div id="editor-inspector-body"></div>
            </section>
        `;

        window.urlUtils = {
            getMediaSrc: jest.fn(file => file?.path || '')
        };
        window.mediaflow = undefined;
    });

    it('auto inserts multiple imported files into matching timeline tracks', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();
        flow.ensureMetadataForAsset = jest.fn();

        flow.handleFileSelect([
            { name: 'clip.mp4', path: 'C:/clip.mp4', type: 'video/mp4' },
            { name: 'voice.mp3', path: 'C:/voice.mp3', type: 'audio/mp3' }
        ]);

        const state = flow.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.assets).toHaveLength(2);
    });

    it('keeps a refined import-to-export workflow consistent after speed, volume, split, and toolbar merge', async () => {
        let capturedJob = null;
        window.mediaflow = {
            dialog: {
                saveFile: jest.fn(async () => 'C:/exports/refined.mp4')
            },
            creator: {
                onProgress: jest.fn(),
                export: jest.fn(async (job) => {
                    capturedJob = job;
                    return { success: true };
                })
            }
        };
        window.app = { showToast: jest.fn() };

        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();
        flow.ensureMetadataForAsset = jest.fn();
        flow.ensureWaveformForAsset = jest.fn();
        flow.ensureFilmstripForAsset = jest.fn();

        flow.handleFileSelect([
            { name: 'clip.mp4', path: 'C:/media/clip.mp4', type: 'video/mp4' }
        ]);
        const asset = flow.store.getState().assets[0];
        flow.store.updateAsset(asset.id, { duration: 12, width: 720, height: 1280 });

        let videoClip = flow.store.getTrack('v1')[0];
        flow.store.selectClip(videoClip.id);
        flow.inspectorManager.render(flow.store.getState());

        const volumeInput = document.querySelector('input[data-field="volume"]');
        const speedInput = document.querySelector('input[data-field="speed"]');
        volumeInput.value = '35';
        volumeInput.dispatchEvent(new Event('input'));
        speedInput.value = '2';
        speedInput.dispatchEvent(new Event('input'));

        expect(flow.store.getTrack('v1')[0].duration).toBe(6);
        expect(flow.store.getTrack('a1')[0].volume).toBe(35);

        flow.store.setPlayheadTime(3);
        flow.timelineActions.splitSelectedClip();
        let state = flow.store.getState();
        expect(state.timeline.v1).toHaveLength(2);
        expect(state.timeline.v1[0].sourceEnd).toBe(6);
        expect(state.timeline.v1[1].sourceStart).toBe(6);

        videoClip = flow.store.getTrack('v1')[1];
        flow.store.setSelectedClips([videoClip.id], videoClip.id, { preservePlayhead: true });
        flow.timelineActions.render(flow.store.getState());
        const mergeButton = document.getElementById('btn-editor-merge-clip');
        expect(mergeButton.disabled).toBe(false);
        mergeButton.click();

        state = flow.store.getState();
        expect(state.timeline.v1).toHaveLength(1);
        expect(state.timeline.a1).toHaveLength(1);
        expect(state.timeline.v1[0].timelineEnd).toBe(6);
        expect(state.timeline.v1[0].sourceEnd).toBe(12);
        expect(state.timeline.a1[0].volume).toBe(35);

        await flow.exportManager.handleExport();

        // Export filename uses localized default project name + _export.mp4
        expect(window.mediaflow.dialog.saveFile).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: expect.stringMatching(/_export\.mp4$/)
        }));
        expect(window.mediaflow.creator.export).toHaveBeenCalledTimes(1);
        expect(capturedJob.exportKind).toBe('video+audio');
        expect(capturedJob.timelineDuration).toBe(6);
        expect(capturedJob.primaryVideoClips).toHaveLength(1);
        expect(capturedJob.primaryVideoClips[0]).toEqual(expect.objectContaining({
            assetPath: 'C:/media/clip.mp4',
            timelineStart: 0,
            timelineEnd: 6,
            sourceStart: 0,
            sourceEnd: 12,
            speed: 2,
            volume: 0.35
        }));
        expect(capturedJob.overlayAudioClips).toHaveLength(0);
        // Toast copy is locale-dependent; accept success type
        expect(window.app.showToast).toHaveBeenCalledWith(expect.any(String), 'success');
    });

    it('exports an image-only refined timeline as an MP4 job', async () => {
        let capturedJob = null;
        window.mediaflow = {
            dialog: {
                saveFile: jest.fn(async () => 'C:/exports/cover.mp4')
            },
            creator: {
                onProgress: jest.fn(),
                export: jest.fn(async (job) => {
                    capturedJob = job;
                    return { success: true };
                })
            }
        };
        window.app = { showToast: jest.fn() };

        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();
        flow.ensureMetadataForAsset = jest.fn();
        flow.ensureWaveformForAsset = jest.fn();
        flow.ensureFilmstripForAsset = jest.fn();

        flow.handleFileSelect([
            { name: 'cover.png', path: 'C:/media/cover.png', type: 'image/png' }
        ]);

        expect(flow.store.getTrack('g1')).toHaveLength(1);
        expect(document.getElementById('btn-editor-export').disabled).toBe(false);

        await flow.exportManager.handleExport();

        expect(window.mediaflow.dialog.saveFile).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: expect.stringMatching(/_export\.mp4$/)
        }));
        expect(capturedJob.exportKind).toBe('video+audio');
        expect(capturedJob.primaryVideoTrackId).toBe('g1');
        expect(capturedJob.primaryVideoClips[0]).toEqual(expect.objectContaining({
            assetPath: 'C:/media/cover.png',
            assetKind: 'image',
            timelineStart: 0,
            timelineEnd: 5
        }));
        expect(window.app.showToast).toHaveBeenCalledWith(expect.any(String), 'success');
    });

    it('queues derived audio and video visuals after importing assets', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();
        flow.ensureMetadataForAsset = jest.fn();
        flow.ensureWaveformForAsset = jest.fn();
        flow.ensureFilmstripForAsset = jest.fn();

        flow.handleFileSelect([
            { name: 'clip.mp4', path: 'C:/clip.mp4', type: 'video/mp4' },
            { name: 'voice.mp3', path: 'C:/voice.mp3', type: 'audio/mp3' },
            { name: 'cover.png', path: 'C:/cover.png', type: 'image/png' }
        ]);

        expect(flow.ensureMetadataForAsset.mock.calls.some(([asset]) => asset?.kind === 'video' && asset?.name === 'clip.mp4')).toBe(true);
        expect(flow.ensureMetadataForAsset.mock.calls.some(([asset]) => asset?.kind === 'audio' && asset?.name === 'voice.mp3')).toBe(true);
        expect(flow.ensureFilmstripForAsset.mock.calls.some(([asset]) => asset?.kind === 'video' && asset?.name === 'clip.mp4')).toBe(true);
        expect(flow.ensureWaveformForAsset.mock.calls.some(([asset]) => asset?.kind === 'audio' && asset?.name === 'voice.mp3')).toBe(true);
    });

    it('uses the lightweight render path for playhead updates during playback', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        const uiRenderSpy = jest.spyOn(flow.uiManager, 'render');
        const exportRenderSpy = jest.spyOn(flow.exportManager, 'render');
        const previewRenderSpy = jest.spyOn(flow.previewManager, 'render');
        const previewTickSpy = jest.spyOn(flow.previewManager, 'renderPlaybackTick');
        const timelineRenderSpy = jest.spyOn(flow.timelineManager, 'render');
        const viewportRenderSpy = jest.spyOn(flow.timelineViewportManager, 'render');
        const actionsRenderSpy = jest.spyOn(flow.timelineActions, 'render');
        const inspectorRenderSpy = jest.spyOn(flow.inspectorManager, 'render');

        flow.handleFileSelect([
            { name: 'clip.mp4', path: 'C:/clip.mp4', type: 'video/mp4' }
        ]);

        uiRenderSpy.mockClear();
        exportRenderSpy.mockClear();
        previewRenderSpy.mockClear();
        previewTickSpy.mockClear();
        timelineRenderSpy.mockClear();
        viewportRenderSpy.mockClear();
        actionsRenderSpy.mockClear();
        inspectorRenderSpy.mockClear();

        flow.playbackManager.isPlaying = true;
        flow.store.setPlayheadTime(1.25);

        expect(previewTickSpy).toHaveBeenCalledTimes(1);
        expect(previewRenderSpy).not.toHaveBeenCalled();
        expect(timelineRenderSpy).toHaveBeenCalledTimes(1);
        expect(viewportRenderSpy).toHaveBeenCalledTimes(1);
        expect(uiRenderSpy).not.toHaveBeenCalled();
        expect(exportRenderSpy).not.toHaveBeenCalled();
        expect(actionsRenderSpy).not.toHaveBeenCalled();
        expect(inspectorRenderSpy).not.toHaveBeenCalled();
    });

    it('updates the playhead from a ruler click before splitting with the S shortcut', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        Object.defineProperty(flow.timelineManager.elements.timelineBody, 'clientWidth', {
            configurable: true,
            value: 1200
        });
        Object.defineProperty(flow.timelineManager.elements.timelineBody, 'offsetWidth', {
            configurable: true,
            value: 1200
        });

        flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 24 }
        ]);
        const clip = flow.store.addAssetToTimeline('asset-video');
        flow.store.selectClip(clip.id);
        flow.renderCurrentState();

        flow.store.setPlayheadTime(13.3);
        flow.timelineActions.splitSelectedClip();

        const ruler = document.getElementById('editor-timeline-ruler');
        const renderDuration = Number(ruler.dataset.renderDuration) || 24;
        const rulerWidth = ruler.clientWidth || ruler.offsetWidth || 1200;
        const clickOffset = (4.6 / renderDuration) * rulerWidth;

        ruler.getBoundingClientRect = () => ({
            left: 100,
            top: 0,
            right: 100 + rulerWidth,
            bottom: 30,
            width: rulerWidth,
            height: 30
        });
        ruler.setPointerCapture = jest.fn();
        ruler.releasePointerCapture = jest.fn();

        const pointerDown = new Event('pointerdown', { bubbles: true });
        pointerDown.button = 0;
        pointerDown.pointerId = 1;
        pointerDown.clientX = 100 + clickOffset;
        ruler.dispatchEvent(pointerDown);

        const pointerUp = new Event('pointerup', { bubbles: true });
        pointerUp.pointerId = 1;
        document.dispatchEvent(pointerUp);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

        const state = flow.store.getState();
        expect(state.playheadTime).toBeCloseTo(4.6, 2);
        expect(flow.store.getTrack('v1')).toHaveLength(3);
        expect(flow.store.getTrack('a1')).toHaveLength(3);
        expect(flow.store.getTrack('v1')[0].timelineEnd).toBeCloseTo(4.6, 2);
        expect(flow.store.getTrack('a1')[0].timelineEnd).toBeCloseTo(4.6, 2);
    });

    it('prefers backend waveform extraction for local audio assets', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });

        const originalFetch = global.fetch;
        global.fetch = jest.fn();
        window.mediaflow = {
            video: {
                extractAudio: jest.fn(async () => ({
                    success: true,
                    peaks: [0.1, 0.3, 0.2]
                }))
            }
        };

        await expect(flow.createWaveformPeaks({
            id: 'asset-audio',
            kind: 'audio',
            path: 'C:/voice.mp3',
            src: 'media-file:///C:/voice.mp3'
        })).resolves.toEqual([0.1, 0.3, 0.2]);

        // Unknown duration uses modest default samplesPerSec (perf for long media)
        expect(window.mediaflow.video.extractAudio).toHaveBeenCalledWith({
            input: 'C:/voice.mp3',
            samplesPerSec: 12
        });
        expect(global.fetch).not.toHaveBeenCalled();

        global.fetch = originalFetch;
    });

    it('uses denser filmstrip sampling for long videos', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });

        expect(flow.getVideoFilmstripFrameCount(90)).toBe(10);
        expect(flow.getVideoFilmstripFrameCount(8 * 60)).toBe(72);
        expect(flow.getVideoFilmstripFrameCount(35 * 60)).toBe(144);
    });

    it('caps sprite width while increasing long-video sample density', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });

        const frameWidth = flow.getVideoFilmstripFrameWidth(1920, 144);
        expect(frameWidth).toBeLessThanOrEqual(160);
        expect(frameWidth).toBeGreaterThanOrEqual(48);
        expect(frameWidth * 144).toBeLessThanOrEqual(window.EditorFlow.MAX_VIDEO_FILMSTRIP_SPRITE_WIDTH);
    });

    it('treats legacy sparse long-video sprites as incomplete so they can regenerate', () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });

        expect(flow.hasCompleteVideoFilmstrip({
            kind: 'video',
            duration: 35 * 60,
            filmstripSprite: {
                src: 'data:image/webp;base64,legacy-sprite',
                frameCount: 24
            }
        })).toBe(false);

        expect(flow.hasCompleteVideoFilmstrip({
            kind: 'video',
            duration: 35 * 60,
            filmstripSprite: {
                src: 'data:image/webp;base64,dense-sprite',
                frameCount: 144
            }
        })).toBe(true);
    });

    it('commits the first filmstrip frame early and keeps it if later extraction fails', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        const asset = flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 120, src: 'C:/clip.mp4' }
        ])[0];

        flow.createVideoFilmstripFrames = jest.fn(async (_asset, options = {}) => {
            options.onFrame?.(['frame-1'], { index: 0, sampleCount: 6, duration: 120 });
            throw new Error('decode stalled');
        });

        flow.ensureFilmstripForAsset(asset);
        await flow.filmstripJobs.get(asset.id);

        const updatedAsset = flow.store.getAssetById(asset.id);
        expect(updatedAsset.filmstripFrames).toEqual(['frame-1']);
        expect(updatedAsset.filmstripStatus).toBe('ready');
    });

    it('hydrates a cached poster frame before the full filmstrip finishes', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        let resolveFilmstrip;
        const filmstripPromise = new Promise((resolve) => {
            resolveFilmstrip = resolve;
        });

        window.mediaflow = {
            app: {
                getAppPath: jest.fn(async () => 'C:/Users/test/AppData/Roaming/MediaFlow'),
                getTempPath: jest.fn(async () => 'C:/Temp')
            },
            path: {
                join: jest.fn(async (...parts) => parts.join('/'))
            },
            fs: {
                mkdir: jest.fn(async () => ({ success: true })),
                readAsDataUrl: jest.fn(async () => ({ success: true, dataUrl: 'data:image/jpeg;base64,cached-frame' }))
            },
            shell: {
                fileExists: jest.fn(async () => true)
            },
            video: {
                extractFrame: jest.fn()
            }
        };

        const asset = flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', path: 'C:/clip.mp4', kind: 'video', duration: 120, src: 'C:/clip.mp4' }
        ])[0];

        flow.createVideoFilmstripFrames = jest.fn(() => filmstripPromise);

        flow.ensureFilmstripForAsset(asset);
        await flow.posterFrameJobs.get(asset.id);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const partialAsset = flow.store.getAssetById(asset.id);
            if (Array.isArray(partialAsset?.filmstripFrames) && partialAsset.filmstripFrames.length) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const partialAsset = flow.store.getAssetById(asset.id);
        expect(partialAsset.filmstripFrames).toEqual(['data:image/jpeg;base64,cached-frame']);
        expect(partialAsset.filmstripStatus).toBe('pending');
        expect(window.mediaflow.video.extractFrame).not.toHaveBeenCalled();

        resolveFilmstrip({
            frames: ['frame-1', 'frame-2'],
            sprite: {
                src: 'data:image/webp;base64,sprite',
                frameCount: 2
            }
        });
        await flow.filmstripJobs.get(asset.id);

        const finalAsset = flow.store.getAssetById(asset.id);
        expect(finalAsset.filmstripFrames).toEqual([]);
        expect(finalAsset.filmstripSprite).toEqual({
            src: 'data:image/webp;base64,sprite',
            frameCount: 2
        });
        expect(finalAsset.filmstripStatus).toBe('ready');
    });

    it('uses filesystem metadata in the poster cache key for local path assets', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });

        window.mediaflow = {
            fs: {
                stat: jest.fn(async () => ({
                    success: true,
                    size: 4096,
                    mtimeMs: 1710000000123
                }))
            }
        };

        const identity = await flow.resolveVideoPosterCacheIdentity({
            id: 'asset-video',
            name: 'clip.mp4',
            path: 'C:/clip.mp4',
            src: 'C:/clip.mp4',
            kind: 'video',
            duration: 120,
            file: {}
        });

        expect(window.mediaflow.fs.stat).toHaveBeenCalledWith('C:/clip.mp4');
        expect(identity.fileSize).toBe('4096');
        expect(identity.lastModified).toBe('1710000000123');
        expect(flow.createVideoPosterCacheKey(identity)).not.toBe(
            flow.createVideoPosterCacheKey({ ...identity, lastModified: '1710000000999' })
        );
    });

    it('stores a sprite-backed filmstrip when full generation completes', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        const asset = flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 120, src: 'C:/clip.mp4' }
        ])[0];

        flow.loadOrCreateVideoPosterFrame = jest.fn(async () => null);
        flow.createVideoFilmstripFrames = jest.fn(async () => ({
            frames: ['frame-1', 'frame-2', 'frame-3'],
            sprite: {
                src: 'data:image/webp;base64,sprite-sheet',
                frameCount: 3
            }
        }));

        flow.ensureFilmstripForAsset(asset);
        await flow.filmstripJobs.get(asset.id);

        const updatedAsset = flow.store.getAssetById(asset.id);
        expect(updatedAsset.filmstripFrames).toEqual([]);
        expect(updatedAsset.filmstripSprite).toEqual({
            src: 'data:image/webp;base64,sprite-sheet',
            frameCount: 3
        });
        expect(updatedAsset.filmstripStatus).toBe('ready');
    });

    it('reuses a cached disk sprite before regenerating the filmstrip', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        window.mediaflow = {
            app: {
                getAppPath: jest.fn(async () => 'C:/Users/test/AppData/Roaming/MediaFlow'),
                getTempPath: jest.fn(async () => 'C:/Temp')
            },
            path: {
                join: jest.fn(async (...parts) => parts.join('/'))
            },
            fs: {
                mkdir: jest.fn(async () => ({ success: true })),
                stat: jest.fn(async () => ({ success: true, size: 4096, mtimeMs: 1710000000123 })),
                readFile: jest.fn(async () => JSON.stringify({
                    src: 'data:image/webp;base64,cached-sprite',
                    frameCount: 4
                })),
                writeFile: jest.fn(async () => ({ success: true })),
                readAsDataUrl: jest.fn(async () => ({ success: true, dataUrl: 'data:image/jpeg;base64,cached-frame' }))
            },
            shell: {
                fileExists: jest.fn(async (filePath) => filePath.endsWith('.json'))
            },
            video: {
                extractFrame: jest.fn()
            }
        };

        const asset = flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', path: 'C:/clip.mp4', kind: 'video', duration: 120, src: 'C:/clip.mp4' }
        ])[0];

        flow.createVideoFilmstripFrames = jest.fn(async () => ({
            frames: ['frame-1'],
            sprite: { src: 'data:image/webp;base64,generated-sprite', frameCount: 1 }
        }));

        flow.ensureFilmstripForAsset(asset);
        await flow.filmstripJobs.get(asset.id);

        const updatedAsset = flow.store.getAssetById(asset.id);
        expect(flow.createVideoFilmstripFrames).not.toHaveBeenCalled();
        expect(updatedAsset.filmstripFrames).toEqual([]);
        expect(updatedAsset.filmstripSprite).toEqual({
            src: 'data:image/webp;base64,cached-sprite',
            frameCount: 4
        });
        expect(updatedAsset.filmstripStatus).toBe('ready');
    });

    it('persists the generated sprite to disk cache when supported', async () => {
        const flow = new window.EditorFlow({
            router: { currentPage: 'editor' },
            navigateTo: jest.fn()
        });
        flow.init();

        window.mediaflow = {
            app: {
                getAppPath: jest.fn(async () => 'C:/Users/test/AppData/Roaming/MediaFlow'),
                getTempPath: jest.fn(async () => 'C:/Temp')
            },
            path: {
                join: jest.fn(async (...parts) => parts.join('/'))
            },
            fs: {
                mkdir: jest.fn(async () => ({ success: true })),
                stat: jest.fn(async () => ({ success: true, size: 4096, mtimeMs: 1710000000123 })),
                readFile: jest.fn(async () => JSON.stringify({ src: '', frameCount: 0 })),
                writeFile: jest.fn(async () => ({ success: true })),
                readAsDataUrl: jest.fn(async () => ({ success: false }))
            },
            shell: {
                fileExists: jest.fn(async () => false)
            },
            video: {
                extractFrame: jest.fn(async () => ({ success: false }))
            }
        };

        const asset = flow.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', path: 'C:/clip.mp4', kind: 'video', duration: 120, src: 'C:/clip.mp4' }
        ])[0];

        flow.createVideoFilmstripFrames = jest.fn(async () => ({
            frames: ['frame-1', 'frame-2'],
            sprite: {
                src: 'data:image/webp;base64,persisted-sprite',
                frameCount: 2
            }
        }));

        flow.ensureFilmstripForAsset(asset);
        await flow.filmstripJobs.get(asset.id);
        await Promise.resolve();

        expect(window.mediaflow.fs.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('/cache/editor-filmstrip-posters/filmstrip-'),
            JSON.stringify({
                src: 'data:image/webp;base64,persisted-sprite',
                frameCount: 2
            })
        );
    });
});
