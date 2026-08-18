/**
 * BaseEngine.js - AI 引擎抽象基类
 * 定义所有 AI 增强引擎的统一接口
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getBinaryPath } = require('../../../utils/binaries');
const processQueue = require('../../../utils/ProcessQueue');

class BaseEngine {
    constructor(name) {
        this.name = name;
        this.process = null;
        this.cancelled = false;
    }

    /**
     * 获取可执行文件路径 (子类必须实现)
     * @returns {string} 可执行文件完整路径
     */
    getExecutablePath() {
        throw new Error('Subclass must implement getExecutablePath()');
    }

    /**
     * 构建命令行参数 (子类必须实现)
     * @param {string} inputPath 输入文件路径
     * @param {string} outputPath 输出文件路径
     * @param {Object} options 处理选项
     * @returns {string[]} 命令行参数数组
     */
    buildArgs(inputPath, outputPath, options) {
        void inputPath;
        void outputPath;
        void options;
        throw new Error('Subclass must implement buildArgs()');
    }

    /**
     * 获取模型目录路径
     * @returns {string} 模型目录路径
     */
    getModelsDir() {
        return path.join(this.getBinDir(), 'models');
    }

    /**
     * 获取 bin 目录路径
     * @returns {string} bin 目录路径
     */
    getBinDir() {
        // 使用 getBinaryPath('') 技巧获取 bin 目录
        const dummyPath = getBinaryPath('dummy');
        return path.dirname(dummyPath);
    }

    /**
     * 解析进度 (默认实现：匹配 "XX.XX%" 格式)
     * 子类可覆盖此方法以适应不同的输出格式
     * @param {string} line 输出行
     * @returns {number|null} 进度百分比 (0-100) 或 null
     */
    parseProgress(line) {
        // 匹配常见格式: "50.0%" 或 "50%" 或 "[50%]"
        const match = line.match(/(\d+\.?\d*)%/);
        return match ? parseFloat(match[1]) : null;
    }

    /**
     * 执行处理
     * @param {string} inputPath 输入文件路径
     * @param {string} outputPath 输出文件路径
     * @param {Object} options 处理选项
     * @param {Function} onProgress 进度回调 (percentage)
     * @returns {Promise} 处理结果
     */
    async execute(inputPath, outputPath, options, onProgress) {
        if (this.process) {
            throw new Error('Engine is already running');
        }

        this.cancelled = false;
        const exePath = this.getExecutablePath();
        if (!fs.existsSync(exePath)) {
            const exeName = path.basename(exePath);
            throw new Error(`[${this.name}] engine binary missing: ${exeName}`);
        }

        const args = this.buildArgs(inputPath, outputPath, options);
        if (options.gpuId !== undefined) args.push('-g', options.gpuId.toString());
        if (options.threads) args.push('-j', options.threads);

        const taskId = `${this.name.toLowerCase()}_${Date.now()}`;
        this.currentTaskId = taskId;

        return processQueue.push(taskId, () => {
            return new Promise((resolve, reject) => {
                try {
                    const cwd = path.dirname(exePath);
                    this.process = spawn(exePath, args, {
                        cwd,
                        windowsHide: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    });

                    // 【关键】注册到全局队列管理器
                    processQueue.registerProcess(taskId, this.process);

                    let lastProgress = 0;
                    const parseData = (data) => {
                        const text = data.toString();
                        const lines = text.split(/[\n\r]/);

                        for (const line of lines) {
                            const progress = this.parseProgress(line);
                            if (progress !== null && progress > lastProgress) {
                                lastProgress = progress;
                                if (onProgress) onProgress(progress);
                            }
                            const trimmed = line.trim();
                            if (trimmed && !trimmed.includes('%')) {
                                console.log(`[${this.name}] ${trimmed}`);
                            }
                        }
                    };

                    this.process.stdout.on('data', parseData);
                    this.process.stderr.on('data', parseData);

                    this.process.on('error', (err) => {
                        this.process = null;
                        this.currentTaskId = null;
                        reject(err);
                    });

                    this.process.on('close', (code) => {
                        this.process = null;
                        this.currentTaskId = null;
                        if (this.cancelled) {
                            reject(new Error('Process cancelled'));
                        } else if (code === 0) {
                            resolve({
                                success: true,
                                outputPath,
                                requestedScale: options.scale || 2,
                                actualScale: options.actualScale || options.scale || 2
                            });
                        } else {
                            reject(new Error(`Process exited with code ${code}`));
                        }
                    });
                } catch (err) {
                    this.currentTaskId = null;
                    reject(err);
                }
            });
        });
    }

    /**
     * 取消当前处理
     */
    cancel() {
        this.cancelled = true;
        if (this.currentTaskId) {
            processQueue.cancelTask(this.currentTaskId);
        }
    }

    /**
     * 获取引擎信息 (用于 UI 展示)
     * @returns {Object} 引擎信息
     */
    getInfo() {
        return {
            id: this.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
            name: this.name,
            description: '',
            supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
            options: []
        };
    }
}

module.exports = BaseEngine;
