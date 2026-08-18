/**
 * VideoInfoUIManager.js
 * 处理视频信息的详细属性渲染、骨架屏显示以及剪辑/比特率 UI 更新。
 */
class VideoInfoUIManager {
    constructor(ui) {
        this.ui = ui;
        this.manager = ui.manager;
    }

    showSkeleton() {
        const infoDiv = this.ui.elements.videoInfo;
        if (!infoDiv) return;

        infoDiv.classList.remove('hidden');
        this.ui.elements.downloadOptions?.classList.add('hidden');

        let overlay = infoDiv.querySelector('.video-info-skeleton');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'video-info-skeleton';
            overlay.style.cssText = 'position:absolute; inset:0; background:var(--bg-card); z-index:10; display:flex; padding:24px; gap:24px;';
            overlay.innerHTML = `
                <div class="skeleton skeleton-thumb" style="width:180px; height:100px;"></div>
                <div class="skeleton skeleton-content" style="flex:1;">
                    <div class="skeleton skeleton-text short" style="height:24px; margin-bottom:12px;"></div>
                    <div class="skeleton skeleton-text long"></div>
                    <div class="skeleton skeleton-text short" style="width:30%;"></div>
                </div>
            `;
            infoDiv.style.position = 'relative';
            infoDiv.appendChild(overlay);
        }
        overlay.classList.remove('hidden');
    }

    hideSkeleton() {
        const overlay = this.ui.elements.videoInfo?.querySelector('.video-info-skeleton');
        if (overlay) overlay.classList.add('hidden');
    }

    renderVideoInfo(info) {
        this.hideSkeleton();

        const e = this.ui.elements;
        if (!info) return;

        e.heroSection?.classList.add('compact');
        e.videoInfo?.classList.remove('hidden');
        e.downloadOptions?.classList.remove('hidden');

        // 显示全局返回按钮
        e.btnReset?.classList.remove('hidden');

        // 隐藏播放列表和支持平台区域
        document.getElementById('playlist-info')?.classList.add('hidden');
        document.querySelector('.platforms-label')?.classList.add('hidden');
        document.querySelector('.platforms-container')?.classList.add('hidden');

        // 缩略图处理
        if (e.thumbnail) {
            const thumbUrl = info.thumbnail || window.DEFAULT_THUMBNAIL;
            const needsProxy = /instagram|cdninstagram|fbcdn|tiktok|douyin|byteimg|tiktokcdn|bdydns/i.test(thumbUrl);

            if (needsProxy && window.mediaflow?.image?.proxy) {
                window.mediaflow.image.proxy(thumbUrl).then(dataUrl => {
                    if (dataUrl && e.thumbnail) e.thumbnail.src = dataUrl;
                }).catch(() => { if (e.thumbnail) e.thumbnail.src = thumbUrl; });
            } else {
                e.thumbnail.src = thumbUrl;
            }
        }

        if (e.title) e.title.textContent = info.title || 'Notification';
        if (e.author) e.author.textContent = info.uploader || 'Notification';
        if (e.duration) {
            e.duration.textContent = info.duration ? this.manager.service.formatDuration(info.duration) : '--:--';
        }

        this.renderPlatformInfo(info);
        this.renderQualities(info);

        // 初始化剪辑 UI
        if (e.trimGroup && info.duration) {
            e.trimGroup.classList.remove('hidden');
            e.trimStart.max = info.duration;
            e.trimEnd.max = info.duration;
            e.trimStart.value = 0;
            e.trimEnd.value = info.duration;
            this.updateTrimUI(0, info.duration, info.duration);
        }

        this.updateAudioBitrateUI(info);
    }

    renderPlatformInfo(info) {
        const e = this.ui.elements;
        let platformObj = null;

        if (e.platformIcon) {
            e.platformIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8l6 4-6 4V8z"/></svg>';
            e.platformIcon.className = '';
        }
        if (e.platformName) e.platformName.textContent = 'VIDEO';
        if (e.platformBadge) e.platformBadge.className = 'meta-item platform';

        if (info.platform && window.platformRegistry?.getByKey) {
            platformObj = window.platformRegistry.getByKey(info.platform);
        }
        if (!platformObj) {
            platformObj = window.platformRegistry?.detect(info.url);
        }
        if (platformObj && e.platformName && e.platformIcon) {
            e.platformName.textContent = platformObj.getDisplayName().toUpperCase();
            if (e.platformBadge) e.platformBadge.className = 'meta-item platform ' + platformObj.key;
            if (platformObj.getIconSVG) {
                e.platformIcon.innerHTML = platformObj.getIconSVG();
            } else {
                e.platformIcon.innerHTML = '';
                e.platformIcon.className = platformObj.getIconClass();
            }
        }
    }

    renderQualities(info) {
        if (!info.qualities || !this.ui.elements.downloadOptions) return;
        this.ui.elements.downloadOptions.querySelectorAll('.quality-btn').forEach(btn => {
            const q = btn.dataset.quality;
            const data = info.qualities[q];
            btn.disabled = !(data && data.available);
            btn.classList.toggle('unavailable', !data?.available);
            if (data?.available) {
                btn.textContent = `${q}p ${data.totalSize > 0 ? '(' + this.manager.service.formatFileSize(data.totalSize) + ')' : ''}`;
            } else {
                btn.textContent = `${q}p`;
            }
        });
    }

    updateAudioBitrateUI(info) {
        if (!info || !info.audioBitrates) return;
        const format = this.manager.audioFormat;
        const isLossless = format === 'wav' || format === 'flac';

        document.querySelectorAll('.audio-btn').forEach(btn => {
            const br = btn.dataset.bitrate;
            if (isLossless) {
                const data = info.audioBitrates[format];
                btn.textContent = `Lossless ${data?.size ? '(' + this.manager.service.formatFileSize(data.size) + ')' : ''}`;
            } else {
                const data = info.audioBitrates[br];
                btn.textContent = `${br} kbps ${data?.size ? '(' + this.manager.service.formatFileSize(data.size) + ')' : ''}`;
            }
        });
    }

    updateTrimUI(start, end, total) {
        const e = this.ui.elements;
        const startPercent = (start / total) * 100;
        const endPercent = (end / total) * 100;
        if (e.trimRangeFill) {
            e.trimRangeFill.style.left = `${startPercent}%`;
            e.trimRangeFill.style.width = `${endPercent - startPercent}%`;
        }
        if (e.trimStartTime) e.trimStartTime.textContent = this.manager.service.formatTimestamp(start);
        if (e.trimEndTime) e.trimEndTime.textContent = this.manager.service.formatTimestamp(end);

        const duration = end - start;
        if (e.trimDurationLabel) {
            e.trimDurationLabel.textContent =
                duration >= total
                    ? window.i18n?.t('download.fullLength') || 'Full length'
                    : window.i18n?.t('download.clipDuration', {
                          duration: this.manager.service.formatDuration(duration)
                      }) || `Clip: ${this.manager.service.formatDuration(duration)}`;
            e.trimDurationLabel.style.color = duration >= total ? 'var(--text-muted)' : 'var(--accent-primary)';
        }
    }
}

window.VideoInfoUIManager = VideoInfoUIManager;
