/** @jest-environment jsdom */

describe('SubtitleTrackManager batch state restore', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <div id="tracks-list"></div>
            <div id="subtitle-editor-panel"></div>
        `;

        window.i18n = {
            t: jest.fn((key, params) => {
                if (key === 'subtitle.messages.mainTrack') return 'Main';
                if (key === 'subtitle.messages.trackTypes.defaultTrackName') return `Track ${params?.n ?? 1}`;
                return key;
            })
        };

        require('../../../src/features/subtitle/SubtitleTrackManager.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.SubtitleTrackManager;
    });

    test('restores full cached track state including non-main tracks', () => {
        const flow = {
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: { cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))), applyStyleToUI: jest.fn() },
            audioManager: { syncTracks: jest.fn() },
            updateSubtitlePreview: jest.fn()
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();

        const restored = manager.restoreBatchState({
            activeTrackId: 'sub2',
            tracks: [
                {
                    id: 'main1',
                    name: 'Main',
                    type: 'main',
                    subtitles: [{ id: 's1', text: 'main', start: 0, end: 1 }],
                    visible: true,
                    locked: false,
                    color: '#111111',
                    style: { fontSize: 32 },
                    ttsAudioPath: null,
                    ttsGenerated: false
                },
                {
                    id: 'sub2',
                    name: 'Secondary',
                    type: 'subtitle',
                    subtitles: [{ id: 's2', text: 'secondary', start: 1, end: 2 }],
                    visible: true,
                    locked: false,
                    color: '#222222',
                    style: { fontSize: 40 },
                    ttsAudioPath: null,
                    ttsGenerated: false
                }
            ]
        });

        expect(restored).toBe(true);
        expect(manager.tracks).toHaveLength(2);
        expect(manager.activeTrackId).toBe('sub2');
        expect(flow.editor.render).toHaveBeenCalledWith([{ id: 's2', text: 'secondary', start: 1, end: 2 }]);
        expect(flow.styleManager.applyStyleToUI).toHaveBeenCalled();
        expect(flow.audioManager.syncTracks).toHaveBeenCalled();
    });

    test('removing the active track does not render the track list twice', () => {
        const flow = {
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: { cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))), applyStyleToUI: jest.fn() },
            audioManager: { syncTracks: jest.fn() }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();
        manager.tracks = [
            { id: 'first', name: 'First', type: 'main', subtitles: [], visible: true, locked: false, color: '#111', style: { fontSize: 32 }, history: [], historyIndex: -1 },
            { id: 'second', name: 'Second', type: 'subtitle', subtitles: [], visible: true, locked: false, color: '#222', style: { fontSize: 28 }, history: [], historyIndex: -1 }
        ];
        manager.activeTrackId = 'first';

        const renderTracksSpy = jest.spyOn(manager, 'renderTracks');

        manager.removeTrack('first');

        expect(manager.activeTrackId).toBe('second');
        expect(renderTracksSpy).toHaveBeenCalledTimes(1);
        expect(flow.editor.render).toHaveBeenCalledWith([]);
    });

    test('adding a subtitle track renders the track list once', () => {
        const flow = {
            currentStyle: { fontSize: 28 },
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: {
                cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))),
                applyStyleToUI: jest.fn()
            },
            audioManager: { syncTracks: jest.fn() }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();

        const renderTracksSpy = jest.spyOn(manager, 'renderTracks');

        manager.addTrack('Secondary', 'subtitle');

        expect(manager.activeTrackId).toBe(manager.tracks[0].id);
        expect(renderTracksSpy).toHaveBeenCalledTimes(1);
        expect(flow.editor.render).toHaveBeenCalledWith([]);
    });

    test('renders compact embedded track chips into the shared header track list', () => {
        document.body.innerHTML = `
            <div class="embedded-tracks-toolbar"><div id="tracks-list" class="embedded-tracks-list"></div></div>
            <div id="subtitle-editor-panel"></div>
        `;

        const flow = {
            currentStyle: { fontSize: 28 },
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: {
                cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))),
                applyStyleToUI: jest.fn()
            },
            audioManager: { syncTracks: jest.fn() }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();
        manager.tracks = [
            { id: 'main', name: 'Main', type: 'main', subtitles: [], visible: true, locked: false, color: '#111', style: { fontSize: 32 }, history: [], historyIndex: -1 },
            { id: 'alt', name: 'Alt', type: 'subtitle', subtitles: [], visible: true, locked: false, color: '#222', style: { fontSize: 28 }, history: [], historyIndex: -1 }
        ];
        manager.activeTrackId = 'main';

        manager.renderTracks();

        // Product UI is a compact track picker dropdown (not per-track chips)
        const items = document.querySelectorAll('#tracks-list .track-dropdown-item');
        expect(items).toHaveLength(2);
        expect(items[0].classList.contains('is-active')).toBe(true);
        expect(document.querySelector('#tracks-list [data-track-action="remove"]')).not.toBeNull();
        expect(flow.audioManager.syncTracks).toHaveBeenCalled();
    });

    test('collapses to a single compact chip when only one track exists', () => {
        document.body.innerHTML = `
            <div class="embedded-tracks-toolbar"><div id="tracks-list" class="embedded-tracks-list"></div></div>
            <div id="subtitle-editor-panel"></div>
        `;

        const flow = {
            currentStyle: { fontSize: 28 },
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: {
                cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))),
                applyStyleToUI: jest.fn()
            },
            audioManager: { syncTracks: jest.fn() }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();
        manager.tracks = [
            { id: 'main', name: 'Main', type: 'main', subtitles: [], visible: true, locked: false, color: '#111', style: { fontSize: 32 }, history: [], historyIndex: -1 }
        ];
        manager.activeTrackId = 'main';

        manager.renderTracks();

        const tracksList = document.getElementById('tracks-list');
        const toolbar = document.querySelector('.embedded-tracks-toolbar');

        expect(tracksList.classList.contains('track-list-single')).toBe(true);
        expect(toolbar.classList.contains('single-track-mode')).toBe(true);
        expect(tracksList.querySelector('[data-track-action="remove"]')).toBeNull();
        expect(tracksList.querySelectorAll('.track-dropdown-item')).toHaveLength(1);
    });

    test('maps batch TTS clips to their real generated timeline offsets', () => {
        const flow = {
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: { cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))), applyStyleToUI: jest.fn() },
            audioManager: { syncTracks: jest.fn() },
            timeline: { render: jest.fn() },
            ttsHandler: {
                getSubtitleSpeechText: jest.fn((sub) => sub.translatedText || sub.originalText || sub.text)
            }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();

        manager.addAudioTrackFromTTS({
            path: 'out.mp3',
            clips: [
                { id: 's1', duration: 2.4, startInFull: 0, endInFull: 2.4 },
                { id: 's2', duration: 1.8, startInFull: 2.4, endInFull: 4.2 }
            ]
        }, [
            { id: 's1', start: 0, end: 1, originalText: '原文1', translatedText: 'English 1' },
            { id: 's2', start: 1, end: 2, originalText: '原文2', translatedText: 'English 2' }
        ]);

        const newTrack = manager.tracks[manager.tracks.length - 1];
        expect(newTrack.type).toBe('audio');
        expect(newTrack.subtitles[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 2.4,
            audioStartOffset: 0,
            audioEndOffset: 2.4,
            text: 'English 1'
        }));
        expect(newTrack.subtitles[1]).toEqual(expect.objectContaining({
            start: 2.4,
            end: 4.2,
            audioStartOffset: 2.4,
            audioEndOffset: 4.2,
            text: 'English 2'
        }));
    });

    test('delegates track list actions and escapes track names', () => {
        const flow = {
            currentStyle: { fontSize: 28 },
            editor: { render: jest.fn(), addToHistory: jest.fn() },
            styleManager: {
                cloneStyle: jest.fn((style) => JSON.parse(JSON.stringify(style))),
                applyStyleToUI: jest.fn()
            },
            audioManager: { syncTracks: jest.fn() }
        };

        const manager = new window.SubtitleTrackManager(flow);
        manager.cacheElements();
        manager.tracks = [
            { id: 'main', name: 'Main <img src=x onerror=alert(1)>', type: 'main', subtitles: [], visible: true, locked: false, color: '#111', style: { fontSize: 32 }, history: [], historyIndex: -1 },
            { id: 'alt', name: 'Alt', type: 'subtitle', subtitles: [], visible: true, locked: false, color: '#222', style: { fontSize: 28 }, history: [], historyIndex: -1 }
        ];
        manager.activeTrackId = 'main';

        const setActiveTrackSpy = jest.spyOn(manager, 'setActiveTrack').mockImplementation(jest.fn());
        const toggleVisibilitySpy = jest.spyOn(manager, 'toggleVisibility').mockImplementation(jest.fn());
        const removeTrackSpy = jest.spyOn(manager, 'removeTrack').mockImplementation(jest.fn());

        manager.renderTracks();

        const tracksList = document.getElementById('tracks-list');
        expect(tracksList.innerHTML).not.toContain('onclick=');
        expect(tracksList.querySelector('img')).toBeNull();
        expect(
            tracksList.querySelector('[data-id="main"] .track-dropdown-item-name').textContent
        ).toBe('Main <img src=x onerror=alert(1)>');

        tracksList
            .querySelector('[data-track-action="select"][data-id="alt"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // Visibility/remove act on the active track only (activeId still main while setActiveTrack is mocked)
        tracksList
            .querySelector('[data-track-action="toggle-visibility"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        tracksList
            .querySelector('[data-track-action="remove"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setActiveTrackSpy).toHaveBeenCalledWith('alt');
        expect(toggleVisibilitySpy).toHaveBeenCalledWith('main');
        expect(removeTrackSpy).toHaveBeenCalledWith('main');
    });
});
