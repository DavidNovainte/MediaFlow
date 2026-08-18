/**
 * SettingsFlow.js
 * Application settings logic and UI bindings.
 */

class SettingsFlow {
    constructor(app) {
        this.app = app;
        this.elements = {};
        this.engineProgressCleanup = null;
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.updateDevOnlyVisibility();
        await this.loadSettings();
        this.checkYtdlp();
        this.refreshStorageStats();
        this.loadAppVersion();
        this.loadEngineStatus();
    }

    cacheElements() {
        const root = document.getElementById('page-settings') || document;
        const byId = (id) => root.querySelector?.(`#${id}`) || document.getElementById(id);
        this.elements = {
            btnChangePath: byId('btn-change-path'),
            currentPath: byId('current-download-path'),
            language: byId('setting-language'),
            theme: byId('setting-theme'),
            playlistLimit: byId('setting-playlist-limit'),
            createChannelFolder: byId('setting-create-channel-folder'),
            timeGroup: byId('setting-time-group'),
            useArchive: byId('setting-use-archive'),
            filenameTemplate: byId('setting-filename-template'),
            completionAction: byId('setting-download-completion-action'),
            externalReceiveMode: byId('setting-external-receive-mode'),
            proxyEnabled: byId('setting-proxy-enabled'),
            proxyArea: byId('proxy-config-area'),
            proxyType: byId('setting-proxy-type'),
            proxyHost: byId('setting-proxy-host'),
            proxyPort: byId('setting-proxy-port'),
            proxyUser: byId('setting-proxy-user'),
            proxyPass: byId('setting-proxy-pass'),
            btnTestProxy: byId('btn-test-proxy'),
            proxyStatus: byId('proxy-test-status'),

            ytdlpStatus: byId('downloader-status'),
            logReportingEnabled: byId('setting-log-reporting-enabled'),
            clipboardWatchEnabled: byId('setting-clipboard-watch-enabled'),
            clipboardDetectMode: byId('setting-clipboard-detect-mode'),
            clipboardDetectModeRow: byId('clipboard-detect-mode-row'),
            btnSendTestReport: byId('btn-send-test-report'),
            testReportSettingItem: byId('test-report-setting-item'),
            // Download performance
            downloadSpeedLimit: byId('setting-download-speed-limit'),
            concurrentFragments: byId('setting-concurrent-fragments'),
            forceMultithread: byId('setting-force-multithread'),
            maxConcurrent: byId('setting-max-concurrent'),

            // Storage Management
            storageStatsText: byId('storage-stats-text'),
            btnCleanup: byId('btn-cleanup-now'),
            btnOpenLogsDir: byId('btn-open-logs-dir'),
            btnDonate: byId('btn-donate'),

            // Custom Modal
            modal: byId('custom-modal'),
            modalTitle: byId('modal-title'),
            modalMessage: byId('modal-message'),
            btnModalConfirm: byId('btn-modal-confirm'),
            btnModalCancel: byId('btn-modal-cancel'),

            // Engine Dashboard
            engineContainer: byId('engine-list-container'),
            btnCheckEngineUpdates: byId('btn-check-engine-updates'),
            checkAutoUpdateEngines: byId('check-auto-update-engines'),
            engineLogBox: byId('engine-update-log-box'),
            engineLogContent: byId('engine-update-log-content')
        };
    }

    async updateDevOnlyVisibility() {
        const testReportItem = this.elements.testReportSettingItem;
        if (!testReportItem) return;

        try {
            const isPackaged = await window.mediaflow?.app?.isPackaged?.();
            testReportItem.classList.toggle('hidden', !!isPackaged);
        } catch (error) {
            if (!String(error?.message || error).includes('No handler registered')) {
                console.warn('[Settings] Failed to resolve packaged state for dev-only controls:', error);
            }
            testReportItem.classList.remove('hidden');
        }
    }

    async loadSettings() {
        let path = await window.mediaflow.store.get('downloadPath');
        
        // Fallback to system Downloads folder if not set
        if (!path) {
            try {
                path = await window.mediaflow.app.getAppPath('downloads');
                if (path) {
                    await window.mediaflow.store.set('downloadPath', path);
                    console.log('[Settings] No download path found, defaulting to:', path);
                }
            } catch (e) {
                console.error('[Settings] Failed to get system downloads path:', e);
            }
        }

        if (path) {
            if (this.elements.currentPath) this.elements.currentPath.textContent = path;
            this.app.defaultDownloadPath = path;
        }

        let lang = await window.mediaflow.store.get('language') || 'en-US';
        // Legacy mapping
        if (lang === 'zh') lang = 'zh-CN';
        if (lang === 'en') lang = 'en-US';
        if (this.elements.language) this.elements.language.value = lang;
        if (window.i18n?.setLanguage) window.i18n.setLanguage(lang);

        // Appearance: light (default) | dark
        try {
            let theme = await window.mediaflow.store.get('uiTheme');
            if (theme !== 'light' && theme !== 'dark') {
                theme = window.ThemeManager?.getTheme?.() || 'light';
            }
            if (this.elements.theme) this.elements.theme.value = theme;
            if (window.ThemeManager?.apply) window.ThemeManager.apply(theme);
        } catch (themeErr) {
            console.warn('[Settings] theme load failed:', themeErr);
        }

        if (this.elements.playlistLimit) this.elements.playlistLimit.value = await window.mediaflow.store.get('playlistLimit') || 1000;
        if (this.elements.createChannelFolder) this.elements.createChannelFolder.checked = await window.mediaflow.store.get('createChannelFolder') ?? true;
        if (this.elements.timeGroup) this.elements.timeGroup.value = await window.mediaflow.store.get('timeGroup') || 'none';
        if (this.elements.useArchive) this.elements.useArchive.checked = await window.mediaflow.store.get('useArchive') ?? true;
        if (this.elements.filenameTemplate) this.elements.filenameTemplate.value = await window.mediaflow.store.get('filenameTemplate') || '%(title)s.%(ext)s';
        if (this.elements.completionAction) this.elements.completionAction.value = await window.mediaflow.store.get('downloadCompletionAction') || 'none';
        if (this.elements.externalReceiveMode) {
            const mode = await window.mediaflow.store.get('externalReceiveMode');
            this.elements.externalReceiveMode.value = mode === 'silent' ? 'silent' : 'focus';
        }

        const proxyEnabled = await window.mediaflow.store.get('proxyEnabled') || false;
        if (this.elements.proxyEnabled) this.elements.proxyEnabled.checked = proxyEnabled;
        this.toggleProxyArea(proxyEnabled);

        if (this.elements.proxyType) this.elements.proxyType.value = await window.mediaflow.store.get('proxyType') || 'http';
        if (this.elements.proxyHost) this.elements.proxyHost.value = await window.mediaflow.store.get('proxyHost') || '';
        if (this.elements.proxyPort) this.elements.proxyPort.value = await window.mediaflow.store.get('proxyPort') || '';
        if (this.elements.proxyUser) this.elements.proxyUser.value = await window.mediaflow.store.get('proxyUser') || '';
        if (this.elements.proxyPass) this.elements.proxyPass.value = await window.mediaflow.store.get('proxyPass') || '';



        // Load Logger Config
        if (this.elements.logReportingEnabled) {
            const enabled = await window.mediaflow.store.get('logReportingEnabled') ?? true;
            this.elements.logReportingEnabled.checked = enabled;
            if (window.Logger?.toggleReporting) window.Logger.toggleReporting(enabled);
        }

        // Clipboard link watch (privacy default: off)
        if (this.elements.clipboardWatchEnabled) {
            let clipboardEnabled = false;
            try {
                if (window.mediaflow?.clipboard?.getEnabled) {
                    clipboardEnabled = !!(await window.mediaflow.clipboard.getEnabled());
                } else {
                    clipboardEnabled = !!(await window.mediaflow.store.get('clipboardWatchEnabled', false));
                }
            } catch (clipboardErr) {
                console.warn('[Settings] clipboard enabled load failed:', clipboardErr);
                clipboardEnabled = !!(await window.mediaflow.store.get('clipboardWatchEnabled', false));
            }
            this.elements.clipboardWatchEnabled.checked = clipboardEnabled;
            this._syncClipboardModeRow(clipboardEnabled);
        }

        if (this.elements.clipboardDetectMode) {
            let mode = 'balanced';
            try {
                if (window.mediaflow?.clipboard?.getDetectMode) {
                    mode = (await window.mediaflow.clipboard.getDetectMode()) || 'balanced';
                } else {
                    mode = (await window.mediaflow.store.get('clipboardDetectMode', 'balanced')) || 'balanced';
                }
            } catch (modeErr) {
                console.warn('[Settings] clipboard detect mode load failed:', modeErr);
            }
            if (!['strict', 'balanced', 'loose'].includes(mode)) mode = 'balanced';
            this.elements.clipboardDetectMode.value = mode;
        }



        // 鍔犺浇涓嬭浇鎬ц兘璁剧疆
        if (this.elements.downloadSpeedLimit) {
            this.elements.downloadSpeedLimit.value = await window.mediaflow.store.get('downloadSpeedLimit') || 0;
        }
        if (this.elements.concurrentFragments) {
            this.elements.concurrentFragments.value = await window.mediaflow.store.get('concurrentFragments') || 3;
        }
        if (this.elements.forceMultithread) {
            this.elements.forceMultithread.checked = await window.mediaflow.store.get('forceMultithread') || false;
        }

        if (this.elements.maxConcurrent) {
            const stored = await window.mediaflow.store.get('maxConcurrent');
            this.elements.maxConcurrent.value = stored ?? 2;
        }

        if (this.elements.checkAutoUpdateEngines) {
            this.elements.checkAutoUpdateEngines.checked = await window.mediaflow.store.get('autoUpdateEngines') || false;
        }

    }

    bindEvents() {
        this.elements.btnChangePath?.addEventListener('click', async () => {
            const path = await window.mediaflow.dialog.selectFolder();
            if (path) {
                await window.mediaflow.store.set('downloadPath', path);
                this.elements.currentPath.textContent = path;
                this.app.defaultDownloadPath = path;
            }
        });

        this.elements.language?.addEventListener('change', (e) => window.i18n.setLanguage(e.target.value));
        this.elements.theme?.addEventListener('change', async (e) => {
            const theme = e.target.value === 'light' ? 'light' : 'dark';
            if (window.ThemeManager?.setTheme) {
                await window.ThemeManager.setTheme(theme);
            } else {
                document.documentElement.setAttribute('data-theme', theme);
                await window.mediaflow?.store?.set?.('uiTheme', theme);
            }
        });

        this.bindSetting(this.elements.playlistLimit, 'playlistLimit', 'int');
        this.bindSetting(this.elements.createChannelFolder, 'createChannelFolder', 'bool');
        this.bindSetting(this.elements.timeGroup, 'timeGroup');
        this.bindSetting(this.elements.filenameTemplate, 'filenameTemplate');
        this.bindSetting(this.elements.useArchive, 'useArchive', 'bool');
        this.bindSetting(this.elements.completionAction, 'downloadCompletionAction');
        this.bindSetting(this.elements.externalReceiveMode, 'externalReceiveMode');

        this.elements.proxyEnabled?.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            await window.mediaflow.store.set('proxyEnabled', enabled);
            this.toggleProxyArea(enabled);
        });

        this.bindSetting(this.elements.proxyType, 'proxyType');
        this.bindSetting(this.elements.proxyHost, 'proxyHost');
        this.bindSetting(this.elements.proxyPort, 'proxyPort');
        this.bindSetting(this.elements.proxyUser, 'proxyUser');
        this.bindSetting(this.elements.proxyPass, 'proxyPass');

        this.elements.btnTestProxy?.addEventListener('click', () => this.testProxy());





        // Download performance bindings
        this.bindSetting(this.elements.downloadSpeedLimit, 'downloadSpeedLimit', 'int');
        this.bindSetting(this.elements.concurrentFragments, 'concurrentFragments', 'int');
        this.bindSetting(this.elements.forceMultithread, 'forceMultithread', 'bool');
        this.elements.maxConcurrent?.addEventListener('change', async (e) => {
            const val = parseInt(e.target.value) || 2;
            await window.mediaflow.store.set('maxConcurrent', val);
            // 即时更新正在运行的队列管理器
            if (window.app?.queueManager) window.app.queueManager.config.maxConcurrency = val;
        });

        // Storage Cleanup
        this.elements.btnCleanup?.addEventListener('click', () => this.handleCleanup());
        this.elements.storageStatsText?.addEventListener('click', () => this.refreshStorageStats());
        this.elements.btnOpenLogsDir?.addEventListener('click', () => this.handleOpenLogsDir());
        this.elements.btnDonate?.addEventListener('click', () => {
            this.app?.switchPage?.('donation');
        });
        this.bindSetting(this.elements.logReportingEnabled, 'logReportingEnabled', 'bool', (val) => {
            if (window.Logger?.toggleReporting) window.Logger.toggleReporting(val);
        });
        this.elements.clipboardWatchEnabled?.addEventListener('change', async (e) => {
            const enabled = !!e.target.checked;
            try {
                if (window.mediaflow?.clipboard?.setEnabled) {
                    await window.mediaflow.clipboard.setEnabled(enabled);
                } else {
                    await window.mediaflow.store.set('clipboardWatchEnabled', enabled);
                }
                this._syncClipboardModeRow(enabled);
            } catch (err) {
                console.error('[Settings] clipboard toggle failed:', err);
                e.target.checked = !enabled;
            }
        });
        this.elements.clipboardDetectMode?.addEventListener('change', async (e) => {
            const mode = e.target.value || 'balanced';
            try {
                if (window.mediaflow?.clipboard?.setDetectMode) {
                    const saved = await window.mediaflow.clipboard.setDetectMode(mode);
                    e.target.value = saved || mode;
                } else {
                    await window.mediaflow.store.set('clipboardDetectMode', mode);
                }
            } catch (err) {
                console.error('[Settings] clipboard detect mode failed:', err);
            }
        });
        this.elements.btnSendTestReport?.addEventListener('click', () => this.sendTestReport());

        this.elements.checkAutoUpdateEngines?.addEventListener('change', async (e) => {
            await window.mediaflow.store.set('autoUpdateEngines', e.target.checked);
        });

        if (this.elements.storageStatsText) this.elements.storageStatsText.style.cursor = 'pointer';

        // Engine Dashboard Events
        this.elements.btnCheckEngineUpdates?.addEventListener('click', () => this.checkEngineUpdates());

        // Listen for update logs
        if (this.engineProgressCleanup) {
            this.engineProgressCleanup();
            this.engineProgressCleanup = null;
        }
        if (window.mediaflow?.engine?.onUpdateProgress) {
            this.engineProgressCleanup = window.mediaflow.engine.onUpdateProgress(({ log } = {}) => {
                if (this.elements.engineLogBox) this.elements.engineLogBox.classList.remove('hidden');
                if (this.elements.engineLogContent) {
                    this.elements.engineLogContent.textContent += log || '';
                    this.elements.engineLogBox.scrollTop = this.elements.engineLogBox.scrollHeight;
                }
            });
        }

        // Bind license links
        document.querySelectorAll('.license-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = e.target.getAttribute('data-url');
                if (url && window.mediaflow?.shell) {
                    window.mediaflow.shell.openExternal(url);
                }
            });
        });

        // Listen for language changes to re-render dynamic parts
        window.addEventListener('languageChanged', () => {
            this.loadEngineStatus();
            this.refreshStorageStats();
        });
    }



    bindSetting(element, key, type = 'string') {
        element?.addEventListener('change', async (e) => {
            let value = e.target.value;
            if (type === 'int') value = parseInt(value) || 0;
            if (type === 'bool') value = e.target.checked;
            await window.mediaflow.store.set(key, value);
        });
    }

    toggleProxyArea(show) {
        if (this.elements.proxyArea) {
            if (show) this.elements.proxyArea.classList.remove('hidden');
            else this.elements.proxyArea.classList.add('hidden');
        }
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async testProxy() {
        const btn = this.elements.btnTestProxy;
        const status = this.elements.proxyStatus;
        if (!btn || !status) return;

        btn.disabled = true;
        status.textContent = window.i18n.t('settings.testing');

        try {
            const config = {
                type: this.elements.proxyType.value,
                host: this.elements.proxyHost.value.trim(),
                port: this.elements.proxyPort.value.trim(),
                user: this.elements.proxyUser.value.trim(),
                pass: this.elements.proxyPass.value
            };
            const result = await window.mediaflow.video.testProxy(config);
            status.textContent = result.success ? window.i18n.t('settings.testSuccess') : window.i18n.t('settings.testFailed');
            status.style.color = result.success ? 'var(--success)' : 'var(--error)';
        } catch {
            status.textContent = window.i18n.t('settings.updateError');
            status.style.color = 'var(--error)';
        } finally {
            btn.disabled = false;
        }
    }

    async checkYtdlp() {
        const statusEl = this.elements.ytdlpStatus;
        if (!statusEl) return;
        try {
            // 澧炲姞 5 绉掕秴鏃朵繚鎶?
            const checkPromise = window.mediaflow.downloader.check();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), 5000)
            );

            const result = await Promise.race([checkPromise, timeoutPromise]);
            const runningText = window.i18n.t('settings.statusRunning');
            const notReadyText = window.i18n.t('settings.statusNotReady');
            statusEl.textContent = result.installed ? `${runningText} (v${result.version})` : notReadyText;
            statusEl.style.color = result.installed ? 'var(--success)' : 'var(--error)';
        } catch (e) {
            statusEl.textContent = e.message === 'TIMEOUT' ? window.i18n.t('settings.checkTimeout') : window.i18n.t('settings.updateError');
            statusEl.style.color = 'var(--error)';
            console.error('[Settings] Downloader check failed:', e);
        }
    }

    // ==================== Storage Management ====================

    async refreshStorageStats() {
        if (!this.elements.storageStatsText) return;
        this.elements.storageStatsText.textContent = window.i18n.t('settings.storageCalculating');

        try {
            const result = await window.mediaflow.system.getStorageStats();
            if (result.success) {
                const { total, temp, logs, isPartial } = result.stats;
                const formatSize = (bytes) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
                    return isNaN(val) ? '0 B' : val + ' ' + sizes[i];
                };

                const tempLabel = window.i18n.t('settings.storageTemp');
                const logLabel = window.i18n.t('settings.storageLogs');
                
                let displayText = `${formatSize(total)} (${tempLabel}: ${formatSize(temp)} | ${logLabel}: ${formatSize(logs)})`;
                if (isPartial) {
                    displayText = `> ${displayText} (${window.i18n.t('settings.storageTimeout')})`;
                }
                this.elements.storageStatsText.textContent = displayText;
            } else {
                this.elements.storageStatsText.textContent = window.i18n.t('settings.storageFailed');
            }
        } catch (e) {
            console.error('Failed to get storage stats:', e);
            if (this.elements.storageStatsText) {
                this.elements.storageStatsText.textContent = window.i18n.t('settings.updateError');
            }
        }
    }

    _syncClipboardModeRow(enabled) {
        const row = this.elements.clipboardDetectModeRow;
        if (!row) return;
        row.style.opacity = enabled ? '1' : '0.55';
        if (this.elements.clipboardDetectMode) {
            this.elements.clipboardDetectMode.disabled = !enabled;
        }
    }

    async handleOpenLogsDir() {
        try {
            if (!window.mediaflow?.system?.openLogsDir) {
                throw new Error('Open logs API is unavailable');
            }
            const result = await window.mediaflow.system.openLogsDir();
            if (!result?.success) {
                const msg = result?.error || 'unknown error';
                alert(`${window.i18n?.t?.('settings.openLogsFailed') || 'Failed to open logs folder'}: ${msg}`);
            }
        } catch (e) {
            console.error('[Settings] openLogsDir failed:', e);
            alert(`${window.i18n?.t?.('settings.openLogsFailed') || 'Failed to open logs folder'}: ${e.message}`);
        }
    }

    async handleCleanup() {
        if (!this.elements.modal) {
            // Fallback if modal is missing (e.g. partial reload)
            if (!confirm(window.i18n.t('settings.cleanupConfirmMessage'))) return;
        } else {
            const confirmed = await this.showConfirmDialog(
                window.i18n.t('settings.cleanupConfirmTitle'),
                window.i18n.t('settings.cleanupConfirmMessage')
            );
            if (!confirmed) return;
        }

        const btn = this.elements.btnCleanup;
        if (btn) btn.disabled = true;

        const originalText = this.elements.storageStatsText?.textContent;
        if (this.elements.storageStatsText) this.elements.storageStatsText.textContent = window.i18n.t('settings.cleaning');

        try {
            // Error handling wrapper
            if (!window.mediaflow?.system?.cleanup) {
                throw new Error('Cleanup API is unavailable');
            }

            const result = await window.mediaflow.system.cleanup();
            if (result.success) {
                window.mediaflow.notification.show({
                    title: window.i18n.t('settings.cleanupDone'),
                    body: window.i18n.t('settings.cleanupDoneDesc')
                });
                await this.refreshStorageStats();
            } else {
                // If it's the "No handler registered" error, suggest restart
                if (result.error && result.error.includes('No handler')) {
                    alert(window.i18n.t('settings.restartToApply'));
                } else {
                    alert(`${window.i18n.t('settings.cleanFail')}: ${result.error}`);
                }
                // Restore text on failure
                if (this.elements.storageStatsText) this.elements.storageStatsText.textContent = originalText;
            }
        } catch (e) {
            console.error('Cleanup failed:', e);
            if (e.message.includes('Cleanup API is unavailable')) {
                alert(window.i18n.t('settings.restartToLoad'));
            } else {
                alert(`${window.i18n.t('settings.cleanError')}: ${e.message}`);
            }
            if (this.elements.storageStatsText) this.elements.storageStatsText.textContent = originalText;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async sendTestReport() {
        const btn = this.elements.btnSendTestReport;
        const originalContent = btn?.innerHTML;

        if (btn) {
            btn.disabled = true;
            btn.textContent = window.i18n?.t('settings.sendingTestReport') || 'Sending...';
        }

        try {
            if (!window.mediaflow?.system?.reportError) {
                throw new Error('Error reporting API is unavailable');
            }

            const version = await window.mediaflow?.app?.getVersion?.().catch(() => 'unknown') || 'unknown';
            const reportData = {
                type: 'TEST_REPORT',
                version,
                message: `Manual test report from Settings at ${new Date().toISOString()}`,
                stack: 'SettingsFlow.sendTestReport',
                logs: []
            };

            const result = await window.mediaflow.system.reportError(reportData);
            if (!result?.success) {
                throw new Error(result?.error || 'Unknown error');
            }

            window.mediaflow.notification?.show?.({
                title: window.i18n?.t('settings.testReportDone') || 'Test report sent',
                body: window.i18n?.t('settings.testReportDoneDesc') || 'Check your Google Sheet for a TEST_REPORT row.'
            });
        } catch (error) {
            console.error('[Settings] Test report failed:', error);
            const title = window.i18n?.t('settings.testReportFailed') || 'Test report failed';
            const body = error.message || String(error);

            if (window.app?.ui?.showToast) {
                window.app.ui.showToast(`${title}: ${body}`, 'error');
            } else if (window.mediaflow?.notification?.show) {
                window.mediaflow.notification.show({ title, body });
            } else {
                alert(`${title}: ${body}`);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalContent || (window.i18n?.t('settings.sendTestReport') || 'Send Test Report');
            }
        }
    }

    showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            if (!this.elements.modal) {
                resolve(confirm(message));
                return;
            }

            const { modal, modalTitle, modalMessage, btnModalConfirm, btnModalCancel } = this.elements;

            modalTitle.textContent = title;
            modalMessage.textContent = message;
            // 鐩存帴鎿嶄綔 style.display 鑰岄潪渚濊禆 CSS class
            modal.style.display = 'flex';
            modal.classList.add('active');

            // Cleanup helper to avoid listener leaks
            const cleanup = () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                btnModalConfirm.removeEventListener('click', onConfirm);
                btnModalCancel.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdropClick);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const onBackdropClick = (e) => {
                if (e.target === modal) {
                    onCancel();
                }
            };

            btnModalConfirm.addEventListener('click', onConfirm);
            btnModalCancel.addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdropClick);
        });
    }

    // ==================== 鍔犺浇搴旂敤鐗堟湰鍙?====================
    async loadAppVersion() {
        let attempts = 0;
        const maxAttempts = 3;
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const tryGetVersion = async () => {
            try {
                const version = await window.mediaflow.app.getVersion();
                const versionDisplay = document.getElementById('app-version-display');
                if (versionDisplay) {
                    versionDisplay.textContent = `v${version}`;
                }
                return true;
            } catch (error) {
                console.warn(`[Settings] getVersion attempt ${attempts + 1} failed:`, error);
                return false;
            }
        };

        while (attempts < maxAttempts) {
            if (await tryGetVersion()) return;
            attempts++;
            if (attempts < maxAttempts) {
                await delay(attempts * 500); // 500ms, 1000ms
            }
        }

        console.error('[Settings] All attempts to load app version failed.');
        const versionDisplay = document.getElementById('app-version-display');
        if (versionDisplay) {
            versionDisplay.textContent = '—';
        }
    }

    // ==================== Engine Management ====================

    async loadEngineStatus() {
        if (!this.elements.engineContainer) return;

        // Always show core binary presence (yt-dlp / ffmpeg) even if EngineManager is unavailable.
        let binaryFallback = null;
        try {
            if (window.mediaflow?.system?.getBinaryStatus) {
                binaryFallback = await window.mediaflow.system.getBinaryStatus();
            }
        } catch (binErr) {
            console.warn('[Settings] getBinaryStatus failed:', binErr);
        }
        
        try {
            const status = await window.mediaflow.engine.getDetailedStatus();
            try {
                const ai = await window.mediaflow?.compress?.getAiEngineStatus?.();
                if (ai?.engines && typeof ai.engines === 'object') {
                    Object.assign(status, ai.engines);
                }
            } catch (aiErr) {
                console.warn('[Settings] getAiEngineStatus failed:', aiErr);
            }
            this.renderEngineList(status);

            if (!this._lastEngineCheckTime || Date.now() - this._lastEngineCheckTime > 3600000) {
                this.checkEngineUpdates(true);
                this._lastEngineCheckTime = Date.now();
            }
        } catch (e) {
            console.error('[Settings] Failed to load engine status:', e);
            if (this.elements.engineContainer) {
                if (binaryFallback?.success !== false && binaryFallback?.ytDlp) {
                    const map = {
                        'yt-dlp': {
                            name: 'yt-dlp',
                            installed: !!binaryFallback.ytDlp.found,
                            version: binaryFallback.ytDlp.found ? (binaryFallback.ytDlp.path || 'found') : 'N/A',
                            path: binaryFallback.ytDlp.path
                        },
                        ffmpeg: {
                            name: 'ffmpeg',
                            installed: !!binaryFallback.ffmpeg?.found,
                            version: binaryFallback.ffmpeg?.found ? (binaryFallback.ffmpeg.path || 'found') : 'N/A',
                            path: binaryFallback.ffmpeg?.path
                        }
                    };
                    this.renderEngineList(map);
                    const note = document.createElement('div');
                    note.className = 'status-text';
                    note.style.marginTop = '8px';
                    note.style.opacity = '0.75';
                    note.textContent = window.i18n?.t?.('settings.binaryFallbackNote')
                        || 'Showing core tools only (yt-dlp / ffmpeg). Put binaries in the app bin folder or PATH if missing.';
                    this.elements.engineContainer.appendChild(note);
                } else {
                    const failText = window.i18n?.t?.('settings.testFailed') || 'Failed';
                    const div = document.createElement('div');
                    div.className = 'status-text error';
                    div.textContent = `${failText}: ${e.message}`;
                    this.elements.engineContainer.innerHTML = '';
                    this.elements.engineContainer.appendChild(div);
                }
            }
        }
    }

    renderEngineList(status, updates = {}) {
        const container = this.elements.engineContainer;
        if (!container) return;

        let html = '';
        for (const [key, info] of Object.entries(status)) {
            // 澧炲己娓呯悊閫昏緫锛氭彁鍙栨棩鏈?(2026.02.07) 鎴?鏍囧噯鐗堟湰鍙?(4.0.1)
            // Compatible with spaced date formats
            const extractVer = (str) => {
                if (!str) return '';
                // 灏濊瘯鎻愬彇鏃ユ湡鏍煎紡 YYYY.MM.DD
                const dateMatch = str.replace(/\s+/g, '').match(/\d{4}[.\-/]\d{2}[.\-/]\d{2}/);
                if (dateMatch) return dateMatch[0];
                // 灏濊瘯鎻愬彇鏍囧噯鐗堟湰鍙?x.y.z
                const verMatch = str.match(/\d+\.\d+(\.\d+)*/);
                return verMatch ? verMatch[0] : str;
            };

            const cleanLocalVer = extractVer(info.version);
            const cleanRemoteVer = extractVer(updates[key]);
            
            // 鍙娓呯悊鍚庣殑鐗堟湰鍙蜂笉鍚岋紝涓旇繙绋嬬増鏈瓨鍦紝灏辨彁绀烘洿鏂?
            const hasUpdate = updates[key] && cleanLocalVer !== cleanRemoteVer;
            const latestVer = updates[key] || info.version;
            
            let statusClass = 'status-ok';
            let statusText = window.i18n.t('settings.engineStatusHealthy');
            if (!info.installed) {
                statusClass = 'status-missing';
                statusText = window.i18n.t('settings.engineStatusMissing');
            } else if (hasUpdate) {
                statusClass = 'status-warn';
                statusText = window.i18n.t('settings.engineStatusUpdateAvailable');
            }
            const safeKey = this.escapeHtml(key);
            const safeName = this.escapeHtml(info.name);
            const safeStatusText = this.escapeHtml(statusText);
            const safeVersion = this.escapeHtml(info.version);
            const safeLatestVer = this.escapeHtml(latestVer);
            const updateText = this.escapeHtml(info.installed ? (hasUpdate ? window.i18n.t('settings.engineUpdateNow') : window.i18n.t('settings.engineUpToDate')) : window.i18n.t('settings.engineInstallNow'));
            const manualText = this.escapeHtml(window.i18n.t('settings.engineManual'));
            const manualUrl = this.escapeHtml(key === 'ffmpeg' ? 'https://ffmpeg.org/download.html' : '#');

            html += `
                <div class="engine-card horizontal">
                    <div class="engine-card-left">
                        <div class="engine-header">
                            <span class="engine-name">${safeName}</span>
                            <span class="status-badge-sm ${statusClass}">${safeStatusText}</span>
                        </div>
                        <div class="engine-ver-row">
                            <span class="engine-v-label">${this.escapeHtml(window.i18n.t('settings.engineVersion'))}:</span>
                            <span class="engine-v-val">${safeVersion}</span>
                            ${hasUpdate ? `
                                <i class="fa-solid fa-angles-right" style="font-size: 10px; color: var(--text-warning); margin: 0 4px;"></i>
                                <span class="engine-v-val update-available">${safeLatestVer}</span>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="engine-card-right">
                        ${info.updateMethod !== 'manual' ? `
                            <button class="btn-update-now" 
                                ${!hasUpdate && info.installed ? 'disabled' : ''} 
                                data-engine-update="${safeKey}">
                                ${updateText}
                            </button>
                        ` : `
                            <button class="btn-secondary btn-small" style="opacity: 0.6;" 
                                data-external-url="${manualUrl}">
                                ${manualText}
                            </button>
                        `}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.querySelectorAll('[data-engine-update]').forEach(btn => {
            btn.addEventListener('click', () => this.performEngineUpdate(btn.dataset.engineUpdate));
        });
        container.querySelectorAll('[data-external-url]').forEach(btn => {
            btn.addEventListener('click', () => window.mediaflow?.shell?.openExternal(btn.dataset.externalUrl));
        });
        if (window.app) window.app.settings = this;
    }

    async checkEngineUpdates(silent = false) {
        const btn = this.elements.btnCheckEngineUpdates;
        if (btn) btn.disabled = true;

        try {
            const updates = await window.mediaflow.engine.checkUpdates();
            const status = await window.mediaflow.engine.getDetailedStatus();
            this.renderEngineList(status, updates);
            
            const hasAnyUpdate = Object.keys(updates).some(k => {
                const cleanLocal = this._extractVer(status[k]?.version);
                const cleanRemote = this._extractVer(updates[k]);
                return updates[k] && cleanLocal !== cleanRemote;
            });

            if (!silent) {
                window.mediaflow.notification.show({
                    title: window.i18n.t('settings.engineCheckDone'),
                    body: hasAnyUpdate ? window.i18n.t('settings.engineUpdateFound') : window.i18n.t('settings.engineNoUpdate')
                });
            }

            // If auto-update is on and an update exists, run it now
            if (hasAnyUpdate && this.elements.checkAutoUpdateEngines?.checked) {
                console.log('[Settings] Auto-updating components...');
                for (const key of Object.keys(updates)) {
                    const cleanL = this._extractVer(status[key]?.version);
                    const cleanR = this._extractVer(updates[key]);
                    if (updates[key] && cleanL !== cleanR && status[key]?.updateMethod !== 'manual') {
                        await this.performEngineUpdate(key, true); // true = silent
                    }
                }
            }
        } catch (e) {
            console.error('[Settings] Check updates failed:', e);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // 杈呭姪鏂规硶锛氭彁鍙栫増鏈彿
    _extractVer(str) {
        if (!str) return '';
        const dateMatch = str.replace(/\s+/g, '').match(/\d{4}[.\-/]\d{2}[.\-/]\d{2}/);
        if (dateMatch) return dateMatch[0];
        const verMatch = str.match(/\d+\.\d+(\.\d+)*/);
        return verMatch ? verMatch[0] : str;
    }

    async performEngineUpdate(key, silent = false) {
        if (this.elements.engineLogBox) {
            this.elements.engineLogBox.classList.remove('hidden');
            if (this.elements.engineLogContent) {
                const updatingText = window.i18n.t('settings.engineUpdating', { key: key });
                this.elements.engineLogContent.textContent = `[System] ${updatingText}\n`;
            }
        }

        try {
            const result = await window.mediaflow.engine.performUpdate(key);
            if (result.success) {
                if (!silent) {
                    window.mediaflow.notification.show({
                        title: window.i18n.t('settings.updateSuccess'),
                        body: window.i18n.t('settings.engineUpdateSuccess', { key: key })
                    });
                }
                await this.loadEngineStatus();
            } else {
                if (!silent) alert(`${window.i18n.t('settings.updateFailed')}: ${result.error}`);
                else console.error(`[Settings] Auto-update failed for ${key}:`, result.error);
            }
        } catch (e) {
            if (!silent) alert(`${window.i18n.t('settings.updateError')}: ${e.message}`);
            else console.error(`[Settings] Auto-update error for ${key}:`, e);
        }
    }
}

window.SettingsFlow = SettingsFlow;
