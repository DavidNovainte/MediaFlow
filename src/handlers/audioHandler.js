/**
 * AudioHandler - 音频处理 IPC 协调层
 * 支持 FFmpeg、DeepFilterNet AI、云端 API、Demucs 四种引擎
 */

const { handleDenoise, cancelDenoise, getDenoisePresets } = require('./audio/denoiseHandler');
const { handleDeepFilter, cancelDeepFilter, isAvailable: isDeepFilterAvailable } = require('./audio/deepfilterHandler');
const { handleApiEnhance, setApiConfig, getApiConfig, isApiConfigured } = require('./audio/apiEnhanceHandler');
const { checkDemucsAvailable, installDemucs, separateAudio, cancelSeparation } = require('./audio/demucsHandler');
const modelManager = require('../utils/modelManager');

/**
 * 注册音频处理 IPC handlers
 * @param {Electron.IpcMain} ipcMain
 */
const setupAudioHandlers = (ipcMain) => {

    // ===== FFmpeg 降噪 =====
    ipcMain.handle('audio:denoise', handleDenoise);
    ipcMain.handle('audio:getDenoisePresets', getDenoisePresets);
    ipcMain.on('audio:cancelDenoise', () => cancelDenoise());

    // ===== DeepFilterNet AI =====
    ipcMain.handle('audio:deepfilter', handleDeepFilter);
    ipcMain.on('audio:cancelDeepFilter', () => cancelDeepFilter());
    ipcMain.handle('audio:isDeepFilterAvailable', () => isDeepFilterAvailable());

    // ===== Demucs AI 人声分离 =====
    ipcMain.handle('audio:demucsCheck', checkDemucsAvailable);
    ipcMain.handle('audio:demucsInstall', installDemucs);
    ipcMain.handle('audio:demucsSeparate', separateAudio);
    ipcMain.handle('audio:demucsSave', require('./audio/demucsHandler').saveDemucsFiles);
    ipcMain.on('audio:demucsCancel', () => cancelSeparation());

    // ===== 云端 API =====
    ipcMain.handle('audio:apiEnhance', handleApiEnhance);
    ipcMain.handle('audio:setApiConfig', (event, config) => {
        setApiConfig(config);
        return { success: true };
    });
    ipcMain.handle('audio:getApiConfig', () => getApiConfig());
    ipcMain.handle('audio:isApiConfigured', () => isApiConfigured());

    // ===== 模型管理 =====
    ipcMain.handle('audio:getModelsStatus', () => modelManager.getModelsStatus());

    ipcMain.handle('audio:downloadModel', async (event, modelId) => {
        try {
            const result = await modelManager.downloadModel(modelId, (percent, status) => {
                event.sender.send('model:downloadProgress', { modelId, percent, status });
            });
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('audio:deleteModel', (event, modelId) => {
        const success = modelManager.deleteModel(modelId);
        return { success };
    });

    // ===== 统一取消 =====
    ipcMain.on('audio:cancel', () => {
        cancelDenoise();
        cancelDeepFilter();
        cancelSeparation();
    });
};

module.exports = { setupAudioHandlers };

