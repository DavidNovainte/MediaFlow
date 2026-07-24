/**
 * EngineManager.js
 * 核心引擎组件管理服务 - 负责管理 yt-dlp, FFmpeg, Demucs, Whisper 等组件的状态与更新
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const { getYtDlpPath, getFfmpegPath } = require('../utils/binaries');
const transcribers = require('../../services/transcribe');

/** Optional: Community export omits audio/demucs Pro modules. */
let demucsHandler;
try {
    demucsHandler = require('./audio/demucsHandler');
} catch (error) {
    void error;
    demucsHandler = {
        async checkDemucsAvailable() {
            return { available: false, version: null, pythonVersion: null };
        },
        async findPython() {
            const isWindows = process.platform === 'win32';
            return { cmd: isWindows ? 'python' : 'python3', args: [], version: 'fallback' };
        },
        async installDemucs() {
            return { success: false, error: 'Demucs is not available in Community' };
        }
    };
}

class EngineManager {
    constructor() {
        this.updating = new Set(); // 正在更新的组件
    }

    /**
     * 获取所有组件的详细状态
     */
    async getDetailedStatus() {
        const status = {};

        // 1. yt-dlp
        try {
            const ytp = getYtDlpPath();
            const ytdlpVer = await this._getBinVersion(ytp, '--version');
            status['yt-dlp'] = {
                name: 'yt-dlp',
                type: 'binary',
                path: ytp,
                installed: !!ytdlpVer,
                version: ytdlpVer || 'N/A',
                updateMethod: 'internal'
            };
        } catch (e) {
            status['yt-dlp'] = { installed: false, error: e.message };
        }

        // 2. FFmpeg
        try {
            const ffp = getFfmpegPath();
            const ffmpegVer = await this._getBinVersion(ffp, '-version');
            // FFmpeg version output is multiple lines, usually "ffmpeg version 7.0.1..."
            const shortVer = ffmpegVer ? ffmpegVer.split('\n')[0].match(/version\s+([^\s]+)/)?.[1] || 'installed' : 'N/A';
            status['ffmpeg'] = {
                name: 'FFmpeg',
                type: 'binary',
                path: ffp,
                installed: !!ffmpegVer,
                version: shortVer,
                updateMethod: 'manual' // FFmpeg usually doesn't have self-update
            };
        } catch (e) {
            status['ffmpeg'] = { installed: false, error: e.message };
        }

        // 3. Demucs (AI)
        try {
            const dCheck = await demucsHandler.checkDemucsAvailable();
            status['demucs'] = {
                name: 'Demucs',
                type: 'python-pkg',
                installed: dCheck.available,
                version: dCheck.version || 'N/A',
                pythonVersion: dCheck.pythonVersion,
                updateMethod: 'pip'
            };
        } catch (e) {
            status['demucs'] = { installed: false, error: e.message };
        }

        // 4. Faster-Whisper (AI)
        try {
            const wCheck = await transcribers.checkLocalEnv();
            const wVer = await this._getPyPIInstalledVersion('faster-whisper');
            status['whisper'] = {
                name: 'Faster-Whisper',
                type: 'python-pkg',
                installed: wCheck.available,
                version: wVer || (wCheck.available ? 'installed' : 'N/A'),
                updateMethod: 'pip'
            };
        } catch (e) {
            status['whisper'] = { installed: false, error: e.message };
        }

        return status;
    }

    /**
     * 检测云端是否有更新
     */
    async checkUpdates() {
        const updates = {};

        //检测 yt-dlp 更新 (GitHub API)
        updates['yt-dlp'] = await this._getGitHubLatestVersion('yt-dlp/yt-dlp');

        // 检测 Demucs 更新 (PyPI)
        updates['demucs'] = await this._getPyPILatestVersion('demucs');

        // 检测 Faster-Whisper 更新
        updates['whisper'] = await this._getPyPILatestVersion('faster-whisper');

        return updates;
    }

    /**
     * 执行组件更新
     */
    async performUpdate(component, event) {
        if (this.updating.has(component)) return { success: false, error: 'Update already in progress' };
        this.updating.add(component);

        try {
            let result;
            if (component === 'yt-dlp') {
                result = await this._updateYtDlp(event);
            } else if (component === 'demucs' || component === 'whisper') {
                const pkg = component === 'demucs' ? 'demucs' : 'faster-whisper';
                result = await this._updatePythonPkg(pkg, event);
            } else {
                result = { success: false, error: 'Update not supported for this component' };
            }
            return result;
        } finally {
            this.updating.delete(component);
        }
    }

    // --- 内部私有方法 ---

    _getBinVersion(binPath, versionArg) {
        return new Promise((resolve) => {
            if (!fs.existsSync(binPath)) return resolve(null);
            exec(`"${binPath}" ${versionArg}`, (err, stdout) => {
                if (err) resolve(null);
                else resolve(stdout.trim());
            });
        });
    }

    async _getPyPIInstalledVersion(pkg) {
        const python = await demucsHandler.findPython();
        return new Promise((resolve) => {
            const cmd = `${python.cmd} ${python.args.join(' ')} -m pip show ${pkg}`;
            exec(cmd, (err, stdout) => {
                if (err) return resolve(null);
                const match = stdout.match(/Version:\s+([^\s\n\r]+)/);
                resolve(match ? match[1] : null);
            });
        });
    }

    _getGitHubLatestVersion(repo) {
        return new Promise((resolve) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${repo}/releases/latest`,
                headers: { 'User-Agent': 'MediaFlow' },
                timeout: 5000
            };
            https.get(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.tag_name || null);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    }

    _getPyPILatestVersion(pkg) {
        return new Promise((resolve) => {
            https.get(`https://pypi.org/pypi/${pkg}/json`, { timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.info.version || null);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    }

    _updateYtDlp(event) {
        return new Promise((resolve) => {
            const ytp = getYtDlpPath();
            const proc = spawn(`"${ytp}"`, ['-U'], { shell: true });
            let output = '';

            const sendLog = (data) => {
                const str = data.toString();
                output += str;
                if (event) event.sender.send('engine:updateProgress', { pkg: 'yt-dlp', log: str });
            };

            proc.stdout.on('data', sendLog);
            proc.stderr.on('data', sendLog);

            proc.on('close', (code) => {
                if (code === 0) resolve({ success: true });
                else resolve({ success: false, error: output || 'yt-dlp update failed' });
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    async _updatePythonPkg(pkg, event) {
        const python = await demucsHandler.findPython();
        return new Promise((resolve) => {
            const args = [...python.args, '-m', 'pip', 'install', '--upgrade', pkg];
            
            const logMsg = `[System] Starting update for ${pkg} using ${python.cmd} ${python.args.join(' ')}...\n`;
            if (event) event.sender.send('engine:updateProgress', { pkg, log: logMsg });

            const proc = spawn(python.cmd, args, { shell: true });
            let output = '';

            const sendLog = (data) => {
                const str = data.toString();
                output += str;
                if (event) event.sender.send('engine:updateProgress', { pkg, log: str });
            };

            proc.stdout.on('data', sendLog);
            proc.stderr.on('data', sendLog);

            proc.on('close', (code) => {
                if (code === 0) resolve({ success: true });
                else resolve({ success: false, error: output || 'Pip update failed' });
            });

            proc.on('error', (err) => {
                resolve({ success: false, error: `Failed to start python: ${err.message}` });
            });
        });
    }

    /**
     * 注册 IPC Handlers
     */
    setupHandlers(ipcMain) {
        ipcMain.handle('engine:getDetailedStatus', () => this.getDetailedStatus());
        ipcMain.handle('engine:checkUpdates', () => this.checkUpdates());
        ipcMain.handle('engine:performUpdate', (event, component) => this.performUpdate(component, event));
    }
}

module.exports = new EngineManager();
