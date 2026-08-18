/**
 * PixelUIManager.js
 * 管理 PixelFlow 的界面交互、样式注入和 DOM 事件
 */

class PixelUIManager {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.listRenderer = new window.PixelListRenderer(controller);
        this.previewManager = null;

        // Initialize Modules
        if (window.PixelWatermarkUI) {
            this.watermarkUI = new window.PixelWatermarkUI(controller);
        }
        if (window.PixelUIEvents) {
            this.events = new window.PixelUIEvents(this);
        }

        // Initialize Resizer
        if (window.PixelResizer) {
            this.resizer = new window.PixelResizer();
        }

        this.injectStyles();

        // 防抖调度器
        this.renderDebounce = null;
    }

    getRoot() {
        return document.getElementById('page-compress') || document;
    }

    byId(id) {
        const root = this.getRoot();
        return root.querySelector?.(`#${id}`) || document.getElementById(id);
    }

    query(selector) {
        return this.getRoot().querySelector?.(selector) || document.querySelector(selector);
    }

    queryAll(selector) {
        const root = this.getRoot();
        return Array.from(root.querySelectorAll?.(selector) || document.querySelectorAll(selector));
    }

    /**
     * 通用防抖函数
     * @param {Function} fn - 执行函数
     * @param {number} delay - 延迟毫秒
     */
    debounce(fn, delay = 150) {
        clearTimeout(this.renderDebounce);
        this.renderDebounce = setTimeout(() => fn(), delay);
    }

    injectStyles() {
        if (document.getElementById('pixel-flow-css-link')) return;
        const link = document.createElement('link');
        link.id = 'pixel-flow-css-link';
        link.rel = 'stylesheet';
        link.href = 'features/image/PixelFlow.css?v=1.3.31';
        document.head.appendChild(link);
    }

    init() {
        // Delegate event binding
        if (this.events) {
            this.events.bindAll();
        }

        // Initialize Preview Manager
        if (window.PixelPreviewManager) {
            this.previewManager = new window.PixelPreviewManager();
        }

        // Initialize Resizer (延迟到 DOM 准备好后)
        if (this.resizer) {
            this.resizer.init();
        }

        // Enable horizontal scroll with mouse wheel for preset buttons
        const presetGroup = this.query('.pixelflow-settings-panel .preset-group');
        if (presetGroup) {
            presetGroup.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    presetGroup.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }
    }

    /**
     * 更新预览显示 (标准模式)
     */
    updatePreview(file, result, rotation = 0, flipH = false, flipV = false) {
        const beforeImg = this.byId('compare-before');
        const afterImg = this.byId('compare-after');
        if (!file || !beforeImg) return;

        // 恢复标准标签
        const badgeA = this.query('.badge-before');
        const badgeB = this.query('.badge-after');
        if (badgeA) badgeA.textContent = 'Original';
        if (badgeB) badgeB.textContent = 'Compressed';

        const src = file.path
            ? (window.urlUtils?.pathToMediaUrl?.(file.path) || `file://${file.path}`)
            : URL.createObjectURL(file.file || file);
        beforeImg.src = src;

        if (afterImg) {
            this._setImageWithCacheBuster(afterImg, result?.preview || src);
        }

        this._applyTransform(beforeImg, afterImg, rotation, flipH, flipV);
        this.updateRotationLabel(rotation, flipH, flipV);

        if (result) {
            this._updateStats(result);
            // 恢复原图大小显示
            this.updateOriginalSize(`${file.metadata?.sizeFormatted || this.formatSize(file.size)} (${file.metadata?.width || '?'}x${file.metadata?.height || '?'})`);

            // 🆕 顺便更新一下重命名预览，确保文件名同步
            this.updateRenamePreview();
        }
    }

    /**
     * 更新预览显示 (专业 A/B 模式)
     */
    updateProPreview(file, resultA, resultB, rotation = 0, flipH = false, flipV = false) {
        const imgA = this.byId('compare-before');
        const imgB = this.byId('compare-after');
        if (!imgA || !imgB) return;

        // 设置 A/B 标签
        const badgeA = this.query('.badge-before');
        const badgeB = this.query('.badge-after');
        if (badgeA) badgeA.textContent = 'Config A';
        if (badgeB) badgeB.textContent = 'Config B';

        // 设置图片
        this._setImageWithCacheBuster(imgA, resultA.preview);
        this._setImageWithCacheBuster(imgB, resultB.preview);

        this._applyTransform(imgA, imgB, rotation, flipH, flipV);
        this.updateRotationLabel(rotation, flipH, flipV);

        // 更新大小对比
        const beforeSizeEl = this.byId('before-size');
        const afterSizeEl = this.byId('after-size');
        const savingsEl = this.byId('savings-percent');

        const resA = resultA.width ? ` (${resultA.width}x${resultA.height})` : '';
        const resB = resultB.width ? ` (${resultB.width}x${resultB.height})` : '';

        if (beforeSizeEl) beforeSizeEl.textContent = `A: ${this.formatSize(resultA.outputSize)}${resA}`;
        if (afterSizeEl) afterSizeEl.textContent = `B: ${this.formatSize(resultB.outputSize)}${resB}`;

        // Savings 这里计算 A vs B 的差异
        if (savingsEl && resultA.outputSize > 0) {
            const diff = ((resultA.outputSize - resultB.outputSize) / resultA.outputSize * 100);
            const key = diff >= 0 ? 'compress.compareSave' : 'compress.compareIncrease';
            const percent = Math.abs(diff).toFixed(1);

            // 安全调用 i18n
            if (window.i18n && window.i18n.t) {
                savingsEl.textContent = ' (' + window.i18n.t(key).replace('{percent}', percent) + ')';
            } else {
                const prefix = diff >= 0 ? 'B 比 A 节省 ' : 'B 比 A 增加 ';
                savingsEl.textContent = ' (' + prefix + percent + '%)';
            }
        }
    }

    /**
     * 辅助：设置图片并防止缓存
     */
    _setImageWithCacheBuster(img, src) {
        if (!src) return;
        const cacheBuster = `nocache=${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (src.startsWith('data:')) {
            img.src = src;
        } else {
            const glue = src.includes('?') ? '&' : '?';
            img.src = src + glue + cacheBuster;
        }
    }

    /**
     * 辅助：通过 Transform 同步变换
     */
    _applyTransform(imgA, imgB, rotation, flipH, flipV) {
        if (this.previewManager) {
            this.previewManager.updateImageTransform(rotation, flipH, flipV);
        } else {
            const transform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;
            if (imgA) imgA.style.transform = transform;
            if (imgB) imgB.style.transform = transform;
        }
    }

    /**
     * 辅助：更新统计数据
     */
    _updateStats(result) {
        const afterSizeEl = this.byId('after-size');
        const savingsEl = this.byId('savings-percent');
        const resDisplay = result.width ? ` (${result.width}x${result.height})` : '';

        if (afterSizeEl) {
            afterSizeEl.textContent = this.formatSize(result.outputSize) + resDisplay;
        }
        if (savingsEl) savingsEl.textContent = result.savings;
    }


    setPreviewMode(mode) {
        const slider = this.query('.compare-slider');
        if (!slider) return;

        slider.classList.toggle('mode-split', mode === 'split');
        if (this.previewManager) {
            // If split mode, we might want to reset zoom/pan or handle it differently
            // but for now, the CSS handles it by resetting clip-path.
        }
    }

    resetPreview() {
        if (this.previewManager) {
            this.previewManager.reset();
        }
    }

    updateOriginalSize(sizeStr) {
        const el = this.byId('before-size');
        if (el) el.textContent = sizeStr;
    }

    updateRotationLabel(rotation, flipH, flipV) {
        const label = this.byId('rotation-label');
        if (!label) return;
        if (rotation === 0 && !flipH && !flipV) {
            label.textContent = '';
        } else {
            const parts = [];
            if (rotation !== 0) parts.push(`旋转 ${rotation}°`);
            if (flipH) parts.push('水平翻转');
            if (flipV) parts.push('垂直翻转');
            label.textContent = parts.join(' · ');
        }
    }

    updateRenamePreview() {
        const previewEl = this.byId('rename-preview');
        if (!previewEl) return;

        const format = this.byId('compress-format')?.value || 'webp';
        const ext = format === 'original' ? 'jpg' : format;
        const keepOriginal = this.byId('rename-keep-name')?.checked ?? true;
        const addSuffix = this.byId('rename-add-suffix')?.checked ?? true;
        const suffix = this.byId('rename-suffix')?.value || '_compressed';
        const addIndex = this.byId('rename-add-index')?.checked || false;
        const addDate = this.byId('rename-add-date')?.checked || false;

        const file = this.controller.fileManager.getCurrentFile();
        let preview = (keepOriginal && file) ? file.name.split('.').slice(0, -1).join('.') : 'photo';

        if (addSuffix && suffix) preview += suffix;
        if (addIndex) preview += '_001';
        if (addDate) preview += '_' + new Date().toISOString().split('T')[0];
        preview += '.' + ext;

        previewEl.textContent = preview;
    }

    updateOutputDir(path) {
        const pathEl = this.byId('output-dir-path');
        if (pathEl && path) {
            const parts = path.replace(/\\/g, '/').split('/');
            pathEl.textContent = parts.slice(-2).join('/');
            pathEl.title = path;
        }
    }

    updatePresetButtons(preset, quality) {
        this.queryAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === preset);
        });
        const slider = this.byId('compress-quality');
        const valueEl = this.byId('quality-value');
        if (slider) {
            slider.value = quality;
            slider.dispatchEvent(new Event('input')); // Trigger update
        }
        if (valueEl) valueEl.textContent = quality;
    }

    setCompressOptions(options) {
        if (!options) return;

        // 1. Format
        const formatSelect = this.byId('compress-format');
        if (formatSelect && options.format) {
            formatSelect.value = options.format;
            formatSelect.dispatchEvent(new Event('change'));
        }

        // 2. Quality
        const qualitySlider = this.byId('compress-quality');
        if (qualitySlider && options.quality) {
            qualitySlider.value = options.quality;
            qualitySlider.dispatchEvent(new Event('input'));

            // Update preset buttons state
            const btn = this.queryAll('.preset-btn').find(b => parseInt(b.dataset.quality) === parseInt(options.quality));
            if (btn) {
                this.updatePresetButtons(btn.dataset.preset, options.quality);
            } else {
                this.queryAll('.preset-btn').forEach(b => b.classList.remove('active'));
            }
        }

        // 3. AI 选项 (2.0 新增)
        const aiUpscaleCheckbox = this.byId('enable-ai-upscale');
        if (aiUpscaleCheckbox && options.enableAiUpscale !== undefined) {
            aiUpscaleCheckbox.checked = options.enableAiUpscale;
            // 触发 change 事件以显示/隐藏倍率按钮容器
            aiUpscaleCheckbox.dispatchEvent(new Event('change'));

            // 设置倍率按钮状态
            if (options.aiUpscaleScale) {
                this.queryAll('.ai-opt-btn').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.dataset.scale) === parseInt(options.aiUpscaleScale));
                });
            }
        }

        const smartCropCheckbox = this.byId('enable-smart-crop');
        if (smartCropCheckbox && options.enableSmartCrop !== undefined) {
            smartCropCheckbox.checked = options.enableSmartCrop;
            smartCropCheckbox.dispatchEvent(new Event('change'));
        }

        // 4. Resize
        const widthInput = this.byId('resize-width');
        const heightInput = this.byId('resize-height');

        if (widthInput) widthInput.value = options.width || '';
        if (heightInput) heightInput.value = options.height || '';

        // 5. Advanced (ICC)
        const keepICCCheckbox = this.byId('keep-icc');
        if (keepICCCheckbox) {
            keepICCCheckbox.checked = !!options.keepICC;
            keepICCCheckbox.dispatchEvent(new Event('change'));
        }

        // 6. Advanced (Strip EXIF)
        const stripExifCheckbox = this.byId('strip-exif');
        if (stripExifCheckbox && options.stripExif !== undefined) {
            stripExifCheckbox.checked = options.stripExif;
            stripExifCheckbox.dispatchEvent(new Event('change'));
        }

        // 7. Watermark (2.0 新增同步)
        if (this.watermarkUI) {
            this.watermarkUI.setOptions(options.watermark);
        }
    }


    showProgress(show) {
        this.byId('compress-options')?.classList.toggle('hidden', show);
        this.byId('compress-progress')?.classList.toggle('hidden', !show);
    }

    showResult(result) {
        const resultEl = this.byId('compress-result');
        const resultText = this.byId('compress-result-text');
        if (resultText) {
            resultText.textContent = window.i18n.t('compress.completed')
                .replace('{completed}', result.completed)
                .replace('{totalSaved}', result.totalSaved);
        }
        this.byId('compress-progress')?.classList.add('hidden');
        resultEl?.classList.remove('hidden');
    }

    updateProgressBar(index, total) {
        const fill = this.byId('compress-progress-fill');
        const status = this.byId('compress-status');
        if (fill) fill.style.width = `${(index / total) * 100}%`;
        if (status) status.textContent = `${window.i18n.t('compress.compressing')} ${index}/${total}...`;
    }

    getCompressOptions() {
        const enableTargetSize = this.byId('enable-target-size')?.checked;
        const targetSizeValue = parseInt(this.byId('target-size')?.value) || null;
        const targetSizeUnit = this.byId('target-size-unit')?.value || 'kb';

        let targetSize = null;
        if (enableTargetSize && targetSizeValue) {
            targetSize = targetSizeUnit === 'mb' ? targetSizeValue * 1024 * 1024 : targetSizeValue * 1024;
        }

        // AI 选项 (2.0 新增) - 简化版：始终使用 4x
        const enableAiUpscale = this.byId('enable-ai-upscale')?.checked || false;
        const aiUpscaleScale = 4; // 固定为 4x 以获得最佳画质

        let concurrency = parseInt(this.byId('compress-concurrency')?.value, 10);
        if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 3;
        concurrency = Math.min(6, Math.max(1, concurrency));
        // AI enhance is heavy — soft-cap unless user explicitly picked 1
        if (enableAiUpscale && concurrency > 2) concurrency = 2;

        const renameOptions = {
            keepOriginalName: this.byId('rename-keep-name')?.checked ?? true,
            addSuffix: this.byId('rename-add-suffix')?.checked ?? true,
            suffix: this.byId('rename-suffix')?.value || '_compressed',
            addIndex: this.byId('rename-add-index')?.checked || false,
            addDate: this.byId('rename-add-date')?.checked || false
        };

        // Advanced Options
        const keepICC = this.byId('keep-icc')?.checked || false;
        const stripExif = this.byId('strip-exif')?.checked ?? true;

        // Watermark Options
        // Watermark Options (Auto-detect)
        const watermarkText = this.byId('watermark-text')?.value || '';
        let imagePath = null;
        if (this.watermarkUI) {
            imagePath = this.watermarkUI.getImagePath();
        }

        let watermark = null;
        // 如果有文字或图片，则生成水印配置
        if (watermarkText || imagePath) {
            const activePosBtn = this.query('#watermark-position-grid .pos-btn.active');

            watermark = {
                // 基础参数
                text: watermarkText,
                font: this.byId('watermark-font')?.value || 'sans-serif',
                color: this.byId('watermark-color')?.value || '#ffffff',
                // [Fix] 区分文字和图片的大小/透明度
                textOpacity: parseInt(this.byId('watermark-text-opacity')?.value || '80') / 100,
                textSize: parseInt(this.byId('watermark-text-size')?.value || '48'),

                imageOpacity: parseInt(this.byId('watermark-image-opacity')?.value || '100') / 100,
                imageSize: parseInt(this.byId('watermark-image-size')?.value || '60'),

                // 新增参数
                rotation: parseInt(this.byId('watermark-rotation')?.value || '0'),
                shadow: this.byId('watermark-shadow')?.checked ?? true,
                outline: this.byId('watermark-outline')?.checked ?? false,
                tiled: this.byId('watermark-tile')?.checked ?? false,
                margin: parseInt(this.byId('watermark-margin')?.value || '20'),
                position: activePosBtn ? activePosBtn.dataset.pos : 'center',

                // 图片水印路径
                image: imagePath,
                hasImage: !!imagePath,
                hasText: !!watermarkText
            };
        }

        let quality = parseInt(this.byId('compress-quality')?.value || '80');
        if (isNaN(quality)) quality = 80;

        return {
            quality: quality,
            format: this.byId('compress-format')?.value || 'original',
            maxWidth: parseInt(this.byId('resize-width')?.value) || null,
            maxHeight: parseInt(this.byId('resize-height')?.value) || null,
            targetSize: targetSize,
            renameOptions: renameOptions,
            enableAiUpscale: enableAiUpscale,
            aiUpscaleScale: aiUpscaleScale,
            keepICC: keepICC,
            stripExif: stripExif,
            watermark: watermark,
            concurrency
        };
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const sign = bytes < 0 ? '-' : '';
        const absBytes = Math.abs(bytes);
        if (absBytes >= 1048576) return sign + (absBytes / 1048576).toFixed(1) + ' MB';
        else if (absBytes >= 1024) return sign + (absBytes / 1024).toFixed(0) + ' KB';
        return sign + absBytes + ' B';
    }

    resetUI() {
        this.byId('upload-zone-image')?.classList.remove('hidden');
        this.byId('compress-options')?.classList.add('hidden');
        this.byId('compress-progress')?.classList.add('hidden');
        this.byId('compress-result')?.classList.add('hidden');
        this.query('.pixelflow-footer')?.classList.add('hidden');
        const queue = this.byId('image-queue');
        if (queue) queue.innerHTML = '';
        ['before-size', 'after-size', 'savings-percent'].forEach(id => {
            const el = this.byId(id);
            if (el) el.textContent = '-';
        });

        // Delegate to Watermark UI
        if (this.watermarkUI) {
            this.watermarkUI.clear();
        }
    }
}

window.PixelUIManager = PixelUIManager;
