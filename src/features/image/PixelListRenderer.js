/**
 * PixelListRenderer.js
 * 专门负责图片预览列表/网格的渲染
 */

class PixelListRenderer {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.container = null;
    }

    /**
     * 渲染列表
     */
    render(files, selectedIndex) {
        this.container = document.getElementById('image-queue');
        if (!this.container) return;

        this.container.innerHTML = '';

        const fragment = document.createDocumentFragment();

        files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.draggable = true;
            item.dataset.index = index;

            // Generate thumbnail src — media-file:// (CSP-safe) over file://
            let thumbSrc = '';
            if (file.path) {
                thumbSrc = window.urlUtils?.pathToMediaUrl?.(file.path)
                    || `file://${file.path}`;
            } else {
                thumbSrc = URL.createObjectURL(file.file || file);
            }

            const isActive = index === selectedIndex;
            item.innerHTML = `
                <div class="queue-thumb ${isActive ? 'active' : ''}">
                    <img src="${thumbSrc}" loading="lazy">
                </div>
                <button class="queue-remove" title="${window.i18n.t('compress.remove')}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            `;

            // Event Binding
            item.addEventListener('click', () => this.controller.selectImage(index));
            item.querySelector('.queue-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.controller.removeImage(index);
            });

            // Drag Events
            this.bindDragEvents(item, index);

            fragment.appendChild(item);
        });

        this.container.appendChild(fragment);

        // 渲染追加的操作按钮 (添加/清空)
        this.renderActionButtons();
    }

    /**
     * Trailing queue controls — icon-only dashed tiles (+ / trash),
     * same footprint as thumbnails, content centered. Labels via title only.
     */
    renderActionButtons() {
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'queue-actions-wrapper';
        const addLabel = window.i18n?.t('compress.addMore') || 'Add more';
        const clearLabel = window.i18n?.t('compress.clear') || 'Clear';
        actionsWrapper.innerHTML = `
            <div class="queue-item queue-action-btn queue-add-tile" id="queue-add-btn" title="${addLabel}" role="button" tabindex="0" aria-label="${addLabel}">
                <span class="queue-btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </span>
            </div>
            <div class="queue-item queue-action-btn queue-clear-tile" id="queue-clear-btn" title="${clearLabel}" role="button" tabindex="0" aria-label="${clearLabel}">
                <span class="queue-btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </span>
            </div>
        `;

        actionsWrapper.querySelector('#queue-add-btn').onclick = () => {
            document.getElementById('image-file')?.click();
        };
        actionsWrapper.querySelector('#queue-clear-btn').onclick = async () => {
            const confirmedFilter = window.i18n?.t('compress.confirmClear') || 'Clear the queue?';
            const confirmed = await this.controller.app.ui.showConfirm(confirmedFilter);
            if (confirmed) {
                this.controller.reset();
            }
        };

        this.container.appendChild(actionsWrapper);
    }

    /**
     * 绑定拖拽事件
     */
    bindDragEvents(item, index) {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData?.('text/plain', index);
            item.classList.add('dragging');
            this.controller.setDraggingInternal(true);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            this.controller.setDraggingInternal(false);
            document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const rect = item.getBoundingClientRect();
            const relX = e.clientX - rect.left;

            item.classList.remove('drag-over-left', 'drag-over-right');
            if (relX < rect.width / 2) {
                item.classList.add('drag-over-left');
                item.dataset.dropPos = 'before';
            } else {
                item.classList.add('drag-over-right');
                item.dataset.dropPos = 'after';
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-left', 'drag-over-right');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer?.getData?.('text/plain'));
            const dropPos = item.dataset.dropPos;
            let toIndex = index;
            if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;

            // 如果拖拽的是同一个，不做处理
            if (fromIndex === toIndex) return;

            // 移除高亮
            item.classList.remove('drag-over-left', 'drag-over-right');

            // 计算最终插入位置
            if (dropPos === 'after' && fromIndex < toIndex) {
                // 向后拖且放在右侧：位置不变
            } else if (dropPos === 'after' && fromIndex > toIndex) {
                toIndex++; // 向前拖且放在右侧：索引+1
            } else if (dropPos === 'before' && fromIndex < toIndex) {
                toIndex--; // 向后拖且放在左侧：索引-1
            }
            // 向前拖且放在左侧：位置不变

            this.controller.reorderFiles(fromIndex, toIndex);
        });
    }
    /**
     * 仅更新选中状态，避免重绘闪烁
     */
    updateSelection(selectedIndex) {
        if (!this.container) return;
        const items = this.container.querySelectorAll('.queue-item');
        items.forEach((item, index) => {
            const thumb = item.querySelector('.queue-thumb');
            if (thumb) {
                if (index === selectedIndex) {
                    thumb.classList.add('active');
                    item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } else {
                    thumb.classList.remove('active');
                }
            }
        });
    }
}

window.PixelListRenderer = PixelListRenderer;
