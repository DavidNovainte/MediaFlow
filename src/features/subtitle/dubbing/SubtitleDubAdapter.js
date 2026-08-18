class SubtitleDubAdapter {
    constructor(flow) {
        this.flow = flow;
        this.segmentPlanner = window.SubtitleDubSegmentPlanner
            ? new window.SubtitleDubSegmentPlanner()
            : null;
        this.planner = new window.SubtitleDubTimingPlanner();
        this.groupPlanner = window.SubtitleDubGroupPlanner
            ? new window.SubtitleDubGroupPlanner({ timingPlanner: this.planner, segmentPlanner: this.segmentPlanner })
            : null;
        this.severeOverflowRatio = 1.18;
        this.softTargetStretchRatio = 1.6;
        this.softTargetSpeedFactor = 1.18;
        this.preserveModeRateCapPercent = 22;
        this.severeOverflowRateCapPercent = 32;
    }

    translateOrFallback(key, fallback, params) {
        const translated = window.i18n?.t?.(key, params);
        const resolved = translated && translated !== key ? translated : fallback;
        if (!params || typeof resolved !== 'string') {
            return resolved;
        }

        return Object.entries(params).reduce(
            (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
            resolved
        );
    }

    getSettings() {
        const getCheckbox = (id, fallback) => {
            const element = document.getElementById(id);
            if (element) return !!element.checked;
            return !!this.flow.preferenceManager?.get?.(fallback);
        };

        const getValue = (id, fallback, defaultValue) => {
            const element = document.getElementById(id);
            if (element) return element.value;
            return this.flow.preferenceManager?.get?.(fallback) ?? defaultValue;
        };

        return {
            mode: getValue('dub-adaptation-mode', 'dubAdaptationMode', 'off'),
            autoCompress: getCheckbox('dub-auto-compress', 'dubAutoCompress'),
            allowSpeedUp: getCheckbox('dub-auto-speedup', 'dubAutoSpeedUp'),
            allowGapBorrow: getCheckbox('dub-allow-gap-extension', 'dubAllowGapExtension')
        };
    }

    isEnabled(settings = this.getSettings()) {
        return settings.mode !== 'off';
    }

    getEffectiveSettings(settings = this.getSettings()) {
        const normalized = {
            ...settings
        };

        if (normalized.mode === 'preserve') {
            normalized.autoCompress = false;
            normalized.allowSpeedUp = false;
            normalized.allowGapBorrow = true;
        }

        return normalized;
    }

    getSourceText(subtitle = {}) {
        const ttsSource = window.SubtitleUtils?.getEffectiveTtsSource?.(subtitle) || subtitle.ttsSource || 'original';
        if (ttsSource === 'translated') {
            return String(subtitle.dubText || subtitle.translatedText || subtitle.text || '').trim();
        }
        return String(subtitle.originalText || subtitle.text || '').trim();
    }

    shouldAdaptSubtitle(subtitle = {}) {
        const ttsSource = window.SubtitleUtils?.getEffectiveTtsSource?.(subtitle) || subtitle.ttsSource || 'original';
        return ttsSource === 'translated' && !!String(subtitle.translatedText || subtitle.text || '').trim();
    }

    buildSegmentPlan(subtitle = {}, index = 0, settings = this.getSettings(), text = this.getSourceText(subtitle)) {
        if (!this.segmentPlanner?.buildPlanForSubtitle) {
            return {
                index,
                speechText: String(text || '').trim(),
                segments: [],
                segmentCount: 0,
                pauseDuration: 0,
                isSegmented: false
            };
        }

        return this.segmentPlanner.buildPlanForSubtitle(subtitle, index, {
            mode: settings.mode,
            enabled: this.isEnabled(settings) && this.shouldAdaptSubtitle(subtitle),
            text
        });
    }

    buildTimingPlan(subtitles = [], index = 0, settings = this.getSettings(), text = null) {
        const effectiveSettings = this.getEffectiveSettings(settings);
        const subtitle = subtitles[index] || {};
        const segmentPlan = this.buildSegmentPlan(subtitle, index, effectiveSettings, text ?? this.getSourceText(subtitle));

        return {
            segmentPlan,
            plan: this.planner.buildPlanForSubtitle(subtitles, index, {
                mode: effectiveSettings.mode,
                allowGapBorrow: effectiveSettings.allowGapBorrow,
                text: segmentPlan.speechText,
                pauseDuration: segmentPlan.pauseDuration
            })
        };
    }

    shouldPreserveMeaning(plan, settings = this.getSettings()) {
        if (!plan) return false;

        const effectiveSettings = this.getEffectiveSettings(settings);
        if (effectiveSettings.mode === 'preserve' && plan.estimatedRatio > 1) {
            return true;
        }

        return plan.estimatedRatio >= this.severeOverflowRatio;
    }

    getStatus(plan, compressed, settings) {
        if (!plan) return 'fit';
        if (this.shouldPreserveMeaning(plan, settings)) return 'preserve-meaning';
        if (plan.estimatedRatio <= 1) return compressed ? 'compressed' : 'fit';
        if ((!settings.allowSpeedUp && plan.estimatedRatio > 1.08) || plan.estimatedRatio > 1.16) return 'manual-needed';
        return compressed ? 'compressed' : 'estimated-overflow';
    }

    shouldAttemptCompression(text, plan) {
        if (!text || !plan?.targetChars) return false;
        const safeLength = Math.max(1, String(text).trim().length);
        const targetRatio = plan.targetChars / safeLength;
        return targetRatio >= 0.5;
    }

    shouldUseAutoSpeedUp(plan, settings) {
        return !!(settings.allowSpeedUp && plan && plan.estimatedRatio <= 1.16);
    }

    getSoftTargetDuration(plan, settings = this.getSettings()) {
        if (!plan) return null;

        const effectiveSettings = this.getEffectiveSettings(settings);
        const availableDuration = Math.max(0, Number(plan.availableDuration || 0));
        if (availableDuration <= 0) {
            return null;
        }

        const estimatedRatio = Math.max(1, Number(plan.estimatedRatio || 1));
        const estimatedSpeechDuration = availableDuration * estimatedRatio;
        const stretchRatio = effectiveSettings.mode === 'preserve'
            ? this.softTargetStretchRatio
            : Math.min(this.softTargetStretchRatio, 1.45);
        const desiredDuration = estimatedSpeechDuration / this.softTargetSpeedFactor;
        const softTargetDuration = Math.max(
            availableDuration,
            Math.min(desiredDuration, availableDuration * stretchRatio)
        );

        return Number(softTargetDuration.toFixed(3));
    }

    getSoftTargetRateCap(settings = this.getSettings()) {
        const effectiveSettings = this.getEffectiveSettings(settings);
        return effectiveSettings.mode === 'preserve'
            ? this.preserveModeRateCapPercent
            : this.severeOverflowRateCapPercent;
    }

    buildAllocatedPlan(subtitle = {}, text = '', pauseDuration = 0, allocatedDuration = 0, settings = this.getSettings()) {
        const effectiveSettings = this.getEffectiveSettings(settings);
        const modeConfig = this.planner.getModeConfig(effectiveSettings.mode);
        const originalDuration = this.planner.getSubtitleDuration(subtitle);
        const availableDuration = Number(Math.max(0.2, Number(allocatedDuration || originalDuration)).toFixed(3));
        const normalizedPause = Number(Math.max(0, Number(pauseDuration || 0)).toFixed(3));
        const speakingDuration = Number(Math.max(0.2, availableDuration - normalizedPause).toFixed(3));
        const weightedLength = this.planner.getWeightedLength(text);
        const isCJK = this.planner.isCJKText(text);
        const charsPerSecond = isCJK ? modeConfig.cjkCharsPerSecond : modeConfig.nonCjkCharsPerSecond;
        const targetChars = Math.max(4, Math.floor(speakingDuration * charsPerSecond * modeConfig.fillRatio));
        const estimatedRatio = targetChars > 0 ? weightedLength / targetChars : 0;

        return {
            originalDuration,
            borrowedGap: Number((availableDuration - originalDuration).toFixed(3)),
            availableDuration,
            pauseDuration: normalizedPause,
            speakingDuration,
            weightedLength: Number(weightedLength.toFixed(2)),
            targetChars,
            estimatedRatio: Number(estimatedRatio.toFixed(3)),
            shouldCompress: estimatedRatio > modeConfig.compressThreshold,
            isCJK,
            groupedWindow: true
        };
    }

    async prepareGroupForTts(prepared = [], group = null, contexts = [], settings = this.getSettings()) {
        if (!group || !Array.isArray(group.memberIndices) || group.memberIndices.length < 2) {
            return [];
        }

        let combinedText = group.text;
        let groupPlan = group.plan;
        let compressed = false;
        const preserveMeaning = this.shouldPreserveMeaning(groupPlan, settings);

        if (!preserveMeaning && settings.autoCompress && groupPlan?.shouldCompress && this.shouldAttemptCompression(combinedText, groupPlan)) {
            const compressedText = await this.compressText(combinedText, groupPlan);
            if (compressedText && compressedText !== combinedText) {
                combinedText = compressedText;
                const recomputedGroup = this.groupPlanner?.buildGroupPlan(prepared, group.startIndex, group.endIndex, contexts, settings);
                if (recomputedGroup) {
                    recomputedGroup.text = combinedText;
                    recomputedGroup.plan = this.groupPlanner.buildGroupPlan(prepared, group.startIndex, group.endIndex, {
                        ...contexts,
                        [group.startIndex]: contexts[group.startIndex]
                    }, settings).plan;
                }
                const first = prepared[group.startIndex] || {};
                const last = prepared[group.endIndex] || first;
                groupPlan = this.planner.buildPlanForSubtitle([{
                    start: Number(first.start || 0),
                    end: Number(last.end || first.end || 0),
                    text: combinedText
                }], 0, {
                    mode: settings.mode,
                    allowGapBorrow: false,
                    text: combinedText,
                    pauseDuration: group.pauseDuration
                });
                compressed = true;
            }
        }

        const memberWeights = group.memberIndices.map((memberIndex) => {
            const context = contexts[memberIndex] || {};
            return Math.max(1, this.planner.getWeightedLength(context.baseText || ''));
        });
        const pooledDurations = this.groupPlanner?.distributeDurations(groupPlan.availableDuration, memberWeights)
            || memberWeights.map(() => groupPlan.availableDuration / memberWeights.length);
        const targetTotalDuration = preserveMeaning
            ? this.getSoftTargetDuration(groupPlan, settings)
            : (this.shouldUseAutoSpeedUp(groupPlan, settings) ? groupPlan.availableDuration : null);
        const targetDurations = targetTotalDuration
            ? (this.groupPlanner?.distributeDurations(targetTotalDuration, memberWeights)
                || memberWeights.map(() => targetTotalDuration / memberWeights.length))
            : memberWeights.map(() => null);
        const allocatedTexts = this.groupPlanner?.distributeText(combinedText, memberWeights)
            || group.memberIndices.map((memberIndex) => contexts[memberIndex]?.baseText || '');

        return group.memberIndices.map((memberIndex, position) => {
            const subtitle = prepared[memberIndex];
            const dubText = allocatedTexts[position] || contexts[memberIndex]?.baseText || '';
            const segmentPlan = this.buildSegmentPlan(subtitle, memberIndex, settings, dubText);
            const plan = this.buildAllocatedPlan(
                subtitle,
                segmentPlan.speechText || dubText,
                segmentPlan.pauseDuration,
                pooledDurations[position],
                settings
            );

            return {
                memberIndex,
                dubText: segmentPlan.speechText || dubText,
                segmentPlan,
                plan,
                targetDuration: targetDurations[position],
                maxRatePercent: preserveMeaning && targetDurations[position]
                    ? this.getSoftTargetRateCap(settings)
                    : null,
                status: this.getStatus(plan, compressed, settings),
                compressed
            };
        });
    }

    getStatusMeta(status = 'fit') {
        switch (status) {
        case 'preview-preserve':
            return {
                tone: 'warning',
                shortLabel: '',
                label: this.translateOrFallback('subtitle.dubbing.status.preview_preserve.label', 'Will preserve meaning first'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.preview_preserve.description',
                    'This line is clearly over budget, so the system will prioritize preserving the full meaning and only apply limited speed-up.'
                )
            };
        case 'preview-compress':
            return {
                tone: 'warning',
                shortLabel: '',
                label: this.translateOrFallback('subtitle.dubbing.status.preview_compress.label', 'Compression likely needed'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.preview_compress.description',
                    'Based on the current timing budget, this line is a better candidate for compression before dubbing.'
                )
            };
        case 'preview-overflow':
            return {
                tone: 'danger',
                shortLabel: '',
                label: this.translateOrFallback('subtitle.dubbing.status.preview_overflow.label', 'Timing may still be tight'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.preview_overflow.description',
                    'With the current settings, this dub may still run too long.'
                )
            };
        case 'preview-original':
            return {
                tone: 'neutral',
                shortLabel: '',
                label: this.translateOrFallback('subtitle.dubbing.status.preview_original.label', 'Using original text for dubbing'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.preview_original.description',
                    'Timing adaptation is only estimated when the dubbing source is switched to the translation.'
                )
            };
        case 'compressed':
            return {
                tone: 'warning',
                shortLabel: this.translateOrFallback('subtitle.dubbing.status.compressed.shortLabel', 'Trimmed'),
                label: this.translateOrFallback('subtitle.dubbing.status.compressed.label', 'Compression applied'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.compressed.description',
                    'The translated line was shortened to fit the current timing window more closely.'
                )
            };
        case 'preserve-meaning':
            return {
                tone: 'warning',
                shortLabel: this.translateOrFallback('subtitle.dubbing.status.preserve_meaning.shortLabel', 'Meaning'),
                label: this.translateOrFallback('subtitle.dubbing.status.preserve_meaning.label', 'Preserve meaning first'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.preserve_meaning.description',
                    'This line is clearly overlong, so the system avoids aggressive compression and instead preserves meaning with limited speed-up.'
                )
            };
        case 'manual-needed':
            return {
                tone: 'danger',
                shortLabel: this.translateOrFallback('subtitle.dubbing.status.manual_needed.shortLabel', 'Risk'),
                label: this.translateOrFallback('subtitle.dubbing.status.manual_needed.label', 'Manual review suggested'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.manual_needed.description',
                    'This line is still long enough that the automatic result may sound unnatural.'
                )
            };
        case 'estimated-overflow':
            return {
                tone: 'danger',
                shortLabel: this.translateOrFallback('subtitle.dubbing.status.estimated_overflow.shortLabel', 'Risk'),
                label: this.translateOrFallback('subtitle.dubbing.status.estimated_overflow.label', 'High timing risk'),
                description: this.translateOrFallback(
                    'subtitle.dubbing.status.estimated_overflow.description',
                    'The system estimates that this dub may still exceed the available timing window.'
                )
            };
        default:
            return {
                tone: 'neutral',
                shortLabel: '',
                label: this.translateOrFallback('subtitle.dubbing.status.fit.label', 'Timing fits'),
                description: this.translateOrFallback('subtitle.dubbing.status.fit.description', 'This line does not need extra compression.')
            };
        }
    }

    getPreviewPlan(subtitle = null, settings = this.getSettings()) {
        const trackSubtitles = Array.isArray(this.flow.editor?.subtitles) ? this.flow.editor.subtitles : [];
        if (!subtitle || !this.isEnabled(settings) || !this.shouldAdaptSubtitle(subtitle) || trackSubtitles.length === 0) {
            return null;
        }

        const activeIndex = this.flow.editor?.activeSubtitleIndex;
        const index = Number.isInteger(activeIndex) && trackSubtitles[activeIndex] === subtitle
            ? activeIndex
            : trackSubtitles.indexOf(subtitle);

        if (index < 0) {
            return null;
        }

        return this.buildTimingPlan(trackSubtitles, index, settings).plan;
    }

    getPreviewStatus(plan, settings = this.getSettings()) {
        if (!plan) return 'fit';
        if (this.shouldPreserveMeaning(plan, settings)) {
            return 'preview-preserve';
        }
        if (plan.shouldCompress && settings.autoCompress) {
            return 'preview-compress';
        }
        if ((!settings.allowSpeedUp && plan.estimatedRatio > 1.08) || plan.estimatedRatio > 1.16) {
            return 'preview-overflow';
        }
        return 'fit';
    }

    getSegmentSummary(segmentPlan = null, shouldAdapt = false) {
        if (!shouldAdapt) {
            return this.translateOrFallback('subtitle.dubbing.segment.original_single', 'Currently dubbing the original text as a single segment.');
        }

        const segmentCount = Number(segmentPlan?.segmentCount || 0);
        const pauseDuration = Number(segmentPlan?.pauseDuration || 0);
        const pauseText = pauseDuration.toFixed(2);

        if (segmentCount <= 1) {
            return pauseDuration > 0
                ? this.translateOrFallback(
                    'subtitle.dubbing.segment.single_with_pause',
                    'Currently using a single dubbed segment with {pauseDuration}s of pause reserved inside the line.',
                    { pauseDuration: pauseText }
                )
                : this.translateOrFallback('subtitle.dubbing.segment.single', 'Currently using a single dubbed segment with no extra speech splitting.');
        }

        return this.translateOrFallback(
            'subtitle.dubbing.segment.multi',
            'Currently split into {segmentCount} speech segments with {pauseDuration}s of pause reserved inside the line.',
            {
                segmentCount,
                pauseDuration: pauseText
            }
        );
    }

    getInspectorState(subtitle = null) {
        if (!subtitle) {
            return {
                hasSubtitle: false,
                title: this.translateOrFallback('subtitle.dubbing.panel.empty.title', 'No subtitle selected'),
                description: this.translateOrFallback('subtitle.dubbing.panel.empty.description', 'Select a subtitle to see its dubbing adaptation details here.'),
                segmentText: this.translateOrFallback('subtitle.dubbing.panel.empty.segment', 'After you select a subtitle, this area will show how its dubbing is segmented.')
            };
        }

        const settings = this.getSettings();
        if (settings.mode !== 'off' && !this.shouldAdaptSubtitle(subtitle)) {
            const statusMeta = this.getStatusMeta('preview-original');
            return {
                hasSubtitle: true,
                title: statusMeta.label,
                description: statusMeta.description,
                tone: statusMeta.tone,
                shortLabel: statusMeta.shortLabel,
                sourceText: String(subtitle.originalText || subtitle.text || '').trim(),
                dubText: String(subtitle.originalText || subtitle.text || '').trim(),
                durationText: this.translateOrFallback('subtitle.dubbing.panel.stats.original_timing', 'Original timing'),
                borrowText: this.translateOrFallback('subtitle.dubbing.panel.stats.not_used', 'Not used'),
                ratioText: '--',
                segmentText: this.getSegmentSummary(null, false)
            };
        }

        const timing = subtitle.dubTiming || this.getPreviewPlan(subtitle, settings);
        const segmentPlan = subtitle.dubSegmentMeta
            ? {
                segmentCount: subtitle.dubSegmentMeta.segmentCount,
                pauseDuration: subtitle.dubSegmentMeta.pauseDuration,
                isSegmented: subtitle.dubSegmentMeta.isSegmented
            }
            : this.buildSegmentPlan(subtitle, this.flow.editor?.activeSubtitleIndex ?? 0, settings);
        const statusKey = subtitle.dubTiming
            ? (subtitle.dubStatus || 'fit')
            : this.getPreviewStatus(timing, settings);
        const statusMeta = this.getStatusMeta(statusKey);

        return {
            hasSubtitle: true,
            title: statusMeta.label,
            description: statusMeta.description,
            tone: statusMeta.tone,
            shortLabel: statusMeta.shortLabel,
            sourceText: String(subtitle.translatedText || subtitle.text || '').trim(),
            dubText: String(subtitle.dubText || subtitle.translatedText || subtitle.text || '').trim(),
            durationText: timing
                ? `${timing.originalDuration.toFixed(2)}s -> ${timing.availableDuration.toFixed(2)}s`
                : this.translateOrFallback('subtitle.dubbing.panel.stats.not_calculated', 'Not calculated'),
            borrowText: timing ? `${timing.borrowedGap.toFixed(2)}s` : '0.00s',
            ratioText: timing ? `${timing.estimatedRatio.toFixed(2)}x` : '--',
            segmentText: this.getSegmentSummary(segmentPlan, true)
        };
    }

    async compressText(text, plan) {
        if (!text || !plan?.targetChars) return text;

        try {
            const compressed = await this.flow.service?.compressTranslation?.(text, plan.targetChars, plan.isCJK);
            return String(compressed || text).trim() || text;
        } catch (error) {
            console.warn('[SubtitleDubAdapter] Compression skipped:', error);
            return text;
        }
    }

    async prepareSubtitlesForTts(subtitles = [], options = {}) {
        const settings = this.getEffectiveSettings({
            ...this.getSettings(),
            ...(options.settings || {})
        });

        if (!Array.isArray(subtitles) || subtitles.length === 0) {
            return [];
        }

        const prepared = subtitles.map((subtitle) => ({ ...subtitle }));
        const contexts = prepared.map((subtitle, index) => {
            const baseText = this.getSourceText(subtitle);
            const shouldAdapt = this.isEnabled(settings) && this.shouldAdaptSubtitle(subtitle);
            const segmentPlan = this.buildSegmentPlan(subtitle, index, settings, baseText);

            return {
                baseText,
                shouldAdapt,
                segmentPlan,
                plan: this.planner.buildPlanForSubtitle(prepared, index, {
                    mode: settings.mode,
                    allowGapBorrow: settings.allowGapBorrow,
                    text: segmentPlan.speechText || baseText,
                    pauseDuration: segmentPlan.pauseDuration
                })
            };
        });
        const groups = this.groupPlanner?.buildGroups(prepared, contexts, settings) || [];
        const groupStartMap = new Map(groups.map((group) => [group.startIndex, group]));

        for (let index = 0; index < prepared.length; index += 1) {
            const grouped = groupStartMap.get(index);
            if (grouped) {
                const groupedResults = await this.prepareGroupForTts(prepared, grouped, contexts, settings);
                groupedResults.forEach((result) => {
                    const subtitle = prepared[result.memberIndex];
                    subtitle.dubText = result.dubText;
                    subtitle.dubSegments = result.segmentPlan?.segments || [];
                    subtitle.dubSegmentMeta = {
                        segmentCount: result.segmentPlan?.segmentCount || 0,
                        pauseDuration: result.segmentPlan?.pauseDuration || 0,
                        isSegmented: !!result.segmentPlan?.isSegmented
                    };
                    subtitle.dubStatus = result.status;
                    subtitle.dubTiming = result.plan;
                    subtitle.targetDuration = result.targetDuration;
                    subtitle.maxRatePercent = result.maxRatePercent;
                    subtitle.text = result.dubText;
                });
                index = grouped.endIndex;
                continue;
            }

            const subtitle = prepared[index];
            const { baseText, shouldAdapt } = contexts[index];
            let segmentPlan = contexts[index].segmentPlan;
            let dubText = segmentPlan?.speechText || baseText;
            let plan = contexts[index].plan;
            let compressed = false;
            const preserveMeaning = shouldAdapt && this.shouldPreserveMeaning(plan, settings);
            const softTargetDuration = preserveMeaning ? this.getSoftTargetDuration(plan, settings) : null;

            if (!preserveMeaning && shouldAdapt && settings.autoCompress && plan.shouldCompress && this.shouldAttemptCompression(dubText, plan)) {
                const compressedText = await this.compressText(dubText, plan);
                if (compressedText && compressedText !== dubText) {
                    segmentPlan = this.buildSegmentPlan(subtitle, index, settings, compressedText);
                    dubText = segmentPlan.speechText || compressedText;
                    compressed = true;
                    plan = this.planner.buildPlanForSubtitle(prepared, index, {
                        mode: settings.mode,
                        allowGapBorrow: settings.allowGapBorrow,
                        text: dubText,
                        pauseDuration: segmentPlan.pauseDuration
                    });
                }
            }

            subtitle.dubText = shouldAdapt ? dubText : '';
            subtitle.dubSegments = shouldAdapt ? (segmentPlan?.segments || []) : [];
            subtitle.dubSegmentMeta = shouldAdapt
                ? {
                    segmentCount: segmentPlan?.segmentCount || 0,
                    pauseDuration: segmentPlan?.pauseDuration || 0,
                    isSegmented: !!segmentPlan?.isSegmented
                }
                : null;
            subtitle.dubStatus = shouldAdapt ? this.getStatus(plan, compressed, settings) : 'fit';
            subtitle.dubTiming = shouldAdapt ? plan : null;
            subtitle.targetDuration = shouldAdapt
                ? (preserveMeaning
                    ? softTargetDuration
                    : (this.shouldUseAutoSpeedUp(plan, settings) ? plan.availableDuration : null))
                : null;
            subtitle.maxRatePercent = shouldAdapt && preserveMeaning && softTargetDuration
                ? this.getSoftTargetRateCap(settings)
                : null;
            subtitle.text = shouldAdapt ? dubText : baseText;
        }

        return prepared;
    }
}

window.SubtitleDubAdapter = SubtitleDubAdapter;