/**
 * SubtitleUtils.js
 * Common utility functions for subtitle time formatting and calculation.
 */
class SubtitleUtils {
    static translateOrFallback(key, fallback, params) {
        const translated = window.i18n?.t?.(key, params);
        return translated && translated !== key ? translated : fallback;
    }

    static hasTranslatedText(subtitle = {}) {
        return !!String(subtitle?.translatedText || '').trim();
    }

    static getPreferredTtsSource(subtitle = {}) {
        return this.hasTranslatedText(subtitle) ? 'translated' : 'original';
    }

    static getEffectiveTtsSource(subtitle = {}) {
        const explicitSource = subtitle?.ttsSource === 'translated' ? 'translated' : 'original';
        if (subtitle?.ttsSourceUserSet === true) {
            return explicitSource;
        }
        if (explicitSource === 'translated') {
            return 'translated';
        }
        return this.getPreferredTtsSource(subtitle);
    }

    static getSpeechText(subtitle = {}) {
        const source = this.getEffectiveTtsSource(subtitle);
        if (source === 'translated') {
            return String(subtitle?.dubText || subtitle?.translatedText || subtitle?.text || '').trim();
        }

        return String(subtitle?.originalText || subtitle?.text || '').trim();
    }

    static hasDubCaptionText(subtitle = {}) {
        return !!String(subtitle?.dubCaptionText || subtitle?.dubText || '').trim();
    }

    static shouldUseDubCaptionText(subtitle = {}) {
        return this.getEffectiveTtsSource(subtitle) === 'translated'
            && subtitle?.dubCaptionReady === true
            && this.hasDubCaptionText(subtitle);
    }

    static getDisplayTranslatedText(subtitle = {}) {
        if (this.shouldUseDubCaptionText(subtitle)) {
            return String(subtitle?.dubCaptionText || subtitle?.dubText || subtitle?.translatedText || subtitle?.text || '').trim();
        }

        return String(subtitle?.translatedText || '').trim();
    }

    /**
     * Format seconds into HH:MM:SS.mmm
     * @param {number} seconds 
     * @returns {string} 00:00:00.000
     */
    static formatTime(seconds) {
        const date = new Date(seconds * 1000);
        const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    }

    /**
     * Parse HH:MM:SS.mmm or MM:SS.mmm into seconds
     * @param {string} timeStr 
     * @returns {number|null} seconds or null if invalid
     */
    static parseTime(timeStr) {
        if (!timeStr) return null;
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            const [h, m, s] = parts;
            return (parseInt(h) * 3600) + (parseInt(m) * 60) + parseFloat(s);
        }
        if (parts.length === 2) {
            const [m, s] = parts;
            return (parseInt(m) * 60) + parseFloat(s);
        }
        return null;
    }

    /**
     * Estimate comfortable reading duration for text
     * @param {string} text 
     * @returns {number} duration in seconds
     */
    static estimateDuration(text) {
        if (!text) return 1.5;
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const isMostlyChinese = chineseChars / text.length > 0.3;
        const charsPerSec = isMostlyChinese ? 4 : 15;
        const duration = text.length / charsPerSec;
        return Math.max(1.5, Math.min(duration, 10)); // Min 1.5s, max 10s
    }

    /**
     * Check if reading speed is too fast
     * @param {number} duration seconds
     * @param {string} text 
     */
    static calculateSpeed(duration, text) {
        const charCount = text ? text.length : 0;
        if (charCount === 0) return { isOverLimit: false, requiredSpeed: 1, excessChars: 0 };

        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const isMostlyChinese = (chineseChars / charCount > 0.3);
        const charsPerSec = isMostlyChinese ? 4 : 15;

        const requiredDuration = charCount / charsPerSec;
        // speed factor relative to normal speed (1.0)
        // If duration is 0, avoid division by zero
        const requiredSpeed = duration > 0.1 ? (requiredDuration / duration) : 999;

        // We consider > 1.2x normal speed as "Over Limit"
        const isOverLimit = (duration > 0) && (requiredSpeed > 1.2);

        const excessChars = isOverLimit ? Math.ceil((requiredDuration - duration * 1.2) * charsPerSec) : 0;

        return { isOverLimit, requiredSpeed, excessChars };
    }

    /**
     * 计算并返回 CPS (Characters Per Second) 原始数值
     * @param {string} text 
     * @param {number} duration 
     * @returns {number}
     */
    static getCPS(text, duration) {
        if (!text || !duration || duration <= 0) return 0;
        // 滤掉换行符，因为它们不占用阅读时间但占用长度
        const cleanText = text.replace(/\n/g, '');
        return parseFloat((cleanText.length / duration).toFixed(1));
    }

    /**
     * 根据语言获取 CPS 警告阈值
     * @param {string} text 
     * @returns {number} 
     */
    static getCPSLimit(text) {
        if (!text) return 20;
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        // 如果中文占比超过 30%，则认为是中文主导，阈值设为 8-10 (参考行业标准)
        if (chineseChars / text.length > 0.3) return 10;
        // 英文/西文通常阈值为 15-20
        return 20;
    }
}

window.SubtitleUtils = SubtitleUtils;
