/**
 * 抖音下载服务模块
 * 
 * 工作原理（2026 抖音改版后）：
 * 1. 解析短链接/直链获取视频ID
 * 2. 通过 ttwid.bytedance.com 免登录注册获取 ttwid Cookie（一年有效，失败时自动刷新）
 * 3. 带 ttwid 调用 www.douyin.com/aweme/v1/web/aweme/detail/ 获取视频数据
 *    （该接口自 2026-08 起强制要求 Cookie，分享页 _ROUTER_DATA 已不再包含 videoInfoRes）
 * 4. 解析 aweme_detail：标题、封面、无水印 play_addr 直链
 * 5. 下载直链（支持 Range 断点续传）
 * 兼容回退：旧版 iesdouyin.com/share/video/{id} + _ROUTER_DATA 解析仍保留
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { sanitizePathSegment } = require('../../src/utils/sanitizePathSegment');
const logger = require('../../src/utils/logger');

const DOUYIN_CONFIG = {
    // 模拟 iPhone 16.0 浏览器 (用户推荐版本)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    // 请求超时
    timeout: 30000,
    downloadTimeout: 60000,
    // 最大重定向深度
    maxRedirects: 5,
    // 并发分块数：实测抖音 CDN 单连接约 5-7 MiB/s，8 并发聚合可达 ~60+ MiB/s（4 并发仅 ~18 MiB/s）
    concurrentChunks: 8,
    minChunkSize: 1 * 1024 * 1024
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

// ==================== ttwid Cookie 管理（2026-08 抖音强制要求） ====================

let cachedTtwid = null;
let ttwidFetchingPromise = null;

function getTtwidCachePath() {
    try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'douyin_ttwid.txt');
    } catch {
        return path.join(process.cwd(), 'tmp', 'douyin_ttwid.txt');
    }
}

function readCachedTtwid() {
    try {
        const file = getTtwidCachePath();
        if (!fs.existsSync(file)) return null;
        const line = fs.readFileSync(file, 'utf8').trim();
        const [ttwid, expiresAt] = line.split('\t');
        if (!ttwid || !expiresAt) return null;
        if (Number(expiresAt) < Math.floor(Date.now() / 1000) - 86400) return null; // 提前1天过期
        return ttwid;
    } catch {
        return null;
    }
}

function writeTtwidCache(ttwid) {
    try {
        const file = getTtwidCachePath();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const expiresAt = Math.floor(Date.now() / 1000) + 31536000; // Max-Age 1年
        fs.writeFileSync(file, `${ttwid}\t${expiresAt}\n`, 'utf8');
    } catch {
        // 缓存失败不影响主流程
    }
}

/**
 * 免登录注册 ttwid Cookie（无需登录，浏览器访问抖音时自动下发）
 */
function registerTtwid() {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            region: 'cn',
            aid: 1768,
            needFid: false,
            service: 'www.ixigua.com',
            migrateto: 'douyin.com'
        });
        const req = https.request({
            hostname: 'ttwid.bytedance.com',
            path: '/ttwid/union/register/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': DOUYIN_CONFIG.userAgent,
                'Origin': 'https://www.douyin.com',
                'Referer': 'https://www.douyin.com/'
            },
            timeout: DOUYIN_CONFIG.timeout
        }, (res) => {
            // 必须消费响应流，否则 'end' 事件不会触发，promise 将永久挂起
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                const setCookie = res.headers['set-cookie'] || [];
                const ttwidCookie = setCookie.find((c) => c.startsWith('ttwid='));
                if (ttwidCookie) {
                    const value = ttwidCookie.split(';')[0].replace('ttwid=', '').trim();
                    resolve(value);
                } else {
                    reject(new Error(`No ttwid in set-cookie (status=${res.statusCode}) body=${body.substring(0, 100)}`));
                }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('ttwid register timeout'));
        });
        req.end(body);
    });
}

/**
 * 获取 ttwid Cookie（带内存 + 文件缓存，失败时强制刷新一次）
 * @returns {Promise<string|null>}
 */
async function obtainTtwid(force = false) {
    if (!force && cachedTtwid) return cachedTtwid;
    if (!force && !cachedTtwid) {
        cachedTtwid = readCachedTtwid();
        if (cachedTtwid) {
            logger.info('[Douyin] 使用缓存 ttwid');
            return cachedTtwid;
        }
    }
    if (ttwidFetchingPromise) return ttwidFetchingPromise;

    ttwidFetchingPromise = (async () => {
        try {
            const ttwid = await registerTtwid();
            cachedTtwid = ttwid;
            writeTtwidCache(ttwid);
            logger.info('[Douyin] ttwid 注册成功');
            return ttwid;
        } catch (error) {
            logger.error(`[Douyin] ttwid 注册失败: ${error.message}`);
            return null;
        } finally {
            ttwidFetchingPromise = null;
        }
    })();
    return ttwidFetchingPromise;
}

/**
 * 返回当前可用的 ttwid（供 yt-dlp 兜底链路写入 cookies.txt 使用）
 */
async function getTtwidCookie() {
    return await obtainTtwid(false);
}

/**
 * 将 ttwid 写入 yt-dlp 使用的 cookies.txt（Netscape 格式，保留已有内容）
 * 让 yt-dlp 的 Douyin 提取器也能用（2026-08 起其 detail 接口需要 Cookie）
 * @returns {Promise<string|null>} cookies.txt 路径，失败返回 null
 */
async function writeYtDlpCookies() {
    const ttwid = await obtainTtwid(false);
    if (!ttwid) return null;
    try {
        const { app } = require('electron');
        const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
        let existing = '';
        try {
            if (fs.existsSync(cookiePath)) {
                existing = fs.readFileSync(cookiePath, 'utf8');
            }
        } catch { /* ignore */ }

        if (existing.includes('ttwid')) {
            return cookiePath; // 已有 ttwid，无需重复写入
        }

        const header = existing.trim() ? '' : '# Netscape HTTP Cookie File\n# Generated by MediaFlow for Douyin\n';
        const lines = header + existing +
            '.douyin.com\tTRUE\t/\tTRUE\t3153600000\tttwid\t' + ttwid + '\n' +
            '.iesdouyin.com\tTRUE\t/\tTRUE\t3153600000\tttwid\t' + ttwid + '\n';
        fs.writeFileSync(cookiePath, lines, 'utf8');
        logger.info('[Douyin] 已将 ttwid 写入 yt-dlp cookies.txt');
        return cookiePath;
    } catch (error) {
        logger.warn(`[Douyin] 写入 yt-dlp cookies.txt 失败: ${error.message}`);
        return null;
    }
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
        // 注意：自定义 header 必须放在 { headers: ... } 里，平铺会导致 Node 忽略这些字段（Range 尤其致命）
        const req = protocol.get(url, { headers: buildDownloadHeaders(headers) }, (res) => {
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
                logger.error(`[Douyin] 下载请求失败 HTTP ${res.statusCode} (URL前120字符=${url.substring(0, 120)})`);
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            logger.info(`[Douyin] 下载请求成功 HTTP ${res.statusCode} content-length=${res.headers['content-length'] || '未知'} accept-ranges=${res.headers['accept-ranges'] || '无'} (URL前120字符=${url.substring(0, 120)})`);
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
                Range: `bytes=${range.start}-${range.end}`,
                'Referer': 'https://www.douyin.com/'
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
        logger.info(`[Douyin] 解析短链接: ${url}`);
        const result = await httpRequest(url);
        console.log('[Douyin] 短链接响应状态:', result.statusCode, '最终URL:', result.url);
        logger.info(`[Douyin] 短链接响应状态: ${result.statusCode} 最终URL: ${result.url}`);

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

        logger.warn(`[Douyin] 短链接解析失败：未在最终URL/HTML中找到视频ID. HTML长度=${(result.data || '').length} 前200字符=${(result.data || '').substring(0, 200)}`);
        return null;
    } catch (error) {
        console.error('[Douyin] 短链接解析失败:', error.message);
        logger.error(`[Douyin] 短链接解析异常: ${error.message}`);
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
 * 通过 web 详情 API 获取视频数据（2026-08 起需 ttwid Cookie）
 * @returns {Promise<Object|null>} aweme_detail 对象
 */
async function fetchVideoDetail(videoId) {
    const tryWith = async (ttwid) => {
        const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`;
        try {
            const result = await httpRequest(detailUrl, {
                headers: {
                    'Cookie': `ttwid=${ttwid}`,
                    'Referer': 'https://www.douyin.com/',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            if (result.statusCode !== 200 || !result.data) {
                logger.warn(`[Douyin] detail API 响应异常 status=${result.statusCode} bodyLen=${(result.data || '').length}`);
                return null;
            }
            let parsed;
            try {
                parsed = JSON.parse(result.data);
            } catch (e) {
                logger.warn(`[Douyin] detail API JSON 解析失败: ${e.message} (body前200字符=${result.data.substring(0, 200)})`);
                return null;
            }
            if (parsed && parsed.aweme_detail) {
                return parsed.aweme_detail;
            }
            logger.warn(`[Douyin] detail API 未返回 aweme_detail. status_code=${parsed && parsed.status_code} 返回体前200字符=${result.data.substring(0, 200)}`);
            return null;
        } catch (error) {
            logger.error(`[Douyin] detail API 请求异常: ${error.message}`);
            return null;
        }
    };

    let ttwid = await obtainTtwid(false);
    if (ttwid) {
        const detail = await tryWith(ttwid);
        if (detail) return detail;
        // ttwid 可能已失效，强制刷新后再试一次
        ttwid = await obtainTtwid(true);
        if (ttwid) return await tryWith(ttwid);
    }
    return null;
}

/**
 * 从 aweme_detail（detail API 返回）中提取视频信息
 */
function extractVideoInfoFromAwemeDetail(aweme) {
    try {
        if (!aweme || typeof aweme !== 'object') return null;
        const title = aweme.desc || '抖音视频';
        const authorInfo = aweme.author || {};
        const author = authorInfo.nickname || '';

        const videoData = aweme.video || {};
        const coverData = videoData.cover || {};
        const coverUrls = coverData.url_list || [];
        const thumbnail = coverUrls[0] || '';

        const playAddr = videoData.play_addr || {};
        const playUrls = playAddr.url_list || [];
        let videoUrl = playUrls[0] || '';

        if (videoUrl) {
            videoUrl = videoUrl.replace('playwm', 'play');
        }

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
            awemeId: aweme.aweme_id || aweme.item_id || ''
        };
    } catch (error) {
        console.error('[Douyin] 提取 aweme_detail 视频信息失败:', error.message);
        logger.error(`[Douyin] 提取 aweme_detail 视频信息异常: ${error.message}`);
        return null;
    }
}

/**
 * 解析 iesdouyin.com 分享页获取视频数据
 */
async function parseSharePage(videoId) {
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;
    console.log('[Douyin] 访问分享页:', shareUrl);
    logger.info(`[Douyin] 访问分享页: ${shareUrl}`);

    try {
        const result = await httpRequest(shareUrl);
        const html = result.data;
        console.log('[Douyin] 页面长度:', html.length, '字符');
        logger.info(`[Douyin] 分享页HTTP状态: ${result.statusCode} 页面长度: ${html.length} 字符`);

        // 查找 _ROUTER_DATA
        const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\})\s*;?\s*<\/script>/s);
        if (!match) {
            // 查找替代变量，便于诊断抖音是否改版
            const hasRouterDataVar = html.includes('_ROUTER_DATA');
            const hasRenderData = html.includes('RENDER_DATA');
            const hasPaceF = html.includes('__pace_f') || html.includes('window.__pace_f');
            logger.warn(`[Douyin] 未找到 _ROUTER_DATA. 页面含 _ROUTER_DATA变量=${hasRouterDataVar} RENDER_DATA=${hasRenderData} __pace_f=${hasPaceF}. 页面前300字符=${html.substring(0, 300)}`);
            console.log('[Douyin] 未找到 ROUTER_DATA', { hasRouterDataVar, hasRenderData, hasPaceF });
            return null;
        }

        try {
            const data = JSON.parse(match[1]);
            console.log('[Douyin] 成功解析 ROUTER_DATA');
            logger.info(`[Douyin] 成功解析 ROUTER_DATA, loaderData keys=${Object.keys(data.loaderData || {}).join(',')}`);
            return data;
        } catch (e) {
            console.error('[Douyin] JSON 解析失败:', e.message);
            logger.error(`[Douyin] _ROUTER_DATA JSON 解析失败: ${e.message} (ROUTER_DATA前200字符=${match[1].substring(0, 200)})`);
        }

        return null;
    } catch (error) {
        console.error('[Douyin] 分享页解析失败:', error.message);
        logger.error(`[Douyin] 分享页请求异常: ${error.message}`);
        return null;
    }
}

/**
 * 从 ROUTER_DATA 中提取视频信息
 */
function extractVideoInfo(data) {
    try {
        const loaderData = data.loaderData || {};
        const loaderKeys = Object.keys(loaderData);

        // 查找包含 videoInfoRes 的键
        let videoPage = null;
        for (const [key, value] of Object.entries(loaderData)) {
            if (value && typeof value === 'object' && 'videoInfoRes' in value) {
                videoPage = value;
                break;
            }
        }

        if (!videoPage) {
            logger.warn(`[Douyin] extractVideoInfo: 未找到 videoInfoRes. loaderData keys=${loaderKeys.join(',')} video_layout是否存在=${'video_layout' in loaderData}`);
            return null;
        }

        const videoInfoRes = videoPage.videoInfoRes || {};
        const itemList = videoInfoRes.item_list || [];

        if (itemList.length === 0) {
            logger.warn(`[Douyin] extractVideoInfo: videoInfoRes 存在但 item_list 为空. videoInfoRes keys=${Object.keys(videoInfoRes).join(',')}`);
            return null;
        }

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
        const originalUrl = videoUrl;
        if (videoUrl) {
            videoUrl = videoUrl.replace('playwm', 'play');
        }

        if (!videoUrl) {
            const playAddrKeys = Object.keys(playAddr);
            logger.warn(`[Douyin] extractVideoInfo: play_addr.url_list 为空. play_addr keys=${playAddrKeys.join(',')} 原始URL=${originalUrl}`);
        } else {
            logger.info(`[Douyin] 提取到视频直链(截断): ${videoUrl.substring(0, 120)} 含playwm=${videoUrl.includes('playwm')}`);
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
        logger.error(`[Douyin] 提取视频信息异常: ${error.message}`);
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

    // 1. 优先走 web 详情 API（2026-08 抖音改版后的可用方式，需 ttwid Cookie）
    const awemeDetail = await fetchVideoDetail(videoId);
    const detailInfo = extractVideoInfoFromAwemeDetail(awemeDetail);

    if (detailInfo && detailInfo.videoUrl) {
        logger.info(`[Douyin] getVideoInfo: 通过 detail API 获取成功 (videoId=${videoId})`);
        let title = detailInfo.title;
        if (title.length > 80) {
            title = title.substring(0, 77) + '...';
        }

        return {
            success: true,
            title,
            thumbnail: detailInfo.thumbnail,
            duration: detailInfo.duration,
            uploader: detailInfo.author,
            platform: 'douyin',
            url: detailInfo.videoUrl,
            videoId,
            qualities: {
                720: { height: 720, available: true, totalSize: 0, label: '无水印 HD' }
            }
        };
    }

    // 2. 兼容回退：解析分享页 _ROUTER_DATA
    const data = await parseSharePage(videoId);
    let info = null;

    if (data) {
        info = extractVideoInfo(data);
    }

    if (!info || !info.videoUrl) {
        logger.warn(`[Douyin] getVideoInfo: detail API 与分享页均未获取到视频直链 (videoId=${videoId})`);
    }

    if (info && info.videoUrl) {
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
            logger.error(`[Douyin] 获取视频信息失败: ${info.error || '无法获取视频信息'}`);
            return { success: false, error: info.error || '无法获取视频信息' };
        }

        // getVideoInfo 返回的直链字段为 url（与 downloadVideo 的 videoUrl 兼容双读取）
        const resolvedUrl = info.url || info.videoUrl;
        if (!resolvedUrl) {
            logger.error(`[Douyin] 未获得视频下载地址 (URL=${url})`);
            return { success: false, error: '无法获取视频下载地址' };
        }
        videoUrl = resolvedUrl;
        title = info.title || title;
    }

    // 安全文件名
    const safeTitle = sanitizePathSegment(title, { fallback: 'douyin_video', maxLength: 50 });
    const filePath = path.join(savePath, `${safeTitle}.mp4`);

    console.log('[Douyin] 开始下载:', videoUrl.substring(0, 80) + '...');
    logger.info(`[Douyin] 开始下载 (URL前120字符=${videoUrl.substring(0, 120)})`);

    // 抖音 CDN 直链通常需要 Referer，否则可能返回 403
    const refererHeader = { 'Referer': 'https://www.douyin.com/' };

    try {
        const { response, finalUrl } = await openDownloadResponse(videoUrl, refererHeader);
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;

        if (shouldUseConcurrentDownload(response.headers, totalSize)) {
            const chunkCount = getConcurrentChunkCount(totalSize);
            console.log(`[Douyin] 启用 ${chunkCount} 段并发下载`);
            logger.info(`[Douyin] 启用 ${chunkCount} 段并发下载`);
            response.destroy();

            try {
                return await downloadWithConcurrentRanges(finalUrl, filePath, savePath, totalSize, onProgress);
            } catch (error) {
                console.warn('[Douyin] 并发下载失败，回退到单流下载:', error.message || error);
                logger.warn(`[Douyin] 并发下载失败，回退到单流下载: ${error.message || error}`);
                await cleanupPartialFile(filePath);
                const fallback = await openDownloadResponse(finalUrl, refererHeader);
                return await streamResponseToFile(fallback.response, filePath, savePath, onProgress);
            }
        }

        return await streamResponseToFile(response, filePath, savePath, onProgress);
    } catch (error) {
        await cleanupPartialFile(filePath);
        logger.error(`[Douyin] 下载失败: ${error.message || String(error)}`);
        return { success: false, error: error.message || String(error) };
    }
}

module.exports = {
    isDouyinUrl,
    isDouyinProfile,
    getVideoInfo,
    downloadVideo,
    getTtwidCookie,
    writeYtDlpCookies,
    DOUYIN_CONFIG,
    __test__: {
        buildChunkRanges,
        getConcurrentChunkCount,
        shouldUseConcurrentDownload
    }
};
