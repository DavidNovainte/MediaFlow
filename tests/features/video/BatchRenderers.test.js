/** @jest-environment jsdom */

describe('batch renderers user text handling', () => {
    const unsafeName = 'bad"><img src=x onerror=alert(1)>.mp4';
    const unsafeError = 'failed"><img src=x onerror=alert(2)>';
    let originalCreateObjectURL;
    let originalRequestAnimationFrame;
    let originalPlay;
    let originalPause;

    beforeAll(() => {
        require('../../../src/features/video/BatchListRenderer');
        require('../../../src/features/video/BatchPreviewRenderer');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        window.VirtualScrollManager = null;
        window.i18n = { t: jest.fn(() => null) };
        originalCreateObjectURL = global.URL.createObjectURL;
        originalRequestAnimationFrame = global.requestAnimationFrame;
        originalPlay = HTMLMediaElement.prototype.play;
        originalPause = HTMLMediaElement.prototype.pause;
        global.URL.createObjectURL = jest.fn(() => 'blob:preview-url');
        global.requestAnimationFrame = (callback) => callback();
        HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
        HTMLMediaElement.prototype.pause = jest.fn();
    });

    afterEach(() => {
        delete window.VirtualScrollManager;
        delete window.i18n;
        if (originalCreateObjectURL) global.URL.createObjectURL = originalCreateObjectURL;
        else delete global.URL.createObjectURL;
        if (originalRequestAnimationFrame) global.requestAnimationFrame = originalRequestAnimationFrame;
        else delete global.requestAnimationFrame;
        HTMLMediaElement.prototype.play = originalPlay;
        HTMLMediaElement.prototype.pause = originalPause;
        jest.restoreAllMocks();
    });

    const createFlow = () => ({
        formatSize: jest.fn(() => '1.0 MB'),
        formatTime: jest.fn((seconds) => `${seconds}s`),
        removeFile: jest.fn(),
        reorderFiles: jest.fn()
    });

    test('batch list renders file names and errors as text', () => {
        document.body.innerHTML = `
            <section id="page-creator">
                <div id="batch-list"></div>
                <span id="batch-count"></span>
                <span id="batch-total-duration"></span>
            </section>
        `;

        const renderer = new window.BatchListRenderer(createFlow());
        renderer.render([{
            file: { name: unsafeName, size: 1024 },
            status: 'error',
            errorMessage: unsafeError,
            duration: 2
        }]);

        const name = document.querySelector('.batch-item-name');
        const error = document.querySelector('.error-msg');

        expect(name.textContent).toBe(unsafeName);
        expect(name.getAttribute('title')).toBe(unsafeName);
        expect(error.textContent).toBe(`(${unsafeError})`);
        expect(error.getAttribute('title')).toBe(unsafeError);
        expect(document.querySelectorAll('img')).toHaveLength(0);
    });

    test('preview cards render file names as text', () => {
        document.body.innerHTML = '<div class="preview-carousel"></div>';

        const renderer = new window.BatchPreviewRenderer(createFlow());
        renderer.render([{
            file: { name: unsafeName, size: 1024 * 1024 },
            status: 'pending'
        }]);

        const name = document.querySelector('.preview-card-name');

        expect(name.textContent).toBe(unsafeName);
        expect(name.getAttribute('title')).toBe(unsafeName);
        expect(document.querySelectorAll('img')).toHaveLength(0);
    });

    test('quick preview renders current segment names as text', () => {
        const renderer = new window.BatchPreviewRenderer(createFlow());

        renderer.playQuickSequence([{
            file: { name: unsafeName },
            objectUrl: 'blob:segment-url'
        }]);

        expect(document.body.textContent).toContain(unsafeName);
        expect(document.querySelectorAll('img')).toHaveLength(0);
    });
});
