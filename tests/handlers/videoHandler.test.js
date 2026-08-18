const { setupVideoHandlers } = require('../../src/handlers/videoHandler');
const FFmpegRunner = require('../../src/handlers/video/FFmpegRunner');

// Mock all sub-handlers
jest.mock('../../src/handlers/video/clipHandler', () => ({ handleClip: jest.fn() }));
jest.mock('../../src/handlers/video/mergeHandler', () => ({ handleMultiClip: jest.fn(), handleMerge: jest.fn(), cancelMerge: jest.fn() }));
jest.mock('../../src/handlers/video/compressHandler', () => ({ handleCompress: jest.fn(), cancelCompress: jest.fn() }));
jest.mock('../../src/handlers/video/audioHandler', () => ({ handleRemoveAudio: jest.fn(), handleExtractAudio: jest.fn() }));
jest.mock('../../src/handlers/video/convertHandler', () => ({ handleConvert: jest.fn(), cancelConvert: jest.fn() }));
jest.mock('../../src/handlers/video/verticalHandler', () => ({ handleMakeVertical: jest.fn(), cancelVertical: jest.fn() }));
jest.mock('../../src/handlers/video/probeHandler', () => ({ handleProbe: jest.fn() }));
jest.mock('../../src/handlers/video/speedHandler', () => ({ handleChangeSpeed: jest.fn(), handleExtractFrame: jest.fn(), handleCreateGIF: jest.fn(), cancelProcess: jest.fn() }));
jest.mock('../../src/handlers/video/watermarkHandler', () => ({ handleWatermark: jest.fn() }));
jest.mock('../../src/handlers/video/FFmpegRunner', () => ({ cancel: jest.fn() }));

describe('videoHandler', () => {
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
        setupVideoHandlers(mockIpcMain);
    });

    it('应正确注册所有视频 IPC handlers', () => {
        expect(mockIpcMain.handle).toHaveBeenCalledWith('video:clip', expect.any(Function));
        expect(mockIpcMain.handle).toHaveBeenCalledWith('video:compress', expect.any(Function));
        expect(mockIpcMain.handle).toHaveBeenCalledWith('video:probe', expect.any(Function));
    });

    it('应能正确处理取消事件', () => {
        events['video:cancel']();
        expect(FFmpegRunner.cancel).toHaveBeenCalled();
        const { cancelCompress } = require('../../src/handlers/video/compressHandler');
        expect(cancelCompress).toHaveBeenCalled();
    });
});
