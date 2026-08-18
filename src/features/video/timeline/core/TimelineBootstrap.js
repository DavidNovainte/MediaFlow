/**
 * TimelineBootstrap
 *
 * Owns timeline shell initialization: rebuilding core DOM, wiring persistent
 * events, and resetting the workspace back to a clean baseline.
 */
class TimelineBootstrap {
    static closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    static rebuildTimelineStructure(manager) {
        const body = document.querySelector('.timeline-body');
        if (!body) return;

        body.innerHTML = '';

        const rulerTrack = document.createElement('div');
        rulerTrack.className = 'timeline-track ruler-track';
        rulerTrack.innerHTML = `
            <div class="timeline-sidebar-label ruler-label">
                <i class="fa-solid fa-clock"></i> <span>${window.i18n?.t('creator.timeline.title') || 'Timeline'}</span>
            </div>
            <div class="ruler-area" id="timeline-ruler">
                <canvas id="creator-timeline-ruler-canvas"></canvas>
            </div>
        `;
        body.appendChild(rulerTrack);
        manager.rulerCanvas = rulerTrack.querySelector('#creator-timeline-ruler-canvas');

        const playhead = document.createElement('div');
        playhead.className = 'timeline-playhead';
        playhead.id = 'creator-timeline-playhead';
        playhead.style.pointerEvents = 'none';
        body.appendChild(playhead);
        manager.playhead = playhead;
    }

    static initTrackIndexMap(manager) {
        manager.trackIndexMap = {
            video: ['v1', 'v2', 'v3', 'v4', 'v5'],
            audio: ['a1', 'a2', 'a3', 'a4', 'a5']
        };
        if (window.TimelineTrackReorder) {
            window.TimelineTrackReorder.ensureState(manager);
        }
    }

    static bindToolbar(manager) {
        if (manager.zoomSlider) {
            manager.zoomSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const minZ = 0.1;
                const maxZ = 500;
                manager.zoomLevel = minZ * Math.pow(maxZ / minZ, val / 100);
                manager.renderAll(true);
            });

            const minZ = 0.1;
            const maxZ = 500;
            const initialSliderVal = (100 * Math.log(manager.zoomLevel / minZ)) / Math.log(maxZ / minZ);
            manager.zoomSlider.value = initialSliderVal;
        }

        document.getElementById('btn-timeline-zoom-fit')?.addEventListener('click', () => manager.zoomToFit());
        document.getElementById('btn-timeline-delete')?.addEventListener('click', () => manager.deleteSelectedSegment());
        document.getElementById('btn-timeline-split')?.addEventListener('click', () => manager.splitAtPlayhead());
        document.getElementById('btn-timeline-snap')?.addEventListener('click', () => manager.toggleSnap());

        const volBtn = document.getElementById('btn-timeline-volume');
        const volWrapper = document.getElementById('wrapper-timeline-volume');
        if (volBtn && volWrapper) {
            volBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                volWrapper.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!volWrapper.contains(e.target)) {
                    volWrapper.classList.remove('active');
                }
            });
        }

        const volSlider = document.getElementById('input-timeline-volume');
        const volValText = document.querySelector('#wrapper-timeline-volume .slider-val');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                const vol = parseInt(e.target.value, 10);
                if (volValText) volValText.textContent = `${vol}%`;
                manager.updateSelectedSegmentVolume(vol / 100);
            });
        }
    }

    static bindKeyboard(manager) {
        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                manager.app.history.undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                manager.app.history.redo();
            }
            if (e.shiftKey && e.key === 'Z') {
                e.preventDefault();
                manager.zoomToFit();
            }

            const isInput = e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT' || !!e.target?.isContentEditable;
            if (!isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                const step = e.shiftKey ? 1.0 : 0.1;
                const delta = e.key === 'ArrowRight' ? step : -step;
                const newTime = Math.max(0, Math.min(manager.duration, manager.currentTime + delta));

                if (newTime !== manager.currentTime) {
                    manager.currentTime = newTime;
                    manager.updatePlayhead(newTime);

                    if (manager.onSeek) {
                        const targetSourceTime = manager.getMappedSourceTime(newTime);
                        manager.onSeek(newTime, targetSourceTime);
                    }
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;
            if (manager.container.classList.contains('hidden')) return;
            if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;

            const key = e.key.toLowerCase();
            if (key === 'delete' || key === 'backspace') manager.deleteSelectedSegment();
            if (key === 's' || key === 'b') manager.splitAtPlayhead();
            if (key === 'n') manager.toggleSnap();
            if (key === 'v') {
                manager.app.showToast(window.i18n?.t('creator.timeline.selectionActive') || 'Selection tool active', 'info');
            }
            if (key === 'z' && e.shiftKey) {
                e.preventDefault();
                manager.zoomToFit();
            }
            if (key === 'k' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                manager.splitAtPlayhead();
            }
        });
    }

    static bindTimelineViewport(manager) {
        const tracksArea = manager.container.querySelector('.timeline-body');
        if (!tracksArea) return;

        tracksArea.addEventListener('mousedown', (e) => {
            if (TimelineBootstrap.closest(e.target, '.timeline-segment')) return;
            if (e.button !== 0) return;
            manager.isDraggingPlayhead = true;
            manager.seekFromMouseEvent(e);

            manager.selectedSegmentIndex = -1;
            manager.selectedTransitionIndex = -1;
            manager.app.uiManager?.hideProperties();
            manager.renderVideoTracks();
        });

        tracksArea.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -2 : 2;
                const minZ = 0.1;
                const maxZ = 500;
                const currentVal = (100 * Math.log(manager.zoomLevel / minZ)) / Math.log(maxZ / minZ);
                const newVal = Math.min(100, Math.max(0, currentVal + delta));
                manager.zoomLevel = minZ * Math.pow(maxZ / minZ, newVal / 100);

                if (manager.zoomSlider) manager.zoomSlider.value = newVal;
                manager.renderAll(true);
            } else {
                tracksArea.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('mousemove', (e) => {
            if (manager.isDraggingPlayhead) {
                manager.seekFromMouseEvent(e);
            } else if (manager.isDraggingClip || manager.isTrimmingClip) {
                manager.handleClipMouseMove(e);
            }
        });

        window.addEventListener('mouseup', (e) => {
            manager.isDraggingPlayhead = false;
            if (manager.isDraggingClip || manager.isTrimmingClip) {
                manager.handleClipMouseUp(e);
            }
        });
    }

    static bindObservers(manager) {
        manager.resizeObserver = new ResizeObserver(() => manager.renderAll());
        manager.resizeObserver.observe(manager.timelineBody);

        manager.timelineBody.addEventListener('scroll', () => {
            window.requestAnimationFrame(() => manager.renderAll());
        });
    }

    static bindEvents(manager) {
        this.bindToolbar(manager);
        this.bindKeyboard(manager);
        this.bindTimelineViewport(manager);
        this.bindObservers(manager);
    }

    static init(manager) {
        if (!manager.container) return;

        this.initTrackIndexMap(manager);
        this.rebuildTimelineStructure(manager);

        manager.createTrackDOM('v1', 'video');
        manager.createTrackDOM('a1', 'audio');

        const tracksViewport = manager.container.querySelector('.tracks-viewport') || manager.container.querySelector('.timeline-body');
        if (tracksViewport && manager.snapGuideLine) {
            tracksViewport.appendChild(manager.snapGuideLine);
        }

        if (!manager.eventsBound) {
            this.bindEvents(manager);
            manager.eventsBound = true;
        }

        manager.updateLabelContextMenus();
    }

    static reset(manager) {
        console.log('[CreatorTimelineManager] Resetting timeline tracks and data');

        manager.duration = 0;
        manager.currentTime = 0;
        manager.selectedTrackId = 'v1';
        manager.selectedSegmentIndex = -1;
        manager.selectedTransitionIndex = -1;
        manager.hasWaveform = false;
        manager.isExtracting = false;

        manager.tracks = {
            v1: { id: 'v1', segments: [] },
            a1: { id: 'a1', segments: [], peaks: [], audioBuffer: null }
        };
        manager.trackOrder = {
            video: ['v1'],
            audio: ['a1']
        };
        manager.trackDragState = null;

        this.init(manager);
        manager.updatePlayhead(0);
    }
}

window.TimelineBootstrap = TimelineBootstrap;
