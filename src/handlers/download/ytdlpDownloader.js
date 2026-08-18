/**
 * YtDlp Downloader - 鏍稿績涓嬭浇閫昏緫
 * 浠?downloadHandler.js 鎻愬彇
 */

const { spawn } = require('child_process');
const { app } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { getYtDlpPath, getFfmpegPath } = require('../../utils/binaries');
const fs = require('fs');
const { getProxyUrl } = require('./proxyUtils');
const ProcessManager = require('../../utils/ProcessManager');
const { sanitizePathSegment } = require('../../utils/sanitizePathSegment');

const tiktok = require('../../../services/platforms/tiktok');
const instagram = require('../../../services/platforms/instagram');
const douyin = require('../../../services/platforms/douyin');
const facebook = require('../../../services/platforms/facebook');

const store = new Store();
const { createProgressThrottler } = require('../../utils/progressThrottle');
const isTestEnv = process.env.NODE_ENV === 'test';

// Download process management
const activeDownloads = new Map(); // downloadId(string) -> { process, cancelled }
let downloadIdCounter = 0;

function normalizeDownloadId(id) {
    if (id === undefined || id === null || id === '') return null;
    return String(id);
}

/** Register or update an active download entry without clearing a prior cancel flag. */
function trackDownload(downloadId, patch = {}) {
    const id = normalizeDownloadId(downloadId);
    if (!id) return null;
    const prev = activeDownloads.get(id) || { process: null, cancelled: false };
    const next = {
        process: patch.process !== undefined ? patch.process : prev.process,
        cancelled: patch.cancelled !== undefined ? patch.cancelled : prev.cancelled
    };
    activeDownloads.set(id, next);
    return next;
}

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

/**
 * 鍩熷悕涓?URL 鏍囧噯鍖?(Final Guard)
 * 纭繚鍗充娇杩涘叆 yt-dlp 璺緞锛岄摼鎺ヤ篃涓嶄細鎻愮ず Unsupported URL
 */
function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const s = url.trim();

    // 1. 鎶栭煶 (Douyin) 缁堟瀬鍖归厤: 閽堝浠讳綍鍙樹綋鍩熷悕锛岄攣瀹?ID 涓哄敮涓€鏍囧噯
    if (s.includes('douyin')) {
        const idMatch = s.match(/(\d{15,22})/);
        if (idMatch) {
            debugLog('[normalizeUrl-Backend] Douyin video ID:', idMatch[1]);
            return `https://www.douyin.com/video/${idMatch[1]}`;
        }
        // 濡傛灉娌″彂鐜?ID 鐗瑰緛锛屽仛绠€鍗曞煙鍚嶉檷绾?
        if (s.includes('iesdouyin.com')) {
            return s.replace('iesdouyin.com', 'douyin.com');
        }
    }

    // 2. TikTok 寮哄埗鏍囧噯鍖?(Embed 璺緞)
    // [Change] 绉婚櫎 Embed 寮哄埗杞崲锛屽厑璁?Canonical URL 閫氳繃 (閰嶅悎 Desktop UA 浣跨敤)
    // if (s.includes('tiktok.com')) {
    //     const tkMatch = s.match(/\/video\/(\d+)/);
    //     if (tkMatch) {
    //         return `https://www.tiktok.com/embed/v2/${tkMatch[1]}`;
    //     }
    // }
    return s;
}

function generateDownloadId() {
    return `dl_${Date.now()}_${++downloadIdCounter}`;
}

/**
 * 鎵ц涓嬭浇
 * @param {Object} options - 涓嬭浇閫夐」 { url, savePath, quality, audioOnly, playlistItems, writeThumbnail, writeSubtitles, sender }
 * @returns {Promise<Object>}
 */
async function downloadVideo(options) {
    // 鏄惧紡鎻愬彇鍙傛暟锛岀'淇濆畨鍏?
    let {
        url, quality, audioOnly,
        playlistItems, writeThumbnail, writeSubtitles,
        directUrl, platform
    } = options;

    // 鍏抽敭锛氬鏋滃凡缁忔湁棰勮В鏋愮殑鐩撮摼锛堟壒閲忎笅杞介€氬父宸叉瀽鍑猴級锛屼紭鍏堜娇鐢ㄧ洿閾?
    // [Fix] TikTok 鍙婂叾 CDN 鍦板潃蹇呴』鎺掗櫎锛氬洜涓烘娴嬮樁娈佃幏鍙栫殑鐩撮摼寰€寰€甯︽按鍗帮紝蹇呴』鐢ㄥ師濮嬮〉闈㈤摼鎺ラ噸鏂拌В鏋?
    const isTikTok = (platform === 'tiktok') ||
        (url && (url.includes('tiktok.com') || url.includes('tiktokcdn.com') || url.includes('byteimg.com')));

    if (directUrl && !isTikTok) {
        url = directUrl;
    } else {
        url = url ? url.trim() : '';
    }

    // [Final Guard] 閽堝鎶栭煶 iesdouyin 鎶ラ敊鐨勬毚鍔涗慨澶?
    if (url.includes('douyin.com')) {
        const videoIdMatch = url.match(/video\/(\d+)/);
        if (videoIdMatch && videoIdMatch[1]) {
            url = `https://www.douyin.com/video/${videoIdMatch[1]}`;
        }
    }

    url = normalizeUrl(url);

    if (!url || typeof url !== 'string') {
        return { success: false, error: 'Invalid URL provided' };
    }

    // Fail fast with actionable message when core tools are missing
    try {
        const ytdlp = getYtDlpPath();
        if (!ytdlp || !fs.existsSync(ytdlp)) {
            return {
                success: false,
                error: 'YTDLP_MISSING',
                message: 'yt-dlp not found. Open Settings → Core engines to install or reinstall the app.'
            };
        }
        const ffmpeg = getFfmpegPath();
        if (!ffmpeg || !fs.existsSync(ffmpeg)) {
            // yt-dlp often still works for single-format downloads, but merge/remux fails hard.
            console.warn('[Downloader] ffmpeg missing — merges/remux may fail. Open Settings → Core engines.');
            if (options.sender && !options._ffmpegWarned) {
                try {
                    options.sender.send('download:warning', {
                        code: 'FFMPEG_MISSING',
                        message: 'ffmpeg not found. Open Settings → Core engines for best results (merge/remux).'
                    });
                } catch {
                    /* ignore */
                }
            }
        }
    } catch (binErr) {
        console.warn('[Downloader] binary precheck:', binErr?.message || binErr);
    }

    // 鑾峰彇鍙戦€佽€呭苟璁板綍锛岀敤浜庤繘搴﹀洖浼?
    const sender = options.sender;
    const downloadId = normalizeDownloadId(options.id) || generateDownloadId();

    // Handle savePath / outputDir mapping
    let savePath = options.savePath || options.outputDir;

    if (!savePath) {
        return { success: false, error: 'Download path is not specified' };
    }

    // Ensure savePath is a string
    if (typeof savePath !== 'string') {
        console.error('[ytdlpDownloader] Invalid savePath:', savePath);
        return { success: false, error: 'Invalid download path' };
    }

    // 1. Platform specific downloads
    if (douyin.isDouyinUrl(url)) {
        try {
            trackDownload(downloadId, { process: null, cancelled: false });
            const onProgress = (data) => {
                if (sender && !sender.isDestroyed()) {
                    sender.send('download:progress', { ...data, id: downloadId });
                }
            };

            debugLog('[Douyin] Using dedicated downloader:', url);
            const result = await douyin.downloadVideo(url, {
                savePath,
                title: options.title,
                directUrl: options.directUrl, // 补全：透传已解析的直链
                videoId: options.videoId,     // 补全：透传精确ID
                onProgress,
                isCancelled: () => !!activeDownloads.get(downloadId)?.cancelled
            });

            activeDownloads.delete(downloadId);
            // 琛ュ叏鏍稿績锛氬彧鏈夌湡姝ｄ笅杞芥垚鍔熷苟浜у嚭鏂囦欢鎵嶈繑鍥?
            if (result && result.success && result.file) {
                return result;
            }

            console.warn('[Douyin] 涓撳睘寮曟搸鏈兘鑾峰彇瑙嗛鍦板潃锛屽噯澶囪Е鍙?yt-dlp 鍥為€€閾捐矾');
        } catch (error) {
            activeDownloads.delete(downloadId);
            console.warn('[Douyin] 涓撳睘閾捐矾寮傚父:', error.message);
        }
    }

    if (tiktok.isTikTokUrl(url)) {
        try {
            trackDownload(downloadId, { process: null, cancelled: false });
            const proxy = getProxyUrl();
            const onProgress = (data) => {
                if (sender && !sender.isDestroyed()) {
                    sender.send('download:progress', { ...data, id: downloadId });
                }
            };

            let result;
            if (tiktok.isTikTokProfile(url)) {
                result = await tiktok.downloadUserVideos(url, {
                    savePath, quality,
                    selectedIndices: playlistItems ? playlistItems.split(',').map(Number) : null,
                    writeThumbnail, proxy, onProgress,
                    isCancelled: () => {
                        const dl = activeDownloads.get(downloadId);
                        return dl ? dl.cancelled : false;
                    }
                });
            } else {
                result = await tiktok.downloadVideo(url, {
                    savePath, quality, writeThumbnail, proxy, onProgress,
                    isCancelled: () => !!activeDownloads.get(downloadId)?.cancelled
                });
            }
            activeDownloads.delete(downloadId);
            return result;
        } catch (error) { 
            activeDownloads.delete(downloadId);
            return { success: false, error: error.message || String(error) }; 
        }
    }

    if (instagram.isInstagramUrl(url)) {
        try {
            trackDownload(downloadId, { process: null, cancelled: false });
            const result = await instagram.downloadVideo(url, {
                savePath, quality, writeThumbnail,
                proxy: getProxyUrl(),
                onProgress: (data) => { if (sender && !sender.isDestroyed()) sender.send('download:progress', { ...data, id: downloadId }); }
            });
            activeDownloads.delete(downloadId);
            return result;
        } catch (error) { 
            activeDownloads.delete(downloadId);
            return { success: false, error: error.message || String(error) }; 
        }
    }

    if (facebook.isFacebookUrl(url)) {
        try {
            trackDownload(downloadId, { process: null, cancelled: false });
            const result = await facebook.downloadVideo(url, {
                savePath, quality, writeThumbnail,
                onProgress: (data) => { if (sender && !sender.isDestroyed()) sender.send('download:progress', { ...data, id: downloadId }); }
            });
            activeDownloads.delete(downloadId);
            return result;
        } catch (error) { 
            activeDownloads.delete(downloadId);
            return { success: false, error: error.message || String(error) }; 
        }
    }

    // 2. yt-dlp download logic
    // Ensure ttwid cookie exists for Douyin yt-dlp fallback (detail API requires cookie since 2026-08)
    if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
        try {
            await douyin.writeYtDlpCookies();
        } catch (err) {
            console.warn('[Downloader] Failed to prepare Douyin cookies for yt-dlp:', err?.message || err);
        }
    }

    return new Promise((resolve) => {
        let formatStr;
        let audioBitrateValue = options.audioBitrate || options.audioQuality || '192';
        let audioFormatValue = options.audioFormat || 'mp3';
        const shouldExtractAudio = Boolean(audioOnly || quality === 'audio');

        if (shouldExtractAudio) {
            // [Fix] 绉婚櫎 acodec^=mp4a 闄愬埗锛宨OS/Android 瀹㈡埛绔彲鑳借繑鍥?opus 绛夊叾浠栨牸寮?
            formatStr = 'bestaudio/best';
        } else if (quality === 'best') {
            // [Fix] 浼樺厛涓嬭浇 H.264 (avc1) + AAC锛屼互纭繚 WhatsApp/iPhone 鍏煎鎬?
            formatStr = 'bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best';
        } else {
            // [Fix] 浼樺厛涓嬭浇 H.264 (avc1) + AAC锛屼互纭繚 WhatsApp/iPhone 鍏煎鎬?
            // 濡傛灉鍙湁 VP9/AV1锛屽垯鍚庣画閫氳繃 --recode-video 鑷姩杞爜
            formatStr = `bestvideo[height<=${quality}][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=${quality}]+bestaudio/bestvideo+bestaudio/best`;
        }

        let filenameTemplate = store.get('filenameTemplate') || '%(title)s.%(ext)s';

        // [Fix] 浼樺厛浣跨敤澶栭儴浼犲叆鐨勫凡瑙ｆ瀽鏍囬锛岄槻姝?yt-dlp 鎶撳彇鍒伴殢鏈?ID 鎴栧瓧姣嶆爣棰?
        if (options.title && !['鏈煡鏍囬', '瑙嗛涓嬭浇', '鎶栭煶瑙嗛'].includes(options.title)) {
            const safeTitle = sanitizePathSegment(options.title, { fallback: 'video', maxLength: 100 });
            filenameTemplate = filenameTemplate.split('%(title)s').join(safeTitle);
        }

        if (!shouldExtractAudio && !filenameTemplate.includes('%(height)s')) {
            filenameTemplate = filenameTemplate.replace('.%(ext)s', '_%(height)sp.%(ext)s');
        }

        // [Protection] 寮哄埗鎵╁睍鍚嶄繚搴?(Universal MP4 Lock)
        // 褰诲簳娑堥櫎 .unknown_video 闂锛屽皢鎵€鏈夋墿灞曞悕鍗犱綅绗︽浛鎹负 mp4
        // 骞跺己鍒舵鏌ョ粨灏撅紝纭繚杈撳嚭鏂囦欢涓€瀹氭槸 .mp4 鏍煎紡
        if (!shouldExtractAudio) {
            if (filenameTemplate.includes('%(ext)s')) {
                filenameTemplate = filenameTemplate.split('%(ext)s').join('mp4');
            }

            // 濡傛灉妯℃澘娌℃湁浠?mp4 缁撳熬 (鍙兘鏄?.mkv, .unknown_video 绛夋綔鍦ㄩ闄?锛岀洿鎺ュ己鍒朵慨姝?
            if (!filenameTemplate.endsWith('.mp4')) {
                // 绠€鍗曠殑闃查噸澶嶆坊鍔犻€昏緫
                filenameTemplate = filenameTemplate.replace(/\.\w+$/, '') + '.mp4';
            }
        }

        // [Final Guard] 閽堝涓嶅悓骞冲彴鐨?User-Agent 鍒嗙骇绛栫暐
        // TikTok 浣跨敤妗岄潰绔?UA + Canonical URL 鎵嶈兘鑾峰彇鏃犳按鍗版祦 (Embed + Mobile = Watermark)
        const isMobileUA = url.includes('tiktok.com') && !url.includes('/embed/'); 
        const userAgent = isMobileUA
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

        const args = [
            '--user-agent', userAgent,
            '--no-check-certificate',       // 瑙勯伩灏戞暟鎯呭喌涓嬬殑瀹夊叏鎻℃墜閿欒
            // [2026.02.08] 绉婚櫎 player_client 鍙傛暟锛岃 yt-dlp 榛樿浣跨敤 android_vr锛堝敮涓€涓嶉渶瑕?PO Token 鐨勫鎴风锛?
            '-f', formatStr,
            '-o', path.join(savePath, filenameTemplate),
            '--windows-filenames',
            '--no-mtime',
            '--progress',
            '--newline',
        ];

        // [Optimize] Speed boost via concurrent fragments
        // 1. Force enabled by user setting
        // 2. Or default safe list (Bilibili, YouTube, Vimeo)
        const defaultConcurrentFragments = store.get('concurrentFragments') || 3;
        const forceMultithread = store.get('forceMultithread') || false;

        if (forceMultithread ||
            url.includes('bilibili.com') || url.includes('b23.tv') ||
            url.includes('youtube.com') || url.includes('youtu.be') ||
            url.includes('vimeo.com')) {
            args.push('-N', String(defaultConcurrentFragments));
            args.push('--concurrent-fragments', String(defaultConcurrentFragments));

            // [馃啎] 閽堝 YouTube 澧炲姞璇锋眰寤惰繜锛岄檷浣?429 椋庨櫓
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                args.push('--sleep-subtitles', '2');
                args.push('--sleep-requests', '1');
            }
        }

        // [馃啎] 鐢ㄦ埛闄愰€熻缃?
        const speedLimit = store.get('downloadSpeedLimit');
        if (speedLimit && parseInt(speedLimit) > 0) {
            args.push('--limit-rate', `${speedLimit}K`);
        }

        // Proxy
        const proxy = getProxyUrl();
        if (proxy) args.push('--proxy', proxy);

        // 鑷姩鎸傝浇娴忚鍣ㄦ墿灞曞悓姝ョ殑 Cookie
        try {
            const fs = require('fs');
            const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
            if (fs.existsSync(cookiePath)) {
                args.push('--cookies', cookiePath);
            }
        } catch (err) {
            console.error('[Downloader] Failed to check cookies.txt:', err);
        }

        if (shouldExtractAudio) {
            args.push('-x', '--audio-format', audioFormatValue);
            if (['mp3', 'm4a'].includes(audioFormatValue)) args.push('--audio-quality', `${audioBitrateValue}K`);
        } else {
            // [Fix] 杩欓噷鐨?--recode-video mp4 浼氱'淇濇渶缁堣緭鍑烘槸 H.264+AAC锛?
            // 鍙涓嶅己鍒舵寚瀹?-c:v copy锛孎Fmpeg 浼氳嚜鍔ㄥ鐞嗙紪鐮佸吋瀹规€с€?
            // 涔嬪墠寮哄埗 copy 瀵艰嚧浜?VP9/AV1 淇濈暀锛岀幇鍦ㄧЩ闄ゅ畠銆?
            args.push('--merge-output-format', 'mp4', '--recode-video', 'mp4');
            // 濡傛灉闇€瑕佺‖浠跺姞閫燂紝鍙互鑰冭檻鍔?postprocessor-args锛屼絾鐩墠淇濇寔绠€鍗曞吋瀹规€т紭鍏?
        }

        if (playlistItems) args.push('--playlist-items', playlistItems);
        if (writeThumbnail) { args.push('--write-thumbnail'); args.push('--convert-thumbnails', 'jpg'); }
        if (writeSubtitles) { args.push('--write-subs', '--write-auto-subs', '--sub-lang', 'zh,en,zh-Hans,zh-Hant', '--convert-subs', 'srt'); }

        // 鍘绘按鍗?(TikTok/Douyin) - 宸查€氳繃 URL 鏍囧噯鍖?(Embed) 鎴栦笓灞炰笅杞藉櫒澶勭悊锛寉t-dlp 鏃犳 flag
        // if (noWatermark) {
        //     args.push('--no-watermark');
        // }

        // [Phase 4] 绮惧噯鍓緫 (Trim)
        if (options.trimRange) {
            let trimArg = '';
            if (typeof options.trimRange === 'string') {
                trimArg = options.trimRange.startsWith('*') ? options.trimRange : `*${options.trimRange}`;
            } else if (options.trimRange.start || options.trimRange.end) {
                const start = options.trimRange.start || '0';
                const end = options.trimRange.end || 'inf';
                trimArg = `*${start}-${end}`;
            }
            if (trimArg) {
                args.push('--download-sections', trimArg);
                // [Optimize] Remove --force-keyframes-at-cuts to avoid slow re-encoding
                // This prioritizes speed (Stream Copy) over frame-perfect precision
                // args.push('--force-keyframes-at-cuts'); 
            }
        }

        args.push('--encoding', 'utf-8');
        args.push('--', normalizeUrl(url)); // 浜屾娓呮礂骞舵坊鍔犲畨鍏ㄧ晫瀹氱

        debugLog('[ytdlp] Spawning with args:', JSON.stringify(args));

        // Spawn process
        const child = spawn(getYtDlpPath(), args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

        child.on('error', (err) => {
            console.error('[ytdlp] Failed to start yt-dlp process:', err.message);
            activeDownloads.delete(downloadId);
            resolve({ success: false, error: 'Failed to start yt-dlp: ' + err.message });
        });

        const tracked = trackDownload(downloadId, { process: child });
        // If user cancelled before spawn finished, kill immediately and keep cancelled=true
        if (tracked?.cancelled && child?.pid) {
            killProcess(child.pid);
        }
        ProcessManager.register(downloadId, child);

        let lastProgress = 0;
        let stderrOutput = '';
        let downloadedFile = '';
        let skipped = false;

        let buffer = '';

        // Throttle progress IPC (~4/s) — always flush 100% / force
        const progressOut = createProgressThrottler((payload) => {
            if (sender && !sender.isDestroyed()) {
                sender.send('download:progress', payload);
            }
        }, { minIntervalMs: 250 });

        child.stdout.on('data', (data) => {
            buffer += data.toString('utf8');

            // Handle both newline and carriage return (yt-dlp uses \r for progress)
            let lines = buffer.split(/[\r\n]+/);

            // Keep the last partial line in the buffer
            buffer = lines.pop(); // The last element is either empty (if ended with split char) or partial

            for (const line of lines) {
                if (!line.trim()) continue;

                // Progress parsing (More robust regex)
                // Supports: "[download]  15.0% of 10.00MiB at  2.00MiB/s ETA 00:05"
                // Supports: "[download] 100% of 10.00MiB in 00:05" (Completed line sometimes differs)
                const progressMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+(?:~)?\s*([\d.]+\w+)(?:\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/);

                if (progressMatch) {
                    const progress = parseFloat(progressMatch[1]);
                    const totalSize = progressMatch[2];
                    const speed = progressMatch[3] || '0 KB/s';
                    const eta = progressMatch[4] || '--:--';

                    // Allow updates even if progress is same (for speed updates) — throttled below
                    if (progress >= lastProgress) {
                        lastProgress = progress;
                        progressOut.send({
                            id: downloadId,
                            progress,
                            totalSize,
                            speed,
                            eta,
                            line: line.trim()
                        }, progress >= 100);
                    }
                } else if (line.match(/\[download\]\s+(?:~)?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)/)) {
                    // [New] Catch "Size + Speed" but NO percent (Unknown total size)
                    // Example: "[download] 15.00MiB at 2.00MiB/s ETA 00:05" (sometimes % is missing or format differs)
                    const sizeSpeedMatch = line.match(/\[download\]\s+(?:~)?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+([\d:]+))?/);
                    if (sizeSpeedMatch) {
                        const totalSize = sizeSpeedMatch[1];
                        const speed = sizeSpeedMatch[2];
                        const eta = sizeSpeedMatch[3] || '--:--';

                        progressOut.send({
                            id: downloadId,
                            progress: lastProgress || 0,
                            totalSize,
                            speed,
                            eta,
                            line: line.trim()
                        });
                    }
                } else {
                    // Fallback for simple percentage
                    const simpleMatch = line.match(/\[download\]\s+([\d.]+)%/);
                    if (simpleMatch) {
                        const progress = parseFloat(simpleMatch[1]);
                        if (progress >= lastProgress) {
                            lastProgress = progress;
                            progressOut.send(
                                { id: downloadId, progress, line: line.trim() },
                                progress >= 100
                            );
                        }
                    }
                }

                // Filename parsing
                const destMatch = line.match(/\[download\] Destination: (.+)/);
                if (destMatch) downloadedFile = destMatch[1].trim();

                const alreadyMatch = line.match(/\[download\] (.+) has already been downloaded/);
                if (alreadyMatch) { downloadedFile = alreadyMatch[1].trim(); skipped = true; }

                const mergerMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
                if (mergerMatch) downloadedFile = mergerMatch[1].trim();

                const extractMatch = line.match(/\[ExtractAudio\] Destination: (.+)/);
                if (extractMatch) downloadedFile = extractMatch[1].trim();

                const ffmpegMatch = line.match(/\[ffmpeg\] Destination: (.+)/);
                if (ffmpegMatch) downloadedFile = ffmpegMatch[1].trim();
            }
        });


        let stderrBuffer = '';
        child.stderr.on('data', (data) => {
            stderrBuffer += data.toString('utf8');

            // Handle split lines properly
            let lines = stderrBuffer.split(/[\r\n]+/);
            // Keep the last partial line in buffer if it doesn't end with newline
            // If the buffer ended with newline, the last element is empty string, which we pop correctly.
            // But if it didn't end with newline, the last element is the partial line.
            // Split behavior: 'a\nb'.split() -> ['a', 'b']. 'a\n'.split() -> ['a', ''].
            // To be safe, we always pop the last element as buffer.
            stderrBuffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                // [Fix] Parse FFmpeg progress for --download-sections (Trim mode)
                // Output example: "frame=  256 fps=0.0 q=-1.0 size=    1024kB time=00:00:10.50 bitrate= 779.6kbits/s speed=20.5x"
                const ffmpegMatch = line.match(/size=\s*([\d.]+\w+)\s+time=\s*([\d:.]+)\s+bitrate=\s*([\d.]+\w+\/s)(?:\s+speed=\s*([\d.]+\w+))?/);

                if (ffmpegMatch) {
                    const totalSize = ffmpegMatch[1]; // Downloaded size
                    const elapsed = ffmpegMatch[2];   // Elapsed time
                    const bitrate = ffmpegMatch[3];   // e.g. 779.6kbits/s

                    let displaySpeed = bitrate;
                    if (bitrate.includes('kbits/s')) {
                        const kbps = parseFloat(bitrate);
                        const kBS = kbps / 8;
                        displaySpeed = kBS < 1024 ? `${kBS.toFixed(2)} KiB/s` : `${(kBS / 1024).toFixed(2)} MiB/s`;
                    }

                    progressOut.send({
                        id: downloadId,
                        progress: 0, // Indeterminate
                        totalSize,
                        speed: displaySpeed,
                        eta: `Time: ${elapsed}`, // Show elapsed time since ETA is unknown
                        line: line.trim()
                    });
                }

                if (!line.includes('WARNING') && !ffmpegMatch) {
                    stderrOutput += line + '\n';
                }
            }
        });

        const startTime = Date.now();
        child.on('close', async (code) => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const download = activeDownloads.get(downloadId);
            const wasCancelled = download?.cancelled;
            activeDownloads.delete(downloadId);

            if (wasCancelled) {
                progressOut.send({ id: downloadId, progress: lastProgress || 0, status: 'cancelled' }, true);
                resolve({ success: false, error: 'Cancelled' });
                return;
            }

            if (code === 0) {
                progressOut.send({ id: downloadId, progress: 100, status: 'done' }, true);
                if (skipped) resolve({ success: true, skipped: true });
                else {
                    // Ensure we return an absolute file path
                    let fullPath = downloadedFile;
                    if (downloadedFile && !path.isAbsolute(downloadedFile)) {
                        // If downloadedFile is relative, join with savePath
                        fullPath = path.join(savePath, downloadedFile);
                    }
                    // If downloadedFile is empty, try to construct from savePath
                    if (!fullPath && savePath) {
                        fullPath = savePath;
                    }

                    // 馃啎 缁熻鏂囦欢澶у皬
                    let fileSize = 0;
                    if (fullPath) {
                        try {
                            const fsModule = require('fs');
                            if (fsModule.existsSync(fullPath)) {
                                const stats = await fsModule.promises.stat(fullPath);
                                if (stats.isFile()) {
                                    fileSize = stats.size;
                                }
                            }
                        } catch (e) {
                            console.warn('[ytdlpDownloader] Failed to get file stats:', e.message);
                        }
                    }

                    debugLog('[ytdlpDownloader] Returning:', { fullPath, fileSize, elapsed });
                    resolve({
                        success: true,
                        path: savePath,
                        file: fullPath,
                        fileSize,
                        elapsed
                    });
                }
            } else {
                resolve({ success: false, error: stderrOutput || 'Download failed' });
            }
        });
    });
}

/**
 * 鍙栨秷涓嬭浇
 * @param {string} [downloadId] - 鍙€変笅杞?ID
 */
const { exec } = require('child_process');

function killProcess(pid) {
    if (process.platform === 'win32') {
        exec(`taskkill /pid ${pid} /f /t`, (err) => {
            if (err) {
                // Fallback if taskkill fails (e.g. process already gone)
                try {
                    process.kill(pid, 'SIGKILL');
                } catch {
                    // Ignore if process already exited.
                }
            }
        });
    } else {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // Ignore if already dead
        }
    }
}

/**
 * 鍙栨秷涓嬭浇
 * @param {string} [downloadId] - 鍙€変笅杞?ID
 */
function cancelDownload(downloadId) {
    const id = normalizeDownloadId(downloadId);
    if (id) {
        const download = trackDownload(id, { cancelled: true });
        if (download?.process?.pid) {
            killProcess(download.process.pid);
        }
    } else {
        // Cancel all
        for (const [key, download] of activeDownloads.entries()) {
            download.cancelled = true;
            if (download.process?.pid) {
                killProcess(download.process.pid);
            }
            activeDownloads.set(key, download);
        }
    }
}


/**
 * 妫€鏌?yt-dlp 鐗堟湰
 * @returns {Promise<Object>}
 */
function checkYtDlpVersion() {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const fs = require('fs');
        const binaryPath = getYtDlpPath();

        // 1. 妫€鏌ョ墿鐞嗘枃浠?
        if (!fs.existsSync(binaryPath)) {
            console.warn('[ytdlp] Binary missing:', binaryPath);
            return resolve({ success: false, error: 'Binary missing' });
        }

        // 2. 寮傛鎵ц锛屼笉璋冪敤 Shell
        const ls = spawn(binaryPath, ['--version']);
        let output = '';
        let errorOutput = '';

        const timer = setTimeout(() => {
            ls.kill();
            resolve({ success: false, error: 'Timeout' });
        }, 5000);

        ls.stdout.on('data', (data) => { output += data.toString(); });
        ls.stderr.on('data', (data) => { errorOutput += data.toString(); });

        ls.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve({ success: true, version: output.trim() });
            else resolve({ success: false, error: errorOutput.trim() || `Exit code ${code}` });
        });

        ls.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * 鏇存柊 yt-dlp
 * @returns {Promise<Object>}
 */
function updateYtDlp() {
    return new Promise((resolve) => {
        const { spawn: spawnProc } = require('child_process');
        let stdout = '';
        let stderr = '';
        const proc = spawnProc(getYtDlpPath(), ['-U']);
        proc.on('error', (err) => resolve({ success: false, error: err.message }));
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) resolve({ success: true, message: stdout.trim() || stderr.trim() });
            else resolve({ success: false, error: stderr.trim() || stdout.trim() });
        });
    });
}

/**
 * 娉ㄥ唽涓嬭浇鐩稿叧 IPC handlers
 * @param {Electron.IpcMain} ipcMain 
 */
function setupDownloadHandlers(ipcMain) {
    ipcMain.handle('video:download', async (event, options) => {
        try {
            const opts = options || {};
            const result = await downloadVideo({ ...opts, sender: event.sender });
            return result;
        } catch (e) {
            console.error('[Downloader] IPC handler error:', e.message);
            return { success: false, error: e.message };
        }
    });

    ipcMain.on('video:cancelDownload', (event, downloadId) => {
        cancelDownload(downloadId);
    });

    ipcMain.handle('downloader:check', async () => {
        const result = await checkYtDlpVersion();
        return { installed: result.success, version: result.version };
    });

    ipcMain.handle('video:checkYtDlpVersion', async () => {
        return await checkYtDlpVersion();
    });

    ipcMain.handle('video:updateYtDlp', async () => {
        return await updateYtDlp();
    });
}

module.exports = {
    downloadVideo,
    cancelDownload,
    checkYtDlpVersion,
    updateYtDlp,
    normalizeUrl,
    setupDownloadHandlers
};

