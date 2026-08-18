/**
 * HistoryUI.js
 * 负责渲染历史记录的 DOM 结构，处理空状态、统计更新和批量操作栏 UI
 */

class HistoryUI {
    constructor(app, defaultThumb) {
        this.app = app;
        this.DEFAULT_THUMBNAIL = defaultThumb;
        // 回调事件
        this.onItemClick = null;
        this.onItemCheckboxChange = null;
        this.onOpenFolder = null;
        this.onDelete = null;
        this.onShareMobile = null;
    }

    showLoadingTasks() {
        const list = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');
        const noResults = document.getElementById('history-no-results');

        if (!list) return;

        list.innerHTML = Array(5).fill(0).map(() => `
            <div class="history-item skeleton-list-item">
                <div class="skeleton skeleton-thumb" style="width:120px;height:68px;"></div>
                <div class="history-info" style="width: 100%; display:flex; flex-direction:column; gap:8px;">
                    <div class="skeleton skeleton-text" style="width: 60%;"></div>
                    <div class="skeleton skeleton-text short" style="width: 40%; opacity:0.6;"></div>
                </div>
            </div>
        `).join('');

        empty?.classList.add('hidden');
        noResults?.classList.add('hidden');
    }

    updateStats(filteredCount, totalCount, isFiltering) {
        const stats = document.getElementById('history-stats');
        if (!stats) return;

        if (isFiltering) {
            const text = window.i18n?.t('history.stats.filtered', { filtered: filteredCount, total: totalCount }) || `Showing ${filteredCount} / ${totalCount} records`;
            stats.textContent = text;
        } else {
            const text = window.i18n?.t('history.stats.total', { total: totalCount }) || `Total ${totalCount} records`;
            stats.textContent = text;
        }
    }

    updateBatchUI(selectedCount) {
        const root = document.getElementById('page-history') || document;
        const byId = (id) => root.querySelector?.(`#${id}`) || document.getElementById(id);
        const batchCount = byId('batch-count');
        const btnDelete = byId('btn-history-batch-delete');
        const btnExport = byId('btn-batch-export');

        if (batchCount) batchCount.textContent = window.i18n?.t('history.batch.selected', { count: selectedCount }) || `${selectedCount} selected`;
        if (btnDelete) btnDelete.disabled = selectedCount === 0;
        if (btnExport) btnExport.disabled = selectedCount === 0;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    updatePlatformFilter(platforms, currentFilter) {
        const select = document.getElementById('filter-platform');
        if (!select) return;

        const allText = window.i18n?.t('history.filter.allPlatforms') || 'All Platforms';
        const otherText = window.i18n?.t('history.filter.other') || 'Other';

        select.innerHTML = '';
        const createOption = (value, text, selected = false) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            option.selected = selected;
            select.appendChild(option);
        };

        createOption('', allText);
        
        platforms.sort().forEach(p => {
            if (!p) return;
            // 尝试进行首字母大写或美化
            const displayName = p.charAt(0).toUpperCase() + p.slice(1);
            const value = p.toLowerCase();
            createOption(value, displayName, currentFilter === value);
        });

        createOption('other', otherText, currentFilter === 'other');
    }

    renderHistory(filteredHistory, selectedIds, missingFileIds, totalCount) {
        const list = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');
        const noResults = document.getElementById('history-no-results');

        if (!list) return;

        // 全空状态
        if (totalCount === 0) {
            list.innerHTML = '';
            if (empty && window.EmptyState) {
                empty.innerHTML = '';
                empty.classList.remove('hidden');

                const emptyState = new window.EmptyState({
                    // History-appropriate glyph (clock), optically centered in the icon tile
                    icon: `<span class="empty-state-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></span>`,
                    title: window.i18n?.t('history.emptyTitle') || 'No history yet',
                    desc: window.i18n?.t('history.emptyDesc') || 'Captured media will show up here for quick review and management.',
                    action: {
                        text: window.i18n?.t('history.goDownload') || 'Capture your first video',
                        icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
                        onClick: () => {
                            const btn = document.querySelector('[data-page="download"]');
                            if (btn) btn.click();
                        }
                    }
                });
                empty.appendChild(emptyState.getElement());
            } else {
                empty?.classList.remove('hidden');
            }
            noResults?.classList.add('hidden');
            this.updateStats(0, 0, false);
            return;
        }

        // 搜索无结果 空状态
        if (filteredHistory.length === 0) {
            list.innerHTML = '';
            if (noResults && window.EmptyState) {
                noResults.innerHTML = '';
                noResults.classList.remove('hidden');

                const emptyState = new window.EmptyState({
                    icon: `<span class="empty-state-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg></span>`,
                    title: window.i18n?.t('history.noResultsTitle') || 'No matching records',
                    desc: window.i18n?.t('history.noResultsDesc') || 'Try another keyword or clear filters.',
                    action: {
                        text: window.i18n?.t('history.clearSearchBtn') || 'Clear search',
                        icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>`,
                        onClick: () => {
                            if (document.getElementById('btn-clear-search')) {
                                document.getElementById('btn-clear-search').click();
                            }
                        }
                    }
                });
                noResults.appendChild(emptyState.getElement());
            } else {
                noResults?.classList.remove('hidden');
            }
            empty?.classList.add('hidden');
            this.updateStats(0, totalCount, true);
            return;
        }

        // 正常渲染列表
        empty?.classList.add('hidden');
        noResults?.classList.add('hidden');
        list.innerHTML = '';

        filteredHistory.forEach((item, index) => {
            const isDeleted = missingFileIds.has(item.id);

            const div = document.createElement('div');
            div.className = `history-item ${isDeleted ? 'deleted' : ''}`;
            div.id = `history-item-${item.id}`;
            div.dataset.id = item.id;
            div.dataset.index = index;

            if (selectedIds.has(item.id)) div.classList.add('selected');

            div.style.animation = 'fadeInSlideUp 0.3s ease forwards';
            div.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
            div.style.opacity = '0';

            const date = this.escapeHtml(new Date(item.timestamp).toLocaleString());
            const sizeLabel = item.fileSize ? this.escapeHtml(this.formatFileSize(item.fileSize)) : '';
            const fileSizeStr = sizeLabel
                ? `<span class="meta-item" title="${sizeLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>${sizeLabel}</span>`
                : '';
            const thumbSrc = this.escapeHtml(item.thumbnail || this.DEFAULT_THUMBNAIL);
            const title = this.escapeHtml(item.title || '');
            const platform = this.escapeHtml(item.platform || '');

            const deletedTag = isDeleted ? `<span class="tag-deleted">${this.escapeHtml(window.i18n?.t('history.deletedTag') || 'Notification')}</span>` : '';
            const openBtnStyle = isDeleted ? 'style="opacity:0.5; cursor:not-allowed"' : '';
            const openBtnTitle = this.escapeHtml(isDeleted ? (window.i18n?.t('history.fileDeleted') || 'Notification') : (window.i18n?.t('history.openFolder') || 'Notification'));
            const shareTitle = this.escapeHtml(window.i18n?.t('history.shareMobile') || 'Notification');
            const deleteTitle = this.escapeHtml(window.i18n?.t('history.delete') || 'Notification');

            div.innerHTML = `
                <input type="checkbox" class="history-item-checkbox" ${selectedIds.has(item.id) ? 'checked' : ''}>
                <img class="history-thumb" src="${thumbSrc}" loading="lazy">
                <div class="history-info">
                    <div class="history-title" title="${title}">
                        ${title}
                        ${deletedTag}
                    </div>
                    <div class="history-meta">
                        <span class="meta-item" title="${date}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            ${date}
                        </span>
                        ${fileSizeStr}
                        <span class="meta-item" title="${platform}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            ${platform}
                        </span>
                    </div>
                </div>
                <div class="history-actions">
                    <button type="button" class="btn-icon btn-share-mobile" title="${shareTitle}" ${openBtnStyle} aria-label="${shareTitle}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </button>
                    <button type="button" class="btn-icon btn-open-folder" title="${openBtnTitle}" ${openBtnStyle} aria-label="${openBtnTitle}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    </button>
                    <button type="button" class="btn-icon danger btn-delete-item" title="${deleteTitle}" aria-label="${deleteTitle}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            `;

            // 绑定事件
            const checkbox = div.querySelector('.history-item-checkbox');
            checkbox?.addEventListener('change', (e) => {
                e.stopPropagation();
                if (e.target.checked) div.classList.add('selected');
                else div.classList.remove('selected');

                if (this.onItemCheckboxChange) this.onItemCheckboxChange(item.id, e.target.checked);
            });

            div.querySelector('.btn-open-folder')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onOpenFolder) this.onOpenFolder(item);
            });
            div.querySelector('.btn-delete-item')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onDelete) this.onDelete(item.id);
            });
            div.querySelector('.btn-share-mobile')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onShareMobile) this.onShareMobile(item.filePath, item.title);
            });

            const thumbImg = div.querySelector('.history-thumb');
            thumbImg?.addEventListener('error', () => {
                if (thumbImg.src !== this.DEFAULT_THUMBNAIL) thumbImg.src = this.DEFAULT_THUMBNAIL;
            });

            list.appendChild(div);
        });

        const isFiltering = filteredHistory.length < totalCount;
        this.updateStats(filteredHistory.length, totalCount, isFiltering);
    }

    markItemAsDeleted(id) {
        const el = document.getElementById(`history-item-${id}`);
        if (!el) return;
        el.classList.add('deleted');

        const titleEl = el.querySelector('.history-title');
        if (titleEl && !titleEl.querySelector('.tag-deleted')) {
            const tag = document.createElement('span');
            tag.className = 'tag-deleted';
            tag.textContent = window.i18n?.t('history.deletedTag') || 'Notification';
            titleEl.appendChild(tag);
        }

        const openBtn = el.querySelector('.btn-open-folder');
        if (openBtn) {
            openBtn.style.opacity = '0.5';
            openBtn.title = window.i18n?.t('history.fileDeleted') || 'Notification';
            openBtn.style.cursor = 'not-allowed';
        }
        const shareBtn = el.querySelector('.btn-share-mobile');
        if (shareBtn) {
            shareBtn.style.opacity = '0.5';
            shareBtn.style.cursor = 'not-allowed';
        }
    }

    markItemAsRestored(id) {
        const el = document.getElementById(`history-item-${id}`);
        if (!el) return;
        el.classList.remove('deleted');
        // 可选：如果被清理恢复，清理对应的样式，这里只移除 class 就够，下一次刷新列表会全恢复
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

window.HistoryUI = HistoryUI;
