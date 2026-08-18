/**
 * MediaFlow - CreatorService
 * 负责视频创作模块的纯业务逻辑：
 * 1. 文件元数据提取
 * 2. 各种 API 调用封装 (FFmpeg, System)
 * 3. 数据计算与格式化
 */
class CreatorService {
    constructor() {
        this.shell = window.mediaflow?.shell;
    }

    /**
     * 检查文件是否存在
     * @param {string} path 
     */
    async checkFileExists(path) {
        if (!path) return false;
        if (!this.shell?.fileExists) return true; // API unavailable, assume true
        return await this.shell.fileExists(path);
    }

    /**
     * 提取视频/音频元数据
     * @param {File|string} fileOrUrl File object or Blob URL
     * @returns {Promise<{duration: number, resolution: {width: number, height: number}}>}
     */
    extractMetadata(fileOrUrl) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            const src = (fileOrUrl instanceof File || fileOrUrl instanceof Blob)
                ? URL.createObjectURL(fileOrUrl)
                : fileOrUrl;

            video.onloadedmetadata = () => {
                const meta = {
                    duration: video.duration,
                    resolution: {
                        width: video.videoWidth,
                        height: video.videoHeight
                    }
                };

                // Cleanup blob URL if we created it
                if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                    URL.revokeObjectURL(src);
                }

                resolve(meta);
            };

            video.onerror = () => {
                // Try audio if video fails? Or just resolve with 0
                resolve({ duration: 0, resolution: null });
            };

            video.src = src;
        });
    }

    /**
     * 格式化时间 (HH:MM:SS)
     */
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * 简单的文件类型推断
     */
    inferFileType(filePath) {
        const name = filePath.split(/[/\\]/).pop();
        const ext = name.split('.').pop().toLowerCase();

        if (['mp3', 'wav', 'm4a', 'flac', 'aac'].includes(ext)) {
            return { type: 'audio/' + ext, category: 'audio' };
        } else if (['mp4', 'mkv', 'mov', 'webm', 'avi'].includes(ext)) {
            return { type: 'video/' + ext, category: 'video' };
        }
        return { type: 'application/octet-stream', category: 'unknown' };
    }
}

// 挂载到全局
window.CreatorService = CreatorService;
