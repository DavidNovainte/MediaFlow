class CreatorWorkflowImporter {
    constructor(flow) {
        this.flow = flow;
    }

    async importPendingProject(options = {}) {
        const project = window.LocalizedEditProjectStore?.peekPendingProject?.();
        if (!project) return false;

        const imported = await this.importProject(project, options);
        if (imported) {
            window.LocalizedEditProjectStore?.clearPendingProject?.();
        }
        return imported;
    }

    async importProject(project, options = {}) {
        const normalizedProject = window.LocalizedEditProject?.create?.(project) || project;
        if (!window.LocalizedEditProject?.isValid?.(normalizedProject)) {
            return false;
        }

        const currentMediaPath = this.flow.getMediaPath?.(this.flow.videoFile || this.flow.audioFile);
        this.flow.localizedEditProject = normalizedProject;

        if (currentMediaPath !== normalizedProject.video.path) {
            await this.flow.addLocalFile?.(normalizedProject.video.path);
        }

        this.flow.subtitleLaneManager?.syncProject?.(normalizedProject, { silent: true });
        this.flow.subtitlePreviewOverlay?.syncProject?.(normalizedProject, { silent: true });
        this.flow.subtitleAudioTrackImporter?.syncProject?.(normalizedProject, { timelineMode: 'source' });
        this.flow.subtitleCutActions?.updateButtonState?.();

        document.dispatchEvent(new CustomEvent('creator:workflow-imported', {
            detail: {
                project: normalizedProject
            }
        }));

        if (!options.silent) {
            window.app?.showToast?.(this.buildImportMessage(normalizedProject), 'success');
        }

        return true;
    }

    buildImportMessage(project) {
        const subtitleTrackCount = Array.isArray(project.subtitleTracks) ? project.subtitleTracks.length : 0;
        const audioTrackCount = Array.isArray(project.audioTracks) ? project.audioTracks.length : 0;

        if (window.i18n?.t && window.i18n.t('creator.toasts.workflowImported') !== 'creator.toasts.workflowImported') {
            return window.i18n.t('creator.toasts.workflowImported', {
                subtitleTracks: subtitleTrackCount,
                audioTracks: audioTrackCount
            });
        }

        return `Imported ${subtitleTrackCount} subtitle track(s) and ${audioTrackCount} audio track(s) from Subtitle`;
    }
}

window.CreatorWorkflowImporter = CreatorWorkflowImporter;
