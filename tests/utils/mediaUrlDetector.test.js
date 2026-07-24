const {
    isCapturableMediaUrl,
    extractCapturableMediaUrls,
    extractUrls,
    detectPlatformLabel,
    normalizeMode
} = require('../../src/utils/mediaUrlDetector');

describe('mediaUrlDetector', () => {
    describe('isCapturableMediaUrl (strict major platforms)', () => {
        test('accepts real YouTube watch / shorts / youtu.be', () => {
            expect(isCapturableMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
            expect(isCapturableMediaUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
            expect(isCapturableMediaUrl('https://www.youtube.com/shorts/abc123XYZ0')).toBe(true);
            expect(isCapturableMediaUrl('https://www.youtube.com/playlist?list=PLtest')).toBe(true);
        });

        test('rejects YouTube homepage / search / channel shell', () => {
            expect(isCapturableMediaUrl('https://www.youtube.com/')).toBe(false);
            expect(isCapturableMediaUrl('https://www.youtube.com/results?search_query=music')).toBe(false);
            expect(isCapturableMediaUrl('https://www.youtube.com/feed/trending')).toBe(false);
            expect(isCapturableMediaUrl('https://www.youtube.com/account')).toBe(false);
        });

        test('accepts TikTok video / short share, rejects profile', () => {
            expect(
                isCapturableMediaUrl('https://www.tiktok.com/@user/video/7123456789012345678')
            ).toBe(true);
            expect(isCapturableMediaUrl('https://vm.tiktok.com/ZMabcdef/')).toBe(true);
            expect(isCapturableMediaUrl('https://www.tiktok.com/@user')).toBe(false);
            expect(isCapturableMediaUrl('https://www.tiktok.com/')).toBe(false);
        });

        test('accepts Douyin / Bilibili / Instagram / X / Facebook paths', () => {
            expect(isCapturableMediaUrl('https://www.douyin.com/video/7123456789012345678')).toBe(true);
            expect(isCapturableMediaUrl('https://v.douyin.com/iJabcXYZ/')).toBe(true);
            expect(isCapturableMediaUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
            expect(isCapturableMediaUrl('https://b23.tv/abcdef')).toBe(true);
            expect(isCapturableMediaUrl('https://www.instagram.com/reel/AbCdEf123/')).toBe(true);
            expect(isCapturableMediaUrl('https://x.com/user/status/1234567890')).toBe(true);
            expect(isCapturableMediaUrl('https://www.facebook.com/watch/?v=123')).toBe(true);
            expect(isCapturableMediaUrl('https://fb.watch/abc123/')).toBe(true);
        });

        test('rejects random non-media sites in balanced default', () => {
            expect(isCapturableMediaUrl('https://github.com/yt-dlp/yt-dlp')).toBe(false);
            expect(isCapturableMediaUrl('https://google.com/search?q=video')).toBe(false);
            expect(isCapturableMediaUrl('ftp://youtube.com/watch?v=x')).toBe(false);
        });
    });

    describe('other websites / modes', () => {
        test('balanced accepts extended platforms', () => {
            expect(
                isCapturableMediaUrl(
                    'https://www.reddit.com/r/videos/comments/abc123/title/',
                    'balanced'
                )
            ).toBe(true);
            expect(isCapturableMediaUrl('https://www.twitch.tv/videos/123456789', 'balanced')).toBe(
                true
            );
            expect(
                isCapturableMediaUrl('https://www.xiaohongshu.com/explore/64abcdef', 'balanced')
            ).toBe(true);
            expect(isCapturableMediaUrl('https://xhslink.com/a/AbCdEf', 'balanced')).toBe(true);
        });

        test('balanced accepts direct media files on any host', () => {
            expect(
                isCapturableMediaUrl('https://cdn.example.com/files/demo.mp4', 'balanced')
            ).toBe(true);
            expect(
                isCapturableMediaUrl('https://stream.example.org/live/index.m3u8', 'balanced')
            ).toBe(true);
        });

        test('balanced accepts generic video path shapes on unknown hosts', () => {
            expect(
                isCapturableMediaUrl('https://news.example.com/watch?v=abc123', 'balanced')
            ).toBe(true);
            expect(
                isCapturableMediaUrl('https://portal.example.com/video/episode-1', 'balanced')
            ).toBe(true);
        });

        test('strict rejects extended / generic hosts', () => {
            expect(
                isCapturableMediaUrl(
                    'https://www.reddit.com/r/videos/comments/abc123/title/',
                    'strict'
                )
            ).toBe(false);
            expect(
                isCapturableMediaUrl('https://portal.example.com/video/episode-1', 'strict')
            ).toBe(false);
            // direct files still ok
            expect(isCapturableMediaUrl('https://cdn.example.com/a.mp4', 'strict')).toBe(true);
        });

        test('loose accepts deep unknown links but not google/github homepages', () => {
            expect(
                isCapturableMediaUrl('https://blog.example.com/posts/my-cool-article-2024', 'loose')
            ).toBe(true);
            expect(isCapturableMediaUrl('https://github.com/yt-dlp/yt-dlp', 'loose')).toBe(false);
            expect(isCapturableMediaUrl('https://www.google.com/search?q=x', 'loose')).toBe(false);
        });

        test('normalizeMode defaults', () => {
            expect(normalizeMode('')).toBe('balanced');
            expect(normalizeMode('STRICT')).toBe('strict');
            expect(normalizeMode('nope')).toBe('balanced');
        });
    });

    describe('extractCapturableMediaUrls', () => {
        test('pulls media URL out of Chinese share text', () => {
            const text =
                '【抖音】看这个 7.8 https://v.douyin.com/iJabcXYZ/ 复制此链接，打开Douyin搜索';
            expect(extractCapturableMediaUrls(text)).toEqual(['https://v.douyin.com/iJabcXYZ/']);
        });

        test('ignores homepage mixed with text', () => {
            const text = '打开 https://www.youtube.com/ 看看';
            expect(extractCapturableMediaUrls(text)).toEqual([]);
        });

        test('extracts multiple real video lines', () => {
            const text = [
                'https://www.youtube.com/watch?v=aaaaaaaaaaa',
                'https://www.bilibili.com/video/BV1xx411c7mD',
                'https://www.youtube.com/feed/subscriptions'
            ].join('\n');
            expect(extractCapturableMediaUrls(text)).toEqual([
                'https://www.youtube.com/watch?v=aaaaaaaaaaa',
                'https://www.bilibili.com/video/BV1xx411c7mD'
            ]);
        });
    });

    describe('extractUrls / platform label', () => {
        test('strips trailing punctuation', () => {
            expect(extractUrls('see https://youtu.be/dQw4w9WgXcQ.')).toEqual([
                'https://youtu.be/dQw4w9WgXcQ'
            ]);
        });

        test('detectPlatformLabel', () => {
            expect(detectPlatformLabel('https://youtu.be/x')).toBe('YouTube');
            expect(detectPlatformLabel('https://x.com/a/status/1')).toBe('Twitter/X');
            expect(detectPlatformLabel('https://cdn.x/a.mp4')).toBe('媒体文件');
        });
    });
});
