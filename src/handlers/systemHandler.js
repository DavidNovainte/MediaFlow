const { dialog, shell, app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
// Use Shared License Manager
const licenseManager = require('../../services/LicenseManager');
const clipboardWatcher = require('../utils/clipboardWatcher');
const processQueue = require('../utils/ProcessQueue');
const modelManager = require('../utils/modelManager');
const { getBinaryStatus } = require('../utils/binaries');

const store = new Store();
const isTestEnv = process.env.NODE_ENV === 'test';
// Initialize the shared singleton
licenseManager.init(store);

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

const setupSystemHandlers = (ipcMain) => {

    // ==================== App (应用信息 - 核心 - 优先注册) ====================
    debugLog('[SystemHandler] Initializing App IPC handlers...');

    ipcMain.handle('app:getLocale', () => {
        return app.getLocale();
    });

    ipcMain.handle('app:getTempPath', () => {
        const os = require('os');
        return os.tmpdir();
    });

    ipcMain.handle('app:getPath', (event, name) => {
        try {
            return app.getPath(name);
        } catch (e) {
            console.error('[SystemHandler] getPath error:', e);
            return null;
        }
    });

    // 获取应用版本号 (从 package.json)
    ipcMain.handle('system:getBinaryStatus', () => {
        try {
            return { success: true, ...getBinaryStatus() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('app:getVersion', () => {
        const version = app.getVersion();
        console.log('[SystemHandler] IPC: app:getVersion called, returning:', version);
        return version;
    });

    ipcMain.handle('app:isPackaged', () => app.isPackaged);

    ipcMain.handle('app:getPricingConfig', async () => {
        const pricingPath = path.join(__dirname, '../../pricing.json');
        try {
            if (fs.existsSync(pricingPath)) {
                const content = fs.readFileSync(pricingPath, 'utf8');
                return JSON.parse(content);
            }
            return null;
        } catch (e) {
            console.error('[SystemHandler] Failed to read pricing config:', e);
            return null;
        }
    });

    /**
     * 从远程服务器静默获取定价 (避免在渲染进程产生 console 红色报错)
     */
    ipcMain.handle('app:fetchRemotePricing', async () => {
        const https = require('https');
        return new Promise((resolve) => {
            const req = https.get('https://mediaflow.app/api/pricing.json', { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) resolve(JSON.parse(data));
                        else resolve(null);
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => {
                resolve(null);
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
        });
    });

    debugLog('[SystemHandler] Core App IPC handlers registered.');

    // ==================== 窗口控制 (Window Control) ====================
    ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());

    ipcMain.on('window:maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win?.isMaximized()) {
            win.unmaximize();
        } else {
            win?.maximize();
        }
    });

    ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

    ipcMain.on('window:setTitle', (event, title) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && typeof title === 'string' && title.trim()) {
            win.setTitle(title.trim());
        }
    });

    ipcMain.on('window:setSize', (event, { width, height }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setSize(parseInt(width), parseInt(height), true); // true for animation on macOS
        }
    });

    ipcMain.handle('window:getSize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.getSize() : [1280, 800];
    });

    // ==================== 队列与并发控制 (Queue & Concurrency) ====================
    ipcMain.handle('system:setConcurrency', (event, count) => {
        processQueue.setConcurrency(count);
        return true;
    });

    ipcMain.handle('system:getQueueStatus', () => {
        return processQueue.getStatus();
    });

    ipcMain.handle('system:cancelTask', (event, taskId) => {
        return processQueue.cancelTask(taskId);
    });

    /**
     * Open the app logs folder in the system file manager (support / diagnostics).
     */
    ipcMain.handle('system:openLogsDir', async () => {
        try {
            const logger = require('../utils/logger');
            const logsDir =
                logger.logDir || path.join(app.getPath('userData'), 'logs');

            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            const openError = await shell.openPath(logsDir);
            if (openError) {
                return { success: false, error: openError, path: logsDir };
            }
            return { success: true, path: logsDir };
        } catch (e) {
            console.error('[System] openLogsDir failed:', e);
            return { success: false, error: e.message };
        }
    });

    // ==================== 剪贴板 (Clipboard) ====================
    ipcMain.handle('clipboard:getEnabled', () => clipboardWatcher.isEnabled);
    ipcMain.handle('clipboard:setEnabled', (event, enabled) => {
        clipboardWatcher.setEnabled(enabled);
        return enabled;
    });
    ipcMain.handle('clipboard:getDetectMode', () => {
        if (typeof clipboardWatcher.getDetectMode === 'function') {
            return clipboardWatcher.getDetectMode();
        }
        return store.get('clipboardDetectMode', 'balanced');
    });
    ipcMain.handle('clipboard:setDetectMode', (event, mode) => {
        if (typeof clipboardWatcher.setDetectMode === 'function') {
            return clipboardWatcher.setDetectMode(mode);
        }
        store.set('clipboardDetectMode', mode);
        return mode;
    });

    /**
     * 复制文件到剪贴板 (可以在文件资源管理器中粘贴)
     * Windows: 使用临时脚本文件避免编码问题
     */
    ipcMain.handle('clipboard:copyFiles', async (event, filePaths) => {
        try {
            if (!filePaths || filePaths.length === 0) {
                return { success: false, error: '没有选择文件' };
            }

            // 验证文件存在
            const validPaths = filePaths.filter(p => fs.existsSync(p));
            if (validPaths.length === 0) {
                return { success: false, error: '所选文件不存在' };
            }

            // Windows: 使用临时脚本文件解决中文路径编码问题
            if (process.platform === 'win32') {
                const { execSync } = require('child_process');
                const os = require('os');

                // 创建临时 PowerShell 脚本
                const tempScript = path.join(os.tmpdir(), `mediaflow_copy_${Date.now()}.ps1`);

                // 构建脚本内容
                const pathsList = validPaths.map(p => `"${p.replace(/\\/g, '\\\\')}"`).join(',\n');
                const scriptContent = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object System.Collections.Specialized.StringCollection
$paths = @(
${pathsList}
)
foreach ($p in $paths) {
    $files.Add($p) | Out-Null
}
[System.Windows.Forms.Clipboard]::SetFileDropList($files)
Write-Host "OK"
`;

                // 写入脚本文件 (UTF-8 with BOM for PowerShell)
                const BOM = '\ufeff';
                fs.writeFileSync(tempScript, BOM + scriptContent, 'utf8');

                try {
                    // 执行脚本
                    execSync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, {
                        encoding: 'utf8',
                        windowsHide: true
                    });
                    return { success: true, count: validPaths.length };
                } finally {
                    // 清理临时文件
                    try {
                        fs.unlinkSync(tempScript);
                    } catch {
                        // Best-effort cleanup for the temporary PowerShell script.
                    }
                }
            } else {
                // macOS/Linux 暂不支持
                return { success: false, error: '此功能暂时仅支持 Windows' };
            }
        } catch (error) {
            console.error('[Clipboard] Copy files failed:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== Shell / 文件操作 ====================

    /**
     * 打开扩展文件夹
     */
    ipcMain.on('shell:openExtensionFolder', () => {
        const resourceExtPath = process.resourcesPath ? path.join(process.resourcesPath, 'extension') : null;
        const devExtPath = path.resolve(__dirname, '../../extension');

        let extPath = app.isPackaged && resourceExtPath ? resourceExtPath : devExtPath;
        if (!fs.existsSync(extPath) && resourceExtPath && fs.existsSync(resourceExtPath)) {
            extPath = resourceExtPath;
        }

        Promise.resolve(shell.openPath(extPath)).then((errorMessage) => {
            if (errorMessage) {
                console.error('[SystemHandler] Failed to open extension folder:', errorMessage);
            }
        });
    });

    /**
     * 打开路径
     */
    ipcMain.on('shell:openPath', (event, fullPath) => {
        if (fullPath) shell.openPath(fullPath);
    });

    /**
     * 在文件夹中显示
     */
    ipcMain.on('shell:showItemInFolder', (event, fullPath) => {
        console.log('[systemHandler] showItemInFolder called with:', fullPath);
        if (fullPath) {
            // 检查文件是否存在
            if (!fs.existsSync(fullPath)) {
                console.warn('[systemHandler] File does not exist:', fullPath);
            }
            shell.showItemInFolder(fullPath);
            console.log('[systemHandler] showItemInFolder executed');
        } else {
            console.warn('[systemHandler] showItemInFolder called with empty path');
        }
    });

    /**
     * 检查文件是否存在
     */
    ipcMain.handle('shell:fileExists', async (event, fullPath) => {
        if (!fullPath) return false;
        try {
            return fs.existsSync(fullPath);
        } catch {
            return false;
        }
    });

    /**
     * 打开外部链接
     */
    ipcMain.on('shell:openExternal', (event, url) => {
        // 安全修复：仅允许 http/https 协议，防止打开 file:// 或 javascript: 等恶意协议
        try {
            const parsedUrl = new URL(url);
            const ALLOWED_PROTOCOLS = ['http:', 'https:'];
            if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
                console.warn(`[Security] shell:openExternal 拒绝不安全协议: ${parsedUrl.protocol}`);
                return;
            }
            shell.openExternal(url);
        } catch (e) {
            console.error('[Security] shell:openExternal URL 解析失败:', url, e.message);
        }
    });

    // ==================== Dialog (对话框) ====================

    /**
     * 选择文件夹
     */
    ipcMain.handle('dialog:selectFolder', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: '选择下载目录'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    /**
     * 保存文件
     */
    ipcMain.handle('dialog:saveFile', async (event, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showSaveDialog(win, {
            title: options?.title || 'Notification',
            defaultPath: options?.defaultPath,
            filters: options?.filters || [
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (!result.canceled && result.filePath) {
            return result.filePath;
        }
        return null;
    });

    /**
     * 打开文件
     */
    ipcMain.handle('dialog:openFile', async (event, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);

        // 支持自定义 properties (如 multiSelections)
        const properties = options?.properties || ['openFile'];

        const result = await dialog.showOpenDialog(win, {
            title: options?.title || 'Notification',
            properties: properties,
            filters: options?.filters || [
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            // 如果是多选模式，返回数组；否则返回单个路径
            if (properties.includes('multiSelections')) {
                return result.filePaths;
            }
            return result.filePaths[0];
        }
        return null;
    });

    // ==================== Path (路径操作) ====================

    ipcMain.handle('dialog:showMessageBox', async (event, options = {}) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return dialog.showMessageBox(win, {
            type: options.type || 'none',
            buttons: Array.isArray(options.buttons) && options.buttons.length
                ? options.buttons.map((button) => String(button))
                : undefined,
            defaultId: Number.isInteger(options.defaultId) ? options.defaultId : undefined,
            cancelId: Number.isInteger(options.cancelId) ? options.cancelId : undefined,
            title: options.title || 'MediaFlow',
            message: options.message || '',
            detail: options.detail,
            checkboxLabel: options.checkboxLabel,
            checkboxChecked: Boolean(options.checkboxChecked),
            noLink: options.noLink !== false,
            normalizeAccessKeys: Boolean(options.normalizeAccessKeys)
        });
    });

    ipcMain.handle('path:dirname', (event, p) => {
        return path.dirname(p);
    });

    ipcMain.handle('path:basename', (event, p, ext) => {
        return ext ? path.basename(p, ext) : path.basename(p);
    });

    ipcMain.handle('path:extname', (event, p) => {
        return path.extname(p);
    });

    ipcMain.handle('path:join', (event, ...args) => {
        return path.join(...args);
    });

    // ==================== File System (文件操作) ====================

    ipcMain.handle('fs:mkdir', async (event, dirPath) => {
        const fs = require('fs').promises;
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return { success: true, path: dirPath };
        } catch (error) {
            console.error('fs:mkdir error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:ensureDir', async (event, dirPath) => {
        const fs = require('fs').promises;
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return { success: true, path: dirPath };
        } catch (error) {
            console.error('fs:ensureDir error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:delete', async (event, filePath) => {
        const fs = require('fs').promises;
        try {
            await fs.unlink(filePath);
            return { success: true };
        } catch (error) {
            console.error('fs:delete error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:stat', async (event, filePath) => {
        const fs = require('fs').promises;
        if (!filePath) {
            return { success: false, error: 'Missing file path' };
        }

        try {
            const stats = await fs.stat(filePath);
            return {
                success: true,
                size: Number(stats.size) || 0,
                mtimeMs: Number(stats.mtimeMs) || 0,
                lastModified: Number(stats.mtimeMs) || 0,
                isDirectory: typeof stats.isDirectory === 'function' ? stats.isDirectory() : false
            };
        } catch (error) {
            console.error('fs:stat error:', error);
            return { success: false, error: error.message };
        }
    });

    // --- 安全修复：路径安全校验函数 ---
    const isPathSafe = (filePath) => {
        const os = require('os');
        const normalizedPath = path.resolve(filePath);
        const allowedRoots = [
            os.homedir(),           // 用户主目录
            os.tmpdir(),            // 系统临时目录
            app.getPath('userData'), // 应用数据目录
            app.getPath('downloads') // 下载目录
        ];
        return allowedRoots.some(root => normalizedPath.startsWith(path.resolve(root)));
    };

    ipcMain.handle('fs:copyFile', async (event, sourcePath, targetPath) => {
        const fs = require('fs').promises;
        if (!sourcePath || !targetPath) {
            return { success: false, error: 'Missing source or target path' };
        }

        if (!isPathSafe(sourcePath) || !isPathSafe(targetPath)) {
            console.warn(`[Security] fs:copyFile 鎷掔粷涓嶅畨鍏ㄨ矾寰? ${sourcePath} -> ${targetPath}`);
            return { success: false, error: 'Path not allowed' };
        }

        try {
            await fs.copyFile(sourcePath, targetPath);
            return { success: true, path: targetPath };
        } catch (error) {
            console.error('fs:copyFile error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
        const fs = require('fs').promises;
        if (!isPathSafe(filePath)) {
            console.warn(`[Security] fs:writeFile 拒绝不安全路径: ${filePath}`);
            return { success: false, error: 'Path not allowed' };
        }
        try {
            await fs.writeFile(filePath, content, 'utf8');
            return { success: true };
        } catch (error) {
            console.error('fs:writeFile error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:writeFileBuffer', async (event, filePath, buffer) => {
        const fs = require('fs').promises;
        if (!isPathSafe(filePath)) {
            console.warn(`[Security] fs:writeFileBuffer 拒绝不安全路径: ${filePath}`);
            return { success: false, error: 'Path not allowed' };
        }
        try {
            await fs.writeFile(filePath, Buffer.from(buffer));
            return { success: true };
        } catch (error) {
            console.error('fs:writeFileBuffer error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:readFile', async (event, filePath) => {
        const fs = require('fs').promises;
        if (!isPathSafe(filePath)) {
            console.warn(`[Security] fs:readFile 拒绝不安全路径: ${filePath}`);
            throw new Error('Path not allowed');
        }
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            console.error('fs:readFile error:', error);
            throw error;
        }
    });

    ipcMain.handle('fs:readFileBuffer', async (event, filePath) => {
        const fs = require('fs').promises;
        if (!isPathSafe(filePath)) {
            console.warn(`[Security] fs:readFileBuffer 拒绝不安全路径: ${filePath}`);
            throw new Error('Path not allowed');
        }
        try {
            return await fs.readFile(filePath);
        } catch (error) {
            console.error('fs:readFileBuffer error:', error);
            throw error;
        }
    });

    /**
     * 扫描文件夹中的视频文件 (递归)
     */
    ipcMain.handle('file:scan-video', async (event, dirPath) => {
        const fs = require('fs').promises;
        const path = require('path');

        async function getFiles(dir) {
            const dirents = await fs.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(dirents.map((dirent) => {
                const res = path.resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            }));
            return Array.prototype.concat(...files);
        }

        try {
            const allFiles = await getFiles(dirPath);
            const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];

            const videoFiles = allFiles
                .filter(file => videoExtensions.includes(path.extname(file).toLowerCase()))
                .map(file => ({
                    name: path.basename(file),
                    path: file,
                    size: require('fs').statSync(file).size
                }));

            return videoFiles;
        } catch (error) {
            console.error('file:scan-video error:', error);
            throw new Error(`Failed to scan directory: ${error.message}`);
        }
    });

    /**
     * 读取文件为 Data URL (用于视频/图片预览)
     */
    ipcMain.handle('fs:readAsDataUrl', async (event, filePath) => {
        console.log('[fs:readAsDataUrl] Requested path:', filePath);
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                console.log('[fs:readAsDataUrl] File not found at:', filePath);
                return { success: false, error: 'File not found' };
            }

            // [Memory Protection] 限额 20MB，防止大视频/高分图撑爆主进程内存
            const stats = fs.statSync(filePath);
            const MAX_SIZE = 20 * 1024 * 1024; // 20MB
            if (stats.size > MAX_SIZE) {
                console.warn('[fs:readAsDataUrl] File too large for Base64 conversion:', filePath, (stats.size / 1024 / 1024).toFixed(2) + 'MB');
                return {
                    success: false,
                    error: '文件过大，无法通过 DataURL 预览 (请直接在播放器中打开或查看缩略图)',
                    size: stats.size
                };
            }

            const ext = path.extname(filePath).toLowerCase().slice(1);
            const mimeTypes = {
                // 图片格式
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'webp': 'image/webp',
                'gif': 'image/gif',
                'bmp': 'image/bmp',
                // 视频格式
                'mp4': 'video/mp4',
                'webm': 'video/webm',
                'mkv': 'video/x-matroska',
                'mov': 'video/quicktime',
                'avi': 'video/x-msvideo',
                // 音频格式
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'm4a': 'audio/mp4',
                'flac': 'audio/flac'
            };
            const mimeType = mimeTypes[ext] || 'application/octet-stream';

            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64}`;

            return { success: true, dataUrl };
        } catch (error) {
            console.error('fs:readAsDataUrl error:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== Store (存储) ====================

    ipcMain.handle('store:get', (event, key, defaultValue) => {
        return store.get(key, defaultValue);
    });

    ipcMain.handle('store:set', (event, key, value) => {
        // 安全修复：保护敏感键，防止渲染进程篡改许可证和权限数据
        const PROTECTED_KEYS = ['isPro', 'license_data', 'licenseKey', 'licenseInfo', 'boundHWID', 'boundFactors'];
        if (PROTECTED_KEYS.includes(key)) {
            console.warn(`[Security] store:set 拒绝写入受保护键: ${key}`);
            return false;
        }
        store.set(key, value);
        return true;
    });


    // ==================== License (授权) ====================

    ipcMain.handle('license:activate', async (event, key) => {
        return await licenseManager.activate(key);
    });

    ipcMain.handle('license:validate', async () => {
        return await licenseManager.validate();
    });

    ipcMain.handle('license:status', async () => {
        return await licenseManager.getStatus();
    });

    ipcMain.handle('license:getHWID', async () => {
        return await licenseManager.getMachineId();
    });

    /**
     * 获取系统已安装字体列表 (Windows 优先)
     */
    ipcMain.handle('system:getFonts', async () => {
        try {
            if (process.platform === 'win32') {
                const { exec } = require('child_process');
                // 更加健壮的 PowerShell 命令：显式加载 System.Drawing 程序集，并强制 UTF8
                const command = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Drawing; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [System.Drawing.Text.InstalledFontCollection]::new().Families.Name"';

                return new Promise((resolve) => {
                    exec(command, { encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[System] Failed to fetch fonts:', error, stderr);
                            // 返回一个更有代表性的 fallback，防止列表太单调
                            resolve(['微软雅黑', '宋体', '黑体', 'Arial', 'Times New Roman']);
                            return;
                        }

                        const fonts = stdout
                            .split(/\r?\n/)
                            .map(f => f.trim())
                            .filter(f => f && f.length > 0);

                        // 去重
                        const uniqueFonts = [...new Set(fonts)].sort();
                        resolve(uniqueFonts);
                    });
                });
            } else {
                // macOS/Linux 可以使用 font-list 库，但目前先提供基础 fallback 或由前端根据 CSS 降级
                return ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'];
            }
        } catch (e) {
            console.error('[System] Error in getFonts handler:', e);
            return [];
        }
    });

    // ==================== Notification (系统通知) ====================
    ipcMain.handle('notification:show', async (event, options) => {
        const { Notification } = require('electron');
        if (!Notification.isSupported()) {
            return { success: false, error: 'Notifications not supported' };
        }

        const iconPath = path.join(__dirname, '../../assets/icons/mediaflow-studio-icon.png');

        const notification = new Notification({
            title: options.title || 'MediaFlow',
            body: options.body || '',
            icon: iconPath,
            silent: options.silent ?? false
        });
        notification.show();
        return { success: true };
    });

    /**
     * 打开模型存储目录
     */
    ipcMain.on('system:openModelsDir', () => {
        const dir = modelManager.getModelsDir();
        if (fs.existsSync(dir)) {
            shell.openPath(dir);
        }
    });
    // ==================== Smart Cleanup (智能清理) ====================

    /**
     * 计算目录大小 (递归)
     */
    async function getDirSize(dirPath) {
        let size = 0;
        try {
            const fs = require('fs').promises;
            const files = await fs.readdir(dirPath, { withFileTypes: true });

            for (const file of files) {
                const filePath = path.join(dirPath, file.name);
                if (file.isDirectory()) {
                    size += await getDirSize(filePath);
                } else {
                    size += (await fs.stat(filePath)).size;
                }
            }
        } catch {
            // Ignore errors (e.g. permission denied)
        }
        return size;
    }

    /**
     * 获取存储占用统计
     */
    ipcMain.handle('system:getStorageStats', async () => {
        const stats = {
            temp: 0,
            cache: 0,
            logs: 0,
            total: 0,
            isPartial: false // 标记是否为部分统计结果（超时导致）
        };

        try {
            const fs = require('fs').promises;
            const tempDir = app.getPath('temp');
            const userDataDir = app.getPath('userData');
            const logsDir = path.join(userDataDir, 'logs');

            // 1. Temp Files (限时 2.5 秒扫描，余下 0.5 秒处理其它项)
            const startTime = Date.now();
            const SCAN_TIMEOUT = 2500;
            const prefixes = ['mediaflow_', 'temp_seg_', 'concat_list_', 'temp_pcm_', 'temp_sub_'];

            try {
                const tempFiles = await fs.readdir(tempDir);
                for (const file of tempFiles) {
                    if (Date.now() - startTime > SCAN_TIMEOUT) {
                        stats.isPartial = true;
                        break;
                    }

                    if (prefixes.some(p => file.startsWith(p))) {
                        const filePath = path.join(tempDir, file);
                        try {
                            const fstat = await fs.stat(filePath);
                            stats.temp += fstat.size;
                        } catch {
                            // Ignore files that disappear during temp scan.
                        }
                    }
                }
            } catch (e) {
                console.warn('[System] Temp scan failed:', e.message);
            }

            // 2. Logs
            if (require('fs').existsSync(logsDir)) {
                stats.logs = await getDirSize(logsDir);
            }

            stats.total = stats.temp + stats.cache + stats.logs;
            return { success: true, stats };

        } catch (error) {
            console.error('[System] Failed to get storage stats:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 执行清理
     */
    ipcMain.handle('system:cleanup', async () => {
        debugLog('[System] Starting cleanup...');
        const results = {
            tempFiles: 0,
            logsCleared: false,
            cacheCleared: false,
            processesKilled: 0
        };

        try {
            // 0. Kill all running processes managed by queue
            const status = processQueue.getStatus();
            processQueue.killAll();
            results.processesKilled = status.running;

            const fs = require('fs').promises;
            const tempDir = app.getPath('temp');
            const userDataDir = app.getPath('userData');
            const logsDir = path.join(userDataDir, 'logs');

            // 1. Clean Temp Files
            const tempFiles = await fs.readdir(tempDir);
            for (const file of tempFiles) {
                if (file.startsWith('temp_pcm_') || file.startsWith('mediaflow_') || file.startsWith('temp_seg_')) {
                    const filePath = path.join(tempDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        if (stats.isDirectory()) {
                            await fs.rm(filePath, { recursive: true, force: true });
                        } else {
                            await fs.unlink(filePath);
                        }
                        results.tempFiles++;
                    } catch (e) {
                        console.warn(`[System] Failed to delete temp entry ${file}:`, e.message);
                    }
                }
            }

            // 2. Clean Logs (Delete all files in logs dir)
            if (require('fs').existsSync(logsDir)) {
                try {
                    const logFiles = await fs.readdir(logsDir);
                    for (const file of logFiles) {
                        await fs.unlink(path.join(logsDir, file));
                    }
                    results.logsCleared = true;
                } catch (e) {
                    console.warn('[System] Failed to clear logs:', e.message);
                }
            }

            // 3. Clean YT-DLP Cache
            try {
                const { getYtDlpPath } = require('../utils/binaries');
                const { exec } = require('child_process');

                const ytDlpPath = getYtDlpPath();
                if (ytDlpPath) {
                    await new Promise((resolve) => {
                        exec(`"${ytDlpPath}" --rm-cache-dir`, (err) => {
                            if (err) {
                                if (!isTestEnv) {
                                    console.warn('[System] yt-dlp cache clear warning:', err.message);
                                }
                            } else {
                                results.cacheCleared = true;
                            }
                            resolve();
                        });
                    });
                }
            } catch (e) {
                if (!isTestEnv) {
                    console.warn('[System] Failed to clear yt-dlp cache:', e.message);
                }
            }

            debugLog('[System] Cleanup completed:', results);
            return { success: true, results };

        } catch (error) {
            console.error('[System] Cleanup failed:', error);
            return { success: false, error: error.message };
        }
    });

    // internal:cleanup 已移除（空 handler，无实际用途）


    // ==================== Internationalization (i18n) ====================
    ipcMain.handle('i18n:readLocale', async (event, lang) => {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        
        let localesDir;
        const appPath = app.getAppPath();
        
        // 🚀 Robust path resolution for both Dev and Packaged (ASAR)
        // If running from source (Dev), __dirname is something like '.../src/handlers'
        // If packaged, it is inside 'app.asar/src/handlers'
        
        const possiblePaths = [
            path.join(__dirname, '..', 'locales'),
            path.join(appPath, 'src', 'locales'),
            path.join(appPath, 'locales')
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                localesDir = p;
                break;
            }
        }

        if (!localesDir) {
            console.error(`[i18n:readLocale] CRITICAL: Could not find locales directory in any of: ${possiblePaths.join(', ')}`);
            return {};
        }

        const langDir = path.join(localesDir, lang);
        console.log(`[i18n:readLocale] Requesting: ${lang}, Dir: ${langDir}`);

        try {
            if (fs.existsSync(langDir)) {
                const data = readLocaleDirSync(langDir, fs, path);
                console.log(`[i18n:readLocale] Success: ${lang}, Keys: ${Object.keys(data).length}`);
                return data;
            } else {
                throw new Error(`Directory ${langDir} does not exist`);
            }
        } catch (err) {
            console.warn(`[i18n:readLocale] Locale dir error for ${lang}: ${err.message}. Falling back to en-US.`);
            
            if (lang !== 'en-US') {
                const fallbackDir = path.join(localesDir, 'en-US');
                try {
                    if (fs.existsSync(fallbackDir)) {
                        return readLocaleDirSync(fallbackDir, fs, path);
                    }
                } catch (fallbackErr) {
                    console.error(`[i18n:readLocale] CRITICAL: Fallback failed: ${fallbackErr.message}`);
                }
            }
            return {};
        }
    });

    // ==================== Logger (日志转发) ====================
    ipcMain.handle('system:reportError', async (event, data = {}) => {
        const logger = require('../utils/logger');

        try {
            const reportData = data && typeof data === 'object' ? data : { message: String(data || '') };
            const result = await logger.reportToGoogleSheets(reportData);

            if (!result.success) {
                logger.warn(`[SystemHandler] Error report submission failed: ${result.error || 'Unknown error'}`);
            }

            return result;
        } catch (error) {
            logger.error(`[SystemHandler] system:reportError failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('log:info', (event, msg) => {
        const logger = require('../utils/logger');
        logger.info(`[Renderer] ${msg}`);
    });

    ipcMain.on('log:warn', (event, msg) => {
        const logger = require('../utils/logger');
        logger.warn(`[Renderer] ${msg}`);
    });

    ipcMain.on('log:error', (event, msg) => {
        const logger = require('../utils/logger');
        logger.error(`[Renderer] ${msg}`);
    });

    ipcMain.on('log:ffmpeg', (event, cmd, stderr) => {
        const logger = require('../utils/logger');
        logger.ffmpeg(cmd, stderr);
    });
};



/**
 * Helper to read all JSONs in a directory and merge them (Synchronous for ASAR reliability)
 */
function readLocaleDirSync(dir, fs, path) {
    let translations = {};
    const files = fs.readdirSync(dir);

    for (const file of files) {
        if (file.endsWith('.json')) {
            const filePath = path.join(dir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
                const json = JSON.parse(content);

                // Robust deep merge logic
                const deepMerge = (target, source) => {
                    if (!target || typeof target !== 'object') return source; // Safety: If target is not an object, just use source

                    for (const key in source) {
                        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                            // If source[key] is an object, ensure target[key] is also an object
                            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                                target[key] = {};
                            }
                            deepMerge(target[key], source[key]);
                        } else {
                            target[key] = source[key];
                        }
                    }
                    return target;
                };

                deepMerge(translations, json);
            } catch (e) {
                console.error(`[i18n] Error reading ${file}:`, e);
            }
        }
    }
    return translations;
}


/**
 * 独立的清理函数 (供 main.js 直接调用)
 */
const performCleanup = async () => {
    const logger = require('../utils/logger');
    logger.info('[System] Performing auto-cleanup on exit...');
    try {
        // 0. Kill all tracked subprocesses immediately
        processQueue.killAll();

        // 0.1 Kill backend engines
        try {
            const whisperEngine = require('../../services/scribe/LocalWhisperEngine');
            whisperEngine.killAll();
        } catch {
            // Optional engine may not be available in this runtime.
        }

        try {
            const engineManager = require('../services/enhance/EngineManager');
            engineManager.cancelAll();
        } catch {
            // Optional engine may not be available in this runtime.
        }

        const fsPromises = require('fs').promises;
        const { app } = require('electron');
        const path = require('path');
        const tempDir = app.getPath('temp');
        const userDataDir = app.getPath('userData');

        // 1. Clean Temp Files (Specific app prefixes)
        try {
            const tempFiles = await fsPromises.readdir(tempDir);
            for (const file of tempFiles) {
                if (file.startsWith('temp_pcm_') || file.startsWith('mediaflow_') || file.startsWith('temp_seg_') || file.startsWith('ffmpeg_filter_')) {
                    const filePath = path.join(tempDir, file);
                    const stats = await fsPromises.stat(filePath).catch(() => null);
                    if (!stats) continue;

                    if (stats.isDirectory()) {
                        await fsPromises.rm(filePath, { recursive: true, force: true }).catch(() => { });
                    } else {
                        await fsPromises.unlink(filePath).catch(() => { });
                    }
                }
            }
        } catch {
            // Ignore temp cleanup errors during auto-cleanup.
        }

        // 2. Smart Log Cleanup (Keep for 7 days)
        const logsDir = path.join(userDataDir, 'logs');
        try {
            if (fs.existsSync(logsDir)) {
                const logFiles = await fsPromises.readdir(logsDir);
                const now = Date.now();
                const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

                for (const file of logFiles) {
                    const filePath = path.join(logsDir, file);
                    const stats = await fsPromises.stat(filePath);
                    if (now - stats.mtimeMs > MAX_AGE) {
                        await fsPromises.unlink(filePath).catch(() => { });
                    }
                }
            }
        } catch {
            // Ignore log cleanup errors during auto-cleanup.
        }

        logger.info('[System] Cleanup finished.');
    } catch (e) {
        if (typeof logger !== 'undefined') logger.error(`[System] Auto-cleanup error: ${e.message}`);
        else console.error('[System] Auto-cleanup error:', e);
    }
};

module.exports = { setupSystemHandlers, performCleanup };
