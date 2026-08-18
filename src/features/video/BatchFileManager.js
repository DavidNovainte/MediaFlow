/**
 * MediaFlow - BatchFileManager Component
 * 负责管理批量处理的文件数据状态 (Model 层)
 */
class BatchFileManager {
    constructor(batchFlow) {
        this.batchFlow = batchFlow; // Controller reference
        this.creatorFlow = batchFlow.creatorFlow;
        this.batchFiles = [];
        this.currentSortBy = null;
        this.sortDirection = 'asc';
    }

    /**
     * Add files to batch
     */
    async addFiles(files) {
        const newItems = Array.from(files).map(f => ({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            file: f,
            status: 'pending',
            progress: 0,
            result: null,
            duration: 0,
            resolution: null,
            objectUrl: null
        }));

        this.batchFiles = [...this.batchFiles, ...newItems];
        window.app?.showToast(window.i18n?.t('creator.batch.filesAdded', { count: files.length }) || `Added ${files.length} files`, 'success');

        // Notify Controller to Update UI
        this.batchFlow.onFilesAdded();

        // Extract metadata async
        for (const item of newItems) {
            try {
                item.objectUrl = URL.createObjectURL(item.file);
                await this._extractMetadata(item);
                this.batchFlow.refreshView(); // Update UI with duration/resolution
                this.batchFlow.uiManager?.updateTotalDuration(); // Update total duration display
            } catch (e) {
                console.warn('Metadata extraction failed', e);
            }
        }
    }

    /**
     * Add a local file by path (Internal/IPC use)
     * @param {string} filePath Absolute path
     */
    async addLocalFile(filePath) {
        if (!filePath) return;

        // Mock File object structure
        const name = filePath.split(/[/\\]/).pop();
        const mockFile = {
            name: name,
            path: filePath,
            type: 'video/mp4', // Generic fallback
            size: 0 // Unknown
        };

        const item = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            file: mockFile,
            status: 'pending',
            progress: 0,
            result: null,
            duration: 0,
            resolution: null,
            objectUrl: (window.urlUtils?.pathToMediaUrl?.(filePath) || `file://${filePath}`)
        };

        this.batchFiles = [...this.batchFiles, item];
        window.app?.showToast(window.i18n?.t('creator.batch.fileAdded', { name: name }) || 'File added: ' + name, 'success');

        this.batchFlow.onFilesAdded();

        try {
            await this._extractMetadata(item);
            this.batchFlow.refreshView();
        } catch (e) {
            console.warn('Metadata extraction failed', e);
        }
    }

    /**
     * Extract video metadata using a temporary video element
     */
    async _extractMetadata(item) {
        if (this.creatorFlow.service) {
            const meta = await this.creatorFlow.service.extractMetadata(item.objectUrl);
            item.duration = meta.duration;
            item.resolution = meta.resolution;
        } else {
            console.error('CreatorService not available');
        }
    }

    reset() {
        // Cleanup memory
        this.batchFiles.forEach(item => {
            if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
        });

        this.batchFiles = [];
        this.batchFlow.onFilesReset();
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

        this.batchFlow.refreshView();

        this.batchFlow.refreshView();
    }

    reorderFiles(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const movedItem = this.batchFiles.splice(fromIndex, 1)[0];
        this.batchFiles.splice(toIndex, 0, movedItem);
        this.batchFlow.refreshView();
    }

    removeFile(index) {
        const item = this.batchFiles[index];
        if (item && item.objectUrl) {
            URL.revokeObjectURL(item.objectUrl);
        }

        this.batchFiles.splice(index, 1);

        if (this.batchFiles.length === 0) {
            // 当队列清空时，调用自身的 reset，它会触发 onFilesReset 并引导 UI 关闭
            this.reset();
        } else {
            this.batchFiles = [...this.batchFiles]; // Ensure state update if needed
            this.batchFlow.refreshView();
        }
    }

    getFiles() {
        return this.batchFiles;
    }

    getFileCount() {
        return this.batchFiles.length;
    }

    isEmpty() {
        return this.batchFiles.length === 0;
    }
}

window.BatchFileManager = BatchFileManager;
