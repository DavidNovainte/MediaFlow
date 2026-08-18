/**
 * FacebookPlatform.js
 * Facebook 视频/Reel 识别与处理
 */
class FacebookPlatform extends window.BasePlatform {
    constructor() {
        super();
        this.name = 'Facebook';
        this.key = 'facebook';
        this.patterns = [
            /facebook\.com/i,
            /fb\.watch/i,
            /fb\.com/i
        ];
    }

    getIconClass() {
        return 'fab fa-facebook';
    }

    getIconSVG() {
        return '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
    }

    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.origin}${urlObj.pathname}`;
        } catch {
            return url;
        }
    }
}

window.FacebookPlatform = FacebookPlatform;
