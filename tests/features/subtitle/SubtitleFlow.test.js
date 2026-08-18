/** @jest-environment jsdom */

describe('SubtitleFlow draft style recovery', () => {
    beforeAll(() => {
        window.i18n = {
            t: jest.fn(key => key),
            updateUI: jest.fn()
        };

        window.SubtitleTemplateManager = class {
            constructor(styleManager) {
                this.styleManager = styleManager;
                this.styleTemplate = { value: 'custom' };
            }
            init() {}
            loadCustomTemplates() {}
            updateTemplateButtons() {}
        };

        window.SubtitlePreviewHandler = class {
            init() {}
            updateSubtitlePreview() {}
        };

        require('../../../src/features/subtitle/SubtitleStyleManager');

        window.SubtitleEditor = class {
            constructor() {
                this.subtitles = [];
                this.render = jest.fn();
                this.addToHistory = jest.fn();
            }
        };
        window.SubtitleTrackManager = class {
            constructor() {
                this.tracks = [];
                this.activeTrackId = null;
                this.renderTracks = jest.fn();
            }
        };
        window.SubtitleAudioManager = class {
            constructor() {
                this.syncTracks = jest.fn();
            }
        };
        window.SubtitleAudioActionHandler = class {};
        window.SubtitleTimeline = class {};
        window.SubtitlePreferenceManager = class {
            constructor() {
                this.preferences = {};
                this.get = jest.fn();
                this.set = jest.fn();
            }
        };
        window.SubtitleSearchHandler = class {};
        window.SubtitleQualityHandler = class {};
        window.SubtitleContextMenu = class {};
        window.SubtitleUIManager = class {};
        window.SubtitleService = class {};
        window.SubtitleDubAdapter = class {};
        window.SubtitleVisualOptimizer = class {};
        window.SubtitleDraftManager = class {};

        require('../../../src/features/subtitle/SubtitleFlow');
    });

    it('restores snapshot style as the new editing baseline', () => {
        const flow = new window.SubtitleFlow({});
        flow.styleManager.applyStyleToUI = jest.fn();
        flow.styleManager.saveCurrentStylePreference = jest.fn();
        flow.updateSubtitlePreview = jest.fn();

        const snapshotStyle = {
            fontFamily: 'Arial',
            fontSize: 42,
            fontColor: '#ffffff',
            enableBackground: true,
            bgColor: '#111111',
            strokes: [{ width: 3, color: '#000000', opacity: 100 }],
            shadows: [{ x: 2, y: 2, blur: 4, color: '#ff00aa' }]
        };
        const snapshot = {
            tracks: [{
                id: 1,
                type: 'main',
                subtitles: [{ id: 's1', text: 'hello' }],
                style: snapshotStyle,
                visible: true,
                locked: false
            }],
            activeTrackId: 1,
            currentStyle: snapshotStyle
        };

        flow.restoreFromSnapshot(snapshot);

        expect(flow.styleManager.currentStyle).toEqual(expect.objectContaining({
            fontFamily: 'Arial',
            fontSize: 42,
            enableBackground: true,
            bgColor: '#111111'
        }));
        expect(flow.trackManager.tracks[0].style).toEqual(expect.objectContaining({
            fontSize: 42,
            bgColor: '#111111'
        }));
        expect(flow.trackManager.tracks[0].style).not.toBe(snapshot.tracks[0].style);

        flow.styleManager.updateStyle({ fontColor: '#ff0000' });

        expect(flow.styleManager.currentStyle.fontSize).toBe(42);
        expect(flow.trackManager.tracks[0].style.fontSize).toBe(42);
        expect(flow.styleManager.currentStyle.fontColor).toBe('#ff0000');
    });

    it('syncs advanced shadow edits back to the active track style', () => {
        const flow = new window.SubtitleFlow({});
        flow.styleManager.saveCurrentStylePreference = jest.fn();
        flow.styleManager.updateSubtitlePreview = jest.fn();

        flow.trackManager.tracks = [{
            id: 1,
            type: 'main',
            subtitles: [],
            style: {
                shadows: [{ x: 2, y: 2, blur: 4, color: '#ff00aa' }]
            }
        }];
        flow.trackManager.activeTrackId = 1;
        flow.styleManager.currentStyle = flow.styleManager.cloneStyle({
            fontFamily: 'Arial',
            fontSize: 42,
            shadows: [{ x: 2, y: 2, blur: 4, color: '#ff00aa' }]
        });

        flow.styleManager.updateEffect(0, 'color', '#00ff00');

        expect(flow.trackManager.tracks[0].style.shadows[0].color).toBe('#00ff00');
    });

    it('accepts video files by extension when the mime type is empty', () => {
        const flow = new window.SubtitleFlow({});

        expect(flow.isSupportedVideoFile({ name: 'clip.mkv', type: '' })).toBe(true);
        expect(flow.isSupportedVideoFile({ name: 'clip.webm', type: '' })).toBe(true);
        expect(flow.isSupportedVideoFile({ name: 'notes.txt', type: '' })).toBe(false);
    });

    it('resolves shared ids from the subtitle page instead of earlier pages', () => {
        document.body.innerHTML = `
            <section id="page-creator"><button id="btn-cancel-process">creator cancel</button></section>
            <section id="page-subtitle"><button id="btn-cancel-process">subtitle cancel</button></section>
        `;

        const flow = new window.SubtitleFlow({});

        expect(flow.getElement('btn-cancel-process')).toBe(
            document.querySelector('#page-subtitle #btn-cancel-process')
        );
    });

    it('manages source media segments independently from subtitle tracks', () => {
        const flow = new window.SubtitleFlow({});
        flow.videoFile = { path: '/clip.mp4', duration: 12 };
        flow.timeline = {
            duration: 12,
            render: jest.fn(),
            renderer: {
                drawRuler: jest.fn(),
                drawWaveform: jest.fn()
            },
            syncPlayhead: jest.fn(),
            clipsManager: {
                selectedTrackId: null,
                selectedIndices: new Set(),
                lastSelectedIndex: null,
                _syncSelectionUI: jest.fn()
            }
        };

        flow.resetSourceSegments(12);

        expect(flow.sourceSegments).toHaveLength(1);
        expect(flow.sourceSegments[0]).toEqual(expect.objectContaining({ start: 0, end: 12 }));

        const splitResult = flow.splitSourceSegmentAt(5);

        expect(splitResult).not.toBeNull();
        expect(flow.sourceSegments).toHaveLength(2);
        expect(flow.sourceSegments[0]).toEqual(expect.objectContaining({ start: 0, end: 5 }));
        expect(flow.sourceSegments[1]).toEqual(expect.objectContaining({ start: 5, end: 12, selected: true }));
        expect(flow.timeline.clipsManager.selectedTrackId).toBe(-1);
        expect(Array.from(flow.timeline.clipsManager.selectedIndices)).toEqual([1]);
        expect(flow.hasSourceTrim()).toBe(false);

        flow.timeline.render.mockClear();
        flow.timeline.renderer.drawRuler.mockClear();
        flow.timeline.renderer.drawWaveform.mockClear();
        flow.timeline.syncPlayhead.mockClear();

        const deleteResult = flow.deleteSelectedSourceSegments();

        expect(deleteResult).toEqual(expect.objectContaining({ deletedCount: 1, preventedAll: false }));
        expect(flow.sourceSegments).toHaveLength(1);
        expect(flow.sourceSegments[0]).toEqual(expect.objectContaining({ start: 0, end: 5, selected: true }));
        expect(flow.hasSourceTrim()).toBe(true);
        expect(flow.timeline.render).toHaveBeenCalledTimes(1);
        expect(flow.timeline.renderer.drawRuler).toHaveBeenCalledTimes(1);
        expect(flow.timeline.renderer.drawWaveform).toHaveBeenCalledTimes(1);
        expect(flow.timeline.syncPlayhead).toHaveBeenCalledTimes(1);
    });

    it('trims dependent audio and subtitle tracks when deleting source media segments', () => {
        const flow = new window.SubtitleFlow({});
        flow.videoFile = { path: '/clip.mp4', duration: 10 };
        flow.timeline = {
            duration: 10,
            render: jest.fn(),
            clipsManager: {
                selectedTrackId: -1,
                selectedIndices: new Set([1]),
                lastSelectedIndex: 1,
                _syncSelectionUI: jest.fn()
            }
        };
        flow.trackManager.tracks = [
            {
                id: 'main',
                type: 'main',
                subtitles: [
                    { id: 'sub-1', start: 1, end: 9, text: 'line', words: [{ start: 1, end: 4 }, { start: 6, end: 9 }] }
                ]
            },
            {
                id: 'audio',
                type: 'audio',
                subtitles: [
                    { id: 'audio-1', start: 0, end: 10, audioStartOffset: 3, audioEndOffset: 13, text: 'dub' }
                ]
            }
        ];
        flow.trackManager.activeTrackId = 'main';

        flow.setSourceSegments([
            { start: 0, end: 3 },
            { start: 3, end: 6 },
            { start: 6, end: 10 }
        ], { render: false });

        const result = flow.deleteSelectedSourceSegments();

        expect(result).toEqual(expect.objectContaining({
            deletedCount: 1,
            trimmedDependentTracks: 2,
            removedDependentClips: 0,
            splitDependentClips: 2
        }));
        expect(flow.sourceSegments.map((segment) => ({ start: segment.start, end: segment.end }))).toEqual([
            { start: 0, end: 3 },
            { start: 6, end: 10 }
        ]);
        expect(flow.trackManager.tracks[0].subtitles.map((sub) => ({
            start: sub.start,
            end: sub.end,
            words: sub.words.map((word) => ({ start: word.start, end: word.end }))
        }))).toEqual([
            { start: 1, end: 3, words: [{ start: 1, end: 3 }] },
            { start: 6, end: 9, words: [{ start: 6, end: 9 }] }
        ]);
        expect(flow.trackManager.tracks[1].subtitles.map((sub) => ({
            start: sub.start,
            end: sub.end,
            audioStartOffset: sub.audioStartOffset,
            audioEndOffset: sub.audioEndOffset
        }))).toEqual([
            { start: 0, end: 3, audioStartOffset: 3, audioEndOffset: 6 },
            { start: 6, end: 10, audioStartOffset: 9, audioEndOffset: 13 }
        ]);
        expect(flow.audioManager.syncTracks).toHaveBeenCalled();
        expect(flow.editor.render).toHaveBeenCalledWith(flow.trackManager.tracks[0].subtitles);
    });

    it('refreshes source labels from i18n instead of keeping raw keys in state', () => {
        const originalTranslate = window.i18n.t;
        window.i18n.t = jest.fn((key) => {
            if (key === 'subtitle.timeline.source_segment_label') return '源片段';
            if (key === 'subtitle.timeline.source_media_track') return '源素材';
            return key;
        });

        const flow = new window.SubtitleFlow({});
        flow.videoFile = { path: '/clip.mp4', duration: 8 };
        flow.timeline = {
            duration: 8,
            render: jest.fn(),
            clipsManager: {
                selectedTrackId: null,
                selectedIndices: new Set(),
                lastSelectedIndex: null,
                _syncSelectionUI: jest.fn()
            }
        };

        flow.setSourceSegments([{ start: 0, end: 8, text: 'subtitle.timeline.source_segment_label' }]);

        expect(flow.sourceSegments[0].text).toBe('源片段');
        expect(flow.getSourceTrackData().name).toBe('源素材');

        window.i18n.t = originalTranslate;
    });

    it('maps deleted source gaps to the next playable source time', () => {
        const flow = new window.SubtitleFlow({});
        flow.videoFile = { path: '/clip.mp4', duration: 12 };
        flow.timeline = { duration: 12 };

        flow.setSourceSegments([
            { start: 0, end: 2 },
            { start: 5, end: 8 },
            { start: 10, end: 12 }
        ], { render: false });

        expect(flow.getPlayableSourceTime(1.5)).toBeCloseTo(1.5, 3);
        expect(flow.getPlayableSourceTime(3)).toBe(5);
        expect(flow.getPlayableSourceTime(9)).toBe(10);
        expect(flow.getPlayableSourceTime(14)).toBe(12);
    });

    it('maps source trim segments onto a compact output timeline', () => {
        const flow = new window.SubtitleFlow({});
        flow.videoFile = { path: '/clip.mp4', duration: 12 };
        flow.timeline = { duration: 12 };

        flow.setSourceSegments([
            { start: 0, end: 2 },
            { start: 5, end: 8 },
            { start: 10, end: 12 }
        ], { render: false });

        expect(flow.getSourceTimelineSegments()).toEqual([
            expect.objectContaining({ sourceStart: 0, sourceEnd: 2, timelineStart: 0, timelineEnd: 2 }),
            expect.objectContaining({ sourceStart: 5, sourceEnd: 8, timelineStart: 2, timelineEnd: 5 }),
            expect.objectContaining({ sourceStart: 10, sourceEnd: 12, timelineStart: 5, timelineEnd: 7 })
        ]);
        expect(flow.getSourceTimelineDuration()).toBe(7);
        expect(flow.sourceTimeToTimelineTime(6)).toBe(3);
        expect(flow.sourceTimeToTimelineTime(4)).toBe(2);
        expect(flow.timelineTimeToSourceTime(3)).toBe(6);
        expect(flow.timelineTimeToSourceTime(5.5)).toBe(10.5);
        expect(flow.getSourceRangeTimelineRange(1, 6)).toEqual({ start: 1, end: 3 });
    });

    it('keeps toolbar overflow menu closed and never forces inline-visible mode', () => {
        // Narrow list panel UX: always keep a visible overflow control (⋯).
        document.body.innerHTML = `
            <div id="subtitle-list-aside">
                <div class="header-actions row-actions">
                    <div class="row-actions-main"></div>
                    <details class="toolbar-overflow" open data-inline-visible="true">
                        <summary>More</summary>
                        <div class="toolbar-overflow-menu">
                            <button type="button">A</button>
                            <button type="button">B</button>
                        </div>
                    </details>
                </div>
            </div>
        `;

        const overflow = document.querySelector('.toolbar-overflow');
        const flow = new window.SubtitleFlow({});
        flow.syncToolbarOverflowLayout();

        expect(overflow.open).toBe(false);
        expect(overflow.hasAttribute('data-inline-visible')).toBe(false);
    });

    it('renders QC queue entries and wires queue actions', () => {
        jest.useFakeTimers();

        document.body.innerHTML = `
            <select id="subtitle-review-filter">
                <option value="all">all</option>
                <option value="qc">qc</option>
            </select>
            <button id="btn-qc-filter-issues"></button>
            <button id="btn-qc-clear-filter"></button>
            <button id="btn-close-qc"></button>
            <div id="qc-summary-bar" class="hidden">
                <div class="qc-info"><i></i><span id="qc-stats-text"></span></div>
            </div>
            <div id="qc-queue-panel" class="hidden">
                <span id="qc-queue-count"></span>
                <div id="qc-queue-list"></div>
            </div>
        `;

        const flow = new window.SubtitleFlow({});
        const errors = [{ index: 0, type: 'overlap', message: 'Overlap issue' }];
        flow.initToolbarScroll = jest.fn();
        flow.updateInputModeUI = jest.fn();
        flow.onSubtitleModeChange = jest.fn();
        flow.updateSubtitlePreview = jest.fn();
        flow.editor = {
            setReviewFilter: jest.fn(),
            render: jest.fn()
        };
        flow.qualityHandler = {
            runQC: jest.fn(() => errors),
            getErrorEntries: jest.fn(() => ([
                {
                    queueIndex: 0,
                    index: 0,
                    type: 'overlap',
                    message: 'Overlap issue',
                    subtitle: { text: 'First line' },
                    locked: false
                },
                {
                    queueIndex: 1,
                    index: 1,
                    type: 'short',
                    message: 'Short issue',
                    subtitle: { text: 'Locked line' },
                    locked: true
                }
            ])),
            focusError: jest.fn(),
            fixOverlap: jest.fn(),
            fixShort: jest.fn(),
            fixOverflow: jest.fn()
        };

        flow.bindEvents();
        flow.updateQCUI(errors);

        expect(document.getElementById('qc-summary-bar').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('qc-queue-panel').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('qc-queue-count').textContent).toBe('2');
        expect(document.querySelectorAll('.qc-queue-item')).toHaveLength(2);
        expect(document.querySelectorAll('.qc-queue-fix-btn')[1].disabled).toBe(true);

        document.getElementById('btn-qc-filter-issues').click();
        expect(flow.editor.setReviewFilter).toHaveBeenCalledWith('qc');
        expect(document.getElementById('subtitle-review-filter').value).toBe('qc');

        document.querySelector('.qc-queue-item').click();
        expect(flow.qualityHandler.focusError).toHaveBeenCalledWith(0);

        document.querySelector('.qc-queue-fix-btn').click();
        expect(flow.qualityHandler.fixOverlap).toHaveBeenCalledWith(0);
        expect(flow.qualityHandler.runQC).toHaveBeenCalled();

        document.getElementById('btn-qc-clear-filter').click();
        expect(flow.editor.setReviewFilter).toHaveBeenCalledWith('all');
        expect(document.getElementById('subtitle-review-filter').value).toBe('all');

        document.getElementById('btn-close-qc').click();
        expect(document.getElementById('qc-summary-bar').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('qc-queue-panel').classList.contains('hidden')).toBe(true);

        jest.useRealTimers();
    });

    it('escapes QC queue text without breaking the queue markup', () => {
        document.body.innerHTML = `
            <section id="page-subtitle">
                <div id="qc-summary-bar" class="hidden">
                    <div class="qc-info"><i></i><span id="qc-stats-text"></span></div>
                </div>
                <div id="qc-queue-panel" class="hidden">
                    <span id="qc-queue-count"></span>
                    <div id="qc-queue-list"></div>
                </div>
            </section>
        `;

        const flow = new window.SubtitleFlow({});
        flow.editor = { render: jest.fn() };
        flow.qualityHandler = {
            getErrorEntries: jest.fn(() => ([{
                queueIndex: 0,
                index: 0,
                type: 'overlap',
                message: 'Bad <img src=x onerror=alert(1)>',
                subtitle: { text: 'Text </div><script>alert(1)</script>' },
                locked: false
            }]))
        };

        flow.updateQCUI([{ index: 0, type: 'overlap', message: 'Bad' }]);

        const queueList = document.getElementById('qc-queue-list');
        expect(queueList.querySelector('img')).toBeNull();
        expect(queueList.querySelector('script')).toBeNull();
        expect(queueList.querySelectorAll('.qc-queue-item')).toHaveLength(1);
        expect(queueList.textContent).toContain('Bad <img src=x onerror=alert(1)>');
        expect(queueList.textContent).toContain('Text </div><script>alert(1)</script>');
    });

    it('creates a dedicated TTS audio clip for manually added subtitles when no clip exists yet', async () => {
        window.app = {
            showToast: jest.fn()
        };

        const flow = new window.SubtitleFlow({});
        flow.editor.subtitles = [{
            id: 'sub-1',
            start: 2,
            end: 3.1,
            originalText: '别看他表面很陶醉',
            translatedText: '',
            text: '别看他表面很陶醉'
        }];

        flow.trackManager.tracks = [{
            id: 11,
            type: 'audio',
            name: 'Original audio',
            subtitles: [],
            visible: true,
            locked: false
        }];
        flow.trackManager.addTrack = function(name, type) {
            this.tracks.push({
                id: 22,
                type,
                name,
                subtitles: [],
                visible: true,
                locked: false
            });
        };

        flow.ttsHandler = {
            getSettings: jest.fn(() => ({ enabled: true })),
            generateSingleSegment: jest.fn().mockResolvedValue({ path: 'live-seg.mp3', duration: 1.2 }),
            getSubtitleSpeechText: jest.fn(() => '别看他表面很陶醉')
        };
        flow.audioManager = {
            audioPool: new Map(),
            syncTracks: jest.fn(),
            normalizePath: jest.fn((value) => value)
        };
        flow.timeline = {
            clips: {
                updateClipUI: jest.fn()
            },
            render: jest.fn()
        };
        flow.uiManager = {
            settings: {
                refreshDubStatusPanel: jest.fn()
            }
        };
        flow.applyAudioRipple = jest.fn();

        await flow.autoUpdateSubtitleTTS(0);

        expect(flow.ttsHandler.generateSingleSegment).toHaveBeenCalled();
        expect(flow.trackManager.tracks).toHaveLength(2);
        expect(flow.trackManager.tracks[0].subtitles).toHaveLength(0);

        const ttsTrack = flow.trackManager.tracks[1];
        expect(ttsTrack.type).toBe('audio');
        expect(ttsTrack.ttsGenerated).toBe(true);
        expect(ttsTrack.subtitles).toHaveLength(1);
        expect(ttsTrack.subtitles[0]).toEqual(expect.objectContaining({
            originId: 'sub-1',
            audioPath: 'live-seg.mp3',
            text: '别看他表面很陶醉'
        }));
        expect(flow.audioManager.syncTracks).toHaveBeenCalled();
        expect(flow.timeline.render).toHaveBeenCalled();
    });
});
