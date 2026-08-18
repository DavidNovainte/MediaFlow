/**
 * mediaUrlDetector.js
 * Smart detection of capturable media URLs (clipboard watch / paste helpers).
 *
 * Modes (store key: clipboardDetectMode):
 * - strict   : only well-known platforms with precise video paths
 * - balanced : strict + more sites + direct media files + strong generic paths (default)
 * - loose    : almost any deep http(s) link (more false positives; yt-dlp may still fail)
 *
 * Note: Download page still accepts any URL yt-dlp supports when pasted manually.
 */

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'`]+/gi;

const MODES = Object.freeze(['strict', 'balanced', 'loose']);
const DEFAULT_MODE = 'balanced';

/** Paths that are almost never a single media item */
const BLOCKED_PATH_RE =
    /^\/(settings|account|login|signin|signup|register|help|support|about|premium|feed|results|search|explore|notifications|messages|inbox|home|trending|library|history|subscriptions|channel_switcher|upload|create|studio|analytics|privacy|terms|jobs|ads|business|developers|api|oauth|intent|cart|checkout|wishlist|profile\/edit)(\/|$)/i;

/** Direct media / stream files */
const DIRECT_MEDIA_EXT_RE =
    /\.(mp4|m4v|webm|mkv|mov|avi|flv|ts|m2ts|m3u8|mpd|mp3|m4a|wav|aac|ogg|opus|flac)(\?|#|$)/i;

/** Strong generic path/query shapes used by many sites */
const GENERIC_MEDIA_PATH_RE = [
    /\/watch(\?|\/|$)/i,
    /\/videos?\//i,
    /\/(v|e|embed|play|player|reel|reels|clip|clips|stream|media|episode|ep|vod)\//i,
    /\/(watch|play|player|embed)\./i,
    /[?&](v|video[_-]?id|vid|media[_-]?id|clip[_-]?id|content[_-]?id)=/i
];

/** Hosts that almost never mean "download this as a video page" */
const NON_MEDIA_HOST_RE =
    /^(google\.|www\.google\.|bing\.|baidu\.|duckduckgo\.|github\.|gitlab\.|stackoverflow\.|stackexchange\.|wikipedia\.|wiki\.|microsoft\.|office\.|docs\.google\.|drive\.google\.|mail\.|outlook\.|amazon\.|taobao\.|tmall\.|jd\.com|zhihu\.com|notion\.|figma\.|canva\.|linkedin\.|chatgpt\.|openai\.|claude\.|anthropic\.)/i;

/**
 * @param {string|undefined|null} mode
 * @returns {'strict'|'balanced'|'loose'}
 */
function normalizeMode(mode) {
    const m = String(mode || DEFAULT_MODE).toLowerCase();
    return MODES.includes(m) ? m : DEFAULT_MODE;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function stripTrailingJunk(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^[<([]+/, '').replace(/[>\])]+$/, '');
    s = s.replace(/[.,;:!?，。；：！？、）》」』】\u200b]+$/g, '');
    return s;
}

/**
 * Extract candidate absolute http(s) URLs from free-form clipboard text.
 * @param {string} text
 * @returns {string[]}
 */
function extractUrls(text) {
    if (!text || typeof text !== 'string') return [];

    const found = new Set();
    const lines = text.split(/[\r\n]+/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (/^https?:\/\//i.test(trimmed)) {
            found.add(stripTrailingJunk(trimmed));
            continue;
        }

        const matches = trimmed.match(URL_IN_TEXT_RE);
        if (matches) {
            for (const m of matches) {
                found.add(stripTrailingJunk(m));
            }
        }
    }

    return [...found];
}

/**
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHost(hostname) {
    return String(hostname || '')
        .toLowerCase()
        .replace(/\.$/, '')
        .replace(/^www\./, '');
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isBlockedPath(pathname) {
    const p = pathname || '/';
    if (p === '/' || p === '') return true;
    return BLOCKED_PATH_RE.test(p);
}

/**
 * @param {URL} u
 * @returns {boolean}
 */
function isDirectMediaFile(u) {
    const path = u.pathname || '';
    if (DIRECT_MEDIA_EXT_RE.test(path)) return true;
    if (DIRECT_MEDIA_EXT_RE.test(u.href)) return true;
    return false;
}

/**
 * @param {URL} u
 * @returns {boolean}
 */
function looksLikeGenericMediaPath(u) {
    const path = u.pathname || '/';
    if (isBlockedPath(path)) return false;
    const pathAndQuery = `${path}${u.search || ''}`;
    return GENERIC_MEDIA_PATH_RE.some((re) => re.test(pathAndQuery));
}

/**
 * Known platforms with precise video paths (always used in every mode).
 * @param {URL} u
 * @param {string} host
 * @returns {boolean|null} true/false = decided; null = not a known platform
 */
function matchKnownPlatform(u, host) {
    const path = u.pathname || '/';
    const pathAndQuery = `${path}${u.search || ''}`;

    // --- YouTube ---
    if (host === 'youtu.be') {
        return /^\/[\w-]{6,}(\/|$)/.test(path);
    }
    if (
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'music.youtube.com' ||
        host === 'youtube-nocookie.com'
    ) {
        if (u.searchParams.has('v') && u.searchParams.get('v')) return true;
        if (/^\/(shorts|live|embed|clip)\//i.test(path)) return true;
        if (/^\/playlist\/?$/i.test(path) && u.searchParams.has('list')) return true;
        return false;
    }

    // --- TikTok ---
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
        if (/^(v|vm|vt)\.tiktok\.com$/i.test(host)) {
            return path.length > 1 && !isBlockedPath(path);
        }
        if (/^\/@[^/]+\/video\/\d+/i.test(path)) return true;
        if (/^\/t\/[\w-]+/i.test(path)) return true;
        if (/^\/@[^/]+\/photo\/\d+/i.test(path)) return true;
        return false;
    }

    // --- Douyin ---
    if (host.includes('douyin.com') || host.includes('iesdouyin.com')) {
        if (host.startsWith('v.') || host === 'v.douyin.com') {
            return path.length > 1;
        }
        if (/^\/(video|note|share\/video|share\/note)\//i.test(path)) return true;
        if (u.searchParams.has('modal_id')) return true;
        return false;
    }

    // --- Bilibili ---
    if (host.includes('bilibili.com')) {
        if (/^\/video\/(BV[\w]+|av\d+)/i.test(path)) return true;
        if (/^\/bangumi\/play\//i.test(path)) return true;
        if (/^\/list\/[\w-]+/i.test(path)) return true;
        if (/^\/festival\//i.test(path)) return true;
        return false;
    }
    if (host === 'b23.tv' || host === 'bili2233.cn') {
        return path.length > 1;
    }

    // --- Instagram ---
    if (host.includes('instagram.com')) {
        return /^\/(p|reel|reels|tv)\//i.test(path);
    }

    // --- Twitter / X ---
    if (host === 'twitter.com' || host === 'x.com' || host === 'mobile.twitter.com' || host === 'mobile.x.com') {
        return /\/status\/\d+/i.test(path);
    }

    // --- Facebook ---
    if (host === 'fb.watch' || host === 'fb.gg') {
        return path.length > 1;
    }
    if (host.includes('facebook.com') || host === 'fb.com' || host === 'm.facebook.com') {
        if (u.searchParams.has('v') && u.searchParams.get('v')) return true;
        if (/\/(watch|reel|reels|videos|share\/v|share\/r)\b/i.test(pathAndQuery)) return true;
        if (/\/videos\/\d+/i.test(path)) return true;
        return false;
    }

    // --- Vimeo ---
    if (host.includes('vimeo.com')) {
        if (isBlockedPath(path)) return false;
        if (/^\/\d+(\/|$)/.test(path)) return true;
        if (/^\/(channels|groups)\/[^/]+\/\d+/i.test(path)) return true;
        return false;
    }

    return null;
}

/**
 * Extra platforms (balanced + loose). Return true/false if host matches family, else null.
 * @param {URL} u
 * @param {string} host
 * @returns {boolean|null}
 */
function matchExtendedPlatform(u, host) {
    const path = u.pathname || '/';

    // Reddit
    if (host === 'redd.it' || host.endsWith('.redd.it')) {
        return path.length > 1;
    }
    if (host.includes('reddit.com')) {
        return /\/comments\//i.test(path) || /\/video\//i.test(path) || /\/r\/[^/]+\/s\//i.test(path);
    }

    // Twitch
    if (host === 'clips.twitch.tv') {
        return path.length > 1;
    }
    if (host.includes('twitch.tv')) {
        return /^\/videos\/\d+/i.test(path) || /^\/[^/]+\/clip\//i.test(path);
    }

    // Dailymotion
    if (host.includes('dailymotion.com') || host === 'dai.ly') {
        return /\/video\//i.test(path) || host === 'dai.ly';
    }

    // Rumble / Streamable
    if (host.includes('rumble.com')) {
        return /\/v[a-z0-9-]+/i.test(path) || /\/embed\//i.test(path);
    }
    if (host.includes('streamable.com')) {
        return path.length > 1 && !isBlockedPath(path);
    }

    // Kuaishou
    if (host.includes('kuaishou.com') || host.includes('gifshow.com') || host === 'v.kuaishou.com') {
        return /\/(short-video|fw\/photo|f\/|video)\//i.test(path) || host.startsWith('v.') || path.length > 2;
    }

    // Xiaohongshu
    if (host.includes('xiaohongshu.com') || host === 'xhslink.com') {
        if (host === 'xhslink.com') return path.length > 1;
        return /\/(explore|discovery\/item)\//i.test(path);
    }

    // Weibo video
    if (host.includes('weibo.com') || host.includes('weibo.cn') || host.includes('video.weibo.com')) {
        return /\/(tv|show|detail|video)\//i.test(path) || host.includes('video.weibo');
    }

    // Niconico
    if (host.includes('nicovideo.jp')) {
        return /\/watch\//i.test(path);
    }

    // SoundCloud / Bandcamp (audio — still capturable via yt-dlp)
    if (host.includes('soundcloud.com')) {
        return path.split('/').filter(Boolean).length >= 2 && !isBlockedPath(path);
    }
    if (host.includes('bandcamp.com')) {
        return /\/track\//i.test(path) || /\/album\//i.test(path);
    }

    // Archive.org media items
    if (host.includes('archive.org')) {
        return /\/details\//i.test(path);
    }

    return null;
}

/**
 * Loose mode: any deep link that is not an obvious non-media page.
 * @param {URL} u
 * @param {string} host
 * @returns {boolean}
 */
function matchLooseAny(u, host) {
    if (NON_MEDIA_HOST_RE.test(host) || NON_MEDIA_HOST_RE.test(host + '.')) return false;
    // also check host without subdomain carefully
    if (/^(google|bing|baidu|github|wikipedia)\./i.test(host)) return false;

    const path = u.pathname || '/';
    if (isBlockedPath(path)) return false;
    // Require some path depth or query (avoid bare domain + random one-segment marketing pages lightly)
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return false;
    if (segments.length === 1 && !u.search && segments[0].length < 6) return false;
    return true;
}

/**
 * True when URL looks like a capturable media link under the given mode.
 * @param {string} urlString
 * @param {string} [mode]
 * @returns {boolean}
 */
function isCapturableMediaUrl(urlString, mode = DEFAULT_MODE) {
    if (!urlString || typeof urlString !== 'string') return false;
    const detectMode = normalizeMode(mode);

    let u;
    try {
        u = new URL(stripTrailingJunk(urlString));
    } catch {
        return false;
    }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

    const host = normalizeHost(u.hostname);

    // Direct media files always OK (all modes)
    if (isDirectMediaFile(u)) return true;

    const known = matchKnownPlatform(u, host);
    if (known !== null) return known;

    if (detectMode === 'strict') {
        return false;
    }

    // balanced + loose: more platforms
    const extended = matchExtendedPlatform(u, host);
    if (extended !== null) return extended;

    // balanced: strong generic path patterns on unknown hosts
    if (looksLikeGenericMediaPath(u)) {
        if (NON_MEDIA_HOST_RE.test(host)) return false;
        return true;
    }

    if (detectMode === 'loose') {
        return matchLooseAny(u, host);
    }

    return false;
}

/**
 * Extract only capturable media URLs from clipboard-like text.
 * @param {string} text
 * @param {string} [mode]
 * @returns {string[]}
 */
function extractCapturableMediaUrls(text, mode = DEFAULT_MODE) {
    const detectMode = normalizeMode(mode);
    return extractUrls(text).filter((url) => isCapturableMediaUrl(url, detectMode));
}

/**
 * Platform label for notifications.
 * @param {string} url
 * @returns {string}
 */
function detectPlatformLabel(url) {
    const s = String(url || '').toLowerCase();
    if (s.includes('youtu')) return 'YouTube';
    if (s.includes('tiktok')) return 'TikTok';
    if (s.includes('douyin') || s.includes('iesdouyin')) return '抖音';
    if (s.includes('instagram')) return 'Instagram';
    if (s.includes('bilibili') || s.includes('b23.tv') || s.includes('bili2233')) return 'B站';
    if (s.includes('twitter.com') || s.includes('://x.com') || s.includes('//x.com')) return 'Twitter/X';
    if (s.includes('facebook') || s.includes('fb.watch') || s.includes('fb.com')) return 'Facebook';
    if (s.includes('vimeo')) return 'Vimeo';
    if (s.includes('reddit') || s.includes('redd.it')) return 'Reddit';
    if (s.includes('twitch')) return 'Twitch';
    if (s.includes('kuaishou') || s.includes('gifshow')) return '快手';
    if (s.includes('xiaohongshu') || s.includes('xhslink')) return '小红书';
    if (s.includes('weibo')) return '微博';
    if (s.includes('dailymotion') || s.includes('dai.ly')) return 'Dailymotion';
    if (s.includes('soundcloud')) return 'SoundCloud';
    if (DIRECT_MEDIA_EXT_RE.test(s)) return '媒体文件';
    return '链接';
}

module.exports = {
    MODES,
    DEFAULT_MODE,
    normalizeMode,
    extractUrls,
    extractCapturableMediaUrls,
    isCapturableMediaUrl,
    detectPlatformLabel,
    stripTrailingJunk
};
