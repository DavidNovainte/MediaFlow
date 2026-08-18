/**
 * MediaFlow - HistoryManager
 * 负责通用撤销/重做逻辑
 * 基于命令模式 (Command Pattern)
 */
class HistoryManager {
    constructor(maxSize = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
        this.onStateChange = null;
    }

    /**
     * 执行并记录一个新命令
     * @param {Object} command 必须包含 execute() 和 undo() 方法
     */
    async execute(command) {
        try {
            await command.execute();
            this.undoStack.push(command);
            this.redoStack = []; // 清空重做栈

            if (this.undoStack.length > this.maxSize) {
                this.undoStack.shift();
            }

            this._notify();
        } catch (error) {
            console.error('[HistoryManager] Execute failed:', error);
            throw error;
        }
    }

    /**
     * 推送一个已经执行过的命令到栈中（用于同步状态）
     */
    push(command) {
        this.undoStack.push(command);
        this.redoStack = [];
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
        this._notify();
    }

    /**
     * 撤销操作
     */
    async undo() {
        if (this.undoStack.length === 0) return;

        const command = this.undoStack.pop();
        try {
            await command.undo();
            this.redoStack.push(command);
            this._notify();
        } catch (error) {
            console.error('[HistoryManager] Undo failed:', error);
            this.undoStack.push(command); // 失败则放回
        }
    }

    /**
     * 重做操作
     */
    async redo() {
        if (this.redoStack.length === 0) return;

        const command = this.redoStack.pop();
        try {
            await command.execute();
            this.undoStack.push(command);
            this._notify();
        } catch (error) {
            console.error('[HistoryManager] Redo failed:', error);
            this.redoStack.push(command); // 失败则放回
        }
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._notify();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    _notify() {
        if (this.onStateChange) {
            this.onStateChange({
                canUndo: this.canUndo(),
                canRedo: this.canRedo(),
                undoCount: this.undoStack.length,
                redoCount: this.redoStack.length
            });
        }
    }
}

window.HistoryManager = HistoryManager;
