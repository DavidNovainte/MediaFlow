/** @jest-environment jsdom */

describe('CreatorUIManager editor entry button', () => {
    beforeAll(() => {
        require('../../../src/features/video/CreatorUIManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-creator">
                <div id="view-single-tool"></div>
                <div id="creator-upload-zone"></div>
                <div id="batch-panel"></div>
                <div id="creator-video-info"></div>
                <div id="creator-quick-tools"></div>
                <div id="creator-timeline-container"></div>
                <button id="btn-creator-select-media"></button>
                <input id="creator-video-file" />
                <div id="creator-single-view"></div>
                <div id="creator-batch-view"></div>
                <button id="creator-btn-toggle-inspector"></button>
                <button id="btn-toggle-creator-mode"></button>
                <button id="btn-creator-export-dialog"></button>
                <div id="inspector-guide-quick"></div>
                <div id="inspector-guide-edit"></div>
            </section>
        `;

        window.i18n = {
            t: jest.fn(key => key),
            updateUI: jest.fn()
        };

        window.DialogManager = class {
            constructor() {}
            showProgress() {}
            updateProgress() {}
            hideProgress() {}
            showInputDialog() {}
            askConfirm() {}
            askFolderPath() {}
        };
        window.InspectorManager = class {
            constructor() {}
            init() {}
            focusTool() {}
            syncButtonState() {}
            showOnlySections() {}
            showAllSections() {}
        };
        window.QuickToolsRenderer = class {
            constructor() {}
            render() {}
            renderInInspector() {}
            updateToolState() {}
        };
        window.ToolSettingsManager = class {
            constructor() {}
            init() {}
            showProperties() {}
            updateCropUIFromMedia() {}
            updateClipInputs() {}
        };
        window.CreatorExportManager = class {
            constructor() {}
            init() {}
        };
    });

    it('routes the refine button into the standalone editor page', () => {
        const flow = {
            app: {
                navigateTo: jest.fn()
            },
            videoFile: {
                name: 'sample.mp4',
                path: 'C:/video/sample.mp4',
                type: 'video/mp4'
            },
            audioFile: null,
            showToast: jest.fn()
        };

        const manager = new window.CreatorUIManager(flow);
        manager.cacheElements();
        manager.setupModeToggle();
        manager.setMode('quick');

        expect(document.getElementById('btn-toggle-creator-mode').textContent).toContain('打开精修');
        expect(document.getElementById('btn-toggle-creator-mode').textContent).not.toContain('creator.mode.openEditor');

        document.getElementById('btn-toggle-creator-mode').click();

        expect(flow.app.navigateTo).toHaveBeenCalledWith('editor', expect.objectContaining({
            source: 'creator',
            videoPath: 'C:/video/sample.mp4',
            mediaFile: flow.videoFile
        }));
    });

    it('closes the floating transition preview through delegated controls', () => {
        document.getElementById('page-creator').insertAdjacentHTML('beforeend', `
            <div id="batch-merge-transition-preview-floating" class="preview-float-window">
                <div class="preview-float-header">
                    <button class="btn-close-preview" type="button"><span>x</span></button>
                </div>
            </div>
        `);
        const manager = new window.CreatorUIManager({
            app: {},
            videoFile: null,
            audioFile: null
        });
        manager.cacheElements();
        manager.setupFloatingPreviewControls();

        document.querySelector('.btn-close-preview span').click();

        expect(document.getElementById('batch-merge-transition-preview-floating').classList.contains('hidden')).toBe(true);
    });
});
