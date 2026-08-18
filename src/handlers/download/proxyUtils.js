/**
 * Proxy Utils - 代理配置工具
 * 从 downloadHandler.js 提取
 */

const { execFile } = require('child_process');
const Store = require('electron-store');
const { getYtDlpPath } = require('../../utils/binaries');

const store = new Store();

/**
 * 获取代理 URL
 * @returns {string|null} 代理 URL 或 null
 */
function getProxyUrl() {
    if (!store.get('proxyEnabled')) return null;

    const type = store.get('proxyType') || 'http';
    const host = store.get('proxyHost');
    const port = store.get('proxyPort');
    const user = store.get('proxyUser');
    const pass = store.get('proxyPass');

    if (!host || !port) return null;

    let auth = '';
    if (user && pass) {
        auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
    }

    return `${type}://${auth}${host}:${port}`;
}

/**
 * 测试代理连接
 * @param {Object} config - { type, host, port, user, pass }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function testProxy(config) {
    const { type, host, port, user, pass } = config;
    if (!host || !port) {
        return { success: false, error: 'Host and port required' };
    }

    let auth = '';
    if (user && pass) {
        auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
    }
    const proxyUrl = `${type}://${auth}${host}:${port}`;
    const ytDlpPath = getYtDlpPath();

    return new Promise((resolve) => {
        const args = [
            '--proxy', proxyUrl,
            '--simulate',
            '--no-warnings',
            'https://www.google.com'
        ];

        execFile(ytDlpPath, args, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error && (
                error.message.includes('Connection refused') ||
                error.message.includes('timed out') ||
                error.message.includes('Proxy error')
            )) {
                resolve({ success: false, error: '连接失败: ' + (stderr || error.message) });
            } else {
                resolve({ success: true });
            }
        });
    });
}

/**
 * 注册代理相关 IPC handlers
 * @param {Electron.IpcMain} ipcMain 
 */
function setupProxyHandlers(ipcMain) {
    ipcMain.handle('video:testProxy', async (event, config) => {
        return await testProxy(config);
    });
}

module.exports = {
    getProxyUrl,
    testProxy,
    setupProxyHandlers
};
