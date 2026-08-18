class SubtitleDubTimingPlanner {
    constructor(config = {}) {
        this.config = {
            modes: {
                off: {
                    cjkCharsPerSecond: 4.2,
                    nonCjkCharsPerSecond: 11.5,
                    fillRatio: 1,
                    borrowScale: 0,
                    maxPrevBorrow: 0,
                    maxNextBorrow: 0,
                    compressThreshold: Infinity
                },
                balanced: {
                    cjkCharsPerSecond: 4.2,
                    nonCjkCharsPerSecond: 11.2,
                    fillRatio: 0.95,
                    borrowScale: 0.55,
                    maxPrevBorrow: 0.18,
                    maxNextBorrow: 0.32,
                    compressThreshold: 1.05
                },
                strict: {
                    cjkCharsPerSecond: 4.0,
                    nonCjkCharsPerSecond: 10.5,
                    fillRatio: 0.9,
                    borrowScale: 0.7,
                    maxPrevBorrow: 0.22,
                    maxNextBorrow: 0.38,
                    compressThreshold: 1.02
                },
                preserve: {
                    cjkCharsPerSecond: 4.5,
                    nonCjkCharsPerSecond: 12.2,
                    fillRatio: 1.02,
                    borrowScale: 0.45,
                    maxPrevBorrow: 0.14,
                    maxNextBorrow: 0.24,
                    compressThreshold: 1.12
                }
            },
            ...config
        };
    }

    getModeConfig(mode = 'balanced') {
        return this.config.modes[mode] || this.config.modes.balanced;
    }

    isCJKText(text = '') {
        return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(text || ''));
    }

    getWeightedLength(text = '') {
        return Array.from(String(text || '')).reduce((total, char) => {
            if (char === '\n' || char === '\r') return total;
            if (/\s/.test(char)) return total + 0.35;
            return total + (char.charCodeAt(0) <= 127 ? 0.55 : 1);
        }, 0);
    }

    getSubtitleDuration(subtitle = {}) {
        const start = Number(subtitle?.start || 0);
        const end = Number(subtitle?.end || 0);
        return Math.max(0.2, end - start);
    }

    getGapBefore(subtitles = [], index = 0) {
        if (index <= 0) return 0;

        const current = subtitles[index] || {};
        const previous = subtitles[index - 1] || {};
        return Math.max(0, Number(current.start || 0) - Number(previous.end || 0));
    }

    getGapAfter(subtitles = [], index = 0) {
        if (index >= subtitles.length - 1) return 0;

        const current = subtitles[index] || {};
        const next = subtitles[index + 1] || {};
        return Math.max(0, Number(next.start || 0) - Number(current.end || 0));
    }

    getBorrowedGap(subtitles = [], index = 0, options = {}) {
        const modeConfig = this.getModeConfig(options.mode);
        if (!options.allowGapBorrow || modeConfig.borrowScale <= 0) {
            return 0;
        }

        const prevGap = Math.min(this.getGapBefore(subtitles, index), modeConfig.maxPrevBorrow);
        const nextGap = Math.min(this.getGapAfter(subtitles, index), modeConfig.maxNextBorrow);

        return (prevGap + nextGap) * modeConfig.borrowScale;
    }

    buildPlanForSubtitle(subtitles = [], index = 0, options = {}) {
        const subtitle = subtitles[index] || {};
        const text = String(options.text ?? subtitle.text ?? '').trim();
        const modeConfig = this.getModeConfig(options.mode);
        const originalDuration = this.getSubtitleDuration(subtitle);
        const borrowedGap = this.getBorrowedGap(subtitles, index, options);
        const pauseDuration = Math.max(0, Number(options.pauseDuration || 0));
        const availableDuration = Number((originalDuration + borrowedGap).toFixed(3));
        const speakingDuration = Number(Math.max(0.2, availableDuration - pauseDuration).toFixed(3));
        const weightedLength = this.getWeightedLength(text);
        const isCJK = this.isCJKText(text);
        const charsPerSecond = isCJK ? modeConfig.cjkCharsPerSecond : modeConfig.nonCjkCharsPerSecond;
        const targetChars = Math.max(4, Math.floor(speakingDuration * charsPerSecond * modeConfig.fillRatio));
        const estimatedRatio = targetChars > 0 ? weightedLength / targetChars : 0;

        return {
            index,
            originalDuration,
            borrowedGap: Number(borrowedGap.toFixed(3)),
            availableDuration,
            pauseDuration: Number(pauseDuration.toFixed(3)),
            speakingDuration,
            weightedLength: Number(weightedLength.toFixed(2)),
            targetChars,
            estimatedRatio: Number(estimatedRatio.toFixed(3)),
            shouldCompress: estimatedRatio > modeConfig.compressThreshold,
            isCJK
        };
    }

    planTrack(subtitles = [], options = {}) {
        return subtitles.map((subtitle, index) => this.buildPlanForSubtitle(subtitles, index, {
            ...options,
            text: typeof options.textResolver === 'function'
                ? options.textResolver(subtitle, index)
                : options.text,
            pauseDuration: typeof options.pauseResolver === 'function'
                ? options.pauseResolver(subtitle, index)
                : options.pauseDuration
        }));
    }
}

window.SubtitleDubTimingPlanner = SubtitleDubTimingPlanner;