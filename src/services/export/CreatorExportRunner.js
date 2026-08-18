const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const binaries = require('../../utils/binaries');
const logger = require('../../utils/logger');
const { buildAtempoFilterChain, roundFilterNumber } = require('./audioFilterUtils');
const CreatorExportCapabilityMatrix = require('../../features/video/export/CreatorExportCapabilityMatrix');

const SUPPORTED_XFADE_TRANSITIONS = new Set(
    (CreatorExportCapabilityMatrix.transitions || ['none', 'fade'])
        .filter((transitionId) => transitionId !== 'none')
);

class CreatorExportRunner {
    constructor() {
        this.activeJobs = new Map();
        this.probeCache = new Map();
        this._videoEncodeArgs = null;
        this._videoEncodeIsHardware = false;
    }

    async run(job, options = {}) {
        const onProgress = options.onProgress || (() => {});
        const context = {
            jobId: job.jobId,
            cancelled: false,
            currentProcess: null,
            tempDir: null,
            preferHardware: true
        };

        this.activeJobs.set(job.jobId, context);

        try {
            this._emitProgress(job, onProgress, 'prepare', 0, 'Preparing export');
            this._validateJob(job);
            context.tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mediaflow-creator-'));
            await this._warmVideoEncoder(context);

            const profile = await this._resolveProfile(job);
            this._assertNotCancelled(context);

            const primaryItems = this._buildPrimaryItems(job);
            const materialized = await this._materializePrimaryItems(job, context, profile, primaryItems, onProgress);

            let composedVideoPath = null;
            if (job.exportKind !== 'audio') {
                composedVideoPath = await this._composeVideo(job, context, profile, materialized, onProgress);
                composedVideoPath = await this._composeOverlayVideos(job, context, profile, composedVideoPath, onProgress);
                composedVideoPath = await this._renderSubtitleTracks(job, context, profile, composedVideoPath, onProgress);
            }

            let baseAudioPath = null;
            if (job.exportKind !== 'video') {
                baseAudioPath = await this._composeBaseAudio(job, context, profile, materialized, onProgress);
                baseAudioPath = await this._mixOverlayAudio(job, context, profile, baseAudioPath, onProgress);
            }

            const finalTempPath = await this._finalizeOutput(job, context, composedVideoPath, baseAudioPath, onProgress);
            await fs.promises.mkdir(path.dirname(job.output.path), { recursive: true });
            await fs.promises.copyFile(finalTempPath, job.output.path);

            this._emitProgress(job, onProgress, 'finalize', 100, 'Export complete');
            logger.info(`[CreatorExport] completed ${JSON.stringify({ jobId: job.jobId, outputPath: job.output.path })}`);
            return {
                success: true,
                jobId: job.jobId,
                outputPath: job.output.path
            };
        } catch (error) {
            const isCancelled = this._isCancelledError(error);
            const message = error?.message || 'Export failed';
            logger.error(`[CreatorExport] failed ${JSON.stringify({ jobId: job.jobId, error: message })}`);
            if (isCancelled) {
                return {
                    success: false,
                    jobId: job.jobId,
                    action: 'cancel',
                    error: 'CANCELLED_BY_USER'
                };
            }

            return {
                success: false,
                jobId: job.jobId,
                error: message,
                details: error?.stack || message
            };
        } finally {
            await this._cleanupContext(context);
            this.activeJobs.delete(job.jobId);
        }
    }

    cancelTask(taskId) {
        if (taskId) {
            return this._cancelContext(this.activeJobs.get(taskId));
        }

        let cancelled = false;
        this.activeJobs.forEach((context) => {
            cancelled = this._cancelContext(context) || cancelled;
        });
        return cancelled;
    }

    _cancelContext(context) {
        if (!context) return false;
        context.cancelled = true;
        if (context.currentProcess) {
            this._killProcess(context.currentProcess);
        }
        return true;
    }

    _killProcess(proc) {
        try {
            if (!proc) return;
            if (process.platform === 'win32') {
                const { exec } = require('child_process');
                exec(`taskkill /pid ${proc.pid} /T /F`, () => {});
            }
            proc.kill('SIGKILL');
        } catch (error) {
            void error;
        }
    }

    _validateJob(job) {
        if (!job || !job.jobId || !job.output?.path) {
            throw new Error('Invalid export job');
        }
        if (job.exportKind !== 'audio' && !Array.isArray(job.primaryVideoClips)) {
            throw new Error('Missing primary video clips');
        }
        if (job.exportKind === 'audio' && !Array.isArray(job.primaryAudioClips)) {
            throw new Error('Missing primary audio clips');
        }
    }

    async _resolveProfile(job) {
        const referenceClip = job.primaryVideoClips?.[0] || job.primaryAudioClips?.[0] || job.overlayAudioClips?.[0];
        const probe = referenceClip?.assetPath ? await this._probeMedia(referenceClip.assetPath) : null;

        return {
            width: probe?.video?.width || 1280,
            height: probe?.video?.height || 720,
            fps: probe?.video?.fps || 30,
            sampleRate: probe?.audio?.sampleRate || 48000,
            channels: probe?.audio?.channels || 2
        };
    }

    _buildPrimaryItems(job) {
        const clips = (job.exportKind === 'audio' ? job.primaryAudioClips : job.primaryVideoClips)
            .slice()
            .sort((left, right) => left.timelineStart - right.timelineStart);

        const items = [];
        let cursor = 0;
        clips.forEach((clip) => {
            if (clip.timelineStart > cursor + 0.001) {
                items.push(this._createGapItem(cursor, clip.timelineStart));
            }
            items.push({
                ...clip,
                itemType: 'clip',
                duration: clip.timelineEnd - clip.timelineStart
            });
            cursor = Math.max(cursor, clip.timelineEnd);
        });

        if (job.timelineDuration > cursor + 0.001) {
            items.push(this._createGapItem(cursor, job.timelineDuration));
        }

        return items;
    }

    _createGapItem(start, end) {
        return {
            clipId: `gap_${start}_${end}`,
            itemType: 'gap',
            timelineStart: start,
            timelineEnd: end,
            duration: Math.max(0, end - start),
            transition: { id: 'none', duration: 0 },
            volume: 1,
            speed: 1
        };
    }

    async _materializePrimaryItems(job, context, profile, items, onProgress) {
        const results = [];
        const total = Math.max(items.length, 1);

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            this._assertNotCancelled(context);
            const itemProgress = Math.round((index / total) * 100);
            this._emitProgress(job, onProgress, 'materialize', itemProgress, `Rendering clip ${index + 1}/${total}`);

            const baseName = String(index).padStart(3, '0');
            const materialized = {
                ...item,
                videoPath: null,
                audioPath: null
            };

            if (job.exportKind !== 'audio') {
                materialized.videoPath = item.itemType === 'gap'
                    ? await this._generateGapVideo(context, profile, item.duration, `${baseName}_gap_video.mp4`)
                    : await this._materializeVideoClip(context, profile, item, `${baseName}_video.mp4`);
            }

            if (job.exportKind !== 'video') {
                materialized.audioPath = item.itemType === 'gap'
                    ? await this._generateGapAudio(context, profile, item.duration, `${baseName}_gap_audio.m4a`)
                    : await this._materializeAudioClip(context, profile, item, `${baseName}_audio.m4a`);
            }

            results.push(materialized);
        }

        this._emitProgress(job, onProgress, 'materialize', 100, 'Timeline clips prepared');
        return results;
    }

    async _composeVideo(job, context, profile, items, onProgress) {
        this._assertNotCancelled(context);
        this._emitProgress(job, onProgress, 'compose', 10, 'Composing video track');

        const videoItems = items.filter((item) => item.videoPath);
        if (!videoItems.length) {
            throw new Error('No video material was produced');
        }

        if (videoItems.length === 1) {
            return videoItems[0].videoPath;
        }

        const hasTransitions = videoItems.some((item, index) => {
            return this._resolveTransitionDuration(item, videoItems[index + 1]) > 0;
        });
        if (!hasTransitions) {
            const outputPath = path.join(context.tempDir, 'composed_video.mp4');
            await this._concatMediaFiles(context, videoItems.map((item) => item.videoPath), outputPath, 'video');
            this._emitProgress(job, onProgress, 'compose', 100, 'Video track ready');
            return outputPath;
        }

        const outputPath = path.join(context.tempDir, 'composed_video_transition.mp4');
        const args = ['-y'];
        videoItems.forEach((item) => {
            args.push('-i', item.videoPath);
        });

        const filters = [];
        let currentLabel = '[0:v]';
        let currentDuration = videoItems[0].duration;

        for (let index = 1; index < videoItems.length; index += 1) {
            const previousItem = videoItems[index - 1];
            const nextItem = videoItems[index];
            const transitionDuration = this._resolveTransitionDuration(previousItem, nextItem);

            if (transitionDuration > 0) {
                const outputLabel = `[vx${index}]`;
                const transitionType = this._resolveXfadeTransition(previousItem);
                const offset = Math.max(0, currentDuration - transitionDuration);
                filters.push(
                    `${currentLabel}[${index}:v]xfade=transition=${transitionType}:duration=${roundFilterNumber(transitionDuration)}:offset=${roundFilterNumber(offset)}${outputLabel}`
                );
                currentLabel = outputLabel;
                currentDuration = currentDuration + nextItem.duration - transitionDuration;
            } else {
                const concatLabel = `[vx${index}]`;
                filters.push(`${currentLabel}[${index}:v]concat=n=2:v=1:a=0${concatLabel}`);
                currentLabel = concatLabel;
                currentDuration += nextItem.duration;
            }
        }

        args.push(
            '-filter_complex',
            filters.join(';'),
            '-map',
            currentLabel,
            '-an',
            ...this._getVideoEncodeArgs(context),
            outputPath
        );

        await this._runFfmpeg(context, args);
        this._emitProgress(job, onProgress, 'compose', 100, 'Video track ready');
        return outputPath;
    }

    /**
     * Stack secondary visual tracks on top of the primary composed video (PiP / multi-layer).
     * Overlay order follows track number ascending so higher tracks paint last (on top).
     */
    async _composeOverlayVideos(job, context, profile, baseVideoPath, onProgress) {
        const clips = Array.isArray(job.overlayVideoClips) ? job.overlayVideoClips : [];
        if (!baseVideoPath || !clips.length) {
            return baseVideoPath;
        }

        this._assertNotCancelled(context);
        this._emitProgress(job, onProgress, 'compose', 40, 'Overlaying video tracks');

        let currentPath = baseVideoPath;
        for (let index = 0; index < clips.length; index += 1) {
            this._assertNotCancelled(context);
            const clip = clips[index];
            const overlayFileName = `ov_clip_${String(index).padStart(3, '0')}.mp4`;
            const overlayPath = clip.assetKind === 'image'
                ? await this._materializeOverlayStillImageClip(context, profile, clip, overlayFileName)
                : await this._materializeOverlayVideoClip(context, profile, clip, overlayFileName);

            const outputPath = path.join(
                context.tempDir,
                `composed_with_overlay_${String(index).padStart(3, '0')}.mp4`
            );
            await this._blendOverlayClip(context, profile, currentPath, {
                ...clip,
                videoPath: overlayPath
            }, outputPath);
            currentPath = outputPath;

            const progress = 40 + Math.round(((index + 1) / clips.length) * 40);
            this._emitProgress(
                job,
                onProgress,
                'compose',
                progress,
                `Overlaying clip ${index + 1}/${clips.length}`
            );
        }

        this._emitProgress(job, onProgress, 'compose', 85, 'Video overlays ready');
        return currentPath;
    }

    _resolveClipOffsets(clip, profile) {
        const width = Math.max(2, Number(profile.width) || 1280);
        const height = Math.max(2, Number(profile.height) || 720);
        const stageW = Math.max(1, Number(clip.previewStageWidth) || width);
        const stageH = Math.max(1, Number(clip.previewStageHeight) || height);
        return {
            offsetX: Math.round((Number(clip.x) || 0) * (width / stageW)),
            offsetY: Math.round((Number(clip.y) || 0) * (height / stageH)),
            opacity: Math.min(1, Math.max(0, (Number(clip.opacity) ?? 100) / 100))
        };
    }

    _buildOverlayClipVideoFilterChain(clip, profile, options = {}) {
        const fps = Math.max(1, Number(profile.fps) || 30);
        const includeSpeed = options.includeSpeed !== false;
        const userScale = Math.min(4, Math.max(0.1, (Number(clip.scale) || 100) / 100));
        const rotation = Number(clip.rotation) || 0;
        const maxEdge = Math.max(
            2,
            Number(profile.width) || 1280,
            Number(profile.height) || 720
        );

        const filters = [];
        if (includeSpeed) {
            const ptsFactor = roundFilterNumber(1 / Math.max(0.01, Number(clip.speed) || 1));
            filters.push(`setpts=${ptsFactor}*PTS`);
        }
        if (clip.flipX) filters.push('hflip');
        if (clip.flipY) filters.push('vflip');
        if (Math.abs(rotation) > 0.001) {
            const radians = roundFilterNumber((rotation * Math.PI) / 180, 6);
            filters.push(`rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians}):c=black@0`);
        }

        // Fit inside canvas, then user scale — keep native box (no full-frame black pad)
        filters.push(`scale=${maxEdge}:${maxEdge}:force_original_aspect_ratio=decrease`);
        if (Math.abs(userScale - 1) > 0.001) {
            const s = roundFilterNumber(userScale, 4);
            filters.push(`scale=iw*${s}:ih*${s}`);
        }

        filters.push(`fps=${fps}`, 'format=yuv420p');
        return filters;
    }

    async _materializeOverlayVideoClip(context, profile, clip, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        const sourceDuration = Math.max(0.01, (clip.sourceEnd || 0) - (clip.sourceStart || 0));
        const filterChain = this._buildOverlayClipVideoFilterChain(clip, profile, { includeSpeed: true });

        await this._runFfmpeg(context, [
            '-y',
            '-i',
            clip.assetPath,
            '-ss',
            String(clip.sourceStart || 0),
            '-t',
            String(sourceDuration),
            '-an',
            '-filter:v',
            filterChain.join(','),
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);

        return outputPath;
    }

    async _materializeOverlayStillImageClip(context, profile, clip, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        const timelineDuration = Math.max(0.01, (clip.timelineEnd || 0) - (clip.timelineStart || 0));
        const filterChain = this._buildOverlayClipVideoFilterChain(clip, profile, { includeSpeed: false });

        await this._runFfmpeg(context, [
            '-y',
            '-loop',
            '1',
            '-framerate',
            String(profile.fps || 30),
            '-i',
            clip.assetPath,
            '-t',
            String(timelineDuration),
            '-an',
            '-filter:v',
            filterChain.join(','),
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);

        return outputPath;
    }

    async _blendOverlayClip(context, profile, baseVideoPath, clip, outputPath) {
        const start = Math.max(0, Number(clip.timelineStart) || 0);
        const end = Math.max(start + 0.01, Number(clip.timelineEnd) || (start + 0.01));
        const { offsetX, offsetY, opacity } = this._resolveClipOffsets(clip, profile);
        const startRounded = roundFilterNumber(start, 3);
        const endRounded = roundFilterNumber(end, 3);
        const opacityRounded = roundFilterNumber(opacity, 4);

        // Delay overlay PTS to timeline start, place by center + editor offsets, optional opacity.
        const overlayFilters = [
            `[1:v]setpts=PTS+${startRounded}/TB,format=rgba,colorchannelmixer=aa=${opacityRounded}[ov]`,
            `[0:v][ov]overlay=x='(main_w-overlay_w)/2+${offsetX}':y='(main_h-overlay_h)/2+${offsetY}':enable='between(t,${startRounded},${endRounded})':format=auto,format=yuv420p[outv]`
        ];

        await this._runFfmpeg(context, [
            '-y',
            '-i',
            baseVideoPath,
            '-i',
            clip.videoPath,
            '-filter_complex',
            overlayFilters.join(';'),
            '-map',
            '[outv]',
            '-an',
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);
    }

    async _composeBaseAudio(job, context, profile, items, onProgress) {
        this._assertNotCancelled(context);
        this._emitProgress(job, onProgress, 'audio', 10, 'Preparing audio track');

        const audioItems = items.filter((item) => item.audioPath);
        if (!audioItems.length) {
            return this._generateGapAudio(context, profile, Math.max(job.timelineDuration, 0.1), 'empty_audio.m4a');
        }

        if (audioItems.length === 1) {
            this._emitProgress(job, onProgress, 'audio', 60, 'Audio track ready');
            return audioItems[0].audioPath;
        }

        const hasTransitions = audioItems.some((item, index) => {
            return this._resolveTransitionDuration(item, audioItems[index + 1]) > 0;
        });
        if (!hasTransitions) {
            const outputPath = path.join(context.tempDir, 'composed_audio.m4a');
            await this._concatMediaFiles(context, audioItems.map((item) => item.audioPath), outputPath, 'audio');
            this._emitProgress(job, onProgress, 'audio', 60, 'Audio track ready');
            return outputPath;
        }

        const outputPath = path.join(context.tempDir, 'composed_audio_transition.m4a');
        const args = ['-y'];
        audioItems.forEach((item) => {
            args.push('-i', item.audioPath);
        });

        const filters = [];
        let currentLabel = '[0:a]';

        for (let index = 1; index < audioItems.length; index += 1) {
            const previousItem = audioItems[index - 1];
            const nextItem = audioItems[index];
            const transitionDuration = this._resolveTransitionDuration(previousItem, nextItem);
            const outputLabel = `[ax${index}]`;

            if (transitionDuration > 0) {
                filters.push(
                    `${currentLabel}[${index}:a]acrossfade=d=${roundFilterNumber(transitionDuration)}:c1=tri:c2=tri${outputLabel}`
                );
            } else {
                filters.push(`${currentLabel}[${index}:a]concat=n=2:v=0:a=1${outputLabel}`);
            }

            currentLabel = outputLabel;
        }

        args.push(
            '-filter_complex',
            filters.join(';'),
            '-map',
            currentLabel,
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            outputPath
        );

        await this._runFfmpeg(context, args);
        this._emitProgress(job, onProgress, 'audio', 60, 'Audio track ready');
        return outputPath;
    }

    async _renderSubtitleTracks(job, context, profile, videoPath, onProgress) {
        const subtitleTracks = Array.isArray(job.subtitleTracks) ? job.subtitleTracks : [];
        if (!videoPath || !subtitleTracks.length) {
            return videoPath;
        }

        const CSSSubtitleRenderer = require('../../handlers/subtitle/cssSubtitleRenderer');
        const ffmpegPath = binaries.getFfmpegPath();
        const subtitleController = {
            cancelled: false,
            cancelPromise: new Promise(() => {})
        };
        const cleanupPaths = [];

        try {
            this._assertNotCancelled(context);
            this._emitProgress(job, onProgress, 'compose', 55, 'Rendering subtitle overlay');

            const overlayResult = await CSSSubtitleRenderer.renderOverlayVideo({
                tracks: subtitleTracks,
                width: profile.width,
                height: profile.height,
                duration: Math.max(job.timelineDuration || 0, 0.01),
                fps: profile.fps,
                ffmpegPath,
                controller: subtitleController,
                progressCallback: (percent) => {
                    this._emitProgress(
                        job,
                        onProgress,
                        'compose',
                        55 + Math.round((Math.max(0, Math.min(100, percent)) / 100) * 25),
                        'Rendering subtitle overlay'
                    );
                }
            });
            cleanupPaths.push(...(overlayResult?.cleanupPaths || []));

            this._assertNotCancelled(context);
            this._emitProgress(job, onProgress, 'compose', 85, 'Burning subtitles into video');

            const outputPath = path.join(context.tempDir, 'composed_video_subtitled.mp4');
            const overlayInputLabel = (
                overlayResult?.renderWidth !== profile.width ||
                overlayResult?.renderHeight !== profile.height
            )
                ? '[subtitle_overlay_scaled]'
                : '[1:v]';
            const filterGraph = overlayInputLabel === '[1:v]'
                ? '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[outv]'
                : `[1:v]scale=${profile.width}:${profile.height}:flags=lanczos${overlayInputLabel};[0:v]${overlayInputLabel}overlay=0:0:format=auto,format=yuv420p[outv]`;

            await this._runFfmpeg(context, [
                '-y',
                '-i',
                videoPath,
                '-i',
                overlayResult.overlayPath,
                '-filter_complex',
                filterGraph,
                '-map',
                '[outv]',
                '-an',
                ...this._getVideoEncodeArgs(context),
                outputPath
            ]);

            this._emitProgress(job, onProgress, 'compose', 95, 'Subtitle styling applied');
            return outputPath;
        } finally {
            subtitleController.cancelled = true;
            await Promise.all(cleanupPaths.map(async (targetPath) => {
                if (!targetPath) return;
                try {
                    await fs.promises.rm(targetPath, { recursive: true, force: true });
                } catch (error) {
                    void error;
                }
            }));
        }
    }

    async _mixOverlayAudio(job, context, profile, baseAudioPath, onProgress) {
        const overlayClips = Array.isArray(job.overlayAudioClips) ? job.overlayAudioClips : [];
        if (!overlayClips.length) {
            return baseAudioPath;
        }

        this._emitProgress(job, onProgress, 'audio', 70, 'Mixing overlay audio');
        const overlayFiles = [];

        for (let index = 0; index < overlayClips.length; index += 1) {
            this._assertNotCancelled(context);
            const clip = overlayClips[index];
            const fileName = `overlay_${String(index).padStart(3, '0')}.m4a`;
            overlayFiles.push({
                ...clip,
                audioPath: await this._materializeAudioClip(context, profile, clip, fileName)
            });
        }

        const outputPath = path.join(context.tempDir, 'mixed_audio.m4a');
        const args = ['-y', '-i', baseAudioPath];
        overlayFiles.forEach((clip) => {
            args.push('-i', clip.audioPath);
        });

        const filters = ['[0:a]atrim=0:' + roundFilterNumber(job.timelineDuration || 0.1) + '[base0]'];
        const mixInputs = ['[base0]'];

        overlayFiles.forEach((clip, index) => {
            const delayMs = Math.max(0, Math.round((clip.timelineStart || 0) * 1000));
            const inputLabel = `[${index + 1}:a]`;
            const delayedLabel = `[ov${index}]`;
            filters.push(`${inputLabel}adelay=${delayMs}|${delayMs}${delayedLabel}`);
            mixInputs.push(delayedLabel);
        });

        filters.push(
            `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,atrim=0:${roundFilterNumber(job.timelineDuration || 0.1)}[mixed]`
        );

        args.push(
            '-filter_complex',
            filters.join(';'),
            '-map',
            '[mixed]',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            outputPath
        );

        await this._runFfmpeg(context, args);
        this._emitProgress(job, onProgress, 'audio', 100, 'Audio mix ready');
        return outputPath;
    }

    async _finalizeOutput(job, context, videoPath, audioPath, onProgress) {
        this._assertNotCancelled(context);
        this._emitProgress(job, onProgress, 'finalize', 25, 'Writing final file');

        if (job.exportKind === 'audio') {
            const outputPath = path.join(context.tempDir, 'final_output.mp3');
            await this._runFfmpeg(context, [
                '-y',
                '-i',
                audioPath,
                '-vn',
                '-c:a',
                'libmp3lame',
                '-q:a',
                '2',
                outputPath
            ]);
            return outputPath;
        }

        if (job.exportKind === 'video') {
            const outputPath = path.join(context.tempDir, 'final_output.mp4');
            await fs.promises.copyFile(videoPath, outputPath);
            return outputPath;
        }

        const outputPath = path.join(context.tempDir, 'final_output.mp4');
        await this._runFfmpeg(context, [
            '-y',
            '-i',
            videoPath,
            '-i',
            audioPath,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-shortest',
            outputPath
        ]);
        return outputPath;
    }

    /**
     * Build clip video filters including editor transform params (scale/rotation/opacity/flip/position).
     * Position is mapped from preview-stage pixels to output frame when stage size is present.
     */
    _buildClipVideoFilterChain(clip, profile, options = {}) {
        const width = Math.max(2, Number(profile.width) || 1280);
        const height = Math.max(2, Number(profile.height) || 720);
        const fps = Math.max(1, Number(profile.fps) || 30);
        const includeSpeed = options.includeSpeed !== false;

        const userScale = Math.min(4, Math.max(0.1, (Number(clip.scale) || 100) / 100));
        const rotation = Number(clip.rotation) || 0;
        const opacity = Math.min(1, Math.max(0, (Number(clip.opacity) ?? 100) / 100));
        const stageW = Math.max(1, Number(clip.previewStageWidth) || width);
        const stageH = Math.max(1, Number(clip.previewStageHeight) || height);
        const offsetX = Math.round((Number(clip.x) || 0) * (width / stageW));
        const offsetY = Math.round((Number(clip.y) || 0) * (height / stageH));

        const filters = [];
        if (includeSpeed) {
            const ptsFactor = roundFilterNumber(1 / Math.max(0.01, Number(clip.speed) || 1));
            filters.push(`setpts=${ptsFactor}*PTS`);
        }
        if (clip.flipX) filters.push('hflip');
        if (clip.flipY) filters.push('vflip');
        if (Math.abs(rotation) > 0.001) {
            const radians = roundFilterNumber((rotation * Math.PI) / 180, 6);
            filters.push(`rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians}):c=black@0`);
        }

        // Fit into frame, then apply user scale around the fitted size
        filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
        if (Math.abs(userScale - 1) > 0.001) {
            const s = roundFilterNumber(userScale, 4);
            filters.push(`scale=iw*${s}:ih*${s}`);
        }

        // Position: pad with offset from center (preview drag coordinates)
        filters.push(`pad=${width}:${height}:(ow-iw)/2+${offsetX}:(oh-ih)/2+${offsetY}:black`);

        // Opacity over black background (matches CSS opacity on dark stage)
        if (opacity < 0.999) {
            const o = roundFilterNumber(opacity, 4);
            filters.push(`lutrgb=r='val*${o}':g='val*${o}':b='val*${o}'`);
        }

        filters.push(`fps=${fps}`, 'format=yuv420p');
        return filters;
    }

    async _materializeVideoClip(context, profile, clip, fileName) {
        if (clip.assetKind === 'image') {
            return this._materializeStillImageClip(context, profile, clip, fileName);
        }

        const outputPath = path.join(context.tempDir, fileName);
        const sourceDuration = Math.max(0.01, (clip.sourceEnd || 0) - (clip.sourceStart || 0));
        const filterChain = this._buildClipVideoFilterChain(clip, profile, { includeSpeed: true });

        await this._runFfmpeg(context, [
            '-y',
            '-i',
            clip.assetPath,
            '-ss',
            String(clip.sourceStart || 0),
            '-t',
            String(sourceDuration),
            '-an',
            '-filter:v',
            filterChain.join(','),
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);

        return outputPath;
    }

    async _materializeStillImageClip(context, profile, clip, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        const timelineDuration = Math.max(0.01, (clip.timelineEnd || 0) - (clip.timelineStart || 0));
        const filterChain = this._buildClipVideoFilterChain(clip, profile, { includeSpeed: false });

        await this._runFfmpeg(context, [
            '-y',
            '-loop',
            '1',
            '-framerate',
            String(profile.fps || 30),
            '-i',
            clip.assetPath,
            '-t',
            String(timelineDuration),
            '-an',
            '-filter:v',
            filterChain.join(','),
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);

        return outputPath;
    }

    async _materializeAudioClip(context, profile, clip, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        const probe = clip.assetPath ? await this._probeMedia(clip.assetPath) : null;
        const hasAudio = !!probe?.audio;
        const timelineDuration = Math.max(0.01, (clip.timelineEnd || 0) - (clip.timelineStart || 0));

        if (!hasAudio) {
            return this._generateGapAudio(context, profile, timelineDuration, fileName);
        }

        const sourceDuration = Math.max(0.01, (clip.sourceEnd || 0) - (clip.sourceStart || 0));
        const audioFilters = [];
        audioFilters.push(...buildAtempoFilterChain(clip.speed || 1));
        if (clip.volume !== undefined && clip.volume !== null && Math.abs(Number(clip.volume) - 1) > 0.000001) {
            audioFilters.push(`volume=${roundFilterNumber(clip.volume)}`);
        }

        const args = [
            '-y',
            '-i',
            clip.assetPath,
            '-ss',
            String(clip.sourceStart || 0),
            '-t',
            String(sourceDuration),
            '-vn'
        ];

        if (audioFilters.length) {
            args.push('-filter:a', audioFilters.join(','));
        }

        args.push(
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-ar',
            String(profile.sampleRate),
            '-ac',
            String(Math.max(1, Math.min(2, profile.channels || 2))),
            outputPath
        );

        await this._runFfmpeg(context, args);
        return outputPath;
    }

    async _generateGapVideo(context, profile, duration, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        await this._runFfmpeg(context, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `color=c=black:s=${profile.width}x${profile.height}:r=${profile.fps}:d=${Math.max(duration, 0.01)}`,
            '-an',
            ...this._getVideoEncodeArgs(context),
            outputPath
        ]);
        return outputPath;
    }

    async _generateGapAudio(context, profile, duration, fileName) {
        const outputPath = path.join(context.tempDir, fileName);
        await this._runFfmpeg(context, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `anullsrc=channel_layout=${(profile.channels || 2) > 1 ? 'stereo' : 'mono'}:sample_rate=${profile.sampleRate || 48000}`,
            '-t',
            String(Math.max(duration, 0.01)),
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            outputPath
        ]);
        return outputPath;
    }

    async _concatMediaFiles(context, inputFiles, outputPath, kind) {
        const listPath = path.join(context.tempDir, `${kind}_concat.txt`);
        const content = inputFiles
            .map((filePath) => `file '${String(filePath).replace(/'/g, '\'\\\'\'')}'`)
            .join('\n');

        await fs.promises.writeFile(listPath, content, 'utf8');
        const args = [
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            listPath
        ];

        if (kind === 'video') {
            args.push(...this._getVideoEncodeArgs(context), '-an', outputPath);
        } else {
            args.push('-c:a', 'aac', '-b:a', '192k', outputPath);
        }

        await this._runFfmpeg(context, args);
    }

    async _probeMedia(filePath) {
        if (this.probeCache.has(filePath)) {
            return this.probeCache.get(filePath);
        }

        const ffprobePath = binaries.getFfprobePath();
        const args = [
            '-v',
            'error',
            '-print_format',
            'json',
            '-show_streams',
            '-show_format',
            filePath
        ];

        const probe = await new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            const proc = spawn(ffprobePath, args, { windowsHide: true });

            proc.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            proc.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `ffprobe exited with code ${code}`));
                    return;
                }

                try {
                    const parsed = JSON.parse(stdout || '{}');
                    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
                    const videoStream = streams.find((stream) => stream.codec_type === 'video');
                    const audioStream = streams.find((stream) => stream.codec_type === 'audio');
                    resolve({
                        video: videoStream ? {
                            width: Number(videoStream.width) || 1280,
                            height: Number(videoStream.height) || 720,
                            fps: this._parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate)
                        } : null,
                        audio: audioStream ? {
                            sampleRate: Number(audioStream.sample_rate) || 48000,
                            channels: Number(audioStream.channels) || 2
                        } : null,
                        duration: Number(parsed.format?.duration) || 0
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });

        this.probeCache.set(filePath, probe);
        return probe;
    }

    _parseFps(value) {
        if (!value) return 30;
        if (typeof value === 'number') return value;
        const [num, den] = String(value).split('/').map(Number);
        if (!den || Number.isNaN(num) || Number.isNaN(den)) {
            return Number(value) || 30;
        }
        return roundFilterNumber(num / den);
    }

    _softwareVideoEncodeArgs() {
        return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
    }

    _buildHardwareVideoEncodeArgs(encoder) {
        if (encoder === 'h264_nvenc') {
            return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc:v', 'constqp', '-qp:v', '23', '-pix_fmt', 'yuv420p'];
        }
        if (encoder === 'h264_qsv') {
            return ['-c:v', 'h264_qsv', '-preset', 'balanced', '-global_quality', '23', '-pix_fmt', 'yuv420p'];
        }
        if (encoder === 'h264_amf') {
            return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qv', '23', '-pix_fmt', 'yuv420p'];
        }
        return this._softwareVideoEncodeArgs();
    }

    async _warmVideoEncoder(context) {
        if (this._videoEncodeArgs && context?.preferHardware !== false) {
            return this._videoEncodeArgs;
        }

        try {
            const FFmpegRunner = require('../../handlers/video/FFmpegRunner');
            const encoder = context?.preferHardware === false
                ? 'libx264'
                : await FFmpegRunner.getBestEncoder('h264');
            const isHardware = typeof encoder === 'string'
                && (encoder.includes('nvenc') || encoder.includes('qsv') || encoder.includes('amf'));
            this._videoEncodeIsHardware = isHardware;
            this._videoEncodeArgs = isHardware
                ? this._buildHardwareVideoEncodeArgs(encoder)
                : this._softwareVideoEncodeArgs();
            logger.info(`[CreatorExport] video encoder ${JSON.stringify({
                jobId: context?.jobId,
                encoder: this._videoEncodeArgs[1],
                hardware: isHardware
            })}`);
        } catch (error) {
            logger.warn(`[CreatorExport] encoder detect failed, using libx264: ${error?.message || error}`);
            this._videoEncodeIsHardware = false;
            this._videoEncodeArgs = this._softwareVideoEncodeArgs();
        }

        return this._videoEncodeArgs;
    }

    _getVideoEncodeArgs(context) {
        if (context?.preferHardware === false) {
            return this._softwareVideoEncodeArgs();
        }
        return this._videoEncodeArgs || this._softwareVideoEncodeArgs();
    }

    _replaceVideoEncodeArgs(args, encodeArgs) {
        const qualityFlags = new Set([
            '-preset', '-crf', '-rc', '-rc:v', '-cq', '-qp', '-qp:v', '-qv',
            '-global_quality', '-pix_fmt', '-quality'
        ]);
        const next = [];
        for (let index = 0; index < args.length; index += 1) {
            const token = args[index];
            if (token === '-c:v' || token === '-vcodec') {
                index += 1; // skip codec name
                while (index + 1 < args.length && qualityFlags.has(args[index + 1])) {
                    index += 2; // skip flag + value
                }
                next.push(...encodeArgs);
                continue;
            }
            next.push(token);
        }
        return next;
    }

    async _runFfmpeg(context, args) {
        this._assertNotCancelled(context);
        const ffmpegPath = binaries.getFfmpegPath();

        const attempt = (attemptArgs) => new Promise((resolve, reject) => {
            const command = `${ffmpegPath} ${attemptArgs.join(' ')}`;
            logger.info(`[CreatorExport] ffmpeg ${JSON.stringify({ jobId: context.jobId, command })}`);

            const proc = spawn(ffmpegPath, attemptArgs, { windowsHide: true });
            context.currentProcess = proc;
            let stderr = '';

            proc.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            proc.on('error', (error) => {
                context.currentProcess = null;
                reject(error);
            });

            proc.on('close', (code) => {
                context.currentProcess = null;
                if (context.cancelled || code === null) {
                    reject(new Error('CANCELLED_BY_USER'));
                    return;
                }
                if (code !== 0) {
                    logger.ffmpeg(command, stderr);
                    reject(new Error(this._summarizeFfmpegError(stderr, code)));
                    return;
                }
                resolve();
            });
        });

        try {
            await attempt(args);
            return;
        } catch (error) {
            if (this._isCancelledError(error) || context.cancelled) {
                throw error;
            }

            const usedHardware = Array.isArray(args)
                && args.some((token) => typeof token === 'string'
                    && (token.includes('nvenc') || token.includes('qsv') || token.includes('amf')));

            if (!usedHardware || context.preferHardware === false) {
                throw error;
            }

            logger.warn(`[CreatorExport] hardware encode failed, falling back to libx264: ${error.message}`);
            context.preferHardware = false;
            this._videoEncodeIsHardware = false;
            this._videoEncodeArgs = this._softwareVideoEncodeArgs();
            const fallbackArgs = this._replaceVideoEncodeArgs(args, this._softwareVideoEncodeArgs());
            await attempt(fallbackArgs);
        }
    }

    _summarizeFfmpegError(stderr, code) {
        const lines = String(stderr || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        const tail = lines.slice(-5).join(' | ');
        return tail || `FFmpeg exited with code ${code}`;
    }

    _resolveTransitionDuration(previousItem, nextItem) {
        if (!previousItem || !nextItem) return 0;
        if (!this._resolveXfadeTransition(previousItem)) return 0;
        const requested = Number(previousItem.transition?.duration) || 0;
        if (requested <= 0) return 0;
        return Math.max(0, Math.min(requested, previousItem.duration / 2, nextItem.duration / 2));
    }

    _resolveXfadeTransition(item) {
        const transitionId = String(item?.transition?.id || 'none');
        if (!SUPPORTED_XFADE_TRANSITIONS.has(transitionId)) {
            return null;
        }
        return transitionId;
    }

    _emitProgress(job, onProgress, stageId, stagePercent, message) {
        const stages = Array.isArray(job.stages) ? job.stages : [];
        const currentIndex = stages.findIndex((stage) => stage.id === stageId);
        const currentStage = stages[currentIndex] || { weight: 100, label: stageId };
        const totalWeight = stages.reduce((sum, stage) => sum + (stage.weight || 0), 0) || 100;
        const completedWeight = stages
            .slice(0, Math.max(currentIndex, 0))
            .reduce((sum, stage) => sum + (stage.weight || 0), 0);
        const stageWeight = currentStage.weight || 0;
        const progress = Math.max(
            0,
            Math.min(
                100,
                roundFilterNumber(((completedWeight + (stageWeight * (stagePercent / 100))) / totalWeight) * 100, 2)
            )
        );

        onProgress({
            taskId: job.jobId,
            jobId: job.jobId,
            scope: 'export',
            stage: stageId,
            progress,
            message: message || currentStage.label || stageId
        });
    }

    _assertNotCancelled(context) {
        if (context?.cancelled) {
            throw new Error('CANCELLED_BY_USER');
        }
    }

    _isCancelledError(error) {
        const message = error?.message || '';
        return message.includes('CANCELLED_BY_USER') || /cancel/i.test(message);
    }

    async _cleanupContext(context) {
        if (!context?.tempDir) return;

        try {
            await fs.promises.rm(context.tempDir, { recursive: true, force: true });
        } catch (error) {
            void error;
        }
    }
}

module.exports = new CreatorExportRunner();
