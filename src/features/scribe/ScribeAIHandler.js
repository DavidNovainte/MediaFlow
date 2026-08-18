/**
 * ScribeAIHandler.js
 * 负责 ScribeFlow 的 AI 增强功能 (润色与总结)
 */
class ScribeAIHandler {
    constructor(scribeflow) {
        this.app = scribeflow;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async polishSubtitles() {
        if (!this.app.segments?.length) return window.app?.showToast(window.i18n?.t('common.transcribe.noSubtitlesToPolish') || 'No subtitles to polish', 'warning');

        const btn = document.getElementById('btn-polish-text');
        if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner-small"></span> ${window.i18n ? window.i18n.t('common.transcribe.polishingState') : 'Polishing...'}`; }

        try {
            const provider = document.getElementById('batch-translate-provider-select')?.value || 'openai';
            const { apiKey } = await window.ScribeService.getApiKey(provider);

            const result = await window.ScribeService.polish(this.app.segments, { provider, apiKey });

            if (result.success) {
                this.app.polishedSegments = JSON.parse(JSON.stringify(result.segments));
                this.app.uiManager.switchVersion?.('polished') || this.app.uiManager.render('polished');
                window.app?.showToast(window.i18n ? window.i18n.t('common.transcribe.polishSuccess') : 'AI Polish complete!', 'success');
            } else {
                throw new Error(result.error || 'Polish failed');
            }
        } catch (error) {
            console.error('[ScribeAIHandler] Polish error:', error);
            window.app?.showToast((window.i18n?.t('common.transcribe.polishFailed') || 'Polish failed:') + ' ' + error.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = `<span data-i18n="transcribe.polish">${window.i18n ? window.i18n.t('common.transcribe.polish') : '✨ AI Polish'}</span>`; }
        }
    }

    async summarizeSubtitles() {
        if (!this.app.segments?.length) return window.app?.showToast(window.i18n?.t('common.transcribe.noContentToSummarize') || 'No content to summarize', 'warning');

        const drawer = document.getElementById('summary-drawer');
        const contentEl = document.getElementById('summary-content');
        if (!drawer || !contentEl) return;

        drawer.classList.add('open');
        contentEl.innerHTML = `<div class="loading-container" style="text-align:center; padding:40px;"><div class="spinner-small"></div><p>${window.i18n ? window.i18n.t('common.transcribe.analyzingState') : 'Analyzing...'}</p></div>`;

        try {
            const provider = document.getElementById('batch-translate-provider-select')?.value || 'openai';
            const { apiKey } = await window.ScribeService.getApiKey(provider);
            const langCode = window.i18n?.currentLang || 'en';
            const langName = window.ScribeService?.getLanguageName(langCode) || langCode;
            const result = await window.ScribeService.summarize(this.app.segments, {
                provider, apiKey,
                appLang: langCode,
                language: langCode,
                targetLang: langCode,
                langName: langName
            });

            if (result.success) {
                this.app.currentSummary = result.summary;
                contentEl.innerHTML = `<div style="padding:10px 20px;">${this._formatSummary(result.summary)}</div>`;
            } else {
                throw new Error(result.error || 'Operation failed');
            }
        } catch (error) {
            console.error('[ScribeAIHandler] Summary error:', error);
            const title = this.escapeHtml(window.i18n?.t('common.transcribe.summarizeFailed') || 'Analysis failed');
            const message = this.escapeHtml(error.message);
            contentEl.innerHTML = `<div style="color:var(--error); padding:20px;">${title}: ${message}</div>`;
        }
    }

    _formatSummary(text) {
        return this.escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^\s*### (.+)$/gm, '<h4 class="summary-section-title">$1</h4>')
            .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>(?:.*?\n?)*?<\/li>)/g, '<ul class="summary-bullet-list">$1</ul>')
            .replace(/\n\n/g, '<br>').replace(/\n/g, '<br>');
    }
}

window.ScribeAIHandler = ScribeAIHandler;
