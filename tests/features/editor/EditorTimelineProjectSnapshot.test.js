/** @jest-environment jsdom */

describe('EditorTimelineProjectSnapshot', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/export/EditorTimelineProjectSnapshot');
    });

    beforeEach(() => {
        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-video', name: 'clip.mp4', kind: 'video', duration: 12, path: 'C:/media/clip.mp4' },
            { id: 'asset-audio', name: 'voice.mp3', kind: 'audio', duration: 6, path: 'C:/media/voice.mp3' }
        ]);
    });

    it('builds export tracks for video and audio timeline content', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.addAssetToTimeline('asset-audio');

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.isAudioOnly).toBe(false);
        expect(snapshot.tracks).toHaveLength(2);
        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[1].trackId).toBe('a1');
        expect(snapshot.tracks[0].clips[0].assetPath).toBe('C:/media/clip.mp4');
        expect(snapshot.tracks[1].clips[0].assetPath).toBe('C:/media/voice.mp3');
    });

    it('maps muted track audio into zero-volume export clips without dropping the video', () => {
        const clip = this.store.addAssetToTimeline('asset-video');
        this.store.selectClip(clip.id);
        this.store.toggleTrackMuted(this.store.getTrackNameForKind('video'));

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.tracks).toHaveLength(1);
        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[0].muted).toBe(false);
        expect(snapshot.tracks[0].clips[0].volume).toBe(0);
    });

    it('marks hidden tracks as disabled in the export snapshot', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackHidden(this.store.getTrackNameForKind('video'));

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[0].enabled).toBe(false);
    });

    it('marks non-solo tracks as disabled when solo mode is active', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.addAssetToTimeline('asset-audio');
        this.store.toggleTrackSolo(this.store.getTrackNameForKind('audio'));

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const videoTrack = snapshot.tracks.find((track) => track.trackId === 'v1');
        const audioTrack = snapshot.tracks.find((track) => track.trackId === 'a1');

        expect(videoTrack.enabled).toBe(false);
        expect(audioTrack.enabled).toBe(true);
    });

    it('exports clips from additional tracks with their dynamic ids', () => {
        const secondAudioTrackId = this.store.createTrack('audio');
        this.store.selectTrack(secondAudioTrackId);
        this.store.addAssetToTimeline('asset-audio');

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const audioTrack = snapshot.tracks.find((track) => track.trackId === secondAudioTrackId);

        expect(audioTrack).toBeTruthy();
        expect(audioTrack.trackType).toBe('audio');
        expect(audioTrack.clips[0].assetPath).toBe('C:/media/voice.mp3');
    });

    it('exports image tracks as video clips for MP4 export', () => {
        this.store.upsertAssets([
            { id: 'asset-image', name: 'cover.png', kind: 'image', duration: 5, path: 'C:/media/cover.png' }
        ]);
        this.store.addAssetToTimeline('asset-image');

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const imageTrack = snapshot.tracks.find((track) => track.trackId === 'g1');

        expect(snapshot.isAudioOnly).toBe(false);
        expect(imageTrack).toBeTruthy();
        expect(imageTrack.trackType).toBe('video');
        expect(imageTrack.sourceTrackType).toBe('image');
        expect(imageTrack.clips[0].assetPath).toBe('C:/media/cover.png');
        expect(imageTrack.clips[0].assetKind).toBe('image');
    });

    it('mutes exported video source audio when the linked timeline audio clip is deleted', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClip = this.store.getLinkedClipIds(videoClip.id)
            .map((clipId) => this.store.findClipById(clipId))
            .filter(Boolean)
            .find((match) => match.clip.kind === 'audio')?.clip;

        this.store.deleteClip(linkedAudioClip.id);

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.tracks).toHaveLength(1);
        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[0].clips[0].volume).toBe(0);
    });

    it('uses linked timeline audio controls for exported video source audio', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        const linkedAudioClip = this.store.getLinkedClipIds(videoClip.id)
            .map((clipId) => this.store.findClipById(clipId))
            .filter(Boolean)
            .find((match) => match.clip.kind === 'audio')?.clip;

        this.store.updateClip(linkedAudioClip.id, { volume: 35 });

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[0].clips[0].volume).toBeCloseTo(0.35, 3);
    });

    it('uses video inspector audio changes for exported linked source audio', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');

        this.store.updateClip(videoClip.id, { volume: 42 });
        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);

        expect(snapshot.tracks[0].trackId).toBe('v1');
        expect(snapshot.tracks[0].clips[0].volume).toBeCloseTo(0.42, 3);
    });

    it('exports sped-up linked video with shortened timeline span and full source span', () => {
        const videoClip = this.store.addAssetToTimeline('asset-video');
        this.store.updateClip(videoClip.id, { speed: 2 });

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const exportedClip = snapshot.tracks.find((track) => track.trackId === 'v1')?.clips?.[0];

        expect(exportedClip.timelineStart).toBe(0);
        expect(exportedClip.timelineEnd).toBe(6);
        expect(exportedClip.timelineDuration).toBe(6);
        expect(exportedClip.sourceStart).toBe(0);
        expect(exportedClip.sourceEnd).toBe(12);
        expect(exportedClip.speed).toBe(2);
        expect(snapshot.timelineDuration).toBe(6);
    });

    it('keeps linked audio as its own export track when the linked video track is solo-excluded', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackSolo('a1');

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const videoTrack = snapshot.tracks.find((track) => track.trackId === 'v1');
        const audioTrack = snapshot.tracks.find((track) => track.trackId === 'a1');

        expect(videoTrack.enabled).toBe(false);
        expect(audioTrack).toBeTruthy();
        expect(audioTrack.enabled).toBe(true);
        expect(snapshot.isAudioOnly).toBe(true);
        expect(audioTrack.clips).toHaveLength(1);
        expect(audioTrack.clips[0].assetPath).toBe('C:/media/clip.mp4');
    });

    it('keeps linked audio as its own export track when the linked video track is hidden', () => {
        this.store.addAssetToTimeline('asset-video');
        this.store.toggleTrackHidden('v1');

        const snapshot = window.EditorTimelineProjectSnapshot.create(this.store);
        const videoTrack = snapshot.tracks.find((track) => track.trackId === 'v1');
        const audioTrack = snapshot.tracks.find((track) => track.trackId === 'a1');

        expect(videoTrack.enabled).toBe(false);
        expect(audioTrack).toBeTruthy();
        expect(audioTrack.enabled).toBe(true);
        expect(snapshot.isAudioOnly).toBe(true);
        expect(audioTrack.clips).toHaveLength(1);
        expect(audioTrack.clips[0].assetPath).toBe('C:/media/clip.mp4');
    });
});
