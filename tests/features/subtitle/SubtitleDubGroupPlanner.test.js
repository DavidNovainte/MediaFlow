/** @jest-environment jsdom */

describe('SubtitleDubGroupPlanner', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/dubbing/SubtitleDubTimingPlanner.js');
        require('../../../src/features/subtitle/dubbing/SubtitleDubSegmentPlanner.js');
        require('../../../src/features/subtitle/dubbing/SubtitleDubGroupPlanner.js');
    });

    afterEach(() => {
        delete window.SubtitleDubTimingPlanner;
        delete window.SubtitleDubSegmentPlanner;
        delete window.SubtitleDubGroupPlanner;
    });

    test('groups adjacent subtitles when pooled timing adds usable target chars', () => {
        const timingPlanner = new window.SubtitleDubTimingPlanner();
        const segmentPlanner = new window.SubtitleDubSegmentPlanner();
        const groupPlanner = new window.SubtitleDubGroupPlanner({ timingPlanner, segmentPlanner });
        const subtitles = [
            { start: 0, end: 0.7, text: 'Short line.' },
            { start: 0.82, end: 1.52, text: 'This second line is much longer and needs more English dubbing time than the short line before it.' }
        ];
        const contexts = subtitles.map((subtitle, index) => {
            const segmentPlan = segmentPlanner.buildPlanForSubtitle(subtitle, index, {
                mode: 'strict',
                enabled: true,
                text: subtitle.text
            });

            return {
                shouldAdapt: true,
                baseText: subtitle.text,
                segmentPlan,
                plan: timingPlanner.buildPlanForSubtitle(subtitles, index, {
                    mode: 'strict',
                    allowGapBorrow: false,
                    text: segmentPlan.speechText,
                    pauseDuration: segmentPlan.pauseDuration
                })
            };
        });

        const groups = groupPlanner.buildGroups(subtitles, contexts, { mode: 'strict' });

        expect(groups).toHaveLength(1);
        expect(groups[0]).toEqual(expect.objectContaining({
            startIndex: 0,
            endIndex: 1
        }));
        expect(groups[0].plan.targetChars).toBeGreaterThan(groups[0].memberTargetChars);
    });
});