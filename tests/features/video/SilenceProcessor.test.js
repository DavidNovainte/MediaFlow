/** @jest-environment jsdom */

describe('SilenceProcessor batch behavior', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn((key) => key) };
        window.mediaflow = {
            creator: {
                detectSilence: jest.fn().mockResolvedValue({ success: true, segments: [] }),
                onProgress: jest.fn(() => jest.fn()),
                removeSilence: jest.fn()
            },
            fs: {
                copyFile: jest.fn().mockResolvedValue({ success: true })
            }
        };

        require('../../../src/features/video/SilenceProcessor');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.mediaflow;
        delete window.SilenceProcessor;
    });

    test('copies unchanged media when batch silence detection finds no segments', async () => {
        const processor = new window.SilenceProcessor({});
        const onProgress = jest.fn();

        const result = await processor.removeSilenceBatch(
            'C:/Users/Test/input.mp4',
            'C:/Users/Test/output.mp4',
            { threshold: '-36', duration: '0.4' },
            onProgress
        );

        expect(window.mediaflow.creator.detectSilence).toHaveBeenCalledWith(
            'C:/Users/Test/input.mp4',
            { threshold: -36, minDuration: 0.4 }
        );
        expect(window.mediaflow.fs.copyFile).toHaveBeenCalledWith(
            'C:/Users/Test/input.mp4',
            'C:/Users/Test/output.mp4'
        );
        expect(window.mediaflow.creator.removeSilence).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, outputPath: 'C:/Users/Test/output.mp4' });
        expect(onProgress).toHaveBeenCalledWith(100, 'creator.silence.detectNone');
    });

    test('fails clearly when unchanged media copy fails', async () => {
        window.mediaflow.fs.copyFile.mockResolvedValueOnce({ success: false, error: 'copy denied' });
        const processor = new window.SilenceProcessor({});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            await expect(processor.removeSilenceBatch(
                'C:/Users/Test/input.mp4',
                'C:/Users/Test/output.mp4',
                {},
                jest.fn()
            )).rejects.toThrow('copy denied');
        } finally {
            errorSpy.mockRestore();
        }
    });
});
