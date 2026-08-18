/**
 * DownloadBatchService.js (Service)
 * 负责核心业务逻辑：URL检测、信息抓取、并发控制。
 */
class DownloadBatchService {
    constructor(app) {
        this.app = app;
        this.CONCURRENCY = 5;
    }

    /**
     * 检测 URL 列表并抓取信息
     * @param {Array} items 
     * @param {Function} onUpdate 
     */
    async detectUrls(items, onUpdate) {
        const fetchPromises = [];
        const executing = [];

        // 快照初始列表，防止 handlePlaylist 直接 splice 导致循环计数器错位
        const snapshot = [...items];

        for (let i = 0; i < snapshot.length; i++) {
            const item = snapshot[i];

            // 1. 识别平台 (支持底底通用平台)
            let platform = window.platformRegistry.detect(item.url);
            if (!platform) {
                platform = new window.BasePlatform();
            }

            // 2. 检查是否为播放列表 (YouTube 特例)
            const isPlaylist = platform.key === 'youtube' && (item.url.includes('list=') || item.url.includes('/playlist'));

            if (isPlaylist) {
                await this.handlePlaylist(item, platform, items, items.indexOf(item), onUpdate);
                continue;
            }

            // 3. 并发抓取单条视频信息
            const p = this.fetchItemInfo(item, platform, onUpdate).then(() => {
                executing.splice(executing.indexOf(p), 1);
            });
            fetchPromises.push(p);
            executing.push(p);

            if (executing.length >= this.CONCURRENCY) {
                await Promise.race(executing);
            }
        }

        await Promise.all(fetchPromises);
    }

    async handlePlaylist(item, platform, queue, index, onUpdate) {
        item.title = '正在展开播放列表...';
        onUpdate(item);

        try {
            const playlistInfo = await platform.getPlaylistInfo(item.url);
            if (playlistInfo.success && playlistInfo.items?.length > 0) {
                // 更新第一条
                const first = playlistInfo.items[0];
                item.title = first.title || 'Notification';
                item.thumbnail = first.thumbnail;
                item.url = `https://www.youtube.com/watch?v=${first.id}`;
                item.platform = 'YouTube';
                item.status = 'ready';
                onUpdate(item);

                // 插入剩余条目
                const newItems = playlistInfo.items.slice(1).map((v, j) => ({
                    id: `yt-pl-${Date.now()}-${j}-${Math.random().toString(36).slice(2, 8)}`,
                    url: `https://www.youtube.com/watch?v=${v.id}`,
                    status: 'ready',
                    title: v.title || `视频 ${j + 2}`,
                    thumbnail: v.thumbnail,
                    platform: 'YouTube',
                    progress: 0,
                    selected: true
                }));
                queue.splice(index + 1, 0, ...newItems);
            } else {
                throw new Error((typeof window !== 'undefined' && window.i18n?.t?.('download.parseListFailed')) || 'Failed to parse list');
            }
        } catch (err) {
            item.status = 'error';
            item.error = err?.message || ((typeof window !== 'undefined' && window.i18n?.t?.('download.parseListFailed')) || 'Failed to parse list');
            onUpdate(item);
        }
    }

    async fetchItemInfo(item, platform, onUpdate) {
        try {
            // 使用平台的规范化链接
            const cleanUrl = platform.cleanUrl(item.url);
            // 核心改变：调用平台插件自己的 getInfo (默认转发给后端，但允许前端逻辑拦截/修复)
            const info = await platform.getInfo(cleanUrl);

            if (info.success) {
                item.title = info.title?.trim() || 'Notification';
                item.platform = info.platform || platform.name;
                item.status = 'ready';
                item.thumbnail = info.thumbnail;

                // 🔍 调试日志：打印原始缩略图 URL
                if (item.thumbnail) {
                    console.log(`[BatchService] Raw thumbnail for ${item.platform}:`, item.thumbnail);
                }

                // 缩略图代理处理
                // 强制对 TikTok/Douyin 平台的所有图片使用代理
                const needsProxy = /instagram|douyin|tiktok|fbcdn|byteimg|ttl|tiktokcdn|ibytedtos/i.test(item.thumbnail) ||
                    ['tiktok', 'douyin'].includes(item.platform?.toLowerCase());

                if (item.thumbnail && needsProxy) {
                    try {
                        console.log('[BatchService] Proxying image:', item.thumbnail);
                        const proxyUrl = await window.mediaflow.image.proxy(item.thumbnail);
                        if (proxyUrl) {
                            item.thumbnail = proxyUrl;
                        } else {
                            console.warn('[BatchService] Proxy failed for:', item.thumbnail);
                        }
                    } catch (e) {
                        console.error('[BatchService] Proxy error:', e);
                    }
                }
            } else {
                item.status = 'error';
                item.error = info.error || 'Operation failed';
            }
        } catch {
            item.status = 'error';
            item.error = '连接解析失败';
        }
        onUpdate(item);
    }
}

window.DownloadBatchService = DownloadBatchService;
