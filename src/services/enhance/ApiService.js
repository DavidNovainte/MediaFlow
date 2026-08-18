/**
 * ApiService.js - 云端 AI 增强服务
 * 支持 Replicate, OpenAI 等第三方 API 进行图像超分与修复
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ApiService {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'mediaflow-enhance-api');
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 执行云端增强
     * @param {string} inputPath 输入路径
     * @param {string} outputPath 输出路径
     * @param {Object} config API 配置 (provider, apiKey, model 等)
     * @param {Function} onProgress 进度回调
     */
    async enhance(inputPath, outputPath, config, onProgress) {
        const { provider = 'replicate', apiKey } = config;

        if (!apiKey) {
            throw new Error(`API key for ${provider} is not configured. Add it in Settings.`);
        }

        if (onProgress) onProgress(10); // 初始进度

        switch (provider.toLowerCase()) {
        case 'replicate':
            return await this.enhanceViaReplicate(inputPath, outputPath, config, onProgress);
        case 'fal':
            return await this.enhanceViaFal(inputPath, outputPath, config, onProgress);
        case 'stability':
            return await this.enhanceViaStability(inputPath, outputPath, config, onProgress);
        case 'openai':
            return await this.enhanceViaOpenAI(inputPath, outputPath, config, onProgress);
        default:
            throw new Error(`Unsupported cloud provider: ${provider}`);
        }
    }

    /**
     * 使用 Replicate API (支持多种模型如 Real-ESRGAN)
     */
    async enhanceViaReplicate(inputPath, outputPath, config, onProgress) {
        const { apiKey, model = 'lucataco/real-esrgan:67b6911c7c656360811f32a7924716496df870a4427c320d7a64e1eb3606b12a' } = config; 

        // 1. 读取并转为 Base64 (Replicate 也可以接受 URL，但本地文件需上传或转 base64)
        // 注意：某些模型可能有限制，这里以常见方案为例
        const imageBuffer = fs.readFileSync(inputPath);
        const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        if (onProgress) onProgress(30);

        try {
            // 注意：这里需要根据 Replicate 的真实 SDK 或 API 结构实现
            // 下面是伪代码逻辑，实际实现需根据选定模型调整
            const response = await axios.post('https://api.replicate.com/v1/predictions', {
                version: model.split(':')[1],
                input: { image: base64Image }
            }, {
                headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' }
            });

            let prediction = response.data;
            if (onProgress) onProgress(50);

            // 轮询结果
            while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
                await new Promise(r => setTimeout(r, 2000));
                const statusRes = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                    headers: { 'Authorization': `Token ${apiKey}` }
                });
                prediction = statusRes.data;
                console.log(`[ApiService] Replicate status: ${prediction.status}`);
            }

            if (prediction.status === 'failed') {
                throw new Error(`Replicate failed: ${prediction.error}`);
            }

            if (onProgress) onProgress(80);

            // 下载结果
            const outputUrl = prediction.output;
            await this.downloadFile(outputUrl, outputPath);

            if (onProgress) onProgress(100);
            return { success: true };

        } catch (error) {
            console.error('[ApiService] Replicate Error:', error.response?.data || error.message);
            throw new Error(`Replicate API request failed: ${error.message}`);
        }
    }

    /**
     * 使用 Fal.ai API
     */
    async enhanceViaFal(inputPath, outputPath, config, onProgress) {
        const { apiKey, model = 'fal-ai/real-esrgan' } = config;

        const imageBuffer = fs.readFileSync(inputPath);
        const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        if (onProgress) onProgress(30);

        try {
            const response = await axios.post(`https://fal.run/${model}`, {
                image_url: base64Image
            }, {
                headers: {
                    'Authorization': `Key ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (onProgress) onProgress(80);

            const result = response.data;
            const outputUrl = result.image?.url || result.url;

            if (!outputUrl) throw new Error('Fal.ai did not return a valid image URL');

            await this.downloadFile(outputUrl, outputPath);

            if (onProgress) onProgress(100);
            return { success: true };

        } catch (error) {
            console.error('[ApiService] Fal.ai Error:', error.response?.data || error.message);
            throw new Error(`Fal.ai API call failed: ${error.message}`);
        }
    }

    /**
     * 使用 Stability AI (Clipdrop) API
     */
    async enhanceViaStability(inputPath, outputPath, config, onProgress) {
        const { apiKey } = config;
        const FormData = require('form-data');

        if (onProgress) onProgress(30);

        try {
            const form = new FormData();
            form.append('image_file', fs.createReadStream(inputPath));
            // 默认 2x 放大
            // 注意：稳定性 API 可能需要特定参数，这里以 Clipdrop upscale 为例

            const response = await axios.post('https://api.clipdrop.co/image-upscaling/v1/upscale', form, {
                headers: {
                    ...form.getHeaders(),
                    'x-api-key': apiKey
                },
                responseType: 'arraybuffer'
            });

            if (onProgress) onProgress(80);

            // Stability 直接返回图片 Buffer
            fs.writeFileSync(outputPath, response.data);

            if (onProgress) onProgress(100);
            return { success: true };

        } catch (error) {
            let msg = error.message;
            if (error.response?.data) {
                try {
                    const errorJson = JSON.parse(error.response.data.toString());
                    msg = errorJson.error || msg;
                } catch (parseError) {
                    void parseError;
                }
            }
            console.error('[ApiService] Stability Error:', msg);
            throw new Error(`Stability AI failed: ${msg}`);
        }
    }

    async enhanceViaOpenAI() {
        // OpenAI 目前主要是 DALL-E 的 Edit/Variations，并不直接提供超分
        // 这里可以预留 DALL-E 修复图片的逻辑，或报错
        throw new Error('OpenAI does not support Real-ESRGAN-style upscaling here. Use Replicate.');
    }

    async downloadFile(url, dest) {
        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(dest);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }
}

module.exports = new ApiService();
