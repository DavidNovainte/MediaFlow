/**
 * Playlist Handler - 播放列表处理
 * 从 downloadHandler.js 提取
 */

const { spawn } = require('child_process');
const { getYtDlpPath } = require('../../utils/binaries');
const { getProxyUrl } = require('./proxyUtils');
const tiktok = require('../../../services/platforms/tiktok');

/**
 * 获取播放列表信息
 * @param {string} url - 播放列表 URL
 * @param {number} maxVideos - 最大视频数
 * @returns {Promise<Object>}
 */
async function getPlaylistInfo(url, maxVideos = 1000) {
    if (tiktok.isTikTokUrl(url) && tiktok.isTikTokProfile(url)) {
        try { return await tiktok.getUserVideos(url, maxVideos); }
        catch (error) { return { success: false, error: error.message || String(error) }; }
    }

    return new Promise((resolve) => {
        const args = ['--flat-playlist', '--dump-json', '--no-warnings', '--playlist-end', String(maxVideos)];
        const proxy = getProxyUrl();
        if (proxy) args.push('--proxy', proxy);
        args.push(url);

        const ytProcess = spawn(getYtDlpPath(), args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' }
        });

        let stdout = '';
        let stderr = '';

        ytProcess.stdout.on('data', (data) => stdout += data.toString('utf8'));
        ytProcess.stderr.on('data', (data) => stderr += data.toString('utf8'));

        ytProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const lines = stdout.trim().split('\n');
                    const items = lines.map(line => {
                        const item = JSON.parse(line);
                        const thumbnail = item.thumbnail || (item.id ? `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg` : '');
                        return {
                            id: item.id,
                            title: item.title,
                            url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
                            duration: item.duration,
                            thumbnail: thumbnail
                        };
                    });
                    resolve({ success: true, isPlaylist: true, count: items.length, items: items });
                } catch {
                    resolve({ success: false, error: 'Failed to parse playlist info' });
                }
            } else {
                resolve({ success: false, error: stderr || 'Failed to get playlist info' });
            }
        });
    });
}

/**
 * 注册播放列表相关 IPC handlers
 * @param {Electron.IpcMain} ipcMain 
 */
function setupPlaylistHandlers(ipcMain) {
    ipcMain.handle('video:getPlaylistInfo', async (event, url, maxVideos = 1000) => {
        return await getPlaylistInfo(url, maxVideos);
    });
}

module.exports = {
    getPlaylistInfo,
    setupPlaylistHandlers
};
