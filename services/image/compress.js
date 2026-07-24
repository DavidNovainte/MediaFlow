/**
 * MediaFlow - Compress Service (PixelFlow)
 * 图片压缩服务 - 使用 Sharp 进行本地高效压缩
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

class CompressService {
    constructor() {
        // 默认压缩设置
        this.defaultOptions = {
            quality: 80,
            format: 'original',  // 'original', 'jpeg', 'png', 'webp', 'avif'
            maxWidth: null,
            maxHeight: null
        };
    }

    /**
     * 创建水印 SVG (支持文字水印的所有参数)
     * @param {Object} watermark - 水印配置
     * @param {number} imageWidth - 图片宽度
     * @param {number} imageHeight - 图片高度
     * @returns {Buffer} SVG Buffer 用于 composite
     */
    /**
     * 创建水印层 (SVG Buffer)
     * 支持文字和图片，支持平铺
     */
    async createWatermarkLayer(watermark, imageWidth, imageHeight) {
        const {
            type = 'text', // 'text' | 'image'
            text = '',
            image = '', // 图片路径
            font = 'sans-serif',
            color = '#ffffff',
            opacity = 0.8,
            size = 48,
            rotation = 0,
            shadow = true,
            outline = false,
            position = 'center',
            margin = 20,
            tiled = false
        } = watermark;

        // 如果是文字且为空，或者图片且路径为空，则返回 null
        if ((type === 'text' && !text) || (type === 'image' && !image)) {
            return null;
        }

        let contentWidth = 0;
        let contentHeight = 0;
        let contentSvg = '';

        // 1. 准备内容 (文字或图片)
        if (type === 'image' && image) {
            try {
                let input = image;
                // 如果是 Base64 Data URL，转换为 Buffer
                if (typeof image === 'string' && image.startsWith('data:')) {
                    const base64Data = image.split(',')[1];
                    if (base64Data) {
                        input = Buffer.from(base64Data, 'base64');
                    }
                }

                // 获取图片信息并压缩到指定大小
                const imgPipeline = sharp(input);
                const metadata = await imgPipeline.metadata();

                // 计算目标尺寸 (Size 作为宽度)
                const targetWidth = size || 100;
                const ratio = metadata.height / metadata.width;
                const targetHeight = Math.round(targetWidth * ratio);

                contentWidth = targetWidth;
                contentHeight = targetHeight;

                // 转换为 Base64 (强制转为 PNG 以避免格式兼容性问题)
                const buffer = await imgPipeline
                    .resize(targetWidth, targetHeight)
                    .png()
                    .toBuffer();

                const base64 = `data:image/png;base64,${buffer.toString('base64')}`;

                // 生成图片 SVG 元素
                contentSvg = `<image href="${base64}" width="${targetWidth}" height="${targetHeight}" opacity="${opacity}" />`;

                // 对于图片，阴影和描边比较难通过简单 SVG 属性实现，暂略或使用 filter
                if (shadow) {
                    // 可以添加简单的 drop-shadow filter
                }

            } catch (err) {
                console.error('Error loading watermark image:', err);
                return null;
            }
        } else {
            // 文字处理
            const hexToRgba = (hex, alpha) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            const fillColor = hexToRgba(color, opacity);

            // 估算文字尺寸 (粗略)
            contentWidth = text.length * size; // 假设中文等宽
            contentHeight = size;

            // 样式
            let textStyles = `
                fill: ${fillColor};
                font-family: ${font};
                font-size: ${size}px;
                font-weight: 600;
                dominant-baseline: middle; 
                text-anchor: middle;
            `;

            // 滤镜
            let filterAttr = '';
            if (shadow) {
                filterAttr = 'filter="url(#shadow)"';
            }

            // 描边
            let strokeAttr = '';
            if (outline) {
                strokeAttr = `stroke="${hexToRgba('#000000', opacity * 0.8)}" stroke-width="2"`;
            }

            // Text 元素 (居中锚点以便旋转)
            // 注意: 这里 x,y 设为 0，我们在外层 group 进行平移
            contentSvg = `<text x="0" y="0" style="${textStyles}" ${filterAttr} ${strokeAttr}>${this.escapeXml(text)}</text>`;
        }

        // 2. 构建 SVG 整体
        // 定义滤镜
        const filterDef = shadow ? `
            <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/>
                </filter>
            </defs>
        ` : '';

        let items = '';

        // 3. 布局逻辑 (平铺 或 单个)
        if (tiled) {
            // 平铺逻辑
            // 间距 = 边距 + 内容尺寸的一半 (视觉上稀疏一点)
            const gapX = contentWidth + (margin * 2);
            const gapY = contentHeight + (margin * 2);

            // 即使旋转，我们也在网格每一项中心旋转
            // 覆盖整个画布
            for (let y = margin; y < imageHeight + gapY; y += gapY) {
                // 错位平铺效果: 偶数行偏移
                const offsetX = (Math.floor(y / gapY) % 2 === 0) ? 0 : (gapX / 2);

                for (let x = margin - gapX; x < imageWidth + gapX; x += gapX) {
                    const finalX = x + offsetX;
                    items += `<g transform="translate(${finalX}, ${y}) rotate(${rotation})">${contentSvg}</g>`;
                }
            }
        } else {
            // 单个位置逻辑
            const positionMap = {
                'northwest': { x: margin, y: margin },
                'north': { x: imageWidth / 2, y: margin },
                'northeast': { x: imageWidth - margin, y: margin },
                'west': { x: margin, y: imageHeight / 2 },
                'center': { x: imageWidth / 2, y: imageHeight / 2 },
                'east': { x: imageWidth - margin, y: imageHeight / 2 },
                'southwest': { x: margin, y: imageHeight - margin },
                'south': { x: imageWidth / 2, y: imageHeight - margin }, // 注意: 如果 anchor 是 middle, y 应该是 height - margin
                'southeast': { x: imageWidth - margin, y: imageHeight - margin }
            };

            // 修正坐标针对内容尺寸 (特别是图片，如果是左上锚点)
            // 文字使用了 text-anchor: middle + dominant-baseline: middle，所以由中心定位
            // 图片默认左上角。为了统一，我们将图片也居中偏移

            // 统一包裹 <g> 并移至目标位置
            let pos = positionMap[position] || positionMap['center'];

            // 如果是 Image，需要修正中心点 (因为 image x,y 是左上角)
            // 为简化，我们在 image 生成时就让它以 (0,0) 为左上吗？
            // 最好是把所有内容视为“中心在 (0,0)”，然后 translate 到 pos

            let centerOffsetX = 0;
            let centerOffsetY = 0;

            if (type === 'image') {
                centerOffsetX = -contentWidth / 2;
                centerOffsetY = -contentHeight / 2;
            }
            // 文字已经是居中的 (anchor=middle)

            // 针对边缘位置的修正 (pos 代表的是边缘，但我们需要内容在边缘内)
            // 上面 Map 中 center/north/south x 是中点，west/east x 是边缘
            // 需要根据 position 重新微调 pos 到 "内容中心"
            // 
            // 简化策略: 直接使用 Map 的坐标作为锚点，假设用户指的就是这个点
            // 但是 'northwest' 指的是左上角 (margin, margin)。如果内容中心在那，会有 1/2 内容出界。
            // 必须根据锚点类型修正。

            // 重新定义 map 为 "内容中心点"
            // NW: x = margin + w/2, y = margin + h/2
            const halfW = contentWidth / 2;
            const halfH = contentHeight / 2;

            const safePos = { ...pos };
            if (position.includes('west')) safePos.x += halfW;
            if (position.includes('east')) safePos.x -= halfW;
            if (position.includes('north')) safePos.y += halfH;
            if (position.includes('south')) safePos.y -= halfH;

            // Center, North(x), South(x), West(y), East(y) 已经在中点了，不需要动?
            // North: x=middle, y=margin. y need +halfH. YES.

            items += `<g transform="translate(${safePos.x}, ${safePos.y}) rotate(${rotation})">
                <g transform="translate(${centerOffsetX}, ${centerOffsetY})">
                    ${contentSvg}
                </g>
            </g>`;
        }

        const svg = `
            <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
                ${filterDef}
                ${items}
            </svg>
        `;

        return Buffer.from(svg);
    }

    /**
     * 转义 XML 特殊字符
     */
    escapeXml(str) {
        return str.replace(/[<>&'"]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            "'": '&apos;',
            '"': '&quot;'
        }[c]));
    }

    /**
     * 压缩单张图片
     */
    async compress(inputPath, outputPath, options = {}) {
        const opts = { ...this.defaultOptions, ...options };

        try {
            const inputStats = fs.statSync(inputPath);
            const inputSize = inputStats.size;

            let pipeline = sharp(inputPath);

            // 获取图片元信息
            const metadata = await pipeline.metadata();
            const inputFormat = metadata.format;

            // 调整尺寸 (如果指定)
            if (opts.maxWidth || opts.maxHeight) {
                pipeline = pipeline.resize({
                    width: opts.maxWidth || undefined,
                    height: opts.maxHeight || undefined,
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // 元数据处理: 保留 ICC 或 EXIF
            if (opts.keepICC || opts.stripExif === false) {
                pipeline = pipeline.withMetadata();
            }

            // 自动调整方向 (无论是否保留元数据，都建议修正像素方向)
            pipeline = pipeline.rotate();

            // 应用用户指定的旋转
            if (opts.rotation && opts.rotation !== 0) {
                pipeline = pipeline.rotate(opts.rotation);
            }

            // 应用翻转
            if (opts.flipH) pipeline = pipeline.flop();
            if (opts.flipV) pipeline = pipeline.flip();

            // 应用水印
            if (opts.watermark && (opts.watermark.text || opts.watermark.image)) {
                const imgWidth = opts.maxWidth || metadata.width;
                const imgHeight = opts.maxHeight || metadata.height;

                const watermarkSvg = await this.createWatermarkLayer(opts.watermark, imgWidth, imgHeight);
                if (watermarkSvg) {
                    pipeline = pipeline.composite([{
                        input: watermarkSvg,
                        top: 0,
                        left: 0
                    }]);
                }
            }

            // 确定输出格式
            let outputFormat = opts.format === 'original' ? inputFormat : opts.format;

            // 根据格式应用压缩
            switch (outputFormat) {
                case 'jpeg':
                case 'jpg':
                    pipeline = pipeline.jpeg({ quality: opts.quality, mozjpeg: true });
                    break;
                case 'png':
                    pipeline = pipeline.png({ quality: opts.quality, compressionLevel: 9, palette: opts.quality < 50 });
                    break;
                case 'webp':
                    pipeline = pipeline.webp({ quality: opts.quality, effort: 6 });
                    break;
                case 'avif':
                    pipeline = pipeline.avif({ quality: opts.quality, effort: 6 });
                    break;
                case 'gif':
                    pipeline = pipeline.gif({ colours: 256, dither: 1.0 });
                    break;
                case 'tiff':
                    pipeline = pipeline.tiff({ quality: opts.quality, compression: 'lzw' });
                    break;
                default:
                    if (inputFormat === 'jpeg' || inputFormat === 'jpg') {
                        pipeline = pipeline.jpeg({ quality: opts.quality, mozjpeg: true });
                    } else if (inputFormat === 'png') {
                        pipeline = pipeline.png({ quality: opts.quality, compressionLevel: 9 });
                    }
            }

            // 写入文件
            await pipeline.toFile(outputPath);

            // 获取输出结果
            const outputStats = fs.statSync(outputPath);
            const outputSize = outputStats.size;
            const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

            return {
                success: true,
                inputPath,
                outputPath,
                inputSize,
                outputSize,
                savings: `${savings}%`,
                format: outputFormat
            };
        } catch (error) {
            console.error('[CompressService] Error:', error.message);
            return {
                success: false,
                inputPath,
                error: error.message
            };
        }
    }

    /**
     * 批量压缩图片 (并发控制)
     * @param {Array} files - 文件路径数组
     * @param {string} outputDir - 输出目录
     * @param {Object} options - 压缩选项
     * @param {Function} onProgress - 进度回调 (index, total, result)
     * @returns {Promise<Object>} 批量压缩结果
     */
    async batchCompress(files, outputDir, options = {}, onProgress = null) {
        const results = [];
        let totalSaved = 0;
        // Clamp 1–6; caller / handler may set smart defaults
        let concurrency = Number(options.concurrency);
        if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 3;
        concurrency = Math.min(6, Math.max(1, Math.floor(concurrency)));
        let completedCount = 0;

        // 创建处理任务
        const processFile = async (inputPath, index) => {
            const ext = this.getOutputExtension(inputPath, options.format);
            const baseName = path.basename(inputPath, path.extname(inputPath));

            // 根据用户选择的选项构建文件名
            const rename = options.renameOptions || { addSuffix: true, suffix: '_compressed' };
            let outputName = baseName;

            if (rename.addSuffix && rename.suffix) {
                outputName += rename.suffix;
            }
            if (rename.addIndex) {
                outputName += '_' + String(index + 1).padStart(3, '0');
            }
            if (rename.addDate) {
                outputName += '_' + new Date().toISOString().split('T')[0];
            }

            const outputPath = path.join(outputDir, `${outputName}${ext}`);

            const result = await this.compress(inputPath, outputPath, options);
            result.index = index;

            if (result.success) {
                totalSaved += result.inputSize - result.outputSize;
            }

            completedCount++;
            if (onProgress) {
                onProgress(completedCount, files.length, result);
            }

            return result;
        };

        // 并发控制：使用 Promise 池
        const pool = [];
        for (let i = 0; i < files.length; i++) {
            const task = processFile(files[i], i);
            const tracked = task.then(result => {
                pool.splice(pool.indexOf(tracked), 1);
                return result;
            });
            pool.push(tracked);
            results.push(task);

            // 当池满时等待最快完成的任务
            if (pool.length >= concurrency) {
                await Promise.race(pool);
            }
        }

        // 等待所有任务完成
        const allResults = await Promise.all(results);

        // 重新计算总节省量
        const actualSaved = allResults.reduce((sum, r) => {
            return sum + (r.success ? (r.inputSize - r.outputSize) : 0);
        }, 0);

        return {
            success: true,
            total: files.length,
            completed: allResults.filter(r => r.success).length,
            failed: allResults.filter(r => !r.success).length,
            totalSaved: this.formatSize(actualSaved),
            results: allResults
        };
    }

    /**
     * 预览压缩效果 (生成压缩后的 Base64 用于 UI 预览)
     * @param {string} inputPath - 输入图片路径
     * @param {Object} options - 压缩选项
     * @returns {Promise<Object>} 预览数据
     */
    async preview(inputPath, options = {}) {
        const opts = { ...this.defaultOptions, ...options };

        try {
            const inputStats = fs.statSync(inputPath);
            const inputSize = inputStats.size;

            let pipeline = sharp(inputPath);
            const metadata = await pipeline.metadata();

            // 调整尺寸
            if (opts.maxWidth || opts.maxHeight) {
                pipeline = pipeline.resize({
                    width: opts.maxWidth || undefined,
                    height: opts.maxHeight || undefined,
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // 元数据处理
            if (opts.keepICC || opts.stripExif === false) {
                pipeline = pipeline.withMetadata();
            }

            // 自动调整方向
            pipeline = pipeline.rotate();

            // 应用用户指定的旋转
            if (opts.rotation && opts.rotation !== 0) {
                pipeline = pipeline.rotate(opts.rotation);
            }

            // 应用翻转
            if (opts.flipH) {
                pipeline = pipeline.flop();
            }
            if (opts.flipV) {
                pipeline = pipeline.flip();
            }

            // 应用水印 (必须在格式转换之前)
            if (opts.watermark && (opts.watermark.text || opts.watermark.image)) {
                // 先获取当前尺寸再叠加水印
                const imgWidth = opts.maxWidth || metadata.width;
                const imgHeight = opts.maxHeight || metadata.height;

                const watermarkSvg = await this.createWatermarkLayer(opts.watermark, imgWidth, imgHeight);
                if (watermarkSvg) {
                    pipeline = pipeline.composite([{
                        input: watermarkSvg,
                        top: 0,
                        left: 0
                    }]);
                }
            }

            // 确定输出格式
            let outputFormat = opts.format === 'original' ? metadata.format : opts.format;

            // 特殊处理: HEIC/HEIF 无法在浏览器直接预览，强制转为 JPEG
            if (outputFormat === 'heic' || outputFormat === 'heif') {
                outputFormat = 'jpeg';
            }

            if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
                pipeline = pipeline.jpeg({ quality: opts.quality, mozjpeg: true });
            } else if (outputFormat === 'png') {
                pipeline = pipeline.png({ quality: opts.quality, compressionLevel: 9 });
            } else if (outputFormat === 'webp') {
                pipeline = pipeline.webp({ quality: opts.quality });
            } else if (outputFormat === 'avif') {
                pipeline = pipeline.avif({ quality: opts.quality });
            } else if (outputFormat === 'gif') {
                // GIF 无法直接预览，转为 PNG
                pipeline = pipeline.png({ quality: opts.quality });
            } else if (outputFormat === 'tiff') {
                // TIFF 无法直接预览，转为 PNG
                pipeline = pipeline.png({ quality: opts.quality });
            }

            // 生成 Buffer
            const buffer = await pipeline.toBuffer();
            const outputSize = buffer.length;
            const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

            // 生成 Base64 用于预览
            const base64 = `data:image/${outputFormat};base64,${buffer.toString('base64')}`;

            return {
                success: true,
                inputSize,
                outputSize,
                savings: `${savings}%`,
                width: metadata.width,
                height: metadata.height,
                preview: base64
            };
        } catch (error) {
            console.error('[CompressService] Preview error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取图片信息
     * @param {string} filePath - 图片路径
     * @returns {Promise<Object>} 图片元信息
     */
    async getInfo(filePath) {
        try {
            const metadata = await sharp(filePath).metadata();
            const stats = fs.statSync(filePath);

            return {
                success: true,
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: stats.size,
                sizeFormatted: this.formatSize(stats.size)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取输出文件扩展名
     */
    getOutputExtension(inputPath, format) {
        if (format && format !== 'original') {
            return `.${format}`;
        }
        return path.extname(inputPath);
    }

    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const isNegative = bytes < 0;
        const absBytes = Math.abs(bytes);
        if (absBytes >= 1073741824) {
            return (isNegative ? '-' : '') + (absBytes / 1073741824).toFixed(1) + ' GB';
        } else if (absBytes >= 1048576) {
            return (isNegative ? '-' : '') + (absBytes / 1048576).toFixed(1) + ' MB';
        } else if (absBytes >= 1024) {
            return (isNegative ? '-' : '') + (absBytes / 1024).toFixed(0) + ' KB';
        }
        return (isNegative ? '-' : '') + absBytes + ' B';
    }
}

module.exports = new CompressService();
