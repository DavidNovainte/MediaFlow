/**
 * MediaFlow - BatchCreatorFlow Component
 * 负责 Creator 页面中的批量处理和视频合并逻辑 (UI + 逻辑)
 */
class BatchCreatorFlow {
    constructor(creatorFlow) {
        this.creatorFlow = creatorFlow; // Parent reference
        this.isProcessing = false;

        // Configuration map
        this.TYPE_COMPRESS = 'compress';
        this.TYPE_CONVERT = 'convert';
        this.TYPE_MERGE = 'merge';
        this.TYPE_REMOVE_AUDIO = 'remove-audio';
        this.TYPE_VERTICAL = 'vertical';
        this.TYPE_SPEED = 'speed';
        this.TYPE_GIF = 'gif';
        this.TYPE_SILENCE = 'silence';

        // State for sorting
        this.currentSortBy = null;
        this.sortDirection = 'asc';
        this.lastActionType = null;

        // Components
        this.listRenderer = new window.BatchListRenderer(this);
        this.previewRenderer = new window.BatchPreviewRenderer(this);
        // Logic Handler
        this.processor = new window.BatchProcessor(this);
        this.fileManager = new window.BatchFileManager(this);
        this.uiManager = new window.BatchUIManager(this);
        this.mergePreview = new window.BatchMergePreview(this);
    }

    get batchFiles() {
        return this.fileManager ? this.fileManager.batchFiles : [];
    }

    onFilesAdded() {
        this.uiManager.showBatchUI(this.batchFiles.length);
    }

    onFilesReset() {
        this.uiManager.hideBatchUI();
    }

    onActionChanged(type) {
        this.lastActionType = type;
        this._refreshCurrentView();
    }

    // Helper methods for Renderers
    formatSize(bytes) {
        if (this.creatorFlow?.service?.formatSize) {
            return this.creatorFlow.service.formatSize(bytes);
        }
        // Fallback
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        if (this.creatorFlow?.service?.formatTime) {
            return this.creatorFlow.service.formatTime(seconds);
        }
        // Fallback
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }



    init() {
        this.uiManager.setupUI();
    }





    /**
     * Add files to batch
     */
    /**
     * Add files to batch
     */
    async addFiles(files) {
        await this.fileManager.addFiles(files);
    }

    /**
     * Add a local file by path (Internal/IPC use)
     * @param {string} filePath Absolute path
     */
    /**
     * Add a local file by path (Internal/IPC use)
     * @param {string} filePath Absolute path
     */
    async addLocalFile(filePath) {
        await this.fileManager.addLocalFile(filePath);
    }







    reset() {
        this.fileManager.reset();
        // batchFiles reset is handled in fileManager which calls onFilesReset
    }

    /**
     * Render List View
     */
    /**
     * Render List View (Virtual Scrolled)
     */
    renderBatchList() {
        this.listRenderer.render(this.batchFiles);
    }





    removeFile(index) {
        this.fileManager.removeFile(index);
    }

    /**
     * Render Carousel View (with new Drag & Drop)
     */
    /**
     * Render Empty State
     */


    renderPreviewCarousel() {
        this.previewRenderer.render(this.batchFiles);
    }

    /**
     * Preview Merge - Show choice dialog
     */
    previewMergeSequence() {
        this.mergePreview.previewMergeSequence();
    }



    sortFiles(by) {
        if (this.currentSortBy === by) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortBy = by;
            this.sortDirection = 'asc';
        }

        const isAsc = this.sortDirection === 'asc';

        if (by === 'name') {
            this.batchFiles.sort((a, b) => {
                const val = a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' });
                return isAsc ? val : -val;
            });
        } else if (by === 'time') {
            this.batchFiles.sort((a, b) => {
                const val = (a.duration || 0) - (b.duration || 0);
                return isAsc ? val : -val;
            });
        }
        this._refreshCurrentView();

        const dirKey = isAsc ? 'sortAsc' : 'sortDesc';
        const byKey = by === 'name' ? 'sortName' : 'sortTime';
        const dirText = window.i18n?.t(`creator.batch.${dirKey}`) || (isAsc ? 'Asc' : 'Desc');
        const byText = window.i18n?.t(`creator.batch.${byKey}`) || (by === 'name' ? 'Name' : 'Duration');
        const toastMsg = window.i18n?.t('creator.batch.sortedMsg', { by: byText, dir: dirText }) || `Sorted by ${byText} (${dirText})`;
        window.app?.showToast(toastMsg, 'success');
    }

    /**
     * Unified Drag & Drop Logic
     */
    reorderFiles(fromIndex, toIndex) {
        this.fileManager.reorderFiles(fromIndex, toIndex);
    }

    /**
     * Start Logic
     */
    async startBatchProcess() {
        this.processor.startBatch(this.batchFiles);
    }

    async processMerge(forceReencode = false, targetFps = null) {
        this.processor.processMerge(this.batchFiles, forceReencode, targetFps);
    }

    async cancelBatch() {
        await this.processor.cancelBatch();
    }

    setProcessingState(isProcessing) {
        this.isProcessing = isProcessing;
        this.uiManager.setProcessingState(isProcessing);
    }

    refreshView() {
        this._refreshCurrentView();
    }

    /**
     * Targeted update for a single item's progress
     */
    updateItemProgress(index, progress) {
        const isPreview = this.uiManager.isPreviewMode();
        if (isPreview) {
            this.previewRenderer.updateItemProgress(index, progress);
        } else {
            this.listRenderer.updateItemProgress(index, progress);
        }
    }







    _refreshCurrentView() {
        const isPreview = this.uiManager.isPreviewMode();
        this.uiManager.setBatchViewMode(isPreview ? 'card' : 'list');

        // Update Summary (Count & Total Duration)
        this.uiManager.updateBatchCount(this.batchFiles.length);
        this.uiManager.updateTotalDuration();

        if (isPreview) {
            this.renderPreviewCarousel();
        } else {
            this.renderBatchList();
        }
    }
}

// Export for easier testing or module usage if modules were strict
// But since this is likely loaded via script tag in simple Electron apps:
window.BatchCreatorFlow = BatchCreatorFlow;
