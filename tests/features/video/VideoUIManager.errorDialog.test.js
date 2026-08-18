/** @jest-environment jsdom */

require('../../../src/features/video/VideoUIManager');

describe('VideoUIManager error dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.app = { showToast: jest.fn() };
        window.i18n = { t: jest.fn((key) => key) };
    });

    it('closes the error details dialog from the close button', () => {
        const ui = new window.VideoUIManager({ core: {} });
        ui.showErrorDetails('Title', 'Summary', 'Details');

        const overlay = document.getElementById('creator-error-details-overlay');
        expect(overlay).not.toBeNull();

        overlay.querySelector('[data-role="close"]').click();
        expect(document.getElementById('creator-error-details-overlay')).toBeNull();
    });

    it('routes the visible watermark button to the controller', () => {
        document.body.innerHTML = '<button id="btn-start-watermark" type="button"></button>';
        const controller = { core: {}, addWatermark: jest.fn() };
        const ui = new window.VideoUIManager(controller);

        ui.init();
        document.getElementById('btn-start-watermark').click();

        expect(controller.addWatermark).toHaveBeenCalledTimes(1);
    });

    it('routes legacy separate and merged export buttons to smart clip modes', () => {
        document.body.innerHTML = `
            <button id="btn-export-separate-pro" type="button"></button>
            <button id="btn-export-merged-pro" type="button"></button>
        `;
        const controller = { core: {}, smartClip: jest.fn() };
        const ui = new window.VideoUIManager(controller);

        ui.init();
        document.getElementById('btn-export-separate-pro').click();
        document.getElementById('btn-export-merged-pro').click();

        expect(controller.smartClip).toHaveBeenNthCalledWith(1, { merge: false });
        expect(controller.smartClip).toHaveBeenNthCalledWith(2, { merge: true });
    });

    it('toggles image watermark controls and stores the selected image path', async () => {
        document.body.innerHTML = `
            <label><input type="radio" name="watermark-type" value="text" checked></label>
            <label><input id="watermark-type-image" type="radio" name="watermark-type" value="image"></label>
            <div id="watermark-text-options"></div>
            <div id="watermark-image-options" class="hidden" style="display: none;"></div>
            <button id="btn-select-watermark-image" type="button"></button>
            <div id="watermark-image-path" data-path=""></div>
        `;
        window.mediaflow = {
            dialog: {
                openFile: jest.fn().mockResolvedValue('C:\\Media\\logo.png')
            }
        };
        const ui = new window.VideoUIManager({ core: {} });

        ui.init();
        expect(document.getElementById('watermark-image-options').style.display).toBe('none');

        const imageType = document.getElementById('watermark-type-image');
        imageType.checked = true;
        imageType.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.getElementById('watermark-text-options').style.display).toBe('none');
        expect(document.getElementById('watermark-image-options').style.display).toBe('flex');

        document.getElementById('btn-select-watermark-image').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(window.mediaflow.dialog.openFile).toHaveBeenCalledWith(expect.objectContaining({
            properties: ['openFile']
        }));
        expect(document.getElementById('watermark-image-path').dataset.path).toBe('C:\\Media\\logo.png');
        expect(document.getElementById('watermark-image-path').textContent).toBe('logo.png');
    });
});
