/**
 * AsyncQueue.js
 * 并发任务队列控制器
 * 用于批量处理时限制同时执行的任务数量，避免系统资源耗尽。
 */
class AsyncQueue {
    /**
     * @param {number} concurrency 最大并发数
     */
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.queue = [];
        this.running = 0;
        this.active = false;

        // Event callbacks
        this.onProgress = null; // (completedCount, totalCount) => {}
        this.onComplete = null; // () => {}

        this._completedCount = 0;
        this._totalCount = 0;
        this._results = [];
    }

    /**
     * 添加任务到队列
     * @param {Function} taskFn 返回 Promise 的任务函数
     * @param {any} metaData 任务关联的元数据（如文件名）
     */
    push(taskFn, metaData = {}) {
        this.queue.push({
            fn: taskFn,
            meta: metaData,
            status: 'pending'
        });
        this._totalCount++;
        this._processNext();
    }

    /**
     * 同时也支持一次性添加多个
     */
    pushAll(taskFnsWithMeta) {
        taskFnsWithMeta.forEach(item => {
            this.push(item.fn, item.meta);
        });
    }

    /**
     * 内部：尝试执行下一个任务
     */
    async _processNext() {
        if (!this.active && this.queue.length > 0) this.active = true;

        // 如果正在运行的任务达到上限，或队列为空，停止
        if (this.running >= this.concurrency || this.queue.length === 0) {
            if (this.running === 0 && this.queue.length === 0 && this.active) {
                this.active = false;
                if (this.onComplete) this.onComplete(this._results);
            }
            return;
        }

        const task = this.queue.shift();
        this.running++;
        task.status = 'running';

        try {
            const result = await task.fn();
            this._results.push({
                meta: task.meta,
                success: true,
                result
            });
        } catch (error) {
            console.error('[AsyncQueue] Task failed:', error);
            this._results.push({
                meta: task.meta,
                success: false,
                error
            });
        } finally {
            this.running--;
            this._completedCount++;
            if (this.onProgress) {
                this.onProgress(this._completedCount, this._totalCount);
            }
            this._processNext();
        }
    }

    /**
     * 动态调整并发数
     */
    setConcurrency(num) {
        this.concurrency = num;
        this._processNext(); // 可能可以启动更多任务
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        return {
            total: this._totalCount,
            completed: this._completedCount,
            pending: this.queue.length,
            running: this.running
        };
    }

    /**
     * 强制清空队列
     */
    clear() {
        this.queue = [];
        this.active = false;
    }
}

window.AsyncQueue = AsyncQueue;
