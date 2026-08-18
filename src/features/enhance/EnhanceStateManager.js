/**
 * EnhanceStateManager.js - AI 画质增强状态管理器
 * 负责管理待处理文件队列、索引切换及 UI 列表渲染
 */

class EnhanceStateManager {
    constructor(controller) {
        this.controller = controller;
        this.fileData = []; // [{ path, engine, options, result: {status, ...} }]
        this.currentIndex = 0;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 获取当前活动文件项
     */
    getCurrentItem() {
        return this.fileData[this.currentIndex] || null;
    }

    /**
     * 添加文件到队列
     */
    /**
     * 添加文件到队列
     */
    isVideoPath(p) {
        return /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(p || ''));
    }

    /**
     * Renderer fallback: read duration via <video> + media-file (works when preview works).
     */
    async probeDurationViaHtmlVideo(filePath) {
        const url = window.urlUtils?.pathToMediaUrl?.(filePath) || '';
        if (!url) throw new Error('no media-file url');
        return new Promise((resolve, reject) => {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;
            v.playsInline = true;
            let done = false;
            const finish = (ok, val) => {
                if (done) return;
                done = true;
                v.removeAttribute('src');
                try { v.load(); } catch { /* ignore */ }
                if (ok) resolve(val);
                else reject(val || new Error('html video probe failed'));
            };
            v.addEventListener('loadedmetadata', () => {
                const d = Number(v.duration);
                if (Number.isFinite(d) && d > 0 && d !== Infinity) finish(true, d);
                else finish(false, new Error('invalid duration'));
            });
            v.addEventListener('error', () => finish(false, new Error('video element error')));
            setTimeout(() => finish(false, new Error('html video probe timeout')), 6000);
            v.src = url;
        });
    }

    /**
     * Import-time video gate: probe duration; reject over MVP limit (default 45s).
     * @returns {Promise<{ok:boolean, duration?:number, max?:number, meta?:object, error?:string}>}
     */
    async checkVideoImportAllowed(filePath) {
        const maxDefault = 45;
        try {
            let duration = 0;
            let max = maxDefault;
            let meta = null;

            // 1) Main-process ffprobe (accurate)
            if (window.mediaflow?.enhance?.probeVideo) {
                const probe = await window.mediaflow.enhance.probeVideo(filePath);
                if (probe?.success) {
                    duration = Number(probe.duration) || 0;
                    max = Number(probe.maxDurationSec) || maxDefault;
                    meta = probe;
                } else {
                    console.warn('[Enhance] probeVideo failed:', probe?.error, filePath);
                }
            }

            // 2) Fallback: HTML video metadata (same path that previews successfully)
            if (!(duration > 0)) {
                try {
                    duration = await this.probeDurationViaHtmlVideo(filePath);
                    console.log('[Enhance] duration via HTML video:', duration);
                } catch (e) {
                    console.warn('[Enhance] HTML duration probe failed:', e?.message || e);
                }
            }

            if (!(duration > 0)) {
                return {
                    ok: false,
                    error: 'PROBE_FAILED',
                    max,
                    message: 'Could not read duration'
                };
            }

            if (duration > max + 0.05) {
                return { ok: false, duration, max, error: 'TOO_LONG', meta };
            }
            return { ok: true, duration, max, meta };
        } catch (e) {
            console.error('[Enhance] checkVideoImportAllowed', e);
            return { ok: false, error: e?.message || 'PROBE_ERROR', max: maxDefault };
        }
    }

    async addFiles(filePaths) {
        const currentOptions = this.controller.options;
        const currentEngine = this.controller.currentEngine;

        const existingPaths = this.fileData.map(d => d.path);
        const newPaths = filePaths.filter(p => !existingPaths.includes(p));

        const accepted = [];
        let skippedLong = 0;
        let skippedProbe = 0;
        let longestRejected = 0;
        let maxLimit = 45;

        for (const p of newPaths) {
            const isVideo = this.isVideoPath(p);
            if (isVideo) {
                const gate = await this.checkVideoImportAllowed(p);
                maxLimit = gate.max || maxLimit;
                if (!gate.ok) {
                    if (gate.error === 'TOO_LONG') {
                        skippedLong += 1;
                        if (gate.duration > longestRejected) longestRejected = gate.duration;
                    } else {
                        skippedProbe += 1;
                    }
                    continue; // do not enqueue
                }
                const opts = JSON.parse(JSON.stringify(currentOptions));
                opts.scale = 2;
                accepted.push({
                    path: p,
                    engine: currentEngine === 'gfpgan' ? 'esrgan' : currentEngine,
                    options: opts,
                    result: { status: 'pending' },
                    isVideo: true,
                    isAnalyzing: false,
                    videoMeta: gate.meta || null,
                    smartReason: window.i18n?.t('enhance.videoSmartSkip')
                        || 'Video: use CUGAN for anime, Real-ESRGAN for live action'
                });
            } else {
                const opts = JSON.parse(JSON.stringify(currentOptions));
                accepted.push({
                    path: p,
                    engine: currentEngine,
                    options: opts,
                    result: { status: 'pending' },
                    isVideo: false,
                    isAnalyzing: true
                });
            }
        }

        if (skippedLong > 0) {
            const sec = longestRejected ? Math.ceil(longestRejected) : '';
            window.app?.showToast?.(
                window.i18n?.t?.('enhance.videoTooLongImport', {
                    max: maxLimit,
                    duration: sec,
                    count: skippedLong
                }) || (sec
                    ? `已忽略 ${skippedLong} 个超过 ${maxLimit} 秒的视频（约 ${sec} 秒）。请先裁剪。`
                    : `已忽略 ${skippedLong} 个超过 ${maxLimit} 秒的视频。请先裁剪。`),
                'warning'
            );
        }
        if (skippedProbe > 0) {
            window.app?.showToast?.(
                window.i18n?.t?.('enhance.videoProbeFailImport', { count: skippedProbe })
                    || `已忽略 ${skippedProbe} 个无法读取时长的视频（请检查文件是否损坏，或引擎里是否有 ffprobe）`,
                'warning'
            );
        }

        if (!accepted.length) {
            this.controller.updateUI();
            return;
        }

        const wasEmpty = this.fileData.length === 0;
        this.fileData.push(...accepted);
        this.updateFileList();
        this.controller.updateUI();

        // Smart analysis for images only
        if (this.controller.smartSelector) {
            for (const item of accepted) {
                if (item.isVideo) continue;
                try {
                    const rec = await this.controller.smartSelector.recommend(item.path);
                    item.engine = rec.engine || item.engine;
                    if (rec.scale) item.options.scale = rec.scale;
                    if (item.engine === 'gfpgan') {
                        item.options.model = 'realesrgan-x4plus';
                        item.options.sharpen = true;
                    }
                    item.isSmartSelected = true;
                    item.smartReason = this.localizeSmartReason(rec.reason);
                    if (this.fileData[this.currentIndex] === item) {
                        this.controller.currentEngine = item.engine;
                        Object.assign(this.controller.options, item.options);
                        this.controller.updateSettingsFromItem?.(item);
                        this.controller.updateEngineOptions?.();
                    }
                } catch (e) {
                    console.error('Smart selection failed', e);
                } finally {
                    item.isAnalyzing = false;
                    this.updateFileList();
                }
            }
        } else {
            accepted.forEach((i) => { i.isAnalyzing = false; });
            this.updateFileList();
        }

        if (wasEmpty && accepted.length > 0) {
            this.switchPreview(0);
        }
    }

    /**
     * 清除已完成的任务 (Smart Clean)
     */
    clearFinished() {
        const initialCount = this.fileData.length;
        this.fileData = this.fileData.filter(item => item.result.status !== 'success');
        const removedCount = initialCount - this.fileData.length;

        if (removedCount > 0) {
            this.currentIndex = 0; // 重置索引
            this.updateFileList();
            this.controller.updateUI();

            // 如果清理后列表为空，确保重置预览
            if (this.fileData.length === 0) {
                const els = this.controller.elements;
                if (els.comparison) els.comparison.classList.add('hidden');
                if (this.controller.infoManager) this.controller.infoManager.reset();
            } else {
                // 如果还有剩余文件，切换到第一个
                this.switchPreview(0);
            }

            let msg = window.i18n?.t('enhance.toastCleared', { count: removedCount });
            // i18n returns key if translation missing, so check for that
            if (!msg || msg === 'enhance.toastCleared') {
                msg = `已清除 ${removedCount} 个已完成任务`;
            }
            window.app?.showToast(msg, 'success');
        } else {
            let msg = window.i18n?.t('enhance.toastNoFinished');
            if (!msg || msg === 'enhance.toastNoFinished') msg = '没有已完成的任务';
            window.app?.showToast(msg, 'info');
        }
    }

    /**
     * 清除所有任务 (Clear All)
     */
    clearAll() {
        if (this.fileData.length === 0) return;

        // 这里可以加一个确认弹窗，但为了操作流畅性暫時直接清除
        // 如果后续需要 confirmation，可以使用 window.confirm 或自定义模态框

        this.fileData = [];
        this.currentIndex = 0;

        this.updateFileList();
        this.controller.updateUI();

        // 重置预览区域
        const els = this.controller.elements;
        if (els.comparison) els.comparison.classList.add('hidden');
        if (this.controller.infoManager) this.controller.infoManager.reset();

        let msg = window.i18n?.t('enhance.toastAllCleared');
        if (!msg || msg === 'enhance.toastAllCleared') msg = '已清除所有任务';
        window.app?.showToast(msg, 'success');
    }

    /**
     * 移除特定索引的文件
     */
    removeFile(index) {
        this.fileData.splice(index, 1);

        if (this.fileData.length > 0) {
            const nextIndex = Math.min(index, this.fileData.length - 1);
            this.switchPreview(nextIndex);
        } else {
            this.controller.updateUI(); // 触发空状态显示
        }

        this.updateFileList();
    }

    /**
     * 切换当前预览的文件
     */
    async switchPreview(index) {
        if (index < 0 || index >= this.fileData.length) return;

        this.currentIndex = index;
        const item = this.fileData[index];

        // 获取并存储原图信息 (用于分辨率对比显示) — 视频跳过 sharp/图片接口
        const isVideo = item.isVideo || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(item.path || ''));
        item.isVideo = isVideo;
        try {
            if (isVideo) {
                this.controller.currentOriginalInfo = { kind: 'video' };
            } else if (window.mediaflow?.compress?.getInfo) {
                const info = await window.mediaflow.compress.getInfo(item.path);
                this.controller.currentOriginalInfo = (info && info.success !== false) ? info : null;
            } else if (window.mediaflow?.image?.getInfo) {
                const info = await window.mediaflow.image.getInfo(item.path);
                this.controller.currentOriginalInfo = info || null;
            } else {
                this.controller.currentOriginalInfo = null;
            }
        } catch (e) {
            console.warn('[EnhanceStateManager] Failed to get image info', e);
            this.controller.currentOriginalInfo = null;
        }

        // 同步设置到主面板
        if (this.controller.updateSettingsFromItem) {
            this.controller.updateSettingsFromItem(item);
        }
        // Re-apply scale lock / Pro banner when switching image vs video
        this.controller.settingsManager?.updateSettingsUI?.();

        // 显示预览
        const res = item.result;
        if (res && res.status === 'success') {
            this.controller.showComparison(item.path, res.outputPath || res.output);
        } else {
            this.controller.showOriginalPreview(item.path);
        }

        this.updateFileList();
    }

    /**
     * 将当前设置同步到所有文件
     */
    syncSettingsToAll() {
        const currentOptions = this.controller.options;
        const currentEngine = this.controller.currentEngine;

        this.fileData.forEach(item => {
            item.engine = currentEngine;
            item.options = JSON.parse(JSON.stringify(currentOptions));
        });

        this.updateFileList();
        this.controller.updateUI();
        window.app?.showToast(window.i18n?.t('enhance.syncSettingsSuccess') || 'Settings synced to all files', 'success');
    }

    localizeSmartReason(reason) {
        const map = {
            detected_anime: 'enhance.smartReasonAnime',
            detected_photo: 'enhance.smartReasonPhoto',
            detected_portrait: 'enhance.smartReasonPortrait',
            video_skip: 'enhance.videoSmartSkip',
            error: 'enhance.smartReasonError'
        };
        const key = map[reason];
        if (key && window.i18n?.t) {
            const t = window.i18n.t(key);
            if (t && t !== key) return t;
        }
        return reason || '';
    }

    /**
     * 更新文件列表 UI
     */
    updateFileList() {
        const elements = this.controller.elements;
        if (!elements.fileList) return;

        if (this.fileData.length === 0) {
            elements.fileList.innerHTML = `<div class="no-files">${window.i18n?.t('enhance.noFiles') || 'Notification'}</div>`;
        } else {
            elements.fileList.innerHTML = this.fileData.map((item, index) => {
                const path = String(item.path || '');
                const name = this.escapeHtml(path.split(/[/\\]/).pop());
                const pathTitle = this.escapeHtml(path);
                const res = item.result || {};
                const opts = item.options || {};
                const errorTitle = this.escapeHtml(res.error || '');

                let statusClass = '';
                let statusIcon = '';
                if (item.isAnalyzing) {
                    statusClass = 'status-analyzing';
                    statusIcon = '<i class="fas fa-magic fa-pulse"></i>'; // 分析中动画
                } else if (res.status === 'processing') {
                    statusClass = 'status-processing';
                    statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
                } else if (res.status === 'success') {
                    statusClass = 'status-success';
                    statusIcon = '<i class="fas fa-check-circle"></i>';
                } else if (res.status === 'error') {
                    statusClass = 'status-error';
                    statusIcon = '<i class="fas fa-exclamation-circle"></i>';
                }

                const engineName = this.escapeHtml(String(item.engine || '').toUpperCase());
                const scale = this.escapeHtml(opts.scale ?? '');
                const format = this.escapeHtml(opts.format === 'auto' ? 'AUTO' : String(opts.format || '').toUpperCase());
                // 智能推荐标识
                const smartTitle = this.escapeHtml(item.smartReason || window.i18n?.t('enhance.smartBadge') || 'AI pick');
                const smartBadge = item.isSmartSelected
                    ? `<span class="attr-chip smart-chip" title="${smartTitle}"><i class="fas fa-sparkles"></i> AI</span>`
                    : '';
                const videoBadge = item.isVideo
                    ? `<span class="attr-chip video-chip">${this.escapeHtml(window.i18n?.t('enhance.videoBadge') || 'VIDEO')}</span>`
                    : '';
                const chips = `
                    <div class="attr-chips">
                        ${smartBadge}
                        ${videoBadge}
                        <span class="attr-chip">${scale}x</span>
                        <span class="attr-chip">${engineName}</span>
                        <span class="attr-chip">${item.isVideo ? 'MP4' : format}</span>
                    </div>
                `;

                return `
                    <div class="file-item ${statusClass} ${this.currentIndex === index ? 'active' : ''}" 
                         data-index="${index}" 
                         data-action="switch-preview" 
                         title="${errorTitle}">
                        <span class="file-status-icon">${statusIcon}</span>
                        <div class="file-info">
                            <span class="file-name" title="${pathTitle}">${name}</span>
                            ${chips}
                        </div>
                        <button class="btn-remove" type="button" data-action="remove-file">&times;</button>
                    </div>
                `;
            }).join('');
        }

        this.bindFileListEvents(elements.fileList);

        if (elements.fileCount) {
            elements.fileCount.textContent = `(${this.fileData.length})`;
        }
    }

    bindFileListEvents(fileList) {
        if (!fileList || this.boundFileList === fileList) return;

        if (this.boundFileList && this.fileListClickHandler) {
            this.boundFileList.removeEventListener('click', this.fileListClickHandler);
        }

        this.boundFileList = fileList;
        this.fileListClickHandler = (event) => {
            const item = event.target?.closest?.('.file-item');
            if (!item || !fileList.contains(item)) return;

            const index = Number.parseInt(item.dataset.index, 10);
            if (!Number.isInteger(index)) return;

            if (event.target?.closest?.('[data-action="remove-file"]')) {
                event.preventDefault();
                event.stopPropagation();
                this.removeFile(index);
                return;
            }

            this.switchPreview(index);
        };
        fileList.addEventListener('click', this.fileListClickHandler);
    }
}

window.EnhanceStateManager = EnhanceStateManager;
