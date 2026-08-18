/**
 * EnhanceInfoManager.js - AI 画质增强预览信息管理器
 * 负责底部信息条的显示与更新
 */

class EnhanceInfoManager {
    constructor(controller) {
        this.controller = controller;
        this.infoPanel = null;
        this.resText = null;
        this.zoomText = null;
    }

    /**
     * 初始化
     */
    init() {
        // 这些元素将在 enhance.html 更新后存在
        this.infoPanel = document.getElementById('enhance-info-bar');
        this.resText = document.getElementById('enhance-res-info');
        this.zoomText = document.getElementById('enhance-zoom-info');
    }

    /**
     * 更新分辨率信息
     * @param {Object} originalInfo - 原图信息 {width, height}
     * @param {number} scale - 当前设置的放大倍数
     */
    updateResolution(originalInfo, scale) {
        if (!this.resText || !originalInfo) return;

        const targetW = originalInfo.width * scale;
        const targetH = originalInfo.height * scale;

        // 定义常用分辨率标签
        const getTag = (w) => {
            if (w >= 3840) return '4K UHD';
            if (w >= 1920) return '1080p FHD';
            if (w >= 1280) return '720p HD';
            return 'SD';
        };

        const originalTag = getTag(originalInfo.width);
        const targetTag = getTag(targetW);

        this.resText.innerHTML = `
            <span class="info-tag origin">${originalTag}</span> ${originalInfo.width}x${originalInfo.height} 
            <i class="fas fa-arrow-right info-arrow"></i> 
            <span class="info-tag target">${targetTag}</span> <b>${targetW}x${targetH}</b>
        `;

        this.show();
    }

    /**
     * 更新缩放百分比
     * @param {number} scale - 当前画布缩放倍率
     */
    updateZoomText(scale) {
        if (!this.zoomText) return;
        this.zoomText.textContent = `${Math.round(scale * 100)}%`;
    }

    /**
     * 显示信息栏
     */
    show() {
        this.infoPanel?.classList.remove('hidden');
    }

    /**
     * 隐藏信息栏
     */
    hide() {
        this.infoPanel?.classList.add('hidden');
    }

    /**
     * 清空信息
     */
    reset() {
        if (this.resText) this.resText.innerHTML = '';
        this.hide();
    }
}

// 导出到全局
window.EnhanceInfoManager = EnhanceInfoManager;
