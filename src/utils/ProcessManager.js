/**
 * ProcessManager.js
 * 
 * 全局进程注册表，用于追踪由应用产生的所有子进程（如 ffmpeg, yt-dlp 等）。
 * 并在应用退出前统一下发 kill 信号，避免留下僵尸进程。
 */


class ProcessManager {
    constructor() {
        this.processes = new Map();
    }

    /**
     * 注册一个新的子进程
     * @param {string} id 唯一标识符（如任务 ID）
     * @param {ChildProcess} proc 子进程实例
     */
    register(id, proc) {
        if (!proc || typeof proc.kill !== 'function') return;

        this.processes.set(id, proc);

        // 自动在进程结束时从注册表中移除
        proc.on('close', () => {
            this.processes.delete(id);
        });

        proc.on('error', () => {
            this.processes.delete(id);
        });
    }

    /**
     * 终止并反注册指定的子进程
     * @param {string} id 任务 ID
     */
    kill(id) {
        if (this.processes.has(id)) {
            const proc = this.processes.get(id);
            try {
                proc.kill('SIGTERM');
            } catch (e) {
                console.error(`[ProcessManager] Failed to kill process ${id}:`, e);
            }
            this.processes.delete(id);
        }
    }

    /**
     * 终止所有记录在册的进程
     */
    killAll() {
        if (this.processes.size === 0) return;

        console.log(`[ProcessManager] Killing ${this.processes.size} active child processes before exit...`);
        for (const [, proc] of this.processes.entries()) {
            try {
                proc.kill('SIGKILL');  // 退出时用 SIGKILL 确保干掉
            } catch {
                // ignore
            }
        }
        this.processes.clear();
    }
}

// 导出单例
module.exports = new ProcessManager();
