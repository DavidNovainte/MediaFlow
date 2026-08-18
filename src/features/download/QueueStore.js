/**
 * QueueStore.js
 * 负责下载队列的持久化存储与加载，以及简单的事件分发。
 */
class QueueStore {
    constructor(queueManager) {
        this.queueManager = queueManager;
        this.listeners = {};
    }

    /**
     * 清理之前的错误数据
     */
    cleanupGhostItems(queue) {
        const initialLength = queue.length;
        const cleanedQueue = queue.filter(item => {
            if (item.error && typeof item.error === 'string' && item.error.includes('object could not be cloned')) {
                return false;
            }
            return true;
        });

        if (cleanedQueue.length !== initialLength) {
            console.log(`[QueueStore] Cleaned up ${initialLength - cleanedQueue.length} ghost items`);
            this.saveQueue(cleanedQueue);
        }
        return cleanedQueue;
    }

    /**
     * 持久化队列
     */
    async saveQueue(queue) {
        // 只保存未完成的任务
        const toSave = queue.filter(i =>
            ['pending', 'queued', 'failed', 'paused'].includes(i.status)
        );
        await window.mediaflow.store.set('downloadQueue', toSave);
    }

    /**
     * 加载队列
     */
    async loadQueue() {
        try {
            const saved = await window.mediaflow.store.get('downloadQueue');
            if (Array.isArray(saved)) {
                // 恢复时，所有 'downloading' 状态应该重置为 'pending'
                return saved.map(i => ({
                    ...i,
                    status: i.status === 'downloading' ? 'pending' : i.status
                }));
            }
        } catch (e) {
            console.warn('[QueueStore] Load failed', e);
        }
        return [];
    }

    /**
     * 事件系统支持
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

window.QueueStore = QueueStore;
