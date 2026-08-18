/**
 * TimelinePlaybackState
 *
 * Builds a single playback snapshot for the current timeline time so preview,
 * mixer and mute logic stop recalculating active media separately.
 */
class TimelinePlaybackState {
    static getSegmentMediaFile(seg, fallbackFile = null) {
        return seg?.file || fallbackFile || null;
    }

    static getVideoState(manager, timelineNow, resolveMediaSrc) {
        const selection = window.TimelineSelectionResolver
            ? window.TimelineSelectionResolver.getActiveVideoSegment(manager?.tracks, timelineNow, manager?.trackOrder)
            : { activeSeg: null, activeTrackId: null };

        const activeSeg = selection.activeSeg;
        if (!activeSeg) {
            return {
                activeSeg: null,
                activeTrackId: null,
                file: null,
                src: '',
                speed: 1.0,
                expectedSourceTime: timelineNow,
                visible: false
            };
        }

        const file = this.getSegmentMediaFile(activeSeg, manager?.videoFile);
        const src = resolveMediaSrc ? resolveMediaSrc(file) : '';
        const speed = activeSeg.speed || 1.0;
        const expectedSourceTime = (activeSeg.sourceStart || 0) + (timelineNow - activeSeg.start) * speed;

        return {
            activeSeg,
            activeTrackId: selection.activeTrackId,
            file,
            src,
            speed,
            expectedSourceTime,
            visible: !!src
        };
    }

    static getAudioStates(manager, timelineNow, resolveMediaSrc) {
        const selections = window.TimelineSelectionResolver
            ? window.TimelineSelectionResolver.getActiveAudioSegments(manager?.tracks, timelineNow, manager?.trackOrder)
            : [];

        return selections.map(({ trackId, activeSeg }) => {
            const track = manager?.tracks?.[trackId] || null;
            const file = this.getSegmentMediaFile(activeSeg, manager?.videoFile);
            const src = activeSeg && resolveMediaSrc ? resolveMediaSrc(file) : '';
            const speed = activeSeg?.speed || 1.0;
            const expectedSourceTime = activeSeg
                ? (activeSeg.sourceStart || 0) + (timelineNow - activeSeg.start) * speed
                : timelineNow;

            return {
                trackId,
                activeSeg,
                file,
                src,
                speed,
                expectedSourceTime,
                trackMuted: !!track?.muted,
                trackEnabled: track?.enabled !== false,
                volume: activeSeg?.volume !== undefined ? activeSeg.volume : 1.0,
                shouldPlay: !!(activeSeg && src && track?.enabled !== false && !track?.muted)
            };
        });
    }

    static resolve({ manager, timelineNow, resolveMediaSrc }) {
        return {
            timelineNow,
            video: this.getVideoState(manager, timelineNow, resolveMediaSrc),
            audio: this.getAudioStates(manager, timelineNow, resolveMediaSrc)
        };
    }
}

window.TimelinePlaybackState = TimelinePlaybackState;
