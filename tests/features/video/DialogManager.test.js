/** @jest-environment jsdom */

describe('DialogManager', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = {
            t: jest.fn((key) => key)
        };
        require('../../../src/features/video/ui/DialogManager.js');
    });

    afterEach(() => {
        delete window.DialogManager;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    test('escapes input dialog text while preserving input values', async () => {
        const manager = new window.DialogManager({});
        const promise = manager.showInputDialog(
            'Rename <img src=x onerror=alert(1)>',
            'placeholder "><svg onload=alert(1)>',
            'default "><script>alert(1)</script>'
        );

        const overlay = document.body.firstElementChild;
        const input = overlay.querySelector('#input-dialog-value');

        expect(overlay.querySelector('img')).toBeNull();
        expect(overlay.querySelector('svg')).toBeNull();
        expect(overlay.querySelector('script')).toBeNull();
        expect(overlay.textContent).toContain('Rename <img src=x onerror=alert(1)>');
        expect(input.placeholder).toBe('placeholder "><svg onload=alert(1)>');
        expect(input.value).toBe('default "><script>alert(1)</script>');

        input.value = 'confirmed';
        overlay.querySelector('#input-dialog-confirm').click();

        await expect(promise).resolves.toBe('confirmed');
        expect(document.body.firstElementChild).toBeNull();
    });
});
