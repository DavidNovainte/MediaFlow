/**
 * DownloadActionHandler.js
 * 处理下载后的动作（发送到编辑器、打开文件夹、添加到队列等）
 */
class DownloadActionHandler {
    constructor(manager) {
        this.manager = manager;
        this.app = manager.app;
        this.ui = manager.ui;
        this.service = manager.service;
    }

    sendToCreator() {
        if (this.manager.lastDownloadedFilePath && window.creatorFlow) {
            this.app.switchPage('creator');
            // 延遲確保頁面資源加載及初始化完成
            setTimeout(() => {
                window.creatorFlow.addLocalFile(this.manager.lastDownloadedFilePath);
            }, 100);
        } else {
            this.app.showToast(window.i18n?.t('download.fileNavNotFound') || 'Cannot find file navigation', 'warning');
        }
    }

    sendToTranscribe() {
        console.log('[DownloadActionHandler] sendToTranscribe called');
        if (this.manager.lastDownloadedFilePath && window.scribeFlow) {
            this.app.switchPage('transcribe');
            // 延遲確保頁面資源加載及初始化完成
            setTimeout(() => {
                const fileName = this.manager.lastDownloadedFilePath.split(/[\\/]/).pop();
                window.scribeFlow.handleFilesSelect([{ 
                    path: this.manager.lastDownloadedFilePath,
                    name: fileName,
                    type: 'video/mp4', // 默認類型以通過 ScribeQueueManager 過濾
                    size: 0 // 佔位大小
                }]);
            }, 100);
        } else {
            this.app.showToast(window.i18n?.t('download.fileNavNotFound') || 'Cannot find file navigation', 'warning');
        }
    }

    async sendToSubtitle() {
        const filePath = this.manager.lastDownloadedFilePath;
        if (!filePath) {
            this.app.showToast(window.i18n?.t('download.fileNavNotFound') || 'Cannot find file navigation', 'warning');
            return;
        }

        try {
            await this.app.switchPage('subtitle');
            const flow = window.FeatureLoader?.ensureSubtitle
                ? await window.FeatureLoader.ensureSubtitle(this.app)
                : window.subtitleFlow;
            if (!flow?.loadVideo) {
                this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to load Subtitle tools', 'error');
                return;
            }
            // Wait a tick so page fragment + DOM refs are ready after switch
            await new Promise((resolve) => setTimeout(resolve, 50));
            await flow.loadVideo(filePath);
        } catch (error) {
            console.error('[DownloadActionHandler] sendToSubtitle failed:', error);
            this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to open Subtitle tools', 'error');
        }
    }

    openFolder() {
        console.log('[DownloadActionHandler] openFolder called');
        const targetPath = this.manager.lastDownloadedFilePath || this.manager.lastOutputDir;
        if (targetPath) {
            console.log('[DownloadActionHandler] Requesting showItemInFolder for:', targetPath);
            window.mediaflow.shell.showItemInFolder(targetPath);
        } else {
            console.warn('[DownloadActionHandler] No path available for openFolder');
            this.app.showToast(window.i18n?.t('download.filePathNotFound') || 'Cannot find file path', 'warning');
        }
    }

    addToQueue() {
        if (!this.manager.videoInfo) {
            this.app.showToast(window.i18n?.t('download.detectFirst') || 'Please detect video first', 'warning');
            return;
        }

        const e = this.ui.elements;
        this.service.buildDownloadOptions(this.manager.videoInfo, {
            rawUrl: e.urlInput?.value?.trim() || '',
            selectedQuality: this.manager.selectedQuality,
            audioOnly: this.manager.downloadFormat === 'audio',
            audioFormat: this.manager.audioFormat,
            audioQuality: this.manager.audioQuality,
            writeThumbnail: e.downloadThumbnail?.checked,
            writeSubtitles: e.downloadSubtitles?.checked,
            isTrimEnabled: e.trimGroup && !e.trimGroup.classList.contains('hidden'),
            trimStart: e.trimStart?.value || 0,
            trimEnd: e.trimEnd?.value || this.manager.videoInfo.duration
        }).then(options => {
            if (options) {
                const thumbnail = this.ui.elements.thumbnail;
                if (thumbnail && window.queueAnimation) {
                    window.queueAnimation.flyToQueue(thumbnail);
                }

                this.app.queueManager.add({
                    id: options.id,
                    url: options.url,
                    title: options.title,
                    thumbnail: options.thumbnail,
                    platform: options.platform,
                    settings: options,
                    priority: 1
                });
                this.app.showToast(window.i18n?.t('download.addedToQueue') || 'Added to queue', 'success');
            }
        }).catch(err => {
            if (err.message === 'MISSING_PATH') {
                this.app.showToast(window.i18n?.t('download.selectDirFirst') || 'Please select download directory in settings first', 'warning');
            } else {
                this.app.showToast((window.i18n?.t('download.addQueueFail') || 'Failed to add to queue:') + ' ' + err.message, 'error');
            }
        });
    }
}

window.DownloadActionHandler = DownloadActionHandler;
