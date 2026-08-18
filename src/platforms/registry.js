/**
 * registry.js
 * 平台注册中心，负责分发识别 URL 对应的平台实例
 */
class PlatformRegistry {
    constructor() {
        this.platforms = [];
    }

    /**
     * 初始化并注册所有已知平台
     */
    init() {
        this.register(new window.YouTubePlatform());
        this.register(new window.TikTokPlatform());
        this.register(new window.DouyinPlatform());
        this.register(new window.BilibiliPlatform());
        this.register(new window.InstagramPlatform());
        this.register(new window.FacebookPlatform()); // 🆕 Added Facebook support

        // 其他平台 (Instagram, Facebook, Bilibili等可以在以后轻松添加)
        // 只需要在这里 New 一个实例即可
    }

    register(platform) {
        this.platforms.push(platform);
    }

    /**
     * 根据 URL 查找对应的平台
     * @param {string} url 
     * @returns {BasePlatform|null}
     */
    detect(url) {
        if (!url) return null;
        return this.platforms.find(p => p.match(url)) || null;
    }

    /**
     * 根据平台 key 直接获取平台对象
     * @param {string} key - 平台标识符 (如 'douyin', 'tiktok')
     * @returns {BasePlatform|null}
     */
    getByKey(key) {
        if (!key) return null;
        return this.platforms.find(p => p.key === key.toLowerCase()) || null;
    }

    /**
     * 获取所有受支持的平台列表
     */
    getAll() {
        return this.platforms;
    }
}

// 全局单例
window.platformRegistry = new PlatformRegistry();
