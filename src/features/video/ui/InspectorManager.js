/**
 * MediaFlow - InspectorManager
 * 负责侧边栏（检查器）的基础交互、标签切换与状态同步
 */

class InspectorManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.currentRotate = 0;
        this.currentMirror = 'none';
    }

    getDefaultSectionIds() {
        return this.uiManager.mode === 'edit'
            ? ['section-inspector-toolbox']
            : ['section-empty-guide'];
    }

    /**
     * 初始化：设置标签页与头部控制
     */
    init() {
        this.setupInspectorTabs();
        this.setupProHeader();
    }

    /**
     * 设置检查器标签页点击
     */
    setupInspectorTabs() {
        const { inspectorTabs } = this.uiManager.elements;
        if (!inspectorTabs || !inspectorTabs.length) return;

        inspectorTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTabId = tab.dataset.tab;
                this.switchTab(targetTabId);
            });
        });
    }

    /**
     * 切换标签页 (底层实现)
     */
    switchTab(tabId) {
        const { inspectorTabs, tabPanels } = this.uiManager.elements;
        const normalizedId = tabId.startsWith('tab-') ? tabId : `tab-${tabId}`;

        inspectorTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId || t.dataset.tab === normalizedId));
        tabPanels.forEach(p => p.classList.toggle('active', p.id === tabId || p.id === normalizedId));
    }

    /**
     * 设置顶部工具栏
     */
    setupProHeader() {
        const {
            btnSelectPath, btnToggleInspector, headerRenderBtn,
            inspectorRenderBtn, btnQuickRotate, btnQuickMirror, btnQuickCrop
        } = this.uiManager.elements;

        btnSelectPath?.addEventListener('click', () => this.uiManager.app.executeTool('select-output-path'));
        btnToggleInspector?.addEventListener('click', () => this.toggleInspector());
        headerRenderBtn?.addEventListener('click', () => this.uiManager.app.executeTool('render'));
        inspectorRenderBtn?.addEventListener('click', () => this.uiManager.app.executeTool('render'));

        btnQuickRotate?.addEventListener('click', () => this.executeQuickRotate());
        btnQuickMirror?.addEventListener('click', () => this.executeQuickMirror());
        btnQuickCrop?.addEventListener('click', () => this.uiManager.focusTool('crop'));

        // 绑定所有工具面板内部的“返回”按钮 (限制在当前容器内)
        document.querySelectorAll('#page-creator .section-back-btn').forEach(btn => {
            btn.addEventListener('click', () => this.focusTool(null));
        });
    }

    /**
     * 执行循环旋转 (+90)
     */
    executeQuickRotate() {
        this.currentRotate = (this.currentRotate + 90) % 360;
        this.applyCurrentTransform();
    }

    /**
     * 执行镜像切换 (左右镜像切换)
     */
    executeQuickMirror() {
        this.currentMirror = this.currentMirror === 'h' ? 'none' : 'h';
        this.applyCurrentTransform();
    }

    /**
     * 应用当前的变换状态到预览器
     */
    applyCurrentTransform() {
        this.uiManager.app.previewHandler?.applyTransform({
            rotate: this.currentRotate,
            mirror: this.currentMirror
        });
    }

    /**
     * 切换检查器可见性
     */
    toggleInspector() {
        const { mainLayout } = this.uiManager.elements;
        if (!mainLayout) return;

        mainLayout.classList.toggle('inspector-active');
        this.syncButtonState();
    }

    /**
     * 同步切换按钮文字与状态
     */
    syncButtonState() {
        const { mainLayout, btnToggleInspector } = this.uiManager.elements;
        if (!mainLayout || !btnToggleInspector) return;

        const isActive = mainLayout.classList.contains('inspector-active');
        btnToggleInspector.classList.toggle('active', isActive);

        const btnText = btnToggleInspector.querySelector('span');
        if (btnText) {
            btnText.textContent = isActive ?
                (window.i18n?.t('creator.hideInspector') || 'Hide Inspector') :
                (window.i18n?.t('creator.showInspector') || 'Show Inspector');
        }
    }

    /**
     * 聚焦并显示工具的详细配置
     */
    focusTool(toolId) {
        this.currentToolId = toolId;

        if (!toolId) {
            // 如果已经在媒体页，不要切回项目页
            const activeTab = document.querySelector('.inspector-tab.active')?.dataset.tab;
            if (activeTab !== 'tab-media') {
                this.switchTab('tab-project');
            }

            this.showOnlySections(this.getDefaultSectionIds());
            this.syncButtonState();

            // 🚀 确保精修模式侧边栏工具箱刷新（根据音视频状态动态禁用）
            this.uiManager.quickTools?.renderInInspector?.();

            // 返回时 clearing 所有工具卡片的激活状态
            this.uiManager.quickTools?.clearActiveCard?.();

            // 联动预览关闭
            this.uiManager.app.previewHandler?.updateVerticalPreview?.(false);
            this.uiManager.app.previewHandler?.updateCropPreview?.(false);
            return;
        }

        // 1. 确定标签路由并强制显示标签按钮
        let targetTab = 'tab-properties';
        const projectTools = ['vertical', 'compress', 'convert', 'gif', 'watermark'];
        if (projectTools.includes(toolId)) {
            targetTab = 'tab-project';
        }

        // 确保目标标签按钮不被隐藏 (比如属性页默认是 hidden)
        const tabBtnId = targetTab === 'tab-project' ? 'tab-btn-project' : 'tab-btn-properties';
        document.getElementById(tabBtnId)?.classList.remove('hidden');

        // 2. 自动切换到对应标签
        this.switchTab(targetTab);

        // 3. 构造需要显示的 Section 列表
        let sectionIds = [];
        switch (toolId) {
        case 'vertical':
            sectionIds = ['section-vertical'];
            // 自动开启画面预览，由于 DOM 渲染时机，加一点延迟
            setTimeout(() => this.uiManager.toolSettings?._triggerVerticalPreview(), 100);
            break;
        case 'compress': sectionIds = ['section-compress', 'section-advanced-codec']; break;
        case 'convert': sectionIds = ['section-convert', 'section-advanced-codec']; break;
        case 'gif': sectionIds = ['section-gif']; break;
        case 'watermark': sectionIds = ['section-watermark']; break;
        case 'audio-enhance': sectionIds = ['prop-section-audio']; break;
        case 'separation': sectionIds = ['prop-section-separation']; break;
        case 'speed': sectionIds = ['prop-section-speed']; break;
        case 'crop':
            sectionIds = ['prop-section-crop'];
            setTimeout(() => this.uiManager.toolSettings?._triggerCropPreview(), 100);
            break;
        }

        // 4. 执行过滤显示
        this.showOnlySections(sectionIds);

        // 🆕 5. 动态过滤快捷预设芯片 (防止在压缩面板显示音频预设)
        this.updatePresetVisibility(toolId);

        // 6. 确保检查器处于开启状态
        this.uiManager.elements.mainLayout?.classList.add('inspector-active');
        this.syncButtonState();
    }

    /**
     * 根据当前工具过滤“高级设置”中的预设芯片
     */
    updatePresetVisibility(toolId) {
        const chipSection = document.querySelector('#page-creator .preset-group-container');
        if (!chipSection) return;

        // 用户反馈：压缩面板不需要这些预设，主要是格式转换（转码）时常用
        if (toolId === 'convert') {
            chipSection.style.display = ''; // 转换面板显示
        } else {
            chipSection.style.display = 'none'; // 其他面板（如压缩、竖屏等）隐藏
        }
    }

    /**
     * 在检查器中仅显示指定的配置块列表
     */
    showOnlySections(sectionIds) {
        // 1. 获取所有配置区块 (限制在当前容器内)
        const allSections = document.querySelectorAll('#page-creator .settings-section');

        allSections.forEach(sec => {
            const isTarget = sectionIds.includes(sec.id);
            const isGuide = sec.id === 'section-empty-guide' || sec.id === 'section-empty-guide-properties';

            if (isTarget) {
                sec.style.display = 'block';
            } else if (isGuide) {
                sec.style.display = 'none';
            } else {
                sec.style.display = 'none';
            }
        });

        // 2. 额外处理非 Section 的面包屑/动作条
        const globalActionPanel = document.querySelector('.action-panel-pro');
        if (globalActionPanel) {
            globalActionPanel.style.display = sectionIds.length === 0 ? 'block' : 'none';
        }
    }

    /**
     * 恢复显示所有配置块
     */
    showAllSections() {
        const sections = document.querySelectorAll('#page-creator .settings-section');
        sections.forEach(sec => sec.style.display = '');

        const globalActionPanel = document.querySelector('.action-panel-pro');
        if (globalActionPanel) globalActionPanel.style.display = '';

        document.getElementById('tab-btn-project')?.classList.remove('hidden');
        document.getElementById('tab-btn-properties')?.classList.remove('hidden');
    }
}

window.InspectorManager = InspectorManager;
