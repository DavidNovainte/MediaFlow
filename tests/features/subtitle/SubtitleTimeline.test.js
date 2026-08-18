/** @jest-environment jsdom */

describe('SubtitleTimeline viewport render throttling', () => {
    beforeEach(() => {
        jest.resetModules();

        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.app = {
            showToast: jest.fn()
        };

        window.SubtitleTimelineRenderer = class {
            constructor() {
                this.drawRuler = jest.fn();
                this.drawWaveform = jest.fn();
            }
        };

        window.SubtitleTimelineClips = class {
            constructor() {
                this.render = jest.fn();
            }
        };

        window.AudioWaveformLoader = class {};

        require('../../../src/features/subtitle/SubtitleTimeline.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.app;
        delete window.SubtitleTimelineRenderer;
        delete window.SubtitleTimelineClips;
        delete window.AudioWaveformLoader;
        delete window.SubtitleTimeline;
    });

    test('coalesces repeated viewport renders into a single frame', () => {
        const rafQueue = [];
        window.requestAnimationFrame = jest.fn((callback) => {
            rafQueue.push(callback);
            return rafQueue.length;
        });

        const timeline = new window.SubtitleTimeline({
            editor: { subtitles: [{ id: 's1', text: 'hello' }] }
        });

        timeline.requestViewportRender();
        timeline.requestViewportRender();

        expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(timeline.clipsManager.render).not.toHaveBeenCalled();

        rafQueue[0]();

        expect(timeline.clipsManager.render).toHaveBeenCalledTimes(1);
        expect(timeline.clipsManager.render).toHaveBeenCalledWith([{ id: 's1', text: 'hello' }]);
    });

    test('timeline display toggle no longer changes editor list visibility', () => {
        const flow = {
            editor: {
                showOriginal: false,
                showTranslation: true,
                updateToggleUI: jest.fn(),
                render: jest.fn(),
                subtitles: [{ id: 's1', text: 'hello' }]
            },
            updateSubtitlePreview: jest.fn()
        };

        const timeline = new window.SubtitleTimeline(flow);
        timeline.updateToggleUI = jest.fn();

        timeline.toggleDisplayMode();

        expect(timeline.displayMode).toBe('bilingual');
        expect(flow.editor.showOriginal).toBe(false);
        expect(flow.editor.showTranslation).toBe(true);
        expect(flow.editor.updateToggleUI).not.toHaveBeenCalled();
        expect(flow.editor.render).not.toHaveBeenCalled();
        expect(flow.updateSubtitlePreview).toHaveBeenCalled();
    });

    test('ctrl+t does not toggle timeline display while typing in an input', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div id="subtitle-timeline-tracks-list"></div>
                    </div>
                </div>
            </div>
            <input id="subtitle-edit-input" />
        `;
        window.app.router = { currentPage: 'subtitle' };

        const timeline = new window.SubtitleTimeline({ editor: { subtitles: [] } });
        timeline.container = document.getElementById('subtitle-timeline-container');
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        timeline.toggleDisplayMode = jest.fn();
        timeline.bindEvents();

        const event = new KeyboardEvent('keydown', {
            key: 't',
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });
        document.getElementById('subtitle-edit-input').dispatchEvent(event);

        expect(timeline.toggleDisplayMode).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test('dragging empty track-row space starts marquee selection instead of scrubbing', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div id="subtitle-timeline-tracks-list">
                            <div class="timeline-track-row" data-track-id="1"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const row = document.querySelector('.timeline-track-row');
        Object.defineProperty(row, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 10, top: 20, right: 310, bottom: 60, width: 300, height: 40 })
        });
        Object.defineProperty(row, 'clientWidth', {
            configurable: true,
            value: 300
        });

        const flow = {
            editor: { subtitles: [] }
        };
        const timeline = new window.SubtitleTimeline(flow);
        timeline.container = document.getElementById('subtitle-timeline-container');
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        timeline.clipsManager = { selectRangeByPixels: jest.fn() };
        timeline.handleSeek = jest.fn();
        timeline.bindEvents();

        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 80, clientY: 30 }));

        expect(timeline.handleSeek).not.toHaveBeenCalled();
        expect(timeline.isClipRangeSelecting).toBe(true);
        expect(timeline.clipsManager.selectRangeByPixels).toHaveBeenCalled();
    });

    test('clicking blank tracks viewport space does not start scrubbing', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div id="subtitle-timeline-tracks-list"></div>
                    </div>
                </div>
            </div>
        `;

        const viewport = document.querySelector('.tracks-viewport');
        const flow = {
            editor: { subtitles: [] }
        };
        const timeline = new window.SubtitleTimeline(flow);
        timeline.container = document.getElementById('subtitle-timeline-container');
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        timeline.clipsManager = { findTargetRowAt: jest.fn(() => null), selectRangeByPixels: jest.fn() };
        timeline.handleSeek = jest.fn();
        timeline.bindEvents();

        viewport.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 80, clientY: 30 }));

        expect(timeline.handleSeek).not.toHaveBeenCalled();
        expect(timeline.isScrubbing).toBe(false);
        expect(timeline.isClipRangeSelecting).toBe(false);
    });

    test('track marquee coordinates stay aligned after horizontal scrolling', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div class="timeline-track-headers"></div>
                        <div id="subtitle-timeline-tracks-list">
                            <div class="timeline-track-row" data-track-id="1"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const viewport = document.querySelector('.tracks-viewport');
        const headers = document.querySelector('.timeline-track-headers');
        const row = document.querySelector('.timeline-track-row');

        Object.defineProperty(viewport, 'scrollLeft', {
            configurable: true,
            value: 420
        });
        Object.defineProperty(viewport, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 100, top: 20, right: 700, bottom: 220, width: 600, height: 200 })
        });
        Object.defineProperty(headers, 'offsetWidth', {
            configurable: true,
            value: 130
        });
        Object.defineProperty(row, 'clientWidth', {
            configurable: true,
            value: 2000
        });
        Object.defineProperty(row, 'scrollWidth', {
            configurable: true,
            value: 2000
        });

        const timeline = new window.SubtitleTimeline({ editor: { subtitles: [] } });
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');

        const contentX = timeline.getTrackRowContentX({ clientX: 360 }, row);

        expect(contentX).toBe(550);
    });

    test('ctrl+wheel zooms the subtitle timeline instead of only scrolling horizontally', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div id="subtitle-timeline-tracks-list"></div>
                    </div>
                </div>
            </div>
            <input id="subtitle-timeline-zoom" type="range" min="2" max="1000" value="100">
        `;

        const container = document.getElementById('subtitle-timeline-container');
        const timeline = new window.SubtitleTimeline({ editor: { subtitles: [] } });
        timeline.container = container;
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        timeline.render = jest.fn();
        timeline.syncPlayhead = jest.fn();
        timeline.bindEvents();

        const event = new WheelEvent('wheel', {
            deltaY: -120,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
        });

        container.dispatchEvent(event);

        expect(timeline.zoomLevel).toBe(120);
        expect(document.getElementById('subtitle-timeline-zoom').value).toBe('120');
        expect(event.defaultPrevented).toBe(true);
    });

    test('seek and playhead use compact output time when source media is trimmed', () => {
        document.body.innerHTML = `
            <div id="subtitle-timeline-container">
                <div class="timeline-body">
                    <div class="tracks-viewport">
                        <div id="subtitle-timeline-tracks-list"></div>
                    </div>
                </div>
                <div id="subtitle-timeline-playhead"></div>
                <span id="subtitle-timeline-current-time"></span>
            </div>
        `;

        const body = document.querySelector('.timeline-body');
        Object.defineProperty(body, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, top: 0, width: 800, height: 200 })
        });

        const viewport = document.querySelector('.tracks-viewport');
        Object.defineProperty(viewport, 'scrollLeft', {
            configurable: true,
            value: 0
        });

        const video = { paused: true, currentTime: 0 };
        window.requestAnimationFrame = jest.fn((callback) => {
            callback();
            return 1;
        });
        const flow = {
            editor: { subtitles: [] },
            video,
            updateSubtitlePreview: jest.fn(),
            getSourceTimelineDuration: jest.fn(() => 7),
            sourceTimeToTimelineTime: jest.fn((sourceTime) => {
                if (sourceTime <= 2) return sourceTime;
                if (sourceTime <= 8) return 2 + (sourceTime - 5);
                return 5 + (sourceTime - 10);
            }),
            timelineTimeToSourceTime: jest.fn((displayTime) => {
                if (displayTime <= 2) return displayTime;
                if (displayTime <= 5) return 5 + (displayTime - 2);
                return 10 + (displayTime - 5);
            }),
            getPlayableSourceTime: jest.fn((time) => time)
        };

        const timeline = new window.SubtitleTimeline(flow);
        timeline.container = document.getElementById('subtitle-timeline-container');
        timeline.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        timeline.playhead = document.getElementById('subtitle-timeline-playhead');
        timeline.duration = 12;
        timeline.pxPerSec = 100;

        timeline.handleSeek({ clientX: 630 });

        expect(video.currentTime).toBe(8);

        timeline.updateTime(8);

        expect(document.getElementById('subtitle-timeline-current-time').textContent).toBe('00:00:05.000');
        expect(timeline.playhead.style.transform).toBe('translateX(500px)');
    });
});
