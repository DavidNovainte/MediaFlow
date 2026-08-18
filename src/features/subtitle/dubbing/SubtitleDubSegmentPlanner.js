class SubtitleDubSegmentPlanner {
    constructor(config = {}) {
        this.config = {
            modes: {
                off: {
                    minSegmentChars: Infinity,
                    maxSegments: 1,
                    weakPause: 0,
                    strongPause: 0
                },
                balanced: {
                    minSegmentChars: 24,
                    maxSegments: 3,
                    weakPause: 0.12,
                    strongPause: 0.18
                },
                strict: {
                    minSegmentChars: 18,
                    maxSegments: 4,
                    weakPause: 0.14,
                    strongPause: 0.22
                },
                preserve: {
                    minSegmentChars: 30,
                    maxSegments: 2,
                    weakPause: 0.1,
                    strongPause: 0.16
                }
            },
            ...config
        };
    }

    getModeConfig(mode = 'balanced') {
        return this.config.modes[mode] || this.config.modes.balanced;
    }

    normalizeText(text = '') {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    splitClauses(text = '') {
        const normalized = this.normalizeText(text);
        if (!normalized) {
            return [];
        }

        const matches = normalized.match(/[^,，、;；:：.!?！？]+[,.，、;；:：!?！？]?/g);
        const clauses = (matches && matches.length ? matches : [normalized])
            .map((part) => this.normalizeText(part))
            .filter(Boolean);

        return clauses.length > 0 ? clauses : [normalized];
    }

    mergeOverflowClauses(clauses = [], maxSegments = 3) {
        if (clauses.length <= maxSegments) {
            return clauses;
        }

        const head = clauses.slice(0, Math.max(1, maxSegments - 1));
        const tail = this.normalizeText(clauses.slice(head.length).join(' '));
        return [...head, tail].filter(Boolean);
    }

    getPauseAfter(clause = '', modeConfig = this.getModeConfig()) {
        const text = String(clause || '').trim();
        if (!text) {
            return 0;
        }

        if (/[.!?。！？]$/.test(text)) {
            return modeConfig.strongPause;
        }
        if (/[,，、;；:：]$/.test(text)) {
            return modeConfig.weakPause;
        }
        return Math.max(0.06, modeConfig.weakPause * 0.75);
    }

    shouldSegment(text = '', clauses = [], modeConfig = this.getModeConfig()) {
        return clauses.length > 1 && this.normalizeText(text).length >= modeConfig.minSegmentChars;
    }

    buildSegments(clauses = [], modeConfig = this.getModeConfig()) {
        const limitedClauses = this.mergeOverflowClauses(clauses, modeConfig.maxSegments);
        return limitedClauses.map((text, index) => ({
            index,
            text,
            pauseAfter: index < limitedClauses.length - 1 ? this.getPauseAfter(text, modeConfig) : 0
        }));
    }

    buildPlanForSubtitle(subtitle = {}, index = 0, options = {}) {
        const modeConfig = this.getModeConfig(options.mode);
        const text = this.normalizeText(options.text ?? subtitle.text ?? '');
        const enabled = options.enabled !== false;

        if (!text) {
            return {
                index,
                speechText: '',
                segments: [],
                segmentCount: 0,
                pauseDuration: 0,
                isSegmented: false
            };
        }

        const clauses = this.splitClauses(text);
        const isSegmented = enabled && this.shouldSegment(text, clauses, modeConfig);
        const segments = isSegmented
            ? this.buildSegments(clauses, modeConfig)
            : [{ index: 0, text, pauseAfter: 0 }];
        const pauseDuration = segments.reduce((total, segment) => total + Number(segment.pauseAfter || 0), 0);

        return {
            index,
            speechText: this.normalizeText(segments.map((segment) => segment.text).join(' ')),
            segments,
            segmentCount: segments.length,
            pauseDuration: Number(pauseDuration.toFixed(3)),
            isSegmented
        };
    }

    planTrack(subtitles = [], options = {}) {
        return subtitles.map((subtitle, index) => this.buildPlanForSubtitle(subtitle, index, {
            ...options,
            text: typeof options.textResolver === 'function'
                ? options.textResolver(subtitle, index)
                : options.text
        }));
    }
}

window.SubtitleDubSegmentPlanner = SubtitleDubSegmentPlanner;