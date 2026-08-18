/**
 * SubtitleAudioActionHandler.js
 * 专门负责音频轨道 (Audio Track) 的业务逻辑操作：
 * 包括片段试听、删除、切割等。
 */
class SubtitleAudioActionHandler {
    constructor(subtitleFlow) {
        this.flow = subtitleFlow;
    }

    translateOrFallback(key, fallback, params) {
        return window.SubtitleUtils?.translateOrFallback?.(key, fallback, params) ?? fallback;
    }

    resolveTrack(trackId = null) {
        const tracks = this.flow.trackManager?.tracks || [];
        const selectedTrackId = this.flow.timeline?.clipsManager?.selectedTrackId;

        return tracks.find((track) => track.id === trackId)
            || tracks.find((track) => track.id === selectedTrackId)
            || tracks.find((track) => track.id === this.flow.trackManager?.activeTrackId)
            || null;
    }

    getSelectedClipIndices(track) {
        if (!track || !Array.isArray(track.subtitles)) return [];

        const clipsManager = this.flow.timeline?.clipsManager;
        if (clipsManager?.selectedTrackId === track.id && clipsManager.selectedIndices?.size) {
            return Array.from(clipsManager.selectedIndices).sort((a, b) => a - b);
        }

        return track.subtitles.reduce((indices, clip, index) => {
            if (clip?.selected) indices.push(index);
            return indices;
        }, []);
    }

    clearTrackSelection(track) {
        if (!track || !Array.isArray(track.subtitles)) return;

        track.subtitles.forEach((clip) => {
            if (clip) clip.selected = false;
        });

        const clipsManager = this.flow.timeline?.clipsManager;
        if (clipsManager?.selectedTrackId === track.id) {
            clipsManager.selectedIndices.clear();
            clipsManager.selectedTrackId = null;
            clipsManager.lastSelectedIndex = null;
        }
    }

    async deleteSelectedClips(trackId = null) {
        const track = this.resolveTrack(trackId);
        if (!track || track.type !== 'audio' || track.locked) return false;

        const selectedIndices = this.getSelectedClipIndices(track);
        if (!selectedIndices.length) return false;

        this.flow.editor?.withTrackAsActive?.(track.id, () => this.flow.editor?.ensureHistoryBaseline?.());

        selectedIndices.sort((a, b) => b - a).forEach((index) => {
            track.subtitles.splice(index, 1);
        });

        this.clearTrackSelection(track);

        if (track.id === this.flow.trackManager?.activeTrackId) {
            if (this.flow.editor) {
                this.flow.editor.activeSubtitleIndex = -1;
                this.flow.editor.render?.(track.subtitles);
            }
        } else if (this.flow.timeline) {
            this.flow.timeline.render();
        }

        this.flow.audioManager?.syncTracks?.();
        this.flow.editor?.withTrackAsActive?.(track.id, () => this.flow.editor?.addToHistory?.());
        window.app?.showToast?.(this.translateOrFallback('subtitle.messages.audio_delete_success', 'Audio clip deleted'), 'success');
        return true;
    }

    /**
     * 试听特定的音频片段
     */
    previewClip(trackId, index) {
        const track = this.resolveTrack(trackId);
        if (!track || !track.subtitles[index]) return;

        const clip = track.subtitles[index];
        
        // 修正：直接播放已生成的本地音频片段，而不是调用 TTS 重新生成
        const path = clip.audioPath || track.ttsAudioPath;
        if (path) {
            const normalizedPath = this.flow.audioManager.normalizePath(path);
            console.log('[SubtitleAudioActionHandler] Previewing audio:', {
                original: path,
                normalized: normalizedPath,
                index: index
            });
            const audio = new Audio(normalizedPath);
            audio.currentTime = clip.audioStartOffset || clip.start || 0;
            audio.play().catch(e => {
                console.error('[SubtitleAudioActionHandler] Play error:', e);
                console.error('[SubtitleAudioActionHandler] Failed URL:', normalizedPath);
            });
            
            // 播放完当前片段的时长后停止
            const duration = (clip.audioEndOffset || clip.end) - (clip.audioStartOffset || clip.start);
            setTimeout(() => {
                audio.pause();
                audio.remove();
            }, duration * 1000 + 100);
        } else {
            window.app?.showToast?.('未找到配音文件', 'warning');
        }
    }

    /**
     * 删除音频片段
     */
    async deleteClip(trackId, index) {
        const track = this.resolveTrack(trackId);
        if (!track || track.locked) return;

        const confirmed = await window.app?.showConfirm(this.translateOrFallback(
            'subtitle.confirm.delete_audio_clip',
            'Are you sure you want to delete this audio clip?'
        ));
        if (confirmed) {
            this.flow.editor?.withTrackAsActive?.(track.id, () => this.flow.editor?.ensureHistoryBaseline?.());
            track.subtitles.splice(index, 1);
            this.clearTrackSelection(track);
            
            // 刷新 UI
            if (track.id === this.flow.trackManager?.activeTrackId) {
                if (this.flow.editor) {
                    this.flow.editor.activeSubtitleIndex = -1;
                    this.flow.editor.render?.(track.subtitles);
                }
            } else if (this.flow.timeline) {
                this.flow.timeline.render();
            }
            if (this.flow.audioManager) this.flow.audioManager.syncTracks();
            
            this.flow.editor?.withTrackAsActive?.(track.id, () => this.flow.editor?.addToHistory?.());
            window.app?.showToast?.(this.translateOrFallback('subtitle.messages.audio_delete_success', 'Audio clip deleted'), 'success');
        }
    }

    /**
     * 在播放头位置切割音频
     * 注：实际上 SubtitleEditorActionHandler 中已经有一个 splitAtPlayhead，
     * 但在物理分拆原则下，音频专有的切割参数调整可放在这里。
     * 目前由于 splitAtPlayhead 逻辑较重且包含 UI 提示，暂由主 Handler 统一调度，
     * 这里提供辅助支持。
     */
    splitAtPlayhead(trackId) {
        void trackId;
        // 直接复用主处理器的切割逻辑，它已经具备区分 track.type 的能力
        if (this.flow.editor?.handler) {
            this.flow.editor.handler.splitAtPlayhead();
        }
    }
}

window.SubtitleAudioActionHandler = SubtitleAudioActionHandler;
