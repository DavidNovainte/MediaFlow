/** @jest-environment jsdom */

describe('SubtitleUISettings dubbing inspector panel', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <select id="translation-engine"><option value="groq">Groq</option></select>
            <select id="dub-adaptation-mode"><option value="off">off</option><option value="balanced" selected>balanced</option><option value="preserve">preserve</option></select>
            <div class="subtitle-main-layout"></div>
            <div id="dub-adaptation-mode-hint"></div>
            <div id="dub-adaptation-advanced"></div>
            <div id="dub-status-panel" data-state="neutral"></div>
            <div id="dub-status-title"></div>
            <div id="dub-status-description"></div>
            <div id="dub-status-duration"></div>
            <div id="dub-status-borrow"></div>
            <div id="dub-status-ratio"></div>
            <div id="dub-status-segmentation"></div>
            <div id="dub-status-source"></div>
            <div id="dub-status-adapted"></div>
            <input type="checkbox" id="dub-auto-compress" checked />
            <input type="checkbox" id="dub-auto-speedup" checked />
            <input type="checkbox" id="dub-allow-gap-extension" checked />
            <div id="fixed-translation-list"></div>
        `;

        window.i18n = { t: jest.fn((key) => key) };
        require('../../../src/features/subtitle/ui/SubtitleUIBase.js');
        require('../../../src/features/subtitle/ui/SubtitleUISettings.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.SubtitleUIBase;
        delete window.SubtitleUISettings;
    });

    test('renders active subtitle dubbing details in the process panel', () => {
        const flow = {
            preferenceManager: { get: jest.fn(() => []) },
            editor: {
                activeSubtitleIndex: 0,
                subtitles: [{ translatedText: 'Original line', dubText: 'Short dub line', dubStatus: 'compressed', dubTiming: { originalDuration: 1.4, availableDuration: 1.7, borrowedGap: 0.3, estimatedRatio: 1.12 } }]
            },
            dubAdapter: {
                getInspectorState: jest.fn(() => ({
                    hasSubtitle: true,
                    title: '已压缩适配',
                    description: '系统已缩短译文以贴近当前时间窗。',
                    tone: 'warning',
                    sourceText: 'Original line',
                    dubText: 'Short dub line',
                    durationText: '1.40s -> 1.70s',
                    borrowText: '0.30s',
                    ratioText: '1.12x',
                    segmentText: '当前已拆成 2 段语音，句内预留 0.12s 停顿。'
                }))
            }
        };

        const settings = new window.SubtitleUISettings(flow);
        settings.updateDubAdaptationUI();

        expect(document.getElementById('dub-status-panel').style.display).toBe('grid');
        expect(document.getElementById('dub-status-panel').dataset.state).toBe('warning');
        expect(document.getElementById('dub-status-title').textContent).toBe('已压缩适配');
        expect(document.getElementById('dub-status-adapted').textContent).toBe('Short dub line');
        expect(document.getElementById('dub-status-ratio').textContent).toBe('1.12x');
        expect(document.getElementById('dub-status-segmentation').textContent).toContain('2 段语音');
        expect(document.getElementById('dub-adaptation-mode-hint').textContent).toContain('Default mode');
    });

    test('scopes shared progress ids to the subtitle page', () => {
        document.body.innerHTML = `
            <section id="page-download">
                <div id="progress-overlay" class="hidden"></div>
                <div id="progress-title">download</div>
                <div id="progress-text">download</div>
                <div id="progress-fill" style="width: 33%;"></div>
            </section>
            <section id="page-subtitle">
                <div id="progress-overlay" class="hidden"></div>
                <div id="progress-title">subtitle</div>
                <div id="progress-text">subtitle</div>
                <div id="progress-fill" style="width: 0%;"></div>
            </section>
        `;

        const base = new window.SubtitleUIBase({
            getRoot: () => document.getElementById('page-subtitle')
        });
        base.showProgress('Subtitle Job', 'Working');
        base.updateProgress(42, 'Working');

        expect(document.querySelector('#page-download #progress-title').textContent).toBe('download');
        expect(document.querySelector('#page-download #progress-fill').style.width).toBe('33%');
        expect(document.querySelector('#page-subtitle #progress-title').innerText).toBe('Subtitle Job');
        expect(document.querySelector('#page-subtitle #progress-fill').style.width).toBe('42%');
    });

    test('keeps a visible guidance card when dubbing adaptation is off', () => {
        document.getElementById('dub-adaptation-mode').value = 'off';

        const flow = {
            preferenceManager: { get: jest.fn(() => []) },
            editor: {
                activeSubtitleIndex: -1,
                subtitles: []
            },
            dubAdapter: {
                getInspectorState: jest.fn()
            }
        };

        const settings = new window.SubtitleUISettings(flow);
        settings.updateDubAdaptationUI();

        expect(document.getElementById('dub-status-panel').style.display).toBe('grid');
        expect(document.getElementById('dub-status-title').textContent).toBe('Dubbing adaptation is off');
        expect(document.getElementById('dub-status-duration').textContent).toBe('Disabled');
        expect(document.getElementById('dub-status-adapted').textContent).toContain('Switch to Balanced or Strict mode');
        expect(document.getElementById('dub-status-segmentation').textContent).toContain('split into multiple speech segments');
        expect(flow.dubAdapter.getInspectorState).not.toHaveBeenCalled();
    });

    test('focuses the dubbing panel by switching to the process tab and pulsing the card', () => {
        const scrollIntoView = jest.fn();
        document.getElementById('dub-status-panel').scrollIntoView = scrollIntoView;

        const flow = {
            preferenceManager: { get: jest.fn(() => []) },
            editor: {
                activeSubtitleIndex: 0,
                subtitles: [{ translatedText: 'Original line', dubText: 'Short dub line', dubStatus: 'compressed', dubTiming: { originalDuration: 1.4, availableDuration: 1.7, borrowedGap: 0.3, estimatedRatio: 1.12 } }]
            },
            dubAdapter: {
                getInspectorState: jest.fn(() => ({
                    hasSubtitle: true,
                    title: '已压缩适配',
                    description: '系统已缩短译文以贴近当前时间窗。',
                    tone: 'warning',
                    sourceText: 'Original line',
                    dubText: 'Short dub line',
                    durationText: '1.40s -> 1.70s',
                    borrowText: '0.30s',
                    ratioText: '1.12x',
                    segmentText: '当前按单段配音，未额外拆分语音片段。'
                }))
            },
            uiManager: {
                activateTab: jest.fn(),
                persistInspectorState: jest.fn()
            }
        };

        const settings = new window.SubtitleUISettings(flow);
        settings.focusDubStatusPanel();

        expect(flow.uiManager.activateTab).toHaveBeenCalledWith('tab-process');
        expect(flow.uiManager.persistInspectorState).toHaveBeenCalledWith({ inspectorVisible: true });
        expect(document.getElementById('dub-status-panel').classList.contains('dub-status-panel-pulse')).toBe(true);
        expect(scrollIntoView).toHaveBeenCalled();
    });

    test('locks compression and speed toggles in preserve mode', () => {
        document.getElementById('dub-adaptation-mode').value = 'preserve';

        const flow = {
            preferenceManager: { get: jest.fn(() => []) },
            editor: {
                activeSubtitleIndex: 0,
                subtitles: [{ translatedText: 'Original line', dubText: 'Original line', dubStatus: 'preserve-meaning', dubTiming: { originalDuration: 1.4, availableDuration: 1.4, borrowedGap: 0, estimatedRatio: 1.24 } }]
            },
            dubAdapter: {
                getInspectorState: jest.fn(() => ({
                    hasSubtitle: true,
                    title: '保留原意优先',
                    description: '这句明显超长，系统不会再强行压缩或快放，而是按自然语速生成更长配音。',
                    tone: 'warning',
                    sourceText: 'Original line',
                    dubText: 'Original line',
                    durationText: '1.40s -> 1.40s',
                    borrowText: '0.00s',
                    ratioText: '1.24x',
                    segmentText: '当前按单段配音，未额外拆分语音片段。'
                }))
            }
        };

        const settings = new window.SubtitleUISettings(flow);
        settings.updateDubAdaptationUI();

        expect(document.getElementById('dub-adaptation-mode-hint').textContent).toContain('Preserve meaning first');
        expect(document.getElementById('dub-auto-compress').checked).toBe(false);
        expect(document.getElementById('dub-auto-compress').disabled).toBe(true);
        expect(document.getElementById('dub-auto-speedup').checked).toBe(false);
        expect(document.getElementById('dub-auto-speedup').disabled).toBe(true);
    });
});
