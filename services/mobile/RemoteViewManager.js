/**
 * MediaFlow - RemoteViewManager
 * 手机互联 - 模版渲染与二维码生成
 */

const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

class RemoteViewManager {
    constructor() { }

    /**
     * 生成遥控页面二维码
     */
    async getRemoteQRCode(port, ip) {
        const url = `http://${ip}:${port}/remote`;
        try {
            const qrDataUrl = await QRCode.toDataURL(url, {
                width: 256, margin: 2,
                color: { dark: '#6366f1', light: '#ffffff' }
            });
            return { success: true, qrCode: qrDataUrl, url };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 生成文件下载二维码
     */
    async getFileQRCode(port, ip, filePath, fileBrowseManager) {
        const fileId = fileBrowseManager.registerFile(filePath);
        const baseUrl = `http://${ip}:${port}`;
        const filePageUrl = `${baseUrl}/file/${fileId}`;

        try {
            const qrDataUrl = await QRCode.toDataURL(filePageUrl, {
                width: 256, margin: 2,
                color: { dark: '#22c55e', light: '#ffffff' }
            });
            return {
                success: true, qrCode: qrDataUrl, filePageUrl,
                downloadUrl: `${baseUrl}/download/${fileId}`,
                streamUrl: `${baseUrl}/stream/${fileId}`,
                fileName: path.basename(filePath)
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 渲染文件预览页面 HTML
     */
    renderFilePage(fileId, fileBrowseManager) {
        const filePath = fileBrowseManager.getFilePathById(fileId);
        if (!filePath) return '文件不存在';

        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(ext);
        const isAudio = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext);

        const parentPath = path.dirname(filePath);
        const parentId = fileBrowseManager.registerFile(parentPath);

        // [i18n] 获取语言包
        const Store = require('electron-store');
        const store = new Store();
        const lang = store.get('language') || 'zh-CN';

        const loadLocale = (l) => {
            try {
                const p = path.join(__dirname, '..', '..', 'src', 'locales', l, 'mobile.json');
                return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
            } catch (e) { return {}; }
        };

        const mergedData = {
            mobile: {
                ...(loadLocale('zh-CN').mobile || {}),
                ...(lang !== 'zh-CN' ? loadLocale(lang).mobile || {} : {})
            }
        };
        const translations = this.flattenTranslations(mergedData);

        let mediaElement = '';
        if (isVideo) {
            mediaElement = `<div class="video-container"><video controls autoplay playsinline class="media-player" id="mainPlayer"><source src="/stream-compatible/${fileId}" type="video/mp4"></video><div class="compatible-mode"><button onclick="switchMode()" class="btn-text">{{mobile.preview.switchOriginal}}</button></div></div>`;
        } else if (isAudio) {
            mediaElement = `<audio controls autoplay class="media-player audio"><source src="/stream/${fileId}" type="audio/mpeg"></audio>`;
        } else if (isImage) {
            mediaElement = `<div class="image-container"><img src="/stream/${fileId}" class="media-player" alt="${fileName}"></div>`;
        } else {
            mediaElement = `<div class="file-icon">📄</div>`;
        }

        const templatePath = path.join(__dirname, '..', 'templates', 'mobile_preview.html');
        try {
            let html = fs.readFileSync(templatePath, 'utf-8');
            html = html.replaceAll('{{fileName}}', fileName)
                .replaceAll('{{fileId}}', fileId)
                .replaceAll('{{mediaElement}}', mediaElement)
                .replaceAll('{{mimeType}}', 'video/mp4')
                .replaceAll('{{parentId}}', parentId);

            // 批量替换 {{key}} 占位符
            for (const [key, value] of Object.entries(translations)) {
                html = html.replaceAll(`{{${key}}}`, value);
            }
            return html;
        } catch (e) {
            return `<h1>Error Loading Template</h1><p>${e.message}</p>`;
        }
    }

    /**
     * 辅助函数：将嵌套对象扁平化为带点的键，方便替换模板
     */
    flattenTranslations(obj, prefix = '') {
        let results = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(results, this.flattenTranslations(value, newKey));
            } else {
                results[newKey] = value;
            }
        }
        return results;
    }

    /**
     * 渲染遥控器主页面 HTML
     */
    renderRemotePage() {
        const templatePath = path.join(__dirname, '..', 'templates', 'mobile_remote.html');
        try {
            let html = fs.readFileSync(templatePath, 'utf-8');

            // [i18n] 获取当前系统语言
            const Store = require('electron-store');
            const store = new Store();
            const lang = store.get('language') || 'zh-CN';

            /**
             * 安全获取语言包
             * 优先加载 zh-CN 作为底包，然后再用当前语言覆盖
             */
            const loadLocale = (l, fileName) => {
                try {
                    const localePath = path.join(__dirname, '..', '..', 'src', 'locales', l, `${fileName}.json`);
                    if (fs.existsSync(localePath)) {
                        return JSON.parse(fs.readFileSync(localePath, 'utf-8'));
                    }
                } catch (e) { console.warn(`[RemoteView] Failed to load locale ${l}/${fileName}:`, e); }
                return {};
            };

            const zhMobile = loadLocale('zh-CN', 'mobile');
            const targetMobile = lang !== 'zh-CN' ? loadLocale(lang, 'mobile') : {};

            const zhCommon = loadLocale('zh-CN', 'common');
            const targetCommon = lang !== 'zh-CN' ? loadLocale(lang, 'common') : {};

            // 合并语言包
            const mergedData = {
                mobile: {
                    ...(zhMobile.mobile || {}),
                    ...(targetMobile.mobile || {})
                },
                common: {
                    ...(zhCommon.common || {}),
                    ...(targetCommon.common || {})
                }
            };

            // 扁平化翻译字典
            const translations = this.flattenTranslations(mergedData);

            // 批量替换 {{key}} 占位符
            for (const [key, value] of Object.entries(translations)) {
                html = html.replaceAll(`{{${key}}}`, value);
            }

            return html;
        } catch (e) {
            console.error('[RemoteView] Render failed:', e);
            return `<h1>Error Loading Template</h1><p>${e.message}</p>`;
        }
    }

    /**
     * 挂载渲染路由 (无需认证)
     */
    mountRoutes(app, fileBrowseManager) {
        app.get('/remote', (req, res) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.send(this.renderRemotePage());
        });

        app.get('/file/:fileId', (req, res) => {
            res.send(this.renderFilePage(req.params.fileId, fileBrowseManager));
        });

        app.get('/', (req, res) => res.redirect('/remote'));
    }
}

module.exports = new RemoteViewManager();
