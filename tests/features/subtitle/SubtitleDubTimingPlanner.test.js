/** @jest-environment jsdom */

describe('SubtitleDubTimingPlanner', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/dubbing/SubtitleDubTimingPlanner.js');
    });

    afterEach(() => {
        delete window.SubtitleDubTimingPlanner;
    });

    test('borrows nearby gap when adaptation allows it', () => {
        const planner = new window.SubtitleDubTimingPlanner();
        const subtitles = [
            { start: 0, end: 2, text: 'This is a much longer English subtitle line that still overruns even after borrowing nearby gaps.' },
            { start: 2.4, end: 4, text: 'Next line' }
        ];

        const plan = planner.buildPlanForSubtitle(subtitles, 0, {
            mode: 'balanced',
            allowGapBorrow: true,
            text: subtitles[0].text
        });

        expect(plan.originalDuration).toBe(2);
        expect(plan.borrowedGap).toBeGreaterThan(0);
        expect(plan.availableDuration).toBeGreaterThan(plan.originalDuration);
        expect(plan.estimatedRatio).toBeGreaterThan(1);
    });
});