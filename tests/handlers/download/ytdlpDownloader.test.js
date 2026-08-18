const fs = require('fs');
const { downloadVideo, normalizeUrl } = require('../../../src/handlers/download/ytdlpDownloader');
const { spawn } = require('child_process');
const path = require('path');
const Store = require('electron-store');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(() => true)
}));
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/mock/user/data')
    }
}));
jest.mock('electron-store');
jest.mock('../../../src/utils/binaries', () => ({
    getYtDlpPath: jest.fn().mockReturnValue('yt-dlp'),
    getFfmpegPath: jest.fn().mockReturnValue('ffmpeg')
}));
jest.mock('../../../src/handlers/download/proxyUtils', () => ({
    getProxyUrl: jest.fn().mockReturnValue(null)
}));
jest.mock('../../../services/platforms/tiktok', () => ({
    isTikTokUrl: jest.fn().mockReturnValue(false)
}));
jest.mock('../../../services/platforms/douyin', () => ({
    isDouyinUrl: jest.fn().mockReturnValue(false),
    downloadVideo: jest.fn()
}));
jest.mock('../../../services/platforms/instagram', () => ({
    isInstagramUrl: jest.fn().mockReturnValue(false)
}));
jest.mock('../../../services/platforms/facebook', () => ({
    isFacebookUrl: jest.fn().mockReturnValue(false)
}));

describe('ytdlpDownloader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
        Store.prototype.get = jest.fn().mockReturnValue(null);
    });

    describe('normalizeUrl', () => {
        it('应该能正确处理抖音视频 ID 链接', () => {
            const url = 'https://v.douyin.com/abc1234567890123456/';
            const normalized = normalizeUrl('https://www.douyin.com/video/7123456789012345678');
            expect(normalized).toBe('https://www.douyin.com/video/7123456789012345678');
        });

        it('应该能自动修复 iesdouyin 域名', () => {
            const url = 'https://www.iesdouyin.com/share/video/1234567890123456789/';
            expect(normalizeUrl(url)).toBe('https://www.douyin.com/video/1234567890123456789');
        });

        it('对普通链接不作处理', () => {
            const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            expect(normalizeUrl(url)).toBe(url);
        });
    });

    describe('downloadVideo', () => {
        it('如果没有提供 URL 应该返回错误', async () => {
            const result = await downloadVideo({ url: '' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid URL provided');
        });

        it('如果没有提供 savePath 应该返回错误', async () => {
            const result = await downloadVideo({ url: 'https://example.com' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Download path is not specified');
        });

        it('应该能正确调用 yt-dlp 进程', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => {
                    if (event === 'close') setTimeout(() => cb(0), 10);
                }),
                pid: 123
            };
            spawn.mockReturnValue(mockProcess);

            const options = {
                url: 'https://www.youtube.com/watch?v=123',
                savePath: 'C:/Downloads',
                quality: '1080',
                sender: { isDestroyed: () => false, send: jest.fn() }
            };

            const result = await downloadVideo(options);

            expect(spawn).toHaveBeenCalled();
            const args = spawn.mock.calls[0][1];
            expect(args).toContain('https://www.youtube.com/watch?v=123');
            expect(args).toContain('bestvideo[height<=1080][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best');
        });

        it('会清洗标题中的换行和 Windows 非法文件名字符', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => {
                    if (event === 'close') setTimeout(() => cb(0), 10);
                }),
                pid: 456
            };
            spawn.mockReturnValue(mockProcess);

            await downloadVideo({
                url: 'https://www.douyin.com/video/123',
                savePath: 'C:/Downloads',
                quality: '1080',
                title: '一人公司神器！\n有了Multica: 一个工具?管所有Agent*',
                sender: { isDestroyed: () => false, send: jest.fn() }
            });

            const args = spawn.mock.calls[0][1];
            const outputTemplate = args[args.indexOf('-o') + 1];
            const baseName = path.basename(outputTemplate);

            expect(baseName).not.toMatch(/[\r\n]/);
            expect(baseName).not.toContain('?');
            expect(baseName).not.toContain('*');
            expect(baseName).toContain('一人公司神器！ 有了Multica 一个工具 管所有Agent');
        });

        it('keeps the extension placeholder and extracts the requested format for audio-only downloads', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => {
                    if (event === 'close') setTimeout(() => cb(0), 10);
                }),
                pid: 789
            };
            spawn.mockReturnValue(mockProcess);

            await downloadVideo({
                url: 'https://www.youtube.com/watch?v=audio',
                savePath: 'C:/Downloads',
                quality: 'audio',
                audioOnly: true,
                audioFormat: 'mp3',
                title: 'Podcast Episode',
                sender: { isDestroyed: () => false, send: jest.fn() }
            });

            const args = spawn.mock.calls[0][1];
            const outputTemplate = args[args.indexOf('-o') + 1];
            const audioFormatIndex = args.indexOf('--audio-format');

            expect(path.basename(outputTemplate)).toBe('Podcast Episode.%(ext)s');
            expect(path.basename(outputTemplate)).not.toMatch(/\.mp4$/);
            expect(args).toContain('bestaudio/best');
            expect(args).toContain('-x');
            expect(audioFormatIndex).toBeGreaterThan(-1);
            expect(args[audioFormatIndex + 1]).toBe('mp3');
            expect(args).not.toContain('--merge-output-format');
            expect(args).not.toContain('--recode-video');
        });

        it('treats quality audio as an audio extraction request even without audioOnly', async () => {
            const mockProcess = {
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn((event, cb) => {
                    if (event === 'close') setTimeout(() => cb(0), 10);
                }),
                pid: 790
            };
            spawn.mockReturnValue(mockProcess);

            await downloadVideo({
                url: 'https://www.youtube.com/watch?v=audio2',
                savePath: 'C:/Downloads',
                quality: 'audio',
                audioFormat: 'm4a',
                sender: { isDestroyed: () => false, send: jest.fn() }
            });

            const args = spawn.mock.calls[0][1];
            const outputTemplate = args[args.indexOf('-o') + 1];
            const audioFormatIndex = args.indexOf('--audio-format');

            expect(path.basename(outputTemplate)).toBe('%(title)s.%(ext)s');
            expect(path.basename(outputTemplate)).not.toMatch(/\.mp4$/);
            expect(args).toContain('-x');
            expect(audioFormatIndex).toBeGreaterThan(-1);
            expect(args[audioFormatIndex + 1]).toBe('m4a');
        });
    });
});
