/**
 * Facebook 下载服务模块
 * 处理 Facebook 视频、Reels 下载
 */

const { spawn } = require('child_process');
const path = require('path');
const { getYtDlpPath } = require('../../src/utils/binaries');
const { appendCookiesArg } = require('../../src/handlers/download/cookieUtils');

/**
 * Facebook 下载配置
 */
const FACEBOOK_CONFIG = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    retries: 3
};

/**
 * 检测是否是 Facebook 链接
 */
function isFacebookUrl(url) {
    return url && typeof url === 'string' && (url.includes('facebook.com') || url.includes('fb.watch'));
}

/**
 * 获取 Facebook 视频信息
 */
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-warnings',
            '--user-agent', FACEBOOK_CONFIG.userAgent
        ];
        // Facebook 2026 年起通常需要浏览器 Cookie
        appendCookiesArg(args);
        args.push(url);

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
                    const info = JSON.parse(stdout);
                    const formats = info.formats || [];

                    // 计算每个分辨率的文件大小
                    const qualityMap = {};
                    const targetQualities = [2160, 1080, 720, 480, 360, 144];

                    const videoFormats = formats.filter(f => f.vcodec !== 'none');

                    targetQualities.forEach(height => {
                        const matching = videoFormats.filter(f => f.height === height);
                        if (matching.length > 0) {
                            const best = matching.sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];
                            if (best) {
                                qualityMap[height] = {
                                    height,
                                    totalSize: best.filesize || best.filesize_approx || 0,
                                    available: true,
                                    formatId: best.format_id
                                };
                            }
                        } else {
                            qualityMap[height] = {
                                height,
                                available: false,
                                totalSize: 0
                            };
                        }
                    });

                    // 如果没有匹配到标准分辨率，使用最佳可用格式
                    const hasAvailable = Object.values(qualityMap).some(q => q.available);
                    if (!hasAvailable && videoFormats.length > 0) {
                        const best = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
                        const height = best.height || 720;
                        qualityMap[height] = {
                            height,
                            totalSize: best.filesize || best.filesize_approx || 0,
                            available: true,
                            formatId: best.format_id,
                            label: `${height}p HD`
                        };
                    }

                    // 截断标题
                    let title = info.title || info.description?.substring(0, 50) || 'Facebook Video';
                    if (title.length > 80) {
                        title = title.substring(0, 77) + '...';
                    }

                    // 获取缩略图
                    let thumbnail = info.thumbnail;
                    if (!thumbnail && info.thumbnails && info.thumbnails.length > 0) {
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
                        uploader: info.uploader || info.channel || '',
                        platform: 'facebook',
                        url: info.url,
                        formats: formats,
                        qualities: qualityMap
                    });
                } catch (e) {
                    reject({ success: false, error: 'Failed to parse Facebook video info: ' + e.message });
                }
            } else {
                reject({ success: false, error: stderr || 'Failed to get Facebook video info' });
            }
        });
    });
}

/**
 * 下载 Facebook 视频
 */
function downloadVideo(url, options = {}) {
    const {
        savePath,
        quality = '720',
        writeThumbnail = false,
        onProgress = () => { }
    } = options;

    return new Promise((resolve, reject) => {
        // 构建格式选择字符串
        let formatStr;
        const qualityNum = parseInt(quality);
        if (qualityNum >= 2160) {
            formatStr = 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best';
        } else if (qualityNum >= 1080) {
            formatStr = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
        } else if (qualityNum >= 720) {
            formatStr = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
        } else if (qualityNum >= 480) {
            formatStr = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best';
        } else {
            formatStr = 'bestvideo[height<=360]+bestaudio/best[height<=360]/best';
        }

        const args = [
            '-f', formatStr,
            '--merge-output-format', 'mp4',
            '-o', `${savePath}/%(title).80s.%(ext)s`,
            '--no-playlist',
            '--newline',
            '--progress',
            '--user-agent', FACEBOOK_CONFIG.userAgent
        ];

        if (writeThumbnail) {
            args.push('--write-thumbnail');
            args.push('--convert-thumbnails', 'jpg');
        }

        // Facebook 2026 年起通常需要浏览器 Cookie
        appendCookiesArg(args);

        args.push(url);

        const downloadProcess = spawn(getYtDlpPath(), args);
        let lastProgress = 0;

        downloadProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const progressMatch = output.match(/(\d+\.?\d*)%/);
            if (progressMatch) {
                const progress = parseFloat(progressMatch[1]);
                if (progress > lastProgress) {
                    lastProgress = progress;
                    onProgress({ progress, status: 'downloading' });
                }
            }
        });

        downloadProcess.stderr.on('data', (data) => {
            console.log('[Facebook] stderr:', data.toString());
        });

        downloadProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, path: savePath });
            } else {
                reject({ success: false, error: 'Facebook download failed' });
            }
        });
    });
}

module.exports = {
    isFacebookUrl,
    getVideoInfo,
    downloadVideo,
    FACEBOOK_CONFIG
};
