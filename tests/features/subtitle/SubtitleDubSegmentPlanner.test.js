/** @jest-environment jsdom */

describe('SubtitleDubSegmentPlanner', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/dubbing/SubtitleDubSegmentPlanner.js');
    });

    afterEach(() => {
        delete window.SubtitleDubSegmentPlanner;
    });

    test('splits long translated text into speech segments with pause budget', () => {
        const planner = new window.SubtitleDubSegmentPlanner();
        const plan = planner.buildPlanForSubtitle({
            text: 'When the signal dips, slow down a little, then continue forward.'
        }, 0, { mode: 'balanced', enabled: true });

        expect(plan.isSegmented).toBe(true);
        expect(plan.segmentCount).toBe(3);
        expect(plan.pauseDuration).toBeGreaterThan(0);
        expect(plan.speechText).toContain('slow down a little,');
    });

    test('keeps short text as a single speech segment', () => {
        const planner = new window.SubtitleDubSegmentPlanner();
        const plan = planner.buildPlanForSubtitle({
            text: 'Short line'
        }, 0, { mode: 'balanced', enabled: true });

        expect(plan.isSegmented).toBe(false);
        expect(plan.segmentCount).toBe(1);
        expect(plan.pauseDuration).toBe(0);
        expect(plan.segments[0].text).toBe('Short line');
    });
});