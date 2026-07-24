/**
 * PixelUIEvents.js
 * 专门负责 DOM 事件监听绑定
 */
class PixelUIEvents {
    /**
     * @param {PixelUIManager} uiManager - UI 管理器引用
     */
    constructor(uiManager) {
        this.ui = uiManager;
        this.controller = uiManager.controller;
    }

    byId(id) {
        return this.ui?.byId?.(id) || document.getElementById(id);
    }

    query(selector) {
        return this.ui?.query?.(selector) || document.querySelector(selector);
    }

    queryAll(selector) {
        return this.ui?.queryAll?.(selector) || Array.from(document.querySelectorAll(selector));
    }

    bindAll() {
        this.bindFileHandling();
        this.bindCoreControls();
        this.bindCompressionControls();
        this.bindTransformControls();
        this.bindWatermarkControls();
        this.bindAIControls();
        this.bindCompareControls();
        this.bindRenameControls();
        this.bindPreviewToolbar();
        this.bindCategoryTabs();
        this.bindModalControls();
    }

    bindFileHandling() {
        // 上传按钮
        const imageFileInput = document.getElementById('image-file');
        document.getElementById('upload-zone-image')?.addEventListener('click', () => imageFileInput?.click());

        imageFileInput?.addEventListener('change', (e) => {
            this.controller.handleFilesSelect(Array.from(e.target.files));
        });

        // 拖放区域
        const dropZones = ['upload-zone-image', 'compress-options'];
        dropZones.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
            el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                if (this.controller.isDraggingInternal) return;
                this.controller.handleFilesSelect(Array.from(e.dataTransfer?.files || []));
            });
        });

        // 横向滚动支持
        const queueContainer = document.getElementById('image-queue');
        if (queueContainer) {
            queueContainer.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    queueContainer.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }
    }

    bindCoreControls() {
        document.getElementById('btn-compress-images')?.addEventListener('click', () => this.controller.compressAll());
        document.getElementById('btn-save-current')?.addEventListener('click', () => this.controller.saveCurrent());
        document.getElementById('btn-new-compress')?.addEventListener('click', () => this.controller.reset());
        document.getElementById('btn-clear-images')?.addEventListener('click', () => this.controller.reset());
        document.getElementById('btn-clear-images-settings')?.addEventListener('click', () => this.controller.reset());
        document.getElementById('btn-change-output-dir')?.addEventListener('click', () => this.controller.changeOutputDir());

        // 目标大小切换
        document.getElementById('enable-target-size')?.addEventListener('change', (e) => {
            document.getElementById('target-size-row')?.classList.toggle('hidden', !e.target.checked);
            this.controller.preview();
        });
    }

    bindCompressionControls() {
        // 压缩质量
        const qualitySlider = document.getElementById('compress-quality');
        const qualityValue = document.getElementById('quality-value');
        if (qualitySlider && qualityValue) {
            let previewTimeout;
            qualitySlider.addEventListener('input', () => {
                const losslessText = window.i18n?.t('pixel.qualityLossless') || window.i18n?.t('enhance.qualityLossless') || 'Lossless';
                qualityValue.textContent = qualitySlider.value === '100' ? losslessText : qualitySlider.value;
                clearTimeout(previewTimeout);
                previewTimeout = setTimeout(() => this.controller.preview(), 500);
            });
        }

        // 格式变更
        document.getElementById('compress-format')?.addEventListener('change', () => {
            this.ui.updateRenamePreview();
            this.controller.preview();
        });

        // 预设按钮
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                const quality = parseInt(btn.dataset.quality);
                this.controller.applyPreset(preset, quality);
            });
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => this.controller.handleKeyboard(e));

        // Advanced Options Toggle removed as per user request
    }

    bindTransformControls() {
        document.getElementById('btn-rotate-left')?.addEventListener('click', () => this.controller.rotate(-90));
        document.getElementById('btn-rotate-right')?.addEventListener('click', () => this.controller.rotate(90));
        document.getElementById('btn-flip-h')?.addEventListener('click', () => this.controller.flip('horizontal'));
        document.getElementById('btn-flip-v')?.addEventListener('click', () => this.controller.flip('vertical'));

        // 抠图按钮 - 左键执行，右键选择模型
        const btnRemoveBg = document.getElementById('btn-remove-bg');
        const modelMenu = document.getElementById('rembg-model-menu');

        btnRemoveBg?.addEventListener('click', () => this.controller.removeBackground());

        // 右键弹出模型选择菜单
        btnRemoveBg?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // 计算按钮相对于 footer 的位置
            const footer = document.querySelector('.footer-left');
            const btnRect = btnRemoveBg.getBoundingClientRect();
            const footerRect = footer?.getBoundingClientRect() || { left: 0 };
            modelMenu.style.left = `${btnRect.left - footerRect.left}px`;
            modelMenu.classList.remove('hidden');
        });

        // 点击菜单项选择模型
        modelMenu?.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                // 更新选中状态
                modelMenu.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                modelMenu.classList.add('hidden');

                // 保存选中的模型
                this.controller.selectedRembgModel = item.dataset.model;
                const modelName = (item.textContent || item.dataset.model || '').trim();
                const switchMsg =
                    window.i18n?.t('pixel.modelSwitched', { model: modelName }) ||
                    window.i18n?.t('enhance.modelSwitched', { model: modelName }) ||
                    `Model switched: ${modelName}`;
                const safeMsg =
                    !switchMsg || switchMsg === 'pixel.modelSwitched' || switchMsg === 'enhance.modelSwitched'
                        ? `Model switched: ${modelName}`
                        : switchMsg;
                window.app?.showToast(safeMsg, 'info');
            });
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!modelMenu?.contains(e.target) && e.target !== btnRemoveBg) {
                modelMenu?.classList.add('hidden');
            }
        });
    }

    bindWatermarkControls() {
        // Enable Toggle
        this.byId('enable-watermark')?.addEventListener('change', () => {
            this.controller.preview();
        });

        // Inputs
        const watermarkInputs = [
            'watermark-text', 'watermark-color',
            'watermark-text-opacity', 'watermark-text-size',
            'watermark-image-opacity', 'watermark-image-size',
            'watermark-rotation', 'watermark-margin'
        ];
        watermarkInputs.forEach(id => {
            const el = this.byId(id);
            if (el) {
                el.addEventListener('input', () => {
                    // Update Labels (Immediate UI feedback)
                    const labelId = `${id}-value`;
                    const labelEl = this.byId(labelId);
                    if (labelEl) {
                        labelEl.textContent = el.value;
                    }

                    if (id === 'watermark-color') {
                        const hexLabel = this.byId('watermark-color-hex');
                        if (hexLabel) hexLabel.textContent = el.value;
                        el.parentElement.style.setProperty('--current-color', el.value);
                    }

                    // Debounced preview (Throttling heavy backend tasks)
                    this.ui.debounce(() => this.controller.preview(), id === 'watermark-text' ? 400 : 150);
                });
            }
        });

        // Other settings
        this.byId('watermark-font')?.addEventListener('change', () => this.controller.preview());
        this.byId('watermark-shadow')?.addEventListener('change', () => this.controller.preview());
        this.byId('watermark-outline')?.addEventListener('change', () => this.controller.preview());

        this.byId('watermark-tile')?.addEventListener('change', (e) => {
            const positionGroup = this.byId('position-group');
            if (positionGroup) {
                positionGroup.style.opacity = e.target.checked ? '0.5' : '1';
                positionGroup.style.pointerEvents = e.target.checked ? 'none' : 'auto';
            }
            this.controller.preview();
        });

        // Image Watermark
        const watermarkImageZone = this.byId('watermark-image-zone');
        const watermarkImageInput = this.byId('watermark-image-input');
        watermarkImageZone?.addEventListener('click', () => watermarkImageInput?.click());

        watermarkImageInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.ui.watermarkUI.handleUpload(file);
            }
        });

        this.byId('remove-watermark-image')?.addEventListener('click', () => {
            this.ui.watermarkUI.clear();
        });

        // Position Grid
        this.queryAll('#watermark-position-grid .pos-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.queryAll('#watermark-position-grid .pos-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.controller.preview();
            });
        });
    }

    bindAIControls() {
        // AI 超分辨率开关（图片压缩内功能，Community 可用）
        document.getElementById('enable-ai-upscale')?.addEventListener('change', () => {
            this.controller.preview();
        });
    }

    bindCompareControls() {
        // 预览区对比模式切换
        document.querySelectorAll('.compare-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.compare-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.controller.compareManager.setMode(tab.dataset.mode);
            });
        });

        // 设置面板 A/B 切换
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.controller.compareManager.switchConfig(tab.dataset.config);
            });
        });
    }

    bindModalControls() {
        // Save Preset Button
        document.getElementById('btn-save-preset')?.addEventListener('click', () => {
            const modal = document.getElementById('preset-name-modal');
            const input = document.getElementById('preset-name-input');
            if (modal && input) {
                modal.classList.remove('hidden');
                input.value = '';
                input.focus();
            }
        });

        // Modal Close
        document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('preset-name-modal')?.classList.add('hidden');
            });
        });

        // Modal Save Action
        const handleSavePreset = async () => {
            const modal = document.getElementById('preset-name-modal');
            const input = document.getElementById('preset-name-input');
            const name = input?.value.trim();

            if (name) {
                await this.controller.presetManager.savePreset(name);
                document.getElementById('custom-presets-wrapper')?.classList.remove('hidden');
                modal.classList.add('hidden');
            } else {
                const warnMsg = window.i18n?.t('pixel.enterPresetName') || window.i18n?.t('enhance.enterPresetName') || 'Please enter a name';
                window.app?.showToast(warnMsg === 'pixel.enterPresetName' || warnMsg === 'enhance.enterPresetName' ? 'Please enter a name' : warnMsg, 'warning');
            }
        };

        document.getElementById('confirm-save-preset')?.addEventListener('click', handleSavePreset);
        document.getElementById('preset-name-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSavePreset();
        });
    }

    bindRenameControls() {
        const renameInputs = [
            'rename-keep-name', 'rename-add-suffix', 'rename-suffix',
            'rename-add-index', 'rename-add-date'
        ];

        renameInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // For checkboxes use 'change', for text input use 'input'
                const eventType = el.type === 'checkbox' ? 'change' : 'input';
                el.addEventListener(eventType, () => {
                    this.ui.updateRenamePreview();
                });
            }
        });
    }

    bindCategoryTabs() {
        document.querySelectorAll('#page-compress .category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.dataset.category;

                // 更新选项卡样式
                document.querySelectorAll('#page-compress .category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 切换内容显示
                document.querySelectorAll('#page-compress .category-content').forEach(c => c.classList.add('hidden'));
                const target = document.getElementById(`cat-${category}`);
                if (target) {
                    target.classList.remove('hidden');
                    // 确保滚动到顶部
                    const parent = target.closest('.settings-scroll-content');
                    if (parent) parent.scrollTop = 0;
                }
            });
        });
    }

    bindPreviewToolbar() {
        this.byId('btn-view-slider')?.addEventListener('click', () => {
            this.ui.setPreviewMode('slider');
        });
        this.byId('btn-view-split')?.addEventListener('click', () => {
            this.ui.setPreviewMode('split');
        });
        this.byId('btn-zoom-in')?.addEventListener('click', () => {
            this.ui.previewManager?.zoomIn();
        });
        this.byId('btn-zoom-out')?.addEventListener('click', () => {
            this.ui.previewManager?.zoomOut();
        });
        this.byId('btn-preview-reset')?.addEventListener('click', () => {
            this.ui.resetPreview();
        });
    }
}

window.PixelUIEvents = PixelUIEvents;
