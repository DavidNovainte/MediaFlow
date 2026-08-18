/**
 * EngineManager.js - AI 引擎调度管理器
 * 负责引擎注册、选择、切换
 */

const CuganEngine = require('./engines/CuganEngine');
const ESRGANEngine = require('./engines/ESRGANEngine');
const GFPGANEngine = require('./engines/GFPGANEngine');

class EngineManager {
    constructor() {
        // 注册所有可用引擎
        this.engines = {
            'cugan': new CuganEngine(),
            'esrgan': new ESRGANEngine(),
            'gfpgan': new GFPGANEngine()
        };

        this.currentEngineId = null;
        this.currentEngine = null;
    }

    /**
     * 获取所有可用引擎列表 (用于 UI 下拉菜单)
     * @returns {Array<Object>} 引擎信息数组
     */
    getAvailableEngines() {
        return Object.values(this.engines).map(engine => engine.getInfo());
    }

    /**
     * Normalize legacy / binary names to registry keys.
     * @param {string} engineId
     * @returns {string}
     */
    normalizeEngineId(engineId) {
        const id = String(engineId || '').toLowerCase();
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
        return map[id] || engineId;
    }

    /**
     * 根据 ID 获取引擎实例
     * @param {string} engineId 引擎 ID
     * @returns {BaseEngine|null} 引擎实例
     */
    getEngine(engineId) {
        const id = this.normalizeEngineId(engineId);
        return this.engines[id] || null;
    }

    /**
     * 选择当前使用的引擎
     * @param {string} engineId 引擎 ID
     * @returns {BaseEngine|null} 选中的引擎实例
     */
    selectEngine(engineId) {
        const id = this.normalizeEngineId(engineId);
        if (!this.engines[id]) {
            this.currentEngineId = null;
            this.currentEngine = null;
            console.error(`[EngineManager] Unknown engine: ${engineId} (normalized: ${id})`);
            return null;
        }

        this.currentEngineId = id;
        this.currentEngine = this.engines[id];
        console.log(`[EngineManager] Selected engine: ${this.currentEngine.name}`);
        return this.currentEngine;
    }

    /**
     * 获取当前选中的引擎
     * @returns {BaseEngine|null} 当前引擎实例
     */
    getCurrentEngine() {
        return this.currentEngine;
    }

    /**
     * 获取当前引擎 ID
     * @returns {string|null} 当前引擎 ID
     */
    getCurrentEngineId() {
        return this.currentEngineId;
    }

    /**
     * 执行增强处理 (使用当前选中的引擎)
     * @param {string} inputPath 输入文件路径
     * @param {string} outputPath 输出文件路径
     * @param {Object} options 处理选项
     * @param {Function} onProgress 进度回调
     * @returns {Promise<Object>} 处理结果
     */
    async enhance(inputPath, outputPath, options, onProgress) {
        if (!this.currentEngine) {
            throw new Error('No engine selected. Call selectEngine() first.');
        }

        return this.currentEngine.execute(inputPath, outputPath, options, onProgress);
    }

    /**
     * 使用指定引擎执行增强
     * @param {string} engineId 引擎 ID
     * @param {string} inputPath 输入文件路径
     * @param {string} outputPath 输出文件路径
     * @param {Object} options 处理选项
     * @param {Function} onProgress 进度回调
     * @returns {Promise<Object>} 处理结果
     */
    async enhanceWith(engineId, inputPath, outputPath, options, onProgress) {
        const engine = this.getEngine(engineId);
        if (!engine) {
            throw new Error(`Unknown engine: ${engineId}`);
        }

        return engine.execute(inputPath, outputPath, options, onProgress);
    }

    /**
     * 取消当前处理
     */
    cancel() {
        if (this.currentEngine) {
            this.currentEngine.cancel();
        }
    }

    /**
     * 取消所有引擎的处理
     */
    cancelAll() {
        Object.values(this.engines).forEach(engine => engine.cancel());
    }
}

// 导出单例
module.exports = new EngineManager();
