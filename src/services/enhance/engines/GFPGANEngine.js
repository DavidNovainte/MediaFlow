/**
 * GFPGANEngine.js - Portrait / photo-first profile
 * Engine id stays `gfpgan` for saved settings compatibility.
 * Runtime: Real-ESRGAN ncnn + x4plus (no separate GFPGAN binary in package).
 */

const BaseEngine = require('./BaseEngine');
const { getBinaryPath } = require('../../../utils/binaries');

class GFPGANEngine extends BaseEngine {
    constructor() {
        super('Portrait');
    }

    getExecutablePath() {
        // Packaged build ships Real-ESRGAN ncnn (not a separate GFPGAN binary).
        // Photo-first profile using x4plus; -f must be jpg|png|webp.
        return getBinaryPath('realesrgan-ncnn-vulkan');
    }

    buildArgs(inputPath, outputPath, options) {
        // realesrgan-ncnn-vulkan only accepts 2/3/4 for -s
        let scale = Number(options.scale) || 2;
        if (scale < 2) scale = 2;
        if (scale > 4) scale = 4;
        // Prefer stable x4 native path to avoid non-aligned 2x artifacts (same as ESRGANEngine)
        const engineScale = scale < 4 ? 4 : scale;
        const format = ['jpg', 'jpeg', 'png', 'webp'].includes(String(options.format || '').toLowerCase())
            ? String(options.format).toLowerCase()
            : 'png';
        // Always photo x4plus for this profile (ignore anime/video model ids)
        const model = 'realesrgan-x4plus';

        return [
            '-i', inputPath,
            '-o', outputPath,
            '-s', engineScale.toString(),
            '-n', model,
            '-t', '0',
            '-f', format
        ];
    }

    async execute(inputPath, outputPath, options, onProgress) {
        // Match ESRGAN stability path: native 4× then downstream may downscale
        let actualScale = Number(options.scale) || 2;
        if (actualScale < 2) actualScale = 2;
        if (actualScale < 4) actualScale = 4;
        return super.execute(
            inputPath,
            outputPath,
            { ...options, model: 'realesrgan-x4plus', actualScale },
            onProgress
        );
    }

    getInfo() {
        return {
            id: 'gfpgan',
            name: '人像增强 (Photo)',
            description: '人像/老照片优先：Real-ESRGAN 通用模型（本包不含独立 GFPGAN 二进制）',
            icon: '👤',
            supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
            options: [
                {
                    id: 'scale',
                    name: '放大倍率',
                    type: 'select',
                    default: 2,
                    choices: [
                        { value: 2, label: '2x (推荐)' },
                        { value: 3, label: '3x' },
                        { value: 4, label: '4x' }
                    ]
                }
            ]
        };
    }
}

module.exports = GFPGANEngine;
