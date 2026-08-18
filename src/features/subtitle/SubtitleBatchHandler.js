class SubtitleBatchHandler {
    constructor(flow) {
        this.flow = flow;
        this.batchFiles = [];
        this.isProcessing = false;

        // Cache elements if needed, or access via flow
        this.batchInfo = document.getElementById('batch-info-panel');
        this.batchCount = document.getElementById('batch-count-value');
        this.batchSummary = document.getElementById('batch-status-summary');
        this.batchListContainer = document.getElementById('batch-file-list');
    }

    translateOrFallback(key, fallback, params) {
        return window.SubtitleUtils?.translateOrFallback?.(key, fallback, params) ?? fallback;
    }

    getBatchStatusCounts() {
        return this.batchFiles.reduce((counts, file) => {
            const status = String(file?.status || 'pending');
            counts.total += 1;
            if (status === 'success') counts.success += 1;
            else if (status === 'error') counts.error += 1;
            else if (status === 'processing') counts.processing += 1;
            else counts.pending += 1;
            return counts;
        }, {
            total: 0,
            pending: 0,
            processing: 0,
            success: 0,
            error: 0
        });
    }

    t(key, fallback, params) {
        const raw = window.i18n?.t?.(key, params);
        if (raw && raw !== key) return raw;
        if (!params) return fallback;
        return String(fallback).replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '').replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
    }

    updateBatchSummary() {
        const currentMode = document.querySelector('input[name="input-mode"]:checked')?.value;
        const counts = this.getBatchStatusCounts();
        const shouldShow = currentMode === 'batch' && counts.total > 0;

        if (this.batchInfo) {
            this.batchInfo.style.display = shouldShow ? 'grid' : 'none';
        }
        if (this.batchCount) {
            this.batchCount.textContent = String(counts.total);
        }
        if (this.batchSummary) {
            this.batchSummary.textContent = [
                this.t('subtitle.batch.summary_pending', '待处理: {count}', { count: counts.pending }),
                this.t('subtitle.batch.summary_processing', '处理中: {count}', { count: counts.processing }),
                this.t('subtitle.batch.summary_success', '已完成: {count}', { count: counts.success }),
                this.t('subtitle.batch.summary_error', '失败: {count}', { count: counts.error })
            ].join(' · ');
        }
    }

    /**
     * Clear batch queue (+ optional media unload).
     */
    async clearBatchQueue({ clearMedia = true, confirm = true } = {}) {
        if (this.isProcessing) {
            window.app?.showToast?.(this.t('subtitle.batch.busy', '批量处理进行中，请稍候'), 'warning');
            return false;
        }
        if (!this.batchFiles?.length) {
            window.app?.showToast?.(this.t('subtitle.batch.queue_empty', '队列已是空的'), 'info');
            return false;
        }

        if (confirm) {
            const msg = this.t(
                'subtitle.confirm.clear_batch_queue',
                '清空批量队列（{count} 个文件）？将同时清除当前预览媒体。',
                { count: this.batchFiles.length }
            );
            const ok = window.app?.showConfirm ? await window.app.showConfirm(msg) : window.confirm(msg);
            if (!ok) return false;
        }

        this.batchFiles = [];
        this.renderBatchList();
        this.updateBatchSummary();

        if (clearMedia) {
            await this.flow.mediaHandler?.clearMedia?.({ confirm: false });
        }

        window.app?.showToast?.(this.t('subtitle.toast.batch_queue_cleared', '已清空批量队列'), 'success');
        return true;
    }

    async selectBatchFolder() {
        const folder = await window.mediaflow?.dialog?.selectFolder?.();
        if (!folder) return;

        this.flow.showProgress(window.i18n.t('subtitle.messages.scanning'));
        try {
            const files = await window.mediaflow.file.scanVideo(folder);
            this.batchFiles = files.map(f => ({ ...f, status: 'pending' })) || [];

            // Render List
            this.renderBatchList();
            this.updateBatchSummary();

            window.app?.showToast?.(window.i18n.t('subtitle.messages.scanDone', { count: this.batchFiles.length }), 'success');
        } catch (e) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.scanFailed') + e.message, 'error');
        } finally {
            this.flow.hideProgress();
        }
    }

    renderBatchList() {
        if (!this.batchListContainer) return;

        if (!this.batchFiles || this.batchFiles.length === 0) {
            this.updateBatchSummary();
            this.batchListContainer.style.display = 'none';
            this.batchListContainer.innerHTML = '';
            return;
        }

        // 仅在批量模式下显示
        const currentMode = document.querySelector('input[name="input-mode"]:checked')?.value;
        this.batchListContainer.style.display = currentMode === 'batch' ? 'block' : 'none';
        this.updateBatchSummary();

        const queueTitle = this.t('subtitle.batch.queue_label', '处理队列 ({count})', { count: this.batchFiles.length });
        this.batchListContainer.innerHTML = `
            <div class="batch-list-header">
                <span class="batch-list-title">${queueTitle}</span>
                <div class="batch-list-header-actions">
                    <button class="btn btn-xs btn-outline" id="btn-apply-all-subs" title="${this.t('subtitle.batch.apply_all_tip', '把当前字幕应用到队列全部文件')}">
                        <i class="fa-solid fa-copy"></i> ${this.t('subtitle.batch.apply_all', '应用到全部')}
                    </button>
                    <button class="btn btn-xs btn-outline danger" id="btn-clear-batch-list" title="${this.t('subtitle.batch.clear_queue', '清空队列')}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;

        // 绑定“应用到全部”按钮
        const btnApplyAll = this.batchListContainer.querySelector('#btn-apply-all-subs');
        btnApplyAll?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.applyCurrentToAll();
        });
        this.batchListContainer.querySelector('#btn-clear-batch-list')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearBatchQueue();
        });

        const ul = document.createElement('ul');
        ul.className = 'batch-files';

        this.batchFiles.forEach((file) => {
            const li = document.createElement('li');
            li.className = 'batch-file-item';
            if (file.status) li.classList.add(`status-${file.status}`);
            if (this.flow.videoFile && this.flow.videoFile.path === file.path) li.classList.add('active');
            li.title = file.path;

            // Icon
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-video';
            icon.style.marginRight = '10px';
            icon.style.fontSize = '12px';
            icon.style.color = 'var(--text-muted)';

            // Name
            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = file.name;

            // Status Icon
            const statusIcon = document.createElement('span');
            statusIcon.className = 'status-icon';
            statusIcon.style.marginLeft = 'auto'; // Push to right
            statusIcon.innerHTML = this.getStatusIconHtml(file.status);

            li.appendChild(icon);
            li.appendChild(name);
            li.appendChild(statusIcon);

            // Click to load
            li.addEventListener('click', () => {
                // --- 核心修复：切换前先保存当前字幕到旧文件的缓存 ---
                if (this.flow.videoFile && this.flow.videoFile.path) {
                    this.saveCurrentToCache(this.flow.videoFile.path);
                }

                ul.querySelectorAll('.batch-file-item').forEach(i => i.classList.remove('active'));
                li.classList.add('active');
                this.flow.loadVideo(file.path);
            });

            ul.appendChild(li);
        });

        this.batchListContainer.appendChild(ul);
    }

    /**
     * 将当前编辑器中的字幕保存到指定文件的批量缓存中
     */
    saveCurrentToCache(filePath) {
        if (!filePath) return;
        const file = this.batchFiles.find(f => f.path === filePath);
        if (!file) return;

        const trackState = this.flow.trackManager?.exportBatchState?.();
        const mainTrack = trackState?.tracks?.find((track) => track.type === 'main') || null;
        const hasTrackContent = !!trackState?.tracks?.some((track) => Array.isArray(track.subtitles) && track.subtitles.length > 0);

        if (trackState) {
            file.cachedTrackState = JSON.parse(JSON.stringify(trackState));
        }

        if (mainTrack) {
            file.cachedSubtitles = JSON.parse(JSON.stringify(mainTrack.subtitles || []));
            console.log(`[Batch] Saved subtitles to cache for: ${file.name} (Count: ${file.cachedSubtitles.length})`);
        }

        if (file.status === 'pending' && hasTrackContent) {
            this.updateFileStatus(this.batchFiles.indexOf(file), 'success');
        }
    }

    /**
     * 应用当前字幕到所有视频
     */
    async applyCurrentToAll() {
        const trackState = this.flow.trackManager?.exportBatchState?.();
        const mainTrack = trackState?.tracks?.find((track) => track.type === 'main') || null;
        const subs = mainTrack ? mainTrack.subtitles : [];
        const hasTrackContent = !!trackState?.tracks?.some((track) => Array.isArray(track.subtitles) && track.subtitles.length > 0);

        if (!hasTrackContent) {
            window.app?.showToast?.(window.i18n.t('subtitle.toast.no_subs_to_apply'), 'warning');
            return;
        }

        const confirmText = window.i18n.t('subtitle.confirm.apply_all', { count: subs.length, total: this.batchFiles.length });
        const confirmApply = await window.app.showConfirm(confirmText);
        if (!confirmApply) return;

        this.batchFiles.forEach(file => {
            file.cachedTrackState = trackState ? JSON.parse(JSON.stringify(trackState)) : null;
            file.cachedSubtitles = JSON.parse(JSON.stringify(subs));
            file.status = 'success';
        });

        this.renderBatchList();
        this.updateBatchSummary();
        window.app?.showToast?.(window.i18n.t('subtitle.toast.apply_all_success'), 'success');
    }

    async runBatchProcess(mode = 'burn') {
        if (!this.batchFiles || this.batchFiles.length === 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.messages.noBatchFiles'), 'warning');
            return;
        }

        // --- 核心修复：开始批量处理前，强制保存当前正在编辑的文件到缓存 ---
        if (this.flow.videoFile && this.flow.videoFile.path) {
            console.log(`[Batch] Auto-saving current work for ${this.flow.videoFile.name}`);
            this.saveCurrentToCache(this.flow.videoFile.path);
        }

        const confirmKey = mode === 'recognize' ? 'subtitle.messages.confirmRecognize' : 'subtitle.messages.confirmProcess';
        const confirmText = window.i18n.t(confirmKey, { count: this.batchFiles.length });

        const confirmStart = await window.app.showConfirm(confirmText);
        if (!confirmStart) return;

        this.flow.isProcessing = true; // Sync state

        // --- 关键修复：开始批量处理前，先保存当前编辑器中可能正在编辑的字幕 ---
        if (this.flow.videoFile && this.flow.videoFile.path) {
            console.log('[Batch] Auto-saving current editor state before batch start...');
            this.saveCurrentToCache(this.flow.videoFile.path);
        }

        // Reset statuses
        this.batchFiles.forEach(f => f.status = 'pending');
        this.renderBatchList();
        this.updateBatchSummary();

        let successCount = 0;
        let failCount = 0;

        let outputDir = null;
        if (mode === 'burn') {
            outputDir = this.flow.outputPath?.value;
            if (!outputDir) {
                outputDir = await window.mediaflow?.dialog?.selectFolder?.({ title: window.i18n.t('subtitle.messages.selectFoldertTitle') });
                if (!outputDir) {
                    this.flow.isProcessing = false;
                    return;
                }
            }
        }

        for (let i = 0; i < this.batchFiles.length; i++) {
            const file = this.batchFiles[i];
            const progressPrefix = window.i18n.t('subtitle.progress.batch_file_prefix', { current: i + 1, total: this.batchFiles.length, name: file.name });

            this.flow.showProgress(`${progressPrefix} - ${window.i18n.t('subtitle.messages.preparing')}`);

            try {
                this.updateFileStatus(i, 'processing');
                await this.processSingleFileBatch(file, outputDir, (msg) => {
                    this.flow.showProgress(`${progressPrefix} - ${msg}`);
                }, mode);

                this.updateFileStatus(i, 'success');
                successCount++;
            } catch (error) {
                console.error(`[Batch] Error processing file ${file.name}:`, error);
                this.updateFileStatus(i, 'error');
                failCount++;
            }

            // check flow state in case of cancel
            if (!this.flow.isProcessing) break;
        }

        this.flow.hideProgress();
        this.flow.isProcessing = false;
        this.updateBatchSummary();

        const actionName = mode === 'recognize' ? window.i18n.t('subtitle.messages.recognizeAction') : window.i18n.t('subtitle.messages.processAction');
        window.app?.showToast?.(window.i18n.t('subtitle.messages.batchDone', { action: actionName, success: successCount, fail: failCount }), 'success');
    }

    async processSingleFileBatch(file, outputDir, onProgress, mode = 'burn') {
        // --- 核心修复：获取视频元数据 (分辨率和时长) ---
        if (!file.width || !file.height || !file.duration) {
            onProgress(window.i18n.t('subtitle.messages.probing'));
            try {
                const info = await window.mediaflow.subtitle.getVideoInfo(file.path);
                if (info) {
                    file.width = info.width;
                    file.height = info.height;
                    file.duration = info.duration;
                    console.log(`[Batch] Probed video info for ${file.name}: ${info.width}x${info.height}, ${info.duration}s`);
                }
            } catch (e) {
                console.error('[Batch] Failed to probe video info:', e);
            }
        }

        const normalizeSubtitles = (subtitles, ensureText = false) => (subtitles || []).map((subtitle) => {
            const startVal = subtitle.start !== undefined ? subtitle.start : (subtitle.startTime !== undefined ? subtitle.startTime : 0);
            const endVal = subtitle.end !== undefined ? subtitle.end : (subtitle.endTime !== undefined ? subtitle.endTime : 0);
            return {
                ...subtitle,
                start: parseFloat(startVal) || 0,
                end: parseFloat(endVal) || 0,
                text: ensureText ? (subtitle.text || subtitle.originalText || '') : subtitle.text
            };
        });

        let cachedTrackState = file.cachedTrackState?.tracks?.length
            ? JSON.parse(JSON.stringify(file.cachedTrackState))
            : null;
        let cachedTracksToBurn = cachedTrackState?.tracks?.length
            ? cachedTrackState.tracks.map((track) => ({
                ...track,
                subtitles: normalizeSubtitles(track.subtitles, true)
            }))
            : null;

        const resolveCachedMainTrack = () => cachedTracksToBurn?.find((track) => track.type === 'main')
            || cachedTracksToBurn?.[0]
            || null;

        // 1. Check for cached subtitles (manually edited or previously recognized)
        let finalSubtitles = resolveCachedMainTrack()?.subtitles || file.cachedSubtitles;

        if (!finalSubtitles || finalSubtitles.length === 0) {
            onProgress(window.i18n.t('subtitle.messages.identifyingBatch'));
            // 1. Transcribe
            const provider = this.flow.translationEngine?.value || 'groq';
            const lang = this.flow.sourceLanguage?.value || 'auto';

            // Fetch API Key from store
            let apiKey = null;
            try {
                const storedKeys = await window.mediaflow.store.get(`translation-keys-${provider}`);
                if (Array.isArray(storedKeys)) {
                    apiKey = storedKeys.length > 0 ? storedKeys[0] : null;
                } else {
                    apiKey = storedKeys;
                }
            } catch (e) {
                console.error('[Batch] Error fetching API key:', e);
            }

            // 构造识别提示词 (Initial Prompt)
            let styleHint = this.flow.aiStyleHint?.value || '';
            const languageName = window.ScribeService?.getLanguageName?.(lang) || lang;
            
            let initialPrompt = '';
            if (lang !== 'none') {
                const langHintValue = lang === 'auto' ? window.i18n.t('subtitle.messages.lang_hint_auto') : languageName;
                initialPrompt = window.i18n.t('subtitle.prompts.aiRecognize', { langHint: langHintValue, styleHint: styleHint });
            }

            const segments = await window.TranslationService.transcribe({ path: file.path, name: file.name }, {
                language: lang,
                provider: provider,
                apiKey: apiKey,
                prompt: initialPrompt
            });

            // 2. Translate
            onProgress(window.i18n.t('subtitle.messages.translatingBatch'));
            const targetLang = this.flow.targetLanguage?.value || 'zh-Hans';
            finalSubtitles = segments;

            if (targetLang !== 'source') {
                const translationResolution = await this.flow.service.resolveSegmentTranslations(segments, targetLang, {
                    provider: provider
                });
                const translatedSegments = translationResolution.segments;

                if (this.flow.keepBilingual?.checked) {
                    finalSubtitles = segments.map((seg, i) => ({
                        ...seg,
                        text: `${seg.text}\n${translatedSegments[i]?.translatedText || ''}`,
                        translationTargetLang: targetLang || null
                    }));
                } else {
                    finalSubtitles = translatedSegments;
                }

                if (translationResolution.memoryHits > 0) {
                    console.log(`[Batch] Reused ${translationResolution.memoryHits} translation memory hits for ${file.name}`);
                }
            }

            // Cache results!
            this.updateFileSubtitles(file.path, finalSubtitles);
            cachedTrackState = this.getFileTrackState(file.path);
            cachedTracksToBurn = cachedTrackState?.tracks?.length
                ? cachedTrackState.tracks.map((track) => ({
                    ...track,
                    subtitles: normalizeSubtitles(track.subtitles, true)
                }))
                : null;
        } else {
            onProgress(window.i18n.t('subtitle.messages.usingCache'));
        }

        // --- 核心修复：标准化数据字段并强制转换为浮点数 ---
        // 确保导出和烧录模块能识别时间轴且不会因为字符串导致 NaN
        finalSubtitles = normalizeSubtitles(finalSubtitles);

        // If Recognize Only, we are done
        if (mode === 'recognize') {
            return;
        }

        // 3. Burn/Export
        onProgress(window.i18n.t('subtitle.messages.burningBatch'));

        // --- 核心修复：强制标准化字幕属性并记录审计日志 ---
        finalSubtitles = normalizeSubtitles(finalSubtitles, true);

        const normalizedOutputDir = outputDir.endsWith('\\') ? outputDir.slice(0, -1) : outputDir;
        const outputPath = normalizedOutputDir + '\\' + 'subbed_' + file.name;

        console.log(`[Batch] Launching burn for: ${file.name}`);
        console.log(`[Batch] Valid Subtitle Count: ${finalSubtitles.length}`);
        if (finalSubtitles.length > 0) {
            console.log(`[Batch] Sample 0: [${finalSubtitles[0].start}s - ${finalSubtitles[0].end}s] Text: "${finalSubtitles[0].text.substring(0, 40)}"`);
        } else {
            console.error('[Batch] ERROR: Array is empty, nothing to burn!');
        }

        // Use cached full track state when available so non-main subtitle tracks survive batch export.
        const tracksData = cachedTracksToBurn?.filter((track) => Array.isArray(track.subtitles) && track.subtitles.length > 0)
            || [];

        if (tracksData.length === 0) {
            const mainTrack = this.flow.tracks ? this.flow.tracks.find(t => t.type === 'main') : null;
            const style = mainTrack?.style || this.flow.currentStyle;
            tracksData.push({
                id: 'batch_main',
                type: 'main',
                subtitles: finalSubtitles,
                style: style
            });
        }

        // Blur Settings (Support both systems)
        let blurSettings = null;
        let blurMasks = [];

        const blurStyle = this.flow.styleManager?.currentStyle || {};
        const blurEnabled = !!(
            this.flow.styleManager?.blurOriginal?.checked ??
            blurStyle.blurOriginal
        );

        if (blurEnabled) {
            // Legacy
            blurSettings = {
                position: 'custom',
                yOffset: parseInt(blurStyle.blurMasks?.[0]?.y || 80, 10),
                height: parseInt(blurStyle.blurMasks?.[0]?.height || 10, 10),
                strength: parseInt(blurStyle.blurMasks?.[0]?.strength || 10, 10)
            };
            // New
            if (Array.isArray(blurStyle.blurMasks) && blurStyle.blurMasks.length > 0) {
                blurMasks = JSON.parse(JSON.stringify(blurStyle.blurMasks));
            }
        }

        // TTS Generation (Batch)
        let ttsSettings = null;
        if (this.flow.ttsHandler && this.flow.enableTTS?.checked) {
            onProgress(window.i18n.t('subtitle.messages.ttsBatch'));
            try {
                const ttsInfo = this.flow.ttsHandler.getSettings();
                const ttsPath = await this.flow.ttsHandler.generateBatch(finalSubtitles);

                if (ttsPath) {
                    ttsSettings = {
                        armed: true,
                        enabled: true,
                        audioPath: ttsPath,
                        audioMode: ttsInfo.audioMode,
                        voiceVolume: (ttsInfo.volume || 80) / 100,
                        bgmVolume: (ttsInfo.bgmVolume || 30) / 100
                    };
                }
            } catch (e) {
                console.error('TTS Generation failed (Batch):', e);
            }
        }

        await window.mediaflow.subtitle.burn({
            videoPath: file.path,
            duration: file.duration || 0,
            width: file.width || 1920,
            height: file.height || 1080,
            tracks: tracksData,
            blurSettings: blurSettings,
            blurMasks: blurMasks,
            ttsSettings: ttsSettings,
            outputPath: outputPath
        });
    }

    updateFileStatus(index, status) {
        if (this.batchFiles[index]) {
            this.batchFiles[index].status = status;
            // Update UI directly if possible to avoid full re-render
            const list = this.batchListContainer?.querySelector('ul');
            if (list && list.children[index]) {
                const li = list.children[index];
                const icon = li.querySelector('.status-icon');
                if (icon) icon.innerHTML = this.getStatusIconHtml(status);

                // Optional: Add class for styling
                li.classList.remove('status-pending', 'status-processing', 'status-success', 'status-error');
                li.classList.add(`status-${status}`);
            }
        }
    }

    getStatusIconHtml(status) {
        switch (status) {
        case 'processing': return '<i class="fa-solid fa-circle-notch fa-spin" style="color: #eab308;"></i>';
        case 'success': return '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
        case 'error': return '<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i>';
        default: return '<i class="fa-solid fa-circle" style="opacity: 0.1; font-size: 8px;"></i>'; // Pending
        }
    }

    /**
     * Cache subtitles for a specific file
     */
    updateFileSubtitles(filePath, subtitles) {
        const file = this.batchFiles.find(f => f.path === filePath);
        if (file) {
            file.cachedSubtitles = JSON.parse(JSON.stringify(subtitles || []));

            const baseTrackState = file.cachedTrackState?.tracks?.length
                ? JSON.parse(JSON.stringify(file.cachedTrackState))
                : (this.flow.trackManager?.exportBatchState?.() || {
                    activeTrackId: 'batch_main',
                    tracks: [{
                        id: 'batch_main',
                        name: 'Main',
                        type: 'main',
                        subtitles: [],
                        visible: true,
                        locked: false,
                        color: '#6b9ad4',
                        style: this.flow.currentStyle ? JSON.parse(JSON.stringify(this.flow.currentStyle)) : null,
                        ttsAudioPath: null,
                        ttsGenerated: false
                    }]
                });

            const mainTrack = baseTrackState.tracks.find((track) => track.type === 'main') || baseTrackState.tracks[0];
            if (mainTrack) {
                mainTrack.subtitles = JSON.parse(JSON.stringify(subtitles || []));
                file.cachedTrackState = baseTrackState;
            }

            this.updateFileStatus(this.batchFiles.indexOf(file), 'success');
        }
    }

    getFileTrackState(filePath) {
        const file = this.batchFiles.find(f => f.path === filePath);
        return file?.cachedTrackState ? JSON.parse(JSON.stringify(file.cachedTrackState)) : null;
    }

    /**
     * Retrieve cached subtitles
     */
    getFileSubtitles(filePath) {
        const file = this.batchFiles.find(f => f.path === filePath);
        return file ? file.cachedSubtitles : null;
    }
}

window.SubtitleBatchHandler = SubtitleBatchHandler;
