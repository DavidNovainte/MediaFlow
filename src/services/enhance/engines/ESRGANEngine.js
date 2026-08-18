/**
 * ESRGANEngine.js - Real-ESRGAN 通用画质增强引擎
 * 万金油模型，适合实拍视频/照片放大至 4K
 */

const BaseEngine = require('./BaseEngine');
const { getBinaryPath } = require('../../../utils/binaries');

class ESRGANEngine extends BaseEngine {
    constructor() {
        super('Real-ESRGAN');
    }

    getExecutablePath() {
        return getBinaryPath('realesrgan-ncnn-vulkan');
    }

    buildArgs(inputPath, outputPath, options) {
        let scale = options.scale || 2;
        let model = options.model || 'realesrgan-x4plus';
        const format = options.format || 'png';

        // 验证模型名称有效性 (防止传入 "models-se" 等无效历史值)
        const validModels = [
            'realesrgan-x4plus',
            'realesrgan-x4plus-anime',
            'realesrnet-x4plus',
            'realesr-animevideov3'
        ];
        if (!validModels.includes(model)) {
            console.warn(`[ESRGANEngine] Invalid model '${model}' detected, falling back to 'realesrgan-x4plus'`);
            model = 'realesrgan-x4plus';
        }

        // [终极修复] 解决 2x 畸变问题的关键：
        // NCNN 核心在执行非原生倍率（如由 x4 模型执行 -s 2）时，对非 32 对齐的图片极易产生畸变。
        // 策略：强制引擎物理输出 4x（最稳健模式），下游由 Sharp 进行高质量下采样至 2x。
        if (scale < 4) {
            console.log(`[ESRGANEngine] Forcing 4x to prevent artifacts (User requested ${scale}x)`);
            scale = 4;
        }



        const args = [
            '-i', inputPath,
            '-o', outputPath,
            '-s', scale.toString(),
            '-n', model,
            '-t', '0',
            '-f', format
        ];

        return args;
    }

    async execute(inputPath, outputPath, options, onProgress) {
        // 如果触发了强制 4x，我们需要告知后处理逻辑实际倍率是 4
        const model = options.model || 'realesrgan-x4plus';
        let actualScale = options.scale || 2;
        if (actualScale < 4 && model.includes('x4')) {
            actualScale = 4;
        }

        return super.execute(inputPath, outputPath, { ...options, actualScale }, onProgress);
    }

    /**
     * Real-ESRGAN 的进度输出格式: "XX.XX%"
     */
    parseProgress(line) {
        const match = line.match(/(\d+\.?\d*)%/);
        return match ? parseFloat(match[1]) : null;
    }

    getInfo() {
        return {
            id: 'esrgan',
            name: '通用放大 (Real-ESRGAN)',
            description: '万金油模型，适合实拍视频/照片',
            icon: '🎥',
            supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
            options: [
                {
                    id: 'scale',
                    name: '放大倍率',
                    type: 'select',
                    default: 2,
                    choices: [
                        { value: 2, label: '2x (推荐)' },
                        { value: 3, label: '3x (常规)' },
                        { value: 4, label: '4x (极慢)' }
                    ]
                },
                {
                    id: 'model',
                    name: '模型类型',
                    type: 'select',
                    default: 'realesrgan-x4plus',
                    choices: [
                        { value: 'realesr-animevideov3', label: '🚀 极速 (动漫视频 V3)' },
                        { value: 'realesrgan-x4plus', label: '💎 高质 (通用 x4plus)' },
                        { value: 'realesrgan-x4plus-anime', label: '🎨 动漫 (x4plus-anime)' },
                        { value: 'realesrnet-x4plus', label: '⚡ 快速 (通用 x4plus)' }
                    ]
                },
                {
                    id: 'format',
                    name: '输出格式',
                    type: 'select',
                    default: 'png',
                    choices: [
                        { value: 'png', label: 'PNG (无损)' },
                        { value: 'jpg', label: 'JPG (极快)' },
                        { value: 'webp', label: 'WebP (平衡)' }
                    ]
                }
            ]
        };
    }
}

module.exports = ESRGANEngine;
