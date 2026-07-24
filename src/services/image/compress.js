const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

class CompressService {

    /**
     * Get image metadata
     */
    async getInfo(filePath) {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, error: 'FILE_NOT_FOUND' };
            }
            // Videos / non-images must not hit sharp (throws "unsupported image format")
            const ext = path.extname(String(filePath)).toLowerCase();
            if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mp3', '.wav', '.flac', '.aac'].includes(ext)) {
                return {
                    success: false,
                    error: 'NOT_AN_IMAGE',
                    message: 'This file is not a supported image for compress'
                };
            }
            const metadata = await sharp(filePath).metadata();
            return {
                success: true,
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: fs.statSync(filePath).size,
                sizeFormatted: this.formatSize(fs.statSync(filePath).size)
            };
        } catch (error) {
            console.error('Error getting info:', error?.message || error);
            return {
                success: false,
                error: 'UNSUPPORTED_FORMAT',
                message: error?.message || 'Unsupported image format'
            };
        }
    }

    /**
     * Generate preview buffer
     */
    async preview(inputPath, options) {
        try {
            const pipeline = await this.createPipeline(inputPath, options);
            const buffer = await pipeline.toBuffer();

            const base64 = `data:image/${options.format === 'original' ? 'jpeg' : options.format};base64,${buffer.toString('base64')}`;

            // Calculate estimated size savings
            const originalSize = fs.statSync(inputPath).size;
            const newSize = buffer.length;
            const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

            return {
                success: true,
                preview: base64,
                outputSize: newSize,
                savings: (newSize < originalSize ? `-${savings}%` : `+${Math.abs(savings)}%`)
            };
        } catch (error) {
            console.error('Preview error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Compress single file
     */
    async compress(inputPath, outputPath, options) {
        try {
            const pipeline = await this.createPipeline(inputPath, options);
            await pipeline.toFile(outputPath);
            const inputSize = fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0;
            const outputSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
            return {
                success: true,
                output: outputPath,
                outputPath,
                inputSize,
                outputSize
            };
        } catch (error) {
            console.error('Compress error:', error);
            return { success: false, error: error.message || String(error) };
        }
    }

    /**
     * Batch compress files (Parallel Version)
     */
    async batchCompress(files, outputDir, options, onProgress) {
        let completed = 0;
        let totalSavedBytes = 0;
        const results = [];

        // Ensure output dir exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Dynamic import p-limit (ESM/CJS compatibility)
        const pLimit = (await import('p-limit')).default;
        // Default concurrency: 4 (images are smaller IO/CPU bound than video)
        const limit = pLimit(options.concurrency || 4);

        const tasks = files.map((filePath, i) => {
            return limit(async () => {
                const fileName = path.basename(filePath);
                const ext = path.extname(fileName);
                const name = path.basename(fileName, ext);

                // Determine output filename
                let outName = name;
                let outExt = options.format === 'original' ? ext : `.${options.format}`;

                if (options.renameOptions) {
                    if (options.renameOptions.addSuffix && options.renameOptions.suffix) {
                        outName += options.renameOptions.suffix;
                    }
                    if (options.renameOptions.addIndex) {
                        outName += `_${(i + 1).toString().padStart(3, '0')}`;
                    }
                    if (options.renameOptions.addDate) {
                        outName += `_${new Date().toISOString().split('T')[0]}`;
                    }
                }

                const outputPath = path.join(outputDir, outName + outExt);
                let resultItem = null;

                try {
                    let finalQuality = options.quality || 80;

                    // Smart Target Size Logic (Binary Search)
                    if (options.targetSize && options.targetSize > 0) {
                        let minQ = 5;
                        let maxQ = 100;
                        let bestQ = 5;

                        for (let step = 0; step < 7; step++) {
                            const midQ = Math.floor((minQ + maxQ) / 2);
                            const tempOptions = { ...options, quality: midQ };
                            // createPipeline is async — missing await breaks targetSize binary search
                            const pipeline = await this.createPipeline(filePath, tempOptions);
                            const buffer = await pipeline.toBuffer();

                            if (buffer.length <= options.targetSize) {
                                bestQ = midQ;
                                minQ = midQ + 1;
                            } else {
                                maxQ = midQ - 1;
                            }
                            if (minQ > maxQ) break;
                        }
                        finalQuality = bestQ;
                    }

                    // Final Compress
                    const finalOptions = { ...options, quality: finalQuality };
                    const pipeline = await this.createPipeline(filePath, finalOptions);
                    await pipeline.toFile(outputPath);

                    // Stats
                    const originalSize = fs.statSync(filePath).size;
                    const newSize = fs.statSync(outputPath).size;
                    totalSavedBytes += (originalSize - newSize);

                    resultItem = {
                        file: fileName,
                        status: 'success',
                        originalSize,
                        newSize,
                        finalQuality
                    };
                    results.push(resultItem);

                } catch (err) {
                    console.error(`Failed to compress ${fileName}:`, err);
                    resultItem = { file: fileName, status: 'error', error: err.message };
                    results.push(resultItem);
                } finally {
                    completed++;
                    if (onProgress) {
                        onProgress(completed, files.length, resultItem);
                    }
                }
            });
        });

        // Wait for all tasks
        await Promise.all(tasks);

        return {
            success: true,
            completed,
            totalSaved: this.formatSize(totalSavedBytes),
            totalSavedBytes,
            results
        };
    }

    /**
     * Create sharp pipeline with all transforms (rotation, resize, watermark, format)
     */
    async createPipeline(inputPath, options) {
        let pipeline = sharp(inputPath);

        // 1. Rotation & Flip
        if (options.rotation) {
            pipeline = pipeline.rotate(options.rotation);
        } else {
            pipeline = pipeline.rotate(); // Auto-rotate based on EXIF
        }

        if (options.flipH) pipeline = pipeline.flop(); // sharp flop is horizontal
        if (options.flipV) pipeline = pipeline.flip(); // sharp flip is vertical

        // 2. Resize & Smart Crop
        if (options.maxWidth || options.maxHeight) {
            const resizeOptions = {
                width: options.maxWidth || null,
                height: options.maxHeight || null,
                withoutEnlargement: true
            };

            if (options.useSmartCrop) {
                // [2.0 新增] 智能裁剪：使用信息熵 (entropy) 算法自动识别并保护画面主体
                resizeOptions.fit = 'cover';
                resizeOptions.position = sharp.strategy.entropy;
                console.log('[CompressService] Applying smart crop (entropy strategy)');
            } else {
                resizeOptions.fit = 'inside';
            }

            pipeline = pipeline.resize(resizeOptions);
        }

        // 3. Metadata
        if (options.stripExif) {
            pipeline = pipeline.withMetadata(false); // remove
        } else {
            pipeline = pipeline.withMetadata(); // keep
        }

        // 4. Watermark (Composite)
        if (options.watermark) {
            // [Fix] 获取基础图当前真实尺寸，用于限制水印大小
            const baseMetadata = await pipeline.metadata();
            const baseW = baseMetadata.width;
            const baseH = baseMetadata.height;

            const {
                text, color, position, image, margin, tiled, font, shadow, outline,
                textOpacity, textSize, imageOpacity, imageSize,
                opacity, size
            } = options.watermark;
            const composites = [];

            // 统一参数提取
            const finalImageOpacity = imageOpacity !== undefined ? imageOpacity : (opacity || 1);
            const finalImageSize = imageSize !== undefined ? imageSize : (size || 60);
            const finalTextOpacity = textOpacity !== undefined ? textOpacity : (opacity || 0.8);
            const finalTextSize = textSize !== undefined ? textSize : (size || 48);
            // 边距限制放宽到图片宽度的 25%
            const safeMargin = Math.min(margin || 0, Math.floor(baseW * 0.25));
            console.log(`[CompressService] Margin: requested=${margin}, safe=${safeMargin}, baseW=${baseW}`);

            // [Final Safeguard] 终极安全校验函数：确保任何水印 Buffer 及其边距绝不超标
            const getFinalSafeBuffer = async (instance) => {
                // 强制输出为 PNG 以保留透明度通道
                const wmBuf = await instance.png().toBuffer();
                const wmMeta = await sharp(wmBuf).metadata();

                // 如果宽度或高度超过底图，执行最后的紧急缩放
                if (wmMeta.width > baseW || wmMeta.height > baseH) {
                    const ratio = Math.min(baseW / wmMeta.width, baseH / wmMeta.height) * 0.95;
                    console.log(`[CompressService] Emergency resize: ${wmMeta.width}x${wmMeta.height} -> ratio ${ratio}`);
                    return await sharp(wmBuf)
                        .resize({
                            width: Math.floor(wmMeta.width * ratio),
                            withoutEnlargement: true
                        })
                        .png() // 缩放后再次确保 PNG
                        .toBuffer();
                }
                return wmBuf;
            };

            // 1. Image Watermark Processing
            if (image) {
                try {
                    let wmBuffer;
                    if (image.startsWith('data:')) {
                        wmBuffer = Buffer.from(image.split(',')[1], 'base64');
                    } else if (fs.existsSync(image)) {
                        wmBuffer = fs.readFileSync(image);
                    }

                    if (wmBuffer) {
                        let wmInstance = sharp(wmBuffer).ensureAlpha();

                        // [Rotation Support] 应用旋转
                        const rotation = options.watermark.rotation || 0;
                        if (rotation !== 0) {
                            wmInstance = wmInstance.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
                        }

                        // 预留边距空间
                        const totalMaxW = Math.floor(baseW * 0.95);
                        const subjectMaxW = Math.max(20, totalMaxW - (safeMargin * 2));
                        let targetW = Math.max(30, finalImageSize * 4.5); // 增加系数
                        if (targetW > subjectMaxW) targetW = subjectMaxW;

                        wmInstance = wmInstance.resize({ width: Math.round(targetW), withoutEnlargement: true });

                        if (finalImageOpacity < 1) {
                            // 直接修改 RGBA 数据中的 Alpha 通道（最可靠的透明度调整方法）
                            const tmp = await wmInstance.ensureAlpha().raw().toBuffer();
                            const meta = await sharp(await wmInstance.png().toBuffer()).metadata();

                            // 遍历每个像素的 Alpha 通道（每 4 字节为一个像素：RGBA）
                            for (let i = 3; i < tmp.length; i += 4) {
                                tmp[i] = Math.round(tmp[i] * finalImageOpacity);
                            }

                            // 重新组装图片
                            wmInstance = sharp(tmp, {
                                raw: { width: meta.width, height: meta.height, channels: 4 }
                            });
                            console.log(`[CompressService] Applied image opacity: ${finalImageOpacity}`);
                        }

                        if (safeMargin > 0) {
                            wmInstance = wmInstance.extend({
                                top: safeMargin, bottom: safeMargin,
                                left: safeMargin, right: safeMargin,
                                background: { r: 0, g: 0, b: 0, alpha: 0 }
                            });
                        }

                        const imageCompositeOptions = {
                            input: await getFinalSafeBuffer(wmInstance)
                        };

                        if (tiled) {
                            imageCompositeOptions.tile = true;
                        } else {
                            imageCompositeOptions.gravity = this.mapPositionToGravity(position);
                        }

                        composites.push(imageCompositeOptions);
                        console.log(`[CompressService] Added image watermark composite (opacity: ${finalImageOpacity}${tiled ? ', tiled' : ''})`);
                    }
                } catch (e) {
                    console.error('[CompressService] Image watermark failed:', e);
                }
            }

            // 2. Text Watermark Processing
            if (text) {
                try {
                    const fileName = path.basename(inputPath);
                    const dynamicText = text
                        .replace(/{filename}/gi, fileName)
                        .replace(/{date}/gi, new Date().toISOString().split('T')[0])
                        .replace(/{year}/gi, new Date().getFullYear());

                    // 直接使用用户设置的字号，不再自动缩小
                    // 如果水印超出图片边界，会在后续 resize 步骤中被裁剪
                    const processedTextSize = finalTextSize;

                    // generateWatermarkSVG 支持 font、shadow、outline 参数
                    const svgURI = this.generateWatermarkSVG(dynamicText, color, finalTextOpacity, processedTextSize, baseW, font, shadow, outline);
                    let textInstance = sharp(Buffer.from(svgURI));

                    // [Rotation Support] 应用旋转
                    const rotation = options.watermark.rotation || 0;
                    // 应用旋转
                    if (rotation !== 0) {
                        textInstance = textInstance.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
                    }

                    // 应用边距 (Extend)
                    // 无论是否平铺都应用边距，平铺模式下这会增加瓦片之间的间距
                    if (safeMargin > 0) {
                        textInstance = textInstance.extend({
                            top: safeMargin, bottom: safeMargin,
                            left: safeMargin, right: safeMargin,
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        });
                    }

                    // 构建 composite 选项
                    const compositeOptions = {
                        input: await getFinalSafeBuffer(textInstance)
                    };

                    // tile 和 gravity 不兼容，二选一
                    if (tiled) {
                        compositeOptions.tile = true;
                        // 平铺模式使用左上角作为起始点
                    } else {
                        compositeOptions.gravity = this.mapPositionToGravity(position);
                    }

                    composites.push(compositeOptions);
                    console.log('[CompressService] Added text watermark composite:', dynamicText, tiled ? '(tiled)' : '');
                } catch (e) {
                    console.error('[CompressService] Text watermark failed:', e);
                }
            }

            if (composites.length > 0) {
                pipeline = pipeline.composite(composites);
            }
        }

        // 5. Format & Quality
        const format = options.format === 'original' ? path.extname(inputPath).slice(1).toLowerCase() : options.format;
        // Fix for 'original' being empty or invalid
        const validFormat = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif'].includes(format) ? format : 'jpeg';

        const quality = options.quality || 80;

        switch (validFormat) {
        case 'jpeg':
        case 'jpg':
            pipeline = pipeline.jpeg({ quality, mozjpeg: true });
            break;
        case 'png':
            pipeline = pipeline.png({ quality: Math.min(100, Math.max(0, quality)), compressionLevel: 9 });
            break;
        case 'webp':
            pipeline = pipeline.webp({ quality });
            break;
        case 'avif':
            pipeline = pipeline.avif({ quality, effort: 4 });
            break;
        case 'tiff':
            pipeline = pipeline.tiff({ quality });
            break;
        case 'gif':
            pipeline = pipeline.gif();
            break;
        }

        return pipeline;
    }

    generateWatermarkSVG(text, color, opacity, size, maxBaseW = 2000, font = 'sans-serif', shadow = true, outline = false) {
        void maxBaseW;
        // 估算文字实际宽度（收紧估算，不再额外加 padding）
        // 中文字符约 1.0, 西文约 0.6，取 1.0 确保英文也能完整显示且不留太多空隙
        let estimatedW = text.length * size * 1.0;
        const width = estimatedW;
        // 高度从 2.5 缩小到 1.2，确保文字垂直方向紧凑
        const height = size * 1.2;

        // 字体映射：国际化字体堆栈
        const fontFamilyMap = {
            'sans-serif': 'Arial, Helvetica, "Microsoft YaHei", "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", sans-serif',
            'serif': 'Georgia, "Times New Roman", "SimSun", "Songti SC", "Noto Serif CJK SC", serif',
            'monospace': '"SF Mono", "Fira Code", Consolas, "Courier New", "Microsoft YaHei", monospace',
            'script': '"Brush Script MT", "Lucida Handwriting", "Segoe Script", cursive',
            'display': 'Impact, Haettenschweiler, "Arial Black", "Franklin Gothic Bold", fantasy',
            'rounded': '"Varela Round", "Comic Sans MS", Verdana, "Microsoft YaHei", sans-serif',
            'condensed': '"Arial Narrow", "Roboto Condensed", "Fira Sans Condensed", sans-serif',
            'elegant': 'Didot, "Bodoni MT", "Playfair Display", Georgia, serif',
            'modern': 'Futura, "Century Gothic", "Avant Garde", "Trebuchet MS", sans-serif',
            'slab': 'Rockwell, "Courier New", "Roboto Slab", "Zilla Slab", serif'
        };
        const fontFamily = fontFamilyMap[font] || fontFamilyMap['sans-serif'];

        // 阴影样式：使用 SVG filter 或 text-shadow
        const shadowFilter = shadow ? 'filter: drop-shadow(3px 3px 4px rgba(0,0,0,0.7));' : '';

        // 描边样式
        const strokeStyle = outline ? `stroke: rgba(0,0,0,0.8); stroke-width: ${Math.max(1, Math.floor(size / 20))}px; paint-order: stroke fill;` : '';

        return `
        <svg width="${width}" height="${height}">
            <style>
                .text {
                    fill: ${color};
                    font-size: ${size}px;
                    font-family: ${fontFamily};
                    font-weight: bold;
                    opacity: ${opacity};
                    ${shadowFilter}
                    ${strokeStyle}
                }
            </style>
            <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="text">${this.escapeXml(text)}</text>
        </svg>
        `;
    }

    mapPositionToGravity(pos) {
        const map = {
            'northwest': 'northwest',
            'north': 'north',
            'northeast': 'northeast',
            'west': 'west',
            'center': 'center',
            'east': 'east',
            'southwest': 'southwest',
            'south': 'south',
            'southeast': 'southeast'
        };
        return map[pos] || 'center';
    }

    escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            }
        });
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const isNegative = bytes < 0;
        const absBytes = Math.abs(bytes);
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(absBytes) / Math.log(k));
        const formatted = parseFloat((absBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        return isNegative ? '-' + formatted : formatted;
    }
}

module.exports = new CompressService();
