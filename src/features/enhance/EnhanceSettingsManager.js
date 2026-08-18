/**
 * EnhanceSettingsManager.js - AI 画质增强配置管理器
 * 负责管理 AI 引擎加载、动态选项渲染及设置面板 UI 同步
 */

class EnhanceSettingsManager {
    constructor(controller) {
        this.controller = controller;
        this.currentEngineInfo = null;

        // 监听语言切换事件以热更新引擎及动态选项（保留图标）
        window.addEventListener('languageChanged', async () => {
            if (this.controller && this.controller.elements && this.controller.elements.engineSelect) {
                await this.loadEngines();
                this.updateSettingsUI();
            }
        });
    }

    /**
     * 加载可用引擎列表
     */
    async loadEngines() {
        try {
            const raw = await window.mediaflow.enhance.getEngines();
            // Product: local engines only (drop cloud API leftovers from any source)
            const LOCAL_ENGINE_IDS = new Set(['cugan', 'esrgan', 'gfpgan']);
            const engines = (Array.isArray(raw) ? raw : []).filter(
                (e) => e && LOCAL_ENGINE_IDS.has(e.id) && e.type !== 'api'
            );
            const select = this.controller.elements.engineSelect;
            if (select) {
                select.innerHTML = engines.map(e => {
                    let name = e.name;
                    // 本地化支持
                    if (window.i18n) {
                        const keyMap = {
                            'cugan': 'enhance.modelCugan',
                            'esrgan': 'enhance.modelEsrgan',
                            'gfpgan': 'enhance.modelGfpgan'
                        };
                        if (keyMap[e.id]) {
                            name = window.i18n.t(keyMap[e.id]);
                        }
                    }
                    return `<option value="${this.escapeAttr(e.id)}">${e.icon ? this.escapeHtml(e.icon) + ' ' : ''}${this.escapeHtml(name)}</option>`;
                }).join('');

                // If previous selection was a removed cloud engine, fall back to first local
                const allowed = new Set(engines.map((e) => e.id));
                if (!allowed.has(this.controller.currentEngine)) {
                    const fallback = engines[0]?.id || 'cugan';
                    this.controller.currentEngine = fallback;
                    select.value = fallback;
                } else {
                    select.value = this.controller.currentEngine;
                }
            }

            await this.updateEngineOptions();
        } catch (error) {
            console.error('[EnhanceSettingsManager] Failed to load engines:', error);
        }
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    escapeAttr(value) {
        return this.escapeHtml(value).replace(/'/g, '&#39;');
    }

    /**
     * 更新引擎特定的选项
     */
    async updateEngineOptions() {
        const engineId = this.controller.currentEngine;
        try {
            const engineInfo = await window.mediaflow.enhance.getEngineOptions(engineId);
            if (!engineInfo) return;

            this.currentEngineInfo = engineInfo;
            this.controller.currentEngineInfo = engineInfo; // 保持主控制器引用同步

            // 更新描述
            if (this.controller.elements.engineDesc) {
                let desc = engineInfo.description;
                if (window.i18n) {
                    const keyMap = {
                        'cugan': 'enhance.modelDescCugan',
                        'esrgan': 'enhance.modelDescEsrgan',
                        'gfpgan': 'enhance.modelDescGfpgan'
                    };
                    if (keyMap[engineId]) {
                        desc = window.i18n.t(keyMap[engineId]);
                    }
                }
                this.controller.elements.engineDesc.textContent = desc;
            }

            // 更新开始按钮状态
            this.updateStartButtonStatus(engineInfo);

            // 改进：根据 engineInfo.options 更新 UI 同步
            if (engineInfo.options && Array.isArray(engineInfo.options)) {
                engineInfo.options.forEach(opt => {
                    // 处理倍率
                    if (opt.id === 'scale') {
                        const btns = this.controller.elements.scaleButtons?.querySelectorAll('.scale-btn');
                        btns?.forEach(btn => {
                            const val = parseInt(btn.dataset.scale);
                            const isDefault = val === opt.default;
                            btn.classList.toggle('active', isDefault);
                            if (isDefault) {
                                this.controller.options.scale = val;
                                const currentItem = this.controller.stateManager.getCurrentItem();
                                if (currentItem) currentItem.options.scale = val;
                            }
                        });
                    }

                    // 设置初始默认值
                    if (this.controller.options[opt.id] === undefined || this.controller.options[opt.id] === null) {
                        this.controller.options[opt.id] = opt.default;
                        const currentItem = this.controller.stateManager.getCurrentItem();
                        if (currentItem) currentItem.options[opt.id] = opt.default;
                    }
                });

                this.controller.updateFileList();
            } // Correctly close the IF block here
            if (engineInfo.options) {
                this.renderDynamicOptions(engineInfo.options);
            }

        } catch (error) {
            console.error('[EnhanceSettingsManager] Failed to get engine options:', error);
        }
    }

    /**
     * 更新开始按钮显示逻辑
     */
    updateStartButtonStatus(engineInfo) {
        const btn = this.controller.elements.btnStart;
        if (!btn) return;

        // 确保内部结构完整 (icon + text span)
        let icon = btn.querySelector('i');
        let textSpan = btn.querySelector('span[data-i18n]');

        if (!icon || !textSpan) {
            btn.innerHTML = '<i class="fas fa-magic"></i> <span data-i18n="enhance.startBtn"></span>';
            icon = btn.querySelector('i');
            textSpan = btn.querySelector('span[data-i18n]');
        }

        if (engineInfo.type === 'api') {
            icon.className = 'fas fa-magic';
            textSpan.setAttribute('data-i18n', 'enhance.startCloud');
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-warning');
        } else if (!engineInfo.isAvailable) {
            icon.className = 'fas fa-download';
            textSpan.setAttribute('data-i18n', 'enhance.downloadConfig');
            btn.classList.add('btn-warning');
            btn.classList.remove('btn-primary');
        } else {
            icon.className = 'fas fa-magic';
            textSpan.setAttribute('data-i18n', 'enhance.startBtn');
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-warning');
        }
    }

    /**
     * 动态渲染引擎特定的选项 (如 ESRGAN 的模型风格)
     */
    renderDynamicOptions(options) {
        let dynamicContainer = document.getElementById('enhance-dynamic-options');
        const modelStyleContainer = this.controller.elements.modelStyleContainer;

        if (!dynamicContainer) {
            dynamicContainer = document.createElement('div');
            dynamicContainer.id = 'enhance-dynamic-options';
            // 修正：将动态选项挂载到和模型选择同一个面板区域
            if (modelStyleContainer && modelStyleContainer.parentElement) {
                modelStyleContainer.parentElement.appendChild(dynamicContainer);
            } else if (this.controller.elements.optionsContainer) {
                this.controller.elements.optionsContainer.appendChild(dynamicContainer);
            }
        }

        // 清空容器
        dynamicContainer.innerHTML = '';
        if (modelStyleContainer) modelStyleContainer.innerHTML = '';

        options.forEach(opt => {
            // 过滤掉已经在静态 HTML 中定义过的通用选项
            if (['scale', 'upscale', 'format', 'output_format'].includes(opt.id) || opt.name === '放大倍率') return;

            if (opt.id === 'denoise' && this.controller.currentEngine === 'cugan') {
                if (this.controller.elements.denoiseGroup) this.controller.elements.denoiseGroup.style.display = 'block';
                return;
            } else if (opt.id === 'denoise') {
                if (this.controller.elements.denoiseGroup) this.controller.elements.denoiseGroup.style.display = 'none';
            }

            const group = document.createElement('div');
            group.className = 'setting-group';

            const label = document.createElement('label');
            label.className = 'setting-label';
            let labelText = opt.label || opt.name || opt.id;
            if (window.i18n && opt.id === 'model') {
                labelText = window.i18n.t('enhance.modelStyle');
            }
            label.textContent = labelText;
            group.appendChild(label);

            if (opt.type === 'select') {
                const select = document.createElement('select');
                select.className = 'setting-select';

                const currentVal = this.controller.options[opt.id] !== undefined ? this.controller.options[opt.id] : opt.default;

                select.innerHTML = opt.choices.map(c => {
                    let choiceLabel = c.label;
                    if (window.i18n && opt.id === 'model') {
                        if (c.label.includes('标准')) {
                            choiceLabel = window.i18n.t('enhance.styleStandard');
                        }
                        else if (c.label.includes('画质')) {
                            choiceLabel = window.i18n.t('enhance.stylePro');
                        }
                        else if (c.label.includes('极速')) {
                            choiceLabel = window.i18n.t('enhance.styleFast');
                        }
                    }
                    const isSelected = String(c.value) === String(currentVal) ? 'selected' : '';
                    return `<option value="${c.value}" ${isSelected}>${choiceLabel}</option>`;
                }).join('');

                select.addEventListener('change', (e) => {
                    const val = (opt.type === 'number' || opt.id === 'scale') ? parseInt(e.target.value) : e.target.value;
                    this.controller.options[opt.id] = val;

                    const currentItem = this.controller.stateManager.getCurrentItem();
                    if (currentItem) {
                        currentItem.options[opt.id] = val;
                        this.controller.updateFileList();
                    }
                });

                group.appendChild(select);
                this.controller.options[opt.id] = currentVal;
            }

            // 决定渲染目标容器
            let targetContainer = dynamicContainer;
            if (opt.id === 'model' && modelStyleContainer) {
                targetContainer = modelStyleContainer;
                // 去掉 margin-top，因为已经在 CSS 中为容器设置了 spacing
                group.style.marginBottom = '0';
            }

            targetContainer.appendChild(group);
        });
    }

    /**
     * 同步当前全局选项到 UI 面板
     */
    updateSettingsUI() {
        const els = this.controller.elements;
        const opts = this.controller.options;

        if (els.engineSelect) els.engineSelect.value = this.controller.currentEngine;

        // Video MVP: only 2× is supported — disable 3×/4× when current item is video
        const current = this.controller.stateManager?.getCurrentItem?.();
        const isVideo =
            !!current?.isVideo ||
            (typeof this.controller.uiManager?.isVideoPath === 'function' &&
                this.controller.uiManager.isVideoPath(current?.path));

        if (isVideo && Number(opts.scale) > 2) {
            opts.scale = 2;
            if (current?.options) current.options.scale = 2;
        }

        const btns = els.scaleButtons?.querySelectorAll('.scale-btn');
        btns?.forEach((btn) => {
            const val = parseInt(btn.dataset.scale, 10);
            btn.classList.toggle('active', val === opts.scale);
            const videoBlocked = isVideo && val > 2;
            btn.disabled = videoBlocked;
            btn.classList.toggle('scale-btn-disabled', videoBlocked);
            btn.title = videoBlocked
                ? window.i18n?.t('enhance.videoScaleCapped') ||
                  'Video enhance is limited to 2× in this version'
                : '';
        });

        if (els.outputFormat) els.outputFormat.value = opts.format || 'auto';
        if (els.denoiseSlider) els.denoiseSlider.value = opts.denoise !== undefined ? opts.denoise : 0;
        if (els.sharpenToggle) els.sharpenToggle.checked = !!opts.sharpen;
        if (els.performanceMode) els.performanceMode.value = opts.performanceMode || 'balanced';

        this.controller.uiManager?.refreshProBanner?.();
    }

    /**
     * 下载/安装 AI 引擎
     */
    async downloadEngine() {
        const engineId = this.controller.currentEngine;
        const btn = this.controller.elements.btnStart;
        if (!btn) return;

        try {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${window.i18n?.t('enhance.downloading') || 'Downloading...'}`;

            const result = await window.mediaflow.enhance.downloadEngine(engineId, (progress) => {
                btn.innerHTML = `<i class="fas fa-download"></i> ${Math.round(progress)}%`;
            });

            if (result.success) {
                window.app?.showToast(window.i18n?.t('enhance.engineDownloadSuccess') || 'Engine downloaded successfully', 'success');
                await this.updateEngineOptions();
            } else {
                window.app?.showToast(result.error || window.i18n?.t('enhance.downloadFail') || 'Download failed', 'error');
                this.updateStartButtonStatus(this.currentEngineInfo);
            }
        } catch (error) {
            console.error('[EnhanceSettingsManager] Download failed:', error);
            window.app?.showToast(window.i18n?.t('enhance.downloadException') || 'Download exception occurred', 'error');
            this.updateStartButtonStatus(this.currentEngineInfo);
        } finally {
            btn.disabled = false;
        }
    }
}

window.EnhanceSettingsManager = EnhanceSettingsManager;
