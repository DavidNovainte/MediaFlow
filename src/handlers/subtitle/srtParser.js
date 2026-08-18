/**
 * SRT Parser Utility
 * 用于解析和生成 SRT 字幕文件
 */

const fs = require('fs');

class SRTParser {
    /**
     * 解析 SRT 文件内容
     * @param {string} content SRT 文件内容
     * @returns {Array} 字幕对象数组 [{id, start, end, text}]
     */
    static parse(content) {
        if (!content) return [];

        // 统一换行符
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const subtitles = [];
        const blocks = content.split('\n\n');

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 3) continue; // 至少需要 ID, 时间轴, 文本

            const id = lines[0].trim();
            const timeLine = lines[1].trim();
            const text = lines.slice(2).join('\n');

            // 解析时间轴 00:00:01,000 --> 00:00:04,000
            const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

            if (timeMatch) {
                subtitles.push({
                    id: parseInt(id, 10),
                    start: this.timeToSeconds(timeMatch[1]),
                    end: this.timeToSeconds(timeMatch[2]),
                    startTime: timeMatch[1],
                    endTime: timeMatch[2],
                    text: text
                });
            }
        }

        return subtitles;
    }

    /**
     * 生成 SRT 文件内容
     * @param {Array} subtitles 字幕对象数组
     * @returns {string} SRT 文件内容
     */
    static generate(subtitles) {
        return subtitles.map((sub, index) => {
            const id = index + 1;
            const start = this.secondsToTime(sub.start);
            const end = this.secondsToTime(sub.end);
            return `${id}\n${start} --> ${end}\n${sub.text}`;
        }).join('\n\n');
    }

    /**
     * 时间字符串转秒 (00:00:01,000 -> 1.0)
     */
    static timeToSeconds(timeString) {
        const [time, ms] = timeString.split(',');
        const [h, m, s] = time.split(':').map(Number);
        return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
    }

    /**
     * 秒转时间字符串 (1.0 -> 00:00:01,000)
     */
    static secondsToTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);

        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        const mmm = String(ms).padStart(3, '0');

        return `${hh}:${mm}:${ss},${mmm}`;
    }

    /**
     * 读取并解析 SRT 文件
     */
    static async readFile(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return this.parse(content);
        } catch (error) {
            console.error('[SRTParser] Read file error:', error);
            throw error;
        }
    }

    /**
     * 保存字幕到 SRT 文件
     */
    static async saveFile(filePath, subtitles) {
        try {
            const content = this.generate(subtitles);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('[SRTParser] Save file error:', error);
            throw error;
        }
    }
}

module.exports = SRTParser;
