/** @jest-environment jsdom */

describe('urlUtils pathToMediaUrl / resolveDisplayUrl', () => {
    beforeAll(() => {
        require('../../src/utils/urlUtils');
    });

    test('pathToMediaUrl builds media-file URL for Windows paths', () => {
        const url = window.urlUtils.pathToMediaUrl('C:\\Users\\test\\pic.png');
        expect(url).toMatch(/^media-file:\/\/\//);
        expect(url).toContain('C:');
        expect(url).toContain('pic.png');
    });

    test('pathToMediaUrl is idempotent for media-file URLs', () => {
        const once = window.urlUtils.pathToMediaUrl('D:/a/b.jpg');
        expect(window.urlUtils.pathToMediaUrl(once)).toBe(once);
    });

    test('resolveDisplayUrl returns media-file without calling readAsDataUrl', async () => {
        window.mediaflow = {
            fs: {
                readAsDataUrl: jest.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,xx' })
            }
        };
        const url = await window.urlUtils.resolveDisplayUrl('C:/media/big.png');
        expect(url.startsWith('media-file:')).toBe(true);
        expect(window.mediaflow.fs.readAsDataUrl).not.toHaveBeenCalled();
    });

    test('resolveDisplayUrl preserves data/blob/http', async () => {
        expect(await window.urlUtils.resolveDisplayUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
        expect(await window.urlUtils.resolveDisplayUrl('blob:http://x/1')).toBe('blob:http://x/1');
        expect(await window.urlUtils.resolveDisplayUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
    });
});
