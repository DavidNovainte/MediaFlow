/**
 * DownloadBatchUIManager.js (View)
 * 负责渲染批量下载界面和处理用户交互。
 */
class DownloadBatchUIManager {
    constructor(controller) {
        this.controller = controller;
        this.elements = {};
        this.modal = null;
    }

    init() {
        // 🆕 Changed from old modal to new inline results container
        this.resultsContainer = document.getElementById('batch-results-container');
        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        const root = document.getElementById('page-download') || document;
        const byId = (id) => root.querySelector?.(`#${id}`) || document.getElementById(id);
        this.elements = {
            list: byId('batch-results-list'), // 🆕 Fixed ID
            count: byId('batch-count'),
            totalCount: byId('batch-total-count'),
            startBtn: byId('btn-batch-start'),
            confirmBtn: byId('btn-batch-confirm'),
            closeBtn: byId('btn-close-batch'),
            clearBtn: byId('btn-clear-results'), // 🆕 Clear List button
            qualitySelect: byId('batch-quality-select')
        };
    }

    bindEvents() {
        this.elements.startBtn?.addEventListener('click', () => this.controller.handleStartClick());
        this.elements.confirmBtn?.addEventListener('click', () => this.controller.handleConfirmClick());
        this.elements.closeBtn?.addEventListener('click', () => this.hide());
        this.elements.clearBtn?.addEventListener('click', () => this.controller.clearAll()); // 🆕 Clear List
        this.elements.qualitySelect?.addEventListener('change', (e) => {
            this.controller.model.setQuality(e.target.value);
        });
        this.elements.list?.addEventListener('change', (e) => {
            const checkbox = e.target?.closest?.('.batch-item-checkbox');
            const itemId = checkbox?.closest?.('.batch-url-item')?.dataset.id;
            if (itemId) this.controller.toggleItem(itemId);
        });
        this.elements.list?.addEventListener('click', (e) => {
            const actionButton = e.target?.closest?.('[data-action="remove-batch-item"]');
            const itemId = actionButton?.closest?.('.batch-url-item')?.dataset.id;
            if (itemId) this.controller.removeItem(itemId);
        });
    }

    show() {
        this.resultsContainer?.classList.remove('hidden');
        this.render();
    }

    hide() {
        this.resultsContainer?.classList.add('hidden');

        // 🆕 恢复 Hero 区域显示
        const heroSection = document.querySelector('.hero-section');
        if (heroSection) {
            heroSection.classList.remove('compact');
        }
    }

    render() {
        if (!this.elements.list) return;

        const items = this.controller.model.queue;
        this.elements.list.innerHTML = items.map(item => this.createItemHTML(item)).join('');
        this.updateCounts();
    }

    createItemHTML(item) {
        // 防止视频标题或 URL 中的 HTML 特殊字符导致 XSS
        const esc = (str) => String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const isPending = item.status === 'pending';
        const statusIcon = this.getStatusIcon(item.status);
        const statusClass = item.status === 'error' ? 'item-error' : (isPending ? 'item-pending' : '');

        // 🆕 Pending 状态使用骨架屏动画
        const thumbContent = isPending
            ? '<div class="skeleton skeleton-thumb"></div>'
            : (item.thumbnail
                ? `<img src="${esc(item.thumbnail)}">` 
                : '<div class="thumb-placeholder"><i class="fas fa-video"></i></div>');

        const titleContent = isPending
            ? '<div class="skeleton skeleton-text" style="width: 70%; height: 16px;"></div>'
            : `<div class="item-title text-truncate">${esc(item.title)}</div>`;

        const safeId = esc(item.id);

        return `
            <div class="batch-url-item ${statusClass}" data-id="${safeId}">
                <div class="item-checkbox">
                    <input class="batch-item-checkbox" type="checkbox" ${item.selected ? 'checked' : ''}>
                </div>
                <div class="item-thumb">
                    ${thumbContent}
                </div>
                <div class="item-info">
                    ${titleContent}
                    <div class="item-url text-truncate">${esc(item.url)}</div>
                </div>
                <div class="item-status">
                    ${statusIcon}
                </div>
                <div class="item-actions">
                    <button class="btn-icon" type="button" data-action="remove-batch-item">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getStatusIcon(status) {
        switch (status) {
        case 'pending': return '<i class="fas fa-spinner fa-spin"></i>';
        case 'ready': return '<i class="fas fa-check-circle text-success"></i>';
        case 'error': return '<i class="fas fa-exclamation-circle text-danger"></i>';
        default: return '';
        }
    }

    updateCounts() {
        const total = this.controller.model.queue.length;
        const ready = this.controller.model.getReadyItems().length;

        if (this.elements.count) this.elements.count.textContent = ready;
        if (this.elements.totalCount) this.elements.totalCount.textContent = total;

        if (this.elements.confirmBtn) {
            this.elements.confirmBtn.disabled = ready === 0 || this.controller.isProcessing;
        }
    }

    updateItem(id) {
        const item = this.controller.model.getItem(id);
        if (!item) return;

        const itemEl = this.elements.list.querySelector(`[data-id="${id}"]`);
        if (itemEl) {
            const temp = document.createElement('div');
            temp.innerHTML = this.createItemHTML(item);
            itemEl.replaceWith(temp.firstElementChild);
        }
        this.updateCounts();
    }
}

window.DownloadBatchUIManager = DownloadBatchUIManager;
