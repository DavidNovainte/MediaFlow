/** @jest-environment jsdom */

describe('MobileFlowUIManager dynamic rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = {
            t: jest.fn((key) => ({
                'mobile.history.openFolder': 'Open folder',
                'mobile.history.statusSaved': 'Saved',
                'mobile.history.statusQueued': 'Queued'
            }[key] || key))
        };
        window.mediaflow = {
            shell: {
                showItemInFolder: jest.fn()
            }
        };

        require('../../../src/features/mobile/MobileFlowUIManager.js');
    });

    afterEach(() => {
        delete window.MobileFlowUIManager;
        delete window.i18n;
        delete window.mediaflow;
        document.body.innerHTML = '';
    });

    test('renders received files without interpreting file metadata as HTML', () => {
        document.body.innerHTML = '<div id="pending-urls-list"><div class="empty-hint"></div></div>';
        const ui = new window.MobileFlowUIManager({});
        const filePath = 'C:\\Downloads\\bad"><img src=x onerror=alert(1)>.mp4';
        const fileName = 'bad"><img src=x onerror=alert(1)>.mp4';

        ui.addFileToHistory({ name: fileName, path: filePath });

        const list = document.getElementById('pending-urls-list');
        expect(list.querySelector('.empty-hint')).toBeNull();
        expect(list.querySelector('img')).toBeNull();
        expect(list.querySelector('.file-name').textContent).toBe(fileName);

        list.querySelector('.btn-open-folder').click();
        expect(window.mediaflow.shell.showItemInFolder).toHaveBeenCalledWith(filePath);
    });

    test('renders received links and QR codes without unsafe HTML string injection', () => {
        document.body.innerHTML = `
            <div id="pending-urls-list"></div>
            <div id="mobile-qr-code"></div>
        `;
        const ui = new window.MobileFlowUIManager({});
        const url = 'https://example.com/watch?q=<img src=x onerror=alert(1)>';

        ui.addToPendingList(url);
        ui.renderQRCode('data:image/png;base64,AAAA');

        expect(document.querySelector('#pending-urls-list img')).toBeNull();
        expect(document.querySelector('.pending-url').textContent).toContain('<img src=x');
        expect(document.querySelector('.pending-status').textContent).toBe('Queued');
        expect(document.querySelector('#mobile-qr-code img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    });
});
