const compressService = require('../services/image/compress');
const imageService = require('../../services/image/image');
const fs = require('fs');
const { createProgressThrottler, resolveImageConcurrency } = require('../utils/progressThrottle');

/**
 * Lazy-load enhance pipeline used by PixelFlow compress AI upscale.
 * Community ships EnhanceService for compress only (no enhance.html page).
 */
function getEnhanceService() {
    try {
        return require('../services/enhance/EnhanceService');
    } catch (error) {
        console.warn('[ImageHandler] EnhanceService unavailable:', error?.message || error);
        return null;
    }
}

/** Map UI/legacy names → EngineManager keys (cugan | esrgan | gfpgan). */
function normalizeEnhanceEngineId(raw) {
    const id = String(raw || 'esrgan').toLowerCase();
    const map = {
        esrgan: 'esrgan',
        realesrgan: 'esrgan',
        'real-esrgan': 'esrgan',
        'realesrgan-ncnn-vulkan': 'esrgan',
        cugan: 'cugan',
        realcugan: 'cugan',
        'real-cugan': 'cugan',
        'realcugan-ncnn-vulkan': 'cugan',
        gfpgan: 'gfpgan'
    };
    return map[id] || 'esrgan';
}

function buildUpscaleOptions(options = {}) {
    const { enableAiUpscale, concurrency, renameOptions, targetSize, ...rest } = options;
    void enableAiUpscale;
    void concurrency;
    void renameOptions;
    void targetSize;
    return {
        ...rest,
        engineId: normalizeEnhanceEngineId(options.engineId),
        scale: options.scale || options.aiUpscaleScale || 4,
        model: options.model || 'realesrgan-x4plus',
        // Force PNG temp output — realesrgan-ncnn-vulkan can crash on some webp/jpg encode paths
        format: 'png'
    };
}

const setupImageHandlers = (ipcMain) => {

    // ==================== PixelFlow IPC (图片压缩服务) ====================

    /**
     * 压缩单张图片
     */
    /**
     * 压缩单张图片
     */
    ipcMain.handle('compress:single', async (event, inputPath, outputPath, options) => {
        let processInputPath = inputPath;
        let tempEnhancedPath = null;

        // 1. 如果启用了 AI 增强，先进行增强（图片压缩内功能，Community 可用）
        if (options && options.enableAiUpscale) {
            try {
                const enhanceService = getEnhanceService();
                if (!enhanceService) {
                    console.warn('[ImageHandler] AI upscale requested but EnhanceService is not available; using original image.');
                } else {
                // 通知前端开始 AI 处理
                event.sender.send('compress:progress-stage', { stage: 'enhancing', inputPath });

                const enhanceResult = await enhanceService.enhanceImage(
                    inputPath,
                    null, // 使用临时路径
                    buildUpscaleOptions(options),
                    (progress) => {
                        // AI 增强进度
                        console.log(`[ImageHandler] Enhancing: ${progress}%`);
                    }
                );

                if (enhanceResult.success) {
                    processInputPath = enhanceResult.outputPath;
                    tempEnhancedPath = enhanceResult.outputPath;
                } else {
                    console.error('[ImageHandler] AI Enhance failed, falling back to original:', enhanceResult.error);
                }
                }
            } catch (error) {
                console.error('[ImageHandler] AI Enhance exception:', error);
            }
        }

        // 2. 执行压缩 (使用原图或增强后的图)
        if (tempEnhancedPath) {
            event.sender.send('compress:progress-stage', { stage: 'compressing', inputPath });
        }

        const result = await compressService.compress(processInputPath, outputPath, options);

        // 3. 清理临时增强文件
        if (tempEnhancedPath) {
            try {
                fs.unlinkSync(tempEnhancedPath);
            } catch {
                console.warn('[ImageHandler] Failed to cleanup temp file:', tempEnhancedPath);
            }
        }

        return result;
    });

    /**
     * 批量压缩图片
     */
    ipcMain.handle('compress:batch', async (event, files, outputDir, options, aiCacheMap = {}) => {
        const fileList = Array.isArray(files) ? files : [];
        const totalFiles = fileList.length;
        const progress = createProgressThrottler((payload) => {
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('compress:progress', payload);
            }
        }, { minIntervalMs: 120 });

        // 如果启用了 AI 增强，我们需要在 handler 层处理（Community 可用）
        if (options && options.enableAiUpscale) {
            // AI is heavy — default lower concurrency, still user-overridable (1–6)
            const concurrency = resolveImageConcurrency(options, totalFiles, { ai: true });
            const total = totalFiles;
            let completed = 0;

            const pLimit = require('p-limit');
            const limit = pLimit(concurrency);

            // 核心函数：增强并压缩
            const enhanceAndCompress = async (inputPath, index) => {
                const ext = compressService.getOutputExtension(inputPath, options.format);
                const baseName = require('path').basename(inputPath, require('path').extname(inputPath));
                const rename = options.renameOptions || { addSuffix: true, suffix: '_compressed' };
                let outputName = baseName;

                if (rename.addSuffix && rename.suffix) outputName += rename.suffix;
                if (rename.addIndex) outputName += '_' + String(index + 1).padStart(3, '0');
                if (rename.addDate) outputName += '_' + new Date().toISOString().split('T')[0];

                const outputPath = require('path').join(outputDir, `${outputName}${ext}`);

                let processInput = inputPath;
                let tempPath = null;

                // [Optimized] AI Enhance - 优先检查缓存
                if (aiCacheMap && aiCacheMap[inputPath]) {
                    console.log(`[Batch] 🚀 Skipping AI Enhance for ${inputPath}, using cache: ${aiCacheMap[inputPath]}`);
                    processInput = aiCacheMap[inputPath];
                    // 注意：这里由于是复用之前的临时文件，不用设置 tempPath，因为不需要在本次任务结束后删除该缓存（它属于预览缓存）
                } else {
                    try {
                        const enhanceService = getEnhanceService();
                        if (!enhanceService) {
                            console.warn('[Batch] EnhanceService unavailable; compressing original image.');
                        } else {
                            const enhanceResult = await enhanceService.enhanceImage(
                                inputPath,
                                null,
                                buildUpscaleOptions(options),
                                null
                            );
                            if (enhanceResult.success) {
                                processInput = enhanceResult.outputPath;
                                tempPath = enhanceResult.outputPath;
                            }
                        }
                    } catch (e) {
                        console.error('[Batch] Enhance failed:', e);
                    }
                }

                // Compress
                let res;
                try {
                    res = await compressService.compress(processInput, outputPath, options);
                } catch (err) {
                    res = { success: false, error: err.message || String(err) };
                }
                res.index = index;
                res.file = require('path').basename(inputPath);
                if (res.success) {
                    // Prefer sizes from compress(); fall back to disk stats
                    if (res.inputSize == null && fs.existsSync(inputPath)) {
                        res.inputSize = fs.statSync(inputPath).size;
                    }
                    if (res.outputSize == null && fs.existsSync(outputPath)) {
                        res.outputSize = fs.statSync(outputPath).size;
                    }
                }

                // Cleanup
                // 只清理本次任务生成的临时文件，不清理来自预览的缓存文件
                if (tempPath) {
                    try {
                        fs.unlinkSync(tempPath);
                    } catch (cleanupError) {
                        void cleanupError;
                    }
                }
                return res;
            };

            const promises = fileList.map((file, index) => limit(async () => {
                const res = await enhanceAndCompress(file, index);
                completed++;
                progress.send(
                    { index: completed, total, result: res },
                    completed >= total
                );
                return res;
            }));

            const allResults = await Promise.all(promises);
            progress.flush();

            const successCount = allResults.filter(r => r && r.success).length;
            const totalSavedBytes = allResults.reduce((acc, r) => {
                if (!r || !r.success) return acc;
                const inn = Number(r.inputSize) || 0;
                const out = Number(r.outputSize) || 0;
                return acc + (inn - out);
            }, 0);

            return {
                success: true,
                total: total,
                completed: successCount,
                failed: total - successCount,
                totalSaved: compressService.formatSize(totalSavedBytes),
                results: allResults,
                concurrency
            };
        }

        const concurrency = resolveImageConcurrency(options, totalFiles, { ai: false });
        const batchOptions = { ...options, concurrency };

        const batchResult = await compressService.batchCompress(
            fileList,
            outputDir,
            batchOptions,
            (index, total, result) => {
                progress.send({ index, total, result }, index >= total);
            }
        );
        progress.flush();
        return { ...batchResult, concurrency };
    });

    /**
     * 预览压缩效果
     */
    ipcMain.handle('compress:preview', async (event, inputPath, options) => {
        return await compressService.preview(inputPath, options);
    });

    /**
     * 获取图片信息
     */
    ipcMain.handle('compress:getInfo', async (event, filePath) => {
        try {
            return await compressService.getInfo(filePath);
        } catch (error) {
            return {
                success: false,
                error: 'UNSUPPORTED_FORMAT',
                message: error?.message || 'Failed to read image info'
            };
        }
    });

    /**
     * AI 背景移除 (抠图) — part of image compress toolbox; available in Community
     */
    ipcMain.handle('image:remove-bg', async (event, inputPath, outputPath, options) => {
        return await imageService.removeBackground(inputPath, outputPath, options);
    });

    /**
     * AI upscale for PixelFlow preview (avoids needing full enhance page IPC in Community).
     * Returns { success, outputPath } like enhance.image.
     */
    ipcMain.handle('compress:aiUpscale', async (event, inputPath, options = {}) => {
        try {
            const enhanceService = getEnhanceService();
            if (!enhanceService) {
                return { success: false, error: 'EnhanceService unavailable' };
            }
            const result = await enhanceService.enhanceImage(
                inputPath,
                null,
                buildUpscaleOptions({
                    ...options,
                    enableAiUpscale: true,
                    aiUpscaleScale: options.scale || options.aiUpscaleScale || 4
                }),
                (progress) => {
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('compress:aiUpscaleProgress', {
                            progress,
                            inputPath
                        });
                    }
                }
            );
            return result;
        } catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    });

    /**
     * AI upscale engine status for Settings (Real-ESRGAN / CUGAN / …).
     * Shown under Settings → Engines so users can Install when missing.
     */
    ipcMain.handle('compress:getAiEngineStatus', async () => {
        try {
            const enhanceService = getEnhanceService();
            if (!enhanceService) {
                return {
                    success: false,
                    engines: {
                        esrgan: {
                            name: 'Real-ESRGAN',
                            installed: false,
                            version: 'N/A',
                            updateMethod: 'internal',
                            error: 'EnhanceService unavailable'
                        }
                    }
                };
            }
            const engines = {};
            for (const id of ['esrgan', 'cugan', 'gfpgan']) {
                const opts = enhanceService.getEngineOptions?.(id) || {};
                const installed = !!opts.isAvailable;
                engines[id] = {
                    name: opts.name || id,
                    installed,
                    version: installed ? 'local' : 'N/A',
                    updateMethod: 'internal',
                    path: opts.path || null
                };
            }
            return { success: true, engines };
        } catch (error) {
            return { success: false, error: error?.message || String(error), engines: {} };
        }
    });

    /**
     * Download / install AI upscale engine into app bin/ (e.g. Real-ESRGAN zip).
     */
    ipcMain.handle('compress:downloadAiEngine', async (event, engineId = 'esrgan') => {
        try {
            const enhanceService = getEnhanceService();
            if (!enhanceService) {
                return { success: false, error: 'EnhanceService unavailable' };
            }
            const id = normalizeEnhanceEngineId(engineId);
            const result = await enhanceService.downloadEngine(id, (percent) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('compress:aiEngineDownloadProgress', {
                        engineId: id,
                        progress: percent
                    });
                }
            });
            return result || { success: true };
        } catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    });

    /**
     * 代理外部图片 (解决各种 CDN 的权限/CORS 问题)
     */
    ipcMain.handle('image:proxy', async (event, imageUrl) => {
        if (!imageUrl) return null;

        try {
            const { net } = require('electron');
            const axios = require('axios');
            const urlObj = new URL(imageUrl);

            // 关键：对齐 UA 身份以维持签名合法性
            let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
            let referer = '';

            if (urlObj.hostname.includes('instagram') || urlObj.hostname.includes('cdninstagram')) {
                referer = 'https://www.instagram.com/';
            } else if (urlObj.hostname.includes('facebook') || urlObj.hostname.includes('fbcdn')) {
                referer = 'https://www.facebook.com/';
            } else if (urlObj.hostname.includes('douyin') || urlObj.hostname.includes('iesdouyin') || urlObj.hostname.includes('bdydns')) {
                // [Fix] 抖音必须在 TikTok 之前检查，因为 TikTok 的 tos- 路径规则会错误匹配抖音
                referer = 'https://www.douyin.com/';
                userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
            } else if (urlObj.hostname.match(/(tiktok|byteimg|tiktokcdn|ibytedtos|muscdn|musical\.ly)/) || urlObj.pathname.includes('tos-')) {
                referer = 'https://www.tiktok.com/';
                userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
            } else if (urlObj.hostname.includes('bilibili.com') || urlObj.hostname.includes('hdslb.com')) {
                referer = 'https://www.bilibili.com/';
            }

            console.log(`[ImageProxy] Fetching: ${urlObj.hostname} with UA Type: ${userAgent.includes('iPhone') ? 'Mobile' : 'Desktop'}`);

            // 优先使用 axios 配合流式处理，因为它对 Header 处理更稳健
            try {
                const response = await axios.get(imageUrl, {
                    headers: {
                        'User-Agent': userAgent,
                        'Referer': referer,
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    },
                    responseType: 'arraybuffer',
                    timeout: 8000,
                    validateStatus: (status) => status >= 200 && status < 400
                });

                const base64 = Buffer.from(response.data).toString('base64');
                const contentType = response.headers['content-type'] || 'image/jpeg';
                return `data:${contentType};base64,${base64}`;

            } catch (axiosError) {
                console.warn('[ImageProxy] Axios failed, falling back to net.request:', axiosError.message);

                // 降级使用 Electron 的 net.request
                return new Promise((resolve) => {
                    const request = net.request({
                        url: imageUrl,
                        headers: {
                            'User-Agent': userAgent,
                            'Referer': referer
                        }
                    });

                    request.on('response', (response) => {
                        const chunks = [];
                        response.on('data', (chunk) => chunks.push(chunk));
                        response.on('end', () => {
                            if (response.statusCode === 200) {
                                const buffer = Buffer.concat(chunks);
                                const base64 = buffer.toString('base64');
                                const contentType = response.headers['content-type'] || 'image/jpeg';
                                resolve(`data:${contentType};base64,${base64}`);
                            } else {
                                resolve(null);
                            }
                        });
                        response.on('error', () => resolve(null));
                    });
                    request.on('error', () => resolve(null));
                    request.end();
                });
            }
        } catch (error) {
            console.error('[ImageProxy] Fatal error:', error);
            return null;
        }
    });
};

module.exports = { setupImageHandlers };
