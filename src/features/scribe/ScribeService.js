/**
 * ScribeService.js
 * 媒体转录服务类 - 负责 API 调用与数据处理逻辑
 */
class ScribeService {
    constructor() {
        this.LANGUAGE_NAMES = {
            'en': 'English', 'zh': '中文', 'ja': '日本語', 'ko': '한국어',
            'es': 'Español', 'fr': 'Français', 'de': 'Deutsch', 'pt': 'Português',
            'ru': 'Русский', 'ar': 'العربية', 'hi': 'हिंदी', 'th': 'ไทย',
            'vi': 'Tiếng Việt', 'id': 'Bahasa Indonesia',
            // Map English names to Native for consistency
            'Chinese': '中文', 'Traditional Chinese': '中文(繁體)', 'English': 'English', 'Japanese': '日本語', 'Korean': '한국어',
            'French': 'Français', 'German': 'Deutsch', 'Spanish': 'Español', 'Italian': 'Italiano',
            'Portuguese': 'Português', 'Russian': 'Русский', 'Dutch': 'Nederlands', 'Polish': 'Polski',
            'Swedish': 'Svenska', 'Thai': 'ไทย', 'Vietnamese': 'Tiếng Việt', 'Arabic': 'العربية',
            'Turkish': 'Türkçe', 'Indonesian': 'Bahasa Indonesia', 'Hindi': 'हिंदी'
        };
        this.progressCleanup = null;
    }

    /**
     * 转录提供商配置 (Getter 确保翻译实时生效)
     */
    get TRANSCRIPTION_PROVIDERS() {
        const t = (key, fallback) => window.i18n?.t(key) || fallback;
        return [
            { id: 'groq-turbo', name: 'Groq Turbo ' + t('common.ui.fast', '(Faster)'), storeKey: 'translation-keys-groq', remark: t('common.ui.speedy', 'Fast transcription, recommended') },
            { id: 'groq', name: 'Groq', storeKey: 'translation-keys-groq', remark: 'Whisper Large-v3' },
            { id: 'siliconflow-sense', name: 'SiliconFlow SenseVoice', storeKey: 'translation-keys-siliconflow', remark: t('common.ui.chineseOptimized', 'CN Optimized, High Speed') },
            { id: 'siliconflow', name: 'SiliconFlow', storeKey: 'translation-keys-siliconflow', remark: 'Whisper Large-v3' },
            { id: 'openai', name: 'OpenAI', storeKey: 'translation-keys-openai', remark: t('common.ui.whisperStable', 'Whisper-1, Stable') },
            { id: 'gemini', name: 'Google Gemini', storeKey: 'translation-keys-gemini', remark: t('common.ui.longTextSupport', 'Long text support') },
            { id: 'deepseek', name: 'DeepSeek', storeKey: 'translation-keys-deepseek', remark: t('common.ui.costEffective', 'Cost effective') },
            { id: 'qwen', name: t('common.scribe.qwen', 'Qwen 通义千问'), storeKey: 'translation-keys-qwen', remark: t('common.scribe.qwenRemark', '国产优质') }
        ];
    }

    /**
     * 获取支持的转录提供商
     */
    getTranscriptionProviders() {
        return this.TRANSCRIPTION_PROVIDERS;
    }

    /**
     * 检查供应商是否已配置 API Key
     */
    async isProviderConfigured(provider) {
        try {
            const { apiKey } = await this.getApiKey(provider);
            return !!apiKey;
        } catch {
            return false;
        }
    }

    /**
     * 获取指定提供商的 API Key 配置
     */
    async getApiKey(provider) {
        const providerMap = {
            'openai': { name: 'OpenAI', store: 'translation-keys-openai', oldStore: 'openai-api-key' },
            'groq': { name: 'Groq', store: 'translation-keys-groq' },
            'groq-turbo': { name: 'Groq Turbo', store: 'translation-keys-groq' },
            'siliconflow': { name: 'SiliconFlow', store: 'translation-keys-siliconflow' },
            'siliconflow-sense': { name: 'SiliconFlow SenseVoice', store: 'translation-keys-siliconflow' },
            'gemini': { name: 'Google Gemini', store: 'translation-keys-gemini' },
            'deepseek': { name: 'DeepSeek', store: 'translation-keys-deepseek' },
            'claude': { name: 'Claude', store: 'translation-keys-claude' },
            'qwen': { name: 'Qwen', store: 'translation-keys-qwen' },
            'moonshot': { name: 'Moonshot', store: 'translation-keys-moonshot' },
            'zhipu': { name: 'Zhipu', store: 'translation-keys-zhipu' },
            'baichuan': { name: 'Baichuan', store: 'translation-keys-baichuan' },
            'mistral': { name: 'Mistral', store: 'translation-keys-mistral' },
            'openrouter': { name: 'OpenRouter', store: 'translation-keys-openrouter' },
            'cloudflare': { name: 'Cloudflare', store: 'translation-keys-cloudflare' }
        };

        const config = providerMap[provider] || { name: provider, store: `translation-keys-${provider}` };
        let apiKey = await window.mediaflow?.store.get(config.store, '');

        if (!apiKey && config.oldStore) apiKey = await window.mediaflow?.store.get(config.oldStore, '');
        
        // 关键变更：如果存储的是数组（多 Key），直接返回数组，不再强制取第一项 [0]
        // 只有后端处理层能完美支持数组轮流使用
        if (Array.isArray(apiKey)) {
            apiKey = apiKey.map(k => (typeof k === 'string' ? k.trim() : (k.key || ''))).filter(k => !!k);
            if (apiKey.length === 0) apiKey = '';
        } else if (typeof apiKey === 'string') {
            apiKey = apiKey.trim();
        }

        if (!apiKey || (Array.isArray(apiKey) && apiKey.length === 0)) {
            const errorMsg = window.i18n?.t('common.errors.apiKeyNotConfigured', { name: config.name }) || `Please configure the API Key for ${config.name} in settings first.`;
            throw new Error(errorMsg);
        }
        return { apiKey, providerName: config.name };
    }

    /**
     * 执行转录任务
     */
    async transcribe(filePath, options, onProgress) {
        if (this.progressCleanup) { this.progressCleanup(); this.progressCleanup = null; }
        if (onProgress && window.mediaflow?.transcribe.onProgress) {
            this.progressCleanup = window.mediaflow.transcribe.onProgress(onProgress);
        }

        const params = {
            ...options,
            language: options.language || null,
            prompt: options.prompt || options.initialPrompt,
            timestampGranularity: 'segment'
        };

        if (options.mode === 'local') {
            return await window.mediaflow?.transcribe.startLocal(filePath, { ...params, device: 'auto' });
        } else {
            return await window.mediaflow?.transcribe.start(filePath, params);
        }
    }

    /**
     * Cancel local whisper/python workers (and signal UI loop to stop).
     */
    async cancel() {
        if (this.progressCleanup) {
            try { this.progressCleanup(); } catch { /* ignore */ }
            this.progressCleanup = null;
        }
        if (window.mediaflow?.transcribe?.cancel) {
            return await window.mediaflow.transcribe.cancel();
        }
        return { success: true };
    }

    /**
     * AI 润色
     */
    async polish(segments, options) {
        return await window.mediaflow?.transcribe.polish(segments, options);
    }

    /**
     * AI 总结
     */
    async summarize(segments, options) {
        return await window.mediaflow?.transcribe.summarize(segments, options);
    }

    /**
     * 批量翻译 (后端)
     */
    async translateBatch(text, languages, options) {
        return await window.mediaflow?.transcribe.translateBatch(text, languages, options);
    }

    /**
     * 过滤幻觉
     */
    filterHallucinations(segments) {
        if (!Array.isArray(segments)) return [];
        const HALLUCINATION_PATTERNS = [
            // 特定训练集残留 (Strong Hallucinations - 100% Delete)
            /支持明镜与点点栏目/i,
            /明镜.*点点/i,
            /字幕 by/i,
            /Provided by/i,
            /Amara\.org/i,
            /未经作者授权/i,
            /感谢您的观看/i,
            /感谢观看/i,
            /谢谢观看/i,
            /谢谢大家/i,
            /非常感谢您的观看/i,
            /请订阅我们的频道/i,
            /Thanks for watching/i,
            /Thank you for watching/i,
            /Please subscribe/i,
            /^[.。,，!！?？\s]*$/ // 纯标点符号或空白
        ];
        return segments.filter(seg => {
            const text = (seg.text || '').trim();
            if (text.length === 0) return false;
            return !HALLUCINATION_PATTERNS.some(p => p.test(text));
        });
    }

    getLanguageName(code) {
        if (code === 'auto') return window.i18n?.t('subtitle.settings.lang.auto') || 'Auto Detect';
        return this.LANGUAGE_NAMES[code] || code;
    }
}

window.ScribeService = new ScribeService();
