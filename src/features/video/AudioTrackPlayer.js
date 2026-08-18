/**
 * AudioTrackPlayer
 *
 * Manages one independent timeline audio track using a hidden <audio> element.
 * It keeps playback in sync with timeline time and survives source switches
 * without requiring another user interaction.
 */
class AudioTrackPlayer {
    constructor(trackId, audioSrc, audioContext, masterGainNode) {
        this.trackId = trackId;
        this.audioEl = this._createAudioElement(audioSrc);

        this._pendingAudioContext = audioContext;
        this._pendingMasterGainNode = masterGainNode;

        this.gainNode = null;
        this.audioSourceNode = null;

        this.isPlaying = false;
        this._resumeOnCanPlay = null;
        this._pendingExpectedTime = null;
        this._shouldResumeAfterLoad = false;
        this._currentSrc = audioSrc || '';
    }

    _createAudioElement(audioSrc) {
        const audioEl = document.createElement('audio');
        audioEl.crossOrigin = 'anonymous';
        audioEl.preload = 'auto';
        audioEl.autoplay = false;
        audioEl.loop = false;
        audioEl.style.display = 'none';
        audioEl.src = audioSrc || '';

        audioEl.onerror = () => {
            const error = audioEl.error;
            let message = 'Unknown error';
            if (error) {
                switch (error.code) {
                case 1:
                    message = 'Aborted';
                    break;
                case 2:
                    message = 'Network error';
                    break;
                case 3:
                    message = 'Decoding failed';
                    break;
                case 4:
                    message = 'Source not supported';
                    break;
                default:
                    break;
                }
            }
            console.error(`[AudioTrackPlayer:${this.trackId}] media load failed:`, message, audioEl.src);
        };

        document.body.appendChild(audioEl);
        return audioEl;
    }

    _connectToAudioGraph(audioContext, masterGainNode) {
        if (this.audioSourceNode || !audioContext || !masterGainNode) return;

        try {
            this.audioSourceNode = audioContext.createMediaElementSource(this.audioEl);
            this.gainNode = audioContext.createGain();
            this.gainNode.channelCount = 2;
            this.gainNode.channelCountMode = 'explicit';
            this.gainNode.channelInterpretation = 'speakers';
            this.audioSourceNode.connect(this.gainNode);
            this.gainNode.connect(masterGainNode);
        } catch (error) {
            console.error(`[AudioTrackPlayer:${this.trackId}] audio graph connect failed:`, error);
        }
    }

    _queueResumeWhenReady(expectedSourceTime = null) {
        if (expectedSourceTime !== null && expectedSourceTime !== undefined) {
            this._pendingExpectedTime = expectedSourceTime;
        }
        this._shouldResumeAfterLoad = true;

        if (this._resumeOnCanPlay) return;

        this._resumeOnCanPlay = () => {
            this.audioEl.removeEventListener('canplay', this._resumeOnCanPlay);
            this.audioEl.removeEventListener('loadeddata', this._resumeOnCanPlay);
            this._resumeOnCanPlay = null;

            if (this._pendingExpectedTime !== null && this._pendingExpectedTime !== undefined) {
                try {
                    if (Math.abs((this.audioEl.currentTime || 0) - this._pendingExpectedTime) > 0.05) {
                        this.audioEl.currentTime = this._pendingExpectedTime;
                    }
                } catch (error) {
                    void error;
                }
            }

            const ctx = this._pendingAudioContext;
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            if (!this._shouldResumeAfterLoad) {
                return;
            }

            this._shouldResumeAfterLoad = false;
            this.audioEl.play().catch((error) => {
                if (error?.name !== 'AbortError') {
                    console.warn(`[AudioTrackPlayer:${this.trackId}] delayed resume failed:`, error.message);
                }
            });
            this.isPlaying = true;
        };

        this.audioEl.addEventListener('canplay', this._resumeOnCanPlay, { once: true });
        this.audioEl.addEventListener('loadeddata', this._resumeOnCanPlay, { once: true });
    }

    syncToSourceTime(expectedSourceTime) {
        if (!this.audioEl.src) return;
        this._pendingExpectedTime = expectedSourceTime;

        if (!this.audioSourceNode && this._pendingAudioContext) {
            this._connectToAudioGraph(this._pendingAudioContext, this._pendingMasterGainNode);
        }

        const seekThreshold = this.audioEl.paused ? 0.08 : 0.35;
        const currentDeviation = Math.abs((this.audioEl.currentTime || 0) - expectedSourceTime);
        if (this.audioEl.readyState >= 1 && currentDeviation > seekThreshold && !this.audioEl.seeking) {
            this.audioEl.currentTime = expectedSourceTime;
        }

        if (this.audioEl.paused) {
            const ctx = this._pendingAudioContext;
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            if (this.audioEl.readyState < 2) {
                this._queueResumeWhenReady(expectedSourceTime);
            }

            this.audioEl.play().catch((error) => {
                if (error?.name !== 'AbortError') {
                    this._queueResumeWhenReady(expectedSourceTime);
                    console.warn(`[AudioTrackPlayer:${this.trackId}] play failed:`, error.message);
                }
            });
            this.isPlaying = true;
        }
    }

    pause() {
        if (!this.audioEl.paused) {
            this.audioEl.pause();
        }
        if (this._resumeOnCanPlay) {
            this.audioEl.removeEventListener('canplay', this._resumeOnCanPlay);
            this.audioEl.removeEventListener('loadeddata', this._resumeOnCanPlay);
            this._resumeOnCanPlay = null;
        }
        this._shouldResumeAfterLoad = false;
        this.isPlaying = false;
    }

    stop() {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this._shouldResumeAfterLoad = false;
        this._pendingExpectedTime = 0;
        this.isPlaying = false;
    }

    updateSrc(newAudioSrc, options = {}) {
        const currentSrc = this._currentSrc;
        const shouldResume = options.shouldResume !== undefined ? options.shouldResume : (!this.audioEl.paused || this.isPlaying);
        const expectedSourceTime = options.expectedSourceTime;

        if (currentSrc === newAudioSrc || (currentSrc && newAudioSrc && currentSrc.includes(newAudioSrc) && newAudioSrc.length > 5)) {
            if (expectedSourceTime !== undefined) {
                this._pendingExpectedTime = expectedSourceTime;
            }
            return;
        }

        this._currentSrc = newAudioSrc;
        this._pendingExpectedTime = expectedSourceTime !== undefined ? expectedSourceTime : this._pendingExpectedTime;
        this._shouldResumeAfterLoad = shouldResume;

        this.audioEl.pause();
        this.audioEl.src = newAudioSrc;
        this.audioEl.load();

        if (shouldResume) {
            this._queueResumeWhenReady(this._pendingExpectedTime);
        }

        this.isPlaying = false;
    }

    setVolume(gainValue) {
        if (this.gainNode) {
            this.gainNode.gain.value = gainValue;
        } else {
            this.audioEl.volume = Math.min(1.0, gainValue);
        }
    }

    setSpeed(speed) {
        if (this.audioEl.playbackRate !== speed) {
            this.audioEl.playbackRate = speed;
        }
    }

    isReadyForPlayback() {
        return !!this.audioEl.src
            && this.audioEl.readyState >= 2
            && !this.audioEl.seeking
            && !this._resumeOnCanPlay;
    }

    destroy() {
        this.stop();
        if (this._resumeOnCanPlay) {
            this.audioEl.removeEventListener('canplay', this._resumeOnCanPlay);
            this.audioEl.removeEventListener('loadeddata', this._resumeOnCanPlay);
            this._resumeOnCanPlay = null;
        }
        if (this.audioSourceNode) this.audioSourceNode.disconnect();
        if (this.gainNode) this.gainNode.disconnect();
        if (this.audioEl.parentNode) this.audioEl.parentNode.removeChild(this.audioEl);
    }
}

window.AudioTrackPlayer = AudioTrackPlayer;
