/** @jest-environment jsdom */

describe('CreatorFlowBootstrap', () => {
    beforeAll(() => {
        require('../../../src/features/video/flow/core/CreatorFlowBootstrap');
    });

    it('binds timeline seek events to preview and paused audio sync', () => {
        const snapshot = { audio: [] };
        const flow = {
            timelineManager: { currentTime: 12.5 },
            previewHandler: {
                seekTo: jest.fn(),
                alignPlaybackToTimeline: jest.fn(),
                getPlaybackSnapshot: jest.fn(() => snapshot)
            },
            audioMixer: {
                sync: jest.fn()
            }
        };

        const bootstrap = new window.CreatorFlowBootstrap(flow);
        bootstrap.bindTimelinePreviewSync();

        expect(typeof flow.timelineManager.onSeek).toBe('function');

        flow.timelineManager.onSeek(5.0, 7.25);

        expect(flow.previewHandler.seekTo).toHaveBeenCalledWith(7.25);
        expect(flow.previewHandler.alignPlaybackToTimeline).toHaveBeenCalledTimes(1);
        expect(flow.previewHandler.getPlaybackSnapshot).toHaveBeenCalledWith(12.5);
        expect(flow.audioMixer.sync).toHaveBeenCalledWith(12.5, false, snapshot);
    });
});
