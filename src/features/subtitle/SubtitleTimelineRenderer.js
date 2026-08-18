/**
 * SubtitleTimelineRenderer.js
 * 负责时间轴 Canvas 层的绘制 (标尺 + 波形)
 */
class SubtitleTimelineRenderer {
    constructor(timeline) {
        this.timeline = timeline;
    }

    /** Canvas colors that follow light/dark app theme */
    getThemeColors() {
        const light = document.documentElement.getAttribute('data-theme') !== 'dark';
        if (light) {
            return {
                bg: '#f7f9fc',
                bgBeyond: '#eef2f7',
                midLine: 'rgba(15, 20, 25, 0.12)',
                wave: '#1a4b96',
                text: 'rgba(15, 20, 25, 0.78)',
                tick: 'rgba(15, 20, 25, 0.35)',
                tickMinor: 'rgba(15, 20, 25, 0.14)'
            };
        }
        return {
            bg: '#0f172a',
            bgBeyond: '#020617',
            midLine: 'rgba(255, 255, 255, 0.1)',
            wave: '#6b9ad4',
            text: 'rgba(255, 255, 255, 0.9)',
            tick: 'rgba(255, 255, 255, 0.4)',
            tickMinor: 'rgba(255, 255, 255, 0.15)'
        };
    }

    /**
     * 绘制音频波形
     */
    drawWaveform() {
        const t = this.timeline;
        const { waveformCtx: ctx, waveformCanvas: canvas, peaks, pxPerSec, duration } = t;
        if (!ctx || !canvas) return;

        const parent = canvas.parentElement;
        if (!parent) return;

        const dpr = window.devicePixelRatio || 1;
        const dw = parent.clientWidth;
        const dh = parent.clientHeight;
        if (dw <= 0 || dh <= 0) return;

        // 获取滚动偏移 (优先从 tracks-viewport 获取，作为渲染器它不该强依赖 tracksList)
        const viewport = document.getElementById('tracks-viewport');
        const scrollLeft = viewport ? viewport.scrollLeft : 0;

        // 同步画布物理尺寸
        if (canvas.width !== dw * dpr || canvas.height !== dh * dpr) {
            canvas.width = dw * dpr;
            canvas.height = dh * dpr;
            canvas.style.width = dw + 'px';
            canvas.style.height = dh + 'px';
        }

        this.renderSourceWaveformOverlay(parent, dw, dh, scrollLeft, pxPerSec);

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, dw, dh);

        if (!peaks || peaks.length === 0) {
            ctx.restore();
            return;
        }

        const theme = this.getThemeColors();
        // 核心修复：背景色仅填充到视频时长位置
        const durationWidth = (this.getDisplayDuration() * pxPerSec) - scrollLeft;
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, Math.min(dw, Math.max(0, durationWidth)), dh);

        // 超出时长部分
        if (durationWidth < dw) {
            ctx.fillStyle = theme.bgBeyond;
            ctx.fillRect(Math.max(0, durationWidth), 0, dw - Math.max(0, durationWidth), dh);
        }

        // 绘制中轴线
        ctx.strokeStyle = theme.midLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, dh / 2);
        ctx.lineTo(dw, dh / 2);
        ctx.stroke();

        this.drawSourceSegmentBackgrounds(ctx, dw, dh, scrollLeft, pxPerSec);

        ctx.fillStyle = theme.wave;

        // --- 核心优化：动态前端自适应波形归一化 ---
        // 为了不受音频本身音量极小或后端增益设置的限制，前端计算当前视图内的 maxAmplitude 或整段 peaks 的最大值，进而自动撑满高度。
        let localMax = 0;
        for (let i = 0; i < peaks.length; i++) {
            if (peaks[i] > localMax) localMax = peaks[i];
        }
        // 保证最小基数不过度放大小底噪
        localMax = Math.max(localMax, 0.05);
        const renderScale = 1.0 / localMax;

        const totalRendererWidth = duration * pxPerSec;
        const step = peaks.length > 0 ? (totalRendererWidth / peaks.length) : (pxPerSec / 100);
        const sourceSegments = this.getSourceSegmentsForWaveform();
        const shouldClipWaveform = this.shouldClipWaveformToSourceSegments();
        const drawWaveformBar = (startTime, endTime, amplitude) => {
            if (endTime <= startTime || amplitude <= 0) return;

            const x = (startTime * pxPerSec) - scrollLeft;
            const barWidth = Math.max(1, (endTime - startTime) * pxPerSec);
            if (x > dw || x + barWidth < 0) return;

            const normalizedAmp = Math.min(1.0, amplitude * renderScale);
            const barHeight = Math.max(1, normalizedAmp * dh * 0.8);
            const y = (dh - barHeight) / 2;

            ctx.fillRect(x, y, barWidth, barHeight);
        };
        const drawWaveformBarInPlayableRanges = (barStartTime, barEndTime, amplitude) => {
            if (sourceSegments.length === 0) {
                drawWaveformBar(barStartTime, barEndTime, amplitude);
                return;
            }

            sourceSegments.forEach((segment) => {
                const segmentSourceStart = Math.max(0, Number(segment.sourceStart ?? segment.start ?? 0));
                const segmentSourceEnd = Math.max(segmentSourceStart, Number(segment.sourceEnd ?? segment.end ?? segmentSourceStart));
                const segmentTimelineStart = Math.max(0, Number(segment.timelineStart ?? segment.start ?? 0));
                const visibleStart = Math.max(barStartTime, segmentSourceStart);
                const visibleEnd = Math.min(barEndTime, segmentSourceEnd);
                if (visibleEnd <= visibleStart) return;

                drawWaveformBar(
                    segmentTimelineStart + (visibleStart - segmentSourceStart),
                    segmentTimelineStart + (visibleEnd - segmentSourceStart),
                    amplitude
                );
            });
        };

        const startIdx = Math.floor(scrollLeft / step);
        const endIdx = Math.ceil((scrollLeft + dw) / step);

        for (let i = startIdx; i < endIdx; i++) {
            if (i >= peaks.length) break;

            const amplitude = peaks[i];
            if (amplitude <= 0) continue;

            const barStartTime = (i * step) / pxPerSec;
            const barEndTime = ((i * step) + Math.max(1, step - 0.2)) / pxPerSec;
            const x = (i * step) - scrollLeft;
            const barWidth = Math.max(1, step - 0.2);
            if (shouldClipWaveform) {
                drawWaveformBarInPlayableRanges(barStartTime, barEndTime, amplitude);
                continue;
            }
            // 将 amplitude 乘以我们计算的前端 renderScale，确保波形饱满
            const normalizedAmp = Math.min(1.0, amplitude * renderScale);
            const barHeight = Math.max(1, normalizedAmp * dh * 0.8); // 降低因子避免贴顶
            const y = (dh - barHeight) / 2;

            ctx.fillRect(x, y, barWidth, barHeight);
        }

        this.drawSourceSegmentGuides(ctx, dw, dh, scrollLeft, pxPerSec);
        ctx.restore();
    }

    getSourceSegmentsForWaveform() {
        const flow = this.timeline?.flow;
        const segments = flow?.getSourceTimelineSegments?.() || flow?.getPlayableSourceSegments?.() || [];
        if (!Array.isArray(segments)) return [];

        const hasVisibleSourceBoundaries = segments.length > 1 || flow?.hasSourceTrim?.();
        if (!hasVisibleSourceBoundaries) return [];

        let cursor = 0;
        return segments.map((segment, index) => {
            const sourceStart = Math.max(0, Number(segment.sourceStart ?? segment.start ?? 0));
            const sourceEnd = Math.max(sourceStart, Number(segment.sourceEnd ?? segment.end ?? sourceStart));
            const duration = Math.max(0, Number(segment.duration ?? (sourceEnd - sourceStart)));
            const hasTimelineRange = Number.isFinite(Number(segment.timelineStart))
                && Number.isFinite(Number(segment.timelineEnd));
            const timelineStart = hasTimelineRange ? Number(segment.timelineStart) : cursor;
            const timelineEnd = hasTimelineRange ? Number(segment.timelineEnd) : timelineStart + duration;
            cursor = timelineEnd;
            return {
                ...segment,
                sourceIndex: segment.sourceIndex ?? index,
                sourceStart,
                sourceEnd,
                timelineStart,
                timelineEnd,
                duration: Math.max(0, timelineEnd - timelineStart)
            };
        }).filter((segment) => segment.duration >= 0.01);
    }

    shouldClipWaveformToSourceSegments() {
        return !!this.timeline?.flow?.hasSourceTrim?.();
    }

    getDisplayDuration() {
        const timeline = this.timeline;
        const displayDuration = timeline?.getDisplayDuration?.();
        if (Number.isFinite(displayDuration) && displayDuration > 0) return displayDuration;
        return Math.max(0, Number(timeline?.duration || 0));
    }

    getVisibleRangeRect(start, end, width, scrollLeft, pxPerSec) {
        const safeStart = Math.max(0, Number(start || 0));
        const safeEnd = Math.max(safeStart, Number(end || safeStart));
        if (safeEnd <= safeStart) return null;

        const x = (safeStart * pxPerSec) - scrollLeft;
        const w = (safeEnd - safeStart) * pxPerSec;
        if (x > width || x + w < 0) return null;

        const left = Math.max(0, x);
        const right = Math.min(width, x + w);
        const visibleWidth = Math.max(0, right - left);
        if (visibleWidth <= 0) return null;

        return { left, width: visibleWidth };
    }

    ensureSourceWaveformOverlay(parent) {
        let overlay = parent.querySelector('.source-waveform-segments');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'source-waveform-segments';
            overlay.setAttribute('aria-hidden', 'true');
            parent.appendChild(overlay);
        }
        return overlay;
    }

    renderSourceWaveformOverlay(parent, width, height, scrollLeft, pxPerSec) {
        if (!parent) return;

        const overlay = this.ensureSourceWaveformOverlay(parent);
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        overlay.innerHTML = '';

        const segments = this.getSourceSegmentsForWaveform();
        if (segments.length === 0) {
            overlay.hidden = true;
            return;
        }

        overlay.hidden = false;
        const addVisibleBlock = (className, start, end, dataset = {}) => {
            const rect = this.getVisibleRangeRect(start, end, width, scrollLeft, pxPerSec);
            if (!rect) return null;

            const block = document.createElement('div');
            block.className = className;
            block.style.left = `${rect.left}px`;
            block.style.width = `${rect.width}px`;
            Object.entries(dataset).forEach(([key, value]) => {
                block.dataset[key] = String(value);
            });
            overlay.appendChild(block);
            return block;
        };
        const addCut = (time) => {
            const x = Math.round((time * pxPerSec) - scrollLeft);
            if (x < 0 || x > width) return;

            const cut = document.createElement('div');
            cut.className = 'source-waveform-cut';
            cut.style.left = `${x}px`;
            overlay.appendChild(cut);
        };

        segments.forEach((segment, index) => {
            const start = Math.max(0, Number(segment.timelineStart ?? segment.start ?? 0));
            const end = Math.max(start, Number(segment.timelineEnd ?? segment.end ?? start));

            const segmentEl = addVisibleBlock(
                `source-waveform-segment ${index % 2 === 1 ? 'is-alt' : ''}`.trim(),
                start,
                end,
                { index }
            );
            if (segmentEl && segment?.selected) {
                segmentEl.classList.add('is-selected');
            }

            if (index > 0) {
                addCut(start);
            }
        });
    }

    drawSourceSegmentBackgrounds(ctx, width, height, scrollLeft, pxPerSec) {
        const segments = this.getSourceSegmentsForWaveform();
        if (!ctx || segments.length === 0) return;

        ctx.save();
        segments.forEach((segment, index) => {
            const start = Math.max(0, Number(segment.timelineStart ?? segment.start ?? 0));
            const end = Math.max(start, Number(segment.timelineEnd ?? segment.end ?? start));
            if (end <= start) return;

            const x = (start * pxPerSec) - scrollLeft;
            const w = (end - start) * pxPerSec;
            if (x > width || x + w < 0) return;

            const left = Math.max(0, x);
            const right = Math.min(width, x + w);
            const visibleWidth = Math.max(0, right - left);
            if (visibleWidth <= 0) return;

            ctx.fillStyle = index % 2 === 0
                ? 'rgba(14, 165, 233, 0.08)'
                : 'rgba(77, 130, 201, 0.08)';
            ctx.fillRect(left, 0, visibleWidth, height);
            ctx.fillStyle = 'rgba(125, 211, 252, 0.18)';
            ctx.fillRect(left, 0, visibleWidth, 1);
            ctx.fillRect(left, height - 1, visibleWidth, 1);
        });
        ctx.restore();
    }

    drawSourceSegmentGuides(ctx, width, height, scrollLeft, pxPerSec) {
        const segments = this.getSourceSegmentsForWaveform();
        if (!ctx || segments.length === 0) return;

        const drawBoundary = (time) => {
            const x = Math.round((time * pxPerSec) - scrollLeft);
            if (x < 0 || x > width) return;
            const left = Math.max(0, x - 1);
            ctx.fillStyle = 'rgba(125, 211, 252, 0.16)';
            ctx.fillRect(left, 0, Math.min(2, width - left), height);
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, height);
            ctx.stroke();
        };

        ctx.save();
        segments.forEach((segment, index) => {
            if (index > 0) {
                const start = Math.max(0, Number(segment.timelineStart ?? segment.start ?? 0));
                drawBoundary(start);
            }
        });
        ctx.restore();
    }

    /**
     * 绘制 Canvas 时间标尺
     */
    drawRuler() {
        const t = this.timeline;
        const { ctx, rulerCanvas: canvas, pxPerSec } = t;
        if (!ctx || !canvas) return;

        const parent = canvas.parentElement;
        if (!parent) return;

        const dpr = window.devicePixelRatio || 1;
        const dw = parent.clientWidth;
        const dh = parent.clientHeight;

        if (dw <= 0 || dh <= 0) return;

        if (canvas.width !== dw * dpr || canvas.height !== dh * dpr) {
            canvas.width = dw * dpr;
            canvas.height = dh * dpr;
            canvas.style.width = dw + 'px';
            canvas.style.height = dh + 'px';
        }

        const viewport = document.getElementById('tracks-viewport');
        const scrollLeft = viewport ? viewport.scrollLeft : 0;

        ctx.save();
        ctx.scale(dpr, dpr);

        const theme = this.getThemeColors();
        // 核心修复：背景色仅填充到视频时长位置
        const duration = this.getDisplayDuration();
        const durationWidth = (duration * pxPerSec) - scrollLeft;
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, Math.min(dw, Math.max(0, durationWidth)), dh);

        // 超出时长部分
        if (durationWidth < dw) {
            ctx.fillStyle = theme.bgBeyond;
            ctx.fillRect(Math.max(0, durationWidth), 0, dw - Math.max(0, durationWidth), dh);
        }

        ctx.fillStyle = theme.text;
        ctx.strokeStyle = theme.tick;
        ctx.lineWidth = 1;
        ctx.font = '300 10px "JetBrains Mono", "Consolas", monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const step = pxPerSec;
        if (step <= 0) {
            ctx.restore();
            return;
        }

        // 动态标签间隔 (避免文本过密重叠，预留足够像素空间)
        let labelInterval = 1;
        if (step < 2) labelInterval = 30; // 极小缩放：每30秒一个标签
        else if (step < 5) labelInterval = 10;
        else if (step < 15) labelInterval = 5;
        else if (step < 35) labelInterval = 2;

        // 动态刻度间隔 (避免刻度线黏成一团)
        let tickInterval = 1;
        if (step < 2) tickInterval = 10;
        else if (step < 5) tickInterval = 5;

        // 对齐起始时间
        const startSec = Math.floor(scrollLeft / step);
        const alignedStartSec = startSec - (startSec % tickInterval);
        const endSec = Math.ceil((scrollLeft + dw) / step);

        for (let s = alignedStartSec; s <= endSec; s += tickInterval) {
            // 如果视频还没加载，也可以画出前 60s 的标尺作为视觉占位
            if (duration > 0 && s > duration) break;

            const x = Math.round(s * step - scrollLeft);
            if (x < -100 || x > dw + 100) continue;

            const isLabelTick = (s % labelInterval === 0);

            // 刻度线 (主刻度 6px, 次刻度 4px)
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, isLabelTick ? 6 : 4);
            ctx.stroke();

            // 文本 (格式化: 00:00)
            if (isLabelTick || s === 0) {
                ctx.fillText(t.formatTimeSimple(s), x + 6, 12);
            }

            // 小刻度 (0.1s 或 0.5s 视缩放决定)
            if (step > 40 && tickInterval === 1) {
                ctx.strokeStyle = theme.tickMinor;
                const subDivs = step > 120 ? 10 : 2; // 极高缩放显示 0.1s，普通显示 0.5s
                for (let i = 1; i < subDivs; i++) {
                    const sx = Math.round(x + (i * step / subDivs));
                    if (sx < 0 || sx > dw) continue;
                    ctx.beginPath();
                    ctx.moveTo(sx, 0);
                    ctx.lineTo(sx, 3);
                    ctx.stroke();
                }
                ctx.strokeStyle = theme.tick;
            }
        }

        ctx.restore();
    }
}

window.SubtitleTimelineRenderer = SubtitleTimelineRenderer;
