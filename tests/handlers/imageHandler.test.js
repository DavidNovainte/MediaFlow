// imageHandler.test.js
const fs = require('fs');

// 1. Mock 所有依赖（必须在 require 之前）
jest.mock('electron', () => ({
    app: { getPath: jest.fn().mockReturnValue('/mock/path') }
}));
jest.mock('electron-store', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn()
    }));
});
jest.mock('fs');
jest.mock('p-limit', () => jest.fn(() => (fn) => fn()));

jest.mock('../../services/LicenseManager', () => ({
    getStatus: jest.fn().mockResolvedValue({ isPro: true })
}));

// 2. 完全 Mock compress 和 image 服务，避免调用真实的 sharp
// 根据项目结构：compress 在 src/services/image/ 下，image 在根目录 services/image/ 下
jest.mock('../../src/services/image/compress', () => {
    return {
        compress: jest.fn().mockResolvedValue({ success: true, output: 'out.jpg' }),
        batchCompress: jest.fn().mockResolvedValue({ success: true }),
        getInfo: jest.fn().mockResolvedValue({ width: 100, height: 100, size: 1024 })
    };
});
jest.mock('../../services/image/image', () => ({
    proxyImage: jest.fn().mockResolvedValue({ success: true }),
    removeBackground: jest.fn().mockResolvedValue({ success: true, output: 'out.png' })
}));
	// virtual: Community export may omit EnhanceService module on disk
	const mockEnhanceImage = jest.fn().mockResolvedValue({ success: true, outputPath: 'enhanced.jpg' });
	jest.mock(
	    '../../src/services/enhance/EnhanceService',
	    () => ({ enhanceImage: (...args) => mockEnhanceImage(...args) }),
	    { virtual: true }
	);

	// 3. require 业务代码
	const { setupImageHandlers } = require('../../src/handlers/imageHandler');
	const compressService = require('../../src/services/image/compress');
	const licenseManager = require('../../services/LicenseManager');
	const imageService = require('../../services/image/image');
	const enhanceService = { enhanceImage: mockEnhanceImage };

describe('imageHandler', () => {
    let mockIpcMain;
    let handlers = {};

    beforeEach(() => {
        jest.clearAllMocks();
        licenseManager.getStatus.mockResolvedValue({ isPro: true });
        mockIpcMain = {
            handle: jest.fn((channel, handler) => {
                handlers[channel] = handler;
            })
        };
        setupImageHandlers(mockIpcMain);
    });

    describe('compress:single', () => {
        it('如果没有 AI 增强，应直接调用 compressService', async () => {
            const mockEvent = { sender: { send: jest.fn() } };

            const result = await handlers['compress:single'](mockEvent, 'in.jpg', 'out.jpg', { enableAiUpscale: false });

            expect(result.success).toBe(true);
            expect(enhanceService.enhanceImage).not.toHaveBeenCalled();
            expect(compressService.compress).toHaveBeenCalledWith('in.jpg', 'out.jpg', expect.anything());
        });

        it('如果启用 AI 增强，应先调用 enhanceService', async () => {
            const mockEvent = { sender: { send: jest.fn() } };

            await handlers['compress:single'](mockEvent, 'in.jpg', 'out.jpg', { enableAiUpscale: true });

            expect(enhanceService.enhanceImage).toHaveBeenCalled();
            expect(compressService.compress).toHaveBeenCalledWith('enhanced.jpg', 'out.jpg', expect.anything());
            expect(fs.unlinkSync).toHaveBeenCalledWith('enhanced.jpg');
        });

        it('free / Community users can enable AI upscale in compress', async () => {
            licenseManager.getStatus.mockResolvedValue({ isPro: false });
            const mockEvent = { sender: { send: jest.fn() } };
            await handlers['compress:single'](mockEvent, 'in.jpg', 'out.jpg', { enableAiUpscale: true });
            expect(enhanceService.enhanceImage).toHaveBeenCalled();
            expect(compressService.compress).toHaveBeenCalled();
        });
    });

    describe('image:remove-bg', () => {
        it('allows free / Community users (compress toolbox)', async () => {
            licenseManager.getStatus.mockResolvedValue({ isPro: false });
            const result = await handlers['image:remove-bg']({}, 'in.jpg', 'out.png', {});
            expect(result.success).toBe(true);
            expect(imageService.removeBackground).toHaveBeenCalled();
        });

        it('allows Pro users', async () => {
            licenseManager.getStatus.mockResolvedValue({ isPro: true });
            const result = await handlers['image:remove-bg']({}, 'in.jpg', 'out.png', {});
            expect(result.success).toBe(true);
            expect(imageService.removeBackground).toHaveBeenCalled();
        });
    });

    describe('compress:getInfo', () => {
        it('应能正确调用 getInfo', async () => {
            const result = await handlers['compress:getInfo']({}, 'test.jpg');
            expect(result.width).toBe(100);
            expect(result.height).toBe(100);
            expect(compressService.getInfo).toHaveBeenCalledWith('test.jpg');
        });
    });
});
