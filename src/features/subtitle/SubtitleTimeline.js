/**
 * SubtitleTimeline.js
 * 时间轴主控制器：管理状态、缩放与模块协调。
 */
class SubtitleTimeline {
    constructor(subtitleFlow) {
        this.flow = subtitleFlow;
        this.container = null;
        this.rulerCanvas = null;
        this.waveformCanvas = null;
        this.tracksList = null;
        this.playhead = null;

        this.pxPerSec = 100; // 缩放比例
        this.zoomLevel = 100;
        this.duration = 0;
        this.currentTime = 0;
        this.isScrubbing = false;
        this.peaks = null;
        this.isClipRangeSelecting = false;
        this.clipRangeStartX = 0;
        this.clipRangeEndX = 0;
        this.clipRangeTrackId = null;
        this.clipRangeRow = null;
        this.clipRangeAdditive = false;
        this.clipSelectionMarquee = null;

        // 模块化子组件
        this.renderer = new window.SubtitleTimelineRenderer(this);
        this.clipsManager = new window.SubtitleTimelineClips(this);
        this.waveLoader = new window.AudioWaveformLoader();

        // 状态：同步编辑器的显示模式 (不再使用独立的 localStorage)
        this.displayMode = 'translated'; 
    }

    /**
     * 更新按钮视觉反馈
     */
    updateToggleUI() {
        const btn = document.getElementById('btn-toggle-timeline-content');
        if (btn) {
            btn.classList.toggle('active', this.displayMode !== 'translated');
            
            let key = '';
            if (this.displayMode === 'bilingual') key = 'subtitle.timeline.display_mode.bilingual';
            else if (this.displayMode === 'original') key = 'subtitle.timeline.display_mode.original';
            else key = 'subtitle.timeline.display_mode.translated';
            
            btn.title = window.i18n.t(key);
        }
        this.render(); // 重新渲染字幕块
    }

    /**
     * 切换预览/时间轴字幕显示模式
     */
    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    isEditingTarget(target) {
        return target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || !!target?.isContentEditable;
    }

    toggleDisplayMode() {
        this.displayMode = window.SubtitleDisplayMode?.cycle
            ? window.SubtitleDisplayMode.cycle(this.displayMode)
            : (this.displayMode === 'translated' ? 'bilingual' : (this.displayMode === 'bilingual' ? 'original' : 'translated'));

        this.updateToggleUI();
        this.flow.updateSubtitlePreview?.();
        
        let msg = '';
        if (this.displayMode === 'bilingual') msg = window.i18n.t('subtitle.editor.status_bilingual');
        else if (this.displayMode === 'original') msg = window.i18n.t('subtitle.editor.status_original');
        else msg = window.i18n.t('subtitle.editor.status_translated');
        window.app?.showToast?.(msg, 'info');
    }

    init(containerId = 'subtitle-timeline-container') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[SubtitleTimeline] Container not found:', containerId);
            return;
        }

        this.rulerCanvas = document.getElementById('subtitle-timeline-ruler-canvas');
        this.waveformCanvas = document.getElementById('subtitle-timeline-waveform-canvas');
        this.tracksList = document.getElementById('subtitle-timeline-tracks-list');
        this.playhead = document.getElementById('subtitle-timeline-playhead');
        this.ctx = this.rulerCanvas?.getContext('2d');
        this.waveformCtx = this.waveformCanvas?.getContext('2d');

        this.bindEvents();
        this.initTimeEditing();
        this.handleResize();
        
        // 监听语言变更
        window.addEventListener('languageChanged', () => {
            this.updateToggleUI();
        });

        this.updateToggleUI();
    }

    bindEvents() {
        window.addEventListener('resize', () => this.handleResize());

        // 刻度/波形点击与拖拽跳转
        const body = this.container.querySelector('.timeline-body');
        body?.addEventListener('mousedown', (e) => {
            if (this.closest(e.target, '.timeline-clip')) return;
            if (this.closest(e.target, '.timeline-header')) return; // 排除 header (用于高度调整)
            if (this.closest(e.target, '.timeline-track-headers') || this.closest(e.target, '.track-header-item')) return;

            const clickedTracksViewport = this.closest(e.target, '.tracks-viewport') || this.closest(e.target, '.timeline-tracks-list');
            if (clickedTracksViewport) {
                const targetRow = this.closest(e.target, '.timeline-track-row') || this.clipsManager?.findTargetRowAt?.(e.clientY);
                if (targetRow) {
                    this.startClipRangeSelection(e, targetRow);
                }
                return;
            }

            this.isScrubbing = true;
            this.handleSeek(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isClipRangeSelecting) {
                this.updateClipRangeSelection(e);
                return;
            }
            if (this.isScrubbing) this.handleSeek(e);
        });

        window.addEventListener('mouseup', () => {
            if (this.isClipRangeSelecting) {
                this.finishClipRangeSelection();
                return;
            }

            if (this.isScrubbing) {
                this.isScrubbing = false;
                
                // --- 核心优化：最终对齐 ---
                if (this.flow.video) {
                    if (this._seekRafId) cancelAnimationFrame(this._seekRafId);
                    const finalTime = this.resolvePlayableTime(this.currentTime);
                    this.updateTime(finalTime);
                    this.flow.video.currentTime = finalTime;
                    this.flow.updateSubtitlePreview();
                }
                
                this.syncPlayhead();
            }
        });

        // 播放控制按钮
        document.getElementById('btn-play-pause')?.addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-stop')?.addEventListener('click', () => this.stopPlayback());

        // 全局快捷键 (仅在当前页面为 subtitle 时响应)
        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'subtitle') return;
            const isInput = this.isEditingTarget(e.target);

            // 只在字幕编辑页面拦截，且避开输入框
            if (e.code === 'Space' && !isInput) {
                e.preventDefault();
                this.togglePlay();
            }

            // --- 核心新增：S 键剪断逻辑 (Split at playhead) ---
            if (e.key.toLowerCase() === 's' && !isInput) {
                e.preventDefault();
                this.flow.editor?.actionHandler?.splitAtPlayhead();
            }

            // [NEW] 方向键精准位移控制 (精准对齐字幕支持)
            if (!isInput) {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    // 基础步长 0.1s，按住 Shift 为 1.0s
                    const step = e.shiftKey ? 1.0 : 0.1;
                    const delta = e.key === 'ArrowRight' ? step : -step;
                    
                    const displayTime = this.getDisplayTime(this.currentTime);
                    const requestedTime = Math.max(0, Math.min(this.getDisplayDuration(), displayTime + delta));
                    const newTime = this.resolveDisplayTimeToSourceTime(requestedTime);
                    if (newTime !== this.currentTime) {
                        if (this.flow.video) {
                            this.flow.video.currentTime = newTime;
                            // 如果是暂停状态，需要更新 UI 显示
                            if (this.flow.video.paused) {
                                this.flow.updateSubtitlePreview();
                                this.updateTime(newTime);
                            }
                        }
                    }
                }
            }
        });

        // 缩放控制
        document.getElementById('subtitle-timeline-zoom')?.addEventListener('input', (e) => {
            this.setZoom(parseInt(e.target.value));
        });
        document.getElementById('subtitle-btn-timeline-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoomLevel + 20));
        document.getElementById('subtitle-btn-timeline-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoomLevel - 20));

        // 切换显示内容
        document.getElementById('btn-toggle-timeline-content')?.addEventListener('click', () => this.toggleDisplayMode());

        // 快捷键增强 (Ctrl+T) (仅在当前页面为 subtitle 时响应)
        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'subtitle') return;
            if (this.isEditingTarget(e.target)) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
                e.preventDefault();
                this.toggleDisplayMode();
            }
        });

        // 纵轴滚动同步
        const viewport = this.tracksList?.parentElement;
        viewport?.addEventListener('scroll', () => {
            this.syncPlayhead();
            this.renderer.drawRuler();
            this.renderer.drawWaveform();
            
            // --- 鲁棒性：触发虚拟化渲染更新 ---
            this.requestViewportRender(); 
        });

        // --- 核心增强：全区域滚轮同步滚动 ---
        // 允许用户在标尺和波形区域滚动，联动 tracks-viewport。
        // 同时恢复 Ctrl/Cmd + 滚轮缩放时间轴，避免被横向滚动逻辑覆盖。
        this.container.addEventListener('wheel', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
                if (Math.abs(delta) >= 0.5) {
                    const nextZoom = this.zoomLevel + (delta < 0 ? 20 : -20);
                    this.setZoom(nextZoom);
                    e.preventDefault();
                }
                return;
            }

            if (e.altKey) return;

            // 向上/向下滚轮 -> 转换为左右滑动 (如果 Shift 没按，通常垂直滚轮转水平滑动手感更好)
            const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
            if (viewport) {
                viewport.scrollLeft += delta;
                e.preventDefault();
            }
        }, { passive: false });
    }

    startClipRangeSelection(e, row) {
        if (e.button !== 0 || !row) return;

        const trackId = Number.parseInt(row.dataset.trackId, 10);
        if (Number.isNaN(trackId)) return;

        this.isClipRangeSelecting = true;
        this.clipRangeTrackId = trackId;
        this.clipRangeRow = row;
        this.clipRangeAdditive = !!(e.ctrlKey || e.metaKey);
        this.clipRangeStartX = this.getTrackRowContentX(e, row);
        this.clipRangeEndX = this.clipRangeStartX;

        this.showClipSelectionMarquee(row, this.clipRangeStartX, this.clipRangeEndX);
        this.clipsManager?.selectRangeByPixels?.(trackId, this.clipRangeStartX, this.clipRangeEndX, {
            renderList: false,
            preserveExisting: this.clipRangeAdditive
        });
        e.preventDefault();
    }

    updateClipRangeSelection(e) {
        if (!this.isClipRangeSelecting || !this.clipRangeRow) return;

        this.clipRangeEndX = this.getTrackRowContentX(e, this.clipRangeRow);
        this.showClipSelectionMarquee(this.clipRangeRow, this.clipRangeStartX, this.clipRangeEndX);
        this.clipsManager?.selectRangeByPixels?.(this.clipRangeTrackId, this.clipRangeStartX, this.clipRangeEndX, {
            renderList: false,
            preserveExisting: this.clipRangeAdditive
        });
    }

    finishClipRangeSelection() {
        if (!this.isClipRangeSelecting) return;

        const trackId = this.clipRangeTrackId;
        const startX = this.clipRangeStartX;
        const endX = this.clipRangeEndX;
        const preserveExisting = this.clipRangeAdditive;

        this.isClipRangeSelecting = false;
        this.clipRangeTrackId = null;
        this.clipRangeRow = null;
        this.clipRangeAdditive = false;
        this.hideClipSelectionMarquee();

        this.clipsManager?.selectRangeByPixels?.(trackId, startX, endX, {
            renderList: true,
            preserveExisting
        });
    }

    getTrackRowContentX(e, row) {
        const viewport = this.tracksList?.parentElement;
        const scrollLeft = viewport?.scrollLeft || 0;
        const viewportRect = viewport?.getBoundingClientRect?.();
        const trackHeaders = viewport?.querySelector('.timeline-track-headers');
        const sidebarWidth = trackHeaders?.offsetWidth || 130;
        const viewportLeft = viewportRect?.left || 0;
        const visibleX = e.clientX - viewportLeft - sidebarWidth;
        const maxWidth = row.scrollWidth || row.clientWidth || 0;
        return Math.max(0, Math.min(maxWidth, visibleX + scrollLeft));
    }

    showClipSelectionMarquee(row, startX, endX) {
        if (!row) return;
        if (!this.clipSelectionMarquee) {
            this.clipSelectionMarquee = document.createElement('div');
            this.clipSelectionMarquee.className = 'timeline-selection-marquee';
        }

        if (this.clipSelectionMarquee.parentElement !== row) {
            this.clipSelectionMarquee.remove();
            row.appendChild(this.clipSelectionMarquee);
        }

        const left = Math.min(startX, endX);
        const width = Math.max(2, Math.abs(endX - startX));
        this.clipSelectionMarquee.style.left = `${left}px`;
        this.clipSelectionMarquee.style.width = `${width}px`;
        this.clipSelectionMarquee.style.display = 'block';
    }

    hideClipSelectionMarquee() {
        if (this.clipSelectionMarquee) {
            this.clipSelectionMarquee.style.display = 'none';
        }
    }

    togglePlay() {
        const video = this.flow.video;
        if (!video || !video.currentSrc) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.noFile'), 'warning');
            return;
        }

        if (video.paused) {
            const startTime = this.resolvePlayableTime(video.currentTime);
            if (Math.abs(startTime - video.currentTime) > 0.02) {
                video.currentTime = startTime;
                this.updateTime(startTime);
            }

            // --- 重要修复：video.play() 是异步 Promise，调用后 video.paused 仍为 true，
            //     不能在此处立即检查 video.paused 来决定是否播放音频！
            //     必须等 Promise 成功后才 syncPlayback(true)。
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // 视频确实开始播放了，现在同步音频
                    console.log('[SubtitleTimeline] Video play() resolved, syncing audio...');
                    this.flow.audioManager?.syncPlayback(true);
                }).catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error('[SubtitleTimeline] Play failed:', error);
                    }
                });
            } else {
                // 极少数情况：play() 没有返回 Promise（某些浏览器），直接同步
                this.flow.audioManager?.syncPlayback(true);
            }
        } else {
            // 暂停：直接同步（同步操作，无需等待）
            video.pause();
            this.flow.audioManager?.syncPlayback(false);
        }
        
        this.updatePlayPauseIcon();
    }

    stopPlayback() {
        const video = this.flow.video;
        if (!video) return;
        video.pause();
        const resetTime = this.resolvePlayableTime(0);
        video.currentTime = resetTime;
        
        // --- 核心优化：停止所有音频 ---
        this.flow.audioManager?.stopAll();

        this.updateTime(resetTime);
        this.flow.updateSubtitlePreview?.();
        
        this.updatePlayPauseIcon();
    }

    updatePlayPauseIcon() {
        const btn = document.getElementById('btn-play-pause');
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (!icon) return;
        const isPaused = this.flow.video?.paused ?? true;
        icon.className = isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
    }

    resolvePlayableTime(time) {
        const numericTime = Number(time || 0);
        const safeTime = Number.isFinite(numericTime) ? numericTime : 0;
        const boundedTime = Math.max(0, Math.min(this.duration || 0, safeTime));
        const playableTime = this.flow.getPlayableSourceTime?.(boundedTime);
        return Number.isFinite(playableTime)
            ? Math.max(0, Math.min(this.duration || playableTime, playableTime))
            : boundedTime;
    }

    getDisplayDuration() {
        const displayDuration = this.flow.getSourceTimelineDuration?.();
        return Number.isFinite(displayDuration) && displayDuration > 0
            ? displayDuration
            : this.duration;
    }

    getDisplayTime(sourceTime = this.currentTime) {
        const displayTime = this.flow.sourceTimeToTimelineTime?.(sourceTime);
        return Number.isFinite(displayTime)
            ? Math.max(0, Math.min(this.getDisplayDuration() || displayTime, displayTime))
            : sourceTime;
    }

    resolveDisplayTimeToSourceTime(displayTime) {
        const numericTime = Number(displayTime || 0);
        const boundedDisplayTime = Math.max(
            0,
            Math.min(this.getDisplayDuration() || 0, Number.isFinite(numericTime) ? numericTime : 0)
        );
        const sourceTime = this.flow.timelineTimeToSourceTime?.(boundedDisplayTime);
        return this.resolvePlayableTime(Number.isFinite(sourceTime) ? sourceTime : boundedDisplayTime);
    }

    handleSeek(e) {
        const body = this.container.querySelector('.timeline-body');
        const rect = body.getBoundingClientRect();
        const scrollLeft = this.tracksList?.parentElement?.scrollLeft || 0;

        // 核心修复：扣除左侧轨道标头宽度 (130px)
        const sidebarWidth = 130;
        const x = e.clientX - rect.left - sidebarWidth + scrollLeft;

        const requestedTime = Math.max(0, Math.min(this.getDisplayDuration(), x / this.pxPerSec));
        const time = this.resolveDisplayTimeToSourceTime(requestedTime);

        // --- 核心优化：渲染逻辑分离 ---
        
        // 1. 同步绘制 (UI 响应最快)
        this.updateTime(time);
        
        if (this.flow.video) {
            // 2. 视频帧跳转 (节流执行)
            if (this._seekRafId) cancelAnimationFrame(this._seekRafId);
            this._seekRafId = requestAnimationFrame(() => {
                this.flow.video.currentTime = time;
                if (this.flow.video.paused) {
                    this.flow.updateSubtitlePreview();
                }
                this._seekRafId = null;
            });
        }
    }

    handleResize() {
        if (!this.container) return;
        this.renderer.drawRuler();
        this.renderer.drawWaveform();
        this.syncPlayhead();
    }

    setZoom(level) {
        this.zoomLevel = Math.max(2, Math.min(1000, level));
        this.pxPerSec = this.zoomLevel;
        const zoomInput = document.getElementById('subtitle-timeline-zoom');
        if (zoomInput) zoomInput.value = this.zoomLevel;

        this.render();
        this.renderer.drawRuler();
        this.renderer.drawWaveform();
        this.syncPlayhead();
    }

    updateTime(time) {
        this.currentTime = time;
        const display = document.getElementById('subtitle-timeline-current-time');
        if (display) display.textContent = this.formatTime(this.getDisplayTime(time));
        this.syncPlayhead();

        // --- 核心优化：自动追随播放头 ---
        const isPlaying = this.flow.video && !this.flow.video.paused;
        
        // --- 核心增强：实时同步音轨时间 ---
        if (isPlaying) {
            this.flow.audioManager?.syncTime(time);
        }

        if (!this.isScrubbing && isPlaying) {
            this.autoScrollToTime(time);
        }
    }

    /**
     * 自动调整视口滚动位置，保持播放头可见
     */
    autoScrollToTime(time) {
        const viewport = this.tracksList?.parentElement;
        if (!viewport) return;

        const sidebarWidth = 130; // 轨道标头宽度
        const x = (this.getDisplayTime(time) * this.pxPerSec);
        const scrollLeft = viewport.scrollLeft;
        const viewportWidth = viewport.clientWidth - sidebarWidth;

        if (viewportWidth <= 0) return;

        // 安全视口范围 (设定为 view 的 10% 到 95% 区域)
        const leftBuffer = viewportWidth * 0.1;
        const rightBuffer = viewportWidth * 0.95;

        // x 是绝对坐标。在 viewport 中的相对可见坐标是 x - scrollLeft
        const relativeX = x - scrollLeft;

        if (relativeX > rightBuffer || relativeX < leftBuffer) {
            // 自动跳转：将播放头放在视口左侧 15% 的位置，尽可能保留后续视野
            const targetScroll = Math.max(0, x - (viewportWidth * 0.15));

            // 只有当目标位置偏移较大时才执行，减少微小跳动
            if (Math.abs(viewport.scrollLeft - targetScroll) > 1) {
                viewport.scrollLeft = targetScroll;
                // 手动触发一次同步，确保 Canvas 立即更新
                this.syncPlayhead();
                this.renderer.drawRuler();
                this.renderer.drawWaveform();
            }
        }
    }

    /**
     * 弹出轨道偏移对话框
     */
    async promptTrackShift(trackId) {
        const track = this.flow.trackManager?.tracks.find(t => t.id === trackId);
        if (!track || track.locked) return;

        const val = await window.app?.showPrompt(
            window.i18n.t('subtitle.messages.track_shift_title', { name: track.name }),
            window.i18n.t('subtitle.messages.track_shift_prompt'),
            '0.0'
        );

        if (val !== null && val !== undefined) {
            const offset = parseFloat(val);
            if (!isNaN(offset) && Math.abs(offset) > 0.001) {
                this.flow.trackManager.shiftTrack(trackId, offset);
            }
        }
    }

    syncPlayhead() {
        if (!this.playhead || !this.tracksList?.parentElement) return;
        const scrollLeft = this.tracksList.parentElement.scrollLeft;
        const x = (this.getDisplayTime(this.currentTime) * this.pxPerSec) - scrollLeft;
        this.playhead.style.transform = `translateX(${x}px)`;
    }

    requestViewportRender() {
        if (this._viewportRenderRaf) return;

        const requestFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : (callback) => setTimeout(callback, 16);

        this._viewportRenderRaf = requestFrame(() => {
            this._viewportRenderRaf = null;
            this.render();
        });
    }

    setDuration(duration) {
        this.duration = duration;
        if (this.tracksList) {
            this.tracksList.style.width = `${this.getDisplayDuration() * this.pxPerSec}px`;
        }
        this.renderer.drawRuler();
    }

    async loadWaveform(dataOrPath) {
        const token = (this._waveformLoadToken = (this._waveformLoadToken || 0) + 1);
        if (Array.isArray(dataOrPath)) {
            this.peaks = dataOrPath;
        } else if (typeof dataOrPath === 'string') {
            const peaks = await this.waveLoader.getPeaks(dataOrPath);
            // Ignore stale async results after clearMedia / new load
            if (token !== this._waveformLoadToken) return;
            if (peaks) this.peaks = peaks;
        }
        if (token !== this._waveformLoadToken) return;
        this.renderer.drawWaveform();
    }

    /** Unload peaks + blank canvas (used when clearing media) */
    clearWaveform() {
        this._waveformLoadToken = (this._waveformLoadToken || 0) + 1;
        this.peaks = null;
        this.duration = 0;
        try {
            this.waveLoader?.clearCache?.();
        } catch (_) { /* optional */ }

        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        if (canvas && ctx) {
            const dpr = window.devicePixelRatio || 1;
            const parent = canvas.parentElement;
            const dw = parent?.clientWidth || canvas.clientWidth || 0;
            const dh = parent?.clientHeight || canvas.clientHeight || 0;
            if (dw > 0 && dh > 0) {
                canvas.width = dw * dpr;
                canvas.height = dh * dpr;
                canvas.style.width = `${dw}px`;
                canvas.style.height = `${dh}px`;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            } else {
                ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
            }
        }

        // Remove source-segment waveform overlays if any
        document.querySelectorAll('.source-waveform-segments').forEach((el) => el.remove());

        this.renderer?.drawRuler?.();
        this.renderer?.drawWaveform?.();
        this.render?.([]);
        this.updateTime?.(0);
    }

    /**
     * 渲染时间轴上的字幕块
     * subtitles: 可选，默认使用编辑器中的数据
     */
    render(subtitles) {
        const subs = subtitles || this.flow.editor?.subtitles || [];
        this.clipsManager.render(subs);
        if (this.tracksList) {
            this.tracksList.style.width = `${this.getDisplayDuration() * this.pxPerSec}px`;
        }
    }

    initTimeEditing() {
        const display = document.getElementById('subtitle-timeline-current-time');
        if (!display) return;
        display.style.cursor = 'pointer';
        display.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'time-edit-input';
            input.value = display.textContent;
            const finish = () => {
                const parsedTime = this.parseTime(input.value);
                const newTime = this.resolveDisplayTimeToSourceTime(parsedTime);
                if (!isNaN(parsedTime) && this.flow.video) {
                    this.flow.video.currentTime = newTime;
                    this.updateTime(newTime);
                    if (this.flow.video.paused) {
                        this.flow.updateSubtitlePreview?.();
                    }
                }
                input.remove();
                display.style.display = 'block';
            };
            input.onblur = finish;
            input.onkeydown = (e) => { if (e.key === 'Enter') finish(); };
            display.style.display = 'none';
            display.parentNode.insertBefore(input, display);
            input.focus(); input.select();
        });
    }

    parseTime(val) {
        const pts = val.split(':').map(parseFloat);
        if (pts.length === 3) return pts[0] * 3600 + pts[1] * 60 + pts[2];
        if (pts.length === 2) return pts[0] * 60 + pts[1];
        return parseFloat(val);
    }

    formatTime(sec) {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        const ms = Math.round((sec % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    formatTimeSimple(sec) {
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

window.SubtitleTimeline = SubtitleTimeline;
