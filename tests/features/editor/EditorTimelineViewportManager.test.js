/** @jest-environment jsdom */

describe('EditorTimelineViewportManager', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineZoomOptimizer');
        require('../../../src/features/editor/timeline/EditorTimelineViewportManager');
    });

    beforeEach(() => {
        this.resizeObserverCallback = null;
        const testContext = this;
        global.ResizeObserver = class ResizeObserver {
            constructor(callback) {
                this.callback = callback;
                this.observe = jest.fn((target) => {
                    this.target = target;
                    testContext.resizeObserverCallback = callback;
                });
                this.disconnect = jest.fn();
            }
        };
    });

    afterEach(() => {
        this.manager?.destroy?.();
        delete global.ResizeObserver;
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-editor">
                <div class="editor-timeline-body" id="editor-timeline-body"></div>
                <button id="btn-editor-fit-timeline" type="button"></button>
                <button id="btn-editor-toggle-snap" type="button"></button>
                <input id="editor-timeline-zoom" type="range" min="25" max="400" step="5" value="100">
                <div id="editor-timeline-zoom-value"></div>
                <div id="editor-timeline-ruler"></div>
            </section>
        `;

        window.app = { showToast: jest.fn() };
        this.store = new window.EditorProjectStore();
        this.manager = new window.EditorTimelineViewportManager({
            store: this.store,
            app: { router: { currentPage: 'editor' } },
            playbackManager: { isPlaying: false },
            renderCurrentState: jest.fn()
        });
        this.manager.init();
    });

    it('renders the snap toggle as active by default', () => {
        this.manager.render(this.store.getState());

        const button = document.getElementById('btn-editor-toggle-snap');
        // Compact icon-only toolbar: no visible 吸附开/关 label text
        expect(button.classList.contains('is-active')).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.getAttribute('aria-label')).toBe('时间线吸附已开启 · 快捷键 N');
        expect(button.title).toBe('时间线吸附已开启 · 快捷键 N');
    });

    it('toggles timeline snapping from the toolbar button', () => {
        const button = document.getElementById('btn-editor-toggle-snap');
        button.click();

        expect(this.store.getState().timelineSnapEnabled).toBe(false);
        expect(window.app.showToast).toHaveBeenCalledWith('时间线吸附已关闭', 'info');

        this.manager.render(this.store.getState());
        expect(button.classList.contains('is-active')).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(button.getAttribute('aria-label')).toBe('时间线吸附已关闭 · 快捷键 N');
        expect(button.title).toBe('时间线吸附已关闭 · 快捷键 N');
    });

    it('fits the timeline against the visible lane width and resets horizontal scroll', () => {
        const body = document.getElementById('editor-timeline-body');
        body.style.setProperty('--editor-track-label-width', '96px');
        body.style.setProperty('--editor-track-gap', '8px');
        body.style.setProperty('--editor-timeline-body-padding-inline', '12px');
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 800 });
        body.scrollLeft = 180;

        this.store.upsertAssets([{ id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 30 }]);
        this.store.addAssetToTimeline('asset-video');

        document.getElementById('btn-editor-fit-timeline').click();
        this.manager.render(this.store.getState());

        expect(this.store.getState().timelineZoom).toBe(40);
        expect(this.store.getState().timelineZoomMode).toBe('fit');
        expect(body.scrollLeft).toBe(0);
    });

    it('scrolls the timeline horizontally only on explicit horizontal intent', () => {
        const body = document.getElementById('editor-timeline-body');
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(body, 'scrollWidth', { configurable: true, value: 1200 });
        Object.defineProperty(body, 'clientHeight', { configurable: true, value: 240 });
        Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 240 });
        body.scrollLeft = 0;

        body.dispatchEvent(new WheelEvent('wheel', {
            deltaY: 160,
            shiftKey: true,
            bubbles: true,
            cancelable: true
        }));

        expect(body.scrollLeft).toBe(160);
        expect(body.style.getPropertyValue('--editor-timeline-scroll-left')).toBe('160px');
    });

    it('maps plain vertical mouse-wheel movement to horizontal timeline scrolling when there is no vertical overflow', () => {
        const body = document.getElementById('editor-timeline-body');
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(body, 'scrollWidth', { configurable: true, value: 1200 });
        Object.defineProperty(body, 'clientHeight', { configurable: true, value: 180 });
        Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 180 });
        body.scrollLeft = 40;

        const event = new WheelEvent('wheel', {
            deltaY: 160,
            bubbles: true,
            cancelable: true
        });

        body.dispatchEvent(event);

        expect(body.scrollLeft).toBe(200);
        expect(event.defaultPrevented).toBe(true);
        expect(body.style.getPropertyValue('--editor-timeline-scroll-left')).toBe('200px');
    });

    it('keeps plain vertical wheel scrolling native when the timeline has vertical overflow', () => {
        const body = document.getElementById('editor-timeline-body');
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(body, 'scrollWidth', { configurable: true, value: 1200 });
        Object.defineProperty(body, 'clientHeight', { configurable: true, value: 180 });
        Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 480 });
        body.scrollLeft = 40;

        const event = new WheelEvent('wheel', {
            deltaY: 160,
            bubbles: true,
            cancelable: true
        });

        body.dispatchEvent(event);

        expect(body.scrollLeft).toBe(40);
        expect(event.defaultPrevented).toBe(false);
    });

    it('preserves vertical scroll position during render updates', () => {
        const body = document.getElementById('editor-timeline-body');
        body.scrollTop = 132;

        this.manager.render(this.store.getState());

        expect(body.scrollTop).toBe(132);
    });

    it('expands the locked gutter mask as horizontal scroll increases', () => {
        const body = document.getElementById('editor-timeline-body');

        expect(body.style.getPropertyValue('--editor-timeline-scroll-left')).toBe('0px');

        body.scrollLeft = 180;
        body.dispatchEvent(new Event('scroll'));

        expect(body.style.getPropertyValue('--editor-timeline-scroll-left')).toBe('180px');
    });

    it('refreshes the editor after the timeline body becomes visible', () => {
        const body = document.getElementById('editor-timeline-body');
        const requestAnimationFrameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback();
            return 1;
        });

        this.resizeObserverCallback?.([
            {
                target: body,
                contentRect: { width: 645, height: 136 }
            }
        ]);

        expect(this.manager.flow.renderCurrentState).toHaveBeenCalled();
        requestAnimationFrameSpy.mockRestore();
    });
});
