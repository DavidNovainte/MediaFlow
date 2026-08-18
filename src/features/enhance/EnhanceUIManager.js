/**
 * EnhanceUIManager.js - AI 画质增强 UI 管理器
 * 负责 DOM 元素缓存、页面加载、布局调整及对比显示
 */

class EnhanceUIManager {
    constructor(controller) {
        this.controller = controller;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    /**
     * 加载页面 HTML
     */
    async loadPage() {
        const container = document.getElementById('page-enhance');
        if (!container) return;

        // 检查是否已有内容
        if (container.querySelector('.enhance-container')) return;

        try {
            const response = await fetch(`pages/enhance.html?t=${Date.now()}`); // 防止缓存
            const html = await response.text();
            container.innerHTML = html;

            if (window.i18n && window.i18n.updateUI) {
                window.i18n.updateUI();
            }
        } catch (error) {
            console.error('[EnhanceUIManager] Failed to load page:', error);
        }
    }

    /**
     * 缓存 DOM 元素
     */
    cacheElements() {
        const root = document.getElementById('page-enhance') || document;
        const byId = (id) => root.querySelector?.(`#${id}`) || document.getElementById(id);
        const elements = {
            // 预览区
            previewContainer: document.getElementById('enhance-preview-container'),
            emptyState: document.getElementById('enhance-empty-state'),
            comparison: document.getElementById('enhance-comparison'),
            beforeImg: document.getElementById('enhance-before-img'),
            afterImg: document.getElementById('enhance-after-img'),
            beforeVideo: document.getElementById('enhance-before-video'),
            afterVideo: document.getElementById('enhance-after-video'),
            afterContainer: document.querySelector('.comparison-after'),
            comparisonHandle: document.getElementById('enhance-comparison-handle'),
            scaleButtons: document.getElementById('enhance-scale-buttons'),
            engineSelect: document.getElementById('enhance-engine-select'),
            outputFormat: document.getElementById('enhance-output-format'),
            performanceMode: document.getElementById('enhance-performance-mode'),
            sharpenToggle: document.getElementById('enhance-sharpen-toggle'),
            denoiseSlider: document.getElementById('enhance-denoise-slider'),

            // 进度条
            progressContainer: document.getElementById('enhance-progress-container'),
            progressFill: document.getElementById('enhance-progress-fill'),
            progressText: document.getElementById('enhance-progress-text'),
            progressEta: document.getElementById('enhance-progress-eta'),

            // 设置面板
            engineDesc: document.getElementById('enhance-engine-desc'),
            optionsContainer: document.getElementById('enhance-options-container'),
            modelStyleContainer: document.getElementById('enhance-model-style-container'),
            denoiseGroup: document.getElementById('enhance-denoise-group'),
            outputPath: document.getElementById('enhance-output-path'),
            completeActions: document.getElementById('enhance-complete-actions'),

            // 控件
            btnOpenDir: document.getElementById('btn-enhance-open-dir'),
            btnRevealFile: document.getElementById('btn-enhance-reveal-file'),
            btnToCompress: document.getElementById('btn-enhance-to-compress'),
            infoBar: document.getElementById('enhance-info-bar'),
            resInfo: document.getElementById('enhance-res-info'),
            zoomInfo: document.getElementById('enhance-zoom-info'),

            // 缩放工具栏按钮
            btnZoomFit: document.getElementById('btn-zoom-fit'),
            btnZoomIn: byId('btn-zoom-in'),
            btnZoomOut: byId('btn-zoom-out'),
            btnZoomReset: document.getElementById('btn-zoom-reset'),

            // 命名模板
            nameTemplate: document.getElementById('enhance-name-template'),

            // 按钮
            btnAddFiles: document.getElementById('btn-enhance-add-files'),
            btnSelectOutput: document.getElementById('btn-enhance-select-output'),
            btnPreview: document.getElementById('btn-enhance-preview'),
            btnStart: document.getElementById('btn-enhance-start'),
            btnCancel: document.getElementById('btn-enhance-cancel'),
            btnExportRegion: document.getElementById('btn-enhance-export-region'),
            btnSyncAll: document.getElementById('btn-sync-all'),

            // 文件列表相关
            fileList: document.getElementById('enhance-file-list'),
            fileCount: document.getElementById('enhance-file-count'),

            // 任务页签与分类容器
            categoryTabs: document.getElementById('enhance-category-tabs'),

            // 布局调整
            resizer: document.getElementById('enhance-layout-resizer'),
            settingsPanel: document.querySelector('.enhance-settings-panel'),
            limitsBanner: document.getElementById('enhance-limits-banner')
        };
        this.controller.elements = elements;
        return elements;
    }

    /**
     * 完全免费：不再显示 Pro 横幅。
     */
    refreshProBanner() {
        const banner = this.controller.elements?.proBanner || document.getElementById('enhance-pro-banner');
        if (banner) banner.classList.add('hidden');
    }

    /**
     * 初始化布局调整器
     */
    initLayoutResizer() {
        const els = this.controller.elements;
        if (!els.resizer || !els.settingsPanel) return;

        const savedWidth = localStorage.getItem('enhance_settings_width');
        if (savedWidth) {
            const width = parseInt(savedWidth);
            if (width >= 280 && width <= 600) {
                els.settingsPanel.style.width = `${width}px`;
            }
        }

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = els.settingsPanel.getBoundingClientRect().width;
            els.resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const dx = startX - e.clientX;
            let newWidth = startWidth + dx;
            newWidth = Math.max(280, Math.min(600, newWidth));
            els.settingsPanel.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            els.resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const currentWidth = els.settingsPanel.getBoundingClientRect().width;
            localStorage.setItem('enhance_settings_width', currentWidth);
        };

        els.resizer.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    /**
     * 初始化任务队列的收缩功能
     */
    initFileListToggle() {
        const btn = document.getElementById('btn-toggle-file-list');
        const container = document.querySelector('.enhance-file-list-container');
        if (!btn || !container) return;

        btn.addEventListener('click', (e) => {
            // 如果点击的是清除按钮，则不触发折叠
            if (this.closest(e.target, '.list-actions')) return;

            container.classList.toggle('collapsed');
        });
    }

    /**
     * 初始化分类页签 (Model/Params/Output)
     */
    initCategoryTabs() {
        const els = this.controller.elements;
        if (!els.categoryTabs) return;

        const tabs = els.categoryTabs.querySelectorAll('.category-tab');
        const contents = document.querySelectorAll('#page-enhance .enhance-settings-panel .category-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetCat = tab.dataset.category;

                // 1. 更新 Tab 状态
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 2. 更新内容显示
                contents.forEach(content => {
                    if (content.id === `cat-${targetCat}`) {
                        content.classList.remove('hidden');
                    } else {
                        content.classList.add('hidden');
                    }
                });
            });
        });
    }

    /**
     * 初始化快速对比 (Quick Compare)
     */
    initQuickCompare() {
        const els = this.controller.elements;
        // 缓存新按钮
        els.btnQuickCompare = document.getElementById('btn-quick-compare');

        const container = els.comparison;
        const btn = els.btnQuickCompare;

        if (!container) return;

        // 定义显示原图的操作
        const showOriginal = () => {
            if (container && !container.classList.contains('hidden')) {
                container.classList.add('show-original');
            }
        };

        // 定义恢复增强图的操作
        const showEnhanced = () => {
            // 只有当存在有效的对比图时，才允许切回增强图
            if (container && this.hasComparison) {
                container.classList.remove('show-original');
            }
        };

        // 1. 按钮交互 (即时响应)
        if (btn) {
            btn.addEventListener('mousedown', showOriginal);
            btn.addEventListener('mouseup', showEnhanced);
            btn.addEventListener('mouseleave', showEnhanced);

            // 触摸支持
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); showOriginal(); });
            btn.addEventListener('touchend', showEnhanced);
        }

        // 2. 图片区域交互 (长按对比，避免与拖拽冲突)
        let pressTimer = null;
        let startX = 0;
        let startY = 0;
        const MOVE_THRESHOLD = 5; // 移动超过5像素视为拖拽

        const startPress = (e) => {
            // 如果只有左键
            if (e.button !== 0 && e.type !== 'touchstart') return;

            // 如果没有对比图，长按无效
            if (!this.hasComparison) return;

            startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            // 延迟 200ms 触发对比
            pressTimer = setTimeout(() => {
                showOriginal();
            }, 200);
        };

        const cancelPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            // 恢复视图逻辑由 showEnhanced 内部判断 hasComparison
            showEnhanced();
        };

        const checkMove = (e) => {
            if (pressTimer) {
                const cx = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
                const cy = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

                if (Math.abs(cx - startX) > MOVE_THRESHOLD || Math.abs(cy - startY) > MOVE_THRESHOLD) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                    // 如果已经触发显示了原图，这里恢复吗？
                    // 现在的逻辑是：一旦移动，就视为拖拽，不触发对比。
                    // 但如果已经 hold 住了再移动呢？
                    // 逻辑：如果 timer 还在跑，说明还没显示原图，直接取消 timer，用户在已有增强图上拖拽。
                    // 如果 timer 已经跑完（已经显示原图了），用户想移动原图看细节？
                    // 这是一个选择。目前的实现是：移动就取消 timer，意味着无法"按住看原图的同时拖动原图"。
                    // 但通常"按住对比"是静态动作。先松开，移动到位置，再按住对比。这符合 Lightroom 逻辑。
                }
            }
            // 如果已经显示了原图，这里暂时不强制恢复，直到 mouseup
        };

        container.addEventListener('mousedown', startPress);
        container.addEventListener('mouseup', cancelPress);
        container.addEventListener('mouseleave', cancelPress);
        container.addEventListener('mousemove', checkMove);

        // 触摸支持
        container.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            startPress(e);
        });
        container.addEventListener('touchend', cancelPress);
        container.addEventListener('touchmove', checkMove);
    }

    isVideoPath(filePath) {
        return /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(filePath || ''));
    }

    stopVideos() {
        const els = this.controller.elements;
        [els.beforeVideo, els.afterVideo].forEach((v) => {
            if (!v) return;
            try {
                v.pause();
                v.removeAttribute('src');
                v.load();
            } catch {
                // ignore
            }
        });
    }

    /**
     * Toggle img vs video layers. mode: 'image' | 'video'
     */
    ensureVideoElements() {
        const els = this.controller.elements;
        const beforeHost = els.comparison?.querySelector?.('.comparison-before');
        const afterHost = els.comparison?.querySelector?.('.comparison-after');
        if (!beforeHost || !afterHost) return;

        if (!els.beforeVideo) {
            const v = document.createElement('video');
            v.id = 'enhance-before-video';
            v.className = 'enhance-media enhance-media-video hidden';
            v.muted = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.controls = true;
            beforeHost.insertBefore(v, beforeHost.firstChild?.nextSibling || null);
            // Prefer after the img
            const img = beforeHost.querySelector('img');
            if (img && img.nextSibling) beforeHost.insertBefore(v, img.nextSibling);
            else if (img) img.insertAdjacentElement('afterend', v);
            else beforeHost.appendChild(v);
            els.beforeVideo = v;
        }
        if (!els.afterVideo) {
            const v = document.createElement('video');
            v.id = 'enhance-after-video';
            v.className = 'enhance-media enhance-media-video hidden';
            v.muted = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.controls = true;
            const img = afterHost.querySelector('img');
            if (img) img.insertAdjacentElement('afterend', v);
            else afterHost.appendChild(v);
            els.afterVideo = v;
        }
    }

    setPreviewMediaMode(mode) {
        const els = this.controller.elements;
        this.ensureVideoElements();
        const isVideo = mode === 'video';
        els.comparison?.classList.toggle('is-video-mode', isVideo);
        els.beforeImg?.classList.toggle('hidden', isVideo);
        els.afterImg?.classList.toggle('hidden', isVideo);
        if (els.beforeVideo) {
            els.beforeVideo.classList.toggle('hidden', !isVideo);
            els.beforeVideo.style.display = isVideo ? 'block' : 'none';
        }
        if (els.afterVideo) {
            // After layer only when we have a result; default hide in original-only mode
            if (!isVideo) {
                els.afterVideo.classList.add('hidden');
                els.afterVideo.style.display = 'none';
            }
        }
        if (!isVideo) this.stopVideos();
    }

    async resolveMediaUrl(filePath) {
        if (window.urlUtils?.pathToMediaUrl) {
            const u = window.urlUtils.pathToMediaUrl(filePath);
            if (u) return u;
        }
        if (window.urlUtils?.resolveDisplayUrl) {
            const u = await window.urlUtils.resolveDisplayUrl(filePath);
            if (u) return u;
        }
        const res = await window.mediaflow?.fs?.readAsDataUrl?.(filePath);
        return res?.success ? res.dataUrl : '';
    }

    async loadImageEl(path, imgEl) {
        let url = await this.resolveMediaUrl(path);
        if (!url) throw new Error('Empty display url');
        await new Promise((resolvePromise, rejectPromise) => {
            imgEl.onload = () => {
                imgEl.style.opacity = '1';
                resolvePromise();
            };
            imgEl.onerror = async () => {
                try {
                    const res = await window.mediaflow?.fs?.readAsDataUrl?.(path);
                    if (res?.success && res.dataUrl) {
                        imgEl.onerror = () => rejectPromise(new Error('Image load failed'));
                        imgEl.src = res.dataUrl;
                        return;
                    }
                } catch (e) {
                    void e;
                }
                rejectPromise(new Error('Image load failed'));
            };
            imgEl.src = url;
        });
    }

    async loadVideoEl(path, videoEl, { autoplay = false } = {}) {
        const url = window.urlUtils?.pathToMediaUrl?.(path)
            || (await this.resolveMediaUrl(path));
        if (!url) throw new Error('Empty video url');
        console.log('[EnhanceUIManager] loadVideoEl', path, '→', url);
        await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (ok, err) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (ok) resolve();
                else reject(err || new Error('Video load failed'));
            };
            const onReady = () => {
                videoEl.style.opacity = '1';
                videoEl.style.display = 'block';
                // Size comparison canvas from video metadata
                this.controller.zoomViewer?.reset?.();
                finish(true);
            };
            const onErr = (e) => {
                console.error('[EnhanceUIManager] video element error', e, url);
                finish(false, new Error('Video load failed'));
            };
            const cleanup = () => {
                videoEl.removeEventListener('loadeddata', onReady);
                videoEl.removeEventListener('loadedmetadata', onReady);
                videoEl.removeEventListener('error', onErr);
            };
            videoEl.addEventListener('loadeddata', onReady);
            videoEl.addEventListener('loadedmetadata', onReady);
            videoEl.addEventListener('error', onErr);
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            videoEl.controls = true;
            videoEl.preload = 'auto';
            videoEl.classList.remove('hidden');
            videoEl.style.display = 'block';
            videoEl.style.opacity = '1';
            videoEl.src = url;
            try { videoEl.load(); } catch (e) { void e; }
            if (autoplay) {
                videoEl.play?.().catch(() => {});
            }
            // Safety timeout — still try reset layout
            setTimeout(() => {
                if (!settled && videoEl.readyState >= 1) onReady();
                else if (!settled) finish(false, new Error('Video load timeout'));
            }, 8000);
        });
    }

    /**
     * 显示原图与增强效果对比
     */
    async showComparison(beforePath, afterPath) {
        const els = this.controller.elements;
        const zoom = this.controller.zoomViewer;
        if (!els.previewContainer || !els.comparison) return;

        const oldPreview = els.previewContainer.querySelector('.original-preview');
        if (oldPreview) oldPreview.remove();

        els.emptyState?.classList.add('hidden');
        els.comparison.classList.remove('hidden');
        this.hasComparison = true;
        els.comparison.classList.remove('show-original');

        if (this.controller.currentOriginalInfo) {
            this.controller.infoManager.updateResolution(this.controller.currentOriginalInfo, this.controller.options.scale);
        }
        if (zoom) zoom.reset();

        const isVideo = this.isVideoPath(beforePath) || this.isVideoPath(afterPath);
        if (isVideo) {
            this.setPreviewMediaMode('video');
            els.comparison.classList.remove('is-video-mode'); // allow after layer for result
            try {
                if (els.beforeVideo) await this.loadVideoEl(beforePath, els.beforeVideo);
                if (els.afterVideo && afterPath) {
                    els.afterVideo.classList.remove('hidden');
                    await this.loadVideoEl(afterPath, els.afterVideo);
                    els.comparison.classList.remove('show-original');
                }
            } catch (e) {
                console.error('[EnhanceUIManager] video comparison failed', e);
            }
            return;
        }

        this.setPreviewMediaMode('image');
        if (els.beforeImg) els.beforeImg.style.opacity = '0';
        if (els.afterImg) els.afterImg.style.opacity = '0';
        this.loadImageEl(beforePath, els.beforeImg).catch((e) => console.error('[EnhanceUIManager] Load before failed', e));
        this.loadImageEl(afterPath, els.afterImg).catch((e) => console.error('[EnhanceUIManager] Load after failed', e));
    }

    /**
     * 显示原图预览 (仅查看原图模式)
     */
    async showOriginalPreview(filePath) {
        const els = this.controller.elements;
        const zoom = this.controller.zoomViewer;
        if (!els.previewContainer || !els.comparison) return;

        els.emptyState?.classList.add('hidden');
        els.comparison.classList.remove('hidden');
        this.hasComparison = false;
        els.comparison.classList.add('show-original');

        const isVideo = this.isVideoPath(filePath);
        if (isVideo) {
            this.setPreviewMediaMode('video');
            try {
                this.ensureVideoElements();
                if (els.afterVideo) {
                    els.afterVideo.classList.add('hidden');
                    els.afterVideo.style.display = 'none';
                    els.afterVideo.removeAttribute('src');
                }
                if (els.beforeVideo) {
                    els.beforeVideo.classList.remove('hidden');
                    els.beforeVideo.style.display = 'block';
                    await this.loadVideoEl(filePath, els.beforeVideo);
                    try {
                        if (els.beforeVideo.readyState >= 1) {
                            els.beforeVideo.currentTime = 0.05;
                        }
                    } catch {
                        // ignore
                    }
                    // Fit canvas after metadata
                    requestAnimationFrame(() => this.controller.zoomViewer?.reset?.());
                } else {
                    throw new Error('beforeVideo element missing');
                }
            } catch (e) {
                console.error('[EnhanceUIManager] video preview failed', e);
                window.app?.showToast?.(
                    window.i18n?.t?.('enhance.videoPreviewFail')
                        || 'Could not preview video. You can still Start enhance.',
                    'warning'
                );
            }
            return;
        }

        this.setPreviewMediaMode('image');
        try {
            if (!els.beforeImg) return;
            els.beforeImg.style.opacity = '0';
            await this.loadImageEl(filePath, els.beforeImg);
            zoom?.reset?.();
            if (this.controller.currentOriginalInfo) {
                this.controller.infoManager.updateResolution(this.controller.currentOriginalInfo, this.controller.options.scale);
            }
        } catch (e) {
            console.error('[EnhanceUIManager] showOriginalPreview failed', e);
        }
    }

    /**
     * 从文件项恢复设置到 UI 面板
     */
    updateSettingsFromItem(item) {
        this.controller.currentEngine = item.engine;
        this.controller.options = JSON.parse(JSON.stringify(item.options));

        const els = this.controller.elements;
        if (els.engineSelect) els.engineSelect.value = item.engine;
        if (els.outputFormat) els.outputFormat.value = item.options.format || 'auto';
        if (els.performanceMode) els.performanceMode.value = item.options.performanceMode || 'balanced';
        if (els.sharpenToggle) els.sharpenToggle.checked = !!item.options.sharpen;
        if (els.denoiseSlider) els.denoiseSlider.value = item.options.denoise !== undefined ? item.options.denoise : 0;

        // 同步 UI 状态
        this.updateUI();
        this.controller.updateSettingsUI();
        this.controller.updateEngineOptions();
    }

    /**
     * 更新全局 UI 状态 (空状态、按钮禁用等)
     */
    updateUI() {
        const hasFiles = this.controller.stateManager.fileData.length > 0;
        const els = this.controller.elements;

        // 1. 显示/隐藏空状态
        if (els.emptyState) {
            els.emptyState.classList.toggle('hidden', hasFiles);
        }

        // 2. 状态清理
        if (!hasFiles && els.comparison) {
            els.comparison.classList.add('hidden');
            this.controller.infoManager.reset();
        }

        // 3. 启用/禁用按钮 (根据是否有文件及是否正在处理)
        const isProcessing = this.controller.isProcessing;
        const btns = [els.btnStart, els.btnPreview, els.btnSyncAll, els.btnExportRegion];
        btns.forEach(btn => {
            if (btn) btn.disabled = !hasFiles || isProcessing;
        });
    }

}

window.EnhanceUIManager = EnhanceUIManager;
