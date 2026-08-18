/**
 * 时间线缩放性能优化辅助类
 * 负责在用户连续缩放（拖动滑块或 Ctrl+滚轮滚动）时，管理缩放状态，
 * 提供简易化渲染占位，并在缩放停止后平滑恢复原状。
 */
class EditorTimelineZoomOptimizer {
    constructor(flow) {
        this.flow = flow;
        this.isZooming = false;
        this.zoomEndTimeout = null;
        this.timelineBody = null;
    }

    /**
     * 初始化，获取 DOM 元素引用
     */
    init() {
        this.timelineBody = document.getElementById('editor-timeline-body');
    }

    /**
     * 标记进入缩放状态，并设置防抖定时器，在缩放结束时恢复渲染
     */
    startZooming() {
        if (this.zoomEndTimeout) {
            clearTimeout(this.zoomEndTimeout);
        } else {
            this.isZooming = true;
            if (this.timelineBody) {
                this.timelineBody.classList.add('is-zooming');
            }
        }

        // 延迟 150ms 认为缩放动作已停止
        this.zoomEndTimeout = setTimeout(() => {
            this.zoomEndTimeout = null;
            this.isZooming = false;
            if (this.timelineBody) {
                this.timelineBody.classList.remove('is-zooming');
            }
            // 缩放结束，触发一次完整的重新渲染以显示真实的视频缩略图和音频波形
            this.flow.renderCurrentState?.();
        }, 150);
    }

    /**
     * 销毁实例，清理定时器和状态
     */
    destroy() {
        if (this.zoomEndTimeout) {
            clearTimeout(this.zoomEndTimeout);
            this.zoomEndTimeout = null;
        }
        this.isZooming = false;
        if (this.timelineBody) {
            this.timelineBody.classList.remove('is-zooming');
        }
    }

    /**
     * 生成缩放期间的极简视频缩略图占位 HTML 结构
     * 规避高开销的多帧图片渲染以提升排版速度
     * @returns {string}
     */
    buildZoomingVideoFilmstrip() {
        return '<span class="editor-clip-filmstrip editor-clip-filmstrip-zooming" aria-hidden="true"></span>';
    }

    /**
     * 生成缩放期间的极简音频波形占位 HTML 结构
     * 仅包含中央基准线，规避复杂的 SVG 波形路径绘制
     * @returns {string}
     */
    buildZoomingWaveform() {
        return `
            <canvas class="editor-clip-waveform-canvas editor-clip-waveform-zooming" width="120" height="36" aria-hidden="true"></canvas>
        `;
    }
}

window.EditorTimelineZoomOptimizer = EditorTimelineZoomOptimizer;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineZoomOptimizer;
}
