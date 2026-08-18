const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getProxyUrl } = require('../../../src/handlers/download/proxyUtils');

jest.mock('child_process', () => ({
    execFile: jest.fn()
}));

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/mock/user/data')
    }
}));

jest.mock('../../../src/utils/binaries', () => ({
    getYtDlpPath: jest.fn().mockReturnValue('yt-dlp')
}));

jest.mock('../../../src/handlers/download/proxyUtils', () => ({
    getProxyUrl: jest.fn().mockReturnValue(null)
}));

jest.mock('../../../services/mobile/AuthManager', () => ({
    setPin: jest.fn(),
    mountRoutes: jest.fn(),
    getMiddleware: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../../services/mobile/FileBrowseManager', () => ({
    mountRoutes: jest.fn(),
    getFilePathById: jest.fn(),
    registerFile: jest.fn()
}));

jest.mock('../../../services/mobile/MediaStreamManager', () => ({
    mountRoutes: jest.fn()
}));

jest.mock('../../../services/mobile/RemoteViewManager', () => ({
    mountRoutes: jest.fn(),
    getRemoteQRCode: jest.fn(),
    getFileQRCode: jest.fn()
}));

jest.mock('../../../services/mobile/ClipboardManager', () => ({
    mountRoutes: jest.fn()
}));

const mobileFlowServer = require('../../../services/mobile/MobileFlowServer');

describe('MobileFlowServer resolve-download helper', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(fs, 'existsSync').mockImplementation((targetPath) => (
            targetPath === path.join('/mock/user/data', 'cookies.txt')
        ));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('builds stable yt-dlp args and parses mixed stdout output', async () => {
        getProxyUrl.mockReturnValue('http://127.0.0.1:7890');
        execFile.mockImplementation((command, args, options, callback) => {
            expect(command).toBe('yt-dlp');
            expect(args).toContain('--no-warnings');
            expect(args).toContain('--no-playlist');
            expect(args).toContain('--proxy');
            expect(args).toContain('http://127.0.0.1:7890');
            expect(args).toContain('--cookies');
            expect(args).toContain(path.join('/mock/user/data', 'cookies.txt'));
            expect(args).toContain('--add-header');
            expect(args).toContain('Referer:https://www.instagram.com/');
            expect(args).toContain('https://www.instagram.com/reel/demo123');
            expect(options.env.PYTHONIOENCODING).toBe('utf-8');

            callback(
                null,
                'WARNING: extractor note\n{"title":"Demo Clip","url":"https://cdn.example.com/demo.mp4"}\n',
                ''
            );
        });

        const resolved = await mobileFlowServer.resolveDownloadUrl(
            'https://www.instagram.com/reel/demo123'
        );

        expect(resolved).toEqual({
            title: 'Demo Clip',
            resolvedUrl: 'https://cdn.example.com/demo.mp4'
        });
    });

    it('maps cookie-gated yt-dlp failures into a readable helper error', async () => {
        execFile.mockImplementation((command, args, options, callback) => {
            callback(
                new Error('yt-dlp failed'),
                '',
                'ERROR: Sign in to confirm you are not a bot'
            );
        });

        await expect(
            mobileFlowServer.resolveDownloadUrl('https://www.youtube.com/watch?v=demo123')
        ).rejects.toMatchObject({
            code: 'resolve_failed',
            message: 'This page needs browser cookies. Sync cookies to the desktop helper and try again.'
        });
    });
});