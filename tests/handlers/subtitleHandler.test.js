/** @jest-environment node */

const { EventEmitter } = require('events');
const path = require('path');

const handlers = {};
const mockIpcHandle = jest.fn((name, fn) => {
    handlers[name] = fn;
});
const mockCreatorRun = jest.fn();
const mockCreatorCancel = jest.fn();
const mockRenderOverlayVideo = jest.fn();
const mockSpawn = jest.fn();
const mockMkdtemp = jest.fn();
const mockCopyFile = jest.fn();
const mockLstat = jest.fn();
const mockRm = jest.fn();
const mockUnlink = jest.fn();

jest.mock('electron-store', () =>
    jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }))
);

jest.mock('electron', () => ({
    ipcMain: {
        handle: (...args) => mockIpcHandle(...args)
    },
    dialog: {
        showOpenDialog: jest.fn()
    }
}));

jest.mock('../../src/services/export/CreatorExportRunner', () => ({
    run: (...args) => mockCreatorRun(...args),
    cancelTask: (...args) => mockCreatorCancel(...args)
}));

jest.mock('../../src/handlers/subtitle/cssSubtitleRenderer', () => ({
    renderOverlayVideo: (...args) => mockRenderOverlayVideo(...args)
}));

jest.mock('../../src/utils/binaries', () => ({
    getFfmpegPath: () => 'ffmpeg',
    getFfprobePath: () => 'ffprobe'
}));

jest.mock('child_process', () => ({
    spawn: (...args) => mockSpawn(...args)
}));

jest.mock('fs', () => ({
    promises: {
        mkdtemp: (...args) => mockMkdtemp(...args),
        copyFile: (...args) => mockCopyFile(...args),
        lstat: (...args) => mockLstat(...args),
        rm: (...args) => mockRm(...args),
        unlink: (...args) => mockUnlink(...args)
    }
}));

const { setupSubtitleHandlers } = require('../../src/handlers/subtitle/subtitleHandler');

describe('subtitleHandler source segment burn path', () => {
    beforeEach(() => {
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        jest.clearAllMocks();
        mockMkdtemp.mockResolvedValue('C:/tmp/mediaflow-subtitle-trim');
        mockCopyFile.mockResolvedValue();
        mockLstat.mockRejectedValue(new Error('missing'));
        mockRm.mockResolvedValue();
        mockUnlink.mockResolvedValue();
        mockCreatorRun.mockResolvedValue({
            success: true,
            outputPath: 'C:/tmp/mediaflow-subtitle-trim/trimmed_source.mp4'
        });
        mockRenderOverlayVideo.mockResolvedValue({
            overlayPath: 'C:/tmp/overlay.mp4',
            cleanupPaths: []
        });
        mockSpawn.mockImplementation(() => {
            const proc = new EventEmitter();
            proc.stderr = new EventEmitter();
            proc.stdout = new EventEmitter();
            proc.kill = jest.fn();
            setImmediate(() => proc.emit('close', 0));
            return proc;
        });
        setupSubtitleHandlers();
    });

    test('subtitle:burn trims source media before the final ffmpeg pass when kept segments are provided', async () => {
        const sender = { send: jest.fn() };
        const params = {
            videoPath: 'C:/video/input.mp4',
            duration: 4,
            sourceSegments: [
                { start: 0, end: 2 },
                { start: 5, end: 7 }
            ],
            tracks: [{
                id: 'main',
                type: 'main',
                style: {},
                subtitles: [{ id: 'sub-1', start: 0.2, end: 1.4, text: 'Hello' }]
            }],
            width: 1280,
            height: 720,
            outputPath: 'C:/out/final.mp4'
        };

        const result = await handlers['subtitle:burn']({ sender }, params);

        expect(mockCreatorRun).toHaveBeenCalledWith(
            expect.objectContaining({
                exportKind: 'video+audio',
                primaryAudioTrackId: 'a1',
                primaryVideoClips: [
                    expect.objectContaining({ sourceStart: 0, sourceEnd: 2 }),
                    expect.objectContaining({ sourceStart: 5, sourceEnd: 7 })
                ],
                primaryAudioClips: [
                    expect.objectContaining({ sourceStart: 0, sourceEnd: 2, assetPath: 'C:/video/input.mp4' }),
                    expect.objectContaining({ sourceStart: 5, sourceEnd: 7, assetPath: 'C:/video/input.mp4' })
                ]
            }),
            expect.objectContaining({ onProgress: expect.any(Function) })
        );
        expect(mockRenderOverlayVideo).toHaveBeenCalledWith(expect.objectContaining({
            duration: 4
        }));
        const ffmpegArgs = mockSpawn.mock.calls[0][1];
        expect(ffmpegArgs).toEqual(expect.arrayContaining([
            '-i',
            path.normalize('C:/tmp/mediaflow-subtitle-trim/trimmed_source.mp4'),
            '-i',
            'C:/tmp/overlay.mp4'
        ]));
        expect(result).toEqual({ success: true, outputPath: 'C:/out/final.mp4' });
    });
});
