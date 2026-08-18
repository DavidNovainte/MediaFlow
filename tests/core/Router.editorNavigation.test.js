/** @jest-environment jsdom */

describe('Router editor navigation', () => {
    beforeAll(() => {
        require('../../src/core/Router');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = `
            <button class="nav-item" data-page="editor"></button>
            <section class="page" id="page-editor"></section>
            <input id="video-url" />
        `;
        window.scrollTo = jest.fn();
        window.EnhanceFlow = { init: jest.fn() };
        window.PageLoader = {
            ensurePage: jest.fn().mockResolvedValue()
        };
        window.editorFlow = {
            renderCurrentState: jest.fn(),
            handleFileSelect: jest.fn().mockResolvedValue(),
            addLocalFile: jest.fn().mockResolvedValue()
        };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('passes an in-memory media file into EditorFlow when provided', async () => {
        const mediaFile = { name: 'clip.mp4', path: 'C:/video/clip.mp4', type: 'video/mp4' };
        const router = new window.Router({
            licenseManager: {
                _mf_p_ids: [],
                checkFeatureAccess: jest.fn().mockReturnValue(true)
            },
            showToast: jest.fn()
        });

        const navPromise = router.navigateTo('editor', { mediaFile });
        await navPromise;
        jest.runAllTimers();
        await Promise.resolve();

        expect(window.PageLoader.ensurePage).toHaveBeenCalledWith('editor');
        expect(window.editorFlow.renderCurrentState).toHaveBeenCalled();
        expect(window.editorFlow.handleFileSelect).toHaveBeenCalledWith(mediaFile);
        expect(window.editorFlow.addLocalFile).not.toHaveBeenCalled();
    });

    it('falls back to a raw video path when no in-memory file was passed', async () => {
        const router = new window.Router({
            licenseManager: {
                _mf_p_ids: [],
                checkFeatureAccess: jest.fn().mockReturnValue(true)
            },
            showToast: jest.fn()
        });

        await router.navigateTo('editor', { videoPath: 'C:/video/sample.mp4' });
        jest.runAllTimers();
        await Promise.resolve();

        expect(window.editorFlow.renderCurrentState).toHaveBeenCalled();
        expect(window.editorFlow.addLocalFile).toHaveBeenCalledWith('C:/video/sample.mp4');
    });

    it('refreshes the editor timeline after a direct page switch', async () => {
        const router = new window.Router({
            licenseManager: {
                _mf_p_ids: [],
                checkFeatureAccess: jest.fn().mockReturnValue(true)
            },
            showToast: jest.fn()
        });

        await router.switchPage('editor');
        jest.runAllTimers();

        expect(window.editorFlow.renderCurrentState).toHaveBeenCalled();
    });
});
