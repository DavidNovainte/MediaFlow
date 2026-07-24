/**
 * MediaFlow - Translation Service
 * 多提供商 AI 翻译服务
 */

const axios = require('axios');

// Provider configurations
const PROVIDERS = {
    groq: {
        name: 'Groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant'],
        defaultModel: 'llama-3.3-70b-versatile',
        multiKey: true,
        free: true,
        authHeader: 'Bearer'
    },
    gemini: {
        name: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
        defaultModel: 'gemini-1.5-flash',
        multiKey: false,
        free: true,
        authType: 'query' // Uses ?key= instead of header
    },
    deepseek: {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/chat/completions',
        models: ['deepseek-chat', 'deepseek-coder'],
        defaultModel: 'deepseek-chat',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    siliconflow: {
        name: 'SiliconFlow',
        endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
        models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5', 'THUDM/glm-4-9b-chat'],
        defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
        multiKey: true,
        free: true,
        authHeader: 'Bearer'
    },
    cloudflare: {
        name: 'Cloudflare Workers AI',
        endpoint: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}',
        models: ['@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'],
        defaultModel: '@cf/meta/llama-3.1-8b-instruct',
        multiKey: false,
        free: true,
        authHeader: 'Bearer',
        requiresAccountId: true
    },
    qwen: {
        name: 'Qwen / 通义千问',
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
        defaultModel: 'qwen-turbo',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    moonshot: {
        name: 'Moonshot / Kimi',
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        defaultModel: 'moonshot-v1-8k',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    zhipu: {
        name: 'Zhipu AI / 智谱清言',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        models: ['glm-4-flash', 'glm-4', 'glm-4-plus'],
        defaultModel: 'glm-4-flash',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    baichuan: {
        name: 'Baichuan / 百川智能',
        endpoint: 'https://api.baichuan-ai.com/v1/chat/completions',
        models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'],
        defaultModel: 'Baichuan3-Turbo',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4o-mini',
        multiKey: false,
        free: false,
        authHeader: 'Bearer'
    },
    claude: {
        name: 'Anthropic Claude',
        endpoint: 'https://api.anthropic.com/v1/messages',
        models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-5-sonnet-20241022'],
        defaultModel: 'claude-3-haiku-20240307',
        multiKey: false,
        free: false,
        authHeader: 'x-api-key',
        anthropicVersion: '2023-06-01'
    },
    mistral: {
        name: 'Mistral AI',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
        defaultModel: 'mistral-small-latest',
        multiKey: false,
        free: true,
        authHeader: 'Bearer'
    },
    openrouter: {
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['auto', 'openai/gpt-4o-mini', 'anthropic/claude-3-haiku', 'google/gemini-flash-1.5'],
        defaultModel: 'auto',
        multiKey: false,
        free: false,
        authHeader: 'Bearer'
    },
    'groq-turbo': {
        name: 'Groq Turbo',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        models: ['whisper-large-v3-turbo'],
        defaultModel: 'whisper-large-v3-turbo',
        multiKey: true,
        free: true,
        authHeader: 'Bearer'
    },
    'siliconflow-sense': {
        name: 'SiliconFlow SenseVoice',
        endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
        models: ['FunAudioLLM/SenseVoiceSmall'],
        defaultModel: 'FunAudioLLM/SenseVoiceSmall',
        multiKey: true,
        free: true,
        authHeader: 'Bearer'
    }
};

class TranslationService {
    constructor() {
        this.keys = {}; // { provider: [key1, key2, ...] or key }
        this.keyIndex = {}; // For rotation: { provider: currentIndex }
        this.accountIds = {}; // For Cloudflare: { cloudflare: accountId }
        this.selectedModels = {}; // { provider: selectedModel }
        this.defaultProvider = 'groq';
    }

    /**
     * Get all available providers
     */
    getProviders() {
        return Object.entries(PROVIDERS).map(([id, config]) => ({
            id,
            name: config.name,
            models: config.models,
            defaultModel: config.defaultModel,
            multiKey: config.multiKey,
            free: config.free,
            requiresAccountId: config.requiresAccountId || false
        }));
    }

    /**
     * Get detailed config for a specific provider
     */
    getProviderConfig(provider) {
        return PROVIDERS[provider];
    }

    /**
     * Set API key(s) for a provider
     */
    setKeys(provider, keys, accountId = null) {
        if (!PROVIDERS[provider]) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        if (PROVIDERS[provider].multiKey) {
            this.keys[provider] = Array.isArray(keys) ? keys.filter(k => k) : [keys].filter(k => k);
            this.keyIndex[provider] = 0;
        } else {
            this.keys[provider] = Array.isArray(keys) ? keys[0] : keys;
        }

        if (accountId && PROVIDERS[provider].requiresAccountId) {
            this.accountIds[provider] = accountId;
        }
    }

    /**
     * Set selected model for a provider
     */
    setModel(provider, model) {
        if (PROVIDERS[provider] && PROVIDERS[provider].models.includes(model)) {
            this.selectedModels[provider] = model;
        }
    }

    /**
     * Set default provider
     */
    setDefaultProvider(provider) {
        if (PROVIDERS[provider]) {
            this.defaultProvider = provider;
        }
    }

    /**
     * Get next key (with rotation for multi-key providers)
     */
    getKey(provider) {
        const keys = this.keys[provider];
        if (!keys) return null;

        if (PROVIDERS[provider].multiKey && Array.isArray(keys)) {
            if (keys.length === 0) return null;
            const key = keys[this.keyIndex[provider] % keys.length];
            return key;
        }

        return keys;
    }

    /**
     * Rotate to next key (call after rate limit error)
     */
    rotateKey(provider) {
        if (PROVIDERS[provider]?.multiKey && Array.isArray(this.keys[provider])) {
            this.keyIndex[provider] = (this.keyIndex[provider] + 1) % this.keys[provider].length;
            console.log(`[Translation] Rotated ${provider} key to index ${this.keyIndex[provider]}`);
        }
    }

    /**
     * Get model for provider
     */
    getModel(provider) {
        return this.selectedModels[provider] || PROVIDERS[provider]?.defaultModel;
    }

    /**
     * 使用指定提供商翻译文本
     * @param {number} retryCount - 当前重试次数（内部使用），最大 3 次
     */
    async translate(text, targetLang, provider = null, retryCount = 0) {
        const MAX_RETRIES = 3;
        provider = provider || this.defaultProvider;
        const config = PROVIDERS[provider];

        if (!config) {
            return { success: false, error: `Unknown provider: ${provider}` };
        }

        const key = this.getKey(provider);
        if (!key) {
            return { success: false, error: `No API key configured for ${config.name}` };
        }

        const model = this.getModel(provider);
        const prompt = (targetLang === 'none' || targetLang === 'raw') 
            ? text 
            : `You are a professional translator. Translate the following text to ${targetLang}. Output only the translation, no explanations or additional text.\n\nText to translate:\n${text}`;

        try {
            let result;

            switch (provider) {
                case 'gemini':
                    result = await this.translateGemini(key, model, prompt);
                    break;
                case 'claude':
                    result = await this.translateClaude(key, model, prompt);
                    break;
                case 'cloudflare':
                    result = await this.translateCloudflare(key, model, prompt);
                    break;
                default:
                    result = await this.translateOpenAICompatible(provider, key, model, prompt);
            }

            return result;
        } catch (error) {
            // 速率限制时轮换密钥并重试（最多 MAX_RETRIES 次）
            if (error.response?.status === 429 && PROVIDERS[provider].multiKey && retryCount < MAX_RETRIES) {
                this.rotateKey(provider);
                console.warn(`[Translation] 速率限制，轮换密钥重试 (${retryCount + 1}/${MAX_RETRIES})`);
                return this.translate(text, targetLang, provider, retryCount + 1);
            }

            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error(`[Translation] ${provider} error:`, errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * OpenAI-compatible API (Groq, DeepSeek, Qwen, Moonshot, etc.)
     */
    async translateOpenAICompatible(provider, key, model, prompt) {
        const config = PROVIDERS[provider];

        const headers = {
            'Content-Type': 'application/json'
        };

        if (config.authHeader === 'Bearer') {
            headers['Authorization'] = `Bearer ${key}`;
        } else {
            headers[config.authHeader] = key;
        }

        const response = await axios.post(config.endpoint, {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2048
        }, { headers, timeout: 30000 });

        return {
            success: true,
            translation: response.data.choices[0].message.content.trim()
        };
    }

    /**
     * Google Gemini API
     */
    async translateGemini(key, model, prompt) {
        const url = PROVIDERS.gemini.endpoint.replace('{model}', model) + `?key=${key}`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        return {
            success: true,
            translation: response.data.candidates[0].content.parts[0].text.trim()
        };
    }

    /**
     * Anthropic Claude API
     */
    async translateClaude(key, model, prompt) {
        const config = PROVIDERS.claude;

        const response = await axios.post(config.endpoint, {
            model,
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': config.anthropicVersion
            },
            timeout: 30000
        });

        return {
            success: true,
            translation: response.data.content[0].text.trim()
        };
    }

    /**
     * Cloudflare Workers AI
     */
    async translateCloudflare(key, model, prompt) {
        const accountId = this.accountIds.cloudflare;
        if (!accountId) {
            return { success: false, error: 'Cloudflare Account ID not configured' };
        }

        const url = PROVIDERS.cloudflare.endpoint
            .replace('{account_id}', accountId)
            .replace('{model}', model);

        const response = await axios.post(url, {
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            timeout: 30000
        });

        return {
            success: true,
            translation: response.data.result.response.trim()
        };
    }

    /**
     * Test connection to a provider
     */
    async testConnection(provider) {
        try {
            const result = await this.translate('Hello', 'Chinese', provider);
            return {
                success: result.success,
                message: result.success ? '连接成功' : result.error
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = new TranslationService();
