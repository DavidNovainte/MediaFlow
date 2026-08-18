const COMPLEX_SCRIPT_RE = /[\u3400-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff]/i;
const DEFAULT_RENDER_FPS = 10;
const DEFAULT_PROGRESS_RENDER_FPS = 10;
const DEFAULT_ANIMATION_RENDER_FPS = 10;
const EPSILON = 1e-4;

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, '');
}

function usesComplexScript(text) {
    return COMPLEX_SCRIPT_RE.test(String(text || ''));
}

function tokenizeKaraokeText(text, style = {}) {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return [];

    const styleMode = style.karaokeStyle || 'highlight';
    const tokens = [];

    raw.split('\n').forEach((line, lineIndex, lines) => {
        const shouldSplitByWord = /\s/.test(line.trim()) && styleMode !== 'progress';

        if (shouldSplitByWord) {
            line.split(/(\s+)/).filter(Boolean).forEach((part) => {
                if (/^\s+$/.test(part)) {
                    tokens.push({ text: part, type: 'space' });
                } else {
                    tokens.push({ text: part, type: 'timed' });
                }
            });
        } else if (usesComplexScript(line)) {
            Array.from(line).forEach((char) => {
                if (/^\s$/.test(char)) tokens.push({ text: char, type: 'space' });
                else tokens.push({ text: char, type: 'timed' });
            });
        } else {
            tokens.push({ text: line, type: 'timed' });
        }

        if (lineIndex < lines.length - 1) {
            tokens.push({ text: '\n', type: 'break' });
        }
    });

    return tokens;
}

function buildAlignedWordTokens(words = []) {
    const tokens = [];
    words.forEach((word, index) => {
        tokens.push({ text: String(word.text || ''), type: 'timed' });
        if (index < words.length - 1) {
            tokens.push({ text: ' ', type: 'space' });
        }
    });
    return tokens;
}

function getKaraokeTimeline(sub = {}, style = {}) {
    const primaryText = sub.karaokeText || sub.text || sub.translatedText || sub.originalText || '';
    const secondaryText = sub.karaokeSecondaryText || '';
    const words = Array.isArray(sub.words)
        ? sub.words.filter(Boolean).filter(word => String(word.text || '').trim())
        : [];
    const canUseWordTimings = (
        words.length > 1 &&
        normalizeText(primaryText) &&
        normalizeText(primaryText) === normalizeText(words.map(word => word.text || '').join('')) &&
        !String(primaryText || '').includes('\n')
    );

    if (canUseWordTimings) {
        return {
            primaryText,
            secondaryText,
            tokens: buildAlignedWordTokens(words),
            segments: words
                .map((word, timedIndex) => ({
                    start: Number(word.start ?? sub.start ?? 0),
                    end: Number(word.end ?? word.start ?? sub.end ?? 0),
                    timedIndex
                }))
                .filter(segment => segment.end - segment.start > EPSILON)
        };
    }

    const tokens = tokenizeKaraokeText(primaryText, style);
    const timedTokens = tokens
        .map((token, index) => ({ token, index }))
        .filter(item => item.token.type === 'timed');

    if (timedTokens.length === 0) {
        return { primaryText, secondaryText, tokens, segments: [] };
    }

    const subStart = Number(sub.start || 0);
    const subEnd = Number(sub.end || subStart);
    const totalDuration = Math.max(EPSILON, subEnd - subStart);
    const step = totalDuration / timedTokens.length;

    return {
        primaryText,
        secondaryText,
        tokens,
        segments: timedTokens.map((item, timedIndex) => ({
            start: subStart + (step * timedIndex),
            end: timedIndex === timedTokens.length - 1 ? subEnd : subStart + (step * (timedIndex + 1)),
            timedIndex,
            tokenIndex: item.index
        })).filter(segment => segment.end - segment.start > EPSILON)
    };
}

function addBoundary(set, value, maxDuration) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const bounded = Math.min(Math.max(0, numeric), maxDuration);
    set.add(bounded.toFixed(4));
}

function addAnimatedBoundaries(boundaries, sub = {}, style = {}, duration = 0, fps = DEFAULT_ANIMATION_RENDER_FPS) {
    if (!style || !style.animation || style.animation === 'none' || style.animation === 'karaoke') return;

    const animationDuration = Math.max(0, Number(style.animationDuration || 300)) / 1000;
    if (animationDuration <= EPSILON) return;

    const start = Number(sub.start || 0);
    const end = Math.min(Number(sub.end || start), start + animationDuration);
    const step = 1 / Math.max(1, fps || DEFAULT_ANIMATION_RENDER_FPS);

    for (let t = start; t < end - EPSILON; t += step) {
        addBoundary(boundaries, t, duration);
    }
    addBoundary(boundaries, end, duration);
}

function addProgressBoundaries(boundaries, sub = {}, duration = 0, fps = DEFAULT_PROGRESS_RENDER_FPS) {
    const start = Number(sub.start || 0);
    const end = Number(sub.end || start);
    const step = 1 / Math.max(1, fps || DEFAULT_PROGRESS_RENDER_FPS);

    for (let t = start; t < end - EPSILON; t += step) {
        addBoundary(boundaries, t, duration);
    }
    addBoundary(boundaries, end, duration);
}

function buildRenderBoundaries(tracks = [], duration = 0, fps = DEFAULT_RENDER_FPS) {
    const boundedDuration = Math.max(0, Number(duration || 0));
    const boundaries = new Set();
    addBoundary(boundaries, 0, boundedDuration);
    addBoundary(boundaries, boundedDuration, boundedDuration);

    tracks.forEach((track) => {
        const style = track?.style || {};
        const subtitles = Array.isArray(track?.subtitles) ? track.subtitles : [];
        subtitles.forEach((sub) => {
            addBoundary(boundaries, sub.start, boundedDuration);
            addBoundary(boundaries, sub.end, boundedDuration);

            const karaokeEnabled = !!style.enableKaraoke || style.animation === 'karaoke';
            if (karaokeEnabled) {
                if ((style.karaokeStyle || 'highlight') === 'progress') {
                    addProgressBoundaries(boundaries, sub, boundedDuration, Math.min(fps || DEFAULT_RENDER_FPS, DEFAULT_PROGRESS_RENDER_FPS));
                } else {
                    const timeline = getKaraokeTimeline(sub, style);
                    timeline.segments.forEach((segment) => {
                        addBoundary(boundaries, segment.start, boundedDuration);
                        addBoundary(boundaries, segment.end, boundedDuration);
                    });
                }
            }

            addAnimatedBoundaries(boundaries, sub, style, boundedDuration, Math.min(fps || DEFAULT_RENDER_FPS, DEFAULT_ANIMATION_RENDER_FPS));
        });
    });

    return Array.from(boundaries)
        .map(Number)
        .filter(value => Number.isFinite(value))
        .sort((a, b) => a - b);
}

function buildRenderIntervals(tracks = [], duration = 0, fps = DEFAULT_RENDER_FPS) {
    const boundaries = buildRenderBoundaries(tracks, duration, fps);
    const intervals = [];

    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const start = boundaries[index];
        const end = boundaries[index + 1];
        if (end - start <= EPSILON) continue;

        intervals.push({
            index: intervals.length,
            start,
            end,
            duration: end - start,
            sampleTime: start + ((end - start) / 2)
        });
    }

    return intervals;
}

module.exports = {
    DEFAULT_RENDER_FPS,
    DEFAULT_PROGRESS_RENDER_FPS,
    DEFAULT_ANIMATION_RENDER_FPS,
    EPSILON,
    buildRenderBoundaries,
    buildRenderIntervals,
    getKaraokeTimeline,
    normalizeText,
    tokenizeKaraokeText,
    usesComplexScript
};
