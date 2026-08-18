/**
 * ScribeEventManager.js
 * 负责 ScribeFlow 的所有 DOM 事件监听绑定
 */

class ScribeEventManager {
    constructor(scribeFlow) {
        this.app = scribeFlow;
    }

    init() {
        this.bindUploadEvents();
        this.bindControlEvents();
        this.bindExportEvents();
        this.bindAIEvents();
        this.bindSettingsEvents();
    }

    bindUploadEvents() {
        // 上传区域
        const uploadZone = document.getElementById('upload-zone-audio');
        const audioFileInput = document.getElementById('audio-file');

        if (uploadZone) {
            uploadZone.addEventListener('click', (e) => {
                if (e.target === audioFileInput) return; // Prevent loop
                audioFileInput.value = ''; // Clear value to ensure change event fires
                audioFileInput.click();
            });
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('drag-over');
            });
            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('drag-over');
            });
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer?.files || []);
                if (files.length > 0) {
                    this.app.handleFilesSelect(files);
                }
            });
        }

        if (audioFileInput) {
            audioFileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    this.app.handleFilesSelect(files);
                }
            });
        }

        // Add more files button
        document.getElementById('btn-add-more-audio')?.addEventListener('click', () => {
            if (audioFileInput) {
                audioFileInput.value = '';
                audioFileInput.click();
            }
        });

        // Clear queue button
        document.getElementById('btn-clear-scribe-queue')?.addEventListener('click', () => {
            this.app.clearQueue();
        });
    }

    bindControlEvents() {
        // 开始转录按钮
        const startBtn = document.getElementById('btn-start-transcribe');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.app.startTranscribe());
        }

        // 取消进行中的转录
        document.getElementById('btn-cancel-transcribe')?.addEventListener('click', () => {
            this.app.cancelTranscribe?.();
        });

        // 重置/新任务按钮
        document.getElementById('btn-new-transcribe')?.addEventListener('click', () => this.app.reset());
        document.getElementById('btn-reset-scribe-file')?.addEventListener('click', () => this.app.reset());

        // 版本切换事件绑定
        document.getElementById('btn-ver-original')?.addEventListener('click', () => this.app.switchVersion('original'));
        document.getElementById('btn-ver-polished')?.addEventListener('click', () => this.app.switchVersion('polished'));

        // 查找与替换
        document.getElementById('btn-search-replace')?.addEventListener('click', () => {
            if (this.app.searchReplace) {
                this.app.searchReplace.open();
            }
        });
    }

    bindExportEvents() {
        // 简单导出按钮
        document.getElementById('btn-copy-text')?.addEventListener('click', () => this.app.copyText());
        document.getElementById('btn-export-srt')?.addEventListener('click', () => this.app.exportSRT());
        document.getElementById('btn-export-txt')?.addEventListener('click', () => this.app.exportTXT());
        document.getElementById('btn-export-all-zip')?.addEventListener('click', () => this.app.exportAllZip());

        // 导出菜单逻辑
        const exportToggle = document.getElementById('btn-export-dropdown-toggle');
        const exportMenu = document.getElementById('export-dropdown-menu');
        if (exportToggle && exportMenu) {
            exportToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                exportMenu.classList.toggle('hidden');
            });
            document.addEventListener('click', () => exportMenu.classList.add('hidden'));
        }
        document.getElementById('btn-export-srt-new')?.addEventListener('click', () => this.app.exportSRT());
        document.getElementById('btn-export-txt-new')?.addEventListener('click', () => this.app.exportTXT());
        document.getElementById('btn-export-all-zip-new')?.addEventListener('click', () => this.app.exportAllZip());
    }

    bindAIEvents() {
        // AI 字幕优化按钮
        document.getElementById('btn-polish-text')?.addEventListener('click', () => this.app.polishSubtitles());
        document.getElementById('btn-summarize-text')?.addEventListener('click', () => this.app.summarizeSubtitles());
        document.getElementById('btn-batch-translate')?.addEventListener('click', () => this.app.batchTranslate());

        // AI 总结侧边栏
        document.getElementById('btn-close-summary')?.addEventListener('click', () => {
            document.getElementById('summary-drawer')?.classList.remove('open');
        });
        document.getElementById('btn-copy-summary')?.addEventListener('click', () => this.app.copySummary());
        document.getElementById('btn-export-summary-txt')?.addEventListener('click', () => this.app.exportSummaryTXT());
    }

    bindSettingsEvents() {
        // Mode Toggle
        const modeSelect = document.getElementById('transcribe-mode');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                const isLocal = e.target.value === 'local';
                this.app.uiManager.updateModeUI(isLocal);
            });
        }

        const diarizeCheck = document.getElementById('enable-diarization');
        if (diarizeCheck) {
            diarizeCheck.addEventListener('change', (e) => {
                this.app.uiManager.updateDiarizationUI(e.target.checked);
            });
        }

        const diarizeEngine = document.getElementById('diarize-engine');
        if (diarizeEngine) {
            diarizeEngine.addEventListener('change', () => {
                const on = document.getElementById('enable-diarization')?.checked;
                this.app.uiManager.updateDiarizationUI(!!on);
                window.mediaflow?.store.set('scribe-diarize-engine', diarizeEngine.value);
            });
            window.mediaflow?.store.get('scribe-diarize-engine', 'sherpa').then((v) => {
                if (v && diarizeEngine.querySelector(`option[value="${v}"]`)) {
                    diarizeEngine.value = v;
                }
                const on = document.getElementById('enable-diarization')?.checked;
                this.app.uiManager.updateDiarizationUI(!!on);
            });
        }

        // Pre-download sherpa models (lazy path; models not bundled)
        document.getElementById('btn-download-sherpa-models')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-download-sherpa-models');
            if (btn) {
                btn.disabled = true;
                btn.textContent = window.i18n?.t('transcribe.sherpaDownloading') || 'Downloading…';
            }
            let offProgress = null;
            try {
                if (window.mediaflow?.transcribe?.onSherpaModelProgress) {
                    offProgress = window.mediaflow.transcribe.onSherpaModelProgress((p) => {
                        if (p?.message) {
                            this.app.uiManager.setSherpaDownloadProgress(p.message);
                            if (btn && typeof p.percent === 'number') {
                                btn.textContent = `${Math.round(p.percent)}%`;
                            }
                        }
                    });
                }
                const res = await window.mediaflow?.transcribe?.downloadSherpaModels?.();
                if (res?.success || res?.ready) {
                    window.app?.showToast?.(
                        window.i18n?.t('transcribe.sherpaDownloadOk') || 'Speaker models ready',
                        'success'
                    );
                    await this.app.uiManager.refreshSherpaModelStatus?.();
                } else {
                    throw new Error(res?.error || 'download failed');
                }
            } catch (e) {
                window.app?.showToast?.(
                    (window.i18n?.t('transcribe.sherpaDownloadFail') || 'Model download failed: ') + (e?.message || e),
                    'error'
                );
                await this.app.uiManager.refreshSherpaModelStatus?.();
            } finally {
                if (typeof offProgress === 'function') {
                    try { offProgress(); } catch (_) { /* ignore */ }
                }
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = window.i18n?.t('transcribe.sherpaDownloadBtn') || 'Pre-download models';
                }
            }
        });

        // Load saved token
        window.mediaflow?.store.get('hf-token', '').then(token => {
            const input = document.getElementById('hf-token');
            if (input && token) input.value = token;
        });
    }
}

window.ScribeEventManager = ScribeEventManager;
