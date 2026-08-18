/**
 * Download Handler Facade
 * 协调各个子模块完成下载任务
 */

// 导入子模块
const { setupProxyHandlers } = require('./download/proxyUtils');
const { setupVideoInfoHandlers } = require('./download/videoInfoParser');
const { setupDownloadHandlers: setupCoreDownloadHandlers } = require('./download/ytdlpDownloader');

/** Optional: Community export omits playlist bulk capture. */
let setupPlaylistHandlers = () => {};
try {
    ({ setupPlaylistHandlers } = require('./download/playlistHandler'));
} catch (error) {
    void error;
}

/**
 * 注册所有下载相关的 IPC handlers
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.BrowserWindow} mainWindow
 */
const setupDownloadHandlers = (ipcMain) => {
    // 1. 代理配置 (proxyUtils.js)
    setupProxyHandlers(ipcMain);

    // 2. 视频信息获取 (videoInfoParser.js)
    setupVideoInfoHandlers(ipcMain);

    // 3. 播放列表处理 (playlistHandler.js) — full product only
    setupPlaylistHandlers(ipcMain);

    // 4. 核心下载逻辑 & 版本管理 (ytdlpDownloader.js)
    setupCoreDownloadHandlers(ipcMain);
};

module.exports = { setupDownloadHandlers };
