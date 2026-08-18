const {
    buildAtempoValues,
    buildAtempoFilterChain
} = require('../../../src/services/export/audioFilterUtils');

describe('audioFilterUtils', () => {
    test('builds chained atempo values for speeds below 0.5', () => {
        expect(buildAtempoValues(0.25)).toEqual([0.5, 0.5]);
    });

    test('keeps a single atempo value in the supported range', () => {
        expect(buildAtempoValues(1.5)).toEqual([1.5]);
    });

    test('builds chained atempo values for speeds above 2', () => {
        expect(buildAtempoValues(4)).toEqual([2, 2]);
    });

    test('returns filter strings', () => {
        expect(buildAtempoFilterChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
    });
});
