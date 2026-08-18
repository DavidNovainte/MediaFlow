jest.mock('../../../src/handlers/audio/demucsHandler', () => ({
    findPython: jest.fn().mockResolvedValue({ cmd: 'python', args: [], version: 'fallback' })
}));

describe('EdgeTTSHandler', () => {
    let handler;

    beforeEach(() => {
        jest.resetModules();
        handler = require('../../../src/handlers/subtitle/tts/EdgeTTSHandler');
        jest.spyOn(handler, 'findEdgePython').mockResolvedValue({ cmd: 'python', args: [], version: 'test' });
        jest.spyOn(handler, 'wait').mockResolvedValue();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('retries once when Edge returns no audio', async () => {
        const runProcess = jest.spyOn(handler, 'runProcess')
            .mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'edge_tts.exceptions.NoAudioReceived: No audio was received.'
            })
            .mockResolvedValueOnce({
                code: 0,
                stdout: '',
                stderr: ''
            });

        await expect(handler.generateAudio({
            text: 'Hello world',
            voice: 'en-US-JennyNeural',
            rate: 0,
            pitch: 0,
            outputPath: 'temp.mp3'
        })).resolves.toBe('temp.mp3');

        expect(runProcess).toHaveBeenCalledTimes(2);
    });

    test('does not retry on non-retryable errors', async () => {
        const runProcess = jest.spyOn(handler, 'runProcess')
            .mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'Invalid voice'
            });

        await expect(handler.generateAudio({
            text: 'Hello world',
            voice: 'bad-voice',
            rate: 0,
            pitch: 0,
            outputPath: 'temp.mp3'
        })).rejects.toThrow('EdgeTTS failed: Invalid voice');

        expect(runProcess).toHaveBeenCalledTimes(1);
    });
});