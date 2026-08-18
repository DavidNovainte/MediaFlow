/** @jest-environment jsdom */

describe('CreatorSubtitleCutActions', () => {
    beforeAll(() => {
        require('../../../../src/features/video/integration/CreatorSubtitleProject');
        require('../../../../src/features/video/integration/CreatorSubtitleCutActions');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="btn-timeline-subtitle-cuts" class="hidden">
                <span class="subtitle-cut-count"></span>
            </button>
        `;
        window.i18n = {
            t: jest.fn((key) => key)
        };
    });

    it('creates a compact timeline from subtitle segments', async () => {
        const timelineManager = {
            tracks: {
                v1: { id: 'v1', segments: [] },
                a1: { id: 'a1', segments: [] }
            },
            duration: 20,
            selectedTrackId: 'v1',
            selectedSegmentIndex: -1,
            currentTime: 0,
            captureState: jest.fn(() => ({ snapshot: true })),
            renderAll: jest.fn(),
            syncSegmentsWithApp: jest.fn(),
            updatePlayheadPosition: jest.fn()
        };
        const flow = {
            localizedEditProject: {
                metadata: { activeTrackId: 'main-1' },
                subtitleTracks: [
                    {
                        id: 'main-1',
                        visible: true,
                        segments: [
                            { id: 's1', start: 4, end: 5.5, displayText: 'Hello' },
                            { id: 's2', start: 8, end: 10, displayText: 'World' }
                        ]
                    }
                ]
            },
            timelineManager,
            videoFile: { path: 'C:/video/sample.mp4', name: 'sample.mp4' },
            audioFile: null,
            isAudioOnly: false,
            cloneMediaRef: jest.fn((value) => ({ ...value })),
            showToast: jest.fn(),
            subtitleLaneManager: {
                render: jest.fn()
            },
            subtitlePreviewOverlay: {
                render: jest.fn()
            },
            subtitleAudioTrackImporter: {
                syncProject: jest.fn()
            },
            history: {
                execute: jest.fn(async (command) => {
                    await command.execute();
                })
            }
        };
        timelineManager.onSeek = jest.fn();

        const actions = new window.CreatorSubtitleCutActions(flow);
        actions.init();
        const applied = actions.applyCutsFromSubtitles();
        await Promise.resolve();

        expect(applied).toBe(true);
        expect(flow.history.execute).toHaveBeenCalled();
        expect(timelineManager.tracks.v1.segments).toHaveLength(2);
        expect(timelineManager.tracks.v1.segments[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 1.5,
            sourceStart: 4
        }));
        expect(timelineManager.tracks.v1.segments[1]).toEqual(expect.objectContaining({
            start: 1.5,
            end: 3.5,
            sourceStart: 8
        }));
        expect(timelineManager.tracks.a1.segments).toHaveLength(2);
        expect(flow.subtitleAudioTrackImporter.syncProject).toHaveBeenCalledWith(flow.localizedEditProject, { timelineMode: 'compact' });
        expect(timelineManager.onSeek).toHaveBeenCalledWith(0, 4);
        expect(flow.subtitleLaneManager.render).toHaveBeenCalled();
        expect(flow.subtitlePreviewOverlay.render).toHaveBeenCalledWith(0);
        expect(flow.showToast).toHaveBeenCalledWith('creator.toasts.subtitleCutsApplied', 'success');
    });
});
