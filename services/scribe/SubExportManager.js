/**
 * MediaFlow - SubExportManager
 * 音视频转录 - 字幕与文本导出管理
 */

class SubExportManager {
    constructor() { }

    /**
     * 导出为 SRT 字幕格式
     * @param {Array} segments - Whisper 返回的 segments 数组
     * @returns {string} SRT 格式字符串
     */
    exportToSRT(segments) {
        return segments.map((seg, index) => {
            const startTime = this.formatSRTTime(seg.start);
            const endTime = this.formatSRTTime(seg.end);
            return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text.trim()}\n`;
        }).join('\n');
    }

    /**
     * 导出为双语 SRT (原文 + 译文)
     * @param {Array} segments - 原文 segments
     * @param {Array} translations - 翻译后的文本数组
     * @returns {string} 双语 SRT 格式
     */
    exportToBilingualSRT(segments, translations) {
        return segments.map((seg, index) => {
            const startTime = this.formatSRTTime(seg.start);
            const endTime = this.formatSRTTime(seg.end);
            const original = seg.text.trim();
            const translated = translations ? (translations[index] || '') : '';
            return `${index + 1}\n${startTime} --> ${endTime}\n${original}\n${translated}\n`;
        }).join('\n');
    }

    /**
     * 格式化时间为 SRT 格式 (00:00:00,000)
     */
    formatSRTTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    /**
     * 导出为纯文本
     * @param {Array} segments - segments 数组
     * @param {boolean} includeTimestamps - 是否包含时间戳
     * @returns {string} 文本内容
     */
    exportToText(segments, includeTimestamps = false) {
        if (includeTimestamps) {
            return segments.map(seg => {
                const time = this.formatSRTTime(seg.start).substring(0, 8);
                return `[${time}] ${seg.text.trim()}`;
            }).join('\n');
        }
        return segments.map(seg => seg.text.trim()).join(' ');
    }
}

module.exports = new SubExportManager();
