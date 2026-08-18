/**
 * TikTok 下载服务模块
 * 处理 TikTok 视频下载和用户主页批量下载
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { getYtDlpPath } = require('../../src/utils/binaries');
const { getProxyUrl } = require('../../src/handlers/download/proxyUtils');
const { appendCookiesArg } = require('../../src/handlers/download/cookieUtils');

/**
 * TikTok 下载配置
 */
const TIKTOK_CONFIG = {
    // 基础 UA (用于解析元数据，移动端更稳)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // 下载端专属 UA (桌面端配合标准链接是无水印的关键)
    downloadUA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    // 重试次数
    retries: 3,
    // 请求间隔（毫秒）
    sleepInterval: 2000
};

/**
 * 将普通视频链接转换为更稳定的 Embed 链接
 * 解决 "Unable to extract webpage video data" 错误
 */
function convertToEmbedUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('/embed/')) return url;

    // 提取视频 ID (匹配 /video/数字)
    const match = url.match(/\/video\/(\d+)/);
    if (match && match[1]) {
        return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
    return url;
}

/**
 * 检测是否是 TikTok 链接
 */
function isTikTokUrl(url) {
    return url && typeof url === 'string' && url.includes('tiktok.com');
}


/**
 * 检测是否是 TikTok 用户主页
 */
function isTikTokProfile(url) {
    // 用户主页格式: tiktok.com/@username (不包含 /video/)
    return isTikTokUrl(url) && url.includes('@') && !url.includes('/video/');
}

/**
 * 获取 TikTok 视频信息
 */
/**
 * 解析短链接/重定向以获取包含用户名的完整链接
 * 使用 HEAD 请求以提高效率
 */
async function resolveUrl(url) {
    if (!url) return url;
    // 只有短链接或非标准链接需要解析，但为了稳健，尝试解析所有 tiktok 链接
    // 尤其是避免在 yt-dlp 失败时拿不到 weburl
    try {
        const response = await axios.head(url, {
            headers: { 'User-Agent': TIKTOK_CONFIG.userAgent },
            maxRedirects: 5,
            validateStatus: status => status < 500,
            timeout: 5000 // 5秒超时
        });
        // axios 在 request.res.responseUrl 中保存最终 URL
        if (response.request && response.request.res && response.request.res.responseUrl) {
            return response.request.res.responseUrl;
        }
    } catch (e) {
        // console.error('[TikTok] URL resolution failed:', e.message);
        // 忽略错误，返回原始 URL
    }
    return url;
}

/**
 * 获取 TikTok 视频信息
 */
function getVideoInfo(url) {
    return new Promise(async (resolve, reject) => {
        // 预处理：尝试解析最终 URL 以获取作者名 (针对短链接或 yt-dlp 无法获取网页链接的情况)
        // 这步是关键 Fix: 即使 yt-dlp 被封锁或只拿到 ID，我们也能通过 URL 拿到作者名
        const resolvedUrl = await resolveUrl(url);

        // 第一阶段：尝试从原始/解析后的 URL 提取基础信息 (用户名 和 ID)
        let urlAuthor = '';
        let urlVideoId = '';
        try {
            // 匹配 @username
            const authorMatch = resolvedUrl.match(/@([a-zA-Z0-9_\.]+)/);
            if (authorMatch) urlAuthor = authorMatch[1];

            // 匹配 video id (兼容普通链接 /video/123 和 Embed 链接 /v2/123)
            const idMatch = resolvedUrl.match(/(?:\/video\/|\/v2\/)(\d+)/);
            if (idMatch) urlVideoId = idMatch[1];
        } catch (e) { }

        // [New Feature] 如果有 ID 但没有作者 (例如 Embed 链接)，尝试通过“探测 URL”获取真实作者
        // 这绕过了 Embed 页面不包含作者信息的限制，也绕过了 yt-dlp 的 IP 封锁 (使用 axios Mobile UA)
        if (urlVideoId && !urlAuthor) {
            try {
                // 构造一个带占位符的视频 URL，TikTok 通常会返回包含真实元数据的页面
                const probeUrl = `https://www.tiktok.com/@placeholder/video/${urlVideoId}`;
                const res = await axios.get(probeUrl, {
                    headers: { 'User-Agent': TIKTOK_CONFIG.userAgent },
                    validateStatus: status => status < 500,
                    timeout: 5000
                });

                // 从 HTML 中提取 uniqueId
                const uniqueIdMatch = res.data.match(/"uniqueId":"([a-zA-Z0-9_\.]+)"/);
                if (uniqueIdMatch) {
                    urlAuthor = uniqueIdMatch[1];
                    // console.log('[TikTok] Retrieved real author from probe:', urlAuthor);
                }
            } catch (e) {
                // console.warn('[TikTok] Probe fetch failed:', e.message);
            }
        }

        // 策略调整：不要强制转换 Embed，先尝试原始/解析后的 URL
        const targetUrl = resolvedUrl || url;

        const args = [
            '--dump-json',
            '--no-warnings',
            '--user-agent', TIKTOK_CONFIG.userAgent,
            '--add-header', 'Referer:https://www.tiktok.com/'
        ];
        // TikTok 2026 年起通常需要浏览器 Cookie（绕过验证码挑战）
        appendCookiesArg(args);
        args.push(targetUrl);

        // ... (proxy handling logic stays here if inside)
        const proxy = getProxyUrl();
        if (proxy) args.splice(args.length - 1, 0, '--proxy', proxy);

        const ytProcess = spawn(getYtDlpPath(), args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' }
        });
        let stdout = '';
        let stderr = '';

        ytProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytProcess.on('close', async (code) => {
            const fetchEnhancedMetadata = async (currentAuthor, currentVideoId) => {
                let title = '';
                let description = '';
                let author = currentAuthor;
                let thumbnail = '';

                const axiosConfig = {
                    headers: { 'User-Agent': TIKTOK_CONFIG.userAgent },
                    validateStatus: status => status < 500,
                    timeout: 10000,
                    httpsAgent: new https.Agent({ keepAlive: true }),
                    proxy: false
                };

                // 如果没有作者名，尝试通过探测获取
                if (!author && currentVideoId) {
                    try {
                        const probeUrl = `https://www.tiktok.com/@placeholder/video/${currentVideoId}`;
                        const res = await axios.get(probeUrl, axiosConfig);
                        const uniqueIdMatch = res.data.match(/"uniqueId":"([a-zA-Z0-9_\.]+)"/);
                        if (uniqueIdMatch) {
                            author = uniqueIdMatch[1];
                        }
                    } catch (e) {
                        // console.error('[TikTok Probe Error]', e.message);
                    }
                }

                if (author && currentVideoId) {
                    title = `@${author}_${currentVideoId}`;
                    // 构造真实页面 URL 以获取描述
                    const realPageUrl = `https://www.tiktok.com/@${author}/video/${currentVideoId}`;
                    try {
                        const pageRes = await axios.get(realPageUrl, axiosConfig);
                        const pageHtml = pageRes.data;

                        // 1. 尝试提取描述
                        const descMatch = pageHtml.match(/"desc":"((?:[^"\\]|\\.)*)"/);
                        if (descMatch) {
                            try {
                                description = JSON.parse(`"${descMatch[1]}"`);
                                if (description && description.trim()) {
                                    const cleanDesc = description.replace(/[\r\n]+/g, ' ').trim();
                                    title = cleanDesc.substring(0, 80);
                                }
                            } catch (e) {
                                description = descMatch[1];
                            }
                        }

                        // 2. 尝试提取缩略图 (og:image)
                        // 通常是 <meta property="og:image" content="...">
                        const ogImageMatch = pageHtml.match(/property="og:image" content="([^"]+)"/) ||
                            pageHtml.match(/"cover":"([^"]+)"/) ||
                            pageHtml.match(/"dynamicCover":"([^"]+)"/);

                        if (ogImageMatch) {
                            //如果是JSON里的unicode转义，可能需要反转义，但og:image通常是直链
                            let rawUrl = ogImageMatch[1];
                            // 简单的 unicode 解码
                            if (rawUrl.includes('\\u002F')) {
                                rawUrl = rawUrl.replace(/\\u002F/g, '/');
                            }
                            thumbnail = rawUrl;
                        }

                    } catch (e) {
                        console.error('[TikTok Detail Error]', e.message);
                    }
                }

                return { title, description, author, thumbnail };
            };

            const fallback = async () => {
                // 终极兜底：如果 yt-dlp 失败，但我们 从 URL 解析出了作者和ID
                if (urlAuthor && urlVideoId) {
                    console.log('[TikTok] Parsing failed but recovered from URL:', urlAuthor, urlVideoId);

                    const enhanced = await fetchEnhancedMetadata(urlAuthor, urlVideoId);

                    resolve({
                        success: true,
                        title: enhanced.title || `@${enhanced.author || urlAuthor}_${urlVideoId}`,
                        thumbnail: enhanced.thumbnail || '',
                        duration: 0,
                        uploader: enhanced.author || urlAuthor,
                        platform: 'tiktok',
                        url: resolvedUrl,
                        description: enhanced.description,
                        formats: [],
                        qualities: {
                            '720': { height: 720, available: true, label: 'Download', totalSize: 0 }
                        }
                    });
                } else {
                    reject({ success: false, error: stderr || 'Failed to get TikTok video info' });
                }
            };

            if (code === 0) {
                try {
                    // 鲁棒性改进：处理多行 JSON 输出 (例如 Embed 链接会返回多个对象)
                    const lines = stdout.trim().split('\n').filter(l => l.trim().startsWith('{'));
                    let info = null;
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.id || parsed.title) {
                                info = parsed;
                                break;
                            }
                        } catch (e) { }
                    }

                    if (!info) throw new Error('No valid JSON items found');

                    const formats = info.formats || [];

                    // 计算每个分辨率的文件大小
                    const qualityMap = {};
                    const targetQualities = [2160, 1080, 720, 480, 360, 144];

                    // TikTok 格式通常包含视频和音频，或者如果分离则需要合并
                    // 这里我们简单查找包含视频的格式
                    const videoFormats = formats.filter(f => f.vcodec !== 'none');

                    // 定义分辨率分桶规则 (Use existing targetQualities)

                    // 将视频格式映射到标准分桶
                    videoFormats.forEach(f => {
                        let bucket = 0;
                        if (f.height >= 1440) bucket = 2160;
                        else if (f.height >= 900) bucket = 1080;
                        else if (f.height >= 600) bucket = 720;
                        else if (f.height >= 400) bucket = 480;
                        else if (f.height >= 280) bucket = 360;
                        else bucket = 144;

                        // 如果该分桶尚未填充，或当前格式质量更好（文件更大），则更新
                        // 优先看 filesize, 其次看 filesize_approx
                        const currentBest = qualityMap[bucket];
                        const fSize = f.filesize || f.filesize_approx || 0;
                        const cSize = currentBest ? (currentBest.totalSize || 0) : -1;

                        if (!currentBest || fSize > cSize) {
                            qualityMap[bucket] = {
                                height: bucket, // Use bucket height as key
                                realHeight: f.height, // Store real height
                                totalSize: fSize,
                                available: true,
                                formatId: f.format_id
                            };
                        }
                    });

                    // 如果质量映射全空 (Embed 提取常见情况)，手动添加一个默认项
                    const hasValidQuality = Object.values(qualityMap).some(q => q.available);
                    if (!hasValidQuality && info.url) {
                        qualityMap['720'] = {
                            height: 720,
                            totalSize: info.filesize || info.filesize_approx || 0,
                            available: true,
                            label: 'HD'
                        };
                    }

                    // 优先从描述中获取标题
                    let title = info.title || info.description || info.alt_title || '';
                    title = title.trim().substring(0, 100);

                    // 再次尝试从 URL 提取用户名 (针对 yt-dlp 未返回 uploader 的情况)
                    if (!urlAuthor) {
                        const finalUrl = info.webpage_url || info.url || url;
                        // 匹配 @username, 兼容标准链接和部分短链接解析后的格式
                        const userMatch = finalUrl.match(/@([a-zA-Z0-9_\.]+)/);
                        if (userMatch) urlAuthor = userMatch[1];
                    }

                    // 提取到的作者信息优先级：API 返回 > URL 提取 > 默认
                    // 增加 channel 和 author 字段检查，防止漏掉 yt-dlp 的备用字段
                    const safeAuthor = info.uploader || info.uploader_id || info.creator || info.channel || info.author || urlAuthor || 'TikTok 用户';

                    // 兜底逻辑增强: 只要标题看起来像 ID、文件名或者默认值，就尝试重组
                    const isGenericTitle = !title ||
                        title.includes('TikTok Embed') ||
                        /^\d+$/.test(title) ||
                        title === 'Video' ||
                        title.startsWith('TikTok_Video_') ||
                        title.startsWith('video');

                    // 如果检测到信息不完整 (通用标题 或 缺失作者)
                    if (isGenericTitle || safeAuthor === 'TikTok 用户') {
                        const videoId = info.id || urlVideoId || 'Video';

                        // [Fix] yt-dlp 处理 Embed 链接时会返回带后缀的 ID (如 123456-1)，导致探测 URL 404
                        // 必须清洗 ID，确保是纯数字
                        let cleanVideoId = videoId;
                        if (cleanVideoId && typeof cleanVideoId === 'string' && cleanVideoId.includes('-')) {
                            cleanVideoId = cleanVideoId.split('-')[0];
                        }
                        // 如果清洗后不是纯数字，且我们有通过正则提取的 URL ID，优先使用 URL ID
                        if ((!cleanVideoId || !/^\d+$/.test(cleanVideoId)) && urlVideoId) {
                            cleanVideoId = urlVideoId;
                        }

                        // 异步获取增强元数据 
                        // 注意：这里需要将 resolve 变为异步处理
                        // 为了保持代码结构简单，立即调用并等待
                        (async () => {
                            try {
                                const enhanced = await fetchEnhancedMetadata(
                                    safeAuthor !== 'TikTok 用户' ? safeAuthor : urlAuthor,
                                    cleanVideoId
                                );

                                if (enhanced.author) info.uploader = enhanced.author;
                                if (enhanced.title) title = enhanced.title;
                                if (enhanced.description) info.description = enhanced.description;

                                // 二次检查：如果还没拿到好的标题，用作者+ID
                                if (!title || title.startsWith('TikTok_Video_')) {
                                    // 尝试清理 description 中的换行和多余空格
                                    const descSnippet = (info.description || '')
                                        .replace(/[\r\n]+/g, ' ')
                                        .trim()
                                        .substring(0, 30)
                                        .replace(/\s+/g, '_');

                                    const finalAuthor = info.uploader || enhanced.author || safeAuthor;
                                    if (finalAuthor && finalAuthor !== 'TikTok 用户' && descSnippet) {
                                        title = `@${finalAuthor}_${descSnippet}`;
                                    } else if (finalAuthor && finalAuthor !== 'TikTok 用户') {
                                        title = `${finalAuthor}的视频_${videoId}`;
                                    } else {
                                        title = `TikTok_Video_${videoId}`;
                                    }
                                }

                                resolve({
                                    success: true,
                                    title: title,
                                    thumbnail: info.thumbnail,
                                    duration: info.duration,
                                    uploader: info.uploader || safeAuthor,
                                    platform: 'tiktok',
                                    url: info.url || url,
                                    description: info.description,
                                    formats: formats,
                                    qualities: qualityMap
                                });
                            } catch (e) {
                                // 出错则按原样返回
                                resolve({
                                    success: true,
                                    title: title,
                                    thumbnail: info.thumbnail,
                                    duration: info.duration,
                                    uploader: safeAuthor,
                                    platform: 'tiktok',
                                    url: info.url || url,
                                    formats: formats,
                                    qualities: qualityMap
                                });
                            }
                        })();
                        return; // 中断同步执行，等待异步回调
                    }

                    // 如果 info.thumbnail 为空，尝试通过增强元数据获取
                    if (!info.thumbnail && urlAuthor && urlVideoId) {
                        // 这是一个异步操作，但为了不破坏现有结构，我们这里仅做轻量级尝试
                        // 或者我们可以复用 fetchEnhancedMetadata，但这需要一点重构。
                        // 鉴于上面已经定义了 fetchEnhancedMetadata，我们可以利用它。
                        // 注意：我们需要确保它被 await，所以整个回调链需要支持 async。
                        // 目前 ytProcess.on('close') 是同步回调，但我们可以直接在这里调用并在 then 中 resolve。
                        // 但为了最小化改动，简单修复：

                        // 既然我们已经有了 fetchEnhancedMetadata，我们可以稍微延迟 resolve
                        // 但这需要重构很多。
                        // 简单方案：如果这里没有 thumbnail，我们在下面 resolve 时再处理
                    }

                    // 重新组织 resolve 逻辑以支持异步补充
                    const finalizeResolve = async () => {
                        let finalThumbnail = info.thumbnail;

                        // 如果没有缩略图，尝试抓取
                        if (!finalThumbnail && (urlAuthor || safeAuthor) && (info.id || urlVideoId)) {
                            try {
                                const tAuthor = urlAuthor || safeAuthor;
                                const tId = info.id || urlVideoId;
                                if (tAuthor !== 'TikTok 用户' && tId) {
                                    const enhanced = await fetchEnhancedMetadata(tAuthor, tId);
                                    if (enhanced.thumbnail) finalThumbnail = enhanced.thumbnail;
                                }
                            } catch (e) { }
                        }

                        resolve({
                            success: true,
                            title: title,
                            thumbnail: finalThumbnail || '', // 确保不返回 undefined
                            duration: info.duration,
                            uploader: safeAuthor,
                            platform: 'tiktok',
                            url: info.url || url,
                            formats: formats,
                            qualities: qualityMap
                        });
                    };

                    // 必须 await，否则 Promise 不会正确 resolve
                    await finalizeResolve();
                    return; // 结束当前执行
                } catch (e) {
                    fallback();
                }
            } else {
                fallback(); // Use fallback if yt-dlp fails
            }
        });
    });
}

/**
 * 获取 TikTok 用户所有视频
 */
function getUserVideos(profileUrl, maxVideos = 1000) {
    return new Promise((resolve, reject) => {
        const args = [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--playlist-end', String(maxVideos)
        ];
        // TikTok 2026 年起通常需要浏览器 Cookie
        appendCookiesArg(args);
        args.push(profileUrl);

        const proxy = getProxyUrl();
        if (proxy) args.splice(args.length - 1, 0, '--proxy', proxy);

        const process = spawn(getYtDlpPath(), args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const lines = stdout.trim().split('\n').filter(l => l);
                    const items = lines.map((line, index) => {
                        try {
                            const item = JSON.parse(line);
                            return {
                                id: item.id,
                                title: item.title || `Video ${index + 1}`,
                                url: item.url || item.webpage_url,
                                duration: item.duration,
                                thumbnail: item.thumbnail || (item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[0].url : ''),
                                upload_date: item.upload_date // YYYYMMDD
                            };
                        } catch {
                            return null;
                        }
                    }).filter(Boolean);

                    resolve({
                        success: true,
                        isPlaylist: true,
                        count: items.length,
                        items: items
                    });
                } catch (e) {
                    reject({ success: false, error: 'Failed to parse user videos' });
                }
            } else {
                reject({ success: false, error: stderr || 'Failed to get user videos' });
            }
        });
    });
}

/**
 * 下载 TikTok 视频
 */
function downloadVideo(url, options = {}) {
    const {
        savePath,
        quality, // e.g. "720", "1080"
        writeThumbnail = false,
        outputTemplate = '%(title).50s.%(ext)s',
        downloadArchive = null, // Path to archive file or null
        onProgress = () => { }
    } = options;

    return new Promise((resolve, reject) => {
        // 如果指定了质量，尝试下载最接近该分辨率的格式
        // TikTok 视频通常包含音频，所以我们使用 best[height<=quality]
        // 同时支持竖屏视频 (检查 width)
        let formatSelector = 'best';
        if (quality === 'audio') {
            formatSelector = 'bestaudio/best';
        } else if (quality && quality !== 'best') {
            formatSelector = `best[height=${quality}]/best[width=${quality}]/best[height<=${quality}]/best[width<=${quality}]/best`;
        }

        // [Fix] 强制扩展名保底，防止出现 .unknown_video
        let finalTemplate = outputTemplate;
        if (finalTemplate.includes('%(ext)s')) {
            finalTemplate = finalTemplate.replace('%(ext)s', 'mp4');
        }
        if (!finalTemplate.endsWith('.mp4')) {
            finalTemplate += '.mp4';
        }

        // 策略调整：对于下载，维持原始页面 URL 配合 Desktop UA 是获取无水印流的最佳路径 (不再强制 Embed)
        const targetUrl = url;
        const args = [
            '-f', formatSelector,
            '-o', path.join(savePath, finalTemplate),
            '--progress',
            '--newline',
            '--user-agent', TIKTOK_CONFIG.downloadUA,
            '--add-header', 'Referer:https://www.tiktok.com/',
            '--retries', String(TIKTOK_CONFIG.retries),
            '--no-warnings',
            '--merge-output-format', 'mp4',
            '--remux-video', 'mp4',
            '--postprocessor-args', 'ffmpeg:-c:v copy -c:a copy'
        ];

        if (writeThumbnail) {
            args.push('--write-thumbnail');
            args.push('--convert-thumbnails', 'jpg');
        }

        if (downloadArchive) {
            args.push('--download-archive', downloadArchive);
        }

        const proxy = getProxyUrl();
        if (proxy) args.push('--proxy', proxy);

        // TikTok 2026 年起通常需要浏览器 Cookie（绕过验证码挑战）
        appendCookiesArg(args);

        args.push('--encoding', 'utf-8');
        args.push(targetUrl);

        console.log('[TikTok] Spawning yt-dlp with args:', JSON.stringify(args));

        const ytProcess = spawn(getYtDlpPath(), args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' }
        });
        let lastProgress = 0;
        let downloadedFile = '';

        ytProcess.stdout.on('data', (data) => {
            const line = data.toString();
            // console.log('[TikTok] yt-dlp stdout:', line); // Uncomment for deep debug

            // 增强的进度解析 (支持 Speed 和 ETA)
            // 标准格式: [download]  45.0% of 10.00MiB at  2.00MiB/s ETA 00:05
            const fullMatch = line.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+([^\s]+)\s+ETA\s+([^\s]+)/);

            if (fullMatch) {
                const percent = parseFloat(fullMatch[1]);
                const speed = fullMatch[2]; // e.g., "2.00MiB/s"
                const eta = fullMatch[3];   // e.g., "00:05"

                if (percent > lastProgress || speed || eta) {
                    if (percent > lastProgress) lastProgress = percent;
                    onProgress({
                        progress: percent,
                        speed: speed,
                        eta: eta,
                        status: 'downloading'
                    });
                }
            } else {
                // 回退逻辑：仅解析百分比
                const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
                if (match) {
                    const percent = parseFloat(match[1]);
                    if (percent > lastProgress) {
                        lastProgress = percent;
                        onProgress({ progress: percent, status: 'downloading' });
                    }
                }
            }
            // 解析下载的文件路径
            const destMatch = line.match(/\[download\] Destination: (.+)/);
            if (destMatch) {
                downloadedFile = destMatch[1].trim();
            }
            // 检查 "已下载" 情况
            const alreadyMatch = line.match(/\[download\] (.+) has already been downloaded/);
            if (alreadyMatch) {
                downloadedFile = alreadyMatch[1].trim();
            }
            // 检查合并后的文件
            const mergerMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
            if (mergerMatch) {
                downloadedFile = mergerMatch[1].trim();
            }
        });

        let stderrOutput = '';
        ytProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            console.error('TikTok download stderr:', chunk);
            stderrOutput += chunk;
        });

        ytProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, path: savePath, file: downloadedFile });
            } else {
                resolve({ success: false, error: stderrOutput || 'TikTok download failed' });
            }
        });

        ytProcess.on('error', (err) => {
            reject({ success: false, error: err.message });
        });
    });
}

/**
 * 批量下载用户视频
 */
async function downloadUserVideos(profileUrl, options = {}) {
    const {
        savePath,
        quality,
        selectedIndices = null,
        writeThumbnail = false,
        createChannelFolder = true, // Default to true for batch
        timeGroup = 'none', // none, year, quarter, month
        useArchive = true,
        onProgress = () => { },
        onVideoComplete = () => { },
        isCancelled = () => false
    } = options;

    // 先获取视频列表
    const userVideos = await getUserVideos(profileUrl);
    if (!userVideos.success) {
        throw userVideos;
    }

    const videosToDownload = selectedIndices
        ? userVideos.items.filter((_, i) => selectedIndices.includes(i + 1))
        : userVideos.items;

    const total = videosToDownload.length;
    let completed = 0;

    // 获取作者名作为文件夹名
    let authorName = 'TikTok_User';
    if (videosToDownload.length > 0) {
        // try to get author from first video's extra info if available, or just use a fallback
        // Since getUserVideos (flat-playlist) might not have full author info, we rely on what we have.
        // Actually getUserVideos returns items with title, url.
        // We might need to extract author from the page title or first video.
        // For now, let's use a safe fallback or extract from URL if possible.
        const match = profileUrl.match(/@([\w\.]+)/);
        if (match) authorName = match[1];
    }

    // Base save path for this batch
    let batchSavePath = savePath;
    if (createChannelFolder) {
        batchSavePath = path.join(savePath, authorName);
        if (!fs.existsSync(batchSavePath)) {
            fs.mkdirSync(batchSavePath, { recursive: true });
        }
    }

    // Archive file path (increment download)
    let downloadArchive = null;
    if (useArchive) {
        downloadArchive = path.join(batchSavePath, 'archive.txt');
    }

    for (const video of videosToDownload) {
        if (isCancelled()) {
            console.log('[TikTok] Batch download cancelled by user.');
            break;
        }

        try {
            let subFolder = '';
            // Calculate subfolder based on timeGroup and upload_date
            if (timeGroup !== 'none' && video.upload_date && video.upload_date.length === 8) {
                const year = video.upload_date.substring(0, 4);
                const month = parseInt(video.upload_date.substring(4, 6));

                if (timeGroup === 'year') {
                    subFolder = year;
                } else if (timeGroup === 'month') {
                    subFolder = `${year}-${String(month).padStart(2, '0')}`;
                } else if (timeGroup === 'quarter') {
                    const q = Math.ceil(month / 3);
                    subFolder = `${year}-Q${q}`;
                }
            }

            // Combine paths: Base/Channel/SubFolder
            let videoSavePath = subFolder ? path.join(batchSavePath, subFolder) : batchSavePath;

            // Ensure subfolder exists explicitly (optional, but good practice)
            if (subFolder && !fs.existsSync(videoSavePath)) {
                fs.mkdirSync(videoSavePath, { recursive: true });
            }

            // Naming template: YYYYMMDD - Title.ext
            let outputTemplate = '%(upload_date)s - %(title).100s.%(ext)s';

            await downloadVideo(video.url, {
                savePath: videoSavePath,
                quality,
                writeThumbnail,
                outputTemplate,
                downloadArchive, // Pass archive file path (archive is usually at channel root level)
                onProgress: (data) => {
                    onProgress({
                        ...data,
                        current: completed + 1,
                        total,
                        videoTitle: video.title
                    });
                }
            });
            completed++;
            onVideoComplete({ completed, total, video });
        } catch (err) {
            console.error(`Failed to download: ${video.title}`, err);
            // 继续下载其他视频
        }
    }

    return {
        success: true,
        completed,
        total,
        path: savePath
    };
}

module.exports = {
    isTikTokUrl,
    isTikTokProfile,
    getVideoInfo,
    getUserVideos,
    downloadVideo,
    downloadUserVideos,
    TIKTOK_CONFIG
};
