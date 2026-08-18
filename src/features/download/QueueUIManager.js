/**
 * QueueUIManager.js
 * 负责下载队列的 UI 渲染和动态更新
 */
class QueueUIManager {
    constructor(queueManager) {
        this.queueManager = queueManager;
        this.app = queueManager.app;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 渲染全局下载队列列表
     * @param {Array} queue 队列数据
     */
    render(queue) {
        const container = document.getElementById('global-queue-list');
        if (!container) return;

        if (!queue || queue.length === 0) {
            container.innerHTML = `
                <div class="queue-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <p>${window.i18n?.t('queue.empty') || 'Notification'}</p>
                </div>`;
            this.updateDashboard(0, 0);
            return;
        }

        // 渲染队列项
        container.innerHTML = queue.map(item => this.getItemHTML(item)).join('');
        this.bindQueueEvents(container);

        // 更新仪表盘统计
        const completed = queue.filter(i => i.status === 'completed').length;
        this.updateDashboard(completed, queue.length);
    }

    /**
     * 获取单个队列项的 HTML
     */
    getItemHTML(item) {
        const statusIcons = {
            pending: '⏳',
            queued: '📋',
            downloading: '⬇️',
            processing: '⚙️',
            completed: '✅',
            failed: '❌',
            paused: '⏸️'
        };
        const statusIcon = statusIcons[item.status] || '📄';
        const statusText = {
            pending: window.i18n?.t('queue.statusPending') || 'Notification',
            queued: window.i18n?.t('queue.statusQueued') || 'Notification',
            downloading: window.i18n?.t('queue.statusDownloading') || 'Notification',
            processing: window.i18n?.t('queue.statusProcessing') || 'Notification',
            completed: window.i18n?.t('queue.statusCompleted') || 'Notification',
            failed: window.i18n?.t('queue.statusFailed') || 'Operation failed',
            paused: window.i18n?.t('queue.statusPaused') || 'Notification'
        }[item.status] || item.status;

        const itemId = String(item.id ?? '');
        const itemIdAttr = this.escapeHtml(itemId);
        const statusClass = this.escapeHtml(String(item.status || 'pending').replace(/[^\w-]/g, ''));
        const displayTitle = item.title || (window.i18n?.t('download.checking') || 'Notification');
        const safeTitle = this.escapeHtml(displayTitle);
        const safeStatusText = this.escapeHtml(statusText);
        const safeError = this.escapeHtml(item.error || '');
        const thumbUrl = this.escapeHtml(item.thumbnail || window.DEFAULT_THUMBNAIL || '');
        const resultFileAttr = this.escapeHtml(item.result?.file || '');
        const openFolderTitle = this.escapeHtml(window.i18n?.t('download.openFolder') || 'Notification');
        const resumeTitle = this.escapeHtml(window.i18n?.t('download.resume') || 'Notification');
        const pauseTitle = this.escapeHtml(window.i18n?.t('download.pause') || 'Notification');
        const retryTitle = this.escapeHtml(window.i18n?.t('quality.retry') || 'Notification');
        const removeTitle = this.escapeHtml(window.i18n?.t('common.actions.remove') || 'Notification');
        const reorderUpTitle = this.escapeHtml(window.i18n?.t('queue.reorderUp') || 'Notification');
        const reorderDownTitle = this.escapeHtml(window.i18n?.t('queue.reorderDown') || 'Notification');
        const thumbHtml = thumbUrl
            ? `<img class="queue-thumb-img" src="${thumbUrl}" alt="">
               <div class="queue-thumb-placeholder" style="display:none; align-items:center; justify-content:center; width:100%; height:100%; background:var(--bg-tertiary); color:var(--text-muted); font-size:24px;">🎬</div>`
            : '<div class="queue-thumb-placeholder" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--bg-tertiary); color:var(--text-muted); font-size:24px;">🎬</div>';

        let details = [`<span class="queue-item-status">${statusIcon} ${item.status === 'downloading' ? `${Math.round(item.progress || 0)}%` : safeStatusText}</span>`];

        if (item.totalBytes) {
            const sizeStr = this.app.downloadManager?.service?.formatFileSize
                ? this.app.downloadManager.service.formatFileSize(item.totalBytes)
                : (item.totalBytes / 1024 / 1024).toFixed(1) + ' MB';
            details.push(`<span class="queue-item-size" style="margin-left:8px; color:var(--text-muted); font-size:11px;">📦 ${this.escapeHtml(sizeStr)}</span>`);
        }

        if (item.status === 'downloading' && item.speed) {
            details.push(`<span class="queue-item-speed" style="margin-left:8px; color:var(--accent-primary); font-size:11px;">⚡ ${this.escapeHtml(item.speed)}</span>`);
        }

        // 注意：onclick 绑定需要全局 app 变量
        return `
            <div class="queue-item ${statusClass}" id="queue-item-${itemIdAttr}" data-id="${itemIdAttr}">
                <div class="queue-item-thumb">${thumbHtml}</div>
                <div class="queue-item-info">
                    <div class="queue-item-title" title="${safeTitle}">${safeTitle}</div>
                    <div class="queue-item-row-sub">${details.join('')}</div>
                    ${item.error ? `<div class="queue-item-error" title="${safeError}">${safeError}</div>` : ''}
                </div>
                <div class="queue-item-controls">
                    <div class="reorder-btns">
                        <button class="queue-control-btn" data-action="move-up" title="${reorderUpTitle}">▲</button>
                        <button class="queue-control-btn" data-action="move-down" title="${reorderDownTitle}">▼</button>
                    </div>
                    ${item.status === 'completed' && item.result?.file ? `<button class="queue-control-btn" data-action="show-file" data-file="${resultFileAttr}" title="${openFolderTitle}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg></button>` : ''}
                    ${item.status === 'paused' ? `<button class="queue-control-btn" data-action="resume" title="${resumeTitle}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
                    ${item.status === 'downloading' || item.status === 'pending' || item.status === 'queued' ? `<button class="queue-control-btn" data-action="pause" title="${pauseTitle}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>` : ''}
                    ${item.status === 'failed' ? `<button class="queue-control-btn" data-action="resume" title="${retryTitle}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>` : ''}
                    <button class="queue-control-btn q-remove" data-action="remove" title="${removeTitle}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </div>
            </div>
        `;
    }

    /**
     * 更新仪表盘统计
     */
    bindQueueEvents(container) {
        if (this.queueEventContainer === container && this.queueClickHandler && this.queueImageErrorHandler) {
            return;
        }

        if (this.queueEventContainer) {
            this.queueEventContainer.removeEventListener('click', this.queueClickHandler);
            this.queueEventContainer.removeEventListener('error', this.queueImageErrorHandler, true);
        }

        this.queueEventContainer = container;
        this.queueClickHandler = (event) => {
            const button = event.target?.closest?.('[data-action]');
            if (!button || !container.contains(button)) return;

            const itemId = button.closest('.queue-item')?.dataset.id;
            const action = button.dataset.action;

            if (action === 'move-up' && itemId) {
                this.queueManager.moveItem(itemId, 'up');
            } else if (action === 'move-down' && itemId) {
                this.queueManager.moveItem(itemId, 'down');
            } else if (action === 'show-file') {
                const file = button.dataset.file;
                if (file) window.mediaflow?.shell?.showItemInFolder?.(file);
            } else if (action === 'resume' && itemId) {
                this.queueManager.resumeTask(itemId);
            } else if (action === 'pause' && itemId) {
                this.queueManager.pauseTask(itemId);
            } else if (action === 'remove' && itemId) {
                this.queueManager.remove(itemId);
            }
        };
        this.queueImageErrorHandler = (event) => {
            const image = event.target;
            if (!image?.classList?.contains('queue-thumb-img')) return;

            image.style.display = 'none';
            const fallback = image.nextElementSibling;
            if (fallback) fallback.style.display = 'flex';
        };

        container.addEventListener('click', this.queueClickHandler);
        container.addEventListener('error', this.queueImageErrorHandler, true);
    }

    updateDashboard(completed, total) {
        const dashCount = document.getElementById('queue-dash-count');
        const dashPercent = document.getElementById('queue-dash-percent');
        const progressFill = document.getElementById('queue-global-progress');

        const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

        if (dashCount) dashCount.textContent = `${completed}/${total}`;
        if (dashPercent) dashPercent.textContent = `${overallProgress}%`;
        if (progressFill) progressFill.style.width = `${overallProgress}%`;
    }

    /**
     * 增量更新进度
     */
    updateItemProgress(item, data) {
        const queueItemDiv = document.getElementById(`queue-item-${item.id}`);
        if (!queueItemDiv) return;

        const statusSpan = queueItemDiv.querySelector('.queue-item-status');
        if (statusSpan) {
            statusSpan.textContent = `⬇️ ${Math.round(data.progress)}%`;
        }

        let speedSpan = queueItemDiv.querySelector('.queue-item-speed');
        if (data.speed) {
            if (!speedSpan) {
                const rowSub = queueItemDiv.querySelector('.queue-item-row-sub');
                if (rowSub) {
                    speedSpan = document.createElement('span');
                    speedSpan.className = 'queue-item-speed';
                    speedSpan.style.cssText = 'margin-left:8px; color:var(--accent-primary); font-size:11px;';
                    rowSub.appendChild(speedSpan);
                }
            }
            if (speedSpan) {
                speedSpan.textContent = `⚡ ${data.speed}`;
            }
        }
    }
}

window.QueueUIManager = QueueUIManager;
