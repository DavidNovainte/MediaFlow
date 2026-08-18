/**
 * MediaFlow 国际化模块 (Refactored)
 * 支持模块化 JSON 加载
 */

const i18n = {
    // 当前语言
    currentLang: 'zh-CN',

    // 翻译缓存
    translations: {},

    // 默认（英文）翻译缓存，用于 Fallback
    defaultTranslations: {},

    // 是否已加载
    loaded: false,

    /**
     * 初始化
     */
    async init() {
        console.log('[i18n] Initializing...');
        try {
            // 1. 获取语言设置 (优先级：1. 存储 2. 系统语言 3. 默认 zh-CN)
            let lang = 'zh-CN'; 

            if (window.mediaflow?.store) {
                const saved = await window.mediaflow.store.get('language');
                if (saved) {
                    lang = saved;
                    console.log(`[i18n] Loaded saved language: ${lang}`);
                } else {
                    // 自动检测系统语言
                    const sysLang = navigator.language;
                    const LANG_MAP = {
                        'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW', 'zh': 'zh-CN',
                        'en': 'en-US', 'fr': 'fr-FR', 'de': 'de-DE',
                        'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR',
                        'pt': 'pt-PT', 'ru': 'ru-RU'
                    };
                    const sysLangLower = sysLang.toLowerCase();
                    lang = LANG_MAP[sysLangLower] || LANG_MAP[sysLangLower.split('-')[0]] || 'zh-CN';
                    console.log(`[i18n] Auto-detected system language: ${sysLang} -> ${lang}`);
                }
            }

            // 归一化映射（兼容旧版短码存储）
            const SHORT_MAP = {
                'zh': 'zh-CN', 'en': 'en-US', 'fr': 'fr-FR', 'de': 'de-DE',
                'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR', 'pt': 'pt-PT', 'ru': 'ru-RU'
            };
            if (SHORT_MAP[lang]) lang = SHORT_MAP[lang];

            // 2. 加载默认语言 (en-US) 以备回退
            try {
                const enRaw = await window.mediaflow.i18n.readLocale('en-US');
                this.defaultTranslations = this.flatten(enRaw);
                console.log(`[i18n] Default en-US fallback loaded. Keys: ${Object.keys(this.defaultTranslations).length}`);
            } catch (e) {
                console.warn('[i18n] Failed to load default en-US locale:', e);
            }

            await this.setLanguage(lang);
            this.loaded = true;
            console.log(`[i18n] Final active language: ${lang}`);

        } catch (error) {
            console.error('[i18n] Init failed:', error);
        }
    },

    /**
     * 设置语言并加载资源
     */
    async setLanguage(lang) {
        if (!window.mediaflow?.i18n) {
            console.error('[i18n] Backend API not available');
            return;
        }

        try {
            // 从后端加载所有 JSON 模块
            const rawTranslations = await window.mediaflow.i18n.readLocale(lang);

            // 扁平化对象以支持 'nav.tools' 这种 key
            this.translations = this.flatten(rawTranslations);
            this.currentLang = lang;

            // 保存设置
            if (window.mediaflow?.store) {
                await window.mediaflow.store.set('language', lang);
            }

            // 更新 UI
            this.updateUI();

            // 🆕 分发全局事件，通知其他模块（如 TTSHandler）语言已变更
            window.dispatchEvent(new CustomEvent('languageChanged', { 
                detail: { lang: lang }
            }));
            console.log(`[i18n] Language changed: ${lang}, event dispatched.`);

        } catch (error) {
            console.error(`[i18n] Failed to load language ${lang}:`, error);
        }
    },

    /**
     * 获取翻译文本 (支持 {param} 插值)
     */
    t(key, params = {}) {
        let text = this.translations[key];

        // Fallback to English if not found
        if (text === undefined) {
            text = this.defaultTranslations[key] || key;
        }

        // 简单插值替换 (支持 {k} 和 {{k}})
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(k => {
                // 先替换 {{k}}，再替换 {k}
                text = text.replace(new RegExp(`{{${k}}}`, 'g'), params[k]);
                text = text.replace(new RegExp(`{${k}}`, 'g'), params[k]);
            });
        }

        return text;
    },

    /**
     * 更新 UI 文本
     * @param {HTMLElement} root 可选的根节点，用于局部刷新
     */
    updateUI(root = document) {
        // 允许在初始加载阶段进行更新
        if (!this.loaded && root === document && Object.keys(this.translations).length === 0) {
            console.warn('[i18n] Not yet fully loaded and no translations, skip update');
            return;
        }

        // 1. 更新带 data-i18n 属性的元素文本
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);

            if (this.translations[key] !== undefined || this.defaultTranslations[key] !== undefined) {
                if (el.hasAttribute('data-i18n-html')) {
                    el.innerHTML = translation;
                } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    // Update placeholder for inputs
                    el.placeholder = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // 2. 更新 data-i18n-placeholder 属性 (专门针对 Input/Textarea)
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // 3. 更新 data-i18n-title 属性 (工具提示)
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // 4. 更新原生 title 属性如果定义了 data-i18n-title-attr
        root.querySelectorAll('[data-i18n-title-attr]').forEach(el => {
            const key = el.getAttribute('data-i18n-title-attr');
            el.setAttribute('title', this.t(key));
        });

        // 2. 更新 placeholder 和 value (针对文本框/按钮)
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            el.placeholder = translation;

            if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
                el.value = translation;
            }
        });

        // 3. 更新 title 属性 (Tooltip)
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // 4. 更新语言选择器状态 (仅在全量更新时)
        if (root === document) {
            const langSelect = document.getElementById('setting-language');
            if (langSelect) {
                langSelect.value = this.currentLang;
            }
            // 触发语言变更全局事件
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));
        }
    },

    /**
     * 对象扁平化工具
     */
    flatten(obj, prefix = '') {
        return Object.keys(obj).reduce((acc, k) => {
            const pre = prefix.length ? prefix + '.' : '';
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k]))
                Object.assign(acc, this.flatten(obj[k], pre + k));
            else
                acc[pre + k] = obj[k];
            return acc;
        }, {});
    }
};

// 导出
window.i18n = i18n;
