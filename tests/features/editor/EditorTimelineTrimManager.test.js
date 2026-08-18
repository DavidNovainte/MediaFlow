/** @jest-environment jsdom */

describe('EditorTimelineTrimManager', () => {
    const createPointerLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true });
        Object.entries(init).forEach(([key, value]) => {
            if (key === 'target') return;
            event[key] = value;
        });
        return event;
    };

    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineSnapUtils');
        require('../../../src/features/editor/timeline/EditorTimelineTrimManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="editor-timeline-body" id="editor-timeline-body">
                <div class="editor-track-lane" id="lane">
                    <button id="clip-block" type="button">
                        <span id="trim-start"></span>
                    </button>
                </div>
            </div>
        `;

        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 }
        ]);
        this.clip = this.store.addAssetToTimeline('asset-video');
        this.timelineBody = document.getElementById('editor-timeline-body');
        this.lane = document.getElementById('lane');
        this.handle = document.getElementById('trim-start');
        this.timelineBody.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 100, width: 1200, height: 100 });
        this.lane.dataset.trackId = 'v1';
        this.lane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 80, width: 1200, height: 80 });
        this.handle.setPointerCapture = jest.fn();
        this.handle.releasePointerCapture = jest.fn();

        this.manager = new window.EditorTimelineTrimManager({
            store: this.store
        });
        this.manager.attachHandle(this.handle, this.clip, 12, 'start');
    });

    it('ignores trim move and up events from a different pointer', () => {
        this.handle.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            target: this.handle
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 2,
            clientX: 240
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 2
        }));

        expect(this.manager.trimState).not.toBeNull();
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(0);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        expect(this.manager.trimState).toBeNull();
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(0);
    });

    it('does not throw when pointer capture fails during trim start', () => {
        this.handle.setPointerCapture = jest.fn(() => {
            throw new DOMException('InvalidStateError', 'InvalidStateError');
        });

        expect(() => {
            this.handle.dispatchEvent(createPointerLikeEvent('pointerdown', {
                button: 0,
                pointerId: 1,
                clientX: 0,
                target: this.handle
            }));
        }).not.toThrow();

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 1,
            clientX: 240
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        expect(this.manager.trimState).toBeNull();
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(2.4);
    });

    it('auto-scrolls the timeline while trimming near the viewport edge', () => {
        Object.defineProperty(this.timelineBody, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(this.timelineBody, 'scrollWidth', { configurable: true, value: 1500 });
        this.timelineBody.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100 });

        this.handle.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            pointerId: 1,
            clientX: 0,
            target: this.handle
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 1,
            clientX: 496
        }));

        expect(this.timelineBody.scrollLeft).toBeGreaterThan(0);
        expect(this.timelineBody.style.getPropertyValue('--editor-timeline-scroll-left')).toBe(`${this.timelineBody.scrollLeft}px`);
        expect(this.store.getState().timeline.video[0].timelineStart).toBeGreaterThan(496 / 100);

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));
    });
});
