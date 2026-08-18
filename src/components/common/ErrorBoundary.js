/**
 * ErrorBoundary.js
 * 负责在发生未捕获错误时显示友好的 UI 弹窗
 * 依赖: Logger.js (用于底层上报), index.html (需要预置/动态插入 Modal DOM)
 */

class ErrorBoundary {
    static init() {
        this.injectModal();

        // 监听 Logger 的错误事件（如果 Logger 支持事件最好，直接劫持 window.onerror 也可以）
        // 这里采用劫持 window.onerror 的补充 UI 逻辑，与 Logger 配合
        const originalOnError = window.onerror;
        window.onerror = (msg, source, lineno, colno, error) => {
            if (originalOnError) originalOnError(msg, source, lineno, colno, error);
            this.show(msg, error);
            return false;
        };

        const originalOnRejection = window.onunhandledrejection;
        window.onunhandledrejection = (event) => {
            if (originalOnRejection) originalOnRejection(event);
            this.show(event.reason?.message || 'Unknown Async Error', event.reason);
        };

        console.log('[ErrorBoundary] UI Initialized');
    }

    static injectModal() {
        if (document.getElementById('error-boundary-modal')) return;

        const modalHtml = `
        <div id="error-boundary-modal" class="modal-overlay hidden" style="background: var(--overlay-scrim); z-index: 99999;">
            <div class="modal-content" style="max-width: 500px; border-left: 4px solid #ef4444;">
                <div class="modal-header">
                    <h3 style="color: #ef4444; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-exclamation-triangle"></i> <span data-i18n="common.boundary.title">哎呀，出错了</span>
                    </h3>
                    <button class="btn-close" onclick="window.ErrorBoundary.hide()" style="font-size: 20px; cursor: pointer; color: var(--text-muted); background: none; border: none;">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 25px; font-size: 15px; line-height: 1.6; color: var(--text-secondary);" data-i18n="common.boundary.desc" data-i18n-html>
                        程序遇到了一点小问题。我们已经自动记录了错误信息。
                        <br>您可以尝试刷新页面，或者提交错误报告以帮助我们改进。
                    </p>
                    
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="window.Logger && window.Logger.submitFullReport(); window.ErrorBoundary.hide()" style="padding: 8px 16px;">
                            <i class="fas fa-paper-plane"></i> <span data-i18n="common.boundary.submit">提交并关闭</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    static show(msg, error) {
        // 忽略即时通信类或非致命错误
        if (msg && msg.includes && msg.includes('ResizeObserver loop')) return;

        console.error('[ErrorBoundary] Caught:', msg, error);

        const modal = document.getElementById('error-boundary-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    static hide() {
        const modal = document.getElementById('error-boundary-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
}

// 延迟初始化以免阻塞首屏，或者立即初始化以捕获启动错误
// 这里选择立即执行
ErrorBoundary.init();
window.ErrorBoundary = ErrorBoundary;
