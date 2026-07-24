/**
 * DownloadUIManager.js
 * 处理下载界面的 DOM 操作、事件绑定与进度渲染。
 */
class DownloadUIManager {
    constructor(manager) {
        this.manager = manager;
        this.elements = {};
        // Sub-managers (BatchSettings is Pro/community-stripped — optional)
        this.playlistUI = window.PlaylistUIManager ? new window.PlaylistUIManager(this) : null;
        this.batchSettingsUI = window.BatchSettingsModalUI
            ? new window.BatchSettingsModalUI(this)
            : null;
        this.progressUI = new window.DownloadProgressUI(this);
        this.infoUI = new window.VideoInfoUIManager(this);
    }

    cacheElements() {
        this.elements = {
            urlInput: document.getElementById('video-url'),
            btnCheck: document.getElementById('btn-check'),
            videoInfo: document.getElementById('download-video-info'),
            downloadOptions: document.getElementById('download-options'),
            btnDownload: document.getElementById('btn-download'),
            btnCancel: document.getElementById('btn-cancel'),
            btnPause: document.getElementById('btn-pause'),
            progressArea: document.getElementById('download-progress'),
            progressBar: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-percent'),
            progressSpeed: document.getElementById('progress-speed'),
            progressEta: document.getElementById('progress-eta'),
            thumbnail: document.getElementById('video-thumbnail'),
            title: document.getElementById('video-title'),
            author: document.getElementById('video-author'),
            duration: document.getElementById('video-duration'),
            platformBadge: document.getElementById('platform-badge'),
            platformIcon: document.getElementById('platform-icon'),
            platformName: document.getElementById('platform-name'),
            postDownloadActions: document.getElementById('post-download-actions'),
            btnPostCreator: document.getElementById('btn-post-creator'),
            btnPostTranscribe: document.getElementById('btn-post-transcribe'),
            btnPostSubtitle: document.getElementById('btn-post-subtitle'),
            btnPostFolder: document.getElementById('btn-post-folder'),
            btnAddQueue: document.getElementById('btn-add-queue'),
            btnPlaylistSettings: document.getElementById('btn-playlist-settings'),
            speedChart: document.getElementById('speed-chart'),
            trimGroup: document.getElementById('trim-group'),
            trimStart: document.getElementById('trim-start'),
            trimEnd: document.getElementById('trim-end'),
            trimRangeFill: document.getElementById('trim-range-fill'),
            trimStartTime: document.getElementById('trim-start-time'),
            trimEndTime: document.getElementById('trim-end-time'),
            trimDurationLabel: document.getElementById('trim-duration-label'),
            downloadThumbnail: document.getElementById('download-thumbnail'),
            downloadSubtitles: document.getElementById('download-subtitles'),
            btnReset: document.getElementById('btn-reset-global'),
            heroSection: document.querySelector('.hero-section'),
            // 🆕 格式切换相关元素
            videoQualityGroup: document.getElementById('video-quality-group'),
            audioQualityGroup: document.getElementById('audio-quality-group'),
            audioFormatGroup: document.getElementById('audio-format-group'),
            plVideoQualityGroup: document.getElementById('pl-video-quality-group'),
            plAudioQualityGroup: document.getElementById('pl-audio-quality-group'),
            plAudioFormatGroup: document.getElementById('pl-audio-format-group'),
            // 🆕 Batch Settings Modal Elements
            batchSettingsModal: document.getElementById('batch-settings-modal'),
            btnCloseBatchSettings: document.getElementById('btn-close-batch-settings'),
            btnSaveBatchSettings: document.getElementById('btn-save-batch-settings'),
            // Modal Inputs
            modalPlaylistLimit: document.getElementById('modal-setting-playlist-limit'),
            modalCreateChannelFolder: document.getElementById('modal-setting-create-channel-folder'),
            modalTimeGroup: document.getElementById('modal-setting-time-group'),
            modalUseArchive: document.getElementById('modal-setting-use-archive')
        };
    }

    bindEvents() {
        const m = this.manager;
        const e = this.elements;

        // Batch settings modal (Pro only — no-op in Community export)
        e.btnPlaylistSettings?.addEventListener('click', () => this.batchSettingsUI?.show?.());

        // 检测与下载
        e.btnCheck?.addEventListener('click', () => m.checkVideo());
        e.urlInput?.addEventListener('keypress', (ev) => {
            if (ev.key === 'Enter') m.checkVideo();
        });

        e.btnDownload?.addEventListener('click', () => m.startDownload());
        e.btnCancel?.addEventListener('click', () => m.cancelDownload());
        e.btnPause?.addEventListener('click', () => m.togglePause());

        // 后置操作
        e.btnPostCreator?.addEventListener('click', () => m.sendToCreator());
        e.btnPostTranscribe?.addEventListener('click', () => m.sendToTranscribe());
        e.btnPostSubtitle?.addEventListener('click', () => m.sendToSubtitle());
        e.btnPostFolder?.addEventListener('click', () => m.openFolder());
        e.btnAddQueue?.addEventListener('click', () => m.addToQueue());

        // 剪辑输入
        e.trimStart?.addEventListener('input', () => m.handleTrimInput());
        e.trimEnd?.addEventListener('input', () => m.handleTrimInput());

        e.btnReset?.addEventListener('click', () => this.resetUI());

        // 质量选择
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.parentElement;
                container.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const quality = btn.dataset.quality;
                if (container.closest('#playlist-info')) {
                    m.playlistQuality = quality;
                } else {
                    m.selectedQuality = quality;
                }
            });
        });

        // 格式切换
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.parentElement;
                container.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const format = btn.dataset.format;
                if (container.closest('#playlist-info')) {
                    m.playlistFormat = format;
                } else {
                    m.downloadFormat = format;
                }
                this.toggleFormatUI(format, container.closest('#playlist-info'));
            });
        });

        // 音频设置
        document.querySelectorAll('.audio-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.parentElement;
                container.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const bitrate = btn.dataset.bitrate;
                if (container.closest('#playlist-info')) {
                    m.playlistAudioQuality = bitrate;
                } else {
                    m.audioQuality = bitrate;
                }
            });
        });

        document.querySelectorAll('.audio-format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.parentElement;
                container.querySelectorAll('.audio-format-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const ext = btn.dataset.ext;
                if (container.closest('#playlist-info')) {
                    m.playlistAudioFormat = ext;
                } else {
                    m.audioFormat = ext;
                    this.updateAudioBitrateUI(m.videoInfo);
                }
            });
        });
    }

    // Modal delegation
    showBatchSettings() { this.batchSettingsUI?.show?.(); }
    hideBatchSettings() { this.batchSettingsUI?.hide?.(); }
    saveBatchSettings() { this.batchSettingsUI?.save?.(); }

    renderVideoInfo(info) { this.infoUI.renderVideoInfo(info); }
    updateAudioBitrateUI(info) { this.infoUI.updateAudioBitrateUI(info); }
    showSkeleton() { this.infoUI.showSkeleton(); }
    hideSkeleton() { this.infoUI.hideSkeleton(); }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 显示错误状态卡片
     */
    showErrorState(message) {
        this.hideSkeleton();
        const infoDiv = this.elements.videoInfo;
        if (!infoDiv) return;

        infoDiv.classList.remove('hidden');
        this.elements.downloadOptions?.classList.add('hidden');
        this.elements.heroSection?.classList.add('compact'); // Keep layout stable

        const errorTitle = window.i18n?.t('download.getVideoFailed') || 'Video information analysis failed';
        const retryText = window.i18n?.t('quality.retry') || 'Retry';
        const safeErrorTitle = this.escapeHtml(errorTitle);
        const safeMessage = this.escapeHtml(message);
        const safeRetryText = this.escapeHtml(retryText);

        infoDiv.innerHTML = `
            <div class="glass-panel" style="padding: 24px; text-align: center; color: var(--text-secondary); border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05);">
                <div style="font-size: 32px; margin-bottom: 12px;">😕</div>
                <h3 style="color: var(--error); margin-bottom: 8px; font-weight: 600;">${safeErrorTitle}</h3>
                <p style="font-size: 14px; opacity: 0.9;">${safeMessage}</p>
                <button class="btn btn-secondary btn-sm" style="margin-top: 16px;" data-action="focus-download-url">
                    ${safeRetryText}
                </button>
            </div>
        `;

        // 🆕 3秒后自动隐藏错误卡片并恢复结构
        infoDiv.querySelector('[data-action="focus-download-url"]')?.addEventListener('click', () => {
            const input = this.elements.urlInput || document.getElementById('video-url');
            input?.focus?.();
        });

        setTimeout(() => {
            this.hideAllDownloadUI();
        }, 3000);
    }

    /**
     * 隐藏所有下载相关的 UI（重置时调用）
     */
    hideAllDownloadUI() {
        // 隐藏骨架屏
        const overlay = this.elements.videoInfo?.querySelector('.video-info-skeleton');
        if (overlay) overlay.classList.add('hidden');

        // 隐藏视频信息和下载选项
        this.elements.videoInfo?.classList.add('hidden');
        this.elements.downloadOptions?.classList.add('hidden');

        // 恢复 Hero 区域为非紧凑模式
        this.elements.heroSection?.classList.remove('compact');

        // [CRITICAL FIX] 恢复原始 HTML 结构而不是清空
        if (this.elements.videoInfo) {
            this.elements.videoInfo.innerHTML = `
                <div class="video-thumbnail">
                    <img id="video-thumbnail" src="" alt="Thumbnail">
                    <div class="video-duration" id="video-duration"></div>
                </div>
                <div class="video-details">
                    <h3 class="video-title" id="video-title"></h3>
                    <div class="video-meta">
                        <div id="platform-badge" class="meta-item platform">
                            <i id="platform-icon" class="fab fa-play-circle"></i>
                            <span id="platform-name"></span>
                        </div>
                        <div class="meta-item author">
                            <i class="fas fa-user-circle"></i>
                            <span id="video-author"></span>
                        </div>
                    </div>
                </div>
            `;
            // 重新缓存元素引用
            this.elements.thumbnail = document.getElementById('video-thumbnail');
            this.elements.title = document.getElementById('video-title');
            this.elements.author = document.getElementById('video-author');
            this.elements.duration = document.getElementById('video-duration');
            this.elements.platformBadge = document.getElementById('platform-badge');
            this.elements.platformIcon = document.getElementById('platform-icon');
            this.elements.platformName = document.getElementById('platform-name');
        }

        // 隐藏全局返回按钮
        this.elements.btnReset?.classList.add('hidden');

        // 隐藏播放列表
        document.getElementById('playlist-info')?.classList.add('hidden');

        // 恢复"支持的平台"区域
        document.querySelector('.platforms-label')?.classList.remove('hidden');
        document.querySelector('.platforms-container')?.classList.remove('hidden');
    }

    toggleFormatUI(format, isPlaylist = false) {
        const e = this.elements;
        const isAudio = format === 'audio';

        if (isPlaylist) {
            if (isAudio) {
                e.plVideoQualityGroup?.classList.add('hidden');
                e.plAudioQualityGroup?.classList.remove('hidden');
                e.plAudioFormatGroup?.classList.remove('hidden');
            } else {
                e.plVideoQualityGroup?.classList.remove('hidden');
                e.plAudioQualityGroup?.classList.add('hidden');
                e.plAudioFormatGroup?.classList.add('hidden');
            }
        } else {
            if (isAudio) {
                e.videoQualityGroup?.classList.add('hidden');
                e.audioQualityGroup?.classList.remove('hidden');
                e.audioFormatGroup?.classList.remove('hidden');
                // 音频模式下禁用字幕选项
                if (e.downloadSubtitles) {
                    e.downloadSubtitles.checked = false;
                    e.downloadSubtitles.parentElement.classList.add('opacity-50', 'pointer-events-none');
                }
            } else {
                e.videoQualityGroup?.classList.remove('hidden');
                e.audioQualityGroup?.classList.add('hidden');
                e.audioFormatGroup?.classList.add('hidden');
                // 视频模式下启用字幕选项
                if (e.downloadSubtitles) {
                    e.downloadSubtitles.parentElement.classList.remove('opacity-50', 'pointer-events-none');
                }
            }
        }
    }

    resetUI() {
        this.hideSkeleton(); // Hide skeleton on reset
        const e = this.elements;
        e.videoInfo?.classList.add('hidden');
        e.downloadOptions?.classList.add('hidden');
        e.heroSection?.classList.remove('compact');
        e.urlInput.value = '';
        this.manager.videoInfo = null;
        this.manager.playlistInfo = null; // 🆕 修复：同时清空播放列表信息
        this.manager.lastDownloadedFilePath = null;
        e.postDownloadActions?.classList.add('hidden');
        e.btnReset?.classList.add('hidden');

        // 隐藏播放列表
        document.getElementById('playlist-info')?.classList.add('hidden');

        // 恢复"支持的平台"区域
        document.querySelector('.platforms-label')?.classList.remove('hidden');
        document.querySelector('.platforms-container')?.classList.remove('hidden');

        // 彻底重置所有质量按钮的显示和状态
        document.querySelectorAll('.quality-btn').forEach(btn => {
            const q = btn.dataset.quality;
            if (q) btn.textContent = `${q}p`;
            btn.disabled = false;
            btn.classList.remove('unavailable');
            btn.classList.remove('disabled'); // 确保兼容
        });
    }

    // ... rest of the class


    updateTrimUI(start, end, total) { this.infoUI.updateTrimUI(start, end, total); }

    updateProgress(data, speedMonitor) {
        this.progressUI.updateProgress(data, speedMonitor);
    }

    drawSpeedChart(data) {
        this.progressUI.drawSpeedChart(data);
    }

    renderPlaylistInfo(info, selectedItems) {
        this.playlistUI?.renderPlaylistInfo?.(info, selectedItems);
    }

    updateCardProgress(index, percent) {
        this.playlistUI?.updateCardProgress?.(index, percent);
    }

    setCardStatus(index, status) {
        this.playlistUI?.setCardStatus?.(index, status);
    }

    updateOverallPlaylistProgress(completed, total) {
        this.playlistUI?.updateOverallProgress?.(completed, total);
    }

    updatePlaylistCount(selected, total) {
        this.playlistUI?.updatePlaylistCount?.(selected, total);
    }



    showProgressUI(show) {
        this.progressUI.showProgressUI(show);
    }

    resetProgress() {
        this.progressUI.resetProgress();
    }
}

window.DownloadUIManager = DownloadUIManager;
