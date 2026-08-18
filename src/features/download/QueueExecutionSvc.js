/**
 * QueueExecutionSvc.js
 * 负责队列任务的具体执行逻辑，包括并发控制、错误翻译和重试机制。
 */
class QueueExecutionSvc {
    constructor(queueManager) {
        this.queueManager = queueManager;
        this.app = queueManager.app;
    }

    /**
     * 执行单个下载任务
     */
    async executeTask(item) {
        // 1. 获取元数据 (如果缺失)
        if (!item.title || item.title === 'Wait for detection...') {
            const info = await window.mediaflow.video.getInfo(item.url);
            if (info.success) {
                item.title = info.title;
                item.platform = info.platform;
                item.thumbnail = info.thumbnail;
                this.queueManager.emit('statusChange', item);
            }
        }

        // 2. 注册进度监听
        const cleanupProgress = window.mediaflow.video.onProgress((data) => {
            // Normalize id type: backend always sends string ids; queue items may be number|string
            if (String(data.id) === String(item.id)) {
                item.progress = data.progress;
                item.speed = data.speed;
                item.totalBytes = data.totalBytes;
                this.queueManager.ui.updateItemProgress(item, data);
                this.queueManager.emit('progress', { id: item.id, progress: data.progress });
            }
        });

        try {
            // 3. 准备安全荷载并开始下载
            const safeSettings = JSON.parse(JSON.stringify(item.settings));
            const safePayload = {
                url: item.url,
                title: item.title,
                platform: item.platform,
                ...safeSettings,
                id: item.id,   // 必须在展开后覆盖，防止 settings.id 覆盖队列项 ID
                batch: true,
                source: 'queue'
            };

            const result = await window.mediaflow.video.download(safePayload);
            cleanupProgress();

            if (!result?.success) {
                throw new Error(result?.error || 'Download failed');
            }
            item.result = result;
            return result;
        } catch (e) {
            cleanupProgress();
            throw e;
        }
    }

    /**
     * 将解析器错误转换为用户友好的提示
     */
    translateError(error) {
        if (typeof window.mapDownloadError === 'function') {
            return window.mapDownloadError(error);
        }
        let msg = error.message || (window.i18n?.t('common.errors.unknown') || 'Notification');
        const errorMap = {
            '403': window.i18n?.t('download.errors.authRequired') || 'Notification',
            '429': '请求过快 (429: Too Many Requests)，请稍后重试，或尝试关闭字幕下载并检查代理设置',
            'Forbidden': window.i18n?.t('download.errors.authRequired') || 'Notification',
            'Unsupported URL': window.i18n?.t('download.errors.unsupportedUrl'),
            'Video unavailable': window.i18n?.t('download.errors.videoUnavailable'),
            'Private': window.i18n?.t('download.errors.privateVideo'),
            'Sign in': window.i18n?.t('download.errors.signinRequired'),
            'network': window.i18n?.t('download.errors.networkError'),
            'ENOTFOUND': window.i18n?.t('download.errors.networkError')
        };

        for (const [key, val] of Object.entries(errorMap)) {
            if (msg.includes(key) && val) return val;
        }
        return msg;
    }
}

window.QueueExecutionSvc = QueueExecutionSvc;
