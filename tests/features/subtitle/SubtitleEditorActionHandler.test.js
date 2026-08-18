/** @jest-environment jsdom */

describe('SubtitleEditorActionHandler single-line review actions', () => {
    beforeEach(() => {
        jest.resetModules();

        window.SubtitleUtils = {
            translateOrFallback: jest.fn((key, fallback) => fallback)
        };
        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.app = {
            showToast: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleEditorActionHandler.js');
    });

    afterEach(() => {
        delete window.SubtitleUtils;
        delete window.i18n;
        delete window.app;
        delete window.SubtitleEditorActionHandler;
    });

    function createMockVideo() {
        const listeners = new Map();
        const video = {
            currentTime: 0,
            duration: 30,
            paused: false,
            play: jest.fn(() => Promise.resolve()),
            pause: jest.fn(() => {
                video.paused = true;
            }),
            addEventListener: jest.fn((name, handler) => {
                listeners.set(name, handler);
            }),
            removeEventListener: jest.fn((name) => {
                listeners.delete(name);
            }),
            emit(name) {
                const handler = listeners.get(name);
                if (handler) handler();
            }
        };

        return video;
    }

    test('playSubtitle seeks to the subtitle and pauses at segment end', () => {
        const video = createMockVideo();
        const editor = {
            subtitles: [{ id: 's1', start: 1, end: 2 }],
            setActive: jest.fn()
        };
        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = { video };

        handler.playSubtitle(0);

        expect(video.currentTime).toBe(1);
        expect(video.play).toHaveBeenCalled();
        expect(editor.setActive).toHaveBeenCalledWith(0);

        video.currentTime = 2.01;
        video.emit('timeupdate');

        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(2);
    });

    test('loopSubtitle rewinds back to the subtitle start', () => {
        const video = createMockVideo();
        const editor = {
            subtitles: [{ id: 's1', start: 3, end: 4 }],
            setActive: jest.fn(),
            loopingSubtitleIndex: -1,
            render: jest.fn()
        };
        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = { video };

        handler.loopSubtitle(0);

        expect(editor.loopingSubtitleIndex).toBe(0);
        expect(editor.render).toHaveBeenCalled();

        video.currentTime = 4.02;
        video.emit('timeupdate');

        expect(video.pause).not.toHaveBeenCalled();
        expect(video.currentTime).toBe(3);

        handler.loopSubtitle(0);

        expect(video.pause).toHaveBeenCalled();
        expect(editor.loopingSubtitleIndex).toBe(-1);
    });

    test('reRecognize updates the original text and keeps existing translation', async () => {
        const subtitle = { id: 's1', start: 5, end: 7, originalText: 'old', translatedText: 'kept' };
        const editor = {
            subtitles: [subtitle],
            getTranslatedText: jest.fn(() => 'kept'),
            updateSubtitleText: jest.fn(),
            render: jest.fn(),
            addToHistory: jest.fn(),
            ensureHistoryBaseline: jest.fn()
        };
        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            videoFile: { path: 'clip.mp4', name: 'clip.mp4' },
            service: { reRecognizeSubtitle: jest.fn().mockResolvedValue('fixed original') },
            showProgress: jest.fn(),
            hideProgress: jest.fn()
        };

        await handler.reRecognize(0);

        expect(handler.flow.service.reRecognizeSubtitle).toHaveBeenCalledWith(handler.flow.videoFile, subtitle);
        expect(editor.updateSubtitleText).toHaveBeenCalledWith(0, 'fixed original', 'kept');
        expect(editor.render).toHaveBeenCalled();
        expect(editor.addToHistory).toHaveBeenCalled();
        expect(window.app.showToast).toHaveBeenCalledWith('Subtitle re-recognized. Re-translate if needed.', 'success');
    });

    test('reRecognize can also refresh the translation in one pass', async () => {
        const subtitle = { id: 's1', start: 5, end: 7, originalText: 'old', translatedText: 'old trans' };
        const editor = {
            subtitles: [subtitle],
            getTranslatedText: jest.fn(() => 'old trans'),
            updateSubtitleText: jest.fn(),
            render: jest.fn(),
            addToHistory: jest.fn(),
            ensureHistoryBaseline: jest.fn(),
            loopingSubtitleIndex: -1
        };
        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            videoFile: { path: 'clip.mp4', name: 'clip.mp4' },
            targetLanguage: { value: 'en' },
            service: {
                reRecognizeSubtitle: jest.fn().mockResolvedValue('fixed original'),
                retranslate: jest.fn().mockResolvedValue('fresh translation')
            },
            showProgress: jest.fn(),
            hideProgress: jest.fn()
        };

        await handler.reRecognize(0, { retranslate: true });

        expect(handler.flow.service.retranslate).toHaveBeenCalledWith('fixed original', 'en', { allowMemory: false });
        expect(editor.updateSubtitleText).toHaveBeenCalledWith(0, 'fixed original', 'fresh translation');
        expect(window.app.showToast).toHaveBeenCalledWith('Subtitle re-recognized and re-translated', 'success');
    });

    test('deleteSubtitle removes the line immediately without confirmation', async () => {
        window.app.showConfirm = jest.fn();

        const editor = {
            subtitles: [
                { id: 's1', start: 1, end: 2 },
                { id: 's2', start: 3, end: 4 }
            ],
            activeSubtitleIndex: 1,
            ensureHistoryBaseline: jest.fn(),
            render: jest.fn(),
            addToHistory: jest.fn()
        };
        const handler = new window.SubtitleEditorActionHandler(editor);

        await handler.deleteSubtitle(0);

        expect(window.app.showConfirm).not.toHaveBeenCalled();
        expect(editor.subtitles).toHaveLength(1);
        expect(editor.subtitles[0].id).toBe('s2');
        expect(editor.activeSubtitleIndex).toBe(0);
        expect(editor.render).toHaveBeenCalled();
        expect(editor.addToHistory).toHaveBeenCalled();
    });

    test('deleteSelected removes selected lines immediately without confirmation', async () => {
        window.app.showConfirm = jest.fn();

        const editor = {
            subtitles: [
                { id: 's1', selected: true },
                { id: 's2', selected: false },
                { id: 's3', selected: true }
            ],
            activeSubtitleIndex: 2,
            ensureHistoryBaseline: jest.fn(),
            render: jest.fn(),
            addToHistory: jest.fn(),
            getSelectedIndices: jest.fn((options) => {
                const indices = [];
                editor.subtitles.forEach((s, idx) => {
                    if (s.selected) indices.push(idx);
                });
                return indices;
            })
        };
        const handler = new window.SubtitleEditorActionHandler(editor);

        await handler.deleteSelected();

        expect(window.app.showConfirm).not.toHaveBeenCalled();
        expect(editor.subtitles).toEqual([{ id: 's2', selected: false }]);
        expect(editor.activeSubtitleIndex).toBe(-1);
        // Product resolves toast via i18n with Chinese fallback + undo hint
        expect(window.app.showToast).toHaveBeenCalledWith('已删除 2 条（Ctrl+Z 撤销）', 'info');
    });

    test('splitAtPlayhead can split the timeline-selected audio track even when another track stays active', async () => {
        const mainTrack = {
            id: 'main',
            type: 'main',
            subtitles: [{ id: 'sub-1', start: 0, end: 5 }]
        };
        const audioTrack = {
            id: 'audio-1',
            type: 'audio',
            subtitles: [{
                id: 'clip-1',
                start: 1,
                end: 5,
                audioStartOffset: 1,
                audioEndOffset: 5
            }]
        };

        const editor = {
            subtitles: mainTrack.subtitles,
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const timeline = {
            clipsManager: {
                selectedTrackId: 'audio-1'
            },
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            video: { currentTime: 3 },
            trackManager: {
                activeTrackId: 'main',
                tracks: [mainTrack, audioTrack]
            },
            timeline
        };

        await handler.splitAtPlayhead();

        expect(audioTrack.subtitles).toHaveLength(2);
        expect(audioTrack.subtitles[0].end).toBe(3);
        expect(audioTrack.subtitles[0].audioEndOffset).toBe(3);
        expect(audioTrack.subtitles[1].start).toBe(3);
        expect(audioTrack.subtitles[1].audioStartOffset).toBe(3);
        expect(mainTrack.subtitles).toHaveLength(1);
        expect(editor.render).not.toHaveBeenCalled();
        expect(timeline.render).toHaveBeenCalled();
        expect(editor.ensureHistoryBaseline).toHaveBeenCalled();
        expect(editor.addToHistory).toHaveBeenCalled();
    });

    test('splitAtPlayhead delegates to the selected source-media track', async () => {
        const sourceTrack = {
            id: -1,
            type: 'source',
            locked: false,
            subtitles: [{ start: 0, end: 10 }]
        };
        const audioTrack = {
            id: 'audio',
            type: 'audio',
            locked: false,
            subtitles: [{ id: 'audio-1', start: 0, end: 8, audioStartOffset: 1, audioEndOffset: 9, text: 'Dub' }]
        };

        const editor = {
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            video: { currentTime: 4 },
            sourceTrackId: -1,
            splitSourceSegmentAt: jest.fn().mockReturnValue({}),
            timeline: {
                clipsManager: {
                    selectedTrackId: -1,
                    getTrackById: jest.fn(() => sourceTrack)
                },
                render: jest.fn()
            },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', type: 'main', subtitles: [] }, audioTrack]
            }
        };

        await handler.splitAtPlayhead();

        expect(handler.flow.splitSourceSegmentAt).toHaveBeenCalledWith(4);
        expect(audioTrack.subtitles).toHaveLength(2);
        expect(audioTrack.subtitles[0]).toEqual(expect.objectContaining({ start: 0, end: 4, audioStartOffset: 1, audioEndOffset: 5 }));
        expect(audioTrack.subtitles[1]).toEqual(expect.objectContaining({ start: 4, end: 8, audioStartOffset: 5, audioEndOffset: 9 }));
        expect(handler.flow.timeline.render).toHaveBeenCalled();
        expect(window.app.showToast).toHaveBeenCalledWith('Source media split at 4.00s.', 'success');
        expect(editor.ensureHistoryBaseline).not.toHaveBeenCalled();
    });

    test('splitAtPlayhead falls back to source media when no subtitle or dubbing clip contains the playhead', async () => {
        const mainTrack = {
            id: 'main',
            type: 'main',
            subtitles: [{ id: 'sub-1', start: 0, end: 2 }]
        };
        const sourceSegments = [{ start: 0, end: 10 }];

        const editor = {
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            video: { currentTime: 4 },
            sourceTrackId: -1,
            sourceSegments,
            getSourceTrackData: jest.fn(() => ({
                id: -1,
                type: 'source',
                locked: false,
                subtitles: sourceSegments
            })),
            splitSourceSegmentAt: jest.fn().mockReturnValue({}),
            timeline: {
                clipsManager: {
                    selectedTrackId: null,
                    selectedIndices: new Set()
                },
                render: jest.fn()
            },
            trackManager: {
                activeTrackId: 'main',
                tracks: [mainTrack]
            }
        };

        await handler.splitAtPlayhead();

        expect(handler.flow.splitSourceSegmentAt).toHaveBeenCalledWith(4);
        expect(window.app.showToast).toHaveBeenCalledWith('Source media split at 4.00s.', 'success');
        expect(editor.ensureHistoryBaseline).not.toHaveBeenCalled();
    });

    test('deleteSubtitles routes source-media selection to source segment deletion', async () => {
        const sourceTrack = {
            id: -1,
            type: 'source',
            locked: false,
            subtitles: [{ start: 0, end: 5 }, { start: 5, end: 10 }]
        };

        const editor = {
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            sourceTrackId: -1,
            deleteSelectedSourceSegments: jest.fn().mockReturnValue({ deletedCount: 1, preventedAll: false }),
            timeline: {
                clipsManager: {
                    selectedTrackId: -1,
                    getTrackById: jest.fn(() => sourceTrack)
                }
            },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', type: 'main', subtitles: [] }]
            }
        };

        await handler.deleteSubtitles();

        expect(handler.flow.deleteSelectedSourceSegments).toHaveBeenCalled();
        expect(window.app.showToast).toHaveBeenCalledWith('Removed source segment.', 'success');
        expect(editor.ensureHistoryBaseline).not.toHaveBeenCalled();
    });

    test('splitAtPlayhead reports no split target when no subtitle, dubbing, or source segment contains the playhead', async () => {
        const editor = {
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            video: { currentTime: 3 },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', type: 'main', subtitles: [] }]
            },
            timeline: {
                clipsManager: {
                    selectedTrackId: null
                }
            }
        };

        await handler.splitAtPlayhead();

        expect(window.app.showToast).toHaveBeenCalledWith(
            'No subtitle, dubbing, or source-media segment to split at the playhead.',
            'info'
        );
        expect(editor.ensureHistoryBaseline).not.toHaveBeenCalled();
        expect(editor.addToHistory).not.toHaveBeenCalled();
    });

    test('splitAtPlayhead uses the localized no-clip toast instead of the raw key when the selected track has clips', async () => {
        const editor = {
            withTrackAsActive: jest.fn((trackId, callback) => callback()),
            ensureHistoryBaseline: jest.fn(),
            addToHistory: jest.fn(),
            render: jest.fn()
        };

        const handler = new window.SubtitleEditorActionHandler(editor);
        handler.flow = {
            video: { currentTime: 8 },
            trackManager: {
                activeTrackId: 'main',
                tracks: [{ id: 'main', type: 'main', subtitles: [{ id: 's1', start: 1, end: 5 }] }]
            },
            timeline: {
                clipsManager: {
                    selectedTrackId: null
                }
            }
        };

        await handler.splitAtPlayhead();

        expect(window.app.showToast).toHaveBeenCalledWith('No subtitle, dubbing, or source-media segment to split at the playhead.', 'info');
    });
});
