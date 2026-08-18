/**
 * MobileFlow.js
 * 手机互联功能主控制器 (MVC Pattern)
 * 协调 MobileFlowService (逻辑) 与 MobileFlowUIManager (界面)
 */

class MobileFlow {
    constructor() {
        // 实例化子模块
        this.service = new window.MobileFlowService(this);
        this.uiManager = new window.MobileFlowUIManager(this);

        // 别名兼容
        this.isRunning = false; // 由 service 管理，但保留引用以同步状态（可选）
    }

    /**
     * 初始化
     */
    init() {
        this.uiManager.init();

        // 绑定来自 IPC (手机端) 的全局事件监听
        window.mediaflow?.mobileflow.onUrlReceived((request) => {
            this.service.handleReceivedUrl(request);
        });

        // Soft PIN tip when landing on this page (only if server not yet started)
        setTimeout(() => {
            if (!this.service.isRunning) {
                this.service.maybeShowPinGuidance?.();
            }
        }, 600);

        console.log('[MobileFlow] Initialized');
    }

    // --- 代理调用领域 (Proxies) ---

    async startServer() {
        return await this.service.startServer();
    }

    async stopServer() {
        return await this.service.stopServer();
    }

    /**
     * 处理外部传入的 URL (例如由 app.js 调用)
     */
    handleFilesSelect(files) {
        if (files && files.length > 0) {
            // 目前 MobileFlow 主要是接收，如果是发送则在此扩展
            this.service.handleReceivedUrl(files[0]);
        }
    }

    /**
     * 兼容旧版调用
     */
    handleReceivedUrl(url) {
        this.service.handleReceivedUrl(url);
    }
}

// 挂载到全局
window.MobileFlow = MobileFlow;
