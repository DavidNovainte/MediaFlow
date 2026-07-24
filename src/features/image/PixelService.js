/**
 * PixelService.js
 * 处理图片压缩、抠图和预览缓存的核心业务逻辑
 */

class PixelService {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.previewCache = new Map();
    }

    /**
     * 生成并缓存预览
     */
    async preview(file, options) {
        if (!file.path) {
            console.warn('[PixelService] File path not available for preview');
            return { success: false, error: 'File path missing' };
        }

        // 生成缓存键
        const cacheKey = `${file.path}_${JSON.stringify(options)}`;

        // 检查缓存
        if (this.previewCache.has(cacheKey)) {
            return this.previewCache.get(cacheKey);
        }

        try {
            const result = await window.mediaflow?.compress.preview(file.path, options);

            // 存入缓存 (LRU: 只保留最近 10 个)
            if (result?.success) {
                if (this.previewCache.size >= 10) {
                    const firstKey = this.previewCache.keys().next().value;
                    this.previewCache.delete(firstKey);
                }
                this.previewCache.set(cacheKey, result);
            }
            return result;
        } catch (error) {
            console.error('[PixelService] Preview error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取单个文件信息
     */
    async getInfo(path) {
        if (!window.mediaflow?.compress.getInfo) return null;
        try {
            const info = await window.mediaflow.compress.getInfo(path);
            // Backend may return { success:false } for video / unsupported files
            if (info && info.success === false) {
                console.warn('[PixelService] getInfo rejected:', info.error || info.message, path);
                return null;
            }
            return info;
        } catch (error) {
            console.error('[PixelService] Get info error:', error);
            return null;
        }
    }

    /**
     * 批量压缩
     */
    async compressBatch(filePaths, outputDir, options, aiCacheMap = {}) {
        if (!window.mediaflow?.compress.batch) throw new Error('Backend not available');
        return await window.mediaflow.compress.batch(filePaths, outputDir, options, aiCacheMap);
    }

    /**
     * 单张压缩（保存）
     */
    async compressSingle(inputPath, outputPath, options) {
        if (!window.mediaflow?.compress.single) throw new Error('Backend not available');
        return await window.mediaflow.compress.single(inputPath, outputPath, options);
    }

    /**
     * AI 一键抠图
     */
    async removeBackground(inputPath, outputPath, options = {}) {
        if (!window.mediaflow?.image.removeBackground) throw new Error('AI backend not available');
        return await window.mediaflow.image.removeBackground(inputPath, outputPath, options);
    }

    /**
     * 清理缓存
     */
    clearCache() {
        this.previewCache.clear();
    }
}

window.PixelService = PixelService;
