/**
 * DownloadExecutor.js
 * 负责单视频和播放列表下载的执行流程控制（串行逻辑、进度绑定、庆祝动画等）
 */
const DOWNLOAD_CONTROL_CHAR_RANGES = `${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}`;
const DOWNLOAD_INVALID_PATH_CHARS_RE = new RegExp(`[${DOWNLOAD_CONTROL_CHAR_RANGES}<>:"/\\\\|?*]+`, 'g');

function sanitizePathSegment(value, options = {}) {
    const fallback = options.fallback || 'untitled';
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : 50;

    let safeValue = String(value || '')
        .replace(DOWNLOAD_INVALID_PATH_CHARS_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    if (!safeValue) safeValue = fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(safeValue)) {
        safeValue = `_${safeValue}`;
    }
    if (safeValue.length > maxLength) {
        safeValue = safeValue.slice(0, maxLength).trim().replace(/[. ]+$/g, '');
    }

    return safeValue || fallback;
}

class DownloadExecutor {
    constructor(manager) {
        this.manager = manager;
        this.app = manager.app;
        this.service = manager.service;
        this.ui = manager.ui;
    }

    /**
     * 开始下载流程 (单视频)
     */
    async startDownload(savedOptions = null) {
        if (this.manager.isDownloading) return;

        let options = savedOptions;
        if (!options) {
            try {
                options = await this.service.buildDownloadOptions(this.manager.videoInfo, {
                    rawUrl: this.ui.elements.urlInput.value.trim(),
                    selectedQuality: this.manager.selectedQuality,
                    audioOnly: this.manager.downloadFormat === 'audio',
                    audioFormat: this.manager.audioFormat,
                    audioQuality: this.manager.audioQuality,
                    writeThumbnail: this.ui.elements.downloadThumbnail?.checked,
                    writeSubtitles: this.ui.elements.downloadSubtitles?.checked,
                    isTrimEnabled: !this.ui.elements.trimGroup?.classList.contains('hidden'),
                    trimStart: this.ui.elements.trimStart?.value,
                    trimEnd: this.ui.elements.trimEnd?.value
                });
            } catch (e) {
                if (e.message === 'MISSING_PATH') this.app.showToast(window.i18n?.t('download.missingPath') || 'Please set download directory first', 'warning');
                return;
            }
        }
        if (!options) return;

        this.manager.isDownloading = true;
        this.manager.currentDownloadId = options.id || null;
        this.ui.showProgressUI(true);
        this.ui.resetProgress();
        this.manager.speedMonitor?.reset();

        try {
            const result = await this.service.startDownload(options);

            if (result.success) {
                window.DonationPrompt?.recordSuccess();
                this.manager.lastDownloadedFilePath = result.file;
                this.manager.lastOutputDir = result.path || options.outputDir;
                this.ui.elements.postDownloadActions?.classList.remove('hidden');

                if (window.Celebration) {
                    const celebration = new window.Celebration();
                    celebration.show({
                        title: this.manager.videoInfo?.title || 'Notification',
                        filePath: result.file,
                        quality: options.audioOnly ? `Audio (${options.audioFormat})` : `${options.quality}p`,
                        fileSize: result.fileSize || 0,
                        elapsed: result.elapsed || 0,
                        thumbnail: this.manager.videoInfo?.thumbnail
                    });
                } else {
                    this.app.showToast(window.i18n?.t('download.downloadComplete') || 'Download complete!', 'success');
                }


                if (this.app.historyManager) {
                    this.app.historyManager.addToHistory({
                        ...this.manager.videoInfo,
                        downloadDate: new Date().toISOString(),
                        quality: options.audioOnly ? `Audio (${options.audioFormat})` : `${options.quality}p`,
                        filePath: result.file,
                        fileSize: result.fileSize || 0
                    });
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            if (!error.message?.includes('Cancelled')) {
                const friendly = (typeof window.mapDownloadError === 'function')
                    ? window.mapDownloadError(error)
                    : (error.message || String(error));
                this.app.showToast(
                    (window.i18n?.t('download.error') || 'Archive failed') + ': ' + friendly,
                    'error'
                );
            }
        } finally {
            this.manager.isDownloading = false;
            this.manager.currentDownloadId = null;
            this.ui.showProgressUI(false);
        }
    }

    /**
     * 批量下载播放列表中的选中项
     */
    async downloadPlaylist() {
        if (!this.manager.selectedPlaylistItems.size) return this.app.showToast(window.i18n?.t('download.selectOneVideo') || 'Please select at least one video', 'warning');
        if (!this.manager.playlistInfo?.items) return;

        const savePath = await this.service.getDownloadPath();
        if (!savePath) return this.app.showToast(window.i18n?.t('download.missingPath') || 'Please set download directory first', 'warning');

        const selectedIndices = Array.from(this.manager.selectedPlaylistItems).sort((a, b) => a - b);
        const total = selectedIndices.length;
        let completed = 0, errors = 0;

        this.manager.isDownloading = true;
        this.manager.currentPlaylistIndex = -1;

        this.ui.showProgressUI(false);
        this.ui.updateOverallPlaylistProgress(0, total);

        const cleanupProgress = window.mediaflow.video.onProgress((data) => {
            if (this.manager.isDownloading && this.manager.currentPlaylistIndex >= 0) {
                const percent = Math.round(data.progress || 0);
                this.ui.updateCardProgress(this.manager.currentPlaylistIndex, percent);
            }
        });

        try {
            for (const index of selectedIndices) {
                if (!this.manager.isDownloading) break;

                const item = this.manager.playlistInfo.items[index];
                if (!item?.url && !item?.id) continue;

                this.manager.currentPlaylistIndex = index;
                this.ui.setCardStatus(index, 'downloading');

                try {
                    const videoUrl = item.url || `https://www.youtube.com/watch?v=${item.id}`;

                    // 🆕 构建播放列表专用保存路径
                    const playlistTitle = this.manager.playlistInfo?.title || 'Unknown Playlist';
                    const safePlaylistTitle = sanitizePathSegment(playlistTitle, { fallback: 'Unknown Playlist', maxLength: 50 });
                    const playlistPath = await window.mediaflow.path.join(savePath, 'MediaFlow', 'Playlist Downloads', safePlaylistTitle);

                    // 确保目录存在
                    try {
                        await window.mediaflow.fs?.mkdir(playlistPath);
                    } catch (e) {
                        console.warn('[DownloadExecutor] Mkdir failed:', e);
                    }

                    const result = await this.service.startDownload({
                        url: videoUrl,
                        quality: this.manager.playlistQuality,
                        audioOnly: this.manager.playlistFormat === 'audio',
                        audioFormat: this.manager.playlistAudioFormat,
                        audioBitrate: this.manager.playlistAudioQuality,
                        writeThumbnail: document.getElementById('pl-download-thumbnail')?.checked,
                        writeSubtitles: document.getElementById('pl-download-subtitles')?.checked,
                        outputDir: playlistPath,
                        isPlaylist: true,
                        batch: true,
                        source: 'playlist'
                    });

                    if (result.success) {
                        this.ui.setCardStatus(index, 'done');
                        completed++;
                    } else throw new Error(result.error);
                } catch (err) {
                    console.error('[DownloadExecutor] Playlist item failed:', err);
                    this.ui.setCardStatus(index, 'error');
                    errors++;
                }
                this.ui.updateOverallPlaylistProgress(completed, total);
            }

            if (errors === 0) {
                window.DonationPrompt?.recordSuccess(completed);
                this.app.showToast(window.i18n?.t('download.playlistDone', { count: completed }) || `🎉 All ${completed} videos downloaded successfully!`, 'success');
            }
            else this.app.showToast(window.i18n?.t('download.playlistPartial', { completed, total, errors }) || `Completed ${completed}/${total}, ${errors} failed`, 'warning');

        } catch (e) {
            this.app.showToast((window.i18n?.t('download.playlistFail') || 'Playlist download failed:') + ' ' + e.message, 'error');
        } finally {
            cleanupProgress?.();
            this.manager.isDownloading = false;
            this.manager.currentPlaylistIndex = -1;
        }
    }
}

window.DownloadExecutor = DownloadExecutor;
