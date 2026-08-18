/**
 * PixelAIMediator.js
 * 核心逻辑：协调 AI 处理流水线 (超分 -> 裁剪 -> 压缩)
 *
 * Upscale backends (in order):
 * 1) window.mediaflow.enhance.image — full product Enhance page IPC
 * 2) window.mediaflow.compress.aiUpscale — Community / compress-toolbox path
 */

class PixelAIMediator {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.isProcessing = false;
    }

    /**
     * 执行全流程处理
     * @param {string} filePath - 源文件路径
     * @param {Object} options - 处理参数 (包含 AI 开关)
     * @param {Function} onProgress - 进度回调
     * @returns {Promise<Object>} 处理结果
     */
    async process(filePath, options, onProgress) {
        if (!filePath) return null;

        let currentPath = filePath;
        let finalOptions = { ...options };

        try {
            // 步骤 1: AI 超分 (Upscale) — part of image compress toolbox
            if (options.enableAiUpscale) {
                const scale = options.aiUpscaleScale || 2;
                const upscaleResult = await this.upscale(currentPath, scale, onProgress);

                if (upscaleResult?.success && (upscaleResult.outputPath || upscaleResult.output)) {
                    currentPath = upscaleResult.outputPath || upscaleResult.output;
                } else if (upscaleResult && !upscaleResult.success) {
                    console.warn('[PixelAIMediator] Upscale skipped:', upscaleResult.error || 'failed');
                    finalOptions.enableAiUpscale = false;
                }
            }

            // 步骤 2: AI 智能裁剪 (Smart Crop)
            if (options.enableSmartCrop) {
                finalOptions.useSmartCrop = true;
            }

            return {
                success: true,
                path: currentPath,
                finalOptions: finalOptions
            };
        } catch (error) {
            console.warn('[PixelAIMediator] Pipeline error:', error?.message || error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 调用后端接口执行超分（Enhance 页或 compress.aiUpscale）
     */
    async upscale(inputPath, scale, onProgress) {
        const enhanceApi = window.mediaflow?.enhance;
        const compressApi = window.mediaflow?.compress;
        const hasEnhance = typeof enhanceApi?.image === 'function';
        const hasCompressUpscale = typeof compressApi?.aiUpscale === 'function';

        if (!hasEnhance && !hasCompressUpscale) {
            window.app?.showToast?.(
                window.i18n?.t('pixel.aiNotReady') ||
                    'AI Quality Enhancement service not ready',
                'warning'
            );
            return { success: false, error: 'AI Enhance service missing' };
        }

        let cleanupListener = null;
        try {
            if (onProgress) {
                if (hasEnhance && enhanceApi.onProgress) {
                    cleanupListener = enhanceApi.onProgress((data) => {
                        if (data && typeof data.progress === 'number') onProgress(data.progress);
                    });
                } else if (hasCompressUpscale && compressApi.onAiUpscaleProgress) {
                    cleanupListener = compressApi.onAiUpscaleProgress((data) => {
                        if (data && typeof data.progress === 'number') onProgress(data.progress);
                    });
                }
            }

            let result;
            if (hasEnhance) {
                result = await enhanceApi.image(inputPath, null, {
                    scale: scale,
                    engineId: 'esrgan',
                    performanceMode: 'balanced'
                });
            } else {
                result = await compressApi.aiUpscale(inputPath, {
                    scale: scale,
                    aiUpscaleScale: scale,
                    engineId: 'esrgan',
                    performanceMode: 'balanced'
                });
            }

            if (!result?.success) {
                const mapped = window.ImageAiErrorMap?.formatImageAiError?.(result, {
                    t: (key, fb) => {
                        const v = window.i18n?.t?.(key);
                        return v && v !== key ? v : fb;
                    }
                });
                window.app?.showToast?.(
                    mapped ||
                        (window.i18n?.t('pixel.engineNotFound') ||
                            'AI engine file not found — open Settings → Engines'),
                    'warning'
                );
            }

            return result || { success: false, error: 'empty result' };
        } catch (error) {
            const mapped = window.ImageAiErrorMap?.formatImageAiError?.(error, {
                t: (key, fb) => {
                    const v = window.i18n?.t?.(key);
                    return v && v !== key ? v : fb;
                }
            });
            window.app?.showToast?.(
                mapped ||
                    ((window.i18n?.t('pixel.aiCommsError') || 'AI communication error:') +
                        ' ' +
                        error.message),
                'error'
            );
            return { success: false, error: error.message };
        } finally {
            if (cleanupListener) cleanupListener();
        }
    }
}

window.PixelAIMediator = PixelAIMediator;
