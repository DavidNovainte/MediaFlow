/**
 * clipboard.js
 * MobileFlow clipboard helpers for the mobile web UI.
 */

function showStatus(message, type = '') {
    const status = document.getElementById('clipboardStatus');
    if (!status) return;

    status.textContent = message;
    status.className = type ? `status-text ${type}` : 'status-text';
}

/**
 * NOTE: Do NOT define a global switchTab here.
 * mobile_remote.html already defines switchTab('link'|'file'|'browser'|'clipboard')
 * for .section / .tab. Overwriting it breaks all tabs except the first.
 */

function showClipboardTab() {
    // Prefer the page-level switcher used by the remote template
    if (typeof window.switchTab === 'function') {
        try {
            window.switchTab('clipboard');
            return;
        } catch (e) {
            console.warn('[clipboard] window.switchTab failed', e);
        }
    }
    // Legacy panels (if any)
    document.querySelectorAll('.tab-content, .mobile-tab-content').forEach((panel) => {
        panel.classList.toggle('active', panel.id === 'clipboard' || panel.id === 'section-clipboard');
    });
    document.querySelectorAll('[data-tab]').forEach((tabButton) => {
        tabButton.classList.toggle('active', tabButton.dataset.tab === 'clipboard');
    });
}

async function fetchPCClipboard() {
    const textarea = document.getElementById('clipboardText');
    const status = document.getElementById('clipboardStatus');
    const i18n = window.i18nRemote || {};

    try {
        status.textContent = i18n.fetching || 'Fetching...';
        const res = await fetch('/api/clipboard');
        const data = await res.json();

        if (data.success) {
            textarea.value = data.text;
            status.textContent = i18n.fetchSuccess || 'Fetched';
            status.className = 'status-text success';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        status.textContent = (i18n.fetchFail || 'Fetch Failed') + ': ' + error.message;
        status.className = 'status-text error';
    }
}

async function sendToPC() {
    const textarea = document.getElementById('clipboardText');
    const status = document.getElementById('clipboardStatus');
    const i18n = window.i18nRemote || {};
    const text = textarea.value;

    if (!text) {
        showStatus(i18n.emptyContent || 'Empty', 'error');
        return;
    }

    try {
        status.textContent = i18n.sending || 'Sending...';
        const res = await fetch('/api/clipboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json();

        if (data.success) {
            status.textContent = i18n.sendSuccess || 'Sent';
            status.className = 'status-text success';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        status.textContent = (i18n.sendFail || 'Send Failed') + ': ' + error.message;
        status.className = 'status-text error';
    }
}

async function copyToMobile() {
    const textarea = document.getElementById('clipboardText');
    const status = document.getElementById('clipboardStatus');
    const i18n = window.i18nRemote || {};

    if (!textarea.value) return;

    try {
        await navigator.clipboard.writeText(textarea.value);
        status.textContent = i18n.copiedToPhone || 'Copied';
        status.className = 'status-text success';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    } catch (error) {
        textarea.select();
        document.execCommand('copy');
        status.textContent = i18n.copied || 'Copied';
        status.className = 'status-text success';
        void error;
    }
}

function clearClipboard() {
    document.getElementById('clipboardText').value = '';
    document.getElementById('clipboardText').focus();
}

window.showClipboardTab = showClipboardTab;
window.fetchPCClipboard = fetchPCClipboard;
window.sendToPC = sendToPC;
window.copyToMobile = copyToMobile;
window.clearClipboard = clearClipboard;

document.addEventListener('DOMContentLoaded', () => {
    // Additional bindings can stay in HTML or be added here later.
});
