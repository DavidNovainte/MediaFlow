/**
 * HistoryService.js
 * 负责管理下载历史记录的数据存储、过滤、状态缓存等业务逻辑
 */

class HistoryService {
    constructor(app, ui) {
        this.app = app;
        this.ui = ui; // 引用 UI 实例，用于数据更新后触发渲染

        this.history = [];
        this.filteredHistory = [];
        this.selectedIds = new Set();
        this.missingFileIds = new Set();

        this.searchQuery = '';
        this.filterPlatform = '';
        this.filterDate = '';

        this.DOWNLOAD_ROOT_TOKEN = '$DOWNLOAD_ROOT$';
    }

    async loadHistory() {
        this.ui?.showLoadingTasks();

        // Simulate a slight delay for better UX
        await new Promise(resolve => setTimeout(resolve, 600));

        this.history = await window.mediaflow?.store.get('downloadHistory') || [];
        this.applyFilters();
    }

    async saveHistory() {
        await window.mediaflow?.store.set('downloadHistory', this.history);
    }

    async addToHistory(item) {
        let filePath = item.filePath;
        if (filePath) {
            filePath = await this._getRelativePath(filePath);
        }

        let thumbnail = item.thumbnail;
        const defaultThumb = this.ui ? this.ui.DEFAULT_THUMBNAIL : '';

        if (thumbnail && (thumbnail.includes('cdninstagram.com') || thumbnail.includes('instagram.com'))) {
            if (window.mediaflow?.image?.proxy) {
                try {
                    const proxiedUrl = await window.mediaflow.image.proxy(thumbnail);
                    if (proxiedUrl) thumbnail = proxiedUrl;
                } catch {
                    thumbnail = defaultThumb;
                }
            } else {
                thumbnail = defaultThumb;
            }
        }

        const record = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now(),
            ...item,
            filePath,
            thumbnail: thumbnail
        };

        this.history.unshift(record);
        if (this.history.length > 500) this.history = this.history.slice(0, 500);

        await this.saveHistory();
        this.applyFilters();
    }

    removeFromHistory(id) {
        this.history = this.history.filter(h => h.id !== id);
        this.selectedIds.delete(id);
        this.saveHistory();
        this.applyFilters();
    }

    async clearAllHistory() {
        this.history = [];
        this.selectedIds.clear();
        await this.saveHistory();
        this.applyFilters();
    }

    async deleteMultiple(idsSet) {
        this.history = this.history.filter(h => !idsSet.has(h.id));
        this.selectedIds.clear();
        await this.saveHistory();
        this.applyFilters();
    }

    applyFilters() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const weekAgo = todayMs - 7 * 24 * 60 * 60 * 1000;
        const monthAgo = todayMs - 30 * 24 * 60 * 60 * 1000;

        this.filteredHistory = this.history.filter(item => {
            if (this.searchQuery) {
                const title = (item.title || '').toLowerCase();
                if (!title.includes(this.searchQuery)) return false;
            }

            if (this.filterPlatform) {
                const platform = (item.platform || '').toLowerCase();
                if (this.filterPlatform === 'other') {
                    const knownPlatforms = ['youtube', 'bilibili', 'tiktok', 'douyin', 'twitter'];
                    if (knownPlatforms.some(p => platform.includes(p))) return false;
                } else {
                    if (!platform.includes(this.filterPlatform)) return false;
                }
            }

            if (this.filterDate) {
                const ts = item.timestamp || 0;
                switch (this.filterDate) {
                case 'today':
                    if (ts < todayMs) return false;
                    break;
                case 'week':
                    if (ts < weekAgo) return false;
                    break;
                case 'month':
                    if (ts < monthAgo) return false;
                    break;
                }
            }

            return true;
        });

        // 重置全选状态
        const selectAll = document.getElementById('history-select-all');
        if (selectAll) selectAll.checked = false;

        this.selectedIds.clear();

        // 通知 UI 更新
        if (this.ui) {
            this.ui.updateBatchUI(this.selectedIds.size);
            
            // 提取唯一平台并更新筛选器
            const uniquePlatforms = [...new Set(this.history.map(item => item.platform))].filter(Boolean);
            this.ui.updatePlatformFilter(uniquePlatforms, this.filterPlatform);

            this.ui.renderHistory(this.filteredHistory, this.selectedIds, this.missingFileIds, this.history.length);
            this.checkFilesExistence();
        }
    }

    setSearchQuery(query) {
        this.searchQuery = query;
        this.applyFilters();
    }

    setFilterPlatform(platform) {
        this.filterPlatform = platform;
        this.applyFilters();
    }

    setFilterDate(date) {
        this.filterDate = date;
        this.applyFilters();
    }

    toggleSelection(id, isSelected) {
        if (isSelected) {
            this.selectedIds.add(id);
        } else {
            this.selectedIds.delete(id);
        }
        if (this.ui) this.ui.updateBatchUI(this.selectedIds.size);
    }

    toggleSelectAll(isSelected) {
        if (isSelected) {
            this.filteredHistory.forEach(item => this.selectedIds.add(item.id));
        } else {
            this.selectedIds.clear();
        }
        if (this.ui) {
            this.ui.updateBatchUI(this.selectedIds.size);
            this.ui.renderHistory(this.filteredHistory, this.selectedIds, this.missingFileIds, this.history.length);
            this.checkFilesExistence();
        }
    }

    async checkFilesExistence() {
        if (this.filteredHistory.length === 0) return;

        // 微小延迟让渲染优先完成
        await new Promise(r => setTimeout(r, 200));

        const checkList = this.filteredHistory.filter(h => h.filePath);
        const BATCH_SIZE = 10;

        for (let i = 0; i < checkList.length; i += BATCH_SIZE) {
            const batch = checkList.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (item) => {
                try {
                    const realPath = await this.getResolvedPath(item.filePath);
                    if (!realPath) return;

                    const exists = await window.mediaflow?.shell.fileExists(realPath);
                    if (!exists) {
                        if (!this.missingFileIds.has(item.id)) {
                            this.missingFileIds.add(item.id);
                            this.ui?.markItemAsDeleted(item.id);
                        }
                    } else {
                        if (this.missingFileIds.has(item.id)) {
                            this.missingFileIds.delete(item.id);
                            this.ui?.markItemAsRestored(item.id);
                        }
                    }
                } catch (fileCheckError) {
                    void fileCheckError;
                }
            }));
            await new Promise(r => setTimeout(r, 50));
        }
    }

    /**
     * 私有：标准化路径（处理 Windows/Mac 斜杠差异并转小写进行比较）
     */
    _normalizePath(p) {
        if (!p) return '';
        return p.replace(/\\/g, '/').replace(/\/$/, '');
    }

    /**
     * 私有：将绝对路径转换为含占位符的相对路径
     */
    async _getRelativePath(fullPath) {
        if (!fullPath) return fullPath;

        const downloadPath = await window.mediaflow?.store.get('downloadPath');
        if (!downloadPath) return fullPath;

        const normFull = this._normalizePath(fullPath);
        const normRoot = this._normalizePath(downloadPath);

        if (normFull.startsWith(normRoot)) {
            // 如果文件在下载根目录内，则替换为 TOKEN
            // 注意：这里使用 replace 替换真实的前缀
            return fullPath.replace(downloadPath, this.DOWNLOAD_ROOT_TOKEN);
        }

        return fullPath;
    }

    /**
     * 公开：将含占位符的路径还原为当前系统的真实绝对路径
     */
    async getResolvedPath(storedPath) {
        if (!storedPath) return storedPath;

        if (storedPath.includes(this.DOWNLOAD_ROOT_TOKEN)) {
            const downloadPath = await window.mediaflow?.store.get('downloadPath');
            if (!downloadPath) {
                // 最后的保底逻辑：如果 store 里没有路径，尝试获取系统下载目录
                const defaultPath = await window.mediaflow?.app.getAppPath('downloads');
                return storedPath.replace(this.DOWNLOAD_ROOT_TOKEN, defaultPath || '');
            }
            return storedPath.replace(this.DOWNLOAD_ROOT_TOKEN, downloadPath);
        }

        return storedPath;
    }
}

window.HistoryService = HistoryService;
