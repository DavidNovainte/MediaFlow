/**
 * SubtitleVisualOptimizer.js
 * 
 * 智能画面分析与避让算法。
 * 用于检测视频画面中的已有字幕区域或主体，自动调整显示位置。
 */

class SubtitleVisualOptimizer {
    constructor(flow) {
        this.flow = flow;
        this.analyzerCanvas = document.createElement('canvas');
        this.ctx = this.analyzerCanvas.getContext('2d', { willReadFrequently: true });
        this.isAnalyzing = false;
    }

    /**
     * 执行画面避让分析
     * @returns {Promise<number>} 建议的 marginV (百分比)
     */
    async analyzeAndSuggestPosition() {
        if (!this.flow.video || this.flow.video.readyState < 2) {
            console.warn('[SubtitleVisualOptimizer] Video not ready');
            return null;
        }

        this.isAnalyzing = true;
        const video = this.flow.video;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // 设置分析画布尺寸 (降采样以提高性能)
        this.analyzerCanvas.width = 480;
        this.analyzerCanvas.height = Math.round(480 * (vh / vw));
        
        const aw = this.analyzerCanvas.width;
        const ah = this.analyzerCanvas.height;

        // 捕捉当前帧
        this.ctx.drawImage(video, 0, 0, aw, ah);

        // 分析底部区域 (底部 30%)
        const scanHeight = Math.round(ah * 0.35);
        const scanTop = ah - scanHeight;
        const imageData = this.ctx.getImageData(0, scanTop, aw, scanHeight);
        const pixels = imageData.data;

        // 边缘检测算子 (简单的亮度梯度)
        let busyBlocks = []; // 存储繁忙区域的 y 轴分布
        const blockSize = 10;
        const columns = Math.floor(aw / blockSize);
        const rows = Math.floor(scanHeight / blockSize);

        for (let r = 0; r < rows; r++) {
            let rowBusyScore = 0;
            for (let c = 0; c < columns; c++) {
                const score = this.calculateBlockBusyness(pixels, c * blockSize, r * blockSize, aw, blockSize);
                if (score > 45) { // 阈值：高频对比度区域
                    rowBusyScore++;
                }
            }
            // 如果该行有超过 15% 的块是繁忙的，认为存在遮挡物（如硬字幕）
            if (rowBusyScore / columns > 0.15) {
                busyBlocks.push(r);
            }
        }

        this.isAnalyzing = false;

        // 决策：从底向上寻找第一个连续空白区域
        if (busyBlocks.length === 0) return 8; // 默认位置 8%

        // 找到最高的一个繁忙块
        const highestBusyBlock = Math.min(...busyBlocks);
        const highestBusyY = scanTop + (highestBusyBlock * blockSize);
        
        // 计算避让后的 Margin (百分比)
        // 给一点缓冲距离 (10px -> 约 1-2%)
        const buffer = 15;
        const safeY = highestBusyY - buffer;
        
        // 转化为相对于底部的 Margin (ASS 习惯)
        let suggestedMarginV = Math.round(((ah - safeY) / ah) * 100);
        
        // 约束范围 (5% - 40%)
        suggestedMarginV = Math.max(5, Math.min(45, suggestedMarginV));

        console.log(`[SubtitleVisualOptimizer] Detected busy area at block ${highestBusyBlock}. Suggested MarginV: ${suggestedMarginV}%`);
        return suggestedMarginV;
    }

    /**
     * 计算特定网格块的“繁忙程度”（对比度梯度）
     */
    calculateBlockBusyness(pixels, x, y, fullWidth, size) {
        let totalDiff = 0;
        for (let i = 0; i < size - 1; i++) {
            for (let j = 0; j < size - 1; j++) {
                const idx = ((y + j) * fullWidth + (x + i)) * 4;
                const nextIdx = idx + 4;
                const downIdx = idx + (fullWidth * 4);

                // 简单的亮度差异
                const l1 = pixels[idx] * 0.3 + pixels[idx+1] * 0.59 + pixels[idx+2] * 0.11;
                const l2 = pixels[nextIdx] * 0.3 + pixels[nextIdx+1] * 0.59 + pixels[nextIdx+2] * 0.11;
                const l3 = pixels[downIdx] * 0.3 + pixels[downIdx+1] * 0.59 + pixels[downIdx+2] * 0.11;

                totalDiff += Math.abs(l1 - l2) + Math.abs(l1 - l3);
            }
        }
        return totalDiff / (size * size);
    }

    /**
     * 一键优化所有字幕位置
     */
    async autoOptimizeAll() {
        const suggested = await this.analyzeAndSuggestPosition();
        if (suggested !== null) {
            this.flow.styleManager.updateStyle({ marginV: suggested });
            window.app?.showToast?.(`智能避让完成：已自动调整位置至 ${suggested}%`, 'success');
        }
    }
}

window.SubtitleVisualOptimizer = SubtitleVisualOptimizer;
