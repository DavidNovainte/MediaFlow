/**
 * Instagram 下载服务模块
 * 处理 Instagram Reels/Post 视频下载
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getYtDlpPath } = require('../../src/utils/binaries');

/**
 * Instagram 下载配置
 */
const INSTAGRAM_CONFIG = {
    // Instagram 需要的 User-Agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // 重试次数
    retries: 3,
    // 请求间隔（毫秒）
    sleepInterval: 2000
};

/**
 * 检测是否是 Instagram 链接
 */
function isInstagramUrl(url) {
    return url && typeof url === 'string' && url.includes('instagram.com');
}

/**
 * 检测是否是 Instagram Reel
 */
function isInstagramReel(url) {
    return isInstagramUrl(url) && url.includes('/reel/');
}

/**
 * 检测是否是 Instagram Post
 */
function isInstagramPost(url) {
    return isInstagramUrl(url) && url.includes('/p/');
}

/**
 * 检测是否是 Instagram 用户主页
 */
function isInstagramProfile(url) {
    if (!isInstagramUrl(url)) return false;
    // 排除 reel, post, stories 等路径
    const excludedPaths = ['/reel/', '/p/', '/stories/', '/reels/', '/explore/', '/accounts/', '/direct/'];
    return !excludedPaths.some(path => url.includes(path));
}

/**
 * 解析 Instagram URL，获取类型和标识符
 */
function parseInstagramUrl(url) {
    // Reel: instagram.com/reel/SHORTCODE/
    if (url.includes('/reel/')) {
        const match = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
        if (match) return { type: 'reel', shortcode: match[1] };
    }

    // Post: instagram.com/p/SHORTCODE/
    if (url.includes('/p/')) {
        const match = url.match(/\/p\/([A-Za-z0-9_-]+)/);
        if (match) return { type: 'post', shortcode: match[1] };
    }

    // Profile: instagram.com/username
    const profileMatch = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?(\?|$)/);
    if (profileMatch) {
        const username = profileMatch[1];
        // 排除保留路径
        if (!['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'].includes(username)) {
            return { type: 'profile', username };
        }
    }

    return null;
}

/**
 * 获取 Instagram 视频信息
 */
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const parsed = parseInstagramUrl(url);

        if (!parsed) {
            reject({ success: false, error: 'Invalid Instagram URL' });
            return;
        }

        // 暂不支持用户主页批量下载
        if (parsed.type === 'profile') {
            resolve({
                success: true,
                title: `@${parsed.username}`,
                thumbnail: '',
                duration: 0,
                uploader: parsed.username,
                platform: 'instagram',
                batchNotSupported: true,
                batchMessage: 'Instagram 用户主页批量下载暂不支持。请复制单个 Reel 视频的链接进行下载。'
            });
            return;
        }

        const args = [
            '--dump-json',
            '--no-warnings',
            '--user-agent', INSTAGRAM_CONFIG.userAgent,
            url
        ];

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
            if (code === 0 && stdout) {
                try {
                    // yt-dlp may output multiple lines (warnings + JSON)
                    // Find and parse only the JSON line
                    let jsonData = stdout.trim();

                    // If output contains multiple lines, try to find the JSON line
                    if (jsonData.includes('\n')) {
                        const lines = jsonData.split('\n');
                        // Try to find a line that starts with '{' (JSON object)
                        const jsonLine = lines.find(line => line.trim().startsWith('{'));
                        if (jsonLine) {
                            jsonData = jsonLine.trim();
                        } else {
                            // Fallback: use the last non-empty line
                            jsonData = lines.filter(l => l.trim()).pop() || jsonData;
                        }
                    }

                    const info = JSON.parse(jsonData);
                    const formats = info.formats || [];

                    // 计算每个分辨率的文件大小
                    const qualityMap = {};
                    const targetQualities = [2160, 1080, 720, 480, 360, 144];

                    const videoFormats = formats.filter(f => f.vcodec !== 'none');

                    // 定义分辨率分桶规则 (Using existing targetQualities)

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

                    // Process title - truncate if too long
                    let title = info.title || info.description?.substring(0, 50) || 'Instagram Video';
                    if (title.length > 80) {
                        title = title.substring(0, 77) + '...';
                    }

                    // 获取缩略图 - Instagram 可能使用 thumbnails 数组
                    let thumbnail = info.thumbnail;
                    if (!thumbnail && info.thumbnails && info.thumbnails.length > 0) {
                        // 选择最大的缩略图
                        const sorted = info.thumbnails.sort((a, b) =>
                            ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
                        );
                        thumbnail = sorted[0].url;
                    }

                    resolve({
                        success: true,
                        title: title,
                        thumbnail: thumbnail || '',
                        duration: info.duration,
                        uploader: info.uploader || info.channel,
                        platform: 'instagram',
                        url: info.url,
                        formats: formats,
                        qualities: qualityMap
                    });
                } catch (e) {
                    reject({ success: false, error: 'Failed to parse Instagram video info: ' + e.message });
                }
            } else {
                reject({ success: false, error: stderr || 'Failed to get Instagram video info' });
            }
        });

        process.on('error', (err) => {
            reject({ success: false, error: err.message });
        });
    });
}

/**
 * 下载 Instagram 视频
 */
function downloadVideo(url, options = {}) {
    const {
        savePath,
        quality,
        writeThumbnail = false,
        outputTemplate = '%(title).50s.%(ext)s',
        onProgress = () => { }
    } = options;

    return new Promise((resolve, reject) => {
        const parsed = parseInstagramUrl(url);

        if (!parsed || parsed.type === 'profile') {
            reject({ success: false, error: 'Profile batch download not supported. Please use a direct reel link.' });
            return;
        }

        // 格式选择器
        // 格式选择器
        let formatSelector = 'best';
        if (quality === 'audio') {
            formatSelector = 'bestaudio/best';
        } else if (quality && quality !== 'best') {
            formatSelector = `best[height=${quality}]/best[width=${quality}]/best[height<=${quality}]/best[width<=${quality}]/best`;
        }

        const args = [
            '-f', formatSelector,
            '-o', path.join(savePath, outputTemplate),
            '--progress',
            '--newline',
            '--user-agent', INSTAGRAM_CONFIG.userAgent,
            '--retries', String(INSTAGRAM_CONFIG.retries),
            '--no-warnings'
        ];

        if (writeThumbnail) {
            args.push('--write-thumbnail');
            args.push('--convert-thumbnails', 'jpg');
        }

        args.push(url);

        // 强制 UTF-8 编码输出
        args.push('--encoding', 'utf-8');

        const process = spawn(getYtDlpPath(), args, {
            env: { ...global.process.env, PYTHONIOENCODING: 'utf-8' }
        });
        let lastProgress = 0;
        let downloadedFile = '';
        let stderrOutput = '';

        process.stdout.on('data', (data) => {
            const line = data.toString();

            // 解析进度
            const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
            if (match) {
                const percent = parseFloat(match[1]);
                if (percent > lastProgress) {
                    lastProgress = percent;
                    onProgress({ progress: percent, status: 'downloading' });
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

        process.stderr.on('data', (data) => {
            const chunk = data.toString();
            console.error('Instagram download stderr:', chunk);
            stderrOutput += chunk;
        });

        process.on('close', (code) => {
            console.log('[Instagram] 下载完成, 文件路径:', downloadedFile);
            if (code === 0) {
                resolve({
                    success: true,
                    path: savePath,
                    file: downloadedFile
                });
            } else {
                resolve({ success: false, error: stderrOutput || 'Instagram download failed' });
            }
        });

        process.on('error', (err) => {
            reject({ success: false, error: err.message });
        });
    });
}

module.exports = {
    isInstagramUrl,
    isInstagramReel,
    isInstagramPost,
    isInstagramProfile,
    parseInstagramUrl,
    getVideoInfo,
    downloadVideo,
    INSTAGRAM_CONFIG
};
