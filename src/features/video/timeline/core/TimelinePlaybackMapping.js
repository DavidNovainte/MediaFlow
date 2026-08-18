/**
 * TimelinePlaybackMapping
 *
 * Keeps timeline-to-source mapping and preview audio mute logic together.
 */
class TimelinePlaybackMapping {
    static resolveMediaSrc(fileLike) {
        if (!fileLike) return '';
        if (typeof fileLike === 'string') {
            return window.urlUtils ? window.urlUtils.getMediaSrc(fileLike) : fileLike;
        }
        if (fileLike.path) {
            return window.urlUtils ? window.urlUtils.getMediaSrc(fileLike) : fileLike.path;
        }
        if (fileLike instanceof File || fileLike instanceof Blob) {
            return fileLike.__cachedUrl || (fileLike.__cachedUrl = URL.createObjectURL(fileLike));
        }
        return '';
    }

    static syncAudioLevels(manager, timelineTime, playbackSnapshot = null) {
        const player = manager?.app?.previewHandler?.elements?.video;
        if (!player) return;

        const snapshot = playbackSnapshot || (window.TimelinePlaybackState
            ? window.TimelinePlaybackState.resolve({
                manager,
                timelineNow: timelineTime,
                resolveMediaSrc: (fileLike) => this.resolveMediaSrc(fileLike)
            })
            : null);
        const activeVideoSeg = snapshot?.video?.activeSeg || null;

        if (!activeVideoSeg) {
            player.muted = true;
            player.volume = 0;
            return;
        }

        let hasMatchingAudioTrack = false;
        let hasLinkedAudioTrack = false;
        if (activeVideoSeg.groupId) {
            const activeAudioSegments = Array.isArray(snapshot?.audio) ? snapshot.audio : [];

            for (const { trackId, activeSeg, shouldPlay, trackMuted } of activeAudioSegments) {
                if (!activeSeg || activeSeg.groupId !== activeVideoSeg.groupId) continue;
                hasLinkedAudioTrack = true;
                if (trackMuted) continue;
                const trackPlayer = manager.app.audioMixer?.audioTrackPlayers?.[trackId];
                const audioEl = trackPlayer?.audioEl;
                const isAudible = shouldPlay && !!audioEl && !audioEl.paused && audioEl.readyState >= 2;

                if (isAudible) {
                    hasMatchingAudioTrack = true;
                    break;
                }
            }
        }

        player.muted = hasMatchingAudioTrack || hasLinkedAudioTrack;
        if (!hasMatchingAudioTrack && !hasLinkedAudioTrack) {
            const targetVolume = activeVideoSeg.volume !== undefined ? activeVideoSeg.volume : 1.0;
            if (player.volume !== targetVolume) {
                player.volume = targetVolume;
            }
        } else if (!hasMatchingAudioTrack && hasLinkedAudioTrack) {
            player.volume = 0;
        }
    }

    static getMappedSourceTime(manager, timelineTime) {
        const trackIds = manager.getPlaybackTrackIds
            ? manager.getPlaybackTrackIds()
            : Object.keys(manager.tracks).sort((a, b) => {
                const isVA = a.startsWith('v');
                const isVB = b.startsWith('v');
                if (isVA && !isVB) return -1;
                if (!isVA && isVB) return 1;

                const na = parseInt(a.replace(/[va]/, ''), 10) || 0;
                const nb = parseInt(b.replace(/[va]/, ''), 10) || 0;
                return nb - na;
            });

        for (const trackId of trackIds) {
            const track = manager.tracks[trackId];
            if (!track?.segments) continue;

            const seg = track.segments.find((s) => timelineTime >= s.start && timelineTime < s.end);
            if (seg) {
                return (seg.sourceStart || 0) + (timelineTime - seg.start);
            }
        }

        return timelineTime;
    }

    static getMappedTimelineTime(manager, sourceTime) {
        const trackIds = manager.getPlaybackTrackIds
            ? manager.getPlaybackTrackIds()
            : Object.keys(manager.tracks);

        for (const trackId of trackIds) {
            const track = manager.tracks[trackId];
            if (!track?.segments) continue;

            const epsilon = 0.05;
            const seg = track.segments.find((s) => {
                const ss = s.sourceStart || 0;
                const se = ss + (s.end - s.start);
                return sourceTime >= ss - epsilon && sourceTime <= se + epsilon;
            });

            if (seg) {
                const mapped = (sourceTime - (seg.sourceStart || 0)) + seg.start;
                return Math.max(seg.start, Math.min(seg.end, mapped));
            }
        }

        return null;
    }
}

window.TimelinePlaybackMapping = TimelinePlaybackMapping;
