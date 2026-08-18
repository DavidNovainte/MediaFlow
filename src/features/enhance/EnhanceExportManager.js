/**
 * EnhanceExportManager.js - AI 画画增强导出重命名与模板管理器
 */

class EnhanceExportManager {
    constructor(controller) {
        this.controller = controller;
        this.templateInput = null;
        this.defaultTemplate = '{name}_{model}_{scale}x';
    }

    /**
     * 初始化
     */
    init() {
        this.templateInput = document.getElementById('enhance-name-template');
        if (this.templateInput) {
            // 从本地加载保存的模板
            const saved = localStorage.getItem('enhance_export_template');
            if (saved) this.templateInput.value = saved;

            this.templateInput.addEventListener('change', (e) => {
                localStorage.setItem('enhance_export_template', e.target.value);
                this.updateActiveChip();
            });

            // 绑定预设按钮点击
            const presets = document.querySelectorAll('.template-chip');
            presets.forEach(chip => {
                chip.addEventListener('click', () => {
                    const template = chip.dataset.template;
                    if (this.templateInput && template) {
                        this.templateInput.value = template;
                        localStorage.setItem('enhance_export_template', template);
                        this.updateActiveChip();
                    }
                });
            });

            this.updateActiveChip();
        }
    }

    /**
     * 更新激活状态的样式
     */
    updateActiveChip() {
        const value = this.getTemplate();
        const chips = document.querySelectorAll('.template-chip');
        chips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.template === value);
        });
    }

    /**
     * 获取模板字符串
     */
    getTemplate() {
        return (this.templateInput?.value || this.defaultTemplate).trim();
    }

    /**
     * 根据模板解析并生成新的文件名
     * @param {string} originalPath - 原始文件路径
     * @param {Object} options - 处理参数 {engineId, scale, ...}
     * @returns {string} 处理后的基础文件名 (不带扩展名)
     */
    generateFileName(originalPath, options) {
        const template = this.getTemplate();
        const baseName = originalPath.split(/[/\\]/).pop().replace(/\.[^/.]+$/, '');

        // 映射引擎 ID 到易读名称
        const engineMap = {
            'cugan': 'CUGAN',
            'esrgan': 'ESRGAN',
            'gfpgan': 'Portrait'
        };

        const modelName = engineMap[options.engineId] || options.engineId;
        const scale = options.scale || 2;

        // 替换占位符
        let newName = template
            .replace('{name}', baseName)
            .replace('{model}', modelName)
            .replace('{scale}', scale);

        return newName;
    }

    /**
     * 计算当前查看区域在原始图片上的像素坐标
     * @param {Object} state - zoomViewer 的状态 {scale, x, y}
     * @param {Object} container - 预览容器 DOM
     * @param {Object} slider - 对比滑块(画布) DOM
     * @param {Object} imgInfo - 原图信息 {width, height}
     */
    calculateCrop(state, container, slider, imgInfo) {
        if (!state || !container || !slider || !imgInfo) return null;

        const containerRect = container.getBoundingClientRect();
        const sliderW = slider.offsetWidth;
        const sliderH = slider.offsetHeight;

        // 1. 计算图片在 Canvas (slider) 中由于 object-fit: contain 产生的实际显示区域
        const imgRatio = imgInfo.width / imgInfo.height;
        const sliderRatio = sliderW / sliderH;

        let displayedW, displayedH, dx = 0, dy = 0;
        if (imgRatio > sliderRatio) {
            displayedW = sliderW;
            displayedH = sliderW / imgRatio;
            dy = (sliderH - displayedH) / 2;
        } else {
            displayedH = sliderH;
            displayedW = sliderH * imgRatio;
            dx = (sliderW - displayedW) / 2;
        }

        // 2. 容器相对于 Canvas 的视口坐标 (反向映射)
        // 容器坐标 (0, 0) 映射到 Canvas 坐标: cX = (0 - state.x) / state.scale
        const viewX = -state.x / state.scale;
        const viewY = -state.y / state.scale;
        const viewW = containerRect.width / state.scale;
        const viewH = containerRect.height / state.scale;

        // 3. 计算可见区域相对于图片显示区域的偏移
        const relX = viewX - dx;
        const relY = viewY - dy;

        // 4. 映射到原始像素
        const pixelScale = imgInfo.width / displayedW;

        let cropX = Math.round(relX * pixelScale);
        let cropY = Math.round(relY * pixelScale);
        let cropW = Math.round(viewW * pixelScale);
        let cropH = Math.round(viewH * pixelScale);

        // 5. 极致防御性限制：确保不超出图片边界
        cropX = Math.max(0, Math.min(cropX, imgInfo.width - 10));
        cropY = Math.max(0, Math.min(cropY, imgInfo.height - 10));

        // 宽度和高度不能超过剩余空间，且最小为 10 像素
        cropW = Math.max(10, Math.min(cropW, imgInfo.width - cropX));
        cropH = Math.max(10, Math.min(cropH, imgInfo.height - cropY));

        console.log('[ExportManager] Crop Calc Result:', {
            state,
            view: { x: viewX, y: viewY, w: viewW, h: viewH },
            result: { x: cropX, y: cropY, width: cropW, height: cropH }
        });

        if (cropW <= 0 || cropH <= 0) return null;

        return { x: cropX, y: cropY, width: cropW, height: cropH };
    }
}

window.EnhanceExportManager = EnhanceExportManager;
