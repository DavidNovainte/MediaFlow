const { __test__ } = require('../../../services/platforms/douyin');

describe('douyin concurrent download planning', () => {
    test('enables concurrent download for large byte-range responses', () => {
        expect(__test__.shouldUseConcurrentDownload({ 'accept-ranges': 'bytes' }, 12 * 1024 * 1024)).toBe(true);
    });

    test('keeps single-stream mode for small files or missing range support', () => {
        expect(__test__.shouldUseConcurrentDownload({ 'accept-ranges': 'bytes' }, 1024 * 1024)).toBe(false);
        expect(__test__.shouldUseConcurrentDownload({}, 12 * 1024 * 1024)).toBe(false);
        expect(__test__.getConcurrentChunkCount(1024 * 1024)).toBe(1);
    });

    test('builds complete non-overlapping byte ranges', () => {
        expect(__test__.buildChunkRanges(10, 3)).toEqual([
            { start: 0, end: 3 },
            { start: 4, end: 7 },
            { start: 8, end: 9 }
        ]);
    });
});