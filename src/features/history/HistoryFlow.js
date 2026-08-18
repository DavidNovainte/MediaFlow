/**
 * HistoryFlow.js
 * (Refactored) 负责管理下载历史记录的高层编排
 * 具体逻辑拆分至 HistoryService、HistoryUI、HistoryEvents 中。
 */

class HistoryFlow {
    constructor(app) {
        this.app = app;

        const DEFAULT_THUMBNAIL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzY2NiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObzwvdGV4dD48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZmlsbD0iIzY2NiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIxLjVtIj5JbWFnZTwvdGV4dD48L3N2Zz4=';

        // 初始化各个模块
        this.ui = new window.HistoryUI(app, DEFAULT_THUMBNAIL);
        this.service = new window.HistoryService(app, this.ui);
        this.events = new window.HistoryEvents(app, this.service, this.ui);
    }

    async init() {
        try {
            await this.service.loadHistory();
        } catch (e) {
            console.error('Failed to load history:', e);
            this.service.history = []; // Fallback
            this.service.applyFilters(); // Trigger render
        }

        this.events.bindAll();
    }

    // 暴露出的对外的增删API (原来由 App 调用的)
    async addToHistory(item) {
        return this.service.addToHistory(item);
    }

    removeFromHistory(id) {
        return this.service.removeFromHistory(id);
    }

    /** Used by Router on page enter — delegate to service */
    checkFilesExistence() {
        return this.service?.checkFilesExistence?.();
    }
}

window.HistoryFlow = HistoryFlow;
