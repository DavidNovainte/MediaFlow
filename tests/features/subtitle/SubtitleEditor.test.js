/** @jest-environment jsdom */

describe('SubtitleEditor history baseline tracking', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '<div id="subtitle-list-container"></div>';

        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.app = {
            showToast: jest.fn()
        };

        window.SubtitleListRenderer = class {
            constructor() {
                this.init = jest.fn();
                this.render = jest.fn();
                this.scrollToIndex = jest.fn();
                this.applyTextLayoutMode = jest.fn();
                this.refreshTextLayoutMode = jest.fn();
            }
        };

        window.SubtitleEditorActionHandler = class {
            constructor() {}
        };

        require('../../../src/features/subtitle/SubtitleEditor.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.app;
        delete window.SubtitleListRenderer;
        delete window.SubtitleEditorActionHandler;
        delete window.SubtitleEditor;
    });

    test('skips duplicate baseline snapshots but captures dirty inline edits', () => {
        const track = { id: 'main', name: 'Main', subtitles: [], history: [], historyIndex: -1 };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);
        editor.subtitles = [{ id: 's1', text: 'hello', originalText: 'hello', translatedText: '' }];

        editor.addToHistory();
        expect(track.history).toHaveLength(1);

        editor.ensureHistoryBaseline();
        expect(track.history).toHaveLength(1);

        editor.updateSubtitleText(0, 'updated', '');
        expect(track.historyDirty).toBe(true);

        editor.ensureHistoryBaseline();
        expect(track.history).toHaveLength(2);
        expect(track.historyDirty).toBe(false);
    });

    test('manual subtitle renders are synced back to the active subtitle track', () => {
        const track = { id: 'main', name: 'Main', type: 'main', subtitles: [], history: [], historyIndex: -1 };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);
        editor.render([{ id: 'manual-1', start: 0, end: 2, originalText: '手动字幕', translatedText: '', text: '手动字幕' }]);

        expect(track.subtitles).toHaveLength(1);
        expect(track.subtitles[0].id).toBe('manual-1');
        expect(editor.subtitles).toBe(track.subtitles);
    });

    test('shows the TTS source selector by default and migrates legacy subtitles to translated preference', () => {
        const track = { id: 'main', name: 'Main', type: 'main', subtitles: [], history: [], historyIndex: -1 };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleUtils.js');
        const editor = new window.SubtitleEditor(flow);
        editor.render([{ id: 's1', start: 0, end: 1, originalText: '原文', translatedText: 'English line', text: '原文\nEnglish line' }]);

        expect(editor.showTtsSourceSelector).toBe(true);
        expect(editor.subtitles[0].ttsSourceUserSet).toBe(false);
        expect(editor.subtitles[0].ttsSource).toBe('translated');
    });

    test('editing subtitle text does not auto-generate TTS and still persists to the active track', () => {
        jest.useFakeTimers();

        const subtitle = { id: 's1', text: 'old', originalText: 'old', translatedText: '' };
        const track = { id: 'main', name: 'Main', type: 'main', subtitles: [subtitle], history: [], historyIndex: -1 };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);
        editor.subtitles = [subtitle];

        editor.updateSubtitleText(0, 'new manual text', '');
        jest.advanceTimersByTime(6000);

        expect(track.subtitles[0].originalText).toBe('new manual text');
        expect(flow.autoUpdateSubtitleTTS).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    test('persists and applies text layout mode changes', () => {
        const layoutButton = document.createElement('button');
        const badge = document.createElement('span');
        badge.className = 'toolbar-mode-badge';
        layoutButton.appendChild(badge);
        const flow = {
            btnToggleTextLayout: layoutButton,
            preferenceManager: { set: jest.fn() },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', name: 'Main', subtitles: [], history: [], historyIndex: -1 }]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);

        editor.setTextLayoutMode('split');

        expect(editor.textLayoutMode).toBe('split');
        expect(editor.renderer.applyTextLayoutMode).toHaveBeenCalledWith('split');
        expect(flow.preferenceManager.set).toHaveBeenCalledWith('textLayoutMode', 'split');
        expect(layoutButton.classList.contains('active')).toBe(true);
        expect(layoutButton.dataset.layoutLabel).toBe('subtitle.editor.layout_label_split');
        expect(badge.textContent).toBe('subtitle.editor.layout_label_split');
    });

    test('Alt+L toggles the text layout mode', () => {
        const layoutButton = document.createElement('button');
        const badge = document.createElement('span');
        badge.className = 'toolbar-mode-badge';
        layoutButton.appendChild(badge);
        const flow = {
            btnToggleTextLayout: layoutButton,
            preferenceManager: { set: jest.fn() },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', name: 'Main', subtitles: [], history: [], historyIndex: -1 }]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };
        window.app.router = { currentPage: 'subtitle' };

        const editor = new window.SubtitleEditor(flow);
        editor.init('subtitle-list-container');

        document.dispatchEvent(new KeyboardEvent('keydown', {
            altKey: true,
            key: 'l',
            bubbles: true
        }));

        expect(editor.textLayoutMode).toBe('split');
        expect(flow.preferenceManager.set).toHaveBeenCalledWith('textLayoutMode', 'split');
    });

    test('editor display cycle button updates its own mode without changing the timeline display mode', () => {
        const displayButton = document.createElement('button');
        const badge = document.createElement('span');
        badge.className = 'toolbar-mode-badge';
        displayButton.appendChild(badge);
        const flow = {
            btnCycleDisplayMode: displayButton,
            preferenceManager: { set: jest.fn() },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', name: 'Main', subtitles: [], history: [], historyIndex: -1 }]
            },
            timeline: {
                displayMode: 'translated',
                render: jest.fn(),
                updateToggleUI: jest.fn()
            },
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);

        editor.cycleDisplayMode();

        expect(flow.timeline.displayMode).toBe('translated');
        expect(flow.updateSubtitlePreview).not.toHaveBeenCalled();
        expect(flow.preferenceManager.set).toHaveBeenCalledWith('editorDisplayMode', 'bilingual');
        expect(displayButton.dataset.displayMode).toBe('bilingual');
        expect(badge.textContent).toBe('双语');
    });

    test('applies a remembered editor display mode without persisting again', () => {
        const displayButton = document.createElement('button');
        const badge = document.createElement('span');
        badge.className = 'toolbar-mode-badge';
        displayButton.appendChild(badge);
        const flow = {
            btnCycleDisplayMode: displayButton,
            preferenceManager: { set: jest.fn() },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', name: 'Main', subtitles: [], history: [], historyIndex: -1 }]
            },
            timeline: null,
            updateSubtitlePreview: jest.fn(),
            triggerAutoSave: jest.fn(),
            autoUpdateSubtitleTTS: jest.fn()
        };

        const editor = new window.SubtitleEditor(flow);

        editor.setDisplayMode('original', { persist: false, announce: false });

        expect(editor.showOriginal).toBe(true);
        expect(editor.showTranslation).toBe(false);
        expect(flow.preferenceManager.set).not.toHaveBeenCalled();
        expect(displayButton.dataset.displayMode).toBe('original');
        expect(badge.textContent).toBe('原文');
    });
});