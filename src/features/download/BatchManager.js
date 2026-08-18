/**
 * batchManager.js (Controller)
 * 重构后的主控制器。
 */
class DownloadBatchManager {
    constructor(app) {
        this.app = app;
        this.model = new window.DownloadBatchFileManager();
        this.view = new window.DownloadBatchUIManager(this);
        this.service = new window.DownloadBatchService(app);

        this.isProcessing = false;
        this.savePath = null;
    }

    init() {
        window.batchManager = this; // 🆕 Expose for inline HTML events
        this.view.init();
        // Initialize Smart Input
        // Note: The input is inside 'batch-chips-container', so that must be the 'container' for chip insertion.
        // But we also want to catch clicks on the outer 'batch-chips-wrapper'.
        // Let's pass the inner container for logic, and we'll handle the wrapper click in the Manager or update InputManager to handle it.
        // Actually, let's keep it simple: pass the container where chips go.
        this.inputManager = new window.BatchInputManager('batch-chips-container', 'batch-smart-input');

        // 🆕 Bind click on the outer wrapper to focus the input as well
        const wrapper = document.getElementById('batch-chips-wrapper');
        if (wrapper) {
            wrapper.addEventListener('click', (e) => {
                if (e.target === wrapper && this.inputManager.input) {
                    this.inputManager.input.focus();
                }
            });
        }

        // 🆕 绑定清空按钮
        this.inputManager.bindClearButton();
    }

    async handleStartClick() {
        // Old dialog method replaced by Smart Input
        // const urls = await window.mediaflow.dialog.openBatch();

        const urls = this.inputManager.getUrls();

        if (urls && urls.length > 0) {
            this.model.clear();
            this.model.addItems(urls);
            this.view.show();

            // 启动异步抓取
            await this.service.detectUrls(this.model.queue, (item) => {
                this.view.updateItem(item.id);
            });
        } else {
            this.app.showToast(window.i18n?.t('download.errors.invalid_url') || 'Notification', 'warning');
        }
    }

    async handleConfirmClick() {
        const items = this.model.getReadyItems();

        if (items.length === 0) {
            this.app.showToast(window.i18n?.t('download.noPreviewFiles') || 'Notification', 'warning');
            return;
        }

        // 使用默认批量下载路径
        const downloadsPath = await window.mediaflow.app.getAppPath('downloads');

        // 🆕 按日期分类子文件夹
        const today = new Date();
        const dateFolder = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const batchPath = await window.mediaflow.path.join(downloadsPath, 'MediaFlow', 'Batch Downloads', dateFolder);

        // 确保目录存在
        await window.mediaflow.fs.mkdir(batchPath);
        this.savePath = batchPath;

        this.isProcessing = true;
        this.view.updateCounts();

        // 批量添加到全局下载队列
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // 🆕 触发飞入动画（找到对应的缩略图元素）
            const itemEl = document.querySelector(`[data-id="${item.id}"] .item-thumb img`);
            if (itemEl && window.queueAnimation) {
                // 错开动画，每个间隔 150ms
                setTimeout(() => {
                    window.queueAnimation.flyToQueue(itemEl);
                }, i * 150);
            }

            this.app.queueManager.add({
                url: item.url,
                title: item.title,
                platform: item.platform,
                thumbnail: item.thumbnail,
                outputDir: this.savePath,
                quality: this.model.quality || 'best'
            });
        }

        const successMsg = window.i18n?.t('batch.batchAddedSuccess', { count: items.length }) || `Added ${items.length} tasks to the queue`;
        window.app?.showToast(successMsg, 'success');

        // 延迟隐藏，让动画有时间播放
        setTimeout(() => {
            this.view.hide();
        }, items.length * 150 + 300);

        this.isProcessing = false;
    }

    toggleItem(id) {
        const item = this.model.getItem(id);
        if (item) {
            item.selected = !item.selected;
            this.view.updateItem(id); // 🆕 Re-render the item to reflect checkbox state
            this.view.updateCounts();
        }
    }

    removeItem(id) {
        this.model.removeItem(id);
        this.view.render();
    }

    clearAll() {
        this.model.clear();
        this.inputManager.clear();
        this.view.render();
        this.view.hide();
    }
}

window.DownloadBatchManager = DownloadBatchManager;
