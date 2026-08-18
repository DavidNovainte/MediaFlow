/**
 * SubtitleDraftManager.js
 * 负责字幕项目的自动草稿备份与崩溃恢复。
 * 使用 IndexedDB 存储，支持大数据量的可靠持久化。
 */
class SubtitleDraftManager {
    constructor(flow) {
        this.flow = flow;
        this.dbName = 'SubtitleMediaFlow';
        this.storeName = 'drafts';
        this.db = null;
        this.dbVersion = 1;
    }

    /**
     * 初始化数据库
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    // 以视频文件路径或哈希作为主键
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[DraftManager] IndexedDB initialized');
                resolve();
            };

            request.onerror = (event) => {
                console.error('[DraftManager] DB Open Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 保存草稿
     * @param {string} videoId - 视频唯一标识 (路径/哈希)
     * @param {Object} data - 包含轨道、字幕、样式等的全量快照
     */
    async saveDraft(videoId, data) {
        if (!this.db || !videoId) return;

        const draft = {
            id: videoId,
            timestamp: Date.now(),
            name: this.flow.videoFile?.name || 'Untitled Project',
            content: data
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(draft);

            request.onsuccess = () => {
                // console.log(`[DraftManager] Draft saved for ${videoId}`);
                resolve();
            };

            request.onerror = (event) => {
                console.error('[DraftManager] Save Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 获取草稿
     */
    async getDraft(videoId) {
        if (!this.db || !videoId) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(videoId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 获取所有草稿 (用于崩溃恢复列表)
     */
    async getAllDrafts() {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                // 按时间倒序排序
                const results = request.result || [];
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 删除草稿
     */
    async deleteDraft(videoId) {
        if (!this.db || !videoId) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(videoId);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 捕获当前 Flow 的全量快照
     */
    captureCurrentSnapshot() {
        const tracks = this.flow.trackManager?.tracks || [];
        const cloneData = (value) => {
            if (value === undefined || value === null) return value;
            return JSON.parse(JSON.stringify(value));
        };

        return {
            tracks: tracks.map(t => ({
                id: t.id,
                name: t.name,
                type: t.type,
                subtitles: cloneData(t.subtitles) || [],
                style: t.style
                    ? (this.flow.styleManager?.cloneStyle
                        ? this.flow.styleManager.cloneStyle(t.style)
                        : cloneData(t.style))
                    : null,
                visible: t.visible,
                locked: t.locked,
                ttsAudioPath: t.ttsAudioPath
            })),
            activeTrackId: this.flow.activeTrackId,
            currentStyle: this.flow.currentStyle
                ? (this.flow.styleManager?.cloneStyle
                    ? this.flow.styleManager.cloneStyle(this.flow.currentStyle)
                    : cloneData(this.flow.currentStyle))
                : null
        };
    }
}

window.SubtitleDraftManager = SubtitleDraftManager;
