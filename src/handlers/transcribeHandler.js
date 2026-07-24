const { BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const archiver = require('archiver');

const transcribeService = require('../../services/transcribe');
const translationService = require('../../services/translation');

const setupTranscribeHandlers = (ipcMain) => {

    // ==================== ScribeFlow IPC (转录服务) ====================

    /**
     * 设置转录 API Key
     */
    ipcMain.handle('transcribe:setApiKey', (event, apiKey) => {
        transcribeService.setApiKey(apiKey);
        return { success: true };
    });

    /**
     * 转录音频/视频文件
     */
    ipcMain.handle('transcribe:start', async (event, filePath, options) => {
        return await transcribeService.transcribe(filePath, {
            ...options,
            onProgress: (progress) => {
                event.sender.send('transcribe:progress', progress);
            }
        });
    });

    /**
     * 本地转录
     */
    ipcMain.handle('transcribe:startLocal', async (event, filePath, options) => {
        return await transcribeService.transcribeLocal(filePath, {
            ...options,
            onProgress: (progress) => {
                event.sender.send('transcribe:progress', progress);
            }
        });
    });

    /**
     * 取消进行中的转录（本地进程立即结束；云端在当前请求返回后由 UI 停止队列）
     */
    ipcMain.handle('transcribe:cancel', async () => {
        try {
            if (typeof transcribeService.cancel === 'function') {
                return await transcribeService.cancel();
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /**
     * 检查本地环境
     */
    ipcMain.handle('transcribe:checkLocalEnv', async () => {
        return await transcribeService.checkLocalEnv();
    });

    /**
     * 导出为 SRT
     */
    ipcMain.handle('transcribe:exportSRT', (event, segments) => {
        return transcribeService.exportToSRT(segments);
    });

    /**
     * 导出为双语 SRT
     */
    ipcMain.handle('transcribe:exportBilingualSRT', (event, segments, translations) => {
        return transcribeService.exportToBilingualSRT(segments, translations);
    });

    /**
     * 导出为文本
     */
    ipcMain.handle('transcribe:exportText', (event, segments, includeTimestamps) => {
        return transcribeService.exportToText(segments, includeTimestamps);
    });

    /**
     * AI 字幕润色 - 优化转录文本的标点和措辞
     */
    ipcMain.handle('transcribe:polish', async (event, segments, options) => {
        return await transcribeService.polishText(segments, options);
    });

    /**
     * AI 内容总结
     */
    ipcMain.handle('transcribe:summarize', async (event, segments, options) => {
        return await transcribeService.summarizeText(segments, options);
    });

    /**
     * 批量多语言翻译
     */
    ipcMain.handle('transcribe:translateBatch', async (event, text, languages, options) => {
        return await transcribeService.translateBatch(text, languages, {
            ...options,
            onProgress: (progress) => {
                event.sender.send('transcribe:translateBatchProgress', progress);
            }
        });
    });

    /**
     * 获取已下载的本地模型
     */
    ipcMain.handle('transcribe:getDownloadedModels', async () => {
        return await transcribeService.getDownloadedModels();
    });

    /**
     * 删除本地模型
     */
    ipcMain.handle('transcribe:deleteModel', async (event, modelId) => {
        return await transcribeService.deleteModel(modelId);
    });

    /**
     * 下载模型
     */
    ipcMain.handle('transcribe:downloadModel', async (event, modelName) => {
        return await transcribeService.downloadModel(modelName);
    });

    /**
     * Sherpa 说话人模型状态 / 预下载（不打包，用户本机缓存）
     */
    ipcMain.handle('transcribe:getSherpaModelStatus', async () => {
        return await transcribeService.getSherpaModelStatus();
    });

    ipcMain.handle('transcribe:downloadSherpaModels', async (event) => {
        return await transcribeService.downloadSherpaModels((progress) => {
            try {
                event.sender.send('transcribe:sherpaModelProgress', progress);
            } catch (_) { /* window may be gone */ }
        });
    });

    /**
     * 批量导出为 ZIP
     */
    ipcMain.handle('transcribe:exportZip', async (event, files) => {
        try {
            // Get window from sender for dialog
            const win = BrowserWindow.fromWebContents(event.sender);

            // Show save dialog
            const result = await dialog.showSaveDialog(win, {
                title: '保存批量导出',
                defaultPath: `transcripts_${Date.now()}.zip`,
                filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
            });

            if (result.canceled || !result.filePath) {
                return { success: false, error: 'User canceled' };
            }

            const output = fs.createWriteStream(result.filePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            return new Promise((resolve, reject) => {
                output.on('close', () => {
                    console.log(`[Main] ZIP created: ${archive.pointer()} bytes`);
                    resolve({ success: true, path: result.filePath, size: archive.pointer() });
                });

                archive.on('error', (err) => {
                    console.error('[Main] ZIP error:', err);
                    reject({ success: false, error: err.message });
                });

                archive.pipe(output);

                // Add each file to the archive
                for (const file of files) {
                    archive.append(file.content, { name: file.name });
                }

                archive.finalize();
            });
        } catch (error) {
            console.error('[Main] exportZip error:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== Translation IPC (多提供商翻译服务) ====================


    /**
     * 获取所有翻译提供商
     */
    ipcMain.handle('translation:getProviders', () => {
        return translationService.getProviders();
    });

    /**
     * 设置提供商 API Key
     */
    ipcMain.handle('translation:setKeys', (event, provider, keys, accountId) => {
        try {
            translationService.setKeys(provider, keys, accountId);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    /**
     * 设置提供商模型
     */
    ipcMain.handle('translation:setModel', (event, provider, model) => {
        translationService.setModel(provider, model);
        return { success: true };
    });

    /**
     * 设置默认提供商
     */
    ipcMain.handle('translation:setDefaultProvider', (event, provider) => {
        translationService.setDefaultProvider(provider);
        return { success: true };
    });

    /**
     * 翻译文本
     */
    ipcMain.handle('translation:translate', async (event, text, targetLang, provider) => {
        return await translationService.translate(text, targetLang, provider);
    });

    /**
     * 测试提供商连接
     */
    ipcMain.handle('translation:testConnection', async (event, provider) => {
        return await translationService.testConnection(provider);
    });

    /**
     * 旧接口兼容 - 使用新翻译服务
     */
    ipcMain.handle('transcribe:translate', async (event, text, targetLang) => {
        return await translationService.translate(text, targetLang);
    });
};

module.exports = { setupTranscribeHandlers };
