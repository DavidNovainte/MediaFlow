/**
 * MobileFlowUIManager.js
 * 负责手机互联功能的 DOM 交互、事件绑定与界面渲染
 */

class MobileFlowUIManager {
    /**
     * @param {MobileFlow} controller - MobileFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
    }

    safeText(value) {
        return String(value ?? '');
    }

    escapeHtml(value) {
        return this.safeText(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 初始化事件监听
     */
    init() {
        // 1. 启动/停止服务
        document.getElementById('btn-toggle-mobile-server')?.addEventListener('click', () => {
            if (this.controller.service.isRunning) {
                this.controller.service.stopServer();
            } else {
                this.controller.service.startServer();
            }
        });

        // 2. 复制 URL
        document.getElementById('btn-copy-url')?.addEventListener('click', () => {
            const domUrl = document.querySelector('#mobile-connection-url .url-text')?.textContent;
            const urlToCopy = this.controller.service.serverUrl || (domUrl && domUrl !== '-' ? domUrl : null);

            if (urlToCopy) {
                navigator.clipboard.writeText(urlToCopy).then(() => {
                    window.app?.showToast(window.i18n.t('mobile.messages.copySuccess') + ': ' + urlToCopy, 'success');
                }).catch(() => {
                    // Fallback
                    const textArea = document.createElement('textarea');
                    textArea.value = urlToCopy;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        window.app?.showToast(window.i18n.t('mobile.messages.copySuccess') + ': ' + urlToCopy, 'success');
                    } catch {
                        window.app?.showToast(window.i18n.t('mobile.messages.copyFail'), 'error');
                    }
                    document.body.removeChild(textArea);
                });
            } else {
                window.app?.showToast(window.i18n.t('mobile.messages.serviceNotStarted'), 'warning');
            }
        });

        // 3. 清空接收记录
        document.getElementById('btn-clear-mobile-history')?.addEventListener('click', async () => {
            const list = document.getElementById('pending-urls-list');
            if (list) {
                const confirmMsg = window.i18n.t('mobile.messages.confirmClear');
                const confirmed = window.app?.showConfirm ?
                    await window.app.showConfirm(confirmMsg) :
                    confirm(confirmMsg);

                if (confirmed) {
                    list.innerHTML = `
                         <div class="empty-hint" style="color: var(--text-muted); text-align: center; padding-top: 100px; display: flex; flex-direction: column; gap: 10px;">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto; opacity: 0.5;">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            <span data-i18n="mobile.history.empty">${window.i18n.t('mobile.history.empty')}</span>
                         </div>
                     `;
                    window.app?.showToast(window.i18n.t('mobile.messages.historyCleared'), 'success');
                }
            }
        });

        // 4. 设置弹框
        this.bindSettingsModal();
    }

    /**
     * 绑定设置弹框事件
     */
    bindSettingsModal() {
        const modal = document.getElementById('mobile-settings-modal');
        const btnOpen = document.getElementById('btn-mobile-settings');
        const btnClose = document.getElementById('btn-close-mobile-settings');
        const overlay = modal?.querySelector('.modal-overlay');
        const autoStartToggle = document.getElementById('mobile-auto-start');
        const pinInput = document.getElementById('mobile-pin-code');
        const btnTogglePin = document.getElementById('btn-toggle-pin-visibility');
        const btnSavePin = document.getElementById('btn-save-mobile-pin');

        const portInput = document.getElementById('mobile-server-port');
        const btnSavePort = document.getElementById('btn-save-mobile-port');
        const pinHint = document.getElementById('mobile-pin-hint');

        // 打开弹框
        btnOpen?.addEventListener('click', async () => {
            // 加载当前设置
            const autoStart = await window.mediaflow?.store.get('mobileflowAutostart') ?? false;
            const pin = await window.mediaflow?.store.get('mobileflowPin') || '';
            const port = await this.controller.service.getConfiguredPort?.()
                || (await window.mediaflow?.store.get('mobileflowPort', 8765)) || 8765;

            if (autoStartToggle) autoStartToggle.checked = autoStart;
            if (pinInput) pinInput.value = pin;
            if (portInput) portInput.value = String(port);
            if (pinHint) {
                pinHint.style.display = pin ? 'none' : '';
            }
            modal?.classList.remove('hidden');
        });

        // 关闭弹框
        const closeModal = () => modal?.classList.add('hidden');
        btnClose?.addEventListener('click', closeModal);
        overlay?.addEventListener('click', closeModal);

        // 自动启动开关
        autoStartToggle?.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            await window.mediaflow?.store.set('mobileflowAutostart', enabled);
            const msg = enabled ?
                window.i18n.t('mobile.messages.autoStartEnabled') :
                window.i18n.t('mobile.messages.autoStartDisabled');
            window.app?.showToast(msg, 'success');
        });

        // 切换 PIN 码可见性
        btnTogglePin?.addEventListener('click', () => {
            if (pinInput) {
                pinInput.type = pinInput.type === 'password' ? 'text' : 'password';
            }
        });

        // 保存 PIN 码
        btnSavePin?.addEventListener('click', async () => {
            const pin = pinInput?.value.trim() || '';
            if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
                window.app?.showToast(window.i18n.t('mobile.messages.pinInvalid'), 'warning');
                return;
            }

            await window.mediaflow?.store.set('mobileflowPin', pin);
            if (pin) await window.mediaflow?.store?.set?.('mobileflowPinHintSeen', true);
            if (window.mediaflow.mobileflow?.setPin) await window.mediaflow.mobileflow.setPin(pin);
            if (pinHint) pinHint.style.display = pin ? 'none' : '';
            const msg = pin ? window.i18n.t('mobile.messages.pinSaved') : window.i18n.t('mobile.messages.pinCleared');
            window.app?.showToast(msg, 'success');
        });

        // 保存端口（运行中会重启服务）
        btnSavePort?.addEventListener('click', async () => {
            const port = portInput?.value;
            await this.controller.service.applyPort?.(port);
        });
    }

    /**
     * 更新状态显示
     */
    updateStatus(isRunning, url = null) {
        const statusDot = document.querySelector('#mobile-status-indicator .status-dot');
        const statusText = document.getElementById('mobile-status-text');
        const toggleBtn = document.getElementById('btn-toggle-mobile-server');
        const qrSection = document.getElementById('mobile-qr-section');

        if (isRunning) {
            statusDot?.classList.remove('offline');
            statusDot?.classList.add('online');
            if (statusText) {
                statusText.textContent = window.i18n.t('mobile.status.running');
                statusText.setAttribute('data-i18n', 'mobile.status.running');
            }
            if (toggleBtn) {
                toggleBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <span data-i18n="mobile.actions.stop">${window.i18n.t('mobile.actions.stop')}</span>
                `;
                toggleBtn.classList.remove('btn-primary');
                toggleBtn.classList.add('btn-danger');
            }
            qrSection?.classList.remove('hidden');

            if (url) {
                this.updateUrlText(url);
            }
        } else {
            statusDot?.classList.remove('online');
            statusDot?.classList.add('offline');
            if (statusText) {
                statusText.textContent = window.i18n.t('mobile.status.offline');
                statusText.setAttribute('data-i18n', 'mobile.status.offline');
            }
            if (toggleBtn) {
                toggleBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <span data-i18n="mobile.actions.start">${window.i18n.t('mobile.actions.start')}</span>
                `;
                toggleBtn.classList.remove('btn-danger');
                toggleBtn.classList.add('btn-primary');
            }
            qrSection?.classList.add('hidden');
        }
    }

    /**
     * 更新 URL 文本显示
     */
    updateUrlText(url) {
        const urlText = document.querySelector('#mobile-connection-url .url-text');
        if (urlText) urlText.textContent = url;
    }

    /**
     * 渲染渲染 IP 选择器
     */
    renderIpSelector(ips, currentIp) {
        const selector = document.getElementById('ip-selector');
        if (!selector) return;

        selector.innerHTML = '';

        // 分类 IP (优先网卡)
        const priorityIps = [];
        const otherIps = [];

        ips.forEach(ip => {
            const name = ip.name.toLowerCase();
            if (name.includes('wi-fi') || name.includes('wlan') || name.includes('ethernet') || name.includes('以太网')) {
                priorityIps.push(ip);
            } else {
                otherIps.push(ip);
            }
        });

        const all = [...priorityIps, ...otherIps];

        all.forEach(ip => {
            const option = document.createElement('option');
            option.value = ip.address;
            option.textContent = `${ip.address} (${ip.name})`;
            if (ip.address === currentIp) {
                option.selected = true;
            }
            selector.appendChild(option);
        });

        // 绑定切换事件
        selector.onchange = async (e) => {
            const newIp = e.target.value;
            // 保存偏好
            await window.mediaflow.store.set('mobileflowPreferredIp', newIp);
            // 刷新二维码和 URL
            await this.controller.service.loadQRCode(newIp);
            const port = await this.controller.service.getConfiguredPort?.() || 8765;
            const newUrl = `http://${newIp}:${port}`;
            this.updateUrlText(newUrl);
            this.controller.service.serverUrl = newUrl;
        };
    }

    /**
     * 渲染二维码
     */
    renderQRCode(qrDataUrl) {
        const qrContainer = document.getElementById('mobile-qr-code');
        if (qrContainer) {
            qrContainer.replaceChildren();
            const img = document.createElement('img');
            img.src = this.safeText(qrDataUrl);
            img.alt = 'QR Code';
            qrContainer.appendChild(img);
        }
    }

    /**
     * 添加接收到的文件到历史记录
     */
    addFileToHistory(file) {
        const list = document.getElementById('pending-urls-list');
        if (!list) return;

        const emptyHint = list.querySelector('.empty-hint');
        if (emptyHint) emptyHint.remove();

        const item = document.createElement('div');
        item.className = 'pending-item';
        const fileName = this.safeText(file?.name || 'Untitled');
        const filePath = this.safeText(file?.path);
        const icon = fileName.match(/\.(mp4|mov|avi|mkv)$/i) ? '🎬' :
            fileName.match(/\.(jpg|png|jpeg|gif)$/i) ? '🖼️' : '📄';
        const safeFileName = this.escapeHtml(fileName);
        const safeFilePath = this.escapeHtml(filePath);
        const safeOpenFolder = this.escapeHtml(window.i18n.t('mobile.history.openFolder'));
        const safeStatus = this.escapeHtml(window.i18n.t('mobile.history.statusSaved'));

        item.innerHTML = `
            <span class="pending-url" style="display: flex; align-items: center; gap: 8px;">
                <span class="file-icon">${icon}</span>
                <span class="file-name" title="${safeFilePath}">${safeFileName}</span>
            </span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button class="btn-open-folder" title="${safeOpenFolder}" style="background:none; border:none; cursor:pointer; color: #a0a0b8; transition: color 0.2s; padding: 4px; display: flex; align-items: center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                </button>
                <span class="pending-status success">${safeStatus}</span>
            </div>
        `;

        const btn = item.querySelector('.btn-open-folder');
        if (btn) {
            btn.onclick = () => {
                if (window.mediaflow?.shell?.showItemInFolder) {
                    window.mediaflow.shell.showItemInFolder(filePath);
                }
            };
        }

        list.prepend(item);
    }

    /**
     * 添加接收到的链接到列表
     */
    addToPendingList(url) {
        const list = document.getElementById('pending-urls-list');
        if (!list) return;

        const emptyHint = list.querySelector('.empty-hint');
        if (emptyHint) emptyHint.remove();

        const item = document.createElement('div');
        item.className = 'pending-item';
        const rawUrl = this.safeText(url);
        const displayUrl = `${rawUrl.substring(0, 60)}${rawUrl.length > 60 ? '...' : ''}`;
        const safeUrl = this.escapeHtml(displayUrl);
        const safeStatus = this.escapeHtml(window.i18n.t('mobile.history.statusQueued'));
        item.innerHTML = `
            <span class="pending-url">${safeUrl}</span>
            <span class="pending-status">${safeStatus}</span>
        `;
        list.prepend(item);
    }
}

window.MobileFlowUIManager = MobileFlowUIManager;
