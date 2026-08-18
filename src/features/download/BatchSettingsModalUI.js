/**
 * BatchSettingsModalUI.js
 * 专门处理批量下载设置模态框的逻辑。
 */
class BatchSettingsModalUI {
    constructor(ui) {
        this.ui = ui;
        this._delegated = false;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    /**
     * 显示设置弹窗
     */
    async show() {
        // 1. 初始化（仅第一次执行）
        this.init();

        const e = this.ui.elements;
        if (!e.batchSettingsModal) {
            console.error('[BatchSettingsModalUI] Modal element not found');
            return;
        }

        // 2. 从 store 加载设置
        if (window.mediaflow?.store) {
            try {
                if (e.modalPlaylistLimit) e.modalPlaylistLimit.value = await window.mediaflow.store.get('playlistLimit') || 1000;
                if (e.modalCreateChannelFolder) e.modalCreateChannelFolder.checked = await window.mediaflow.store.get('createChannelFolder') ?? true;
                if (e.modalTimeGroup) e.modalTimeGroup.value = await window.mediaflow.store.get('timeGroup') || 'none';
                if (e.modalUseArchive) e.modalUseArchive.checked = await window.mediaflow.store.get('useArchive') ?? true;
            } catch (err) {
                console.error('[BatchSettingsModalUI] Failed to load settings:', err);
            }
        }

        // 3. 显示弹窗
        e.batchSettingsModal.classList.remove('hidden');
        e.batchSettingsModal.style.setProperty('display', 'flex', 'important');
        
        // 稳定性处理：如果在大容器内被遮挡，移动到 body
        const rect = e.batchSettingsModal.getBoundingClientRect();
        if (rect.height === 0) {
            document.body.appendChild(e.batchSettingsModal);
            e.batchSettingsModal.style.setProperty('display', 'flex', 'important');
        }
    }

    /**
     * 初始化：绑定事件与缓存元素
     */
    init() {
        if (this._delegated) return;
        this._delegated = true;

        const e = this.ui.elements;
        // 缓存元素（如果还没缓存的话，或者重新刷新引用）
        e.batchSettingsModal = document.getElementById('batch-settings-modal');
        e.btnCloseBatchSettings = document.getElementById('btn-close-batch-settings');
        e.btnSaveBatchSettings = document.getElementById('btn-save-batch-settings');
        e.modalPlaylistLimit = document.getElementById('modal-setting-playlist-limit');
        e.modalCreateChannelFolder = document.getElementById('modal-setting-create-channel-folder');
        e.modalTimeGroup = document.getElementById('modal-setting-time-group');
        e.modalUseArchive = document.getElementById('modal-setting-use-archive');

        // 使用委托绑定，防止 DOM 结构变化导致监听丢失
        document.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!target) return;

            // 1. 关闭按钮 (x)
            if (this.closest(target, '#btn-close-batch-settings')) {
                console.log('[BatchSettingsModalUI] Closing via X button');
                this.hide();
                return;
            }

            // 2. 保存按钮
            if (this.closest(target, '#btn-save-batch-settings')) {
                console.log('[BatchSettingsModalUI] Saving settings');
                this.save();
                return;
            }

            // 3. 点击背景关闭
            if (target?.id === 'batch-settings-modal') {
                this.hide();
                return;
            }
        });

        console.log('[BatchSettingsModalUI] Events bound successfully');
    }

    /**
     * 隐藏弹窗
     */
    hide() {
        const modal = this.ui.elements.batchSettingsModal || document.getElementById('batch-settings-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.setProperty('display', 'none', 'important');
        }
    }

    /**
     * 保存设置
     */
    async save() {
        const e = this.ui.elements;
        if (window.mediaflow?.store) {
            try {
                const limit = parseInt(e.modalPlaylistLimit?.value) || 1000;
                const createFolder = e.modalCreateChannelFolder?.checked ?? true;
                const timeGroup = e.modalTimeGroup?.value || 'none';
                const useArchive = e.modalUseArchive?.checked ?? true;

                await window.mediaflow.store.set('playlistLimit', limit);
                await window.mediaflow.store.set('createChannelFolder', createFolder);
                await window.mediaflow.store.set('timeGroup', timeGroup);
                await window.mediaflow.store.set('useArchive', useArchive);

                // 调用全局通知（如果存在的话）
                if (window.app?.showToast) {
                    window.app.showToast(
                        window.i18n?.t('settings.saved') || 'Settings saved',
                        'success'
                    );
                } else {
                    console.log('Settings saved locally');
                }
            } catch (err) {
                console.error('[BatchSettingsModalUI] Save failed:', err);
                if (window.app?.showToast) {
                    window.app.showToast(
                        window.i18n?.t('common.saveFailed') || 'Save failed',
                        'error'
                    );
                }
            }
        }
        this.hide();
    }
}

window.BatchSettingsModalUI = BatchSettingsModalUI;
