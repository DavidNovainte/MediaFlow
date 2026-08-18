/** @jest-environment jsdom */

describe('SubtitleAudioActionHandler clip deletion', () => {
    beforeEach(() => {
        jest.resetModules();

        window.app = {
            showToast: jest.fn()
        };

        require('../../../src/features/subtitle/SubtitleAudioActionHandler.js');
    });

    afterEach(() => {
        delete window.app;
        delete window.SubtitleAudioActionHandler;
    });

    test('deleteSelectedClips removes selected audio clips and refreshes the active audio track UI', async () => {
        const track = {
            id: 'audio-1',
            type: 'audio',
            subtitles: [
                { id: 'clip-1', selected: true },
                { id: 'clip-2', selected: false }
            ]
        };

        const clipsManager = {
            selectedTrackId: 'audio-1',
            selectedIndices: new Set([0]),
            lastSelectedIndex: 0
        };

        const flow = {
            trackManager: {
                activeTrackId: 'audio-1',
                tracks: [track]
            },
            timeline: {
                clipsManager,
                render: jest.fn()
            },
            editor: {
                withTrackAsActive: jest.fn((trackId, callback) => callback()),
                ensureHistoryBaseline: jest.fn(),
                addToHistory: jest.fn(),
                render: jest.fn(),
                activeSubtitleIndex: 4
            },
            audioManager: {
                syncTracks: jest.fn()
            }
        };

        const handler = new window.SubtitleAudioActionHandler(flow);
        const deleted = await handler.deleteSelectedClips();

        expect(deleted).toBe(true);
        expect(track.subtitles).toEqual([{ id: 'clip-2', selected: false }]);
        expect(flow.editor.ensureHistoryBaseline).toHaveBeenCalled();
        expect(flow.editor.activeSubtitleIndex).toBe(-1);
        expect(flow.editor.render).toHaveBeenCalledWith(track.subtitles);
        expect(flow.timeline.render).not.toHaveBeenCalled();
        expect(flow.audioManager.syncTracks).toHaveBeenCalled();
        expect(flow.editor.addToHistory).toHaveBeenCalled();
        expect(clipsManager.selectedTrackId).toBeNull();
        expect(clipsManager.selectedIndices.size).toBe(0);
        expect(clipsManager.lastSelectedIndex).toBeNull();
        expect(window.app.showToast).toHaveBeenCalledWith('Audio clip deleted', 'success');
    });
});