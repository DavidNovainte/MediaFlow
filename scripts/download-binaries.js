/**
 * Ensure core Windows binaries exist under ./bin
 *
 * Strategy:
 * 1) If C:\ffmpeg\bin (or common paths / PATH) has ffmpeg/ffprobe → copy into bin/
 * 2) yt-dlp: download latest release if missing
 * 3) ffmpeg: download official Windows essentials build if still missing
 *
 * Usage: node scripts/download-binaries.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const binDir = path.join(projectRoot, 'bin');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function copyIfPresent(src, dest) {
    if (!exists(src)) return false;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log(`[bin] copied ${path.basename(dest)} ← ${src}`);
    return true;
}

function findOnPath(name) {
    try {
        const out = execSync(process.platform === 'win32' ? `where ${name}` : `command -v ${name}`, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const first = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
        return first && exists(first) ? first : null;
    } catch {
        return null;
    }
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`[bin] downloading ${url}`);
        const file = createWriteStream(dest);
        const go = (u, redirects = 0) => {
            https
                .get(u, (res) => {
                    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                        if (redirects > 8) return reject(new Error('too many redirects'));
                        res.resume();
                        return go(res.headers.location, redirects + 1);
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                    }
                    res.pipe(file);
                    file.on('finish', () => file.close(() => resolve(dest)));
                })
                .on('error', (err) => {
                    try {
                        fs.unlinkSync(dest);
                    } catch {
                        /* ignore */
                    }
                    reject(err);
                });
        };
        go(url);
    });
}

async function ensureYtDlp() {
    const dest = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (exists(dest)) {
        console.log('[bin] yt-dlp already present');
        return;
    }
    const fromPath = findOnPath('yt-dlp');
    if (fromPath && copyIfPresent(fromPath, dest)) return;

    if (process.platform === 'win32') {
        await download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', dest);
        console.log('[bin] yt-dlp.exe ready');
    } else {
        console.warn('[bin] Place yt-dlp on PATH or into bin/ manually for this OS.');
    }
}

async function ensureFfmpeg() {
    const ffmpegDest = path.join(binDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobeDest = path.join(binDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

    const candidates = [
        'C:\\ffmpeg\\bin',
        'C:\\ProgramData\\chocolatey\\bin',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'),
        path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin')
    ];

    if (!exists(ffmpegDest)) {
        let ok = false;
        for (const dir of candidates) {
            if (copyIfPresent(path.join(dir, 'ffmpeg.exe'), ffmpegDest)) {
                ok = true;
                break;
            }
        }
        if (!ok) {
            const p = findOnPath('ffmpeg');
            if (p) copyIfPresent(p, ffmpegDest);
        }
    } else {
        console.log('[bin] ffmpeg already present');
    }

    if (!exists(ffprobeDest)) {
        let ok = false;
        for (const dir of candidates) {
            if (copyIfPresent(path.join(dir, 'ffprobe.exe'), ffprobeDest)) {
                ok = true;
                break;
            }
        }
        if (!ok) {
            const p = findOnPath('ffprobe');
            if (p) copyIfPresent(p, ffprobeDest);
        }
    } else {
        console.log('[bin] ffprobe already present');
    }

    if (exists(ffmpegDest) && exists(ffprobeDest)) return;

    if (process.platform !== 'win32') {
        console.warn('[bin] Install ffmpeg via package manager (e.g. brew/apt) or place binaries in bin/.');
        return;
    }

    // Official gyan.dev essentials zip (widely used for Windows builds)
    const zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    const zipPath = path.join(binDir, 'ffmpeg-release-essentials.zip');
    try {
        await download(zipUrl, zipPath);
        // Prefer PowerShell Expand-Archive on Windows
        const extractDir = path.join(binDir, '_ffmpeg_extract');
        if (exists(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
        fs.mkdirSync(extractDir, { recursive: true });
        execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
            { stdio: 'inherit', windowsHide: true }
        );
        // Find nested bin/ffmpeg.exe
        const walk = (dir, acc = []) => {
            for (const name of fs.readdirSync(dir)) {
                const full = path.join(dir, name);
                const st = fs.statSync(full);
                if (st.isDirectory()) walk(full, acc);
                else acc.push(full);
            }
            return acc;
        };
        const files = walk(extractDir);
        const ffmpegSrc = files.find((f) => /ffmpeg\.exe$/i.test(f));
        const ffprobeSrc = files.find((f) => /ffprobe\.exe$/i.test(f));
        if (ffmpegSrc) copyIfPresent(ffmpegSrc, ffmpegDest);
        if (ffprobeSrc) copyIfPresent(ffprobeSrc, ffprobeDest);
        try {
            fs.rmSync(extractDir, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
        } catch {
            /* ignore cleanup */
        }
    } catch (error) {
        console.error('[bin] Failed to download ffmpeg essentials:', error.message);
        console.error('[bin] Manual: copy ffmpeg.exe + ffprobe.exe into', binDir);
    }
}

async function main() {
    ensureDir(binDir);
    console.log('[bin] target:', binDir);
    await ensureYtDlp();
    await ensureFfmpeg();

    const report = ['yt-dlp', 'ffmpeg', 'ffprobe'].map((name) => {
        const file = path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
        const ok = exists(file);
        console.log(ok ? `[bin] OK  ${name}` : `[bin] MISSING  ${name}`);
        return ok;
    });
    if (report.every(Boolean)) {
        console.log('[bin] All core binaries ready.');
        process.exit(0);
    } else {
        console.error('[bin] Some binaries still missing. App can still start; media processing may fail.');
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
