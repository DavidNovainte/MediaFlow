/**
 * TimelineClipControls
 *
 * Owns clip-level inspector actions such as volume, speed, snap state and the
 * related toolbar UI sync.
 */
class TimelineClipControls {
    static updateSelectedSegmentVolume(manager, volume) {
        if (manager.selectedSegmentIndex === -1 || !manager.selectedTrackId) return;

        const track = manager.tracks[manager.selectedTrackId];
        if (!track) return;

        const seg = track.segments[manager.selectedSegmentIndex];
        if (!seg) return;

        seg.volume = volume;
        manager.app.previewHandler?.updateClipVolume?.(manager.selectedTrackId, manager.selectedSegmentIndex, volume);
    }

    static updateSelectedSegmentSpeed(manager, speed) {
        if (manager.selectedSegmentIndex === -1 || !manager.selectedTrackId) return;

        const track = manager.tracks[manager.selectedTrackId];
        if (!track) return;

        const seg = track.segments[manager.selectedSegmentIndex];
        if (!seg) return;

        const oldSpeed = seg.speed || 1.0;
        if (oldSpeed === speed) return;

        const sourceDuration = (seg.end - seg.start) * oldSpeed;
        const newDuration = sourceDuration / speed;

        seg.speed = speed;
        seg.end = seg.start + newDuration;

        if (seg.groupId) {
            Object.values(manager.tracks).forEach((candidateTrack) => {
                if (candidateTrack.id === manager.selectedTrackId) return;

                candidateTrack.segments.forEach((linkedSeg) => {
                    if (linkedSeg.groupId === seg.groupId && linkedSeg.speed !== speed) {
                        linkedSeg.speed = speed;
                        linkedSeg.end = linkedSeg.start + newDuration;
                    }
                });
            });
        }

        manager.renderAll();
        manager.syncSegmentsWithApp();
    }

    static toggleSnap(manager) {
        manager.snapEnabled = !manager.snapEnabled;

        const btn = document.getElementById('btn-timeline-snap');
        if (btn) btn.classList.toggle('active', manager.snapEnabled);

        manager.app.showToast(
            manager.snapEnabled
                ? (window.i18n?.t('creator.timeline.snapOn') || 'Snapping enabled')
                : (window.i18n?.t('creator.timeline.snapOff') || 'Snapping disabled'),
            'info'
        );

        if (!manager.snapEnabled && manager.snapGuideLine) {
            manager.snapGuideLine.style.display = 'none';
        }
    }

    static syncVolumeUI(volume) {
        const volSlider = document.getElementById('input-timeline-volume');
        const volValText = document.querySelector('#wrapper-timeline-volume .slider-val');
        const normalizedVolume = volume !== undefined && volume !== null ? volume : 1.0;
        const volVal = Math.round(normalizedVolume * 100);

        if (volSlider) volSlider.value = volVal;
        if (volValText) volValText.textContent = `${volVal}%`;
    }
}

window.TimelineClipControls = TimelineClipControls;
