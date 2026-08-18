/**
 * EmptyState.js
 * 通用空状态组件
 * 用于在列表为空时显示美观的占位提示
 */
class EmptyState {
    /**
     * @param {Object} options
     * @param {string} options.containerId - 容器 ID (可选，如果传入且存在，render时会自动 append)
     * @param {string} options.icon - 装饰图标 (SVG/Emoji)
     * @param {string} options.title - 主标题
     * @param {string} options.desc - 描述
     * @param {Object} [options.action] - 按钮配置 { text, onClick, icon }
     */
    constructor(options = {}) {
        this.options = options;
        this.element = this._create();
    }

    _create() {
        const wrapper = document.createElement('div');
        wrapper.className = 'empty-state-wrapper';

        let actionBtnHtml = '';
        if (this.options.action) {
            const label = this.options.action.text || '';
            // Keep icon + label as direct flex children (no extra wrappers that
            // global `.empty-state svg` rules can blow up to 48px).
            actionBtnHtml = `
                <button type="button" class="btn-empty-action" aria-label="${String(label).replace(/"/g, '&quot;')}">
                    ${this.options.action.icon || ''}
                    <span class="btn-empty-action-label">${label}</span>
                </button>
            `;
        }

        // desc may contain simple <br>; strip other tags if ever passed raw
        const desc = String(this.options.desc || '').replace(/<br\s*\/?>/gi, '<br>');
        wrapper.innerHTML = `
            <div class="empty-state-icon">${this.options.icon || ''}</div>
            <h3 class="empty-state-title"></h3>
            <p class="empty-state-desc"></p>
            ${actionBtnHtml}
        `;
        wrapper.querySelector('.empty-state-title').textContent = this.options.title || '';
        wrapper.querySelector('.empty-state-desc').innerHTML = desc;

        // Bind click event
        if (this.options.action && this.options.action.onClick) {
            const btn = wrapper.querySelector('.btn-empty-action');
            if (btn) {
                btn.addEventListener('click', this.options.action.onClick);
            }
        }

        return wrapper;
    }

    /**
     * 渲染到指定容器
     * @param {HTMLElement|string} target - 目标容器或选择器
     */
    render(target) {
        const container = (typeof target === 'string')
            ? document.querySelector(target)
            : (target || document.getElementById(this.options.containerId));

        if (container) {
            container.innerHTML = ''; // Clear content
            container.appendChild(this.element);

            // Add entry animation
            this.element.animate([
                { opacity: 0, transform: 'translateY(10px)' },
                { opacity: 1, transform: 'translateY(0)' }
            ], {
                duration: 400,
                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                fill: 'forwards'
            });
        } else {
            console.warn('[EmptyState] Target container not found');
        }
    }

    /**
     * 获取 DOM 元素 (用于手动插入)
     */
    getElement() {
        return this.element;
    }
}

window.EmptyState = EmptyState;
