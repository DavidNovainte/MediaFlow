/**
 * Map raw download / yt-dlp errors to i18n-friendly user messages.
 * Browser: window.mapDownloadError; Node tests can require this file.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.mapDownloadError = api.mapDownloadError;
        root.DownloadErrorMap = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
    function t(key, fallback, vars) {
        try {
            if (typeof window !== 'undefined' && window.i18n?.t) {
                const translated = window.i18n.t(key, vars);
                // Prefer i18n output when present (identity mock returns the key itself)
                if (translated !== null && translated !== undefined && translated !== '') return translated;
            }
        } catch {
            /* ignore */
        }
        if (vars && typeof fallback === 'string') {
            return fallback.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== null && vars[k] !== undefined ? String(vars[k]) : ''));
        }
        return fallback;
    }

    /**
     * @param {Error|string|{error?:string,message?:string}|null|undefined} error
     * @returns {string}
     */
    function mapDownloadError(error) {
        let msg = '';
        let code = '';
        if (error === null || error === undefined) {
            msg = '';
        } else if (typeof error === 'string') {
            msg = error;
            code = error;
        } else if (error instanceof Error) {
            msg = error.message || '';
            code = error.code || msg;
        } else if (typeof error === 'object') {
            msg = error.message || error.error || String(error);
            code = error.error || error.code || msg;
        } else {
            msg = String(error);
            code = msg;
        }

        const haystack = `${code} ${msg}`;

        if (/YTDLP_MISSING|yt-dlp not found|Binary missing|Failed to start yt-dlp/i.test(haystack)) {
            return t(
                'download.errors.ytdlpMissing',
                'yt-dlp is missing. Open Settings → Core engines to fix, or reinstall the app.'
            );
        }
        if (/FFMPEG_MISSING|ffmpeg not found/i.test(haystack)) {
            return t(
                'download.errors.ffmpegMissing',
                'ffmpeg is missing. Open Settings → Core engines for merge/remux support.'
            );
        }
        if (/Unsupported URL/i.test(haystack)) {
            return t('download.errors.unsupportedUrl', 'This link is not supported for archival');
        }
        if (/Video unavailable|404/i.test(haystack)) {
            return t('download.errors.videoUnavailable', 'Video unavailable or deleted');
        }
        if (/Private video|Private/i.test(haystack)) {
            return t('download.errors.privateVideo', 'Private or restricted video. Unable to archive');
        }
        if (/age[- ]?restricted|confirm your age|inappropriate for some users/i.test(haystack)) {
            return t(
                'download.errors.ageRestricted',
                'This video is age-restricted. Sync logged-in browser cookies and try again.'
            );
        }
        if (/Sign in|Login required|members-only|members only|Join this channel|401|403|Forbidden|authRequired|cookies? (are )?(needed|required)|Please (log|sign) in/i.test(haystack)) {
            return t('download.errors.authRequired', 'This platform requires login. Sync browser cookies and try again');
        }
        if (/ENOSPC|no space left|disk (is )?full|not enough space|There is not enough space/i.test(haystack)) {
            return t(
                'download.errors.diskFull',
                'Disk is full or the save folder has no free space. Free up space or change the download path in Settings.'
            );
        }
        if (/EPERM|EACCES|permission denied|Access is denied|readonly file system/i.test(haystack)) {
            return t(
                'download.errors.permissionDenied',
                'Cannot write to the save folder. Check folder permissions or pick another path in Settings.'
            );
        }
        if (/429|Too Many Requests|rate[_ -]?limit|HTTP Error 429/i.test(haystack)) {
            return t(
                'download.errors.rateLimited',
                'Too many requests. Wait a moment, lower concurrency in Settings, or try again later.'
            );
        }
        if (/network|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|getaddrinfo/i.test(haystack)) {
            return t('download.errors.networkError', 'Network connection failed, please check your network or proxy settings');
        }
        if (/No video formats found|noFormats|Requested format is not available/i.test(haystack)) {
            return t('download.errors.noFormats', 'No available video formats found, please try another link');
        }
        if (/Geo-restricted|geo[_ -]?restricted|not available in your country|blocked in your country/i.test(haystack)) {
            return t('download.errors.geoRestricted', 'This video is geo-restricted and cannot be archived');
        }
        if (/timed out|timeout/i.test(haystack)) {
            return t('download.errors.timeout', 'Request timed out. Check your network and try again.');
        }
        if (/Invalid URL|invalid_url/i.test(haystack)) {
            return t('download.errors.invalid_url', 'Invalid URL format');
        }
        if (/CANCELLED_BY_USER|canceled by user|cancelled by user|Download cancelled|user aborted/i.test(haystack)) {
            return t('download.cancelled', 'Archive cancelled');
        }
        if (/SSL|certificate|UNABLE_TO_VERIFY|CERT_/i.test(haystack)) {
            return t(
                'download.errors.sslError',
                'Secure connection failed (SSL/certificate). Check proxy, VPN, or system time.'
            );
        }
        if (/Postprocessing|ERROR: Post/i.test(haystack)) {
            return t(
                'download.errors.postprocessFailed',
                'Download finished but post-processing failed. Ensure ffmpeg is installed (Settings → Core engines).'
            );
        }

        if (msg) {
            return t('download.errors.unknownError', `An unknown error occurred: ${msg}`, { message: msg });
        }
        return t('download.error', 'Archive failed');
    }

    return { mapDownloadError };
});
