/** @jest-environment jsdom */

describe('EditorProjectStore', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
    });

    beforeEach(() => {
        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12 },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 8 }
        ]);
    });

    it('adds multiple assets into their matching timeline tracks', () => {
        this.store.addAssetsToTimeline(['asset-video', 'asset-audio']);
        const state = this.store.getState();

        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.audio[0].assetId).toBe('asset-video');
        expect(state.timeline.audio[1].assetId).toBe('asset-audio');
        expect(state.selectedClipId).toBe(state.timeline.audio[1].id);
    });

    it('ripples later auto-inserted clips when placeholder video durations resolve', () => {
        this.store.upsertAssets([
            { id: 'asset-intro', name: 'intro.mp4', kind: 'video', duration: 0 },
            { id: 'asset-main', name: 'main.mp4', kind: 'video', duration: 0 },
            { id: 'asset-outro', name: 'outro.mp4', kind: 'video', duration: 0 }
        ]);

        this.store.addAssetsToTimeline(['asset-intro', 'asset-main', 'asset-outro']);
        expect(this.store.getState().timeline.video.map((clip) => clip.timelineStart)).toEqual([0, 5, 10]);

        this.store.updateAsset('asset-intro', { duration: 85.4 });
        this.store.updateAsset('asset-main', { duration: 12.6 });

        const state = this.store.getState();
        expect(state.timeline.video.map((clip) => clip.timelineStart)).toEqual([0, 85.4, 98]);
        expect(state.timeline.video.map((clip) => clip.timelineEnd)).toEqual([85.4, 98, 103]);
        expect(state.timeline.audio.map((clip) => clip.timelineStart)).toEqual([0, 85.4, 98]);
        expect(state.timeline.audio.map((clip) => clip.timelineEnd)).toEqual([85.4, 98, 103]);
    });

    it('splits a selected clip into two timeline clips', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        const secondClip = this.store.splitClip(clip.id, 0.25);
        const state = this.store.getState();

        expect(secondClip).toBeTruthy();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.video[0].duration).toBeCloseTo(3, 3);
        expect(state.timeline.video[1].duration).toBeCloseTo(9, 3);
    });

    it('ripple deletes a clip and closes the gap on the same track', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');

        expect(second.timelineStart).toBe(12);

        this.store.deleteClip(first.id, { ripple: true });
        const state = this.store.getState();

        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
    });

    it('moves a later clip to an explicit time on the track', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');

        this.store.reorderClip(second.id, 20);
        const state = this.store.getState();

        expect(state.timeline.video[0].id).toBe(first.id);
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[1].id).toBe(second.id);
        expect(state.timeline.video[1].timelineStart).toBe(20);
    });

    it('updates clip trim and keeps duration in sync with source in and out', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.updateClipTrim(clip.id, {
            sourceStart: 2,
            sourceEnd: 7.5
        });

        const updated = this.store.getSelectedClip();
        expect(updated.sourceStart).toBe(2);
        expect(updated.sourceEnd).toBe(7.5);
        expect(updated.duration).toBe(5.5);
        expect(updated.timelineEnd).toBe(5.5);
    });

    it('trims the left edge and keeps source and timeline start aligned', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.trimClipEdge(clip.id, 'start', 2.5);

        const updated = this.store.getSelectedClip();
        expect(updated.timelineStart).toBe(2.5);
        expect(updated.sourceStart).toBe(2.5);
        expect(updated.duration).toBe(9.5);
    });

    it('trims the right edge and keeps timeline end aligned with source out', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.trimClipEdge(clip.id, 'end', 7.25);

        const updated = this.store.getSelectedClip();
        expect(updated.timelineEnd).toBe(7.25);
        expect(updated.sourceEnd).toBe(7.25);
        expect(updated.duration).toBe(7.25);
    });

    it('trims linked source audio together with a video edge change', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.trimClipEdge(clip.id, 'start', 2);

        const state = this.store.getState();
        expect(state.timeline.video[0].timelineStart).toBe(2);
        expect(state.timeline.video[0].sourceStart).toBe(2);
        expect(state.timeline.video[0].duration).toBe(10);
        expect(state.timeline.audio[0].timelineStart).toBe(2);
        expect(state.timeline.audio[0].sourceStart).toBe(2);
        expect(state.timeline.audio[0].duration).toBe(10);
    });

    it('updates linked source audio when inspector trim values change', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.updateClipTrim(clip.id, {
            sourceStart: 1.5,
            sourceEnd: 9
        });

        const state = this.store.getState();
        expect(state.timeline.video[0].sourceStart).toBe(1.5);
        expect(state.timeline.video[0].sourceEnd).toBe(9);
        expect(state.timeline.video[0].duration).toBe(7.5);
        expect(state.timeline.audio[0].sourceStart).toBe(1.5);
        expect(state.timeline.audio[0].sourceEnd).toBe(9);
        expect(state.timeline.audio[0].duration).toBe(7.5);
    });

    it('keeps linked video and source audio aligned when playback speed changes', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        const updated = this.store.updateClip(clip.id, { speed: 2 });
        const state = this.store.getState();

        expect(updated.speed).toBe(2);
        expect(state.timeline.video[0].duration).toBe(6);
        expect(state.timeline.video[0].timelineEnd).toBe(6);
        expect(state.timeline.video[0].sourceEnd).toBe(12);
        expect(state.timeline.audio[0].speed).toBe(2);
        expect(state.timeline.audio[0].duration).toBe(6);
        expect(state.timeline.audio[0].timelineEnd).toBe(6);
        expect(state.timeline.audio[0].sourceEnd).toBe(12);
    });

    it('syncs linked source audio controls when changing video clip volume and mute', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.updateClip(clip.id, { volume: 35, muted: true });
        const state = this.store.getState();

        expect(state.timeline.video[0].volume).toBe(35);
        expect(state.timeline.video[0].muted).toBe(true);
        expect(state.timeline.audio[0].volume).toBe(35);
        expect(state.timeline.audio[0].muted).toBe(true);
    });

    it('trims sped-up linked clip edges using timeline seconds converted to source seconds', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.updateClip(clip.id, { speed: 2 });

        this.store.trimClipEdge(clip.id, 'start', 1);
        const state = this.store.getState();

        expect(state.timeline.video[0].timelineStart).toBe(1);
        expect(state.timeline.video[0].timelineEnd).toBe(6);
        expect(state.timeline.video[0].sourceStart).toBe(2);
        expect(state.timeline.video[0].sourceEnd).toBe(12);
        expect(state.timeline.video[0].duration).toBe(5);
        expect(state.timeline.audio[0].timelineStart).toBe(1);
        expect(state.timeline.audio[0].sourceStart).toBe(2);
        expect(state.timeline.audio[0].duration).toBe(5);
    });

    it('splits and merges sped-up linked clips without losing source-time continuity', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.updateClip(clip.id, { speed: 2 });

        const secondClip = this.store.splitClipAtTime(clip.id, 3);
        let state = this.store.getState();

        expect(secondClip).toBeTruthy();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(3);
        expect(state.timeline.video[0].sourceEnd).toBe(6);
        expect(state.timeline.video[1].timelineStart).toBe(3);
        expect(state.timeline.video[1].timelineEnd).toBe(6);
        expect(state.timeline.video[1].sourceStart).toBe(6);
        expect(state.timeline.video[1].sourceEnd).toBe(12);
        expect(state.timeline.audio[0].sourceEnd).toBe(6);
        expect(state.timeline.audio[1].sourceStart).toBe(6);

        this.store.mergeSelectedClips();
        state = this.store.getState();

        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].speed).toBe(2);
        expect(state.timeline.video[0].timelineEnd).toBe(6);
        expect(state.timeline.video[0].sourceStart).toBe(0);
        expect(state.timeline.video[0].sourceEnd).toBe(12);
        expect(state.timeline.audio[0].timelineEnd).toBe(6);
        expect(state.timeline.audio[0].sourceEnd).toBe(12);
    });

    it('blocks linked trimming when a companion track is locked', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackLocked('a1');

        const result = this.store.trimClipEdge(clip.id, 'start', 2);

        const state = this.store.getState();
        expect(result).toBeNull();
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[0].sourceStart).toBe(0);
        expect(state.timeline.audio[0].timelineStart).toBe(0);
        expect(state.timeline.audio[0].sourceStart).toBe(0);
    });

    it('blocks linked edge trimming when a companion cannot reach the same edge', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const sourceAudioClip = this.store.getState().timeline.audio[0];
        this.store.detachLinkedClipGroup(videoClip.id);
        this.store.deleteClip(sourceAudioClip.id);
        const shortAudioClip = this.store.addAssetToTimeline('asset-audio');
        this.store.setSelectedClips([videoClip.id, shortAudioClip.id], videoClip.id);
        this.store.relinkSelectedClips();

        const result = this.store.trimClipEdge(videoClip.id, 'end', 10);

        const state = this.store.getState();
        expect(result).toBeNull();
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.audio[0].timelineEnd).toBe(8);
    });

    it('blocks splitting a linked group when a non-intersecting companion track is locked', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClip = this.store.getTrack('audio')[0];
        const originalLinkGroupId = videoClip.linkGroupId;
        this.store.updateClip(linkedAudioClip.id, {
            timelineStart: 6,
            duration: 6,
            timelineEnd: 12
        });
        this.store.toggleTrackLocked('audio');

        const result = this.store.splitClipAtTime(videoClip.id, 3);
        const state = this.store.getState();

        expect(result).toBeNull();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].linkGroupId).toBe(originalLinkGroupId);
        expect(state.timeline.audio[0].linkGroupId).toBe(originalLinkGroupId);
    });

    it('toggles track mute and lock controls independently', () => {
        expect(this.store.isTrackMuted('video')).toBe(false);
        expect(this.store.isTrackLocked('video')).toBe(false);

        this.store.toggleTrackMuted('video');
        this.store.toggleTrackLocked('video');

        expect(this.store.isTrackMuted('video')).toBe(true);
        expect(this.store.isTrackLocked('video')).toBe(true);
    });

    it('activates solo mode for one track and deactivates the others', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.addAssetToTimeline('asset-audio');
        this.store.toggleTrackSolo('audio');

        expect(this.store.hasSoloTracks()).toBe(true);
        expect(this.store.isTrackActive('audio')).toBe(true);
        expect(this.store.isTrackActive('video')).toBe(false);
        expect(this.store.getActiveClipAtTime(1, ['video', 'audio'])?.kind).toBe('audio');
    });

    it('supports additive clip selection and keeps the latest clip as primary', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');

        this.store.setClipSelection(first.id);
        this.store.setClipSelection(second.id, { additive: true, toggle: true });

        const state = this.store.getState();
        expect(state.selectedClipId).toBe(second.id);
        expect(state.selectedClipIds).toEqual([first.id, second.id]);
    });

    it('undoes and redoes a clip reorder without losing the clip', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.reorderClip(clip.id, 20);
        expect(this.store.canUndo()).toBe(true);
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(20);

        this.store.undo();
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(0);
        expect(this.store.canRedo()).toBe(true);

        this.store.redo();
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(20);
    });

    it('groups a drag-style transaction into a single undo step', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.beginHistoryTransaction();
        this.store.reorderClip(clip.id, 6);
        this.store.reorderClip(clip.id, 8);
        this.store.endHistoryTransaction();

        expect(this.store.getState().timeline.video[0].timelineStart).toBe(8);

        this.store.undo();
        expect(this.store.getState().timeline.video[0].timelineStart).toBe(0);
    });

    it('copies the selected linked clip group and pastes it at the playhead', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        const originalLinkedClipIds = this.store.getDraggedClipIds(clip.id, [clip.id]);

        this.store.copySelectedClipGroup();
        this.store.setPlayheadTime(8);
        const pasted = this.store.pasteCopiedClips();
        const state = this.store.getState();
        const pastedLinkedClipIds = this.store.getDraggedClipIds(state.selectedClipId, state.selectedClipIds);

        expect(this.store.hasCopiedClips()).toBe(true);
        expect(pasted).toHaveLength(2);
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
        expect(state.selectedClipIds).toHaveLength(2);
        expect(pastedLinkedClipIds).toHaveLength(2);
        expect(pastedLinkedClipIds).not.toEqual(originalLinkedClipIds);
    });

    it('repeats pasted clips forward from the last paste position', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.copySelectedClipGroup();
        this.store.setPlayheadTime(8);
        this.store.pasteCopiedClips();
        this.store.setPlayheadTime(1);
        const pastedForward = this.store.pasteCopiedClipsForward();

        const state = this.store.getState();
        expect(pastedForward).toHaveLength(2);
        expect(state.timeline.video).toHaveLength(3);
        expect(state.timeline.audio).toHaveLength(3);
        expect(state.timeline.video[2].timelineStart).toBe(24);
        expect(state.timeline.audio[2].timelineStart).toBe(24);
    });

    it('does not partially paste a multi-clip clipboard when one source asset is missing', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const audioClip = this.store.addAssetToTimeline('asset-audio');
        this.store.copyClipSelection([videoClip.id, audioClip.id], videoClip.id);
        this.store.deleteAsset('asset-audio');

        const pasted = this.store.pasteCopiedClips(20);
        const state = this.store.getState();

        expect(pasted).toBeNull();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].id).toBe(videoClip.id);
    });

    it('duplicates the selected linked clip group directly after the source without replacing the clipboard', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.copyClipOnly(clip.id);
        const clipboardBeforeDuplicate = this.store._cloneClipboardData();
        this.store.setPlayheadTime(1);
        const duplicated = this.store.duplicateSelectedClipGroup(clip.id);

        const state = this.store.getState();
        expect(duplicated).toHaveLength(2);
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.video[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineStart).toBe(12);
        expect(this.store.hasCopiedClips()).toBe(true);
        expect(this.store.clipboard).toEqual(clipboardBeforeDuplicate);
    });

    it('deletes multiple selected clips in one operation', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');
        const third = this.store.addAssetToTimeline('asset-video');

        this.store.setSelectedClips([first.id, third.id], third.id);
        this.store.deleteSelectedClips();

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.video[0].id).toBe(second.id);
        expect(state.selectedClipIds).toEqual([]);
        expect(state.selectedClipId).toBeNull();
    });

    it('moves multiple selected clips together while preserving their spacing', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');
        const audio = this.store.addAssetToTimeline('asset-audio');

        this.store.reorderClip(second.id, 18);
        this.store.reorderClip(audio.id, 4);
        this.store.setSelectedClips([first.id, audio.id], first.id);

        this.store.moveSelectedClips(first.id, 6);

        const state = this.store.getState();
        const movedVideo = state.timeline.video.find((clip) => clip.id === first.id);
        const movedAudio = state.timeline.audio.find((clip) => clip.id === audio.id);
        const linkedSelection = this.store.getDraggedClipIds(first.id, [first.id, audio.id]);
        expect(movedVideo.timelineStart).toBe(6);
        expect(movedAudio.timelineStart).toBe(18);
        expect(state.selectedClipIds).toEqual(linkedSelection);
        expect(state.selectedClipId).toBe(first.id);
    });

    it('moves a clip onto another same-type track instead of forcing it to the source-track tail', () => {
        const targetTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        this.store.selectTrack('v1');
        const first = this.store.addAssetToTimeline('asset-video');
        this.store.detachLinkedClipGroup(first.id);
        const second = this.store.addAssetToTimeline('asset-video');

        this.store.moveClipGroup(first.id, [first.id], 8, { targetTrackId });

        const firstMatch = this.store.findClipById(first.id);
        const state = this.store.getState();
        expect(firstMatch.trackName).toBe(targetTrackId);
        expect(firstMatch.clip.timelineStart).toBe(8);
        expect(state.timeline.v1.find((clip) => clip.id === second.id)?.timelineStart).toBe(12);
        expect(state.selectedTrackName).toBe(targetTrackId);
    });

    it('moves linked audio onto the matching audio track when a video group is dragged to another video track', () => {
        const videoTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        const audioTrackId = this.store.createTrackAdjacent('a1', 'below', 'A2');
        this.store.selectTrack('v1');
        const first = this.store.addAssetToTimeline('asset-video');

        this.store.moveClipGroup(first.id, [first.id], 8, { targetTrackId: videoTrackId });

        const videoMatch = this.store.findClipById(first.id);
        const audioMatch = this.store.getTrack(audioTrackId)[0] || null;
        expect(videoMatch.trackName).toBe(videoTrackId);
        expect(audioMatch?.linkGroupId).toBe(videoMatch.clip.linkGroupId);
        expect(audioMatch?.timelineStart).toBe(8);
        expect(this.store.getTrack('a1')).toHaveLength(0);
    });

    it('re-aligns linked audio to the dragged video start when stored positions have drifted', () => {
        const videoTrackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        const audioTrackId = this.store.createTrackAdjacent('a1', 'below', 'A2');
        this.store.selectTrack('v1');
        const first = this.store.addAssetToTimeline('asset-video');
        const audioClip = this.store.getTrack('a1')[0];

        audioClip.timelineStart = 4;
        audioClip.timelineEnd = 16;

        this.store.moveClipGroup(first.id, [first.id], 8, { targetTrackId: videoTrackId });

        const videoMatch = this.store.findClipById(first.id);
        const audioMatch = this.store.getTrack(audioTrackId)[0] || null;
        expect(videoMatch.trackName).toBe(videoTrackId);
        expect(videoMatch.clip.timelineStart).toBe(8);
        expect(audioMatch?.timelineStart).toBe(8);
        expect(this.store.getTrack('a1')).toHaveLength(0);
    });

    it('creates matching audio tracks up to the later video track when inserting without companions', () => {
        this.store.createTrackAdjacent('v1', 'below', 'V2');
        const targetTrackId = this.store.createTrackAdjacent('v2', 'below', 'V3');

        const inserted = this.store.insertAssetAtTime('asset-video', 0, targetTrackId);
        const state = this.store.getState();
        const createdAudioTrackId = 'a3';

        expect(inserted).not.toBeNull();
        expect(this.store.getTrackIdsByType('audio')).toEqual(['a1', 'a2', 'a3']);
        expect(this.store.getTrack(createdAudioTrackId)).toHaveLength(1);
        expect(this.store.getTrack(createdAudioTrackId)[0].linkGroupId).toBe(inserted.linkGroupId);
        expect(state.trackOrder.slice(-3)).toEqual(['a1', 'a2', createdAudioTrackId]);
    });

    it('creates matching audio tracks up to the later video track when moving a linked video group', () => {
        this.store.createTrackAdjacent('v1', 'below', 'V2');
        const targetTrackId = this.store.createTrackAdjacent('v2', 'below', 'V3');
        this.store.selectTrack('v1');
        const first = this.store.addAssetToTimeline('asset-video');

        this.store.moveClipGroup(first.id, [first.id], 8, { targetTrackId });

        const state = this.store.getState();
        const createdAudioTrackId = 'a3';
        expect(this.store.getTrackIdsByType('audio')).toEqual(['a1', 'a2', 'a3']);
        expect(this.store.getTrack(createdAudioTrackId)).toHaveLength(1);
        expect(this.store.getTrack(createdAudioTrackId)[0].timelineStart).toBe(8);
        expect(state.trackOrder.slice(-3)).toEqual(['a1', 'a2', createdAudioTrackId]);
    });

    it('creates the matching numbered audio companion when adding video to an upward-grown video track', () => {
        this.store.createTrack('video');
        const targetTrackId = this.store.createTrack('video');
        this.store.selectTrack(targetTrackId);

        const inserted = this.store.addAssetToTimeline('asset-video');

        expect(inserted).not.toBeNull();
        expect(this.store.getTrackIdsByType('audio')).toEqual(['a1', 'a2', 'a3']);
        expect(this.store.getTrack('a3')).toHaveLength(1);
        expect(this.store.getTrack('a3')[0].linkGroupId).toBe(inserted.linkGroupId);
        expect(this.store.getTrack('a1')).toHaveLength(0);
        expect(this.store.getState().selectedTrackName).toBe(targetTrackId);
    });

    it('moves linked audio onto the matching numbered audio track for upward-grown video tracks', () => {
        this.store.createTrack('video');
        const targetTrackId = this.store.createTrack('video');
        this.store.selectTrack('v1');
        const first = this.store.addAssetToTimeline('asset-video');

        this.store.moveClipGroup(first.id, [first.id], 8, { targetTrackId });

        const videoMatch = this.store.findClipById(first.id);
        const audioMatch = this.store.getTrack('a3')[0] || null;
        expect(videoMatch.trackName).toBe(targetTrackId);
        expect(this.store.getTrackIdsByType('audio')).toEqual(['a1', 'a2', 'a3']);
        expect(audioMatch?.linkGroupId).toBe(videoMatch.clip.linkGroupId);
        expect(audioMatch?.timelineStart).toBe(8);
        expect(this.store.getTrack('a1')).toHaveLength(0);
    });

    it('reorders tracks within their visual section without mixing them into the audio section', () => {
        const trackId = this.store.createTrackAdjacent('v1', 'below', 'V2');
        const topTrackId = this.store.createTrackAdjacent('v1', 'above', 'V3');

        const moved = this.store.moveTrack(trackId, topTrackId, 'above');

        expect(moved).toBe(true);
        // Default project is video + audio only (image tracks are on-demand).
        expect(this.store.getState().trackOrder).toEqual([trackId, topTrackId, 'v1', 'a1']);
        expect(this.store.getState().selectedTrackName).toBe(trackId);
    });

    it('inserts linked audio onto the matching audio track when adding video to a secondary video track', () => {
        this.store.createTrackAdjacent('v1', 'below', 'V2');
        const audioTrackId = this.store.createTrackAdjacent('a1', 'below', 'A2');

        const inserted = this.store.insertAssetAtTime('asset-video', 0, 'v2');

        expect(inserted).not.toBeNull();
        expect(this.store.getTrack(audioTrackId)).toHaveLength(1);
        expect(this.store.getTrack('a1')).toHaveLength(0);
        expect(this.store.getTrack(audioTrackId)[0].linkGroupId).toBe(inserted.linkGroupId);
    });

    it('blocks inserting assets into a locked track', () => {
        this.store.toggleTrackLocked('video');

        const clip = this.store.addAssetToTimeline('asset-video');

        expect(clip).toBeNull();
        expect(this.store.getState().timeline.video).toHaveLength(0);
    });

    it('blocks editing operations on a locked track', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackLocked('video');

        this.store.trimClipEdge(first.id, 'end', 6);
        this.store.reorderClip(second.id, 0);
        this.store.deleteClip(first.id);

        const state = this.store.getState();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.video[0].id).toBe(first.id);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.video[1].id).toBe(second.id);
        expect(state.timeline.video[1].timelineStart).toBe(12);
    });

    it('inserts a new asset at a requested timeline position when there is available space', () => {
        this.store.addAssetToTimeline('asset-video');

        const inserted = this.store.insertAssetAtTime('asset-audio', 3);
        const state = this.store.getState();

        expect(inserted).toBeTruthy();
        expect(state.timeline.audio).toHaveLength(2);
        expect(state.timeline.audio[0].assetId).toBe('asset-video');
        expect(state.timeline.audio[1].assetId).toBe('asset-audio');
        expect(state.timeline.audio[1].timelineStart).toBe(12);
        expect(state.timeline.audio[1].timelineEnd).toBe(20);
    });

    it('places inserted clips after a too-short gap instead of overlapping the next clip', () => {
        const first = this.store.addAssetToTimeline('asset-audio');
        const second = this.store.addAssetToTimeline('asset-audio');
        this.store.reorderClip(second.id, 12);

        const inserted = this.store.insertAssetAtTime('asset-audio', 9);
        const state = this.store.getState();
        const audioStarts = state.timeline.audio.map((clip) => clip.timelineStart);
        const audioEnds = state.timeline.audio.map((clip) => clip.timelineEnd);

        expect(first.timelineStart).toBe(0);
        expect(inserted.timelineStart).toBe(20);
        expect(audioStarts).toEqual([0, 12, 20]);
        expect(audioEnds).toEqual([8, 20, 28]);
    });

    it('moves a clip to the requested time instead of collapsing the whole track', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');

        this.store.reorderClip(second.id, 20);
        const state = this.store.getState();

        expect(state.timeline.video[0].id).toBe(first.id);
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[1].id).toBe(second.id);
        expect(state.timeline.video[1].timelineStart).toBe(20);
    });

    it('updates the playhead and resolves the active clip at a timeline time', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        this.store.setPlayheadTime(4.25);

        expect(this.store.getState().playheadTime).toBe(4.25);
        expect(this.store.getActiveClipAtTime(4.25)?.id).toBe(clip.id);
    });

    it('splits a selected clip at the requested playhead time', () => {
        const clip = this.store.addAssetToTimeline('asset-video');

        const splitClip = this.store.splitClipAtTime(clip.id, 4);
        const state = this.store.getState();

        expect(splitClip).toBeTruthy();
        expect(state.timeline.video).toHaveLength(2);
        expect(state.timeline.video[0].timelineEnd).toBe(4);
        expect(state.timeline.video[1].timelineStart).toBe(4);
    });

    it('merges two adjacent compatible clips on the same track', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.detachLinkedClipGroup(clip.id);
        this.store.splitClipAtTime(clip.id, 4);
        const [firstClip, secondClip] = this.store.getState().timeline.video;

        this.store.setSelectedClips([firstClip.id, secondClip.id], secondClip.id);
        const mergedClip = this.store.mergeSelectedClips();

        const state = this.store.getState();
        expect(mergedClip).toBeTruthy();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.video[0].sourceStart).toBe(0);
        expect(state.timeline.video[0].sourceEnd).toBe(12);
        expect(state.selectedClipIds).toEqual([state.timeline.video[0].id]);
    });

    it('merges a split linked audio-video group back together', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.splitClipAtTime(clip.id, 4);

        expect(this.store.canMergeSelectedClips()).toBe(true);
        const mergedClip = this.store.mergeSelectedClips();

        const state = this.store.getState();
        expect(mergedClip).toBeTruthy();
        expect(state.timeline.video).toHaveLength(1);
        expect(state.timeline.audio).toHaveLength(1);
        expect(state.timeline.video[0].timelineStart).toBe(0);
        expect(state.timeline.video[0].timelineEnd).toBe(12);
        expect(state.timeline.audio[0].timelineStart).toBe(0);
        expect(state.timeline.audio[0].timelineEnd).toBe(12);
        expect(state.timeline.video[0].linkGroupId).toBe(state.timeline.audio[0].linkGroupId);
        expect(state.selectedClipId).toBe(state.timeline.video[0].id);
        expect(state.selectedClipIds).toEqual([state.timeline.video[0].id, state.timeline.audio[0].id]);
    });

    it('finds an adjacent merge pair for a clicked split linked clip', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.splitClipAtTime(clip.id, 4);
        const secondVideoClip = this.store.getState().timeline.video[1];

        const adjacentPair = this.store.getAdjacentMergeableClipIds(secondVideoClip.id);

        expect(adjacentPair).toEqual([
            this.store.getState().timeline.video[0].id,
            secondVideoClip.id
        ]);
    });

    it('undoes and redoes a linked group merge without losing mergeability', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.splitClipAtTime(clip.id, 4);
        const splitState = this.store.getState();
        const [firstVideoClip, secondVideoClip] = splitState.timeline.video;
        this.store.setSelectedClips([firstVideoClip.id, secondVideoClip.id], secondVideoClip.id);

        this.store.mergeSelectedClips();
        expect(this.store.getState().timeline.video).toHaveLength(1);
        expect(this.store.getState().timeline.audio).toHaveLength(1);

        this.store.undo();
        const undoneState = this.store.getState();
        expect(undoneState.timeline.video).toHaveLength(2);
        expect(undoneState.timeline.audio).toHaveLength(2);
        expect(this.store.canMergeSelectedClips(undoneState.selectedClipIds)).toBe(true);

        this.store.redo();
        const redoneState = this.store.getState();
        expect(redoneState.timeline.video).toHaveLength(1);
        expect(redoneState.timeline.audio).toHaveLength(1);
        expect(redoneState.timeline.video[0].linkGroupId).toBe(redoneState.timeline.audio[0].linkGroupId);
    });

    it('does not merge clips that are not directly adjacent on the same track', () => {
        const first = this.store.addAssetToTimeline('asset-audio');
        const second = this.store.addAssetToTimeline('asset-audio');

        this.store.reorderClip(second.id, 8);
        this.store.setSelectedClips([first.id, second.id], second.id);

        const mergedClip = this.store.mergeSelectedClips();

        expect(mergedClip).toBeNull();
        expect(this.store.getState().timeline.audio).toHaveLength(2);
    });

    it('stores timeline zoom within supported bounds', () => {
        this.store.setTimelineZoom(260);
        expect(this.store.getState().timelineZoom).toBe(260);

        this.store.setTimelineZoom(999);
        expect(this.store.getState().timelineZoom).toBe(400);

        this.store.setTimelineZoom(10);
        expect(this.store.getState().timelineZoom).toBe(25);
    });

    it('finds the next clip after a given timeline time', () => {
        const first = this.store.addAssetToTimeline('asset-video');
        const second = this.store.addAssetToTimeline('asset-video');

        this.store.reorderClip(second.id, 18);

        expect(this.store.getNextClipAfterTime(5)?.id).toBe(second.id);
        expect(this.store.getNextClipAfterTime(18)?.id).toBe(second.id);
        expect(this.store.getNextClipAfterTime(40)).toBeNull();
        expect(first.id).toBeTruthy();
    });

    it('ignores hidden tracks when resolving active and next clips', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClip = this.store.getTrack('audio')[0];
        this.store.toggleTrackHidden('video');

        expect(this.store.getActiveClipAtTime(1)?.id).toBe(linkedAudioClip.id);
        expect(this.store.getNextClipAfterTime(0)?.id).toBe(linkedAudioClip.id);

        this.store.toggleTrackHidden('audio');

        expect(this.store.getActiveClipAtTime(1)).toBeNull();
        expect(this.store.getNextClipAfterTime(0)).toBeNull();
        expect(videoClip.id).toBeTruthy();
    });
});
