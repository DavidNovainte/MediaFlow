/**
 * MediaFlow - BatchTaskRunner
 * 负责批量处理任务的具体执行逻辑与参数收集。
 * 遵循代码规范：按模块拆分，单个文件不超过 300 行。
 */
class BatchTaskRunner {
    constructor(videoProcessor) {
        this.videoProcessor = videoProcessor;
    }

    /**
     * 从 UI 收集全局批量设置项
     * @param {string} type 任务类型
     * @returns {Object} 全局配置
     */
    getGlobalOptions(type) {
        const options = {};

        if (type === 'compress') {
            options.quality = document.getElementById('batch-compress-quality')?.value || document.getElementById('compress-quality-only')?.value || '23';
            options.codec = document.getElementById('batch-compress-codec')?.value || document.getElementById('adv-compress-codec')?.value || 'libx265';
            options.preset = document.getElementById('batch-compress-preset')?.value || document.getElementById('adv-compress-preset')?.value || 'medium';
            options.audio = document.getElementById('adv-compress-audio')?.value || 'copy';
        } else if (type === 'convert') {
            options.format = document.getElementById('batch-convert-format')?.value || document.getElementById('convert-format-only')?.value || 'mp4';
            options.resolution = document.getElementById('batch-convert-res')?.value || 'original';
        } else if (type === 'vertical') {
            options.bgStyle = document.getElementById('batch-vertical-mode')?.value || 'blur';
            options.blurIntensity = document.getElementById('batch-vertical-blur-val')?.value || '15';
        } else if (type === 'speed') {
            options.speed = parseFloat(document.getElementById('batch-speed-val')?.value || '1.0');
            options.preservePitch = document.getElementById('batch-speed-pitch')?.checked ?? true;
        } else if (type === 'gif') {
            options.fps = parseInt(document.getElementById('batch-gif-fps')?.value || document.getElementById('gif-fps')?.value || '15', 10);
            options.width = parseInt(document.getElementById('batch-gif-res')?.value || document.getElementById('gif-width')?.value || '480', 10);
        } else if (type === 'silence') {
            options.threshold = document.getElementById('batch-silence-threshold')?.value || '-40';
            options.duration = parseFloat(document.getElementById('batch-silence-duration')?.value || '0.5');
            options.margin = parseFloat(document.getElementById('batch-silence-margin')?.value || '0.1');
        } else if (type === 'merge') {
            options.transition = document.getElementById('batch-merge-transition')?.value || 'fade';
            options.transitionDuration = parseFloat(document.getElementById('batch-merge-duration')?.value || '1.0');
        }

        return options;
    }

    /**
     * 为单个文件构建执行参数
     */
    async executeTask(type, item, saveFolder, globalOptions, onProgress, taskId) {
        const separator = saveFolder.includes('/') ? '/' : '\\';
        const baseName = item.file.name.replace(/\.[^.]+$/, '');
        const inputPath = item.file.path;

        const options = {
            inputPath: inputPath,
            isBatch: true,
            onProgress: onProgress,
            taskId: taskId,
            originalName: baseName,
            ...globalOptions
        };

        // 确定输出路径
        switch (type) {
        case 'compress':
            options.savePath = `${saveFolder}${separator}compressed_${item.file.name}`;
            return await this.videoProcessor.compressVideo(options);

        case 'convert':
            options.savePath = `${saveFolder}${separator}${baseName}.${globalOptions.format}`;
            return await this.videoProcessor.convertFormat(options);

        case 'remove-audio': {
            const ext = item.file.name.split('.').pop();
            options.savePath = `${saveFolder}${separator}${baseName}_noaudio.${ext}`;
            return await this.videoProcessor.removeAudio(options);
        }

        case 'vertical':
            options.savePath = `${saveFolder}${separator}${baseName}_vertical.mp4`;
            return await this.videoProcessor.makeVertical(options);

        case 'speed': {
            const ext = item.file.name.split('.').pop();
            options.savePath = `${saveFolder}${separator}${baseName}_${globalOptions.speed}x.${ext}`;
            return await this.videoProcessor.changeSpeed(options);
        }

        case 'gif':
            options.savePath = `${saveFolder}${separator}${baseName}.gif`;
            return await this.videoProcessor.generateGif(options);

        case 'silence':
            options.savePath = `${saveFolder}${separator}${baseName}_nosilence.mp4`;
            // 调用 SilenceProcessor 执行批量处理逻辑
            if (this.videoProcessor.core.silenceProcessor) {
                return await this.videoProcessor.core.silenceProcessor.removeSilenceBatch(inputPath, options.savePath, globalOptions, onProgress);
            }
            throw new Error(window.i18n?.t('creator.silence.notReady') || 'Silence removal module not ready');

        default:
            throw new Error(`Unsupported task type: ${type}`);
        }
    }
}

window.BatchTaskRunner = BatchTaskRunner;
