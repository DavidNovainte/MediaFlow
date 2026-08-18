/**
 * MediaFlow - BatchMergePreview Component
 * 负责处理视频合并的预览逻辑 (Service 层)
 */
class BatchMergePreview {
    constructor(batchFlow) {
        this.batchFlow = batchFlow; // Controller reference
        this.creatorFlow = batchFlow.creatorFlow;
        this.previewRenderer = batchFlow.previewRenderer;
    }

    /**
     * Preview Merge - Show choice dialog
     */
    previewMergeSequence() {
        const batchFiles = this.batchFlow.batchFiles;

        if (batchFiles.length === 0) {
            window.app?.showToast(window.i18n?.t('common.errors.noPreviewFiles') || 'No files to preview', 'warning');
            return;
        }

        this.previewRenderer.showPreviewDialog(
            () => this.previewRenderer.playQuickSequence(batchFiles),
            () => this._previewRealMerge()
        );
    }

    /**
     * Real Preview - Merge to temp file then play
     */
    async _previewRealMerge() {
        const batchFiles = this.batchFlow.batchFiles;

        if (batchFiles.length < 2) {
            window.app?.showToast(window.i18n?.t('creator.batch.mergeMinPreview') || 'At least 2 videos required for merge preview', 'warning');
            return;
        }

        // Show loading state
        this.creatorFlow.showProgress(window.i18n?.t('creator.batch.statusGeneratingPreview') || 'Generating preview...');
        window.app?.showToast(window.i18n?.t('creator.batch.statusTempMerging') || 'Generating temporary merge file, please wait...', 'info');

        try {
            // Get temp directory via IPC (Electron preload should expose this)
            let tempPath;
            if (window.mediaflow?.app?.getTempPath) {
                tempPath = await window.mediaflow.app.getTempPath();
                tempPath = tempPath + '/mediaflow_preview_' + Date.now() + '.mp4';
            } else {
                // Fallback: use app data path or a relative path
                const userDataPath = await window.mediaflow?.app?.getAppPath?.('temp') ||
                    await window.mediaflow?.app?.getAppPath?.('userData');
                if (userDataPath) {
                    tempPath = userDataPath + '/mediaflow_preview_' + Date.now() + '.mp4';
                } else {
                    // Last resort: use current directory
                    tempPath = './temp_preview_' + Date.now() + '.mp4';
                }
            }

            const transition = document.getElementById('batch-merge-transition')?.value || 'none';
            const normalizeAudio = document.getElementById('batch-merge-norm')?.checked || false;

            const inputs = batchFiles.map(i => i.file.path);
            const result = await window.mediaflow?.video.merge({
                inputs,
                output: tempPath,
                forceReencode: true, // Force re-encode to ensure browser compatibility
                isPreview: true,     // Use ultrafast preset
                transition,
                normalizeAudio
            });

            this.creatorFlow.hideProgress();

            if (result?.success) {
                // Play the merged temp file
                const previewUrl = window.urlUtils?.pathToMediaUrl?.(tempPath) || (`file://${tempPath}`);
                this.previewRenderer.playVideo(previewUrl, `
                    <div style="text-align:center">
                        <span style="color: var(--accent-primary);">${window.i18n?.t('creator.batch.realMergePreviewTitle') || '🎬 Real Merge Preview'}</span><br>
                        <span style="opacity: 0.6; font-size: 0.85rem;">${window.i18n?.t('creator.batch.realMergePreviewDesc') || 'This shows the actual merged output'}</span>
                    </div>
                `);
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.batch.mergePreviewFail') || 'Merge preview failed'));
            }
        } catch (error) {
            this.creatorFlow.hideProgress();
            console.error('Real preview error:', error);
            window.app?.showToast((window.i18n?.t('creator.batch.previewGenFail') || 'Preview generation failed') + ': ' + error.message, 'error');
        }
    }
}

window.BatchMergePreview = BatchMergePreview;
