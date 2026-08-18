const { setupTranscribeHandlers } = require('../../src/handlers/transcribeHandler');
const transcribeService = require('../../services/transcribe');
const translationService = require('../../services/translation');
const { BrowserWindow, dialog } = require('electron');

// Mock services
jest.mock('../../services/transcribe');
jest.mock('../../services/translation');
jest.mock('electron', () => ({
    BrowserWindow: {
        fromWebContents: jest.fn()
    },
    dialog: {
        showSaveDialog: jest.fn()
    }
}));
jest.mock('archiver', () => jest.fn(() => ({
    on: jest.fn(),
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn(),
    pointer: jest.fn().mockReturnValue(1234)
})));
jest.mock('fs', () => ({
    createWriteStream: jest.fn(() => ({
        on: jest.fn((event, cb) => {
            if (event === 'close') cb();
        })
    }))
}));

describe('transcribeHandler', () => {
    let mockIpcMain;
    let handlers = {};

    beforeEach(() => {
        jest.clearAllMocks();
        mockIpcMain = {
            handle: jest.fn((channel, handler) => {
                handlers[channel] = handler;
            })
        };
        setupTranscribeHandlers(mockIpcMain);
    });

    describe('transcribe:start', () => {
        it('应能正确发起转录任务并回传进度', async () => {
            const mockEvent = { sender: { send: jest.fn() } };
            transcribeService.transcribe.mockImplementation(async (path, opts) => {
                opts.onProgress(50);
                return { success: true };
            });

            const result = await handlers['transcribe:start'](mockEvent, 'test.mp3', { model: 'base' });

            expect(result.success).toBe(true);
            expect(transcribeService.transcribe).toHaveBeenCalledWith('test.mp3', expect.objectContaining({
                model: 'base'
            }));
            expect(mockEvent.sender.send).toHaveBeenCalledWith('transcribe:progress', 50);
        });
    });

    describe('transcribe:cancel', () => {
        it('should call transcribeService.cancel', async () => {
            transcribeService.cancel = jest.fn().mockResolvedValue({ success: true });
            const result = await handlers['transcribe:cancel']();
            expect(transcribeService.cancel).toHaveBeenCalled();
            expect(result).toEqual({ success: true });
        });
    });

    describe('translation:translate', () => {
        it('应能正确调用翻译服务', async () => {
            translationService.translate.mockResolvedValue('Translated Text');
            const result = await handlers['translation:translate']({}, 'Hello', 'zh', 'openai');
            expect(result).toBe('Translated Text');
            expect(translationService.translate).toHaveBeenCalledWith('Hello', 'zh', 'openai');
        });
    });
});
