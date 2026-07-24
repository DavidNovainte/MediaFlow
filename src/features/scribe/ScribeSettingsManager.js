/**
 * ScribeSettingsManager.js
 * 负责 ScribeFlow 的设置管理与持久化
 * 包含：加载/保存设置、自动保存绑定、下拉菜单初始化、供应商列表填充
 */

class ScribeSettingsManager {
    /**
     * @param {ScribeFlow} scribeflow - ScribeFlow 实例
     */
    constructor(scribeflow) {
        this.app = scribeflow; // 引用主实例
    }

    /**
     * 初始化
     */
    init() {
        this.setupCustomDropdown();
        this.populateTranscriptionProviders();
        this.populateProviderSelect();
        this.bindAutoSave();
        this.bindTokenVisibilityToggle();
        this.loadSettings();
        
        // 绑定语言切换事件，重新渲染带有翻译的下拉菜单和动态文本
        window.addEventListener('languageChanged', () => {
            this.populateTranscriptionProviders();
            this.populateProviderSelect();
            this.updateLanguageDropdownText();
        });
    }

    /**
     * 绑定设置项更改时的自动保存
     */
    getTokenVisibilityIcon(isVisible) {
        if (isVisible) {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        }

        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    }

    bindTokenVisibilityToggle() {
        const input = document.getElementById('hf-token');
        const button = document.getElementById('btn-toggle-token');
        if (!input || !button) return;

        button.addEventListener('click', () => {
            const nextVisible = input.type === 'password';
            input.type = nextVisible ? 'text' : 'password';
            button.innerHTML = this.getTokenVisibilityIcon(nextVisible);
            button.setAttribute('aria-pressed', nextVisible ? 'true' : 'false');
        });
    }

    bindAutoSave() {
        const saveKeys = [
            'transcribe-mode', 'transcribe-provider', 'transcribe-model',
            'isolate-vocals', 'enable-diarization', 'transcribe-lang',
            'translate-lang', 'batch-translate-style', 'batch-translate-provider-select'
        ];

        saveKeys.forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.saveSettings());
        });

        // 多选语言的特殊处理
        document.querySelectorAll('.batch-translate-lang').forEach(cb => {
            cb.addEventListener('change', () => this.saveSettings());
        });

        // HF Token 额外保存逻辑 (复用现有逻辑但统一管理)
        document.getElementById('hf-token')?.addEventListener('change', (e) => {
            window.mediaflow?.store.set('hf-token', e.target.value);
        });
    }

    /**
     * 加载保存的设置
     */
    async loadSettings() {
        const store = window.mediaflow?.store;
        if (!store) return;

        try {
            // 1. 转录设置
            const mode = await store.get('scribe-settings-mode', 'cloud');
            const modeEl = document.getElementById('transcribe-mode');
            if (modeEl) {
                modeEl.value = mode;
                // 更新 UI 状态
                this.app.uiManager.updateModeUI(mode === 'local');
            }

            const provider = await store.get('scribe-settings-provider', 'openai');
            const providerEl = document.getElementById('transcribe-provider');
            if (providerEl) providerEl.value = provider;

            const model = await store.get('scribe-settings-local-model', 'base');
            const modelEl = document.getElementById('transcribe-model');
            if (modelEl) modelEl.value = model;

            const isolate = await store.get('scribe-settings-isolate-vocals', false);
            const isolateEl = document.getElementById('isolate-vocals');
            if (isolateEl) isolateEl.checked = isolate;

            const diarization = await store.get('scribe-settings-diarization', false);
            const diarizationEl = document.getElementById('enable-diarization');
            if (diarizationEl) {
                diarizationEl.checked = diarization;
            }
            const diarEngine = await store.get('scribe-diarize-engine', 'sherpa');
            const diarEngineEl = document.getElementById('diarize-engine');
            if (diarEngineEl && diarEngine) {
                diarEngineEl.value = diarEngine;
            }
            if (diarizationEl) {
                this.app.uiManager.updateDiarizationUI(diarization);
            }

            const langSrc = await store.get('scribe-settings-lang-source', '');
            const langSrcEl = document.getElementById('transcribe-lang');
            if (langSrcEl) langSrcEl.value = langSrc;

            const langTarget = await store.get('scribe-settings-lang-target', '');
            const langTargetEl = document.getElementById('translate-lang');
            if (langTargetEl) langTargetEl.value = langTarget;

            // 2. 润色设置
            const polishStyle = await store.get('scribe-settings-polish-style', 'balanced');
            const styleEl = document.getElementById('batch-translate-style');
            if (styleEl) styleEl.value = polishStyle;

            const polishProvider = await store.get('scribe-settings-polish-provider', 'siliconflow');
            const pProviderEl = document.getElementById('batch-translate-provider-select');
            if (pProviderEl) pProviderEl.value = polishProvider;

            // 3. 多选语言
            const multiLangs = await store.get('scribe-settings-multi-langs', []);
            if (Array.isArray(multiLangs) && multiLangs.length > 0) {
                document.querySelectorAll('.batch-translate-lang').forEach(cb => {
                    if (multiLangs.includes(cb.value)) {
                        cb.checked = true;
                    }
                });
                // 更新下拉框显示的文字
                const btn = document.getElementById('btn-lang-dropdown');
                if (btn) {
                    if (multiLangs.length === 1) {
                        this.updateLanguageDropdownText();
                    } else {
                        btn.querySelector('span').textContent = window.i18n ? window.i18n.t('common.transcribe.selectedLanguages', { count: multiLangs.length }) : `Selected ${multiLangs.length} languages`;
                    }
                }
            }
        } catch (e) {
            console.error('[ScribeSettingsManager] Failed to load settings:', e);
        }
    }

    /**
     * 保存当前设置
     */
    async saveSettings() {
        const store = window.mediaflow?.store;
        if (!store) return;

        try {
            const settings = {
                'scribe-settings-mode': document.getElementById('transcribe-mode')?.value,
                'scribe-settings-provider': document.getElementById('transcribe-provider')?.value,
                'scribe-settings-local-model': document.getElementById('transcribe-model')?.value,
                'scribe-settings-isolate-vocals': document.getElementById('isolate-vocals')?.checked,
                'scribe-settings-diarization': document.getElementById('enable-diarization')?.checked,
                'scribe-diarize-engine': document.getElementById('diarize-engine')?.value || 'sherpa',
                'scribe-settings-lang-source': document.getElementById('transcribe-lang')?.value,
                'scribe-settings-lang-target': document.getElementById('translate-lang')?.value,
                'scribe-settings-polish-style': document.getElementById('batch-translate-style')?.value,
                'scribe-settings-polish-provider': document.getElementById('batch-translate-provider-select')?.value,
                'scribe-settings-multi-langs': Array.from(document.querySelectorAll('.batch-translate-lang:checked')).map(cb => cb.value)
            };

            for (const [key, value] of Object.entries(settings)) {
                if (value !== undefined) {
                    await store.set(key, value);
                }
            }
        } catch (e) {
            console.error('[ScribeSettingsManager] Failed to save settings:', e);
        }
    }

    /**
     * Setup custom dropdown for languages
     */
    setupCustomDropdown() {
        const btn = document.getElementById('btn-lang-dropdown');
        const menu = document.getElementById('lang-dropdown-menu');

        if (btn && menu) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target)) {
                    menu.classList.add('hidden');
                }
            });

            // Update summary when checking items
            menu.querySelectorAll('.batch-translate-lang').forEach(cb => {
                cb.addEventListener('change', () => this.updateLanguageDropdownText());
            });
        }
    }

    /**
     * Updates the summary text for the language dropdown
     */
    updateLanguageDropdownText() {
        const btn = document.getElementById('btn-lang-dropdown');
        const menu = document.getElementById('lang-dropdown-menu');
        if (!btn || !menu) return;

        const checked = menu.querySelectorAll('.batch-translate-lang:checked');
        if (checked.length === 0) {
            btn.querySelector('span').textContent = window.i18n ? window.i18n.t('common.transcribe.selectTargetLang') : 'Select Language...';
        } else if (checked.length === 1) {
            // Get label text
            const label = checked[0].closest('.dropdown-item').textContent.trim();
            btn.querySelector('span').textContent = label;
        } else {
            btn.querySelector('span').textContent = window.i18n ? window.i18n.t('common.transcribe.selectedLanguages', { count: checked.length }) : `Selected ${checked.length} languages`;
        }
    }

    /**
     * Populate transcription providers dynamically
     */
    async populateTranscriptionProviders() {
        const select = document.getElementById('transcribe-provider');
        if (!select) return;

        const providers = window.ScribeService.getTranscriptionProviders();
        const options = [];

        for (const provider of providers) {
            const isConfigured = await window.ScribeService.isProviderConfigured(provider.id);
            const notConfiguredText = window.i18n ? window.i18n.t('common.ui.notConfigured') : '(Not Configured)';
            options.push({
                ...provider,
                displayLabel: isConfigured ? `${provider.name} (${provider.remark})` : `${provider.name} ${notConfiguredText}`
            });
        }

        if (options.length > 0) {
            const currentVal = select.value;
            select.innerHTML = options.map(opt => `<option value="${opt.id}">${opt.displayLabel}</option>`).join('');

            // 恢复之前选中的值或加载记忆
            const savedProvider = await window.mediaflow?.store.get('scribe-settings-provider', 'openai');
            if (savedProvider && options.some(o => o.id === savedProvider)) {
                select.value = savedProvider;
            } else if (currentVal && options.some(o => o.id === currentVal)) {
                select.value = currentVal;
            }
        }

        // 绑定检查逻辑，如果选择了未配置的，给予提示
        select.addEventListener('change', async () => {
            const val = select.value;
            const isConfigured = await window.ScribeService.isProviderConfigured(val);
            if (!isConfigured) {
                window.app?.showToast(window.i18n?.t('common.errors.apiKeyNotConfigured', { name: val }) || `API Key for ${val} is not configured`, 'warning');
            }
        });
    }

    /**
     * Populate provider select dynamically
     */
    async populateProviderSelect() {
        const select = document.getElementById('batch-translate-provider-select');
        if (!select) return;

        // 定义所有可能的翻译提供商及其显示名称
        const allProviders = [
            { id: 'siliconflow', label: `SiliconFlow ${(window.i18n?.t('common.ui.recommended') || '(Recommended)')}`, storageKey: 'translation-keys-siliconflow' },
            { id: 'groq', label: 'Groq Speed', storageKey: 'translation-keys-groq' },
            { id: 'gemini', label: `Google Gemini ${(window.i18n?.t('common.ui.recommended') || '(Recommended)')}`, storageKey: 'translation-keys-gemini' },
            { id: 'deepseek', label: 'DeepSeek', storageKey: 'translation-keys-deepseek' },
            { id: 'openai', label: 'OpenAI (GPT)', storageKey: 'translation-keys-openai' },
            { id: 'claude', label: 'Anthropic Claude', storageKey: 'translation-keys-claude' },
            { id: 'qwen', label: window.i18n?.t('common.scribe.qwen') || 'Qwen', storageKey: 'translation-keys-qwen' },
            { id: 'moonshot', label: 'Moonshot / Kimi', storageKey: 'translation-keys-moonshot' },
            { id: 'zhipu', label: 'Zhipu AI 智谱清言', storageKey: 'translation-keys-zhipu' },
            { id: 'baichuan', label: 'Baichuan 百川智能', storageKey: 'translation-keys-baichuan' },
            { id: 'mistral', label: 'Mistral AI', storageKey: 'translation-keys-mistral' },
            { id: 'openrouter', label: 'OpenRouter (' + (window.i18n?.t('common.ui.universal') || 'Universal') + ')', storageKey: 'translation-keys-openrouter' },
            { id: 'cloudflare', label: 'Cloudflare Workers AI', storageKey: 'translation-keys-cloudflare' }
        ];

        const options = [];
        for (const provider of allProviders) {
            let key = await window.mediaflow?.store.get(provider.storageKey, '');
            if (provider.id === 'openai' && (!key || key === '')) {
                key = await window.mediaflow?.store.get('openai-api-key', '');
            }

            let isConfigured = false;
            if (typeof key === 'string' && key.trim() !== '') {
                isConfigured = true;
            } else if (Array.isArray(key) && key.length > 0 && key[0] && key[0].trim() !== '') {
                isConfigured = true;
            }

            options.push({
                ...provider,
                displayLabel: isConfigured ? provider.label : `${provider.label} ${(window.i18n?.t('common.ui.notConfigured') || '(Not Configured)')}`
            });
        }

        if (options.length > 0) {
            select.innerHTML = options.map(opt => `<option value="${opt.id}">${opt.displayLabel}</option>`).join('');

            // 自动选中默认引擎
            const defaultProvider = await window.mediaflow?.store.get('translation-default-provider', 'groq');
            if (defaultProvider) {
                select.value = defaultProvider;
            }
        }
    }
}

window.ScribeSettingsManager = ScribeSettingsManager;
