/**
 * ScribeModelManager.js
 * Local Whisper model manager (list / download / delete)
 * Compact mono UI — classes in main.css (.model-manager-*)
 */

class ScribeModelManager {
    constructor() {
        this.listContainerId = 'model-manager-list';
        this.availableContainerId = 'available-models-list';
        this.modalId = 'model-manager-modal';
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;

        const btnManage = document.getElementById('btn-manage-models');
        const modal = document.getElementById(this.modalId);
        const btnClose = document.getElementById('btn-close-model-manager');
        const btnCloseAction = document.getElementById('btn-close-model-manager-action');

        if (btnManage) {
            btnManage.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.open();
            });
        }

        const closeModal = () => {
            modal?.classList.add('hidden');
        };

        btnClose?.addEventListener('click', closeModal);
        btnCloseAction?.addEventListener('click', closeModal);

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal?.querySelectorAll('.model-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.modelTab || 'installed');
            });
        });

        this.isInitialized = true;
    }

    switchTab(tabId) {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;
        const id = tabId === 'available' ? 'available' : 'installed';
        modal.querySelectorAll('.model-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.modelTab === id);
        });
        modal.querySelectorAll('.model-tab-panel').forEach((p) => {
            const on = p.dataset.modelPanel === id;
            p.classList.toggle('active', on);
            if (on) p.removeAttribute('hidden');
            else p.setAttribute('hidden', '');
        });
    }

    async open() {
        const modal = document.getElementById(this.modalId);
        modal?.classList.remove('hidden');
        this.switchTab('installed');
        this.loadDownloadedModels();
        this.loadAvailableModels();
    }

    _t(key, fallback) {
        const v = window.i18n?.t?.(key);
        return v && v !== key ? v : fallback;
    }

    async loadDownloadedModels() {
        const listContainer = document.getElementById(this.listContainerId);
        if (!listContainer) return;

        listContainer.innerHTML = `<div class="model-list-empty">${this._t('common.ui.loading', 'Loading...')}</div>`;

        try {
            const models = await window.mediaflow?.transcribe.getDownloadedModels();

            if (!models || models.length === 0) {
                listContainer.innerHTML = `<div class="model-list-empty">${this._t('common.modelManager.noModels', 'No models installed yet')}</div>`;
                return;
            }

            listContainer.innerHTML = '';
            models.forEach((model) => {
                const item = document.createElement('div');
                item.className = 'model-item';
                item.innerHTML = `
                    <div class="model-item-info">
                        <div class="model-item-name">${model.name}</div>
                        <div class="model-item-meta">${model.size} · ${model.id}</div>
                    </div>
                `;
                const btnDelete = document.createElement('button');
                btnDelete.type = 'button';
                btnDelete.className = 'model-btn model-btn-danger';
                btnDelete.textContent = this._t('common.actions.remove', 'Remove');
                btnDelete.onclick = () => this.deleteModel(model.id);
                item.appendChild(btnDelete);
                listContainer.appendChild(item);
            });
        } catch (error) {
            const msg = error?.message || String(error);
            listContainer.innerHTML = `<div class="model-list-error">${this._t('common.modelManager.loadError', 'Failed to load models')}: ${msg}</div>`;
        }
    }

    async loadAvailableModels() {
        const AVAILABLE_MODELS = [
            { id: 'tiny', name: 'Tiny', size: '~75 MB', desc: this._t('common.modelManager.descTiny', 'Fastest · testing') },
            { id: 'base', name: 'Base', size: '~145 MB', desc: this._t('common.modelManager.descBase', 'Speed / quality balance') },
            { id: 'small', name: 'Small', size: '~485 MB', desc: this._t('common.modelManager.descSmall', 'Better quality') },
            { id: 'medium', name: 'Medium', size: '~1.5 GB', desc: this._t('common.modelManager.descMedium', 'High quality') },
            { id: 'large-v2', name: 'Large-v2', size: '~2.9 GB', desc: this._t('common.modelManager.descLargeV2', 'Highest quality') },
            { id: 'large-v3', name: 'Large-v3', size: '~3.1 GB', desc: this._t('common.modelManager.descLargeV3', 'Latest highest quality') },
            { id: 'large-v3-turbo', name: 'Large-v3 Turbo', size: '~1.6 GB', desc: this._t('common.modelManager.descTurbo', 'Fast + high quality') }
        ];

        const listContainer = document.getElementById(this.availableContainerId);
        if (!listContainer) return;

        let downloadedIds = [];
        try {
            const downloaded = await window.mediaflow?.transcribe.getDownloadedModels();
            if (downloaded) {
                downloadedIds = downloaded.map((m) => {
                    const match = String(m.id || '').match(/faster-whisper-(.+)$/);
                    return match ? match[1] : m.id;
                });
            }
        } catch {
            /* list still shown; download status unknown */
        }

        listContainer.innerHTML = '';

        AVAILABLE_MODELS.forEach((model) => {
            const isDownloaded = downloadedIds.some(
                (id) =>
                    id === model.id ||
                    String(id).includes(model.id) ||
                    (model.id === 'large-v3-turbo' && String(id).includes('turbo'))
            );

            const item = document.createElement('div');
            item.className = 'model-item';
            item.id = `available-model-${model.id}`;
            item.innerHTML = `
                <div class="model-item-info">
                    <div class="model-item-name">${model.name}</div>
                    <div class="model-item-meta">${model.size} · ${model.desc}</div>
                </div>
            `;

            const btn = document.createElement('button');
            btn.type = 'button';
            if (isDownloaded) {
                btn.className = 'model-btn model-btn-done';
                btn.textContent = this._t('common.modelManager.downloaded', 'Installed');
                btn.disabled = true;
            } else {
                btn.className = 'model-btn model-btn-primary';
                btn.textContent = this._t('common.modelManager.download', 'Get');
                btn.onclick = () => this.downloadModel(model.id, btn);
            }

            item.appendChild(btn);
            listContainer.appendChild(item);
        });
    }

    async downloadModel(modelId, btn) {
        const originalText = btn.textContent;
        btn.textContent = this._t('common.modelManager.downloadingShort', 'Downloading…');
        btn.disabled = true;
        btn.classList.add('is-busy');

        try {
            window.app?.showToast(
                window.i18n?.t('scribe.downloadingModel', { modelId }) ||
                    `Downloading ${modelId}…`,
                'info'
            );

            await window.mediaflow.transcribe.downloadModel(modelId);

            btn.textContent = this._t('common.modelManager.downloaded', 'Installed');
            btn.className = 'model-btn model-btn-done';
            btn.disabled = true;
            window.app?.showToast(
                window.i18n?.t('scribe.modelDownloaded', { modelId }) ||
                    `${modelId} ready`,
                'success'
            );
            this.loadDownloadedModels();
        } catch (error) {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.classList.remove('is-busy');
            btn.className = 'model-btn model-btn-primary';
            window.app?.showToast(error?.message || 'Download failed', 'error');
        }
    }

    async deleteModel(modelId) {
        const ok = await window.app?.ui?.showConfirm?.(
            this._t('common.modelManager.confirmDelete', 'Remove this model from disk?')
        );
        if (ok === false) return;

        try {
            await window.mediaflow.transcribe.deleteModel(modelId);
            window.app?.showToast(this._t('common.modelManager.deleted', 'Model removed'), 'success');
            this.loadDownloadedModels();
            this.loadAvailableModels();
        } catch (error) {
            window.app?.showToast(error?.message || 'Remove failed', 'error');
        }
    }
}

window.ScribeModelManager = ScribeModelManager;
