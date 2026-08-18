/**
 * TimelineVideoTrackRenderer
 * Renders video tracks, clip elements, transition handles, and video-track waveforms.
 */
class TimelineVideoTrackRenderer {
    static createSegmentElement(manager, track, seg, index, currentPixelsPerSecond) {
        const el = document.createElement('div');
        el.className = 'timeline-segment video-segment';

        if (manager.selectedSegmentIndex === index && manager.selectedTrackId === track.id) {
            el.classList.add('active');
            if (manager.isDraggingClip) el.classList.add('dragging');
            if (manager.isTrimmingClip) el.classList.add('trimming');
            el.style.border = '2px solid #fff';
        } else {
            el.style.border = '1px solid rgba(77, 130, 201, 0.8)';
        }

        el.style.position = 'absolute';
        el.style.left = `${seg.start * currentPixelsPerSecond}px`;
        el.style.width = `${(seg.end - seg.start) * currentPixelsPerSecond}px`;
        el.style.height = '100%';
        el.style.background = 'rgba(77, 130, 201, 0.4)';
        el.style.borderRadius = '4px';
        el.style.cursor = 'pointer';

        const clipName = window.i18n?.t('creator.segment.defaultName', { index: index + 1 }) || `Clip ${index + 1}`;
        const label = document.createElement('div');
        label.style.cssText = 'padding: 4px; font-size: 11px; color: #fff; overflow: hidden; white-space: nowrap; user-select: none;';
        label.textContent = clipName;
        el.appendChild(label);

        const leftHandle = document.createElement('div');
        leftHandle.className = 'clip-handle left';

        const rightHandle = document.createElement('div');
        rightHandle.className = 'clip-handle right';

        el.appendChild(leftHandle);
        el.appendChild(rightHandle);

        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            manager.selectedSegmentIndex = index;
            manager.selectedTrackId = track.id;
            manager.renderVideoTracks();

            if (e.target === leftHandle || e.target === rightHandle) {
                manager.isTrimmingClip = true;
                manager.trimEdge = e.target === leftHandle ? 'left' : 'right';
                el.classList.add('trimming');
            } else {
                manager.isDraggingClip = true;
                el.classList.add('dragging');
            }

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

            manager.app.uiManager?.showProperties(
                seg.path?.endsWith('.mp3') || seg.path?.endsWith('.wav') ? 'audio' : 'video',
                {
                    speed: seg.speed || 1.0,
                    duration: seg.end - seg.start
                }
            );
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
            track.sourceDuration || manager.duration,
            true
        );
    }

    static createTransitionPoint(manager, track, seg, index, currentPixelsPerSecond) {
        if (index >= track.segments.length - 1) return null;

        const nextSeg = track.segments[index + 1];
        const gap = nextSeg.start - seg.end;
        if (gap >= 0.5) return null;

        const tp = document.createElement('div');
        tp.className = 'timeline-transition-point';

        if (seg.transition && seg.transition.id !== 'none') {
            tp.classList.add('has-transition');
            tp.innerHTML = '<i class="fa-solid fa-film"></i>';
        } else {
            tp.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }

        if (manager.selectedTransitionIndex === index && manager.selectedTrackId === track.id) {
            tp.classList.add('active');
        }

        tp.style.left = `${seg.end * currentPixelsPerSecond - 10}px`;
        tp.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            manager.selectTransition(track.id, index);
        });

        return tp;
    }

    static render(manager) {
        const renderContext = window.TimelineRenderContext
            ? window.TimelineRenderContext.create(manager)
            : {
                currentPixelsPerSecond: manager.pixelsPerSecond * (manager.zoomLevel / 100),
                scrollLeft: manager.timelineBody?.scrollLeft || 0,
                viewportWidth: Math.max(800, (manager.timelineBody?.clientWidth || 920) - 120)
            };

        const { currentPixelsPerSecond, scrollLeft, viewportWidth } = renderContext;

        Object.values(manager.tracks).forEach((track) => {
            if (!track.id.startsWith('v')) return;

            const trackRow = document.getElementById(`track-${track.id}`);
            const trackContainer = document.getElementById(`track-content-${track.id}`);
            if (!trackContainer) return;

            if (manager.app.isAudioOnly) {
                if (trackRow) trackRow.style.display = 'none';
                return;
            }

            if (trackRow) {
                trackRow.style.display = '';
            }

            trackContainer.querySelectorAll('.video-segment, .timeline-transition-point').forEach((el) => el.remove());

            const trackCanvas = document.getElementById(`video-waveform-canvas-${track.id}`);
            const ctx = window.TimelineRenderContext
                ? window.TimelineRenderContext.prepareCanvas(trackCanvas, {
                    viewportWidth,
                    trackHeight: trackContainer.clientHeight || 40,
                    maxHeight: trackContainer.clientHeight || 40,
                    scrollLeft
                })
                : trackCanvas?.getContext('2d');

            track.segments.forEach((seg, index) => {
                const segmentElement = this.createSegmentElement(manager, track, seg, index, currentPixelsPerSecond);
                trackContainer.appendChild(segmentElement);

                this.renderSegmentWaveform(manager, ctx, track, seg, renderContext);

                const transitionPoint = this.createTransitionPoint(manager, track, seg, index, currentPixelsPerSecond);
                if (transitionPoint) {
                    trackContainer.appendChild(transitionPoint);
                }
            });
        });
    }
}

window.TimelineVideoTrackRenderer = TimelineVideoTrackRenderer;
