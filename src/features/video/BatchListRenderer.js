class BatchListRenderer {
    constructor(flow) {
        this.flow = flow;
        this.container = document.getElementById('batch-list');
        this.virtualScrollManager = null;
    }

    render(files) {
        if (!this.container) this.container = document.getElementById('batch-list');
        if (!this.container) return;

        if (files.length === 0) {
            this.virtualScrollManager = null;
            this.renderEmptyState();
            this.updateCount(0, 0);
            return;
        }

        // Ensure inner container exists for VirtualScroll
        let listContent = this.container.querySelector('.batch-list-content');
        if (!listContent) {
            this.container.innerHTML = '<div class="batch-list-content"></div>';
            listContent = this.container.querySelector('.batch-list-content');
        }

        if (window.VirtualScrollManager) {
            if (!this.virtualScrollManager || this.virtualScrollManager.container !== this.container) {
                this.virtualScrollManager = new window.VirtualScrollManager({
                    container: this.container,
                    listElement: listContent,
                    itemHeight: 72,
                    renderItem: (item, index) => this.createBatchItemNode(item, index),
                    onScroll: () => { }
                });
            }
            this.virtualScrollManager.setItems(files);
        } else {
            // Fallback to simple render
            listContent.innerHTML = '';
            files.forEach((file, index) => {
                listContent.appendChild(this.createBatchItemNode(file, index));
            });
        }

        this.updateCount(files.length, this.calculateTotalDuration(files));
    }

    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-batch-state">
                <div class="empty-icon">📁</div>
                <div class="empty-text">${window.i18n?.t('creator.batch.emptyListText') || 'Drag videos here or click button above to add'}</div>
                <div class="empty-sub">${window.i18n?.t('creator.batch.emptyListSub') || 'Supports MP4, MKV, AVI, MOV and more'}</div>
            </div>
        `;
    }

    updateCount(count, duration) {
        const root = document.getElementById('page-creator') || document;
        const countEl = root.querySelector?.('#batch-count') || document.getElementById('batch-count');
        const durationEl = root.querySelector?.('#batch-total-duration') || document.getElementById('batch-total-duration');
        if (countEl) countEl.textContent = count;
        if (durationEl) durationEl.textContent = this.flow.formatTime(duration);
    }

    calculateTotalDuration(files) {
        return files.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    createBatchItemNode(item, index) {
        const div = document.createElement('div');
        div.className = 'batch-item';
        div.draggable = true;
        div.dataset.index = index;

        if (item.status === 'processing') div.classList.add('processing');
        if (item.status === 'done') div.classList.add('done');
        if (item.status === 'error') div.classList.add('error');

        const file = item.file || {};
        const fileName = this.escapeHtml(file.name || '');
        const fileSize = this.escapeHtml(this.flow.formatSize(file.size || 0));
        const durationText = item.duration ? ` - ${this.escapeHtml(this.flow.formatTime(item.duration))}` : '';
        const doneText = this.escapeHtml(window.i18n?.t('creator.batch.statusDone') || 'Done');
        const unknownError = window.i18n?.t('creator.batch.error.unknown') || 'Unknown Error';
        const failedText = window.i18n?.t('creator.batch.statusFailed') || 'Failed';
        const errorTitle = this.escapeHtml(item.errorMessage || unknownError);
        const errorText = this.escapeHtml(item.errorMessage || failedText);
        const progress = Number.isFinite(Number(item.progress)) ? Math.max(0, Math.min(100, Number(item.progress))) : 0;
        const removeTitle = this.escapeHtml(window.i18n?.t('creator.batch.remove') || 'Remove');

        div.innerHTML = `
            <div class="batch-item-drag">⋮⋮</div>
            <div class="batch-item-info">
                <div class="batch-item-name" title="${fileName}">${fileName}</div>
                <div class="batch-item-meta">
                    ${fileSize} 
                    ${durationText}
                    ${item.status === 'processing' ? ` (${Math.round(progress)}%)` : ''}
                    ${item.status === 'done' ? ` (${doneText})` : ''}
                    ${item.status === 'error' ? ` <span class="error-msg" title="${errorTitle}">(${errorText})</span>` : ''}
                </div>
                ${item.status === 'processing' ? `
                <div class="batch-item-progress-container">
                    <div class="batch-item-progress-bar" style="width: ${progress}%"></div>
                </div>
                ` : ''}
            </div>
            <div class="batch-item-actions">
                <button class="action-btn remove-btn" title="${removeTitle}">×</button>
            </div>
        `;

        // Bind Events
        div.querySelector('.remove-btn').onclick = (e) => {
            e.stopPropagation();
            this.flow.removeFile(index);
        };

        div.onclick = () => {
            // Maybe select?
        };

        this.bindDragEvents(div, index);

        return div;
    }

    bindDragEvents(element, index) {
        element.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({ index, mode: 'list' }));
            }
            element.classList.add('dragging');
            window._batchDragging = { index, mode: 'list' };
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
            document.querySelectorAll('.drag-over-target').forEach(el => el.classList.remove('drag-over-target'));
            window._batchDragging = null;
            window._lastDragOverTarget = null;
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            const target = typeof e.target?.closest === 'function'
                ? e.target.closest('.batch-item')
                : e.target?.parentElement?.closest?.('.batch-item') || null;
            if (target && target !== element && target !== window._lastDragOverTarget) {
                if (window._lastDragOverTarget) window._lastDragOverTarget.classList.remove('drag-over-target');
                target.classList.add('drag-over-target');
                window._lastDragOverTarget = target;
            }
        });

        element.addEventListener('dragleave', (e) => {
            const relatedTarget = e.relatedTarget?.closest?.('.batch-item');
            if (!relatedTarget || relatedTarget === element) {
                element.classList.remove('drag-over-target');
                if (window._lastDragOverTarget === element) window._lastDragOverTarget = null;
            }
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.drag-over-target').forEach(el => el.classList.remove('drag-over-target'));

            let fromIndex, fromMode;
            try {
                const rawData = e.dataTransfer?.getData?.('text/plain');
                if (rawData) {
                    const data = JSON.parse(rawData);
                    fromIndex = data.index;
                    fromMode = data.mode;
                } else if (window._batchDragging) {
                    fromIndex = window._batchDragging.index;
                    fromMode = window._batchDragging.mode;
                }
            } catch (dragParseError) {
                void dragParseError;
            }

            if (fromIndex !== undefined && fromMode === 'list' && fromIndex !== index) {
                this.flow.reorderFiles(fromIndex, index);
            }
        });
    }

    /**
     * Targeted update for progress
     */
    updateItemProgress(index, progress) {
        if (!this.container) return;
        const itemNode = this.container.querySelector(`.batch-item[data-index="${index}"]`);
        if (!itemNode) return;

        // Update progress bar
        const bar = itemNode.querySelector('.batch-item-progress-bar');
        if (bar) {
            bar.style.width = `${progress}%`;
        }

        // Update percent text in meta
        const meta = itemNode.querySelector('.batch-item-meta');
        if (meta) {
            // Find the percentage part and update it
            const text = meta.textContent;
            if (text.includes('%')) {
                meta.innerHTML = meta.innerHTML.replace(/\(\d+%\)/, `(${Math.round(progress)}%)`);
            } else if (!text.includes(window.i18n?.t('creator.batch.statusDone') || 'Done') && !text.includes(window.i18n?.t('creator.batch.statusFailed') || 'Failed')) {
                // If % is missing but it's processing, add it
                meta.innerHTML += ` (${Math.round(progress)}%)`;
            }
        }
    }
}

window.BatchListRenderer = BatchListRenderer;
