const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');
const mobileFlowServer = require('../../services/server');

let castWindow = null;
let _getMainWindow = null;

const startMobileServer = async (port = 8765) => {
    const result = await mobileFlowServer.start(port);
    console.log(`[MobileHandler] Server started on port ${port}`);

    // Set up callbacks
    // URL Received Callback
    mobileFlowServer.setUrlReceivedCallback((url) => {
        const win = _getMainWindow ? _getMainWindow() : null;
        win?.webContents.send('mobileflow:urlReceived', url);
    });

    // Cookies Received Callback
    mobileFlowServer.onCookiesReceived = (cookies) => {
        try {
            const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
            const cookieContent = cookies.map(c => {
                // Netscape format: domain, include_subdomains, path, secure, expiry, name, value
                return [
                    c.domain,
                    c.domain.startsWith('.') ? 'TRUE' : 'FALSE',
                    c.path,
                    c.secure ? 'TRUE' : 'FALSE',
                    Math.floor(c.expirationDate || (Date.now() / 1000 + 31536000)), // Default 1 year if undefined
                    c.name,
                    c.value
                ].join('\t');
            }).join('\n');

            fs.writeFileSync(cookiePath, '# Netscape HTTP Cookie File\n' + cookieContent);
            console.log('[MobileHandler] Cookies saved to:', cookiePath);

            // Notify frontend
            const win = _getMainWindow ? _getMainWindow() : null;
            win?.webContents.send('toast', { message: 'Cookies synced successfully!', type: 'success' });
        } catch (err) {
            console.error('[MobileHandler] Failed to save cookies:', err);
        }
    };

    return result;
};

const setupMobileHandlers = (ipcMain, getMainWindow) => {
    _getMainWindow = getMainWindow;

    // ==================== MobileFlow IPC (手机互联服务) ====================

    /**
     * 启动 Mobile Flow 服务器
     */
    ipcMain.handle('mobileflow:start', async (event, port) => {
        // Also update the getMainWindow if possible, or reliance on closure is fine regarding setup
        // But if setup was called with a getter, we are good.
        // We can also retry callback setup here to be sure

        return await startMobileServer(port);
    });

    /**
     * 停止服务器
     */
    ipcMain.handle('mobileflow:stop', async () => {
        return await mobileFlowServer.stop();
    });

    /**
     * 设置 PIN 码
     */
    ipcMain.handle('mobileflow:setPin', async (event, pin) => {
        const sanitizedPin = pin && /^[0-9]{4,6}$/.test(pin) ? pin : null;
        mobileFlowServer.setPin(sanitizedPin);
        return { success: true, enabled: !!sanitizedPin };
    });

    /**
     * 获取遥控页面二维码
     */
    ipcMain.handle('mobileflow:getRemoteQR', async (event, ip) => {
        return await mobileFlowServer.getRemoteQRCode(ip);
    });

    /**
     * 获取文件下载二维码
     */
    ipcMain.handle('mobileflow:getFileQR', async (event, filePath) => {
        return await mobileFlowServer.getFileQRCode(filePath);
    });

    /**
     * 获取待处理的 URL 列表
     */
    ipcMain.handle('mobileflow:getPendingUrls', () => {
        return mobileFlowServer.getPendingUrls();
    });

    /**
     * 启动投屏播放器窗口
     */
    ipcMain.handle('mobileflow:openPlayer', async (event, data) => {
        const { url, title, type } = data;

        if (castWindow && !castWindow.isDestroyed()) {
            castWindow.show();
            castWindow.focus();
            castWindow.webContents.send('player:play', { url, title, type });
            return { success: true };
        }

        castWindow = new BrowserWindow({
            width: 1000,
            height: 600,
            backgroundColor: '#000000',
            autoHideMenuBar: true,
            frame: false,
            title: title || 'MediaFlow Cast Player',
            icon: path.join(__dirname, '../../assets/icons/mediaflow-studio-icon.png'),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../../preload.js') // Adjusted path
            }
        });

        // Adjusted path for player.html
        // Original: castWindow.loadFile('src/player.html');
        // 'src/player.html' is relative to app root.
        // If we run from main process, base is project root.
        castWindow.loadFile('src/player.html');

        castWindow.webContents.once('did-finish-load', () => {
            castWindow.webContents.send('player:play', { url, title, type });
        });

        castWindow.on('closed', () => {
            castWindow = null;
        });

        return { success: true };
    });

    /**
     * 发送控制请求到播放器
     */
    ipcMain.handle('mobileflow:playerCommand', async (event, command) => {
        if (castWindow && !castWindow.isDestroyed()) {
            castWindow.webContents.send('player:command', command);
            return { success: true };
        }
        return { success: false, error: '播放器面板未开启' };
    });
};

module.exports = { setupMobileHandlers, startMobileServer };
