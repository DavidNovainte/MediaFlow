/**
 * @jest-environment jsdom
 */
const { mapDownloadError } = require('../../src/utils/downloadErrorMap');

describe('mapDownloadError', () => {
    beforeEach(() => {
        window.i18n = {
            t: (key, params) => {
                if (key === 'download.errors.ytdlpMissing') return 'YTDLP_FRIENDLY';
                if (key === 'download.errors.ffmpegMissing') return 'FFMPEG_FRIENDLY';
                if (key === 'common.proOnly') return 'PRO_ONLY';
                if (key === 'download.errors.unknownError') {
                    return `UNKNOWN:${params?.message || ''}`;
                }
                return key;
            }
        };
    });

    it('maps YTDLP_MISSING', () => {
        expect(mapDownloadError({ error: 'YTDLP_MISSING', message: 'yt-dlp not found' })).toBe('YTDLP_FRIENDLY');
        expect(mapDownloadError('Failed to start yt-dlp: ENOENT')).toBe('YTDLP_FRIENDLY');
    });

    it('maps ffmpeg missing', () => {
        expect(mapDownloadError({ code: 'FFMPEG_MISSING', message: 'ffmpeg not found' })).toBe('FFMPEG_FRIENDLY');
    });

    it('returns i18n key when mock is identity', () => {
        window.i18n.t = (key) => key;
        expect(mapDownloadError(new Error('Private video'))).toBe('download.errors.privateVideo');
    });

    it('maps disk full / permission / rate limit / age / cookies', () => {
        window.i18n.t = (key) => key;
        expect(mapDownloadError('ENOSPC: no space left on device')).toBe('download.errors.diskFull');
        expect(mapDownloadError('EACCES: permission denied')).toBe('download.errors.permissionDenied');
        expect(mapDownloadError('HTTP Error 429: Too Many Requests')).toBe('download.errors.rateLimited');
        // Prefer age-restricted over generic auth when both phrases appear
        expect(mapDownloadError('confirm your age to continue')).toBe('download.errors.ageRestricted');
        expect(mapDownloadError('ERROR: cookies are needed')).toBe('download.errors.authRequired');
        expect(mapDownloadError('not available in your country')).toBe('download.errors.geoRestricted');
        expect(mapDownloadError('Download cancelled by user')).toBe('download.cancelled');
        expect(mapDownloadError('ERROR: Postprocessing: ffmpeg failed')).toBe(
            'download.errors.postprocessFailed'
        );
    });
});
