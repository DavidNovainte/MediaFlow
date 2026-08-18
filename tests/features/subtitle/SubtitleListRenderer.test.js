/** @jest-environment jsdom */

describe('SubtitleListRenderer text layout responsiveness', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '<div id="subtitle-list-container"></div>';

        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };

        require('../../../src/features/subtitle/SubtitleListRenderer.js');
    });

    afterEach(() => {
        delete global.ResizeObserver;
    });

    test('falls back to stacked layout when split mode panel is too narrow', () => {
        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 720
        });

        const editor = {
            viewMode: 'full',
            textLayoutMode: 'stacked'
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(container);
        renderer.applyTextLayoutMode('split');

        expect(container.classList.contains('subtitle-layout-split')).toBe(true);
        expect(container.dataset.textLayoutEffective).toBe('split');

        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 420
        });

        renderer.refreshTextLayoutMode();

        expect(container.classList.contains('subtitle-layout-split')).toBe(false);
        expect(container.classList.contains('subtitle-layout-stacked')).toBe(true);
        expect(container.dataset.textLayoutEffective).toBe('stacked');
    });

    test('uses a tighter default item height in split layout', () => {
        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 720
        });

        const editor = {
            viewMode: 'full',
            textLayoutMode: 'stacked',
            showOriginal: true,
            showTranslation: true,
            flow: {
                trackManager: { tracks: [] }
            }
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(container);

        const stackedHeight = renderer.ITEM_HEIGHT;

        renderer.applyTextLayoutMode('split');

        expect(renderer.ITEM_HEIGHT).toBeLessThan(stackedHeight);
        expect(container.style.getPropertyValue('--subtitle-item-height')).toBe(`${renderer.ITEM_CARD_HEIGHT}px`);
        expect(renderer.ITEM_CARD_HEIGHT).toBe(148);
    });

    test('uses a compact single-row height in stacked and split layouts', () => {
        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 720
        });

        const editor = {
            viewMode: 'full',
            textLayoutMode: 'stacked',
            showOriginal: true,
            showTranslation: false,
            flow: {
                trackManager: { tracks: [] }
            }
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(container);

        expect(renderer.ITEM_CARD_HEIGHT).toBe(152);

        editor.textLayoutMode = 'split';
        renderer.applyTextLayoutMode('split');

        expect(renderer.ITEM_CARD_HEIGHT).toBe(136);
    });

    test('estimates taller rows only for entries that need extra text space', () => {
        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 560
        });

        const editor = {
            viewMode: 'full',
            textLayoutMode: 'stacked',
            showOriginal: true,
            showTranslation: true,
            flow: {
                trackManager: { tracks: [] }
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || '')
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(container);
        renderer.entries = [
            {
                index: 0,
                sub: { originalText: '大哥', translatedText: 'Big brother' }
            },
            {
                index: 1,
                sub: {
                    originalText: '请不吝点赞订阅转发打赏支持明镜与点点栏目请不吝点赞订阅转发打赏支持明镜与点点栏目请不吝点赞订阅转发打赏支持明镜与点点栏目',
                    translatedText: 'Please like, subscribe, share, and reward Mingjing and Didian columns with continued support for the program and keep spreading the word to more viewers.'
                }
            }
        ];

        renderer.refreshEntryMetrics();

        expect(renderer.entryHeights[1]).toBeGreaterThan(renderer.entryHeights[0]);
    });
});

/** @jest-environment jsdom */

describe('SubtitleListRenderer virtual row identity', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="subtitle-list-container"></div>';

        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientHeight', {
            configurable: true,
            value: 1200
        });

        window.i18n = {
            t: jest.fn((key) => key),
            updateUI: jest.fn()
        };

        window.SubtitleUtils = {
            formatTime: jest.fn((time) => String(time)),
            getCPS: jest.fn(() => 1),
            getCPSLimit: jest.fn(() => 20),
            parseTime: jest.fn(() => 0)
        };

        require('../../../src/features/subtitle/SubtitleListRenderer.js');
    });

    afterEach(() => {
        jest.resetModules();
        delete window.i18n;
        delete window.SubtitleUtils;
        delete window.SubtitleListRenderer;
    });

    test('refreshes a focused recycled row when it now points to a different subtitle', () => {
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: false,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            subtitles: [],
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));

        const firstBatch = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: '' },
            { id: 'b', start: 1, end: 2, originalText: 'beta', translatedText: '' }
        ];

        editor.subtitles = firstBatch;
        renderer.render(firstBatch);

        const firstInput = renderer.listContent.querySelector('.subtitle-item[data-index="0"] .original-text');
        firstInput.focus();
        expect(document.activeElement).toBe(firstInput);
        expect(firstInput.value).toBe('alpha');

        const secondBatch = [
            { id: 'x', start: -1, end: 0, originalText: 'inserted', translatedText: '' },
            ...firstBatch
        ];

        editor.subtitles = secondBatch;
        renderer.render(secondBatch);

        const recycledFirstRow = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        const recycledInput = recycledFirstRow.querySelector('.original-text');

        expect(recycledFirstRow.dataset.subtitleId).toBe('x');
        expect(recycledInput.value).toBe('inserted');
    });

    test('marks the loop button active for the current looping subtitle', () => {
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: 1,
            subtitles: [],
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));

        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A' },
            { id: 'b', start: 1, end: 2, originalText: 'beta', translatedText: 'B' }
        ];

        editor.subtitles = subtitles;
        renderer.render(subtitles);

        const inactiveLoop = renderer.listContent.querySelector('.subtitle-item[data-index="0"] .btn-loop');
        const activeLoop = renderer.listContent.querySelector('.subtitle-item[data-index="1"] .btn-loop');

        expect(inactiveLoop.classList.contains('active')).toBe(false);
        expect(activeLoop.classList.contains('active')).toBe(true);
    });

    test('toggles secondary row actions from the more button', () => {
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            subtitles: [],
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));

        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A' }
        ];

        editor.subtitles = subtitles;
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        const moreButton = row.querySelector('.btn-more-actions');
        const deleteButton = row.querySelector('.subtitle-actions-menu .btn-delete');

        moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(row.classList.contains('actions-expanded')).toBe(true);
        expect(deleteButton).not.toBeNull();

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(row.classList.contains('actions-expanded')).toBe(false);
    });

    test('shows secondary row actions inline when the row has enough width', () => {
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            subtitles: [],
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));

        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A' }
        ];

        editor.subtitles = subtitles;
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        const timeRow = row.querySelector('.subtitle-time-row');

        Object.defineProperty(timeRow, 'clientWidth', {
            configurable: true,
            value: 240
        });
        Object.defineProperty(timeRow, 'scrollWidth', {
            configurable: true,
            get: () => (row.classList.contains('actions-inline') ? 200 : 140)
        });

        renderer.syncRowActionLayout(row);

        expect(row.classList.contains('actions-inline')).toBe(true);
    });
});

/** @jest-environment jsdom */

describe('SubtitleListRenderer review workflow', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="subtitle-list-container"></div>';

        const container = document.getElementById('subtitle-list-container');
        Object.defineProperty(container, 'clientHeight', {
            configurable: true,
            value: 1200
        });

        window.i18n = {
            t: jest.fn((key) => key),
            updateUI: jest.fn()
        };

        window.SubtitleUtils = {
            formatTime: jest.fn((time) => String(time)),
            getCPS: jest.fn(() => 1),
            getCPSLimit: jest.fn(() => 20),
            parseTime: jest.fn(() => 0),
            translateOrFallback: jest.fn((key, fallback) => fallback)
        };

        require('../../../src/features/subtitle/SubtitleListRenderer.js');
    });

    afterEach(() => {
        jest.resetModules();
        delete window.i18n;
        delete window.SubtitleUtils;
        delete window.SubtitleListRenderer;
    });

    test('renders only subtitles from the current review filter and select-all respects that filter', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'pending', selected: false, locked: false },
            { id: 'b', start: 1, end: 2, originalText: 'beta', translatedText: 'B', reviewStatus: 'approved', selected: false, locked: false }
        ];

        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles
                .map((sub, index) => ({ sub, index }))
                .filter(({ sub }) => sub.reviewStatus === 'approved')),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item');
        expect(row).not.toBeNull();
        expect(row.dataset.index).toBe('1');

        renderer.selectAll(true);

        expect(subtitles[0].selected).toBe(false);
        expect(subtitles[1].selected).toBe(true);
        expect(editor.render).toHaveBeenCalled();
    });

    test('disables row editing controls when a subtitle is locked', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'approved', selected: false, locked: true }
        ];

        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: true,
            activeSubtitleIndex: 0,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.classList.contains('is-locked')).toBe(true);
        expect(row.querySelector('.original-text').disabled).toBe(true);
        expect(row.querySelector('.translated-text').disabled).toBe(true);
        expect(row.querySelector('.tts-source-select').disabled).toBe(true);
        expect(row.querySelector('.btn-review-approve').disabled).toBe(true);
    });

    test('renders dubbing status badge only in full mode', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'approved', selected: false, locked: false, dubStatus: 'compressed' }
        ];

        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: 0,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null,
                dubAdapter: {
                    getStatusMeta: jest.fn(() => ({
                        tone: 'warning',
                        shortLabel: '压缩',
                        label: '已压缩适配'
                    }))
                }
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.querySelector('.dub-fit-badge')).not.toBeNull();
        expect(row.querySelector('.dub-fit-badge').textContent).toBe('压缩');

        editor.viewMode = 'lite';
        renderer.render(subtitles);

        const liteRow = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(liteRow.querySelector('.dub-fit-badge')).toBeNull();
    });

    test('clicking the dubbing status badge focuses the process panel instead of opening more row actions', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'approved', selected: false, locked: false, dubStatus: 'compressed' }
        ];

        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: 0,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null,
                dubAdapter: {
                    getStatusMeta: jest.fn(() => ({
                        tone: 'warning',
                        shortLabel: '压缩',
                        label: '已压缩适配'
                    }))
                },
                uiManager: {
                    settings: {
                        focusDubStatusPanel: jest.fn()
                    }
                }
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const badge = renderer.listContent.querySelector('.dub-fit-badge');
        badge.click();

        expect(editor.setActive).toHaveBeenCalledWith(0);
        expect(editor.flow.uiManager.settings.focusDubStatusPanel).toHaveBeenCalled();
    });

    test('renders only subtitle text in lite mode', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'pending', selected: false, locked: false, dubStatus: 'compressed' }
        ];

        const editor = {
            viewMode: 'lite',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: 0,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.querySelector('.subtitle-time-row')).toBeNull();
        expect(row.querySelector('.review-badge')).toBeNull();
        expect(row.querySelector('.dub-fit-badge')).toBeNull();
        expect(row.querySelector('.btn-lock-subtitle')).toBeNull();
        expect(row.querySelector('.subtitle-select-checkbox')).toBeNull();
    });

    test('rebuilds existing rows when switching from full mode to lite mode', () => {
        const subtitles = [
            { id: 'a', start: 0, end: 1, originalText: 'alpha', translatedText: 'A', reviewStatus: 'pending', selected: false, locked: false }
        ];

        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: 0,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: { tracks: [] },
                qualityHandler: null
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const container = document.getElementById('subtitle-list-container');
        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(container);
        renderer.render(subtitles);

        let row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.querySelector('.subtitle-time-row')).not.toBeNull();

        editor.viewMode = 'lite';
        container.classList.add('editor-lite-mode');
        renderer.render(subtitles);

        row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.dataset.renderMode).toBe('lite');
        expect(row.querySelector('.subtitle-time-row')).toBeNull();
        expect(row.querySelector('.btn-lock-subtitle')).toBeNull();
    });

    test('delegates subtitle row actions without inline handlers', () => {
        const subtitles = [
            { id: 's1', start: 0, end: 2, originalText: 'alpha', translatedText: 'A', reviewStatus: 'pending', selected: false, locked: false }
        ];
        const qualityHandler = {
            getErrorsByIndex: jest.fn(() => [{ type: 'overlap', message: 'Overlap' }]),
            fixOverlap: jest.fn()
        };
        const audioActionHandler = {
            previewClip: jest.fn()
        };
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: true,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            subtitles,
            flow: {
                trackManager: {
                    tracks: [{
                        id: 'A1',
                        type: 'audio',
                        visible: true,
                        subtitles: [{ originId: 's1', start: 0, end: 1.25 }]
                    }]
                },
                qualityHandler,
                audioActionHandler
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn(),
            playSubtitle: jest.fn(),
            loopSubtitle: jest.fn(),
            previewTts: jest.fn(),
            setReviewStatus: jest.fn(),
            setTtsSource: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(subtitles);

        const row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.innerHTML).not.toContain('onclick=');
        expect(row.innerHTML).not.toContain('onchange=');

        row.querySelector('[data-subtitle-action="preview-tts"]').click();
        row.querySelector('[data-subtitle-action="play"]').click();
        row.querySelector('[data-subtitle-action="loop"]').click();
        row.querySelector('[data-subtitle-action="set-review-status"][data-review-status="approved"]').click();
        row.querySelector('[data-subtitle-action="preview-audio"]').click();
        row.querySelector('[data-subtitle-action="qc-fix"]').click();

        const ttsSelect = row.querySelector('.tts-source-select');
        ttsSelect.value = 'translated';
        ttsSelect.dispatchEvent(new Event('change', { bubbles: true }));

        expect(editor.previewTts).toHaveBeenCalledWith(0);
        expect(editor.playSubtitle).toHaveBeenCalledWith(0);
        expect(editor.loopSubtitle).toHaveBeenCalledWith(0);
        expect(editor.setReviewStatus).toHaveBeenCalledWith(0, 'approved');
        expect(audioActionHandler.previewClip).toHaveBeenCalledWith('A1', 0);
        expect(qualityHandler.fixOverlap).toHaveBeenCalledWith(0);
        expect(editor.setTtsSource).toHaveBeenCalledWith(0, 'translated');
    });

    test('removes stale audio preview when a recycled row points to a subtitle without audio', () => {
        const firstSubtitle = { id: 'with-audio', start: 0, end: 2, originalText: 'alpha', translatedText: 'A', reviewStatus: 'pending', selected: false, locked: false };
        const secondSubtitle = { id: 'no-audio', start: 2, end: 4, originalText: 'beta', translatedText: 'B', reviewStatus: 'pending', selected: false, locked: false };
        const editor = {
            viewMode: 'full',
            showOriginal: true,
            showTranslation: true,
            showTtsSourceSelector: false,
            activeSubtitleIndex: -1,
            loopingSubtitleIndex: -1,
            subtitles: [firstSubtitle],
            flow: {
                trackManager: {
                    tracks: [{
                        id: 'A1',
                        type: 'audio',
                        visible: true,
                        subtitles: [{ originId: 'with-audio', start: 0, end: 1.5 }]
                    }]
                },
                qualityHandler: null
            },
            normalizeSubtitles: jest.fn((items) => items),
            getFilteredSubtitleEntries: jest.fn(() => editor.subtitles.map((sub, index) => ({ sub, index }))),
            getOriginalText: jest.fn((sub) => sub.originalText || ''),
            getTranslatedText: jest.fn((sub) => sub.translatedText || ''),
            updateSubtitleText: jest.fn(),
            setActive: jest.fn(),
            addToHistory: jest.fn()
        };

        const renderer = new window.SubtitleListRenderer(editor);
        renderer.init(document.getElementById('subtitle-list-container'));
        renderer.render(editor.subtitles);

        let row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.querySelector('.subtitle-audio-preview')).not.toBeNull();

        editor.subtitles = [secondSubtitle];
        renderer.render(editor.subtitles);

        row = renderer.listContent.querySelector('.subtitle-item[data-index="0"]');
        expect(row.dataset.subtitleId).toBe('no-audio');
        expect(row.querySelector('.subtitle-audio-preview')).toBeNull();
    });
});
