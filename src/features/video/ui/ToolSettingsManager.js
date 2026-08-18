/**
 * MediaFlow - ToolSettingsManager
 * 专门负责管理各个视频处理工具（竖屏转换、裁剪、变速等）的具体参数调节逻辑与实时预览
 */

class ToolSettingsManager {
    constructor(uiManager) {
        this.uiManager = uiManager;

        // 裁剪状态
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.originalAspectRatio = 1;
        this.currentLockRatio = 1;
    }

    /**
     * 初始化：绑定所有工具特定的事件监听
     */
    init() {
        this.setupCropEvents();
        this.setupVerticalEvents();
        this.setupSpeedEvents();
    }


    /**
     * 当媒体加载时更新裁剪 UI 基准值
     */
    updateCropUIFromMedia(width, height) {
        const { propCropW, propCropH, propCropOrigRes, propCropRatio } = this.uiManager.elements;
        this.originalWidth = width;
        this.originalHeight = height;
        this.originalAspectRatio = width / height;
        this.currentLockRatio = this.originalAspectRatio;

        if (propCropW) propCropW.value = width;
        if (propCropH) propCropH.value = height;
        if (propCropOrigRes) propCropOrigRes.textContent = `${width} × ${height}`;

        this._autoMatchCropPreset(propCropRatio);
    }

    _autoMatchCropPreset(el) {
        if (!el) return;
        const tolerance = 0.05;
        const presets = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9, '4:3': 4 / 3 };
        let found = 'custom';
        for (const [key, val] of Object.entries(presets)) {
            if (Math.abs(val - this.originalAspectRatio) < tolerance) {
                found = key;
                break;
            }
        }
        el.value = found;
    }

    /**
     * 裁剪事件绑定
     */
    setupCropEvents() {
        const { propCropRatio, propCropW, propCropH, btnLockCropRatio, btnApplyCrop } = this.uiManager.elements;
        if (!propCropRatio || !propCropW || !propCropH) return;

        propCropRatio.addEventListener('change', () => {
            this._handleCropRatioChange();
            this._triggerCropPreview();
        });
        btnLockCropRatio?.addEventListener('click', () => btnLockCropRatio.classList.toggle('active'));
        propCropW.addEventListener('input', () => {
            this._syncCropDimensions('w');
            this._triggerCropPreview();
        });
        propCropH.addEventListener('input', () => {
            this._syncCropDimensions('h');
            this._triggerCropPreview();
        });
        btnApplyCrop?.addEventListener('click', () => this.uiManager.app.videoProcessor?.cropVideo());
    }

    /**
     * 变速事件绑定 (实时预览模式)
     */
    setupSpeedEvents() {
        const { speedSlider, speedValue } = this.uiManager.elements;
        if (!speedSlider) return;

        speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            if (speedValue) speedValue.textContent = `${speed.toFixed(1)}x`;
            this.uiManager.app.timelineManager?.updateSelectedSegmentSpeed(speed);
        });
    }

    _handleCropRatioChange() {
        const { propCropRatio, propCropW, propCropH } = this.uiManager.elements;
        const ratio = propCropRatio.value;
        if (ratio === 'custom' || !this.originalWidth) return;

        let targetRatio;
        if (ratio === 'orig') {
            targetRatio = this.originalAspectRatio;
        } else {
            const [rw, rh] = ratio.split(':').map(Number);
            targetRatio = rw / rh;
        }

        if (!targetRatio) return;

        let newW, newH;
        if (targetRatio > this.originalAspectRatio) {
            newW = this.originalWidth;
            newH = Math.round(newW / targetRatio);
        } else {
            newH = this.originalHeight;
            newW = Math.round(newH * targetRatio);
        }

        propCropW.value = newW % 2 === 0 ? newW : newW - 1;
        propCropH.value = newH % 2 === 0 ? newH : newH - 1;
        this.currentLockRatio = targetRatio;
    }

    _syncCropDimensions(trigger) {
        const { propCropRatio, propCropW, propCropH, btnLockCropRatio } = this.uiManager.elements;
        if (propCropRatio.value !== 'custom') propCropRatio.value = 'custom';

        if (btnLockCropRatio?.classList.contains('active')) {
            const w = parseInt(propCropW.value);
            const h = parseInt(propCropH.value);
            if (trigger === 'w' && w > 0) {
                const nh = Math.round(w / this.currentLockRatio);
                propCropH.value = nh % 2 === 0 ? nh : nh - 1;
            } else if (trigger === 'h' && h > 0) {
                const nw = Math.round(h * this.currentLockRatio);
                propCropW.value = nw % 2 === 0 ? nw : nw - 1;
            }
        }
    }

    /**
     * 竖屏转换高级事件绑定
     */
    setupVerticalEvents() {
        // 滑杆 ID → 对应徽章输入框 ID 的映射
        const sliderBadgePairs = [
            { sliderId: 'vertical-blur-radius', badgeId: 'vertical-blur-value' },
            { sliderId: 'vertical-content-scale', badgeId: 'vertical-scale-value' },
            { sliderId: 'vertical-content-scale-x', badgeId: 'vertical-scale-x-value' },
            { sliderId: 'vertical-content-scale-y', badgeId: 'vertical-scale-y-value' },
            { sliderId: 'vertical-content-offset-x', badgeId: 'vertical-offset-x-value' },
            { sliderId: 'vertical-content-offset', badgeId: 'vertical-offset-value' }
        ];

        const update = () => {
            // 1. 滑杆 → 输入框同步（input.value 直接赋值）
            sliderBadgePairs.forEach(({ sliderId, badgeId }) => {
                const sliderEl = document.getElementById(sliderId);
                const badgeEl = document.getElementById(badgeId);
                if (sliderEl && badgeEl && document.activeElement !== badgeEl) {
                    // 只在徽章输入框未获焦时同步，避免打断用户输入
                    badgeEl.value = sliderEl.value;
                }
            });
            // 2. 触发画面预览刷新
            this._triggerVerticalPreview();
        };

        // 滑杆事件绑定（所有非颜色、非样式的控件）
        const sliderIds = ['vertical-bg-style', 'vertical-bg-color', 'vertical-bg-color2',
            'vertical-blur-radius', 'vertical-content-scale',
            'vertical-content-scale-x', 'vertical-content-scale-y',
            'vertical-content-offset-x', 'vertical-content-offset'];
        sliderIds.forEach(id => {
            document.getElementById(id)?.addEventListener('input', update);
            document.getElementById(id)?.addEventListener('change', update);
        });

        // 输入框 → 滑杆 双向同步绑定
        sliderBadgePairs.forEach(({ sliderId, badgeId }) => {
            const sliderEl = document.getElementById(sliderId);
            const badgeEl = document.getElementById(badgeId);
            if (!sliderEl || !badgeEl) return;

            const syncToSlider = () => {
                const raw = parseFloat(badgeEl.value);
                if (isNaN(raw)) return;
                // 限制在滑杆范围内
                const clamped = Math.max(
                    parseFloat(sliderEl.min || '-Infinity'),
                    Math.min(parseFloat(sliderEl.max || 'Infinity'), raw)
                );
                sliderEl.value = clamped;
                badgeEl.value = clamped; // Update badge value to clamped value
                this._triggerVerticalPreview();
            };

            // 实时同步（输入时）
            badgeEl.addEventListener('input', syncToSlider);
            // Enter 键确认
            badgeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { badgeEl.blur(); syncToSlider(); } });
        });

        // 动态控制显隐 (模糊 vs 纯色 vs 渐变)
        const styleSelect = document.getElementById('vertical-bg-style');
        const colorCtrl = document.getElementById('vertical-color-ctrl');
        const color2Wrapper = document.getElementById('vertical-color2-wrapper');
        const blurCtrl = document.getElementById('vertical-blur-ctrl');

        // 1号色
        const colorInput = document.getElementById('vertical-bg-color');
        const colorValue = document.getElementById('vertical-color-value');
        const colorBox = document.getElementById('vertical-color-box');

        // 2号色
        const colorInput2 = document.getElementById('vertical-bg-color2');
        const colorValue2 = document.getElementById('vertical-color2-value');
        const colorBox2 = document.getElementById('vertical-color2-box');

        const updateVisibility = () => {
            const style = styleSelect?.value;
            if (colorCtrl) colorCtrl.style.display = (style === 'color' || style === 'gradient') ? '' : 'none';
            if (color2Wrapper) color2Wrapper.style.display = (style === 'gradient') ? '' : 'none';
            if (blurCtrl) blurCtrl.style.display = (style === 'blur') ? '' : 'none';
            update();
        };

        styleSelect?.addEventListener('change', updateVisibility);

        // 颜色同步逻辑
        colorInput?.addEventListener('input', (e) => {
            const val = e.target.value.toUpperCase();
            if (colorValue) colorValue.textContent = val;
            if (colorBox) colorBox.style.background = val;
        });

        colorInput2?.addEventListener('input', (e) => {
            const val = e.target.value.toUpperCase();
            if (colorValue2) colorValue2.textContent = val;
            if (colorBox2) colorBox2.style.background = val;
        });

        // 初始化显隐状态
        updateVisibility();

        // 执行按钮
        this.uiManager.elements.btnMakeVertical?.addEventListener('click', () =>
            this.uiManager.app.videoProcessor?.makeVertical());
    }

    _triggerVerticalPreview() {
        if (!this.uiManager.app.previewHandler) return;

        const getV = (id) => document.getElementById(id)?.value;
        // 等比缩放作为基准，独立宽/高缩放在此基础上微调
        const baseScale = parseFloat(getV('vertical-content-scale') || '100') / 100;
        const rawScaleX = parseFloat(getV('vertical-content-scale-x') || '100') / 100;
        const rawScaleY = parseFloat(getV('vertical-content-scale-y') || '100') / 100;

        this.uiManager.app.previewHandler.updateVerticalPreview(true, {
            bgStyle: getV('vertical-bg-style') || 'blur',
            bgColor: getV('vertical-bg-color') || '#000000',
            bgColor2: getV('vertical-bg-color2') || '#16213E',
            blurRadius: parseInt(getV('vertical-blur-radius') || '20'),
            // 最终 scaleX/scaleY 已经包含了 baseScale
            scaleX: baseScale * rawScaleX * 100,
            scaleY: baseScale * rawScaleY * 100,
            offsetX: parseFloat(getV('vertical-content-offset-x') || '0'),
            offset: parseFloat(getV('vertical-content-offset') || '0')
        });
    }

    _triggerCropPreview() {
        if (!this.uiManager.app.previewHandler) return;

        const { propCropW, propCropH } = this.uiManager.elements;
        if (!propCropW || !propCropH) return;

        this.uiManager.app.previewHandler.updateCropPreview(true, {
            targetW: parseInt(propCropW.value),
            targetH: parseInt(propCropH.value)
        });
    }

    /**
     * 显示特定类型的属性面板 (回填数据)
     */
    showProperties(type, data) {
        const { btnPropertiesTab } = this.uiManager.elements;

        // 1. 确保属性标签可见并激活
        btnPropertiesTab?.classList.remove('hidden');
        this.uiManager.inspector.switchTab('tab-properties');

        // 2. 根据类型显示具体的 Section
        let sectionIds = [];
        if (type === 'video') {
            sectionIds = ['prop-section-speed', 'prop-section-crop'];
        } else if (type === 'audio') {
            sectionIds = ['prop-section-audio'];
        } else if (type === 'transition') {
            sectionIds = ['prop-section-transition'];
        }

        // 执行显隐过滤，这会自动隐藏属性页面的“空白引导”
        this.uiManager.showOnlySections(sectionIds);

        // 3. 回填数据
        if (type === 'video' && data?.speed) this.updateSpeedUI(data.speed);
    }

    updateSpeedUI(speed) {
        const { speedSlider, speedValue } = this.uiManager.elements;
        if (speedSlider) speedSlider.value = speed;
        if (speedValue) speedValue.textContent = `${speed.toFixed(1)}x`;
    }

    /**
     * 更新剪辑时间输入框
     */
    updateClipInputs(startStr, endStr) {
        const { clipStart, clipEnd } = this.uiManager.elements;
        if (clipStart && document.activeElement !== clipStart) clipStart.value = startStr;
        if (clipEnd && document.activeElement !== clipEnd) clipEnd.value = endStr;
    }
}

window.ToolSettingsManager = ToolSettingsManager;
