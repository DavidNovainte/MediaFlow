/**
 * ScribeUIManager.js
 * 负责 ScribeFlow 的界面状态、结果显示及转录列表编辑器
 */
class ScribeUIManager {
    constructor(scribeFlow) {
        this.app = scribeFlow;
        this.containerId = 'transcript-text';
        this.translationContainerId = 'translation-text';
        this.translationWrapperId = 'transcript-translation';
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    safeTime(value) {
        const time = Number(value);
        return Number.isFinite(time) ? time : 0;
    }

    // --- 界面状态管理 ---
    updateProgress(percent, status) {
        const fill = document.getElementById('transcribe-progress-fill');
        const statusEl = document.getElementById('transcribe-status');
        if (fill) fill.style.width = `${percent}%`;
        if (statusEl) statusEl.textContent = status;
    }

    showTranscribingState() {
        document.getElementById('transcribe-options')?.classList.add('hidden');
        document.getElementById('transcribe-progress')?.classList.remove('hidden');
    }

    showResults(result) {
        document.getElementById('transcribe-progress')?.classList.add('hidden');
        document.getElementById('transcribe-result')?.classList.remove('hidden');

        const langDisplay = document.getElementById('result-language');
        if (langDisplay && result.language) {
            const prefix = window.i18n ? window.i18n.t('common.transcribe.languagePrefix') : 'Language: ';
            langDisplay.textContent = `${prefix}${window.ScribeService.getLanguageName(result.language)}`;
            langDisplay.classList.remove('hidden');
        }
        if (result?.duration) {
            const durationEl = document.getElementById('result-duration');
            if (durationEl) durationEl.textContent = this.formatTime(result.duration);
        }
    }

    resetUI() {
        ['upload-zone-audio'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        ['transcribe-options', 'transcribe-progress', 'transcribe-result', 'transcript-translation',
            'btn-export-all-zip-new', 'version-switcher-group', 'result-language'].forEach(id => document.getElementById(id)?.classList.add('hidden'));

        const filenameEl = document.getElementById('result-filename');
        if (filenameEl) filenameEl.textContent = '';
        this.updateProgress(0, window.i18n?.t('common.status.ready') || 'Ready');
    }

    /**
     * 更新转录模式 UI
     */
    updateModeUI(isLocal) {
        document.getElementById('local-model-group')?.classList.toggle('hidden', !isLocal);
        document.getElementById('local-diarization-group')?.classList.toggle('hidden', !isLocal);
        document.getElementById('cloud-provider-group')?.classList.toggle('hidden', isLocal);
    }

    /**
     * 更新说话人分离 UI
     * 默认 sherpa：不显示 HF Token；选 pyannote 时才显示
     */
    updateDiarizationUI(enabled) {
        const opts = document.getElementById('diarization-options');
        if (opts) opts.classList.toggle('hidden', !enabled);

        const engine = document.getElementById('diarize-engine')?.value || 'sherpa';
        const needHf = enabled && engine === 'pyannote';
        document.getElementById('hf-token-container')?.classList.toggle('hidden', !needHf);

        const sherpaStatus = document.getElementById('sherpa-model-status');
        if (sherpaStatus) {
            sherpaStatus.classList.toggle('hidden', !enabled || engine !== 'sherpa');
        }

        if (enabled && engine === 'sherpa') {
            this.refreshSherpaModelStatus();
        }
    }

    /**
     * Query whether sherpa diarization models are already on disk.
     */
    async refreshSherpaModelStatus() {
        const hintEl = document.getElementById('sherpa-model-status-text');
        const btn = document.getElementById('btn-download-sherpa-models');
        try {
            const st = await window.mediaflow?.transcribe?.getSherpaModelStatus?.();
            const ready = !!(st?.ready || st?.segmentation_exists && st?.embedding_exists);
            if (hintEl) {
                hintEl.textContent = ready
                    ? (window.i18n?.t('transcribe.sherpaReady') || 'Speaker models ready (cached on this machine)')
                    : (window.i18n?.t('transcribe.sherpaModelHint')
                        || '模型不打包，首次启用时自动下载到本机（可预下载）。');
            }
            if (btn) {
                btn.classList.toggle('hidden', ready);
            }
        } catch (_) {
            if (hintEl) {
                hintEl.textContent = window.i18n?.t('transcribe.sherpaModelHint')
                    || '模型不打包，首次启用时自动下载到本机（可预下载）。';
            }
        }
    }

    setSherpaDownloadProgress(message) {
        const hintEl = document.getElementById('sherpa-model-status-text');
        if (hintEl && message) {
            hintEl.textContent = message;
        }
    }

    // --- 转录列表编辑器 (原 ScribeEditor 逻辑) ---
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const version = this.app.currentVersion || 'original';
        const data = version === 'polished' ? this.app.polishedSegments : this.app.rawSegments;
        if (!data) return;

        container.innerHTML = data.map((seg, idx) => this._renderSegment(seg, idx, version)).join('');
        this._injectStyles();

        if (this.app.clipHandler) this.app.clipHandler.initSelection(container);
        this._initTextEditing(container);
        this._initSegmentActions(container);
        this.app.segments = data;
        this.renderTranslations(data);
    }

    _renderSegment(seg, idx, version) {
        const startTime = this.safeTime(seg.start);
        const time = this.formatTime(startTime);
        const color = this.speakerManager?.getSpeakerColor(seg.speaker) || 'var(--accent-primary)';
        const safeSpeaker = this.escapeHtml(seg.speaker);
        const speaker = seg.speaker ? `<span class="speaker-label" data-scribe-action="rename-speaker" data-speaker="${safeSpeaker}" style="font-weight:bold; color:${color}; margin-right:5px; cursor: pointer;">[${safeSpeaker}]</span>` : '';

        let text = (seg.text || '').replace(/^\[\d+\]\s*/, '').replace(/\[\d+\]\s*$/, '').trim();
        if (version === 'polished' && this.app.rawSegments?.[idx]) {
            const oldText = (this.app.rawSegments[idx].text || '').replace(/^\[\d+\]\s*/, '').trim();
            if (oldText !== text) text = this._diffText(oldText, text);
            else text = this.escapeHtml(text);
        } else {
            text = this.escapeHtml(text);
        }

        return `<div class="transcript-segment" id="segment-${idx}" data-idx="${idx}" data-start="${startTime}" style="display: flex; align-items: baseline; gap: 8px; cursor: pointer; padding: 4px 0;">
                    <span class="timestamp" data-scribe-action="seek" style="min-width: 50px; font-family: monospace; color: var(--text-muted);">[${time}]</span>
                    <div style="flex: 1; line-height: 1.5;">${speaker}<span class="segment-text" contenteditable="true" style="outline:none;">${text}</span></div>
                    <button class="btn-delete-segment" data-scribe-action="delete" style="opacity:0.3; background:none; border:none; cursor:pointer; color:var(--text-muted);">&times;</button>
                </div>`;
    }

    renderTranslations(sourceData) {
        const wrapper = document.getElementById(this.translationWrapperId);
        const content = document.getElementById(this.translationContainerId);
        if (this.app.translations?.length > 0) {
            wrapper?.classList.remove('hidden');
            if (content) {
                content.innerHTML = this.app.translations.map((text, i) => `
                    <div class="transcript-segment">
                        <span class="timestamp">[${this.formatTime(this.safeTime(sourceData[i]?.start))}]</span>
                        <span class="segment-text">${this.escapeHtml(text)}</span>
                    </div>`).join('');

                // 设置滚动样式
                content.style.maxHeight = '400px';
                content.style.overflowY = 'auto';
                content.style.paddingRight = '8px';
            }
        } else { wrapper?.classList.add('hidden'); }
    }

    _initTextEditing(container) {
        container.querySelectorAll('.transcript-segment').forEach(seg => {
            const idx = parseInt(seg.dataset.idx);
            const textEl = seg.querySelector('.segment-text');
            textEl?.addEventListener('blur', () => {
                const target = this.app.currentVersion === 'polished' ? this.app.polishedSegments : this.app.rawSegments;
                if (target?.[idx]) target[idx].text = textEl.innerText.trim();
            });
            textEl?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textEl.blur(); } });
        });
    }

    _initSegmentActions(container) {
        if (this.segmentActionContainer && this.segmentActionHandler) {
            this.segmentActionContainer.removeEventListener('click', this.segmentActionHandler);
        }

        this.segmentActionContainer = container;
        this.segmentActionHandler = (event) => {
            const actionTarget = event.target?.closest?.('[data-scribe-action]');
            if (!actionTarget || !container.contains(actionTarget)) return;

            const segment = actionTarget.closest('.transcript-segment');
            const index = Number.parseInt(segment?.dataset.idx, 10);
            const action = actionTarget.dataset.scribeAction;

            event.preventDefault();
            event.stopPropagation();

            if (action === 'rename-speaker') {
                this.speakerManager?.renameSpeaker?.(actionTarget.dataset.speaker || '');
            } else if (action === 'seek') {
                this.seekTo(this.safeTime(segment?.dataset.start));
            } else if (action === 'delete' && Number.isInteger(index)) {
                this.deleteSegment(index);
            }
        };
        container.addEventListener('click', this.segmentActionHandler);
    }

    highlightCurrentSegment(time) {
        if (!this.app.segments) return;
        const idx = this.app.segments.findIndex(s => time >= s.start && time < (s.end || s.start + 5));
        document.querySelector('.transcript-segment.active')?.classList.remove('active');
        if (idx !== -1) {
            const el = document.getElementById(`segment-${idx}`);
            if (el) {
                el.classList.add('active');
                if (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().bottom > window.innerHeight) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }

    _diffText(oldText, newText) {
        let start = 0; while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
        let endOld = oldText.length - 1, endNew = newText.length - 1;
        while (endOld >= start && endNew >= start && oldText[endOld] === newText[endNew]) { endOld--; endNew--; }
        const mid = newText.substring(start, endNew + 1);
        return mid
            ? `${this.escapeHtml(newText.substring(0, start))}<span class="diff-add" style="color:#e59500; background:rgba(229,149,0,0.1); padding:0 2px;">${this.escapeHtml(mid)}</span>${this.escapeHtml(newText.substring(endNew + 1))}`
            : this.escapeHtml(newText);
    }

    _injectStyles() {
        if (document.getElementById('scribe-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'scribe-editor-styles';
        style.textContent = '.transcript-segment:hover .btn-delete-segment { opacity: 1 !important; color: #ef4444 !important; } .speaker-label:hover { text-decoration: underline; }';
        document.head.appendChild(style);
    }

    switchVersion(version) {
        if (this.app.currentVersion === version) return;
        this.saveCurrentEditsToMemory();
        this.app.currentVersion = version;
        this.render();
        this.updateVersionUI();
        const verText = version === 'polished' ? (window.i18n?.t('common.transcribe.versionPolished') || 'AI Polished') : (window.i18n?.t('common.transcribe.versionOriginal') || 'Original');
        window.app?.showToast(window.i18n?.t('common.transcribe.switchedVersion', { version: verText }) || `Switched to ${verText} version`, 'info');
    }

    saveCurrentEditsToMemory() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        const target = this.app.currentVersion === 'polished' ? this.app.polishedSegments : this.app.rawSegments;
        if (!target) return;
        container.querySelectorAll('.transcript-segment').forEach(segEl => {
            const idx = parseInt(segEl.dataset.idx);
            const textEl = segEl.querySelector('.segment-text');
            if (target[idx] && textEl) target[idx].text = textEl.textContent.trim();
        });
    }

    updateVersionUI() {
        const btnOriginal = document.getElementById('btn-ver-original');
        const btnPolished = document.getElementById('btn-ver-polished');
        const header = document.getElementById('version-switcher-group');
        const hasDiff = this.app.polishedSegments?.length > 0 && JSON.stringify(this.app.polishedSegments) !== JSON.stringify(this.app.rawSegments);
        if (hasDiff) header?.classList.remove('hidden');
        if (btnOriginal && btnPolished) {
            btnOriginal.classList.toggle('active', this.app.currentVersion === 'original');
            btnPolished.classList.toggle('active', this.app.currentVersion === 'polished');
        }
    }

    deleteSegment(index) {
        if (this.app.rawSegments) this.app.rawSegments.splice(index, 1);
        if (this.app.polishedSegments?.length > index) this.app.polishedSegments.splice(index, 1);
        if (this.app.translations?.length > index) this.app.translations.splice(index, 1);
        this.app.segments = this.app.currentVersion === 'polished' ? this.app.polishedSegments : this.app.rawSegments;
        this.render();
        window.app?.showToast(window.i18n?.t('common.transcribe.lineDeleted') || 'Subtitle line deleted', 'success');
    }

    seekTo(time) { this.app.mediaPlayer?.seek(time); }

    clearHighlight() { document.querySelector('.transcript-segment.active')?.classList.remove('active'); }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.ScribeUIManager = ScribeUIManager;
