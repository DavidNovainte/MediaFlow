class EditorTimelineViewportManager {
    static BASE_PIXELS_PER_SECOND = 56;
    static MIN_ZOOM = 5;
    static MAX_ZOOM = 400;

    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.pendingFitScrollReset = false;
        this.boundWheel = this.handleWheel.bind(this);
        this.boundScroll = this.handleTimelineScroll.bind(this);
        this.layoutResizeObserver = null;
        this.lastObservedLayoutKey = '';
        this.pendingLayoutRefreshFrame = 0;
        this.pendingZoomFrame = 0;

        if (!window.EditorTimelineZoomOptimizer && typeof require !== 'undefined') {
            try {
                window.EditorTimelineZoomOptimizer = require('./EditorTimelineZoomOptimizer');
            } catch (error) {
                void error;
            }
        }

        const OptimizerClass = window.EditorTimelineZoomOptimizer || class DummyOptimizer {
            constructor() {
                this.isZooming = false;
            }
            init() {}
            startZooming() {}
            destroy() {}
            buildZoomingVideoFilmstrip() {
                return '<span class="editor-clip-filmstrip editor-clip-filmstrip-zooming" aria-hidden="true"></span>';
            }
            buildZoomingWaveform() {
                return '';
            }
        };

        this.zoomOptimizer = new OptimizerClass(flow);
    }

    init() {
        this.elements = {
            timelineBody: document.querySelector('#page-editor .editor-timeline-body'),
            fitButton: document.getElementById('btn-editor-fit-timeline'),
            snapButton: document.getElementById('btn-editor-toggle-snap'),
            zoomInput: document.getElementById('editor-timeline-zoom'),
            zoomValue: document.getElementById('editor-timeline-zoom-value'),
            zoomOutButton: document.getElementById('btn-editor-zoom-out'),
            zoomInButton: document.getElementById('btn-editor-zoom-in')
        };
        this.zoomOptimizer.init();
        this.bindEvents();
    }

    stepTimelineZoom(delta) {
        const input = this.elements.zoomInput;
        const min = Number(input?.min) || 5;
        const max = Number(input?.max) || 400;
        const step = Number(input?.step) || 5;
        const current = Number(input?.value) || Number(this.flow.store.getState()?.timelineZoom) || 100;
        const next = Math.min(max, Math.max(min, current + delta * step));
        if (input) input.value = String(next);
        this.pendingFitScrollReset = false;
        this.zoomOptimizer.startZooming();
        this.flow.store.setTimelineZoom(next, { mode: 'manual' });
    }

    bindEvents() {
        this.elements.fitButton?.addEventListener('click', () => this.fitTimelineToViewport());
        this.elements.snapButton?.addEventListener('click', () => {
            const enabled = this.flow.store.toggleTimelineSnapEnabled?.();
            window.app?.showToast?.(
                enabled
                    ? (window.i18n?.t?.('editor.snapOnToast') || '时间线吸附已开启')
                    : (window.i18n?.t?.('editor.snapOffToast') || '时间线吸附已关闭'),
                'info'
            );
        });

        this.elements.zoomOutButton?.addEventListener('click', () => this.stepTimelineZoom(-2));
        this.elements.zoomInButton?.addEventListener('click', () => this.stepTimelineZoom(2));

        this.elements.zoomInput?.addEventListener('input', (event) => {
            this.pendingFitScrollReset = false;
            const targetValue = event.target.value;
            this.zoomOptimizer.startZooming();
            if (this.pendingZoomFrame) {
                window.cancelAnimationFrame(this.pendingZoomFrame);
            }
            this.pendingZoomFrame = window.requestAnimationFrame(() => {
                this.pendingZoomFrame = 0;
                this.flow.store.setTimelineZoom(targetValue, { mode: 'manual' });
            });
        });

        document.addEventListener('wheel', this.boundWheel, { passive: false });
        this.elements.timelineBody?.addEventListener('scroll', this.boundScroll, { passive: true });
        this.syncLockedGutterMask();
        this.observeTimelineLayout();
    }

    destroy() {
        document.removeEventListener('wheel', this.boundWheel);
        this.elements.timelineBody?.removeEventListener('scroll', this.boundScroll);
        if (this.pendingLayoutRefreshFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(this.pendingLayoutRefreshFrame);
        }
        this.pendingLayoutRefreshFrame = 0;
        if (this.pendingZoomFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(this.pendingZoomFrame);
        }
        this.pendingZoomFrame = 0;
        this.layoutResizeObserver?.disconnect?.();
        this.layoutResizeObserver = null;
        this.lastObservedLayoutKey = '';
        this.zoomOptimizer.destroy();
    }

    observeTimelineLayout() {
        const body = this.elements.timelineBody;
        if (!body || typeof ResizeObserver !== 'function') return;

        this.layoutResizeObserver?.disconnect?.();
        this.layoutResizeObserver = new ResizeObserver((entries) => {
            const entry = entries?.[entries.length - 1];
            const target = entry?.target || body;
            const width = Math.round(Number(entry?.contentRect?.width) || target.clientWidth || 0);
            const height = Math.round(Number(entry?.contentRect?.height) || target.clientHeight || 0);
            const layoutKey = `${width}x${height}`;

            if (!width || !height || layoutKey === this.lastObservedLayoutKey) {
                this.lastObservedLayoutKey = layoutKey || this.lastObservedLayoutKey;
                return;
            }

            this.lastObservedLayoutKey = layoutKey;
            this.scheduleLayoutRefresh();
        });
        this.layoutResizeObserver.observe(body);
    }

    scheduleLayoutRefresh() {
        if (this.pendingLayoutRefreshFrame || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            return;
        }

        this.pendingLayoutRefreshFrame = window.requestAnimationFrame(() => {
            this.pendingLayoutRefreshFrame = 0;
            this.flow.renderCurrentState?.();
        });
    }

    handleWheel(event) {
        const isEditorPage = this.flow.app?.router?.currentPage === 'editor';
        if (!isEditorPage || !event.target?.closest?.('#page-editor')) return;

        if (event.ctrlKey) {
            event.preventDefault();
            this.pendingFitScrollReset = false;
            const parsedZoom = Number(this.flow.store.getState().timelineZoom);
            const current = Number.isFinite(parsedZoom) ? parsedZoom : 100;
            const next = current + (event.deltaY < 0 ? 5 : -5);
            this.zoomOptimizer.startZooming();
            if (this.pendingZoomFrame) {
                window.cancelAnimationFrame(this.pendingZoomFrame);
            }
            this.pendingZoomFrame = window.requestAnimationFrame(() => {
                this.pendingZoomFrame = 0;
                this.flow.store.setTimelineZoom(next, { mode: 'manual' });
            });
            return;
        }

        const body = this.elements.timelineBody;
        if (!body) return;

        const isTimelineWheelTarget = event.target?.closest?.('#editor-timeline-body, #editor-timeline-ruler, #editor-timeline-tracks, .editor-timeline-track, .editor-track-lane, .editor-clip');
        if (!isTimelineWheelTarget) return;

        const maxScrollLeft = Math.max(0, (body.scrollWidth || 0) - (body.clientWidth || 0));
        if (maxScrollLeft <= 0) return;

        const absDeltaX = Math.abs(event.deltaX);
        const absDeltaY = Math.abs(event.deltaY);
        const horizontalIntent = !!event.shiftKey || absDeltaX > Math.max(absDeltaY, 0.5);
        const verticalIntent = absDeltaY > Math.max(absDeltaX, 0.5);
        const maxScrollTop = Math.max(0, (body.scrollHeight || 0) - (body.clientHeight || 0));
        const shouldMapVerticalWheelToHorizontal = verticalIntent && maxScrollTop <= 1;
        if (!horizontalIntent && !shouldMapVerticalWheelToHorizontal) {
            return;
        }

        const delta = horizontalIntent && absDeltaX > absDeltaY ? event.deltaX : event.deltaY;
        if (Math.abs(delta) < 0.5) return;

        event.preventDefault();
        body.scrollLeft = Math.max(0, Math.min(maxScrollLeft, (body.scrollLeft || 0) + delta));
        this.syncLockedGutterMask();
    }

    handleTimelineScroll() {
        this.syncLockedGutterMask();
        // Pro-style: repaint audio waveforms for the newly visible slice only
        this.flow.timelineManager?.scheduleWaveformPaint?.();
    }

    syncLockedGutterMask() {
        const body = this.elements.timelineBody;
        if (!body) return;
        body.style.setProperty('--editor-timeline-scroll-left', `${Math.max(0, body.scrollLeft || 0)}px`);
    }

    getTrackOffsetWidth(body = this.elements.timelineBody) {
        const styles = body ? window.getComputedStyle(body) : null;
        const labelWidth = Number.parseFloat(styles?.getPropertyValue('--editor-track-label-width'));
        const trackGap = Number.parseFloat(styles?.getPropertyValue('--editor-track-gap'));
        return (Number.isFinite(labelWidth) ? labelWidth : 96) + (Number.isFinite(trackGap) ? trackGap : 8);
    }

    getHorizontalPadding(body = this.elements.timelineBody) {
        const styles = body ? window.getComputedStyle(body) : null;
        const inlinePadding = Number.parseFloat(styles?.getPropertyValue('--editor-timeline-body-padding-inline'));
        const paddingLeft = Number.parseFloat(styles?.paddingLeft);
        const paddingRight = Number.parseFloat(styles?.paddingRight);
        const resolvedInlinePadding = Number.isFinite(inlinePadding) ? inlinePadding : 12;
        const left = Number.isFinite(paddingLeft) ? paddingLeft : resolvedInlinePadding;
        const right = Number.isFinite(paddingRight) ? paddingRight : resolvedInlinePadding;
        return left + right;
    }

    fitTimelineToViewport() {
        const body = this.elements.timelineBody;
        if (!body) return;

        const totalDuration = Math.max(Number(this.flow.store.getTimelineDuration?.()) || 0, 10);
        const trackOffset = this.getTrackOffsetWidth(body);
        const horizontalPadding = this.getHorizontalPadding(body);
        const availableWidth = Math.max(body.clientWidth - trackOffset - horizontalPadding, 320);
        const targetZoom = Math.round((availableWidth / Math.max(totalDuration * EditorTimelineViewportManager.BASE_PIXELS_PER_SECOND, 1)) * 100);
        this.pendingFitScrollReset = true;
        this.flow.store.setTimelineZoom(
            Math.max(EditorTimelineViewportManager.MIN_ZOOM, Math.min(EditorTimelineViewportManager.MAX_ZOOM, targetZoom)),
            { mode: 'fit' }
        );
    }

    render(state) {
        this.syncLockedGutterMask();
        const parsedZoom = Number(state?.timelineZoom);
        const zoom = Math.min(
            Math.max(Number.isFinite(parsedZoom) ? parsedZoom : 100, EditorTimelineViewportManager.MIN_ZOOM),
            EditorTimelineViewportManager.MAX_ZOOM
        );
        const zoomMode = state?.timelineZoomMode === 'fit' ? 'fit' : 'manual';
        if (this.elements.zoomInput) {
            this.elements.zoomInput.value = String(zoom);
        }
        if (this.elements.zoomValue) {
            // NLE-style: percentage only; fit mode is reflected on the fit button
            this.elements.zoomValue.textContent = `${zoom}%`;
            this.elements.zoomValue.title = zoomMode === 'fit'
                ? (window.i18n?.t?.('editor.fitTimeline') || '适配时间线')
                : '';
        }
        if (this.elements.zoomOutButton) {
            this.elements.zoomOutButton.disabled = zoom <= EditorTimelineViewportManager.MIN_ZOOM;
        }
        if (this.elements.zoomInButton) {
            this.elements.zoomInButton.disabled = zoom >= EditorTimelineViewportManager.MAX_ZOOM;
        }
        if (this.elements.fitButton) {
            this.elements.fitButton.disabled = !(this.flow.store.getTimelineDuration?.() > 0);
            this.elements.fitButton.classList.toggle('is-active', zoomMode === 'fit');
        }
        if (this.elements.snapButton) {
            const snapEnabled = state?.timelineSnapEnabled !== false;
            const snapTitle = snapEnabled ? '时间线吸附已开启 · 快捷键 N' : '时间线吸附已关闭 · 快捷键 N';
            this.elements.snapButton.classList.toggle('is-active', snapEnabled);
            this.elements.snapButton.setAttribute('aria-pressed', snapEnabled ? 'true' : 'false');
            this.elements.snapButton.setAttribute('aria-label', snapTitle);
            this.elements.snapButton.title = snapTitle;
        }

        if (this.pendingFitScrollReset && this.elements.timelineBody) {
            this.elements.timelineBody.scrollLeft = 0;
            this.syncLockedGutterMask();
            this.pendingFitScrollReset = false;
            return;
        }
        this.syncPlayheadIntoView(state);
    }

    syncPlayheadIntoView(state) {
        const body = this.elements.timelineBody;
        if (!body) return;

        const ruler = document.getElementById('editor-timeline-ruler');
        if (!ruler) return;

        const isPlaying = !!this.flow.playbackManager?.isPlaying;
        const playheadTime = Math.max(Number(state?.playheadTime) || 0, 0);
        const timelineDuration = Math.max(Number(ruler.dataset.renderDuration) || this.flow.store.getTimelineDuration(), 10);
        const rulerWidth = ruler.scrollWidth || ruler.clientWidth || 1;
        const playheadOffset = (playheadTime / timelineDuration) * rulerWidth;
        const viewportStart = body.scrollLeft;
        const viewportEnd = viewportStart + body.clientWidth;
        const padding = Math.max(body.clientWidth * 0.2, 80);

        if (isPlaying && playheadOffset > viewportEnd - padding) {
            body.scrollLeft = Math.max(0, playheadOffset - body.clientWidth + padding);
            this.syncLockedGutterMask();
            return;
        }

        if (isPlaying && playheadOffset < viewportStart + 40) {
            body.scrollLeft = Math.max(0, playheadOffset - 40);
            this.syncLockedGutterMask();
            return;
        }

        const playheadOutsideViewport = playheadOffset < viewportStart || playheadOffset > viewportEnd;
        if (!isPlaying && playheadOutsideViewport) {
            body.scrollLeft = Math.max(0, playheadOffset - Math.min(120, body.clientWidth * 0.25));
            this.syncLockedGutterMask();
        }
    }
}

window.EditorTimelineViewportManager = EditorTimelineViewportManager;

if (typeof module !== 'undefined') {
    module.exports = EditorTimelineViewportManager;
}
