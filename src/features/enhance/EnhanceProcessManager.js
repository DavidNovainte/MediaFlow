/**
 * EnhanceProcessManager.js - AI 画质增强执行管理器
 * 负责处理增强任务、批量循环、进度监听及取消操作
 */

class EnhanceProcessManager {
    constructor(controller) {
        this.controller = controller;
        this.lastProgress = 0;
        this.isProcessing = false;

        // 监听器清理函数
        this.progressCleanup = null;
        this.batchProgressCleanup = null;
        this.fileCompleteCleanup = null;
    }

    /**
     * Map backend / engine errors to short user-facing copy.
     */
    mapEnhanceError(err, result) {
        const t = (key, fb, params) => {
            try {
                const v = window.i18n?.t?.(key, params);
                if (v && v !== key) return v;
            } catch {
                /* ignore */
            }
            return fb;
        };
        const raw = String(err?.message || err || '');
        if (!raw) return t('enhance.processFail', 'Processing failed');

        if (/cancelled|Process cancelled/i.test(raw)) {
            return t('enhance.cancelled', 'Cancelled');
        }
        if (/longer than|over .*s|MAX_DURATION|45s|not supported.*Trim/i.test(raw)) {
            return t('enhance.videoTooLong', 'Video longer than {max}s is not supported. Trim first or use a short clip.', {
                max: 45
            });
        }
        if (/Too many frames|MVP limit|MAX_FRAMES/i.test(raw)) {
            return t(
                'enhance.errors.tooManyFrames',
                'Too many frames for this version. Use a shorter clip or lower frame rate.'
            );
        }
        if (/engine binary missing|执行文件缺失|not found/i.test(raw)) {
            return t(
                'enhance.errors.engineNotReady',
                'Engine not installed. Download it from the model list first.'
            );
        }
        if (/GPU|CUDA|Vulkan|out of memory|OOM|显存/i.test(raw)) {
            return t(
                'enhance.errors.gpuMemory',
                'GPU memory or driver issue. Try Eco mode, close other apps, or use a smaller image.'
            );
        }
        if (/ffmpeg|ffprobe/i.test(raw)) {
            return t(
                'enhance.errors.ffmpegMissing',
                'ffmpeg is missing or failed. Check Settings → Core engines.'
            );
        }
        // Prefer short message; avoid dumping long stack traces
        if (raw.length > 180) return t('enhance.processFail', 'Processing failed') + `: ${raw.slice(0, 120)}…`;
        return raw;
    }

    /**
     * 开始增强处理逻辑
     */
    async start() {
        if (this.controller.stateManager.fileData.length === 0 || this.isProcessing) return;

        // 检查引擎可用性（云端 API 引擎已下架）
        const engineInfo = this.controller.settingsManager.currentEngineInfo;
        if (engineInfo?.type === 'api' || String(this.controller.currentEngine || '').endsWith('-api')) {
            this.controller.showToast?.(
                window.i18n?.t('enhance.cloudRetired') || 'Cloud enhance is no longer available. Pick a local model.',
                'warning'
            );
            return;
        }
        if (engineInfo && !engineInfo.isAvailable) {
            return this.controller.settingsManager.downloadEngine();
        }

        this.isProcessing = true;
        this.controller.isProcessing = true; // 同步状态到主控制器
        this.controller.updateUI();
        this.showProgress(window.i18n?.t('enhance.statusPreparing') || 'Notification');

        try {
            const outputDir = this.controller.outputDir || await this.getDefaultOutputDir();
            this.controller.outputDir = outputDir;

            if (this.controller.stateManager.fileData.length === 1) {
                await this.processSingle(this.controller.stateManager.fileData[0], outputDir);
            } else {
                await this.processBatch(this.controller.stateManager.fileData, outputDir);
            }
        } catch (error) {
            const msg = (error && error.message) ? String(error.message) : String(error || '');
            // 如果是用户主动取消，已经在 cancel() 中提示过了，忽略此错误
            if (msg.includes('cancelled') || msg.includes('Process cancelled')) {
                return;
            }
            console.error('[EnhanceProcessManager] Process failed:', error);
            window.app?.showToast(msg || window.i18n?.t('enhance.processException') || 'Processing exception occurred', 'error');
        } finally {
            this.cleanup();
        }
    }

    /**
     * 单文件处理
     */
    isVideoPath(filePath) {
        return /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(filePath || ''));
    }

    async processSingle(item, outputDir) {
        this.controller._lastOutputFiles = [];
        this.controller._lastOutputDir = outputDir;
        const inputPath = item.path;
        const isVideo = item.isVideo || this.isVideoPath(inputPath);
        const inputExt = await window.mediaflow.path.extname(inputPath);
        let ext = isVideo ? '.mp4' : inputExt;
        if (!isVideo && item.options.format && item.options.format !== 'auto') {
            ext = `.${item.options.format}`;
        }

        const newBase = this.controller.exportManager.generateFileName(inputPath, {
            engineId: item.engine,
            ...item.options
        });
        const outputPath = await window.mediaflow.path.join(outputDir, `${newBase}${ext}`);

        // 进度监听
        this.progressCleanup = window.mediaflow.enhance.onProgress(({ progress, text }) => {
            this.updateProgress(progress, text);
        });

        // Video MVP: force 2× for VRAM / time budget
        const options = { engineId: item.engine, ...item.options };
        if (isVideo) {
            if (Number(item.options?.scale) > 2) {
                window.app?.showToast(
                    window.i18n?.t('enhance.videoScaleCapped') || 'Video enhance is limited to 2× in this version',
                    'info'
                );
            }
            options.scale = 2;
        }

        const result = isVideo
            ? await window.mediaflow.enhance.video(inputPath, outputPath, options)
            : await window.mediaflow.enhance.image(inputPath, outputPath, options);

        if (result && result.success) {
            const out = result.outputPath || result.output || outputPath;
            item.result = { ...result, status: 'success', outputPath: out, output: out, kind: isVideo ? 'video' : 'image' };
            item.isVideo = isVideo;
            this.rememberOutput(out, outputDir);
            window.app?.showToast(window.i18n?.t('enhance.toastEnhanceSuccess') || 'Notification', 'success');
            if (isVideo) {
                // Show original + enhanced as side-by-side video layers (hold-to-compare still works)
                this.controller.showComparison?.(inputPath, out);
            } else {
                this.controller.showComparison(inputPath, out);
            }
        } else {
            const err = (result && result.error) || 'Processing failed';
            item.result = { ...(item.result || {}), ...(result || {}), status: 'error', error: err };

            // 忽略取消导致的错误提示
            const isCancelled =
                typeof err === 'string' &&
                (err.includes('cancelled') || err.includes('Process cancelled'));
            if (!isCancelled) {
                window.app?.showToast(this.mapEnhanceError(err, result), 'error');
            }
        }
        this.controller.updateFileList();
    }

    /**
     * 批量循环处理
     */
    async processBatch(fileList, outputDir) {
        this.controller._lastOutputFiles = [];
        this.controller._lastOutputDir = outputDir;
        // 先设置批量进度监听 (可选，取决于后端是否支持整体进度)
        this.fileCompleteCleanup = window.mediaflow.enhance.onFileComplete(({ fileIndex, result }) => {
            const item = fileList[fileIndex];
            if (item) {
                item.result = { ...result, status: result.success ? 'success' : 'error' };
                this.controller.updateFileList();
                if (result.success && fileIndex === this.controller.stateManager.currentIndex) {
                    this.controller.showComparison(item.path, result.outputPath || result.output);
                }
            }
        });

        for (let i = 0; i < fileList.length; i++) {
            const item = fileList[i];
            if (item.result.status === 'success') continue;
            if (!this.isProcessing) break; // 支持中途取消

            item.result.status = 'processing';
            this.controller.updateFileList();

            const isVideo = item.isVideo || this.isVideoPath(item.path);
            const inputExt = await window.mediaflow.path.extname(item.path);
            let ext = isVideo ? '.mp4' : inputExt;
            if (!isVideo && item.options.format && item.options.format !== 'auto') ext = `.${item.options.format}`;

            const newBase = this.controller.exportManager.generateFileName(item.path, { engineId: item.engine, ...item.options });
            const outputPath = await window.mediaflow.path.join(outputDir, `${newBase}${ext}`);

            // 单个文件的进度
            const subProgress = window.mediaflow.enhance.onProgress(({ progress, text }) => {
                const label = text || `${Math.round(progress || 0)}%`;
                this.updateProgress(progress, `(${i + 1}/${fileList.length}) ${label}`);
            });

            const options = { engineId: item.engine, ...item.options };
            if (isVideo) options.scale = 2;

            const result = isVideo
                ? await window.mediaflow.enhance.video(item.path, outputPath, options)
                : await window.mediaflow.enhance.image(item.path, outputPath, options);

            subProgress(); // 移除当前监听

            if (result?.success) {
                const out = result.outputPath || result.output || outputPath;
                item.result = { ...result, status: 'success', outputPath: out, output: out, kind: isVideo ? 'video' : 'image' };
                item.isVideo = isVideo;
                this.rememberOutput(out, outputDir);
                if (result.success && i === this.controller.stateManager.currentIndex && !isVideo) {
                    this.controller.showComparison(item.path, out);
                }
            } else {
                item.result = { ...result, status: 'error', error: result?.error };
            }
            this.controller.updateFileList();
        }

        if (this.isProcessing) {
            window.app?.showToast(window.i18n?.t('enhance.processComplete') || 'Processing complete!', 'success');
        }
    }

    rememberOutput(outputPath, outputDir) {
        if (!outputPath) return;
        if (!Array.isArray(this.controller._lastOutputFiles)) {
            this.controller._lastOutputFiles = [];
        }
        if (!this.controller._lastOutputFiles.includes(outputPath)) {
            this.controller._lastOutputFiles.push(outputPath);
        }
        this.controller._lastOutputDir = outputDir || this.controller.outputDir || '';
    }

    /**
     * 导出当前已缩放/裁剪的视口区域
     */
    async exportSelection() {
        if (this.isProcessing) return;
        const cur = this.controller.stateManager.getCurrentItem();
        if (cur?.isVideo || this.isVideoPath(cur?.path)) {
            window.app?.showToast(
                window.i18n?.t('enhance.videoPreviewUnavailable')
                    || 'Region export is for images only',
                'info'
            );
            return;
        }

        const item = this.controller.stateManager.getCurrentItem();
        if (!item) return;

        const zoom = this.controller.zoomViewer;
        const exportMgr = this.controller.exportManager;
        const imgInfo = this.controller.currentOriginalInfo;

        if (!imgInfo) {
            window.app?.showToast(window.i18n?.t('enhance.noResInfo') || 'Could not get image resolution, unable to calculate crop area', 'error');
            return;
        }

        // 1. 计算裁剪参数
        const crop = exportMgr.calculateCrop(
            zoom.state,
            this.controller.elements.previewContainer,
            this.controller.elements.comparison,
            imgInfo
        );

        if (!crop) {
            window.app?.showToast(window.i18n?.t('enhance.calcCropFail') || 'Failed to calculate crop area', 'error');
            return;
        }

        // 2. 准备导出
        this.isProcessing = true;
        this.controller.isProcessing = true;
        this.controller.updateUI();
        this.showProgress('正在导出选定区域...');

        try {
            const inputPath = item.path;
            const outputDir = this.controller.outputDir || await this.getDefaultOutputDir();
            this.controller.outputDir = outputDir;

            const inputExt = await window.mediaflow.path.extname(inputPath);
            let ext = inputExt;
            if (item.options.format && item.options.format !== 'auto') {
                ext = `.${item.options.format}`;
            }

            const newBase = exportMgr.generateFileName(inputPath, { engineId: item.engine, ...item.options }) + '_crop';
            const outputPath = await window.mediaflow.path.join(outputDir, `${newBase}${ext}`);

            // 3. 执行增强 (带 crop 参数)
            this.progressCleanup = window.mediaflow.enhance.onProgress(({ progress, text }) => {
                this.updateProgress(progress, text);
            });

            const options = {
                engineId: item.engine,
                ...item.options,
                crop // 传入计算好的 {x, y, width, height}
            };

            const result = await window.mediaflow.enhance.image(inputPath, outputPath, options);

            if (result.success) {
                window.app?.showToast(window.i18n?.t('enhance.exportAreaSuccess') || 'Exported area successfully!', 'success');
                // 如果需要，显示导出的图片
                // this.controller.showComparison(inputPath, result.outputPath || result.output);
            } else {
                window.app?.showToast(result.error || window.i18n?.t('enhance.exportFail') || 'Export failed', 'error');
            }
        } catch (error) {
            console.error('[EnhanceProcessManager] Export Selection failed:', error);
            window.app?.showToast(error.message, 'error');
        } finally {
            this.cleanup();
        }
    }

    /**
     * 生成预览图逻辑
     */
    async generatePreview() {
        if (this.controller.stateManager.fileData.length === 0) return;

        const item = this.controller.stateManager.getCurrentItem();
        const inputPath = item.path;
        if (item.isVideo || this.isVideoPath(inputPath)) {
            window.app?.showToast(
                window.i18n?.t('enhance.videoPreviewUnavailable')
                    || 'Quick preview is for images. Start enhance for short videos (≤45s).',
                'info'
            );
            return;
        }

        try {
            this.showProgress(window.i18n?.t('enhance.statusPreviewing') || 'Notification');

            const result = await window.mediaflow.enhance.preview(inputPath, {
                engineId: this.controller.currentEngine,
                ...this.controller.options
            });

            if (result.success) {
                this.controller.showComparison(result.originalPath, result.previewPath);
            } else {
                window.app?.showToast(result.error || window.i18n?.t('enhance.previewFail') || 'Preview failed', 'error');
            }
        } catch (error) {
            console.error('[EnhanceProcessManager] Preview failed:', error);
            window.app?.showToast(error.message, 'error');
        } finally {
            this.hideProgress();
        }
    }

    /**
     * 取消处理
     */
    cancel() {
        window.mediaflow.enhance.cancel();
        this.isProcessing = false;
        this.controller.isProcessing = false;
        this.hideProgress();
        this.controller.updateUI();
        window.app?.showToast(window.i18n?.t('enhance.cancelled') || 'Cancelled', 'info');
    }

    /**
     * 获取输出目录逻辑
     */
    async getDefaultOutputDir() {
        try {
            const downloadPath = await window.mediaflow.store.get('downloadPath');
            if (downloadPath) {
                return await window.mediaflow.path.join(downloadPath, 'MediaFlow', 'AI_Enhancement');
            }
        } catch (error) {
            console.error('[EnhanceProcessManager] Failed to get global download path:', error);
        }

        if (this.controller.stateManager.fileData.length > 0) {
            return await window.mediaflow.path.dirname(this.controller.stateManager.fileData[0].path);
        }
        return '';
    }

    /**
     * 进度 UI 控制
     */
    showProgress(text) {
        this.lastProgress = 0;
        const els = this.controller.elements;
        if (els.progressContainer) els.progressContainer.classList.remove('hidden');
        if (els.progressText) els.progressText.textContent = text;
        if (els.progressFill) els.progressFill.style.width = '0%';
        if (els.btnStart) els.btnStart.classList.add('hidden');
        if (els.btnCancel) els.btnCancel.classList.remove('hidden');
        if (els.completeActions) els.completeActions.classList.add('hidden');
    }

    updateProgress(percent, text) {
        if (typeof percent !== 'number' || isNaN(percent)) return;
        if (percent <= this.lastProgress && percent > 0) return;
        this.lastProgress = percent;

        const els = this.controller.elements;
        if (els.progressFill) els.progressFill.style.width = `${percent}%`;
        if (els.progressText && text) els.progressText.textContent = text;
        else if (els.progressText) { const _p = Math.round(percent); els.progressText.textContent = window.i18n?.t('enhance.processingPercent', { percent: _p }) || (`Processing... ${_p}%`); }
    }

    hideProgress() {
        const els = this.controller.elements;
        if (els.progressContainer) els.progressContainer.classList.add('hidden');
        if (els.btnStart) els.btnStart.classList.remove('hidden');
        if (els.btnCancel) els.btnCancel.classList.add('hidden');

        // 成功后展示快捷操作（打开目录 / 定位 / 送去压缩）
        const hasSuccess = this.controller.stateManager.fileData.some(
            (r) => r.result?.status === 'success'
        );
        if (!this.isProcessing && hasSuccess && els.completeActions) {
            els.completeActions.classList.remove('hidden');
        } else if (!hasSuccess && els.completeActions) {
            els.completeActions.classList.add('hidden');
        }
    }

    /**
     * 清理所有副作用
     */
    cleanup() {
        this.isProcessing = false;
        this.controller.isProcessing = false;
        this.hideProgress();
        this.controller.updateUI();

        if (this.progressCleanup) { this.progressCleanup(); this.progressCleanup = null; }
        if (this.batchProgressCleanup) { this.batchProgressCleanup(); this.batchProgressCleanup = null; }
        if (this.fileCompleteCleanup) { this.fileCompleteCleanup(); this.fileCompleteCleanup = null; }
    }
}

window.EnhanceProcessManager = EnhanceProcessManager;
