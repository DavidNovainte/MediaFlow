/**
 * SubtitleUIManager.js
 * 
 * 字幕前端调度器 (Orchestrator)
 * 在重构后，原本 1500行的核心逻辑已拆分至 ui/ 目录下的小模块。
 * 本类只负责组装和透传 Flow 上下文。
 */

class SubtitleUIManager {
    constructor(flow) {
        this.flow = flow;

        // 初始化所有独立的 UI 子模块
        this.transform = new window.SubtitleUITransform(flow);
        this.layout = new window.SubtitleUILayout(flow);
        this.search = new window.SubtitleUISearch(flow);
        this.settings = new window.SubtitleUISettings(flow);
        this.inject = new window.SubtitleUIInject(flow);

        // 保留对基础通用 API 的快速访问（兼容部分老代码）
        this.base = new window.SubtitleUIBase(flow);
    }

    /**
     * DOM 挂载完成后，由 flow.init() 统一发起的初始化动作
     */
    bindElements() {
        // 依次拉起各子模块的事件绑定
        this.transform.bindEvents();
        this.layout.bindEvents();
        this.search.bindEvents();
        this.settings.bindEvents();
        this.inject.bindEvents();

        this.initInspectorToggle();

        this.restorePersistedState();
    }

    // ----------------------------------------------------
    // 以下为向后兼容的胶水层 API，供外部老代码 (SubtitleFlow 等) 直接调用
    // ----------------------------------------------------

    showProgress(title) {
        this.base.showProgress(title);
    }

    updateProgress(percent, text) {
        this.base.updateProgress(percent, text);
    }

    hideProgress() {
        this.base.hideProgress();
    }

    updateInputModeUI(mode) {
        this.settings.updateInputModeUI(mode);
    }

    onSubtitleModeChange(mode) {
        this.settings.onSubtitleModeChange(mode);
    }

    updateLengthStrategyUI() {
        this.settings.updateLengthStrategyUI();
    }

    updateAIButtonText() {
        // 胶水方法：目前 AI 按钮文本由 Flow 逻辑直接维护或通过 settings 子模块更新
        // 如果子模块有对应逻辑，则调用：
        if (this.settings && typeof this.settings.updateAIButtonText === 'function') {
            this.settings.updateAIButtonText();
        }
    }

    activateTab(tabId, options) {
        this.layout?.activateTab?.(tabId, options);
    }

    toggleSafeAreas(force) {
        this.transform.toggleSafeAreas(force);
    }

    getInspectorState() {
        return this.flow.preferenceManager?.getUIState?.() || {
            inspectorVisible: true,
            activeTab: 'tab-general'
        };
    }

    persistInspectorState(partialState = {}) {
        this.flow.preferenceManager?.setUIState?.(partialState);
    }

    restorePersistedState() {
        const mainLayout = document.querySelector('.subtitle-main-layout');
        const { inspectorVisible = true, activeTab = 'tab-general' } = this.getInspectorState();

        if (mainLayout) {
            mainLayout.classList.toggle('inspector-active', inspectorVisible !== false);
        }

        this.layout?.applySavedLayoutDimensions?.();

        this.layout?.applyPersistedTabState?.(activeTab);
    }

    // ----------------- 小工具 (无需单独建类) -----------------
    /**
     * DevTools 快捷开启按钮
     */
    initInspectorToggle() {
        const toggleInspectorBtn = document.getElementById('subtitle-btn-toggle-inspector');
        if (toggleInspectorBtn) {
            toggleInspectorBtn.addEventListener('click', () => {
                // Toggle 'inspector-active' on the main layout container
                const mainLayout = document.querySelector('.subtitle-main-layout');
                if (mainLayout) {
                    mainLayout.classList.toggle('inspector-active');
                    const visible = mainLayout.classList.contains('inspector-active');
                    this.persistInspectorState({
                        inspectorVisible: visible
                    });
                    // Sync grid columns immediately so video reclaims the full width
                    this.layout?.applySavedLayoutDimensions?.();
                    // Force a resize event to recalculate video / monitor layout
                    requestAnimationFrame(() => {
                        window.dispatchEvent(new Event('resize'));
                    });
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                }
            });
        }

        // 原本 DevTools 快捷键 (为了不丢失该隐藏功能)

        // F12 唤出 DevTools
    }
}

window.SubtitleUIManager = SubtitleUIManager;
