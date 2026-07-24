/**
 * YouTube.js
 */
class YouTubePlatform extends window.BasePlatform {
    constructor() {
        super();
        this.name = 'YouTube';
        this.key = 'youtube';
        this.patterns = [
            /youtube\.com|youtu\.be/i,
            /youtube\.com\/watch\?v=/i,
            /youtube\.com\/playlist\?list=/i,
            /youtube\.com\/shorts/i
        ];
    }

    /**
     * 如果 YouTube 网页结构发生剧烈变化导致后端失效，
     * 您可以在这里直接编写 JS 爬虫逻辑来修复，而无需更新主程序！
     */
    /*
    async getInfo(url) {
        console.log("Using custom frontend extractor for YouTube...");
        // 示例：fetch(url) -> parse HTML -> return { success: true, title: '...', ... }
        return await super.getInfo(url); 
    }
    */

    getIconClass() {
        return 'fab fa-youtube';
    }

    getIconSVG() {
        return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M23 9.5c-.2-1.5-1-2.6-2.4-2.8C18 6.4 12 6.4 12 6.4s-6 0-8.6.3C2 6.9 1.2 8 1 9.5c-.3 2.5-.3 5 0 7.5.2 1.5 1 2.6 2.4 2.8 2.6.3 8.6.3 8.6.3s6 0 8.6-.3c1.4-.2 2.2-1.3 2.4-2.8.3-2.5.3-5 0-7.5zM10 15V9.5l5.2 2.8L10 15z"/></svg>';
    }

    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            // 保持 v 参数和 list 参数，移除 tracing/si 等参数
            const params = new URLSearchParams();
            if (urlObj.searchParams.has('v')) params.set('v', urlObj.searchParams.get('v'));
            if (urlObj.searchParams.has('list')) params.set('list', urlObj.searchParams.get('list'));

            const search = params.toString();
            return `${urlObj.origin}${urlObj.pathname}${search ? '?' + search : ''}`;
        } catch {
            return url;
        }
    }
}

window.YouTubePlatform = YouTubePlatform;
