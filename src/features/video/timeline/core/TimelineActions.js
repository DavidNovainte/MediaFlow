/**
 * TimelineActions
 *
 * Owns timeline command-style actions so the manager can stay focused on
 * coordination rather than editing rules.
 */
class TimelineActions {
    static unlinkSegment(manager, groupId) {
        if (!groupId) return;

        Object.values(manager.tracks).forEach((track) => {
            track.segments.forEach((seg) => {
                if (seg.groupId === groupId) {
                    delete seg.groupId;
                }
            });
        });

        manager.app.showToast(window.i18n?.t('creator.timeline.unlinkDone') || 'Audio/Video unlinked', 'info');
        manager.renderAll();
    }

    static autoLinkSegment(manager, trackId, index) {
        const target = manager.tracks[trackId]?.segments?.[index];
        if (!target) return;

        const newGroupId = `group_${Date.now()}`;
        let linkCount = 0;

        Object.values(manager.tracks).forEach((track) => {
            track.segments.forEach((seg) => {
                if (Math.abs(seg.start - target.start) < 0.1) {
                    seg.groupId = newGroupId;
                    linkCount++;
                }
            });
        });

        if (linkCount > 1) {
            manager.app.showToast(
                window.i18n?.t('creator.timeline.linkSuccess', { count: linkCount }) || `Linked ${linkCount} segments successfully`,
                'success'
            );
        } else {
            delete target.groupId;
            manager.app.showToast(window.i18n?.t('creator.timeline.linkNoTarget') || 'No alignment segments found', 'warning');
        }

        manager.renderAll();
    }

    static removeTrack(manager, trackId) {
        if (trackId === 'v1' || trackId === 'a1') return;

        const oldState = manager.captureState();
        const execute = () => {
            if (window.TimelineTrackReorder) {
                window.TimelineTrackReorder.unregisterTrack(manager, trackId);
            }
            delete manager.tracks[trackId];
            const el = document.getElementById(`track-${trackId}`);
            if (el) el.remove();
            manager.renderAll();
        };
        const undo = () => manager.applyState(oldState);

        manager.app.history.execute({ execute, undo });
    }

    static addTrack(manager, type = 'video', relativeId = null, position = null) {
        const prefix = type === 'video' ? 'v' : 'a';
        let i = 1;
        let newId = `${prefix}${i}`;

        while (manager.tracks[newId]) {
            i++;
            newId = `${prefix}${i}`;
        }

        const oldState = manager.captureState();
        const execute = () => {
            if (type === 'video') {
                manager.tracks[newId] = { id: newId, segments: [] };
            } else {
                manager.tracks[newId] = { id: newId, segments: [], peaks: [], audioBuffer: null };
            }

            this.createTrackDOM(manager, newId, type, relativeId, position);
            manager.renderAll();
            manager.updateLabelContextMenus();
        };
        const undo = () => manager.applyState(oldState);

        manager.app.history.execute({ execute, undo });
    }

    static moveSegmentToStart(manager, trackId, index) {
        const track = manager.tracks[trackId];
        if (!track) return;

        const seg = track.segments[index];
        if (!seg) return;

        const oldState = manager.captureState();
        const duration = seg.end - seg.start;

        const execute = () => {
            let earliestAvailable = 0;
            const targetTracks = [trackId];

            if (seg.groupId) {
                Object.values(manager.tracks).forEach((candidateTrack) => {
                    if (candidateTrack.id !== trackId && candidateTrack.segments.some((s) => s.groupId === seg.groupId)) {
                        targetTracks.push(candidateTrack.id);
                    }
                });
            }

            targetTracks.forEach((targetTrackId) => {
                const targetTrack = manager.tracks[targetTrackId];
                targetTrack.segments.forEach((candidateSeg) => {
                    if (candidateSeg !== seg && (candidateSeg.groupId !== seg.groupId || seg.groupId === undefined)) {
                        if (candidateSeg.start < seg.start) {
                            earliestAvailable = Math.max(earliestAvailable, candidateSeg.end);
                        }
                    }
                });
            });

            const totalDelta = earliestAvailable - seg.start;
            seg.start = earliestAvailable;
            seg.end = earliestAvailable + duration;

            if (seg.groupId) {
                Object.values(manager.tracks).forEach((candidateTrack) => {
                    candidateTrack.segments.forEach((linkedSeg) => {
                        if (linkedSeg.groupId === seg.groupId && linkedSeg !== seg) {
                            const linkedDuration = linkedSeg.end - linkedSeg.start;
                            linkedSeg.start += totalDelta;
                            linkedSeg.end = linkedSeg.start + linkedDuration;
                        }
                    });
                });
            }

            manager.renderAll();
            manager.currentTime = earliestAvailable;
            manager.updatePlayhead(earliestAvailable);

            if (manager.onSeek) {
                const targetSourceTime = manager.getMappedSourceTime(earliestAvailable);
                manager.onSeek(targetSourceTime);
            }

            manager.timelineBody.scrollLeft = 0;
            manager.app.showToast(window.i18n?.t('creator.timeline.moveStartToast') || 'Aligned to front', 'success');
        };

        const undo = () => manager.applyState(oldState);
        manager.app.history.execute({ execute, undo });
    }

    static createTrackDOM(manager, id, type, relativeId = null, position = null) {
        const body = document.querySelector('.timeline-body');
        if (!body) return;

        if (window.TimelineTrackReorder) {
            window.TimelineTrackReorder.registerTrack(manager, id, type, relativeId, position);
        }

        const tr = document.createElement('div');
        tr.className = `timeline-track ${type}-track`;
        tr.id = `track-${id}`;

        const label = document.createElement('div');
        label.className = 'timeline-sidebar-label';
        label.style.cursor = 'grab';

        const icon = type === 'video' ? 'fa-video' : 'fa-microphone-lines';
        const trackNum = id.replace(/[av]/gi, '');
        const name = type === 'video'
            ? (window.i18n?.t('creator.timeline.trackVideo', { num: trackNum }) || `Video Track ${trackNum}`)
            : (window.i18n?.t('creator.timeline.trackAudio', { num: trackNum }) || `Audio Track ${trackNum}`);
        label.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${name}</span>`;
        window.TimelineTrackAudioControls?.decorateLabel?.(manager, label, id, type, name, icon);

        const content = document.createElement('div');
        content.className = type === 'video' ? 'track-content-area' : 'waveform-area';
        content.id = type === 'video' ? `track-content-${id}` : `timeline-waveform-${id}`;

        const canvas = document.createElement('canvas');
        canvas.id = type === 'video' ? `video-waveform-canvas-${id}` : `timeline-waveform-canvas-${id}`;
        canvas.className = 'track-viewport-canvas';
        content.appendChild(canvas);

        tr.appendChild(label);
        tr.appendChild(content);

        if (relativeId && position) {
            const relEl = document.getElementById(`track-${relativeId}`);
            if (relEl) {
                relEl.insertAdjacentElement(position === 'above' ? 'beforebegin' : 'afterend', tr);
            } else {
                body.appendChild(tr);
            }
        } else {
            body.appendChild(tr);
        }

        window.TimelineTrackAudioControls?.refreshTrackState?.(manager, id);
    }

    static selectTransition(manager, trackId, index) {
        manager.selectedTrackId = trackId;
        manager.selectedTransitionIndex = index;
        manager.selectedSegmentIndex = -1;

        manager.renderVideoTracks();

        const seg = manager.tracks[trackId]?.segments?.[index];
        if (!seg) return;

        manager.app.uiManager?.showProperties('transition', {
            transition: seg.transition
        });

        const junctionTime = seg.end;
        manager.app.previewHandler?.seekTo(junctionTime - 0.5);

        if (manager.app.transitionManager?.updatePanel) {
            manager.app.transitionManager.updatePanel(seg.transition);
        }
    }
}

window.TimelineActions = TimelineActions;
