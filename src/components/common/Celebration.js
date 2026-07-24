/**
 * Celebration.js
 * 下载完成庆祝组件
 * 整合 Confetti 动画 + 成果展示卡片
 */
class Celebration {
    constructor() {
        this.confetti = null;
        this.modal = null;
    }

    /**
     * 显示庆祝效果
     * @param {Object} result - 下载结果信息
     *   - title: 视频标题
     *   - filePath: 文件路径
     *   - quality: 画质
     *   - fileSize: 文件大小 (bytes)
     *   - elapsed: 下载用时 (秒)
     *   - thumbnail: 缩略图 URL
     */
    show(result) {
        // Light confetti only once (professional: subtle, not carnival)
        if (window.Confetti) {
            this.confetti = new window.Confetti({
                particleCount: 48,
                duration: 1600
            });
            this.confetti.fire();
        }

        // 2. 显示成果卡片
        this._showResultCard(result);
    }

    /**
     * 显示成果卡片
     */
    _showResultCard(result) {
        // 移除已存在的弹窗
        this._removeExisting();

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'celebration-overlay';
        overlay.id = 'celebration-overlay';

        // 创建卡片
        const card = document.createElement('div');
        card.className = 'celebration-card';
        card.id = 'celebration-card';

        // 格式化数据
        const fileName = this._getFileName(result.filePath || '');
        const fileSize = this._formatFileSize(result.fileSize || 0);
        const elapsed = this._formatDuration(result.elapsed || 0);
        const rawThumbnail = result.thumbnail || this._getDefaultThumbnail();

        const t = (key, fallback) => window.i18n?.t(key) || fallback;
        const esc = (str) => String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const quality = esc(result.quality || '720p');
        card.innerHTML = `
            <div class="celebration-header">
                <div class="celebration-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12.5l2.5 2.5L16 9.5"/>
                    </svg>
                </div>
                <h2 class="celebration-title">${t('download.celebration.title', '保存完成')}</h2>
                <p class="celebration-subtitle">${t('download.celebration.subtitle', '文件已在本地，可继续处理')}</p>
            </div>
            
            <div class="celebration-content">
                <div class="celebration-thumb-container">
                    <img class="celebration-thumb" id="celebration-thumb" src="${this._getDefaultThumbnail()}" alt="${t('download.celebration.thumbAlt', '缩略图')}">
                </div>
                <div class="celebration-meta">
                    <div class="celebration-filename" title="${esc(fileName)}">${esc(this._truncate(fileName, 40))}</div>
                    <div class="celebration-stats">
                        <span class="stat-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                            ${quality}
                        </span>
                        <span class="stat-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                            ${esc(fileSize)}
                        </span>
                        <span class="stat-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            ${esc(elapsed)}
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="celebration-actions">
                <button type="button" class="btn btn-secondary" id="btn-celebration-folder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${t('download.celebration.openFolder', '打开文件夹')}
                </button>
                <button type="button" class="btn btn-secondary" id="btn-celebration-play">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
                        <polygon points="6 3 20 12 6 21 6 3"></polygon>
                    </svg>
                    ${t('download.celebration.play', '播放')}
                </button>
                <button type="button" class="btn btn-primary" id="btn-celebration-close">
                    ${t('download.celebration.continue', '继续保存')}
                </button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        this.modal = overlay;

        // 🆕 处理缩略图代理 (解决跨域显示问题)
        const thumbImg = card.querySelector('#celebration-thumb');
        if (thumbImg && rawThumbnail && !rawThumbnail.startsWith('data:')) {
            const needsProxy = /instagram|cdninstagram|fbcdn|tiktok|douyin|byteimg|tiktokcdn|bdydns/i.test(rawThumbnail);
            if (needsProxy && window.mediaflow?.image?.proxy) {
                window.mediaflow.image.proxy(rawThumbnail).then(dataUrl => {
                    if (dataUrl && thumbImg) thumbImg.src = dataUrl;
                }).catch(() => { if (thumbImg) thumbImg.src = rawThumbnail; });
            } else {
                thumbImg.src = rawThumbnail;
            }
        }

        // 绑定事件
        this._bindEvents(result);

        // Auto-dismiss after a short beat (still cancelable by any action / Esc)
        this.autoCloseTimer = setTimeout(() => {
            if (this.modal) this.hide();
        }, 8000);
    }

    /**
     * 绑定按钮事件
     */
    _bindEvents(result) {
        const overlay = document.getElementById('celebration-overlay');
        const btnFolder = document.getElementById('btn-celebration-folder');
        const btnPlay = document.getElementById('btn-celebration-play');
        const btnClose = document.getElementById('btn-celebration-close');

        // 点击遮罩关闭
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) this.hide();
        });

        // 打开文件夹
        btnFolder?.addEventListener('click', () => {
            if (result.filePath && window.mediaflow?.shell?.showItemInFolder) {
                window.mediaflow.shell.showItemInFolder(result.filePath);
            }
            this.hide();
        });

        // 播放视频
        btnPlay?.addEventListener('click', () => {
            if (result.filePath && window.mediaflow?.shell?.openPath) {
                window.mediaflow.shell.openPath(result.filePath);
            }
            this.hide();
        });

        // 关闭 (继续下载)
        btnClose?.addEventListener('click', () => {
            if (window.downloadManager && typeof window.downloadManager.resetUI === 'function') {
                window.downloadManager.resetUI();
            }
            this.hide();
        });

        // ESC 关闭
        this._escHandler = (e) => {
            if (e.key === 'Escape') this.hide();
        };
        document.addEventListener('keydown', this._escHandler);
    }

    /**
     * 隐藏弹窗
     */
    hide() {
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }

        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        const overlay = document.getElementById('celebration-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }

        this.modal = null;
    }

    /**
     * 移除已存在的弹窗
     */
    _removeExisting() {
        const existing = document.getElementById('celebration-overlay');
        if (existing) existing.remove();
    }

    /**
     * 工具方法：获取文件名
     */
    _getFileName(filePath) {
        const t = (key, fallback) => window.i18n?.t(key) || fallback;
        if (!filePath) return t('download.celebration.unknownFile', '未知文件');
        const parts = filePath.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || 'Notification';
    }

    /**
     * 工具方法：格式化文件大小
     */
    _formatFileSize(bytes) {
        const t = (key, fallback) => window.i18n?.t(key) || fallback;
        if (!bytes || bytes === 0) return t('download.celebration.unknownSize', '未知大小');
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 工具方法：格式化时长
     */
    _formatDuration(seconds) {
        const t = (key, fallback) => window.i18n?.t(key) || fallback;
        if (!seconds || seconds === 0) return t('download.celebration.unknownTime', '未知');
        
        const secUnit = t('download.celebration.second', '秒');
        const minUnit = t('download.celebration.minute', '分');

        if (seconds < 60) return `${Math.round(seconds)}${secUnit}`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}${minUnit}${secs}${secUnit}`;
    }

    /**
     * 工具方法：截断文本
     */
    _truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
    }

    /**
     * 工具方法：默认缩略图
     */
    _getDefaultThumbnail() {
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iNjgiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNjgiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI2MCIgeT0iMzgiIGZpbGw9IiM2NjYiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn46sPC90ZXh0Pjwvc3ZnPg==';
    }
}

// 导出到全局
window.Celebration = Celebration;
