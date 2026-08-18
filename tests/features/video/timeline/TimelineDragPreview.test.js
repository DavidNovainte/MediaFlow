/** @jest-environment jsdom */

describe('TimelineDragPreview', () => {
    beforeAll(() => {
        require('../../../../src/features/video/timeline/core/TimelineDragPreview');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="track-v1" class="timeline-track video-track"></div>
            <div id="track-a1" class="timeline-track audio-track"></div>
        `;
    });

    function createManager() {
        return {
            duration: 30,
            dragOriginalStart: 0,
            dragOriginalEnd: 4,
            dragTargetTrackId: 'v1',
            dragTargetIndex: 0,
            dragOriginalTrackIndex: 0,
            dragAutoCreateLimit: { video: 2, audio: 2 },
            dragLinkedSegments: [],
            timelineBody: {
                scrollLeft: 0,
                scrollTop: 0,
                getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 400 })
            },
            tracks: {
                v1: {
                    id: 'v1',
                    segments: [
                        { start: 0, end: 4, groupId: 'g1' },
                        { start: 8, end: 12, groupId: 'g2' }
                    ]
                }
            },
            calculateSnap: jest.fn((time) => time),
            getTrackOrder: jest.fn(() => ['v1']),
            getTrackIndex: jest.fn(() => 0),
            parseTrackNumber: jest.fn(() => 1)
        };
    }

    it('clamps drag preview before overlapping the next segment', () => {
        const manager = createManager();
        const mainSeg = manager.tracks.v1.segments[0];

        const result = window.TimelineDragPreview.previewDrag(
            manager,
            { clientX: 300, clientY: 20 },
            mainSeg,
            4,
            6.5
        );

        expect(result.hoveredTrackId).toBe('v1');
        expect(mainSeg.start).toBe(4);
        expect(mainSeg.end).toBe(8);
    });

    it('clamps drag preview after overlapping the previous segment when dragging left', () => {
        const manager = createManager();
        manager.tracks.v1.segments = [
            { start: 0, end: 3, groupId: 'g1' },
            { start: 6, end: 10, groupId: 'g2' }
        ];
        manager.dragOriginalStart = 6;
        manager.dragOriginalEnd = 10;
        manager.dragTargetIndex = 1;

        const mainSeg = manager.tracks.v1.segments[1];

        window.TimelineDragPreview.previewDrag(
            manager,
            { clientX: 100, clientY: 20 },
            mainSeg,
            4,
            -5
        );

        expect(mainSeg.start).toBe(3);
        expect(mainSeg.end).toBe(7);
    });
});
