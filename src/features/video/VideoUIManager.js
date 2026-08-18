/**
 * VideoUIManager.js
 * 负责视频工具界面的交互、弹窗、进度条控制
 */
class VideoUIManager {
    constructor(controller) {
        this.controller = controller;
        this.core = controller.core; // CreatorFlow reference
    }

    /**
     * 绑定 UI 事件
     */
    init() {
        // [重构保护] 一键竖屏按钮 (btn-make-vertical) 的事件已移至 ToolSettingsManager.js，避免重复绑定
        // [旧版遗留] 导出按钮事件已迁移至 CreatorExportManager.js
        // document.getElementById('btn-export-merged')?.addEventListener('click', () => this.controller.smartClip({ merge: true }));
        // document.getElementById('btn-export-separate')?.addEventListener('click', () => this.controller.smartClip({ merge: false }));

        // 兼容旧 ID 和新分流 ID
        document.getElementById('btn-compress')?.addEventListener('click', () => this.controller.compressVideo());
        document.getElementById('btn-compress-final')?.addEventListener('click', () => this.controller.compressVideo());
        document.getElementById('btn-convert')?.addEventListener('click', () => this.controller.convertFormat());
        document.getElementById('btn-convert-final')?.addEventListener('click', () => this.controller.convertFormat());

        // GIF 按钮绑定
        document.getElementById('btn-create-gif')?.addEventListener('click', () => this.controller.generateGif());
        document.getElementById('btn-create-gif-final')?.addEventListener('click', () => this.controller.generateGif());
        document.getElementById('btn-start-watermark')?.addEventListener('click', () => this.controller.addWatermark());
        document.getElementById('btn-export-separate-pro')?.addEventListener('click', () => this.controller.smartClip({ merge: false }));
        document.getElementById('btn-export-merged-pro')?.addEventListener('click', () => this.controller.smartClip({ merge: true }));
        this.setupWatermarkListeners();

        // 属性面板变换工具绑定
        document.getElementById('btn-prop-apply-rotate')?.addEventListener('click', () => this.controller.rotateVideo());
        document.getElementById('btn-prop-apply-mirror')?.addEventListener('click', () => this.controller.mirrorVideo());
        // [重构保护] 智能裁剪按钮 (btn-prop-apply-crop) 的事件已移至 ToolSettingsManager.js，避免双次执行

        document.getElementById('btn-reveal-file')?.addEventListener('click', () => this.revealFile());

        this.setupSpeedAndGIFListeners();
        this.setupTransitionListeners();
        this.setupUtilityListeners();
        this.loadLastSettings(); // 🆕 加载上次使用的参数
    }

    /**
     * 保存当前参数到本地
     */
    saveCurrentSettings() {
        const settings = {
            quality: document.getElementById('compress-quality-only')?.value,
            codec: document.getElementById('adv-compress-codec')?.value,
            preset: document.getElementById('adv-compress-preset')?.value,
            audio: document.getElementById('adv-compress-audio')?.value,
            format: document.getElementById('convert-format-only')?.value,
            targetSize: document.getElementById('compress-target-size')?.value
        };
        localStorage.setItem('mediaflow_last_export_settings', JSON.stringify(settings));
    }

    /**
     * 加载上次参数
     */
    loadLastSettings() {
        try {
            const data = localStorage.getItem('mediaflow_last_export_settings');
            if (!data) return;
            const settings = JSON.parse(data);

            if (settings.quality) {
                const el = document.getElementById('compress-quality-only');
                if (el) {
                    el.value = settings.quality;
                    if (settings.quality === 'target' && document.getElementById('target-size-wrapper')) {
                        document.getElementById('target-size-wrapper').style.display = 'flex';
                    }
                }
            }
            if (settings.codec) {
                const el = document.getElementById('adv-compress-codec');
                if (el) el.value = settings.codec;
            }
            if (settings.preset) {
                const el = document.getElementById('adv-compress-preset');
                if (el) el.value = settings.preset;
            }
            if (settings.audio) {
                const el = document.getElementById('adv-compress-audio');
                if (el) el.value = settings.audio;
            }
            if (settings.format) {
                const el = document.getElementById('convert-format-only');
                if (el) el.value = settings.format;
            }
            if (settings.targetSize) {
                const el = document.getElementById('compress-target-size');
                if (el) el.value = settings.targetSize;
            }
        } catch (e) {
            console.error('[VideoUIManager] Failed to load settings:', e);
        }
    }

    /**
     * 设置深度实用工具监听 (体积预估、预设联动等)
     */
    setupWatermarkListeners() {
        document.querySelectorAll('input[name="watermark-type"]').forEach((input) => {
            input.addEventListener('change', () => this.syncWatermarkTypeUI());
        });
        document.getElementById('btn-select-watermark-image')?.addEventListener('click', () => {
            this.chooseWatermarkImage();
        });
        this.syncWatermarkTypeUI();
    }

    syncWatermarkTypeUI() {
        const type = document.querySelector('input[name="watermark-type"]:checked')?.value || 'text';
        const isImage = type === 'image';
        const textOptions = document.getElementById('watermark-text-options');
        const imageOptions = document.getElementById('watermark-image-options');

        if (textOptions) {
            textOptions.classList.toggle('hidden', isImage);
            textOptions.style.display = isImage ? 'none' : '';
        }
        if (imageOptions) {
            imageOptions.classList.toggle('hidden', !isImage);
            imageOptions.style.display = isImage ? 'flex' : 'none';
        }
    }

    setWatermarkImagePath(filePath) {
        const path = String(filePath || '').trim();
        const display = document.getElementById('watermark-image-path');
        if (!display) return;

        display.dataset.path = path;
        display.title = path;
        display.textContent = path
            ? (path.split(/[\\/]/).pop() || path)
            : (window.i18n?.t('creator.watermark.noImage') || 'No image selected');
    }

    async chooseWatermarkImage() {
        if (!window.mediaflow?.dialog?.openFile) {
            this.showToast(window.i18n?.t('creator.watermark.imageDialogUnavailable') || 'Image picker is unavailable', 'warning');
            return null;
        }

        const filePath = await window.mediaflow.dialog.openFile({
            title: window.i18n?.t('creator.watermark.selectImage') || 'Select watermark image',
            properties: ['openFile'],
            filters: [
                { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }
            ]
        });
        if (filePath) {
            this.setWatermarkImagePath(Array.isArray(filePath) ? filePath[0] : filePath);
        }
        return filePath || null;
    }

    setupUtilityListeners() {
        const qualitySelect = document.getElementById('compress-quality-only');
        const targetSizeWrapper = document.getElementById('target-size-wrapper');

        // 1. 质量选择与目标大小显隐切换
        qualitySelect?.addEventListener('change', (e) => {
            if (targetSizeWrapper) targetSizeWrapper.style.display = e.target.value === 'target' ? 'flex' : 'none';
            this.updateSizeEstimation();
        });

        // 2. 快捷预设联动实现
        document.querySelectorAll('.preset-chips .chip-item').forEach(chip => {
            chip.addEventListener('click', () => {
                // 视觉反馈：切换激活态
                document.querySelectorAll('.preset-chips .chip-item').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                // 参数自动填充 (填充后保留手动修改能力)
                const preset = chip.dataset.preset;
                this.applySmartPreset(preset);
            });
        });

        // 3. 实时预估触发
        document.getElementById('adv-compress-codec')?.addEventListener('change', () => this.updateSizeEstimation());
        document.getElementById('adv-compress-audio')?.addEventListener('change', () => this.updateSizeEstimation());
    }

    /**
     * 应用场景化智能预设 (智能预设 + 专业手动)
     */
    applySmartPreset(preset) {
        const codecInput = document.getElementById('adv-compress-codec');
        const qualityInput = document.getElementById('compress-quality-only');
        const presetInput = document.getElementById('adv-compress-preset');
        const audioInput = document.getElementById('adv-compress-audio');
        const formatInput = document.getElementById('convert-format-only');

        const targetSizeWrapper = document.getElementById('target-size-wrapper');

        switch (preset) {
        case 'wechat':
            if (formatInput) formatInput.value = 'mp4';
            if (codecInput) codecInput.value = 'h264'; // 保证兼容性
            if (qualityInput) qualityInput.value = 'target';
            if (targetSizeWrapper) targetSizeWrapper.style.display = 'flex';
            document.getElementById('compress-target-size').value = 100; // 微信上限
            if (audioInput) audioInput.value = 'low';
            break;
        case 'douyin':
            if (formatInput) formatInput.value = 'mp4';
            if (codecInput) codecInput.value = 'hevc';
            if (qualityInput) qualityInput.value = 'high';
            if (presetInput) presetInput.value = 'balanced';
            if (targetSizeWrapper) targetSizeWrapper.style.display = 'none';
            break;
        case 'iphone':
            if (formatInput) formatInput.value = 'mp4';
            if (codecInput) codecInput.value = 'h264';
            if (qualityInput) qualityInput.value = 'medium';
            if (targetSizeWrapper) targetSizeWrapper.style.display = 'none';
            break;
        case 'audio':
            if (formatInput) formatInput.value = 'mp3';
            if (targetSizeWrapper) targetSizeWrapper.style.display = 'none';
            this.showToast(window.i18n?.t('creator.toasts.switchMp3Mode') || 'Switched to MP3 conversion mode', 'info');
            return;
        }
        this.updateSizeEstimation();
    }

    /**
     * 预计体积计算逻辑 (动态计算预期结果)
     */
    updateSizeEstimation() {
        const file = this.core.videoFile;
        const estDisp = document.getElementById('compress-est-size');
        if (!file || !estDisp) return;

        const originalSize = file.size / (1024 * 1024); // MB
        const quality = document.getElementById('compress-quality-only')?.value || 'medium';
        const codec = document.getElementById('adv-compress-codec')?.value || 'hevc';

        // 算法模型：基于质量系数与编码效率
        let factor = 0.5; // 默认平衡
        if (quality === 'high') factor = 0.8;
        if (quality === 'low') factor = 0.3;
        if (quality === 'extreme') factor = 0.15;
        if (quality === 'target') {
            const target = parseFloat(document.getElementById('compress-target-size')?.value);
            if (!isNaN(target)) factor = target / originalSize;
        }

        // 编码器加放 (HEVC/AV1 更省空间)
        if (codec === 'hevc') factor *= 0.65;
        if (codec === 'av1') factor *= 0.45;

        const estSize = (originalSize * factor).toFixed(1);
        const ratio = Math.max(0, Math.min(99, Math.round((1 - factor) * 100)));

        const estMsg = window.i18n?.t('creator.toasts.estSizeMsg', { size: estSize, ratio: ratio }) || `Est. Output: ~${estSize} MB (Reduced ${ratio}%)`;
        estDisp.innerHTML = `<i class="fa-solid fa-chart-line" style="margin-right: 4px;"></i> ${estMsg}`;
    }

    setupSpeedAndGIFListeners() {
        // 项目面板中的压缩/格式转换等监听已保留
        document.getElementById('btn-create-gif')?.addEventListener('click', () => this.controller.generateGif());

        // [重构] 变速逻辑已移至 ToolSettingsManager.js 进行实时预览处理
    }

    setupTransitionListeners() {
        const select = document.getElementById('prop-transition-type');
        if (select && window.TransitionManager) {
            window.TransitionManager.initSelect('prop-transition-type');

            select.addEventListener('change', (e) => {
                window.TransitionManager.updatePreview('prop-transition-preview', e.target.value);
            });
        }

        document.getElementById('btn-prop-apply-transition')?.addEventListener('click', () => {
            const type = document.getElementById('prop-transition-type')?.value;
            const duration = parseFloat(document.getElementById('prop-transition-duration')?.value) || 1.0;
            if (!type) return;
            this.controller.applyTransition(type, duration);
        });
    }

    updateTransitionPanel(transition = { id: 'none', duration: 1.0 }) {
        const select = document.getElementById('prop-transition-type');
        const durInput = document.getElementById('prop-transition-duration');

        if (select) {
            select.value = transition.id || 'none';
            window.TransitionManager?.updatePreview('prop-transition-preview', select.value);
        }
        if (durInput) {
            durInput.value = transition.duration || 1.0;
        }
    }

    /**
     * 从 DOM 中采集参数
     */
    getUIOptions(providedOpts, uiIds) {
        const opts = { ...providedOpts };
        if (uiIds) {
            for (const key in uiIds) {
                if (opts[key] === undefined) {
                    const el = document.getElementById(uiIds[key]);
                    if (el) opts[key] = el.value;
                }
            }
        }
        return opts;
    }

    /**
     * 弹出保存对话框
     */
    async askSavePath(options) {
        return await window.mediaflow?.dialog.saveFile(options);
    }

    /**
     * 弹出文件夹选择框
     */
    async askFolderPath() {
        return await window.mediaflow?.dialog.selectFolder?.();
    }

    /**
     * 统一进度条显示
     */
    showProgress(text, pct = 0, cancellable = false, onCancel = null) {
        this.core.showProgress(text, pct, cancellable, onCancel);
    }

    updateProgress(pct, text) {
        this.core.updateProgress(pct, text);
    }

    hideProgress() {
        this.core.hideProgress();
    }

    /**
     * Toast 提示
     */
    showToast(msg, type = 'success') {
        window.app?.showToast(msg, type);
    }

    showErrorDetails(title, summary, details = '') {
        const existing = document.getElementById('creator-error-details-overlay');
        existing?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'creator-error-details-overlay';
        overlay.className = 'modal-overlay';
        overlay.tabIndex = -1;
        overlay.style.cssText = 'position: fixed; inset: 0; background: var(--overlay-scrim); z-index: 20000; display: flex; align-items: center; justify-content: center; padding: 24px; pointer-events: auto;';

        overlay.innerHTML = `
            <div style="width: min(720px, 100%); background: var(--bg-secondary, var(--bg-card)); border: 1px solid var(--border-color, var(--border-color)); border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45);">
                <div style="padding: 18px 20px; border-bottom: 1px solid var(--border-color, var(--border-color)); display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                    <div>
                        <div style="font-size: 17px; font-weight: 600; color: var(--text-primary, #fff);">${title}</div>
                        <div style="font-size: 13px; color: var(--text-secondary, #bbb); margin-top: 4px;">${summary}</div>
                    </div>
                    <button type="button" data-role="close" style="background: none; border: none; color: var(--text-secondary, #bbb); cursor: pointer; font-size: 20px;">×</button>
                </div>
                <div style="padding: 20px;">
                    <textarea readonly style="width: 100%; min-height: 220px; resize: vertical; border-radius: 12px; border: 1px solid var(--border-color, var(--border-color)); background: rgba(0,0,0,0.22); color: var(--text-primary, #fff); padding: 14px; font-family: Consolas, monospace; font-size: 12px; line-height: 1.5;">${details}</textarea>
                    <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;">
                        <button type="button" data-role="copy" class="btn btn-secondary">${window.i18n?.t('common.actions.copy') || 'Copy'}</button>
                        <button type="button" data-role="ok" class="btn btn-primary">${window.i18n?.t('common.actions.close') || 'Close'}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const textArea = overlay.querySelector('textarea');
        const close = () => {
            overlay.removeEventListener('keydown', handleKeydown);
            overlay.remove();
        };
        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        };

        overlay.querySelector('[data-role="close"]').onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
        };
        overlay.querySelector('[data-role="ok"]').onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
        };
        overlay.onclick = (event) => {
            if (event.target === overlay) close();
        };
        overlay.addEventListener('keydown', handleKeydown);
        requestAnimationFrame(() => overlay.focus());
        overlay.querySelector('[data-role="copy"]').onclick = async () => {
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(textArea.value);
                    this.showToast(window.i18n?.t('common.toasts.copied') || 'Copied', 'success');
                    return;
                }

                textArea.select();
                document.execCommand('copy');
                this.showToast(window.i18n?.t('common.toasts.copied') || 'Copied', 'success');
            } catch (error) {
                this.showToast(error.message || 'Copy failed', 'error');
            }
        };
    }

    /**
     * 任务完成提示 (带快捷入口)
     */
    showSuccess(message, filePath) {
        if (!filePath) {
            this.showToast(message, 'success');
            return;
        }

        // 使用自定义通知
        const notification = document.createElement('div');
        notification.className = 'task-success-notification glass-panel';
        notification.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; width: 320px;
            background: rgba(var(--accent-primary-rgb), 0.1);
            border: 1px solid var(--accent-primary);
            border-radius: 12px; padding: 16px; z-index: 20000;
            backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            animation: slideInRight 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--accent-primary); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="fa-solid fa-check" style="font-size: 12px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; margin-bottom: 4px;">${window.i18n?.t('creator.notifications.taskDone') || 'Task Completed'}</div>
                    <div style="color: var(--text-muted); font-size: 12px; line-height: 1.4;">${message}</div>
                </div>
                <button id="close-notif" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="notif-open-file" class="btn-primary-pro btn-xs" style="flex: 1; padding: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 6px;">${window.i18n?.t('creator.notifications.openFile') || 'Open File'}</button>
                <button id="notif-open-folder" class="btn-glass btn-xs" style="flex: 1; padding: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 6px; background: var(--fill-hover); border: 1px solid var(--fill-hover); color: var(--text-primary);">${window.i18n?.t('creator.notifications.openFolder') || 'Open Folder'}</button>
            </div>
            <style>
                @keyframes slideInRight { from { transform: translateX(110%); } to { transform: translateX(0); } }
            </style>
        `;

        document.body.appendChild(notification);

        const close = () => {
            notification.style.transform = 'translateX(110%)';
            notification.style.transition = 'transform 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        };

        notification.querySelector('#close-notif').onclick = close;
        notification.querySelector('#notif-open-file').onclick = () => {
            window.mediaflow?.shell?.openPath(filePath);
            close();
        };
        notification.querySelector('#notif-open-folder').onclick = () => {
            window.mediaflow?.shell?.showItemInFolder(filePath);
            close();
        };

        // 8秒后自动关闭
        setTimeout(close, 8000);
    }

    /**
     * 在文件夹中显示文件
     */
    revealFile() {
        const file = this.core.videoFile;
        if (!file || !file.path) {
            this.showToast(window.i18n?.t('creator.toasts.loadMediaFirst') || 'No file loaded', 'warning');
            return;
        }
        window.mediaflow?.shell?.showItemInFolder(file.path);
    }

    /**
     * FPS 匹配确认弹窗 (从 VideoProcessor 移至此处)
     */
    async showFpsMismatchDialog(fpsInfo, onConfirm) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--overlay-scrim); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;';

            const mismatchedNames = fpsInfo.mismatchedVideos.map(v => `⚠️ ${v.name} (${v.fps} fps)`).join('<br>');

            overlay.innerHTML = `
                <div class="modal-content" style="max-width: 480px; width: 90%; border: 1px solid var(--border-color);">
                    <h3 style="color: #f59e0b; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">${window.i18n?.t('creator.dialogs.fpsMismatchTitle') || '⚠️ FPS Mismatch Detected'}</h3>
                    <p style="color: var(--text-secondary); margin: 0 0 12px 0; font-size: 0.9rem;">${window.i18n?.t('creator.dialogs.fpsMismatchDesc', { fps: fpsInfo.dominantFps }) || `Most videos are <strong>${fpsInfo.dominantFps} fps</strong>, but the following are different:`}</p>
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px; margin: 0 0 16px 0; font-size: 0.85rem; color: #f59e0b; max-height: 100px; overflow-y: auto;">
                        ${mismatchedNames}
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="color: var(--text-secondary); font-size: 0.85rem; display: block; margin-bottom: 8px;">${window.i18n?.t('creator.dialogs.outputFps') || 'Output FPS:'}</label>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="fps-selection">
                            <button class="btn btn-primary" data-fps="${fpsInfo.dominantFps}">${fpsInfo.dominantFps} fps</button>
                            <button class="btn btn-secondary" data-fps="30">30 fps</button>
                            <button class="btn btn-secondary" data-fps="25">25 fps</button>
                            <button class="btn btn-secondary" data-fps="24">24 fps</button>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button id="btn-reencode-merge" class="btn btn-primary">${window.i18n?.t('creator.dialogs.reencodeMerge') || '🔄 Re-encode & Merge'}</button>
                        <button id="btn-cancel-merge" class="btn btn-secondary" style="border:none; background:transparent;">${window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');

            let selectedFps = fpsInfo.dominantFps;
            overlay.querySelectorAll('#fps-selection button').forEach(btn => {
                btn.onclick = () => {
                    overlay.querySelectorAll('#fps-selection button').forEach(b => b.className = 'btn btn-secondary');
                    btn.className = 'btn btn-primary';
                    selectedFps = parseInt(btn.dataset.fps);
                };
            });

            overlay.querySelector('#btn-reencode-merge').onclick = async () => {
                document.body.removeChild(overlay);
                try {
                    await onConfirm(selectedFps);
                } catch {
                    // 忽略取消异常，其他异常由对应入口捕获
                    console.log('[VideoUIManager] Background process cancelled or failed');
                }
                resolve(true);
            };

            overlay.querySelector('#btn-cancel-merge').onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };
        });
    }
}

window.VideoUIManager = VideoUIManager;
