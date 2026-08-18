/**
 * DownloadManager.js (Controller)
 * 协调 DownloadService 与 DownloadUIManager，管理下载流程。
 */
class DownloadFlow {
    constructor(app) {
        this.app = app;
        this.service = new window.DownloadService(this);
        this.ui = new window.DownloadUIManager(this);
        this.executor = new window.DownloadExecutor(this);
        this.actionHandler = new window.DownloadActionHandler(this);

        // State
        this.videoInfo = null;
        this.playlistInfo = null;
        this.selectedPlaylistItems = new Set();
        this.isDownloading = false;
        this.isPaused = false;
        this.lastDownloadedFilePath = null;
        this.lastOutputDir = null;

        // Preferences
        this.selectedQuality = '720';
        this.downloadFormat = 'video';
        this.audioFormat = 'mp3';
        this.audioQuality = '192';

        // Playlist Preferences
        this.playlistQuality = '720';
        this.playlistFormat = 'video';
        this.playlistAudioFormat = 'mp3';
        this.playlistAudioQuality = '256';

        this.speedMonitor = window.SpeedMonitor ? new window.SpeedMonitor(40) : null;
    }

    init() {
        this.ui.cacheElements();
        this.ui.bindEvents();
        this.registerProgressListener();
        this.registerWarningListener();
    }

    registerProgressListener() {
        // 清除旧监听器（防止 init 被多次调用时叠加注册）
        this._progressCleanup?.();
        this._progressCleanup = window.mediaflow.video.onProgress((data) => {
            if (this.isDownloading) {
                this.ui.updateProgress(data, this.speedMonitor);
            }
        });
    }

    registerWarningListener() {
        this._warningCleanup?.();
        if (!window.mediaflow?.video?.onWarning) return;
        this._warningCleanup = window.mediaflow.video.onWarning((data) => {
            const raw = data?.message || data?.code || data;
            const friendly = (typeof window.mapDownloadError === 'function')
                ? window.mapDownloadError(data || raw)
                : String(raw || '');
            this.app.showToast?.(friendly, 'warning', {
                duration: 6000,
                buttons: [{
                    text: window.i18n?.t('common.openSettings') || 'Open Settings',
                    onClick: () => this.app.router?.switchPage?.('settings')
                }]
            });
        });
    }

    /**
     * @param {object} [opts]
     * @param {boolean} [opts.autoStart] - after detect, start download or enqueue (extension / mobile push)
     * @param {string} [opts.source] - 'extension' | 'mobile' | 'protocol' | 'manual'
     */
    async checkVideo(opts = {}) {
        const autoStart = !!opts.autoStart;
        const source = opts.source || (autoStart ? 'external' : 'manual');

        const rawInput = this.ui.elements.urlInput.value.trim();
        if (!rawInput) {
            this.app.showToast(window.i18n?.t('download.errors.noUrl') || 'Notification', 'warning');
            return;
        }

        // 🆕 Auto-extract URL from mixed text (e.g. Douyin share text)
        const extracted = this.service.extractUrlFromText(rawInput);
        if (extracted && extracted !== rawInput) {
            this.ui.elements.urlInput.value = extracted;
            this.app.showToast(window.i18n?.t('download.urlExtracted') || 'URL extracted', 'info');
        }
        const url = this.ui.elements.urlInput.value.trim();

        // 🆕 Auto-detect multi-URL: if input contains newlines or multiple URLs, switch to batch mode
        const lines = url.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        if (lines.length > 1) {
            console.log('[DownloadFlow] Multi-URL detected, switching to batch mode');
            // Switch to batch mode
            document.getElementById('mode-batch')?.click();

            // Wait a tick for mode switch to complete
            await new Promise(r => setTimeout(r, 100));

            // Add URLs to batch input and trigger detection
            if (window.batchManager && window.batchManager.inputManager) {
                window.batchManager.inputManager.processInput(url);
                await window.batchManager.handleStartClick();
                // Clear single input
                this.ui.elements.urlInput.value = '';
            }
            return;
        }

        if (!this.service.isValidUrl(url)) {
            this.app.showToast(window.i18n?.t('download.errors.invalid_url') || 'Notification', 'error');
            return;
        }

        // 拦战无视频 ID 的裸 YouTube 页面 URL
        try {
            const parsed = new URL(url);
            const isYouTubeWatch = (parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com') && parsed.pathname === '/watch';
            if (isYouTubeWatch && !parsed.searchParams.get('v')) {
                this.app.showToast(window.i18n?.t('download.errors.noVideoId') || 'No video ID found in URL', 'error');
                return;
            }
        } catch { /* already passed isValidUrl, skip */ }

        // 先显示按钮加载状态，骨架屏延迟到 API 成功后再显示
        this.ui.elements.btnCheck.disabled = true;
        this.ui.elements.btnCheck.innerHTML = `<span class="loading-spinner"></span> <span>${window.i18n?.t('download.checking')}</span>`;

        try {
            // Check for Playlist / bulk channel pages
            const isPlaylist =
                url.includes('list=') ||
                url.includes('/playlist') ||
                (url.includes('tiktok.com/@') && !url.includes('/video/'));

            if (isPlaylist && !window.PlaylistUIManager) {
                // No playlist UI available — treat as unsupported rather than silently mis-handle.
                this.app.showToast(
                    window.i18n?.t('download.multiUrlDetected') || 'Playlist capture is not available',
                    'warning'
                );
                return;
            }

            if (isPlaylist) {
                const limit = parseInt(document.getElementById('setting-playlist-limit')?.value) || 1000;
                const res = await this.service.getPlaylistInfo(url, limit);
                if (res.success) {
                    this.playlistInfo = res;
                    this.selectedPlaylistItems = new Set(res.items.map((_, i) => i));
                    // API 成功后才显示骨架屏并渲染
                    this.ui.showSkeleton();
                    this.ui.renderPlaylistInfo(res, this.selectedPlaylistItems);
                    this.app.showToast(window.i18n?.t('download.playlistInfoSuccess') || 'Success', 'success');
                } else {
                    throw new Error(res.error || (window.i18n?.t('download.getPlaylistFailed') || 'Operation failed'));
                }
            } else {
                const res = await this.service.getInfo(url);
                if (res.success) {
                    this.videoInfo = res;
                    // API 成功后才显示骨架屏并渲染
                    this.ui.showSkeleton();
                    this.ui.renderVideoInfo(res);
                    if (!autoStart) {
                        this.app.showToast(window.i18n?.t('download.videoInfoSuccess') || 'Success', 'success');
                    }
                    if (autoStart) {
                        await this.autoStartAfterDetect(source);
                    }
                } else {
                    throw new Error(res.error || (window.i18n?.t('download.getVideoFailed') || 'Operation failed'));
                }
            }
        } catch (error) {
            console.error('[DownloadManager] Check error:', error);

            const userMessage = (typeof window.mapDownloadError === 'function')
                ? window.mapDownloadError(error)
                : (error.message || String(error));

            this.app.showToast(userMessage, 'error', {
                duration: 6000,
                buttons: /YTDLP_MISSING|yt-dlp|ffmpeg|Core engines|Settings/i.test(String(error?.message || error?.error || userMessage))
                    ? [{
                        text: window.i18n?.t('common.openSettings') || 'Open Settings',
                        onClick: () => this.app.router?.switchPage?.('settings')
                    }]
                    : undefined
            });

            // 🆕 显示持久化错误卡片，而不是彻底隐藏 UI
            this.ui.showErrorState(userMessage);
        } finally {
            this.ui.elements.btnCheck.disabled = false;
            // 使用 innerHTML 恢复图标和翻译
            const checkText = window.i18n?.t('download.check') || 'Analyze';
            this.ui.elements.btnCheck.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> <span data-i18n="download.check">${checkText}</span>`;
        }
    }

    /**
     * External send (extension / mobile / deep link):
     * - idle → start download immediately
     * - busy → add to queue (don't interrupt current job)
     */
    async autoStartAfterDetect(source = 'external') {
        if (!this.videoInfo) return;

        const queueBusy = !!(
            this.app.queueManager &&
            (
                (this.app.queueManager.activeDownloads || 0) > 0 ||
                (Array.isArray(this.app.queueManager.queue) &&
                    this.app.queueManager.queue.some((i) =>
                        ['pending', 'queued', 'downloading', 'processing'].includes(i.status)
                    ))
            )
        );
        const busy = !!this.isDownloading || queueBusy;

        try {
            if (busy) {
                // Prefer queue when something is already running
                this.addToQueue();
                this.app.showToast(
                    window.i18n?.t('download.autoQueuedFromExternal') ||
                        'Added to queue (download in progress)',
                    'success'
                );
                console.log('[Download] autoStart → queue', source);
                return;
            }

            this.app.showToast(
                window.i18n?.t('download.autoStarting') || 'Starting download…',
                'info'
            );
            console.log('[Download] autoStart → startDownload', source);
            await this.startDownload();
        } catch (e) {
            console.error('[Download] autoStartAfterDetect failed:', e);
            this.app.showToast(
                window.i18n?.t('download.autoStartFailed') ||
                    'Auto-start failed — use Save to download manually',
                'warning'
            );
        }
    }


    async startDownload(savedOptions = null) {
        return this.executor.startDownload(savedOptions);
    }

    cancelDownload() {
        this.service.cancelDownload(this.currentDownloadId);
        this.currentDownloadId = null;
        this.isDownloading = false;
        this.ui.showProgressUI(false);
    }

    togglePause() {
        const key = 'download.pauseUnsupported';
        const translated = window.i18n?.t?.(key);
        const message = (translated && translated !== key)
            ? translated
            : '当前下载不支持暂停，请使用取消停止任务。';
        this.app.showToast?.(message, 'info');
    }

    handleTrimInput() {
        let start = parseInt(this.ui.elements.trimStart.value);
        let end = parseInt(this.ui.elements.trimEnd.value);
        if (start >= end) {
            // Simple collision fix
            this.ui.elements.trimEnd.value = start + 1;
            end = start + 1;
        }
        this.ui.updateTrimUI(start, end, parseInt(this.ui.elements.trimStart.max));
    }

    // Playlist Helpers
    handlePlaylistSelectAll(checked) {
        const cbs = document.querySelectorAll('.playlist-checkbox');
        cbs.forEach((cb, i) => {
            cb.checked = checked;
            if (checked) this.selectedPlaylistItems.add(i);
            else this.selectedPlaylistItems.delete(i);
        });
        this.ui.updatePlaylistCount(this.selectedPlaylistItems.size, this.playlistInfo.count);
    }

    handlePlaylistItemSelect(index, checked) {
        if (checked) this.selectedPlaylistItems.add(index);
        else this.selectedPlaylistItems.delete(index);
        this.ui.updatePlaylistCount(this.selectedPlaylistItems.size, this.playlistInfo.count);
    }

    async downloadPlaylist() {
        return this.executor.downloadPlaylist();
    }
    sendToCreator() {
        this.actionHandler.sendToCreator();
    }
    sendToTranscribe() {
        this.actionHandler.sendToTranscribe();
    }
    sendToSubtitle() {
        this.actionHandler.sendToSubtitle();
    }
    openFolder() { this.actionHandler.openFolder(); }
    addToQueue() {
        this.actionHandler.addToQueue();
    }
}

window.DownloadFlow = DownloadFlow;
window.DownloadManager = DownloadFlow;

