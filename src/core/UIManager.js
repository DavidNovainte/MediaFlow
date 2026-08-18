/**
 * UIManager.js
 */
console.log('[UIManager] Script started');
class UIManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * 显示 Toast 通知
     * @param {string} message 消息内容
     * @param {string} type 类型 (info, success, error, warning)
     * @param {object} options 额外选项 { buttons: [{text, onClick}], duration: 3000 }
     */
    showToast(message, type = 'info', options = {}) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}${options.className ? ` ${options.className}` : ''}`;

        const textSpan = document.createElement('span');
        textSpan.textContent = message;
        toast.appendChild(textSpan);

        // Render Action Buttons
        if (options.buttons && Array.isArray(options.buttons)) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'toast-actions';

            options.buttons.forEach(btn => {
                const button = document.createElement('button');
                button.className = 'btn-toast-action';
                button.textContent = btn.text;
                button.onclick = (e) => {
                    e.stopPropagation();
                    btn.onClick();
                    if (!btn.stayOpen) {
                        this._removeToast(toast);
                    }
                };
                actionsDiv.appendChild(button);
            });
            toast.appendChild(actionsDiv);
            if (!options.duration) options.duration = 5000;
        }

        container.appendChild(toast);

        // Auto remove
        const duration = options.duration !== undefined ? options.duration : 3000;
        if (duration > 0) {
            setTimeout(() => this._removeToast(toast), duration);
        }
    }

    _removeToast(toast) {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }
    }

    /**
     * 显示确认对话框
     */
    showConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = modal?.querySelector('.modal-title');
            const msgEl = document.getElementById('confirm-message');
            const btnOk = document.getElementById('confirm-ok');
            const btnCancel = document.getElementById('confirm-cancel');

            if (!modal || !msgEl || !btnOk || !btnCancel) {
                resolve(confirm(message));
                return;
            }

            const t = (key, fallback) => window.i18n?.t?.(key) || fallback;

            const previousTitle = titleEl?.textContent || '';
            const previousMessage = msgEl.textContent || '';
            const previousOk = btnOk.textContent || '';
            const previousCancel = btnCancel.textContent || '';

            // Always localize chrome — never hardcode mixed CN title / EN buttons
            if (titleEl) titleEl.textContent = t('modal.confirmTitle', 'Confirm');
            msgEl.textContent = message;
            btnOk.textContent = t('modal.confirm', 'OK');
            btnCancel.textContent = t('modal.cancel', 'Cancel');
            modal.classList.remove('hidden');
            modal.classList.add('active');

            const closeModal = () => {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                if (titleEl) titleEl.textContent = previousTitle;
                msgEl.textContent = previousMessage;
                btnOk.textContent = previousOk;
                btnCancel.textContent = previousCancel;
            };

            btnOk.onclick = () => { closeModal(); resolve(true); };
            btnCancel.onclick = () => { closeModal(); resolve(false); };
        });
    }

    /**
     * 显示二选一按钮对话框
     */
    showChoice(title, message, choices = []) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = modal?.querySelector('.modal-title');
            const msgEl = document.getElementById('confirm-message');
            const btnPrimary = document.getElementById('confirm-ok');
            const btnSecondary = document.getElementById('confirm-cancel');

            if (!modal || !msgEl || !btnPrimary || !btnSecondary || !Array.isArray(choices) || choices.length < 2) {
                resolve(null);
                return;
            }

            const [secondaryChoice, primaryChoice] = choices;
            const previousTitle = titleEl?.textContent || '';
            const previousMessage = msgEl.textContent || '';
            const previousPrimary = btnPrimary.textContent || '';
            const previousSecondary = btnSecondary.textContent || '';
            const previousPrimaryClass = btnPrimary.className;
            const previousSecondaryClass = btnSecondary.className;

            const t = (key, fallback) => window.i18n?.t?.(key) || fallback;
            if (titleEl) titleEl.textContent = title || t('modal.confirmTitle', 'Confirm');
            msgEl.textContent = message || '';
            btnPrimary.textContent = primaryChoice?.label || t('modal.confirm', 'OK');
            btnSecondary.textContent = secondaryChoice?.label || t('modal.cancel', 'Cancel');
            btnPrimary.className = primaryChoice?.className || 'btn btn-primary';
            btnSecondary.className = secondaryChoice?.className || 'btn btn-secondary';
            modal.classList.remove('hidden');
            modal.classList.add('active');

            const handleKeydown = (event) => {
                if (event.key === 'Escape') {
                    closeModal(null);
                }
            };

            const handleBackdropClick = (event) => {
                if (event.target === modal) {
                    closeModal(null);
                }
            };

            const closeModal = (value = null) => {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                if (titleEl) titleEl.textContent = previousTitle;
                msgEl.textContent = previousMessage;
                btnPrimary.textContent = previousPrimary;
                btnSecondary.textContent = previousSecondary;
                btnPrimary.className = previousPrimaryClass;
                btnSecondary.className = previousSecondaryClass;
                document.removeEventListener('keydown', handleKeydown);
                modal.removeEventListener('click', handleBackdropClick);
                resolve(value);
            };

            btnPrimary.onclick = () => closeModal(primaryChoice?.value ?? null);
            btnSecondary.onclick = () => closeModal(secondaryChoice?.value ?? null);
            document.addEventListener('keydown', handleKeydown);
            modal.addEventListener('click', handleBackdropClick);
        });
    }

    /**
     * 显示带输入框的提示对话框
     */
    showPrompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('prompt-modal');
            const titleEl = document.getElementById('prompt-title');
            const msgEl = document.getElementById('prompt-message');
            const inputEl = document.getElementById('prompt-input');
            const btnOk = document.getElementById('prompt-ok');
            const btnCancel = document.getElementById('prompt-cancel');

            if (!modal || !inputEl || !btnOk || !btnCancel) {
                resolve(prompt(message, defaultValue));
                return;
            }

            const t = (key, fallback) => window.i18n?.t?.(key) || fallback;
            if (titleEl) titleEl.textContent = title || t('modal.title', 'Input');
            if (msgEl) msgEl.textContent = message || '';
            inputEl.value = defaultValue;
            btnOk.textContent = t('modal.confirm', 'OK');
            btnCancel.textContent = t('modal.cancel', 'Cancel');

            modal.classList.remove('hidden');
            modal.classList.add('active');

            // 自动聚焦并选中
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 100);

            const closeModal = () => {
                modal.classList.remove('active');
                modal.classList.add('hidden');
            };

            const handleConfirm = () => {
                const val = inputEl.value;
                closeModal();
                resolve(val);
            };

            btnOk.onclick = handleConfirm;
            btnCancel.onclick = () => { closeModal(); resolve(null); };

            // 支持回车提交
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') { closeModal(); resolve(null); }
            };
        });
    }

    /**
     * 开关下载队列抽屉
     */
    toggleQueueDrawer(show) {
        const drawer = document.getElementById('queue-drawer');
        if (!drawer) return;
        if (show === undefined) drawer.classList.toggle('open');
        else if (show) drawer.classList.add('open');
        else drawer.classList.remove('open');
    }

    /**
     * 设置按钮加载状态
     */
    setLoading(btnId, isLoading, text) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = isLoading;
        if (isLoading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<span class="loading-spinner"></span> ${text || 'Notification'}`;
        } else {
            btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        }
    }

    /**
     * 开关侧边栏折叠状态
     */
    toggleSidebar(collapsed) {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        if (collapsed === undefined) {
            sidebar.classList.toggle('collapsed');
        } else if (collapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }

        // 持久化状态
        const isCollapsed = sidebar.classList.contains('collapsed');
        window.mediaflow?.store?.set('sidebarCollapsed', isCollapsed);
        console.log('[UIManager] Sidebar collapsed:', isCollapsed);
    }
}

window.UIManager = UIManager;
