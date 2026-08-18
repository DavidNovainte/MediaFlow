/**
 * Error Utils Tests
 */

// Mock module for testing URL validation pattern
const isValidMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

describe('isValidMediaUrl', () => {
    test('should accept valid http URLs', () => {
        expect(isValidMediaUrl('http://example.com/video.mp4')).toBe(true);
        expect(isValidMediaUrl('http://youtube.com/watch?v=123')).toBe(true);
    });

    test('should accept valid https URLs', () => {
        expect(isValidMediaUrl('https://example.com/video.mp4')).toBe(true);
        expect(isValidMediaUrl('https://youtube.com/watch?v=123')).toBe(true);
    });

    test('should reject invalid protocols', () => {
        expect(isValidMediaUrl('file:///etc/passwd')).toBe(false);
        expect(isValidMediaUrl('javascript:alert(1)')).toBe(false);
        expect(isValidMediaUrl('ftp://example.com/file')).toBe(false);
    });

    test('should reject invalid URLs', () => {
        expect(isValidMediaUrl('')).toBe(false);
        expect(isValidMediaUrl(null)).toBe(false);
        expect(isValidMediaUrl(undefined)).toBe(false);
        expect(isValidMediaUrl('not-a-url')).toBe(false);
    });

    test('should reject non-string inputs', () => {
        expect(isValidMediaUrl(123)).toBe(false);
        expect(isValidMediaUrl({})).toBe(false);
        expect(isValidMediaUrl([])).toBe(false);
    });
});

describe('URL parsing edge cases', () => {
    test('should handle URLs with special characters', () => {
        expect(isValidMediaUrl('https://example.com/video?title=hello%20world')).toBe(true);
        expect(isValidMediaUrl('https://example.com/path/to/video#fragment')).toBe(true);
    });

    test('should handle URLs with authentication', () => {
        expect(isValidMediaUrl('https://user:pass@example.com/video')).toBe(true);
    });

    test('should handle URLs with ports', () => {
        expect(isValidMediaUrl('https://example.com:8080/video')).toBe(true);
        expect(isValidMediaUrl('http://localhost:3000/video')).toBe(true);
    });
});
