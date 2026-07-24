/**
 * PixelWatermarkUI.js
 * 专门负责水印图片的上传、预览和清除逻辑
 */
class PixelWatermarkUI {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.watermarkImagePath = null;
    }

    byId(id) {
        return this.controller?.uiManager?.byId?.(id)
            || document.getElementById('page-compress')?.querySelector?.(`#${id}`)
            || document.getElementById(id);
    }

    queryAll(selector) {
        return this.controller?.uiManager?.queryAll?.(selector)
            || Array.from(document.getElementById('page-compress')?.querySelectorAll?.(selector) || document.querySelectorAll(selector));
    }

    /**
     * 处理水印图片上传
     * @param {File} file - 上传的图片文件
     */
    handleUpload(file) {
        if (!file) return;

        // 验证文件类型
        if (!file.type.match(/^image\/(png|svg\+xml)$/)) {
            window.app?.showToast(window.i18n?.t('pixel.watermarkFormat') || 'Watermark image only supports PNG or SVG format', 'warning');
            return;
        }

        // 创建预览
        const reader = new FileReader();
        reader.onload = (e) => {
            this.watermarkImagePath = e.target.result; // Base64 数据

            // 更新 UI
            const zone = this.byId('watermark-image-zone');
            const preview = this.byId('watermark-image-preview');
            const thumb = this.byId('watermark-image-thumb');

            if (zone) zone.classList.add('hidden');
            if (preview) preview.classList.remove('hidden');
            if (thumb) thumb.src = e.target.result;

            this.controller.preview();
        };
        reader.readAsDataURL(file);
    }

    /**
     * 清除水印图片
     */
    clear() {
        this.watermarkImagePath = null;

        const zone = this.byId('watermark-image-zone');
        const preview = this.byId('watermark-image-preview');
        const input = this.byId('watermark-image-input');
        const thumb = this.byId('watermark-image-thumb');

        if (zone) zone.classList.remove('hidden');
        if (preview) preview.classList.add('hidden');
        if (input) input.value = '';
        if (thumb) thumb.src = '';

        this.controller.preview();
    }

    /**
     * 设置水印配置回 UI
     */
    setOptions(watermark) {
        // 1. 获取全局开关
        const enableInput = this.byId('enable-watermark');
        if (enableInput) {
            enableInput.checked = !!watermark;
            enableInput.dispatchEvent(new Event('change'));
        }

        if (!watermark) {
            this.clear();
            return;
        }

        // 2. 基础参数
        const textInput = this.byId('watermark-text');
        if (textInput) textInput.value = watermark.text || '';
        const fontInput = this.byId('watermark-font');
        if (fontInput) fontInput.value = watermark.font || 'sans-serif';
        const colorInput = this.byId('watermark-color');
        if (colorInput) {
            colorInput.value = watermark.color || '#ffffff';
            colorInput.dispatchEvent(new Event('input'));
            if (colorInput.parentElement) {
                colorInput.parentElement.style.setProperty('--current-color', colorInput.value);
            }
        }

        // [Fix] 分立的透明度和大小设置
        const finalTextOpacity = watermark.textOpacity !== undefined ? watermark.textOpacity : (watermark.opacity || 0.8);
        const finalTextSize = watermark.textSize !== undefined ? watermark.textSize : (watermark.size || 48);
        const finalImageOpacity = watermark.imageOpacity !== undefined ? watermark.imageOpacity : (watermark.opacity || 1.0);
        const finalImageSize = watermark.imageSize !== undefined ? watermark.imageSize : (watermark.size || 60);

        const textOpacityInput = this.byId('watermark-text-opacity');
        if (textOpacityInput) {
            textOpacityInput.value = finalTextOpacity * 100;
            textOpacityInput.dispatchEvent(new Event('input'));
        }
        const textSizeInput = this.byId('watermark-text-size');
        if (textSizeInput) {
            textSizeInput.value = finalTextSize;
            textSizeInput.dispatchEvent(new Event('input'));
        }
        const imageOpacityInput = this.byId('watermark-image-opacity');
        if (imageOpacityInput) {
            imageOpacityInput.value = finalImageOpacity * 100;
            imageOpacityInput.dispatchEvent(new Event('input'));
        }
        const imageSizeInput = this.byId('watermark-image-size');
        if (imageSizeInput) {
            imageSizeInput.value = finalImageSize;
            imageSizeInput.dispatchEvent(new Event('input'));
        }

        const rotationInput = this.byId('watermark-rotation');
        if (rotationInput) {
            rotationInput.value = watermark.rotation || 0;
            rotationInput.dispatchEvent(new Event('input'));
        }
        const marginInput = this.byId('watermark-margin');
        if (marginInput) {
            marginInput.value = watermark.margin || 20;
            marginInput.dispatchEvent(new Event('input'));
        }

        // 3. 高级开关
        const shadowInput = this.byId('watermark-shadow');
        if (shadowInput) shadowInput.checked = !!watermark.shadow;
        const outlineInput = this.byId('watermark-outline');
        if (outlineInput) outlineInput.checked = !!watermark.outline;
        const tileInput = this.byId('watermark-tile');
        if (tileInput) {
            tileInput.checked = !!watermark.tiled;
            tileInput.dispatchEvent(new Event('change'));
        }

        // 4. 位置按钮
        if (watermark.position) {
            this.queryAll('#watermark-position-grid .pos-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.pos === watermark.position);
            });
        }

        // 5. 图片水印处理
        if (watermark.image) {
            this.watermarkImagePath = watermark.image;
            const zone = this.byId('watermark-image-zone');
            const preview = this.byId('watermark-image-preview');
            const thumb = this.byId('watermark-image-thumb');
            if (zone) zone.classList.add('hidden');
            if (preview) preview.classList.remove('hidden');
            if (thumb) thumb.src = watermark.image;
        } else {
            this.clear();
        }
    }

    /**
     * 获取当前水印图片路径 (Base64)
     */
    getImagePath() {
        return this.watermarkImagePath;
    }
}


window.PixelWatermarkUI = PixelWatermarkUI;
