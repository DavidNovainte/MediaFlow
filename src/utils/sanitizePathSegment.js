const CONTROL_CHAR_RANGES = `${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}`;
const INVALID_PATH_CHARS_RE = new RegExp(`[${CONTROL_CHAR_RANGES}<>:"/\\\\|?*]+`, 'g');

function sanitizePathSegment(value, options = {}) {
    const fallback = options.fallback || 'untitled';
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : 100;
    const replacement = options.replacement || ' ';

    let safeValue = String(value || '')
        .replace(INVALID_PATH_CHARS_RE, replacement)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    if (!safeValue) {
        safeValue = fallback;
    }

    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(safeValue)) {
        safeValue = `_${safeValue}`;
    }

    if (safeValue.length > maxLength) {
        safeValue = safeValue.slice(0, maxLength).trim().replace(/[. ]+$/g, '');
    }

    return safeValue || fallback;
}

module.exports = {
    sanitizePathSegment
};
