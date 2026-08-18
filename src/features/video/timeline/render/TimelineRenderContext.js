/**
 * TimelineRenderContext
 * Shared viewport and canvas preparation helpers for timeline rendering.
 */
class TimelineRenderContext {
    static create(manager) {
        const timelineBody = manager.timelineBody;
        const currentPixelsPerSecond = manager.pixelsPerSecond * (manager.zoomLevel / 100);
        const scrollLeft = timelineBody?.scrollLeft || 0;
        const rawViewportWidth = (timelineBody?.clientWidth || 920) - 120;
        const viewportWidth = Math.min(Math.max(800, rawViewportWidth), 4000);

        return {
            currentPixelsPerSecond,
            scrollLeft,
            viewportWidth
        };
    }

    static prepareCanvas(trackCanvas, options = {}) {
        if (!trackCanvas) return null;

        const viewportWidth = options.viewportWidth ?? 800;
        const trackHeight = options.trackHeight ?? 60;
        const maxHeight = options.maxHeight ?? trackHeight;
        const scrollLeft = options.scrollLeft ?? 0;

        trackCanvas.width = viewportWidth;
        trackCanvas.height = Math.min(trackHeight, maxHeight);
        trackCanvas.style.width = `${viewportWidth}px`;
        trackCanvas.style.height = `${trackCanvas.height}px`;
        trackCanvas.style.position = 'absolute';
        trackCanvas.style.left = `${scrollLeft}px`;
        trackCanvas.style.zIndex = '1';
        trackCanvas.style.pointerEvents = 'none';

        const ctx = trackCanvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, viewportWidth, trackCanvas.height);
        }

        return ctx;
    }

    static isSegmentVisible(seg, currentPixelsPerSecond, scrollLeft, viewportWidth) {
        const segLeft = seg.start * currentPixelsPerSecond;
        const segWidth = (seg.end - seg.start) * currentPixelsPerSecond;
        const segRight = segLeft + segWidth;

        return {
            segLeft,
            segWidth,
            segRight,
            isVisible: segRight >= scrollLeft && segLeft <= scrollLeft + viewportWidth
        };
    }
}

window.TimelineRenderContext = TimelineRenderContext;
