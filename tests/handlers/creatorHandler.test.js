const { EventEmitter } = require('events');

const mockCancelTask = jest.fn();
const mockRun = jest.fn();

jest.mock('electron-store', () =>
    jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() }))
);

jest.mock('../../src/services/export/CreatorExportRunner', () => ({
    cancelTask: (...args) => mockCancelTask(...args),
    run: (...args) => mockRun(...args)
}));

jest.mock('electron', () => ({
    app: { getPath: jest.fn(() => '/tmp') },
    BrowserWindow: { fromWebContents: jest.fn(() => ({})) },
    dialog: { showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: 'out.mp4' })) }
}));

jest.mock('../../src/utils/binaries', () => ({
    getFfmpegPath: () => 'ffmpeg',
    getFfprobePath: () => 'ffprobe'
}));

jest.mock('child_process', () => ({
    spawn: jest.fn(),
    exec: jest.fn()
}));

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    existsSync: jest.fn(() => true),
    unlinkSync: jest.fn(),
    renameSync: jest.fn(),
    readFileSync: jest.fn(() => 'duration=10.0')
}));

const { setupCreatorHandlers } = require('../../src/handlers/creatorHandler');

describe('creatorHandler', () => {
    let ipcMain;
    let handlers = {};

    beforeEach(() => {
        handlers = {};
        jest.clearAllMocks();
        ipcMain = {
            handle: jest.fn((name, fn) => {
                handlers[name] = fn;
            }),
            on: jest.fn((name, fn) => {
                handlers[name] = fn;
            })
        };
        setupCreatorHandlers(ipcMain);
    });

    test('creator:detectSilence uses spawn-backed ffmpeg service flow', async () => {
        const { spawn } = require('child_process');
        const mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        spawn.mockReturnValue(mockProcess);

        const promise = handlers['creator:detectSilence']({}, 'test.mp4');
        // withPro awaits license first — wait until spawn is attached
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        mockProcess.stderr.emit('data', Buffer.from('silence_start: 1.0\nsilence_end: 2.0\n'));
        mockProcess.emit('close', 0);

        const result = await promise;
        expect(result.success).toBe(true);
        expect(result.segments).toEqual([{ start: 1, end: 2 }]);
    });

    test('creator:cancelTask cancels export jobs before falling back to ffmpeg service tasks', async () => {
        const { spawn, exec } = require('child_process');
        const mockProc1 = new EventEmitter();
        mockProc1.pid = 101;
        mockProc1.stdout = new EventEmitter();
        mockProc1.stderr = new EventEmitter();
        mockProc1.kill = jest.fn();

        const mockProc2 = new EventEmitter();
        mockProc2.pid = 102;
        mockProc2.stdout = new EventEmitter();
        mockProc2.stderr = new EventEmitter();
        mockProc2.kill = jest.fn();

        spawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);
        mockCancelTask.mockReturnValue(true);

        handlers['creator:removeSilence']({ sender: { send: jest.fn() } }, 'v1.mp4', [], { taskId: 'task1' });
        handlers['creator:removeSilence']({ sender: { send: jest.fn() } }, 'v2.mp4', [], { taskId: 'task2' });

        await new Promise((resolve) => setImmediate(resolve));
        if (exec.mock.calls.length >= 2) {
            exec.mock.calls[0][1](null, '10.0');
            exec.mock.calls[1][1](null, '10.0');
        }
        await new Promise((resolve) => setImmediate(resolve));

        const result = await handlers['creator:cancelTask']({}, 'task1');

        expect(result).toBe(true);
        expect(mockCancelTask).toHaveBeenCalledWith('task1');
        expect(mockProc1.kill).toHaveBeenCalled();
        expect(mockProc2.kill).not.toHaveBeenCalled();
    });

    test('creator:export delegates to the export runner and forwards structured progress', async () => {
        const sender = { send: jest.fn() };
        const job = { jobId: 'job-1', output: { path: '/out.mp4' } };

        mockRun.mockImplementation(async (receivedJob, options) => {
            options.onProgress({ jobId: receivedJob.jobId, stage: 'prepare', progress: 10, message: 'Preparing export' });
            return { success: true, jobId: receivedJob.jobId, outputPath: '/out.mp4' };
        });

        const result = await handlers['creator:export']({ sender }, job);

        expect(mockRun).toHaveBeenCalled();
        expect(sender.send).toHaveBeenCalledWith('creator:progress', {
            jobId: 'job-1',
            stage: 'prepare',
            progress: 10,
            message: 'Preparing export'
        });
        expect(result).toEqual({ success: true, jobId: 'job-1', outputPath: '/out.mp4' });
    });
});
