/** @jest-environment jsdom */

describe('EditorTimelinePlayheadManager', () => {
    const createPointerEvent = (clientX, init = {}) => {
        const event = new Event('pointerdown', { bubbles: true });
        event.button = 0;
        event.clientX = clientX;
        event.pointerId = 1;
        Object.entries(init).forEach(([key, value]) => {
            event[key] = value;
        });
        return event;
    };

    const defineSize = (element, { clientWidth, offsetWidth, scrollWidth }) => {
        Object.defineProperty(element, 'clientWidth', {
            configurable: true,
            value: clientWidth
        });
        Object.defineProperty(element, 'offsetWidth', {
            configurable: true,
            value: offsetWidth ?? clientWidth
        });
        Object.defineProperty(element, 'scrollWidth', {
            configurable: true,
            value: scrollWidth ?? clientWidth
        });
    };

    beforeAll(() => {
        require('../../../src/features/editor/timeline/EditorTimelinePlayheadManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="editor-timeline-body" id="editor-timeline-body">
                <div id="playhead-target"></div>
            </div>
        `;

        this.setPlayheadTime = jest.fn();
        this.flow = {
            store: {
                setPlayheadTime: this.setPlayheadTime
            },
            timelineSelectionManager: {
                shouldStartSelection: jest.fn(() => false)
            }
        };
        this.manager = new window.EditorTimelinePlayheadManager(this.flow);
        this.body = document.getElementById('editor-timeline-body');
        this.target = document.getElementById('playhead-target');
        this.target.setPointerCapture = jest.fn();
        this.target.releasePointerCapture = jest.fn();
    });

    it('uses the rendered target width instead of overflowed scroll width when seeking from the ruler', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1160 });
        this.target.getBoundingClientRect = () => ({ left: 403, top: 0, right: 1523, bottom: 30, width: 1120, height: 30 });

        this.manager.attachTarget(this.target, 20);
        this.target.dispatchEvent(createPointerEvent(643));

        expect(this.setPlayheadTime).toHaveBeenCalledWith(expect.closeTo((240 / 1120) * 20, 5));
        expect(this.target.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('does not double-count the scroll offset for horizontally scrolled timeline clicks', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1120 });
        this.body.scrollLeft = 500;
        this.target.getBoundingClientRect = () => ({ left: -397, top: 0, right: 723, bottom: 80, width: 1120, height: 80 });

        this.manager.attachTarget(this.target, 20);
        this.target.dispatchEvent(createPointerEvent(203));

        expect(this.setPlayheadTime).toHaveBeenCalledWith(expect.closeTo((600 / 1120) * 20, 5));
    });

    it('ignores stray pointermove events from a different pointer while handling a click', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1120 });
        this.target.getBoundingClientRect = () => ({ left: 403, top: 0, right: 1523, bottom: 30, width: 1120, height: 30 });

        this.manager.attachTarget(this.target, 20);
        this.target.dispatchEvent(createPointerEvent(643));

        const strayMove = new Event('pointermove', { bubbles: true });
        strayMove.clientX = 9999;
        strayMove.pointerId = 2;
        document.dispatchEvent(strayMove);

        expect(this.setPlayheadTime).toHaveBeenCalledTimes(1);

        const pointerUp = new Event('pointerup', { bubbles: true });
        pointerUp.pointerId = 1;
        document.dispatchEvent(pointerUp);

        expect(this.target.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('does not throw when pointer capture fails on click', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1120 });
        this.target.getBoundingClientRect = () => ({ left: 403, top: 0, right: 1523, bottom: 30, width: 1120, height: 30 });
        this.target.setPointerCapture = jest.fn(() => {
            throw new DOMException('InvalidStateError', 'InvalidStateError');
        });

        this.manager.attachTarget(this.target, 20);

        expect(() => {
            this.target.dispatchEvent(createPointerEvent(643));
        }).not.toThrow();
        expect(this.setPlayheadTime).toHaveBeenCalledWith(expect.closeTo((240 / 1120) * 20, 5));
    });

    it('ignores pointerdown events that bubble from a timeline clip', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1120 });
        this.target.getBoundingClientRect = () => ({ left: 403, top: 0, right: 1523, bottom: 80, width: 1120, height: 80 });
        const clip = document.createElement('button');
        clip.className = 'editor-clip';
        this.target.appendChild(clip);

        this.manager.attachTarget(this.target, 20);
        clip.dispatchEvent(createPointerEvent(643));

        expect(this.setPlayheadTime).not.toHaveBeenCalled();
        expect(this.target.setPointerCapture).not.toHaveBeenCalled();
    });

    it('keeps using the pointerdown geometry when the clicked lane is rerendered mid-gesture', () => {
        defineSize(this.target, { clientWidth: 1120, scrollWidth: 1120 });
        let isDetached = false;
        this.target.getBoundingClientRect = () => (isDetached
            ? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
            : { left: 403, top: 0, right: 1523, bottom: 30, width: 1120, height: 30 });

        this.manager.attachTarget(this.target, 20);
        this.target.dispatchEvent(createPointerEvent(643));

        defineSize(this.target, { clientWidth: 0, offsetWidth: 0, scrollWidth: 0 });
        isDetached = true;

        const moveEvent = new Event('pointermove', { bubbles: true });
        moveEvent.clientX = 700;
        moveEvent.pointerId = 1;
        document.dispatchEvent(moveEvent);

        expect(this.setPlayheadTime).toHaveBeenLastCalledWith(expect.closeTo(((700 - 403) / 1120) * 20, 5));
        expect(this.setPlayheadTime).not.toHaveBeenLastCalledWith(20);
    });
});