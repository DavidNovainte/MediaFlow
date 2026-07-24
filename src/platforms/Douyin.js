/**
 * Douyin.js
 */
class DouyinPlatform extends window.BasePlatform {
    constructor() {
        super();
        this.name = '抖音';
        this.key = 'douyin';
        this.patterns = [
            /douyin\.com|v\.douyin\.com/i
        ];
    }

    getIconClass() {
        return 'fab fa-tiktok'; // 备用 Font Awesome
    }

    // 内联 SVG 图标 (更可靠，不依赖 CDN)
    getIconSVG() {
        return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>';
    }

    cleanUrl(url) {
        if (!url) return url;
        let s = url.trim();

        // 1. 发现稳定视频 ID (15-22位数字)
        const idMatch = s.match(/(\d{15,22})/);
        if (idMatch) {
            return `https://www.douyin.com/video/${idMatch[1]}`;
        }

        // 2. 域名强制替换 (iesdouyin -> douyin)
        if (s.includes('iesdouyin.com')) {
            s = s.replace('iesdouyin.com', 'douyin.com');
        }

        // 3. 移除冗余参数
        return s.split('?')[0];
    }
}

window.DouyinPlatform = DouyinPlatform;
