/**
 * EnhanceZoomViewer.js - AI 画质增强预览区域缩放与漫游管理器
 * 负责处理画布级的交互（缩放、拖拽、同步）
 */

class EnhanceZoomViewer {
    constructor(controller) {
        this.controller = controller;
        this.container = null;
        this.comparison = null;
        this.handle = null;
        this.afterImg = null;

        this.isPanning = false;
        this.isSliding = false;

        this.state = {
            scale: 1,
            x: 0,
            y: 0,
            percent: 50
        };

        this.startX = 0;
        this.startY = 0;
    }

    /**
     * 初始化交互事件
     */
    init(elements) {
        this.container = elements.previewContainer;
        this.comparison = elements.comparison;
        this.handle = elements.comparisonHandle;
        this.afterImg = elements.afterContainer || elements.afterImg;

        if (!this.container) return;

        // 防止重复绑定
        if (this.eventsBound) return;
        this.bindEvents();
        this.eventsBound = true;

        // 初始自适应
        setTimeout(() => this.reset(), 100);
    }

    /**
     * 绑定事件
     */
    /**
     * 绑定事件 (仅负责平移和缩放)
     */
    bindEvents() {
        // 1. 画布拖拽 (Pan)
        this.container.addEventListener('mousedown', (e) => {
            // 记录点击时间
            this.mouseDownTime = Date.now();
            this.isPanning = true;
            this.container.classList.add('panning');
            this.container.style.cursor = 'grabbing';
            this.startX = e.clientX - this.state.x;
            this.startY = e.clientY - this.state.y;
        });

        // 2. 全局鼠标移动监控
        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.updatePan(e);
            }
        });

        // 3. 鼠标松开
        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.container.classList.remove('panning');
            this.container.style.cursor = 'grab';
        });

        // 5. 滚轮缩放 (以鼠标中心点缩放)
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.updateZoom(e);
        }, { passive: false });
    }



    /**
     * 更新画布平移
     */
    updatePan(e) {
        this.state.x = e.clientX - this.startX;
        this.state.y = e.clientY - this.startY;
        this.apply();
    }

    /**
     * 更新缩放
     */
    updateZoom(e) {
        const delta = -e.deltaY;
        const factor = delta > 0 ? 1.1 : 0.9;
        this.zoom(factor, e.clientX, e.clientY);
    }

    /**
     * 执行缩放逻辑
     * @param {number} factor - 缩放系数
     * @param {number} mouseX - 鼠标 X 坐标（可选，若提供则以此为中心）
     * @param {number} mouseY - 鼠标 Y 坐标（可选）
     */
    zoom(factor, mouseX = null, mouseY = null) {
        const oldScale = this.state.scale;
        const newScale = Math.max(0.1, Math.min(oldScale * factor, 10));

        if (mouseX !== null && mouseY !== null) {
            // 计算中心点偏移实现向心缩放
            const rect = this.container.getBoundingClientRect();
            const relX = mouseX - rect.left - this.state.x;
            const relY = mouseY - rect.top - this.state.y;

            this.state.x -= relX * (newScale / oldScale - 1);
            this.state.y -= relY * (newScale / oldScale - 1);
        }

        this.state.scale = newScale;
        this.apply();
    }

    /**
     * Content size from image natural dims OR video videoWidth/Height.
     * Video preview previously collapsed to white because naturalWidth was 0.
     */
    getContentSize() {
        const beforeImg = this.container?.querySelector?.('#enhance-before-img');
        const beforeVideo = this.container?.querySelector?.('#enhance-before-video');
        const videoVisible = beforeVideo && !beforeVideo.classList.contains('hidden');

        if (videoVisible && beforeVideo.videoWidth > 0) {
            return { w: beforeVideo.videoWidth, h: beforeVideo.videoHeight };
        }
        if (beforeImg && !beforeImg.classList.contains('hidden') && beforeImg.naturalWidth > 0) {
            return { w: beforeImg.naturalWidth, h: beforeImg.naturalHeight };
        }
        // Fallback: use container aspect so UI never collapses to 0×0
        const cw = this.container?.clientWidth || 800;
        const ch = this.container?.clientHeight || 600;
        return { w: Math.max(320, Math.round(cw * 0.9)), h: Math.max(180, Math.round(ch * 0.75)) };
    }

    /**
     * 应用样式变换
     */
    apply() {
        if (!this.comparison) return;

        // 1. 同步内容尺寸 (图片 natural* 或 视频 video*)
        const { w, h } = this.getContentSize();
        if (w > 0 && h > 0) {
            this.comparison.style.width = `${w}px`;
            this.comparison.style.height = `${h}px`;
        }

        // 2. 应用画布变换 (使用 CSS 变量提高性能)
        this.comparison.style.setProperty('--zoom-scale', this.state.scale);
        this.comparison.style.setProperty('--zoom-x', `${this.state.x}px`);
        this.comparison.style.setProperty('--zoom-y', `${this.state.y}px`);

        // 通知控制器更新信息条的缩放百分比
        if (this.controller.infoManager) {
            this.controller.infoManager.updateZoomText(this.state.scale);
        }
    }

    /**
     * 重置视图 (自适应居中)
     */
    reset() {
        if (!this.container || !this.comparison) return;

        // 获取内部可用空间 (不含边框)
        const containerW = this.container.clientWidth;
        const containerH = this.container.clientHeight;
        if (containerW === 0 || containerH === 0) return;

        const { w: contentW, h: contentH } = this.getContentSize();

        // 计算 Fit 比例 (最大不超容器)
        const scaleW = containerW / contentW;
        const scaleH = containerH / contentH;
        let fitScale = Math.min(scaleW, scaleH);

        if (fitScale > 1) fitScale = 1;
        fitScale *= 0.96;

        this.state.scale = fitScale;

        // 居中计算
        this.state.x = (containerW - contentW * fitScale) / 2;
        this.state.y = (containerH - contentH * fitScale) / 2;

        this.apply();
    }

    /**
     * 快捷重置到 100% 居中
     */
    reset100() {
        if (!this.container || !this.comparison) return;
        const containerW = this.container.clientWidth;
        const containerH = this.container.clientHeight;
        const { w: contentW, h: contentH } = this.getContentSize();

        this.state.scale = 1;
        this.state.x = (containerW - contentW) / 2;
        this.state.y = (containerH - contentH) / 2;
        this.apply();
    }

    zoomIn() {
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        const rect = this.container.getBoundingClientRect();
        this.zoom(1.2, rect.left + cw / 2, rect.top + ch / 2);
    }

    zoomOut() {
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        const rect = this.container.getBoundingClientRect();
        this.zoom(0.8, rect.left + cw / 2, rect.top + ch / 2);
    }
}

// 导出到全局
window.EnhanceZoomViewer = EnhanceZoomViewer;
