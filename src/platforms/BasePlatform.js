/**
 * BasePlatform.js
 * 所有下载平台的基类，定义统一接口
 */
class BasePlatform {
    constructor() {
        this.name = 'Generic';
        this.key = 'generic';
        this.patterns = [];
    }

    /**
     * 判断 URL 是否属于该平台
     * @param {string} url 
     * @returns {boolean}
     */
    match(url) {
        return this.patterns.some(pattern => pattern.test(url));
    }

    /**
     * 清理/规格化 URL，移除追踪参数等
     * @param {string} url 
     * @returns {string}
     */
    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            // 某些平台通用的清理逻辑
            return urlObj.origin + urlObj.pathname + urlObj.search;
        } catch {
            return url;
        }
    }

    /**
     * 获取平台图标类名 (FontAwesome)
     * @returns {string}
     */
    getIconClass() {
        return 'fab fa-play-circle';
    }

    /**
     * 针对特定平台的显示名称
     * @returns {string}
     */
    getDisplayName() {
        return this.name;
    }

    /**
     * 获取视频信息 (核心：允许插件重写解析逻辑)
     * @param {string} url 
     * @returns {Promise<Object>}
     */
    async getInfo(url) {
        // 默认调用主进程的通用解析逻辑 (yt-dlp 等)
        return await window.mediaflow.video.getInfo(url);
    }

    /**
     * 获取播放列表信息
     * @param {string} url 
     * @param {number} limit 
     * @returns {Promise<Object>}
     */
    async getPlaylistInfo(url, limit = 1000) {
        return await window.mediaflow.video.getPlaylistInfo(url, limit);
    }
}

window.BasePlatform = BasePlatform;
