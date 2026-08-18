/**
 * MediaFlow - CreatorFlow Module
 */

class CreatorFlow {
    constructor(app) {
        this.app = app;
        window.creatorFlow = this;

        const NoopFlowHelper = class {
            constructor(flow) {
                this.flow = flow;
            }
            init() {
                const flow = this.flow;

                if (!flow.videoProcessor && window.VideoProcessor) {
                    flow.videoProcessor = new window.VideoProcessor(flow);
                    flow.videoProcessor.init?.();
                }

                if (!flow.timelineManager && window.CreatorTimelineManager) {
                    flow.timelineManager = new window.CreatorTimelineManager(flow);
                    flow.timelineManager.init?.();
                }

                if (!flow.batchFlow && window.BatchCreatorFlow) {
                    flow.batchFlow = new window.BatchCreatorFlow(flow);
                    flow.batchFlow.init?.();
                }
            }
        };
        const NoopWorkflowImporter = class {
            constructor(flow) {
                this.flow = flow;
            }
            async importPendingProject() {
                return false;
            }
            async importProject() {
                return false;
            }
        };
        const NoopSubtitleLaneManager = class {
            constructor(flow) {
                this.flow = flow;
            }
            init() {}
            syncProject() {}
            clear() {}
            render() {}
            updateActiveState() {}
        };
        const NoopSubtitleCutActions = class {
            constructor(flow) {
                this.flow = flow;
            }
            init() {}
            updateButtonState() {}
        };
        const NoopSubtitlePreviewOverlay = class {
            constructor(flow) {
                this.flow = flow;
            }
            init() {}
            syncProject() {}
            render() {}
            clear() {}
            updateActiveSubtitle() {}
        };
        const NoopSubtitleAudioTrackImporter = class {
            constructor(flow) {
                this.flow = flow;
            }
            syncProject() {
                return [];
            }
            clearImportedTracks() {}
        };

        this.videoFile = null;
        this.audioFile = null;
        this.videoDuration = 0;
        this.isProcessing = false;
        this.isAudioOnly = false;
        this.localizedEditProject = null;
        this.clipSegments = [];
        this.silenceSegments = [];
        this.silenceProcessor = null;

        this.service = new window.CreatorService();
        this.uiManager = new window.CreatorUIManager(this);
        this.history = new window.HistoryManager();
        this.history.onStateChange = () => this.saveProject();

        this.previewHandler = new window.CreatorPreview(this);
        this.audioHandler = new window.CreatorAudioHandler(this);
        this.audioMixer = new window.TimelineAudioMixer(this);

        const FlowBootstrap = window.CreatorFlowBootstrap || NoopFlowHelper;
        const FlowProjectStore = window.CreatorFlowProjectStore || NoopFlowHelper;
        const FlowToolDispatcher = window.CreatorFlowToolDispatcher || NoopFlowHelper;
        const WorkflowImporter = window.CreatorWorkflowImporter || NoopWorkflowImporter;
        const SubtitleLaneManager = window.CreatorSubtitleLaneManager || NoopSubtitleLaneManager;
        const SubtitleCutActions = window.CreatorSubtitleCutActions || NoopSubtitleCutActions;
        const SubtitlePreviewOverlay = window.CreatorSubtitlePreviewOverlay || NoopSubtitlePreviewOverlay;
        const SubtitleAudioTrackImporter = window.CreatorSubtitleAudioTrackImporter || NoopSubtitleAudioTrackImporter;

        this.bootstrap = new FlowBootstrap(this);
        this.projectStore = new FlowProjectStore(this);
        this.toolDispatcher = new FlowToolDispatcher(this);
        this.workflowImporter = new WorkflowImporter(this);
        this.subtitleLaneManager = new SubtitleLaneManager(this);
        this.subtitleCutActions = new SubtitleCutActions(this);
        this.subtitlePreviewOverlay = new SubtitlePreviewOverlay(this);
        this.subtitleAudioTrackImporter = new SubtitleAudioTrackImporter(this);
    }

    init() {
        this.bootstrap.init();
    }

    setupResizeHandle() {
        this.bootstrap.setupResizeHandle();
    }

    setupPiP() {
        this.bootstrap.setupPiP();
    }

    enableVideoDrag(container) {
        this.bootstrap.enableVideoDrag(container);
    }

    updateInputsFromRegion(start, end) {
        const startStr = this.service.formatTime(start);
        const endStr = this.service.formatTime(end);
        this.uiManager.updateClipInputs(startStr, endStr);
    }

    formatTimeSimple(seconds) {
        return this.service.formatTime(seconds);
    }

    setupSilenceRemoval() {
        // Deprecated: delegated to SilenceProcessor.init()
    }

    async checkFileExists(path) {
        if (!path) return false;

        const exists = await this.service.checkFileExists(path);
        if (!exists) {
            window.app?.showToast(
                window.i18n?.t('creator.toasts.fileNotFound') || 'Source file not found. Please check if it was deleted or moved.',
                'error'
            );
            return false;
        }
        return true;
    }

    async addLocalFile(filePath) {
        if (!filePath) return;

        const name = filePath.split(/[/\\]/).pop();
        const { type } = this.service.inferFileType(filePath);

        const mockFile = {
            name,
            path: filePath,
            type,
            lastModified: Date.now()
        };

        this.handleFileSelect([mockFile]);
    }

    async showInputDialog(title, placeholder = '', defaultValue = '') {
        return await this.uiManager.showInputDialog(title, placeholder, defaultValue);
    }

    getMediaPath(fileLike) {
        if (!fileLike) return '';
        if (typeof fileLike === 'string') return fileLike;
        return fileLike.path || '';
    }

    createMediaFileRef(filePath, fallback = this.videoFile || this.audioFile) {
        const inferred = this.service.inferFileType(filePath);
        return {
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            type: fallback?.type || inferred.type || '',
            lastModified: Date.now()
        };
    }

    cloneMediaRef(fileLike) {
        if (!fileLike || typeof fileLike === 'string') return fileLike;
        return { ...fileLike };
    }

    captureEditorState() {
        return {
            videoFile: this.cloneMediaRef(this.videoFile),
            audioFile: this.cloneMediaRef(this.audioFile),
            isAudioOnly: this.isAudioOnly,
            videoDuration: this.videoDuration,
            localizedEditProject: window.LocalizedEditProject?.clone?.(this.localizedEditProject) || this.localizedEditProject || null,
            timelineDuration: this.timelineManager?.duration || 0,
            timelineHasWaveform: !!this.timelineManager?.hasWaveform,
            timelineState: this.timelineManager?.captureState?.() || null
        };
    }

    async applyEditorState(state) {
        if (!state) return;

        this.videoFile = this.cloneMediaRef(state.videoFile);
        this.audioFile = this.cloneMediaRef(state.audioFile);
        this.isAudioOnly = !!state.isAudioOnly;
        this.videoDuration = state.videoDuration || 0;
        this.localizedEditProject = window.LocalizedEditProject?.clone?.(state.localizedEditProject) || state.localizedEditProject || null;

        if (this.timelineManager) {
            this.timelineManager.duration = state.timelineDuration || this.timelineManager.duration || 0;
            this.timelineManager.hasWaveform = !!state.timelineHasWaveform;
            if (state.timelineState) {
                this.timelineManager.applyState(state.timelineState);
            }
        }

        if (this.audioMixer?.audioTrackPlayers) {
            Object.keys(this.audioMixer.audioTrackPlayers).forEach((trackId) => {
                this.audioMixer.unregisterTrack(trackId);
            });
        }

        await this.previewHandler?.replaceMediaSource(this.videoFile || this.audioFile, this.isAudioOnly);
        this.subtitleLaneManager?.syncProject?.(this.localizedEditProject, { silent: true });
        this.subtitlePreviewOverlay?.syncProject?.(this.localizedEditProject, { silent: true });

        const filenameEl = document.getElementById('creator-filename');
        const currentName = this.videoFile?.name || this.audioFile?.name || '';
        if (filenameEl) {
            filenameEl.textContent = currentName;
            filenameEl.title = currentName;
        }
    }

    async _applyProcessedMediaToEditor(outputPath, sourcePath = null) {
        if (!outputPath) return;

        const originalPath = sourcePath || this.getMediaPath(this.videoFile) || this.getMediaPath(this.audioFile);
        if (!originalPath) return;

        const nextFile = this.createMediaFileRef(outputPath);
        const matchesSource = (fileLike) => this.getMediaPath(fileLike) === originalPath;

        if (matchesSource(this.videoFile)) {
            this.videoFile = nextFile;
        }
        if (matchesSource(this.audioFile)) {
            this.audioFile = nextFile;
        }

        if (this.timelineManager?.tracks) {
            Object.values(this.timelineManager.tracks).forEach((track) => {
                track.segments?.forEach((segment) => {
                    if (matchesSource(segment.file)) {
                        segment.file = nextFile;
                    }
                });
            });

            if (this.timelineManager.tracks.a1) {
                this.timelineManager.tracks.a1.peaks = [];
            }
            if (this.timelineManager.tracks.v1) {
                this.timelineManager.tracks.v1.peaks = [];
            }
            this.timelineManager.hasWaveform = false;
            this.timelineManager.renderAll();
        }

        if (this.audioMixer?.audioTrackPlayers) {
            Object.keys(this.audioMixer.audioTrackPlayers).forEach((trackId) => {
                this.audioMixer.unregisterTrack(trackId);
            });
        }

        await this.previewHandler?.replaceMediaSource(nextFile, this.isAudioOnly);
        await this.timelineManager?.extractAudioWaveform(nextFile);

        const filenameEl = document.getElementById('creator-filename');
        if (filenameEl) {
            filenameEl.textContent = nextFile.name;
            filenameEl.title = nextFile.name;
        }
    }

    async applyProcessedMediaToEditor(outputPath, sourcePath = null) {
        const oldState = this.captureEditorState();
        await this._applyProcessedMediaToEditor(outputPath, sourcePath);
        const newState = this.captureEditorState();

        this.history.push({
            execute: () => this.applyEditorState(newState),
            undo: () => this.applyEditorState(oldState)
        });
    }

    async handleSegmentAction(action, data, segments) {
        return this.toolDispatcher.handleSegmentAction(action, data, segments);
    }

    handleFileSelect(arg) {
        if (!arg) return;

        let files = (arg instanceof FileList) ? Array.from(arg) : (Array.isArray(arg) ? arg : [arg]);
        files = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type.startsWith('image/'));

        if (files.length === 0) {
            window.app?.showToast(window.i18n?.t('creator.toasts.selectMediaFile') || 'Please select a video or audio file', 'error');
            return;
        }

        const isAlreadyInBatch = this.batchFlow && this.batchFlow.batchFiles.length > 0;
        if (files.length > 1 || isAlreadyInBatch) {
            this.batchFlow.addFiles(files);
            return;
        }

        const file = files[0];
        this.videoFile = file;
        this.isAudioOnly = file.type.startsWith('audio/');

        this.uiManager.showSingleModeUI();

        const filenameEl = document.getElementById('creator-filename');
        if (filenameEl) {
            filenameEl.textContent = file.name;
        }

        this.uiManager.updateToolState(this.isAudioOnly);
        this.previewHandler.loadMedia(file, this.isAudioOnly);

        setTimeout(() => this.videoProcessor?.ui?.updateSizeEstimation?.(), 100);
    }

    showProgress(status, percent = 0, canCancel = false, onCancel = null) {
        this.isProcessing = true;
        this.uiManager.showProgress(status, percent, canCancel, onCancel);
    }

    updateProgress(percent, status) {
        this.uiManager.updateProgress(percent, status);
    }

    hideProgress() {
        this.isProcessing = false;
        this.uiManager.hideProgress();
    }

    showToast(msg, type = 'info') {
        window.app?.showToast(msg, type);
    }

    reset() {
        console.log('[CreatorFlow] Cleaning up state...');

        this.videoFile = null;
        this.audioFile = null;
        this.videoDuration = 0;
        this.isProcessing = false;
        this.isAudioOnly = false;
        this.localizedEditProject = null;

        if (this.timelineManager) {
            this.timelineManager.reset();
        }

        this.subtitleLaneManager?.clear?.();
        this.subtitlePreviewOverlay?.clear?.();
        this.subtitleAudioTrackImporter?.clearImportedTracks?.();
        this.subtitleCutActions?.updateButtonState?.();

        this.uiManager.resetUI();

        if (this.previewHandler) {
            this.previewHandler.reset();
        } else {
            const video = document.getElementById('creator-video-preview');
            if (video) {
                video.onerror = null;
                video.removeAttribute('src');
                video.load();
            }

            const audioPlayer = document.getElementById('creator-audio-preview');
            if (audioPlayer) {
                audioPlayer.onerror = null;
                audioPlayer.removeAttribute('src');
                audioPlayer.load();
            }
        }

        const audioPlaceholder = document.getElementById('audio-placeholder');
        if (audioPlaceholder) {
            audioPlaceholder.classList.add('hidden');
        }

        if (this.timelineManager) {
            this.timelineManager.reset();
        }

        this.batchFlow?.reset();
    }

    async loadGlobalSettings() {
        return this.projectStore.loadGlobalSettings();
    }

    async saveProject() {
        return this.projectStore.saveProject();
    }

    async loadLastProject() {
        return this.projectStore.loadLastProject();
    }

    async executeTool(action, params = {}) {
        return this.toolDispatcher.executeTool(action, params);
    }

    async importPendingWorkflow(options = {}) {
        return this.workflowImporter.importPendingProject(options);
    }

    async importWorkflowProject(project, options = {}) {
        return this.workflowImporter.importProject(project, options);
    }
}

window.CreatorFlow = CreatorFlow;
