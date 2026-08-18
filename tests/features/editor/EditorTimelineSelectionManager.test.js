/** @jest-environment jsdom */

describe('EditorTimelineSelectionManager', () => {
    const createPointerLikeEvent = (type, init = {}) => {
        const event = new Event(type, { bubbles: true });
        Object.assign(event, init);
        return event;
    };

    beforeAll(() => {
        require('../../../src/features/editor/timeline/EditorTimelineSelectionManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="editor-timeline-body" class="editor-timeline-body">
                <div class="editor-track-lane" id="lane">
                    <button class="editor-clip" data-clip-id="clip-a"></button>
                    <button class="editor-clip" data-clip-id="clip-b"></button>
                </div>
            </div>
        `;

        const body = document.getElementById('editor-timeline-body');
        const lane = document.getElementById('lane');
        const clipA = document.querySelector('[data-clip-id="clip-a"]');
        const clipB = document.querySelector('[data-clip-id="clip-b"]');

        body.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 240, width: 600, height: 240 });
        lane.getBoundingClientRect = () => ({ left: 0, top: 40, right: 600, bottom: 120, width: 600, height: 80 });
        clipA.getBoundingClientRect = () => ({ left: 40, top: 50, right: 180, bottom: 96, width: 140, height: 46 });
        clipB.getBoundingClientRect = () => ({ left: 240, top: 50, right: 360, bottom: 96, width: 120, height: 46 });
        body.setPointerCapture = jest.fn();
        body.releasePointerCapture = jest.fn();

        this.setSelectedClips = jest.fn();
        this.manager = new window.EditorTimelineSelectionManager({
            store: {
                getState: () => ({ selectedClipIds: [] }),
                setSelectedClips: this.setSelectedClips
            }
        });
        this.manager.init();
    });

    it('starts marquee selection only with shift on empty timeline space', () => {
        const lane = document.getElementById('lane');
        const plainEvent = { button: 0, shiftKey: false, target: lane };
        const shiftEvent = { button: 0, shiftKey: true, target: lane };

        expect(this.manager.shouldStartSelection(plainEvent)).toBe(false);
        expect(this.manager.shouldStartSelection(shiftEvent)).toBe(true);
    });

    it('supports text-node targets inside empty timeline space', () => {
        const lane = document.getElementById('lane');
        const label = document.createElement('span');
        label.textContent = 'empty lane';
        lane.appendChild(label);

        expect(this.manager.shouldStartSelection({
            button: 0,
            shiftKey: true,
            target: label.firstChild
        })).toBe(true);
    });

    it('collects intersecting clips while dragging a marquee', () => {
        const lane = document.getElementById('lane');
        lane.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            shiftKey: true,
            pointerId: 1,
            clientX: 20,
            clientY: 44
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            clientX: 220,
            clientY: 110
        }));

        expect(this.setSelectedClips).toHaveBeenCalledWith(['clip-a'], 'clip-a');
    });

    it('ignores move and up events from another pointer during marquee selection', () => {
        const lane = document.getElementById('lane');
        const body = document.getElementById('editor-timeline-body');
        lane.dispatchEvent(createPointerLikeEvent('pointerdown', {
            button: 0,
            shiftKey: true,
            pointerId: 1,
            clientX: 20,
            clientY: 44
        }));

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 2,
            clientX: 220,
            clientY: 110
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 2
        }));

        expect(this.manager.dragState).not.toBeNull();
        expect(this.setSelectedClips).not.toHaveBeenCalled();
        expect(body.releasePointerCapture).not.toHaveBeenCalled();

        document.dispatchEvent(createPointerLikeEvent('pointermove', {
            pointerId: 1,
            clientX: 220,
            clientY: 110
        }));
        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));

        expect(this.setSelectedClips).toHaveBeenCalledWith(['clip-a'], 'clip-a');
        expect(this.manager.dragState).toBeNull();
        expect(body.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('does not throw when pointer capture fails during marquee start', () => {
        const lane = document.getElementById('lane');
        const body = document.getElementById('editor-timeline-body');
        body.setPointerCapture = jest.fn(() => {
            throw new DOMException('InvalidStateError', 'InvalidStateError');
        });

        expect(() => {
            lane.dispatchEvent(createPointerLikeEvent('pointerdown', {
                button: 0,
                shiftKey: true,
                pointerId: 1,
                clientX: 20,
                clientY: 44
            }));
        }).not.toThrow();

        document.dispatchEvent(createPointerLikeEvent('pointerup', {
            pointerId: 1
        }));
        expect(this.manager.dragState).toBeNull();
    });
});
