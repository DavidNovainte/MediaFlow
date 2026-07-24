/**
 * TranslationManager.js
 * Manages translation / image API settings with a generic provider + key form.
 * Storage keys remain translation-keys-{provider} for compatibility.
 */

class TranslationManager {
    constructor(app) {
        this.app = app;
        // Full list kept for storage warm-up / compatibility
        this.providers = [
            'groq', 'gemini', 'deepseek', 'openai', 'openrouter', 'siliconflow',
            'cloudflare', 'qwen', 'moonshot', 'zhipu', 'baichuan',
            'claude', 'mistral'
        ];
        /** Primary choices shown first (daily path). */
        this.primaryProviders = ['groq', 'gemini', 'deepseek', 'openai', 'openrouter', 'siliconflow'];
        /** Long-tail under “More”. */
        this.moreProviders = ['claude', 'mistral', 'qwen', 'moonshot', 'zhipu', 'baichuan', 'cloudflare'];
        this.providerLabels = {
            groq: 'Groq',
            gemini: 'Google Gemini',
            deepseek: 'DeepSeek',
            openai: 'OpenAI',
            openrouter: 'OpenRouter',
            siliconflow: 'SiliconFlow',
            cloudflare: 'Cloudflare Workers AI',
            qwen: 'Qwen',
            moonshot: 'Moonshot / Kimi',
            zhipu: 'Zhipu AI',
            baichuan: 'Baichuan',
            claude: 'Anthropic Claude',
            mistral: 'Mistral AI',
            replicate: 'Replicate',
            fal: 'Fal.ai',
            stability: 'Stability AI'
        };
        this.multiKeyProviders = new Set(['groq', 'siliconflow']);
        this.imageProviders = ['replicate', 'fal', 'stability'];
        this.placeholders = {
            groq: 'gsk_xxxxxxxxxxxx',
            gemini: 'AIzaSyxxxxxxxxxx',
            deepseek: 'sk-xxxxxxxxxx',
            siliconflow: 'sk-xxxxxxxxxx',
            cloudflare: 'API Token',
            qwen: 'sk-xxxxxxxxxx',
            moonshot: 'sk-xxxxxxxxxx',
            zhipu: 'xxxxxxxxxx.xxxxxxxxxx',
            baichuan: 'sk-xxxxxxxxxx',
            openai: 'sk-xxxxxxxxxx',
            claude: 'sk-ant-xxxxxxxxxx',
            mistral: 'xxxxxxxxxx',
            openrouter: 'sk-or-xxxxxxxxxx',
            replicate: 'r8_xxxxxxxx',
            fal: 'key:secret',
            stability: 'sk-xxxxxxxx'
        };
        /** @type {string|null} */
        this._currentProvider = null;
        /** @type {string|null} */
        this._currentImageProvider = null;
    }

    t(key, fallback) {
        return window.i18n?.t?.(key) || fallback;
    }

    providerLabel(id) {
        return this.providerLabels[id] || id;
    }

    /**
     * Build select: Recommended + More. Keeps storage per-provider.
     */
    populateProviderSelect(selected) {
        const select = document.getElementById('translation-provider');
        if (!select) return;

        const mkOption = (id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = this.providerLabel(id);
            return opt;
        };

        select.innerHTML = '';
        const primaryGroup = document.createElement('optgroup');
        primaryGroup.label = this.t('settings.providerGroupPrimary', 'Recommended');
        this.primaryProviders.forEach((id) => primaryGroup.appendChild(mkOption(id)));
        select.appendChild(primaryGroup);

        const moreGroup = document.createElement('optgroup');
        moreGroup.label = this.t('settings.providerGroupMore', 'More providers');
        this.moreProviders.forEach((id) => moreGroup.appendChild(mkOption(id)));
        select.appendChild(moreGroup);

        const value = selected && this.providers.includes(selected) ? selected : 'groq';
        select.value = value;
    }

    updateProviderHint(provider) {
        const hint = document.getElementById('translation-provider-hint');
        if (!hint) return;
        let text = '';
        if (provider === 'openrouter') {
            text = this.t(
                'settings.providerHintOpenRouter',
                'OpenAI-compatible gateway — one key can route many models. Good if you want a single entry point.'
            );
        } else if (provider === 'openai') {
            text = this.t(
                'settings.providerHintOpenAI',
                'Official OpenAI API. Also used by many OpenAI-compatible tools.'
            );
        } else if (this.multiKeyProviders.has(provider)) {
            text = this.t(
                'settings.providerHintMultiKey',
                'This provider supports optional multi-key rotation under Advanced.'
            );
        }
        if (text) {
            hint.textContent = text;
            hint.classList.remove('hidden');
        } else {
            hint.textContent = '';
            hint.classList.add('hidden');
        }
    }

    hasStoredKeys(keys) {
        if (!keys) return false;
        if (Array.isArray(keys)) return keys.some((k) => String(k || '').trim());
        return String(keys).trim().length > 0;
    }

    async refreshConfiguredChips() {
        const row = document.getElementById('translation-configured-row');
        const chips = document.getElementById('translation-configured-chips');
        if (!row || !chips) return;

        const configured = [];
        for (const provider of this.providers) {
            const keys = await window.mediaflow.store.get(`translation-keys-${provider}`, null);
            if (this.hasStoredKeys(keys)) configured.push(provider);
        }

        chips.innerHTML = '';
        if (configured.length === 0) {
            row.classList.add('hidden');
            return;
        }

        row.classList.remove('hidden');
        const active = this.getSelectedProvider();
        configured.forEach((id) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'settings-config-chip' + (id === active ? ' is-active' : '');
            btn.textContent = this.providerLabel(id);
            btn.dataset.provider = id;
            btn.title = this.t('settings.switchToConfigured', 'Switch to this provider');
            chips.appendChild(btn);
        });
    }

    init() {
        this.initTranslationSettings();
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    sanitizeClassName(value) {
        return String(value ?? '').replace(/[^a-z0-9_-]/g, '');
    }

    getSelectedProvider() {
        return document.getElementById('translation-provider')?.value || 'groq';
    }

    getSelectedImageProvider() {
        return document.getElementById('image-provider')?.value || 'replicate';
    }

    async initTranslationSettings() {
        await this.loadTranslationSettings();

        document.getElementById('translation-provider')?.addEventListener('change', async (e) => {
            // Persist previous provider's in-form keys first
            await this.persistActiveProviderFromForm(false);
            const provider = e.target.value;
            await window.mediaflow.translation.setDefaultProvider(provider);
            await window.mediaflow.store.set('translation-default-provider', provider);
            await this.showProviderKeyPanel(provider);
            await this.refreshConfiguredChips();
        });

        document.getElementById('btn-add-translation-key')?.addEventListener('click', () => {
            const provider = this.getSelectedProvider();
            const ph = this.placeholders[provider] || 'sk-xxxxxxxxxx';
            this.addApiKeyRow('translation-keys-container', 'translation-key', '', ph);
        });

        document.getElementById('btn-save-translation-keys')?.addEventListener('click', () => {
            this.saveTranslationSettings();
        });

        document.getElementById('btn-save-image-keys')?.addEventListener('click', () => {
            this.saveImageSettings();
        });

        document.getElementById('btn-test-translation')?.addEventListener('click', () => {
            this.testTranslationConnection();
        });

        document.getElementById('image-provider')?.addEventListener('change', async (e) => {
            await this.persistActiveImageFromForm(false);
            await this.showImageKeyPanel(e.target.value);
        });

        document.getElementById('translation-keys-container')?.addEventListener('click', (e) => {
            if (!e.target?.classList?.contains('btn-remove-key')) return;
            const row = this.closest(e.target, '.api-key-row');
            const container = this.closest(e.target, '.api-keys-container');
            if (container?.children?.length > 1) {
                row?.remove();
            } else {
                const input = row?.querySelector('input');
                if (input) input.value = '';
            }
        });

        // Quick switch among already-configured providers
        document.getElementById('translation-configured-chips')?.addEventListener('click', async (e) => {
            const chip = this.closest(e.target, '.settings-config-chip');
            const provider = chip?.dataset?.provider;
            if (!provider) return;
            const select = document.getElementById('translation-provider');
            if (!select || select.value === provider) return;
            await this.persistActiveProviderFromForm(false);
            select.value = provider;
            await window.mediaflow.translation.setDefaultProvider(provider);
            await window.mediaflow.store.set('translation-default-provider', provider);
            await this.showProviderKeyPanel(provider);
            await this.refreshConfiguredChips();
        });
    }

    addApiKeyRow(containerId, inputClass, value = '', placeholder = 'sk-xxxxxxxxxx') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'api-key-row';
        const safeInputClass = this.sanitizeClassName(inputClass);
        const safeValue = this.escapeHtml(value);
        const safePlaceholder = this.escapeHtml(placeholder);
        row.innerHTML = `
                <div class="input-wrapper" style="position: relative; flex: 1; display: flex; align-items: center;">
                    <input type="password" class="setting-input ${safeInputClass}" value="${safeValue}" placeholder="${safePlaceholder}" style="width: 100%; padding-right: 35px;" autocomplete="off">
                    <button class="btn-toggle-password" title="显示/隐藏" type="button" style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; z-index: 100; color: #888; font-size: 16px; padding: 0; line-height: 1;">
                        👁
                    </button>
                </div>
                <button class="btn btn-icon btn-remove-key" title="删除" type="button">✕</button>
            `;
        container.appendChild(row);
        this.bindPasswordToggle(row.querySelector('.btn-toggle-password'));
    }

    bindPasswordToggle(btn) {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = btn.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                if (input.type === 'password') {
                    input.type = 'text';
                    btn.textContent = '🔒';
                } else {
                    input.type = 'password';
                    btn.textContent = '👁';
                }
            }
        });
    }

    async showProviderKeyPanel(provider) {
        this._currentProvider = provider;
        const multiWrap = document.getElementById('translation-multi-keys');
        const singleWrap = document.getElementById('translation-single-key');
        const cfWrap = document.getElementById('translation-cf-fields');
        const singleInput = document.getElementById('translation-api-key');
        const multiContainer = document.getElementById('translation-keys-container');
        const ph = this.placeholders[provider] || 'API Key';

        const isCf = provider === 'cloudflare';
        const isMulti = this.multiKeyProviders.has(provider);

        multiWrap?.classList.toggle('hidden', !isMulti);
        if (multiWrap && 'open' in multiWrap) {
            multiWrap.open = isMulti;
        }
        singleWrap?.classList.toggle('hidden', isCf);
        // Multi-key providers still use the multi list as source of truth;
        // keep a single field for the first key when not using rotation UI.
        if (isMulti && singleWrap) {
            singleWrap.classList.add('hidden');
        }
        cfWrap?.classList.toggle('hidden', !isCf);

        this.updateProviderHint(provider);

        // Load keys for this provider from store
        const keys = await window.mediaflow.store.get(`translation-keys-${provider}`, null);
        const accountId = await window.mediaflow.store.get(`translation-account-${provider}`, '');

        if (isMulti) {
            if (multiContainer) {
                multiContainer.innerHTML = '';
                const list = Array.isArray(keys) ? keys.filter(Boolean) : (keys ? [keys] : ['']);
                if (list.length === 0) list.push('');
                list.forEach((k) => this.addApiKeyRow('translation-keys-container', 'translation-key', k, ph));
            }
            if (keys && (Array.isArray(keys) ? keys.length : keys)) {
                await window.mediaflow.translation.setKeys(provider, keys);
            }
        } else if (isCf) {
            const keyInput = document.getElementById('cloudflare-key');
            const accountInput = document.getElementById('cloudflare-account-id');
            if (keyInput) keyInput.value = keys || '';
            if (accountInput) accountInput.value = accountId || '';
            if (keys) {
                await window.mediaflow.translation.setKeys(provider, keys, accountId);
            }
        } else {
            if (singleInput) {
                singleInput.placeholder = ph;
                singleInput.value = (typeof keys === 'string' ? keys : (Array.isArray(keys) ? keys[0] : '')) || '';
            }
            if (keys) {
                await window.mediaflow.translation.setKeys(provider, keys);
            }
        }
    }

    async showImageKeyPanel(provider) {
        this._currentImageProvider = provider;
        const input = document.getElementById('image-api-key');
        if (!input) return;
        input.placeholder = this.placeholders[provider] || 'API Key';
        // Prefer image-keys-{p}, fall back to legacy id keys
        let key = await window.mediaflow.store.get(`image-keys-${provider}`, null);
        if (key == null || key === '') {
            key = await window.mediaflow.store.get(`translation-keys-${provider}`, null)
                || await window.mediaflow.store.get(`${provider}-key`, null)
                || '';
        }
        // Also try common legacy element ids stored under same names
        if (!key) {
            const legacyMap = {
                replicate: 'replicate-api-key',
                fal: 'fal-api-key',
                stability: 'stability-api-key'
            };
            key = await window.mediaflow.store.get(legacyMap[provider] || '', '') || '';
        }
        // Read from store keys used by saveTranslationSettings historically
        if (!key) {
            key = await window.mediaflow.store.get(`image-api-key-${provider}`, '') || '';
        }
        // Legacy per-id fields from old settings page
        if (!key) {
            const old = await window.mediaflow.store.get(`translation-keys-${provider}`, null);
            if (typeof old === 'string') key = old;
        }
        // Direct legacy store for image providers often used plain ids
        if (!key) {
            key = await window.mediaflow.store.get(provider === 'replicate' ? 'replicate-key'
                : provider === 'fal' ? 'fal-key'
                    : provider === 'stability' ? 'stability-key' : '', '') || '';
        }
        input.value = key || '';
    }

    /**
     * Write currently visible form fields into store (for active provider only).
     */
    async persistActiveProviderFromForm(showToast = false) {
        const provider = this._currentProvider || this.getSelectedProvider();
        if (!provider) return;

        if (this.multiKeyProviders.has(provider)) {
            const container = document.getElementById('translation-keys-container');
            const inputs = container?.querySelectorAll('.translation-key') || [];
            const keys = Array.from(inputs).map((el) => el.value).filter(Boolean);
            await window.mediaflow.store.set(`translation-keys-${provider}`, keys);
            await window.mediaflow.translation.setKeys(provider, keys);
        } else if (provider === 'cloudflare') {
            const cfKey = document.getElementById('cloudflare-key')?.value || '';
            const cfAccount = document.getElementById('cloudflare-account-id')?.value || '';
            await window.mediaflow.store.set('translation-keys-cloudflare', cfKey);
            await window.mediaflow.store.set('translation-account-cloudflare', cfAccount);
            if (cfKey) {
                await window.mediaflow.translation.setKeys('cloudflare', cfKey, cfAccount);
            }
        } else {
            const key = document.getElementById('translation-api-key')?.value || '';
            await window.mediaflow.store.set(`translation-keys-${provider}`, key);
            if (key) {
                await window.mediaflow.translation.setKeys(provider, key);
            }
        }

        if (showToast) {
            // no-op; saveTranslationSettings handles toast
        }
    }

    async persistActiveImageFromForm() {
        const provider = this._currentImageProvider || this.getSelectedImageProvider();
        const key = document.getElementById('image-api-key')?.value || '';
        await window.mediaflow.store.set(`image-keys-${provider}`, key);
        // EnhanceService reads translation-keys-{provider}
        await window.mediaflow.store.set(`translation-keys-${provider}`, key);
        // Keep legacy flat keys for older readers
        await window.mediaflow.store.set(`${provider}-key`, key);
    }

    async loadTranslationSettings() {
        const defaultProvider = await window.mediaflow.store.get('translation-default-provider', 'groq');
        this.populateProviderSelect(defaultProvider);
        await window.mediaflow.translation.setDefaultProvider(defaultProvider);

        // Warm translation service with any already-stored keys (no UI for inactive providers)
        for (const provider of this.providers) {
            const keys = await window.mediaflow.store.get(`translation-keys-${provider}`, null);
            const accountId = await window.mediaflow.store.get(`translation-account-${provider}`, '');
            if (!keys || (Array.isArray(keys) && keys.length === 0)) continue;
            try {
                if (provider === 'cloudflare') {
                    await window.mediaflow.translation.setKeys(provider, keys, accountId);
                } else {
                    await window.mediaflow.translation.setKeys(provider, keys);
                }
            } catch {
                // ignore unknown provider edge cases
            }
        }

        await this.showProviderKeyPanel(defaultProvider);
        await this.refreshConfiguredChips();

        // Image panel
        const imageProvider = await window.mediaflow.store.get('image-default-provider', 'replicate');
        const imageSelect = document.getElementById('image-provider');
        if (imageSelect) imageSelect.value = imageProvider;
        await this.showImageKeyPanel(imageProvider);
    }

    async saveTranslationSettings() {
        const statusEl = document.getElementById('translation-test-status');
        try {
            const provider = this.getSelectedProvider();
            await window.mediaflow.store.set('translation-default-provider', provider);
            await window.mediaflow.translation.setDefaultProvider(provider);
            await this.persistActiveProviderFromForm();
            await this.refreshConfiguredChips();

            if (statusEl) {
                statusEl.textContent = this.t('settings.configSaved', 'Configuration saved');
                statusEl.className = 'status-text success';
            }
            this.app.showToast(this.t('settings.saved', 'Settings saved'), 'success');
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = this.t('settings.configSaveFailed', 'Save failed') + ': ' + error.message;
                statusEl.className = 'status-text error';
            }
        }
    }

    async saveImageSettings() {
        const statusEl = document.getElementById('image-test-status');
        try {
            const provider = this.getSelectedImageProvider();
            await window.mediaflow.store.set('image-default-provider', provider);
            await this.persistActiveImageFromForm();
            if (statusEl) {
                statusEl.textContent = this.t('settings.configSaved', 'Configuration saved');
                statusEl.className = 'status-text success';
            }
            this.app.showToast(this.t('settings.saved', 'Settings saved'), 'success');
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = this.t('settings.configSaveFailed', 'Save failed') + ': ' + (error.message || error);
                statusEl.className = 'status-text error';
            }
        }
    }

    async testTranslationConnection() {
        const statusEl = document.getElementById('translation-test-status');
        const provider = this.getSelectedProvider();

        // Ensure form keys are applied before test
        try {
            await this.persistActiveProviderFromForm();
        } catch {
            // continue
        }

        if (statusEl) {
            statusEl.textContent = this.t('settings.testingConnection', 'Testing…');
            statusEl.className = 'status-text';
        }

        try {
            const result = await window.mediaflow.translation.testConnection(provider);
            if (statusEl) {
                if (result.success) {
                    statusEl.textContent = this.t('settings.connectionOk', 'Connected') + `: ${this.providerLabel(provider)}`;
                    statusEl.className = 'status-text success';
                } else {
                    statusEl.textContent = this.t('settings.connectionFail', 'Connection failed') + `: ${result.message}`;
                    statusEl.className = 'status-text error';
                }
            }
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = this.t('settings.connectionFail', 'Connection failed') + `: ${error.message}`;
                statusEl.className = 'status-text error';
            }
        }
    }
}

window.TranslationManager = TranslationManager;
