/**
 * DownloadBatchFileManager.js (Model)
 * 负责管理下载队列的数据，包括添加、删除、选中状态等。
 */
class DownloadBatchFileManager {
    constructor() {
        this.queue = [];
        this.quality = '1080';
    }

    addItems(urls) {
        const newItems = urls.map((url, index) => ({
            id: `batch-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, // 🆕 Use string ID
            url,
            status: 'pending',
            title: '正在检测...',
            progress: 0,
            selected: true
        }));
        this.queue = [...this.queue, ...newItems];
        return newItems;
    }

    updateItem(id, updates) {
        const item = this.queue.find(i => i.id === id);
        if (item) {
            Object.assign(item, updates);
        }
        return item;
    }

    removeItem(id) {
        this.queue = this.queue.filter(i => i.id !== id);
    }

    clear() {
        this.queue = [];
    }

    setQuality(quality) {
        this.quality = quality;
    }

    getReadyItems() {
        return this.queue.filter(i => i.status === 'ready' && i.selected !== false);
    }

    getItem(id) {
        return this.queue.find(i => i.id === id);
    }
}

window.DownloadBatchFileManager = DownloadBatchFileManager;
