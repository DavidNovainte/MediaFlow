/** @jest-environment jsdom */

describe('SettingsFlow engine list rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn((key) => key) };
        window.app = {};
        window.mediaflow = {
            shell: {
                openExternal: jest.fn()
            }
        };

        require('../../../src/features/settings/SettingsFlow.js');
    });

    afterEach(() => {
        delete window.SettingsFlow;
        delete window.i18n;
        delete window.app;
        delete window.mediaflow;
        document.body.innerHTML = '';
    });

    test('escapes engine metadata and keeps update buttons clickable', () => {
        document.body.innerHTML = '<div id="engine-list-container"></div>';
        const flow = new window.SettingsFlow(window.app);
        flow.elements = {
            engineContainer: document.getElementById('engine-list-container')
        };
        flow.performEngineUpdate = jest.fn();
        const key = 'engine"><img src=x onerror=alert(1)>';

        flow.renderEngineList({
            [key]: {
                name: 'Bad <Engine>',
                version: '1.0"><img src=x>',
                installed: false,
                updateMethod: 'auto'
            }
        }, {
            [key]: '2.0"><svg onload=alert(1)>'
        });

        const container = flow.elements.engineContainer;
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(container.textContent).toContain('Bad <Engine>');
        expect(container.textContent).toContain('1.0"><img src=x>');

        container.querySelector('[data-engine-update]').click();
        expect(flow.performEngineUpdate).toHaveBeenCalledWith(key);
    });

    test('binds manual engine links without inline onclick handlers', () => {
        document.body.innerHTML = '<div id="engine-list-container"></div>';
        const flow = new window.SettingsFlow(window.app);
        flow.elements = {
            engineContainer: document.getElementById('engine-list-container')
        };

        flow.renderEngineList({
            ffmpeg: {
                name: 'FFmpeg',
                version: '6.0',
                installed: true,
                updateMethod: 'manual'
            }
        });

        const button = flow.elements.engineContainer.querySelector('[data-external-url]');
        expect(button.getAttribute('onclick')).toBeNull();

        button.click();
        expect(window.mediaflow.shell.openExternal).toHaveBeenCalledWith('https://ffmpeg.org/download.html');
    });
});
