const {
    createProgressThrottler,
    resolveImageConcurrency
} = require('../../src/utils/progressThrottle');

describe('progressThrottle', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('resolveImageConcurrency clamps and defaults', () => {
        expect(resolveImageConcurrency({}, 10, {})).toBe(3);
        expect(resolveImageConcurrency({}, 100, {})).toBe(2);
        expect(resolveImageConcurrency({}, 5, { ai: true })).toBe(1);
        expect(resolveImageConcurrency({ concurrency: 9 }, 5)).toBe(6);
        expect(resolveImageConcurrency({ concurrency: 0 }, 5)).toBe(3);
        expect(resolveImageConcurrency({ concurrency: 2 }, 5)).toBe(2);
    });

    test('throttles rapid updates and always flushes 100%', () => {
        const sent = [];
        const t = createProgressThrottler((p) => sent.push(p), { minIntervalMs: 200 });

        t.send({ progress: 1 });
        t.send({ progress: 2 });
        t.send({ progress: 3 });
        expect(sent.length).toBeLessThanOrEqual(1);

        jest.advanceTimersByTime(250);
        expect(sent.length).toBeGreaterThanOrEqual(1);

        t.send({ progress: 100 }, true);
        expect(sent[sent.length - 1].progress).toBe(100);
    });
});
