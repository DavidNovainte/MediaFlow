/**
 * SubtitleUIBase.js
 * 
 * 基础 UI 管理类，提供公用的 DOM 查询与遮罩显隐方法，
 * 被其他具体的 UI 管理类（如 Transform, Layout 等）继承或引用。
 */

class SubtitleUIBase {
    constructor(flow) {
        this.flow = flow;
    }

    getRoot() {
        return this.flow?.getRoot?.() || document.getElementById('page-subtitle') || document;
    }

    getElement(id) {
        const root = this.getRoot();
        return root.querySelector?.(`#${id}`) || document.getElementById(id);
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    /**
     * 获取常用 DOM 元素（需子类用到时临时拿）
     */
    get elements() {
        return {
            video: this.getElement('subtitle-video-preview'),
            container: this.getElement('video-container'),
            scaler: this.getElement('video-content-scaler'),
            progressOverlay: this.getElement('progress-overlay'),
            progressTitle: this.getElement('progress-title'),
            progressText: this.getElement('progress-text'),
            progressBarFlow: this.getElement('progress-fill')
        };
    }

    /**
     * 显示全局 Loading 进度遮罩
     * @param {string} title 主标题
     * @param {string} statusText 状态文本 (可选)
     */
    showProgress(title, statusText = '') {
        const { progressOverlay, progressTitle, progressText, progressBarFlow } = this.elements;
        if (!progressOverlay) return;

        if (progressTitle && title) {
            progressTitle.innerText = title;
        }

        // Reset
        if (progressBarFlow) {
            progressBarFlow.style.width = '0%';
            progressBarFlow.style.transition = 'none';
            setTimeout(() => {
                progressBarFlow.style.transition = 'width 0.3s ease';
            }, 50);
        }

        if (progressText) {
            progressText.innerText = statusText ? `${statusText} (0%)` : '0%';
        }
        progressOverlay.classList.remove('hidden');
        progressOverlay.style.display = 'flex';
    }

    /**
     * 更新 Loading 进度遮罩
     * @param {number} percent 0-100
     * @param {string} text 显示文本
     */
    updateProgress(percent, text) {
        const { progressText, progressBarFlow } = this.elements;
        if (progressText && text) {
            progressText.innerText = `${text} (${Math.round(percent)}%)`;
        }
        if (progressBarFlow) {
            progressBarFlow.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        }
    }

    /**
     * 隐藏 Loading 遮罩
     */
    hideProgress() {
        const { progressOverlay } = this.elements;
        if (progressOverlay) {
            progressOverlay.classList.add('hidden');
            setTimeout(() => {
                if (progressOverlay.classList.contains('hidden')) {
                    progressOverlay.style.display = 'none';
                }
            }, 300); // Wait for fade out animation
        }
    }
}

window.SubtitleUIBase = SubtitleUIBase;
