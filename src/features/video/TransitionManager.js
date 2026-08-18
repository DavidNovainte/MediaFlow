/**
 * TransitionManager - 视频转场特效管理器
 * 负责管理转场配置、UI 初始化及预览动画驱动
 */
const TransitionManager = {
    // 转场配置列表
    transitions: [
        { id: 'none', labelKey: 'creator.batch.transitionNone', xfade: 'none', css: '' },
        { id: 'fade', labelKey: 'creator.batch.transitionFade', xfade: 'fade', css: 'tp-fade' },
        { id: 'wiperight', labelKey: 'creator.batch.transitionWipeRight', xfade: 'wiperight', css: 'tp-wiperight' },
        { id: 'wipeleft', labelKey: 'creator.batch.transitionWipeLeft', xfade: 'wipeleft', css: 'tp-wipeleft' },
        { id: 'wipeup', labelKey: 'creator.batch.transitionWipeUp', xfade: 'wipeup', css: 'tp-wipeup' },
        { id: 'wipedown', labelKey: 'creator.batch.transitionWipeDown', xfade: 'wipedown', css: 'tp-wipedown' },
        { id: 'slideright', labelKey: 'creator.batch.transitionSlideRight', xfade: 'slideright', css: 'tp-slideright' },
        { id: 'slideleft', labelKey: 'creator.batch.transitionSlideLeft', xfade: 'slideleft', css: 'tp-slideleft' },
        { id: 'slideup', labelKey: 'creator.batch.transitionSlideUp', xfade: 'slideup', css: 'tp-slideup' },
        { id: 'slidedown', labelKey: 'creator.batch.transitionSlideDown', xfade: 'slidedown', css: 'tp-slidedown' },
        { id: 'circlecrop', labelKey: 'creator.batch.transitionCircle', xfade: 'circlecrop', css: 'tp-circlecrop' },
        { id: 'radial', labelKey: 'creator.batch.transitionRadial', xfade: 'radial', css: 'tp-radial' },
        { id: 'zoomin', labelKey: 'creator.batch.transitionZoomIn', xfade: 'zoomin', css: 'tp-zoomin' },
        { id: 'pixelize', labelKey: 'creator.batch.transitionPixelize', xfade: 'pixelize', css: 'tp-pixelize' },
        { id: 'hblur', labelKey: 'creator.batch.transitionHBlur', xfade: 'hblur', css: 'tp-hblur' }
    ],

    /**
     * 初始化下拉选择器
     * @param {string} selectId 下拉框 ID
     */
    initSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        // 清空现有选项
        select.innerHTML = '';

        // 分类添加
        const groups = {
            basic: { label: window.i18n?.t('creator.transition.categories.basic') || 'Basic', items: ['none', 'fade'] },
            wipe: { label: window.i18n?.t('creator.transition.categories.wipe') || 'Wipe', items: ['wiperight', 'wipeleft', 'wipeup', 'wipedown'] },
            slide: { label: window.i18n?.t('creator.transition.categories.slide') || 'Slide', items: ['slideright', 'slideleft', 'slideup', 'slidedown'] },
            shape: { label: window.i18n?.t('creator.transition.categories.shape') || 'Shape & Special', items: ['circlecrop', 'radial', 'zoomin', 'pixelize', 'hblur'] }
        };

        for (const [, group] of Object.entries(groups)) {
            const optGroup = document.createElement('optgroup');
            optGroup.label = group.label;

            group.items.forEach(id => {
                const config = this.transitions.find(t => t.id === id);
                if (config) {
                    const option = document.createElement('option');
                    option.value = config.id;
                    option.setAttribute('data-i18n', config.labelKey);
                    // 使用国际化转换，如果不可用则回退
                    option.textContent = window.i18n?.t(config.labelKey) || this._getFallbackLabel(id);
                    optGroup.appendChild(option);
                }
            });
            select.appendChild(optGroup);
        }

        // 重新运行 i18n 翻译新加入的选项
        if (window.i18n && typeof window.i18n.translatePage === 'function') {
            window.i18n.translatePage(select);
        }
    },

    /**
     * 更新属性面板中的转场设置 (由时间轴选中触发)
     * @param {Object} transition 转场数据 {id, duration}
     */
    updatePanel(transition) {
        const select = document.getElementById('prop-transition-type');
        const durationInput = document.getElementById('prop-transition-duration');
        if (!select || !transition) return;

        select.value = transition.id || 'none';
        if (durationInput) {
            durationInput.value = transition.duration || 1.0;
        }

        // 更新预览 (如果有预览容器)
        this.updatePreview('prop-transition-preview', select.value);
    },

    /**
     * 更新预览组件状态
     * @param {string} containerId 预览容器 ID
     * @param {string} transitionId 选中的转场效果 ID
     */
    updatePreview(containerId, transitionId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 1. 确保容器内有必要的图层结构 (片段 A 和 片段 B)
        if (!container.querySelector('.tp-layer-1')) {
            container.innerHTML = `
                <div class="tp-layer tp-layer-1"></div>
                <div class="tp-layer tp-layer-2"></div>
            `;
        }

        // 2. 移除所有旧的效果类
        this.transitions.forEach(t => {
            if (t.css) container.classList.remove(t.css);
        });
        container.classList.remove('tp-animating');

        const config = this.transitions.find(t => t.id === transitionId);
        
        // 3. 处理 "无转场" 情况
        if (!config || transitionId === 'none') {
            container.classList.add('hidden');
            // 如果在悬浮窗内，也隐藏外部浮窗
            document.getElementById('batch-merge-transition-preview-floating')?.classList.add('hidden');
            return;
        }

        // 4. 显示容器并启动动画
        container.classList.remove('hidden');
        // 如果是批量预览容器，显示外部浮窗
        if (containerId === 'batch-merge-transition-preview') {
            document.getElementById('batch-merge-transition-preview-floating')?.classList.remove('hidden');
        }
        
        // 强制重绘以确保动画从头开始
        void container.offsetWidth; 

        if (config.css) {
            container.classList.add(config.css);
            container.classList.add('tp-animating');
        }
    },

    /**
     * 获取 FFmpeg 的 xfade 键值
     */
    getXfadeKey(id) {
        const config = this.transitions.find(t => t.id === id);
        return config ? config.xfade : 'none';
    },

    _getFallbackLabel(id) {
        const labels = {
            'none': window.i18n?.t('creator.transition.names.none') || 'No Transition',
            'fade': window.i18n?.t('creator.transition.names.fade') || 'Fade (Dissolve)',
            'wiperight': window.i18n?.t('creator.transition.names.wiperight') || 'Wipe Right',
            'wipeleft': window.i18n?.t('creator.transition.names.wipeleft') || 'Wipe Left',
            'wipeup': window.i18n?.t('creator.transition.names.wipeup') || 'Wipe Up',
            'wipedown': window.i18n?.t('creator.transition.names.wipedown') || 'Wipe Down',
            'slideright': window.i18n?.t('creator.transition.names.slideright') || 'Slide Right',
            'slideleft': window.i18n?.t('creator.transition.names.slideleft') || 'Slide Left',
            'slideup': window.i18n?.t('creator.transition.names.slideup') || 'Slide Up',
            'slidedown': window.i18n?.t('creator.transition.names.slidedown') || 'Slide Down',
            'circlecrop': window.i18n?.t('creator.transition.names.circlecrop') || 'Circle Crop',
            'radial': window.i18n?.t('creator.transition.names.radial') || 'Radial Wipe',
            'zoomin': window.i18n?.t('creator.transition.names.zoomin') || 'Zoom In',
            'pixelize': window.i18n?.t('creator.transition.names.pixelize') || 'Pixelize',
            'hblur': window.i18n?.t('creator.transition.names.hblur') || 'Horizontal Blur'
        };
        return labels[id] || id;
    }
};

// 导出模块 (支持多种环境)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransitionManager;
} else {
    window.TransitionManager = TransitionManager;
}
