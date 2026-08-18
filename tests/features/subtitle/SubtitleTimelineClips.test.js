/** @jest-environment jsdom */

describe('SubtitleTimelineClips selection sync', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '<input type="checkbox" id="btn-select-all-subs">';

        window.SubtitleUtils = {
            getCPS: jest.fn(() => 1),
            getCPSLimit: jest.fn(() => 20)
        };

        require('../../../src/features/subtitle/SubtitleTimelineClips.js');
    });

    afterEach(() => {
        delete window.SubtitleUtils;
        delete window.SubtitleTimelineClips;
    });

    function createClipsManager() {
        const track = {
            id: 1,
            type: 'subtitle',
            subtitles: [
                { id: 's1', start: 0, end: 1, text: 'one', originalText: 'one', translatedText: 'uno' },
                { id: 's2', start: 1, end: 2, text: 'two', originalText: 'two', translatedText: 'dos' },
                { id: 's3', start: 2, end: 3, text: 'three', originalText: 'three', translatedText: 'tres' }
            ]
        };

        const flow = {
            activeTrackId: 1,
            trackManager: {
                tracks: [track],
                setActiveTrack: jest.fn((id) => {
                    flow.activeTrackId = id;
                })
            },
            editor: {
                activeSubtitleIndex: -1,
                render: jest.fn(),
                focusSubtitle: jest.fn(),
                addToHistory: jest.fn(),
                getOriginalText: jest.fn((sub) => sub.originalText || ''),
                getTranslatedText: jest.fn((sub) => sub.translatedText || '')
            },
            contextMenu: { show: jest.fn() }
        };

        const timeline = {
            flow,
            pxPerSec: 100,
            displayMode: 'translated',
            tracksList: document.createElement('div')
        };

        const row = document.createElement('div');
        row.className = 'timeline-track-row';
        row.dataset.trackId = '1';
        timeline.tracksList.appendChild(row);
        document.body.appendChild(timeline.tracksList);

        const clipsManager = new window.SubtitleTimelineClips(timeline);
        const clipElements = track.subtitles.map((sub, index) => clipsManager.createClipElement(sub, index, false, track.id));
        clipElements.forEach((element) => row.appendChild(element));

        return { clipsManager, track, flow, clipElements };
    }

    test('Ctrl+click on timeline clips toggles multi-selection for batch actions', () => {
        const { track, clipElements } = createClipsManager();
        const selectAll = document.getElementById('btn-select-all-subs');

        clipElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        clipElements[2].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

        expect(track.subtitles.map((sub) => sub.selected)).toEqual([true, false, true]);
        expect(selectAll.checked).toBe(false);
        expect(selectAll.indeterminate).toBe(true);
    });

    test('Shift+click on timeline clips selects the full range', () => {
        const { track, clipElements } = createClipsManager();
        const selectAll = document.getElementById('btn-select-all-subs');

        clipElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        clipElements[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

        expect(track.subtitles.map((sub) => sub.selected)).toEqual([true, true, true]);
        expect(selectAll.checked).toBe(true);
        expect(selectAll.indeterminate).toBe(false);
    });

    test('selectRangeByPixels selects every clip intersecting the dragged range', () => {
        const { clipsManager, track } = createClipsManager();
        const selectAll = document.getElementById('btn-select-all-subs');

        clipsManager.selectRangeByPixels(1, 10, 190, { renderList: false });

        expect(track.subtitles.map((sub) => sub.selected)).toEqual([true, true, false]);
        expect(selectAll.checked).toBe(false);
        expect(selectAll.indeterminate).toBe(true);
    });

    test('simple clip click does not trigger drag commit rerenders', () => {
        const { flow, clipElements } = createClipsManager();

        clipElements[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 21 }));
        clipElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 21 }));

        expect(flow.editor.render).toHaveBeenCalledTimes(1);
        expect(flow.editor.addToHistory).not.toHaveBeenCalled();
        expect(flow.editor.focusSubtitle).toHaveBeenCalledWith(0, true);
    });

    test('source media clips show both video and original-audio affordances', () => {
        const sourceTrack = {
            id: -1,
            type: 'source',
            subtitles: [{ id: 'src-1', start: 0, end: 5, text: 'Source Segment' }]
        };
        const flow = {
            sourceTrackId: -1,
            getSourceTrackData: jest.fn(() => sourceTrack),
            getSourceSegmentLabel: jest.fn(() => 'Source Segment'),
            trackManager: { tracks: [] },
            editor: { activeSubtitleIndex: -1 }
        };
        const clipsManager = new window.SubtitleTimelineClips({
            flow,
            pxPerSec: 100,
            displayMode: 'translated',
            tracksList: document.createElement('div')
        });

        const element = clipsManager.createClipElement(sourceTrack.subtitles[0], 0, false, -1);

        expect(element.classList.contains('timeline-source-clip')).toBe(true);
        expect(element.querySelector('.fa-film')).not.toBeNull();
        expect(element.querySelector('.fa-waveform-lines')).not.toBeNull();
    });

    test('source media clips render next to each other on compact output time', () => {
        document.body.innerHTML = `
            <div id="timeline-track-headers"></div>
            <div class="tracks-viewport">
                <div id="subtitle-timeline-tracks-list"></div>
            </div>
        `;

        const sourceTrack = {
            id: -1,
            type: 'source',
            visible: true,
            subtitles: [
                { id: 'src-1', start: 0, end: 4, text: 'Source Segment' },
                { id: 'src-2', start: 6, end: 10, text: 'Source Segment' }
            ]
        };
        const flow = {
            sourceTrackId: -1,
            activeTrackId: 1,
            getSourceTrackData: jest.fn(() => sourceTrack),
            getSourceSegmentLabel: jest.fn(() => 'Source Segment'),
            getSourceTimelineSegments: jest.fn(() => [
                { sourceStart: 0, sourceEnd: 4, timelineStart: 0, timelineEnd: 4, duration: 4 },
                { sourceStart: 6, sourceEnd: 10, timelineStart: 4, timelineEnd: 8, duration: 4 }
            ]),
            trackManager: { tracks: [] },
            editor: { activeSubtitleIndex: -1 }
        };
        const tracksList = document.getElementById('subtitle-timeline-tracks-list');
        const clipsManager = new window.SubtitleTimelineClips({
            flow,
            pxPerSec: 100,
            duration: 10,
            getDisplayDuration: () => 8,
            displayMode: 'translated',
            tracksList
        });

        clipsManager.render();

        const clips = tracksList.querySelectorAll('.timeline-source-clip');
        expect(clips).toHaveLength(2);
        expect(clips[0].style.left).toBe('0px');
        expect(clips[0].style.width).toBe('400px');
        expect(clips[1].style.left).toBe('400px');
        expect(clips[1].style.width).toBe('400px');
    });

    test('delegates track header actions without inline handlers', () => {
        document.body.innerHTML = `
            <div id="timeline-track-headers"></div>
            <div class="tracks-viewport">
                <div id="subtitle-timeline-tracks-list"></div>
            </div>
        `;

        const track = {
            id: 'sub1',
            type: 'subtitle',
            visible: true,
            locked: false,
            name: 'Subtitle <img src=x onerror=alert(1)>',
            subtitles: []
        };
        const flow = {
            activeTrackId: 'other',
            trackManager: {
                tracks: [track],
                setActiveTrack: jest.fn(),
                toggleLock: jest.fn(),
                toggleVisibility: jest.fn()
            },
            editor: { activeSubtitleIndex: -1 }
        };
        const clipsManager = new window.SubtitleTimelineClips({
            flow,
            pxPerSec: 100,
            duration: 5,
            getDisplayDuration: () => 5,
            displayMode: 'translated',
            tracksList: document.getElementById('subtitle-timeline-tracks-list'),
            promptTrackShift: jest.fn()
        });

        clipsManager.render();

        const headers = document.getElementById('timeline-track-headers');
        const header = headers.querySelector('.track-header-item[data-track-id="sub1"]');
        expect(headers.innerHTML).not.toContain('onclick=');
        expect(headers.querySelector('img')).toBeNull();
        expect(header.querySelector('.track-header-name').textContent).toBe('Subtitle <img src=x onerror=alert(1)>');

        header.querySelector('[data-track-header-action="shift"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        header.querySelector('[data-track-header-action="toggle-lock"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        header.querySelector('[data-track-header-action="toggle-visibility"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        header.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(clipsManager.timeline.promptTrackShift).toHaveBeenCalledWith('sub1');
        expect(flow.trackManager.toggleLock).toHaveBeenCalledWith('sub1');
        expect(flow.trackManager.toggleVisibility).toHaveBeenCalledWith('sub1');
        expect(flow.trackManager.setActiveTrack).toHaveBeenCalledWith('sub1');
    });
});
