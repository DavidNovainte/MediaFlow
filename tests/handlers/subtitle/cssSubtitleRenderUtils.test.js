const {
    buildRenderIntervals,
    getKaraokeTimeline,
    tokenizeKaraokeText
} = require('../../../src/handlers/subtitle/cssSubtitleRenderUtils');

describe('cssSubtitleRenderUtils', () => {
    test('keeps a wrapped single English word as one karaoke token', () => {
        expect(tokenizeKaraokeText('Breakfast', { karaokeStyle: 'highlight' })).toEqual([
            { text: 'Breakfast', type: 'timed' }
        ]);
    });

    test('splits complex-script karaoke text by character', () => {
        expect(tokenizeKaraokeText('\u6311\u6218', { karaokeStyle: 'highlight' })).toEqual([
            { text: '\u6311', type: 'timed' },
            { text: '\u6218', type: 'timed' }
        ]);
    });

    test('prefers aligned word timings when source words match the displayed text', () => {
        const timeline = getKaraokeTimeline({
            start: 5,
            end: 6,
            karaokeText: 'Rolling Pin',
            words: [
                { text: 'Rolling', start: 5, end: 5.4 },
                { text: 'Pin', start: 5.4, end: 6 }
            ]
        }, { karaokeStyle: 'highlight' });

        expect(timeline.tokens).toEqual([
            { text: 'Rolling', type: 'timed' },
            { text: ' ', type: 'space' },
            { text: 'Pin', type: 'timed' }
        ]);
        expect(timeline.segments).toEqual([
            { start: 5, end: 5.4, timedIndex: 0 },
            { start: 5.4, end: 6, timedIndex: 1 }
        ]);
    });

    test('builds highlight intervals without splitting wrapped English words into letters', () => {
        const intervals = buildRenderIntervals([
            {
                id: 1,
                style: { enableKaraoke: true, karaokeStyle: 'highlight' },
                subtitles: [
                    {
                        id: 'a',
                        start: 4,
                        end: 5,
                        karaokeText: 'Breakfast',
                        text: 'Breakfast'
                    }
                ]
            }
        ], 8, 24);

        const breakfastIntervals = intervals.filter(interval => interval.start >= 4 && interval.end <= 5);
        expect(breakfastIntervals).toHaveLength(1);
        expect(breakfastIntervals[0]).toMatchObject({
            start: 4,
            end: 5,
            sampleTime: 4.5
        });
    });
});
