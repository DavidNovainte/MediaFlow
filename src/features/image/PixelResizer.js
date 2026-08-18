/**
 * PixelResizer.js
 * 处理预览面板和设置面板之间的可拖动布局调整
 */
class PixelResizer {
    constructor() {
        this.resizer = null;
        this.settingsPanel = null;
        this.layoutContainer = null;

        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 320; // 默认宽度

        // 绑定方法以便移除事件监听
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
    }

    /**
     * 延迟初始化 - 在 DOM 准备好后调用
     */
    init() {
        this.resizer = document.getElementById('layout-resizer');
        this.settingsPanel = document.querySelector('.pixelflow-settings-panel');
        this.layoutContainer = document.querySelector('.pixelflow-layout');

        if (!this.resizer || !this.settingsPanel || !this.layoutContainer) {
            console.warn('[PixelResizer] 未找到必需的 DOM 元素，无法初始化。');
            return false;
        }

        // 绑定鼠标事件
        this.resizer.addEventListener('mousedown', this.onMouseDown.bind(this));

        // 恢复保存的宽度
        const savedWidth = localStorage.getItem('pixelflow-settings-width');
        if (savedWidth) {
            this.updateWidth(parseInt(savedWidth, 10));
        }

        console.log('[PixelResizer] 初始化完成');
        return true;
    }

    onMouseDown(e) {
        e.preventDefault();
        this.isResizing = true;
        this.startX = e.clientX;
        this.startWidth = this.settingsPanel.getBoundingClientRect().width;

        this.resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // 防止选中文字

        // 绑定 document 事件
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    onMouseMove(e) {
        if (!this.isResizing) return;

        // 向左拖动 增大 右侧面板宽度
        const dx = this.startX - e.clientX;
        let newWidth = this.startWidth + dx;

        // 约束条件
        const containerWidth = this.layoutContainer.getBoundingClientRect().width;
        const maxW = containerWidth - 350; // 预留预览空间
        const minW = 280;

        newWidth = Math.max(minW, Math.min(maxW, newWidth));

        this.updateWidth(newWidth);
    }

    onMouseUp() {
        if (!this.isResizing) return;

        this.isResizing = false;
        this.resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // 保存宽度偏好
        const currentWidth = this.settingsPanel.getBoundingClientRect().width;
        localStorage.setItem('pixelflow-settings-width', Math.round(currentWidth));

        // 清理事件监听
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
    }

    updateWidth(width) {
        if (this.settingsPanel) {
            this.settingsPanel.style.width = `${width}px`;
            this.settingsPanel.style.flexBasis = `${width}px`;
            this.settingsPanel.style.flexGrow = '0';
            this.settingsPanel.style.flexShrink = '0';
        }
    }
}

// 导出到全局
window.PixelResizer = PixelResizer;
