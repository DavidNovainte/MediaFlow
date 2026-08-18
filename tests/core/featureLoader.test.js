/** @jest-environment jsdom */

describe('FeatureLoader.ensureEnhance', () => {
    beforeEach(() => {
        jest.resetModules();
        document.head.innerHTML = '';
        delete window.EnhanceFlow;
        delete window.EnhanceFlowClass;
        delete window.FeatureLoader;
        delete window.ScriptLoader;

        require('../../src/utils/scriptLoader');
        require('../../src/core/featureLoader');
    });

    test('ensureEnhance loads scripts then constructs EnhanceFlowClass', async () => {
        // Stub ScriptLoader to avoid real network/script tags
        window.ScriptLoader.loadScripts = jest.fn().mockImplementation(async () => {
            class FakeEnhance {
                constructor() {
                    this.ready = true;
                }
                init() {
                    this.inited = true;
                }
                addFiles() {}
            }
            window.EnhanceFlowClass = FakeEnhance;
        });

        const flow = await window.FeatureLoader.ensureEnhance();
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalled();
        expect(flow).toBeTruthy();
        expect(flow.ready).toBe(true);
        expect(typeof flow.init).toBe('function');

        // Second call is cache hit
        const again = await window.FeatureLoader.ensureEnhance();
        expect(again).toBe(flow);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledTimes(1);
    });

    test('ensureEnhance returns existing instance without reload', async () => {
        window.EnhanceFlow = { init: jest.fn(), addFiles: jest.fn() };
        window.ScriptLoader.loadScripts = jest.fn();

        const flow = await window.FeatureLoader.ensureEnhance();
        expect(flow).toBe(window.EnhanceFlow);
        expect(window.ScriptLoader.loadScripts).not.toHaveBeenCalled();
    });

    test('ensureEditor loads scripts, constructs EditorFlow, and inits once', async () => {
        delete window.editorFlow;
        delete window.EditorFlow;

        window.ScriptLoader.loadScripts = jest.fn().mockImplementation(async () => {
            class FakeEditor {
                constructor(app) {
                    this.app = app;
                }
                async init() {
                    this.inited = true;
                }
                renderCurrentState() {}
            }
            window.EditorFlow = FakeEditor;
        });

        const app = { id: 'app-1' };
        const flow = await window.FeatureLoader.ensureEditor(app);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledWith(
            expect.arrayContaining(['features/editor/EditorFlow.js'])
        );
        expect(flow).toBeTruthy();
        expect(flow.app).toBe(app);
        expect(flow.inited).toBe(true);
        expect(flow._featureLoaderInited).toBe(true);
        expect(window.editorFlow).toBe(flow);
        expect(app.editorFlow).toBe(flow);

        const again = await window.FeatureLoader.ensureEditor(app);
        expect(again).toBe(flow);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledTimes(1);
    });

    test('ensureSubtitle loads scripts, constructs SubtitleFlow, and inits once', async () => {
        delete window.subtitleFlow;
        delete window.SubtitleFlow;
        window.TranslationService = { ready: true };

        window.ScriptLoader.loadScripts = jest.fn().mockImplementation(async () => {
            class FakeSubtitle {
                constructor(app) {
                    this.app = app;
                }
                async init() {
                    this.inited = true;
                }
                async loadVideo() {}
            }
            window.SubtitleFlow = FakeSubtitle;
        });

        const app = { id: 'app-sub' };
        const flow = await window.FeatureLoader.ensureSubtitle(app);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledWith(
            expect.arrayContaining([
                'features/subtitle/SubtitleFlow.js',
                'features/subtitle/TTSConfig.js'
            ])
        );
        expect(flow).toBeTruthy();
        expect(flow.app).toBe(app);
        expect(flow.inited).toBe(true);
        expect(flow._featureLoaderInited).toBe(true);
        expect(window.subtitleFlow).toBe(flow);
        expect(app.subtitleFlow).toBe(flow);

        const again = await window.FeatureLoader.ensureSubtitle(app);
        expect(again).toBe(flow);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledTimes(1);
    });

    test('ensureCreator loads scripts, constructs CreatorFlow, and inits once', async () => {
        delete window.creatorFlow;
        delete window.CreatorFlow;

        window.ScriptLoader.loadScripts = jest.fn().mockImplementation(async () => {
            class FakeCreator {
                constructor(app) {
                    this.app = app;
                }
                async init() {
                    this.inited = true;
                }
                handleFileSelect() {}
            }
            window.CreatorFlow = FakeCreator;
        });

        const app = { id: 'app-creator' };
        const flow = await window.FeatureLoader.ensureCreator(app);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledWith(
            expect.arrayContaining([
                'features/video/CreatorFlow.js',
                'features/video/export/CreatorExportPlanner.js'
            ])
        );
        expect(flow).toBeTruthy();
        expect(flow.app).toBe(app);
        expect(flow.inited).toBe(true);
        expect(flow._featureLoaderInited).toBe(true);
        expect(window.creatorFlow).toBe(flow);
        expect(app.creatorFlow).toBe(flow);

        const again = await window.FeatureLoader.ensureCreator(app);
        expect(again).toBe(flow);
        expect(window.ScriptLoader.loadScripts).toHaveBeenCalledTimes(1);
    });
});
