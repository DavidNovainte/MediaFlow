console.log('[SubtitleMediaHandler] Loading script...');
class SubtitleMediaHandler {
    constructor(flow) {
        this.flow = flow;
        this._rafId = null;
        this._renderLoop = this._renderLoop.bind(this);
        this._startRenderLoop = this._startRenderLoop.bind(this);
        this._stopRenderLoop = this._stopRenderLoop.bind(this);
        this._handleVideoPlay = this._handleVideoPlay.bind(this);
        this._handleVideoPause = this._handleVideoPause.bind(this);
        this._handleVideoEnded = this._handleVideoEnded.bind(this);
        this._handleVideoSeeked = this._handleVideoSeeked.bind(this);
    }

    getLocalMediaUrl(filePath) {
        if (!filePath || typeof filePath !== 'string') return '';
        if (window.urlUtils?.pathToMediaUrl) return window.urlUtils.pathToMediaUrl(filePath);

        const normalized = filePath.replace(/\\/g, '/');
        return /^[a-zA-Z]:/.test(normalized)
            ? `media-file:///${normalized}`
            : normalized;
    }

    /**
     * 启动高频渲染循环 (用于毫秒级音画同步)
     */
    _startRenderLoop() {
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(this._renderLoop);
            console.log('[SubtitleMediaHandler] RAF loop started');
        }
    }

    /**
     * 停止高频渲染循环 (节省 CPU 资源)
     */
    _stopRenderLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
            console.log('[SubtitleMediaHandler] RAF loop stopped');
        }
    }

    /**
     * 渲染循环核心体：每帧执行一次
     */
    _renderLoop() {
        if (this._enforceTrimmedPlaybackBounds()) {
            if (!this.flow.video?.paused) {
                this._rafId = requestAnimationFrame(this._renderLoop);
            }
            return;
        }

        this.renderCurrentSubtitle();
        if (this.flow.timeline) {
            this.flow.timeline.updateTime(this.flow.video.currentTime);
        }
        this._rafId = requestAnimationFrame(this._renderLoop);
    }

    _handleVideoPlay() {
        this._enforceTrimmedPlaybackBounds();
        this._startRenderLoop();
        if (this.flow.timeline) this.flow.timeline.updatePlayPauseIcon();
    }

    _handleVideoPause() {
        this._stopRenderLoop();
        if (this.flow.timeline) this.flow.timeline.updatePlayPauseIcon();
    }

    _handleVideoEnded() {
        this._stopRenderLoop();
        if (this.flow.timeline) this.flow.timeline.updatePlayPauseIcon();
    }

    _handleVideoSeeked() {
        if (this._enforceTrimmedPlaybackBounds()) {
            return;
        }

        this.renderCurrentSubtitle();
        if (this.flow.timeline) {
            this.flow.timeline.updateTime(this.flow.video.currentTime);
        }
    }

    _enforceTrimmedPlaybackBounds() {
        const video = this.flow.video;
        const resolvePlayableTime = this.flow.getPlayableSourceTime?.bind(this.flow);

        if (!video || !resolvePlayableTime || !this.flow.hasSourceTrim?.()) {
            return false;
        }

        const currentTime = Number(video.currentTime || 0);
        const playableTime = resolvePlayableTime(currentTime);

        if (!Number.isFinite(playableTime) || Math.abs(playableTime - currentTime) <= 0.02) {
            return false;
        }

        const reachedTrimmedEnd = playableTime < currentTime;
        video.currentTime = playableTime;

        if (reachedTrimmedEnd && !video.paused) {
            video.pause();
            this.flow.audioManager?.syncPlayback?.(false);
        }

        this.renderCurrentSubtitle();
        this.flow.timeline?.updateTime?.(playableTime);

        return true;
    }

    async selectVideo() {
        const inputMode = document.querySelector('input[name="input-mode"]:checked')?.value || 'single';

        if (inputMode === 'batch') {
            await this.flow.batchHandler.selectBatchFolder();
        } else {
            const path = await window.mediaflow?.dialog?.openFile({
                title: '选择视频文件',
                filters: [
                    { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] }
                ]
            });
            if (path) {
                this.loadVideo(path);
            }
        }
    }

    /**
     * Fully unload media + cues/timeline back to a clean empty project.
     */
    async clearMedia({ confirm = true } = {}) {
        if (!this.flow.videoFile && !(this.flow.editor?.subtitles?.length)) {
            window.app?.showToast?.(
                window.i18n?.t?.('subtitle.messages.nothing_to_clear') || '当前没有可清除的内容',
                'info'
            );
            return false;
        }

        if (confirm) {
            const msg = window.i18n?.t?.('subtitle.confirm.clear_media')
                || '清除当前视频与字幕？此操作可稍后重新导入。';
            const ok = window.app?.showConfirm
                ? await window.app.showConfirm(msg)
                : window.confirm(msg);
            if (!ok) return false;
        }

        try {
            this._stopRenderLoop();
            const video = this.flow.video;
            if (video) {
                video.pause?.();
                video.removeAttribute('src');
                video.load?.();
            }

            this.flow.videoFile = null;
            this.flow.sourceSegments = [];
            this.flow.resetSourceSegments?.(0, { render: false });

            // Wipe tracks/cues and recreate default empty main track
            this.flow.trackManager?.clearAllTracks?.();

            // Timeline duration + waveform must both reset (peaks were sticking around)
            if (this.flow.timeline) {
                if (typeof this.flow.timeline.clearWaveform === 'function') {
                    this.flow.timeline.clearWaveform();
                } else {
                    this.flow.timeline.peaks = null;
                    this.flow.timeline.duration = 0;
                    this.flow.timeline.render?.([]);
                    this.flow.timeline.updateTime?.(0);
                    this.flow.timeline.renderer?.drawWaveform?.();
                    this.flow.timeline.renderer?.drawRuler?.();
                }
                if (typeof this.flow.timeline.setDuration === 'function') {
                    this.flow.timeline.setDuration(0);
                }
            }

            // Preview chrome
            if (this.flow.videoPlaceholder) this.flow.videoPlaceholder.style.display = '';
            if (this.flow.videoInfo) this.flow.videoInfo.style.display = 'none';

            const nameEl = document.getElementById('video-name');
            const durEl = document.getElementById('video-duration');
            if (nameEl) nameEl.textContent = window.i18n?.t?.('subtitle.placeholder.videoName') || 'No Video Loaded';
            if (durEl) durEl.textContent = '00:00 / 00:00';

            // Overlay / style preview
            this.flow.styleManager?.updateSubtitlePreview?.();
            this.flow.updateSubtitlePreview?.();
            this.flow.updateActiveTrackMeta?.();

            // List empty state should flip back to "import video"
            this.flow.editor?.render?.([]);

            window.app?.showToast?.(
                window.i18n?.t?.('subtitle.toast.media_cleared') || '已清除当前媒体与字幕',
                'success'
            );
            return true;
        } catch (e) {
            console.error('[SubtitleMediaHandler] clearMedia failed:', e);
            window.app?.showToast?.(`清除失败: ${e.message || e}`, 'error');
            return false;
        }
    }

    async loadVideo(filePath) {
        if (!filePath) return;

        // 核心修复：加载新视频时必须清空上一个视频的所有内容（字幕、音轨等）
        if (this.flow.trackManager) {
            const inputMode = document.querySelector('input[name="input-mode"]:checked')?.value || 'single';

            // --- 批量模式切换文件，先保存当前字幕到内存缓存 ---
            if (inputMode === 'batch' && this.flow.batchHandler && this.flow.videoFile) {
                this.flow.batchHandler.saveCurrentToCache(this.flow.videoFile.path);
            }

            // 无论任何模式，加载新视频时都先执行清空，确保状态干净
            this.flow.trackManager.clearAllTracks();

            // 批量模式下的缓存恢复逻辑 (恢复之前在该 session 中编辑过的内容)
            if (inputMode === 'batch' && this.flow.batchHandler) {
                const cachedTrackState = this.flow.batchHandler.getFileTrackState?.(filePath);
                if (cachedTrackState && this.flow.trackManager.restoreBatchState?.(cachedTrackState)) {
                    // Full batch state restored, no need for legacy main-track fallback.
                } else {
                    const cachedSubs = this.flow.batchHandler.getFileSubtitles(filePath);
                    if (cachedSubs) {
                        const track = this.flow.trackManager.tracks.find(t => t.type === 'main');
                        if (track) {
                            track.subtitles = cachedSubs;
                            this.flow.trackManager.setActiveTrack(track.id);
                        }
                    }
                }
            }
        }

        this.flow.videoFile = {
            path: filePath,
            name: filePath.split(/[/\\]/).pop()
        };
        this.flow.resetSourceSegments(0, { render: false });

        // Refresh list empty-state so primary action becomes "智能识别" once media exists
        const activeSubs = this.flow.trackManager?.tracks?.find((t) => t.id === this.flow.trackManager.activeTrackId)?.subtitles
            || this.flow.editor?.subtitles
            || [];
        this.flow.editor?.render?.(activeSubs);

        // --- 核心新增：检查草稿恢复 ---
        this.flow.checkDraftRecovery?.(filePath);

        // High-Performance Loading: media-file:// with Range/seek (independent of MobileFlow)
        try {
            // 1. Reset video before loading new one
            this._stopRenderLoop();
            this.flow.video.pause();
            this.flow.video.removeAttribute('src');
            this.flow.video.load();

            // 2. Add listeners BEFORE setting src
            this.flow.video.onloadedmetadata = () => {
                const duration = this.flow.video.duration;
                if (this.flow.videoFile) this.flow.videoFile.duration = duration;

                const vw = this.flow.video.videoWidth;
                const vh = this.flow.video.videoHeight;
                const isPortrait = vh > vw;

                console.log(`[SubtitleMediaHandler] Metadata loaded. Duration: ${duration}s, Size: ${vw}x${vh}`);

                // 强制同步 UI 状态 (隐藏占位符)
                if (this.flow.videoPlaceholder) this.flow.videoPlaceholder.style.display = 'none';
                if (this.flow.videoInfo) this.flow.videoInfo.style.display = 'flex';

                // 自动调整单行上限建议值
                if (this.flow.maxChars) {
                    const targetLang = this.flow.targetLanguage?.value || 'none';
                    const isCJK = /zh|ja|ko/.test(targetLang);
                    const suggestion = isCJK ? (isPortrait ? 10 : 18) : (isPortrait ? 25 : 45);
                    this.flow.maxChars.value = suggestion;
                }

                const durationElement = this.flow.getElement?.('video-duration') || document.getElementById('video-duration');
                if (durationElement) {
                    durationElement.textContent = this.formatTime(duration);
                }

                if (this.flow.styleManager) this.flow.styleManager.updateSubtitlePreview();
                if (this.flow.timeline) {
                    this.flow.resetSourceSegments(duration, { render: false });
                    this.flow.timeline.setDuration(duration);
                    this.flow.timeline.loadWaveform(filePath);
                    this.flow.timeline.render();
                }
                this.updateBlurPreview();

                // 🟢 核心修復：分發 videoLoaded 事件，讓 StyleManager 計算自適應字號
                console.log(`[SubtitleMediaHandler] Dispatching videoLoaded event: ${vw}x${vh}`);
                window.dispatchEvent(new CustomEvent('videoLoaded', {
                    detail: { width: vw, height: vh }
                }));
            };

            this.flow.video.onerror = () => {
                const error = this.flow.video.error;
                if (!filePath) return;

                const errorMsg = error?.message
                    || (error?.code === 4 ? '格式不支持或文件损坏' : '无法解码该格式');
                window.app?.showToast?.('视频播放器出错: ' + errorMsg, 'error');
                if (this.flow.videoPlaceholder) this.flow.videoPlaceholder.style.display = 'none';
                if (this.flow.videoInfo) this.flow.videoInfo.style.display = 'flex';
            };

            // 3. Setup high-precision render loop (RAF)
            // 移除旧监听器以防堆叠
            this.flow.video.removeEventListener('play', this._handleVideoPlay);
            this.flow.video.removeEventListener('pause', this._handleVideoPause);
            this.flow.video.removeEventListener('ended', this._handleVideoEnded);
            this.flow.video.removeEventListener('seeked', this._handleVideoSeeked);

            // 建立基于状态的智能启停监听
            this.flow.video.addEventListener('play', this._handleVideoPlay);
            this.flow.video.addEventListener('pause', this._handleVideoPause);
            this.flow.video.addEventListener('ended', this._handleVideoEnded);
            // 拖动进度条后即使是暂停状态也需要刷新一次
            this.flow.video.addEventListener('seeked', this._handleVideoSeeked);

            // 检查初始状态
            if (!this.flow.video.paused) this._startRenderLoop();
            else this.renderCurrentSubtitle(); // 初始渲染一帧

            // 4. Always use media-file:// (Range/seek supported in main process).
            // Do not depend on MobileFlow :8765 for subtitle preview.
            const finalUrl = this.getLocalMediaUrl(filePath);
            this.flow.video.src = finalUrl;
            console.log('[SubtitleMediaHandler] Using local media-file source:', finalUrl);

            try {
                const info = await window.mediaflow?.subtitle?.getVideoInfo?.(filePath);
                if (info?.width && info?.height) {
                    window.dispatchEvent(new CustomEvent('videoLoaded', {
                        detail: { width: info.width, height: info.height, path: filePath }
                    }));
                }
            } catch (infoErr) {
                console.warn('[SubtitleMediaHandler] getVideoInfo optional failed:', infoErr?.message || infoErr);
            }

            // 5. Update UI
            this.flow.videoPlaceholder.style.display = 'none';
            this.flow.videoInfo.style.display = 'flex';
            document.getElementById('video-name').textContent = this.flow.videoFile.name;

        } catch (e) {
            console.error('[SubtitleMediaHandler] Error during video setup:', e);
            window.app?.showToast?.('加载视频失败: ' + e.message, 'error');
        }
    }

    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    }

    updateBlurPreview() {
        // Legacy logic removed. 
        // Blur preview is now managed entirely by SubtitleStyleManager (for multi-mask rendering)
        // and SubtitleUIManager (for layout/positioning).
    }

    renderCurrentSubtitle() {
        const video = this.flow.video;
        const overlay = this.flow.subtitleOverlay;

        if (!video || !overlay) return;

        // Even if no track, the PreviewHandler might want to render its "Preview Hint"
        // But during playback, we should prioritize real subtitles.
        if (this.flow.styleManager && this.flow.styleManager.previewHandler) {
            this.flow.styleManager.previewHandler.updateSubtitlePreview();
        }
    }
}

window.SubtitleMediaHandler = SubtitleMediaHandler;
