/**
 * 抖音下载服务模块
 * 通过 iesdouyin.com 分享页解析视频（无需 Cookie）
 * 
 * 工作原理：
 * 1. 解析短链接获取视频ID
 * 2. 访问 iesdouyin.com/share/video/{id} (移动端分享页)
 * 3. 从 window._ROUTER_DATA 中提取 JSON 数据
 * 4. 解析视频信息：标题、封面、视频URL
 * 5. 替换 playwm 为 play 获取无水印视频
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { sanitizePathSegment } = require('../../src/utils/sanitizePathSegment');

const DOUYIN_CONFIG = {
    // 模拟 iPhone 16.0 浏览器 (用户推荐版本)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    // 请求超时
    timeout: 30000,
    downloadTimeout: 60000,
    // 最大重定向深度
    maxRedirects: 5,
    concurrentChunks: 4,
    minChunkSize: 2 * 1024 * 1024
};

const DOWNLOAD_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 检测是否是抖音链接
 */
function isDouyinUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('douyin.com') || url.includes('iesdouyin.com');
}

/**
 * 检测是否是抖音用户主页
 */
function isDouyinProfile(url) {
    return isDouyinUrl(url) && (url.includes('/user/') || (url.includes('@') && !url.includes('/video/')));
}

/**
 * 发起 HTTP/HTTPS 请求
 */
function httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const urlObj = new URL(url);

        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (url.startsWith('https') ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': DOUYIN_CONFIG.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                ...options.headers
            },
            timeout: DOUYIN_CONFIG.timeout
        };

        const req = protocol.request(reqOptions, (res) => {
            // 处理重定向 (支持多层重定向)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectCount = (options.redirectCount || 0) + 1;
                if (redirectCount > DOUYIN_CONFIG.maxRedirects) {
                    return reject(new Error('Too many redirects'));
                }

                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, url).toString();
                }

                console.log(`[Douyin] 重定向 [${redirectCount}]:`, redirectUrl);
                return httpRequest(redirectUrl, { ...options, redirectCount }).then(resolve).catch(reject);
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ data, url: res.url || url, statusCode: res.statusCode }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

function buildDownloadHeaders(extraHeaders = {}) {
    return {
        'User-Agent': DOWNLOAD_USER_AGENT,
        ...extraHeaders
    };
}

function getConcurrentChunkCount(totalSize) {
    const safeSize = Number(totalSize) || 0;
    const maxUsefulChunks = Math.floor(safeSize / DOUYIN_CONFIG.minChunkSize);

    if (maxUsefulChunks < 2) {
        return 1;
    }

    return Math.max(2, Math.min(DOUYIN_CONFIG.concurrentChunks, maxUsefulChunks));
}

function shouldUseConcurrentDownload(headers = {}, totalSize = 0) {
    const acceptRanges = String(headers['accept-ranges'] || '').toLowerCase();
    return acceptRanges.includes('bytes') && getConcurrentChunkCount(totalSize) > 1;
}

function buildChunkRanges(totalSize, chunkCount = getConcurrentChunkCount(totalSize)) {
    const safeSize = Number(totalSize) || 0;
    if (safeSize <= 0) return [];

    const ranges = [];
    const safeChunkCount = Math.max(1, Number(chunkCount) || 1);
    const chunkSize = Math.ceil(safeSize / safeChunkCount);

    for (let index = 0; index < safeChunkCount; index += 1) {
        const start = index * chunkSize;
        if (start >= safeSize) break;

        const end = Math.min(safeSize - 1, start + chunkSize - 1);
        ranges.push({ start, end });
    }

    return ranges;
}

function createProgressReporter(totalSize, onProgress = () => { }) {
    const safeTotalSize = Number(totalSize) || 0;
    const startTime = Date.now();
    let downloadedSize = 0;
    let lastUpdate = startTime;

    const emit = (force = false) => {
        if (safeTotalSize <= 0) return;

        const now = Date.now();
        if (!force && now - lastUpdate < 500 && downloadedSize < safeTotalSize) {
            return;
        }

        const elapsedSeconds = Math.max(0.001, (now - startTime) / 1000);
        const progress = Math.max(0, Math.min(100, (downloadedSize / safeTotalSize) * 100));
        const avgSpeed = downloadedSize / elapsedSeconds;
        const speedMiB = (avgSpeed / (1024 * 1024)).toFixed(2);

        let eta = '--:--';
        if (avgSpeed > 0 && downloadedSize < safeTotalSize) {
            const remainingBytes = safeTotalSize - downloadedSize;
            const etaSeconds = remainingBytes / avgSpeed;
            const etaMinutes = Math.floor(etaSeconds / 60);
            const etaRemainderSeconds = Math.floor(etaSeconds % 60);
            eta = `${etaMinutes.toString().padStart(2, '0')}:${etaRemainderSeconds.toString().padStart(2, '0')}`;
        } else if (downloadedSize >= safeTotalSize) {
            eta = '00:00';
        }

        onProgress({
            progress,
            speed: `${speedMiB} MiB/s`,
            eta,
            status: 'downloading'
        });

        lastUpdate = now;
    };

    return {
        add(bytes) {
            downloadedSize += Number(bytes) || 0;
            emit(false);
        },
        flush() {
            downloadedSize = Math.max(downloadedSize, safeTotalSize);
            emit(true);
        }
    };
}

function cleanupPartialFile(filePath) {
    return fs.promises.unlink(filePath).catch(() => { });
}

function openDownloadResponse(url, headers = {}, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, buildDownloadHeaders(headers), (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextRedirectCount = redirectCount + 1;
                if (nextRedirectCount > DOUYIN_CONFIG.maxRedirects) {
                    res.resume();
                    reject(new Error('Too many redirects'));
                    return;
                }

                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, url).toString();
                }

                console.log('[Douyin] 重定向到:', redirectUrl.substring(0, 80) + '...');
                res.resume();
                openDownloadResponse(redirectUrl, headers, nextRedirectCount).then(resolve).catch(reject);
                return;
            }

            if ((res.statusCode || 0) >= 400) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            resolve({ response: res, finalUrl: url });
        });

        req.on('error', reject);
        req.setTimeout(DOUYIN_CONFIG.downloadTimeout, () => {
            req.destroy(new Error('Download timeout'));
        });
    });
}

function streamResponseToFile(response, filePath, savePath, onProgress) {
    return new Promise((resolve, reject) => {
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        const progressReporter = createProgressReporter(totalSize, onProgress);
        const fileStream = fs.createWriteStream(filePath);

        response.on('data', (chunk) => {
            progressReporter.add(chunk.length);
        });

        response.on('error', async (err) => {
            fileStream.destroy();
            await cleanupPartialFile(filePath);
            reject(err);
        });

        fileStream.on('finish', () => {
            fileStream.close(() => {
                progressReporter.flush();
                console.log('[Douyin] 下载完成:', filePath);
                resolve({ success: true, path: savePath, file: filePath });
            });
        });

        fileStream.on('error', async (err) => {
            response.destroy();
            await cleanupPartialFile(filePath);
            reject(err);
        });

        response.pipe(fileStream);
    });
}

async function downloadWithConcurrentRanges(downloadUrl, filePath, savePath, totalSize, onProgress) {
    const ranges = buildChunkRanges(totalSize);
    if (ranges.length < 2) {
        throw new Error('Concurrent range download not applicable');
    }

    await fs.promises.writeFile(filePath, '');
    await fs.promises.truncate(filePath, totalSize);

    const progressReporter = createProgressReporter(totalSize, onProgress);

    try {
        await Promise.all(ranges.map((range) => new Promise((resolve, reject) => {
            openDownloadResponse(downloadUrl, {
                Range: `bytes=${range.start}-${range.end}`
            }).then(({ response }) => {
                if ((response.statusCode || 0) !== 206) {
                    response.resume();
                    reject(new Error(`Server rejected ranged download (${response.statusCode || 'unknown'})`));
                    return;
                }

                const fileStream = fs.createWriteStream(filePath, {
                    flags: 'r+',
                    start: range.start
                });

                response.on('data', (chunk) => {
                    progressReporter.add(chunk.length);
                });

                response.on('error', (err) => {
                    fileStream.destroy();
                    reject(err);
                });

                fileStream.on('finish', () => {
                    fileStream.close(resolve);
                });

                fileStream.on('error', (err) => {
                    response.destroy();
                    reject(err);
                });

                response.pipe(fileStream);
            }).catch(reject);
        })));

        progressReporter.flush();
        console.log('[Douyin] 分段下载完成:', filePath);
        return { success: true, path: savePath, file: filePath };
    } catch (error) {
        await cleanupPartialFile(filePath);
        throw error;
    }
}

/**
 * 解析短链接获取视频ID
 */
async function resolveShortUrl(url) {
    try {
        console.log('[Douyin] 解析短链接:', url);
        const result = await httpRequest(url);

        // 从最终 URL 中提取视频ID
        const patterns = [
            /video\/(\d+)/,
            /modal_id=(\d+)/,
            /item_id=(\d+)/
        ];

        for (const pattern of patterns) {
            const match = result.data.match(pattern) || result.url?.match(pattern);
            if (match) {
                console.log('[Douyin] 视频ID:', match[1]);
                return match[1];
            }
        }

        // 尝试从 HTML 中查找
        const htmlMatch = result.data.match(/video\/(\d+)/);
        if (htmlMatch) {
            return htmlMatch[1];
        }

        return null;
    } catch (error) {
        console.error('[Douyin] 短链接解析失败:', error.message);
        return null;
    }
}

/**
 * 从URL中提取视频ID
 */
async function extractVideoId(url) {
    url = url.trim();

    // 短链接先解析
    if (url.includes('v.douyin.com')) {
        return await resolveShortUrl(url);
    }

    // 直接从URL提取
    const patterns = [
        /video\/(\d+)/,
        /modal_id=(\d+)/,
        /item_id=(\d+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            console.log('[Douyin] 视频ID:', match[1]);
            return match[1];
        }
    }

    return null;
}

/**
 * 解析 iesdouyin.com 分享页获取视频数据
 */
async function parseSharePage(videoId) {
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;
    console.log('[Douyin] 访问分享页:', shareUrl);

    try {
        const result = await httpRequest(shareUrl);
        const html = result.data;
        console.log('[Douyin] 页面长度:', html.length, '字符');

        // 查找 _ROUTER_DATA
        const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\})\s*;?\s*<\/script>/s);

        if (match) {
            try {
                const data = JSON.parse(match[1]);
                console.log('[Douyin] 成功解析 ROUTER_DATA');
                return data;
            } catch (e) {
                console.error('[Douyin] JSON 解析失败:', e.message);
            }
        }

        console.log('[Douyin] 未找到 ROUTER_DATA');
        return null;
    } catch (error) {
        console.error('[Douyin] 分享页解析失败:', error.message);
        return null;
    }
}

/**
 * 从 ROUTER_DATA 中提取视频信息
 */
function extractVideoInfo(data) {
    try {
        const loaderData = data.loaderData || {};

        // 查找包含 videoInfoRes 的键
        let videoPage = null;
        for (const [key, value] of Object.entries(loaderData)) {
            if (value && typeof value === 'object' && 'videoInfoRes' in value) {
                videoPage = value;
                break;
            }
        }

        if (!videoPage) return null;

        const videoInfoRes = videoPage.videoInfoRes || {};
        const itemList = videoInfoRes.item_list || [];

        if (itemList.length === 0) return null;

        const item = itemList[0];

        // 提取基本信息
        const title = item.desc || '抖音视频';
        const authorInfo = item.author || {};
        const author = authorInfo.nickname || '';

        // 提取封面
        const videoData = item.video || {};
        const coverData = videoData.cover || {};
        const coverUrls = coverData.url_list || [];
        const thumbnail = coverUrls[0] || '';

        // 提取视频URL
        const playAddr = videoData.play_addr || {};
        const playUrls = playAddr.url_list || [];
        let videoUrl = playUrls[0] || '';

        // 替换 playwm 为 play 获取无水印版本
        if (videoUrl) {
            videoUrl = videoUrl.replace('playwm', 'play');
        }

        // 视频时长 (毫秒转秒)
        let duration = videoData.duration || 0;
        if (duration > 1000) {
            duration = Math.floor(duration / 1000);
        }

        return {
            title,
            author,
            thumbnail,
            videoUrl,
            duration,
            awemeId: item.aweme_id || ''
        };
    } catch (error) {
        console.error('[Douyin] 提取视频信息失败:', error.message);
        return null;
    }
}

/**
 * 获取抖音视频信息
 */
async function getVideoInfo(url) {
    url = url.trim();

    // 检测用户主页
    if (isDouyinProfile(url)) {
        return {
            success: true,
            title: '抖音用户主页',
            thumbnail: '',
            duration: 0,
            uploader: '',
            platform: 'douyin',
            batchNotSupported: true,
            batchMessage: '抖音用户主页批量下载暂不支持。请复制单个视频的链接进行下载。'
        };
    }

    // 提取视频ID
    const videoId = await extractVideoId(url);

    if (!videoId) {
        return {
            success: false,
            error: '无法解析视频链接，请确保复制了完整的抖音视频链接。'
        };
    }

    // 解析分享页
    const data = await parseSharePage(videoId);

    if (!data) {
        return {
            success: true,
            title: `抖音视频 ${videoId}`,
            thumbnail: '',
            duration: 0,
            uploader: '',
            platform: 'douyin',
            videoId,
            qualities: {
                720: { height: 720, available: true, totalSize: 0 }
            }
        };
    }

    // 提取视频信息
    const info = extractVideoInfo(data);

    if (info) {
        let title = info.title;
        if (title.length > 80) {
            title = title.substring(0, 77) + '...';
        }

        return {
            success: true,
            title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            uploader: info.author,
            platform: 'douyin',
            url: info.videoUrl,
            videoId,
            qualities: {
                720: { height: 720, available: true, totalSize: 0, label: '无水印 HD' }
            }
        };
    }

    return {
        success: true,
        title: `抖音视频 ${videoId}`,
        thumbnail: '',
        duration: 0,
        uploader: '',
        platform: 'douyin',
        videoId,
        qualities: {
            720: { height: 720, available: true, totalSize: 0 }
        }
    };
}

/**
 * 下载抖音视频
 */
async function downloadVideo(url, options = {}) {
    const {
        savePath,
        onProgress = () => { }
    } = options;

    url = url.trim();

    // 检测用户主页
    if (isDouyinProfile(url)) {
        return { success: false, error: '抖音用户主页批量下载暂不支持。请使用单个视频链接。' };
    }

    // 获取视频信息
    let videoUrl = options.directUrl;
    let title = options.title || 'douyin_video';

    // 如果未提供直链，则解析获取
    if (!videoUrl) {
        const info = await getVideoInfo(url);

        if (!info.success) {
            return { success: false, error: info.error || '无法获取视频信息' };
        }

        if (!info.videoUrl) {
            return { success: false, error: '无法获取视频下载地址' };
        }
        videoUrl = info.videoUrl;
        title = info.title || title;
    }

    // 安全文件名
    const safeTitle = sanitizePathSegment(title, { fallback: 'douyin_video', maxLength: 50 });
    const filePath = path.join(savePath, `${safeTitle}.mp4`);

    console.log('[Douyin] 开始下载:', videoUrl.substring(0, 80) + '...');

    try {
        const { response, finalUrl } = await openDownloadResponse(videoUrl);
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;

        if (shouldUseConcurrentDownload(response.headers, totalSize)) {
            const chunkCount = getConcurrentChunkCount(totalSize);
            console.log(`[Douyin] 启用 ${chunkCount} 段并发下载`);
            response.destroy();

            try {
                return await downloadWithConcurrentRanges(finalUrl, filePath, savePath, totalSize, onProgress);
            } catch (error) {
                console.warn('[Douyin] 并发下载失败，回退到单流下载:', error.message || error);
                await cleanupPartialFile(filePath);
                const fallback = await openDownloadResponse(finalUrl);
                return await streamResponseToFile(fallback.response, filePath, savePath, onProgress);
            }
        }

        return await streamResponseToFile(response, filePath, savePath, onProgress);
    } catch (error) {
        await cleanupPartialFile(filePath);
        return { success: false, error: error.message || String(error) };
    }
}

module.exports = {
    isDouyinUrl,
    isDouyinProfile,
    getVideoInfo,
    downloadVideo,
    DOUYIN_CONFIG,
    __test__: {
        buildChunkRanges,
        getConcurrentChunkCount,
        shouldUseConcurrentDownload
    }
};
