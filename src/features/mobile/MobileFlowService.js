/**
 * MobileFlowService.js
 * 负责手机互联的逻辑处理与 IPC 通讯
 */

class MobileFlowService {
    /**
     * @param {MobileFlow} controller - MobileFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.isRunning = false;
        this.serverUrl = null;
    }

    /**
     * 启动服务
     */
    async getConfiguredPort() {
        const raw = await window.mediaflow?.store?.get?.('mobileflowPort', 8765);
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 1024 || n > 65535) return 8765;
        return Math.floor(n);
    }

    async startServer() {
        try {
            const port = await this.getConfiguredPort();
            const result = await window.mediaflow?.mobileflow.start(port);

            if (result?.success) {
                this.isRunning = true;
                this.controller.uiManager.updateStatus(true, result.url);

                // 检查保存的首选 IP
                const savedIp = await window.mediaflow.store.get('mobileflowPreferredIp');
                let targetIp = result.ip;
                const listenPort = result.port || port;

                if (savedIp && Array.isArray(result.allIps) && result.allIps.some(i => i.address === savedIp)) {
                    targetIp = savedIp;
                }

                // Always keep a usable serverUrl (copy / cast depend on it)
                this.serverUrl = `http://${targetIp}:${listenPort}`;
                this.controller.uiManager.updateUrlText(this.serverUrl);
                this.controller.uiManager.updateStatus(true, this.serverUrl);

                // 渲染 IP 选择器
                if (result.allIps && result.allIps.length > 0) {
                    this.controller.uiManager.renderIpSelector(result.allIps, targetIp);
                }

                await this.loadQRCode(targetIp);
                await this.maybeShowPinGuidance();
                return { success: true, ip: targetIp, url: this.serverUrl, port: listenPort };
            } else {
                throw new Error(result?.error || 'Operation failed');
            }
        } catch (error) {
            console.error('[MobileFlowService] Start error:', error);
            window.app?.showToast((window.i18n?.t('mobile.startFail') || 'Failed to start service:') + ' ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Soft PIN guidance: once per install until user sets PIN or dismisses via saving empty after seen.
     */
    async maybeShowPinGuidance() {
        try {
            const pin = (await window.mediaflow?.store?.get?.('mobileflowPin', '')) || '';
            const seen = await window.mediaflow?.store?.get?.('mobileflowPinHintSeen', false);
            if (pin || seen) return;
            await window.mediaflow?.store?.set?.('mobileflowPinHintSeen', true);
            window.app?.showToast?.(
                window.i18n?.t?.('mobile.messages.pinRecommend')
                    || '建议设置 PIN：同一 Wi‑Fi 下他人也能打开此链接。可在「设置」中配置。',
                'info'
            );
        } catch (e) {
            console.warn('[MobileFlowService] pin guidance failed', e);
        }
    }

    /**
     * Apply new port; restart server if currently running.
     */
    async applyPort(port) {
        const n = Number(port);
        if (!Number.isFinite(n) || n < 1024 || n > 65535) {
            window.app?.showToast?.(
                window.i18n?.t?.('mobile.messages.portInvalid') || '端口需在 1024–65535 之间',
                'warning'
            );
            return { success: false };
        }
        const portInt = Math.floor(n);
        await window.mediaflow?.store?.set?.('mobileflowPort', portInt);
        const wasRunning = this.isRunning;
        if (wasRunning) {
            await this.stopServer();
            const r = await this.startServer();
            if (r?.success) {
                window.app?.showToast?.(
                    window.i18n?.t?.('mobile.messages.portSavedRestarted', { port: portInt })
                        || `端口已改为 ${portInt}，服务已重启`,
                    'success'
                );
            }
            return r;
        }
        window.app?.showToast?.(
            window.i18n?.t?.('mobile.messages.portSaved', { port: portInt })
                || `端口已保存为 ${portInt}（下次启动生效）`,
            'success'
        );
        return { success: true, port: portInt };
    }

    /**
     * 停止服务
     */
    async stopServer() {
        try {
            await window.mediaflow?.mobileflow.stop();
            this.isRunning = false;
            this.serverUrl = null;
            this.controller.uiManager.updateStatus(false);
        } catch (error) {
            console.error('[MobileFlowService] Stop error:', error);
        }
    }

    /**
     * 加载 QR 码
     */
    async loadQRCode(ip = null) {
        try {
            const result = await window.mediaflow?.mobileflow.getRemoteQR(ip);
            if (result?.success && result.qrCode) {
                this.controller.uiManager.renderQRCode(result.qrCode);
            } else {
                console.error('[MobileFlowService] QR generation failed:', result);
            }
        } catch (error) {
            console.error('[MobileFlowService] QR error:', error);
        }
    }

    /**
     * 处理收到的 URL
     */
    handleReceivedUrl(request) {
        // 处理文件上传事件
        if (typeof request === 'object' && request.type === 'file_upload') {
            const files = request.files || [];
            if (files.length > 0) {
                window.app?.showToast(window.i18n?.t('mobile.receivedFiles', { count: files.length }) || `📩 Successfully received ${files.length} files`, 'success');
                files.forEach(f => this.controller.uiManager.addFileToHistory(f));
            }
            return;
        }

        // 处理投屏播放请求
        if (typeof request === 'object' && (request.type === 'play' || request.type === 'play_file' || request.type === 'image' || request.type === 'file')) {
            this.handleCastRequest(request);
            return;
        }

        // 处理播放器控制命令
        if (typeof request === 'object' && request.type === 'player_command') {
            const { action, value } = request;
            window.mediaflow?.mobileflow.sendPlayerCommand({ action, value });
            return;
        }

        // 处理错误
        if (typeof request === 'object' && request.type === 'error') {
            window.app?.showToast((window.i18n?.t('mobile.opFail') || '⚠️ Operation failed') + ': ' + (request.message || ''), 'error');
            return;
        }

        const url = typeof request === 'string' ? request : request.url;
        const options = typeof request === 'object' ? {
            quality: request.quality || 'best',
            audioOnly: request.audioOnly || false,
            writeThumbnail: request.writeThumbnail || false,
            writeSubtitles: request.writeSubtitles || false
        } : {};

        window.app?.showToast((window.i18n?.t('mobile.receivedLink') || 'Received link:') + ' ' + url.substring(0, 50) + '...', 'info');

        // 添加到 UI 待处理列表
        this.controller.uiManager.addToPendingList(url);

        // 自动开始下载
        if (window.app?.startDownloadWithOptions) {
            window.app.startDownloadWithOptions(url, options);
        } else if (window.app?.startDownload) {
            window.app.startDownload(url);
        }
    }

    /**
     * 处理投屏请求
     */
    async handleCastRequest(request) {
        const { type, url, id } = request;

        let playUrl = url;

        if (type === 'play_file') {
            const port = await this.getConfiguredPort().catch(() => 8765);
            const baseServerUrl = this.serverUrl || `http://localhost:${port}`;
            playUrl = `${baseServerUrl}/file/${id}`;

            const t = (k, fb) => window.i18n?.t?.(k) || fb;
            window.mediaflow?.mobileflow.openPlayer({
                url: playUrl,
                title: t('mobile.cast.localFileTitle', 'Cast local file'),
                type: 'play_file'
            });
            window.app?.showToast(t('mobile.playingLocal', 'Playing local file'), 'success');
            return;
        }

        if (type === 'error') {
            window.app?.showToast((window.i18n?.t('mobile.castFail') || 'Cast failed:') + ' ' + (request.message || 'Unknown error'), 'error');
            return;
        }

        if (request.resolved) {
            window.mediaflow?.mobileflow.openPlayer({
                url: request.url,
                title: request.title || (window.i18n?.t('mobile.cast.streamTitle') || 'Cast'),
                type: 'play',
                resolved: true
            });
            window.app?.showToast(window.i18n?.t('mobile.castLinkReceived') || 'Received cast link', 'success');
            return;
        }

        if (type === 'play' || type === 'image' || type === 'file') {
            const isDirect = /\.(mp4|mkv|webm|mov|m3u8|flv|avi)$/i.test(url.split('?')[0]) || type === 'image' || type === 'file';
            const t = (k, fb) => window.i18n?.t?.(k) || fb;

            if (isDirect) {
                const fallbackTitle = type === 'image'
                    ? t('mobile.cast.imageTitle', 'Image')
                    : (type === 'file' ? t('mobile.cast.fileTitle', 'Document') : t('mobile.cast.streamTitle', 'Cast'));
                window.mediaflow?.mobileflow.openPlayer({
                    url: url,
                    title: request.title || fallbackTitle,
                    type: type
                });
                return;
            }

            try {
                window.app?.showToast(window.i18n?.t('mobile.parsingUrl') || 'Parsing video address...', 'info');
                window.mediaflow?.mobileflow.openPlayer({
                    url: '',
                    title: t('mobile.cast.resolvingTitle', 'Resolving link…'),
                    type: 'play'
                });

                const info = await window.mediaflow?.video.getInfo(url);

                if (info && info.success && info.url) {
                    window.mediaflow?.mobileflow.openPlayer({
                        url: info.url,
                        title: info.title || t('mobile.cast.streamTitle', 'Cast'),
                        type: 'play',
                        resolved: true
                    });
                    window.app?.showToast(window.i18n?.t('mobile.parseSuccess') || 'Parse success', 'success');
                } else {
                    const errorMsg = info?.error || 'Operation failed';
                    window.app?.showToast((window.i18n?.t('mobile.castFailMsg') || 'Cast failed:') + ' ' + errorMsg, 'error');
                }
            } catch (err) {
                console.error('[MobileFlowService] Cast resolution error:', err);
                window.app?.showToast(window.i18n?.t('mobile.parseError') || 'Error parsing video address', 'error');
            }
        }
    }
}

window.MobileFlowService = MobileFlowService;
