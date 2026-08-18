/**
 * VideoService.js
 * 负责所有视频处理的核心业务逻辑 (FFmpeg IPC 处理)
 */
class VideoService {
    constructor() {
        // 无需 UI 引用，纯逻辑
    }

    /**
     * 基础剪辑
     */
    async clip(input, output, startTime, endTime, taskIdOrOptions = null) {
        const options = taskIdOrOptions && typeof taskIdOrOptions === 'object'
            ? taskIdOrOptions
            : { taskId: taskIdOrOptions };

        return await window.mediaflow?.video.clip({
            input,
            output,
            startTime,
            endTime,
            taskId: options.taskId || null,
            accurate: !!options.accurate
        });
    }

    /**
     * 合并多个片段
     */
    async multiClip(input, output, segments, taskIdOrOptions = null) {
        const options = taskIdOrOptions && typeof taskIdOrOptions === 'object'
            ? taskIdOrOptions
            : { taskId: taskIdOrOptions };

        return await window.mediaflow?.video.multiClip({
            input,
            output,
            segments: segments.sort((a, b) => a.start - b.start),
            taskId: options.taskId || null,
            accurate: !!options.accurate
        });
    }

    /**
     * 竖屏转换 (支持带时间的预裁剪)
     */
    async makeVertical(input, output, options = {}) {
        // Pass full UI option set — backend builds filter from style/color/blur/scale/offset
        return await window.mediaflow?.video.makeVertical({
            input,
            output,
            bgStyle: options.bgStyle || 'blur',
            quality: options.quality || 'medium',
            bgColor: options.bgColor,
            bgColor2: options.bgColor2,
            blurRadius: options.blurRadius,
            scaleX: options.scaleX,
            scaleY: options.scaleY,
            contentScale: options.contentScale,
            contentOffset: options.contentOffset,
            offsetX: options.offsetX,
            offsetY: options.offsetY,
            taskId: options.taskId
        });
    }

    /**
     * 视频压缩
     */
    async compress(input, output, options = {}) {
        return await window.mediaflow?.video.compress({
            input,
            output,
            quality: options.quality || 'medium',
            audio: options.audio || 'low',
            codec: options.codec || 'hevc',
            preset: options.preset || 'balanced',
            targetSize: options.targetSize, // 🆕 新增目标体积支持
            startTime: options.startTime,
            duration: options.duration,
            taskId: options.taskId
        });
    }

    /**
     * 格式转换
     */
    async convert(input, output, format, quality, options = {}) {
        return await window.mediaflow?.video.convert({
            input,
            output,
            format,
            quality,
            startTime: options.startTime,
            duration: options.duration,
            taskId: options.taskId
        });
    }

    /**
     * 变速处理
     */
    async changeSpeed(input, output, speed, taskId = null) {
        return await window.mediaflow?.video.changeSpeed({
            input,
            output,
            speed,
            taskId
        });
    }

    /**
     * 生成 GIF
     */
    async createGIF(input, output, options = {}) {
        return await window.mediaflow?.video.createGIF({
            input,
            output,
            start: options.start,
            duration: options.duration,
            fps: options.fps || 15,
            width: options.width || 480,
            taskId: options.taskId
        });
    }

    /**
     * 提取帧 (截图)
     */
    async extractFrame(input, output, time) {
        return await window.mediaflow?.video.extractFrame({
            input,
            output,
            time
        });
    }

    /**
     * 移除音频
     */
    async removeAudio(input, output, options = {}) {
        return await window.mediaflow?.video.removeAudio({
            input,
            output,
            startTime: options.startTime,
            duration: options.duration,
            taskId: options.taskId
        });
    }

    /**
     * 合并视频文件
     */
    async watermark(input, output, type, config, options = {}) {
        return await window.mediaflow?.video.watermark({
            input,
            output,
            type,
            config,
            taskId: options.taskId
        });
    }

    async merge(inputs, output, options = {}) {
        return await window.mediaflow?.video.merge({
            inputs,
            output,
            forceReencode: options.forceReencode || false,
            targetFps: options.targetFps || null,
            transition: options.transition || 'none',
            normalizeAudio: options.normalizeAudio || false
        });
    }

    /**
     * 画面变换 (旋转/镜像/裁剪)
     */
    async transform(options) {
        return await window.mediaflow?.video.transform(options);
    }
}

window.VideoService = VideoService;
