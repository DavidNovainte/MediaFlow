const path = require('path');

let app = { isPackaged: false };
try {
    const electron = require('electron');
    if (electron?.app) {
        ({ app } = electron);
    }
} catch (electronLoadError) {
    void electronLoadError;
}

let ytDlpPath = null;
let ffmpegPath = null;
let ffprobePath = null;
let binPath = null;
const isTestEnv = process.env.NODE_ENV === 'test';

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

/**
 * 初始化二进制文件路径 (仅需调用一次)
 * 必须在 app.isPackaged 可用后调用 (Renderer 中不可用，仅 Main Process)
 */
function initBinaries() {
    if (binPath) return; // 已初始化

    const isDev = !app.isPackaged;

    // 在开发环境，bin 目录在项目根目录
    // 在生产环境，bin 目录在 resources/bin
    if (isDev) {
        binPath = path.resolve(__dirname, '../../bin');
    } else {
        binPath = path.join(process.resourcesPath, 'bin');
    }

    const fs = require('fs');
    if (!fs.existsSync(binPath)) {
        console.error(`[Binaries] CRITICAL: Binary directory not found at ${binPath}`);
    }

    // Windows 下添加 .exe 后缀
    const ext = process.platform === 'win32' ? '.exe' : '';
    ytDlpPath = resolveBinary('yt-dlp', path.join(binPath, `yt-dlp${ext}`));
    ffmpegPath = resolveBinary('ffmpeg', path.join(binPath, `ffmpeg${ext}`));
    ffprobePath = resolveBinary('ffprobe', path.join(binPath, `ffprobe${ext}`));

    [
        ['yt-dlp', ytDlpPath],
        ['ffmpeg', ffmpegPath],
        ['ffprobe', ffprobePath]
    ].forEach(([name, p]) => {
        if (!p || !fs.existsSync(p)) {
            console.error(`[Binaries] MISSING: ${name}. Place ${name}${ext} in ${binPath} or install on PATH.`);
        } else {
            debugLog(`[Binaries] Verified: ${name} → ${p}`);
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(p, 0o755);
                } catch (e) {
                    console.error(`[Binaries] Failed to set permissions for ${p}:`, e.message);
                }
            }
        }
    });

    // 将 bin 目录添加到系统 PATH，以便 yt-dlp 能找到 ffmpeg
    const delimiter = path.delimiter;
    if (fs.existsSync(binPath) && !process.env.PATH.includes(binPath)) {
        process.env.PATH = `${binPath}${delimiter}${process.env.PATH}`;
        debugLog(`[Binaries] Added to PATH: ${binPath}`);
    }

    debugLog('[Binaries] Initialization complete.');
}

/**
 * Prefer app bin/, then fall back to PATH (system install).
 */
function resolveBinary(name, preferredPath) {
    const fs = require('fs');
    if (preferredPath && fs.existsSync(preferredPath)) {
        return preferredPath;
    }
    const fromPath = findOnPath(name);
    if (fromPath) {
        debugLog(`[Binaries] Using PATH ${name}: ${fromPath}`);
        return fromPath;
    }
    return preferredPath; // may not exist; callers/check status report missing
}

function findOnPath(name) {
    try {
        const { execSync } = require('child_process');
        const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
        const out = execSync(cmd, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 4000,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (!out) return null;
        // `where` may return multiple lines; take first existing
        const candidates = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const fs = require('fs');
        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
        return candidates[0] || null;
    } catch {
        return null;
    }
}

/**
 * 获取 yt-dlp 可执行文件路径
 */
function getYtDlpPath() {
    if (!ytDlpPath) initBinaries();
    return ytDlpPath;
}

/**
 * 获取 ffmpeg 可执行文件路径
 */
function getFfmpegPath() {
    if (!ffmpegPath) initBinaries();
    return ffmpegPath;
}

/**
 * 获取 ffprobe 可执行文件路径
 */
function getFfprobePath() {
    if (!ffprobePath) initBinaries();
    return ffprobePath;
}

/**
 * 通用获取二进制文件路径
 * @param {string} name - 二进制文件名 (不含扩展名)
 */
function getBinaryPath(name) {
    if (!binPath) initBinaries();
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(binPath, `${name}${ext}`);
}

/**
 * 获取脚本的绝对路径，处理 Electron asar 打包后的路径问题
 * @param {string} relativeScriptPath - 相对于项目根目录的路径，如 'services/python/transcribe.py'
 */
function getScriptPath(relativeScriptPath) {
    if (app.isPackaged) {
        // 打包后，解压后的文件位于 resources/app.asar.unpacked
        return path.join(process.resourcesPath, 'app.asar.unpacked', relativeScriptPath);
    } else {
        // 开发环境下，直接从项目根目录获取
        // binaries.js 位于 src/utils/，项目根目录在 ../../
        return path.resolve(__dirname, '../../', relativeScriptPath);
    }
}

/**
 * Lightweight presence check for core binaries (settings / diagnostics).
 */
function getBinaryStatus() {
    try {
        initBinaries();
    } catch {
        // still report whatever paths we have
    }
    const fs = require('fs');
    const check = (p) => !!(p && fs.existsSync(p));
    const missing = [];
    if (!check(ytDlpPath)) missing.push('yt-dlp');
    if (!check(ffmpegPath)) missing.push('ffmpeg');
    if (!check(ffprobePath)) missing.push('ffprobe');
    return {
        binDir: binPath || null,
        ready: missing.length === 0,
        missing,
        ytDlp: { path: ytDlpPath, found: check(ytDlpPath) },
        ffmpeg: { path: ffmpegPath, found: check(ffmpegPath) },
        ffprobe: { path: ffprobePath, found: check(ffprobePath) },
        tip: missing.length
            ? `Missing: ${missing.join(', ')}. Place them in bin/ or install on PATH. Windows: run node scripts/download-binaries.js`
            : null
    };
}

module.exports = {
    initBinaries,
    getYtDlpPath,
    getFfmpegPath,
    getFfprobePath,
    getBinaryPath,
    getScriptPath,
    getBinaryStatus,
    resolveBinary,
    findOnPath
};
