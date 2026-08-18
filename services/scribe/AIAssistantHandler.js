/**
 * MediaFlow - AIAssistantHandler
 * 音视频转录 - AI 辅助处理器 (润色/总结/翻译)
 */

const axios = require('axios');
const translationService = require('../translation');

class AIAssistantHandler {
    constructor() {
        this.apiKey = null;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * 翻译文本 (支持多 Provider 和 风格)
     */
    async translate(text, targetLang = 'Chinese', options = {}) {
        const apiKeys = Array.isArray(options.apiKey) ? options.apiKey : (options.apiKey ? [options.apiKey] : (this.apiKey ? [this.apiKey] : []));
        const provider = options.provider || 'openai';
        const style = options.style || 'balanced';

        if (apiKeys.length === 0) {
            throw new Error('API key is not set');
        }

        const config = translationService.getProviderConfig(provider);
        let endpoint = config ? config.endpoint : 'https://api.openai.com/v1/chat/completions';
        let model = translationService.getModel(provider) || (config ? config.defaultModel : 'gpt-4o-mini');

        let stylePrompt = 'Maintain the original meaning and tone.';
        switch (style) {
            case 'literal': stylePrompt = 'Translate literally and accurately, adhering strictly to the source text structure.'; break;
            case 'colloquial': stylePrompt = 'Translate into natural, colloquial spoken language suitable for subtitles.'; break;
            case 'literary': stylePrompt = 'Translate with a literary and polished style, suitable for written content.'; break;
            case 'humorous': stylePrompt = 'Translate with a humorous and witty tone where appropriate.'; break;
        }

        const languageMap = {
            'zh': 'Chinese (简体中文)',
            'chinese': 'Chinese (简体中文)',
            'traditional chinese': 'Traditional Chinese (繁體中文)',
            'en': 'English (英语)',
            'english': 'English (英语)',
            'ja': 'Japanese (日本語)',
            'japanese': 'Japanese (日本語)',
            'ko': 'Korean (한국어)',
            'korean': 'Korean (한국어)',
            'fr': 'French (Français)',
            'french': 'French (Français)',
            'de': 'German (Deutsch)',
            'german': 'German (Deutsch)',
            'es': 'Spanish (Español)',
            'spanish': 'Spanish (Español)',
            'it': 'Italian (Italiano)',
            'italian': 'Italian (Italiano)',
            'pt': 'Portuguese (Português)',
            'portuguese': 'Portuguese (Português)',
            'ru': 'Russian (Русский)',
            'russian': 'Russian (Русский)',
            'th': 'Thai (ไทย)',
            'thai': 'Thai (ไทย)',
            'vi': 'Vietnamese (Tiếng Việt)',
            'vietnamese': 'Vietnamese (Tiếng Việt)'
        };
        const fullLangName = languageMap[targetLang.toLowerCase()] || targetLang;

        const systemPrompt = `You are a professional subtitle translator. 
TASK: Translate the input text entirely into ${fullLangName}. 
TASK (Chinese Instruction): 请将以下文本完全翻译成 ${fullLangName}。

${stylePrompt}

### CRITICAL RULES:
1. Target Language: Every single word must be translated into ${fullLangName}. 
2. NO ECHO (严重警告): 严禁原样返回中文。If you return Chinese characters for a Korean/English translation, you have FAILED.
3. Markers: The input segments start with [0], [1], [2], etc. You MUST preserve these EXACT markers at the start of each segment (e.g., [0] Translation...).
4. No Fluff: Output ONLY the translated segments. Do not include any introductory or concluding remarks.
5. Line Structure: Keep each segment on its own line. Maintain a One-to-One mapping.`;

        // 如果文本过长，采用分块处理以提高稳定性
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 30) { // 降级分块阈值从 40 -> 30
            return this._translateInChunks(lines, fullLangName, systemPrompt, endpoint, model, apiKeys);
        }

        try {
            return await this._translateWithRetry(text, fullLangName, systemPrompt, endpoint, model, apiKeys);
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error('[AIAssistantHandler] Translation error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 顺序执行翻译请求 (支持重试处理 429 和 Key 轮询)
     */
    async _translateWithRetry(text, fullLangName, systemPrompt, endpoint, model, apiKeys) {
        const MAX_RETRIES_PER_KEY = 3;
        let currentKeyIndex = 0;

        for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt++) {
            const apiKey = apiKeys[currentKeyIndex];
            
            for (let attempt = 1; attempt <= MAX_RETRIES_PER_KEY; attempt++) {
                try {
                    const response = await axios.post(endpoint, {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: text }
                        ],
                        temperature: 0.3
                    }, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000 
                    });

                    return { success: true, translation: response.data.choices[0].message.content.trim() };
                } catch (error) {
                    const isRateLimit = error.response?.status === 429 || 
                                      error.message?.includes('429') || 
                                      error.message?.includes('Rate limit') ||
                                      error.response?.data?.error?.message?.includes('Rate limit');

                    if (isRateLimit) {
                        if (apiKeys.length > 1 && attempt === 1) {
                            console.warn(`[AIAssistantHandler] Key ${currentKeyIndex} rate limited, switching key...`);
                            break; // 切换下一个 Key
                        }
                        
                        if (attempt < MAX_RETRIES_PER_KEY) {
                            const delay = attempt * 8000; 
                            console.warn(`[AIAssistantHandler] Rate limit hit, retrying in ${delay / 1000}s... (Attempt ${attempt}/${MAX_RETRIES_PER_KEY})`);
                            await this._sleep(delay);
                            continue;
                        }
                    }
                    
                    if (keyAttempt === apiKeys.length - 1 && attempt === MAX_RETRIES_PER_KEY) {
                        throw error;
                    }
                    if (!isRateLimit) throw error; 
                }
            }
            currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        }
    }

    /**
     * 分块翻译长文本 (支持重试和 Key 轮询)
     */
    async _translateInChunks(lines, fullLangName, systemPrompt, endpoint, model, apiKeys) {
        const CHUNK_SIZE = 10; 
        let allTranslations = [];
        
        console.log(`[AIAssistantHandler] Text is long (${lines.length} lines), translating in smaller chunks...`);

        for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
            const chunk = lines.slice(i, i + CHUNK_SIZE).join('\n');
            try {
                const result = await this._translateWithRetry(chunk, fullLangName, systemPrompt, endpoint, model, apiKeys);
                if (result.success) {
                    allTranslations.push(result.translation);
                } else {
                    throw new Error(result.error || 'Unknown error during chunk translation');
                }
                await this._sleep(2000); 
            } catch (error) {
                console.error(`[AIAssistantHandler] Chunk ${i / CHUNK_SIZE} failed:`, error.message);
                throw error;
            }
        }

        return {
            success: true,
            translation: allTranslations.join('\n')
        };
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * AI 字幕润色 - 优化转录文本的标点和措辞
     */
    async polishText(segments, options = {}) {
        let apiKey = options.apiKey || this.apiKey;
        let provider = options.provider || 'openai';

        if (!apiKey) {
            throw new Error('API key is not set');
        }

        try {
            const config = translationService.getProviderConfig(provider);
            const endpoint = config?.endpoint || 'https://api.openai.com/v1/chat/completions';
            const model = translationService.getModel(provider) || 'gpt-4o-mini';

            const textWithMarkers = segments.map((seg, i) => `[${i}]${seg.text}`).join('\n');

            const response = await axios.post(endpoint, {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `你是专业的字幕编辑。请优化以下转录文本：
1. 修正标点符号，优化断句，修复错别字。
2. 保持原始含义和语气。
3. 输入格式：每行以 [序号] 开头。
4. 输出格式：必须保持相同的 [序号] 格式，每一行对应一个序号。
5. 重要：不要进行任何解释，不要输出任何开场白或总结，只输出带有 [序号] 格式的内容。`
                    },
                    { role: 'user', content: textWithMarkers }
                ],
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const polishedText = response.data.choices[0].message.content.trim();

            const polishedSegments = segments.map((seg, i) => {
                const regex = new RegExp(`\\[${i}\\]\\s*(.+?)(?=\\s*\\[\\d+\\]|$)`, 's');
                const match = polishedText.match(regex);
                let text = seg.text;
                if (match) {
                    text = match[1].trim();
                } else {
                    const lines = polishedText.split('\n');
                    const targetLine = lines.find(l => l.trim().startsWith(`[${i}]`));
                    if (targetLine) text = targetLine.replace(`[${i}]`, '').trim();
                }
                return { ...seg, text };
            });

            return {
                success: true,
                segments: polishedSegments,
                originalText: segments.map(s => s.text).join(' '),
                polishedText: polishedSegments.map(s => s.text).join(' ')
            };
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error('[AIAssistantHandler] Polish error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * AI 内容总结 - 归纳视频核心重点
     */
    async summarizeText(segments, options = {}) {
        let apiKey = options.apiKey || this.apiKey;
        let provider = options.provider || 'openai';
        let appLang = options.appLang || 'zh';

        const langNames = {
            'zh': '中文 (Chinese)', 'en': 'English', 'ja': '日本語 (Japanese)',
            'ko': '한국어 (Korean)', 'fr': 'Français (French)',
            'de': 'Deutsch (German)', 'es': 'Español (Spanish)'
        };
        const targetLangName = langNames[appLang] || 'English';

        if (!apiKey) {
            throw new Error('API key is not set');
        }

        try {
            const config = translationService.getProviderConfig(provider);
            const endpoint = config?.endpoint || 'https://api.openai.com/v1/chat/completions';
            const model = translationService.getModel(provider) || 'gpt-4o-mini';

            const text = segments.map(seg => seg.text).join(' ');

            const response = await axios.post(endpoint, {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `你是一个智能视频助手。请阅读以下视频转录文本，并生成一份精炼的内容摘要重点。
要求：
1. 响应语言必须为：${targetLangName}。
2. 采用 Markdown 列表格式（Bullet Points）。
3. 归纳出 3-5 个核心议题或结论。
4. 摘要必须简捷有力，不要啰嗦。
5. 如果视频较长，请按章节或时间点进行重点划分。`
                    },
                    { role: 'user', content: text }
                ],
                temperature: 0.5
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                summary: response.data.choices[0].message.content.trim()
            };
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error('[AIAssistantHandler] Summary error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 批量多语言翻译 (顺序执行，带进度回调)
     */
    async translateBatch(text, languages, options = {}) {
        const apiKeys = Array.isArray(options.apiKey) ? options.apiKey : (options.apiKey ? [options.apiKey] : (this.apiKey ? [this.apiKey] : []));
        const onProgress = options.onProgress || (() => {});

        if (apiKeys.length === 0) {
            throw new Error('API key is not set');
        }

        const results = {};
        const errors = [];
        let completedCount = 0;

        for (const lang of languages) {
            try {
                console.log(`[AIAssistantHandler] Batch translating to ${lang}...`);
                onProgress({ 
                    lang, 
                    current: completedCount + 1, 
                    total: languages.length,
                    status: 'processing'
                });

                const result = await this.translate(text, lang, { ...options, apiKey: apiKeys });
                
                if (result.success) {
                    results[lang] = result.translation;
                    completedCount++;
                    onProgress({ 
                        lang, 
                        current: completedCount, 
                        total: languages.length,
                        status: 'success'
                    });
                } else {
                    errors.push({ lang, error: result.error });
                    onProgress({ 
                        lang, 
                        current: completedCount, 
                        total: languages.length,
                        status: 'failed',
                        error: result.error
                    });
                }
                
                // 不同语种间呼吸下
                await this._sleep(2500); 
            } catch (e) {
                console.error(`[AIAssistantHandler] Batch error for ${lang}:`, e.message);
                errors.push({ lang, error: e.message });
                onProgress({ 
                    lang, 
                    current: completedCount, 
                    total: languages.length,
                    status: 'failed',
                    error: e.message
                });
            }
        }

        return {
            success: errors.length === 0,
            translations: results,
            errors: errors.length > 0 ? errors : undefined
        };
    }
}

module.exports = new AIAssistantHandler();
