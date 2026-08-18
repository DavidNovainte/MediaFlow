class SubtitleExportHandler {
    constructor(flow) {
        this.flow = flow;
        this.modal = null;
        this.measureCanvas = null;
        this.measureCtx = null;
        this._cancelPending = false;
    }

    translateOrFallback(key, fallback, params) {
        return window.SubtitleUtils?.translateOrFallback?.(key, fallback, params) ?? fallback;
    }

    getMeasureContext() {
        if (this.measureCtx) return this.measureCtx;
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d');
        return this.measureCtx;
    }

    getVideoInfo() {
        return {
            width: this.flow.video?.videoWidth || 1920,
            height: this.flow.video?.videoHeight || 1080
        };
    }

    buildMeasureFont(style = {}, videoInfo = {}) {
        const scale = (videoInfo.height || 1080) / 720;
        const fontSize = Math.max(12, Math.round((Number(style.fontSize) || 32) * scale));
        const fontStyle = style.fontItalic ? 'italic ' : '';
        const fontWeight = style.fontBold ? '700 ' : '400 ';
        const fontFamily = style.fontFamily ? `"${String(style.fontFamily).replace(/"/g, '\\"')}", sans-serif` : 'sans-serif';
        return `${fontStyle}${fontWeight}${fontSize}px ${fontFamily}`;
    }

    measureTextWidth(text, style = {}, videoInfo = {}) {
        const value = String(text || '');
        if (!value) return 0;
        const ctx = this.getMeasureContext();
        if (!ctx) return value.length * ((Number(style.fontSize) || 32) * 0.6);
        const scale = (videoInfo.height || 1080) / 720;
        ctx.font = this.buildMeasureFont(style, videoInfo);
        const baseWidth = ctx.measureText(value).width;
        const spacing = (Number(style.letterSpacing) || 0) * scale * Math.max(0, Array.from(value).length - 1);
        return baseWidth + spacing;
    }

    getWrapLimit(style = {}, videoInfo = {}) {
        const wrapWidth = Math.max(20, Math.min(100, Number(style.wrapWidth) || 90));
        return (videoInfo.width || 1920) * (wrapWidth / 100);
    }

    tokenizeForWrap(line) {
        const raw = String(line || '');
        if (!raw) return [];
        const hasComplexScript = /[\u3400-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff]/i.test(raw);
        if (!hasComplexScript && /\s/.test(raw)) {
            return raw.split(/(\s+)/).filter(token => token.length > 0);
        }
        return Array.from(raw);
    }

    wrapSingleLine(line, style = {}, videoInfo = {}, maxLines = 2) {
        const raw = String(line || '').trim();
        if (!raw) return '';

        const widthLimit = this.getWrapLimit(style, videoInfo);
        if (!widthLimit) return raw;

        const tokens = this.tokenizeForWrap(raw);
        const lines = [];
        let currentLine = '';

        tokens.forEach((token) => {
            const candidate = currentLine + token;
            if (
                currentLine &&
                this.measureTextWidth(candidate, style, videoInfo) > widthLimit &&
                lines.length < Math.max(1, maxLines) - 1
            ) {
                lines.push(currentLine.trimEnd());
                currentLine = token.trimStart();
                return;
            }
            currentLine = candidate;
        });

        if (currentLine) {
            lines.push(currentLine.trim());
        }

        if (lines.length <= Math.max(1, maxLines)) {
            return lines.join('\n');
        }

        const kept = lines.slice(0, Math.max(1, maxLines));
        kept[Math.max(1, maxLines) - 1] = lines.slice(Math.max(1, maxLines) - 1).join(' ').trim();
        return kept.join('\n');
    }

    wrapTextForExport(text, style = {}, videoInfo = {}, maxLines = 2) {
        return String(text || '')
            .split(/\r?\n/)
            .map(line => this.wrapSingleLine(line, style, videoInfo, maxLines))
            .join('\n');
    }

    sanitizeWordTimings(words) {
        if (!Array.isArray(words) || words.length === 0) return [];
        return words
            .filter(Boolean)
            .map((word) => ({
                text: String(word.text || ''),
                start: Number(word.start ?? 0),
                end: Number(word.end ?? word.start ?? 0)
            }))
            .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
    }

    buildExportTracksData(tracksToBurn, { showOriginal, showTranslation } = {}) {
        return tracksToBurn.map((track) => {
            const trackStyle = track.style || this.flow.styleManager?.currentStyle || {};
            const keepWordTimings = !!trackStyle.enableKaraoke || trackStyle.animation === 'karaoke';
            const processedSubtitles = (track.subtitles || []).map((sub, index) => {
                const orig = String(sub.originalText || sub.text || '');
                const trans = String(sub.translatedText || '');
                let exportText = '';
                let karaokeText = '';
                let karaokeSecondaryText = '';

                if (showOriginal && showTranslation) {
                    exportText = trans ? `${orig}\n${trans}` : orig;
                    karaokeText = orig;
                    karaokeSecondaryText = trans;
                } else if (showOriginal) {
                    exportText = orig;
                    karaokeText = orig;
                } else if (showTranslation) {
                    exportText = trans || orig;
                    karaokeText = trans || orig;
                } else {
                    exportText = trans || orig;
                    karaokeText = trans || orig;
                }

                return {
                    id: sub.id || `${track.id || 'track'}_${index}`,
                    start: Number(sub.start ?? 0),
                    end: Number(sub.end ?? sub.start ?? 0),
                    text: exportText,
                    karaokeText,
                    karaokeSecondaryText,
                    words: keepWordTimings ? this.sanitizeWordTimings(sub.words) : []
                };
            });

            return {
                id: track.id,
                type: track.type,
                subtitles: processedSubtitles,
                style: trackStyle
            };
        });
    }

    getSourceSegmentsForExport() {
        const duration = Math.max(0, Number(this.flow.videoFile?.duration || 0));
        const segments = this.flow.normalizeSourceSegments?.(this.flow.sourceSegments) || [];

        if (!segments.length && duration > 0) {
            return [{ start: 0, end: duration }];
        }

        return segments.map((segment) => ({
            start: Number(segment.start || 0),
            end: Number(segment.end || 0)
        }));
    }

    buildTrimTimelineSegments(sourceSegments = []) {
        let cursor = 0;
        return sourceSegments.map((segment) => {
            const start = Number(segment.start || 0);
            const end = Number(segment.end || start);
            const duration = Math.max(0, end - start);
            const mapped = {
                sourceStart: start,
                sourceEnd: end,
                timelineStart: cursor,
                timelineEnd: cursor + duration,
                duration
            };
            cursor += duration;
            return mapped;
        }).filter((segment) => segment.duration >= 0.01);
    }

    remapWordTimings(words = [], segment) {
        if (!Array.isArray(words) || !segment) return [];

        return words.reduce((mapped, word) => {
            const start = Number(word.start ?? 0);
            const end = Number(word.end ?? start);
            const overlapStart = Math.max(start, segment.sourceStart);
            const overlapEnd = Math.min(end, segment.sourceEnd);
            if (overlapEnd <= overlapStart) {
                return mapped;
            }

            mapped.push({
                ...word,
                start: segment.timelineStart + (overlapStart - segment.sourceStart),
                end: segment.timelineStart + (overlapEnd - segment.sourceStart)
            });
            return mapped;
        }, []);
    }

    remapTrackToSourceSegments(track, trimTimelineSegments = []) {
        if (!track || !Array.isArray(track.subtitles) || !trimTimelineSegments.length) {
            return { ...track, subtitles: [] };
        }

        const remappedSubtitles = [];

        track.subtitles.forEach((sub, index) => {
            const originalStart = Number(sub.start ?? 0);
            const originalEnd = Number(sub.end ?? originalStart);

            trimTimelineSegments.forEach((segment) => {
                const overlapStart = Math.max(originalStart, segment.sourceStart);
                const overlapEnd = Math.min(originalEnd, segment.sourceEnd);
                if (overlapEnd <= overlapStart) {
                    return;
                }

                const mappedSub = {
                    ...sub,
                    id: `${sub.id || `${track.id || 'track'}_${index}`}_${Math.round(segment.sourceStart * 1000)}`,
                    start: segment.timelineStart + (overlapStart - segment.sourceStart),
                    end: segment.timelineStart + (overlapEnd - segment.sourceStart)
                };

                if (Array.isArray(sub.words) && sub.words.length) {
                    mappedSub.words = this.remapWordTimings(sub.words, segment);
                }

                if (track.type === 'audio') {
                    const baseAudioStart = Number.isFinite(Number(sub.audioStartOffset))
                        ? Number(sub.audioStartOffset)
                        : originalStart;
                    const baseAudioEnd = Number.isFinite(Number(sub.audioEndOffset))
                        ? Number(sub.audioEndOffset)
                        : (baseAudioStart + Math.max(0, originalEnd - originalStart));

                    mappedSub.audioStartOffset = baseAudioStart + (overlapStart - originalStart);
                    mappedSub.audioEndOffset = baseAudioEnd - (originalEnd - overlapEnd);
                }

                remappedSubtitles.push(mappedSub);
            });
        });

        return {
            ...track,
            subtitles: remappedSubtitles
        };
    }

    remapTracksToSourceSegments(tracksData = [], sourceSegments = []) {
        const trimTimelineSegments = this.buildTrimTimelineSegments(sourceSegments);
        if (!trimTimelineSegments.length) {
            return [];
        }

        return tracksData
            .map((track) => this.remapTrackToSourceSegments(track, trimTimelineSegments))
            .filter((track) => Array.isArray(track.subtitles) && track.subtitles.length > 0);
    }

    getTrimmedDuration(sourceSegments = []) {
        return sourceSegments.reduce((total, segment) => {
            return total + Math.max(0, Number(segment.end || 0) - Number(segment.start || 0));
        }, 0);
    }

    init() {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
            console.log('[SubtitleExportHandler] Initializing UI components...');
        }
        
        // Modal elements
        this.modal = document.getElementById('subtitle-export-modal');
        this.btnClose = document.getElementById('btn-close-export-modal');
        this.btnCancel = document.getElementById('btn-cancel-export');
        this.btnConfirm = document.getElementById('btn-confirm-export');
        this.btnChangePath = document.getElementById('btn-export-change-path');
        
        // Inputs
        this.formatSelect = document.getElementById('export-format-select');
        this.typeSelect = document.getElementById('export-type-select');
        this.exportPathInput = document.getElementById('export-output-path');

        this.bindEvents();
    }

    bindEvents() {
        if (this.btnClose) this.btnClose.onclick = () => this.hideModal();
        if (this.btnCancel) this.btnCancel.onclick = () => this.hideModal();
        if (this.btnConfirm) this.btnConfirm.onclick = () => this.handleConfirm();
        if (this.btnChangePath) this.btnChangePath.onclick = () => this.selectOutputPath();
        
        // Optional: Hide on overlay click
        if (this.modal) {
            this.modal.onclick = (e) => {
                if (e.target === this.modal) this.hideModal();
            };
        }
    }

    /**
     * Pre-burn checklist: empty cues, pending review, QC issues, etc.
     */
    buildPreBurnReport(tracksToBurn = []) {
        const allSubs = [];
        tracksToBurn.forEach((track) => {
            (track.subtitles || []).forEach((sub, index) => {
                allSubs.push({ sub, index, trackName: track.name || track.id });
            });
        });

        let emptyText = 0;
        let pending = 0;
        let needsWork = 0;
        let zeroDuration = 0;

        allSubs.forEach(({ sub }) => {
            const orig = String(sub.originalText || sub.text || '').trim();
            const trans = String(sub.translatedText || '').trim();
            if (!orig && !trans) emptyText += 1;
            if (sub.reviewStatus === 'needs-work') needsWork += 1;
            else if (!sub.reviewStatus || sub.reviewStatus === 'pending') pending += 1;
            if (!Number.isFinite(sub.start) || !Number.isFinite(sub.end) || sub.end <= sub.start) {
                zeroDuration += 1;
            }
        });

        // Refresh QC scan if available
        let qcCount = 0;
        try {
            const qc = this.flow.qualityHandler;
            if (qc?.runQC) {
                const errors = qc.runQC() || [];
                qcCount = errors.length;
            } else if (qc?.errors) {
                qcCount = qc.errors.length;
            }
        } catch (_) { /* ignore */ }

        const lines = [];
        if (emptyText > 0) lines.push(`空文本 ${emptyText} 条`);
        if (zeroDuration > 0) lines.push(`无效时长 ${zeroDuration} 条`);
        if (pending > 0) lines.push(`待审 ${pending} 条`);
        if (needsWork > 0) lines.push(`需重做 ${needsWork} 条`);
        if (qcCount > 0) lines.push(`质检问题 ${qcCount} 项`);

        return {
            total: allSubs.length,
            emptyText,
            pending,
            needsWork,
            zeroDuration,
            qcCount,
            lines,
            hasWarnings: lines.length > 0
        };
    }

    /**
     * Start the burn process (wrapper for button click)
     */
    async startBurnProcess() {
        if (this.flow.isProcessing) return;
        if (!this.flow.videoFile) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.noFile'), 'warning');
            return;
        }

        // Get tracks to burn (all non-empty tracks)
        const tracksToBurn = this.flow.tracks.filter(t => t.subtitles && t.subtitles.length > 0);
        if (tracksToBurn.length === 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.noSubData'), 'warning');
            return;
        }

        const report = this.buildPreBurnReport(tracksToBurn);
        if (report.hasWarnings) {
            const titleKey = 'subtitle.export.precheck_title';
            const titleRaw = window.i18n?.t?.(titleKey, { count: report.total });
            const header = (titleRaw && titleRaw !== titleKey)
                ? titleRaw
                : `合成前检查（共 ${report.total} 条）`;
            const body = report.lines.map((l) => `· ${l}`).join('\n');
            const footerKey = 'subtitle.export.precheck_continue';
            const footer = window.i18n?.t?.(footerKey);
            const ask = (footer && footer !== footerKey)
                ? footer
                : '仍要继续合成吗？';
            const message = `${header}\n${body}\n\n${ask}`;
            const ok = window.app?.showConfirm
                ? await window.app.showConfirm(message)
                : window.confirm(message);
            if (!ok) {
                // Jump user into first fixable issue instead of dead-end cancel
                this.focusFirstPreBurnIssue(report);
                return;
            }
        }

        this.tracksToBurn = tracksToBurn; // Store for handleConfirm
        this.showModal();
    }

    focusFirstPreBurnIssue(report = {}) {
        const qc = this.flow.qualityHandler;
        let errors = [];
        try {
            errors = qc?.runQC?.() || qc?.errors || [];
            this.flow.updateQCUI?.(errors);
        } catch (_) { /* ignore */ }

        if (errors.length > 0) {
            const idx = Number(errors[0]?.index);
            if (Number.isFinite(idx)) {
                this.flow.editor?.focusSubtitle?.(idx, true, false);
                this.flow.editor?.renderer?.scrollToIndex?.(idx);
            }
            window.app?.showToast?.('已定位到第一个质检问题，修好后可再合成', 'info');
            return;
        }

        // Fall back: first empty / needs-work / pending cue on active track
        const subs = this.flow.editor?.subtitles || [];
        const target = subs.findIndex((sub) => {
            const orig = String(sub.originalText || sub.text || '').trim();
            const trans = String(sub.translatedText || '').trim();
            if (!orig && !trans) return true;
            if (sub.reviewStatus === 'needs-work') return true;
            if (!sub.reviewStatus || sub.reviewStatus === 'pending') return true;
            if (!Number.isFinite(sub.start) || !Number.isFinite(sub.end) || sub.end <= sub.start) return true;
            return false;
        });
        if (target >= 0) {
            this.flow.editor?.focusSubtitle?.(target, true, true);
            this.flow.editor?.renderer?.scrollToIndex?.(target);
            window.app?.showToast?.('已定位到待处理字幕', 'info');
        }
    }

    async showModal() {
        if (!this.modal) this.init(); // Lazy init if needed

        // Sync initial path
        let currentPath = this.flow.outputPath?.value || this.flow.preferences?.outputPath;
        
        // If no path, try to get default
        if (!currentPath) {
            currentPath = await this.getDefaultOutputPath();
        }

        if (this.exportPathInput) {
            this.exportPathInput.value = currentPath || '';
            // 鍚屾椂鏇存柊 flow.outputPath 浠ラ槻鍏跺畠鍦版柟寮曠敤
            if (this.flow.outputPath) this.flow.outputPath.value = currentPath || '';
        }

        if (!this.modal || !this.modal.classList) {
            return this.runBurnProcess(this.tracksToBurn, {
                outputDir: currentPath,
                format: this.formatSelect?.value || 'mp4',
                type: this.typeSelect?.value || 'video_audio'
            });
        }

        this.modal.classList.remove('hidden');
    }

    hideModal() {
        if (this.modal) this.modal.classList.add('hidden');
    }

    async getDefaultOutputPath() {
        try {
            const downloadDir = await window.mediaflow?.store?.get('downloadPath');
            if (downloadDir) {
                const baseSubDir = 'MediaFlow';
                const subDir = 'SubtitleBurn';

                const mediaFlowPath = await window.mediaflow.path.join(downloadDir, baseSubDir);
                await window.mediaflow?.fs?.mkdir(mediaFlowPath);

                const outputDir = await window.mediaflow.path.join(mediaFlowPath, subDir);
                await window.mediaflow?.fs?.mkdir(outputDir);
                
                return outputDir;
            }
        } catch (e) {
            console.error('Failed to get default output path:', e);
        }
        return null;
    }

    async selectOutputPath() {
        const selected = await window.mediaflow?.dialog?.selectFolder?.();
        if (selected && this.exportPathInput) {
            this.exportPathInput.value = selected;
            if (this.flow.outputPath) this.flow.outputPath.value = selected;
            
            // Auto save to preferences
            if (this.flow.preferenceManager) {
                this.flow.preferenceManager.updatePreferences({ outputPath: selected });
            }
        }
    }

    async handleConfirm() {
        const outputDir = this.exportPathInput?.value;
        if (!outputDir) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.noFile'), 'warning');
            return;
        }

        const format = this.formatSelect?.value || 'mp4';
        const type = this.typeSelect?.value || 'video_audio';

        this.hideModal();
        await this.runBurnProcess(this.tracksToBurn, { outputDir, format, type });
    }

    async runBurnProcess(tracksToBurn, options = {}) {
        const { outputDir, format = 'mp4', type = 'video_audio' } = options;
        
        this.flow.isProcessing = true;

        // --- 鍚屾褰撳墠缂栬緫鍣ㄥ唴瀹瑰埌缂撳瓨 ---
        if (this.flow.batchHandler && this.flow.videoFile) {
            this.flow.batchHandler.saveCurrentToCache(this.flow.videoFile.path);
        }

        this.flow.showProgress(window.i18n.t('subtitle.messages.burnStart'));

        try {
            // 鏍规嵁閫夊畾鏍煎紡鐢熸垚鏂囦欢鍚?
            const baseName = this.flow.videoFile.name.split('.').slice(0, -1).join('.');
            const fileName = `subbed_${baseName}.${format}`;
            const outputPath = await window.mediaflow.path.join(outputDir, fileName);
            const videoInfo = this.getVideoInfo();

            const displayMode = this.flow.timeline?.displayMode || 'translated';
            const showOriginal = displayMode === 'original' || displayMode === 'bilingual';
            const showTranslation = displayMode !== 'original';

            const tracksData = this.buildExportTracksData(tracksToBurn, {
                showOriginal,
                showTranslation
            });
            const sourceSegments = this.getSourceSegmentsForExport();
            const hasSourceTrim = this.flow.hasSourceTrim?.() && sourceSegments.length > 0;
            const exportTracksData = hasSourceTrim
                ? this.remapTracksToSourceSegments(tracksData, sourceSegments)
                : tracksData;

            if (!exportTracksData.length) {
                throw new Error(this.translateOrFallback(
                    'subtitle.toast.no_exportable_segments_after_trim',
                    'No subtitle or dubbing clips remain inside the kept source segments.'
                ));
            }

            // Blur Settings
            let blurSettings = null;
            let blurMasks = [];

            const blurStyle = this.flow.styleManager?.currentStyle || {};
            const blurEnabled = !!(
                this.flow.styleManager?.blurOriginal?.checked ??
                blurStyle.blurOriginal
            );

            if (blurEnabled) {
                blurSettings = {
                    position: 'custom',
                    height: parseInt(blurStyle.blurMasks?.[0]?.height || 10, 10),
                    strength: parseInt(blurStyle.blurMasks?.[0]?.strength || 10, 10)
                };

                if (Array.isArray(blurStyle.blurMasks) && blurStyle.blurMasks.length > 0) {
                    blurMasks = JSON.parse(JSON.stringify(blurStyle.blurMasks));
                }
            }

            // TTS Settings
            let ttsSettings = null;
            // 濡傛灉瀵煎嚭绫诲瀷鍖呭惈闊抽锛坴ideo_audio 鎴?audio_only锛夛紝涓旂敤鎴峰紑鍚簡 TTS
            const needAudio = (type === 'video_audio' || type === 'audio_only');
            
            if (needAudio && this.flow.ttsHandler && this.flow.enableTTS?.checked) {
                const ttsInfo = this.flow.ttsHandler.getSettings();
                this.flow.showProgress(window.i18n.t('subtitle.messages.ttsGenerate'));
                const mainTrack = exportTracksData.find(t => t.type === 'main');

                if (mainTrack && mainTrack.subtitles && mainTrack.subtitles.length > 0) {
                    try {
                        const ttsPath = await this.flow.ttsHandler.generateBatch(mainTrack.subtitles);
                        if (ttsPath) {
                            ttsSettings = {
                                armed: true,
                                enabled: true,
                                audioPath: ttsPath,
                                audioMode: type === 'audio_only' ? 'tts_only' : ttsInfo.audioMode,
                                voiceVolume: (ttsInfo.volume || 80) / 100,
                                bgmVolume: (ttsInfo.bgmVolume || 30) / 100
                            };
                        }
                    } catch (e) {
                        console.error('TTS Generation failed:', e);
                        window.app?.showToast?.(window.i18n.t('subtitle.messages.ttsFailed'), 'warning');
                    }
                }
            } else if (type === 'video_only') {
                // 濡傛灉鏄€滀粎瑙嗛鈥濓紝寮哄埗绂佺敤闊抽杈撳嚭锛堝悗绔€昏緫寰呴厤鍚堬級
                ttsSettings = { armed: true, enabled: false, audioMode: 'mute' };
            }

            this.flow.showProgress(window.i18n.t('subtitle.messages.burnStart'));

            // Listener for progress
            const onProgress = (data) => {
                this.flow.updateProgress(data, window.i18n.t('subtitle.messages.burnStart'));
            };

            let cleanupListener = null;
            if (window.mediaflow?.subtitle?.onBurnProgress) {
                cleanupListener = window.mediaflow.subtitle.onBurnProgress(onProgress);
            }

            try {
                this._cancelPending = false;
                // Call Backend Burn
                await window.mediaflow.subtitle.burn({
                    videoPath: this.flow.videoFile.path,
                    duration: hasSourceTrim ? this.getTrimmedDuration(sourceSegments) : this.flow.videoFile.duration,
                    width: videoInfo.width,
                    height: videoInfo.height,
                    tracks: exportTracksData,
                    blurSettings: blurSettings,
                    blurMasks: blurMasks,
                    ttsSettings: ttsSettings,
                    isMirrored: this.flow.isMirrored || false,
                    cropSettings: this.flow.cropSettings || null,
                    outputPath: outputPath,
                    sourceSegments: hasSourceTrim ? sourceSegments : null,
                    exportType: type // 閫忎紶瀵煎嚭绫诲瀷缁欏悗绔?
                });

                this.flow.updateProgress(100, window.i18n.t('subtitle.messages.burnDone'));
                window.app?.showToast?.(window.i18n.t('subtitle.messages.processDone'), 'success');
            } finally {
                if (cleanupListener) cleanupListener();
            }

        } catch (error) {
            if (error?.code === 'SUBTITLE_BURN_CANCELLED') {
                window.app?.showToast?.(this.translateOrFallback('subtitle.messages.processCancelled', '已停止渲染任务'), 'warning');
                return;
            }
            console.error('[SubtitleFlow] Burn error:', error);
            window.app?.showToast?.(window.i18n.t('subtitle.messages.processFailedAction') + error.message, 'error');
        } finally {
            this._cancelPending = false;
            this.flow.isProcessing = false;
            this.flow.hideProgress();
        }
    }

    async cancelProcess() {
        if (this._cancelPending || !this.flow.isProcessing) return;

        this._cancelPending = true;
        this.flow.updateProgress(0, window.i18n.t('subtitle.messages.burnStart') + ' - stopping');

        try {
            await window.mediaflow?.subtitle?.cancel?.();
        } catch (error) {
            console.error('[SubtitleFlow] Cancel burn failed:', error);
        } finally {
            this._cancelPending = false;
        }
    }

}

window.SubtitleExportHandler = SubtitleExportHandler;





