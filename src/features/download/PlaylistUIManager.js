/**
 * PlaylistUIManager.js
 * 专门处理播放列表的 UI 渲染与进度交互。
 */
class PlaylistUIManager {
    constructor(ui) {
        this.ui = ui;
        this.manager = ui.manager;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderPlaylistInfo(info, selectedItems) {
        // 隐藏骨架屏和主输入区，显示播放列表
        this.ui.hideSkeleton();
        this.ui.elements.heroSection?.classList.add('compact');
        this.ui.elements.videoInfo?.classList.add('hidden');
        this.ui.elements.downloadOptions?.classList.add('hidden');

        // 隐藏"支持的平台"区域
        document.querySelector('.platforms-label')?.classList.add('hidden');
        document.querySelector('.platforms-container')?.classList.add('hidden');

        const container = document.getElementById('playlist-items');
        if (!container) return;
        container.innerHTML = '';

        const titleEl = document.getElementById('playlist-title');
        if (titleEl) titleEl.textContent = window.i18n.t('download.playlist') || 'Notification';
        this.updatePlaylistCount(selectedItems.size, info.count);

        const selectAllCheckbox = document.getElementById('playlist-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.onclick = (e) => this.manager.handlePlaylistSelectAll(e.target.checked);
        }

        info.items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.dataset.index = index;
            const thumbnail = this.escapeHtml(item.thumbnail || window.DEFAULT_THUMBNAIL || '');
            const title = this.escapeHtml(item.title || 'Untitled');
            const duration = item.duration ? this.escapeHtml(this.manager.service.formatDuration(item.duration)) : '';
            div.innerHTML = `
                <input type="checkbox" class="playlist-checkbox" data-index="${index}" ${selectedItems.has(index) ? 'checked' : ''}>
                <span class="playlist-item-index">${index + 1}</span>
                <img class="playlist-item-thumb" src="${thumbnail}">
                <div class="playlist-item-info">
                    <div class="playlist-item-title">${title}</div>
                    <div class="playlist-item-duration">${duration}</div>
                </div>
                <div class="playlist-item-progress" data-status="pending">
                    <svg class="progress-ring" viewBox="0 0 36 36">
                        <circle class="progress-ring-bg" cx="18" cy="18" r="15.9"/>
                        <circle class="progress-ring-fill" cx="18" cy="18" r="15.9" 
                                stroke-dasharray="100, 100" stroke-dashoffset="100"/>
                    </svg>
                    <span class="progress-text">⏳</span>
                </div>
            `;
            const cb = div.querySelector('.playlist-checkbox');
            cb.addEventListener('change', (e) => this.manager.handlePlaylistItemSelect(index, e.target.checked));
            container.appendChild(div);
        });

        document.getElementById('playlist-info')?.classList.remove('hidden');
        const btnDownloadAll = document.getElementById('btn-download-all');
        if (btnDownloadAll) btnDownloadAll.onclick = () => this.manager.downloadPlaylist();

        // 显示并确认全局返回按钮绑定 (使用 ui.elements 中的引用)
        if (this.ui.elements.btnReset) {
            this.ui.elements.btnReset.classList.remove('hidden');
            this.ui.elements.btnReset.onclick = () => this.ui.resetUI();
        }

        // 重置播放列表画质按钮状态 (解除单视频解析的影响)
        const plQualityContainer = document.getElementById('pl-quality-buttons');
        if (plQualityContainer) {
            const platform = info.platform || (info.items?.[0]?.url ? window.platformRegistry?.detect(info.items[0].url)?.id : null);

            plQualityContainer.querySelectorAll('.quality-btn').forEach(btn => {
                const q = btn.dataset.quality;

                // 默认策略：TikTok 不支持 4K
                let isAvailable = true;
                if (platform === 'tiktok' && q === '2160') {
                    isAvailable = false;
                }

                btn.disabled = !isAvailable;
                btn.classList.toggle('unavailable', !isAvailable);
                btn.classList.remove('disabled'); // 清理旧的错误类名
                btn.textContent = `${q}p`; // 移除 (1.6 MB) 等单视频特有的文本
            });
        }
    }

    // 更新单个卡片的下载进度
    updateCardProgress(index, percent) {
        const card = document.querySelector(`.playlist-item[data-index="${index}"]`);
        if (!card) return;

        const progressContainer = card.querySelector('.playlist-item-progress');
        const ringFill = card.querySelector('.progress-ring-fill');
        const progressText = card.querySelector('.progress-text');

        if (progressContainer) progressContainer.dataset.status = 'downloading';
        if (ringFill) {
            ringFill.style.strokeDashoffset = 100 - percent;
        }
        if (progressText) progressText.textContent = `${percent}%`;
    }

    // 设置卡片状态 (pending / downloading / done / error)
    setCardStatus(index, status) {
        const card = document.querySelector(`.playlist-item[data-index="${index}"]`);
        if (!card) return;

        const progressContainer = card.querySelector('.playlist-item-progress');
        const progressText = card.querySelector('.progress-text');
        const ringFill = card.querySelector('.progress-ring-fill');

        if (progressContainer) progressContainer.dataset.status = status;

        switch (status) {
        case 'pending':
            if (progressText) progressText.textContent = '⏳';
            if (ringFill) ringFill.style.strokeDashoffset = 100;
            break;
        case 'downloading':
            if (progressText) progressText.textContent = '0%';
            break;
        case 'done':
            if (progressText) progressText.textContent = '✅';
            if (ringFill) ringFill.style.strokeDashoffset = 0;
            break;
        case 'error':
            if (progressText) progressText.textContent = '❌';
            break;
        }
    }

    // 更新整体播放列表进度
    updateOverallProgress(completed, total) {
        let bar = document.getElementById('playlist-overall-progress');
        if (!bar) {
            const playlistInfo = document.getElementById('playlist-info');
            if (!playlistInfo) return;
            bar = document.createElement('div');
            bar.id = 'playlist-overall-progress';
            bar.className = 'playlist-overall-progress';
            bar.innerHTML = `
                <div class="overall-progress-header">
                    <span class="overall-progress-label">📋 ${window.i18n?.t('download.playlistProgress') || 'Download Progress'}</span>
                    <span class="overall-progress-count">${completed}/${total}</span>
                    <button id="btn-cancel-playlist" style="margin-left: 15px; font-size: 12px; padding: 2px 8px; border-radius: 4px; background: var(--error); color: white; border: none; cursor: pointer;">${window.i18n.t('download.cancel') || 'Cancel'}</button>
                </div>
                <div class="overall-progress-bar">
                    <div class="overall-progress-fill" style="width: 0%"></div>
                </div>
            `;
            playlistInfo.insertBefore(bar, playlistInfo.firstChild);

            const btnCancelPlaylist = document.getElementById('btn-cancel-playlist');
            if (btnCancelPlaylist) {
                btnCancelPlaylist.onclick = () => {
                    if (this.manager.isDownloading) {
                        this.manager.cancelDownload();
                    }
                };
            }
        }

        const countEl = bar.querySelector('.overall-progress-count');
        const fillEl = bar.querySelector('.overall-progress-fill');
        if (countEl) countEl.textContent = `${completed}/${total}`;
        if (fillEl) fillEl.style.width = `${(completed / total) * 100}%`;
    }

    updatePlaylistCount(selected, total) {
        const el = document.getElementById('playlist-count');
        if (el) el.textContent = `${selected}/${total} ${window.i18n.t('download.videos') || 'Notification'}`;
    }
}

window.PlaylistUIManager = PlaylistUIManager;
