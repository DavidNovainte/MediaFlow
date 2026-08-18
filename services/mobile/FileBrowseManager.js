/**
 * MediaFlow - FileBrowseManager
 * 手机互联 - 文件浏览与安全管理
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const archiver = require('archiver');

class FileBrowseManager {
    constructor() {
        // 允许的根目录白名单 (初始化)
        this.allowedRoots = [];
        this.initAllowedRoots();
    }

    /**
     * 初始化允许访问的目录
     */
    initAllowedRoots() {
        const roots = [
            path.join(os.homedir(), 'Downloads', 'MediaFlow'),
            path.join(os.homedir(), 'Pictures'),
            path.join(os.homedir(), 'Videos'),
            path.join(os.homedir(), 'Desktop'),
            path.join(os.homedir(), 'Documents')
        ];

        // 同步检测常见盘符作为初始白名单
        if (process.platform === 'win32') {
            ['C:', 'D:', 'E:', 'F:', 'G:', 'H:', 'I:'].forEach(d => {
                const drivePath = d + '\\';
                if (fs.existsSync(drivePath)) {
                    roots.push(drivePath);
                }
            });
        } else {
            roots.push('/');
        }

        this.allowedRoots = roots.map(r => path.normalize(r));
        console.log('[FileBrowse] Allowed roots initialized:', this.allowedRoots.length);
    }

    /**
     * 获取可用驱动器 (Windows)
     */
    getAvailableDrives() {
        return new Promise((resolve) => {
            if (process.platform !== 'win32') return resolve([]);

            exec('wmic logicaldisk get name,volumename', (error, stdout) => {
                const drives = [];
                if (!error && stdout) {
                    const lines = stdout.split('\n').slice(1);
                    lines.forEach(line => {
                        const name = line.trim().split(/\s+/)[0];
                        if (name && name.includes(':')) {
                            const drivePath = name + '\\';
                            drives.push({
                                name: line.trim() || name,
                                path: drivePath
                            });
                        }
                    });
                }

                // 保底机制：如果 wmic 失败，尝试常用盘符
                if (drives.length === 0) {
                    ['C:', 'D:', 'E:', 'F:'].forEach(d => {
                        if (fs.existsSync(d + '\\')) {
                            drives.push({ name: `Local Disk (${d})`, path: d + '\\' });
                        }
                    });
                }
                resolve(drives);
            });
        });
    }

    /**
     * 注册文件/目录并返回 ID
     */
    registerFile(filePath) {
        if (!filePath) return 'ROOT';
        // 使用 base64url 编码路径作为 ID
        return Buffer.from(path.normalize(filePath)).toString('base64url');
    }

    /**
     * 根据 ID 获取文件路径 (带安全验证)
     */
    getFilePathById(fileId) {
        if (!fileId || fileId === 'ROOT') return null;
        try {
            const filePath = Buffer.from(fileId, 'base64url').toString('utf8');
            const normalizedPath = path.normalize(filePath);

            // 1. 白名单校验 (只要在允许的根目录下即可)
            const isAllowed = this.allowedRoots.some(root =>
                normalizedPath.toLowerCase().startsWith(root.toLowerCase())
            );

            if (!isAllowed) {
                console.warn('[Security] Path access denied:', normalizedPath);
                return null;
            }

            // 2. 黑名单校验 (系统关键目录即便在盘符下也要拦截)
            const blockedPaths = os.platform() === 'win32' ? [
                'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
                'C:\\ProgramData', 'C:\\System Volume Information', 'C:\\$Recycle.Bin',
                'C:\\Recovery'
            ] : [
                '/etc', '/usr', '/bin', '/sbin', '/var', '/root', '/boot'
            ];

            const normalizedLower = normalizedPath.toLowerCase();
            const isBlocked = blockedPaths.some(blocked =>
                normalizedLower.startsWith(blocked.toLowerCase())
            );

            if (isBlocked) {
                console.warn('[Security] System path blocked:', normalizedPath);
                return null;
            }

            return normalizedPath;
        } catch {
            return null;
        }
    }

    /**
     * 挂载文件浏览路由
     */
    mountRoutes(app) {
        // 获取共享根目录
        app.get('/api/files/roots', async (req, res) => {
            const drives = await this.getAvailableDrives();
            const favorites = [
                { name: 'MediaFlow Downloads', path: path.join(os.homedir(), 'Downloads', 'MediaFlow') },
                { name: 'Pictures', path: path.join(os.homedir(), 'Pictures') },
                { name: 'Videos', path: path.join(os.homedir(), 'Videos') },
                { name: 'Desktop', path: path.join(os.homedir(), 'Desktop') }
            ];

            const roots = [...favorites, ...drives];
            const validRoots = roots.filter(r => fs.existsSync(r.path)).map(r => ({
                name: r.name,
                id: this.registerFile(r.path)
            }));
            res.json({ success: true, roots: validRoots });
        });

        // 浏览文件夹内容
        app.get('/api/files/browse', async (req, res) => {
            const { id } = req.query;
            let targetPath;

            if (!id || id === 'ROOT' || id === 'undefined' || id === 'null') {
                // 默认 Hub 视图
                const drives = await this.getAvailableDrives();
                const favorites = [
                    { name: 'MediaFlow Downloads', path: path.join(os.homedir(), 'Downloads', 'MediaFlow') },
                    { name: 'Pictures', path: path.join(os.homedir(), 'Pictures') },
                    { name: 'Videos', path: path.join(os.homedir(), 'Videos') },
                    { name: 'Desktop', path: path.join(os.homedir(), 'Desktop') }
                ];

                const items = [...favorites, ...drives].filter(f => fs.existsSync(f.path)).map(f => ({
                    name: f.name, id: this.registerFile(f.path), isDir: true, size: 0, ext: ''
                }));

                return res.json({ success: true, path: 'ROOT', parent: null, items });
            }

            targetPath = this.getFilePathById(id);
            if (!targetPath || !fs.existsSync(targetPath)) {
                return res.status(404).json({ success: false, error: 'Path not found' });
            }

            try {
                const stats = fs.statSync(targetPath);
                if (!stats.isDirectory()) {
                    return res.status(400).json({ success: false, error: 'Not a directory' });
                }

                const hiddenFiles = ['$recycle.bin', 'system volume information', 'recovery', 'config.msi', 'windows', 'program files'];
                const items = fs.readdirSync(targetPath).map(name => {
                    if (name.startsWith('$') || name.startsWith('.') || hiddenFiles.includes(name.toLowerCase())) return null;
                    const itemPath = path.join(targetPath, name);
                    try {
                        const s = fs.statSync(itemPath);
                        return {
                            name, id: this.registerFile(itemPath), isDir: s.isDirectory(),
                            size: s.size, mtime: s.mtime, ext: path.extname(name).toLowerCase()
                        };
                    } catch (e) { return null; }
                }).filter(Boolean);

                items.sort((a, b) => {
                    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

                const parentPath = path.dirname(targetPath);
                // 判断是否已经到了盘符根目录
                const isDriveRoot = process.platform === 'win32' ? /^[a-zA-Z]:\\$/.test(targetPath) : targetPath === '/';
                const parentId = isDriveRoot ? 'ROOT' : this.registerFile(parentPath);

                // 脱敏处理：不向前端返回真实物理路径
                res.json({ success: true, path: path.basename(targetPath) || targetPath, parent: parentId, items });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 文件夹打包下载
        app.get('/api/download-folder-zip/:id', (req, res) => {
            const { id } = req.params;
            const targetPath = this.getFilePathById(id);

            if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
                return res.status(404).send('Folder not found');
            }

            const archive = archiver('zip', { zlib: { level: 5 } });
            res.attachment(`${path.basename(targetPath) || 'folder'}.zip`);
            archive.on('error', (err) => res.status(500).send({ error: err.message }));
            archive.pipe(res);
            archive.directory(targetPath, false);
            archive.finalize();
        });
    }
}

module.exports = new FileBrowseManager();
