/**
 * MediaFlow - CloudWhisperEngine
 * 音视频转录 - 云端 (OpenAI API) 引擎
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class CloudWhisperEngine {
    constructor() {
        this.apiKey = null;
        this.apiEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * 转录音频文件 (Internal Single File)
     * @param {string} filePath - 音频文件路径
     * @param {Object} options - 转录选项
     * @returns {Promise<Object>} 转录结果
     */
    async transcribeSingle(filePath, options = {}) {
        const {
            language = null,
            responseFormat = 'verbose_json',
            timestampGranularity = 'segment',
            onProgress = () => { },
            provider = 'openai',
            apiKey = options.apiKey || this.apiKey
        } = options;

        if (!apiKey) {
            throw new Error('API key is not set. Configure it in Settings.');
        }

        let endpoint;
        let model;

        if (provider === 'groq' || provider === 'groq-turbo') {
            endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
            model = provider === 'groq-turbo' ? 'whisper-large-v3-turbo' : 'whisper-large-v3';
        } else if (provider === 'siliconflow' || provider === 'siliconflow-sense') {
            endpoint = 'https://api.siliconflow.cn/v1/audio/transcriptions';
            model = provider === 'siliconflow-sense' ? 'FunAudioLLM/SenseVoiceSmall' : 'Systran/faster-whisper-large-v3';
        } else {
            endpoint = this.apiEndpoint;
            model = 'whisper-1';
        }

        try {
            const uploadFileStream = fs.createReadStream(filePath);
            const formData = new FormData();
            formData.append('file', uploadFileStream);
            formData.append('model', model);
            formData.append('response_format', responseFormat);

            if (language) formData.append('language', language);
            if (options.prompt || options.initialPrompt) {
                formData.append('prompt', options.prompt || options.initialPrompt);
            }

            if (provider === 'openai' && timestampGranularity === 'word') {
                formData.append('timestamp_granularities[]', 'word');
                formData.append('timestamp_granularities[]', 'segment');
            }

            console.log(`[CloudWhisperEngine] Provider: ${provider}, Model: ${model}, Prompt: ${options.prompt || options.initialPrompt || 'none'}`);

            const response = await axios.post(endpoint, formData, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 300000,
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const mappedProgress = 20 + (percentCompleted * 0.75);
                    onProgress(mappedProgress);
                }
            });

            return {
                success: true,
                text: response.data.text,
                segments: response.data.segments || [],
                words: response.data.words || [],
                language: response.data.language,
                duration: response.data.duration
            };

        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error('[CloudWhisperEngine] Error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }
}

module.exports = new CloudWhisperEngine();
