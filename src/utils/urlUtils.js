/**
 * urlUtils.js - 媒体路径与 URL 转换工具
 */

class urlUtils {
    /**
     * 将本地磁盘路径转换为规范的 media-file 协议 URL
     * @param {string} filePath - 本地物理路径 (如 C:\Users\Media\video.mp4)
     * @returns {string} - 规范化的 URL (如 media-file:///C:/Users/Media/video.mp4)
     */
    static pathToMediaUrl(filePath) {
        if (!filePath) return '';
        if (typeof filePath !== 'string') return '';

        // 如果已经是协议格式，直接返回
        if (filePath.startsWith('media-file://')) return filePath;

        // 1. 统一将反斜杠转换为正斜杠
        let normalizedPath = filePath.replace(/\\/g, '/');

        // 2. 对路径段进行编码，但保留盘符冒号和正斜杠
        // Windows 盘符处理 (如 C:/ -> C:/)
        const encodedPath = normalizedPath
            .split('/')
            .map((segment, index) => {
                // 第一段可能是盘符（如 "C:"），保留不编码
                if (index === 0 && /^[a-zA-Z]:$/.test(segment)) return segment;
                return encodeURIComponent(segment);
            })
            .join('/');

        // 3. 补全三斜杠前缀，确保 Electron 能够最准确地解析出磁盘路径
        return `media-file:///${encodedPath}`;
    }

    /**
     * [备用] 将 Blob/File 对象转换为 URL
     * 如果是字符串则走协议逻辑，如果是对象则走 createObjectURL
     */
    static getMediaSrc(file) {
        if (!file) return '';
        if (typeof file === 'string') return this.pathToMediaUrl(file);
        if (file.path) return this.pathToMediaUrl(file.path);
        
        // 原色 File/Blob 对象
        if (file instanceof File || file instanceof Blob) {
            return file.__cachedUrl || (file.__cachedUrl = URL.createObjectURL(file));
        }
        
        return '';
    }

    /**
     * Resolve a disk path for <img>/<video> display.
     * Prefers media-file://; falls back to data URL via IPC for small assets / canvas sampling.
     * @param {string} filePath
     * @param {{ allowDataUrlFallback?: boolean }} [opts]
     * @returns {Promise<string>}
     */
    static async resolveDisplayUrl(filePath, opts = {}) {
        if (!filePath) return '';
        if (typeof filePath !== 'string') return '';

        if (
            filePath.startsWith('media-file:') ||
            filePath.startsWith('data:') ||
            filePath.startsWith('blob:') ||
            filePath.startsWith('http://') ||
            filePath.startsWith('https://')
        ) {
            return filePath;
        }

        const mediaUrl = this.pathToMediaUrl(filePath);
        if (mediaUrl) return mediaUrl;

        if (opts.allowDataUrlFallback !== false && window.mediaflow?.fs?.readAsDataUrl) {
            try {
                const res = await window.mediaflow.fs.readAsDataUrl(filePath);
                if (res?.success && res.dataUrl) return res.dataUrl;
            } catch (e) {
                void e;
            }
        }
        return '';
    }
}

// 挂载到 window 供全局使用
window.urlUtils = urlUtils;
if (typeof module !== 'undefined') {
    module.exports = urlUtils;
}
