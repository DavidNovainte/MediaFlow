/**
 * MediaFlow - CreatorPreview
 */
class CreatorPreview {
    constructor(creatorFlow) {
        this.app = creatorFlow;
        this.elements = {};
        this.videoDuration = 0;
        this.activeTransition = null;

        this.audioCtx = null;
        this.gainNode = null;
        this.audioSource = null;

        this._isInitialLoading = false;
        this._timelinePlaybackRequested = false;
        this._currentVideoSrc = '';
        this._standbyVideoSrc = '';
        this._rafId = null;
        this._pipRaf = null;
        this._cropRaf = null;
        this._transitionTimeout = null;
        this._holdTimelineUntilMediaReady = false;

        this.bootstrap = new window.CreatorPreviewBootstrap(this);
        this.presentation = new window.CreatorPreviewPresentation(this);
    }

    init() {
        return this.bootstrap.init();
    }

    bindEvents() {
        return this.bootstrap.bindEvents();
    }

    getActiveVideoSegmentAtTime(timelineNow) {
        const tm = this.app.timelineManager;
        if (!tm?.tracks) return { activeSeg: null, activeTrackId: null };
        return window.TimelineSelectionResolver
            ? window.TimelineSelectionResolver.getActiveVideoSegment(tm.tracks, timelineNow, tm.trackOrder)
            : { activeSeg: null, activeTrackId: null };
    }

    getPlaybackSnapshot(timelineNow) {
        const tm = this.app.timelineManager;
        if (!tm?.tracks || !window.TimelinePlaybackState) {
            return {
                timelineNow,
                video: {
                    activeSeg: null,
                    activeTrackId: null,
                    file: null,
                    src: '',
                    speed: 1.0,
                    expectedSourceTime: timelineNow,
                    visible: false
                },
                audio: []
            };
        }

        return window.TimelinePlaybackState.resolve({
            manager: tm,
            timelineNow,
            resolveMediaSrc: (file) => this.resolveMediaSrc(file)
        });
    }

    normalizeMediaSrc(src) {
        return (src || '').replace(/\\/g, '/').toLowerCase();
    }

    resolveMediaSrc(file) {
        if (!file) return '';
        if (typeof file === 'string') {
            return window.urlUtils ? window.urlUtils.getMediaSrc(file) : file;
        }
        if (file.path) {
            return window.urlUtils ? window.urlUtils.getMediaSrc(file) : file.path;
        }
        if (file instanceof File || file instanceof Blob) {
            return file.__cachedUrl || (file.__cachedUrl = URL.createObjectURL(file));
        }
        return '';
    }

    ensureStandbyVideo() {
        if (this.elements.videoStandby?.isConnected) return this.elements.videoStandby;

        const previewShell = this.elements.previewStage;
        if (!previewShell) return null;

        let standby = document.getElementById('creator-video-preview-standby');
        if (!standby) {
            standby = document.createElement('video');
            standby.id = 'creator-video-preview-standby';
            standby.muted = true;
            standby.preload = 'auto';
            standby.setAttribute('playsinline', '');
            standby.setAttribute('aria-hidden', 'true');
            standby.style.position = 'absolute';
            standby.style.inset = '0';
            standby.style.width = '100%';
            standby.style.height = '100%';
            standby.style.objectFit = 'contain';
            standby.style.opacity = '0';
            standby.style.visibility = 'hidden';
            standby.style.pointerEvents = 'none';
            standby.style.zIndex = '-1';
            previewShell.appendChild(standby);
        }

        this.elements.videoStandby = standby;
        return standby;
    }

    getUpcomingVideoSegment(timelineNow) {
        const tm = this.app.timelineManager;
        if (!tm?.tracks) return null;

        const trackIds = tm.getPlaybackTrackIds?.().filter(id => id.startsWith('v'))
            || Object.keys(tm.tracks).filter(id => id.startsWith('v'));
        const trackRank = new Map(trackIds.map((id, index) => [id, index]));

        let best = null;
        trackIds.forEach((trackId) => {
            const track = tm.tracks[trackId];
            if (!track?.segments) return;

            track.segments.forEach((seg) => {
                if (seg.start <= timelineNow + 0.05) return;

                if (!best || seg.start < best.seg.start) {
                    best = { seg, trackId };
                    return;
                }

                if (seg.start === best.seg.start && (trackRank.get(trackId) || 0) < (trackRank.get(best.trackId) || 0)) {
                    best = { seg, trackId };
                }
            });
        });

        return best;
    }

    preloadUpcomingSegment(timelineNow) {
        if (this.app.isAudioOnly) return;

        const standby = this.ensureStandbyVideo();
        if (!standby) return;

        const upcoming = this.getUpcomingVideoSegment(timelineNow);
        const preloadWindowSeconds = 3.0;
        if (!upcoming || (upcoming.seg.start - timelineNow) > preloadWindowSeconds) return;

        const upcomingSrc = this.resolveMediaSrc(upcoming.seg.file || this.app.timelineManager?.videoFile);
        if (!upcomingSrc) return;

        const normalizedUpcoming = this.normalizeMediaSrc(upcomingSrc);
        const normalizedCurrent = this.normalizeMediaSrc(this._currentVideoSrc);
        if (normalizedUpcoming === normalizedCurrent || normalizedUpcoming === this._standbyVideoSrc) return;

        this._standbyVideoSrc = normalizedUpcoming;
        standby.playbackRate = upcoming.seg.speed || 1.0;
        standby.src = upcomingSrc;
        standby.load();
    }

    async alignPlaybackToTimeline() {
        if (!this.app.isAudioOnly) {
            const tm = this.app.timelineManager;
            const video = this.elements.video;
            if (tm && video) {
                const timelineNow = tm.currentTime || 0;
                const snapshot = this.getPlaybackSnapshot(timelineNow);
                const { activeSeg, file, src: newSrc, speed, expectedSourceTime, visible } = snapshot.video;

                if (activeSeg && file && visible) {
                    this.setVideoVisibility(true);
                    if (newSrc) {
                        const normalizedNext = this.normalizeMediaSrc(newSrc);
                        const normalizedCurrent = this.normalizeMediaSrc(this._currentVideoSrc);
                        if (!(this._currentVideoSrc && normalizedCurrent === normalizedNext && video.src)) {
                            this.markTimelineHold(video);
                            await new Promise((resolve) => {
                                let settled = false;
                                const finish = () => {
                                    if (settled) return;
                                    settled = true;
                                    video.removeEventListener('loadedmetadata', finish);
                                    video.removeEventListener('canplay', finish);
                                    video.removeEventListener('error', finish);
                                    resolve();
                                };

                                this._currentVideoSrc = newSrc;
                                video.addEventListener('loadedmetadata', finish, { once: true });
                                video.addEventListener('canplay', finish, { once: true });
                                video.addEventListener('error', finish, { once: true });
                                video.src = newSrc;
                                video.load();
                            });
                        }

                        if (video.playbackRate !== speed) video.playbackRate = speed;
                        if (Math.abs((video.currentTime || 0) - expectedSourceTime) > 0.05) {
                            this.markTimelineHold(video);
                            video.currentTime = expectedSourceTime;
                        }

                        this.preloadUpcomingSegment(timelineNow);
                        return;
                    }
                }

                this.setVideoVisibility(false);
                this.releaseTimelineHold();
            }
        }

        if (this.app.isAudioOnly) return;

        const tm = this.app.timelineManager;
        const video = this.elements.video;
        if (!tm || !video) return;

        const timelineNow = tm.currentTime || 0;
        const snapshot = this.getPlaybackSnapshot(timelineNow);
        const { activeSeg, file, src: newSrc, speed, expectedSourceTime } = snapshot.video;
        if (!activeSeg) return;
        if (!file) return;
        if (!newSrc) return;

        if (!(this._currentVideoSrc && this.normalizeMediaSrc(this._currentVideoSrc) === this.normalizeMediaSrc(newSrc) && video.src)) {
            this.markTimelineHold(video);
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    video.removeEventListener('loadedmetadata', finish);
                    video.removeEventListener('canplay', finish);
                    video.removeEventListener('error', finish);
                    resolve();
                };

                this._currentVideoSrc = newSrc;
                video.addEventListener('loadedmetadata', finish, { once: true });
                video.addEventListener('canplay', finish, { once: true });
                video.addEventListener('error', finish, { once: true });
                video.src = newSrc;
                video.load();
            });
        }

        if (video.playbackRate !== speed) video.playbackRate = speed;
        if (Math.abs((video.currentTime || 0) - expectedSourceTime) > 0.05) {
            this.markTimelineHold(video);
            video.currentTime = expectedSourceTime;
        }
    }

    queueVideoResume(video) {
        if (!video) return;

        const resume = () => {
            video.removeEventListener('canplay', resume);
            video.removeEventListener('loadedmetadata', resume);
            video.play().catch(err => {
                if (err?.name === 'AbortError') return;
                console.warn('Video resume after source switch failed:', err);
            });
        };

        if (video.readyState >= 2) {
            resume();
            return;
        }

        video.addEventListener('canplay', resume, { once: true });
        video.addEventListener('loadedmetadata', resume, { once: true });
    }

    markTimelineHold(video) {
        this._holdTimelineUntilMediaReady = true;
        if (video) {
            this.queueVideoResume(video);
        }
    }

    releaseTimelineHold() {
        this._holdTimelineUntilMediaReady = false;
    }

    async togglePlayback() {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (!player) return;

        if (!this._timelinePlaybackRequested) {
            this.app.audioMixer?.resume();
            this._timelinePlaybackRequested = true;
            if (!this.app.isAudioOnly) {
                await this.alignPlaybackToTimeline();
            }
            const currentTime = this.app.timelineManager?.currentTime || 0;
            const snapshot = this.getPlaybackSnapshot(currentTime);
            const audioSync = this.app.audioMixer?.sync(currentTime, true, snapshot);
            if (audioSync && audioSync.ready === false) {
                this.markTimelineHold(this.app.isAudioOnly ? null : this.elements.video);
            }
            if (!player.src) return;
            player.play().catch(err => {
                if (err?.name === 'AbortError') return;
                console.error('Playback failed:', err);
            });
        } else {
            this._timelinePlaybackRequested = false;
            player.pause();
            this.app.audioMixer?.pauseAll();
        }
    }

    seekTo(time) {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (player && player.src) {
            player.currentTime = time;
        }
    }

    captureCurrentFrame() {
        const video = this.elements.video;
        const canvas = document.getElementById('transition-capture-canvas');
        const overlay = document.getElementById('creator-transition-overlay');
        if (!video || !canvas || !overlay) return null;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        overlay.style.backgroundImage = `url(${dataUrl})`;
        return dataUrl;
    }

    playTransitionEffect(transitionId, duration = 1.0) {
        console.log(`[Transition] 鎾斁杞満: ${transitionId} ${duration}s`);

        if (!transitionId || transitionId === 'none') return;

        const video = this.elements.video;
        if (!video) return;

        const config = window.TransitionManager?.transitions.find(t => t.id === transitionId);
        if (!config || !config.css) {
            console.warn(`[Transition] 鏈壘鍒伴厤缃? ${transitionId}`);
            return;
        }

        video.classList.remove(
            'vt-fade', 'vt-wiperight', 'vt-wipeleft', 'vt-wipeup', 'vt-wipedown',
            'vt-slideright', 'vt-slideleft', 'vt-slideup', 'vt-slidedown',
            'vt-circlecrop', 'vt-zoomin', 'vt-pixelize', 'vt-hblur', 'vt-radial'
        );

        void video.offsetWidth;
        video.style.setProperty('--vt-duration', `${duration}s`);

        const className = `vt-${transitionId}`;
        video.classList.add(className);
        console.log(`[Transition] video 鍏冪礌宸叉坊鍔犲姩鐢? ${className}`);

        if (this._transitionTimeout) clearTimeout(this._transitionTimeout);
        this._transitionTimeout = setTimeout(() => {
            video.classList.remove(className);
            console.log('[Transition] video 鍔ㄧ敾宸叉竻闄?');
        }, duration * 1000 + 200);
    }

    cacheElements() {
        return this.bootstrap.cacheElements();
    }

    setupAudioNodes() {
        return this.bootstrap.setupAudioNodes();
    }

    async loadMedia(file, isAudioOnly) {
        const { video, audioPlayer, audioPlaceholder, resolution } = this.elements;
        this._isInitialLoading = true;
        this.ensureStandbyVideo();
        this.updateExtraMetadata(file);

        if (isAudioOnly) {
            if (video) video.style.display = 'none';
            if (audioPlaceholder) audioPlaceholder.classList.remove('hidden');

            let audioSrc = '';
            if (typeof file === 'string') {
                audioSrc = window.urlUtils ? window.urlUtils.getMediaSrc(file) : file;
            } else if (file.path) {
                audioSrc = window.urlUtils ? window.urlUtils.getMediaSrc(file) : file.path;
            } else if (file instanceof File || file instanceof Blob) {
                audioSrc = URL.createObjectURL(file);
            }

            if (audioPlayer) {
                audioPlayer.src = audioSrc;
                audioPlayer.muted = true;
                this.setupAudioNodes();
                audioPlayer.onloadedmetadata = () => {
                    if (this._isInitialLoading) {
                        this.videoDuration = audioPlayer.duration;
                        this.app.videoDuration = audioPlayer.duration;
                        this.updateDurationDisplay(audioPlayer.duration);
                        if (this.app.timelineManager) {
                            this.app.timelineManager.loadMedia(audioPlayer.duration, file);
                        }
                        this._isInitialLoading = false;
                        this._startTimelineRAF();
                    }
                };
            }
        } else if (video) {
            video.style.display = '';
            if (audioPlaceholder) audioPlaceholder.classList.add('hidden');

            video.src = this.resolveMediaSrc(file);

            video.onloadedmetadata = () => {
                if (this._isInitialLoading) {
                    this.videoDuration = video.duration;
                    this.app.videoDuration = video.duration;
                    this.updateDurationDisplay(video.duration);
                    if (resolution) resolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
                    if (this.app.timelineManager) {
                        this.app.timelineManager.loadMedia(video.duration, file);
                    }
                    this._isInitialLoading = false;
                }
            };
            this._startTimelineRAF();
        }
    }

    async replaceMediaSource(file, isAudioOnly = this.app.isAudioOnly) {
        const { video, audioPlayer, audioPlaceholder, resolution, videoStandby } = this.elements;
        const timelineTime = this.app.timelineManager?.currentTime || 0;

        this.updateExtraMetadata(file);
        this._currentVideoSrc = '';
        this._standbyVideoSrc = '';

        if (videoStandby) {
            videoStandby.pause();
            videoStandby.removeAttribute('src');
            videoStandby.load();
        }

        if (isAudioOnly) {
            const audioSrc = this.resolveMediaSrc(file);
            if (!audioPlayer || !audioSrc) return;

            if (video) video.style.display = 'none';
            if (audioPlaceholder) audioPlaceholder.classList.remove('hidden');

            audioPlayer.pause();
            audioPlayer.src = audioSrc;
            audioPlayer.muted = true;
            this.setupAudioNodes();

            await new Promise((resolve) => {
                const finish = () => {
                    audioPlayer.removeEventListener('loadedmetadata', finish);
                    audioPlayer.removeEventListener('canplay', finish);
                    resolve();
                };
                audioPlayer.addEventListener('loadedmetadata', finish, { once: true });
                audioPlayer.addEventListener('canplay', finish, { once: true });
                audioPlayer.load();
            });

            this.videoDuration = audioPlayer.duration || this.videoDuration;
            this.app.videoDuration = this.videoDuration;
            this.updateDurationDisplay(this.videoDuration);
            audioPlayer.currentTime = Math.min(timelineTime, this.videoDuration || timelineTime);
            this.app.subtitlePreviewOverlay?.render?.(timelineTime);
            return;
        }

        const videoSrc = this.resolveMediaSrc(file);
        if (!video || !videoSrc) return;

        video.pause();
        video.style.display = '';
        if (audioPlaceholder) audioPlaceholder.classList.add('hidden');
        video.src = videoSrc;
        this._currentVideoSrc = videoSrc;

        await new Promise((resolve) => {
            const finish = () => {
                video.removeEventListener('loadedmetadata', finish);
                video.removeEventListener('canplay', finish);
                resolve();
            };
            video.addEventListener('loadedmetadata', finish, { once: true });
            video.addEventListener('canplay', finish, { once: true });
            video.load();
        });

        this.videoDuration = video.duration || this.videoDuration;
        this.app.videoDuration = this.videoDuration;
        this.updateDurationDisplay(this.videoDuration);
        if (resolution) {
            resolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
        }

        await this.alignPlaybackToTimeline();
        this.app.subtitlePreviewOverlay?.render?.(timelineTime);
    }

    _startTimelineRAF() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        let lastWallTime = null;

        const tick = (wallTime) => {
            this._rafId = requestAnimationFrame(tick);
            const tm = this.app.timelineManager;
            if (!tm) return;

            const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
            const isPlaying = !!this._timelinePlaybackRequested && !(player && player.ended);

            if (isPlaying) {
                if (!this.app.isAudioOnly || this._holdTimelineUntilMediaReady) {
                    const holdSnapshot = this.getPlaybackSnapshot(tm.currentTime || 0);
                    const audioReady = this.app.audioMixer ? this.app.audioMixer.isSnapshotReady(holdSnapshot) : true;
                    this.app.audioMixer?.sync(tm.currentTime || 0, true, holdSnapshot);
                    if (!this.app.isAudioOnly) {
                        const video = this.elements.video;
                        const videoReady = !!video && video.readyState >= 2 && !video.seeking;
                        if (this._holdTimelineUntilMediaReady && (!videoReady || !audioReady)) {
                            lastWallTime = wallTime;
                            return;
                        }
                    } else if (this._holdTimelineUntilMediaReady && !audioReady) {
                        lastWallTime = wallTime;
                        return;
                    }

                    if (this._holdTimelineUntilMediaReady) {
                        this.releaseTimelineHold();
                    }
                }

                if (!this.app.isAudioOnly) {
                    const video = this.elements.video;
                    if (video?.paused && this._timelinePlaybackRequested) {
                        this.queueVideoResume(video);
                    }
                }

                if (lastWallTime !== null) {
                    const elapsed = (wallTime - lastWallTime) / 1000;
                    tm.currentTime += elapsed;
                }
                lastWallTime = wallTime;

                const timelineNow = tm.currentTime;
                let globalEndTime = tm.duration || 0;
                Object.values(tm.tracks).forEach(track => {
                    track.segments.forEach(s => {
                        if (s.end > globalEndTime) globalEndTime = s.end;
                    });
                });

                if (timelineNow >= globalEndTime) {
                    this._timelinePlaybackRequested = false;
                    if (player) player.pause();
                    this.app.audioMixer?.pauseAll();
                    tm.currentTime = globalEndTime;
                    if (!this.app.isAudioOnly) this.setVideoVisibility(false);
                    tm.updatePlayheadPosition();
                    lastWallTime = null;
                    return;
                }

                const snapshot = this.getPlaybackSnapshot(timelineNow);
                const { activeSeg, file, src: newSrc, speed, expectedSourceTime } = snapshot.video;

                if (!this.app.isAudioOnly) {
                    const video = this.elements.video;
                    if (activeSeg && video) {
                        this.setVideoVisibility(true);
                        if (file) {
                            if (!(this._currentVideoSrc && this.normalizeMediaSrc(this._currentVideoSrc) === this.normalizeMediaSrc(newSrc) && video.src)) {
                                const shouldResume = this._timelinePlaybackRequested || !video.paused;
                                this._currentVideoSrc = newSrc;
                                this.markTimelineHold(video);
                                if (shouldResume) {
                                    this.queueVideoResume(video);
                                }
                                video.src = newSrc;
                                video.load();
                            }

                            if (video.playbackRate !== speed) video.playbackRate = speed;
                            if (Math.abs(video.currentTime - expectedSourceTime) > 0.15) {
                                this.markTimelineHold(video);
                                video.currentTime = expectedSourceTime;
                            }
                        }

                        this.preloadUpcomingSegment(timelineNow);
                    } else {
                        this.setVideoVisibility(false);
                        this.releaseTimelineHold();
                    }
                } else {
                    const audioPlayer = this.elements.audioPlayer;
                    const activeAudioState = Array.isArray(snapshot.audio)
                        ? snapshot.audio.find((state) => state.shouldPlay)
                        : null;
                    if (activeAudioState && audioPlayer) {
                        if (audioPlayer.playbackRate !== activeAudioState.speed) {
                            audioPlayer.playbackRate = activeAudioState.speed;
                        }
                        if (Math.abs(audioPlayer.currentTime - activeAudioState.expectedSourceTime) > 0.15) {
                            audioPlayer.currentTime = activeAudioState.expectedSourceTime;
                        }
                    }
                }

                const audioSync = this.app.audioMixer?.sync(timelineNow, true, snapshot);
                if (audioSync && audioSync.ready === false) {
                    this.markTimelineHold(this.app.isAudioOnly ? null : this.elements.video);
                }
                tm.updatePlayheadPosition();
                tm.syncAudioLevels?.(timelineNow, snapshot);
            } else {
                this.app.audioMixer?.pauseAll();
                lastWallTime = null;
            }
        };

        this._rafId = requestAnimationFrame(tick);
    }

    updateExtraMetadata(file) {
        return this.presentation.updateExtraMetadata(file);
    }

    formatFileSize(bytes) {
        return this.presentation.formatFileSize(bytes);
    }

    async fetchMediaInfo(filePath) {
        return this.presentation.fetchMediaInfo(filePath);
    }

    parseFrameRate(fpsString) {
        return this.presentation.parseFrameRate(fpsString);
    }

    updateDurationDisplay(seconds) {
        return this.presentation.updateDurationDisplay(seconds);
    }

    setVideoVisibility(visible) {
        return this.presentation.setVideoVisibility(visible);
    }

    applyTransform(transform = {}) {
        return this.presentation.applyTransform(transform);
    }

    updateVerticalPreview(isVisible, options = {}) {
        return this.presentation.updateVerticalPreview(isVisible, options);
    }

    updateCropPreview(isVisible, options = {}) {
        return this.presentation.updateCropPreview(isVisible, options);
    }

    reset() {
        return this.bootstrap.reset();
    }

    updateClipVolume(trackId, segmentIndex, volume) {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (this.gainNode) {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            if (player) player.volume = 1.0;
            this.gainNode.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.05);
        } else if (player) {
            player.volume = Math.min(1.0, volume);
        }
    }
}

window.CreatorPreview = CreatorPreview;
