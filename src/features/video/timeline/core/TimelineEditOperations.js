/**
 * TimelineEditOperations
 * Owns split/delete editing operations for the timeline.
 */
class TimelineEditOperations {
    static splitAtPlayhead(manager) {
        const time = manager.currentTime;
        const oldState = manager.captureState();
        const targets = [];

        const selectedTrack = manager.tracks[manager.selectedTrackId];
        const selectedSeg = selectedTrack?.segments[manager.selectedSegmentIndex];

        if (selectedSeg && time > selectedSeg.start + 0.1 && time < selectedSeg.end - 0.1) {
            targets.push({
                trackId: manager.selectedTrackId,
                index: manager.selectedSegmentIndex,
                segment: selectedSeg
            });

            if (selectedSeg.groupId) {
                Object.values(manager.tracks).forEach((track) => {
                    if (track.id === manager.selectedTrackId) return;

                    track.segments.forEach((seg, index) => {
                        if (seg.groupId === selectedSeg.groupId && time > seg.start + 0.1 && time < seg.end - 0.1) {
                            targets.push({ trackId: track.id, index, segment: seg });
                        }
                    });
                });
            }
        } else {
            Object.values(manager.tracks).forEach((track) => {
                const index = track.segments.findIndex((seg) => time > seg.start + 0.1 && time < seg.end - 0.1);
                if (index !== -1) {
                    targets.push({ trackId: track.id, index, segment: track.segments[index] });
                }
            });
        }

        if (targets.length === 0) {
            console.log('[Timeline] No segments to split at playhead.');
            return;
        }

        const execute = () => {
            const timeStr = Date.now();
            const newGroupIds = new Map();

            targets
                .sort((a, b) => b.index - a.index)
                .forEach((target) => {
                    const track = manager.tracks[target.trackId];
                    const seg = track.segments[target.index];
                    const offset = time - seg.start;

                    let leftId = null;
                    let rightId = null;

                    if (seg.groupId) {
                        if (!newGroupIds.has(seg.groupId)) {
                            newGroupIds.set(seg.groupId, {
                                left: `group_L_${seg.groupId}_${timeStr}`,
                                right: `group_R_${seg.groupId}_${timeStr}`
                            });
                        }

                        const mapping = newGroupIds.get(seg.groupId);
                        leftId = mapping.left;
                        rightId = mapping.right;
                    } else if (target.trackId === 'v1' || target.trackId === 'a1') {
                        const defaultKey = 'v1_a1_link';
                        if (!newGroupIds.has(defaultKey)) {
                            newGroupIds.set(defaultKey, {
                                left: `group_L_main_${timeStr}`,
                                right: `group_R_main_${timeStr}`
                            });
                        }

                        const mapping = newGroupIds.get(defaultKey);
                        leftId = mapping.left;
                        rightId = mapping.right;
                    }

                    const leftSeg = { ...seg, end: time, groupId: leftId };
                    const rightSeg = {
                        ...seg,
                        start: time,
                        sourceStart: (seg.sourceStart || 0) + offset,
                        groupId: rightId
                    };

                    track.segments.splice(target.index, 1, leftSeg, rightSeg);
                });

            manager.renderAll();
            manager.syncSegmentsWithApp();
        };

        const undo = () => manager.applyState(oldState);
        manager.app.history.execute({ execute, undo });
    }

    static deleteSelectedSegment(manager) {
        if (!manager.selectedTrackId || manager.selectedSegmentIndex < 0) return;

        const track = manager.tracks[manager.selectedTrackId];
        if (!track) return;

        const segments = track.segments;
        if (manager.selectedSegmentIndex >= segments.length) return;

        const oldIndex = manager.selectedSegmentIndex;
        const targetTrackId = manager.selectedTrackId;
        const oldState = manager.captureState();
        const deletedSeg = manager.tracks[targetTrackId].segments[oldIndex];

        const execute = () => {
            manager.tracks[targetTrackId].segments.splice(oldIndex, 1);

            if (deletedSeg.groupId) {
                Object.values(manager.tracks).forEach((candidateTrack) => {
                    for (let i = candidateTrack.segments.length - 1; i >= 0; i--) {
                        const seg = candidateTrack.segments[i];
                        if (seg.groupId === deletedSeg.groupId) {
                            console.log(`[Timeline] Linked delete: removing segment on ${candidateTrack.id} at index ${i}`);
                            candidateTrack.segments.splice(i, 1);
                        }
                    }
                });
            } else if (targetTrackId === 'v1' && manager.tracks.a1) {
                const a1Segments = manager.tracks.a1.segments;
                for (let i = a1Segments.length - 1; i >= 0; i--) {
                    const seg = a1Segments[i];
                    if (Math.abs(seg.start - deletedSeg.start) < 0.1 && Math.abs(seg.end - deletedSeg.end) < 0.1) {
                        a1Segments.splice(i, 1);
                    }
                }
            }

            manager.selectedSegmentIndex = -1;
            manager.renderAll();
            manager.syncSegmentsWithApp();
            manager.updatePlayhead(manager.currentTime);
        };

        const undo = () => manager.applyState(oldState);
        manager.app.history.execute({ execute, undo });
    }
}

window.TimelineEditOperations = TimelineEditOperations;
