/**
 * rendererLogger.js
 * 渲染进程专用的日志工具。
 * 核心逻辑：将日志请求通过 window.mediaflow.log 转发给主进程，避免直接在渲染进程引用 Node.js 模块。
 */

class RendererLogger {
    constructor() {
        console.log('[RendererLogger] Initialized');
        this.reportingEnabled = true;
    }

    /**
     * 更新报告状态（兼容 SettingsFlow 调用）
     */
    toggleReporting(enabled) {
        this.reportingEnabled = !!enabled;
        this.info(`Error reporting ${this.reportingEnabled ? 'enabled' : 'disabled'}`);
    }

    info(msg) {
        if (window.mediaflow && window.mediaflow.log) {
            window.mediaflow.log.info(msg);
        } else {
            console.log('[INFO]', msg);
        }
    }

    warn(msg) {
        if (window.mediaflow && window.mediaflow.log) {
            window.mediaflow.log.warn(msg);
        } else {
            console.warn('[WARN]', msg);
        }
    }

    error(msg) {
        if (window.mediaflow && window.mediaflow.log) {
            window.mediaflow.log.error(msg);
        } else {
            console.error('[ERROR]', msg);
        }
    }

    /**
     * 特殊记录：FFmpeg 命令行及其输出
     */
    ffmpeg(cmd, stderr) {
        if (window.mediaflow && window.mediaflow.log) {
            window.mediaflow.log.ffmpeg(cmd, stderr);
        } else {
            console.log('[FFMPEG]', cmd, stderr);
        }
    }

    /**
     * 实现完整的报告提交逻辑
     */
    async submitFullReport() {
        if (!this.reportingEnabled) {
            console.warn('[Logger] Reporting is disabled by user.');
            return;
        }

        this.info('Collecting environment data and submitting report...');

        try {
            // 收集基础信息
            const version = document.getElementById('app-version-display')?.textContent || 'unknown';

            const reportData = {
                type: 'USER_REPORT',
                version: version,
                message: 'User manually submitted a report from ErrorBoundary',
                // 可以根据需要添加更多渲染进程的状态快照
                screen: `${window.innerWidth}x${window.innerHeight}`,
                logs: [] // 这里可以扩展为收集最近的 console 日志
            };

            if (window.mediaflow && window.mediaflow.system && window.mediaflow.system.reportError) {
                const result = await window.mediaflow.system.reportError(reportData);
                if (result.success) {
                    window.mediaflow.notification.show({
                        title: window.i18n.t('common.report.successTitle'),
                        body: window.i18n.t('common.report.successBody')
                    });
                } else {
                    throw new Error(result.error);
                }
            } else {
                this.error('IPC reportError not found');
            }
        } catch (error) {
            const errorMsg = String(error.message || error);
            this.error(`Report Submission Failed: ${errorMsg}`);

            // 智能降级提示：避免将晦涩的 IPC 错误直接展示给用户
            let userFriendlyMsg = window.i18n.t('common.report.failBody', { error: errorMsg });
            if (errorMsg.includes('No handler registered')) {
                userFriendlyMsg = window.i18n.t('common.report.fallbackMsg');
            }

            if (window.app && window.app.ui && typeof window.app.ui.showToast === 'function') {
                window.app.ui.showToast(userFriendlyMsg, 'error');
            } else if (window.mediaflow && window.mediaflow.notification && window.mediaflow.notification.show) {
                window.mediaflow.notification.show({
                    title: window.i18n.t('common.report.failTitle'),
                    body: userFriendlyMsg
                });
            } else {
                alert(userFriendlyMsg);
            }
        }
    }
}

// 挂载到全局
window.Logger = new RendererLogger();
