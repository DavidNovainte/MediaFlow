/**
 * ScribeTranscriber.js
 * 负责 ScribeFlow 的核心转录流程调度 (Batch Loop)
 */
class ScribeTranscriber {
    constructor(scribeflow) {
        this.app = scribeflow;
        this.isProcessing = false;
        this._cancelRequested = false;
    }

    async startTranscribe() {
        if (this.app.audioFiles.length === 0 || this.isProcessing) return;
        this.isProcessing = true;
        this._cancelRequested = false;
        this.app.isProcessing = true;
        this.app.uiManager.showTranscribingState();

        try {
            const options = this._getOptionsFromUI();

            // 如果是云端模式，获取 API Key
            if (options.mode !== 'local') {
                try {
                    const { apiKey } = await window.ScribeService.getApiKey(options.provider);
                    options.apiKey = apiKey;
                } catch (e) {
                    window.app?.showToast(e.message, 'error');
                    this.isProcessing = false;
                    this.app.isProcessing = false;
                    this.app.uiManager.resetUI?.();
                    // keep files: only hide progress
                    document.getElementById('transcribe-progress')?.classList.add('hidden');
                    document.getElementById('transcribe-options')?.classList.remove('hidden');
                    return;
                }
            }

            const results = [];
            const total = this.app.audioFiles.length;

            for (let i = 0; i < total; i++) {
                if (this._cancelRequested) break;

                const file = this.app.audioFiles[i];
                const baseProgress = (i / total) * 100;
                const processingText = window.i18n?.t('common.status.processing') || 'Processing';
                this.app.uiManager.updateProgress(baseProgress, `${processingText} (${i + 1}/${total}): ${file.name}`);

                const callback = (p) => {
                    if (this._cancelRequested) return;
                    // Object progress: lazy diarization model download / diarize phase
                    if (p && typeof p === 'object' && p.kind === 'diarize_model') {
                        const msg = p.message
                            || window.i18n?.t('transcribe.sherpaDownloading')
                            || '下载说话人模型…';
                        const pct = typeof p.percent === 'number'
                            ? baseProgress + (p.percent / 100) * (100 / total) * 0.15
                            : baseProgress;
                        this.app.uiManager.updateProgress(pct, `(${i + 1}/${total}) ${msg}`);
                        return;
                    }
                    const num = typeof p === 'number' ? p : 0;
                    const current = baseProgress + (num / 100) * (100 / total) * 0.8;
                    const statusText = options.mode === 'local' ?
                        (window.i18n ? window.i18n.t('common.scribe.localTranscribing') : 'Local Transcribing') :
                        (window.i18n ? window.i18n.t('common.scribe.cloudProcessing') : 'Cloud Processing');
                    this.app.uiManager.updateProgress(current, `(${i + 1}/${total}) ${statusText}: ${file.name}`);
                };

                const result = await window.ScribeService.transcribe(file.path, options, callback);

                if (this._cancelRequested || result?.cancelled || /CANCELLED_BY_USER/i.test(result?.error || '')) {
                    break;
                }

                if (!result?.success) {
                    results.push({ file: file.name, success: false, error: result?.error || 'failed' });
                    continue;
                }

                let translations = [];
                if (options.translateTo && result.segments) {
                    if (this._cancelRequested) break;
                    const translatingText = window.i18n?.t('common.status.translating') || 'Translating';
                    this.app.uiManager.updateProgress(baseProgress + (100 / total) * 0.85, `(${i + 1}/${total}) ${translatingText}: ${file.name}`);
                    translations = await window.ScribeService.translateSegments(result.segments, options.translateTo);
                }

                results.push({ ...result, file: file.name, translations });
            }

            if (this._cancelRequested) {
                this.app.uiManager.updateProgress(0, window.i18n?.t('transcribe.cancelled') || 'Cancelled');
                window.app?.showToast(window.i18n?.t('transcribe.cancelled') || 'Transcription cancelled', 'info');
                document.getElementById('transcribe-progress')?.classList.add('hidden');
                document.getElementById('transcribe-options')?.classList.remove('hidden');
                return;
            }

            this.app.results = results;
            this.app.uiManager.updateProgress(100, window.i18n?.t('common.status.done') || 'Done');
            this._handleResults(results);

        } catch (error) {
            if (this._cancelRequested || /CANCELLED_BY_USER|cancelled/i.test(error?.message || '')) {
                window.app?.showToast(window.i18n?.t('transcribe.cancelled') || 'Transcription cancelled', 'info');
                document.getElementById('transcribe-progress')?.classList.add('hidden');
                document.getElementById('transcribe-options')?.classList.remove('hidden');
            } else {
                console.error('[ScribeTranscriber] Error:', error);
                window.app?.showToast(error.message || window.i18n?.t('common.scribe.transcribeFailed') || 'Transcription failed', 'error');
                this.app.reset();
            }
        } finally {
            this.isProcessing = false;
            this.app.isProcessing = false;
            this._cancelRequested = false;
        }
    }

    /**
     * Request cancel: stops batch loop and kills local whisper workers.
     */
    async cancel() {
        if (!this.isProcessing && !this.app.isProcessing) return;
        this._cancelRequested = true;
        try {
            if (window.ScribeService?.cancel) {
                await window.ScribeService.cancel();
            } else if (window.mediaflow?.transcribe?.cancel) {
                await window.mediaflow.transcribe.cancel();
            }
        } catch (e) {
            console.warn('[ScribeTranscriber] cancel IPC failed:', e);
        }
        this.app.uiManager.updateProgress(
            0,
            window.i18n?.t('transcribe.cancelling') || 'Cancelling…'
        );
    }

    _getOptionsFromUI() {
        const mode = document.getElementById('transcribe-mode')?.value || 'cloud';
        return {
            mode,
            provider: document.getElementById('transcribe-provider')?.value || 'openai',
            language: document.getElementById('transcribe-lang')?.value || '',
            translateTo: document.getElementById('translate-lang')?.value || '',
            model: document.getElementById('transcribe-model')?.value || 'base',
            diarize: document.getElementById('enable-diarization')?.checked,
            diarizeEngine: document.getElementById('diarize-engine')?.value || 'sherpa',
            hfToken: document.getElementById('hf-token')?.value,
            isolateVocals: document.getElementById('isolate-vocals')?.checked,
            initialPrompt: document.getElementById('transcribe-prompt')?.value
        };
    }

    _handleResults(results) {
        if (results.length === 1) {
            this.app.segments = results[0].segments || [];
            this.app.translations = results[0].translations || [];
            this.app.showResults(results[0]);
        } else {
            this.app.uiManager.showBatchResults(results);
        }
    }
}

window.ScribeTranscriber = ScribeTranscriber;
