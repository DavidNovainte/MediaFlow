/**
 * AudioWaveformLoader.js
 * 负责解析视频音频流，提取波形峰值数据
 */
class AudioWaveformLoader {
    constructor() {
        this.cache = new Map();
        this.audioCtx = null;
    }

    async getPeaks(filePath, samplesPerSec = 100) {
        const cacheKey = `${filePath}_${samplesPerSec}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        try {
            console.log('[AudioWaveformLoader] Requesting peaks from backend:', filePath);

            // 调用后端高效提取（基于 FFmpeg，无内存限制）
            const result = await window.mediaflow.video.extractAudio({
                input: filePath,
                samplesPerSec: samplesPerSec
            });

            if (result.success && result.peaks) {
                this.cache.set(cacheKey, result.peaks);
                return result.peaks;
            } else {
                throw new Error(result.error || 'Operation failed');
            }
        } catch (e) {
            console.error('[AudioWaveformLoader] Extraction failed:', e);
            return null;
        }
    }

    /**
     * 废弃：现在由后端 handleExtractAudio 完成
     * 保留空实现以防外部引用
     */
    extractPeaks() {
        return null;
    }

    clearCache() {
        this.cache.clear();
    }
}

window.AudioWaveformLoader = AudioWaveformLoader;
