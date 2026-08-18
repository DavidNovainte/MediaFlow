/**
 * SubtitleFlow.js
 * 字幕翻译工具主控制器
 * 
 * 模块化设计:
 * - SubtitleFlow: 主控制器：UI 交互与流程控制
 * - 依赖的服务模块 (后续创建):
 *   - TranslationService: 翻译 API
 *   - TTSService: 语音合成
 *   - SRTParser: 字幕解析
 */

console.log('[SubtitleFlow] Loading...');

// TranslationService removed (Using services/TranslationService.js)

class SubtitleFlow {
    constructor(app) {
        this.app = app;
        this.videoFile = null;
        this.sourceTrackId = -1;
        this.sourceSegments = [];
        this.editor = new window.SubtitleEditor(this);
        this.trackManager = new window.SubtitleTrackManager(this);
        this.audioManager = new window.SubtitleAudioManager(this);
        this.audioActionHandler = new window.SubtitleAudioActionHandler(this); // 实例化新处理器
        this.styleManager = new window.SubtitleStyleManager(this);
        this.timeline = new window.SubtitleTimeline(this);
        this.isProcessing = false;

        // 视频变换状态
        this.isMirrored = false;
        this.cropSettings = null; // { mode: 'ratio', w, h } or { mode: 'custom', x, y, w, h }

        // 默认配置
        this.preferenceManager = new window.SubtitlePreferenceManager(this);
        this.searchHandler = new window.SubtitleSearchHandler(this.editor);
        this.qualityHandler = new window.SubtitleQualityHandler(this.editor);
        this.contextMenu = new window.SubtitleContextMenu(this);
        this.uiManager = new window.SubtitleUIManager(this);
        this.service = new window.SubtitleService(this);
        this.dubAdapter = new window.SubtitleDubAdapter(this);
        this.visualOptimizer = new window.SubtitleVisualOptimizer(this);
        this.draftManager = new window.SubtitleDraftManager(this);
    }

    get tracks() { return this.trackManager.tracks; }
    get activeTrackId() { return this.trackManager.activeTrackId; }
    set activeTrackId(id) { this.trackManager.activeTrackId = id; }

    get currentStyle() { return this.styleManager.currentStyle; }
    set currentStyle(val) {
        const normalizedStyle = this.styleManager?.cloneStyle
            ? this.styleManager.cloneStyle(val)
            : val;
        this.styleManager.currentStyle = normalizedStyle;

        if (this.trackManager && this.trackManager.activeTrackId) {
            const track = this.trackManager.tracks.find(t => t.id === this.trackManager.activeTrackId);
            if (track) {
                track.style = this.styleManager?.cloneStyle
                    ? this.styleManager.cloneStyle(normalizedStyle)
                    : normalizedStyle;
            }
        }
    }
    get styleTemplates() { return this.styleManager.styleTemplates; }

    get preferences() { return this.preferenceManager.preferences; }

    translateSourceLabel(key, fallback) {
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : fallback;
    }

    getRoot() {
        return document.getElementById('page-subtitle') || document;
    }

    getElement(id) {
        const root = this.getRoot();
        return root.querySelector?.(`#${id}`) || document.getElementById(id);
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getSourceTrackLabel() {
        return this.translateSourceLabel('subtitle.timeline.source_media_track', 'Source Media');
    }

    getSourceSegmentLabel() {
        return this.translateSourceLabel('subtitle.timeline.source_segment_label', 'Source Segment');
    }

    createSourceSegment(start, end) {
        return {
            id: Date.now() + Math.random(),
            start: Number(start || 0),
            end: Number(end || 0),
            selected: false,
            text: this.getSourceSegmentLabel()
        };
    }

    refreshSourceTimelineLayers({ render = false } = {}) {
        if (render) {
            this.timeline?.render?.();
        }

        this.timeline?.renderer?.drawRuler?.();
        this.timeline?.renderer?.drawWaveform?.();
        this.timeline?.syncPlayhead?.();
    }

    normalizeSourceSegments(segments = []) {
        const duration = Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
        if (!Array.isArray(segments) || duration <= 0) return [];

        return segments
            .filter(Boolean)
            .map((segment) => ({
                ...segment,
                start: Math.max(0, Math.min(duration, Number(segment.start || 0))),
                end: Math.max(0, Math.min(duration, Number(segment.end || 0))),
                selected: !!segment.selected,
                text: this.getSourceSegmentLabel()
            }))
            .filter((segment) => (segment.end - segment.start) >= 0.01)
            .sort((left, right) => left.start - right.start);
    }

    setSourceSegments(segments, { render = true } = {}) {
        this.sourceSegments = this.normalizeSourceSegments(segments);
        if (render) {
            this.refreshSourceTimelineLayers({ render: true });
        }
    }

    resetSourceSegments(duration = null, { render = true } = {}) {
        const resolvedDuration = Math.max(0, Number(duration ?? this.videoFile?.duration ?? this.timeline?.duration ?? 0));
        const nextSegments = resolvedDuration > 0
            ? [this.createSourceSegment(0, resolvedDuration)]
            : [];
        this.setSourceSegments(nextSegments, { render });
    }

    getSourceTrackData() {
        if (!this.videoFile?.path || !Array.isArray(this.sourceSegments) || this.sourceSegments.length === 0) {
            return null;
        }

        return {
            id: this.sourceTrackId,
            name: this.getSourceTrackLabel(),
            type: 'source',
            subtitles: this.sourceSegments,
            visible: true,
            locked: false,
            color: '#0ea5e9',
            pseudoTrack: true
        };
    }

    hasSourceTrim() {
        const duration = Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
        if (duration <= 0 || !Array.isArray(this.sourceSegments) || this.sourceSegments.length === 0) {
            return false;
        }

        const segments = this.normalizeSourceSegments(this.sourceSegments);
        if (!segments.length) return false;

        const tolerance = 0.01;
        let cursor = 0;
        for (const segment of segments) {
            const start = Number(segment.start || 0);
            const end = Number(segment.end || start);
            if (start - cursor > tolerance) return true;
            cursor = Math.max(cursor, end);
        }

        return duration - cursor > tolerance;
    }

    getPlayableSourceSegments() {
        return this.normalizeSourceSegments(this.sourceSegments);
    }

    getSourceTimelineSegments() {
        let cursor = 0;
        return this.getPlayableSourceSegments().map((segment, index) => {
            const sourceStart = Math.max(0, Number(segment.start || 0));
            const sourceEnd = Math.max(sourceStart, Number(segment.end || sourceStart));
            const duration = Math.max(0, sourceEnd - sourceStart);
            const timelineStart = cursor;
            const timelineEnd = cursor + duration;
            cursor = timelineEnd;
            return {
                ...segment,
                sourceIndex: index,
                sourceStart,
                sourceEnd,
                timelineStart,
                timelineEnd,
                duration
            };
        }).filter((segment) => segment.duration >= 0.01);
    }

    getSourceTimelineDuration() {
        if (!this.hasSourceTrim()) {
            return Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
        }

        return this.getSourceTimelineSegments().reduce((total, segment) => total + segment.duration, 0);
    }

    sourceTimeToTimelineTime(time, { tolerance = 0.02 } = {}) {
        const duration = Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
        const numericTime = Number(time || 0);
        const boundedTime = duration > 0
            ? Math.max(0, Math.min(duration, Number.isFinite(numericTime) ? numericTime : 0))
            : Math.max(0, Number.isFinite(numericTime) ? numericTime : 0);

        if (!this.hasSourceTrim()) {
            return boundedTime;
        }

        const segments = this.getSourceTimelineSegments();
        if (!segments.length) return boundedTime;

        for (const segment of segments) {
            if (boundedTime >= segment.sourceStart - tolerance && boundedTime <= segment.sourceEnd + tolerance) {
                return Math.max(
                    segment.timelineStart,
                    Math.min(segment.timelineEnd, segment.timelineStart + (boundedTime - segment.sourceStart))
                );
            }

            if (boundedTime < segment.sourceStart - tolerance) {
                return segment.timelineStart;
            }
        }

        return segments[segments.length - 1].timelineEnd;
    }

    timelineTimeToSourceTime(time, { tolerance = 0.02 } = {}) {
        const numericTime = Number(time || 0);
        const safeTime = Number.isFinite(numericTime) ? numericTime : 0;

        if (!this.hasSourceTrim()) {
            const duration = Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
            return duration > 0 ? Math.max(0, Math.min(duration, safeTime)) : Math.max(0, safeTime);
        }

        const segments = this.getSourceTimelineSegments();
        if (!segments.length) return Math.max(0, safeTime);

        const timelineDuration = segments[segments.length - 1].timelineEnd;
        const boundedTime = Math.max(0, Math.min(timelineDuration, safeTime));
        const currentSegment = segments.find((segment) => (
            boundedTime >= segment.timelineStart - tolerance
            && boundedTime <= segment.timelineEnd + tolerance
        ));

        if (currentSegment) {
            return Math.max(
                currentSegment.sourceStart,
                Math.min(currentSegment.sourceEnd, currentSegment.sourceStart + (boundedTime - currentSegment.timelineStart))
            );
        }

        const nextSegment = segments.find((segment) => boundedTime < segment.timelineStart - tolerance);
        return nextSegment ? nextSegment.sourceStart : segments[segments.length - 1].sourceEnd;
    }

    getSourceRangeTimelineRange(start, end) {
        const sourceStart = Number(start || 0);
        const sourceEnd = Math.max(sourceStart, Number(end || sourceStart));
        if (sourceEnd <= sourceStart) return null;

        if (!this.hasSourceTrim()) {
            return { start: sourceStart, end: sourceEnd };
        }

        const ranges = this.getSourceTimelineSegments().reduce((mapped, segment) => {
            const overlapStart = Math.max(sourceStart, segment.sourceStart);
            const overlapEnd = Math.min(sourceEnd, segment.sourceEnd);
            if (overlapEnd <= overlapStart) return mapped;

            mapped.push({
                start: segment.timelineStart + (overlapStart - segment.sourceStart),
                end: segment.timelineStart + (overlapEnd - segment.sourceStart)
            });
            return mapped;
        }, []);

        if (!ranges.length) return null;

        return {
            start: Math.min(...ranges.map((range) => range.start)),
            end: Math.max(...ranges.map((range) => range.end))
        };
    }

    getPlayableSourceTime(time, { tolerance = 0.02 } = {}) {
        const numericTime = Number(time || 0);
        const safeTime = Number.isFinite(numericTime) ? numericTime : 0;
        const duration = Math.max(0, Number(this.videoFile?.duration || this.timeline?.duration || 0));
        const boundedTime = duration > 0
            ? Math.max(0, Math.min(duration, safeTime))
            : Math.max(0, safeTime);

        if (!this.hasSourceTrim()) {
            return boundedTime;
        }

        const segments = this.getPlayableSourceSegments();
        if (!segments.length) {
            return boundedTime;
        }

        const currentSegment = segments.find((segment) => (
            boundedTime >= (segment.start - tolerance)
            && boundedTime <= (segment.end + tolerance)
        ));

        if (currentSegment) {
            return Math.max(currentSegment.start, Math.min(currentSegment.end, boundedTime));
        }

        if (boundedTime <= segments[0].start) {
            return segments[0].start;
        }

        const nextSegment = segments.find((segment) => boundedTime < (segment.start - tolerance));
        if (nextSegment) {
            return nextSegment.start;
        }

        return segments[segments.length - 1].end;
    }

    getSelectedSourceSegmentIndices() {
        const clipsManager = this.timeline?.clipsManager;
        if (clipsManager?.selectedTrackId === this.sourceTrackId && clipsManager.selectedIndices?.size) {
            return Array.from(clipsManager.selectedIndices).sort((left, right) => left - right);
        }

        return (this.sourceSegments || []).reduce((indices, segment, index) => {
            if (segment?.selected) indices.push(index);
            return indices;
        }, []);
    }

    setSourceSelection(indices = [], { render = true } = {}) {
        const normalized = Array.from(new Set((indices || []).filter((index) => Number.isInteger(index) && index >= 0)))
            .sort((left, right) => left - right);
        const selectedSet = new Set(normalized);

        (this.sourceSegments || []).forEach((segment, index) => {
            if (segment) {
                segment.selected = selectedSet.has(index);
            }
        });

        const clipsManager = this.timeline?.clipsManager;
        if (clipsManager) {
            clipsManager.selectedTrackId = normalized.length ? this.sourceTrackId : null;
            clipsManager.selectedIndices = new Set(normalized);
            clipsManager.lastSelectedIndex = normalized.length ? normalized[normalized.length - 1] : null;
        }

        if (render) {
            this.refreshSourceTimelineLayers({ render: true });
        } else {
            this.timeline?.clipsManager?._syncSelectionUI?.();
            this.refreshSourceTimelineLayers({ render: false });
        }
    }

    splitSourceSegmentAt(time) {
        const currentTime = Number(time);
        if (!Number.isFinite(currentTime)) return null;

        const segments = this.normalizeSourceSegments(this.sourceSegments);
        const index = segments.findIndex((segment) => currentTime > segment.start && currentTime < segment.end);
        if (index === -1) return null;

        const segment = segments[index];
        const nextSegments = segments.slice();
        const leftSegment = this.createSourceSegment(segment.start, currentTime);
        const rightSegment = this.createSourceSegment(currentTime, segment.end);

        nextSegments.splice(index, 1, leftSegment, rightSegment);
        this.setSourceSegments(nextSegments, { render: false });
        this.setSourceSelection([index + 1]);

        return {
            index,
            leftSegment,
            rightSegment
        };
    }

    clipWordsToSourceRange(words = [], start, end) {
        if (!Array.isArray(words) || words.length === 0) return [];

        const rangeStart = Number(start || 0);
        const rangeEnd = Math.max(rangeStart, Number(end || rangeStart));

        return words.reduce((clipped, word) => {
            if (!word) return clipped;
            const wordStart = Number(word.start ?? 0);
            const wordEnd = Math.max(wordStart, Number(word.end ?? wordStart));
            const overlapStart = Math.max(wordStart, rangeStart);
            const overlapEnd = Math.min(wordEnd, rangeEnd);
            if (overlapEnd <= overlapStart) return clipped;

            clipped.push({
                ...word,
                start: overlapStart,
                end: overlapEnd
            });
            return clipped;
        }, []);
    }

    clipTimelineItemToSourceSegments(item, sourceSegments = [], track = null, itemIndex = 0) {
        if (!item || !Array.isArray(sourceSegments) || sourceSegments.length === 0) return [];

        const originalStart = Number(item.start ?? 0);
        const originalEnd = Math.max(originalStart, Number(item.end ?? originalStart));
        if (!Number.isFinite(originalStart) || !Number.isFinite(originalEnd) || originalEnd <= originalStart) {
            return [];
        }

        const isAudioTrack = track?.type === 'audio';
        const baseAudioStart = Number.isFinite(Number(item.audioStartOffset))
            ? Number(item.audioStartOffset)
            : originalStart;
        const baseAudioEnd = Number.isFinite(Number(item.audioEndOffset))
            ? Number(item.audioEndOffset)
            : (baseAudioStart + Math.max(0, originalEnd - originalStart));
        const baseId = item.id || `${track?.id || 'track'}_${itemIndex}`;
        const clippedItems = sourceSegments.reduce((items, segment) => {
            const segmentStart = Number(segment.start ?? 0);
            const segmentEnd = Math.max(segmentStart, Number(segment.end ?? segmentStart));
            const overlapStart = Math.max(originalStart, segmentStart);
            const overlapEnd = Math.min(originalEnd, segmentEnd);
            if (overlapEnd <= overlapStart) return items;

            const nextItem = JSON.parse(JSON.stringify(item));
            nextItem.start = overlapStart;
            nextItem.end = overlapEnd;
            nextItem.selected = false;

            if (Array.isArray(item.words) && item.words.length) {
                nextItem.words = this.clipWordsToSourceRange(item.words, overlapStart, overlapEnd);
            }

            if (isAudioTrack) {
                nextItem.audioStartOffset = baseAudioStart + (overlapStart - originalStart);
                nextItem.audioEndOffset = baseAudioEnd - (originalEnd - overlapEnd);
                if (nextItem.audioEndOffset <= nextItem.audioStartOffset) return items;
            }

            items.push(nextItem);
            return items;
        }, []);

        if (clippedItems.length > 1) {
            clippedItems.forEach((nextItem) => {
                nextItem.id = `${baseId}_src_${Math.round(nextItem.start * 1000)}_${Math.round(nextItem.end * 1000)}`;
            });
        }

        return clippedItems;
    }

    trimDependentTracksToSourceSegments(sourceSegments = []) {
        const normalizedSourceSegments = this.normalizeSourceSegments(sourceSegments);
        const tracks = this.trackManager?.tracks || [];
        const changedTrackIds = new Set();
        let removedClipCount = 0;
        let splitClipCount = 0;

        if (!normalizedSourceSegments.length || !tracks.length) {
            return { changedTrackIds, removedClipCount, splitClipCount };
        }

        tracks.forEach((track) => {
            if (!track || track.type === 'source' || !Array.isArray(track.subtitles)) return;

            const nextSubtitles = [];
            let changed = false;

            track.subtitles.forEach((item, index) => {
                const clippedItems = this.clipTimelineItemToSourceSegments(item, normalizedSourceSegments, track, index);
                if (clippedItems.length === 0) {
                    removedClipCount += 1;
                    changed = true;
                    return;
                }

                if (clippedItems.length !== 1
                    || Math.abs((Number(clippedItems[0].start) || 0) - (Number(item.start) || 0)) > 0.001
                    || Math.abs((Number(clippedItems[0].end) || 0) - (Number(item.end) || 0)) > 0.001) {
                    changed = true;
                    splitClipCount += Math.max(0, clippedItems.length - 1);
                }

                nextSubtitles.push(...clippedItems);
            });

            if (!changed) return;

            track.subtitles = nextSubtitles;
            changedTrackIds.add(track.id);
        });

        const activeTrack = tracks.find((track) => track.id === this.trackManager?.activeTrackId);
        if (activeTrack && changedTrackIds.has(activeTrack.id)) {
            if (this.editor) {
                this.editor.subtitles = activeTrack.subtitles;
                this.editor.activeSubtitleIndex = -1;
                this.editor.render?.(activeTrack.subtitles);
            }
        }

        if (changedTrackIds.size > 0) {
            this.audioManager?.syncTracks?.();
        }

        return { changedTrackIds, removedClipCount, splitClipCount };
    }

    deleteSelectedSourceSegments() {
        const selectedIndices = this.getSelectedSourceSegmentIndices();
        if (!selectedIndices.length) {
            return { deletedCount: 0, preventedAll: false };
        }

        if (selectedIndices.length >= (this.sourceSegments?.length || 0)) {
            return { deletedCount: 0, preventedAll: true };
        }

        const selectedSet = new Set(selectedIndices);
        const nextSegments = (this.sourceSegments || []).filter((_, index) => !selectedSet.has(index));
        const nextSelection = nextSegments.length
            ? [Math.max(0, Math.min(nextSegments.length - 1, selectedIndices[0] - 1))]
            : [];

        const trimStats = this.trimDependentTracksToSourceSegments(nextSegments);
        this.setSourceSegments(nextSegments, { render: false });
        this.setSourceSelection(nextSelection);

        return {
            deletedCount: selectedIndices.length,
            preventedAll: false,
            trimmedDependentTracks: trimStats.changedTrackIds.size,
            removedDependentClips: trimStats.removedClipCount,
            splitDependentClips: trimStats.splitClipCount
        };
    }

    async init() {
        console.log('[SubtitleFlow] Initializing...');

        // 绑定关键 DOM 元素
        this.video = document.getElementById('subtitle-video-preview');
        this.videoContainer = document.getElementById('video-container');
        this.videoPlaceholder = document.getElementById('video-placeholder');
        this.videoInfo = document.getElementById('video-info');
        this.subtitleOverlay = document.getElementById('subtitle-overlay');

        // 表单与偏好元素
        this.lengthOptimize = document.getElementById('length-optimize');
        this.lengthStrategy = document.getElementById('length-strategy');
        this.maxChars = document.getElementById('max-chars');
        this.maxLines = document.getElementById('max-lines');
        this.targetLanguage = document.getElementById('target-language');
        this.sourceLanguage = document.getElementById('source-language');
        this.translationEngine = document.getElementById('translation-engine');
        this.translationConcurrency = document.getElementById('translation-concurrency');
        this.aiStyleHint = document.getElementById('ai-style-hint');
        this.keepBilingual = document.getElementById('keep-bilingual');
        this.outputPath = document.getElementById('output-path');

        // 状态相关
        this.videoSettings = { inputMode: 'single', isMirrored: false };

        // 控制按钮
        this.btnImportSrt = document.getElementById('btn-import-srt');
        this.btnAddSubtitle = document.getElementById('btn-add-subtitle');
        this.btnCompressAll = document.getElementById('btn-compress-all');
        this.btnCycleDisplayMode = document.getElementById('btn-cycle-editor-display');
        this.btnToggleTextLayout = document.getElementById('btn-toggle-text-layout');
        this.btnSelectVideo = document.getElementById('btn-select-video');
        this.btnAddTrack = document.getElementById('btn-add-track');
        this.btnSelectOutput = document.getElementById('btn-select-output');
        this.btnAIProcess = document.getElementById('btn-ai-process');
        this.btnStartBurn = document.getElementById('btn-start-burn');
        this.btnCancelProcess = this.getElement('btn-cancel-process');
        this.btnGenerateTTS = document.getElementById('btn-generate-tts');

        // TTS 元素
        this.ttsEngine = document.getElementById('tts-engine');
        this.ttsVoice = document.getElementById('tts-voice');
        this.ttsRate = document.getElementById('tts-rate');
        this.ttsPitch = document.getElementById('tts-pitch');
        this.voiceVolume = document.getElementById('voice-volume');
        this.bgmVolume = document.getElementById('bgm-volume');
        this.btnPreviewVoice = document.getElementById('btn-preview-voice');

        // --- 关键重构：先实例化逻辑模块，再绑定 UI 事件 ---
        this.batchHandler = new window.SubtitleBatchHandler(this);
        this.exportHandler = new window.SubtitleExportHandler(this);
        this.exportHandler.init();
        this.aiHandler = new window.SubtitleAIHandler(this);
        this.mediaHandler = new window.SubtitleMediaHandler(this);
        this.ttsHandler = new window.SubtitleTTSHandler(this);

        this.uiManager.bindElements();
        this.editor.init('subtitle-list-container');
        const reviewFilter = document.getElementById('subtitle-review-filter');
        if (reviewFilter) reviewFilter.value = this.editor.reviewFilter;
        window.subtitleEditor = this.editor; 
        window.subtitleFlow = this; // 补全全局引用，供 Inline HTML 调用

        this.bindEvents();

        // Initialize Managers
        this.styleManager.init();
        this.trackManager.init();
        this.timeline.init('subtitle-timeline-container');

        // Redraw canvas ruler/waveform when UI theme changes
        if (!this._themeChangeBound) {
            this._themeChangeBound = true;
            window.addEventListener('themeChanged', () => {
                try {
                    this.refreshSourceTimelineLayers({ render: true });
                } catch (e) {
                    console.warn('[SubtitleFlow] theme redraw failed:', e);
                }
            });
        }

        this.ttsHandler.init({
            ttsEngine: this.ttsEngine,
            ttsVoice: this.ttsVoice,
            ttsRate: this.ttsRate,
            ttsPitch: this.ttsPitch,
            voiceVolume: this.voiceVolume,
            bgmVolume: this.bgmVolume,
            btnPreviewVoice: this.btnPreviewVoice
        });

        // Load Preferences
        await this.preferenceManager.init();
        this.uiManager?.restorePersistedState?.();
        const rememberedStyle = this.preferenceManager?.get
            ? this.preferenceManager.get('visualStyle')
            : this.preferenceManager?.preferences?.visualStyle;
        const rememberedTextLayoutMode = this.preferenceManager?.get
            ? this.preferenceManager.get('textLayoutMode')
            : this.preferenceManager?.preferences?.textLayoutMode;
        const rememberedEditorDisplayMode = this.preferenceManager?.get
            ? this.preferenceManager.get('editorDisplayMode')
            : this.preferenceManager?.preferences?.editorDisplayMode;
        if (rememberedStyle) {
            this.currentStyle = this.styleManager?.cloneStyle
                ? this.styleManager.cloneStyle(rememberedStyle)
                : rememberedStyle;
            this.styleManager?.applyStyleToUI?.();
        }
        this.editor?.setTextLayoutMode?.(rememberedTextLayoutMode || 'stacked', {
            persist: false,
            announce: false
        });
        this.editor?.setDisplayMode?.(rememberedEditorDisplayMode || 'translated', {
            persist: false,
            announce: false
        });
        this.uiManager?.settings?.refreshDubStatusPanel?.();
        
        // Initialize Draft Manager
        await this.draftManager?.init();
        
        // --- 核心新增：音频轨道初始同步 ---
        this.audioManager?.syncTracks();

        // 核心同步：初始化完成后，根据偏好设置的语言同步一次 TTS 滤镜
        if (this.preferences?.targetLanguage) {
            this.ttsHandler?.syncWithTargetLanguage(this.preferences.targetLanguage);
        }

        this.initSidebarResizer();

        setTimeout(() => {
            console.log('[SubtitleFlow] Triggering layout refresh...');
            window.dispatchEvent(new Event('resize'));
        }, 300);

        if (this.preferences.enableTTS) {
            // 优化启动性能：延迟 2 秒加载语音列表，避开应用开启时的渲染和初始化高峰
            setTimeout(() => {
                console.log('[SubtitleFlow] Deferred loading voices...');
                this.ttsHandler.loadVoices();
            }, 2000);
        }

        console.log('[SubtitleFlow] Ready');
    }

    // bindElements moved to SubtitleUIManager

    bindEvents() {
        // 全局语言变更响应
        window.addEventListener('languageChanged', (e) => {
            console.log('[SubtitleFlow] Language changed event received:', e.detail.lang);
            if (this.sourceSegments?.length) {
                this.setSourceSegments(this.sourceSegments, { render: false });
            }
            // 刷新编辑器列表渲染 (触发 SubtitleListRenderer 局部刷新)
            if (this.editor) {
                this.editor.render();
            }
            // 同步 TTS 目标语言预览
            if (this.ttsHandler && this.targetLanguage) {
                this.ttsHandler.syncWithTargetLanguage(this.targetLanguage.value);
            }
        });

        // 导入按钮
        this.btnImportSrt?.addEventListener('click', () => this.trackManager.importSubtitle());

        // Editor Controls
        this.btnToggleView = document.getElementById('btn-toggle-view');
        this.btnToggleView?.addEventListener('click', () => this.editor?.toggleViewMode());
        this.btnToggleTextLayout?.addEventListener('click', () => this.editor?.toggleTextLayoutMode());
        this.btnCycleDisplayMode?.addEventListener('click', () => this.editor?.cycleDisplayMode());

        this.btnAddSubtitle?.addEventListener('click', () => this.editor?.addSubtitle());
        document.getElementById('btn-locate-current-sub')?.addEventListener('click', () => {
            this.locateCurrentSubtitle();
        });
        document.getElementById('btn-shortcuts-help')?.addEventListener('click', () => {
            this.showShortcutsHelp();
        });
        this.btnCompressAll?.addEventListener('click', () => this.editor?.compressAllOverLimit());
        
        // btnGenerateTTS listener moved to batch actions section

        // 工具栏横向滚动增强
        this.initToolbarScroll();


        // 输入模式切换 (Input Mode: Single vs Batch)
        document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateInputModeUI(e.target.value);
                this.batchHandler?.renderBatchList?.();
            });
        });

        // 视频选择
        this.btnSelectVideo?.addEventListener('click', () => {
            console.log('[SubtitleFlow] Button Import clicked');
            this.mediaHandler.selectVideo();
        });
        document.getElementById('video-placeholder')?.addEventListener('click', (e) => {
            // Only trigger if not clicking the button itself to avoid double trigger
            if (e.target?.id !== 'btn-select-video' && !this.closest(e.target, '#btn-select-video')) {
                console.log('[SubtitleFlow] Placeholder clicked');
                this.mediaHandler.selectVideo();
            }
        });

        // 更换 / 清除视频
        document.getElementById('btn-change-video')?.addEventListener('click', () => this.mediaHandler.selectVideo());
        document.getElementById('btn-clear-video')?.addEventListener('click', () => this.mediaHandler.clearMedia());

        // 批量队列：继续添加 / 清空
        document.getElementById('btn-batch-add-folder')?.addEventListener('click', () => {
            this.batchHandler?.selectBatchFolder?.();
        });
        document.getElementById('btn-batch-clear-queue')?.addEventListener('click', () => {
            this.batchHandler?.clearBatchQueue?.();
        });

        // 剪切按钮 (剪子图标)
        document.getElementById('btn-split-sub')?.addEventListener('click', () => this.editor?.splitAtPlayhead());

        // 批量粘贴按钮 (Text Injection)
        document.getElementById('btn-batch-paste')?.addEventListener('click', () => {
            if (this.uiManager && this.uiManager.inject) this.uiManager.inject.showInjectionModal();
        });

        // 批量操作 (Batch actions)
        document.getElementById('btn-select-all-subs')?.addEventListener('change', (e) => {
            if (this.editor && this.editor.renderer) {
                this.editor.renderer.selectAll(e.target.checked);
            }
        });
        document.getElementById('subtitle-review-filter')?.addEventListener('change', (e) => {
            this.editor?.setReviewFilter?.(e.target.value);
        });
        document.getElementById('btn-batch-approve')?.addEventListener('click', () => {
            const count = this.editor?.setReviewStatusForSelection?.('approved') || 0;
            if (count > 0) {
                this.toastWithUndo(`已标记 ${count} 条为已审`, 'success');
            }
        });
        document.getElementById('btn-batch-needs-work')?.addEventListener('click', () => {
            const count = this.editor?.setReviewStatusForSelection?.('needs-work') || 0;
            if (count > 0) {
                this.toastWithUndo(`已标记 ${count} 条为重做`, 'warning');
            }
        });
        document.getElementById('btn-batch-lock')?.addEventListener('click', () => {
            const count = this.editor?.setLockForSelection?.(true) || 0;
            if (count > 0) {
                this.toastWithUndo(`已锁定 ${count} 条字幕`, 'info');
            }
        });
        document.getElementById('btn-batch-unlock')?.addEventListener('click', () => {
            const count = this.editor?.setLockForSelection?.(false) || 0;
            if (count > 0) {
                this.toastWithUndo(`已解锁 ${count} 条字幕`, 'info');
            }
        });
        document.getElementById('btn-batch-delete')?.addEventListener('click', () => {
            if (this.editor) this.editor.deleteSelected();
        });
        document.getElementById('btn-batch-retranslate')?.addEventListener('click', () => {
            if (this.editor) this.editor.retranslateSelected();
        });
        document.getElementById('btn-batch-tts-source-apply')?.addEventListener('click', () => {
            const sourceSelect = document.getElementById('select-batch-tts-source');
            if (!this.editor || !sourceSelect) return;

            const result = this.editor.setTtsSourceForSelection(sourceSelect.value);
            if (!result || result.changedCount <= 0) {
                if (result?.lockedCount > 0) {
                    window.app?.showToast?.(`未修改，${result.lockedCount} 条锁定字幕已跳过`, 'warning');
                }
                return;
            }

            const sourceLabel = sourceSelect.value === 'translated'
                ? (window.i18n?.t?.('subtitle.editor.translated_option') || '译文')
                : (window.i18n?.t?.('subtitle.editor.original_option') || '原文');
            const scopeLabel = result.scope === 'selection'
                ? `已选 ${result.changedCount} 条`
                : `全部 ${result.changedCount} 条`;
            const lockedSuffix = result.lockedCount > 0
                ? `，跳过 ${result.lockedCount} 条锁定字幕`
                : '';

            window.app?.showToast?.(`${scopeLabel}已改为按${sourceLabel}配音${lockedSuffix}`, 'success');
        });
        document.getElementById('btn-batch-shift')?.addEventListener('click', () => {
            const shiftInput = document.getElementById('input-batch-offset');
            if (this.editor && shiftInput) {
                const offset = parseFloat(shiftInput.value);
                if (!isNaN(offset)) this.editor.shiftSelected(offset);
            }
        });
        document.getElementById('btn-generate-tts')?.addEventListener('click', () => {
            if (this.editor) this.editor.generateAllTTS();
        });
        document.getElementById('btn-compress-all')?.addEventListener('click', () => {
            if (this.editor) this.editor.compressAllOverLimit();
        });

        // 质检扫描 (Quality Check)
        const runQc = () => {
            if (!this.qualityHandler) return;
            const errors = this.qualityHandler.runQC();
            this.updateQCUI(errors);
            if (errors.length > 0) {
                window.app?.showToast?.(
                    `质检发现 ${errors.length} 项问题（可点摘要栏「下一个」）`,
                    'warning'
                );
            } else {
                window.app?.showToast?.('质检通过，未发现问题', 'success');
            }
        };
        document.getElementById('btn-run-qc')?.addEventListener('click', runQc);
        document.getElementById('btn-run-qc-main')?.addEventListener('click', runQc);

        document.getElementById('btn-qc-next')?.addEventListener('click', () => {
            this.qualityHandler?.nextError();
        });

        document.getElementById('btn-qc-filter-issues')?.addEventListener('click', () => {
            this.editor?.setReviewFilter?.('qc');
            const filter = document.getElementById('subtitle-review-filter');
            if (filter) filter.value = 'qc';
        });

        document.getElementById('btn-qc-clear-filter')?.addEventListener('click', () => {
            this.editor?.setReviewFilter?.('all');
            const filter = document.getElementById('subtitle-review-filter');
            if (filter) filter.value = 'all';
        });

        document.getElementById('btn-close-qc')?.addEventListener('click', () => {
            document.getElementById('qc-summary-bar')?.classList.add('hidden');
            document.getElementById('qc-queue-panel')?.classList.add('hidden');
        });

        document.getElementById('qc-queue-list')?.addEventListener('click', (event) => {
            const fixButton = this.closest(event.target, '.qc-queue-fix-btn');
            const queueItem = this.closest(event.target, '.qc-queue-item');
            if (!queueItem) return;

            const queueIndex = Number.parseInt(queueItem.dataset.queueIndex, 10);
            const type = queueItem.dataset.errorType;
            if (Number.isNaN(queueIndex)) return;

            if (fixButton) {
                event.preventDefault();
                event.stopPropagation();

                const subtitleIndex = Number.parseInt(queueItem.dataset.subtitleIndex, 10);
                if (Number.isNaN(subtitleIndex)) return;

                if (type === 'overlap') this.qualityHandler?.fixOverlap(subtitleIndex);
                if (type === 'short') this.qualityHandler?.fixShort(subtitleIndex);
                if (type === 'overflow') this.qualityHandler?.fixOverflow(subtitleIndex);

                const updatedErrors = this.qualityHandler?.runQC?.() || [];
                this.updateQCUI(updatedErrors);
                return;
            }

            this.qualityHandler?.focusError?.(queueIndex);
        });

        const subtitlePage = document.getElementById('page-subtitle');
        const handleSubtitlePageDrop = (e) => {
            if (window.app?.router?.currentPage !== 'subtitle') return;
            if (!e.dataTransfer?.files?.length) return;

            const videoFile = Array.from(e.dataTransfer.files).find((file) => this.isSupportedVideoFile(file));
            if (!videoFile?.path) return;

            e.preventDefault();
            e.stopPropagation();
            this.videoContainer?.classList.remove('drag-over');
            this.loadVideo(videoFile.path);
        };

        subtitlePage?.addEventListener('dragover', (e) => {
            if (window.app?.router?.currentPage !== 'subtitle') return;
            if (!e.dataTransfer?.types?.includes('Files')) return;

            e.preventDefault();
            e.stopPropagation();
            this.videoContainer?.classList.add('drag-over');
        });
        subtitlePage?.addEventListener('dragleave', (e) => {
            if (e.currentTarget === e.target) {
                this.videoContainer?.classList.remove('drag-over');
            }
        });
        subtitlePage?.addEventListener('drop', handleSubtitlePageDrop);

        // 拖放支持
        this.videoContainer?.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.videoContainer.classList.add('drag-over');
        });
        this.videoContainer?.addEventListener('dragleave', () => {
            this.videoContainer.classList.remove('drag-over');
        });
        this.videoContainer?.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.videoContainer.classList.remove('drag-over');
            const files = e.dataTransfer?.files || [];
            const videoFile = Array.from(files || []).find((file) => this.isSupportedVideoFile(file));
            if (videoFile?.path) {
                this.loadVideo(videoFile.path);
            }
        });

        // 工作模式切换
        document.querySelectorAll('input[name="subtitle-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const mode = e.target.value;

                // Force button visibility directly here to bypass potential method call issues
                const addBtn = document.getElementById('btn-add-subtitle');
                const pasteBtn = document.getElementById('btn-batch-paste');
                const genTTSBtn = document.getElementById('btn-generate-tts');
                const importBtn = document.getElementById('btn-import-srt');

                // Always keep list "+" available — empty-state and keyboard depend on it
                if (addBtn) addBtn.style.display = 'inline-flex';
                if (pasteBtn) pasteBtn.style.display = 'inline-flex';
                if (genTTSBtn) genTTSBtn.style.display = (mode === 'manual') ? 'inline-flex' : 'none';
                if (importBtn) importBtn.style.display = (mode === 'import') ? 'inline-flex' : 'none';

                // Still try to call main handler for other logic (editor, etc)
                if (typeof this.onSubtitleModeChange === 'function') {
                    this.onSubtitleModeChange(mode);
                }

                // Manual mode with empty list: drop user into first cue
                if (mode === 'manual') {
                    const count = this.editor?.subtitles?.length || 0;
                    if (count === 0) {
                        this.editor?.addSubtitle?.();
                    }
                }
            });
        });

        // 长度优化切换
        this.lengthOptimize?.addEventListener('change', () => {
            const row = document.getElementById('length-settings-row');
            if (row) row.style.display = this.lengthOptimize.checked ? 'block' : 'none';
            // 触发界面更新以显示/隐藏最大行数等子项
            this.uiManager?.updateLengthStrategyUI();
        });

        // 预览开关
        // Delegated to SubtitleStyleManager (showPreview binding)

        // 预览开关
        // Delegated to SubtitleStyleManager (showPreview binding)

        // 样式模板切换
        // Delegated to SubtitleStyleManager

        // 绑定字幕预览拖动
        // Delegated to SubtitleStyleManager

        // 绑定样式输入
        // Delegated to SubtitleStyleManager

        // 背景透明度
        // Delegated to SubtitleStyleManager

        // TTS & Audio Bindings delegated to SubtitleTTSHandler



        // 轨道操作
        this.btnAddTrack?.addEventListener('click', () => this.trackManager.addTrack());

        // 输出路径 (移至导出弹窗)
        // this.btnSelectOutput?.addEventListener('click', () => this.selectOutputPath());

        // 处理按钮
        // 处理按钮
        this.btnAIProcess?.addEventListener('click', () => {
            const inputMode = document.querySelector('input[name="input-mode"]:checked')?.value || 'single';
            if (inputMode === 'batch') {
                // Trigger Batch Recognition Only
                this.batchHandler?.runBatchProcess('recognize');
            } else {
                this.runAIProcess();
            }
        });
        this.btnStartBurn?.addEventListener('click', () => {
            const inputMode = document.querySelector('input[name="input-mode"]:checked')?.value || 'single';
            if (inputMode === 'batch') {
                this.batchHandler?.runBatchProcess('burn');
            } else {
                this.startBurnProcess();
            }
        });
        this.btnCancelProcess?.addEventListener('click', () => this.cancelProcess());

        // 发送到视频工具
        // Initialize mode on load - delay slightly to ensure DOM is ready
        setTimeout(() => {
            const initialMode = document.querySelector('input[name="subtitle-mode"]:checked')?.value || 'ai';
            this.onSubtitleModeChange(initialMode);

            const inputMode = document.querySelector('input[name="input-mode"]:checked')?.value || 'single';
            this.updateInputModeUI(inputMode);

            // 初始渲染预览层
            this.updateSubtitlePreview();
        }, 100);

        // 绑定视口 Resize 监听，解决全屏后缩放与定位不一致问题
        window.addEventListener('resize', () => {
            this.updateSubtitlePreview();
        });

        // 监听语言变更，刷新无法通过 data-i18n 自动映射的动态业务文本
        window.addEventListener('languageChanged', () => {
            console.log('[SubtitleFlow] Syncing business specific i18n texts...');
            this.updateAIButtonText(); 
            this.preferenceManager?.loadPreferences?.(); // 重新加载依赖语言的预设 (UI 文字)
            this.syncToolbarOverflowLayout();
        });

        // 核心联动：监听字幕“目标语言”变更，同步更新 TTS 滤镜 (解决语种冲突)
        this.targetLanguage?.addEventListener('change', (e) => {
            const newLang = e.target.value;
            console.log('[SubtitleFlow] Target language changed, syncing TTS filter:', newLang);
            this.ttsHandler?.syncWithTargetLanguage(newLang);
        });
    }

    updateInputModeUI(mode) {
        this.uiManager?.updateInputModeUI?.(mode);
    }

    /**
     * Handle work mode change (AI/Import/Manual)
     */
    onSubtitleModeChange(mode) {
        this.uiManager?.onSubtitleModeChange?.(mode);
    }

    updateAIButtonText() {
        this.uiManager?.updateAIButtonText?.();
    }


    // ==================== 视频加载 ====================

    // ==================== 视频加载 ====================

    async selectVideo() {
        await this.mediaHandler.selectVideo();
    }

    async loadVideo(filePath) {
        await this.mediaHandler.loadVideo(filePath);
    }

    isSupportedVideoFile(file) {
        const type = String(file?.type || '').trim().toLowerCase();
        const name = String(file?.name || '').trim().toLowerCase();
        return type.startsWith('video/') || /\.(mkv|mov|avi|webm|flv|mp4)$/i.test(name);
    }

    // Previous file URL conversion removed - readAsDataUrl handles it

    // ==================== 样式模板 ====================

    // Previous file URL conversion removed - readAsDataUrl handles it

    // ==================== 样式模板 ====================
    // Delegated to SubtitleStyleManager


    // 更新模糊区域预览


    // ==================== 模式切换 ====================



    // ==================== 导入/导出 ====================

    // importSubtitle delegated to SubtitleTrackManager


    // ==================== 输出路径 ====================

    async selectOutputPath() {
        const path = await window.mediaflow?.dialog?.selectFolder?.();
        if (path) {
            this.outputPath.value = path;
            this.preferences.outputPath = path;
            this.preferenceManager.savePreferences();
        }
    }

    // ==================== 处理流程 ====================

    async startProcess() {
        if (!this.videoFile) {
            window.app?.showToast?.(window.i18n.t('toast.select_video_first'), 'warning');
            return;
        }

        // Check Mode
        const mode = document.querySelector('input[name="subtitle-mode"]:checked')?.value;

        if (mode === 'ai') {
            await this.runAIProcess();
            return;
        }

        // Import Mode Logic (Existing + Multi-track)
        const tracksToBurn = this.tracks.filter(t => t.subtitles && t.subtitles.length > 0);

        if (tracksToBurn.length === 0) {
            window.app?.showToast?.(window.i18n.t('toast.no_subtitle_content'), 'warning');
            return;
        }

        await this.runBurnProcess(tracksToBurn);
    }

    async runAIProcess() {
        await this.aiHandler.runAIProcess();
    }

    /** Toast with undo hint for destructive/batch edits */
    toastWithUndo(message, type = 'info') {
        const suffix = window.i18n?.t?.('subtitle.toast.undo_hint');
        const hint = (suffix && suffix !== 'subtitle.toast.undo_hint') ? suffix : '（Ctrl+Z 撤销）';
        window.app?.showToast?.(`${message}${hint}`, type);
    }

    showShortcutsHelp() {
        document.getElementById('subtitle-shortcuts-overlay')?.remove();
        const items = [
            ['Ctrl + Z / Y', '撤销 / 重做'],
            ['Ctrl + Enter', '添加字幕 / 下一条'],
            ['Ctrl + F', '搜索替换'],
            ['Space', '播放 / 暂停'],
            ['S', '在播放头拆分'],
            ['Delete', '删除选中/当前'],
            ['Q / W', '标为已审 / 重做'],
            ['L', '锁定 / 解锁当前'],
            ['Alt + ↑ / ↓', '上一条 / 下一条'],
            ['Alt + L', '上下/左右对照'],
            ['?', '打开本快捷键表']
        ];
        const overlay = document.createElement('div');
        overlay.id = 'subtitle-shortcuts-overlay';
        overlay.className = 'subtitle-shortcuts-overlay';
        overlay.innerHTML = `
            <div class="subtitle-shortcuts-panel" role="dialog" aria-label="快捷键">
                <div class="subtitle-shortcuts-head">
                    <strong>字幕编辑快捷键</strong>
                    <button type="button" class="btn-icon btn-xs" data-close-shortcuts title="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="subtitle-shortcuts-list">
                    ${items.map(([k, v]) => `<div class="subtitle-shortcuts-row"><kbd>${k}</kbd><span>${v}</span></div>`).join('')}
                </div>
            </div>`;
        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest?.('[data-close-shortcuts]')) close();
        });
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        });
        document.body.appendChild(overlay);
    }

    /**
     * Jump list + playhead context to the current/active cue (NLE "locate" pattern).
     */
    locateCurrentSubtitle() {
        const editor = this.editor;
        if (!editor) return;

        let index = editor.activeSubtitleIndex;
        const subs = editor.subtitles || [];

        // If nothing active, pick nearest cue to playhead
        if ((!Number.isInteger(index) || index < 0 || index >= subs.length) && this.videoPlayer) {
            const t = this.videoPlayer.currentTime || 0;
            let best = -1;
            let bestDist = Infinity;
            subs.forEach((sub, i) => {
                const mid = ((sub.start || 0) + (sub.end || 0)) / 2;
                const dist = Math.abs(mid - t);
                const inside = t >= (sub.start || 0) && t <= (sub.end || 0);
                const score = inside ? -1 : dist;
                if (score < bestDist) {
                    bestDist = score;
                    best = i;
                }
            });
            index = best;
        }

        if (!Number.isInteger(index) || index < 0 || index >= subs.length) {
            const msg = window.i18n?.t?.('subtitle.panel.locate_none');
            window.app?.showToast?.(
                (msg && msg !== 'subtitle.panel.locate_none') ? msg : '没有可定位的字幕',
                'info'
            );
            return;
        }

        editor.focusSubtitle?.(index, true, false);
        editor.renderer?.scrollToIndex?.(index);
    }

    /**
     * Show which track is being edited + cue count (multi-track safety).
     */
    updateActiveTrackMeta() {
        const meta = document.getElementById('active-track-meta');
        const nameEl = document.getElementById('active-track-meta-name');
        const countEl = document.getElementById('active-track-meta-count');
        if (!meta || !nameEl) return;

        const tracks = this.trackManager?.tracks || [];
        const activeId = this.trackManager?.activeTrackId ?? this.activeTrackId;
        const track = tracks.find((t) => t.id === activeId) || tracks[0];
        if (!track) {
            meta.hidden = true;
            return;
        }

        const count = track.subtitles?.length || 0;
        nameEl.textContent = track.name || (window.i18n?.t('subtitle.messages.trackFallback', { id: track.id }) || `Track ${track.id}`);
        if (countEl) {
            const key = 'subtitle.panel.track_cue_count';
            const translated = window.i18n?.t?.(key, { count });
            countEl.textContent = (translated && translated !== key) ? translated : (window.i18n?.t('subtitle.messages.cueCount', { count }) || `${count} cues`);
        }
        const multi = tracks.length > 1;
        document.getElementById('subtitle-list-aside')?.classList.toggle('multi-track', multi);
        // Single-track: track dropdown is enough; multi-track: show edit context line
        meta.hidden = !multi;
    }

    /**
     * Start the burn process (wrapper for button click)
     */
    async startBurnProcess() {
        await this.exportHandler.startBurnProcess();
    }

    async runBurnProcess(tracksToBurn) {
        await this.exportHandler.runBurnProcess(tracksToBurn);
    }

    cancelProcess() {
        // Stop export burn
        this.exportHandler.cancelProcess();
        
        // Stop TTS generation
        if (this.ttsHandler) {
            this.ttsHandler.stop();
        }
    }

    // ==================== 进度 UI ====================

    showProgress(title) {
        this.uiManager.showProgress(title);
    }

    updateProgress(percent, text) {
        this.uiManager.updateProgress(percent, text);
    }

    hideProgress() {
        this.uiManager.hideProgress();
    }

    // ==================== 偏好设置 ====================

    // ==================== 偏好设置 delegated to SubtitlePreferenceManager ====================

    // ==================== 工具方法 ====================



    // ==================== TTS 逻辑 ====================
    // 逻辑已迁移至 SubtitleTTSHandler.js
    // Logic moved to SubtitleTTSHandler.js


    async selectBatchFolder() {
        this.batchHandler.selectBatchFolder();
    }

    async runBatchProcess() {
        this.batchHandler.runBatchProcess();
    }






    formatTime(seconds) {
        return this.mediaHandler.formatTime(seconds);
    }

    updateBlurPreview() {
        this.mediaHandler.updateBlurPreview();
    }

    /**
     * 更新字幕预览（由编辑器或底层模块调用）
     */
    updateSubtitlePreview() {
        if (this._previewRaf) cancelAnimationFrame(this._previewRaf);
        this._previewRaf = requestAnimationFrame(() => {
            this.styleManager?.updateSubtitlePreview?.();
        });
    }

    /**
     * 初始化左侧侧边栏垂直调节手柄
     */
    initSidebarResizer() {
        const resizer = document.getElementById('sidebar-v-resizer');
        const container = document.querySelector('.editor-aside-pro'); // Target the grid container

        if (!resizer || !container) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const dy = e.clientY - startY;
            // Strict cap constraints (min 80px, max 480px)
            const newHeight = Math.max(80, Math.min(480, startHeight + dy));

            // Update Grid Template Rows
            // Using setProperty with 'important' to override the CSS !important rule
            container.style.setProperty('grid-template-rows', `${newHeight}px 12px 1fr`, 'important');
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            resizer.classList.remove('active');
            document.body.classList.remove('resizing-v');
            document.body.style.cursor = 'default';

            // Trigger a resize event to ensure other components adjust
            window.dispatchEvent(new Event('resize'));
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent text selection
            startY = e.clientY;
            // Get current tracks panel height (first row)
            const computedStyle = window.getComputedStyle(container);
            const gridRows = computedStyle.gridTemplateRows.split(' ');
            startHeight = parseFloat(gridRows[0]);

            // Fallback if parsing fails (shouldn't happen with valid CSS)
            if (isNaN(startHeight)) startHeight = 160;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            resizer.classList.add('active');
            document.body.classList.add('resizing-v');
            document.body.style.cursor = 'ns-resize';
        });
    }

    /**
     * 初始化工具栏横向滚动增强交互
     */
    initToolbarScroll() {
        const toolbar = this.getRoot().querySelector('.header-actions.row-actions');
        if (!toolbar) return;

        if (!this._toolbarOverflowOutsideClickBound) {
            this._toolbarOverflowOutsideClick = (event) => {
                const overflow = this.getRoot()?.querySelector?.('.toolbar-overflow');
                if (overflow?.open && !overflow.contains(event.target)) {
                    overflow.open = false;
                }
            };
            document.addEventListener('click', this._toolbarOverflowOutsideClick);
            this._toolbarOverflowOutsideClickBound = true;
        }

        // 1. 鼠标滚轮转横向滚动
        toolbar.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                // 只有当内容确实溢出时才阻止默认滚动，防止干扰全局
                if (toolbar.scrollWidth > toolbar.clientWidth) {
                    e.preventDefault();
                    toolbar.scrollLeft += e.deltaY;
                }
            }
        }, { passive: false });

        // 2. 鼠标按下拖拽滑动 (抓取滑动)
        let isDown = false;
        let startX;
        let scrollLeft;

        toolbar.addEventListener('mousedown', (e) => {
            isDown = true;
            toolbar.style.cursor = 'grabbing';
            startX = e.pageX - toolbar.offsetLeft;
            scrollLeft = toolbar.scrollLeft;
        });

        toolbar.addEventListener('mouseleave', () => {
            isDown = false;
            toolbar.style.cursor = 'default';
        });

        toolbar.addEventListener('mouseup', () => {
            isDown = false;
            toolbar.style.cursor = 'default';
        });

        toolbar.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - toolbar.offsetLeft;
            const walk = (x - startX) * 2; // 滚动速度倍率
            toolbar.scrollLeft = scrollLeft - walk;
        });

        if (typeof ResizeObserver !== 'undefined') {
            this._toolbarOverflowObserver?.disconnect?.();
            this._toolbarOverflowObserver = new ResizeObserver(() => this.syncToolbarOverflowLayout());
            this._toolbarOverflowObserver.observe(toolbar);
        }

        this.syncToolbarOverflowLayout();
    }

    syncToolbarOverflowLayout() {
        // List panel is narrow (~300px): always keep a visible "⋯ 更多" control.
        // (Previously: when "fits", summary was hidden and items went inline — looked like ⋯ vanished.)
        const toolbar = this.getRoot()?.querySelector?.('.header-actions.row-actions')
            || document.querySelector('#subtitle-list-aside .header-actions.row-actions');
        const overflow = toolbar?.querySelector('.toolbar-overflow');
        if (!toolbar || !overflow) return;

        overflow.open = false;
        overflow.removeAttribute('data-inline-visible');
    }

    updateQCUI(errors) {
        const normalizedErrors = Array.isArray(errors) ? errors : [];
        const summaryBar = this.getElement('qc-summary-bar');
        const statsText = this.getElement('qc-stats-text');
        const qcInfo = summaryBar?.querySelector('.qc-info');
        const icon = qcInfo?.querySelector('i');
        const queuePanel = this.getElement('qc-queue-panel');
        const queueCount = this.getElement('qc-queue-count');
        const queueList = this.getElement('qc-queue-list');
        
        if (!summaryBar || !statsText) return;

        summaryBar.classList.remove('hidden');
        
        if (normalizedErrors.length === 0) {
            summaryBar.classList.add('success');
            qcInfo?.classList.add('success');
            if (icon) icon.className = 'fa-solid fa-circle-check';
            statsText.textContent = window.i18n?.t('subtitle.qc.perfect') || 'Perfect! No issues found ✨';
        } else {
            summaryBar.classList.remove('success');
            qcInfo?.classList.remove('success');
            if (icon) icon.className = 'fa-solid fa-circle-exclamation';
            
            const overlaps = normalizedErrors.filter(e => e.type === 'overlap').length;
            const shorts = normalizedErrors.filter(e => e.type === 'short').length;
            const overflows = normalizedErrors.filter(e => e.type === 'overflow').length;

            statsText.textContent = window.i18n?.t('subtitle.qc.stats', { 
                total: normalizedErrors.length,
                overlaps: overlaps,
                shorts: shorts,
                overflows: overflows
            }) || `Found ${normalizedErrors.length} issues`;
        }

        if (queuePanel && queueList && queueCount) {
            if (!normalizedErrors.length) {
                queuePanel.classList.add('hidden');
                queueCount.textContent = '0';
                queueList.innerHTML = '';
            } else {
                const entries = this.qualityHandler?.getErrorEntries?.() || [];
                queuePanel.classList.remove('hidden');
                queueCount.textContent = String(entries.length);
                queueList.innerHTML = entries.map((entry) => {
                    const safeType = ['overlap', 'short', 'overflow'].includes(entry?.type)
                        ? entry.type
                        : 'overflow';
                    const safeQueueIndex = Number.isFinite(Number(entry?.queueIndex))
                        ? Number(entry.queueIndex)
                        : 0;
                    const safeSubtitleIndex = Number.isFinite(Number(entry?.index))
                        ? Number(entry.index)
                        : 0;
                    const itemClass = safeType === 'overlap' ? 'error' : 'warning';
                    const locked = !!entry?.locked;
                    const previewText = (entry?.subtitle?.translatedText || entry?.subtitle?.originalText || entry?.subtitle?.text || '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const typeLabel = safeType === 'overlap'
                        ? '重叠'
                        : (safeType === 'short' ? '过短' : '过长');
                    const fixLabel = safeType === 'overlap'
                        ? '修复重叠'
                        : (safeType === 'short' ? '延长' : '优化');
                    const lockedLabel = this.escapeHtml('已锁定');

                    return `
                        <div class="qc-queue-item ${itemClass} ${locked ? 'is-locked' : ''}" data-queue-index="${safeQueueIndex}" data-subtitle-index="${safeSubtitleIndex}" data-error-type="${safeType}">
                            <div class="qc-queue-item-meta">#${safeSubtitleIndex + 1}<span>${this.escapeHtml(typeLabel)}</span>${locked ? `<span>${lockedLabel}</span>` : ''}</div>
                            <div class="qc-queue-item-main">
                                <div class="qc-queue-item-title">${this.escapeHtml(entry?.message)}</div>
                                <div class="qc-queue-item-preview">${this.escapeHtml(previewText || '无文本')}</div>
                            </div>
                            <button class="qc-queue-fix-btn" ${locked ? 'disabled' : ''}>${this.escapeHtml(fixLabel)}</button>
                        </div>`;
                }).join('');
            }
        }

        // 强制重新渲染编辑器列表以显示错误标识 (Error badges)
        this.editor?.render?.();
    }

    /**
     * 实时同步：为单行字幕重新生成配音并更新音轨
     * @param {number} index - 字幕索引
     */
    findAutoTtsTrack(sub = null) {
        const audioTracks = (this.tracks || []).filter((track) => track?.type === 'audio');
        if (!audioTracks.length) return null;

        if (sub) {
            const exactTrack = audioTracks.find((track) => track.subtitles?.some((clip) => clip.originId === sub.id));
            if (exactTrack) return exactTrack;
        }

        return audioTracks.find((track) => track.subtitles?.some((clip) => clip.originId !== null && clip.originId !== undefined))
            || audioTracks.find((track) => track.ttsGenerated || track.ttsAudioPath)
            || null;
    }

    ensureAutoTtsTrack() {
        const existingTrack = this.findAutoTtsTrack();
        if (existingTrack) return existingTrack;
        if (typeof this.trackManager?.addTrack !== 'function') return null;

        this.trackManager.addTrack('TTS - Live', 'audio');
        const newTrack = this.tracks[this.tracks.length - 1] || null;
        if (newTrack) {
            newTrack.ttsGenerated = true;
            newTrack.subtitles = Array.isArray(newTrack.subtitles) ? newTrack.subtitles : [];
        }

        return newTrack;
    }

    createAutoTtsClip(audioTrack, sub, result) {
        if (!audioTrack || !sub || !result?.path) return null;

        const start = Number(sub.start || 0);
        const duration = Math.max(0.1, Number(result.duration) || Math.max(0.1, Number(sub.end || 0) - start));
        const clip = {
            id: Date.now() + Math.random(),
            originId: sub.id,
            start,
            end: start + duration,
            text: this.ttsHandler?.getSubtitleSpeechText?.(sub) || sub.translatedText || sub.originalText || sub.text || 'Audio',
            audioPath: result.path,
            audioStartOffset: 0,
            audioEndOffset: duration
        };

        audioTrack.ttsGenerated = true;
        audioTrack.subtitles = Array.isArray(audioTrack.subtitles) ? audioTrack.subtitles : [];
        audioTrack.subtitles.push(clip);
        audioTrack.subtitles.sort((left, right) => Number(left.start || 0) - Number(right.start || 0));

        return clip;
    }

    async autoUpdateSubtitleTTS(index, force = false) {
        const settings = this.ttsHandler?.getSettings();
        if (!force && !settings?.enabled) return;

        const sub = this.editor.subtitles[index];
        if (!sub) return;

        const textPreview = (sub.originalText || sub.translatedText || '').substring(0, 20);
        console.log(`[SubtitleFlow] Auto-updating TTS for index ${index}: ${sub.translatedText || sub.originalText}`);

        // 通知用户：配音正在后台更新
        window.app?.showToast?.(
            `🎙️ ${window.i18n?.t('toast.tts_auto_updating') || ('Regenerating voice: ' + textPreview + '...')}`,
            'info'
        );

        try {
            // 1. 调用单段生成
            const result = await this.ttsHandler.generateSingleSegment(sub);
            if (!result || !result.path) return;

            // 2. 寻找关联音频轨并更新
            const audioTrack = this.findAutoTtsTrack(sub) || this.ensureAutoTtsTrack();
            if (!audioTrack || !audioTrack.subtitles) return;

            // 寻找 ID 匹配的片段
            let clip = audioTrack.subtitles.find(c => c.originId === sub.id);
            
            // 备选方案：如果找不到 originId（可能是修复前的旧项目），通过索引尝试匹配
            if (!clip && audioTrack.subtitles.length === this.editor.subtitles.length) {
                clip = audioTrack.subtitles[index];
                if (clip) {
                    clip.originId = sub.id; // 顺便补全，方便下次使用
                    console.log(`[SubtitleFlow] Fallback: matched clip by index ${index}`);
                }
            }

            if (!clip) {
                clip = this.createAutoTtsClip(audioTrack, sub, result);
                if (clip) {
                    console.log(`[SubtitleFlow] Created new TTS clip for subtitle ${sub.id}.`);
                    this.audioManager?.syncTracks?.();
                }
            }

            if (clip) {
                clip.audioPath = result.path;
                clip.duration = result.duration;
                clip.end = clip.start + result.duration;
                
                // 核心修复：同步更新文字标签，使用与 TTS 一致的文本选择逻辑
                clip.text = this.ttsHandler?.getSubtitleSpeechText?.(sub) || sub.translatedText || sub.originalText || sub.text;

                console.log(`[SubtitleFlow] Clip updated. Text: ${clip.text}, duration: ${result.duration}s`);
                
                // 3. 直接更新 audioPool 中对应轨道的 Audio 元素
                // 必须直接设置，而不能依赖 syncTracks（后者只处理 track.ttsAudioPath，不处理单个 clip.audioPath）
                const audioEl = this.audioManager?.audioPool?.get(audioTrack.id);
                if (audioEl) {
                    const normalizedNewPath = this.audioManager.normalizePath(result.path);
                    audioEl._trackedSrc = normalizedNewPath;
                    audioEl.src = normalizedNewPath;
                    audioEl.load();
                    console.log('[SubtitleFlow] AudioElement forcibly updated to new clip path.');
                }

                // 4. 执行局部 Ripple (吸附)
                this.applyAudioRipple(audioTrack, audioTrack.subtitles.indexOf(clip));

                // 5. 通知刷新时间轴 (局部更新文字，并执行全局 render 以刷新整体长度)
                if (this.timeline && this.timeline.clips) {
                    this.timeline.clips.updateClipUI(audioTrack.subtitles.indexOf(clip), audioTrack.id);
                }
                if (this.timeline) this.timeline.render();

                // 成功通知
                window.app?.showToast?.(
                    `✅ ${window.i18n?.t('toast.tts_auto_updated') || ('Voice updated: ' + textPreview)}`,
                    'success'
                );
                this.uiManager?.settings?.refreshDubStatusPanel?.();
            } else {
                console.warn(`[SubtitleFlow] No clip found with originId: ${sub.id}. Cannot update audio.`);
            }
        } catch (e) {
            console.error('[SubtitleFlow] Auto TTS failed:', e);
            window.app?.showToast?.(
                `❌ ${window.i18n?.t('toast.tts_auto_failed') || ('Voice update failed: ' + e.message)}`,
                'error'
            );
        }
    }

    /**
     * 音感吸附逻辑：使后续片段紧跟当前片段
     */
    applyAudioRipple(track, fromIndex) {
        if (!track || !track.subtitles) return;
        for (let i = fromIndex + 1; i < track.subtitles.length; i++) {
            const prev = track.subtitles[i - 1];
            const curr = track.subtitles[i];
            const dur = curr.end - curr.start;
            curr.start = prev.end;
            curr.end = curr.start + dur;
        }
    }

    /**
     * 触发自动保存到草稿箱 (IndexedDB)
     */
    triggerAutoSave() {
        if (!this.videoFile?.path) return;
        
        // 15秒消抖，避免频繁磁盘写入
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(async () => {
            const snapshot = this.draftManager.captureCurrentSnapshot();
            await this.draftManager.saveDraft(this.videoFile.path, snapshot);
            console.log('[SubtitleFlow] Auto-draft saved.');
        }, 15000);
    }

    /**
     * 检查并引导草稿恢复
     */
    async checkDraftRecovery(filePath) {
        if (!this.draftManager) return;
        
        try {
            const draft = await this.draftManager.getDraft(filePath);
            if (!draft) return;

            // 如果草稿时间比当前应用内数据新，或者当前应用数据为空，则提示恢复
            // 这里我们简化为“只要有草稿就提醒”，因为目前没有更细粒度的版本对比
            const confirm = await window.app?.showConfirm(
                '发现未保存的草稿',
                `检测到您在 [${new Date(draft.timestamp).toLocaleString()}] 有未保存的字幕草稿，是否恢复？`,
                '立即恢复',
                '放弃草稿'
            );

            if (confirm) {
                this.restoreFromSnapshot(draft.content);
                window.app?.showToast?.('草稿已成功恢复', 'success');
            } else {
                // 用户选放弃，可以选择删除草稿以防下次再弹出
                await this.draftManager.deleteDraft(filePath);
            }
        } catch (e) {
            console.error('[SubtitleFlow] Recovery check failed:', e);
        }
    }

    /**
     * 从快照恢复全量状态
     */
    restoreFromSnapshot(snapshot) {
        if (!snapshot || !snapshot.tracks) return;

        const cloneData = (value) => {
            if (value === undefined || value === null) return value;
            return JSON.parse(JSON.stringify(value));
        };

        const restoredTracks = snapshot.tracks.map(track => ({
            ...track,
            subtitles: cloneData(track.subtitles) || [],
            style: track.style
                ? (this.styleManager?.cloneStyle
                    ? this.styleManager.cloneStyle(track.style)
                    : cloneData(track.style))
                : null
        }));
        const restoredActiveTrackId = snapshot.activeTrackId || restoredTracks[0]?.id;

        if (this.trackManager) {
            this.trackManager.tracks = restoredTracks;
            this.activeTrackId = restoredActiveTrackId;
            this.trackManager.renderTracks();
        }

        const activeTrack = restoredTracks.find(t => t.id === restoredActiveTrackId);
        const restoredStyleSource = snapshot.currentStyle || activeTrack?.style || this.currentStyle;
        const restoredStyle = restoredStyleSource
            ? (this.styleManager?.cloneStyle
                ? this.styleManager.cloneStyle(restoredStyleSource)
                : cloneData(restoredStyleSource))
            : null;

        if (restoredStyle) {
            this.currentStyle = restoredStyle;
            this.styleManager?.applyStyleToUI?.();
            this.styleManager?.saveCurrentStylePreference?.();
        }

        if (this.editor) {
            this.editor.subtitles = activeTrack?.subtitles || [];
            this.editor.render();
        }

        if (this.audioManager) this.audioManager.syncTracks();
        this.styleManager?.previewHandler?.invalidateRenderCache?.();
        this.updateSubtitlePreview();
        requestAnimationFrame(() => {
            this.styleManager?.previewHandler?.invalidateRenderCache?.();
            this.updateSubtitlePreview();
        });
    }
}

// Export class globally
// Note: Initialization is handled by app.js after pages are loaded
window.SubtitleFlow = SubtitleFlow;
