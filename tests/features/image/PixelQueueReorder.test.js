/** @jest-environment jsdom */

describe('PixelFileManager reorder guards', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/image/PixelFileManager.js');
    });

    afterEach(() => {
        delete window.PixelFileManager;
    });

    test('ignores invalid drag indexes without mutating the queue', () => {
        const manager = new window.PixelFileManager({});
        manager.files = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
        manager.selectedIndex = 1;

        manager.reorderFiles(NaN, 1);
        manager.reorderFiles(3, 0);
        manager.reorderFiles(1, NaN);

        expect(manager.files.map(file => file.name)).toEqual(['a', 'b', 'c']);
        expect(manager.selectedIndex).toBe(1);
    });

    test('clamps the target index and keeps selection following the moved file', () => {
        const manager = new window.PixelFileManager({});
        manager.files = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
        manager.selectedIndex = 0;

        manager.reorderFiles(0, 99);

        expect(manager.files.map(file => file.name)).toEqual(['b', 'c', 'a']);
        expect(manager.selectedIndex).toBe(2);
    });
});

describe('PixelListRenderer drag guards', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn((key) => key) };
        require('../../../src/features/image/PixelListRenderer.js');
    });

    afterEach(() => {
        delete window.PixelListRenderer;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    test('does not reorder when a drop event has no internal source index', () => {
        document.body.innerHTML = '<div id="image-queue"></div>';
        const controller = {
            selectImage: jest.fn(),
            removeImage: jest.fn(),
            setDraggingInternal: jest.fn(),
            reorderFiles: jest.fn(),
            app: {
                ui: {
                    showConfirm: jest.fn()
                }
            }
        };
        const renderer = new window.PixelListRenderer(controller);

        renderer.render([{ path: 'C:\\Images\\a.jpg' }], 0);

        const item = document.querySelector('.queue-item[data-index="0"]');
        item.dataset.dropPos = 'after';
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
            value: { getData: jest.fn(() => '') }
        });

        item.dispatchEvent(event);

        expect(controller.reorderFiles).not.toHaveBeenCalled();
    });
});
