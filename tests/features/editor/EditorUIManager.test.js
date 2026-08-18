/** @jest-environment jsdom */

describe('EditorUIManager', () => {
    const createPointerLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, init);
        return event;
    };

    beforeAll(() => {
        require('../../../src/features/editor/ui/EditorUIManager');
    });

    beforeEach(() => {
        window.localStorage.clear();
        document.body.innerHTML = `
            <section id="page-editor">
                <button id="btn-editor-import"></button>
                <button id="btn-editor-back-to-creator"></button>
                <input id="editor-file-input" type="file">
                <div id="editor-asset-list"></div>
                <div id="editor-assets-count"></div>
                <div id="editor-project-name"></div>
                <div id="editor-project-meta"></div>
                <div id="editor-project-status"></div>
            </section>
        `;

        this.flow = {
            handleFileSelect: jest.fn(),
            app: { navigateTo: jest.fn() },
            store: {
                getTrackIdsByType: jest.fn(() => []),
                getTrackMeta: jest.fn(() => null),
                getTrackControl: jest.fn(() => ({})),
                getTrackNameForKind: jest.fn(() => 'v1'),
                getState: jest.fn(() => ({ playheadTime: 0 })),
                getAssetById: jest.fn(() => null),
                isTrackLocked: jest.fn(() => false),
                selectAsset: jest.fn(),
                insertAssetAtTime: jest.fn()
            }
        };

        this.manager = new window.EditorUIManager(this.flow);
        this.manager.init();
    });

    it('clears the file input after processing a selection', () => {
        const fileInput = document.getElementById('editor-file-input');
        const files = [{ name: 'clip.mp4', path: 'C:/video/clip.mp4', type: 'video/mp4' }];
        Object.defineProperty(fileInput, 'files', {
            configurable: true,
            value: files
        });
        Object.defineProperty(fileInput, 'value', {
            configurable: true,
            writable: true,
            value: 'C:/video/clip.mp4'
        });

        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        expect(this.flow.handleFileSelect).toHaveBeenCalledWith(files);
        expect(fileInput.value).toBe('');
    });

    it('resizes and saves the vertical preview-to-timeline layout from the splitter', () => {
        document.body.innerHTML = `
            <section id="page-editor">
                <button id="btn-editor-import"></button>
                <button id="btn-editor-back-to-creator"></button>
                <input id="editor-file-input" type="file">
                <div id="editor-asset-list"></div>
                <div id="editor-assets-count"></div>
                <div id="editor-project-name"></div>
                <div id="editor-project-meta"></div>
                <div id="editor-project-status"></div>
                <div class="editor-shell-grid">
                    <div class="editor-work-area"></div>
                    <div id="editor-layout-resizer"></div>
                    <div class="editor-timeline-shell"></div>
                </div>
            </section>
        `;
        const grid = document.querySelector('.editor-shell-grid');
        const resizer = document.getElementById('editor-layout-resizer');
        const timelineShell = document.querySelector('.editor-timeline-shell');
        Object.defineProperty(grid, 'clientHeight', {
            configurable: true,
            value: 900
        });
        grid.getBoundingClientRect = () => ({ height: 900 });
        resizer.getBoundingClientRect = () => ({ height: 10 });
        timelineShell.getBoundingClientRect = () => ({ height: 360 });

        const flow = {
            ...this.flow,
            timelineManager: { updatePlayheadOverlay: jest.fn() },
            timelineViewportManager: {
                syncLockedGutterMask: jest.fn(),
                scheduleLayoutRefresh: jest.fn()
            },
            renderCurrentState: jest.fn()
        };
        const manager = new window.EditorUIManager(flow);
        manager.init();

        resizer.dispatchEvent(createPointerLikeEvent('pointerdown', { clientY: 500, pointerId: 1 }));
        document.dispatchEvent(createPointerLikeEvent('pointermove', { clientY: 440, pointerId: 1 }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', { clientY: 440, pointerId: 1 }));

        expect(grid.style.getPropertyValue('--editor-timeline-shell-height')).toBe('420px');
        expect(window.localStorage.getItem('mediaflow.editor.timelineHeight')).toBe('420');
        expect(flow.timelineManager.updatePlayheadOverlay).toHaveBeenCalled();
        expect(flow.timelineViewportManager.scheduleLayoutRefresh).toHaveBeenCalled();
        expect(flow.renderCurrentState).toHaveBeenCalled();
    });

    it('supports keyboard resizing on the vertical layout splitter', () => {
        document.body.innerHTML = `
            <section id="page-editor">
                <button id="btn-editor-import"></button>
                <button id="btn-editor-back-to-creator"></button>
                <input id="editor-file-input" type="file">
                <div id="editor-asset-list"></div>
                <div id="editor-assets-count"></div>
                <div id="editor-project-name"></div>
                <div id="editor-project-meta"></div>
                <div id="editor-project-status"></div>
                <div class="editor-shell-grid">
                    <div class="editor-work-area"></div>
                    <div id="editor-layout-resizer"></div>
                    <div class="editor-timeline-shell"></div>
                </div>
            </section>
        `;
        const grid = document.querySelector('.editor-shell-grid');
        const resizer = document.getElementById('editor-layout-resizer');
        const timelineShell = document.querySelector('.editor-timeline-shell');
        Object.defineProperty(grid, 'clientHeight', {
            configurable: true,
            value: 900
        });
        grid.getBoundingClientRect = () => ({ height: 900 });
        resizer.getBoundingClientRect = () => ({ height: 10 });
        timelineShell.getBoundingClientRect = () => ({ height: 360 });

        const flow = {
            ...this.flow,
            timelineManager: { updatePlayheadOverlay: jest.fn() },
            timelineViewportManager: {
                syncLockedGutterMask: jest.fn(),
                scheduleLayoutRefresh: jest.fn()
            },
            renderCurrentState: jest.fn()
        };
        const manager = new window.EditorUIManager(flow);
        manager.init();

        resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));

        expect(grid.style.getPropertyValue('--editor-timeline-shell-height')).toBe('384px');
        expect(window.localStorage.getItem('mediaflow.editor.timelineHeight')).toBe('384');
        expect(resizer.getAttribute('aria-valuenow')).toBe('384');
    });

    it('adds a compact asset-card insert action that inserts at the playhead', () => {
        const asset = { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 };
        this.flow.store.getState.mockReturnValue({ playheadTime: 7.25 });
        this.flow.store.getAssetById.mockReturnValue(asset);
        this.flow.store.insertAssetAtTime.mockReturnValue({ id: 'clip-1' });

        this.manager.renderAssets({
            assets: [asset],
            selectedAssetId: null
        });

        const action = document.querySelector('.editor-asset-inline-action');
        expect(action).toBeTruthy();
        expect(action.getAttribute('aria-label')).toBe('在播放头加入时间线');

        action.click();

        expect(this.flow.store.selectAsset).toHaveBeenCalledWith('asset-video');
        // Third arg is preferred track id (null = auto)
        expect(this.flow.store.insertAssetAtTime).toHaveBeenCalledWith('asset-video', 7.25, null);
    });
});
