/** @jest-environment jsdom */

describe('HistoryEvents open folder behavior', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        window.mediaflow = {
            shell: {
                fileExists: jest.fn(),
                showItemInFolder: jest.fn(),
                openPath: jest.fn()
            }
        };

        require('../../../src/features/history/HistoryEvents.js');
    });

    afterEach(() => {
        delete window.HistoryEvents;
        delete window.i18n;
        delete window.mediaflow;
    });

    test('falls back to saveDir when the stored file path is invalid', async () => {
        const app = {
            showToast: jest.fn()
        };
        const service = {
            getResolvedPath: jest.fn(async (path) => path)
        };
        const ui = {};
        const events = new window.HistoryEvents(app, service, ui);

        window.mediaflow.shell.fileExists
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await events.openHistoryFolder({
            filePath: 'F:\\Broken\\missing.mp4',
            saveDir: 'F:\\Downloads'
        });

        expect(window.mediaflow.shell.showItemInFolder).not.toHaveBeenCalled();
        expect(window.mediaflow.shell.openPath).toHaveBeenCalledWith('F:\\Downloads');
        expect(app.showToast).not.toHaveBeenCalled();
    });

    test('shows the item in folder when the stored file path exists', async () => {
        const app = {
            showToast: jest.fn()
        };
        const service = {
            getResolvedPath: jest.fn(async (path) => path)
        };
        const ui = {};
        const events = new window.HistoryEvents(app, service, ui);

        window.mediaflow.shell.fileExists.mockResolvedValueOnce(true);

        await events.openHistoryFolder({
            filePath: 'F:\\Downloads\\done.mp4',
            saveDir: 'F:\\Downloads'
        });

        expect(window.mediaflow.shell.showItemInFolder).toHaveBeenCalledWith('F:\\Downloads\\done.mp4');
        expect(window.mediaflow.shell.openPath).not.toHaveBeenCalled();
        expect(app.showToast).not.toHaveBeenCalled();
    });

    test('opens context menu when right-clicking a text node inside a history item', () => {
        document.body.innerHTML = `
            <div class="history-item" data-index="0"><span id="history-title">Done video</span></div>
        `;
        const app = {
            showToast: jest.fn()
        };
        const service = {
            filteredHistory: [{ id: 'item-1', filePath: 'F:\\Downloads\\done.mp4' }]
        };
        const ui = {};
        const events = new window.HistoryEvents(app, service, ui);
        events.showContextMenu = jest.fn();
        events.initContextMenu();

        const textNode = document.getElementById('history-title').firstChild;
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 10,
            clientY: 20
        });

        textNode.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(events.showContextMenu).toHaveBeenCalledWith(10, 20, service.filteredHistory[0]);
    });
});
