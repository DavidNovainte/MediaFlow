/**
 * DragDropManager.js
 * Manages global drag and drop interactions for the application
 */

class DragDropManager {
    constructor(app) {
        this.app = app;
    }

    _getFileName(file) {
        return String(file?.name || '').toLowerCase();
    }

    _isVideoFile(file) {
        const type = String(file?.type || '');
        const name = this._getFileName(file);
        return type.startsWith('video/') || name.endsWith('.mkv') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm') || name.endsWith('.flv');
    }

    _isAudioFile(file) {
        const type = String(file?.type || '');
        const name = this._getFileName(file);
        return type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.flac') || name.endsWith('.aac');
    }

    _isImageFile(file) {
        const type = String(file?.type || '');
        const name = this._getFileName(file);
        return type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg') || name.endsWith('.webp');
    }

    _delegateDropToCurrentPage(files) {
        const currentPage = this.app.router?.currentPage;
        const fileArray = Array.isArray(files) ? files : Array.from(files || []);
        const firstFile = fileArray[0];

        if (!currentPage || !firstFile) return false;

        if (currentPage === 'subtitle' && this._isVideoFile(firstFile) && firstFile.path) {
            if (window.subtitleFlow?.loadVideo) {
                window.subtitleFlow.loadVideo(firstFile.path);
                return true;
            }
            // Subtitle not loaded yet — async path will ensureSubtitle
            return false;
        }

        if (currentPage === 'creator' && (this._isVideoFile(firstFile) || this._isAudioFile(firstFile) || this._isImageFile(firstFile))) {
            if (window.creatorFlow?.handleFileSelect) {
                window.creatorFlow.handleFileSelect(fileArray);
                return true;
            }
            return false;
        }

        if (currentPage === 'editor' && (this._isVideoFile(firstFile) || this._isAudioFile(firstFile) || this._isImageFile(firstFile))) {
            if (window.editorFlow?.handleFileSelect) {
                window.editorFlow.handleFileSelect(fileArray);
                return true;
            }
            // Editor not loaded yet — async path will ensureEditor
            return false;
        }

        if (currentPage === 'transcribe' && (this._isVideoFile(firstFile) || this._isAudioFile(firstFile)) && window.scribeFlow) {
            window.scribeFlow.handleFilesSelect(fileArray);
            return true;
        }

        if (currentPage === 'enhance' && this._isImageFile(firstFile)) {
            // Sync path: caller should prefer async ensure; try best-effort if already loaded
            if (window.EnhanceFlow?.addFiles) {
                window.EnhanceFlow.addFiles(fileArray.map(file => file.path).filter(Boolean));
                return true;
            }
            // Not loaded yet — fall through to async global handler
            return false;
        }

        if (currentPage === 'compress' && this._isImageFile(firstFile) && window.pixelFlow) {
            window.pixelFlow.handleFilesSelect(fileArray);
            return true;
        }

        return false;
    }

    init() {
        // Global Drag & Drop Handling (Magic Drop)
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('drop', (e) => this._handleGlobalDrop(e));
    }

    /**
     * Smart routing for global drag & drop
     */
    async _handleGlobalDrop(e) {
        // Ignore drops that originated from internal drop zones
        const closest = (selector) => {
            if (typeof e.target?.closest === 'function') return e.target.closest(selector);
            return e.target?.parentElement?.closest?.(selector) || null;
        };
        if (closest('#batch-panel') ||
            closest('#creator-upload-zone') ||
            closest('#upload-zone-image') ||
            closest('#compress-options')) {
            return;
        }

        e.preventDefault?.();
        e.stopPropagation?.();

        const files = e.dataTransfer?.files || [];
        const text = typeof e.dataTransfer?.getData === 'function'
            ? String(e.dataTransfer.getData('text/plain') || '').trim()
            : '';

        // 1. Check for Files
        if (files && files.length > 0) {
            if (this._delegateDropToCurrentPage(files)) {
                return;
            }

            const firstFile = files[0];
            const fileArray = Array.from(files);

            // Already on Editor: ensure scripts, then import media
            if (this.app.router.currentPage === 'editor'
                && (this._isVideoFile(firstFile) || this._isAudioFile(firstFile) || this._isImageFile(firstFile))) {
                try {
                    const flow = window.FeatureLoader?.ensureEditor
                        ? await window.FeatureLoader.ensureEditor(this.app)
                        : window.editorFlow;
                    if (flow?.handleFileSelect) {
                        flow.handleFileSelect(fileArray);
                        return;
                    }
                } catch (e) {
                    console.error('[DragDrop] ensureEditor failed:', e);
                    this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to load Editor', 'error');
                    return;
                }
            }

            // Already on Subtitle: ensure scripts, then load video
            if (this.app.router.currentPage === 'subtitle' && this._isVideoFile(firstFile) && firstFile.path) {
                try {
                    const flow = window.FeatureLoader?.ensureSubtitle
                        ? await window.FeatureLoader.ensureSubtitle(this.app)
                        : window.subtitleFlow;
                    if (flow?.loadVideo) {
                        await flow.loadVideo(firstFile.path);
                        return;
                    }
                } catch (e) {
                    console.error('[DragDrop] ensureSubtitle failed:', e);
                    this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to load Subtitle tools', 'error');
                    return;
                }
            }

            // Video (or creator page media) -> Creator toolbox
            if (this._isVideoFile(firstFile)
                || (this.app.router.currentPage === 'creator'
                    && (this._isAudioFile(firstFile) || this._isImageFile(firstFile)))) {
                const wasAlreadyOnCreator = this.app.router.currentPage === 'creator';
                try {
                    await this.app.switchPage('creator');
                    const flow = window.FeatureLoader?.ensureCreator
                        ? await window.FeatureLoader.ensureCreator(this.app)
                        : window.creatorFlow;
                    if (flow?.handleFileSelect) {
                        flow.handleFileSelect(files);
                        if (!wasAlreadyOnCreator) {
                            this.app.showToast(window.i18n?.t('nav.toCreator') || 'Navigated to Creator Center', 'success');
                        }
                    }
                } catch (e) {
                    console.error('[DragDrop] ensureCreator failed:', e);
                    this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to load Creator tools', 'error');
                }
                return;
            }

            // Image -> PixelFlow (Default) or EnhanceFlow (if active)
            if (this._isImageFile(firstFile)) {
                // 当前在 AI 增强页：按需加载模块再入队
                if (this.app.router.currentPage === 'enhance') {
                    try {
                        const flow = window.FeatureLoader?.ensureEnhance
                            ? await window.FeatureLoader.ensureEnhance()
                            : window.EnhanceFlow;
                        if (flow?.addFiles) {
                            flow.addFiles(Array.from(files).map(file => file.path).filter(Boolean));
                            this.app.showToast(window.i18n?.t('nav.addToEnhance') || 'Added to AI Enhancement queue', 'success');
                        }
                    } catch (e) {
                        console.error('[DragDrop] ensureEnhance failed:', e);
                        this.app.showToast(window.i18n?.t?.('common.loadFailed') || 'Failed to load AI Enhance', 'error');
                    }
                    return;
                }

                this.handleImageFiles(files);
                return;
            }

            // Audio -> Transcribe
            if (this._isAudioFile(firstFile)) {
                this.app.switchPage('transcribe');
                // Assuming Transcribe page has a global handler or we dispatch custom event
                if (window.scribeFlow) {
                    window.scribeFlow.handleFilesSelect([firstFile]); // usually single file for now
                    this.app.showToast(window.i18n?.t('nav.toScribe') || 'Navigated to Audio Transcription', 'info');
                } else {
                    this.app.showToast('ScribeFlow module not loaded', 'error');
                }
                return;
            }
        }

        // 2. Check for URL
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
            this.app.switchPage('download');
            this.app.switchMode('single');
            const input = document.getElementById('video-url');
            if (input) {
                input.value = text;
                input.dispatchEvent(new Event('input'));
                this.app.showToast(`${window.i18n?.t('nav.linkRecognized') || 'Link recognized:'} ${text.substring(0, 30)}...`, 'success');
                // Optional: Auto-check
                setTimeout(() => document.getElementById('btn-check')?.click(), 500);
            }
            return;
        }
    }

    /**
     * 处理图片文件
     */
    async handleImageFiles(files) {
        this.app.switchPage('compress');
        if (window.pixelFlow) {
            // Ensure files is an Array, as FileList doesn't have .filter()
            const fileArray = Array.isArray(files) ? files : Array.from(files);
            window.pixelFlow.handleFilesSelect(fileArray);
        } else {
            this.app.showToast('PixelFlow module not loaded', 'error');
        }
    }
}

window.DragDropManager = DragDropManager;
