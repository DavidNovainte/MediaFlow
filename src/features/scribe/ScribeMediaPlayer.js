/**
 * ScribeMediaPlayer.js
 * 负责底部的音视频播放器逻辑，与 ScribeEditor 联动
 */

class ScribeMediaPlayer {
    /**
     * @param {ScribeFlow} scribeflow - ScribeFlow 实例
     */
    constructor(scribeflow) {
        this.app = scribeflow;
        this.container = null;
        this.mediaEl = null; // <audio> element
        this.isPlaying = false;
        this.playbackRate = 1.0;
        this.isDragging = false;
        this.lastVolume = 1;
    }

    /**
     * 初始化播放器 UI
     */
    init() {
        this.renderUI();
        this.bindEvents();
    }

    /**
     * 渲染 UI 结构
     */
    renderUI() {
        // 创建容器
        const div = document.createElement('div');
        div.className = 'scribe-player-container hidden';
        div.id = 'scribe-player';

        div.innerHTML = `
            <button type="button" class="player-close-btn" id="btn-player-close" title="${window.i18n?.t('common.ui.closePlayer') || 'Close Player'}" aria-label="Close">×</button>
            <div class="player-progress-container" id="player-progress-bar">
                <div class="player-progress-fill" id="player-progress-fill"></div>
            </div>
            <div class="player-controls">
                <div class="player-left">
                    <button class="player-btn" id="btn-player-play" title="${window.i18n?.t('common.ui.playPause') || 'Play/Pause'} (Space)">
                        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="player-time" id="player-time-display">00:00 / 00:00</div>
                </div>
                <div class="player-right">
                    <button class="player-btn player-speed-btn" id="btn-player-speed" title="${window.i18n?.t('common.ui.playbackSpeed') || 'Playback Speed'}">1.0x</button>
                    <div class="player-volume-container">
                        <button class="player-btn" id="btn-player-mute" title="${window.i18n?.t('common.ui.mute') || 'Mute'}">
                            <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                        </button>
                        <input type="range" class="player-volume-slider" id="player-volume" min="0" max="1" step="0.1" value="1">
                    </div>
                </div>
            </div>
            <audio id="scribe-audio-element" style="display:none;"></audio>
        `;

        this.container = div;
        this.mediaEl = div.querySelector('#scribe-audio-element');
        this.mountPlayer();
    }

    /**
     * Prefer mounting inside #transcribe-result (document flow).
     * Fallback: body dock at bottom (CSS), never fixed top overlay.
     */
    mountPlayer() {
        if (!this.container) return;

        const result = document.getElementById('transcribe-result');
        if (result) {
            // First child of result → sits above AI tools / transcript, no overlap
            if (this.container.parentElement !== result || result.firstElementChild !== this.container) {
                result.insertBefore(this.container, result.firstChild);
            }
            this.container.classList.add('embedded-mode');
            return;
        }

        if (!this.container.parentElement) {
            document.body.appendChild(this.container);
        }
        this.container.classList.remove('embedded-mode');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.mediaEl) return;

        // Play/Pause Toggle
        document.getElementById('btn-player-play')?.addEventListener('click', () => this.togglePlay());

        // Time Update (Sync)
        this.mediaEl.addEventListener('timeupdate', () => {
            if (!this.isDragging) {
                this.updateProgressUI();
                const currentTime = this.mediaEl.currentTime;
                // Sync Editor
                if (this.app.editor && typeof this.app.editor.highlightCurrentSegment === 'function') {
                    this.app.editor.highlightCurrentSegment(currentTime);
                }
            }
        });

        this.mediaEl.addEventListener('loadedmetadata', () => {
            this.updateTimeDisplay();
            this.container.classList.remove('hidden');
        });

        this.mediaEl.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayBtnState();
        });

        // Progress Bar Seek
        const progressBar = document.getElementById('player-progress-bar');
        progressBar?.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.mediaEl.currentTime = percent * this.mediaEl.duration;
        });

        // Speed Control (Cycle: 1.0 -> 1.25 -> 1.5 -> 2.0 -> 0.5 -> 1.0)
        const speedBtn = document.getElementById('btn-player-speed');
        speedBtn?.addEventListener('click', () => {
            const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
            let nextIdx = speeds.indexOf(this.playbackRate) + 1;
            if (nextIdx >= speeds.length) nextIdx = 0;

            this.setRate(speeds[nextIdx]);
        });

        // Close Button
        document.getElementById('btn-player-close')?.addEventListener('click', () => {
            this.container.classList.add('hidden');
            this.mediaEl.pause();
            this.isPlaying = false;
            this.updatePlayBtnState();

            // Clear editor highlight
            if (this.app.editor && typeof this.app.editor.clearHighlight === 'function') {
                this.app.editor.clearHighlight();
            }
        });

        // Volume
        document.getElementById('btn-player-mute')?.addEventListener('click', () => {
            this.toggleMute();
        });

        document.getElementById('player-volume')?.addEventListener('input', (e) => {
            const value = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
            this.mediaEl.volume = value;
            if (value > 0) {
                this.lastVolume = value;
                this.mediaEl.muted = false;
            } else {
                this.mediaEl.muted = true;
            }
            this.updateMuteBtnState();
        });
    }

    /**
     * 加载媒体文件
     * @param {File} file 
     */
    loadMedia(file) {
        if (!file) return;

        // Safeguard: Ensure file is actually a Blob or File
        if (!(file instanceof Blob || file instanceof File)) {
            console.warn('[ScribeMediaPlayer] Invalid file object passed to loadMedia:', file);
            return;
        }

        try {
            const url = URL.createObjectURL(file);
            this.mediaEl.src = url;
        } catch (e) {
            console.error('[ScribeMediaPlayer] Failed to create object URL:', e);
            return;
        }
        this.mediaEl.load();

        // Reset State
        this.setRate(1.0);
        this.isPlaying = false;
        this.mediaEl.muted = false;
        this.updateMuteBtnState();
        this.updatePlayBtnState();

        // Ensure in-flow placement (result panel may have been lazy / recreated)
        this.mountPlayer();
        // Show player
        this.container.classList.remove('hidden');
    }

    /**
     * 切换播放/暂停
     */
    togglePlay() {
        if (this.mediaEl.paused) {
            this.mediaEl.play();
            this.isPlaying = true;
        } else {
            this.mediaEl.pause();
            this.isPlaying = false;
        }
        this.updatePlayBtnState();
    }

    /**
     * 跳转到指定时间 (由 Editor 调用)
     * @param {number} time 
     */
    seek(time) {
        if (this.mediaEl && Number.isFinite(time)) {
            // Unhide if hidden
            if (this.container.classList.contains('hidden')) {
                this.container.classList.remove('hidden');
            }

            this.mediaEl.currentTime = time;
            if (this.mediaEl.paused) {
                this.mediaEl.play();
                this.isPlaying = true;
                this.updatePlayBtnState();
            }
        }
    }

    /**
     * 设置播放速度
     */
    setRate(rate) {
        this.playbackRate = rate;
        this.mediaEl.playbackRate = rate;
        const btn = document.getElementById('btn-player-speed');
        if (btn) btn.textContent = `${rate}x`;
    }

    toggleMute() {
        if (!this.mediaEl) return;

        const slider = document.getElementById('player-volume');
        const isMuted = this.mediaEl.muted || this.mediaEl.volume === 0;

        if (isMuted) {
            const restoredVolume = this.lastVolume > 0 ? this.lastVolume : 1;
            this.mediaEl.volume = restoredVolume;
            this.mediaEl.muted = false;
            if (slider) slider.value = String(restoredVolume);
        } else {
            this.lastVolume = this.mediaEl.volume > 0 ? this.mediaEl.volume : this.lastVolume;
            this.mediaEl.muted = true;
        }

        this.updateMuteBtnState();
    }

    updateMuteBtnState() {
        const btn = document.getElementById('btn-player-mute');
        if (!btn || !this.mediaEl) return;

        const muted = this.mediaEl.muted || this.mediaEl.volume === 0;
        btn.classList.toggle('active', muted);
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        btn.title = muted
            ? (window.i18n?.t('common.ui.unmute') || 'Unmute')
            : (window.i18n?.t('common.ui.mute') || 'Mute');
        btn.innerHTML = muted
            ? '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.59 3L19 9.41 17.59 8 15 10.59 12.41 8 11 9.41 13.59 12 11 14.59 12.41 16 15 13.41 17.59 16 19 14.59z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
    }

    updatePlayBtnState() {
        const btn = document.getElementById('btn-player-play');
        if (!btn) return;

        // 播放图标 vs 暂停图标
        if (this.isPlaying) {
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; // Pause Icon
        } else {
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; // Play Icon
        }
    }

    updateProgressUI() {
        const current = this.mediaEl.currentTime;
        const duration = this.mediaEl.duration || 1;
        const percent = (current / duration) * 100;

        const fill = document.getElementById('player-progress-fill');
        if (fill) fill.style.width = `${percent}%`;

        this.updateTimeDisplay(current, duration);
    }

    updateTimeDisplay(current = 0, duration = 0) {
        const currStr = this.formatTime(current);
        const durStr = this.formatTime(duration || this.mediaEl.duration || 0);
        const el = document.getElementById('player-time-display');
        if (el) el.textContent = `${currStr} / ${durStr}`;
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * 重置播放器状态并隐藏
     */
    reset() {
        if (this.mediaEl) {
            this.mediaEl.pause();
            this.mediaEl.src = ''; // Clear source
            this.mediaEl.load();
        }
        this.isPlaying = false;
        this.playbackRate = 1.0;
        this.lastVolume = 1;
        this.mediaEl.muted = false;
        this.mediaEl.volume = 1;

        if (this.container) {
            this.container.classList.add('hidden');
        }

        this.updateMuteBtnState();
        this.updatePlayBtnState();
    }
}

window.ScribeMediaPlayer = ScribeMediaPlayer;
