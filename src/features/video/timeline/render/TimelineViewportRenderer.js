/**
 * TimelineViewportRenderer
 * Coordinates width syncing, ruler drawing, and the top-level timeline render pass.
 */
class TimelineViewportRenderer {
    static syncContentWidths(manager, totalWidth, viewportWidth, forceWidthUpdate = false) {
        if (!forceWidthUpdate && manager._lastTotalWidth === totalWidth) {
            return;
        }

        const contentAreas = manager.container.querySelectorAll('.ruler-area, .track-content-area, .waveform-area');
        contentAreas.forEach((area) => {
            area.style.width = `${totalWidth}px`;
            area.style.minWidth = `${totalWidth}px`;
        });

        if (manager.timelineBody) {
            const maxScrollLeft = Math.max(0, totalWidth - viewportWidth);
            if (manager.timelineBody.scrollLeft > maxScrollLeft) {
                manager.timelineBody.scrollLeft = maxScrollLeft;
            }
        }

        manager._lastTotalWidth = totalWidth;
    }

    static renderRuler(manager, formatRulerTime) {
        if (!manager.rulerCanvas) return;

        const ctx = manager.rulerCanvas.getContext('2d');
        const parent = manager.rulerCanvas.parentElement;
        const renderContext = window.TimelineRenderContext
            ? window.TimelineRenderContext.create(manager)
            : {
                currentPixelsPerSecond: manager.pixelsPerSecond * (manager.zoomLevel / 100),
                scrollLeft: manager.timelineBody?.scrollLeft || 0,
                viewportWidth: Math.min(Math.max(800, (manager.timelineBody?.clientWidth || 920) - 120), 4000)
            };
        const { currentPixelsPerSecond, scrollLeft, viewportWidth } = renderContext;

        manager.rulerCanvas.width = viewportWidth;
        manager.rulerCanvas.height = Math.min(parent?.clientHeight || 30, 200);
        manager.rulerCanvas.style.width = `${viewportWidth}px`;
        manager.rulerCanvas.style.height = `${manager.rulerCanvas.height}px`;
        manager.rulerCanvas.style.position = 'absolute';
        manager.rulerCanvas.style.left = `${scrollLeft}px`;
        manager.rulerCanvas.style.transform = '';
        manager.rulerCanvas.style.zIndex = '10';
        manager.rulerCanvas.style.pointerEvents = 'none';

        if (!ctx) return;

        ctx.clearRect(0, 0, viewportWidth, manager.rulerCanvas.height);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const possibleIntervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
        const labelInterval = possibleIntervals.find((i) => i * currentPixelsPerSecond >= 80) || 3600;
        const tickInterval = possibleIntervals.find((i) => i * currentPixelsPerSecond >= 10) || (labelInterval / 5);

        const startTime = scrollLeft / currentPixelsPerSecond;
        const endTime = (scrollLeft + viewportWidth) / currentPixelsPerSecond;

        for (let t = Math.floor(startTime / tickInterval) * tickInterval; t <= Math.min(manager.duration, endTime + tickInterval); t += tickInterval) {
            const x = t * currentPixelsPerSecond - scrollLeft;
            if (x < 0 || x > viewportWidth) continue;

            const isMajor = Math.abs(t % labelInterval) < 0.001 || Math.abs(t % labelInterval - labelInterval) < 0.001;

            ctx.beginPath();
            ctx.lineWidth = isMajor ? 1.5 : 1;
            ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)';
            ctx.moveTo(x, isMajor ? 12 : 20);
            ctx.lineTo(x, 30);
            ctx.stroke();

            if (isMajor) {
                ctx.fillText(formatRulerTime(t), x, 2);
            }
        }

        ctx.restore();
    }

    static renderAll(manager, forceWidthUpdate = false) {
        if (!manager.duration) return;

        const currentPixelsPerSecond = manager.pixelsPerSecond * (manager.zoomLevel / 100);
        const totalWidth = manager.duration * currentPixelsPerSecond;
        const viewportWidth = Math.max(0, (manager.timelineBody?.clientWidth || 0) - 120);

        this.syncContentWidths(manager, totalWidth, viewportWidth, forceWidthUpdate);
        this.renderRuler(manager, (seconds) => manager.formatRulerTime(seconds));
        manager.renderVideoTracks();
        manager.renderAudioTracks();
        manager.updatePlayheadPosition();
        manager.app.subtitleLaneManager?.render?.();
        manager.app.subtitlePreviewOverlay?.render?.(manager.currentTime || 0);
        window.TimelineTrackAudioControls?.refreshAll?.(manager);
    }
}

window.TimelineViewportRenderer = TimelineViewportRenderer;
