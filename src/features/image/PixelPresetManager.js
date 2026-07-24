/**
 * PixelPresetManager.js
 * 管理用户自定义预设 (增删改查)
 */
class PixelPresetManager {
    constructor(pixelFlow) {
        this.pixelFlow = pixelFlow;
        this.storeKey = 'pixel_custom_presets';
        this.presets = [];
        this.ui = null;
    }

    async init() {
        if (window.PixelPresetUI) {
            this.ui = new window.PixelPresetUI(this);
        }
        await this.loadPresets();
        this.renderPresetUI();
    }

    async loadPresets() {
        try {
            const data = await window.mediaflow?.store.get(this.storeKey);
            this.presets = Array.isArray(data) ? data : [];
            console.log('[PixelPresetManager] Loaded presets:', this.presets.length);
        } catch (e) {
            console.error('[PixelPresetManager] Failed to load presets:', e);
            this.presets = [];
        }
    }

    async savePreset(name) {
        if (!name || !name.trim()) return;

        const options = this.pixelFlow.uiManager.getCompressOptions();

        // 收集所有当前状态
        const newPreset = {
            id: Date.now().toString(),
            name: name.trim(),
            timestamp: Date.now(),
            data: {
                // 压缩参数
                format: options.format,
                quality: options.quality,
                width: options.width,
                height: options.height,

                // Advanced Options
                keepICC: options.keepICC,
                stripExif: options.stripExif,

                // 水印设置
                watermark: this.getWatermarkState(),

                // 其他转换
                rotation: this.pixelFlow.rotation,
                flipH: this.pixelFlow.flipH,
                flipV: this.pixelFlow.flipV
            }
        };

        this.presets.push(newPreset);
        await this.persist();
        this.renderPresetUI();
        window.app?.showToast(window.i18n?.t('pixel.presetSaved', {name}) || `Preset "${name}" saved`, 'success');
    }

    async deletePreset(id) {
        this.presets = this.presets.filter(p => p.id !== id);
        await this.persist();
        this.renderPresetUI();
        window.app?.showToast(window.i18n?.t('pixel.presetDeleted') || 'Preset deleted', 'success');
    }

    applyPreset(id) {
        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;

        const data = preset.data;

        // 1. 应用压缩参数
        this.pixelFlow.uiManager.setCompressOptions({
            format: data.format,
            quality: data.quality,
            width: data.width,
            height: data.height,
            keepICC: data.keepICC,
            stripExif: data.stripExif
        });

        // 2. 应用水印设置
        if (data.watermark) {
            this.applyWatermarkState(data.watermark);
        }

        // 3. 应用转换
        this.pixelFlow.rotation = data.rotation || 0;
        this.pixelFlow.flipH = data.flipH || false;
        this.pixelFlow.flipV = data.flipV || false;

        // 4. 刷新预览
        this.pixelFlow.rotation = data.rotation || 0; // 再次确保
        this.pixelFlow.preview();

        // 更新 UI 按钮状态
        this.highlightPreset(id);

        window.app?.showToast(window.i18n?.t('pixel.presetApplied', {name: preset.name}) || `Applied preset: ${preset.name}`, 'info');
    }

    async persist() {
        await window.mediaflow?.store.set(this.storeKey, this.presets);
    }

    // --- Delegation to UI ---

    renderPresetUI() {
        if (this.ui) {
            this.ui.render(this.presets);
        }
    }

    highlightPreset(id) {
        if (this.ui) {
            this.ui.highlight(id);
        }
    }

    // --- State Extractors (Retained for logic/DOM interaction) ---

    getWatermarkState() {
        const ui = this.pixelFlow.uiManager;
        const options = ui.getCompressOptions();
        return options.watermark; // 直接复用 UIManager 的成熟采集逻辑
    }

    applyWatermarkState(watermark) {
        if (!watermark) {
            if (this.pixelFlow.uiManager.watermarkUI) {
                this.pixelFlow.uiManager.watermarkUI.clear();
            }
            return;
        }

        // 统一使用 UIManager 的 setOptions，它已经处理了文字/图片的所有细节
        if (this.pixelFlow.uiManager.watermarkUI) {
            this.pixelFlow.uiManager.watermarkUI.setOptions(watermark);
        }
    }
}

window.PixelPresetManager = PixelPresetManager;
