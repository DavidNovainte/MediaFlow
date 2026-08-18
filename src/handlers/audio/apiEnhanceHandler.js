/**
 * API Enhance Handler - 云端 API 音频增强
 * 支持 Dolby.io 等云端音频增强服务
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');

// API 配置（从 electron-store 读取）
let apiConfig = {
    provider: 'dolby', // dolby | custom
    dolbyApiKey: '',
    customEndpoint: '',
    customApiKey: ''
};

/**
 * 设置 API 配置
 */
function setApiConfig(config) {
    apiConfig = { ...apiConfig, ...config };
}

/**
 * 获取当前 API 配置
 */
function getApiConfig() {
    return { ...apiConfig };
}

/**
 * 检查 API 是否已配置
 */
function isApiConfigured() {
    if (apiConfig.provider === 'dolby') {
        return !!apiConfig.dolbyApiKey;
    }
    return !!apiConfig.customEndpoint && !!apiConfig.customApiKey;
}

/**
 * 使用 Dolby.io 增强音频
 * https://docs.dolby.io/media-apis/docs/enhance-api-guide
 */
async function enhanceWithDolby(inputPath, outputPath, onProgress) {
    const apiKey = apiConfig.dolbyApiKey;
    if (!apiKey) {
        throw new Error('Dolby API Key not configured');
    }

    onProgress?.(5, '上传音频到 Dolby.io...');

    // Step 1: 获取上传 URL
    const uploadInfo = await dolbyRequest('/media/input', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            url: `dlb://in/${path.basename(inputPath)}`
        })
    });

    // Step 2: 上传文件
    const fileBuffer = fs.readFileSync(inputPath);
    await uploadToDolby(uploadInfo.url, fileBuffer);
    onProgress?.(30, '处理中...');

    // Step 3: 开始增强任务
    const jobResponse = await dolbyRequest('/media/enhance', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: `dlb://in/${path.basename(inputPath)}`,
            output: `dlb://out/${path.basename(outputPath)}`,
            content: {
                type: 'voice_recording'
            },
            audio: {
                noise: { reduction: { enable: true, amount: 'max' } },
                speech: { sibilance: { reduction: { enable: true } } }
            }
        })
    });

    const jobId = jobResponse.job_id;

    // Step 4: 轮询任务状态
    let status = 'Pending';
    while (status !== 'Success' && status !== 'Failed') {
        await sleep(2000);
        const statusResponse = await dolbyRequest(`/media/enhance?job_id=${jobId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        status = statusResponse.status;

        if (statusResponse.progress) {
            onProgress?.(30 + Math.floor(statusResponse.progress * 0.5), '处理中...');
        }
    }

    if (status === 'Failed') {
        throw new Error('Dolby enhancement failed');
    }

    onProgress?.(80, '下载结果...');

    // Step 5: 获取下载 URL
    const downloadInfo = await dolbyRequest('/media/output', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            url: `dlb://out/${path.basename(outputPath)}`
        })
    });

    // Step 6: 下载结果
    await downloadFromUrl(downloadInfo.url, outputPath);
    onProgress?.(100, '完成！');

    return { success: true, output: outputPath, engine: 'Dolby.io' };
}

/**
 * 使用自定义 API 增强音频
 */
async function enhanceWithCustomApi(inputPath, outputPath, onProgress) {
    const { customEndpoint, customApiKey } = apiConfig;

    if (!customEndpoint || !customApiKey) {
        throw new Error('Custom API not configured');
    }

    onProgress?.(10, '上传到自定义 API...');

    // 发送 multipart 请求
    const form = new FormData();
    form.append('file', fs.createReadStream(inputPath));

    await new Promise((resolve, reject) => {
        const url = new URL(customEndpoint);
        const req = https.request({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${customApiKey}`
            }
        }, (res) => {
            let data = Buffer.alloc(0);
            res.on('data', (chunk) => {
                data = Buffer.concat([data, chunk]);
            });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    // 假设 API 直接返回处理后的音频
                    fs.writeFileSync(outputPath, data);
                    resolve({ success: true });
                } else {
                    reject(new Error(`API returned ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        form.pipe(req);
    });

    onProgress?.(100, '完成！');
    return { success: true, output: outputPath, engine: 'Custom API' };
}

/**
 * 主入口 - 使用配置的 API 增强
 */
async function handleApiEnhance(event, options) {
    const { input, output } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    if (!fs.existsSync(input)) {
        return { success: false, error: `Input file not found: ${input}` };
    }

    if (!isApiConfigured()) {
        return { success: false, error: 'API not configured. Please set API key in settings.' };
    }

    try {
        const onProgress = (percent, status) => {
            event.sender.send('apienhance:progress', { progress: percent, status });
        };

        if (apiConfig.provider === 'dolby') {
            return await enhanceWithDolby(input, output, onProgress);
        } else {
            return await enhanceWithCustomApi(input, output, onProgress);
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Helper functions
function dolbyRequest(endpoint, options = {}) {
    const baseUrl = 'https://api.dolby.com';
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, baseUrl);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

function uploadToDolby(url, buffer) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'PUT',
            headers: { 'Content-Length': buffer.length }
        }, (res) => {
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

function downloadFromUrl(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    setApiConfig,
    getApiConfig,
    isApiConfigured,
    handleApiEnhance
};
