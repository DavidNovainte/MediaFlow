jest.mock('../../../src/handlers/audio/demucsHandler', () => ({
    findPython: jest.fn().mockResolvedValue({ cmd: 'python', args: [], version: 'fallback' })
}));

describe('ttsHandler batch retry helpers', () => {
    let ttsHandler;

    beforeEach(() => {
        jest.resetModules();
        ttsHandler = require('../../../src/handlers/subtitle/ttsHandler');
        jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
            fn();
            return 0;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('retries once when Edge helper reports no audio received', async () => {
        const execute = jest.fn()
            .mockRejectedValueOnce(new Error('No audio was received. Please verify that your parameters are correct.'))
            .mockResolvedValueOnce(['ok']);

        await expect(ttsHandler.retryEdgeHelperExecution(execute)).resolves.toEqual(['ok']);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    test('does not retry on non-retryable Edge helper errors', async () => {
        const execute = jest.fn().mockRejectedValueOnce(new Error('Invalid voice'));

        await expect(ttsHandler.retryEdgeHelperExecution(execute)).rejects.toThrow('Invalid voice');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    test('caps auto-fit rate when a lower max rate is provided', () => {
        const adjustedRate = ttsHandler.computeAutoFitRatePercent({
            baseRatePercent: 0,
            measuredDuration: 4,
            targetDuration: 2,
            maxRatePercent: 25
        });

        expect(adjustedRate).toBe(25);
    });
});