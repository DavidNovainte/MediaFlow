/**
 * TimelineAudioTrackRenderer
 * Renders audio tracks, segment overlays, and audio-track waveforms.
 */
class TimelineAudioTrackRenderer {
    static createSegmentElement(manager, track, seg, index, segLeft, segWidth) {
        const el = document.createElement('div');
        el.className = 'timeline-segment audio-segment';

        if (manager.selectedSegmentIndex === index && manager.selectedTrackId === track.id) {
            el.classList.add('active');
            if (manager.isDraggingClip) el.classList.add('dragging');
            el.style.border = '2px solid var(--accent-primary)';
        } else {
            el.style.border = '1px solid rgba(61, 110, 184, 0.3)';
        }

        el.style.position = 'absolute';
        el.style.left = `${segLeft}px`;
        el.style.width = `${segWidth}px`;
        el.style.height = '100%';
        el.style.background = 'rgba(61, 110, 184, 0.15)';
        el.style.borderRadius = '4px';
        el.style.cursor = 'pointer';
        el.style.zIndex = '5';

        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            manager.selectedSegmentIndex = index;
            manager.selectedTrackId = track.id;
            manager.renderAll();
            manager.isDraggingClip = true;
            el.classList.add('dragging');

            if (window.TimelineDragSession) {
                window.TimelineDragSession.start(manager, {
                    trackId: track.id,
                    index,
                    seg,
                    clientX: e.clientX
                });
            } else {
                manager.dragOldState = manager.captureState();
            }

            manager.app.uiManager?.showProperties('audio', { duration: seg.end - seg.start });
            manager.syncVolumeUI(seg.volume);
        });

        el.oncontextmenu = (e) => manager.showSegmentContextMenu(e, track.id, index);
        return el;
    }

    static renderSegmentWaveform(manager, ctx, track, seg, renderContext) {
        if (!ctx || !track?.peaks?.length) return;

        const visibility = window.TimelineRenderContext
            ? window.TimelineRenderContext.isSegmentVisible(
                seg,
                renderContext.currentPixelsPerSecond,
                renderContext.scrollLeft,
                renderContext.viewportWidth
            )
            : { isVisible: true };

        if (!visibility.isVisible) return;

        manager.renderWaveformWindowed(
            ctx,
            track.waveformData || track.peaks,
            seg,
            renderContext.scrollLeft,
            renderContext.viewportWidth,
            renderContext.currentPixelsPerSecond,
            track.sourceDuration || manager.duration
        );
    }

    static render(manager) {
        const renderContext = window.TimelineRenderContext
            ? window.TimelineRenderContext.create(manager)
            : {
                currentPixelsPerSecond: manager.pixelsPerSecond * (manager.zoomLevel / 100),
                scrollLeft: manager.timelineBody?.scrollLeft || 0,
                viewportWidth: Math.min(Math.max(800, (manager.timelineBody?.clientWidth || 920) - 120), 4000)
            };

        const { currentPixelsPerSecond, scrollLeft, viewportWidth } = renderContext;

        Object.values(manager.tracks).forEach((track) => {
            if (!track.id.startsWith('a')) return;

            const trackContainer = document.getElementById(`timeline-waveform-${track.id}`);
            const trackCanvas = document.getElementById(`timeline-waveform-canvas-${track.id}`);
            if (!trackContainer || !trackCanvas) return;

            const ctx = window.TimelineRenderContext
                ? window.TimelineRenderContext.prepareCanvas(trackCanvas, {
                    viewportWidth,
                    trackHeight: trackContainer.clientHeight || 60,
                    maxHeight: 200,
                    scrollLeft
                })
                : trackCanvas.getContext('2d');

            trackContainer.querySelectorAll('.audio-segment').forEach((segmentEl) => segmentEl.remove());

            track.segments.forEach((seg, index) => {
                const visibility = window.TimelineRenderContext
                    ? window.TimelineRenderContext.isSegmentVisible(seg, currentPixelsPerSecond, scrollLeft, viewportWidth)
                    : {
                        segLeft: seg.start * currentPixelsPerSecond,
                        segWidth: (seg.end - seg.start) * currentPixelsPerSecond,
                        segRight: seg.end * currentPixelsPerSecond,
                        isVisible: true
                    };

                const { segLeft, segWidth } = visibility;

                this.renderSegmentWaveform(manager, ctx, track, seg, renderContext);

                const segmentElement = this.createSegmentElement(manager, track, seg, index, segLeft, segWidth);
                trackContainer.appendChild(segmentElement);
            });
        });
    }
}

window.TimelineAudioTrackRenderer = TimelineAudioTrackRenderer;
