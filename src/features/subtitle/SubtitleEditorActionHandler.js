/**
 * SubtitleEditorActionHandler.js
 * 负责字幕编辑器的具体业务操作 (增删改、AI 处理、TTS、文件导入)
 */
class SubtitleEditorActionHandler {
    constructor(editor) {
        this.editor = editor;
        this.flow = editor.flow;
        this.segmentPlaybackCleanup = null;
    }

    translateOrFallback(key, fallback, params) {
        return window.SubtitleUtils?.translateOrFallback?.(key, fallback, params) ?? fallback;
    }

    getRetranslateTargetLang(sub) {
        return sub?.translationTargetLang
            || this.flow.targetLanguage?.value
            || this.flow.preferenceManager?.preferences?.targetLanguage
            || 'zh-Hans';
    }

    isLocked(index) {
        return this.editor?.isSubtitleLocked?.(index);
    }

    resolveClipActionTrack() {
        const flow = this.flow || {};
        const clipsManager = flow.timeline?.clipsManager;
        const tracks = flow.trackManager?.tracks || [];
        const selectedTrackId = clipsManager?.selectedTrackId;

        return clipsManager?.getTrackById?.(selectedTrackId)
            || tracks.find((track) => track.id === selectedTrackId)
            || tracks.find((track) => track.id === flow.trackManager?.activeTrackId)
            || null;
    }

    getTrackSelectedIndices(track, { includeActiveFallback = false, editableOnly = false } = {}) {
        if (!track || !Array.isArray(track.subtitles)) return [];

        if (track.type === 'source') {
            return this.flow.getSelectedSourceSegmentIndices?.() || [];
        }

        const indices = [];
        track.subtitles.forEach((sub, index) => {
            if (!sub?.selected) return;
            if (editableOnly && (track.locked || sub.locked)) return;
            indices.push(index);
        });

        if (!indices.length && includeActiveFallback && track.id === this.flow.trackManager?.activeTrackId && this.editor.activeSubtitleIndex !== -1) {
            const activeSub = track.subtitles[this.editor.activeSubtitleIndex];
            if (activeSub && (!editableOnly || (!track.locked && !activeSub.locked))) {
                indices.push(this.editor.activeSubtitleIndex);
            }
        }

        return indices;
    }

    clearTrackSelection(track) {
        if (!track || !Array.isArray(track.subtitles)) return;

        if (track.type === 'source') {
            this.flow.setSourceSelection?.([], { render: false });
            return;
        }

        track.subtitles.forEach((sub) => {
            if (sub) sub.selected = false;
        });

        const clipsManager = this.flow.timeline?.clipsManager;
        if (clipsManager?.selectedTrackId === track.id) {
            clipsManager.selectedIndices.clear();
            clipsManager.selectedTrackId = null;
            clipsManager.lastSelectedIndex = null;
        }
    }

    getSplitUnavailableMessage() {
        return this.translateOrFallback(
            'subtitle.toast.no_clip_at_playhead',
            'No subtitle, dubbing, or source-media segment to split at the playhead.'
        );
    }

    hasExplicitTimelineClipSelection() {
        const clipsManager = this.flow?.timeline?.clipsManager;
        return clipsManager?.selectedTrackId !== null
            && clipsManager?.selectedTrackId !== undefined
            && clipsManager?.selectedIndices?.size > 0;
    }

    canSplitSourceSegmentAt(time) {
        if (typeof this.flow?.splitSourceSegmentAt !== 'function') return false;
        const sourceTrack = this.flow.getSourceTrackData?.();
        const segments = Array.isArray(sourceTrack?.subtitles)
            ? sourceTrack.subtitles
            : (Array.isArray(this.flow.sourceSegments) ? this.flow.sourceSegments : []);
        const currentTime = Number(time);
        if (!Number.isFinite(currentTime)) return false;

        return segments.some((segment) => currentTime > (Number(segment?.start) || 0) + 0.05
            && currentTime < (Number(segment?.end) || 0) - 0.05);
    }

    findClipIndexAt(track, time) {
        if (!track || !Array.isArray(track.subtitles)) return -1;
        const currentTime = Number(time);
        if (!Number.isFinite(currentTime)) return -1;

        return track.subtitles.findIndex((clip) => {
            if (!clip || clip.locked) return false;
            const start = Number(clip.start || 0);
            const end = Number(clip.end || start);
            return currentTime > start && currentTime < end;
        });
    }

    splitAudioClipAt(track, index, time) {
        if (!track || track.type !== 'audio' || !Array.isArray(track.subtitles)) return null;
        const sub = track.subtitles[index];
        if (!sub || sub.locked) return null;

        const currentTime = Number(time);
        const start = Number(sub.start || 0);
        const end = Number(sub.end || start);
        if (!Number.isFinite(currentTime) || currentTime <= start || currentTime >= end) return null;

        const baseAudioStart = Number.isFinite(Number(sub.audioStartOffset))
            ? Number(sub.audioStartOffset)
            : start;
        const baseAudioEnd = Number.isFinite(Number(sub.audioEndOffset))
            ? Number(sub.audioEndOffset)
            : baseAudioStart + Math.max(0, end - start);
        const splitAudioPoint = baseAudioStart + (currentTime - start);

        const newClip = JSON.parse(JSON.stringify(sub));
        newClip.id = Date.now() + Math.random();
        newClip.start = currentTime;
        newClip.end = end;
        newClip.audioStartOffset = splitAudioPoint;
        newClip.audioEndOffset = baseAudioEnd;
        newClip.selected = false;

        sub.end = currentTime;
        sub.audioEndOffset = splitAudioPoint;

        track.subtitles.splice(index + 1, 0, newClip);
        return newClip;
    }

    splitLinkedAudioTracksAt(time) {
        const tracks = this.flow?.trackManager?.tracks || [];
        let splitCount = 0;

        tracks.forEach((track) => {
            if (track?.type !== 'audio' || track.locked) return;
            const index = this.findClipIndexAt(track, time);
            if (index === -1) return;
            if (this.splitAudioClipAt(track, index, time)) {
                splitCount += 1;
            }
        });

        return splitCount;
    }

    splitSourceSegmentAtPlayhead(time) {
        const result = this.flow.splitSourceSegmentAt?.(time);
        if (!result) return false;

        const linkedAudioSplitCount = this.splitLinkedAudioTracksAt(time);
        if (linkedAudioSplitCount > 0) {
            this.flow.timeline?.render?.();
        }

        window.app?.showToast?.(
            this.translateOrFallback(
                'subtitle.toast.source_segment_split_success',
                `Source media split at ${time.toFixed(2)}s.`
            ),
            'success'
        );
        return true;
    }

    /**
     * 删除字幕
     */
    async deleteSubtitle(index) {
        if (this.isLocked(index)) return;
        this.editor.ensureHistoryBaseline();
        this.editor.subtitles.splice(index, 1);

        // 修正索引偏移
        if (this.editor.activeSubtitleIndex === index) {
            this.editor.activeSubtitleIndex = -1;
        } else if (this.editor.activeSubtitleIndex > index) {
            this.editor.activeSubtitleIndex--;
        }

        this.editor.render();
        this.editor.addToHistory();
    }

    /**
     * 批量删除选中的字幕或当前激活的字幕
     */
    async deleteSubtitles() {
        const targetTrack = this.resolveClipActionTrack();
        if (!targetTrack || targetTrack.locked) return;

        if (targetTrack.type === 'source') {
            const result = this.flow.deleteSelectedSourceSegments?.() || { deletedCount: 0, preventedAll: false };

            if (result.preventedAll) {
                window.app?.showToast?.(
                    this.translateOrFallback(
                        'subtitle.toast.source_segment_keep_one',
                        'At least one source segment must remain on the subtitle page.'
                    ),
                    'warning'
                );
                return;
            }

            if (!result.deletedCount) {
                window.app?.showToast?.(
                    this.translateOrFallback('subtitle.toast.no_selected_delete', 'No selected subtitles to delete.'),
                    'warning'
                );
                return;
            }

            window.app?.showToast?.(
                this.translateOrFallback(
                    'subtitle.toast.source_segment_delete_success',
                    result.deletedCount > 1 ? `Removed ${result.deletedCount} source segments.` : 'Removed source segment.'
                ),
                'success'
            );
            return;
        }

        if (targetTrack.type === 'audio') {
            await this.flow.audioActionHandler?.deleteSelectedClips?.(targetTrack.id);
            return;
        }

        const selectedIndices = this.getTrackSelectedIndices(targetTrack, {
            editableOnly: true,
            includeActiveFallback: true
        });

        if (selectedIndices.length === 0) return;

        const isBatch = selectedIndices.length > 1;

        this.editor.withTrackAsActive?.(targetTrack.id, () => this.editor.ensureHistoryBaseline());
        
        // 从后往前删，避免索引偏移问题
        selectedIndices.sort((a, b) => b - a).forEach(index => {
            targetTrack.subtitles.splice(index, 1);
        });

        // 重置状态
        this.clearTrackSelection(targetTrack);

        if (targetTrack.id === this.flow.trackManager?.activeTrackId) {
            this.editor.activeSubtitleIndex = -1;
            this.editor.render(targetTrack.subtitles);
        } else if (this.flow.timeline) {
            this.flow.timeline.render();
        }

        this.editor.withTrackAsActive?.(targetTrack.id, () => this.editor.addToHistory());
        
        const successMsg = isBatch 
            ? window.i18n.t('subtitle.toast.delete_selected_success', { count: selectedIndices.length })
            : window.i18n.t('subtitle.messages.delete_success');
        window.app?.showToast?.(successMsg, 'success');
    }

    /**
     * 在当前时间位置添加字幕
     */
    addSubtitle() {
        this.editor.ensureHistoryBaseline();
        const currentTime = this.flow.video?.currentTime || 0;
        const sortedSubs = [...this.editor.subtitles].sort((a, b) => a.start - b.start);

        // --- 核心改进：迭代式重叠冲突回避算法 ---
        let start = currentTime;
        let duration = 2.0; // 默认目标时长

        // 持续向后寻址，直到找到一个至少能容纳 0.5s 的空隙
        let attempts = 0;
        while (attempts < 100) { // 防止极端情况死循环
            attempts++;
            
            // 1. 检查当前起始点是否落在已有字幕内部或靠得太近
            const overlap = sortedSubs.find(s => (s.end > start && s.start < start + 0.05));
            if (overlap) {
                start = overlap.end + 0.05;
                continue;
            }

            // 2. 检查距离下一个字幕的空隙大小
            const nextSub = sortedSubs.find(s => s.start >= start);
            if (nextSub) {
                const gap = nextSub.start - start;
                if (gap < 0.5) {
                    // 空隙不足 0.5s，直接跳到下一个字幕后面继续找
                    start = nextSub.end + 0.05;
                    continue;
                }
                // 有空隙但可能不足 2s，自适应缩短时长
                duration = Math.min(2.0, gap - 0.05);
            }
            
            // 找到合适空隙，退出循环
            break;
        }

        const newSub = {
            id: Date.now(),
            start: start,
            end: start + Math.max(0.5, duration),
            text: '',
            originalText: '',
            translatedText: '',
            ttsSource: 'original',
            selected: false,
            reviewStatus: 'pending',
            locked: false
        };

        // 插入并保持数组逻辑顺序 (虽然渲染可能支持乱序，但逻辑上保持有序更稳健)
        let insertIndex = this.editor.subtitles.length;
        for (let i = 0; i < this.editor.subtitles.length; i++) {
            if (this.editor.subtitles[i].start > start) {
                insertIndex = i;
                break;
            }
        }

        this.editor.subtitles.splice(insertIndex, 0, newSub);
        this.editor.render();
        this.editor.addToHistory();

        // 延迟高亮并聚焦
        setTimeout(() => this.editor.focusSubtitle(insertIndex, false), 100);
    }

    /**
     * 合并下一句
     */
    mergeWithNext(index) {
        if (index >= this.editor.subtitles.length - 1) return;
        if (this.isLocked(index) || this.isLocked(index + 1)) return;
        this.editor.ensureHistoryBaseline();
        const current = this.editor.subtitles[index];
        const next = this.editor.subtitles[index + 1];

        const mergeTxt = (a, b) => {
            const valA = (a || '').trim();
            const valB = (b || '').trim();
            if (!valA) return valB;
            if (!valB) return valA;
            return valA + ' ' + valB;
        };

        // 合并文本字段
        current.originalText = mergeTxt(current.originalText, next.originalText);
        current.translatedText = mergeTxt(current.translatedText, next.translatedText);
        
        // 字幕全文（用于某些只显示单行的情况）
        current.text = current.translatedText ? `${current.originalText}\n${current.translatedText}` : current.originalText;
        
        // 更新结束时间
        current.end = next.end;

        this.editor.subtitles.splice(index + 1, 1);
        this.editor.render();
        this.editor.addToHistory();
    }

    /**
     * 基于选区或光标位置拆分字幕
     */
    splitSubtitle(index) {
        const sub = this.editor.subtitles[index];
        if (!sub) return;
        if (this.isLocked(index)) return;

        // 获取当前活跃的文本编辑框
        const activeEl = document.activeElement;
        const isOriginal = activeEl?.classList.contains('original-text');
        const isTranslated = activeEl?.classList.contains('translated-text');

        // 验证活跃文本框是否属于当前的字幕行
        const container = activeEl?.closest('.subtitle-item');
        const itemIndex = container ? parseInt(container.dataset.index) : -1;

        let start, end, fullText, splitField;

        // --- 核心修复：更灵活的拆分策略 ---
        if (itemIndex === index && (isOriginal || isTranslated)) {
            // 场景 1: 用户已聚焦输入框 (不管是光标还是选中选区)
            start = activeEl.selectionStart;
            end = activeEl.selectionEnd;
            fullText = activeEl.value;
            splitField = isOriginal ? 'original' : 'translated';
        } else {
            // 场景 2: 用户未聚焦输入框，执行“智能中点分段”
            splitField = sub.translatedText ? 'translated' : 'original';
            fullText = sub.translatedText || sub.originalText || sub.text || '';
            start = Math.ceil(fullText.length / 2);
            end = start;
            
            // 针对非中文优化中点拆分：找最近的空格
            if (!/[\u4e00-\u9fa5]/.test(fullText)) {
                const spacePos = fullText.lastIndexOf(' ', start + 10);
                if (spacePos !== -1 && spacePos > start - 10) {
                    start = spacePos;
                    end = spacePos;
                }
            }
            console.log(`[SubtitleEditor] No focus, auto-splitting at middle: index ${start}`);
        }

        // 基本校验
        if (!fullText || fullText.length < 2) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.tooShortToSplit', 'Text too short to split'), 'warning');
            return;
        }

        this.editor.ensureHistoryBaseline();

        // 1. 文本拆分逻辑
        // 如果 start === end，说明是光标点，或者中点拆分；如果 start !== end，说明是选中了删除区
        let part1Text = fullText.substring(0, start).trim();
        let part2Text = fullText.substring(end).trim();

        // 特殊处理：如果用户选了一个范围，那选区的内容归并在后半段（符合大部分人的习惯）
        if (start !== end) {
            const selectedText = fullText.substring(start, end).trim();
            part2Text = (selectedText + ' ' + part2Text).trim();
        }

        if (!part1Text || !part2Text) {
            // 防抖：如果导致某部分为空（例如在最开头点剪刀），则强制按中点分
            if (!part1Text) {
                const mid = Math.ceil(fullText.length / 2);
                part1Text = fullText.substring(0, mid).trim();
                part2Text = fullText.substring(mid).trim();
            } else {
                // 如果后半部分为空，则不拆分
                window.app?.showToast?.(window.i18n.t('subtitle.tooShortToSplit'), 'warning');
                return;
            }
        }

        // 2. 时间拆分（按字数比例）
        const totalLen = (part1Text.length + part2Text.length) || 1;
        const ratio = part1Text.length / totalLen;
        const duration = sub.end - sub.start;
        const midTime = sub.start + (duration * ratio);

        // 3. 应用变更
        const newSub = JSON.parse(JSON.stringify(sub));
        newSub.id = Date.now() + Math.random();
        newSub.start = midTime;
        newSub.audioPath = null; // 拆分后音频失效
        
        // 更新原字幕文本
        if (splitField === 'original') {
            sub.originalText = part1Text;
            newSub.originalText = part2Text;
            
            // 同步译文 (简单按比例分)
            if (sub.translatedText && sub.translatedText.length > 5) {
                const translatedFull = sub.translatedText;
                const tLimit = Math.floor(translatedFull.length * ratio);
                sub.translatedText = translatedFull.substring(0, tLimit).trim();
                newSub.translatedText = translatedFull.substring(tLimit).trim();
            }
        } else {
            sub.translatedText = part1Text;
            newSub.translatedText = part2Text;

            // 同步原文 (简单按比例分)
            if (sub.originalText && sub.originalText.length > 5) {
                const oLimit = Math.floor(sub.originalText.length * ratio);
                const oFull = sub.originalText;
                sub.originalText = oFull.substring(0, oLimit).trim();
                newSub.originalText = oFull.substring(oLimit).trim();
            }
        }
        
        // 同步 .text 属性
        const syncText = (s) => {
            if (s.originalText && s.translatedText) return `${s.originalText}\n${s.translatedText}`;
            return s.translatedText || s.originalText || '';
        };
        sub.text = syncText(sub);
        newSub.text = syncText(newSub);

        sub.end = midTime;

        this.editor.subtitles.splice(index + 1, 0, newSub);
        this.editor.render();
        this.editor.addToHistory();
        window.app?.showToast?.(window.i18n.t('subtitle.messages.split_success'), 'success');
    }

    /**
     * 在播放头位置剪断
     */
    async splitAtPlayhead() {
        if (!this.flow.video) return;
        const time = this.flow.video.currentTime;
        const activeTrack = this.resolveClipActionTrack();
        
        if (!activeTrack || activeTrack.locked) return;

        if (activeTrack.type === 'source') {
            if (!this.splitSourceSegmentAtPlayhead(time)) {
                window.app?.showToast?.(this.getSplitUnavailableMessage(), 'info');
            }
            return;
        }

        // 查找当前时间点所在的剪辑索引 (字幕或音频)
        const index = this.findClipIndexAt(activeTrack, time);

        if (index === -1) {
            if (!this.hasExplicitTimelineClipSelection() && this.canSplitSourceSegmentAt(time)) {
                if (this.splitSourceSegmentAtPlayhead(time)) return;
            }

            window.app?.showToast?.(this.getSplitUnavailableMessage(), 'info');
            return;
        }

        this.editor.withTrackAsActive?.(activeTrack.id, () => this.editor.ensureHistoryBaseline());
        const sub = activeTrack.subtitles[index];
        const originalEnd = sub.end;

        // --- 核心逻辑：区分字幕轨与音轨进行切割 ---
        if (activeTrack.type === 'audio') {
            this.splitAudioClipAt(activeTrack, index, time);
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.audio_split_success', 'Audio clip split'), 'success');
            // 音轨切割：逻辑偏移计算
            // 假设原始剪辑对应音频区间 [audioStartOffset, audioEndOffset]
            // 切割点相对于剪辑起始的时间偏移

            // 创建新剪辑 (后半段)
            
            // 更新当前剪辑 (前半段)

        } else {
            // 常规字幕切割
            sub.end = time;
            const newSub = JSON.parse(JSON.stringify(sub));
            newSub.id = Date.now() + Math.random();
            newSub.start = time;
            newSub.end = originalEnd;
            activeTrack.subtitles.splice(index + 1, 0, newSub);
            window.app?.showToast?.(window.i18n.t('subtitle.toast.split_at_playhead_success', { time: time.toFixed(2) }), 'success');
        }

        // 统一刷新渲染
        if (activeTrack.id === this.flow.trackManager?.activeTrackId) {
            this.editor.render(activeTrack.subtitles);
        } else if (this.flow.timeline) {
            this.flow.timeline.render();
        }
        
        this.editor.withTrackAsActive?.(activeTrack.id, () => this.editor.addToHistory());
    }

    /**
     * 播放特定字幕
     */
    playSubtitle(index, { loop = false } = {}) {
        const sub = this.editor.subtitles[index];
        if (!sub || !this.flow.video) return;

        if (loop && this.editor.loopingSubtitleIndex === index) {
            this.stopSegmentPlayback({ pause: true, nextLoopIndex: -1 });
            return;
        }

        this.stopSegmentPlayback({ rerender: false });
        const nextLoopIndex = loop ? index : -1;
        const loopStateChanged = this.editor.loopingSubtitleIndex !== nextLoopIndex;
        this.editor.loopingSubtitleIndex = nextLoopIndex;
        this.flow.video.currentTime = sub.start;
        const playPromise = this.flow.video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                if (error?.name === 'AbortError') return;
                console.warn('[SubtitleEditor] Segment play interrupted:', error);
            });
        }
        this.editor.setActive(index);
        if (loopStateChanged) {
            this.editor.render();
        }
        this.startSegmentPlayback(sub, { loop });
    }

    loopSubtitle(index) {
        this.playSubtitle(index, { loop: true });
    }

    stopSegmentPlayback({ pause = false, nextLoopIndex = -1, rerender = true } = {}) {
        if (pause && this.flow.video) {
            this.flow.video.pause();
        }

        if (typeof this.segmentPlaybackCleanup === 'function') {
            this.segmentPlaybackCleanup();
        }
        this.segmentPlaybackCleanup = null;

        const loopStateChanged = this.editor.loopingSubtitleIndex !== nextLoopIndex;
        this.editor.loopingSubtitleIndex = nextLoopIndex;
        if (rerender && loopStateChanged) {
            this.editor.render();
        }
    }

    startSegmentPlayback(sub, { loop = false } = {}) {
        const video = this.flow.video;
        if (!video || !sub) return;

        const segmentStart = Math.max(0, Number(sub.start || 0));
        const segmentEnd = Math.max(Number(sub.end || 0), segmentStart + 0.05);

        const handleTimeUpdate = () => {
            if (video.currentTime < segmentEnd - 0.02) return;

            if (loop) {
                video.currentTime = segmentStart;
                if (video.paused) {
                    video.play().catch(() => {});
                }
                return;
            }

            video.pause();
            video.currentTime = Math.min(segmentEnd, video.duration || segmentEnd);
            this.stopSegmentPlayback();
        };

        const handleSeeked = () => {
            if (video.currentTime < segmentStart - 0.05 || video.currentTime > segmentEnd + 0.1) {
                this.stopSegmentPlayback();
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('seeked', handleSeeked);

        this.segmentPlaybackCleanup = () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('seeked', handleSeeked);
            this.segmentPlaybackCleanup = null;
        };
    }

    /**
     * 重识别当前字幕片段
     */
    async reRecognize(index, { retranslate = false } = {}) {
        const sub = this.editor.subtitles[index];
        if (!sub) return;
        if (this.isLocked(index)) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.locked_retranslate_blocked', 'Locked subtitles cannot be re-translated.'), 'warning');
            return;
        }

        if (!this.flow.videoFile?.path) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.select_video_first', 'Please select a video first'), 'warning');
            return;
        }

        try {
            const progressKey = retranslate
                ? 'subtitle.progress.rerecognizing_retranslating_single'
                : 'subtitle.progress.rerecognizing_single';
            const progressFallback = retranslate
                ? 'Re-recognizing and retranslating current subtitle...'
                : 'Re-recognizing current subtitle...';
            this.flow.showProgress?.(this.translateOrFallback(progressKey, progressFallback));

            const recognizedText = await this.flow.service.reRecognizeSubtitle(this.flow.videoFile, sub);
            const previousTranslation = this.editor.getTranslatedText(sub);
            let nextTranslation = previousTranslation;

            if (retranslate) {
                const refreshedTranslation = await this.flow.service.retranslate(
                    recognizedText,
                    this.getRetranslateTargetLang(sub),
                    { allowMemory: false }
                );
                if (typeof refreshedTranslation === 'string' && refreshedTranslation.trim()) {
                    nextTranslation = refreshedTranslation;
                }
            }

            this.editor.ensureHistoryBaseline();
            this.editor.updateSubtitleText(index, recognizedText, nextTranslation);
            this.editor.render();
            this.editor.addToHistory();

            const toastKey = retranslate
                ? 'subtitle.toast.rerecognize_retranslate_success'
                : (previousTranslation
                    ? 'subtitle.toast.rerecognize_success_needs_retranslate'
                    : 'subtitle.toast.rerecognize_success');
            const fallback = retranslate
                ? 'Subtitle re-recognized and re-translated'
                : (previousTranslation
                    ? 'Subtitle re-recognized. Re-translate if needed.'
                    : 'Subtitle re-recognized');
            window.app?.showToast?.(this.translateOrFallback(toastKey, fallback), 'success');
        } catch (e) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.rerecognize_failed', 'Re-recognize failed') + ': ' + e.message, 'error');
        } finally {
            this.flow.hideProgress?.();
        }
    }

    /**
     * 重译
     */
    async retranslate(index) {
        const sub = this.editor.subtitles[index];
        if (!sub) return;
        if (this.isLocked(index)) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.locked_retranslate_blocked', 'Locked subtitles cannot be re-translated.'), 'warning');
            return;
        }
        const original = this.editor.getOriginalText(sub);
        const previousTranslation = this.editor.getTranslatedText(sub);
        const targetLang = this.getRetranslateTargetLang(sub);
        if (!String(original || '').trim()) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_empty_source', 'No source text available to re-translate.'), 'warning');
            return;
        }
        try {
            const translation = await this.flow.service.retranslate(
                original,
                targetLang,
                { allowMemory: false }
            );
            const nextTranslation = String(translation || '').trim();
            const previousNormalized = String(previousTranslation || '').trim();
            const originalNormalized = String(original || '').trim();

            if (!nextTranslation || nextTranslation.toLowerCase() === 'none' || nextTranslation === originalNormalized) {
                window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_no_result', 'Re-translation returned no usable result.'), 'warning');
                return;
            }

            if (nextTranslation === previousNormalized) {
                window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_unchanged', 'Re-translation finished, but the translation did not change.'), 'info');
                return;
            }

            if (translation) {
                this.editor.updateSubtitleText(index, original, translation);
                this.editor.render();
                this.editor.addToHistory();
                window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_success', 'Subtitle re-translated.'), 'success');
            }
        } catch (e) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_failed', 'Re-translation failed') + ': ' + e.message, 'error');
        }
    }

    /**
     * 压缩译文
     */
    async compressTranslation(index) {
        const sub = this.editor.subtitles[index];
        if (!sub) return;
        if (this.isLocked(index)) return;

        const text = this.editor.getTranslatedText(sub) || this.editor.getOriginalText(sub);
        if (!text) return;
        const duration = sub.end - sub.start;
        const isChinese = /[\u4e00-\u9fa5]/.test(text);
        const maxChars = Math.floor(duration * 1.2 * (isChinese ? 4 : 12));

        try {
            const compressed = await this.flow.service.compressTranslation(text, maxChars, isChinese);
            if (compressed) {
                this.editor.updateSubtitleText(index, sub.originalText, compressed);
                this.editor.render();
                this.editor.addToHistory();
            }
        } catch (e) {
            window.app?.showToast?.(window.i18n.t('subtitle.toast.compress_failed') + ': ' + e.message, 'error');
        }
    }

    /**
     * TTS 相关
     */
    setTtsSource(index, source) {
        const sub = this.editor.subtitles[index];
        if (sub && !this.isLocked(index)) {
            sub.ttsSource = source;
            sub.ttsSourceUserSet = true;
            this.flow.uiManager?.settings?.refreshDubStatusPanel?.();
            this.editor.addToHistory();
        }
    }

    setTtsSourceForSelection(source) {
        const normalizedSource = source === 'translated' ? 'translated' : 'original';
        const selectedIndices = this.editor.getSelectedIndices({ includeActiveFallback: false });
        const targetIndices = selectedIndices.length
            ? selectedIndices
            : this.editor.subtitles.map((_, index) => index);

        if (!targetIndices.length) {
            return { changedCount: 0, lockedCount: 0, scope: 'none' };
        }

        this.editor.ensureHistoryBaseline();

        let changedCount = 0;
        let lockedCount = 0;

        targetIndices.forEach((index) => {
            const sub = this.editor.subtitles[index];
            if (!sub) return;
            this.editor.normalizeSubtitle(sub);

            if (this.isLocked(index)) {
                lockedCount += 1;
                return;
            }

            if (sub.ttsSource !== normalizedSource || sub.ttsSourceUserSet !== true) {
                sub.ttsSource = normalizedSource;
                sub.ttsSourceUserSet = true;
                changedCount += 1;
            }
        });

        if (changedCount > 0) {
            this.editor.render();
            this.flow.uiManager?.settings?.refreshDubStatusPanel?.();
            this.editor.addToHistory();
        }

        return {
            changedCount,
            lockedCount,
            scope: selectedIndices.length ? 'selection' : 'all'
        };
    }

    previewTts(index) {
        const sub = this.editor.subtitles[index];
        if (!sub || !this.flow.ttsHandler) return;

        const speechText = typeof this.flow.ttsHandler.getSubtitleSpeechText === 'function'
            ? this.flow.ttsHandler.getSubtitleSpeechText(sub)
            : (this.editor.getTranslatedText(sub) || this.editor.getOriginalText(sub));

        if (!String(speechText || '').trim()) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.preview_tts_empty', 'No subtitle text available for audio preview.'), 'warning');
            return;
        }

        this.flow.ttsHandler.previewSubtitle(speechText);
    }

    /**
     * 移动排序
     */
    moveSubtitle(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (this.isLocked(fromIndex) || this.isLocked(toIndex)) return;
        this.editor.ensureHistoryBaseline();

        const activeIndex = this.editor.activeSubtitleIndex;
        const item = this.editor.subtitles.splice(fromIndex, 1)[0];
        this.editor.subtitles.splice(toIndex, 0, item);

        // Drag sorting changes the editorial order, so move the subtitle text
        // into the chronological time slots as well. Otherwise the list and
        // timeline describe different orders.
        const timeSlots = [...this.editor.subtitles]
            .map(({ start, end }) => ({ start, end }))
            .sort((a, b) => a.start - b.start);
        this.editor.subtitles.forEach((subtitle, index) => {
            subtitle.start = timeSlots[index].start;
            subtitle.end = timeSlots[index].end;
        });

        if (activeIndex === fromIndex) {
            this.editor.activeSubtitleIndex = toIndex;
        } else if (activeIndex > fromIndex && activeIndex <= toIndex) {
            this.editor.activeSubtitleIndex = activeIndex - 1;
        } else if (activeIndex < fromIndex && activeIndex >= toIndex) {
            this.editor.activeSubtitleIndex = activeIndex + 1;
        }

        this.editor.render();
        this.editor.addToHistory();
    }

    /**
     * 一键全量压缩/优化
     */
    async compressAllOverLimit() {
        if (!this.flow.qualityHandler) return;

        // 询问用户优化策略
        const choice = await window.app?.showConfirm(window.i18n.t('subtitle.confirm.ai_optimize_all_ask'));
        // 这里的 choice 如果是 true 则执行 AI 优化，否则执行本地拆分
        if (choice) {
            await this.aiBatchOptimizeAll();
        } else {
            this.editor.ensureHistoryBaseline();
            this.editor.subtitles = this.flow.qualityHandler.autoSplitAll(this.editor.subtitles);
            this.editor.render();
            this.editor.addToHistory();
            window.app?.showToast?.(window.i18n.t('subtitle.toast.optimize_all_success'), 'success');
        }
    }

    /**
     * AI 批量智能优化：针对超长字幕进行语义压缩
     */
    async aiBatchOptimizeAll() {
        if (!this.flow) return;
        const subs = this.editor.subtitles;
        const quality = this.flow.qualityHandler;
        
        // 确定字数限制
        let limit = parseInt(this.flow.maxChars?.value);
        if (isNaN(limit) || limit <= 0) {
            const isCJK = subs.some(s => /[\u4e00-\u9fa5]/.test(s.translatedText || s.text));
            limit = isCJK ? quality.CONFIG.CHINESE_CHAR_LIMIT : quality.CONFIG.ENGLISH_CHAR_LIMIT;
        }

        // 筛选出超长的字幕索引
        const longIndices = [];
        subs.forEach((s, i) => {
            if (this.isLocked(i)) return;
            if ((s.translatedText || s.text || '').length > limit) {
                longIndices.push(i);
            }
        });

        if (longIndices.length === 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.toast.no_long_subs_found'), 'info');
            return;
        }

        try {
            this.editor.ensureHistoryBaseline();
            this.flow.showProgress(window.i18n.t('subtitle.progress.ai_optimizing_batch', { current: 0, total: longIndices.length }));

            for (let i = 0; i < longIndices.length; i++) {
                const idx = longIndices[i];
                const sub = subs[idx];
                const text = sub.translatedText || sub.text;

                this.flow.updateProgress(
                    (i / longIndices.length) * 100,
                    window.i18n.t('subtitle.progress.ai_optimizing_item', { current: i + 1, total: longIndices.length })
                );

                // 调用 AI 压缩接口
                // 自动判断中英文以适配不同的 Prompt 策略 (由 Service 处理)
                const isChinese = /[\u4e00-\u9fa5]/.test(text);
                const compressed = await this.flow.service.compressTranslation(text, limit, isChinese);

                if (compressed && compressed.trim() !== text.trim()) {
                    this.editor.updateSubtitleText(idx, sub.originalText, compressed);
                }
            }

            this.editor.render();
            this.editor.addToHistory();
            window.app?.showToast?.(window.i18n.t('subtitle.toast.ai_optimize_all_success', { count: longIndices.length }), 'success');
        } catch (e) {
            console.error('[SubtitleEditor] AI batch optimization failed:', e);
            window.app?.showToast?.(window.i18n.t('subtitle.toast.ai_optimize_failed') + ': ' + e.message, 'error');
        } finally {
            this.flow.hideProgress();
        }
    }

    /**
     * 一键生成所有字幕的 TTS
     */
    async generateAllTTS() {
        if (!this.flow.ttsHandler) {
            console.error('[SubtitleEditor] ttsHandler not found');
            return;
        }

        const confirmMsg = window.i18n.t('subtitle.confirm.generate_all_tts');
        const confirmed = window.app?.showConfirm ? await window.app.showConfirm(confirmMsg) : confirm(confirmMsg);
        if (!confirmed) return;

        try {
            this.flow.showProgress(window.i18n.t('subtitle.progress.generating_all_tts'));
            
            const result = await this.flow.ttsHandler.generateBatch(this.editor.subtitles);
            if (result && result.path) {
                const resultPath = result.path;
                const resultWords = result.words || [];

                // 1. 在当前字幕轨道标记 TTS 已生成 (保留原有标记逻辑)
                const activeTrackIdx = this.flow.trackManager.tracks.findIndex(t => t.id === this.flow.trackManager.activeTrackId);
                if (activeTrackIdx !== -1) {
                    this.flow.trackManager.tracks[activeTrackIdx].ttsAudioPath = resultPath;
                    this.flow.trackManager.tracks[activeTrackIdx].ttsGenerated = true;

                    // 将精准词数据分发回字幕列表 (按时间范围分配)
                    if (resultWords.length > 0) {
                        const subs = this.editor.subtitles;
                        for (const sub of subs) {
                            sub.words = resultWords.filter(w => w.start >= sub.start - 0.1 && w.start < sub.end + 0.1);
                        }
                    }
                    this.flow.trackManager.renderTracks();
                }

                // 2. [核心新增] 自动创建一个包含碎块化剪辑的独立音频轨道
                this.flow.trackManager.addAudioTrackFromTTS(result, JSON.parse(JSON.stringify(this.editor.subtitles)));

                window.app?.showToast?.(window.i18n.t('subtitle.toast.generate_all_tts_success'), 'success');
            }
        } catch (e) {
            console.error('[SubtitleEditor] Batch TTS failed:', e);
            window.app?.showToast?.(window.i18n.t('subtitle.toast.generate_all_tts_failed') + ': ' + e.message, 'error');
        } finally {
            this.flow.hideProgress();
        }
    }
    /**
     * 重译选中的字幕
     */
    async retranslateSelected() {
        let selectedIndices = this.editor.getSelectedIndices({ editableOnly: true });

        // --- 交互优化：如果没有勾选，则自动尝试重译当前激活项 ---
        if (selectedIndices.length === 0 && this.editor.activeSubtitleIndex !== -1 && !this.isLocked(this.editor.activeSubtitleIndex)) {
            selectedIndices = [this.editor.activeSubtitleIndex];
        }

        if (selectedIndices.length === 0 && this.editor.activeSubtitleIndex !== -1 && this.isLocked(this.editor.activeSubtitleIndex)) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.locked_retranslate_blocked', 'Locked subtitles cannot be re-translated.'), 'warning');
            return;
        }

        if (selectedIndices.length === 0) {
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.no_selected_retranslate', 'No editable subtitles selected for re-translation.'), 'warning');
            return;
        }

        // 如果只有一项，就不弹确认框了，直接开整 (更人性化)
        if (selectedIndices.length > 1) {
            const confirmed = await window.app?.showConfirm(window.i18n.t('subtitle.confirm.retranslate_selected', { count: selectedIndices.length }));
            if (!confirmed) return;
        }

        try {
            this.flow.showProgress(window.i18n.t('subtitle.progress.retranslating_selected', { current: 0, total: selectedIndices.length }));
            this.editor.ensureHistoryBaseline();
            let changedCount = 0;

            for (let i = 0; i < selectedIndices.length; i++) {
                const idx = selectedIndices[i];
                const sub = this.editor.subtitles[idx];
                const original = this.editor.getOriginalText(sub);
                const previousTranslation = this.editor.getTranslatedText(sub);
                const targetLang = this.getRetranslateTargetLang(sub);

                this.flow.updateProgress(
                    (i / selectedIndices.length) * 100,
                    window.i18n.t('subtitle.progress.retranslate_progress', { current: i + 1, total: selectedIndices.length })
                );

                if (!String(original || '').trim()) {
                    continue;
                }

                const translation = await this.flow.service.retranslate(
                    original,
                    targetLang,
                    { allowMemory: false }
                );
                const nextTranslation = String(translation || '').trim();
                const previousNormalized = String(previousTranslation || '').trim();
                const originalNormalized = String(original || '').trim();

                // 检查翻译是否有效 (防止显示 "None")
                const isValid = nextTranslation &&
                              nextTranslation.toLowerCase() !== 'none' &&
                              nextTranslation !== originalNormalized;

                if (isValid) {
                    if (nextTranslation === previousNormalized) {
                        continue;
                    }

                    this.editor.updateSubtitleText(idx, original, translation);
                    changedCount += 1;
                }
            }

            if (changedCount > 0) {
                this.editor.render();
                this.editor.addToHistory();
                window.app?.showToast?.(
                    this.translateOrFallback(
                        'subtitle.toast.retranslate_selected_success',
                        'Re-translated {count} subtitle(s).',
                        { count: changedCount }
                    ),
                    'success'
                );
            } else {
                window.app?.showToast?.(
                    this.translateOrFallback(
                        'subtitle.toast.retranslate_selected_unchanged',
                        'Re-translation finished, but no subtitle text changed.'
                    ),
                    'info'
                );
            }
        } catch (e) {
            console.error('[SubtitleEditor] Retranslate selected failed:', e);
            window.app?.showToast?.(this.translateOrFallback('subtitle.toast.retranslate_selected_failed', 'Batch re-translation failed') + ': ' + e.message, 'error');
        } finally {
            this.flow.hideProgress();
        }
    }

    /**
     * 批量删除选中的字幕
     */
    async deleteSelected() {
        const selectedTrackId = this.flow?.timeline?.clipsManager?.selectedTrackId;
        if (selectedTrackId !== null && selectedTrackId !== undefined && selectedTrackId === this.flow?.sourceTrackId) {
            await this.deleteSubtitles();
            return;
        }

        const selectedIndices = this.editor.getSelectedIndices({ editableOnly: true })
            .sort((a, b) => b - a); // 倒序删除，防止索引偏移

        if (selectedIndices.length === 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.toast.no_selected_delete'), 'warning');
            return;
        }

        this.editor.ensureHistoryBaseline();
        selectedIndices.forEach(idx => {
            this.editor.subtitles.splice(idx, 1);
        });

        // 重置激活索引
        this.editor.activeSubtitleIndex = -1;
        this.editor.render();
        this.editor.addToHistory();
        const base = window.i18n.t('subtitle.toast.delete_selected_success', { count: selectedIndices.length });
        const msg = (base && base !== 'subtitle.toast.delete_selected_success')
            ? base
            : `已删除 ${selectedIndices.length} 条`;
        this.flow?.toastWithUndo?.(msg, 'info')
            || window.app?.showToast?.(`${msg}（Ctrl+Z 撤销）`, 'info');
    }

    /**
     * 批量平移选中的字幕时间 (Offset)
     */
    async shiftSelected(offset) {
        if (isNaN(offset) || Math.abs(offset) < 0.001) return;

        const selectedIndices = this.editor.getSelectedIndices({ editableOnly: true });

        if (selectedIndices.length === 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.toast.no_selected_shift'), 'warning');
            return;
        }

        this.editor.ensureHistoryBaseline();
        let affectedCount = 0;
        const duration = this.flow.timeline?.duration || 99999;

        selectedIndices.forEach(idx => {
            const sub = this.editor.subtitles[idx];
            // 确保起始时间不小于 0
            const newStart = Math.max(0, sub.start + offset);
            const newEnd = Math.max(newStart + 0.1, sub.end + offset);

            if (newStart < duration) {
                sub.start = newStart;
                sub.end = Math.min(duration, newEnd);
                affectedCount++;
            }
        });

        this.editor.render();
        this.editor.addToHistory();
        const offsetLabel = (offset > 0 ? '+' : '') + offset;
        const base = window.i18n.t('subtitle.toast.shift_selected_success', { count: affectedCount, offset: offsetLabel });
        const msg = (base && base !== 'subtitle.toast.shift_selected_success')
            ? base
            : `已平移 ${affectedCount} 条（${offsetLabel}s）`;
        this.flow?.toastWithUndo?.(msg, 'success')
            || window.app?.showToast?.(`${msg}（Ctrl+Z 撤销）`, 'success');
    }

    /**
     * 更新单行字幕的本地配音设置 (覆盖全局)
     * @param {number} index - 字幕索引
     * @param {Object} settings - 本地设置 {voice, rate, pitch, volume}，若为 null 则清除覆盖
     */
    updateSubtitleLocalTTS(index, settings) {
        const sub = this.editor.subtitles[index];
        if (!sub) return;
        if (this.isLocked(index)) return;

        if (settings === null) {
            delete sub.ttsLocal;
        } else {
            sub.ttsLocal = {
                ...(sub.ttsLocal || {}),
                ...settings
            };
        }

        // 触发表内 UI 同步并记录历史
        this.editor.render();
        this.editor.addToHistory();
        this.flow.triggerAutoSave?.();
    }
}

window.SubtitleEditorActionHandler = SubtitleEditorActionHandler;
