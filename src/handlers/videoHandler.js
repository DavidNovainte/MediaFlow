/**
 * VideoHandler - 视频处理 IPC 协调层
 * 所有具体实现已提取到 video/ 子目录中的独立模块
 */

// Extracted handlers
const { handleClip } = require('./video/clipHandler');
const { handleMultiClip, handleMerge, cancelMerge } = require('./video/mergeHandler');
const { handleCompress, cancelCompress } = require('./video/compressHandler');
const { handleRemoveAudio, handleExtractAudio } = require('./video/audioHandler');
const { handleConvert, cancelConvert } = require('./video/convertHandler');
const { handleMakeVertical, cancelVertical } = require('./video/verticalHandler');
const { handleProbe } = require('./video/probeHandler');
const { handleChangeSpeed, handleExtractFrame, handleCreateGIF, cancelProcess } = require('./video/speedHandler');
const { handleWatermark } = require('./video/watermarkHandler');
const { handleTransform } = require('./video/transformHandler');
const FFmpegRunner = require('./video/FFmpegRunner');
const isTestEnv = process.env.NODE_ENV === 'test';

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

/**
 * 注册所有视频处理 IPC handlers
 * @param {Electron.IpcMain} ipcMain
 */
const setupVideoHandlers = (ipcMain) => {

    // ==================== 剪辑相关 ====================

    /** 单段视频剪辑 */
    ipcMain.handle('video:clip', handleClip);

    /** 多段视频剪辑与合并 */
    ipcMain.handle('video:multiClip', handleMultiClip);

    /** 视频合并 (无损) */
    ipcMain.handle('video:merge', handleMerge);

    // ==================== 压缩与转换 ====================

    /** 视频压缩 (支持多种编码器) */
    ipcMain.handle('video:compress', handleCompress);

    /** 格式转换 */
    ipcMain.handle('video:convert', handleConvert);

    /** 一键竖屏转换 */
    ipcMain.handle('video:makeVertical', handleMakeVertical);

    // ==================== 变速与GIF ====================

    /** 视频变速 */
    ipcMain.handle('video:changeSpeed', handleChangeSpeed);

    /** 视频截帧 */
    ipcMain.handle('video:extractFrame', handleExtractFrame);

    /** 创建GIF */
    ipcMain.handle('video:createGIF', handleCreateGIF);

    // ==================== 音频处理 ====================

    /** 移除音频轨道 */
    ipcMain.handle('video:removeAudio', handleRemoveAudio);

    /** 提取音频波形数据 */
    ipcMain.handle('video:extractAudio', handleExtractAudio);

    // ==================== 水印处理 ====================

    /** 视频水印 */
    ipcMain.handle('video:watermark', handleWatermark);

    /** 画面转换 (旋转/镜像/裁剪) */
    ipcMain.handle('video:transform', handleTransform);

    // ==================== 工具 ====================

    /** 获取视频详细信息 */
    ipcMain.handle('video:probe', handleProbe);

    /** 取消当前视频任务 */
    ipcMain.on('video:cancel', () => {
        debugLog('[video:cancel] Unified cancellation triggered');
        // 1. 统一取消所有活跃的 FFmpegRunner 进程 (涵盖压缩、竖屏、转换、变速等)
        FFmpegRunner.cancel();
        cancelCompress();
        cancelConvert();
        cancelVertical();
        cancelProcess();

        // 2. 取消合并任务 (由于合并涉及队列和多步骤，保留其专用取消逻辑)
        cancelMerge();
    });
};

module.exports = { setupVideoHandlers };
