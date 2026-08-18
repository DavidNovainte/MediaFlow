/**
 * SubtitleAudioManager.js
 * 负责音频轨道的音频播放与视频同步
 */
class SubtitleAudioManager {
    constructor(flow) {
        this.flow = flow;
        this.audioPool = new Map(); // trackId -> HTMLAudioElement
        this.isDucking = false;
        this.originalVideoVolume = null;
    }

    /**
     * 同步音轨标签，确保每个带有文件的音频轨道都有对应的 Audio 元素
     */
    syncTracks() {
        const tracks = this.flow.trackManager?.tracks || [];
        // 核心修改：即使不可见的音轨也保留在 Pool 中，但在 syncTime 中控制播放。这样可以防止频繁创建/卸载导致的加载延迟。
        const audioTracks = tracks.filter(t => t.type === 'audio' && (t.ttsAudioPath || t.subtitles?.some(s => s.audioPath)));

        // 1. 清理已删除或不可见的轨道
        const activeTrackIds = new Set(audioTracks.map(t => t.id));
        for (const [trackId, audio] of this.audioPool.entries()) {
            if (!activeTrackIds.has(trackId)) {
                audio.pause();
                audio.src = '';
                this.audioPool.delete(trackId);
                console.log(`[AudioManager] Track ${trackId} removed from pool`);
            }
        }

        // 2. 添加或更新新轨道
        audioTracks.forEach(track => {
            let audio = this.audioPool.get(track.id);
            if (!audio) {
                audio = new Audio();
                audio.preload = 'auto';
                audio.onerror = (e) => {
                    console.error(`[AudioManager] Audio loading error for track ${track.id}:`, audio.error || e);
                };
                this.audioPool.set(track.id, audio);
                console.log(`[AudioManager] Track ${track.id} added to pool`);
            }

            // 同步路径 (防止路径变更)
            const normalizedPath = this.normalizePath(track.ttsAudioPath);
            // 使用 _trackedSrc 自定义属性比较，而非 audio.src（浏览器会展开为完整 URL，导致每次都误判为不同）
            if ((audio._trackedSrc || '') !== normalizedPath && normalizedPath) {
                console.log(`[AudioManager] Loading normalized src: ${normalizedPath}`);
                audio._trackedSrc = normalizedPath;
                audio.src = normalizedPath;
                audio.load(); // 强制重新加载
            }
            
            // 同步独立音量
            const voiceVolElem = document.getElementById('voice-volume');
            const vol = voiceVolElem ? (parseFloat(voiceVolElem.value) / 100) : 1.0;
            const finalVol = isNaN(vol) ? 1.0 : Math.max(0, Math.min(1, vol));
            if (audio.volume !== finalVol) audio.volume = finalVol;
        });
    }

    /**
     * 同步播放状态
     */
    syncPlayback(isPlaying) {
        if (isPlaying) {
            // 恢复播放时只同步当前时间命中的片段，避免一次性唤醒整个音频池造成卡顿。
            const currentTime = Number(this.flow.video?.currentTime || 0);
            this.syncTime(Number.isFinite(currentTime) ? currentTime : 0);
            return;
        }

        this.audioPool.forEach(audio => {
            audio.pause();
        });
    }

    /**
     * 同步时间戳 (高频调用)
     * 扩展功能：实时音频避让 (Auto Ducking) & 动态源切换 (Real-time Sync)
     */
    syncTime(currentTime) {
        let hasActiveClip = false;
        const isVideoPaused = this.flow.video?.paused;
        const hasVisibleAudioTracks = this.hasVisibleAudioTracks();

        this.audioPool.forEach((audio, trackId) => {
            const track = this.flow.trackManager?.tracks.find(t => t.id === trackId);
            if (!track || !track.subtitles || track.subtitles.length === 0) return;

            // 1. 查找当前时间轴位置对应的剪辑 (Clip)
            const activeClip = track.subtitles.find(sub => currentTime >= sub.start && currentTime <= sub.end);
            
            if (activeClip) {
                if (track.visible !== false) hasActiveClip = true;

                // 2. 动态源切换 (支持实时同步生成的离散文件)
                const targetPath = this.normalizePath(activeClip.audioPath || track.ttsAudioPath);
                
                // 重要修复：audio.src 读出来的是浏览器展开的完整 URL，而 targetPath 是我们设置的
                // media-file:/// 格式，两者永远不相等，导致每帧都重新 load() 音源！
                // 因此改用 _trackedSrc 自定义属性来记录我们实际设置过的路径。
                const currentSrc = audio._trackedSrc || '';
                
                // 判断是否需要切换物理文件源
                if (currentSrc !== targetPath && targetPath) {
                    console.log(`[AudioManager] Switching source for track ${trackId}: ${targetPath}`);
                    audio._trackedSrc = targetPath;
                    audio.src = targetPath;
                    // 切换源后需要重新从剪辑的相对位移处起步
                    audio.currentTime = Math.max(0, currentTime - activeClip.start + (activeClip.audioStartOffset || 0));
                    if (!isVideoPaused && track.visible !== false) audio.play().catch(() => {});
                } else {
                    // 3. 精准同步 (同一文件内的位移校准)
                    const expectedAudioTime = (currentTime - activeClip.start) + (activeClip.audioStartOffset || 0);
                    if (Math.abs(audio.currentTime - expectedAudioTime) > 0.15) {
                        audio.currentTime = expectedAudioTime;
                    }

                    // 4. 播放状态跟随
                    if (!isVideoPaused && audio.paused && track.visible !== false) {
                        audio.play().catch(e => {
                            console.error('[AudioManager] Play failed during syncTime:', e.name, e.message);
                        });
                    }
                }
            } else {
                // 5. 不在剪辑范围内则暂停
                if (!audio.paused) audio.pause();
            }

            // 如果视频暂停，音频也必须停止
            if (isVideoPaused && !audio.paused) audio.pause();
        });

        // 6. 执行音量避让逻辑
        this.handleAutoDucking(hasActiveClip, hasVisibleAudioTracks);
    }

    hasVisibleAudioTracks() {
        const tracks = this.flow.trackManager?.tracks || [];
        return tracks.some((track) => (
            track?.type === 'audio'
            && track.visible !== false
            && (track.ttsAudioPath || track.subtitles?.some((segment) => segment?.audioPath))
        ));
    }

    /**
     * 平滑处理视频音量避让
     */
    handleAutoDucking(shouldDuck, hasVisibleAudioTracks = this.hasVisibleAudioTracks()) {
        const video = this.flow.video;
        if (!video) return;
        if (!Number.isFinite(this.originalVideoVolume)) {
            this.originalVideoVolume = video.volume;
        }

        // 获取用户设置的避让后背景音量（0.0 - 1.0）
        const settings = this.flow.ttsHandler?.getSettings();
        const modeSelect = document.getElementById('audio-mode');
        const audioMode = modeSelect ? modeSelect.value : (settings?.audioMode || 'keep');

        if (!hasVisibleAudioTracks) {
            this.isDucking = false;
            const restoreVol = Number.isFinite(this.originalVideoVolume) ? this.originalVideoVolume : 1;
            if (Math.abs(video.volume - restoreVol) > 0.001) {
                this.fadeVolume(video, restoreVol, 120);
            }
            return;
        }
        
        let duckingLevel;
        if (audioMode === 'remove') {
            duckingLevel = 0; // 完全移除时，原音强制为 0
        } else {
            duckingLevel = (settings?.bgmVolume || 30) / 100;
        }

        if (shouldDuck && !this.isDucking) {
            // 进入避让/静音
            this.isDucking = true;
            this.originalVideoVolume = video.volume;
            this.fadeVolume(video, duckingLevel, 150);
        } else if (!shouldDuck && this.isDucking) {
            // 结束避让：恢复背景音
            this.isDucking = false;
            // 预览阶段只在当前配音片段命中时压低/静音原声，片段结束后恢复原视频音量。
            // 最终导出仍由导出链路决定是否彻底移除原声。
            const restoreVol = this.originalVideoVolume;
            this.fadeVolume(video, restoreVol, 200);
        }

        if (audioMode === 'keep' && !this.isDucking && video.volume === 0 && this.originalVideoVolume > 0) {
            video.volume = this.originalVideoVolume; // 恢复
        }
    }

    /**
     * 音量平滑过渡 (Fade)
     */
    fadeVolume(element, targetVolume, duration) {
        if (this.duckingTimer) clearInterval(this.duckingTimer);
        
        const startVolume = element.volume;
        const startTime = Date.now();
        
        this.duckingTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            // 使用简化的线性过渡
            element.volume = startVolume + (targetVolume - startVolume) * progress;
            
            if (progress >= 1) {
                clearInterval(this.duckingTimer);
                this.duckingTimer = null;
            }
        }, 16); // 约 60fps
    }

    /**
     * 停止所有播放并重置
     */
    stopAll() {
        this.audioPool.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        if (this.flow.video && Number.isFinite(this.originalVideoVolume)) {
            this.isDucking = false;
            this.flow.video.volume = this.originalVideoVolume;
        }
    }

    normalizePath(filePath) {
        if (!filePath) return '';
        if (filePath.startsWith('http') || filePath.startsWith('blob:') || filePath.startsWith('media-file:')) return filePath;
        if (window.urlUtils?.pathToMediaUrl) return window.urlUtils.pathToMediaUrl(filePath);
        
        let normalized = filePath.replace(/\\/g, '/');
        
        // Windows 路径处理：确保以 media-file:/// 开头，且只编码非盘符部分，以支持中文和空格，但不破坏盘符。
        if (/^[a-zA-Z]:/.test(normalized)) {
            // encodeURI 将处理中文和空格，但不会编码斜杠 /
            return `media-file:///${normalized}`;
        }
        
        // 相对路径或已处理过的路径保持原样
        return normalized;
    }
}

window.SubtitleAudioManager = SubtitleAudioManager;
