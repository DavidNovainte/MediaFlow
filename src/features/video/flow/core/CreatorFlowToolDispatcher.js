class CreatorFlowToolDispatcher {
    constructor(flow) {
        this.flow = flow;
    }

    async handleSegmentAction(action, data, segments) {
        const flow = this.flow;
        if (!segments || segments.length === 0) return;

        const timeSegments = segments.map(s => ({
            start: (s.startPercent / 100) * flow.videoDuration,
            end: (s.endPercent / 100) * flow.videoDuration,
            name: s.name || `clip_${s.id}`
        }));

        if (timeSegments.length > 1) {
            const mode = await window.mediaflow?.dialog?.showMessageBox?.({
                type: 'question',
                buttons: [
                    window.i18n?.t('creator.dialogs.btnSeparate') || 'Batch Process (Separate)',
                    window.i18n?.t('creator.dialogs.btnMerge') || 'Merge Process (Single Output)',
                    window.i18n?.t('creator.dialogs.btnCancel') || 'Cancel'
                ],
                title: window.i18n?.t('creator.dialogs.batchTitle') || 'Batch Operation',
                message: window.i18n?.t('creator.dialogs.batchMsg', { count: timeSegments.length }) || `Selected ${timeSegments.length} segments, how to process?`,
                detail: window.i18n?.t('creator.dialogs.batchDetail') || 'Batch processing creates a separate file for each segment.\nMerging combines all segments before processing (e.g., long video).'
            });

            if (mode && mode.response === 2) return;

            if (mode && mode.response === 1 && action !== 'clip') {
                window.app.showToast(window.i18n?.t('creator.toasts.onlyClipSupportMerge') || 'Only "Quick Clip" supports merging. Executing batch process instead.', 'info');
            } else if (mode && mode.response === 1 && action === 'clip') {
                await flow.videoProcessor.smartClip({
                    format: data || 'mp4',
                    segments: timeSegments
                });
                return;
            }
        }

        flow.showProgress(window.i18n?.t('creator.toasts.batchProcessStart', { count: timeSegments.length }) || `Processing ${timeSegments.length} selected segment(s)...`);

        for (let i = 0; i < timeSegments.length; i++) {
            const seg = timeSegments[i];
            const opts = {
                startTime: seg.start,
                endTime: seg.end,
                originalName: seg.name,
                isBatch: true
            };

            try {
                const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
                flow.updateProgress((i / timeSegments.length) * 100, t('creator.toasts.processingBatch', { current: i + 1, total: timeSegments.length, name: seg.name }));

                switch (action) {
                case 'vertical':
                    await flow.videoProcessor.makeVertical(opts);
                    break;
                case 'speed': {
                    let speedValue = data;
                    if (data === 'custom') {
                        const input = await flow.showInputDialog(
                            window.i18n?.t('creator.toasts.customSpeedPrompt') || 'Please enter custom speed (0.25 - 4.0):',
                            window.i18n?.t('creator.toasts.customSpeedExample') || 'Example: 1.25',
                            '1.25'
                        );
                        if (!input) break;
                        speedValue = parseFloat(input);
                        if (isNaN(speedValue) || speedValue < 0.25 || speedValue > 4) {
                            window.app?.showToast?.(window.i18n?.t('creator.toasts.invalidSpeed') || 'Invalid speed value, please enter a number between 0.25 and 4.0', 'error');
                            break;
                        }
                    }
                    await flow.videoProcessor.changeSpeed({ ...opts, speed: speedValue });
                    break;
                }
                case 'gif':
                    await flow.videoProcessor.generateGif(opts);
                    break;
                case 'compress':
                    await flow.videoProcessor.compressVideo({ ...opts, codec: data });
                    break;
                case 'convert':
                    await flow.videoProcessor.convertFormat({ ...opts, format: data });
                    break;
                case 'demucs':
                    await flow.audioHandler.separateAudio(opts);
                    break;
                case 'denoise':
                    await flow.audioHandler.denoiseAudio({ ...opts, level: data });
                    break;
                case 'silence':
                    if (flow.silenceProcessor) {
                        await flow.silenceProcessor.process(opts);
                    }
                    break;
                case 'clip':
                    await flow.videoProcessor.smartClip({ ...opts, format: data || 'mp4' });
                    break;
                }
            } catch (e) {
                console.error(`Error processing segment ${i}:`, e);
            }
        }

        flow.hideProgress();
        window.app.showToast(window.i18n?.t('creator.toasts.batchComplete') || 'Batch process complete!', 'success');
    }

    async executeTool(action, params = {}) {
        const flow = this.flow;
        console.log(`[CreatorFlow] Executing tool: ${action}`, params);

        switch (action) {
        case 'render':
            return await flow.videoProcessor?.renderProject();

        case 'vertical':
            return await flow.videoProcessor?.makeVertical();

        case 'rotate':
            return await flow.videoProcessor?.rotateVideo();

        case 'mirror':
            return await flow.videoProcessor?.mirrorVideo();

        case 'crop':
            return await flow.videoProcessor?.cropVideo();

        case 'audio-enhancement':
            flow.uiManager.showProperties('audio');
            flow.showToast(window.i18n?.t('creator.toasts.openingAudioEnhance') || 'Opening audio enhancement tool...', 'info');
            break;

        case 'select-output-path': {
            const path = await flow.uiManager.askFolderPath();
            if (path) {
                const input = document.getElementById('creator-output-path');
                if (input) {
                    input.value = path;
                    window.mediaflow?.store?.set('last_creator_output_path', path);
                }
            }
            break;
        }

        default:
            console.warn(`[CreatorFlow] Unknown tool action: ${action}`);
        }
    }
}

window.CreatorFlowToolDispatcher = CreatorFlowToolDispatcher;
