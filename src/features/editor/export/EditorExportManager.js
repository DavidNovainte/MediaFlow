const EDITOR_EXPORT_CONTROL_CHAR_RANGE = `${String.fromCharCode(0)}-${String.fromCharCode(31)}`;
const EDITOR_EXPORT_INVALID_NAME_CHARS_RE = new RegExp(`[${EDITOR_EXPORT_CONTROL_CHAR_RANGE}<>:"/\\\\|?*]`, 'g');

class EditorExportManager {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.currentJobId = null;
        this.currentState = null;
        this.isExporting = false;
        this.progress = 0;
        this.registeredProgress = false;
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.registerProgressListener();
        window.addEventListener('languageChanged', () => this.updateButtonState());
    }

    cacheElements() {
        this.elements = {
            exportButton: document.getElementById('btn-editor-export')
        };
    }

    bindEvents() {
        this.elements.exportButton?.addEventListener('click', () => {
            this.handleExport();
        });
    }

    registerProgressListener() {
        if (this.registeredProgress || typeof window.mediaflow?.creator?.onProgress !== 'function') {
            return;
        }

        window.mediaflow.creator.onProgress((payload) => {
            if (!payload || !this.currentJobId || payload.jobId !== this.currentJobId) return;
            this.progress = Math.max(0, Math.min(100, Number(payload.progress) || 0));
            this.updateButtonState();
        });
        this.registeredProgress = true;
    }

    render(state) {
        this.currentState = state;
        this.updateButtonState();
    }

    summarizeExportTracks(state) {
        const trackOrder = Array.isArray(state?.trackOrder) ? state.trackOrder : [];
        const trackMeta = state?.trackMeta || {};
        const timeline = state?.timeline || {};
        let hasVideo = false;
        let hasAudio = false;
        let activeVideoTrackCount = 0;

        trackOrder.forEach((trackId) => {
            if (!this.isTrackExportActive(state, trackId)) return;
            const clips = (Array.isArray(timeline?.[trackId]) ? timeline[trackId] : [])
                .filter((clip) => this.isClipExportable(state, clip));
            if (!clips.length) return;

            const trackType = trackMeta?.[trackId]?.type || null;
            if (trackType === 'video' || trackType === 'image') {
                hasVideo = true;
                activeVideoTrackCount += 1;
                return;
            }

            if (trackType === 'audio') {
                hasAudio = true;
            }
        });

        if (!trackOrder.length) {
            hasVideo = (state?.timeline?.video || []).some((clip) => this.isClipExportable(state, clip));
            hasAudio = (state?.timeline?.audio || []).some((clip) => this.isClipExportable(state, clip));
            activeVideoTrackCount = hasVideo ? 1 : 0;
        }

        return {
            hasVideo,
            hasAudio,
            hasContent: hasVideo || hasAudio,
            activeVideoTrackCount
        };
    }

    getClipSourcePath(state, clip) {
        if (!clip?.assetId) return '';
        const asset = this.flow.store?.getAssetById?.(clip.assetId)
            || (Array.isArray(state?.assets) ? state.assets.find((item) => item?.id === clip.assetId) : null);
        return asset?.path || asset?.file?.path || '';
    }

    isClipExportable(state, clip) {
        return !!this.getClipSourcePath(state, clip);
    }

    isTrackExportActive(state, trackId) {
        if (!trackId) return false;
        const control = state?.trackControls?.[trackId] || {};
        if (control.hidden) return false;

        if (typeof this.flow.store?.isTrackActive === 'function') {
            return this.flow.store.isTrackActive(trackId) !== false;
        }

        const controls = state?.trackControls || {};
        const hasSolo = Object.values(controls).some((entry) => !!entry?.solo);
        return !hasSolo || !!control.solo;
    }

    hasExportableContent(state) {
        const summary = this.summarizeExportTracks(state);
        return summary.hasContent && !this.getExportBlockReasonFromSummary(summary);
    }

    getExportBlockReasonFromSummary(summary) {
        // Multi visual tracks export as primary + overlays (lowest track number first).
        void summary;
        return '';
    }

    getExportBlockReason(state) {
        return this.getExportBlockReasonFromSummary(this.summarizeExportTracks(state));
    }

    getExportKind(state) {
        return this.summarizeExportTracks(state).hasVideo ? 'video+audio' : 'audio';
    }

    getIdleLabel() {
        const key = this.getExportKind(this.currentState) === 'audio'
            ? 'editor.exportMp3'
            : 'editor.exportMp4';
        return window.i18n?.t?.(key) || (key.endsWith('Mp3') ? 'Export MP3' : 'Export MP4');
    }

    renderButtonContent(label, iconClass = 'fa-arrow-up-from-bracket') {
        return `<i class="fa-solid ${iconClass}"></i><span>${label}</span>`;
    }

    updateButtonState() {
        const button = this.elements.exportButton;
        if (!button) return;

        const summary = this.summarizeExportTracks(this.currentState);
        const blockReason = this.getExportBlockReasonFromSummary(summary);
        const hasContent = summary.hasContent && !blockReason;
        const idleLabel = this.getIdleLabel();
        button.disabled = this.isExporting || !hasContent;
        button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');

        if (this.isExporting) {
            button.title = `导出中 ${Math.round(this.progress)}%`;
        } else if (!summary.hasContent) {
            button.title = '时间线为空 · 请先加入片段';
        } else if (blockReason) {
            button.title = blockReason;
        } else {
            button.title = `${idleLabel} · 点击选择保存位置`;
        }

        button.innerHTML = this.isExporting
            ? this.renderButtonContent(`导出中 ${Math.round(this.progress)}%`, 'fa-spinner fa-spin')
            : this.renderButtonContent(idleLabel);
    }

    getPreviewStageSize() {
        const stage = this.flow.previewManager?.elements?.stage
            || document.querySelector('#page-editor .editor-preview-stage');
        const rect = stage?.getBoundingClientRect?.();
        const width = Math.round(Number(rect?.width) || Number(stage?.clientWidth) || 0);
        const height = Math.round(Number(rect?.height) || Number(stage?.clientHeight) || 0);
        if (!width || !height) return null;
        return { width, height };
    }

    attachPreviewStageToSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.tracks)) return snapshot;
        const stage = this.getPreviewStageSize();
        if (!stage) return snapshot;

        snapshot.tracks.forEach((track) => {
            (track.clips || []).forEach((clip) => {
                if (!clip) return;
                if (!clip.previewStageWidth) clip.previewStageWidth = stage.width;
                if (!clip.previewStageHeight) clip.previewStageHeight = stage.height;
            });
        });
        return snapshot;
    }

    sanitizeName(value) {
        return String(value || 'editor_project')
            .replace(EDITOR_EXPORT_INVALID_NAME_CHARS_RE, '_')
            .trim() || 'editor_project';
    }

    async askSavePath(state, exportKind) {
        const extension = exportKind === 'audio' ? 'mp3' : 'mp4';
        const defaultPath = `${this.sanitizeName(state?.name)}_export.${extension}`;
        return window.mediaflow?.dialog?.saveFile?.({
            title: exportKind === 'audio' ? '导出音频' : '导出视频',
            defaultPath,
            filters: [
                {
                    name: exportKind === 'audio' ? '音频' : '视频',
                    extensions: [extension]
                }
            ]
        });
    }

    async handleExport() {
        const state = this.flow.store.getState();
        this.currentState = state;
        const blockReason = this.getExportBlockReason(state);
        if (blockReason) {
            window.app?.showToast(blockReason, 'warning');
            return;
        }

        if (!this.hasExportableContent(state)) {
            window.app?.showToast(
                window.i18n?.t('editor.timelineEmpty') || 'Timeline is empty',
                'warning'
            );
            return;
        }

        if (!window.EditorTimelineProjectSnapshot || !window.CreatorExportPlanner || !window.mediaflow?.creator?.export) {
            window.app?.showToast(
                window.i18n?.t('editor.exportNotReady') || 'Export pipeline is not ready yet',
                'error'
            );
            return;
        }

        const exportKind = this.getExportKind(state);
        const format = exportKind === 'audio' ? 'mp3' : 'mp4';

        try {
            const outputPath = await this.askSavePath(state, exportKind);
            if (!outputPath) return;

            const snapshot = this.attachPreviewStageToSnapshot(
                window.EditorTimelineProjectSnapshot.create(this.flow.store)
            );
            const planner = new window.CreatorExportPlanner(window.CreatorExportCapabilityMatrix);
            const job = planner.buildJob(snapshot, {
                type: exportKind,
                format,
                outputPath,
                jobId: `editor_export_${Date.now()}`
            });

            this.currentJobId = job.jobId;
            this.isExporting = true;
            this.progress = 0;
            this.updateButtonState();

            const result = await window.mediaflow.creator.export(job);
            if (!result?.success) {
                throw new Error(
                    result?.error ||
                        window.i18n?.t('editor.exportFailed') ||
                        'Export failed'
                );
            }

            window.app?.showToast(
                exportKind === 'audio'
                    ? window.i18n?.t('editor.exportAudioOk') || 'Audio exported successfully'
                    : window.i18n?.t('editor.exportVideoOk') || 'Video exported successfully',
                'success'
            );
        } catch (error) {
            const message =
                error?.message || window.i18n?.t('editor.exportFailed') || 'Export failed';
            console.error('[EditorExportManager] Export failed:', error);
            window.app?.showToast(message, 'error');
        } finally {
            this.currentJobId = null;
            this.isExporting = false;
            this.progress = 0;
            this.updateButtonState();
        }
    }
}

window.EditorExportManager = EditorExportManager;

if (typeof module !== 'undefined') {
    module.exports = EditorExportManager;
}
