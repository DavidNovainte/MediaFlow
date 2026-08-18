/**
 * TimelineWaveformMipmaps
 * Builds cached multi-resolution min/max envelopes from a raw waveform array.
 */
class TimelineWaveformMipmaps {
    static cache = new WeakMap();

    static getLevels(waveformSource) {
        if (!waveformSource) return [];

        const cacheKey = (typeof waveformSource === 'object') ? waveformSource : null;
        const cached = cacheKey ? this.cache.get(cacheKey) : null;
        if (cached) return cached;

        const levels = [];
        let current = this.buildBaseLevel(waveformSource);
        levels.push(current);

        while (current.count > 1) {
            current = this.downsampleLevel(current);
            levels.push(current);
        }

        if (cacheKey) {
            this.cache.set(cacheKey, levels);
        }
        return levels;
    }

    static buildBaseLevel(waveformSource) {
        const envelope = waveformSource?.envelope;
        if (envelope?.min?.length && envelope?.max?.length) {
            return this.buildBaseLevelFromEnvelope(envelope);
        }

        const peaks = Array.isArray(waveformSource) ? waveformSource : waveformSource?.peaks;
        const count = peaks?.length || 0;
        const values = new Float32Array(count * 2);

        for (let i = 0; i < count; i++) {
            const sample = Number(peaks[i]) || 0;
            const baseIndex = i * 2;
            values[baseIndex] = Math.min(sample, 0);
            values[baseIndex + 1] = Math.max(sample, 0);
        }

        return {
            count,
            bucketSize: 1,
            values
        };
    }

    static buildBaseLevelFromEnvelope(envelope) {
        const count = Math.min(envelope.min.length, envelope.max.length);
        const values = new Float32Array(count * 2);

        for (let i = 0; i < count; i++) {
            const baseIndex = i * 2;
            values[baseIndex] = Number(envelope.min[i]) || 0;
            values[baseIndex + 1] = Number(envelope.max[i]) || 0;
        }

        return {
            count,
            bucketSize: 1,
            values
        };
    }

    static downsampleLevel(level) {
        const nextCount = Math.ceil(level.count / 2);
        const values = new Float32Array(nextCount * 2);

        for (let i = 0; i < nextCount; i++) {
            const leftIndex = i * 4;
            const rightIndex = Math.min(leftIndex + 2, (level.count - 1) * 2);
            const baseIndex = i * 2;

            values[baseIndex] = Math.min(level.values[leftIndex], level.values[rightIndex]);
            values[baseIndex + 1] = Math.max(level.values[leftIndex + 1], level.values[rightIndex + 1]);
        }

        return {
            count: nextCount,
            bucketSize: level.bucketSize * 2,
            values
        };
    }

    static pickLevel(waveformSource, sourceDuration, pps) {
        const levels = this.getLevels(waveformSource);
        if (!levels.length) return null;

        const effectiveDuration = sourceDuration || 1;
        const baseCount = waveformSource?.envelope?.min?.length
            || waveformSource?.peaks?.length
            || waveformSource?.length
            || 0;
        const rawSamplesPerSecond = baseCount / effectiveDuration;
        const samplesPerPixel = Math.max(1, rawSamplesPerSecond / Math.max(pps, 0.0001));

        let chosen = levels[0];
        for (const level of levels) {
            chosen = level;
            if (level.bucketSize >= samplesPerPixel) break;
        }

        return {
            level: chosen,
            samplesPerSecond: rawSamplesPerSecond / chosen.bucketSize
        };
    }
}

window.TimelineWaveformMipmaps = TimelineWaveformMipmaps;
