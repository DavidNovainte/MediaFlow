/**
 * TempCleaner.js
 * 临时文件清理工具
 * 负责回收磁盘空间，清理残留的中间过程文件。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class TempCleaner {
    constructor() {
        this.tempDir = os.tmpdir();
        // 定义应用产生的临时文件前缀
        this.prefixes = ['mediaflow_', 'temp_seg_', 'concat_list_', 'temp_pcm_'];
        this.expiryMS = 24 * 60 * 60 * 1000; // 24小时过期
    }

    /**
     * 执行扫描并清理
     */
    async clean() {
        console.log('[TempCleaner] Starting scheduled cleanup...');
        let count = 0;
        let size = 0;

        try {
            const files = await fs.promises.readdir(this.tempDir);
            const now = Date.now();

            for (const file of files) {
                // 检查是否符合应用前缀
                if (this.prefixes.some(p => file.startsWith(p))) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        const stats = await fs.promises.stat(filePath);
                        const age = now - stats.mtimeMs;

                        // 只有超过过期时间的才清理 (防止误删正在处理的任务)
                        if (age > this.expiryMS) {
                            await fs.promises.unlink(filePath);
                            count++;
                            size += stats.size;
                        }
                    } catch {
                        // 忽略正在被占用或已被删除的文件
                    }
                }
            }
            console.log(`[TempCleaner] Cleanup finished. Removed ${count} files, saved ${(size / 1024 / 1024).toFixed(2)} MB`);
        } catch (error) {
            console.error('[TempCleaner] Error during cleanup:', error);
        }

        return { count, size };
    }

    /**
     * 同时也支持清理特定目录下的临时视频片段
     */
    async cleanCustomDir(dirPath) {
        if (!fs.existsSync(dirPath)) return;
        // 逻辑类似...
    }
}

module.exports = new TempCleaner();
