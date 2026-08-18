const { dialog, BrowserWindow } = require('electron');
const ffmpegService = require('../services/FFmpegService');
const creatorExportRunner = require('../services/export/CreatorExportRunner');
const isTestEnv = process.env.NODE_ENV === 'test';

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

const setupCreatorHandlers = (ipcMain) => {
    debugLog('[Creator] Registering handlers...');

    /**
     * 取消指定任务
     */
    ipcMain.handle('creator:cancelTask', async (event, taskId) => {
        debugLog(`[Creator] Received cancel request for task: ${taskId}`);
        const exportCancelled = creatorExportRunner.cancelTask(taskId);
        const ffmpegCancelled = ffmpegService.cancelTask(taskId);
        return exportCancelled || ffmpegCancelled;
    });

    ipcMain.handle('creator:export', async (event, job) => {
        try {
            return await creatorExportRunner.run(job, {
                onProgress: (payload) => event.sender.send('creator:progress', payload)
            });
        } catch (error) {
            console.error('[Creator] Export error:', error);
            return {
                success: false,
                jobId: job?.jobId || null,
                error: error.message,
                details: error.stack || error.message
            };
        }
    });

    /**
     * 检测视频中的静音段落
     */
    ipcMain.handle('creator:detectSilence', async (event, filePath, options = {}) => {
        const taskId = options.taskId || `silence_detect_${Date.now()}`;
        try {
            const { threshold = -40, minDuration = 0.5 } = options;
            return await ffmpegService.detectSilence(taskId, filePath, threshold, minDuration);
        } catch (error) {
            console.error('[Creator] Silence detection setup error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 移除静音段落
     */
    ipcMain.handle('creator:removeSilence', async (event, filePath, segments, options = {}) => {
        const taskId = options.taskId || `remove_silence_${Date.now()}`;
        try {
            const { savePath: providedSavePath } = options;
            let outputPath = providedSavePath;

            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const result = await dialog.showSaveDialog(win, {
                    title: '保存处理后的视频',
                    defaultPath: filePath.replace(/\.[^/.]+$/, '_no_silence.mp4'),
                    filters: [{ name: 'Video Files', extensions: ['mp4'] }]
                });

                if (result.canceled || !result.filePath) return { success: false, error: 'User canceled' };
                outputPath = result.filePath;
            }

            // 获取时长
            const totalDuration = await ffmpegService.getDuration(filePath);

            // Build keep segments
            const keepSegments = [];
            let lastEnd = 0;
            for (const seg of segments) {
                if (seg.start > lastEnd && (seg.start - lastEnd) > 0.1) {
                    keepSegments.push({ start: lastEnd, end: seg.start });
                }
                lastEnd = seg.end;
            }
            if (lastEnd < totalDuration && (totalDuration - lastEnd) > 0.1) {
                keepSegments.push({ start: lastEnd, end: totalDuration });
            }

            if (keepSegments.length === 0) return { success: false, error: 'No valid segments to keep' };

            const totalKeepDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);

            return await ffmpegService.removeSilence(
                taskId,
                filePath,
                outputPath,
                keepSegments,
                totalKeepDuration,
                (progress) => event.sender.send('creator:progress', { taskId, progress })
            );

        } catch (error) {
            console.error('[Creator] Silence removal error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 音画合成 (Mix)
     */
    ipcMain.handle('creator:mix', async (event, options) => {
        const taskId = options.taskId || `mix_${Date.now()}`;
        try {
            const { videoPath, audioPath, outputPath, videoVolume = 1.0, audioVolume = 1.0, durationMode = 'shortest' } = options;
            return await ffmpegService.mixMedia(taskId, videoPath, audioPath, outputPath, videoVolume, audioVolume, durationMode);
        } catch (error) {
            console.error('[Creator] Mix error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 多轨道音画合成 (Mix Multiple)
     */
    ipcMain.handle('creator:mixMultiple', async (event, options) => {
        const taskId = options.taskId || `mix_multiple_${Date.now()}`;
        try {
            const { videoPath, audioTracks, outputPath, videoVolume = 1.0, durationMode = 'shortest' } = options;
            return await ffmpegService.mixMultipleMedia(taskId, videoPath, audioTracks, outputPath, videoVolume, durationMode);
        } catch (error) {
            console.error('[Creator] Multi-mix error:', error);
            return { success: false, error: error.message };
        }
    });
};

module.exports = { setupCreatorHandlers };

