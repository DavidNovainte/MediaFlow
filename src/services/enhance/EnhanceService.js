/**
 * EnhanceService.js - AI 画质增强业务逻辑层
 * 负责参数校验、任务编排、进度聚合、临时文件管理
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const engineManager = require('./EngineManager');
const assetDownloader = require('./AssetDownloader');
const sharp = require('sharp');

class EnhanceService {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'mediaflow-enhance');
        this.ensureTempDir();
    }

    /**
     * 确保临时目录存在
     */
    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 生成临时输出路径
     * @param {string} inputPath 输入文件路径
     * @param {string} suffix 后缀标识
     * @returns {string} 临时输出路径
     */
    getTempOutputPath(inputPath, suffix = 'enhanced') {
        const ext = path.extname(inputPath);
        const base = path.basename(inputPath, ext);
        const timestamp = Date.now();
        return path.join(this.tempDir, `${base}_${suffix}_${timestamp}${ext}`);
    }

    /**
     * 获取所有可用引擎
     * @returns {Array<Object>} 引擎信息列表
     */
    async getAvailableEngines() {
        const localEngines = engineManager.getAvailableEngines();

        // Cloud API engines (Replicate / Fal / Stability) are intentionally NOT listed.
        // ApiService still exists as experimental code, but the UI path was prototype-quality
        // (unverified endpoints, Clipdrop vs Stability mismatch) and misled users in Settings.
        // Product focus: local Real-ESRGAN / Real-CUGAN / GFPGAN.
        return localEngines;
    }

    /**
     * 获取引擎选项
     * @param {string} engineId 引擎 ID
     * @returns {Object|null} 引擎信息 (含选项)
     */
    /**
     * 获取引擎选项
     * @param {string} engineId 引擎 ID
     * @returns {Object|null} 引擎信息 (含选项)
     */
    getEngineOptions(engineId) {
        // Cloud API engines are retired from product UI
        if (engineId && (String(engineId).endsWith('-api') || engineId === 'replicate' || engineId === 'fal' || engineId === 'stability')) {
            return null;
        }

        const engine = engineManager.getEngine(engineId);
        if (!engine) return null;

        const info = engine.getInfo();
        // 增加文件存在检测
        const exePath = engine.getExecutablePath();
        info.isAvailable = fs.existsSync(exePath);

        // UI engine ids: cugan / esrgan / gfpgan (not binary basenames)
        const downloadUrls = {
            gfpgan: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip',
            esrgan: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip',
            cugan: 'https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728/realcugan-ncnn-vulkan-20220728-windows.zip'
        };
        info.downloadUrl = downloadUrls[engineId] || '';

        return info;
    }

    /**
     * 增强单个图片
     * @param {string} inputPath 输入图片路径
     * @param {string} outputPath 输出图片路径 (可选，不传则使用临时路径)
     * @param {Object} options 处理选项
     * @param {string} options.engineId 引擎 ID
     * @param {number} options.scale 放大倍率
     * @param {Function} onProgress 进度回调
     * @returns {Promise<Object>} 处理结果
     */
    async enhanceImage(inputPath, outputPath, options, onProgress) {
        // 参数校验
        if (!inputPath || !fs.existsSync(inputPath)) {
            throw new Error('Input file does not exist');
        }

        // Normalize aliases (realesrgan→esrgan, realcugan→cugan) before engine lookup
        const engineId = engineManager.normalizeEngineId(options.engineId || 'esrgan');
        const finalOutputPath = outputPath || this.getTempOutputPath(inputPath, engineId);

        // 确保输出目录存在
        const outputDir = path.dirname(finalOutputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 获取原图尺寸
        let inputMeta = null;
        try {
            inputMeta = await sharp(inputPath).metadata();
            console.log(`[EnhanceService] Input: ${inputMeta.width}x${inputMeta.height}, Requested scale: ${options.scale}`);
        } catch (e) {
            console.warn('[EnhanceService] Failed to get input metadata:', e);
        }

        // 根据性能模式调整参数
        const performanceConfigs = {
            eco: { threads: '1:1:1' },
            balanced: { threads: '1:2:2' },
            turbo: { threads: '2:4:4' }
        };
        const perfConfig = performanceConfigs[options.performanceMode] || performanceConfigs.balanced;

        const enhancedOptions = {
            threads: perfConfig.threads,
            gpuId: 0,
            ...options
        };

        // [New] 拦截危险输出格式 (WebP/AVIF会导致 NCNN 引擎崩溃)
        // "auto" means keep engine-safe PNG/JPG and match input extension in the UI layer — do not post-process as "auto"
        let requestedOutputFormat = enhancedOptions.format;
        let requiresFormatPostProcess = false;

        if (requestedOutputFormat === 'auto' || requestedOutputFormat === undefined || requestedOutputFormat === null || requestedOutputFormat === '') {
            enhancedOptions.format = 'png';
            requiresFormatPostProcess = false;
        } else if (!['jpg', 'jpeg', 'png'].includes(String(requestedOutputFormat).toLowerCase())) {
            console.log(`[EnhanceService] Intercepted unsafe output format: ${requestedOutputFormat}. Forcing PNG pipeline.`);
            enhancedOptions.format = 'png';
            requiresFormatPostProcess = true;
        }

        let activeInputPath = inputPath;
        let tempFormatPath = null;
        let tempCropPath = null;

        // [关键修复] 检查并转换不受支持的输入格式
        // realesrgan-ncnn-vulkan 引擎在读取部分 webp 或 avif 时会引发 0xC0000409 (Buffer Overrun) 崩溃
        if (inputMeta && !['jpeg', 'jpg', 'png'].includes(inputMeta.format)) {
            tempFormatPath = this.getTempOutputPath(inputPath, 'format_safe').replace(/\.[^/.]+$/, '.png');
            try {
                await sharp(inputPath).toFormat('png').toFile(tempFormatPath);
                activeInputPath = tempFormatPath;
                console.log(`[EnhanceService] Auto-converted ${inputMeta.format} to safe PNG: ${tempFormatPath}`);
            } catch (e) {
                console.warn('[EnhanceService] Format conversion failed, proceeding with original:', e);
            }
        }

        // [New] 如果开启了局部裁剪导出 (Save Region)
        if (options.crop) {
            try {
                const { x, y, width, height } = options.crop;
                tempCropPath = this.getTempOutputPath(inputPath, 'crop').replace(/\.[^/.]+$/, '.png');

                await sharp(activeInputPath)
                    .extract({ left: x, top: y, width, height })
                    .toFormat('png')
                    .toFile(tempCropPath);

                activeInputPath = tempCropPath;
                console.log(`[EnhanceService] Region cropped: ${x},${y} ${width}x${height} -> ${tempCropPath}`);
            } catch (e) {
                console.error('[EnhanceService] Failed to crop image:', e);
                // 如果裁剪失败，回传错误
                throw new Error(`Crop failed: ${e.message}`);
            }
        }

        // Cloud API path retired (prototype quality). Force local engines only.
        if (engineId && String(engineId).endsWith('-api')) {
            throw new Error('Cloud enhance engines are no longer supported. Use CUGAN, Real-ESRGAN, or GFPGAN.');
        }

        // 本地引擎处理（AI 引擎会强制输出 4x）
        const selected = engineManager.selectEngine(engineId);
        if (!selected) {
            throw new Error(`Unknown enhance engine: ${engineId}. Use esrgan, cugan, or gfpgan.`);
        }
        const engineResult = await engineManager.enhance(activeInputPath, finalOutputPath, enhancedOptions, onProgress);

        // 清理临时文件
        if (tempCropPath && fs.existsSync(tempCropPath)) fs.unlinkSync(tempCropPath);
        if (tempFormatPath && fs.existsSync(tempFormatPath)) fs.unlinkSync(tempFormatPath);

        // [New] 安全地进行输出格式后处理 (将安全的 PNG 转换为目标格式)
        if (requiresFormatPostProcess && requestedOutputFormat) {
            try {
                const finalExt = `.${requestedOutputFormat}`;
                // 确保最终输出路径扩展名正确
                const postProcessOutputPath = finalOutputPath.endsWith(finalExt) 
                    ? finalOutputPath 
                    : finalOutputPath.replace(/\.[^/.]+$/, finalExt);

                // 只向真实的最终路径转换
                // 如果 engineResult 是覆盖原图的（通常不会），需避免读写同一文件
                const tempPostPath = postProcessOutputPath + '.tmp';

                await sharp(engineResult.outputPath || finalOutputPath)
                    .toFormat(requestedOutputFormat)
                    .toFile(tempPostPath);

                fs.unlinkSync(engineResult.outputPath || finalOutputPath);
                fs.renameSync(tempPostPath, postProcessOutputPath);

                console.log(`[EnhanceService] Post-processed format to ${requestedOutputFormat}: ${postProcessOutputPath}`);
                
                // 更新结果路径
                engineResult.outputPath = postProcessOutputPath;
                engineResult.output = postProcessOutputPath;

            } catch (e) {
                console.warn(`[EnhanceService] Post-process format conversion to ${requestedOutputFormat} failed:`, e);
            }
        }

        console.log(`[EnhanceService] Enhancement complete: ${engineResult.outputPath || finalOutputPath}`);

        return {
            ...engineResult,
            inputPath,
            outputPath: engineResult.outputPath || finalOutputPath,
            engineId
        };
    }

    /**
     * 生成预览 (只处理一小部分以快速展示效果)
     * @param {string} inputPath 输入文件路径
     * @param {Object} options 处理选项
     * @returns {Promise<Object>} 预览结果
     */
    async generatePreview(inputPath, options) {
        // [优化] 快速预览仅截取中间 512x512 区域进行处理，大幅提升速度
        let activeInput = inputPath;
        const PREVIEW_SIZE = 512;

        try {
            const metadata = await sharp(inputPath).metadata();

            // 只有当图片大于预览尺寸时才裁剪
            if (metadata.width > PREVIEW_SIZE || metadata.height > PREVIEW_SIZE) {
                const width = Math.min(metadata.width, PREVIEW_SIZE);
                const height = Math.min(metadata.height, PREVIEW_SIZE);
                const left = Math.floor((metadata.width - width) / 2);
                const top = Math.floor((metadata.height - height) / 2);

                // [性能优化] 强制使用 JPG 格式存储临时裁剪，速度更快
                const cropPath = path.join(this.tempDir, `preview_crop_${Date.now()}.jpg`);

                await sharp(inputPath)
                    .extract({ left, top, width, height })
                    .toFormat('jpg', { quality: 90 })
                    .toFile(cropPath);

                activeInput = cropPath;
            }
        } catch (e) {
            console.warn('[EnhanceService] Crop failed, falling back to full image:', e);
        }

        // 强制输出为 JPG 以提升编码速度
        const previewOutput = this.getTempOutputPath(inputPath, 'preview_result').replace(/\.[^/.]+$/, '.jpg');
        const previewOptions = {
            ...options,
            format: 'jpg',
            // 对于预览，如果是通用模型，可以考虑暂时用 2x 哪怕有瑕疵？
            // 不，BaseEngine 会强制 4x。保持一致性比较好。
        };

        const result = await this.enhanceImage(activeInput, previewOutput, previewOptions, null);

        // 如果生成了临时裁剪文件，记得标记清理（或者由 flush 机制处理）
        // 这里返回裁剪后的原图作为"Original"，以便前端对比时画面对齐
        return {
            success: result.success,
            previewPath: result.outputPath,
            originalPath: activeInput
        };
    }

    /**
     * 批量增强图片
     * @param {Array<string>} inputPaths 输入文件路径数组
     * @param {string} outputDir 输出目录
     * @param {Object} options 处理选项
     * @param {Function} onProgress 进度回调 (fileIndex, fileProgress, totalProgress)
     * @param {Function} onFileComplete 单文件完成回调
     * @returns {Promise<Array<Object>>} 处理结果数组
     */
    async enhanceBatch(inputPaths, outputDir, options, onProgress, onFileComplete) {
        const results = [];
        const total = inputPaths.length;
        const isApi = options.engineId?.endsWith('-api');

        // 云端 API 开启 3 并发，本地引擎保持 1 并发（串行）
        const concurrency = isApi ? 3 : 1;
        let activeCount = 0;
        let currentIndex = 0;
        let completedCount = 0;

        return new Promise((resolve) => {
            const processNext = async () => {
                if (currentIndex >= total) {
                    if (activeCount === 0) resolve(results);
                    return;
                }

                const i = currentIndex++;
                activeCount++;

                const inputPath = inputPaths[i];
                const inputExt = path.extname(inputPath);
                const base = path.basename(inputPath, inputExt);

                let ext = inputExt;
                if (options.format && options.format !== 'auto') {
                    ext = `.${options.format}`;
                }

                const outputPath = path.join(outputDir, `${base}_enhanced${ext}`);

                try {
                    const result = await this.enhanceImage(
                        inputPath,
                        outputPath,
                        options,
                        () => {
                            if (onProgress) {
                                // 处理并发时的总体进度估算
                                // 这里使用 (已完成数 + 当前文件进度/100) / 总数
                                // 注意：在并发模式下，i 对应的可能不是正在进行的那个，所以进度反馈会略有跳跃
                                // 修正：总体进度聚合
                            }
                        }
                    );

                    results[i] = result;
                    if (onFileComplete) onFileComplete(i, result);
                } catch (error) {
                    results[i] = {
                        success: false,
                        inputPath,
                        error: error.message
                    };
                    if (onFileComplete) onFileComplete(i, results[i]);
                } finally {
                    activeCount--;
                    completedCount++;

                    // 统一上报整体进度
                    if (onProgress) {
                        const totalProgress = (completedCount / total) * 100;
                        onProgress(i, 100, totalProgress);
                    }

                    processNext();
                }
            };

            // 启动初始并发任务
            for (let j = 0; j < Math.min(concurrency, total); j++) {
                processNext();
            }
        });
    }

    /**
     * 下载并安装引擎
     * @param {string} engineId 引擎 ID
     * @param {Function} onProgress 进度回调
     * @returns {Promise<Object>} 处理结果
     */
    async downloadEngine(engineId, onProgress) {
        const options = this.getEngineOptions(engineId);
        if (!options || !options.downloadUrl) {
            throw new Error('No download config found for this engine');
        }

        return await assetDownloader.download(options.downloadUrl, engineId, onProgress);
    }

    /**
     * 取消当前处理
     */
    cancel() {
        engineManager.cancel();
    }

    /**
     * 清理临时文件
     */
    cleanupTemp() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            const expiry = 24 * 60 * 60 * 1000; // 24小时

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > expiry) {
                    fs.unlinkSync(filePath);
                }
            }
            console.log('[EnhanceService] Old temp files cleaned up');
        } catch (error) {
            console.error('[EnhanceService] Failed to cleanup temp files:', error);
        }
    }
}

module.exports = new EnhanceService();
