/**
 * DonationPrompt — 在用户完成几次有效操作后，低频提示支持项目。
 * 只记录本地状态，不联网，也不会在启动时主动打扰用户。
 */
(function () {
    const STORAGE_KEY = 'mediaflow_donation_prompt';
    const SUCCESS_THRESHOLD = 3;
    const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

    function readState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function writeState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function recordSuccess(count = 1) {
        const state = readState();
        state.successes = (Number(state.successes) || 0) + Math.max(1, Number(count) || 1);
        writeState(state);

        if (state.supported || state.successes < SUCCESS_THRESHOLD) return;
        if (Date.now() - (Number(state.lastPromptAt) || 0) < COOLDOWN_MS) return;
        showPrompt(state);
    }

    function showPrompt(state) {
        state.lastPromptAt = Date.now();
        writeState(state);

        const app = window.app;
        if (!app?.showToast) return;

        app.showToast(
            window.i18n?.t?.('donation.promptMessage') || 'MediaFlow 对所有人免费开放。如果它帮到了你，可以支持一下项目 ☕',
            'info',
            {
                className: 'donation-toast',
                duration: 8000,
                buttons: [
                    {
                        text: window.i18n?.t?.('donation.promptSupport') || '支持项目',
                        onClick: () => {
                            const next = readState();
                            next.supported = true;
                            writeState(next);
                            app.switchPage?.('donation');
                        }
                    },
                    {
                        text: window.i18n?.t?.('donation.promptLater') || '以后再说',
                        onClick: () => {}
                    }
                ]
            }
        );
    }

    window.DonationPrompt = { recordSuccess };
})();
