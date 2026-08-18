/**
 * Onboarding.js
 * First-run multi-step guide:
 * welcome → first download → clipboard opt-in → engines (if missing) → done.
 * Styles: styles/onboarding.css
 */
class Onboarding {
    /**
     * @param {object} app - MediaFlowApp instance
     */
    constructor(app) {
        this.app = app;
        this.overlay = null;
        this.stepIndex = 0;
        this.steps = [];
        this.missing = [];
        this._onKey = null;
    }

    /**
     * @param {{ missing?: string[] }} [opts]
     */
    async show(opts = {}) {
        this.missing = Array.isArray(opts.missing) ? opts.missing : [];
        this.steps = this._buildSteps();
        if (!this.steps.length) {
            await this._complete();
            return;
        }
        this.stepIndex = 0;
        this._render();
    }

    _t(key, fallback, params) {
        const v = window.i18n?.t?.(key, params || {});
        if (v && v !== key) return v;
        let text = fallback || key;
        if (params && typeof params === 'object') {
            Object.keys(params).forEach((k) => {
                text = text.replace(new RegExp(`{{${k}}}`, 'g'), params[k]);
                text = text.replace(new RegExp(`{${k}}`, 'g'), params[k]);
            });
        }
        return text;
    }

    /** Line icons — zinc mono, no emoji / purple clapper */
    _icon(name) {
        const common =
            'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
        const map = {
            welcome: `<svg ${common}><path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M9 13h6"/></svg>`,
            download: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
            clipboard: `<svg ${common}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></svg>`,
            engines: `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
            done: `<svg ${common}><path d="M20 6 9 17l-5-5"/></svg>`
        };
        return map[name] || map.welcome;
    }

    _buildSteps() {
        const steps = [
            {
                id: 'welcome',
                iconHtml: this._icon('welcome'),
                title: this._t('onboarding.welcomeTitle', 'Welcome to MediaFlow'),
                body: this._t(
                    'onboarding.welcomeBody',
                    'Community edition: offline capture, local transcription, and image compress. Pro unlocks batch, queue, editor, subtitles, and more.'
                )
            },
            {
                id: 'download',
                iconHtml: this._icon('download'),
                title: this._t('onboarding.downloadTitle', 'Your first capture'),
                body: this._t(
                    'onboarding.downloadBody',
                    'Open Media Capture → paste a public link → Analyze → Save. Single-link capture is unlimited; change the save folder in Settings anytime.'
                )
            },
            {
                id: 'clipboard',
                iconHtml: this._icon('clipboard'),
                title: this._t('onboarding.clipboardTitle', 'Clipboard watch (optional)'),
                body: this._t(
                    'onboarding.clipboardBody',
                    'MediaFlow can detect video links you copy and offer a quick capture. Off by default — enable only if you want it. Change anytime in Settings.'
                ),
                hasClipboardToggle: true
            }
        ];

        if (this.missing.length) {
            const list = this.missing.join(', ');
            steps.push({
                id: 'engines',
                iconHtml: this._icon('engines'),
                title: this._t('onboarding.enginesTitle', 'Install core engines'),
                body: this._t(
                    'onboarding.enginesBody',
                    'Missing tools: {{list}}. Open Settings → Core engines to fix, or reinstall the app.',
                    { list }
                ),
                primaryAction: 'settings'
            });
        }

        steps.push({
            id: 'done',
            iconHtml: this._icon('done'),
            title: this._t('onboarding.doneTitle', 'You are ready'),
            body: this._t(
                'onboarding.doneBody',
                'Start with a single download. Explore Pro workflows when you need batch, enhance, subtitles, or mobile bridge.'
            )
        });

        return steps;
    }

    _render() {
        this._remove();
        const step = this.steps[this.stepIndex];
        if (!step) {
            this._finish();
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay';
        overlay.id = 'onboarding-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'onboarding-card';

        const isLast = this.stepIndex >= this.steps.length - 1;
        const nextLabel = isLast
            ? this._t('onboarding.getStarted', 'Get started')
            : this._t('onboarding.next', 'Next');
        const skipLabel = this._t('onboarding.skip', 'Skip');
        const clipboardLabel = this._t(
            'onboarding.clipboardEnableLabel',
            'Enable clipboard link detection'
        );

        const dots = this.steps
            .map((_, i) => `<span class="onboarding-dot${i === this.stepIndex ? ' active' : ''}"></span>`)
            .join('');

        const clipboardToggleHtml = step.hasClipboardToggle
            ? `<label class="onboarding-toggle" for="onboarding-clipboard-enabled">
                    <input type="checkbox" id="onboarding-clipboard-enabled" />
                    <span>${this._esc(clipboardLabel)}</span>
               </label>`
            : '';

        card.innerHTML = `
            <button type="button" class="onboarding-skip" id="onboarding-skip">${skipLabel}</button>
            <div class="onboarding-icon" aria-hidden="true">${step.iconHtml || this._icon('welcome')}</div>
            <h2 class="onboarding-title">${this._esc(step.title)}</h2>
            <p class="onboarding-desc">${this._esc(step.body)}</p>
            ${clipboardToggleHtml}
            <div class="onboarding-footer">
                <div class="onboarding-dots">${dots}</div>
                <div class="onboarding-actions">
                    ${step.primaryAction === 'settings'
                        ? `<button type="button" class="btn btn-secondary" id="onboarding-settings">${this._esc(this._t('common.openSettings', 'Open Settings'))}</button>`
                        : ''}
                    <button type="button" class="btn btn-primary onboarding-next" id="onboarding-next">${this._esc(nextLabel)}</button>
                </div>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        this.overlay = overlay;

        card.querySelector('#onboarding-skip')?.addEventListener('click', () => this._finish());
        card.querySelector('#onboarding-next')?.addEventListener('click', () => this._next());
        card.querySelector('#onboarding-settings')?.addEventListener('click', () => {
            this.app?.router?.switchPage?.('settings');
            this._finish();
        });

        this._onKey = (e) => {
            if (e.key === 'Escape') this._finish();
            if (e.key === 'Enter') this._next();
        };
        document.addEventListener('keydown', this._onKey);
    }

    async _applyClipboardStep() {
        const step = this.steps[this.stepIndex];
        if (!step?.hasClipboardToggle) return;

        const checked = !!this.overlay?.querySelector('#onboarding-clipboard-enabled')?.checked;
        try {
            if (window.mediaflow?.clipboard?.setEnabled) {
                await window.mediaflow.clipboard.setEnabled(checked);
            } else {
                await window.mediaflow?.store?.set?.('clipboardWatchEnabled', checked);
            }
        } catch (e) {
            console.warn('[Onboarding] clipboard preference failed:', e);
        }
    }

    async _next() {
        await this._applyClipboardStep();

        if (this.stepIndex >= this.steps.length - 1) {
            this._finish();
            return;
        }
        this.stepIndex += 1;
        this._render();
    }

    async _complete() {
        try {
            await window.mediaflow?.store?.set?.('onboardingComplete', true);
        } catch (e) {
            console.warn('[Onboarding] failed to persist flag:', e);
        }
    }

    async _finish() {
        // Leaving mid-flow without enabling keeps clipboard off (privacy default).
        await this._complete();
        if (this.overlay) {
            this.overlay.classList.add('fade-out');
            const el = this.overlay;
            setTimeout(() => el.remove(), 280);
        }
        this._remove(false);
        this.overlay = null;
    }

    _remove(removeDom = true) {
        if (this._onKey) {
            document.removeEventListener('keydown', this._onKey);
            this._onKey = null;
        }
        if (removeDom && this.overlay?.parentElement) {
            this.overlay.remove();
        }
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

window.Onboarding = Onboarding;
