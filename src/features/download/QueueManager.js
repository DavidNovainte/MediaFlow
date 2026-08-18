/**
 * MediaFlow - 全局下载队列管理器
 * 负责管理所有后台下载任务、并发控制、重试机制
 */

class QueueManager {
    constructor(app) {
        this.app = app;
        this.queue = [];
        this.isProcessing = false;
        this.isPaused = false;

        // 并发计数器（必须显式初始化为 0，否则 NaN 会破坏并发控制）
        this.activeDownloads = 0;
        this._cancelledTaskIds = new Set();

        // 配置
        this.config = {
            maxConcurrency: 2, // 最大并发数
            maxRetries: 3,     // 最大重试次数
            retryDelay: 5000   // 重试延迟 (ms)
        };

        // 🆕 UI, Store, Execution
        this.ui = new window.QueueUIManager(this);
        this.store = new window.QueueStore(this);
        this.executionSvc = new window.QueueExecutionSvc(this);
    }

    init() {
        this.loadQueue().then(async () => {
            this.queue = this.store.cleanupGhostItems(this.queue);
            this.emit('update', this.queue);
            // 🆕 从持久化存储恢复用户设置的并发数
            try {
                const stored = await window.mediaflow?.store.get('maxConcurrent');
                if (stored) this.config.maxConcurrency = parseInt(stored) || 2;
            } catch { /* 读取失败时保持默认值 */ }
        });

        window.addEventListener('beforeunload', () => {
            console.log('[Queue] Saving queue on exit...');
            this.saveQueue();
        });
    }

    /**
     * 添加任务到队列
     * @param {object} task 任务对象
     * @param {boolean} autoStart 是否自动开始
     */
    add(task, autoStart = true) {
        const queueItem = {
            id: String(task.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            url: task.url,
            title: task.title || (window.i18n?.t('download.checking') || 'Wait for detection...'),
            status: 'pending', // pending, queued, downloading, completed, failed, paused
            progress: 0,
            priority: task.priority || 0, // 1=High, 0=Normal
            retryCount: 0,
            addedAt: Date.now(),
            settings: {
                quality: task.quality || 'best',
                writeThumbnail: task.writeThumbnail || false,
                writeSubtitles: task.writeSubtitles || false,
                outputDir: task.outputDir,
                ...task.settings
            },
            thumbnail: task.thumbnail,
            platform: task.platform,
            error: null
        };

        this.queue.push(queueItem);
        this.saveQueue();
        this.emit('added', queueItem);
        this.emit('update', this.queue);

        if (autoStart && !this.isPaused) {
            this.processQueue();
        }

        return queueItem;
    }

    /**
     * 移除任务
     */
    async remove(id) {
        const index = this.queue.findIndex(i => String(i.id) === String(id));
        if (index > -1) {
            const item = this.queue[index];
            if (item.status === 'downloading' || item.status === 'processing') {
                this._cancelledTaskIds.add(String(item.id));
                // 如果正在下载，尝试发送取消指令
                try {
                    await window.mediaflow.video.cancelDownload(id);
                } catch (e) {
                    console.warn('[Queue] Failed to send cancel to backend:', e);
                }
                // 确保计数器减少，无论取消是否完全成功
                this.activeDownloads = Math.max(0, this.activeDownloads - 1);
            }
            this.queue.splice(index, 1);
            this.saveQueue();
            this.emit('removed', String(id));
            this.emit('update', this.queue);

            // 释放位置后尝试处理下一个
            this.processQueue();
        }
    }

    /**
     * 移动任务位置 (排序)
     * @param {string|number} id 
     * @param {string} direction 'up' | 'down'
     */
    moveItem(id, direction) {
        // 使用 String() 确保类型兼容 (dataset.id 是字符串)
        const index = this.queue.findIndex(i => String(i.id) === String(id));
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.queue.length) return;

        // 执行位置交换
        const element = this.queue.splice(index, 1)[0];
        this.queue.splice(newIndex, 0, element);

        this.saveQueue();
        this.emit('update', this.queue);
    }

    /**
     * 清空队列 (仅移除完成或失败的任务)
     */
    clear() {
        // Keep downloading, processing, pending, queued, paused
        const activeStatuses = ['downloading', 'processing', 'pending', 'queued', 'paused'];

        // Filter out inactive items
        this.queue = this.queue.filter(item => activeStatuses.includes(item.status));

        this.saveQueue();
        this.emit('update', this.queue);
    }

    /**
     * 清除已完成和失败的任务（别名）
     */
    clearCompleted() {
        this.clear();
    }

    /**
     * 全部取消/停止
     */
    async cancelAll() {
        // 找出所有正在运行的任务
        const runningItems = this.queue.filter(i => i.status === 'downloading' || i.status === 'processing');
        runningItems.forEach((item) => this._cancelledTaskIds.add(String(item.id)));

        // 并行发送取消请求
        await Promise.all(runningItems.map(async (item) => {
            try {
                await window.mediaflow.video.cancelDownload(item.id);
            } catch (e) {
                console.warn(`[Queue] Failed to cancel ${item.id}`, e);
            }
        }));

        // 重置所有任务状态或清空
        this.queue = [];
        this.activeDownloads = 0;

        this.saveQueue();
        this.emit('update', this.queue);
        this.app.showToast(window.i18n?.t('download.cancelledAll') || 'Notification', 'info');
    }

    /**
     * 处理队列循环
     */
    async processQueue() {
        if (this.isPaused) return;

        // 检查并发限制
        if (this.activeDownloads >= this.config.maxConcurrency) return;

        // 获取下一个可用任务
        // 优先级: High > Normal
        // 状态: queued || pending
        const nextItem = this.queue
            .filter(i => i.status === 'pending' || i.status === 'queued')
            .sort((a, b) => b.priority - a.priority || a.addedAt - b.addedAt)[0];

        if (!nextItem) return;

        // 开始任务
        this.activeDownloads++;
        nextItem.status = 'downloading';
        nextItem.startedAt = Date.now();
        this.emit('statusChange', nextItem);
        this.emit('update', this.queue); // UI Update

        try {
            await this.executionSvc.executeTask(nextItem);

            nextItem.status = 'completed';
            nextItem.progress = 100;
            nextItem.completedAt = Date.now();

            const successMsg = window.i18n?.t('download.downloadFinishedMsg', { title: nextItem.title }) || `Capture complete: ${nextItem.title}`;
            this.app.showToast(successMsg, 'success');

            if (this.app.historyManager) {
                this.app.historyManager.addToHistory({
                    title: nextItem.title,
                    url: nextItem.url,
                    filePath: nextItem.result?.file || nextItem.result?.path,
                    saveDir: nextItem.settings.outputDir,
                    thumbnail: nextItem.thumbnail,
                    platform: nextItem.platform
                });
            }
        } catch (error) {
            console.error('[Queue] Task failed:', error);
            if (nextItem.status === 'paused') return;

            const errMsg = error && error.message != null ? String(error.message) : String(error || '');
            const wasCancelled =
                this._cancelledTaskIds.has(String(nextItem.id)) ||
                /cancel/i.test(errMsg);

            // User cancel must not enter the retry loop
            if (wasCancelled) {
                nextItem.status = 'failed';
                nextItem.error = window.i18n?.t('download.cancelled') || 'Cancelled';
            } else {
                const userMessage = this.executionSvc.translateError(error);

                if (nextItem.retryCount < this.config.maxRetries) {
                    nextItem.retryCount++;
                    nextItem.status = 'pending';
                    this.app.showToast(window.i18n?.t('download.retryingMsg') || 'Archival failed, retrying in 5 seconds...', 'warning');
                    // 倒计时：每秒更新队列项错误文字，让用户知道在等待而非卡死
                    const countSec = Math.ceil(this.config.retryDelay / 1000);
                    for (let i = countSec; i > 0; i--) {
                        if (this._cancelledTaskIds.has(String(nextItem.id))) break;
                        nextItem.error = window.i18n?.t('queue.retryCountdown', { count: nextItem.retryCount, total: this.config.maxRetries, sec: i })
                            || `Retrying (${nextItem.retryCount}/${this.config.maxRetries}) in ${i}s...`;
                        this.emit('update', this.queue);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } else {
                    nextItem.status = 'failed';
                    nextItem.error = userMessage;
                    this.app.showToast((window.i18n?.t('queue.downloadFail') || 'Download failed:') + ` ${userMessage}`, 'error');
                }
            }
        } finally {
            // 如果 cancelAll() 被调用，不要再次降低计数器（已被重置为 0）
            if (this._cancelledTaskIds.delete(String(nextItem.id))) {
                this.emit('statusChange', nextItem);
                this.emit('update', this.queue);
            } else {
                this.activeDownloads = Math.max(0, this.activeDownloads - 1);
                this.emit('statusChange', nextItem);
                this.emit('update', this.queue);
                this.saveQueue();

                // 继续下一个
                this.processQueue();

                // 🆕 检查是否所有任务都已完成，显示系统通知
                this.checkAllCompleted();
            }
        }
    }

    /**
     * 🆕 检查是否所有任务都已完成
     */
    checkAllCompleted() {
        const pendingOrActive = this.queue.filter(i =>
            ['pending', 'queued', 'downloading', 'processing'].includes(i.status)
        );

        if (pendingOrActive.length === 0 && this.queue.length > 0) {
            const completed = this.queue.filter(i => i.status === 'completed').length;
            const failed = this.queue.filter(i => i.status === 'failed').length;

            // 只在有完成任务时通知
            if (completed > 0) {
                let body = window.i18n?.t('queue.finishedBody', { count: completed }) || `${completed} videos archived successfully`;
                if (failed > 0) {
                    body += '\n' + (window.i18n?.t('queue.finishedFailed', { count: failed }) || `${failed} failed`);
                }

                window.mediaflow?.notification?.show({
                    title: window.i18n?.t('queue.notificationTitle') || 'Notification',
                    body: body,
                    silent: false
                });
            }
        }
    }

    async togglePause() {
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            // 全局暂停：强制停止所有当前正在下载的任务
            const runningItems = this.queue.filter(i => i.status === 'downloading' || i.status === 'processing');
            for (const item of runningItems) {
                try {
                    await this.pauseTask(item.id);
                } catch (e) {
                    console.warn(`[Queue] Failed to pause item ${item.id} during global pause: `, e);
                }
            }
        } else {
            // 全局恢复：处理队列
            this.processQueue();
        }

        this.emit('pauseChange', this.isPaused);
    }

    async pauseTask(id) {
        // 使用 String() 确保类型兼容
        const item = this.queue.find(i => String(i.id) === String(id));
        if (item) {
            if (item.status === 'downloading') {
                // Call backend to kill process (files kept)
                await window.mediaflow.video.cancelDownload(id);
                item.status = 'paused';
                // [Fix] Do not decrement here, the processQueue finally block will do it
            } else if (item.status === 'pending' || item.status === 'queued') {
                item.status = 'paused';
            }
            this.emit('statusChange', item);
            this.emit('update', this.queue);
            this.saveQueue();
            this.processQueue(); // Try start next
        }
    }

    /**
     * 恢复单个任务
     */
    resumeTask(id) {
        // 使用 String() 确保类型兼容
        const item = this.queue.find(i => String(i.id) === String(id));
        if (item && item.status === 'paused') {
            item.status = 'pending';
            item.error = null; // Clear error on resume
            item.retryCount = 0; // Reset retries? Or keep? Reset seems better for manual resume.
            this.emit('statusChange', item);
            this.emit('update', this.queue);
            this.saveQueue();
            this.processQueue();
        }
    }

    /**
     * 持久化与加载委托
     */
    async saveQueue() { await this.store.saveQueue(this.queue); }
    async loadQueue() { this.queue = await this.store.loadQueue(); }

    /**
     * 事件系统委托
     */
    on(event, callback) { this.store.on(event, callback); }
    emit(event, data) {
        this.store.emit(event, data);
        if (event === 'update') this.ui.render(data);
    }
}

if (typeof window !== 'undefined') window.QueueManager = QueueManager;
