/**
 * MediaFlow - DialogManager
 * 专门负责管理视频创作模块的弹窗、进度条和交互对话框
 */

class DialogManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeAttribute(value) {
        return this.escapeHtml(value);
    }

    /**
     * 创建/获取进度条浮层 (动态创建)
     */
    _getProgressModal() {
        let modal = document.getElementById('creator-progress-overlay');
        if (modal && !modal.querySelector('#creator-progress-cancel')) {
            modal.remove();
            modal = null;
        }

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'creator-progress-overlay';
            modal.className = 'progress-overlay hidden';
            modal.innerHTML = `
                <div class="progress-box">
                    <div class="progress-spinner"></div>
                    <div class="progress-text" id="creator-progress-text">${window.i18n?.t('creator.dialogs.preparing') || 'Preparing...'}</div>
                    <div class="progress-bar-container" style="width: 100%; height: 4px; background: var(--fill-hover); margin-top: 15px; border-radius: 2px; overflow: hidden;">
                        <div id="creator-progress-bar" style="width: 0%; height: 100%; background: var(--primary-color, #646cff); transition: width 0.3s ease;"></div>
                    </div>
                    <div id="creator-progress-percent" style="font-size: 12px; color: #888; margin-top: 5px; text-align: right;">0%</div>
                    <button id="creator-progress-cancel" style="display: none; margin-top: 15px; width: 100%; padding: 8px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer;">${window.i18n?.t('creator.dialogs.cancelTask') || 'Cancel Task'}</button>
                </div>
                <style>
                    #creator-progress-overlay {
                        position: fixed; 
                        bottom: 24px; 
                        right: 24px; 
                        width: 320px;
                        z-index: 9999;
                        pointer-events: none;
                    }
                    #creator-progress-overlay.hidden { display: none; }
                    .progress-box {
                        background: var(--bg-card);
                        padding: 20px;
                        border-radius: 12px;
                        border: 1px solid var(--fill-hover);
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                        pointer-events: auto;
                        animation: slideIn 0.3s ease-out;
                    }
                    .progress-spinner {
                        width: 24px; height: 24px;
                        border: 2px solid var(--fill-hover);
                        border-top-color: var(--primary-color, #646cff);
                        border-radius: 50%;
                        margin: 0 auto 12px;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes slideIn {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                </style>
            `;
            document.body.appendChild(modal);
        }
        return modal;
    }

    /**
     * 显示进度条
     */
    showProgress(status = '', percent = 0, canCancel = false, onCancel = null) {
        if (!status && window.i18n) status = window.i18n.t('creator.dialogs.preparing');
        const modal = this._getProgressModal();
        const textEl = document.getElementById('creator-progress-text');
        const barEl = document.getElementById('creator-progress-bar');
        const percentEl = document.getElementById('creator-progress-percent');
        let cancelBtn = document.getElementById('creator-progress-cancel');

        if (textEl) textEl.textContent = status;
        if (barEl) barEl.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;

        if (cancelBtn) {
            cancelBtn.style.display = canCancel ? 'block' : 'none';
            // 复制节点以移除旧监听器
            const newBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
            cancelBtn = newBtn;

            if (canCancel && onCancel) {
                cancelBtn.addEventListener('click', async () => {
                    cancelBtn.disabled = true;
                    cancelBtn.textContent = window.i18n?.t('creator.dialogs.cancelling') || 'Cancelling...';
                    await onCancel();
                    this.hideProgress();
                });
            }
        }
        modal.classList.remove('hidden');
    }

    /**
     * 更新进度条
     */
    updateProgress(percent, status) {
        const barEl = document.getElementById('creator-progress-bar');
        const percentEl = document.getElementById('creator-progress-percent');
        const textEl = document.getElementById('creator-progress-text');

        if (barEl) barEl.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
        if (textEl && status) textEl.textContent = status;
    }

    /**
     * 隐藏进度条
     */
    hideProgress() {
        const modal = document.getElementById('creator-progress-overlay');
        modal?.classList.add('hidden');

        const { inspector, batchPanel } = this.uiManager.elements;
        // 只有在非批量模式下才显示检查器
        if (inspector && batchPanel && batchPanel.classList.contains('hidden')) {
            inspector.classList.remove('hidden');
        }
    }

    /**
     * 显示通用的输入对话框
     */
    showInputDialog(title, placeholder = '', defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: var(--overlay-scrim); z-index: 20000;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(2px);
            `;
            const safeTitle = this.escapeHtml(title);
            const safePlaceholder = this.escapeAttribute(placeholder);
            const safeDefaultValue = this.escapeAttribute(defaultValue);
            const cancelText = this.escapeHtml(window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel');
            const confirmText = this.escapeHtml(window.i18n?.t('creator.dialogs.btnConfirm') || 'Confirm');

            const dialogContent = `
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px;
                    padding: 24px; min-width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div style="color: var(--text-primary); font-size: 16px; font-weight:600; margin-bottom: 16px;">${safeTitle}</div>
                    <input type="text" id="input-dialog-value" placeholder="${safePlaceholder}" value="${safeDefaultValue}"
                        style="width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border-color);
                               border-radius: 8px; color: var(--text-primary); font-size: 14px; box-sizing: border-box; outline:none;">
                    <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
                        <button id="input-dialog-cancel" class="btn btn-secondary">${cancelText}</button>
                        <button id="input-dialog-confirm" class="btn btn-primary">${confirmText}</button>
                    </div>
                </div>
            `;

            overlay.innerHTML = dialogContent;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('#input-dialog-value');
            const confirmBtn = overlay.querySelector('#input-dialog-confirm');
            const cancelBtn = overlay.querySelector('#input-dialog-cancel');

            input.focus();
            input.select();

            const cleanup = (value) => {
                overlay.remove();
                resolve(value);
            };

            confirmBtn.addEventListener('click', () => cleanup(input.value));
            cancelBtn.addEventListener('click', () => cleanup(null));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') cleanup(input.value);
                if (e.key === 'Escape') cleanup(null);
            });
        });
    }

    /**
     * 显示确认对话框 (用于项目恢复等)
     */
    askConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: var(--overlay-scrim); z-index: 20000;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(8px);
                animation: fadeIn 0.3s ease;
            `;

            overlay.innerHTML = `
                <div class="confirm-box" style="background: var(--bg-card, var(--bg-card)); border: 1px solid var(--border-color); border-radius: 16px;
                    padding: 30px; width: 380px; box-shadow: 0 25px 50px var(--overlay-scrim); text-align: center;">
                    <div style="font-size: 32px; color: var(--accent-primary); margin-bottom: 16px;">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </div>
                    <div style="color: var(--text-primary); font-size: 16px; font-weight: 600; margin-bottom: 12px;" data-i18n="creator.dialogs.restoreTitle">${window.i18n?.t('creator.dialogs.restoreTitle') || 'Restore last session?'}</div>
                    <div style="color: var(--text-muted); font-size: 14px; line-height: 1.6; margin-bottom: 24px;">${message}</div>
                    <div style="display: flex; gap: 12px; justify-content: stretch;">
                        <button id="confirm-dialog-cancel" class="btn-glass" style="flex: 1; padding: 10px; border-radius: 8px;" data-i18n="creator.dialogs.btnCancel">${window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'}</button>
                        <button id="confirm-dialog-ok" class="btn-primary" style="flex: 1; padding: 10px; border-radius: 8px;" data-i18n="creator.dialogs.btnRestore">${window.i18n?.t('creator.dialogs.btnRestore') || 'Restore Now'}</button>
                    </div>
                </div>
                <style>
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                </style>
            `;

            document.body.appendChild(overlay);

            document.getElementById('confirm-dialog-ok').onclick = () => { overlay.remove(); resolve(true); };
            document.getElementById('confirm-dialog-cancel').onclick = () => { overlay.remove(); resolve(false); };
            overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
        });
    }

    /**
     * 选择文件夹路径 (使用 Electron 原生对话框)
     */
    async askFolderPath() {
        // 使用 preload.js 中暴露的 selectFolder API
        if (!window.mediaflow?.dialog?.selectFolder) {
            console.error('Electron selectFolder API not available');
            return null;
        }

        try {
            const result = await window.mediaflow.dialog.selectFolder();
            // selectFolder 直接返回路径字符串或 null
            return result || null;
        } catch (err) {
            console.error('Failed to select folder:', err);
            return null;
        }
    }
}

window.DialogManager = DialogManager;
