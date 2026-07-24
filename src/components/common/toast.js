class Toast {
    static show(message, type = 'info', action = null) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let html = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${this.getIconPath(type)}
            </svg>
            <span class="toast-msg"></span>
        `;

        if (action && action.text && action.callback) {
            html += `
                <div class="toast-actions">
                    <button class="btn-toast-action"></button>
                </div>
            `;
        }

        toast.innerHTML = html;
        // 使用 textContent 赋值，防止任何来自网络或底层的错误消息被解析为 HTML
        toast.querySelector('.toast-msg').textContent = message;
        if (action && action.text) {
            const actionBtn = toast.querySelector('.btn-toast-action');
            if (actionBtn) actionBtn.textContent = action.text;
        }
        container.appendChild(toast);

        if (action && action.text && action.callback) {
            const btn = toast.querySelector('.btn-toast-action');
            btn.onclick = (e) => {
                e.stopPropagation();
                action.callback();
                toast.remove();
            };
        }

        // Auto remove — errors linger 8s, warnings 5s, others 3s
        const displayDuration = type === 'error' ? 8000 : type === 'warning' ? 5000 : 3000;
        setTimeout(() => {
            if (toast.isConnected) {
                toast.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, displayDuration);
    }

    static getIconPath(type) {
        if (type === 'success') return '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
        if (type === 'error') return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        if (type === 'warning') return '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
        return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
    }
}

window.Toast = Toast;
