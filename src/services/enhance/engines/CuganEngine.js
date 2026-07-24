/**
 * CuganEngine.js - Real-CUGAN 动漫超清放大引擎
 * 专为二次元/动漫内容优化，线条锐利，无油画感
 */

const BaseEngine = require('./BaseEngine');
const path = require('path');
const { getBinaryPath } = require('../../../utils/binaries');

class CuganEngine extends BaseEngine {
    constructor() {
        super('Real-CUGAN');
    }

    getExecutablePath() {
        return getBinaryPath('realcugan-ncnn-vulkan');
    }

    buildArgs(inputPath, outputPath, options) {
        const scale = options.scale || 2;      // 放大倍率: 2, 3, 4
        const denoise = options.denoise ?? 0;  // 降噪等级: -1, 0, 1, 2, 3
        const model = options.model || 'models-se';  // 模型: models-pro, models-se, models-nose
        const tileSize = options.tileSize || 0;      // 分块大小，0=自动
        const syncGap = options.syncGap || 3;        // 同步间隔

        const args = [
            '-i', inputPath,
            '-o', outputPath,
            '-s', scale.toString(),
            '-n', denoise.toString(),
            '-t', tileSize.toString(),
            '-c', syncGap.toString()
        ];

        // 模型路径 (如果存在)
        const modelsDir = path.join(this.getBinDir(), model);
        args.push('-m', modelsDir);

        return args;
    }

    /**
     * Real-CUGAN 的进度输出格式: "XX.XX%"
     */
    parseProgress(line) {
        const match = line.match(/(\d+\.?\d*)%/);
        return match ? parseFloat(match[1]) : null;
    }

    getInfo() {
        return {
            id: 'cugan',
            name: '动漫超清 (Real-CUGAN)',
            description: '二次元专用，线条锐利，无油画感',
            icon: '⚡',
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
                        { value: 4, label: '4x (缓慢)' }
                    ]
                },
                {
                    id: 'denoise',
                    name: '降噪等级',
                    type: 'slider',
                    min: -1,
                    max: 3,
                    default: 0,
                    labels: { '-1': '无', '0': '自动', '1': '弱', '2': '中', '3': '强' }
                },
                {
                    id: 'model',
                    name: '模型风格',
                    type: 'select',
                    default: 'models-se',
                    choices: [
                        { value: 'models-se', label: '标准 (SE - 推荐)' },
                        { value: 'models-pro', label: '画质 (Pro - 慢)' },
                        { value: 'models-nose', label: '极速 (无降噪)' }
                    ]
                }
            ]
        };
    }
}

module.exports = CuganEngine;
