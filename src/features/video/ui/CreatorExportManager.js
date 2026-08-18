/**
 * MediaFlow - CreatorExportManager
 * Handles export modal lifecycle for the creator page.
 */
class CreatorExportManager {
    constructor(ui) {
        this.ui = ui;
        this.app = ui.app;
        this.elements = {};
        this._delegated = false;
    }

    init() {
        this.ensureExportModal();
        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        this.elements = {
            exportModal: document.getElementById('creator-export-modal'),
            exportModalClose: document.getElementById('btn-close-creator-export'),
            exportModalCancel: document.getElementById('btn-cancel-creator-export'),
            exportModalSubmit: document.getElementById('btn-submit-creator-export'),
            exportModalPath: document.getElementById('modal-creator-output-path'),
            exportModalFormat: document.getElementById('modal-export-format'),
            exportModalType: document.getElementById('modal-export-type'),
            btnModalSelectOutput: document.getElementById('btn-modal-select-output'),
            headerExportBtn: document.getElementById('btn-creator-export-dialog')
        };
    }

    t(key, fallback) {
        return window.i18n?.t(key) || fallback;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    ensureExportModal() {
        let modal = document.getElementById('creator-export-modal');
        if (modal) return modal;

        const root = document.getElementById('page-creator') || document.body;
        const wrapper = document.createElement('div');

        wrapper.innerHTML = `
            <div id="creator-export-modal" class="modal-overlay hidden">
                <div class="modal-content-premium creator-export-modal">
                    <div class="modal-header-pro">
                        <div class="modal-title-pro">
                            <i class="fas fa-file-export"></i>
                            <span>${this.t('creator.export.title', 'Export Settings')}</span>
                        </div>
                        <button class="btn-close-pro" id="btn-close-creator-export">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="modal-body-pro">
                        <div class="export-option-item">
                            <label class="export-label">${this.t('creator.export.format', 'Export Format')}</label>
                            <div class="custom-select-wrapper">
                                <select id="modal-export-format" class="premium-select">
                                    <option value="mp4">MP4 (H.264 / AAC)</option>
                                </select>
                                <i class="fas fa-chevron-down select-arrow"></i>
                            </div>
                        </div>

                        <div class="export-option-item">
                            <label class="export-label">${this.t('creator.export.type', 'Content Type')}</label>
                            <div class="custom-select-wrapper">
                                <select id="modal-export-type" class="premium-select">
                                    <option value="video+audio">${this.t('creator.export.typeVideoAudio', 'Video + Audio')}</option>
                                    <option value="video">${this.t('creator.export.typeVideoOnly', 'Video Only')}</option>
                                    <option value="audio">${this.t('creator.export.typeAudioOnly', 'Audio Only')}</option>
                                </select>
                                <i class="fas fa-chevron-down select-arrow"></i>
                            </div>
                        </div>

                        <div class="export-option-item">
                            <label class="export-label">${this.t('creator.export.path', 'Save Path')}</label>
                            <div class="path-input-group-premium">
                                <input type="text" id="modal-creator-output-path" class="premium-input" readonly placeholder="...">
                                <button class="btn-path-change" id="btn-modal-select-output">
                                    <i class="fas fa-folder-open"></i>
                                    <span>${this.t('settings.changePath', 'Change')}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer-pro">
                        <button class="btn-ghost-pro" id="btn-cancel-creator-export">${this.t('common.actions.cancel', 'Cancel')}</button>
                        <button class="btn-primary-premium" id="btn-submit-creator-export">
                            <i class="fas fa-rocket"></i>
                            <span>${this.t('creator.export.startBtn', 'Start Export')}</span>
                        </button>
                    </div>
                </div>
            </div>
        `.trim();

        modal = wrapper.firstElementChild;
        root.appendChild(modal);
        return modal;
    }

    async openModal() {
        try {
            console.log('[CreatorExportManager] Attempting to open export modal');
            this.ensureExportModal();
            this.cacheElements();

            const {
                exportModal,
                exportModalPath,
                exportModalFormat,
                exportModalType
            } = this.elements;

            const mediaFile = this.app.videoFile || this.app.audioFile;
            if (!mediaFile) {
                console.warn('[CreatorExportManager] No media file loaded');
                window.app?.showToast(
                    this.t('creator.toasts.loadVideoFirst', 'Please load a media file first'),
                    'warning'
                );
                return;
            }

            if (!exportModal) {
                console.error('[CreatorExportManager] Export modal container not found');
                return;
            }

            if (exportModalPath && (!exportModalPath.value || exportModalPath.value === '...')) {
                const globalPath = await window.mediaflow?.store?.get('last_creator_output_path');
                if (globalPath) exportModalPath.value = globalPath;
            }

            const fileName = typeof mediaFile === 'string'
                ? mediaFile.split(/[\\/]/).pop()
                : mediaFile?.name;
            const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';

            if (ext && ['mp4', 'mkv', 'mov'].includes(ext) && exportModalFormat) {
                exportModalFormat.value = 'mp4';
            }

            if (this.app.isAudioOnly || this.app.service?.isAudioFile?.(mediaFile)) {
                if (exportModalType) exportModalType.value = 'audio';
            }

            this.syncFormatOptions();

            exportModal.classList.remove('hidden');
            exportModal.style.setProperty('display', 'flex', 'important');
            exportModal.style.setProperty('opacity', '1', 'important');
            exportModal.style.setProperty('visibility', 'visible', 'important');
            exportModal.style.setProperty('z-index', '20000', 'important');

            const rect = exportModal.getBoundingClientRect();
            if (rect.height === 0 || window.getComputedStyle(exportModal).display === 'none') {
                document.body.appendChild(exportModal);
                exportModal.style.setProperty('display', 'flex', 'important');
            }

            console.log('[CreatorExportManager] Modal opened successfully');
        } catch (err) {
            console.error('[CreatorExportManager] Failed to open modal:', err);
        }
    }

    closeModal() {
        this.cacheElements();
        const { exportModal } = this.elements;
        if (exportModal) {
            exportModal.classList.add('hidden');
            exportModal.style.setProperty('display', 'none', 'important');
        }
    }

    bindEvents() {
        if (this._delegated) return;
        this._delegated = true;

        const btn = document.getElementById('btn-creator-export-dialog');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[CreatorExportManager] Direct click on export button');
                this.openModal();
            });
        }

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target) return;

            if (this.closest(target, '#btn-creator-export-dialog')) {
                console.log('[CreatorExportManager] Header export button clicked (Delegated)');
                this.openModal();
                return;
            }

            if (this.closest(target, '#btn-close-creator-export') || this.closest(target, '#btn-cancel-creator-export')) {
                this.closeModal();
                return;
            }

            if (target?.id === 'creator-export-modal') {
                this.closeModal();
                return;
            }

            if (this.closest(target, '#btn-modal-select-output')) {
                this.handlePathSelection();
                return;
            }

            if (this.closest(target, '#btn-submit-creator-export')) {
                this.handleExportSubmission();
                return;
            }

        });

        document.addEventListener('change', (e) => {
            const target = e.target;
            if (!target) return;

            if (target.id === 'modal-export-type') {
                this.syncFormatOptions();
            }
        });

        console.log('[CreatorExportManager] Events bound and reinforced');
    }

    syncFormatOptions() {
        const typeSelect = document.getElementById('modal-export-type');
        const formatSelect = document.getElementById('modal-export-format');
        if (!typeSelect || !formatSelect) return;

        const nextFormat = typeSelect.value === 'audio' ? 'mp3' : 'mp4';
        const nextLabel = typeSelect.value === 'audio' ? 'MP3 (Audio Only)' : 'MP4 (H.264 / AAC)';

        formatSelect.innerHTML = '';
        const option = document.createElement('option');
        option.value = nextFormat;
        option.textContent = nextLabel;
        formatSelect.appendChild(option);
        formatSelect.value = nextFormat;
    }

    async handlePathSelection() {
        try {
            const selectedPath = await this.ui.askFolderPath();
            if (selectedPath) {
                const pathInput = document.getElementById('modal-creator-output-path');
                if (pathInput) {
                    pathInput.value = selectedPath;
                    window.mediaflow?.store?.set('last_creator_output_path', selectedPath);
                }
            }
        } catch (err) {
            console.error('[CreatorExportManager] Path selection failed:', err);
        }
    }

    async handleExportSubmission() {
        try {
            const format = document.getElementById('modal-export-format')?.value || 'mp4';
            const type = document.getElementById('modal-export-type')?.value || 'video+audio';
            const savePath = document.getElementById('modal-creator-output-path')?.value;

            this.closeModal();

            console.log('[CreatorExportManager] Submitting export proposal:', { format, type, savePath });
            if (this.app.videoProcessor) {
                await this.app.videoProcessor.renderProject({ format, type, savePath });
            } else {
                console.error('[CreatorExportManager] videoProcessor not initialized');
                window.app?.showToast('Video Processor not ready', 'error');
            }
        } catch (err) {
            console.error('[CreatorExportManager] Export submission error:', err);
            window.app?.showToast(
                this.t('creator.video.mergeFail', 'Export submission failed'),
                'error'
            );
        }
    }
}

window.CreatorExportManager = CreatorExportManager;
