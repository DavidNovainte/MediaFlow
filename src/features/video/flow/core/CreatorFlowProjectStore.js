class CreatorFlowProjectStore {
    constructor(flow) {
        this.flow = flow;
    }

    toStoredMediaRef(fileLike) {
        if (!fileLike) {
            return null;
        }

        if (typeof fileLike === 'string') {
            return fileLike;
        }

        if (typeof fileLike === 'object' && typeof fileLike.path === 'string') {
            return fileLike.path;
        }

        return null;
    }

    async loadGlobalSettings() {
        try {
            const globalPath = await window.mediaflow?.store?.get('last_creator_output_path');
            if (globalPath) {
                const input = document.getElementById('creator-output-path');
                if (input) input.value = globalPath;
            }
        } catch (e) {
            console.error('[CreatorFlow] Failed to load global settings:', e);
        }
    }

    async saveProject() {
        const flow = this.flow;
        if (!flow.videoFile && !flow.audioFile) return;

        const cleanTracks = JSON.parse(JSON.stringify(flow.timelineManager.tracks, (key, value) => {
            if (key === 'file') return this.toStoredMediaRef(value);
            if (key === 'audioBuffer' || key === 'peaks' || key === 'waveformData') return undefined;
            return value;
        }));

        const projectData = {
            version: '1.3.1',
            videoFile: this.toStoredMediaRef(flow.videoFile),
            audioFile: this.toStoredMediaRef(flow.audioFile),
            outputPath: document.getElementById('creator-output-path')?.value || '',
            timeline: {
                tracks: cleanTracks,
                trackOrder: flow.timelineManager.trackOrder,
                pixelsPerSecond: flow.timelineManager.pixelsPerSecond,
                zoomLevel: flow.timelineManager.zoomLevel
            },
            lastModified: Date.now()
        };

        try {
            await window.mediaflow?.store?.set('last_creator_project', JSON.parse(JSON.stringify(projectData)));
            console.log('[CreatorFlow] Project auto-saved to store');
        } catch (error) {
            console.error('[CreatorFlow] Auto-save failed:', error);
        }
    }

    async loadLastProject() {
        const flow = this.flow;

        try {
            const data = await window.mediaflow?.store.get('last_creator_project');
            if (!data || !data.videoFile) return;

            const exists = await window.mediaflow?.shell.fileExists(data.videoFile);
            if (!exists) {
                console.warn('[CreatorFlow] Last project video file missing, skipping restore');
                return;
            }

            const confirm = await flow.uiManager.askConfirm(window.i18n?.t('creator.dialogs.restoreConfirm') || 'Unfinished task detected. Restore the previous editing state?');
            if (!confirm) {
                await window.mediaflow?.store?.set('last_creator_project', null);
                return;
            }

            flow.showToast(window.i18n?.t('creator.toasts.restoreProject') || 'Restoring project...', 'info');

            flow.videoFile = data.videoFile ? flow.createMediaFileRef(data.videoFile) : null;
            flow.audioFile = data.audioFile ? flow.createMediaFileRef(data.audioFile) : null;

            const inputPath = document.getElementById('creator-output-path');
            if (inputPath && data.outputPath) inputPath.value = data.outputPath;

            flow.uiManager.setMode('edit');
            flow.previewHandler.loadMedia(flow.videoFile || flow.audioFile);

            if (data.timeline) {
                flow.timelineManager.tracks = data.timeline.tracks;
                flow.timelineManager.trackOrder = data.timeline.trackOrder || flow.timelineManager.trackOrder;
                flow.timelineManager.pixelsPerSecond = data.timeline.pixelsPerSecond || 100;
                flow.timelineManager.zoomLevel = data.timeline.zoomLevel || 100;

                if (window.TimelineTrackReorder) {
                    window.TimelineTrackReorder.ensureState(flow.timelineManager);
                    window.TimelineTrackReorder.applyToDOM(flow.timelineManager);
                }
                flow.timelineManager.renderAll();

                if (flow.videoFile || flow.audioFile) {
                    flow.timelineManager.hasWaveform = false;
                    flow.timelineManager.extractAudioWaveform(flow.videoFile || flow.audioFile);
                }
            }

            flow.showToast(window.i18n?.t('creator.toasts.restoreProjectDone') || 'Project restored successfully', 'success');
        } catch (error) {
            console.error('[CreatorFlow] Load project failed:', error);
        }
    }
}

window.CreatorFlowProjectStore = CreatorFlowProjectStore;
