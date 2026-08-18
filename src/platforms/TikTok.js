/**
 * TikTok.js
 */
class TikTokPlatform extends window.BasePlatform {
    constructor() {
        super();
        this.name = 'TikTok';
        this.key = 'tiktok';
        this.patterns = [
            /tiktok\.com/i,
            /v\.tiktok\.com/i
        ];
    }

    getIconClass() {
        return 'fab fa-tiktok';
    }

    getIconSVG() {
        return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>';
    }

    cleanUrl(url) {
        try {
            // TikTok 标准化：提取作者和 ID
            const match = url.match(/(https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+)/i);
            if (match) return match[1];

            // 处理短链接 (跳转交给后端，前端只做基础清理)
            if (url.includes('v.tiktok.com')) return url.split('?')[0];

            return url;
        } catch {
            return url;
        }
    }
}

window.TikTokPlatform = TikTokPlatform;
