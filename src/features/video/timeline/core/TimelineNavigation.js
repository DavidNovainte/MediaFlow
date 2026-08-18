/**
 * TimelineNavigation
 *
 * Owns the timeline timebase helpers: source/timeline mapping updates,
 * playhead drawing, seeking, ruler formatting, and zoom-to-fit behavior.
 */
class TimelineNavigation {
    static updatePlayhead(manager, absTime) {
        if (manager.isDraggingPlayhead) return;

        const timelineTime = manager.getMappedTimelineTime(absTime);

        if (timelineTime !== null) {
            const currentSourceTime = absTime;
            const expectedSourceTime = manager.getMappedSourceTime(timelineTime);

            if (Math.abs(currentSourceTime - expectedSourceTime) > 0.5) {
                console.log(
                    `[PlaybackSync] Detected nonlinear mapping drift. Current ${currentSourceTime.toFixed(2)}s, expected ${expectedSourceTime.toFixed(2)}s.`
                );
                if (manager.onSeek) manager.onSeek(expectedSourceTime);
            }

            manager.currentTime = timelineTime;
            manager.syncAudioLevels(timelineTime);

            const vTrack = manager.tracks.v1;
            const currentSegIndex = vTrack
                ? vTrack.segments.findIndex((s) => timelineTime >= s.start - 0.05 && timelineTime <= s.end + 0.05)
                : -1;

            const hasVideoContent = Object.values(manager.tracks)
                .filter((track) => track.id.startsWith('v'))
                .some((track) => track.segments.some((s) => timelineTime >= s.start - 0.05 && timelineTime <= s.end + 0.05));

            manager.app.previewHandler?.setVideoVisibility(hasVideoContent);

            if (currentSegIndex !== -1 && manager.lastSegmentIndex !== -1 && currentSegIndex !== manager.lastSegmentIndex) {
                const outgoingSeg = vTrack.segments[manager.lastSegmentIndex];
                if (outgoingSeg?.transition?.id && outgoingSeg.transition.id !== 'none') {
                    manager.app.previewHandler?.playTransitionEffect(
                        outgoingSeg.transition.id,
                        outgoingSeg.transition.duration || 1.0
                    );
                }
            }

            if (currentSegIndex !== -1) {
                manager.lastSegmentIndex = currentSegIndex;
            }
        } else {
            let globalEndTime = 0;
            Object.values(manager.tracks).forEach((track) => {
                track.segments.forEach((s) => {
                    if (s.end > globalEndTime) globalEndTime = s.end;
                });
            });

            if (manager.currentTime >= globalEndTime - 0.1) {
                manager.app.previewHandler?.setVideoVisibility(false);
                const player = manager.app.previewHandler?.elements?.video;
                if (player && !player.paused) player.pause();
                manager.lastSegmentIndex = -1;
            } else {
                let earliestNextStart = Infinity;
                let nextSegData = null;

                Object.values(manager.tracks).forEach((track) => {
                    track.segments.forEach((s, index) => {
                        if (s.start > manager.currentTime - 0.05 && s.start < earliestNextStart) {
                            earliestNextStart = s.start;
                            nextSegData = { trackId: track.id, index, segment: s };
                        }
                    });
                });

                if (nextSegData) {
                    console.log(
                        `[Timeline] Entered a timeline gap at ${manager.currentTime.toFixed(3)}s, jumping to ${nextSegData.segment.start.toFixed(3)}s`
                    );
                    manager.currentTime = nextSegData.segment.start;

                    if (nextSegData.trackId === 'v1') {
                        manager.lastSegmentIndex = nextSegData.index;
                    }

                    if (manager.onSeek) {
                        manager.onSeek(nextSegData.segment.sourceStart || 0);
                    }
                }
            }
        }

        this.updatePlayheadPosition(manager);
    }

    static seekFromMouseEvent(manager, e) {
        if (!manager.duration) return;

        const rect = manager.timelineBody.getBoundingClientRect();
        const scrollLeft = manager.timelineBody.scrollLeft;
        let x = e.clientX - rect.left - 120 + scrollLeft;

        if (x < 0) x = 0;

        const currentPixelsPerSecond = manager.pixelsPerSecond * (manager.zoomLevel / 100);
        let time = x / currentPixelsPerSecond;
        if (time > manager.duration) time = manager.duration;

        time = manager.calculateSnap(time);
        if (manager.snapGuideLine) manager.snapGuideLine.style.display = 'none';

        manager.currentTime = time;
        this.updatePlayheadPosition(manager);
        manager.syncAudioLevels(time);

        if (manager.onSeek) {
            const targetSourceTime = manager.getMappedSourceTime(time);
            if (targetSourceTime !== null) {
                manager.onSeek(targetSourceTime);
            }
        }
    }

    static isTimelinePlaybackActive(manager) {
        const preview = manager.app.previewHandler;
        if (!preview) return false;

        if (typeof preview._timelinePlaybackRequested === 'boolean') {
            return preview._timelinePlaybackRequested;
        }

        const videoPaused = preview.elements?.video?.paused;
        const audioPaused = preview.elements?.audioPlayer?.paused;

        return manager.app.isAudioOnly ? audioPaused === false : videoPaused === false;
    }

    static updatePlayheadPosition(manager) {
        if (!manager.duration) return;

        const currentPixelsPerSecond = manager.pixelsPerSecond * (manager.zoomLevel / 100);
        const x = manager.currentTime * currentPixelsPerSecond;

        if (manager.playhead) {
            manager.playhead.style.transform = `translateX(${x}px)`;

            const scrollLeft = manager.timelineBody.scrollLeft;
            manager.playhead.style.opacity = x < scrollLeft ? '0' : '1';

            const scrollHeight = manager.timelineBody.scrollHeight;
            manager.playhead.style.height = `${scrollHeight}px`;

            const isPlaying = this.isTimelinePlaybackActive(manager);
            if (isPlaying && !manager.isDraggingPlayhead) {
                const container = manager.timelineBody;
                const currentScrollLeft = container.scrollLeft;
                const viewportWidth = container.clientWidth - 120;
                const padding = 50;

                if (x > (currentScrollLeft + viewportWidth * 0.8)) {
                    container.scrollLeft = x - (viewportWidth * 0.2);
                }

                if (x < currentScrollLeft) {
                    container.scrollLeft = x - padding;
                }
            }
        }

        if (manager.timeDisplay) {
            manager.timeDisplay.textContent = this.formatTime(manager.currentTime);
        }

        manager.app.subtitleLaneManager?.updateActiveState?.();
        manager.app.subtitlePreviewOverlay?.updateActiveSubtitle?.(manager.currentTime);
    }

    static formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    static zoomToFit(manager) {
        if (!manager.duration) return;

        const padding = 120;
        const containerWidth = manager.timelineBody.clientWidth;
        const viewportWidth = Math.max(200, containerWidth - padding);

        let targetZoom = (viewportWidth * 100) / (manager.duration * manager.pixelsPerSecond);
        targetZoom = Math.min(500, Math.max(1.0, targetZoom));
        manager.zoomLevel = targetZoom;

        if (manager.zoomSlider) {
            const minZ = 0.1;
            const maxZ = 500;
            const sliderVal = (100 * Math.log(targetZoom / minZ)) / Math.log(maxZ / minZ);
            manager.zoomSlider.value = sliderVal;
        }

        manager.app.showToast(window.i18n?.t('creator.timeline.zoomToFitDone') || 'Timeline zoomed to fit project', 'info');
        manager.renderAll(true);
    }

    static formatRulerTime(seconds) {
        const cleanSec = Math.round(seconds * 10) / 10;

        if (cleanSec < 60) return `${cleanSec}s`;
        const m = Math.floor(cleanSec / 60);
        const s = Math.round(cleanSec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

window.TimelineNavigation = TimelineNavigation;
