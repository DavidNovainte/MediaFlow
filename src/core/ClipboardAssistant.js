/**
 * ClipboardAssistant.js
 */
console.log('[ClipboardAssistant] Script started');
class ClipboardAssistant {
    constructor(app) {
        this.app = app;
        this._lastPastedContent = null;
    }

    /**
     * 检测剪贴板内容，自动切换模式并粘贴
     */
    async checkClipboard() {
        if (this.app.router.currentPage !== 'download') return;

        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim() || this._lastPastedContent === text) return;

            const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);
            const urls = lines.filter(l => /^(https?:\/\/)/i.test(l));
            if (urls.length === 0) return;

            const singleInput = document.getElementById('video-url');
            const batchInput = document.getElementById('batch-urls');

            if (urls.length === 1 && singleInput && !singleInput.value.trim()) {
                this.app.router.switchMode('single');
                singleInput.value = urls[0];
                singleInput.dispatchEvent(new Event('input'));
                this._lastPastedContent = text;
                this.app.showToast(window.i18n?.t('download.pasteSuccess') || 'Link detected, automatically filled in', 'success');
                setTimeout(() => document.getElementById('btn-check')?.click(), 500);
            } else if (urls.length > 1 && batchInput && !batchInput.value.trim()) {
                this.app.router.switchMode('batch');
                batchInput.value = urls.join('\n');
                batchInput.dispatchEvent(new Event('input'));
                this._lastPastedContent = text;
                this.app.showToast(window.i18n?.t('download.multiUrlDetected') || `Detected ${urls.length} links, switched to batch mode`, 'success');
            }
        } catch {
            console.debug('[Clipboard Assistant] Check failed');
        }
    }
}

window.ClipboardAssistant = ClipboardAssistant;
