/**
 * DownloadService.js
 * 处理下载相关的核心业务逻辑与 IPC 通讯。
 */
class DownloadService {
    constructor(flow) {
        this.flow = flow;
    }

    /**
     * 验证 URL 是否合法
     */
    isValidUrl(string) {
        try {
            const url = new URL(string);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    /**
     * 从混合文本中提取第一个有效的 http/https URL。
     * 适用于抖音/TikTok 分享文案等带大段文字的链接。
     * @param {string} text
     * @returns {string|null} 提取到的 URL，或 null
     */
    extractUrlFromText(text) {
        if (!text) return null;
        const trimmed = text.trim();
        // Fast path: already a clean URL
        if (this.isValidUrl(trimmed)) return trimmed;
        // Extract first https?:// URL, stopping at whitespace or CJK characters
        const match = trimmed.match(/https?:\/\/[^\s\u4e00-\u9fff\uff00-\uffef！。，、；：？（）【】「」]+/);
        if (match) {
            // Strip trailing punctuation that may have been captured
            return match[0].replace(/[.,!?;:'")\]>]+$/, '');
        }
        return null;
    }

    /**
     * 🆕 获取下载路径 (带自动回退到系统下载文件夹)
     */
    async getDownloadPath() {
        let path = await window.mediaflow.store.get('downloadPath');
        if (!path) {
            try {
                path = await window.mediaflow.app.getAppPath('downloads');
                if (path) {
                    // 标准化路径存储
                    path = path.replace(/\\/g, '/').replace(/\/$/, '');
                    await window.mediaflow.store.set('downloadPath', path);
                }
            } catch (e) {
                console.error('[DownloadService] Failed to get system downloads path:', e);
            }
        }
        return path;
    }

    /**
     * 获取视频信息
     */
    async getInfo(url) {
        const platform = window.platformRegistry?.detect(url);
        if (platform) {
            const cleaned = platform.cleanUrl(url);
            return await platform.getInfo(cleaned);
        }
        return await window.mediaflow.video.getInfo(url);
    }

    /**
     * 获取播放列表信息
     */
    async getPlaylistInfo(url, limit = 1000) {
        const platform = window.platformRegistry?.detect(url);
        if (platform) {
            return await platform.getPlaylistInfo(url, limit);
        }
        return await window.mediaflow.video.getPlaylistInfo(url, limit);
    }

    /**
     * 构建下载选项
     */
    async buildDownloadOptions(videoInfo, uiState) {
        if (!videoInfo) return null;

        const savePath = await this.getDownloadPath();
        if (!savePath) {
            throw new Error('MISSING_PATH');
        }

        // 规范化路径逻辑
        const normalizedPath = savePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
        const isMediaFlow = normalizedPath.endsWith('/mediaflow') || normalizedPath === 'mediaflow';

        let finalOutputDir;
        if (isMediaFlow) {
            finalOutputDir = await window.mediaflow.path.join(savePath, 'Single Download');
        } else {
            finalOutputDir = await window.mediaflow.path.join(savePath, 'MediaFlow', 'Single Download');
        }

        // 确保目录存在
        try {
            if (window.mediaflow.fs?.mkdir) await window.mediaflow.fs.mkdir(finalOutputDir);
        } catch (e) {
            console.warn('[DownloadService] Mkdir failed:', e);
        }

        let trimRange = null;
        if (uiState.isTrimEnabled && videoInfo.duration) {
            const start = parseInt(uiState.trimStart);
            const end = parseInt(uiState.trimEnd);
            // 只有非全时长才添加剪辑参数
            if (start > 0 || end < Math.floor(videoInfo.duration)) {
                trimRange = {
                    start: this.formatTimestamp(start),
                    end: this.formatTimestamp(end)
                };
            }
        }

        return {
            url: (videoInfo.platform === 'tiktok') ? uiState.rawUrl : (videoInfo.url || uiState.rawUrl),
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
            title: videoInfo.title,
            quality: uiState.selectedQuality,
            audioOnly: uiState.audioOnly,
            audioFormat: uiState.audioFormat,
            audioBitrate: uiState.audioQuality,
            outputDir: finalOutputDir,
            writeThumbnail: uiState.writeThumbnail,
            writeSubtitles: uiState.writeSubtitles,
            trimRange: trimRange,
            thumbnail: videoInfo.thumbnail,
            platform: videoInfo.platform
        };
    }

    /**
     * 开始下载
     */
    async startDownload(options) {
        return await window.mediaflow.video.download(options);
    }

    /**
     * 取消下载
     */
    cancelDownload(downloadId) {
        window.mediaflow.video.cancelDownload(downloadId);
    }

    /**
     * 工具方法：格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * 工具方法：格式化时间戳 (HH:MM:SS 或 MM:SS)
     */
    formatTimestamp(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * 工具方法：格式化持续时间 (M:SS)
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.DownloadService = DownloadService;
