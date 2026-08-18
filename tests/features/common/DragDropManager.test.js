/** @jest-environment jsdom */

describe('DragDropManager', () => {
    beforeAll(() => {
        require('../../../src/features/common/DragDropManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="creator-upload-zone">
                <button id="nested-upload-target" type="button"></button>
            </div>
            <input id="video-url" />
            <button id="btn-check" type="button"></button>
        `;
        this.app = {
            router: { currentPage: 'editor' },
            switchPage: jest.fn(),
            switchMode: jest.fn(),
            showToast: jest.fn()
        };
        window.editorFlow = {
            handleFileSelect: jest.fn()
        };
        this.manager = new window.DragDropManager(this.app);
    });

    it('does not throw when a global drop lacks closest and dataTransfer', async () => {
        const event = {
            target: document.createTextNode('drop'),
            preventDefault: jest.fn(),
            stopPropagation: jest.fn()
        };

        await expect(this.manager._handleGlobalDrop(event)).resolves.toBeUndefined();

        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('does not intercept drops inside internal upload zones', async () => {
        const event = {
            target: document.getElementById('nested-upload-target'),
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            dataTransfer: {
                files: [{ name: 'clip.mp4', type: 'video/mp4' }],
                getData: jest.fn(() => '')
            }
        };

        await this.manager._handleGlobalDrop(event);

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(window.editorFlow.handleFileSelect).not.toHaveBeenCalled();
    });

    it('delegates editor media file drops to the editor flow', async () => {
        const file = { name: 'clip.mp4', type: 'video/mp4' };
        const event = {
            target: document.body,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            dataTransfer: {
                files: [file],
                getData: jest.fn(() => '')
            }
        };

        await this.manager._handleGlobalDrop(event);

        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(window.editorFlow.handleFileSelect).toHaveBeenCalledWith([file]);
    });

    it('recognizes dropped urls with surrounding whitespace', async () => {
        jest.useFakeTimers();
        const checkHandler = jest.fn();
        document.getElementById('btn-check').addEventListener('click', checkHandler);

        const event = {
            target: document.body,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            dataTransfer: {
                files: [],
                getData: jest.fn(() => ' \n https://example.com/watch?v=abc \t ')
            }
        };

        await this.manager._handleGlobalDrop(event);

        expect(this.app.switchPage).toHaveBeenCalledWith('download');
        expect(this.app.switchMode).toHaveBeenCalledWith('single');
        expect(document.getElementById('video-url').value).toBe('https://example.com/watch?v=abc');

        jest.runOnlyPendingTimers();

        expect(checkHandler).toHaveBeenCalled();
        jest.useRealTimers();
    });
});
