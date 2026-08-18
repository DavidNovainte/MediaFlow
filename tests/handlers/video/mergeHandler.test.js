const { handleMerge, handleMultiClip } = require('../../../src/handlers/video/mergeHandler');
const { spawn } = require('child_process');
const fs = require('fs');

// Mock dependencies
jest.mock('child_process');
jest.mock('../../../src/utils/binaries', () => ({
    getFfmpegPath: () => 'ffmpeg',
    getFfprobePath: () => 'ffprobe'
}));
jest.mock('../../../src/utils/ProcessQueue', () => ({
    push: (id, fn) => fn(),
    registerProcess: jest.fn(),
    cancelTask: jest.fn()
}));
jest.mock('../../../src/utils/logger', () => ({
    ffmpeg: jest.fn()
}));

const mockSpawnImplementation = (cmd, args) => {
    const ee = new (require('events').EventEmitter)();
    ee.stdout = new (require('events').EventEmitter)();
    ee.stderr = new (require('events').EventEmitter)();

    setImmediate(() => {
        const fullArgsString = args.join(' ');
        if (fullArgsString.includes('r_frame_rate')) {
            ee.stdout.emit('data', '30/1');
        } else if (fullArgsString.includes('width,height')) {
            if (fullArgsString.includes('video.mp4')) ee.stdout.emit('data', '1920,1080');
            else ee.stdout.emit('data', '0,0');
        } else if (fullArgsString.includes('codec_name')) {
            ee.stdout.emit('data', 'aac,48000,2');
        } else if (args.includes('-i') && !args.includes('-filter_complex')) {
            ee.stderr.emit('data', 'Duration: 00:00:05.00');
        }
        ee.emit('close', 0);
    });
    return ee;
};

describe('mergeHandler', () => {
    let mockEvent;
    const originalExistsSync = fs.existsSync;
    const originalWriteFileSync = fs.writeFileSync;
    const originalUnlinkSync = fs.unlinkSync;

    beforeEach(() => {
        jest.clearAllMocks();
        mockEvent = {
            sender: { send: jest.fn() }
        };
        fs.existsSync = jest.fn((p) => p.includes('output') || p.includes('list'));
        fs.writeFileSync = jest.fn();
        fs.unlinkSync = jest.fn();
        spawn.mockImplementation(mockSpawnImplementation);
    });

    afterEach(() => {
        fs.existsSync = originalExistsSync;
        fs.writeFileSync = originalWriteFileSync;
        fs.unlinkSync = originalUnlinkSync;
    });

    it('应在处理纯音频合并时生成正确的 ffmpge 参数 (v=0)', async () => {
        const inputs = ['audio1.mp3', 'audio2.mp3'];
        const output = 'output.mp4';

        const result = await handleMerge(mockEvent, {
            inputs,
            output,
            forceReencode: true
        });

        expect(result.success).toBe(true);
        const mergeCall = spawn.mock.calls.find(call => call && call[1] && call[1].includes('-filter_complex'));
        const filterComplex = mergeCall[1][mergeCall[1].indexOf('-filter_complex') + 1];

        expect(filterComplex).toContain('concat=n=2:v=0:a=1');
        expect(mergeCall[1]).toContain('-vn');
    });

    it('应在处理混合合并时为音频文件补充黑色背景视频流', async () => {
        const inputs = ['video.mp4', 'audio.mp3'];
        const output = 'output.mp4';

        const result = await handleMerge(mockEvent, {
            inputs,
            output,
            forceReencode: true
        });

        expect(result.success).toBe(true);
        const mergeCall = spawn.mock.calls.find(call => call && call[1] && call[1].includes('-filter_complex'));
        const filterComplex = mergeCall[1][mergeCall[1].indexOf('-filter_complex') + 1];

        expect(filterComplex).toContain('color=c=black');
        expect(filterComplex).toContain('concat=n=2:v=1:a=1');
    });
    it('uses accurate clipping for multi-clip exports when requested', async () => {
        const result = await handleMultiClip(mockEvent, {
            input: 'video.mp4',
            output: 'output.mp4',
            accurate: true,
            segments: [
                { start: 12.5, end: 18.75 },
                { start: 30, end: 35 }
            ]
        });

        expect(result.success).toBe(true);

        const accurateClipCalls = spawn.mock.calls.filter(call => {
            const args = call[1] || [];
            return args.includes('-preset') && args.includes('ultrafast');
        });

        expect(accurateClipCalls).toHaveLength(2);
        expect(accurateClipCalls[0][1]).toEqual(expect.arrayContaining([
            '-ss', '2.5',
            '-t', '6.25',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '22',
            '-c:a', 'aac'
        ]));

        const mergeCall = spawn.mock.calls.find(call => {
            const args = call[1] || [];
            return args.includes('-f') && args.includes('concat');
        });

        expect(mergeCall[1]).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac']));
    });
});
