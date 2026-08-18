/**
 * ProcessQueue.js
 * 主进程子进程队列管理器
 * 负责全局 FFmpeg/yt-dlp 进程的并发控制、生命周期追踪及异常清理。
 */
const { EventEmitter } = require('events');
const os = require('os');

class ProcessQueue extends EventEmitter {
    constructor() {
        super();
        this.concurrency = 2; // 默认并发数
        this.queue = [];
        this.runningTasks = new Map(); // UUID -> { process, task }
        this.isCleaning = false;

        // 自动根据内存和 CPU 调整建议并发数 (辅助 UI)
        this.recommendConcurrency = Math.min(Math.max(1, os.cpus().length - 1), 4);
    }

    /**
     * 设置并发数
     */
    setConcurrency(count) {
        this.concurrency = Math.max(1, count);
        this._processNext();
    }

    /**
     * 推送任务
     * @param {string} id 唯一任务 ID
     * @param {Function} taskFn 应返回 Promise 的函数，其执行体中需调用 registerProcess
     * @returns {Promise}
     */
    push(id, taskFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ id, fn: taskFn, resolve, reject, status: 'pending' });
            console.log(`[ProcessQueue] Task pushed: ${id}, Queue length: ${this.queue.length}`);
            this._processNext();
        });
    }

    /**
     * 注册当前任务的子进程句柄 (核心：用于追踪与清理)
     * @param {string} id 任务 ID
     * @param {ChildProcess} proc 
     */
    registerProcess(id, proc) {
        const entry = this.runningTasks.get(id);
        if (entry) {
            entry.process = proc;
        }
    }

    /**
     * 内部调度
     */
    async _processNext() {
        if (this.isCleaning || this.runningTasks.size >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift();
        this.runningTasks.set(task.id, { process: null, task });

        console.log(`[ProcessQueue] Executing task: ${task.id}. Running: ${this.runningTasks.size}`);
        this.emit('update', this.getStatus());

        try {
            const result = await task.fn();
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.runningTasks.delete(task.id);
            this.emit('update', this.getStatus());
            this._processNext();
        }
    }

    /**
     * 获取队列状态
     */
    getStatus() {
        return {
            running: this.runningTasks.size,
            pending: this.queue.length,
            concurrency: this.concurrency
        };
    }

    /**
     * 取消特定任务
     */
    cancelTask(id) {
        const entry = this.runningTasks.get(id);
        if (entry) {
            console.log(`[ProcessQueue] Cancelling running task: ${id}`);
            if (entry.process) {
                try {
                    // Windows 下使用 taskkill 确保杀死所有子进程 (进程树)
                    if (process.platform === 'win32') {
                        const { exec } = require('child_process');
                        console.log(`[ProcessQueue] Windows: killing process tree for PID ${entry.process.pid}`);
                        exec(`taskkill /pid ${entry.process.pid} /T /F`, (err) => {
                            if (err) console.warn(`[ProcessQueue] Taskkill warning for ${id}:`, err.message);
                        });
                        // 即使执行了 taskkill，也立即调用原生的 kill 作为极速兜底
                        entry.process.kill('SIGKILL');
                    } else {
                        entry.process.kill('SIGKILL');
                    }
                } catch (e) {
                    console.error(`[ProcessQueue] Failed to kill process ${id}:`, e);
                }
            }

            // 重要：立即通过 Reject 中断该任务的 Promise 链路
            if (entry.task && entry.task.reject) {
                entry.task.reject(new Error('CANCELLED_BY_USER'));
            }

            this.runningTasks.delete(id);
            this.emit('update', this.getStatus());
            return true;
        }

        // 如果在等待队列中
        const index = this.queue.findIndex(t => t.id === id);
        if (index > -1) {
            const [task] = this.queue.splice(index, 1);
            console.log(`[ProcessQueue] Removing pending task from queue: ${id}`);
            task.reject(new Error('CANCELLED_BY_USER'));
            this.emit('update', this.getStatus());
            return true;
        }
        return false;
    }

    /**
     * 杀死所有追踪中的进程 (应用退出或重置时调用)
     */
    killAll() {
        this.isCleaning = true;
        this.queue.forEach(task => task.reject(new Error('SYSTEM_SHUTDOWN')));
        this.queue = [];

        for (const [id, entry] of this.runningTasks) {
            if (entry.process) {
                console.log(`[ProcessQueue] Cleanup: Killing ${id}`);
                try {
                    if (process.platform === 'win32') {
                        require('child_process').execSync(`taskkill /pid ${entry.process.pid} /T /F`);
                    } else {
                        entry.process.kill('SIGKILL');
                    }
                } catch (cleanupError) {
                    void cleanupError;
                }
            }
        }
        this.runningTasks.clear();
        this.isCleaning = false;
    }
}

// 导出单例，确保全应用唯一追踪
module.exports = new ProcessQueue();
