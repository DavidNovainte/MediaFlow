/** @jest-environment jsdom */

describe('Router creator workflow navigation', () => {
    beforeAll(() => {
        require('../../src/core/Router');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = `
            <button class="nav-item" data-page="creator"></button>
            <section class="page" id="page-creator"></section>
            <input id="video-url" />
        `;
        window.scrollTo = jest.fn();
        window.EnhanceFlow = { init: jest.fn() };
        window.PageLoader = {
            ensurePage: jest.fn().mockResolvedValue()
        };
        window.creatorFlow = {
            init: jest.fn().mockResolvedValue(),
            _featureLoaderInited: true,
            importPendingWorkflow: jest.fn().mockResolvedValue(true),
            addLocalFile: jest.fn().mockResolvedValue()
        };
        window.FeatureLoader = {
            ensureCreator: jest.fn().mockImplementation(async () => window.creatorFlow)
        };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        delete window.FeatureLoader;
        delete window.PageLoader;
        delete window.creatorFlow;
    });

    it('asks CreatorFlow to import a pending workflow after navigating', async () => {
        const router = new window.Router({
            licenseManager: {
                _mf_p_ids: [],
                checkFeatureAccess: jest.fn().mockReturnValue(true)
            },
            showToast: jest.fn()
        });

        await router.navigateTo('creator', { source: 'subtitle' });
        jest.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();

        expect(window.FeatureLoader.ensureCreator).toHaveBeenCalled();
        expect(window.creatorFlow.importPendingWorkflow).toHaveBeenCalledWith({
            navigationParams: { source: 'subtitle' }
        });
        expect(window.creatorFlow.addLocalFile).not.toHaveBeenCalled();
    });

    it('falls back to loading a raw video path when no workflow was imported', async () => {
        window.creatorFlow.importPendingWorkflow.mockResolvedValue(false);

        const router = new window.Router({
            licenseManager: {
                _mf_p_ids: [],
                checkFeatureAccess: jest.fn().mockReturnValue(true)
            },
            showToast: jest.fn()
        });

        await router.navigateTo('creator', { videoPath: 'C:/video/sample.mp4' });
        jest.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();

        expect(window.creatorFlow.addLocalFile).toHaveBeenCalledWith('C:/video/sample.mp4');
    });
});
