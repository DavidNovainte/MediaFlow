/** @jest-environment jsdom */

describe('TranslationManager API key row rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/common/TranslationManager.js');
    });

    afterEach(() => {
        delete window.TranslationManager;
        document.body.innerHTML = '';
    });

    test('escapes saved key values before injecting dynamic rows', () => {
        document.body.innerHTML = '<div id="groq-keys-container"></div>';
        const manager = new window.TranslationManager({});
        const key = 'bad"><img src=x onerror=alert(1)>';
        const placeholder = 'ph"><svg onload=alert(1)>';

        manager.addApiKeyRow('groq-keys-container', 'groq-key"><img', key, placeholder);

        const container = document.getElementById('groq-keys-container');
        const input = container.querySelector('input');
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(input.value).toBe(key);
        expect(input.placeholder).toBe(placeholder);
    });
});
