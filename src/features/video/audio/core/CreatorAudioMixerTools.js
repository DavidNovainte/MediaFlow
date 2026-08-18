class CreatorAudioMixerTools {
    constructor(handler) {
        this.handler = handler;
    }

    setupMixer() {
        const handler = this.handler;
        const audioInput = document.createElement('input');
        audioInput.type = 'file';
        audioInput.accept = 'audio/*';
        audioInput.style.display = 'none';
        document.body.appendChild(audioInput);

        const pathDisplay = document.getElementById('mix-audio-path');
        handler.mixAudioFile = null;

        audioInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                handler.mixAudioFile = e.target.files[0];
                if (pathDisplay) pathDisplay.value = handler.mixAudioFile.path;

                if (handler.app.timelineManager && handler.app.videoDuration) {
                    try {
                        handler.app.showProgress(window.i18n?.t('creator.toasts.processingAudio') || 'Processing audio...');

                        const result = await window.mediaflow?.video?.extractAudio({
                            input: handler.mixAudioFile.path,
                            samplesPerSec: 50
                        });

                        if (result && result.success && result.peaks) {
                            handler.app.timelineManager.tracks.a2.peaks = result.peaks;
                            handler.app.timelineManager.tracks.a2.segments = [{
                                start: 0,
                                end: handler.app.videoDuration,
                                sourceStart: 0,
                                file: handler.mixAudioFile
                            }];

                            let audioSrc = '';
                            if (typeof handler.mixAudioFile === 'string') {
                                audioSrc = window.urlUtils ? window.urlUtils.getMediaSrc(handler.mixAudioFile) : handler.mixAudioFile;
                            } else if (handler.mixAudioFile.path) {
                                audioSrc = window.urlUtils ? window.urlUtils.getMediaSrc(handler.mixAudioFile) : handler.mixAudioFile.path;
                            } else {
                                audioSrc = URL.createObjectURL(handler.mixAudioFile);
                            }
                            handler.app.audioMixer?.registerTrack('a2', audioSrc);

                            const emptyHint = document.querySelector('#track-a2 .track-empty-hint');
                            if (emptyHint) emptyHint.style.display = 'none';

                            handler.app.timelineManager.renderAll();
                        } else {
                            throw new Error(result?.error || 'Failed to extract peaks');
                        }
                    } catch (error) {
                        console.error('Failed to parse A2 waveform', error);
                    } finally {
                        handler.app.hideProgress();
                    }
                }
            }
        });

        document.getElementById('btn-select-audio')?.addEventListener('click', () => audioInput.click());

        const updateVol = (id, valId) => {
            const el = document.getElementById(id);
            const valEl = document.getElementById(valId);
            if (el && valEl) {
                el.addEventListener('input', (e) => {
                    valEl.textContent = e.target.value + '%';
                });
            }
        };
        updateVol('mix-vol-video', 'vol-video-val');
        updateVol('mix-vol-audio', 'vol-audio-val');

        document.getElementById('btn-start-mix')?.addEventListener('click', () => handler.startMix());
    }

    async startMix(options = {}) {
        const handler = this.handler;
        if (!handler.app.videoFile) return;
        if (!handler.mixAudioFile && !options.audioPath) {
            if (!options.isBatch) window.app?.showToast(window.i18n?.t('creator.toasts.selectBGM') || 'Please select background music first', 'warning');
            return;
        }
        if (handler.app.isProcessing) return;

        try {
            if (!options.isBatch) {
                handler.app.isProcessing = true;
                handler.app.showProgress(window.i18n?.t('creator.toasts.statusMixing') || 'Mixing audio and video...');
            }

            const volVideo = (options.videoVolume !== undefined) ? options.videoVolume : ((document.getElementById('mix-vol-video')?.value || 100) / 100);
            const volAudio = (options.audioVolume !== undefined) ? options.audioVolume : ((document.getElementById('mix-vol-audio')?.value || 100) / 100);
            const durationMode = options.durationMode || document.getElementById('mix-duration-mode')?.value || 'shortest';
            const audioPath = options.audioPath || handler.mixAudioFile.path;

            let savePath = options.savePath;
            if (!savePath) {
                if (options.isBatch) {
                    const dir = handler.app.videoFile.path.substring(0, handler.app.videoFile.path.lastIndexOf('\\'));
                    savePath = `${dir}\\${options.originalName || 'mix'}.mp4`;
                } else {
                    savePath = await window.mediaflow?.dialog.saveFile({
                        title: window.i18n?.t('creator.toasts.saveMix') || 'Save Mixed Video',
                        defaultPath: handler.app.videoFile.name.replace(/\.[^.]+$/, '_mix.mp4'),
                        filters: [{ name: 'Video', extensions: ['mp4'] }]
                    });
                }
            }
            if (!savePath) return;

            const result = await window.mediaflow?.creator.mix({
                videoPath: handler.app.videoFile.path,
                audioPath,
                outputPath: savePath,
                videoVolume: volVideo,
                audioVolume: volAudio,
                durationMode,
                startTime: options.startTime,
                endTime: options.endTime
            });

            if (result && result.success) {
                if (!options.isBatch) window.app?.showToast(window.i18n?.t('creator.toasts.toastMixDone') || 'Audio/Video mixed successfully!', 'success');
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.toasts.mixFail') || 'Mixing failed'));
            }
        } catch (error) {
            console.error('[AudioProcessor] Mix error:', error);
            if (!options.isBatch) window.app?.showToast((window.i18n?.t('creator.toasts.mixFail') || 'Mixing failed') + ': ' + error.message, 'error');
            throw error;
        } finally {
            if (!options.isBatch) {
                handler.app.isProcessing = false;
                handler.app.hideProgress();
            }
        }
    }

    setupDenoiseListeners() {
        document.getElementById('btn-denoise')?.addEventListener('click', () => this.handler.denoiseAudio());
        document.getElementById('btn-prop-run-denoise')?.addEventListener('click', () => {
            const level = document.getElementById('prop-denoise-level')?.value || 'medium';
            this.handler.denoiseAudio({ level, applyToEditor: true });
        });
    }

    async denoiseAudio(options = {}) {
        const handler = this.handler;
        if (!handler.app.videoFile?.path) return;
        const level = options.level || 'medium';
        const sourcePath = handler.app.videoFile.path;
        const sourceName = handler.app.videoFile.name || sourcePath.split(/[\\/]/).pop();

        let cleanupProgress = null;

        try {
            let savePath = options.savePath;
            if (!savePath) {
                const dir = sourcePath.substring(0, sourcePath.lastIndexOf('\\'));
                if (options.applyToEditor) {
                    const baseName = sourceName.replace(/\.[^.]+$/, '');
                    savePath = `${dir}\\${baseName}_denoised_edit.mp4`;
                } else if (options.isBatch) {
                    savePath = `${dir}\\${options.originalName || 'denoised'}.mp4`;
                } else {
                    savePath = await window.mediaflow?.dialog.saveFile({
                        title: window.i18n?.t('creator.denoise.saveDenoised') || 'Save Denoised File',
                        defaultPath: sourceName.replace(/\.[^.]+$/, '_denoised.mp4'),
                        filters: [{ name: 'Video', extensions: ['mp4'] }]
                    });
                }
            }
            if (!savePath) return;

            if (!options.isBatch) {
                handler.app.isProcessing = true;
                handler.app.showProgress(window.i18n?.t('creator.toasts.statusDenoising') || 'Denoising...', 0, true, () => window.mediaflow?.audio?.cancel?.());
            }

            const updateProgress = (pct, text) => {
                if (options.onProgress) options.onProgress(pct, text);
                if (!options.isBatch) handler.app.updateProgress(pct, text);
            };

            cleanupProgress = window.mediaflow?.audio?.onDenoiseProgress?.((data) => {
                updateProgress(data.progress, data.status);
            });

            const result = await window.mediaflow?.audio?.denoise({
                input: sourcePath,
                output: savePath,
                level,
                startTime: options.startTime,
                endTime: options.endTime
            });

            if (result?.success) {
                updateProgress(100, window.i18n?.t('creator.video.statusDone') || 'Done!');
                if (options.applyToEditor) {
                    await handler.app.applyProcessedMediaToEditor(savePath, sourcePath);
                    if (!options.isBatch) {
                        window.app?.showToast(window.i18n?.t('creator.toasts.toastDenoiseApplied') || 'Denoising completed and applied to the current editor!', 'success');
                    }
                } else if (!options.isBatch) {
                    window.app?.showToast(window.i18n?.t('creator.toasts.toastDenoiseDone') || 'Denoising completed!', 'success');
                }
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.toasts.denoiseFail') || 'Denoising failed'));
            }
        } catch (e) {
            if (!options.isBatch) window.app?.showToast(e.message || (window.i18n?.t('creator.toasts.denoiseFail') || 'Denoising failed'), 'error');
            throw e;
        } finally {
            if (cleanupProgress) cleanupProgress();
            if (!options.isBatch) {
                handler.app.isProcessing = false;
                handler.app.hideProgress();
            }
        }
    }
}

window.CreatorAudioMixerTools = CreatorAudioMixerTools;
