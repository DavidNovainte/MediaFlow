jest.mock('electron-store', () =>
    jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }))
);

const { setupAudioHandlers } = require('../../src/handlers/audioHandler');
const modelManager = require('../../src/utils/modelManager');

// Mock sub-handlers
jest.mock('../../src/handlers/audio/denoiseHandler', () => ({ handleDenoise: jest.fn(), cancelDenoise: jest.fn(), getDenoisePresets: jest.fn() }));
jest.mock('../../src/handlers/audio/deepfilterHandler', () => ({ handleDeepFilter: jest.fn(), cancelDeepFilter: jest.fn(), isAvailable: jest.fn() }));
jest.mock('../../src/handlers/audio/apiEnhanceHandler', () => ({ handleApiEnhance: jest.fn(), setApiConfig: jest.fn(), getApiConfig: jest.fn(), isApiConfigured: jest.fn() }));
jest.mock('../../src/handlers/audio/demucsHandler', () => ({ checkDemucsAvailable: jest.fn(), installDemucs: jest.fn(), separateAudio: jest.fn(), cancelSeparation: jest.fn(), saveDemucsFiles: jest.fn() }));
jest.mock('../../src/utils/modelManager', () => ({ getModelsStatus: jest.fn(), downloadModel: jest.fn(), deleteModel: jest.fn() }));

describe('audioHandler', () => {
    let mockIpcMain;
    let handlers = {};
    let events = {};

    beforeEach(() => {
        jest.clearAllMocks();
        mockIpcMain = {
            handle: jest.fn((channel, handler) => {
                handlers[channel] = handler;
            }),
            on: jest.fn((channel, cb) => {
                events[channel] = cb;
            })
        };
        setupAudioHandlers(mockIpcMain);
    });

    it('应正确注册音频 IPC handlers', () => {
        expect(mockIpcMain.handle).toHaveBeenCalledWith('audio:denoise', expect.any(Function));
        expect(mockIpcMain.handle).toHaveBeenCalledWith('audio:demucsSeparate', expect.any(Function));
    });

    it('模型下载应正确发送进度', async () => {
        const mockEvent = { sender: { send: jest.fn() } };
        modelManager.downloadModel.mockImplementation(async (id, onProgress) => {
            onProgress(50, 'downloading');
            return { success: true };
        });

        const result = await handlers['audio:downloadModel'](mockEvent, 'voice-model-1');

        expect(result.success).toBe(true);
        expect(mockEvent.sender.send).toHaveBeenCalledWith('model:downloadProgress', {
            modelId: 'voice-model-1',
            percent: 50,
            status: 'downloading'
        });
    });
});
