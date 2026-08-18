/**
 * Instagram.js
 */
class InstagramPlatform extends window.BasePlatform {
    constructor() {
        super();
        this.name = 'Instagram';
        this.key = 'instagram';
        this.patterns = [
            /instagram\.com/i
        ];
    }

    getIconClass() {
        return 'fab fa-instagram';
    }

    getIconSVG() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
    }

    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            // 保留 /p/ID/ 或 /reels/ID/ 或 /tv/ID/
            // 移除 igsh, utm_source 等
            return `${urlObj.origin}${urlObj.pathname}`;
        } catch {
            return url;
        }
    }
}

window.InstagramPlatform = InstagramPlatform;
