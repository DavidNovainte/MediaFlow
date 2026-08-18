class SubtitleDubGroupPlanner {
    constructor(options = {}) {
        this.timingPlanner = options.timingPlanner || null;
        this.segmentPlanner = options.segmentPlanner || null;
        this.config = {
            minDurationPerItem: 0.35,
            modes: {
                off: {
                    maxGroupSize: 1,
                    maxMergeGap: 0,
                    minTargetCharGain: Infinity
                },
                balanced: {
                    maxGroupSize: 3,
                    maxMergeGap: 0.38,
                    minTargetCharGain: 2
                },
                strict: {
                    maxGroupSize: 4,
                    maxMergeGap: 0.42,
                    minTargetCharGain: 2
                },
                preserve: {
                    maxGroupSize: 3,
                    maxMergeGap: 0.46,
                    minTargetCharGain: 1
                }
            },
            ...options.config
        };
    }

    getModeConfig(mode = 'balanced') {
        return this.config.modes[mode] || this.config.modes.balanced;
    }

    normalizeText(text = '') {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    getWeightedLength(text = '') {
        if (this.timingPlanner?.getWeightedLength) {
            return this.timingPlanner.getWeightedLength(text);
        }

        return Array.from(String(text || '')).reduce((total, char) => {
            if (char === '\n' || char === '\r') return total;
            if (/\s/.test(char)) return total + 0.35;
            return total + (char.charCodeAt(0) <= 127 ? 0.55 : 1);
        }, 0);
    }

    getGapAfter(subtitles = [], index = 0) {
        if (this.timingPlanner?.getGapAfter) {
            return this.timingPlanner.getGapAfter(subtitles, index);
        }

        if (index >= subtitles.length - 1) return 0;
        const current = subtitles[index] || {};
        const next = subtitles[index + 1] || {};
        return Math.max(0, Number(next.start || 0) - Number(current.end || 0));
    }

    buildCombinedText(texts = []) {
        return this.normalizeText(texts.map((text) => this.normalizeText(text)).filter(Boolean).join(' '));
    }

    splitClauses(text = '') {
        if (this.segmentPlanner?.splitClauses) {
            return this.segmentPlanner.splitClauses(text);
        }

        const normalized = this.normalizeText(text);
        if (!normalized) return [];
        const matches = normalized.match(/[^,，、;；:：.!?！？]+[,.，、;；:：!?！？]?/g);
        return (matches && matches.length ? matches : [normalized]).map((part) => this.normalizeText(part)).filter(Boolean);
    }

    splitClauseToFit(clause = '', missingCount = 0) {
        const normalized = this.normalizeText(clause);
        if (!normalized || missingCount <= 0) {
            return [normalized].filter(Boolean);
        }

        const words = normalized.split(/\s+/).filter(Boolean);
        if (words.length <= 1) {
            return [normalized];
        }

        const partCount = Math.min(words.length, missingCount + 1);
        const chunkSize = Math.max(1, Math.ceil(words.length / partCount));
        const parts = [];
        for (let index = 0; index < words.length; index += chunkSize) {
            parts.push(words.slice(index, index + chunkSize).join(' '));
        }
        return parts.filter(Boolean);
    }

    ensureClauseCount(clauses = [], count = 1) {
        const normalizedClauses = clauses.filter(Boolean);
        if (normalizedClauses.length >= count) {
            return normalizedClauses;
        }

        const expanded = [...normalizedClauses];
        while (expanded.length < count) {
            const source = expanded.pop() || '';
            const parts = this.splitClauseToFit(source, count - expanded.length - 1);
            if (parts.length <= 1) {
                expanded.push(source);
                break;
            }
            expanded.push(...parts);
        }

        while (expanded.length < count) {
            expanded.push('');
        }

        return expanded;
    }

    distributeText(text = '', weights = []) {
        const count = Math.max(1, weights.length || 1);
        const clauses = this.ensureClauseCount(this.splitClauses(text), count);
        const normalizedWeights = weights.map((weight) => Math.max(1, Number(weight || 0)));
        const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0) || count;
        const totalClauseWeight = clauses.reduce((sum, clause) => sum + Math.max(1, this.getWeightedLength(clause)), 0) || clauses.length;
        const buckets = Array.from({ length: count }, () => []);
        const targets = normalizedWeights.map((weight) => (totalClauseWeight * weight) / totalWeight);

        let clauseIndex = 0;
        let runningWeight = 0;
        for (let bucketIndex = 0; bucketIndex < count; bucketIndex += 1) {
            const bucketTarget = targets[bucketIndex];
            const remainingBuckets = count - bucketIndex - 1;

            while (clauseIndex < clauses.length) {
                const remainingClauses = clauses.length - clauseIndex;
                if (remainingClauses <= remainingBuckets) {
                    break;
                }

                const clause = clauses[clauseIndex];
                const clauseWeight = Math.max(1, this.getWeightedLength(clause));
                const projectedWeight = runningWeight + clauseWeight;

                if (buckets[bucketIndex].length > 0 && projectedWeight > bucketTarget && bucketIndex < count - 1) {
                    break;
                }

                buckets[bucketIndex].push(clause);
                runningWeight = projectedWeight;
                clauseIndex += 1;
            }

            runningWeight = 0;
        }

        while (clauseIndex < clauses.length) {
            buckets[count - 1].push(clauses[clauseIndex]);
            clauseIndex += 1;
        }

        return buckets.map((bucket, index) => this.normalizeText(bucket.join(' ')) || this.normalizeText(clauses[index] || text));
    }

    distributeDurations(totalDuration = 0, weights = []) {
        const count = Math.max(1, weights.length || 1);
        const safeTotalDuration = Math.max(this.config.minDurationPerItem * count, Number(totalDuration || 0));
        const normalizedWeights = weights.map((weight) => Math.max(1, Number(weight || 0)));
        const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0) || count;
        const allocations = [];
        let remaining = safeTotalDuration;

        for (let index = 0; index < count; index += 1) {
            const remainingItems = count - index;
            if (index === count - 1) {
                allocations.push(Number(Math.max(this.config.minDurationPerItem, remaining).toFixed(3)));
                break;
            }

            const proportional = safeTotalDuration * (normalizedWeights[index] / totalWeight);
            const maxAllowed = remaining - (this.config.minDurationPerItem * (remainingItems - 1));
            const allocation = Math.max(this.config.minDurationPerItem, Math.min(proportional, maxAllowed));
            allocations.push(Number(allocation.toFixed(3)));
            remaining -= allocation;
        }

        return allocations;
    }

    buildGroupPlan(subtitles = [], startIndex = 0, endIndex = startIndex, contexts = [], settings = {}) {
        const memberIndices = [];
        const memberPlans = [];
        const texts = [];
        let pauseDuration = 0;

        for (let index = startIndex; index <= endIndex; index += 1) {
            memberIndices.push(index);
            const context = contexts[index] || {};
            if (context.plan) memberPlans.push(context.plan);
            texts.push(context.baseText || '');
            pauseDuration += Number(context.segmentPlan?.pauseDuration || 0);
        }

        const first = subtitles[startIndex] || {};
        const last = subtitles[endIndex] || first;
        const text = this.buildCombinedText(texts);
        const syntheticSubtitles = [{
            start: Number(first.start || 0),
            end: Number(last.end || first.end || 0),
            text
        }];
        const plan = this.timingPlanner?.buildPlanForSubtitle
            ? this.timingPlanner.buildPlanForSubtitle(syntheticSubtitles, 0, {
                mode: settings.mode,
                allowGapBorrow: false,
                text,
                pauseDuration: Number(pauseDuration.toFixed(3))
            })
            : null;

        return {
            startIndex,
            endIndex,
            memberIndices,
            text,
            pauseDuration: Number(pauseDuration.toFixed(3)),
            plan,
            memberTargetChars: memberPlans.reduce((sum, memberPlan) => sum + Number(memberPlan?.targetChars || 0), 0),
            memberPlans
        };
    }

    shouldAcceptGroup(group = null, settings = {}) {
        if (!group?.plan || group.memberIndices.length < 2) {
            return false;
        }

        const modeConfig = this.getModeConfig(settings.mode);
        const hasOverflowingMember = group.memberPlans.some((memberPlan) => Number(memberPlan?.estimatedRatio || 0) > 1.02);
        if (!hasOverflowingMember) {
            return false;
        }

        return Number(group.plan.targetChars || 0) >= Number(group.memberTargetChars || 0) + modeConfig.minTargetCharGain;
    }

    buildGroups(subtitles = [], contexts = [], settings = {}) {
        const groups = [];
        const modeConfig = this.getModeConfig(settings.mode);

        if (modeConfig.maxGroupSize <= 1) {
            return groups;
        }

        let consumedUntil = -1;
        for (let startIndex = 0; startIndex < subtitles.length; startIndex += 1) {
            if (startIndex <= consumedUntil) continue;
            if (!contexts[startIndex]?.shouldAdapt) continue;

            let endIndex = startIndex;
            let bestGroup = null;

            while (endIndex + 1 < subtitles.length
                && contexts[endIndex + 1]?.shouldAdapt
                && (endIndex - startIndex + 1) < modeConfig.maxGroupSize
                && this.getGapAfter(subtitles, endIndex) <= modeConfig.maxMergeGap) {
                endIndex += 1;
                const candidate = this.buildGroupPlan(subtitles, startIndex, endIndex, contexts, settings);
                if (this.shouldAcceptGroup(candidate, settings)) {
                    bestGroup = candidate;
                }
            }

            if (bestGroup) {
                groups.push(bestGroup);
                consumedUntil = bestGroup.endIndex;
            }
        }

        return groups;
    }
}

window.SubtitleDubGroupPlanner = SubtitleDubGroupPlanner;