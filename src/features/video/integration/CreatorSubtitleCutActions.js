class CreatorSubtitleCutActions {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
    }

    init() {
        this.elements.cutButton = document.getElementById('btn-timeline-subtitle-cuts');
        this.bindEvents();
        this.updateButtonState();
    }

    bindEvents() {
        this.elements.cutButton?.addEventListener('click', () => this.applyCutsFromSubtitles());
    }

    updateButtonState() {
        const button = this.elements.cutButton;
        if (!button) return;

        const hasSubtitles = (window.CreatorSubtitleProject?.getPrimarySegments(this.flow.localizedEditProject) || []).length > 0;
        button.disabled = !hasSubtitles;
        button.classList.toggle('hidden', !hasSubtitles);
    }

    applyCutsFromSubtitles() {
        const manager = this.flow.timelineManager;
        const project = this.flow.localizedEditProject;
        const mediaFile = this.flow.cloneMediaRef?.(this.flow.videoFile || this.flow.audioFile);

        if (!manager || !project || !mediaFile) {
            this.flow.showToast(window.i18n?.t('creator.toasts.noSubtitleWorkflow') || 'No subtitle workflow available', 'warning');
            return false;
        }

        const builtTimeline = window.CreatorSubtitleProject?.buildCompactTimeline(project, mediaFile, {
            includeAudio: !this.flow.isAudioOnly
        });
        const clipCount = builtTimeline?.videoSegments?.length || 0;

        if (!clipCount) {
            this.flow.showToast(window.i18n?.t('creator.toasts.noSubtitleWorkflow') || 'No subtitle workflow available', 'warning');
            return false;
        }

        const oldState = manager.captureState();
        const execute = () => {
            manager.tracks.v1.segments = builtTimeline.videoSegments;
            manager.tracks.a1.segments = builtTimeline.audioSegments;
            manager.selectedTrackId = builtTimeline.videoSegments.length ? 'v1' : 'a1';
            manager.selectedSegmentIndex = builtTimeline.videoSegments.length ? 0 : -1;
            manager.currentTime = 0;

            let globalDuration = builtTimeline.duration;
            Object.values(manager.tracks).forEach((track) => {
                track.segments?.forEach((segment) => {
                    globalDuration = Math.max(globalDuration, Number(segment.end ?? 0));
                });
            });
            manager.duration = globalDuration;

            manager.renderAll(true);
            manager.syncSegmentsWithApp();
            manager.updatePlayheadPosition();
            this.flow.subtitleAudioTrackImporter?.syncProject?.(project, { timelineMode: 'compact' });
            manager.onSeek?.(0, builtTimeline.firstSourceStart);
            this.flow.subtitleLaneManager?.render();
            this.flow.subtitlePreviewOverlay?.render?.(0);
            this.flow.showToast(
                window.i18n?.t('creator.toasts.subtitleCutsApplied', { count: clipCount }) || `Created ${clipCount} subtitle-based clips`,
                'success'
            );
        };
        const undo = () => manager.applyState(oldState);

        this.flow.history.execute({ execute, undo });
        return true;
    }
}

window.CreatorSubtitleCutActions = CreatorSubtitleCutActions;
