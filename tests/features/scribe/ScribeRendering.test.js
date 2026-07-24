/** @jest-environment jsdom */

describe('ScribeUIManager rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/scribe/ScribeUIManager.js');
    });

    afterEach(() => {
        delete window.ScribeUIManager;
        delete window.app;
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    test('renders transcript and translation text without interpreting user content as HTML', () => {
        document.body.innerHTML = `
            <div id="transcript-text"></div>
            <div id="transcript-translation" class="hidden">
                <div id="translation-text"></div>
            </div>
        `;

        const app = {
            currentVersion: 'original',
            rawSegments: [{
                start: 'not-a-number',
                speaker: 'Speaker "A" <lead>',
                text: '<img src=x onerror=alert(1)> hello & goodbye'
            }],
            polishedSegments: [],
            translations: ['translated <svg onload=alert(1)> & text']
        };
        const ui = new window.ScribeUIManager(app);

        ui.render();

        expect(document.querySelector('#transcript-text img')).toBeNull();
        expect(document.querySelector('#translation-text svg')).toBeNull();
        expect(document.querySelector('.segment-text').textContent).toContain('<img src=x onerror=alert(1)>');
        expect(document.querySelector('.speaker-label').textContent).toBe('[Speaker "A" <lead>]');
        expect(document.querySelector('.timestamp').textContent).toBe('[0:00]');
        expect(document.getElementById('transcript-translation').classList.contains('hidden')).toBe(false);
    });

    test('keeps diff highlighting while escaping changed polished text', () => {
        document.body.innerHTML = '<div id="transcript-text"></div><div id="transcript-translation"></div>';

        const app = {
            currentVersion: 'polished',
            rawSegments: [{ start: 1, text: 'hello world' }],
            polishedSegments: [{ start: 1, text: 'hello <world>' }],
            translations: []
        };
        const ui = new window.ScribeUIManager(app);

        ui.render();

        expect(document.querySelector('#transcript-text img')).toBeNull();
        expect(document.querySelector('.diff-add')).not.toBeNull();
        expect(document.querySelector('.segment-text').textContent).toBe('hello <world>');
    });

    test('delegates transcript segment actions without inline handlers', () => {
        document.body.innerHTML = '<div id="transcript-text"></div><div id="transcript-translation"></div>';
        window.app = { showToast: jest.fn() };

        const app = {
            currentVersion: 'original',
            rawSegments: [
                { start: 12.5, speaker: 'Speaker "A"', text: 'first' },
                { start: 14, speaker: '', text: 'second' }
            ],
            polishedSegments: [],
            translations: [],
            mediaPlayer: { seek: jest.fn() }
        };
        const ui = new window.ScribeUIManager(app);
        ui.speakerManager = {
            getSpeakerColor: jest.fn(() => 'var(--accent-primary)'),
            renameSpeaker: jest.fn()
        };

        ui.render();

        const container = document.getElementById('transcript-text');
        expect(container.querySelector('[onclick]')).toBeNull();

        container.querySelector('.speaker-label').click();
        expect(ui.speakerManager.renameSpeaker).toHaveBeenCalledWith('Speaker "A"');

        container.querySelector('.timestamp').click();
        expect(app.mediaPlayer.seek).toHaveBeenCalledWith(12.5);

        container.querySelector('.btn-delete-segment').click();
        expect(app.rawSegments).toHaveLength(1);
        expect(app.rawSegments[0].text).toBe('second');

        delete window.app;
    });
});

describe('ScribeAIHandler summary formatting', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/scribe/ScribeAIHandler.js');
    });

    afterEach(() => {
        delete window.ScribeAIHandler;
        document.body.innerHTML = '';
    });

    test('preserves supported markdown while escaping AI-provided HTML', () => {
        const handler = new window.ScribeAIHandler({});
        const html = handler._formatSummary('### <Title>\n- item <img src=x>\n**bold & safe**');

        document.body.innerHTML = html;

        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('.summary-section-title').textContent).toBe('<Title>');
        expect(document.querySelector('strong').textContent).toBe('bold & safe');
        expect(document.body.textContent).toContain('item <img src=x>');
    });
});

describe('ScribeSettingsManager token controls', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/scribe/ScribeSettingsManager.js');
    });

    afterEach(() => {
        delete window.ScribeSettingsManager;
        document.body.innerHTML = '';
    });

    test('toggles the Hugging Face token field without inline handlers', () => {
        document.body.innerHTML = `
            <input id="hf-token" type="password" />
            <button id="btn-toggle-token" type="button">eye</button>
        `;
        const manager = new window.ScribeSettingsManager({});

        manager.bindTokenVisibilityToggle();
        document.getElementById('btn-toggle-token').click();

        expect(document.getElementById('hf-token').type).toBe('text');
        expect(document.getElementById('btn-toggle-token').getAttribute('aria-pressed')).toBe('true');

        document.getElementById('btn-toggle-token').click();

        expect(document.getElementById('hf-token').type).toBe('password');
        expect(document.getElementById('btn-toggle-token').getAttribute('aria-pressed')).toBe('false');
    });
});

describe('ScribeTranslator result rendering', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        window.ScribeService = {
            getLanguageName: jest.fn((lang) => `Language ${lang}`)
        };
        require('../../../src/features/scribe/ScribeTranslator.js');
    });

    afterEach(() => {
        delete window.ScribeTranslator;
        delete window.ScribeService;
        delete window.i18n;
        document.body.innerHTML = '';
    });

    test('escapes translated text and uses delegated result actions', () => {
        document.body.innerHTML = '<div id="batch-translation-results" class="hidden"></div>';
        const translator = new window.ScribeTranslator({ segments: [] });
        translator.downloadAllTranslationsZip = jest.fn();
        translator.copyTranslationText = jest.fn();
        translator.downloadTranslation = jest.fn();

        translator.showBatchTranslationResults({
            en: '[0]<img src=x onerror=alert(1)> hello',
            'zh-CN': '[0]safe text'
        });

        const container = document.getElementById('batch-translation-results');
        expect(container.classList.contains('hidden')).toBe(false);
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('<img src=x onerror=alert(1)> hello');
        expect(container.querySelector('[onclick]')).toBeNull();

        container.querySelector('[data-action="download-all-translations"]').click();
        container.querySelector('[data-action="copy-translation"][data-lang="en"]').click();
        container.querySelector('[data-action="download-translation"][data-lang="zh-CN"]').click();

        expect(translator.downloadAllTranslationsZip).toHaveBeenCalledTimes(1);
        expect(translator.copyTranslationText).toHaveBeenCalledWith('en');
        expect(translator.downloadTranslation).toHaveBeenCalledWith('zh-CN');
    });
});
