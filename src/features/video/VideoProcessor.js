/**
 * VideoProcessor.js (Controller)
 * 重构后的视频处理控制器，协调 Service 和 UI 层
 */
class VideoProcessor {
    constructor(core) {
        this.core = core; // Reference to CreatorFlow
        this.service = new window.VideoService();
        this.ui = new window.VideoUIManager(this);
        this._batchProgressCallbacks = {}; // taskId -> callback
        this._showSuccess = (message, path) => {
            if (typeof this.ui.showSuccess === 'function') {
                this.ui.showSuccess(message, path);
                return;
            }

            if (typeof this.ui.showToast === 'function') {
                this.ui.showToast(message, 'success');
            }
        };
    }

    t(key, fallback, params) {
        const translated = window.i18n?.t?.(key, params);
        if (!translated || translated === key) {
            return fallback;
        }
        return translated;
    }

    init() {
        this.ui.init();

        // 注册进度监听
        const handleProgress = (data, defaultStatus) => {
            if (data.taskId && this._batchProgressCallbacks?.[data.taskId]) {
                this._batchProgressCallbacks[data.taskId](data.progress);
            } else {
                this.core.updateProgress(data.progress || data, defaultStatus);
            }
        };

        const videoApi = window.mediaflow?.video;
        const registerProgress = (methodName, callback) => {
            if (typeof videoApi?.[methodName] === 'function') {
                videoApi[methodName](callback);
            }
        };

        registerProgress('onMergeProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusMergingVideos', 'Merging videos...'));
        });

        registerProgress('onCompressProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusCompressing', 'Compressing video...'));
        });

        registerProgress('onConvertProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusConverting', 'Converting format...'));
        });

        registerProgress('onVerticalProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusVerticaling', 'Applying vertical effect...'));
        });

        registerProgress('onSpeedProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusSpeeding', 'Adjusting speed...'));
        });

        registerProgress('onGIFProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusGifing', 'Generating GIF...'));
        });

        registerProgress('onTransformProgress', (data) => {
            handleProgress(data, this.t('creator.video.statusTransforming', 'Processing transformation...'));
        });

        if (typeof window.mediaflow?.creator?.onProgress === 'function') {
            window.mediaflow.creator.onProgress((data) => {
                if (!data || (data.scope !== 'export' && !data.stage)) return;
                this.ui.updateProgress(
                    data.progress || 0,
                    data.message || this.t('creator.video.statusMergingProject', 'Exporting project...')
                );
            });
        }
    }


    applyTransition(type, duration) {
        const timeline = this.core.timelineManager;
        if (!timeline) return;

        const trackId = timeline.selectedTrackId;
        const index = timeline.selectedTransitionIndex;

        if (index === -1) {
            this.ui.showToast(window.i18n?.t('creator.video.selectTransition') || 'Please select a transition point on the timeline first', 'warning');
            return;
        }

        const segments = timeline.tracks[trackId].segments;
        if (index >= segments.length) return;

        segments[index].transition = { id: type, duration: duration };
        this.ui.showToast(window.i18n?.t('creator.video.transitionSet') || '✨ Transition set! Preview in real-time during playback, high quality render on export.', 'success');

        timeline.renderVideoTracks(); // Refresh visual state
    }

    /**
     * Render the entire timeline project
     */
    async renderProject(options = {}) {
        if (window.TimelineProjectSnapshot && window.CreatorExportPlanner && window.mediaflow?.creator?.export) {
            let shouldFallbackToLegacyExport = false;
            const hasPrimaryMedia = !!(this.core.videoFile && (typeof this.core.videoFile === 'string' || this.core.videoFile.path));
            if ((!hasPrimaryMedia && !this.core.isAudioOnly) || this.core.isProcessing) {
                if (!hasPrimaryMedia && !this.core.isAudioOnly) {
                    this.ui.showToast(window.i18n?.t('creator.toasts.loadVideoFirst') || 'Please load a video file first', 'warning');
                }
                return;
            }

            try {
                const exportType = this.core.isAudioOnly ? 'audio' : (options.type || 'video+audio');
                const format = exportType === 'audio' ? 'mp3' : 'mp4';
                const defaultExt = exportType === 'audio' ? 'mp3' : 'mp4';
                const defaultName = (this.core.videoFile?.name || this.core.audioFile?.name || 'creator_project')
                    .replace(/\.[^.]+$/, `_export.${defaultExt}`);

                let savePath = options.savePath;
                if (savePath) {
                    const exists = await window.mediaflow?.shell?.fileExists?.(savePath);
                    const looksLikeDirectory = exists && !/\.[^\\/]+$/.test(savePath);
                    if (looksLikeDirectory) {
                        savePath = await window.mediaflow?.path?.join(savePath, defaultName);
                    }
                }

                if (!savePath) {
                    savePath = await this.ui.askSavePath({
                        title: window.i18n?.t('creator.video.exportTitle') || 'Export Project',
                        defaultPath: defaultName,
                        filters: [
                            { name: exportType === 'audio' ? 'Audio' : 'Video', extensions: [defaultExt] }
                        ]
                    });
                }
                if (!savePath) return;

                const snapshot = window.TimelineProjectSnapshot.create(this.core);
                const planner = new window.CreatorExportPlanner(window.CreatorExportCapabilityMatrix);
                const job = planner.buildJob(snapshot, {
                    type: exportType,
                    format,
                    outputPath: savePath
                });

                this._currentCreatorExportJobId = job.jobId;
                this.ui.showProgress(
                    this.t('creator.video.statusMergingProject', 'Preparing export...'),
                    0,
                    true,
                    () => window.mediaflow?.creator?.cancel?.(job.jobId)
                );

                const result = await window.mediaflow.creator.export(job);
                if (!result?.success) {
                    if (result?.action === 'cancel') {
                        return { success: false, action: 'cancel' };
                    }

                    const exportError = new Error(result?.error || (window.i18n?.t('creator.video.errorMerge') || 'Export failed'));
                    if (result?.details) {
                        exportError.stack = result.details;
                    }
                    throw exportError;
                }

                this.ui.showSuccess(window.i18n?.t('creator.video.projectExportDone') || 'Project exported successfully!', savePath);
                return { success: true };
            } catch (error) {
                const errorMsg = error.message || '';
                const isMissingCreatorExportHandler = errorMsg.includes('No handler registered for \'creator:export\'')
                    || errorMsg.includes('Error invoking remote method \'creator:export\'');
                const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
                if (isCancel) {
                    return { success: false, action: 'cancel' };
                }

                if (isMissingCreatorExportHandler) {
                    shouldFallbackToLegacyExport = true;
                    console.warn('[VideoProcessor] creator:export handler unavailable, falling back to legacy export path');
                } else {
                    console.error('[VideoProcessor] Render error:', error);
                    const summary = window.ErrorUtils?.formatError ? window.ErrorUtils.formatError(error) : errorMsg;
                    this.ui.showToast((window.i18n?.t('creator.video.mergeFail') || 'Merge Failed') + ': ' + summary, 'error');
                    if (typeof this.ui.showErrorDetails === 'function') {
                        this.ui.showErrorDetails(
                            window.i18n?.t('creator.video.mergeFail') || 'Merge Failed',
                            summary,
                            error.stack || errorMsg
                        );
                    }
                    return { success: false, error: errorMsg };
                }

            } finally {
                this._currentCreatorExportJobId = null;
                this.ui.hideProgress();
            }

            if (!shouldFallbackToLegacyExport) {
                return;
            }
        }

        const hasVideoPath = !!(this.core.videoFile && (typeof this.core.videoFile === 'string' || this.core.videoFile.path));
        if ((!hasVideoPath && !this.core.isAudioOnly) || this.core.isProcessing) {
            if (!hasVideoPath && !this.core.isAudioOnly) {
                this.ui.showToast(window.i18n?.t('creator.toasts.loadVideoFirst') || 'Please load a video file first', 'warning');
            }
            return;
        }

        const timeline = this.core.timelineManager;
        if (!timeline) return;

        // [NEW] 动态确定主轨：音频模式看 a1，视频模式看 v1
        const primaryTrackId = this.core.isAudioOnly ? 'a1' : 'v1';
        const segments = timeline.tracks[primaryTrackId]?.segments || [];
        
        if (segments.length === 0) {
            this.ui.showToast(window.i18n?.t('creator.video.timelineEmpty') || 'Timeline is empty, please add segments first', 'warning');
            return;
        }

        // Options from Modal
        const format = options.format || 'mp4';
        const exportType = options.type || 'video+audio'; // 'video+audio', 'video', 'audio'
        let savePath = options.savePath;

        // Convert timeline segments to source segments for multiClip
        const orderedSegments = [...segments].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            if (a.end !== b.end) return a.end - b.end;
            return (a.sourceStart || 0) - (b.sourceStart || 0);
        });

        const sourceSegments = orderedSegments.map(s => {
            const duration = s.end - s.start;
            return {
                start: s.sourceStart || 0,
                end: (s.sourceStart || 0) + duration,
                name: s.name
            };
        });

        try {
            // Check if savePath is just a directory and reconstruct if needed
            if (savePath) {
                const isDir = await window.mediaflow?.shell.fileExists(savePath).then(async (exists) => {
                    if (!exists) return false;
                    // Check if it's a directory by testing if we can write a dummy file or use a separate API if available
                    // For safety, if it doesn't have an extension, assume it's a directory
                    return !savePath.includes('.');
                });

                if (isDir) {
                    const defaultExt = (exportType === 'audio' || this.core.isAudioOnly) ? 'mp3' : format;
                    const fileName = (this.core.videoFile?.name || 'audio_project').replace(/\.[^.]+$/, `_export.${defaultExt}`);
                    savePath = await window.mediaflow?.path.join(savePath, fileName);
                }
            }

            // If no savePath provided, ask user
            if (!savePath) {
                const defaultExt = (exportType === 'audio' || this.core.isAudioOnly) ? 'mp3' : format;
                savePath = await this.ui.askSavePath({
                    title: window.i18n?.t('creator.video.exportTitle') || 'Export Project',
                    defaultPath: (this.core.videoFile?.name || 'audio_project').replace(/\.[^.]+$/, `_export.${defaultExt}`),
                    filters: [
                        { name: (exportType === 'audio' || this.core.isAudioOnly) ? 'Audio' : 'Video', extensions: [defaultExt] }
                    ]
                });
            }
            if (!savePath) return;

            const hasTransitions = orderedSegments.some(s => s.transition && s.transition.id !== 'none');
            const hasSpeed = orderedSegments.some(s => s.speed && s.speed !== 1.0);
            const t = (key, fallback, params) => this.t(key, fallback, params);

            this.ui.showProgress(
                t('creator.video.statusMergingProject', `Composing project (${sourceSegments.length} segments)...`, { count: sourceSegments.length }),
                0,
                true,
                () => window.mediaflow?.video.cancel()
            );

            let result;

            // Temporary path if we need to post-process (e.g. mute, extract audio, or mix external audio tracks)
            const extraAudioTracks = [];
            if (exportType === 'video+audio') {
                const volAudio = (document.getElementById('mix-vol-audio')?.value || 100) / 100;
                
                // 遍历所有音频轨道 (a1, a2, a3...)
                Object.keys(timeline.tracks).forEach(trackId => {
                    if (trackId.startsWith('a')) {
                        const track = timeline.tracks[trackId];
                        // 收集该轨道上的所有片段
                        track.segments.forEach(seg => {
                            const file = seg.file || this.core.videoFile;
                            // 只有当片段使用了外部文件，或者片段并非覆盖全长的原视频音轨时才视为额外音轨
                            if (file?.path) {
                                // 如果是原视频的音源，通常在 [0:a] 处理，除非用户对其进行了剪辑/位移
                                // 但为了统一逻辑，除原视频完整音轨外，其余均作为 extra 处理
                                const isFullOriginalAudio = (file.path === this.core.videoFile.path && seg.start === 0 && seg.end === this.core.videoDuration);
                                
                                if (!isFullOriginalAudio) {
                                    extraAudioTracks.push({
                                        path: file.path,
                                        volume: seg.volume !== undefined ? seg.volume : volAudio,
                                        timelineStart: seg.start,
                                        sourceStart: seg.sourceStart || 0,
                                        sourceEnd: (seg.sourceStart || 0) + (seg.end - seg.start) * (seg.speed || 1.0),
                                        speed: seg.speed || 1.0
                                    });
                                }
                            }
                        });
                    }
                });
            }
            const needsPostProcess = exportType !== 'video+audio' || extraAudioTracks.length > 0;
            
            const getPath = (f) => (typeof f === 'string' ? f : f?.path);
            const inputFilePath = getPath(segments[0]?.file) || getPath(this.core.videoFile);
            
            if (!inputFilePath) throw new Error('No source file found for rendering');

            let renderPath = savePath;
            if (needsPostProcess) {
                // Ensure temp path has correct extension for merge/clip stage
                // [修复] 如果是音频模式，中间渲染强制使用 .m4a 容器
                // 原因：后端 multiClip 倾向于使用 AAC 编码，.mp3 容器不支持 AAC 会导致导出失败
                const tempExt = (exportType === 'audio' || this.core.isAudioOnly) ? 'm4a' : format;
                renderPath = savePath.replace(/\.[^.]+$/, `_tmp_render.${tempExt}`);
            }

            if (sourceSegments.length === 1 && !hasTransitions && !hasSpeed) {
                const onlySegment = sourceSegments[0];
                result = await this.service.clip(inputFilePath, renderPath, onlySegment.start, onlySegment.end, {
                    accurate: true
                });
            } else if (hasTransitions || hasSpeed) {
                result = await this.renderProjectWithTransitions(inputFilePath, renderPath, sourceSegments, orderedSegments);
            } else {
                result = await this.service.multiClip(inputFilePath, renderPath, sourceSegments, {
                    accurate: true
                });
            }

            if (!result?.success) {
                throw new Error(result?.error || (window.i18n?.t('creator.video.errorMerge') || 'Export failed'));
            }

            // Post-processing for Mute, Audio Extract, or Audio Mixing
            if (extraAudioTracks.length > 0) {
                this.ui.updateProgress(85, t('creator.video.statusMixingAudio', 'Mixing audio tracks...'));
                const volVideo = (document.getElementById('mix-vol-video')?.value || 100) / 100;
                const durationMode = document.getElementById('mix-duration-mode')?.value || 'longest';

                const mixResult = await window.mediaflow?.creator.mixMultiple({
                    videoPath: renderPath,
                    audioTracks: extraAudioTracks,
                    outputPath: savePath,
                    videoVolume: volVideo,
                    durationMode: durationMode
                });
                if (window.mediaflow?.file?.deleteFile) window.mediaflow.file.deleteFile(renderPath);
                if (!mixResult?.success) throw new Error(mixResult?.error || 'Failed to mix audio tracks');
            } else if (exportType === 'audio') {
                this.ui.updateProgress(90, t('creator.video.statusExtractingAudio', 'Extracting audio...'));
                const extractResult = await this.service.convert(renderPath, savePath, 'mp3', 'high');
                if (window.mediaflow?.file?.deleteFile) window.mediaflow.file.deleteFile(renderPath);
                if (!extractResult.success) throw new Error(extractResult.error || 'Failed to extract audio');
            } else if (exportType === 'video') {
                this.ui.updateProgress(90, t('creator.video.statusMuting', 'Removing audio...'));
                const muteResult = await this.service.removeAudio(renderPath, savePath);
                if (window.mediaflow?.file?.deleteFile) window.mediaflow.file.deleteFile(renderPath);
                if (!muteResult.success) throw new Error(muteResult.error || 'Failed to remove audio');
            }

            this.ui.showSuccess(window.i18n?.t('creator.video.projectExportDone') || 'Project exported successfully!', savePath);
            return { success: true };
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            console.error('[VideoProcessor] Render error:', errorMsg);
            this.ui.showToast((window.i18n?.t('creator.video.mergeFail') || 'Merge Failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
        } finally {
            this.ui.hideProgress();
        }
    }

    /**
     * Render project with transitions by generating temp clips and merging them
     */
    async renderProjectWithTransitions(inputPath, savePath, sourceSegments, timelineSegments) {
        const tempFiles = [];
        try {
            for (let i = 0; i < sourceSegments.length; i++) {
                const seg = sourceSegments[i];
                const tempPath = savePath.replace('.mp4', `_tmp_seg_${i}.mp4`);
                const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
                this.ui.updateProgress((i / sourceSegments.length) * 30, t('creator.video.statusClippingProgress', { current: i + 1, total: sourceSegments.length }));

                const clipResult = await this.service.clip(inputPath, tempPath, seg.start, seg.end, {
                    accurate: true
                });
                if (!clipResult?.success) throw new Error(window.i18n?.t('creator.video.errorClip') || `Clip ${i} failed`);

                // 应用片段倍速
                const segmentSpeed = timelineSegments[i].speed || 1.0;
                if (segmentSpeed !== 1.0) {
                    const speedTempPath = tempPath.replace('.mp4', `_speed_${i}.mp4`);
                    const speedResult = await this.service.changeSpeed(tempPath, speedTempPath, segmentSpeed);
                    if (speedResult?.success) {
                        // 清理原始剪裁件，并将变速后的文件作为后续合并源
                        window.mediaflow?.file?.deleteFile?.(tempPath);
                        tempFiles.push(speedTempPath);
                    } else {
                        tempFiles.push(tempPath); // 降级：使用原速
                    }
                } else {
                    tempFiles.push(tempPath);
                }
            }

            // Now merge them with transitions
            // The transition for segment i is what happens between tempFiles[i] and tempFiles[i+1]
            // We'll assume a global transition for simplicity if multiple aren't supported yet,
            // but VideoService.merge actually only supports ONE transition if it's the simple list merge.
            // TODO: Enhance VideoService/FFmpeg to support sequence transitions.
            // For now, we'll use the FIRST transition found as the global transition if they are all the same,
            // or just the first transition.
            const transition = timelineSegments.find(s => s.transition && s.transition.id !== 'none')?.transition || { id: 'none' };

            this.ui.updateProgress(40, window.i18n?.t('creator.video.statusMergingTransitions') || 'Generating transition effects...');
            return await this.service.merge(tempFiles, savePath, {
                transition: transition.id,
                forceReencode: true
            });
        } finally {
            // Cleanup
            for (const f of tempFiles) {
                window.mediaflow?.file?.deleteFile?.(f);
            }
        }
    }

    /**
     * 一键竖屏转换
     */
    async makeVertical(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath || (this.core.isProcessing && !options.isBatch)) {
            if (!options.isBatch && !inputPath) this.ui.showToast(window.i18n?.t('creator.toasts.loadVideoFirst') || 'Please load a video file first', 'warning');
            return;
        }

        const opts = this.ui.getUIOptions(options, {
            bgStyle: 'vertical-bg-style',
            quality: 'vertical-quality',
            bgColor: 'vertical-bg-color',
            blurRadius: 'vertical-blur-radius',
            scaleX: 'vertical-content-scale-x',
            scaleY: 'vertical-content-scale-y',
            contentScale: 'vertical-content-scale',   // 兼容旧版
            contentOffset: 'vertical-content-offset',
            offsetX: 'vertical-content-offset-x'
        });

        let cleanup = null;
        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveVertical') || 'Save Vertical Video',
                defaultPath: this.core.videoFile?.name.replace(/\.[^.]+$/, '_vertical.mp4'),
                filters: [{ name: 'Video', extensions: ['mp4'] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusInit') || 'Initializing...', 0, true, () => window.mediaflow?.video.cancel());

                // 监听竖屏进度
                if (typeof window.mediaflow?.video?.onVerticalProgress === 'function') {
                    cleanup = window.mediaflow.video.onVerticalProgress((data) => {
                        this.ui.updateProgress(data.progress, window.i18n?.t('creator.video.statusVerticaling') || 'Applying vertical effect...');
                    });
                }
            }

            // 处理带时间的竖屏 (先剪辑再转换)
            if (opts.startTime !== undefined && opts.endTime !== undefined) {
                const tempClipPath = savePath.replace('.mp4', '_temp_clip.mp4');
                this.ui.updateProgress(10, window.i18n?.t('creator.video.statusClipping') || 'Clipping segment...');

                const clipResult = await this.service.clip(inputPath, tempClipPath, opts.startTime, opts.endTime);
                if (!clipResult?.success) throw new Error(window.i18n?.t('creator.video.errorPreClip') || 'Pre-clip failed');

                this.ui.updateProgress(40, window.i18n?.t('creator.video.statusVerticaling') || 'Applying vertical effect...');
                const result = await this.service.makeVertical(tempClipPath, savePath, { ...opts, taskId: options.taskId });
                window.mediaflow?.file?.deleteFile?.(tempClipPath); // 清理临时文件

                if (!result?.success) throw new Error(result?.error || (window.i18n?.t('creator.video.errorConvert') || 'Conversion failed'));
            } else {
                this.ui.updateProgress(0, window.i18n?.t('creator.video.statusConverting') || 'Converting...');
                const result = await this.service.makeVertical(inputPath, savePath, { ...opts, taskId: options.taskId });
                if (!result?.success) throw new Error(result?.error || (window.i18n?.t('creator.video.errorConvert') || 'Conversion failed'));
            }

            this.ui.updateProgress(100, window.i18n?.t('creator.video.statusDone') || 'Done!');
            if (!options.isBatch) this._showSuccess(window.i18n?.t('creator.video.toastVerticalDone') || 'Vertical conversion completed!', savePath);
            return { success: true };
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            console.error('[VideoProcessor] Vertical error:', errorMsg);
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorConvert') || 'Conversion Failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (cleanup) cleanup();
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 快速剪辑
     */
    async smartClip(options = {}) {
        if (!this.core.videoFile?.path || this.core.isProcessing) return;

        const uiOpts = this.ui.getUIOptions(options, { format: 'clip-format' }) || {};
        const opts = { ...uiOpts, ...options };
        const format = opts.format || 'mp4';

        // 批量模式或右键菜单指定了时间
        if (opts.startTime !== undefined && opts.endTime !== undefined) {
            try {
                const savePath = options.savePath || await this.ui.askSavePath({
                    title: window.i18n?.t('creator.video.saveClip') || 'Save Clip Segment',
                    defaultPath: `clip_${opts.startTime}s_${opts.endTime}s.${format}`,
                    filters: [{ name: 'Video', extensions: [format] }]
                });
                if (!savePath) return;

                if (!options.isBatch) this.ui.showProgress(window.i18n?.t('creator.video.statusClipping') || 'Clipping...');
                const clipArgs = [this.core.videoFile.path, savePath, opts.startTime, opts.endTime];
                if (options.taskId !== undefined) clipArgs.push(options.taskId);
                const result = await this.service.clip(...clipArgs);

                if (result?.success) {
                    if (!options.isBatch) this._showSuccess(window.i18n?.t('creator.video.toastClipDone') || 'Clip completed!', savePath);
                    return { success: true };
                } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorClip') || 'Clip failed'));
            } catch (error) {
                const errorMsg = error.message || '';
                if (errorMsg.includes('CANCELLED_BY_USER') ||
                    errorMsg.includes('Process cancelled') ||
                    errorMsg.includes('Process killed') ||
                    errorMsg.includes('User canceled')) {
                    return { success: false, action: 'cancel' };
                }
                if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorClip') || 'Clip failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
                throw error;
            } finally {
                if (!options.isBatch) this.ui.hideProgress();
            }
        }

        // 回退到 UI 驱动的多段剪辑逻辑
        await this.handleMultiClipUI(options.merge !== false, {
            ...options,
            format,
            segments: opts.segments
        });
    }

    async handleMultiClipUI(merge = true, options = {}) {
        const format = options.format || document.getElementById('clip-format')?.value || 'mp4';
        const optionSegments = Array.isArray(options.segments) ? options.segments : [];
        const segments = optionSegments.length > 0
            ? optionSegments
            : (window.getClipSegments ? window.getClipSegments() : []);

        if (segments.length === 0) {
            const startTime = this.core.parseTime(document.getElementById('clip-start-time')?.value || '00:00:00');
            const endTime = this.core.parseTime(document.getElementById('clip-end-time')?.value || '00:00:10');
            await this.smartClip({ startTime, endTime, format });
            return;
        }

        if (merge) {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveMerged') || 'Save Merged Video',
                defaultPath: this.core.videoFile.name.replace(/\.[^.]+$/, `_merged.${format}`),
                filters: [{ name: 'Video', extensions: [format] }]
            });
            if (!savePath) return;

            try {
                this.ui.showProgress(
                    window.i18n?.t('creator.video.statusMerging', { count: segments.length }) || `Merging ${segments.length} segments...`,
                    0,
                    true,
                    () => window.mediaflow?.video.cancel()
                );
                const result = await this.service.multiClip(this.core.videoFile.path, savePath, segments);
                if (result?.success) {
                    this.ui.showSuccess(window.i18n?.t('creator.video.toastMergeDone') || 'Merge completed!', savePath);
                    return { success: true };
                }
                this.ui.showToast((window.i18n?.t('creator.video.errorClip') || 'Clip failed') + ': ' + result.error, 'error');
                return { success: false, error: result?.error };
            } catch (error) {
                this.ui.showToast((window.i18n?.t('creator.video.errorClip') || 'Clip failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
                throw error;
            } finally {
                this.ui.hideProgress();
            }
        } else {
            const folderPath = options.folderPath || await this.ui.askFolderPath();
            if (!folderPath) return;

            try {
                this.ui.showProgress(window.i18n?.t('creator.video.statusExporting', { count: segments.length }) || `Exporting ${segments.length} segments...`, 0, true, () => window.mediaflow?.video.cancel());
                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    const defaultSegmentName = window.i18n?.t('creator.segment.defaultName', { index: i + 1 }) || ('Clip' + (i + 1));
                    const fileName = `${seg.name || defaultSegmentName}.${format}`;
                    const outputPath = window.mediaflow?.path?.join
                        ? await window.mediaflow.path.join(folderPath, fileName)
                        : `${folderPath}\\${fileName}`;
                    this.ui.updateProgress((i / segments.length) * 100, window.i18n?.t('creator.video.statusExportingProgress', { current: i + 1, total: segments.length }) || `Exporting (${i + 1}/${segments.length})`);
                    await this.service.clip(this.core.videoFile.path, outputPath, seg.start, seg.end);
                }
                this.ui.showToast(window.i18n?.t('creator.video.toastExportDone', { count: segments.length }) || `Exported ${segments.length} segments!`, 'success');
                return { success: true };
            } catch (error) {
                this.ui.showToast((window.i18n?.t('creator.video.errorClip') || 'Clip failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
                throw error;
            } finally {
                this.ui.hideProgress();
            }
        }
    }

    /**
     * 视频压缩
     */
    async compressVideo(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        const opts = this.ui.getUIOptions(options, {
            codec: 'adv-compress-codec',
            quality: 'compress-quality-only',
            preset: 'adv-compress-preset',
            audio: 'adv-compress-audio',
            targetSize: 'compress-target-size' // 🆕 获取目标体积
        });

        // 兼容回退逻辑：如果 isolation ID 没值，尝试旧的混合 ID
        if (!opts.quality) {
            const oldEl = document.getElementById('compress-quality');
            if (oldEl) opts.quality = oldEl.value;
        }

        // 如果是目标体积模式，确保单位正确 (MB)
        if (opts.quality === 'target' && opts.targetSize) {
            opts.targetSize = parseFloat(opts.targetSize);
        } else {
            delete opts.targetSize;
        }

        if (!opts.preset) {
            const oldEl = document.getElementById('compress-preset');
            if (oldEl) opts.preset = oldEl.value;
        }
        if (!opts.audio) {
            const oldEl = document.getElementById('compress-audio');
            if (oldEl) opts.audio = oldEl.value;
        }

        let cleanup = null;
        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveCompress') || 'Save Compressed Video',
                defaultPath: `compressed_${this.core.videoFile?.name}`,
                filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusCompressing') || 'Compressing...', 0, true, () => window.mediaflow?.video.cancel());

                // 监听压缩进度
                cleanup = window.mediaflow?.video?.onCompressProgress((data) => {
                    this.ui.updateProgress(data.progress, window.i18n?.t('creator.video.statusCompressing') || 'Compressing...');
                });
            }

            // 🆕 记住当前设置
            this.ui.saveCurrentSettings();

            const result = await this.service.compress(inputPath, savePath, {
                ...opts,
                startTime: options.startTime,
                duration: options.duration,
                taskId: options.taskId
            });

            if (result?.success) {
                // 🆕 任务完成后反馈压缩率
                if (!options.isBatch) {
                    const stats = await window.mediaflow?.fs?.stat?.(savePath);
                    const sourceStats = await window.mediaflow?.fs?.stat?.(inputPath);
                    let ratioText = '';
                    if (stats?.success && sourceStats?.success && sourceStats.size > 0) {
                        const savedPercent = Math.round((1 - stats.size / sourceStats.size) * 100);
                        ratioText = savedPercent > 0 ? ` (节省了 ${savedPercent}% 空间)` : '';
                    }
                    this.ui.showSuccess((window.i18n?.t('creator.video.toastCompressDone') || 'Compression Completed!') + ratioText, savePath);
                }
                return { success: true };
            } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorCompress') || 'Compression Failed'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorCompress') || 'Compression Failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (cleanup) cleanup();
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 格式转换
     */
    async convertFormat(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        const opts = this.ui.getUIOptions(options, {
            format: 'convert-format-only',
            quality: 'compress-quality-only'
        });

        // 兼容回退逻辑
        if (!opts.format) {
            const oldEl = document.getElementById('convert-format');
            if (oldEl) opts.format = oldEl.value;
        }
        const format = opts.format || 'mp4';

        let cleanup = null;
        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveConvert') || 'Save Converted File',
                defaultPath: `${this.core.videoFile?.name.split('.')[0]}.${format}`,
                filters: [{ name: format.toUpperCase(), extensions: [format] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusConverting') || 'Converting...', 0, true, () => window.mediaflow?.video.cancel());

                // 监听转换进度
                cleanup = window.mediaflow?.video?.onConvertProgress((data) => {
                    this.ui.updateProgress(data.progress, window.i18n?.t('creator.video.statusConverting') || 'Converting...');
                });
            }

            // 🆕 记住当前设置
            this.ui.saveCurrentSettings();

            let result;
            if (format === 'gif') {
                result = await this.service.createGIF(inputPath, savePath, {
                    fps: 15,
                    width: 480,
                    start: options.startTime,
                    duration: options.duration,
                    taskId: options.taskId
                });
            } else {
                result = await this.service.convert(inputPath, savePath, format, opts.quality, {
                    startTime: options.startTime,
                    duration: options.duration,
                    taskId: options.taskId
                });
            }

            if (result?.success) {
                if (!options.isBatch) this.ui.showSuccess(window.i18n?.t('creator.video.toastConvertDone') || 'Conversion Completed!', savePath);
                return { success: true };
            } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorConvert') || 'Conversion Failed'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorConvert') || 'Conversion Failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (cleanup) cleanup();
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 变速播放
     */
    async changeSpeed(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        const speed = options.speed || parseFloat(document.getElementById('speed-slider')?.value) || 1.0;

        let cleanup = null;
        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveSpeed') || 'Save Speed Adjusted Video',
                defaultPath: `${this.core.videoFile?.name.split('.')[0]}_${speed}x.mp4`,
                filters: [{ name: 'Video', extensions: ['mp4'] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusSpeeding', { speed }) || `Changing speed (${speed}x)...`, 0, true, () => window.mediaflow?.video.cancel());

                // 监听变速进度
                cleanup = window.mediaflow?.video?.onSpeedProgress((data) => {
                    this.ui.updateProgress(data.progress, window.i18n?.t('creator.video.statusSpeeding', { speed }) || `Changing speed (${speed}x)...`);
                });
            }

            const result = await this.service.changeSpeed(inputPath, savePath, speed, options.taskId);

            if (result?.success) {
                if (!options.isBatch) this.ui.showSuccess(window.i18n?.t('creator.video.toastSpeedDone') || 'Speed adjustment completed!', savePath);
                return { success: true };
            } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorSpeed') || 'Speed adjustment failed'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorSpeed') || 'Speed adjustment failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (cleanup) cleanup();
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 生成 GIF
     */
    async generateGif(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        const opts = this.ui.getUIOptions(options, {
            fps: 'gif-fps',
            width: 'gif-width'
        });

        let cleanup = null;
        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveGif') || 'Save GIF',
                defaultPath: `${this.core.videoFile?.name.split('.')[0]}.gif`,
                filters: [{ name: 'GIF', extensions: ['gif'] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusGifing') || 'Generating GIF...', 0, true, () => window.mediaflow?.video.cancel());

                // 监听 GIF 进度
                cleanup = window.mediaflow?.video?.onGIFProgress((data) => {
                    this.ui.updateProgress(data.progress, window.i18n?.t('creator.video.statusGifing') || 'Generating GIF...');
                });
            }

            const result = await this.service.createGIF(inputPath, savePath, { ...opts, taskId: options.taskId });

            if (result?.success) {
                if (!options.isBatch) this.ui.showSuccess(window.i18n?.t('creator.video.toastGifDone') || 'GIF saved!', savePath);
                return { success: true };
            } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorGif') || 'GIF generation failed'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorGif') || 'GIF generation failed') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (cleanup) cleanup();
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 移除音频 (静音视频)
     */
    getWatermarkImagePathFromUI() {
        return this.getCreatorElementById('watermark-image-path')?.dataset?.path
            || this.getCreatorElementById('watermark-image-input')?.dataset?.path
            || '';
    }

    setWatermarkImagePathInUI(filePath) {
        const display = this.getCreatorElementById('watermark-image-path');
        if (!display || !filePath) return;
        display.dataset.path = filePath;
        display.title = filePath;
        display.textContent = String(filePath).split(/[\\/]/).pop() || filePath;
    }

    async resolveWatermarkImagePath() {
        const existingPath = this.getWatermarkImagePathFromUI();
        if (existingPath) return existingPath;

        const selected = this.ui.chooseWatermarkImage
            ? await this.ui.chooseWatermarkImage()
            : await window.mediaflow?.dialog?.openFile?.({
                title: window.i18n?.t('creator.watermark.selectImage') || 'Select watermark image',
                properties: ['openFile'],
                filters: [
                    { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }
                ]
            });
        const filePath = Array.isArray(selected) ? selected[0] : selected;
        if (filePath) this.setWatermarkImagePathInUI(filePath);
        return filePath || '';
    }

    getCreatorRoot() {
        return document.getElementById('page-creator') || document;
    }

    getCreatorElementById(id) {
        const root = this.getCreatorRoot();
        return root.querySelector?.(`#${id}`) || document.getElementById(id);
    }

    queryCreator(selector) {
        const root = this.getCreatorRoot();
        return root.querySelector?.(selector) || document.querySelector(selector);
    }

    async addWatermark(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        const ext = inputPath.split('.').pop() || 'mp4';
        const type = options.type || this.queryCreator('input[name="watermark-type"]:checked')?.value || 'text';
        const config = { ...(options.config || {}) };

        if (type === 'text') {
            const text = options.text ?? this.getCreatorElementById('watermark-text')?.value?.trim();
            if (!text) {
                this.ui.showToast(window.i18n?.t('creator.watermark.textRequired') || 'Please enter watermark text', 'warning');
                return { success: false, reason: 'missing-text' };
            }
            config.text = text;
            config.position = config.position || 'bottom-right';
            config.fontSize = config.fontSize || 24;
            config.fontColor = config.fontColor || 'white';
            config.alpha = config.alpha ?? 0.9;
        } else {
            config.imagePath = config.imagePath || options.imagePath || await this.resolveWatermarkImagePath();
            if (!config.imagePath) {
                this.ui.showToast(window.i18n?.t('creator.watermark.imageRequired') || 'Please select a watermark image first', 'warning');
                return { success: false, reason: 'missing-image' };
            }
        }

        try {
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveWatermark') || 'Save Watermarked Video',
                defaultPath: `${this.core.videoFile?.name.replace(/\.[^.]+$/, '')}_watermark.${ext}`,
                filters: [{ name: 'Video', extensions: [ext] }]
            });
            if (!savePath) return;

            if (!options.isBatch) {
                this.ui.showProgress(window.i18n?.t('creator.video.statusWatermarking') || 'Adding watermark...', 0, true, () => window.mediaflow?.video.cancel());
            }

            const result = await this.service.watermark(inputPath, savePath, type, config, {
                taskId: options.taskId
            });

            if (result?.success) {
                if (!options.isBatch) this.ui.showSuccess(window.i18n?.t('creator.video.toastWatermarkDone') || 'Watermark added!', savePath);
                return { success: true };
            }

            throw new Error(result?.error || (window.i18n?.t('creator.video.errorWatermark') || 'Failed to add watermark'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorWatermark') || 'Failed to add watermark') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    async removeAudio(options = {}) {
        const inputPath = options.inputPath || this.core.videoFile?.path;
        if (!inputPath) return;

        try {
            const ext = inputPath.split('.').pop() || 'mp4';
            const savePath = options.savePath || await this.ui.askSavePath({
                title: window.i18n?.t('creator.video.saveMute') || 'Save Muted Video',
                defaultPath: `${this.core.videoFile?.name.replace(/\.[^.]+$/, '')}_mute.${ext}`,
                filters: [{ name: 'Video', extensions: [ext] }]
            });
            if (!savePath) return;

            if (!options.isBatch) this.ui.showProgress(window.i18n?.t('creator.video.statusMuting') || 'Removing audio...', 0, true, () => window.mediaflow?.video.cancel());
            const result = await this.service.removeAudio(inputPath, savePath, {
                startTime: options.startTime,
                duration: options.duration,
                taskId: options.taskId
            });

            if (result?.success) {
                if (!options.isBatch) this.ui.showSuccess(window.i18n?.t('creator.video.toastMuteDone') || 'Audio removed!', savePath);
                return { success: true };
            } else throw new Error(result?.error || (window.i18n?.t('creator.video.errorMute') || 'Failed to remove audio'));
        } catch (error) {
            const errorMsg = error.message || '';
            const isCancel = /cancel|kill/i.test(errorMsg) || errorMsg.includes('CANCELLED_BY_USER');
            if (isCancel) {
                return { success: false, action: 'cancel' };
            }
            if (!options.isBatch) this.ui.showToast((window.i18n?.t('creator.video.errorMute') || 'Failed to remove audio') + ': ' + window.ErrorUtils.formatError(error), 'error');
            throw error;
        } finally {
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 合并视频 (支持帧率不匹配处理)
     */
    async mergeVideos(inputs, output, options = {}) {
        if (!inputs || inputs.length < 2 || !output) throw new Error('Invalid inputs for merge');

        if (!options.isBatch) {
            this.ui.showProgress(
                window.i18n?.t('creator.video.statusMergingVideos') || 'Merging videos...',
                0,
                true,
                () => window.mediaflow?.video.cancel()
            );
        }

        try {
            const result = await this.service.merge(inputs, output, options);

            // 处理帧率不一致的情况
            if (result?.error === 'FRAME_RATE_MISMATCH' && result?.fpsInfo) {
                if (!options.isBatch) this.ui.hideProgress();
                let finalResult = result;
                const confirmed = await this.ui.showFpsMismatchDialog(result.fpsInfo, async (targetFps) => {
                    // 用户选择重新编码合并
                    this.ui.showProgress(window.i18n?.t('creator.video.statusMergingReencode') || 'Merging with re-encoding...', 0);
                    finalResult = await this.mergeVideos(inputs, output, { ...options, forceReencode: true, targetFps });
                });
                if (!confirmed) return { success: false, action: 'cancel' };
                return finalResult;
            }

            if (result?.success) {
                return { success: true };
            }
            return result; // If not success, return the result object (which might contain error)
        } catch (error) {
            const errorMsg = error.message || '';
            if (errorMsg.includes('CANCELLED_BY_USER') ||
                errorMsg.includes('Process cancelled') ||
                errorMsg.includes('Process killed') ||
                errorMsg.includes('User canceled')) {
                return { success: false, action: 'cancel' };
            }
            throw error;
        } finally {
            if (!options.isBatch) this.ui.hideProgress();
        }
    }

    /**
     * 批量静音处理 (检测 + 移除)
     */
    async batchSilence(inputPath, threshold, minDuration, options = {}) {
        let cleanupProgress = null;
        try {
            // 进度监听
            if (options.onProgress) {
                cleanupProgress = window.mediaflow?.creator.onProgress((data) => {
                    options.onProgress(data.progress, data.status);
                });
            }

            // 1. 检测
            const detectResult = await window.mediaflow?.creator.detectSilence(inputPath, {
                threshold: parseFloat(threshold),
                minDuration: parseFloat(minDuration)
            });

            if (!detectResult || !detectResult.success) {
                throw new Error(detectResult?.error || 'Silence detection failed');
            }

            if (!detectResult.segments || detectResult.segments.length === 0) {
                // 如果没有静音，则视为处理完成（输出原文件）
                const result = await window.mediaflow.creator.removeSilence(inputPath, [], { mode: 'remove', savePath: options.savePath });
                if (result?.success) {
                    return { success: true };
                } else throw new Error(result?.error || 'Failed to remove silence');
            }

            // 2. 移除
            const result = await window.mediaflow?.creator.removeSilence(
                inputPath,
                detectResult.segments,
                { mode: 'remove', savePath: options.savePath }
            );
            if (result?.success) {
                return { success: true };
            } else throw new Error(result?.error || 'Failed to remove silence');
        } catch (error) {
            const errorMsg = error.message || '';
            if (errorMsg.includes('CANCELLED_BY_USER') ||
                errorMsg.includes('Process cancelled') ||
                errorMsg.includes('Process killed') ||
                errorMsg.includes('User canceled')) {
                return { success: false, action: 'cancel' };
            }
            console.error('[VideoProcessor] Batch silence error:', errorMsg);
            throw error;
        } finally {
            if (cleanupProgress) cleanupProgress();
        }
    }

    /**
     * 视频旋转
     */
    async rotateVideo(angle = null) {
        if (!this.core.videoFile) return;

        // 如果传入了具体角度，直接处理
        if (angle !== null) {
            await this._handleTransform('rotate', angle.toString(), 'rotated');
            return;
        }

        // 优先从新侧边栏 UI 读取
        const uiSelect = document.getElementById('prop-rotate-angle');
        if (uiSelect) {
            await this._handleTransform('rotate', uiSelect.value, 'rotated');
            return;
        }

        const res = await window.mediaflow?.dialog?.showMessageBox?.({
            type: 'question',
            buttons: [
                window.i18n?.t('creator.transform.rotateCW') || 'Rotate CW 90°',
                window.i18n?.t('creator.transform.rotateCCW') || 'Rotate CCW 90°',
                window.i18n?.t('creator.transform.rotate180') || 'Rotate 180°',
                window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'
            ],
            title: window.i18n?.t('creator.transform.rotateTitle') || 'Rotate Video',
            message: window.i18n?.t('creator.transform.rotateMsg') || 'Select rotation direction'
        });

        if (!res || res.response === 3) return;

        const values = ['90', '270', '180'];
        const value = values[res.response];

        await this._handleTransform('rotate', value, 'rotated');
    }

    /**
     * 视频镜像
     */
    async mirrorVideo(axis = null) {
        if (!this.core.videoFile) return;

        // 如果传入了具体镜像轴，直接处理
        if (axis !== null) {
            await this._handleTransform('mirror', axis, 'mirrored');
            return;
        }

        // 优先从新侧边栏 UI 读取
        const uiRadio = document.querySelector('input[name="prop-mirror-axis"]:checked');
        if (uiRadio) {
            await this._handleTransform('mirror', uiRadio.value, 'mirrored');
            return;
        }

        const res = await window.mediaflow?.dialog?.showMessageBox?.({
            type: 'question',
            buttons: [
                window.i18n?.t('creator.transform.mirrorH') || 'Horizontal Mirror',
                window.i18n?.t('creator.transform.mirrorV') || 'Vertical Mirror',
                window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'
            ],
            title: window.i18n?.t('creator.transform.mirrorTitle') || 'Mirror Video',
            message: window.i18n?.t('creator.transform.mirrorMsg') || 'Select mirror axis'
        });

        if (!res || res.response === 2) return;

        const value = res.response === 0 ? 'h' : 'v';
        await this._handleTransform('mirror', value, 'mirrored');
    }

    /**
     * 智能裁剪
     */
    async cropVideo() {
        if (!this.core.videoFile) return;

        // 优先从新侧边栏 UI 读取
        const uiSelect = document.getElementById('prop-crop-ratio');
        const uiW = document.getElementById('prop-crop-w');
        const uiH = document.getElementById('prop-crop-h');

        if (uiSelect) {
            let value = uiSelect.value;
            // 如果是自定义模式，拼接 WxH
            if (value === 'custom' && uiW && uiH) {
                const w = parseInt(uiW.value);
                const h = parseInt(uiH.value);
                if (w > 0 && h > 0) {
                    value = `${w}x${h}`;
                }
            }
            await this._handleTransform('crop', value, 'cropped');
            return;
        }

        const res = await window.mediaflow?.dialog?.showMessageBox?.({
            type: 'question',
            buttons: [
                window.i18n?.t('creator.transform.cropMobile') || '9:16 (Full Screen)',
                window.i18n?.t('creator.transform.cropSquare') || '1:1 (Square)',
                window.i18n?.t('creator.transform.cropDesktop') || '16:9 (Desktop)',
                window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'
            ],
            title: window.i18n?.t('creator.transform.cropTitle') || 'Smart Crop',
            message: window.i18n?.t('creator.transform.cropMsg') || 'Select target aspect ratio'
        });

        if (!res || res.response === 3) return;

        const ratios = ['9:16', '1:1', '16:9'];
        const ratio = ratios[res.response];

        await this._handleTransform('crop', ratio, 'cropped');
    }

    /**
     * 通用转换处理器
     */
    async _handleTransform(type, value, suffix) {
        const input = this.core.videoFile.path;
        const defaultName = this.core.videoFile.name.replace(/\.[^/.]+$/, '') + `_${suffix}.mp4`;

        const output = await window.mediaflow?.dialog.saveFile({
            title: window.i18n?.t('creator.video.saveProcessed') || 'Save Processed Video',
            defaultPath: defaultName,
            filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
        });

        if (!output) return;

        this.core.showProgress(window.i18n?.t('creator.video.processingTransform') || 'Processing video frame...', 0, true, () => window.mediaflow.video.cancel());

        try {
            const result = await this.service.transform({
                input,
                output,
                type,
                value
            });

            if (result.success) {
                this.ui.showSuccess(window.i18n?.t('creator.video.transformDone') || 'Processing completed!', output);
            } else if (result.error !== 'Process cancelled') {
                this.ui.showToast(`${window.i18n?.t('creator.video.processFail') || 'Processing failed'}: ${result.error}`, 'error');
            }
        } catch (err) {
            this.ui.showToast(`${window.i18n?.t('creator.video.processError') || 'Processing error'}: ${err.message}`, 'error');
        } finally {
            this.core.hideProgress();
        }
    }

    /**
     * 内部记录成就调用
     */
}

window.VideoProcessor = VideoProcessor;
