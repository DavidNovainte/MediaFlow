/**
 * TimelineAudioMixer
 *
 * Manages one hidden AudioTrackPlayer per independent audio track and keeps
 * them synchronized with timeline playback.
 */
class TimelineAudioMixer {
    constructor(creatorFlow) {
        this.app = creatorFlow;
        this.audioTrackPlayers = {};
        this.audioContext = null;
        this.masterGainNode = null;
    }

    init(sharedContext = null, sharedMasterGain = null) {
        try {
            this.audioContext = sharedContext || new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = sharedMasterGain || this.audioContext.createGain();

            if (!sharedMasterGain) {
                this.masterGainNode.connect(this.audioContext.destination);
            }
        } catch (error) {
            console.warn('[TimelineAudioMixer] Web Audio API unavailable, falling back to native audio element', error);
        }
    }

    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    resolveAudioSrc(fileLike) {
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

    getPlaybackSnapshot(timelineNow) {
        const manager = this.app.timelineManager;
        if (!manager || !window.TimelinePlaybackState) {
            return { timelineNow, video: null, audio: [] };
        }

        return window.TimelinePlaybackState.resolve({
            manager,
            timelineNow,
            resolveMediaSrc: (fileLike) => this.resolveAudioSrc(fileLike)
        });
    }

    registerTrack(trackId, audioSrc, options = {}) {
        const normalizedSrc = window.urlUtils ? window.urlUtils.getMediaSrc(audioSrc) : audioSrc;

        if (this.audioTrackPlayers[trackId]) {
            this.audioTrackPlayers[trackId].updateSrc(normalizedSrc, options);
            return;
        }

        const trackPlayer = new window.AudioTrackPlayer(trackId, normalizedSrc, this.audioContext, this.masterGainNode);
        this.audioTrackPlayers[trackId] = trackPlayer;
    }

    unregisterTrack(trackId) {
        const trackPlayer = this.audioTrackPlayers[trackId];
        if (trackPlayer) {
            trackPlayer.destroy();
            delete this.audioTrackPlayers[trackId];
        }
    }

    isSnapshotReady(snapshot) {
        const activeAudioStates = Array.isArray(snapshot?.audio) ? snapshot.audio : [];
        for (const state of activeAudioStates) {
            if (!state.shouldPlay) continue;
            const trackPlayer = this.audioTrackPlayers[state.trackId];
            if (!trackPlayer || !trackPlayer.isReadyForPlayback()) {
                return false;
            }
        }
        return true;
    }

    sync(timelineNow, isGlobalPlaying, playbackSnapshot = null) {
        const manager = this.app.timelineManager;
        if (!manager) return { ready: true };

        if (this.audioContext && this.audioContext.state === 'closed') {
            console.error('[TimelineAudioMixer] Fatal error: AudioContext closed, mixer silenced.');
            return { ready: false };
        }

        const snapshot = playbackSnapshot || this.getPlaybackSnapshot(timelineNow);
        const activeAudioStates = Array.isArray(snapshot?.audio) ? snapshot.audio : [];

        activeAudioStates.forEach(({ trackId, activeSeg, src, speed, expectedSourceTime, volume, shouldPlay }) => {
            const trackData = manager.tracks?.[trackId];
            if (!trackData?.segments) return;

            const preloadSeg = trackData.segments.find((seg) => seg.file || manager.videoFile);
            if (preloadSeg) {
                const preloadSrc = this.resolveAudioSrc(preloadSeg.file || manager.videoFile);
                if (preloadSrc) {
                    this.registerTrack(trackId, preloadSrc);
                }
            }

            if (activeSeg && isGlobalPlaying && shouldPlay) {
                if (!src) {
                    console.warn(`[TimelineAudioMixer:${trackId}] no playable audio source for active segment.`);
                    return;
                }

                this.registerTrack(trackId, src, {
                    shouldResume: isGlobalPlaying,
                    expectedSourceTime
                });

                const trackPlayer = this.audioTrackPlayers[trackId];
                if (trackPlayer) {
                    trackPlayer.setSpeed(speed);
                    trackPlayer.setVolume(volume);
                    trackPlayer.syncToSourceTime(expectedSourceTime);
                }
            } else {
                this.audioTrackPlayers[trackId]?.pause();
            }
        });

        return {
            ready: this.isSnapshotReady(snapshot)
        };
    }

    pauseAll() {
        Object.values(this.audioTrackPlayers).forEach((player) => player.pause());
    }

    stopAll() {
        Object.values(this.audioTrackPlayers).forEach((player) => player.stop());
    }

    setTrackVolume(trackId, volumePercent) {
        const trackPlayer = this.audioTrackPlayers[trackId];
        if (trackPlayer) {
            trackPlayer.setVolume(volumePercent / 100);
        }
    }

    destroy() {
        this.stopAll();
        Object.keys(this.audioTrackPlayers).forEach((id) => this.unregisterTrack(id));
        this.audioContext = null;
        this.masterGainNode = null;
    }
}

window.TimelineAudioMixer = TimelineAudioMixer;
