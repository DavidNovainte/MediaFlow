/**
 * TimelineWaveformRenderer
 * Draws windowed waveforms for video and audio timeline tracks.
 */
class TimelineWaveformRenderer {
    static getRawPeaks(waveformSource) {
        if (Array.isArray(waveformSource)) return waveformSource;
        if (Array.isArray(waveformSource?.peaks)) return waveformSource.peaks;
        return [];
    }

    static sampleInterpolatedPeak(peaks, sourceTime, samplesPerSecond) {
        const floatIdx = sourceTime * samplesPerSecond;
        const peakIdx = Math.floor(floatIdx);

        if (peakIdx >= 0 && peakIdx < peaks.length - 1) {
            const t = floatIdx - peakIdx;
            return Math.abs(peaks[peakIdx]) * (1 - t) + Math.abs(peaks[peakIdx + 1]) * t;
        }

        if (peakIdx >= 0 && peakIdx < peaks.length) {
            return Math.abs(peaks[peakIdx]);
        }

        return 0;
    }

    static sampleEnvelope(level, sourceTime, samplesPerSecond) {
        if (!level || !level.count) {
            return { minValue: 0, maxValue: 0 };
        }

        const floatIdx = sourceTime * samplesPerSecond;
        const leftBucket = Math.max(0, Math.min(level.count - 1, Math.floor(floatIdx)));
        const rightBucket = Math.max(0, Math.min(level.count - 1, leftBucket + 1));
        const mix = Math.max(0, Math.min(1, floatIdx - leftBucket));

        const leftBase = leftBucket * 2;
        const rightBase = rightBucket * 2;

        const minValue = level.values[leftBase] * (1 - mix) + level.values[rightBase] * mix;
        const maxValue = level.values[leftBase + 1] * (1 - mix) + level.values[rightBase + 1] * mix;

        return { minValue, maxValue };
    }

    static sampleRawEnvelope(waveformSource, sourceTime) {
        const envelope = waveformSource?.envelope;
        if (!envelope?.min?.length || !envelope?.max?.length || !envelope.samplesPerSec) {
            return null;
        }

        const floatIdx = sourceTime * envelope.samplesPerSec;
        const leftIndex = Math.max(0, Math.min(envelope.min.length - 1, Math.floor(floatIdx)));
        const rightIndex = Math.max(0, Math.min(envelope.min.length - 1, leftIndex + 1));
        const mix = Math.max(0, Math.min(1, floatIdx - leftIndex));

        return {
            minValue: envelope.min[leftIndex] * (1 - mix) + envelope.min[rightIndex] * mix,
            maxValue: envelope.max[leftIndex] * (1 - mix) + envelope.max[rightIndex] * mix
        };
    }

    static renderWindowed(ctx, waveformSource, seg, options = {}) {
        const peaks = this.getRawPeaks(waveformSource);
        if (!ctx || (!peaks.length && !waveformSource?.envelope?.min?.length) || !seg) return;

        const scrollLeft = options.scrollLeft ?? 0;
        const viewportWidth = options.viewportWidth ?? ctx.canvas.width;
        const pps = options.pps ?? 1;
        const sourceDuration = options.sourceDuration ?? 1;
        const isVideoTrack = !!options.isVideoTrack;

        const canvasH = ctx.canvas.height;
        const amp = canvasH / 2;

        const segLeft = seg.start * pps;
        const segWidth = (seg.end - seg.start) * pps;
        const drawStart = Math.max(0, segLeft - scrollLeft);
        const drawEnd = Math.min(viewportWidth, segLeft + segWidth - scrollLeft);

        if (drawEnd <= drawStart) return;

        const effectiveSourceDuration = sourceDuration || 1;
        const rawSampleCount = waveformSource?.envelope?.min?.length || peaks.length;
        const rawSamplesPerSecond = rawSampleCount / effectiveSourceDuration;
        const samplesPerPixel = rawSamplesPerSecond / Math.max(pps, 0.0001);
        const useEnvelopeMode = samplesPerPixel > 1.5;
        const mipSelection = window.TimelineWaveformMipmaps
            ? window.TimelineWaveformMipmaps.pickLevel(waveformSource || peaks, effectiveSourceDuration, pps)
            : null;
        const waveformLevel = mipSelection?.level || null;
        const levelSamplesPerSecond = mipSelection?.samplesPerSecond || rawSamplesPerSecond;

        ctx.strokeStyle = isVideoTrack ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawStart, amp);
        ctx.lineTo(drawEnd, amp);
        ctx.stroke();

        let colorMain;
        let colorSub;
        let gradient;

        if (isVideoTrack) {
            colorMain = 'rgba(255, 255, 255, 0.4)';
            colorSub = 'rgba(255, 255, 255, 0.2)';
            ctx.strokeStyle = colorMain;
        } else {
            gradient = ctx.createLinearGradient(0, amp - (canvasH * 0.4), 0, amp + (canvasH * 0.4));
            gradient.addColorStop(0, 'rgba(61, 110, 184, 0.9)');
            gradient.addColorStop(0.5, 'rgba(16, 185, 129, 1.0)');
            gradient.addColorStop(1, 'rgba(56, 189, 248, 0.9)');
            ctx.strokeStyle = gradient;
        }

        ctx.lineWidth = 1;

        for (let x = Math.floor(drawStart); x <= Math.ceil(drawEnd); x++) {
            const projectTime = (x + scrollLeft) / pps;
            const sourceTime = (projectTime - seg.start) + (seg.sourceStart || 0);

            let minValue = 0;
            let maxValue = 0;

            if (useEnvelopeMode && waveformLevel) {
                const envelope = this.sampleEnvelope(waveformLevel, sourceTime, levelSamplesPerSecond);
                minValue = envelope.minValue;
                maxValue = envelope.maxValue;
            } else if (waveformSource?.envelope?.min?.length) {
                const envelope = this.sampleRawEnvelope(waveformSource, sourceTime);
                minValue = envelope?.minValue ?? 0;
                maxValue = envelope?.maxValue ?? 0;
            } else {
                const peakValue = this.sampleInterpolatedPeak(peaks, sourceTime, rawSamplesPerSecond);
                minValue = -peakValue;
                maxValue = peakValue;
            }

            const topY = amp + (minValue * canvasH * 0.4);
            const bottomY = amp + (maxValue * canvasH * 0.4);
            const peakSpan = Math.max(Math.abs(minValue), Math.abs(maxValue));

            if (!isVideoTrack) {
                ctx.strokeStyle = gradient;
                ctx.globalAlpha = x % 2 !== 0 ? 0.6 : 1.0;
            } else {
                ctx.strokeStyle = x % 2 === 0 ? colorMain : colorSub;
            }

            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            if (peakSpan > 0.6 && !isVideoTrack) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fillRect(x, Math.floor(topY), 1, 1);
                ctx.fillRect(x, Math.ceil(bottomY) - 1, 1, 1);
            }
        }
    }
}

window.TimelineWaveformRenderer = TimelineWaveformRenderer;
