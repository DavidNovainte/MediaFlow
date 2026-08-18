/** @jest-environment jsdom */

describe('TimelineContextMenu track menu', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        require('../../../src/features/video/timeline/core/TimelineContextMenu.js');
    });

    afterEach(() => {
        delete window.TimelineContextMenu;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    function contextEvent() {
        return {
            clientX: 24,
            clientY: 32
        };
    }

    test('delegates track menu actions without inline handlers', () => {
        const manager = {
            addTrack: jest.fn(),
            removeTrack: jest.fn()
        };

        window.TimelineContextMenu.showTrack(manager, contextEvent(), 'v2');

        let menu = document.getElementById('timeline-context-menu');
        expect(menu.querySelector('[onclick]')).toBeNull();

        menu.querySelector('[data-action="addTrack"][data-type="video"]')
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(manager.addTrack).toHaveBeenCalledWith('video', 'v2', 'above');
        expect(document.getElementById('timeline-context-menu')).toBeNull();

        window.TimelineContextMenu.showTrack(manager, contextEvent(), 'v2');
        menu = document.getElementById('timeline-context-menu');
        menu.querySelector('[data-action="removeTrack"]')
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(manager.removeTrack).toHaveBeenCalledWith('v2');
    });

    test('keeps main track removal disabled', () => {
        const manager = {
            addTrack: jest.fn(),
            removeTrack: jest.fn()
        };

        window.TimelineContextMenu.showTrack(manager, contextEvent(), 'v1');

        const menu = document.getElementById('timeline-context-menu');
        expect(menu.querySelector('[data-action="removeTrack"]')).toBeNull();
        expect(menu.textContent).toContain('Main track cannot be deleted');
    });
});
