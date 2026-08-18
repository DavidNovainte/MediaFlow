/** @jest-environment jsdom */

describe('CreatorSubtitleProject', () => {
    beforeAll(() => {
        require('../../../../src/features/video/integration/CreatorSubtitleProject');
    });

    it('prefers the active subtitle track when building compact segments', () => {
        const project = {
            metadata: { activeTrackId: 'track-2' },
            subtitleTracks: [
                {
                    id: 'track-1',
                    visible: true,
                    segments: [{ id: 'a', start: 0, end: 1 }]
                },
                {
                    id: 'track-2',
                    visible: true,
                    segments: [
                        { id: 'b', start: 5, end: 6.5 },
                        { id: 'c', start: 8, end: 10 }
                    ]
                }
            ]
        };

        const result = window.CreatorSubtitleProject.buildCompactTimeline(project, { path: 'C:/video.mp4' });

        expect(result.track.id).toBe('track-2');
        expect(result.videoSegments).toHaveLength(2);
        expect(result.videoSegments[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 1.5,
            sourceStart: 5,
            sourceEnd: 6.5
        }));
        expect(result.videoSegments[1]).toEqual(expect.objectContaining({
            start: 1.5,
            end: 3.5,
            sourceStart: 8,
            sourceEnd: 10
        }));
        expect(result.duration).toBeCloseTo(3.5, 5);
        expect(result.firstSourceStart).toBe(5);
    });
});
