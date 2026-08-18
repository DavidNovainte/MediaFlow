/**
 * PixelCompareManager.js
 * 专门负责管理专业 A/B 对比模式的状态与参数双缓冲
 */

class PixelCompareManager {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.mode = 'standard'; // 'standard' (Orig vs Result) or 'pro' (A vs B)
        this.activeConfig = 'A'; // 'A' or 'B'

        // 参数双缓冲
        this.configs = {
            'A': null,
            'B': null
        };
    }

    /**
     * 切换对比模式
     */
    setMode(mode) {
        this.mode = mode;
        console.log('[PixelCompareManager] Mode switched to:', mode);

        // 如果切到专业模式，初始化配置
        if (mode === 'pro') {
            const currentOptions = this.controller.uiManager.getCompressOptions();
            if (!this.configs.A) this.configs.A = { ...currentOptions };
            if (!this.configs.B) this.configs.B = { ...currentOptions };

            document.getElementById('pro-settings-tabs')?.classList.remove('hidden');

            // [NEW] 自动切到分屏显示模式
            this.controller.uiManager.setPreviewMode('split');
            // 更新工具栏按钮状态 (假设预览工具栏有对应的按钮)
            const splitBtn = document.getElementById('btn-view-split');
            const sliderBtn = document.getElementById('btn-view-slider');
            if (splitBtn) splitBtn.classList.add('active');
            if (sliderBtn) sliderBtn.classList.remove('active');
        } else {
            document.getElementById('pro-settings-tabs')?.classList.add('hidden');
            this.controller.uiManager.setPreviewMode('slider');
        }

        this.controller.preview();
    }


    /**
     * 切换当前编辑的配置组
     */
    switchConfig(configId) {
        if (this.activeConfig === configId) return;

        // 1. 保存当前配置
        this.configs[this.activeConfig] = this.controller.uiManager.getCompressOptions();

        // 2. 切换标识
        this.activeConfig = configId;

        // 3. 应用新配置到 UI
        const targetConfig = this.configs[configId];
        if (targetConfig) {
            this.controller.uiManager.setCompressOptions(targetConfig);
        }

        // 4. 更新 Tab 状态
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.config === configId);
        });

        console.log('[PixelCompareManager] Switched to Config:', configId);
    }

    /**
     * 同步当前 UI 状态到活动配置
     * 在 preview() 前调用，确保用户的最新修改被捕获
     */
    syncActiveConfig() {
        this.configs[this.activeConfig] = this.controller.uiManager.getCompressOptions();
    }


    /**
     * 获取预览所需的对比配置
     * 在专业模式下，左侧预览 Original 区域可能显示配置 A，右侧显示配置 B
     */
    getPreviewConfigs() {
        if (this.mode === 'standard') return null;

        return {
            A: this.configs.A,
            B: this.configs.B
        };
    }

}

window.PixelCompareManager = PixelCompareManager;
