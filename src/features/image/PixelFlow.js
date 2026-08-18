/**
 * PixelFlow.js
 * 图片压缩功能主控制器 (MVC Pattern)
 * 协调子模块并提供对外的 API
 */

class PixelFlow {
    constructor(app) {
        this.app = app;
        // 核心服务与管理
        this.service = new window.PixelService(this);
        this.fileManager = new window.PixelFileManager(this);
        this.uiManager = new window.PixelUIManager(this);
        this.aiMediator = new window.PixelAIMediator(this);
        this.compareManager = new window.PixelCompareManager(this);
        this.presetManager = new window.PixelPresetManager(this);

        // 状态相关
        this.outputDir = null;
        this.isProcessing = false;
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
        this.isDraggingInternal = false;
        // AI 结果缓存映射 (Key: 原文件路径, Value: { processedPath, aiOptions })
        this.aiCacheMap = new Map();
    }

    /**
     * 初始化
     */
    async init() {
        await this.loadPreferences();
        await this.presetManager.init();
        this.uiManager.init();

        // 监听来自后端的压缩进度（前端再做一层轻节流，避免进度条狂刷）
        let lastProgressUiAt = 0;
        window.mediaflow?.compress.onProgress((data) => {
            const now = Date.now();
            const done = data?.total > 0 && data.index >= data.total;
            if (done || now - lastProgressUiAt >= 80) {
                lastProgressUiAt = now;
                this.uiManager.updateProgressBar(data.index, data.total);
            }
        });

        console.log('[PixelFlow] Initialized');
    }

    /** Map technical IPC errors to readable copy + recovery hint. */
    mapImageError(err) {
        const map = window.ImageAiErrorMap;
        if (map?.formatImageAiError) {
            return map.formatImageAiError(err, {
                t: (key, fb) => {
                    const v = window.i18n?.t?.(key);
                    return v && v !== key ? v : fb;
                }
            });
        }
        const raw = err && typeof err === 'object' ? err.error || err.message || err.code : err;
        return String(raw || '');
    }

    /** Toast AI failure; optionally nudge user to Settings → Engines. */
    showImageAiError(err, prefixKey) {
        const map = window.ImageAiErrorMap?.mapImageAiError?.(err, {
            t: (key, fb) => {
                const v = window.i18n?.t?.(key);
                return v && v !== key ? v : fb;
            }
        });
        const prefix = prefixKey
            ? (window.i18n?.t(prefixKey) || '')
            : '';
        const body = map
            ? `${map.message}${map.hint ? ' — ' + map.hint : ''}`
            : this.mapImageError(err);
        const text = prefix && !String(body).startsWith(prefix)
            ? `${prefix} ${body}`.trim()
            : body;
        window.app?.showToast?.(text, 'error');
        if (map?.openSettings && typeof this.app?.navigate === 'function') {
            // Soft nudge only once per session
            if (!this._aiSettingsNudgeShown) {
                this._aiSettingsNudgeShown = true;
                setTimeout(() => {
                    window.app?.showToast?.(
                        window.i18n?.t('pixel.aiOpenSettingsHint') ||
                            'Tip: open Settings → Engines to install/update AI tools.',
                        'info'
                    );
                }, 600);
            }
        }
    }

    setDraggingInternal(isDragging) {
        this.isDraggingInternal = isDragging;
    }

    handleFilesSelect(files) {
        // 新增文件不影响已有缓存
        const added = this.fileManager.addFiles(files);
        if (added.length > 0) {
            this.updateUI();
            this.loadPreview(this.fileManager.selectedIndex);
        }
    }

    /**
     * Import image paths from another feature (e.g. AI Enhance → Compress).
     * @param {string[]} paths
     */
    async importPaths(paths) {
        const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
        if (!list.length) return [];

        const files = list.map((p) => {
            const name = String(p).split(/[/\\]/).pop() || 'image';
            const ext = (name.split('.').pop() || '').toLowerCase();
            const mime = ext === 'png' ? 'image/png'
                : (ext === 'webp' ? 'image/webp'
                    : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/unknown'));
            return { path: p, name, size: 0, type: mime };
        });

        const added = this.fileManager.addFiles(files);
        if (added.length > 0) {
            this.updateUI();
            this.loadPreview(this.fileManager.selectedIndex);
            // Prefer output folder of first imported file as default save dir when empty
            try {
                if (!this.outputDir && files[0]?.path && window.mediaflow?.path?.dirname) {
                    const dir = await window.mediaflow.path.dirname(files[0].path);
                    if (dir) this.outputDir = dir;
                }
            } catch {
                // non-fatal
            }
        }
        return added;
    }

    updateUI() {
        const files = this.fileManager.getFiles();
        this.uiManager.listRenderer.render(files, this.fileManager.selectedIndex);

        const pageEl = document.getElementById('page-compress');
        if (files.length > 0) {
            pageEl?.classList.add('in-workspace');
            document.getElementById('upload-zone-image')?.classList.add('hidden');
            document.getElementById('compress-options')?.classList.remove('hidden');
            document.querySelector('.pixelflow-footer')?.classList.remove('hidden');
        } else {
            pageEl?.classList.remove('in-workspace');
            this.uiManager.resetUI();
        }
    }

    selectImage(index) {
        this.uiManager.listRenderer.updateSelection(index);
        this.loadPreview(index);
    }

    async loadPreview(index) {
        this.fileManager.setSelectedIndex(index);
        const file = this.fileManager.getCurrentFile();
        if (!file) return;

        // 获取原图信息（视频等非图片会返回 null，不再抛 IPC 异常）
        const info = await this.service.getInfo(file.path);
        file.metadata = info || null;

        if (!info) {
            this.uiManager.updateOriginalSize?.(
                this.uiManager.formatSize?.(file.size) || '—'
            );
            window.app?.showToast?.(
                window.i18n?.t?.('pixel.unsupportedPreview')
                    || 'Cannot preview this file as an image',
                'warning'
            );
            return;
        }

        this.uiManager.updateOriginalSize(`${info?.sizeFormatted || this.uiManager.formatSize(file.size)} (${info?.width || '?'}x${info?.height || '?'})`);

        this.preview();
    }

    async preview() {
        const file = this.fileManager.getCurrentFile();
        if (!file) return;

        const compareMode = this.compareManager.mode;

        if (compareMode === 'pro') {
            // 专业模式：双路对比 (A vs B)
            // [关键] 先将当前 UI 状态同步回活动配置，确保用户修改被捕获
            this.compareManager.syncActiveConfig();

            const { A, B } = this.compareManager.getPreviewConfigs();
            console.log('[PixelFlow] Pro mode A/B previewing...');

            try {
                // 串行执行 A 和 B 的预览 (AI 引擎不支持并发)
                const resultA = await this._runPreviewPipeline(file, A, false);
                const resultB = await this._runPreviewPipeline(file, B, false);

                if (resultA && resultB) {
                    this.uiManager.updateProPreview(file, resultA, resultB, this.rotation, this.flipH, this.flipV);
                }
            } catch (error) {
                console.error('[PixelFlow] Pro preview failed:', error);
            }

        } else {
            // 标准模式：原图 vs 压缩图
            const options = this.uiManager.getCompressOptions();
            const result = await this._runPreviewPipeline(file, options, true);
            if (result) {
                this.uiManager.updatePreview(file, result, this.rotation, this.flipH, this.flipV);
            }
        }
    }

    /**
     * 执行单路预览流水线 (内部方法)
     */
    async _runPreviewPipeline(file, options, showLoading = true) {
        if (!options) {
            console.error('[PixelFlow] Cannot run preview pipeline without options');
            return null;
        }

        options.rotation = this.rotation;

        options.flipH = this.flipH;
        options.flipV = this.flipV;

        const previewContainer = document.getElementById('compare-container');
        let aiLoadingEl = null;

        try {
            let aiResult = null;
            let usedCache = false;

            // [Smart Cache] 检查是否可以使用现有缓存
            const cache = this.aiCacheMap.get(file.path);
            if (cache && 
                cache.aiOptions.enableAiUpscale === options.enableAiUpscale &&
                cache.aiOptions.aiUpscaleScale === options.aiUpscaleScale &&
                cache.aiOptions.enableSmartCrop === options.enableSmartCrop) {
                
                console.log('[PixelFlow] 🚀 Reusing cached AI result for preview:', cache.processedPath);
                aiResult = {
                    success: true,
                    path: cache.processedPath,
                    finalOptions: { ...options, enableAiUpscale: false, enableSmartCrop: false } // 已经处理过，后续流程无需再次处理
                };
                usedCache = true;
            }

            // 如果没有缓存且需要 AI 处理，则执行漫长的 AI 流水线
            if (!usedCache) {
                // 1. Loading 提示 (仅在标准模式或显式要求时显示)
                if (showLoading && (options.enableAiUpscale || options.enableSmartCrop)) {
                    if (previewContainer) {
                        aiLoadingEl = document.createElement('div');
                        aiLoadingEl.className = 'preview-ai-loading';
                        const loadingText =
                            window.i18n?.t('pixel.aiEnhancing') ||
                            window.i18n?.t('pixel.aiEnhancingPercent', { percent: 0 }) ||
                            'AI enhancing...';
                        aiLoadingEl.innerHTML = `
                            <div class="ai-spinner"></div>
                            <span></span>
                        `;
                        const span0 = aiLoadingEl.querySelector('span');
                        if (span0) span0.textContent = loadingText;
                        previewContainer.appendChild(aiLoadingEl);
                    }
                }

                // 2. AI 处理
                aiResult = await this.aiMediator.process(file.path, options, (progress) => {
                    // [UX] 更新加载提示文本
                    if (aiLoadingEl) {
                        const span = aiLoadingEl.querySelector('span');
                        if (span) {
                            const _p = Math.round(progress);
                            span.textContent =
                                window.i18n?.t('pixel.aiEnhancingPercent', { percent: _p }) ||
                                (`AI enhance... ${_p}%`);
                        }
                    }
                });

                // [Cache] 如果执行了 AI 处理，更新缓存 (按路径存储)
                if (aiResult?.success && aiResult.path !== file.path) {
                    this.aiCacheMap.set(file.path, {
                        originalPath: file.path,
                        processedPath: aiResult.path,
                        aiOptions: {
                            enableAiUpscale: options.enableAiUpscale,
                            aiUpscaleScale: options.aiUpscaleScale,
                            enableSmartCrop: options.enableSmartCrop
                        }
                    });
                } else if (!options.enableAiUpscale && !options.enableSmartCrop) {
                    // 如果关闭了 AI，清除该文件的缓存
                    this.aiCacheMap.delete(file.path);
                }
            }

            const finalPath = aiResult?.path || file.path;
            const finalOptions = aiResult?.finalOptions || options;

            // 3. 预览生成
            const result = await this.service.preview({ path: finalPath }, finalOptions);
            if (result?.success) {
                const finalInfo = await this.service.getInfo(finalPath);
                result.width = finalInfo.width;
                result.height = finalInfo.height;
                result.isAiActive = (finalPath !== file.path);

                if (result.isAiActive && showLoading && !usedCache) {
                    const resChange = `${file.metadata?.width}x${file.metadata?.height} ➔ ${finalInfo.width}x${finalInfo.height}`;
                    window.app?.ui.showToast(window.i18n?.t('pixel.aiReady', {res: resChange}) || `✨ AI Quality Enhancement ready: ${resChange}`, 'success');
                }
                return result;
            }
            return null;
        } catch (error) {
            console.error('[PixelFlow] Pipeline failed:', error);
            return null;
        } finally {
            aiLoadingEl?.remove();
        }
    }


    async removeImage(index) {
        this.activeAiCache = null; // 清空缓存
        const item = document.querySelector(`.queue-item[data-index="${index}"]`);
        if (item) {
            item.classList.add('removing');
            await new Promise(r => setTimeout(r, 200)); // 等待 CSS 动画
        }

        this.fileManager.removeFile(index);
        const files = this.fileManager.getFiles();
        if (files.length > 0) {
            this.updateUI(); // Rebuild list after removal
            this.loadPreview(this.fileManager.selectedIndex);
        } else {
            this.reset();
        }
    }

    reorderFiles(from, to) {
        this.fileManager.reorderFiles(from, to);
        this.updateUI();
    }

    async compressAll() {
        if (this.isProcessing || this.fileManager.files.length === 0) return;

        if (!this.outputDir) {
            await this.changeOutputDir();
            if (!this.outputDir) return;
        }

        this.isProcessing = true;
        this.uiManager.showProgress(true);

        const options = this.uiManager.getCompressOptions();
        options.rotation = this.rotation;
        options.flipH = this.flipH;
        options.flipV = this.flipV;

        const paths = this.fileManager.files.map(f => f.path);

        // [Optimize] 准备 AI 缓存映射给后端
        const cacheObj = {};
        this.aiCacheMap.forEach((cache, originalPath) => {
            // 只有当 AI 参数匹配时才传递缓存
            if (cache.aiOptions.enableAiUpscale === options.enableAiUpscale &&
                cache.aiOptions.aiUpscaleScale === options.aiUpscaleScale &&
                cache.aiOptions.enableSmartCrop === options.enableSmartCrop) {
                cacheObj[originalPath] = cache.processedPath;
            }
        });

        try {
            // 透传缓存映射到后端
            const result = await this.service.compressBatch(paths, this.outputDir, options, cacheObj);
            if (result?.success) {
                this.uiManager.showResult(result);
                const failed = result.failed || 0;
                if (failed > 0) {
                    window.app?.showToast(
                        (window.i18n?.t('pixel.compressPartial') ||
                            `Compression finished with ${failed} failure(s). Saved ${result.totalSaved}`) +
                            ` (${result.totalSaved || '0'})`,
                        'warning'
                    );
                } else {
                    window.app?.showToast(
                        window.i18n?.t('pixel.compressDone', { saved: result.totalSaved }) ||
                            `Compression complete, saved ${result.totalSaved}`,
                        'success'
                    );
                }
            } else {
                window.app?.showToast(
                    (window.i18n?.t('pixel.compressFail') || 'Compression failed:') +
                        ' ' +
                        (result?.error || ''),
                    'error'
                );
            }
        } catch (e) {
            window.app?.showToast((window.i18n?.t('pixel.compressFail') || 'Compression failed:') + ' ' + e.message, 'error');
            this.uiManager.showProgress(false);
        } finally {
            this.isProcessing = false;
        }
    }

    applyPreset(preset, quality) {
        this.currentPreset = preset;
        this.uiManager.updatePresetButtons(preset, quality);
        this.preview();
        this.savePreferences();
    }

    async saveCurrent() {
        const file = this.fileManager.getCurrentFile();
        if (!file) return;

        if (!this.outputDir) {
            await this.updateAutoOutputDir();
            if (!this.outputDir) return;
        }

        const options = this.uiManager.getCompressOptions();
        options.rotation = this.rotation;
        options.flipH = this.flipH;
        options.flipV = this.flipV;

        // [Smart Optimize] 检查是否可以使用 AI 缓存
        // 如果当前文件与缓存匹配，且 AI 参数一致，则复用已增强的图片
        let inputPath = file.path;
        const cache = this.aiCacheMap.get(file.path);

        if (cache &&
            cache.aiOptions.enableAiUpscale === options.enableAiUpscale &&
            cache.aiOptions.aiUpscaleScale === options.aiUpscaleScale &&
            cache.aiOptions.enableSmartCrop === options.enableSmartCrop) {

            console.log('[PixelFlow] 🚀 Reusing cached AI result for save:', cache.processedPath);
            inputPath = cache.processedPath;

            // 关键：禁用 options 里的 AI 选项，防止 compressSingle 再次触发 AI
            options.enableAiUpscale = false;
            options.enableSmartCrop = false;
        }

        const outputPath = await this.generateOutputPath(file, options);
        try {
            const result = await this.service.compressSingle(inputPath, outputPath, options);
            if (result && result.success === false) {
                window.app?.showToast(
                    (window.i18n?.t('pixel.compressFail') || 'Compression failed:') + ' ' + (result.error || ''),
                    'error'
                );
                return;
            }
            window.app?.showToast(window.i18n?.t('pixel.compressSaved') || 'Saved compressed image', 'success');
        } catch (e) {
            window.app?.showToast(
                (window.i18n?.t('pixel.compressFail') || 'Compression failed:') + ' ' + (e.message || e),
                'error'
            );
        }
    }

    /**
     * 生成输出路径
     */
    async generateOutputPath(file, options) {
        const rename = options.renameOptions;
        const format = options.format === 'original' ? (file.name.split('.').pop() || 'jpg') : options.format;

        let baseName = rename.keepOriginalName ? file.name.split('.').slice(0, -1).join('.') : 'photo';
        if (rename.addSuffix && rename.suffix) baseName += rename.suffix;
        if (rename.addIndex) baseName += '_001';
        if (rename.addDate) baseName += '_' + new Date().toISOString().split('T')[0];

        const fullPath = await window.mediaflow.path.join(this.outputDir, `${baseName}.${format}`);
        return fullPath;
    }

    async removeBackground() {
        const file = this.fileManager.getCurrentFile();
        if (!file?.path) {
            window.app?.showToast?.(
                window.i18n?.t('pixel.emptySelectImage') ||
                    'Add an image to start compressing or using AI tools.',
                'info'
            );
            return;
        }

        // 获取按钮并添加加载状态
        const btn = document.getElementById('btn-remove-bg');
        const originalContent = btn?.innerHTML;

        if (btn) {
            btn.classList.add('loading');
            btn.disabled = true;
            btn.innerHTML = `
                <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
                </svg>
            `;
        }

        window.app?.showToast(window.i18n?.t('pixel.aiMatting') || 'AI is performing matting...', 'info');

        try {
            // 构建输出路径: 下载目录/MediaFlow/抠图/原文件名_no_bg.png
            let basePath = await window.mediaflow?.app.getAppPath('downloads');
            const settings = await window.mediaflow?.store.get('settings');
            if (settings?.downloadPath) {
                basePath = settings.downloadPath;
            }

            const outputDir = await window.mediaflow.path.join(basePath, 'MediaFlow', 'Cutout');
            await window.mediaflow.fs.mkdir(outputDir);

            // 获取原始文件名（不含路径和扩展名）
            const originalName = file.name.replace(/\.[^/.]+$/, '');

            // 获取用户选择的模型 (通过右键菜单设置)
            const selectedModel = this.selectedRembgModel || 'u2net';

            // 输出文件名包含模型名，避免不同模型结果互相覆盖
            const outputPath = await window.mediaflow.path.join(outputDir, `${originalName}_${selectedModel}_no_bg.png`);
            console.log('[PixelFlow] Using model:', selectedModel, 'Output:', outputPath);

            const result = await this.service.removeBackground(file.path, outputPath, { model: selectedModel });
            if (result?.success) {
                window.app?.showToast(window.i18n?.t('pixel.mattingSuccess', {model: selectedModel}) || `Matting success (${selectedModel})`, 'success');
                // 加载抠图结果到预览区
                this.handleFilesSelect([{ path: result.output || result.outputPath, name: `${originalName}_${selectedModel}_no_bg.png`, size: 0, type: 'image/png' }]);
            } else {
                this.showImageAiError(result, 'pixel.mattingFail');
            }
        } catch (error) {
            this.showImageAiError(error, 'pixel.mattingFail');
        } finally {
            // 恢复按钮状态
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        }
    }





    rotate(deg) {
        this.rotation = (this.rotation + deg + 360) % 360;
        this.preview();
    }

    flip(dir) {
        if (dir === 'horizontal') this.flipH = !this.flipH;
        else this.flipV = !this.flipV;
        this.preview();
    }

    reset() {
        this.fileManager.clear();
        this.service.clearCache();
        this.uiManager.resetUI();
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
        this.isProcessing = false;
    }

    async loadPreferences() {
        // 强制使用自动生成的日期路径
        await this.updateAutoOutputDir();
        try {
            const prefs = await window.mediaflow?.store?.get?.('pixelflow_prefs');
            const n = parseInt(prefs?.concurrency, 10);
            const sel = document.getElementById('compress-concurrency');
            if (sel && Number.isFinite(n) && n >= 1 && n <= 6) {
                sel.value = String(n);
            }
            sel?.addEventListener('change', () => this.savePreferences());
        } catch (e) {
            void e;
        }
    }

    async updateAutoOutputDir() {
        try {
            // 1. 获取基础下载路径 (优先使用全局设置，否则使用系统下载目录)
            let basePath = await window.mediaflow?.app.getAppPath('downloads');
            const settings = await window.mediaflow?.store.get('settings');
            if (settings?.downloadPath) {
                basePath = settings.downloadPath;
            }

            if (!basePath) return; // Should not happen

            // 2. 构建目标路径: MediaFlow/ImageCompress
            const fullPath = await window.mediaflow.path.join(basePath, 'MediaFlow', 'ImageCompress');

            // 3. 确保目录存在
            await window.mediaflow.fs.mkdir(fullPath);

            // 4. 更新状态
            this.outputDir = fullPath;
            this.uiManager.updateOutputDir(fullPath);

            console.log('[PixelFlow] Auto output dir set to:', fullPath);
        } catch (error) {
            console.error('[PixelFlow] Failed to set auto output dir:', error);
        }
    }

    // Deprecated: 手动更改路径 (不再使用，但保留方法以防万一)
    async changeOutputDir() {
        // 用户请求更改时，我们只打开当前文件夹，而不是选择新文件夹
        if (this.outputDir) {
            window.mediaflow.shell.openPath(this.outputDir);
        }
    }

    savePreferences() {
        let concurrency = parseInt(document.getElementById('compress-concurrency')?.value, 10);
        if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 3;
        concurrency = Math.min(6, Math.max(1, concurrency));
        window.mediaflow?.store.set('pixelflow_prefs', {
            outputDir: this.outputDir,
            concurrency
        });
    }

    handleKeyboard(e) {
        if (this.fileManager.files.length === 0) return;
        if (e.key === 'Delete') this.removeImage(this.fileManager.selectedIndex);
        else if (e.key === 'ArrowLeft') this.selectImage(Math.max(0, this.fileManager.selectedIndex - 1));
        else if (e.key === 'ArrowRight') this.selectImage(Math.min(this.fileManager.files.length - 1, this.fileManager.selectedIndex + 1));
    }
}

window.PixelFlow = PixelFlow;
