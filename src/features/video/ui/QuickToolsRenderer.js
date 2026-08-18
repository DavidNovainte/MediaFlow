/**
 * MediaFlow - QuickToolsRenderer
 * 负责渲染快捷处理模式下的工具磁贴网格
 */

class QuickToolsRenderer {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * 获取快捷工具原始数据
     */
    getQuickToolsData() {
        return [
            {
                id: 'vertical',
                titleKey: 'creator.tools.vertical',
                descKey: 'creator.tools.verticalDesc',
                icon: 'fa-solid fa-mobile-screen'
            },
            {
                id: 'compress',
                titleKey: 'creator.tools.compress',
                descKey: 'creator.tools.compressDesc',
                icon: 'fa-solid fa-file-zipper'
            },
            {
                id: 'convert',
                titleKey: 'creator.tools.convert',
                descKey: 'creator.tools.convertDesc',
                icon: 'fa-solid fa-shuffle'
            },
            {
                id: 'gif',
                titleKey: 'creator.tools.gif',
                descKey: 'creator.tools.gifDesc',
                icon: 'fa-solid fa-images'
            },
            {
                id: 'audio-enhance',
                titleKey: 'creator.tools.audioEnhance',
                descKey: 'creator.tools.audioEnhanceDesc',
                icon: 'fa-solid fa-microphone-lines'
            },
            {
                id: 'separation',
                titleKey: 'creator.tools.separation',
                descKey: 'creator.tools.separationDesc',
                icon: 'fa-solid fa-scissors',
                isNew: true
            }
        ];
    }

    /**
     * 执行网格渲染
     */
    render() {
        const { quickToolsGrid } = this.uiManager.elements;
        if (!quickToolsGrid) return;

        const tools = this.getQuickToolsData();
        const t = (key) => window.i18n ? window.i18n.t(key) : key;

        quickToolsGrid.innerHTML = tools.map(tool => `
            <div class="quick-card" id="quick-tool-${tool.id}">
                ${tool.isNew ? '<span class="badge-new">NEW</span>' : ''}
                <i class="${tool.icon}"></i>
                <h4 data-i18n="${tool.titleKey}">${t(tool.titleKey)}</h4>
                <p data-i18n="${tool.descKey}">${t(tool.descKey)}</p>
            </div>
        `).join('');

        // 绑定点击事件
        tools.forEach(tool => {
            const el = document.getElementById(`quick-tool-${tool.id}`);
            if (el) {
                el.onclick = () => {
                    // 移除所有卡片的激活态，再给当前卡片设置
                    quickToolsGrid.querySelectorAll('.quick-card').forEach(c => c.classList.remove('active'));
                    el.classList.add('active');
                    this.uiManager.focusTool(tool.id);
                };
            }
        });
    }

    /**
     * 清除所有卡片的激活状态（例如：点击「返回」时调用）
     */
    clearActiveCard() {
        const { quickToolsGrid } = this.uiManager.elements;
        quickToolsGrid?.querySelectorAll('.quick-card').forEach(c => c.classList.remove('active'));
    }

    /**
     * 在检查器侧边栏渲染紧凑型工具磁贴
     */
    renderInInspector() {
        const toolbox = document.getElementById('inspector-toolbox');
        if (!toolbox) return;

        const tools = this.getQuickToolsData();
        const t = (key) => window.i18n ? window.i18n.t(key) : key;

        toolbox.innerHTML = tools.map(tool => `
            <div class="toolbox-item" id="toolbox-item-${tool.id}" 
                data-i18n="[title]${tool.descKey}" title="${t(tool.descKey)}">
                <i class="${tool.icon}"></i>
                <span data-i18n="${tool.titleKey}">${t(tool.titleKey)}</span>
            </div>
        `).join('');

        // 绑定点击事件
        tools.forEach(tool => {
            const el = document.getElementById(`toolbox-item-${tool.id}`);
            if (el) {
                el.onclick = () => {
                    this.uiManager.focusTool(tool.id);
                };
            }
        });
    }

    /**
     * 根据媒体类型更新工具可用性
     */
    updateToolState(isAudio) {
        const tools = this.getQuickToolsData();
        tools.forEach(tool => {
            // 更新底部大卡片
            const gridEl = document.getElementById(`quick-tool-${tool.id}`);
            // 更新侧边栏小磁贴
            const boxEl = document.getElementById(`toolbox-item-${tool.id}`);

            const videoOnlyTools = ['vertical', 'gif', 'crop'];
            const shouldDisable = isAudio && videoOnlyTools.includes(tool.id);

            [gridEl, boxEl].forEach(el => {
                if (!el) return;
                el.classList.toggle('disabled', shouldDisable);
                el.style.opacity = shouldDisable ? '0.4' : '1';
                el.style.pointerEvents = shouldDisable ? 'none' : 'auto';
            });
        });
    }
}

window.QuickToolsRenderer = QuickToolsRenderer;
