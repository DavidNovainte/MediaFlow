/**
 * HistoryEvents.js
 * 负责绑定历史记录相关的全局 DOM 事件（搜索、筛选、批量操作）以及右键菜单
 */

class HistoryEvents {
    constructor(app, service, ui) {
        this.app = app;
        this.service = service;
        this.ui = ui;
        this.searchDebounce = null;
    }

    bindAll() {
        this.bindGlobalEvents();
        this.initContextMenu();
        this.setupUICallbacks();
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    setupUICallbacks() {
        // UI Item的回调连接到 Service 逻辑或当前对象的弹窗交互
        this.ui.onItemCheckboxChange = (id, isChecked) => {
            this.service.toggleSelection(id, isChecked);
        };
        this.ui.onOpenFolder = (item) => this.openHistoryFolder(item);
        this.ui.onDelete = (id) => this.deleteHistoryItem(id);
        this.ui.onShareMobile = (path, title) => this.shareToMobile(path, title);
    }

    bindGlobalEvents() {
        // 清空历史
        const btnClear = document.getElementById('btn-clear-history');
        if (btnClear) {
            btnClear.onclick = async () => {
                const confirmed = await this.app.showConfirm(
                    window.i18n?.t('history.confirmClear') || 'Notification'
                );
                if (confirmed) {
                    await this.service.clearAllHistory();
                    this.app.showToast(window.i18n?.t('history.historyCleared') || 'History cleared', 'success');
                }
            };
        }

        // 搜索输入
        const searchInput = document.getElementById('history-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                clearTimeout(this.searchDebounce);
                this.searchDebounce = setTimeout(() => {
                    this.service.setSearchQuery(e.target.value.trim().toLowerCase());
                }, 300);
            };
        }

        // 清除搜索
        const btnClearSearch = document.getElementById('btn-clear-search');
        if (btnClearSearch) {
            btnClearSearch.onclick = () => {
                if (searchInput) searchInput.value = '';
                this.service.setSearchQuery('');
            };
        }

        // 平台与日期筛选
        const filterPlatform = document.getElementById('filter-platform');
        if (filterPlatform) {
            filterPlatform.onchange = (e) => this.service.setFilterPlatform(e.target.value);
        }

        const filterDate = document.getElementById('filter-date');
        if (filterDate) {
            filterDate.onchange = (e) => this.service.setFilterDate(e.target.value);
        }

        // 全选
        const selectAll = document.getElementById('history-select-all');
        if (selectAll) {
            selectAll.onchange = (e) => this.service.toggleSelectAll(e.target.checked);
        }

        // 批量删除
        const btnBatchDelete = document.getElementById('btn-history-batch-delete');
        if (btnBatchDelete) {
            btnBatchDelete.onclick = async () => {
                if (this.service.selectedIds.size === 0) return;
                const confirmed = await this.app.showConfirm(
                    window.i18n?.t('history.batch.confirmDelete', { count: this.service.selectedIds.size }) || `Are you sure you want to delete ${this.service.selectedIds.size} selected records?`
                );
                if (confirmed) {
                    await this.service.deleteMultiple(this.service.selectedIds);
                    this.app.showToast(window.i18n?.t('history.batch.deleteSuccess') || 'Deleted successfully', 'success');
                }
            };
        }

        // 批量导出 (复制文件)
        const btnBatchExport = document.getElementById('btn-batch-export');
        if (btnBatchExport) {
            btnBatchExport.onclick = async () => {
                if (this.service.selectedIds.size === 0) return;
                const selected = this.service.history.filter(h => this.service.selectedIds.has(h.id));
                const filePaths = selected.map(h => h.filePath).filter(p => p);

                if (filePaths.length === 0) {
                    this.app.showToast(window.i18n?.t('history.batch.noLocalFile') || 'No local files for selected records', 'warning');
                    return;
                }

                try {
                    const result = await window.mediaflow?.clipboard.copyFiles(filePaths);
                    if (result && result.success) {
                        this.app.showToast(
                            window.i18n?.t('history.batch.copySuccess', { count: result.count }) || `Copied ${result.count} files, you can paste them to other folders`,
                            'success'
                        );
                    } else {
                        throw new Error(result?.error || 'Unknown error');
                    }
                } catch (error) {
                    this.app.showToast((window.i18n?.t('history.batch.copyFail') || window.i18n?.t('scribe.copyFailed') || 'Copy failed') + ': ' + error.message, 'error');
                }
            };
        }

        // 绑定语言切换事件，重新渲染动态内容
        window.addEventListener('languageChanged', () => {
            if (this.service) {
                this.service.applyFilters(); // 触发 UI 重新渲染
            }
        });
    }

    async deleteHistoryItem(id) {
        const confirmed = await this.app.showConfirm(window.i18n?.t('history.confirmDelete') || 'Notification');
        if (confirmed) this.service.removeFromHistory(id);
    }

    async openHistoryFile(path) {
        if (path) {
            const realPath = await this.service.getResolvedPath(path);
            window.mediaflow?.shell.openPath(realPath);
        }
    }

    async openHistoryFolder(target) {
        const item = typeof target === 'string' ? { filePath: target } : (target || {});
        const filePath = item.filePath;
        const saveDir = item.saveDir;

        if (filePath) {
            const realPath = await this.service.getResolvedPath(filePath);
            const exists = await window.mediaflow?.shell.fileExists(realPath);
            if (exists) {
                window.mediaflow.shell.showItemInFolder(realPath);
                return;
            }
        }

        if (saveDir) {
            const resolvedSaveDir = await this.service.getResolvedPath(saveDir);
            const saveDirExists = await window.mediaflow?.shell.fileExists(resolvedSaveDir);
            if (saveDirExists) {
                window.mediaflow?.shell?.openPath?.(resolvedSaveDir);
                return;
            }
        }

        this.app.showToast(window.i18n?.t('history.fileMovedOrDeleted') || 'File has been moved or deleted', 'warning');
    }

    async shareToMobile(filePath, title) {
        if (!filePath) return;
        const realPath = await this.service.getResolvedPath(filePath);
        const exists = await window.mediaflow?.shell.fileExists(realPath);
        if (!exists) {
            this.app.showToast(window.i18n?.t('history.fileNotExist') || 'File does not exist or has been deleted', 'error');
            return;
        }

        try {
            if (!window.mediaflow?.mobileflow?.getFileQR) {
                this.app.showToast(
                    window.i18n?.t('history.mobileUnavailable') ||
                        'Mobile share is unavailable — start the Mobile Connect service first.',
                    'warning'
                );
                this.app?.router?.switchPage?.('mobile');
                return;
            }
            const result = await window.mediaflow.mobileflow.getFileQR(realPath);
            if (!result || !result.success) {
                this.app.showToast(
                    window.i18n?.t('history.startMobileFirst') ||
                        'Please start service in Mobile Connect page first',
                    'warning'
                );
                return;
            }
            this.showShareQRModal(result, title);
        } catch {
            this.app.showToast(window.i18n?.t('history.qrGenFail') || 'Failed to generate QR code', 'error');
        }
    }

    showShareQRModal(qrData, title) {
        const existing = document.getElementById('share-qr-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'share-qr-modal';
        modal.className = 'modal-overlay active';

        modal.innerHTML = `
            <div class="modal-content share-qr-modal" style="position: relative; z-index: 10001;">
                <div class="modal-header">
                    <h3>${window.i18n?.t('history.shareMobile') || 'Notification'}</h3>
                    <button class="btn-close-modal">✕</button>
                </div>
                <div class="modal-body">
                    <p class="share-title">${title || qrData.fileName}</p>
                    <img src="${qrData.qrCode}" class="share-qr-image">
                    <p class="share-tip">${window.i18n?.t('history.qrTip') || 'Notification'}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="btn-close-share">${window.i18n?.t('history.close') || 'Notification'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 200);
        };

        modal.querySelector('.btn-close-modal').onclick = close;
        modal.querySelector('#btn-close-share').onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };
    }

    initContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const item = this.closest(e.target, '.history-item');
            if (item) {
                e.preventDefault();
                const index = parseInt(item.dataset.index);
                if (!isNaN(index) && this.service.filteredHistory[index]) {
                    this.showContextMenu(e.clientX, e.clientY, this.service.filteredHistory[index]);
                }
            }
        });

        // 点击外部隐藏菜单
        document.addEventListener('click', () => {
            document.querySelector('.context-menu')?.remove();
        });
    }

    showContextMenu(x, y, item) {
        document.querySelector('.context-menu')?.remove();
        const menu = document.createElement('div');
        menu.className = 'context-menu';

        // Mono line icons (match history row actions; no emoji)
        const ICO = {
            play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
            folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
            qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M21 14h-3v3"/><path d="M14 21h3v-3"/></svg>',
            trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
        };

        const actions = [
            { icon: ICO.play, text: window.i18n?.t('history.openFile') || 'Play', action: () => this.openHistoryFile(item.filePath) },
            { icon: ICO.folder, text: window.i18n?.t('history.openFolder') || 'Open folder', action: () => this.openHistoryFolder(item) },
            {
                icon: ICO.qr,
                text: window.i18n?.t('history.showQRCode') || 'Show QR',
                action: () => this.shareToMobile(item.filePath, item.title)
            },
            { separator: true },
            { icon: ICO.trash, text: window.i18n?.t('history.delete') || 'Delete', class: 'delete', action: () => this.deleteHistoryItem(item.id) }
        ];

        actions.forEach(act => {
            if (act.separator) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                menu.appendChild(sep);
                return;
            }
            const el = document.createElement('div');
            el.className = `context-menu-item ${act.class || ''}`.trim();
            el.innerHTML = `<span class="context-menu-icon">${act.icon}</span><span class="context-menu-label">${act.text}</span>`;
            el.onclick = (e) => {
                e.stopPropagation();
                menu.remove();
                act.action();
            };
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        const padding = 5;
        let finalX = x;
        let finalY = y;

        if (x + rect.width > window.innerWidth) {
            finalX = Math.max(padding, window.innerWidth - rect.width - padding);
        }
        if (y + rect.height > window.innerHeight) {
            finalY = Math.max(padding, window.innerHeight - rect.height - padding);
        }

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
    }
}

window.HistoryEvents = HistoryEvents;
