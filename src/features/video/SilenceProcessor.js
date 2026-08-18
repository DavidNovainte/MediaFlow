/**
 * SilenceProcessor.js
 * 静音检测与移除功能模块
 */

class SilenceProcessor {
    constructor(core) {
        this.core = core; // Reference to CreatorFlow (for shared state)
        this.silenceSegments = [];
    }

    /**
     * 初始化静音移除功能
     */
    init() {
        const detectBtn = document.getElementById('btn-prop-detect-silence');
        const runBtn = document.getElementById('btn-prop-run-silence');

        if (runBtn) {
            runBtn.disabled = this.silenceSegments.length === 0;
        }

        detectBtn?.addEventListener('click', () => this.detectSilence());
        runBtn?.addEventListener('click', () => {
            if (this.silenceSegments.length > 0) {
                this.removeSilence();
            } else {
                window.app?.showToast(window.i18n?.t('creator.toasts.detectSilenceFirst') || 'Please detect silence segments first', 'warning');
            }
        });
    }

    /**
     * 检测静音段落
     */
    async detectSilence() {
        if (!this.core.videoFile) {
            window.app?.showToast(window.i18n?.t('creator.toasts.loadMediaFirst') || 'Please select a video first', 'warning');
            return;
        }
        if (!(await this.core.checkFileExists(this.core.videoFile.path))) return;

        const threshold = document.getElementById('silence-threshold')?.value || '-40';
        const minDuration = document.getElementById('silence-duration')?.value || '0.5';

        try {
            const detectBtn = document.getElementById('btn-prop-detect-silence');
            if (detectBtn) {
                detectBtn.disabled = true;
                detectBtn.textContent = window.i18n?.t('creator.silence.statusDetecting') || 'Scanning...';
            }
            window.app?.showToast(window.i18n?.t('creator.silence.statusDetecting') || 'Detecting silence segments...', 'info');

            const result = await window.mediaflow?.creator.detectSilence(this.core.videoFile.path, {
                threshold: parseFloat(threshold),
                minDuration: parseFloat(minDuration)
            });

            if (result && result.success) {
                this.silenceSegments = result.segments || [];
                this.core.silenceSegments = this.silenceSegments; // Sync to core
                this.renderSilencePreview(result);

                if (this.silenceSegments.length > 0) {
                    const runBtn = document.getElementById('btn-prop-run-silence');
                    if (runBtn) runBtn.disabled = false;
                    const successMsg = window.i18n?.t('creator.silence.detectSuccess', { count: this.silenceSegments.length }) || `Detection success: Found ${this.silenceSegments.length} segments`;
                    window.app?.showToast(successMsg, 'success');
                } else {
                    const runBtn = document.getElementById('btn-prop-run-silence');
                    if (runBtn) runBtn.disabled = true;
                    window.app?.showToast(window.i18n?.t('creator.silence.detectNone') || 'No silence segments detected. Try adjusting the threshold.', 'warning');
                }
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.silence.detectFail') || 'Detection failed'));
            }
        } catch (error) {
            console.error('[SilenceProcessor] Detection error:', error);
            window.app?.showToast((window.i18n?.t('creator.silence.detectFail') || 'Detection alert') + ': ' + error.message, 'error');
        } finally {
            const btn = document.getElementById('btn-prop-detect-silence');
            if (btn) {
                btn.disabled = false;
                btn.textContent = window.i18n?.t('creator.audio.scanBtn') || 'Scan';
            }
        }
    }

    /**
     * 渲染静音检测预览
     */
    renderSilencePreview(result) {
        const preview = document.getElementById('silence-preview');
        const bar = document.getElementById('silence-bar');
        const stats = document.getElementById('silence-stats');
        const originalDuration = document.getElementById('silence-original-duration');
        const outputDuration = document.getElementById('silence-output-duration');
        const savedPercent = document.getElementById('silence-saved-percent');

        if (!preview || !bar) return;

        preview.classList.remove('hidden');
        stats.textContent = window.i18n?.t('creator.silence.segmentsCount', { count: result.segments.length }) || `${result.segments.length} segments`;

        // Calculate time savings
        const totalDuration = this.core.videoDuration;
        const silenceDuration = result.segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
        const outputTime = totalDuration - silenceDuration;
        const savedPct = Math.round((silenceDuration / totalDuration) * 100);

        const fTotal = this.formatTime(totalDuration);
        const fOutput = this.formatTime(outputTime);

        if (originalDuration) {
            originalDuration.setAttribute('data-i18n-params', JSON.stringify({ time: fTotal }));
            originalDuration.textContent = window.i18n?.t('creator.silence.statsOriginal', { time: fTotal }) || `Original: ${fTotal}`;
        }

        if (outputDuration) {
            outputDuration.setAttribute('data-i18n-params', JSON.stringify({ time: fOutput }));
            outputDuration.textContent = window.i18n?.t('creator.silence.statsOutput', { time: fOutput }) || `Output: ${fOutput}`;
        }

        // Update the i18n parameter and text content to preserve translation
        if (savedPercent) {
            savedPercent.setAttribute('data-i18n-params', JSON.stringify({ percent: savedPct }));
            savedPercent.textContent = window.i18n?.t('creator.silence.statsSaved', { percent: savedPct }) || `Saved: ${savedPct}%`;
        }

        // Render visual bar
        bar.innerHTML = '';
        bar.style.background = 'linear-gradient(to right, #10b981, #10b981)';
        result.segments.forEach(seg => {
            const left = (seg.start / totalDuration) * 100;
            const width = ((seg.end - seg.start) / totalDuration) * 100;
            const marker = document.createElement('div');
            marker.style.cssText = `position: absolute; left: ${left}%; width: ${width}%; height: 100%; background: #ef4444; opacity: 0.8;`;
            const timeRange = `${this.formatTime(seg.start)} - ${this.formatTime(seg.end)}`;
            marker.title = window.i18n?.t('creator.silence.markerDefault', { start: this.formatTime(seg.start), end: this.formatTime(seg.end) }) || `静音: ${timeRange}`;
            bar.appendChild(marker);
        });

        // Pro Integration: Highlight on Timeline A1 Track
        if (this.core.timelineManager) {
            const trackContainer = document.getElementById('timeline-waveform-a1');
            if (trackContainer) {
                // Clear old highlights
                trackContainer.querySelectorAll('.silence-highlight').forEach(el => el.remove());

                const pixelsPerSecond = this.core.timelineManager.pixelsPerSecond * (this.core.timelineManager.zoomLevel / 100);

                result.segments.forEach(seg => {
                    const el = document.createElement('div');
                    el.className = 'silence-highlight';
                    el.style.position = 'absolute';
                    el.style.left = `${seg.start * pixelsPerSecond}px`;
                    el.style.width = `${(seg.end - seg.start) * pixelsPerSecond}px`;
                    el.style.height = '100%';
                    el.style.top = '0';
                    el.style.background = 'rgba(239, 68, 68, 0.3)'; // Red transparent highlight
                    el.style.borderLeft = '1px solid #ef4444';
                    el.style.borderRight = '1px solid #ef4444';
                    el.style.pointerEvents = 'none';
                    trackContainer.appendChild(el);
                });
            }
        }
    }

    /**
     * 格式化时间
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * 移除静音段落
     */
    async removeSilence() {
        if (!this.core.videoFile || this.silenceSegments.length === 0) {
            window.app?.showToast(window.i18n?.t('creator.toasts.detectSilenceFirst') || 'Please detect silence segments first', 'warning');
            return;
        }
        if (!(await this.core.checkFileExists(this.core.videoFile.path))) return;

        const mode = document.querySelector('input[name="silence-mode"]:checked')?.value || 'remove';

        let cleanupProgress = null;

        try {
            const runBtn = document.getElementById('btn-prop-run-silence');
            if (runBtn) {
                runBtn.disabled = true;
                runBtn.textContent = window.i18n?.t('creator.silence.statusProcessing') || 'Processing...';
            }
            this.core.showProgress(window.i18n?.t('creator.silence.statusProcessing') || 'Processing silence segments...');

            cleanupProgress = window.mediaflow?.creator.onProgress((data) => {
                this.core.updateProgress(data.progress, data.status);
            });

            const cancelFunc = async () => {
                await window.mediaflow?.creator.cancel();
            };

            this.core.showProgress(window.i18n?.t('creator.silence.statusInit') || 'Initializing process...', 0, true, cancelFunc);

            const result = await window.mediaflow?.creator.removeSilence(
                this.core.videoFile.path,
                this.silenceSegments,
                { mode }
            );

            if (result && result.success) {
                window.app?.showToast(window.i18n?.t('creator.silence.processSuccess') || `Silence removal completed! Saved to: ${result.outputPath}`, 'success');
            } else if (result?.cancelled) {
                window.app?.showToast(window.i18n?.t('creator.silence.processCancel') || 'Task cancelled', 'info');
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.silence.processFail') || 'Processing failed'));
            }
        } catch (error) {
            const msg = error && error.message != null ? String(error.message) : String(error || '');
            if (msg.includes('User cancelled') || msg.includes('cancelled')) {
                window.app?.showToast(window.i18n?.t('creator.silence.processCancel') || 'Task cancelled', 'info');
            } else {
                console.error('[SilenceProcessor] Removal error:', error);
                window.app?.showToast((window.i18n?.t('creator.silence.processFail') || 'Processing failed') + ': ' + msg, 'error');
            }
        } finally {
            if (cleanupProgress) cleanupProgress();
            this.core.hideProgress();

            const btn = document.getElementById('btn-prop-run-silence');
            if (btn) {
                btn.disabled = this.silenceSegments.length === 0;
                btn.textContent = window.i18n?.t('creator.audio.applySilenceBtn') || 'Apply Silence Processing';
            }
        }
    }

    /**
     * 批量移除静音专用逻辑 (无需 UI 交互)
     */
    async removeSilenceBatch(inputPath, outputPath, options, onProgress) {
        try {
            // 1. 自动检测
            if (onProgress) onProgress(10, window.i18n?.t('creator.silence.statusDetecting') || 'Scanning for silence...');
            const detectResult = await window.mediaflow?.creator.detectSilence(inputPath, {
                threshold: parseFloat(options.threshold || '-40'),
                minDuration: parseFloat(options.duration || '0.5')
            });

            if (!detectResult || !detectResult.success) {
                throw new Error(detectResult?.error || (window.i18n?.t('creator.silence.detectFail') || 'Silence detection failed'));
            }

            const segments = detectResult.segments || [];
            if (segments.length === 0) {
                // 如果没有静音，选择拷贝文件或报错。这里我们选择直接返回成功，因为目的已达到
                if (onProgress) onProgress(100, window.i18n?.t('creator.silence.detectNone') || 'No silence to remove');
                // 这里为了保持逻辑一致，如果没有静音就直接复制文件到目标路径
                const copyResult = await window.mediaflow.fs.copyFile(inputPath, outputPath);
                if (!copyResult?.success) {
                    throw new Error(copyResult?.error || 'Failed to copy unchanged media');
                }
                return { success: true, outputPath };
            }

            // 2. 自动移除
            if (onProgress) onProgress(30, window.i18n?.t('creator.silence.statusProcessing') || 'Removing silence segments...');
            const cleanupProgress = window.mediaflow?.creator.onProgress((data) => {
                // 批量模式下，我们将子任务进度映射到 30% - 100%
                const mappedPct = 30 + (data.progress * 0.7);
                if (onProgress) onProgress(mappedPct, data.status);
            });

            const result = await window.mediaflow?.creator.removeSilence(inputPath, segments, {
                mode: options.mode || 'remove',
                outputPath: outputPath // 传递目标路径
            });

            if (cleanupProgress) cleanupProgress();

            if (result && result.success) {
                return { success: true, outputPath: result.outputPath };
            } else {
                throw new Error(result?.error || (window.i18n?.t('creator.silence.processFail') || 'Processing failed'));
            }
        } catch (error) {
            console.error('[SilenceProcessor] Batch error:', error);
            throw error;
        }
    }
}

// Export for use
window.SilenceProcessor = SilenceProcessor;
