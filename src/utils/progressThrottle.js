/**
 * progressThrottle.js — throttle high-frequency progress IPC to the renderer.
 * Always flushes terminal events (100%, force, done/error/cancelled).
 */

/**
 * @param {(payload: any) => void} sendFn
 * @param {{ minIntervalMs?: number }} [options]
 * @returns {{ send: (data: any, force?: boolean) => void, flush: () => void }}
 */
function createProgressThrottler(sendFn, options = {}) {
    const minIntervalMs = Math.max(50, Number(options.minIntervalMs) || 200);
    let lastSentAt = 0;
    let lastFloor = -1;
    let pending = null;
    let timer = null;

    const isTerminal = (data) => {
        if (!data || typeof data !== 'object') return false;
        if (data.force === true || data.done === true) return true;
        if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled' || data.status === 'failed') {
            return true;
        }
        if (typeof data.progress === 'number' && data.progress >= 100) return true;
        return false;
    };

    const flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (pending == null) return;
        const payload = pending;
        pending = null;
        lastSentAt = Date.now();
        if (typeof payload?.progress === 'number') {
            lastFloor = Math.floor(payload.progress);
        }
        try {
            sendFn(payload);
        } catch (err) {
            void err;
        }
    };

    /**
     * @param {any} data
     * @param {boolean} [force]
     */
    const send = (data, force = false) => {
        const terminal = force || isTerminal(data);
        const now = Date.now();
        const floor = typeof data?.progress === 'number' ? Math.floor(data.progress) : null;

        if (terminal) {
            pending = null;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastSentAt = now;
            if (floor !== null) lastFloor = floor;
            try {
                sendFn(data);
            } catch (err) {
                void err;
            }
            return;
        }

        // Integer percent advance after interval → send now
        const advanced = floor !== null && floor > lastFloor;
        if (advanced && now - lastSentAt >= minIntervalMs) {
            pending = null;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastSentAt = now;
            lastFloor = floor;
            try {
                sendFn(data);
            } catch (err) {
                void err;
            }
            return;
        }

        // Coalesce speed-only / same-percent / sub-integer updates
        pending = data;
        if (!timer) {
            const wait = Math.max(0, minIntervalMs - (now - lastSentAt));
            timer = setTimeout(flush, wait);
        }
    };

    return { send, flush };
}

/**
 * Clamp image-batch concurrency with sensible defaults.
 * @param {object} [options]
 * @param {number} [fileCount]
 * @param {{ ai?: boolean }} [flags]
 */
function resolveImageConcurrency(options = {}, fileCount = 0, flags = {}) {
    let n = Number(options.concurrency);
    if (!Number.isFinite(n) || n < 1) {
        if (flags.ai) n = 1;
        else if (fileCount > 80) n = 2;
        else if (fileCount > 30) n = 3;
        else n = 3;
    }
    return Math.min(6, Math.max(1, Math.floor(n)));
}

module.exports = {
    createProgressThrottler,
    resolveImageConcurrency
};
