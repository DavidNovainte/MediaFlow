/**
 * MediaFlow - BatchProcessor Component
 * 负责批量处理的核心逻辑 (压缩、转换、合并的执行循环)
 */
class BatchProcessor {
    constructor(batchFlow) {
        this.batchFlow = batchFlow;
        this.creatorFlow = batchFlow.creatorFlow;

        // Config constants (Proxy from batchFlow)
        this.TYPE_COMPRESS = batchFlow.TYPE_COMPRESS;
        this.TYPE_CONVERT = batchFlow.TYPE_CONVERT;
        this.TYPE_MERGE = batchFlow.TYPE_MERGE;
        this.TYPE_REMOVE_AUDIO = batchFlow.TYPE_REMOVE_AUDIO;
        this.TYPE_VERTICAL = batchFlow.TYPE_VERTICAL;
        this.TYPE_SPEED = batchFlow.TYPE_SPEED;
        this.TYPE_GIF = batchFlow.TYPE_GIF;
        this.TYPE_SILENCE = batchFlow.TYPE_SILENCE;

        // 初始化任务执行代理 (分而治之，保持单文件代码精简)
        this.taskRunner = new window.BatchTaskRunner(this.creatorFlow.videoProcessor);

        // 记录上次执行的操作类型，用于状态重置逻辑
        this.lastType = null;
    }

    /**
     * Start the batch process based on UI selection
     */
    async startBatch(batchFiles) {
        if (this.batchFlow.isProcessing) return;
        if (batchFiles.some(f => f.status === 'processing')) return;

        const type = document.getElementById('batch-action-select')?.value || document.getElementById('batch-action-type')?.value;

        // 【核心修复】逻辑重置：如果操作类型发生变化，或者之前的所有任务都已完成，则重置所有状态以便重新开始
        const allDoneOrError = batchFiles.every(f => f.status === 'done' || f.status === 'error');
        const actionChanged = this.lastType && this.lastType !== type;

        if (actionChanged || allDoneOrError) {
            batchFiles.forEach(f => {
                f.status = 'pending';
                f.errorMessage = '';
            });
            this.batchFlow.refreshView();
        }

        this.lastType = type;

        console.log('[BatchProcessor] Start:', { type, count: batchFiles.length });

        // MERGE MODE
        if (type === this.TYPE_MERGE) {
            await this.processMerge(batchFiles);
            return;
        }

        // COMPRESS / CONVERT / VERTICAL / SPEED / GIF / SILENCE / REMOVE AUDIO
        await this.processLoop(batchFiles, type);
    }

    /**
     * Execute Merge Process
     */
    async processMerge(batchFiles, forceReencode = false, targetFps = null) {
        if (batchFiles.length < 2) {
            window.app?.showToast(window.i18n?.t('creator.batch.mergeMinCount') || 'Merge requires at least 2 videos', 'warning');
            return;
        }

        const savePath = await window.mediaflow?.dialog.saveFile({
            title: window.i18n?.t('creator.video.saveMerged') || 'Save Merged Video',
            defaultPath: 'merged_video.mp4',
            filters: [{ name: 'Video', extensions: ['mp4'] }]
        });
        if (!savePath) return;

        this.batchFlow.setProcessingState(true);
        this.creatorFlow.showProgress(
            window.i18n?.t('creator.video.statusMergingVideos') || 'Merging videos...',
            0,
            true,
            () => window.mediaflow?.video.cancel()
        );

        try {
            // Update UI status to processing
            batchFiles.forEach(f => f.status = 'processing');
            this.batchFlow.refreshView();

            const inputs = batchFiles.map(i => i.file.path);

            // 获取转场和混音设置
            const transition = document.getElementById('batch-merge-transition')?.value || 'none';
            const normalizeAudio = document.getElementById('batch-merge-norm')?.checked || false;

            // 【核心修复】自动检测规格冲突并弹出确认框 (全面恢复逻辑)
            const validFiles = batchFiles.filter(f => f.resolution);
            let hasSpecMismatch = false;

            if (validFiles.length > 1) {
                const firstRes = `${validFiles[0].resolution.width}x${validFiles[0].resolution.height}`;
                hasSpecMismatch = validFiles.some(f => `${f.resolution.width}x${f.resolution.height}` !== firstRes);
            }

            // 如果存在规格差异，且当前还没有指定目标帧率（即还没弹窗确认过），则弹出对话框
            if (hasSpecMismatch && !targetFps) {
                console.log('[BatchProcessor] Detected resolution mismatch, triggering dialog');
                const fpsInfo = {
                    dominantFps: 30, // 默认推荐值
                    mismatchedVideos: validFiles.map(f => ({
                        name: f.file.name,
                        fps: f.resolution ? `${f.resolution.width}x${f.resolution.height}` : 'unknown'
                    }))
                };

                const confirmed = await this.creatorFlow.videoProcessor.ui.showFpsMismatchDialog(fpsInfo, async (confirmFps) => {
                    // 用户选择确认重新编码合并
                    forceReencode = true;
                    targetFps = confirmFps;
                });

                if (!confirmed) {
                    batchFiles.forEach(f => f.status = 'pending');
                    this.batchFlow.refreshView();
                    return;
                }
            }

            // CALL VIDEO PROCESSOR (确保参数准确传递)
            const result = await this.creatorFlow.videoProcessor.mergeVideos(inputs, savePath, {
                forceReencode: forceReencode || transition !== 'none' || normalizeAudio || !!targetFps,
                targetFps,
                transition,
                normalizeAudio,
                isBatch: true
            });

            if (result?.success) {
                batchFiles.forEach(f => f.status = 'done');
                const modeKey = result.reencoded ? 'modeReencode' : 'modeFast';
                const modeText = window.i18n?.t(`creator.batch.${modeKey}`) || (result.reencoded ? '(Re-encode Mode)' : '(Fast Mode)');
                window.app?.showToast(window.i18n?.t('creator.batch.mergeSuccess', { mode: modeText }) || `Merge Success! ${modeText}`, 'success');
                // Show Open Folder button
                const dirPath = await window.mediaflow?.path.dirname(savePath);
                this.batchFlow.uiManager.showOpenFolderBtn(dirPath);
            } else if (result?.action === 'cancel') {
                // User cancelled via dialog
                batchFiles.forEach(f => f.status = 'pending');
                window.app?.showToast(window.i18n?.t('creator.batch.mergeCancel') || 'Merge Cancelled', 'info');
            } else {
                batchFiles.forEach(f => f.status = 'error');
                throw new Error(result?.error || (window.i18n?.t('creator.batch.mergeFail') || 'Merge failed'));
            }
        } catch (error) {
            if (error.message?.includes('CANCELLED_BY_USER')) {
                batchFiles.forEach(f => f.status = 'pending');
                window.app?.showToast(window.i18n?.t('creator.batch.mergeCancel') || 'Merge cancelled', 'info');
                return;
            }
            console.error('Merge error:', error);
            window.app?.showToast((window.i18n?.t('creator.batch.mergeFail') || 'Merge failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
        } finally {
            this.batchFlow.setProcessingState(false);
            this.batchFlow.refreshView();
            this.creatorFlow.hideProgress();
        }
    }

    /**
     * Execute Sequence Processing Loop
     */
    /**
     * Execute Sequence Processing Loop (With Parallel Support)
     */
    async processLoop(batchFiles, type) {
        const saveFolder = await window.mediaflow?.dialog.selectFolder();
        if (!saveFolder) return;

        // 从批量处理界面的并发数控件读取，若无则使用默认值 2
        const concurrentSelect = document.getElementById('batch-concurrent-tasks');
        const maxConcurrent = concurrentSelect ? parseInt(concurrentSelect.value, 10) : 2;
        console.log(`[Batch] Starting with concurrency: ${maxConcurrent}`);

        this.batchFlow.setProcessingState(true);
        this.asyncQueue = new window.AsyncQueue(maxConcurrent);

        // Progress State Tracking
        const totalFiles = batchFiles.length;
        const progressMap = new Map(); // path -> percent

        // Update Global UI Progress
        const updateGlobalProgress = () => {
            let totalPct = 0;
            progressMap.forEach(p => totalPct += p);
            const globalPct = totalPct / totalFiles;

            const runningCount = this.asyncQueue.getStatus().running;
            const doneCount = this.asyncQueue.getStatus().completed;
            const statusText = window.i18n?.t('creator.batch.processingStatus', { done: doneCount, total: totalFiles, running: runningCount }) || `Processing: ${doneCount}/${totalFiles} (Running: ${runningCount})`;

            this.creatorFlow.updateProgress(globalPct, statusText);
        };

        // Initialize progress map
        batchFiles.forEach(f => progressMap.set(f.file.path, 0));

        // Create Tasks
        batchFiles.forEach((item, index) => {
            if (item.status === 'done') {
                progressMap.set(item.file.path, 100);
                return;
            }

            const taskFn = async () => {
                const taskId = `task_${index}_${Date.now()}`;
                const inputPath = item.file.path;

                const onProgress = (pct) => {
                    item.progress = pct;
                    progressMap.set(inputPath, pct);
                    updateGlobalProgress();
                    // LOCAL UPDATE to avoid flickering
                    this.batchFlow.updateItemProgress(index, pct);
                };

                // 注册到 VideoProcessor 的分发器
                if (this.creatorFlow.videoProcessor) {
                    this.creatorFlow.videoProcessor._batchProgressCallbacks[taskId] = onProgress;
                }

                item.status = 'processing';
                item.progress = 0;
                item.taskId = taskId;
                this.batchFlow.refreshView();

                try {
                    // 使用代理执行器统一处理具体业务逻辑
                    const globalOptions = this.taskRunner.getGlobalOptions(type);
                    let result = await this.taskRunner.executeTask(
                        type,
                        item,
                        saveFolder,
                        globalOptions,
                        onProgress,
                        taskId
                    );

                    if (result?.success) {
                        item.status = 'done';
                        progressMap.set(inputPath, 100);
                    } else {
                        item.status = 'error';
                        item.errorMessage = result?.error;
                        progressMap.set(inputPath, 0); // Reset or Keep?
                    }

                } catch (e) {
                    const errorMsg = e.message || e.error || e;
                    if (errorMsg.includes('User canceled') || errorMsg.includes('CANCELLED_BY_USER')) {
                        item.status = 'error'; // Keep error style but change text to be localized
                        item.errorMessage = window.i18n?.t('creator.batch.statusCanceled') || 'Cancelled';
                    } else {
                        console.error('[Batch] Task Error:', e);
                        item.status = 'error';
                        item.errorMessage = window.ErrorUtils.formatError(e);
                    }
                    progressMap.set(inputPath, 0);
                } finally {
                    // 清理分发器
                    if (this.creatorFlow.videoProcessor) {
                        delete this.creatorFlow.videoProcessor._batchProgressCallbacks[taskId];
                    }
                    this.batchFlow.refreshView();
                    updateGlobalProgress();
                }
            };

            this.asyncQueue.push(taskFn, { name: item.file.name });
        });

        // Wait for queue completion
        return new Promise((resolve) => {
            this.asyncQueue.onComplete = () => {
                this.batchFlow.setProcessingState(false);
                this.creatorFlow.hideProgress();
                window.app?.showToast(window.i18n?.t('creator.toasts.batchComplete') || 'Batch process complete', 'success');
                // Show Open Folder button
                if (saveFolder) {
                    this.batchFlow.uiManager.showOpenFolderBtn(saveFolder);
                }
                resolve();
            };

            // Start if tasks were added
            if (this.asyncQueue.queue.length === 0 && this.asyncQueue.running === 0) {
                this.asyncQueue.onComplete();
            }
        });
    }

    /**
     * Cancel all pending and running batch tasks
     */
    async cancelBatch() {
        if (!this.asyncQueue) return;

        console.log('[Batch] Cancelling batch process...');
        const batchFiles = this.batchFlow?.batchFiles || [];

        // 1. Clear the queue (stops future tasks from starting)
        this.asyncQueue.clear();

        // 2. Kill current processes in the backend
        if (window.mediaflow?.video?.cancel) {
            try {
                await window.mediaflow.video.cancel();
            } catch (err) {
                console.error('[Batch] Failed to send cancel signal to backend:', err);
            }
        }

        // 3. Update UI states
        this.batchFlow.setProcessingState(false);
        this.creatorFlow.hideProgress();

        // 4. Mark processing items as cancelled
        batchFiles.forEach((item) => {
            if (item.status === 'processing' || item.status === 'pending') {
                item.status = 'error';
                item.errorMessage = window.i18n?.t('creator.batch.cancelledMsg') || 'Manually cancelled';
                item.progress = 0;
            }
        });

        this.batchFlow.refreshView();

        if (window.app?.showToast) {
            window.app.showToast(window.i18n?.t('creator.batch.cancelledMsg') || 'Manually cancelled', 'warning');
        }
    }
}

window.BatchProcessor = BatchProcessor;
