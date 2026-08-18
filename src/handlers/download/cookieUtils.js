const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 获取 yt-dlp cookies.txt 路径（由浏览器扩展“同步 Cookie”写入 userData）
 * 仅当文件存在时返回路径，否则返回 null。
 */
function getCookiesPath() {
    try {
        const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
        return fs.existsSync(cookiePath) ? cookiePath : null;
    } catch {
        return null;
    }
}

/**
 * 若存在 cookies.txt，则向 yt-dlp 参数数组追加 --cookies <path>
 * 用于平台专用下载服务（tiktok/instagram/facebook 2026 年起普遍需要 Cookie）
 * @param {string[]} args - yt-dlp 参数数组
 * @returns {string[]}
 */
function appendCookiesArg(args = []) {
    const cookiePath = getCookiesPath();
    if (cookiePath) {
        args.push('--cookies', cookiePath);
    }
    return args;
}

module.exports = { getCookiesPath, appendCookiesArg };
