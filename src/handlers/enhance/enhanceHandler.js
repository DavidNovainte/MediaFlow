/**
 * enhanceHandler.js - AI 画质增强 IPC 处理层
 * 注册所有增强相关的 IPC 通道
 */

const enhanceService = require('../../services/enhance/EnhanceService');
const videoEnhanceService = require('../../services/enhance/VideoEnhanceService');


/**
 * 注册 AI 增强相关 IPC handlers
 * @param {Electron.IpcMain} ipcMain
 */
const setupEnhanceHandlers = (ipcMain) => {

    /**
     * 获取所有可用引擎列表
     * @returns {Array<Object>} 引擎信息数组
     */
    ipcMain.handle('enhance:getEngines', async () => {
        return enhanceService.getAvailableEngines();
    });

    /**
     * 获取指定引擎的选项配置
     * @param {string} engineId 引擎 ID
     * @returns {Object|null} 引擎选项
     */
    ipcMain.handle('enhance:getEngineOptions', async (event, engineId) => {
        return enhanceService.getEngineOptions(engineId);
    });

    /**
     * 增强单个图片
     * @param {string} inputPath 输入路径
     * @param {string} outputPath 输出路径 (可选)
     * @param {Object} options 处理选项
     */
    ipcMain.handle('enhance:image', async (event, inputPath, outputPath, options) => {
        try {
            const result = await enhanceService.enhanceImage(
                inputPath,
                outputPath,
                options,
                (progress) => {
                    // 实时推送进度到渲染进程
                    event.sender.send('enhance:progress', { progress, inputPath });
                }
            );
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * Probe video duration / size (for import-time limits, no Pro required)
     */
    ipcMain.handle('enhance:probeVideo', async (event, inputPath) => {
        try {
            if (!inputPath) return { success: false, error: 'NO_PATH' };
            if (!videoEnhanceService.isVideoPath(inputPath)) {
                return { success: false, error: 'NOT_VIDEO' };
            }
            const meta = await videoEnhanceService.probe(inputPath);
            const { MAX_DURATION_SEC } = require('../../services/enhance/VideoEnhanceService');
            return {
                success: true,
                duration: meta.duration,
                width: meta.width,
                height: meta.height,
                fps: meta.fps,
                maxDurationSec: MAX_DURATION_SEC || 45
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * Enhance a short video (MVP: extract → local AI → reassemble)
     */
    ipcMain.handle('enhance:video', async (event, inputPath, outputPath, options) => {
        try {
            const result = await videoEnhanceService.enhanceVideo(
                inputPath,
                outputPath,
                options || {},
                (progress, text) => {
                    event.sender.send('enhance:progress', { progress, text, inputPath, kind: 'video' });
                }
            );
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: error.code || null
            };
        }
    });

    /**
     * 生成预览
     * @param {string} inputPath 输入路径
     * @param {Object} options 处理选项
     */
    ipcMain.handle('enhance:preview', async (event, inputPath, options) => {
        try {
            const result = await enhanceService.generatePreview(inputPath, options);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * 批量增强
     * @param {Array<string>} inputPaths 输入路径数组
     * @param {string} outputDir 输出目录
     * @param {Object} options 处理选项
     */
    ipcMain.handle('enhance:batch', async (event, inputPaths, outputDir, options) => {
        try {
            const results = await enhanceService.enhanceBatch(
                inputPaths,
                outputDir,
                options,
                (fileIndex, fileProgress, totalProgress) => {
                    event.sender.send('enhance:batchProgress', {
                        fileIndex,
                        fileProgress,
                        totalProgress,
                        total: inputPaths.length
                    });
                },
                (fileIndex, result) => {
                    event.sender.send('enhance:fileComplete', { fileIndex, result });
                }
            );
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * 取消当前处理
     */
    ipcMain.on('enhance:cancel', () => {
        try { videoEnhanceService.cancel(); } catch { /* ignore */ }
        enhanceService.cancel();
    });

    /**
     * 下载并配置引擎
     * @param {string} engineId 引擎 ID
     */
    ipcMain.handle('enhance:downloadEngine', async (event, engineId) => {
        try {
            const result = await enhanceService.downloadEngine(
                engineId,
                (progress) => {
                    event.sender.send('enhance:progress', { progress, status: 'downloading' });
                }
            );
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * 清理临时文件
     */
    ipcMain.handle('enhance:cleanup', async () => {
        enhanceService.cleanupTemp();
        return { success: true };
    });

    console.log('[EnhanceHandler] IPC handlers registered');
};

module.exports = { setupEnhanceHandlers };
