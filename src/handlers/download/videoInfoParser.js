/**
 * Video Info Parser - 视频信息获取与解析
 * 从 downloadHandler.js 提取
 */

const { spawn } = require('child_process');
const { app } = require('electron');
const { getYtDlpPath } = require('../../utils/binaries');
const { getProxyUrl } = require('./proxyUtils');

// 平台服务
const fs = require('fs');
const path = require('path');
const douyin = require('../../../services/platforms/douyin');
const tiktok = require('../../../services/platforms/tiktok');
const instagram = require('../../../services/platforms/instagram');
const facebook = require('../../../services/platforms/facebook');

/**
 * 将普通链接转换为更稳定的提取链接 (如 TikTok Embed)
 * 解决 "Unable to extract webpage video data" 错误
 */
function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const s = url.trim();

    // 1. 抖音 (Douyin) 终极匹配: 针对 iesdouyin.com 做显式硬降级
    if (s.includes('douyin')) {
        // 第一优先级：寻找任何 15-22 位的数字特征 (兼容未来 ID 长度变化)
        const idMatch = s.match(/(\d{15,22})/);
        if (idMatch) {
            console.log('[normalizeUrl] 发现稳定视频 ID:', idMatch[1]);
            return `https://www.douyin.com/video/${idMatch[1]}`;
        }

        // 第二优先级：如果没有数字 ID，但有 ies 子域名，强制换名
        if (s.includes('iesdouyin.com')) {
            console.warn('[normalizeUrl] 发现 iesdouyin 域名，执行强制域名替换');
            return s.replace('iesdouyin.com', 'douyin.com');
        }
    }

    // 2. TikTok 标准化 (已移除 Embed 强制转换，允许 Canonical 原始链接通过以配合 Desktop UA)
    // if (s.includes('tiktok.com')) {
    //     const tkMatch = s.match(/\/video\/(\d+)/);
    //     if (tkMatch) {
    //         return `https://www.tiktok.com/embed/v2/${tkMatch[1]}`;
    //     }
    // }

    return s;
}

/**
 * 从混合输出中提取 JSON
 * 支持多行输出（取第一个有效的 JSON 对象）
 */
function extractJSON(str) {
    if (!str) return null;

    // 尝试按行分割处理
    const lines = str.split('\n').map(l => l.trim()).filter(l => l.startsWith('{'));

    for (const line of lines) {
        try {
            const parsed = JSON.parse(line);
            // 验证是否包含关键字段 (yt-dlp 核心数据)
            if (parsed.id || parsed.title || parsed.formats || parsed.url) {
                return parsed;
            }
        } catch {
            // 继续尝试下一行
        }
    }

    // 备选方案：尝试从整个字符串中寻找第一个完整的 { ... } 块
    const firstBrace = str.indexOf('{');
    if (firstBrace !== -1) {
        // 尝试向后查找匹配的 }
        // 注意：这只是为了应付极其混乱的输出
        for (let i = str.length - 1; i > firstBrace; i--) {
            if (str[i] === '}') {
                try {
                    const candidate = str.substring(firstBrace, i + 1);
                    const parsed = JSON.parse(candidate);
                    return parsed;
                } catch {
                    // Keep searching for a valid JSON object boundary.
                }
            }
        }
    }

    return null;
}

/**
 * 解析 yt-dlp 返回的格式信息
 * @param {Object} info - yt-dlp JSON 输出
 * @returns {Object} 解析后的质量信息
 */
function parseVideoFormats(info) {
    const videoFormats = info.formats?.filter(f => f.vcodec !== 'none' && f.height) || [];
    const audioFormats = info.formats?.filter(f => f.acodec !== 'none' && f.vcodec === 'none') || [];
    const getFileSize = (f) => {
        if (!f) return 0;
        return f.filesize || f.filesize_approx || 0;
    };

    const bestAudio = audioFormats
        .filter(f => f.acodec?.startsWith('mp4a') && getFileSize(f))
        .sort((a, b) => getFileSize(b) - getFileSize(a))[0]
        || audioFormats.filter(f => getFileSize(f)).sort((a, b) => getFileSize(b) - getFileSize(a))[0];

    let audioSize = getFileSize(bestAudio);
    if (audioSize === 0 && info.duration && bestAudio?.tbr) {
        audioSize = Math.round((info.duration * bestAudio.tbr * 1000) / 8);
    }
    const qualityMap = {};
    // 分辨率分桶映射 (统一 UI 显示)
    videoFormats.forEach(f => {
        let bucket = 0;
        if (f.height >= 1440) bucket = 2160;
        else if (f.height >= 900) bucket = 1080;
        else if (f.height >= 600) bucket = 720;
        else if (f.height >= 400) bucket = 480;
        else if (f.height >= 280) bucket = 360;
        else bucket = 144;

        const currentBest = qualityMap[bucket];
        const fSize = getFileSize(f);
        const cSize = currentBest ? (currentBest.totalSize || 0) : -1;

        // 估算大小补全
        let vSize = fSize;
        if (vSize === 0 && info.duration && f.tbr) {
            vSize = Math.round((info.duration * f.tbr * 1000) / 8);
        }

        // 如果该分桶尚未填充，或当前格式质量更好（文件更大），则更新
        if (!currentBest || vSize > cSize) {
            qualityMap[bucket] = {
                height: bucket,
                realHeight: f.height,
                videoSize: vSize,
                audioSize: audioSize,
                totalSize: vSize + audioSize,
                available: true
            };
        }
    });

    const duration = info.duration || 0;
    const audioBitrates = {
        320: { bitrate: 320, size: Math.round(duration * 320 / 8 * 1000) },
        256: { bitrate: 256, size: Math.round(duration * 256 / 8 * 1000) },
        192: { bitrate: 192, size: Math.round(duration * 192 / 8 * 1000) },
        128: { bitrate: 128, size: Math.round(duration * 128 / 8 * 1000) },
        'wav': { bitrate: 1411, size: Math.round(duration * 1411 / 8 * 1000) },
        'flac': { bitrate: 900, size: Math.round(duration * 900 / 8 * 1000) }
    };

    return { qualityMap, audioBitrates };
}

/**
 * 使用 yt-dlp 获取视频信息
 * @param {string} url - 视频 URL
 * @returns {Promise<Object>}
 */
function getVideoInfoWithYtDlp(url) {
    return new Promise((resolve) => {
        const targetUrl = normalizeUrl(url);
        const isMobilePlatform = url.includes('tiktok.com'); // DO NOT include douyin here, yt-dlp needs Desktop UA for douyin
        const userAgent = isMobilePlatform
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

        const args = [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '--user-agent', userAgent,
        ];

        // 动态添加平台敏感的 Referer
        const lowUrl = targetUrl.toLowerCase();
        if (lowUrl.includes('bilibili.com')) {
            args.push('--add-header', 'Referer:https://www.bilibili.com/');
            args.push('--add-header', 'Origin:https://www.bilibili.com');
        } else if (lowUrl.includes('tiktok.com')) {
            args.push('--add-header', 'Referer:https://www.tiktok.com/');
        } else if (lowUrl.includes('instagram.com')) {
            args.push('--add-header', 'Referer:https://www.instagram.com/');
        } else if (lowUrl.includes('douyin.com')) {
            args.push('--add-header', 'Referer:https://www.douyin.com/');
        }

        const proxy = getProxyUrl();
        if (proxy) args.push('--proxy', proxy);

        // 自动挂载浏览器扩展同步的 Cookie
        try {
            const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
            if (fs.existsSync(cookiePath)) {
                args.push('--cookies', cookiePath);
            }
        } catch (err) {
            console.error('[Parser] Failed to check cookies.txt:', err);
        }

        // 安全预检：防御 Argument Injection
        if (!targetUrl || targetUrl.trim().startsWith('-')) {
            resolve({ success: false, error: 'Invalid or insecure URL' });
            return;
        }

        args.push('--', targetUrl);

        const ytProcess = spawn(getYtDlpPath(), args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' }
        });

        let stdout = '';
        let stderr = '';

        // 超时保护：30 秒后强制终止，防止网络卡死时 Promise 永久挂起
        const timeoutHandle = setTimeout(() => {
            ytProcess.kill();
            resolve({ success: false, error: 'Video info fetch timed out (30s). Check your network connection.' });
        }, 30000);

        ytProcess.on('error', (err) => {
            clearTimeout(timeoutHandle);
            const msg = err?.message || String(err);
            if (/ENOENT|not found|spawn/i.test(msg)) {
                resolve({
                    success: false,
                    error: 'YTDLP_MISSING',
                    message: 'yt-dlp not found. Open Settings → Core engines to install or reinstall the app.'
                });
                return;
            }
            resolve({ success: false, error: 'Failed to start yt-dlp: ' + msg });
        });

        ytProcess.stdout.on('data', (data) => stdout += data.toString('utf8'));
        ytProcess.stderr.on('data', (data) => stderr += data.toString('utf8'));

        ytProcess.on('close', (code) => {
            clearTimeout(timeoutHandle);
            if (code === 0) {
                try {
                    // Try improved parsing
                    const info = extractJSON(stdout);

                    if (!info) {
                        throw new Error('No valid JSON found in output');
                    }

                    const { qualityMap, audioBitrates } = parseVideoFormats(info);

                    resolve({
                        success: true,
                        title: info.title,
                        url: info.webpage_url || info.url || targetUrl,
                        thumbnail: info.thumbnail,
                        duration: info.duration,
                        uploader: info.uploader || info.channel,
                        platform: info.extractor_key || info.extractor,
                        qualities: qualityMap,
                        audioBitrates: audioBitrates
                    });
                } catch (e) {
                    console.error('[VideoInfo] YtDlp Output Parsing Failed:', e.message);
                    console.error('============== RAW STDOUT START ==============');
                    console.error(stdout.substring(0, 1000));
                    console.error('============== RAW STDOUT END ==============');

                    try {
                        const debugPath = path.join(process.cwd(), 'debug_ytdlp_error.txt');
                        fs.writeFileSync(debugPath, `Time: ${new Date().toISOString()}\nURL: ${targetUrl}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${e.message}\n-------------------\n`, { flag: 'a' });
                    } catch (fsErr) { console.error('Failed to write debug log', fsErr); }

                    resolve({ success: false, error: 'Failed to parse video info: ' + e.message });
                }
            } else {
                resolve({ success: false, error: stderr || 'Failed to get video info' });
            }
        });
    });
}

/**
 * 获取视频信息 (支持多平台)
 * @param {string} url - 视频 URL
 * @returns {Promise<Object>}
 */
async function getVideoInfo(url) {
    url = normalizeUrl(url);

    // Platform specific checks
    if (douyin.isDouyinUrl(url)) {
        try {
            const info = await douyin.getVideoInfo(url);
            if (info && info.title) return info;
        } catch (error) { console.warn('[VideoInfo] Douyin parser failed, falling back:', error); }
    }
    if (tiktok.isTikTokUrl(url)) {
        try {
            const info = await tiktok.getVideoInfo(url);
            if (info && info.title) return info;
        } catch (error) { console.warn('[VideoInfo] TikTok parser failed, falling back:', error); }
    }
    if (instagram.isInstagramUrl(url)) {
        try {
            const info = await instagram.getVideoInfo(url);
            if (info && info.title) return info;
        } catch (error) { console.warn('[VideoInfo] Instagram parser failed, falling back:', error); }
    }
    if (facebook.isFacebookUrl(url)) {
        try {
            const info = await facebook.getVideoInfo(url);
            if (info && info.title) return info;
        } catch (error) { console.warn('[VideoInfo] Facebook parser failed, falling back:', error); }
    }

    // Default: use yt-dlp (Generic Fallback)
    return getVideoInfoWithYtDlp(url);
}

/**
 * 注册视频信息相关 IPC handlers
 * @param {Electron.IpcMain} ipcMain
 */
function assertYtDlpAvailable() {
    try {
        const ytdlp = getYtDlpPath();
        if (!ytdlp || !fs.existsSync(ytdlp)) {
            return {
                success: false,
                error: 'YTDLP_MISSING',
                message: 'yt-dlp not found. Open Settings → Core engines to install or reinstall the app.'
            };
        }
    } catch (err) {
        return {
            success: false,
            error: 'YTDLP_MISSING',
            message: err?.message || 'yt-dlp not found. Open Settings → Core engines.'
        };
    }
    return null;
}

function setupVideoInfoHandlers(ipcMain) {
    ipcMain.handle('video:getInfo', async (event, url) => {
        try {
            const missing = assertYtDlpAvailable();
            if (missing) return missing;
            return await getVideoInfo(url);
        } catch (e) {
            console.error('[VideoInfo] IPC handler error:', e.message);
            return { success: false, error: e.message };
        }
    });
}

module.exports = {
    parseVideoFormats,
    getVideoInfo,
    getVideoInfoWithYtDlp,
    setupVideoInfoHandlers
};
