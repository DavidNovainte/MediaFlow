/**
 * ScribeTranslator.js
 * 负责 ScribeFlow 的翻译功能
 */
class ScribeTranslator {
    constructor(scribeflow) {
        this.app = scribeflow;
        this.batchTranslations = {};
    }

    static LANG_FULL_NAMES = {
        'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
        'en-US': 'English', 'fr-FR': 'French', 'de-DE': 'German',
        'es-ES': 'Spanish', 'ja-JP': 'Japanese', 'ko-KR': 'Korean',
        'pt-PT': 'Portuguese', 'ru-RU': 'Russian',
        'zh': 'Simplified Chinese', 'en': 'English', 'ja': 'Japanese',
        'ko': 'Korean', 'fr': 'French', 'de': 'German',
        'es': 'Spanish', 'pt': 'Portuguese', 'ru': 'Russian'
    };

    static getLangName(code) {
        return ScribeTranslator.LANG_FULL_NAMES[code] || code;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async translateSegments(targetLang) {
        if (!this.app.segments?.length) return;

        const langName = ScribeTranslator.getLangName(targetLang);
        const BATCH_SIZE = 20;
        const MAX_RETRIES = 2;
        const segments = this.app.segments;
        const total = segments.length;

        const provider = document.getElementById('batch-translate-provider-select')?.value
            || document.getElementById('translation-engine')?.value
            || 'siliconflow';

        this.app.translations = segments.map(s => s.text);

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batchItems = segments.slice(i, i + BATCH_SIZE);
            const batchText = batchItems.map((s, idx) => `[${idx}]${s.text}`).join('\n');

            let result = null;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    result = await window.mediaflow?.translation.translate(batchText, langName, provider);
                    if (result?.success) break;
                } catch (e) {
                    const msg = (e.message || '').toLowerCase();
                    if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit')) {
                        window.app?.showToast(
                            window.i18n?.t('common.transcribe.rateLimitWarn') || '⚠️ Rate limit hit. Add more API keys in Settings.',
                            'warning', 6000
                        );
                        break;
                    }
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
                    }
                }
            }

            if (result?.success) {
                const lines = result.translation.split('\n');
                lines.forEach(line => {
                    const match = line.match(/^\[(\d+)\]\s*(.*)/);
                    if (match) {
                        const globalIdx = i + parseInt(match[1]);
                        if (globalIdx < total) {
                            this.app.translations[globalIdx] = match[2].trim() || segments[globalIdx].text;
                        }
                    }
                });
            }

            const done = Math.min(i + BATCH_SIZE, total);
            this.app.uiManager.updateProgress(
                80 + (done / total) * 18,
                `${window.i18n?.t('common.transcribe.translatingState') || 'Translating...'} ${done}/${total}`
            );
        }
    }

    async batchTranslate() {
        if (!this.app.segments?.length) return;
        const text = this.app.segments.map((s, i) => `[${i}]${s.text}`).join('\n');
        const checkedLangs = Array.from(document.querySelectorAll('.batch-translate-lang:checked'));
        const languages = checkedLangs.map(cb => cb.value);

        if (!languages.length) return window.app?.showToast(window.i18n?.t('common.transcribe.selectTargetLang') || 'Please select at least one target language', 'warning');
        
        const btn = document.getElementById('btn-batch-translate');
        const originalBtnHtml = btn ? btn.innerHTML : '';
        
        const updateBtnProgress = (progress) => {
            if (!btn) return;
            const langName = window.ScribeService.getLanguageName(progress.lang);
            const statusText = `${progress.current}/${progress.total} (${langName})`;
            const progressLabel = window.i18n?.t('common.transcribe.translatingBatch', { status: statusText })
                || `Translating ${statusText}...`;
            btn.innerHTML = `<span class="spinner-small"></span> ${progressLabel}`;
            
            if (this.app.uiManager?.updateProgress) {
                const percent = (progress.current / progress.total) * 100;
                this.app.uiManager.updateProgress(percent, progressLabel);
            }
        };

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-small"></span> ${window.i18n?.t('common.transcribe.translatingState') || 'Translating...'}`;
        }

        const progressCleanup = window.mediaflow?.transcribe?.onTranslateBatchProgress ? 
            window.mediaflow.transcribe.onTranslateBatchProgress((progress) => {
                updateBtnProgress(progress);
            }) : null;

        try {
            const provider = document.getElementById('batch-translate-provider-select')?.value || 'siliconflow';
            const { apiKey } = await window.ScribeService.getApiKey(provider);

            const result = await window.ScribeService.translateBatch(text, languages, {
                provider, 
                apiKey, 
                style: document.getElementById('batch-translate-style')?.value || 'balanced'
            });

            if (Object.keys(result.translations || {}).length > 0) {
                this.batchTranslations = result.translations;
                this.showBatchTranslationResults(result.translations);
                
                if (result.success) {
                    window.app?.showToast(
                        window.i18n?.t('common.transcribe.batchTranslatedSuccess', { count: Object.keys(result.translations).length })
                            || 'Translation complete!',
                        'success'
                    );
                } else {
                    const failLangs = result.errors.map(e => window.ScribeService.getLanguageName(e.lang)).join(', ');
                    const partialMsg = window.i18n?.t('common.transcribe.partialSuccess', {
                        done: Object.keys(result.translations).length,
                        total: languages.length,
                        langs: failLangs
                    }) || `Partial success (${Object.keys(result.translations).length}/${languages.length}). Failed languages: ${failLangs}`;
                    window.app?.showToast(partialMsg, 'warning', 6000);
                }
            } else {
                throw new Error(result.errors?.[0]?.error || 'Failed to get translation results for all languages');
            }
        } catch (error) {
            console.error('[ScribeTranslator] Batch translate error:', error);
            const msg = error.message || '';
            if (msg.includes('RATE_LIMIT_HIT') || msg.includes('429')) {
                window.app?.showToast(
                    window.i18n?.t('common.transcribe.rateLimitWarn') || '⚠️ Rate limit hit. Add more API keys in Settings.',
                    'warning', 8000
                );
            } else {
                window.app?.showToast((window.i18n?.t('common.transcribe.translateFail') || 'Translation failed') + ': ' + msg, 'error');
            }
        } finally {
            if (progressCleanup) progressCleanup();
            if (btn) { 
                btn.disabled = false; 
                btn.innerHTML = originalBtnHtml || ('<span data-i18n="transcribe.batchTranslate">' + (window.i18n?.t('transcribe.batchTranslate') || 'Batch translate') + '</span>');
            }
        }
    }

    showBatchTranslationResults(translations) {
        const container = document.getElementById('batch-translation-results');
        if (!container) return;
        container.classList.remove('hidden');

        const entries = Object.entries(translations || {});
        const copyLabel = this.escapeHtml(window.i18n?.t('common.transcribe.copy') || 'Copy Text');
        const downloadSrtLabel = this.escapeHtml(window.i18n?.t('common.transcribe.downloadSrt') || 'Download SRT');
        const downloadZipLabel = this.escapeHtml(window.i18n?.t('common.transcribe.downloadZip') || 'Download ZIP');

        const toolbar = entries.length > 1 ? `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
                <button class="btn btn-sm btn-accent" data-action="download-all-translations">${downloadZipLabel}</button>
            </div>` : '';

        const list = entries.map(([lang, text]) => {
            const safeLang = this.escapeHtml(lang);
            const safeLangName = this.escapeHtml(window.ScribeService?.getLanguageName?.(lang) || lang);
            const fullText = String(text ?? '').replace(/\[\d+\]/g, '').trim();
            const safeFullText = this.escapeHtml(fullText);
            return `
                <div class="translation-result-item" style="margin-bottom:12px; padding:12px; background:var(--bg-tertiary); border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong style="color:var(--accent-primary);">${safeLangName}</strong>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-sm btn-secondary" data-action="copy-translation" data-lang="${safeLang}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="margin-right:4px;">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>${copyLabel}
                            </button>
                            <button class="btn btn-sm" data-action="download-translation" data-lang="${safeLang}">${downloadSrtLabel}</button>
                        </div>
                    </div>
                    <div style="color:var(--text-secondary); font-size:12px; white-space:pre-wrap; max-height:300px; overflow-y:auto; padding-right:4px;">${safeFullText}</div>
                </div>`;
        }).join('');

        container.innerHTML = toolbar + list;
        this.bindBatchTranslationResultActions(container);
    }

    bindBatchTranslationResultActions(container) {
        if (this.batchTranslationResultContainer && this.batchTranslationResultClickHandler) {
            this.batchTranslationResultContainer.removeEventListener('click', this.batchTranslationResultClickHandler);
        }

        this.batchTranslationResultContainer = container;
        this.batchTranslationResultClickHandler = (event) => {
            const actionButton = event.target?.closest?.('[data-action]');
            if (!actionButton || !container.contains(actionButton)) return;

            const action = actionButton.dataset.action;
            const lang = actionButton.dataset.lang;

            if (action === 'download-all-translations') {
                this.downloadAllTranslationsZip();
            } else if (action === 'copy-translation' && lang) {
                this.copyTranslationText(lang);
            } else if (action === 'download-translation' && lang) {
                this.downloadTranslation(lang);
            }
        };
        container.addEventListener('click', this.batchTranslationResultClickHandler);
    }

    async copyTranslationText(lang) {
        const text = this.batchTranslations[lang];
        if (!text) return;

        const segments = this.app.segments || this.app.rawSegments;
        const formattedLines = segments.map((seg, i) => {
            const time = this._formatMMSSTime(seg.start);
            const regex = new RegExp(`\\[\\s*${i}\\s*\\]\\s*(.+?)(?=\\s*\\[\\s*\\d+\\s*\\]|$)`, 'is');
            const match = text.match(regex);
            const content = match ? match[1].trim() : (text.split('\n').find(l => l.trim().startsWith(`[${i}]`))?.replace(`[${i}]`, '').trim() || '');
            
            return `[${time}] ${content}`;
        });

        const finalContent = formattedLines.join('\n\n');
        try {
            await navigator.clipboard.writeText(finalContent);
            window.app?.showToast(window.i18n?.t('common.scribe.copiedToClipboard') || 'Copied to clipboard', 'success');
        } catch {
            window.app?.showToast(window.i18n?.t('common.error') || 'Copy failed', 'error');
        }
    }

    downloadTranslation(lang) {
        const content = this._generateSRT(lang);
        if (content) this.app.exporter.downloadFile(content, `transcript_${lang}.srt`, 'text/srt');
    }

    async downloadAllTranslationsZip() {
        const files = Object.keys(this.batchTranslations).map(lang => ({
            name: `transcript_${lang}.srt`, content: this._generateSRT(lang)
        })).filter(f => f.content);

        if (!files.length) return;
        const res = await window.mediaflow?.transcribe.exportZip(files);
        if (res?.success) window.app?.showToast(window.i18n?.t('common.transcribe.packSuccess') || 'Packaged successfully', 'success');
    }

    _generateSRT(lang) {
        let text = this.batchTranslations[lang];
        if (!text) return null;
        
        text = text.replace(/以下是.*[:：]\n?/g, '').trim();

        return this.app.segments.map((seg, i) => {
            const start = this._formatSRTTime(seg.start), end = this._formatSRTTime(seg.end || seg.start + 5);
            const regex = new RegExp(`\\[\\s*${i}\\s*\\]\\s*(.+?)(?=\\s*\\[\\s*\\d+\\s*\\]|$)`, 'is');
            const match = text.match(regex);
            
            let content = match ? match[1].trim() : null;
            if (!content) {
                const lines = text.split('\n');
                const targetLine = lines.find(l => l.trim().startsWith(`[${i}]`));
                if (targetLine) content = targetLine.replace(`[${i}]`, '').trim();
            }
            
            return `${i + 1}\n${start} --> ${end}\n${content || seg.text}\n`;
        }).join('\n');
    }

    _formatMMSSTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    _formatSRTTime(s) {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }
}

window.ScribeTranslator = ScribeTranslator;
