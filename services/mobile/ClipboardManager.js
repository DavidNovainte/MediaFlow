/**
 * ClipboardManager.js
 * 负责移动端与 PC 端的剪贴板同步交互
 */
const { clipboard } = require('electron');

class ClipboardManager {
    constructor() {
    }

    /**
     * 挂载路由
     * @param {Object} app Express 实例
     */
    mountRoutes(app) {
        // 获取 PC 剪贴板内容
        app.get('/api/clipboard', (req, res) => {
            try {
                const text = clipboard.readText();
                res.json({ success: true, text: text || '' });
            } catch (error) {
                console.error('[MobileFlow] Read clipboard failed:', error);
                res.status(500).json({ success: false, error: '读取剪贴板失败' });
            }
        });

        // 写入 PC 剪贴板内容
        app.post('/api/clipboard', (req, res) => {
            try {
                const { text } = req.body;
                if (typeof text !== 'string') {
                    return res.status(400).json({ success: false, error: '无效的内容' });
                }

                clipboard.writeText(text);
                console.log('[MobileFlow] Clipboard updated from mobile');
                res.json({ success: true });
            } catch (error) {
                console.error('[MobileFlow] Write clipboard failed:', error);
                res.status(500).json({ success: false, error: '写入剪贴板失败' });
            }
        });
    }
}

module.exports = new ClipboardManager();
