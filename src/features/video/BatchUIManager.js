/**
 * MediaFlow - BatchUIManager Component
 * 负责管理批量处理的 UI 渲染、事件绑定和状态切换 (View 层)
 */
class BatchUIManager {
    constructor(batchFlow) {
        this.batchFlow = batchFlow; // Controller reference
        this.creatorFlow = batchFlow.creatorFlow;
        this.container = document.getElementById('batch-panel');
        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('batch-creator-css-link')) return;
        
        const createLink = (id, href) => {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        };

        createLink('batch-creator-css-link', 'features/video/BatchCreator.css');
        createLink('transitions-css-link', 'styles/transitions.css');
    }

    /**
     * Bind Events and Setup UI
     */
    setupUI() {
        // Clear Button
        document.getElementById('btn-batch-clear')?.addEventListener('click', () => this.batchFlow.reset());

        // Sort Buttons
        document.getElementById('btn-batch-sort-name')?.addEventListener('click', () => this.batchFlow.sortFiles('name'));
        document.getElementById('btn-batch-sort-time')?.addEventListener('click', () => this.batchFlow.sortFiles('time'));

        // Merge Preview Button
        document.getElementById('btn-batch-preview-merge')?.addEventListener('click', () => this.batchFlow.previewMergeSequence());

        // Add More Button
        this._setupAddMoreButton();

        // Open Folder Button
        this._setupOpenFolderButton();

        // Drag & Drop
        this._setupDragDrop();
        // Start Batch Button
        this._setupStartButton();
        // Action Type Change
        this._setupActionSelect();
        // Preview Toggle
        this._setupPreviewToggle();
        // Carousel Scroll
        this._setupCarouselScroll();
        // Transition Preview Initialization
        this._setupTransitionPreview();
    }

    _setupAddMoreButton() {
        const addMoreBtn = document.getElementById('btn-batch-add-more');
        const batchFileInput = document.createElement('input');
        batchFileInput.type = 'file';
        batchFileInput.multiple = true;
        batchFileInput.accept = 'video/*';
        batchFileInput.style.display = 'none';
        document.body.appendChild(batchFileInput);

        addMoreBtn?.addEventListener('click', () => batchFileInput.click());
        batchFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.creatorFlow.handleFileSelect(e.target.files);
                batchFileInput.value = '';
            }
        });
    }

    _setupDragDrop() {
        const batchPanel = document.getElementById('batch-panel');
        if (!batchPanel) return;

        batchPanel.addEventListener('dragover', (e) => {
            if (window._batchDragging) return;
            e.preventDefault();
            batchPanel.style.borderColor = 'var(--accent-primary)';
            batchPanel.style.borderStyle = 'dashed';
        });

        batchPanel.addEventListener('dragleave', (e) => {
            if (window._batchDragging) return;
            if (!batchPanel.contains(e.relatedTarget)) {
                e.preventDefault();
                batchPanel.style.borderColor = 'transparent';
                batchPanel.style.borderStyle = 'none';
            }
        });

        batchPanel.addEventListener('drop', (e) => {
            if (window._batchDragging) return;
            e.preventDefault();
            e.stopPropagation();
            batchPanel.style.borderColor = 'transparent';
            batchPanel.style.borderStyle = 'none';
            if (e.dataTransfer?.files?.length > 0) {
                this.creatorFlow.handleFileSelect(e.dataTransfer.files);
            }
        });
    }

    _setupStartButton() {
        document.getElementById('btn-start-batch')?.addEventListener('click', () => this.batchFlow.startBatchProcess());
        document.getElementById('btn-cancel-batch')?.addEventListener('click', async () => {
            const confirmed = await this.showConfirmDialog(
                window.i18n?.t('creator.batch.confirmCancel') || 'Are you sure you want to cancel all pending tasks?'
            );
            if (confirmed) {
                this.batchFlow.cancelBatch();
            }
        });
    }

    /**
     * Show custom confirmation dialog
     * @param {string} message 
     * @returns {Promise<boolean>}
     */
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('creator-custom-modal');
            if (!modal) {
                resolve(confirm(message));
                return;
            }

            const messageEl = document.getElementById('creator-modal-message');
            const btnConfirm = document.getElementById('btn-creator-modal-confirm');
            const btnCancel = document.getElementById('btn-creator-modal-cancel');

            if (messageEl) messageEl.textContent = message;

            modal.style.display = 'flex';
            modal.classList.add('active');

            const cleanup = () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                btnConfirm.removeEventListener('click', onConfirm);
                btnCancel.removeEventListener('click', onCancel);
            };

            const onConfirm = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            btnConfirm.addEventListener('click', onConfirm);
            btnCancel.addEventListener('click', onCancel);
        });
    }

    _setupActionSelect() {
        const actionSelect = document.getElementById('batch-action-select');
        if (actionSelect) {
            actionSelect.addEventListener('change', (e) => {
                this.updateActionUI(e.target.value);
            });
            // Initial call
            this.updateActionUI(actionSelect.value);
        }
    }

    _setupPreviewToggle() {
        const toggles = document.querySelectorAll('input[name="batch-view-mode"]');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', () => {
                this.batchFlow.refreshView();
            });
        });
    }

    _setupCarouselScroll() {
        const carousel = document.querySelector('.preview-carousel');
        if (carousel) {
            carousel.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    if (Math.abs(e.deltaX) > 0) return;
                    e.preventDefault();
                    carousel.scrollLeft += e.deltaY * 3;
                }
            }, { passive: false });
        }
    }

    _setupOpenFolderButton() {
        const btn = document.getElementById('btn-batch-open-folder');
        if (btn) {
            btn.addEventListener('click', () => {
                if (this.lastSaveFolder) {
                    window.mediaflow?.shell?.openPath(this.lastSaveFolder);
                }
            });
        }
    }

    /**
     * Show Open Folder Button
     */
    showOpenFolderBtn(folder) {
        const btn = document.getElementById('btn-batch-open-folder');
        if (btn && folder) {
            this.lastSaveFolder = folder;
            btn.classList.remove('hidden');
        }
    }

    /**
     * Update UI based on selected action
     */
    updateActionUI(type) {
        // Options visibility
        const isCompress = type === this.batchFlow.TYPE_COMPRESS;
        const isConvert = type === this.batchFlow.TYPE_CONVERT;
        const isMerge = type === this.batchFlow.TYPE_MERGE;
        const isRemoveAudio = type === this.batchFlow.TYPE_REMOVE_AUDIO;
        const isVertical = type === this.batchFlow.TYPE_VERTICAL;
        const isSpeed = type === this.batchFlow.TYPE_SPEED;
        const isGif = type === this.batchFlow.TYPE_GIF;
        const isSilence = type === this.batchFlow.TYPE_SILENCE;

        const setVisible = (id, visible) => {
            const el = document.getElementById(id);
            if (el) visible ? el.classList.remove('hidden') : el.classList.add('hidden');
        };

        setVisible('batch-compress-options', isCompress);
        setVisible('batch-convert-options', isConvert);
        setVisible('batch-vertical-options', isVertical);
        setVisible('batch-speed-options', isSpeed);
        setVisible('batch-gif-options', isGif);
        setVisible('batch-silence-options', isSilence);
        setVisible('btn-batch-preview-merge', isMerge);

        // Merge Enhancement Options
        // Show transitions and norm as long as merge is selected, so user can configure before adding files
        setVisible('batch-merge-transition-group', isMerge);
        setVisible('batch-merge-norm-group', isMerge);

        // Update transition preview visibility when switching actions
        if (isMerge) {
            const transitionId = document.getElementById('batch-merge-transition')?.value;
            window.TransitionManager?.updatePreview('batch-merge-transition-preview', transitionId);
        } else {
            setVisible('batch-merge-transition-preview', false);
        }

        if (isMerge || isRemoveAudio) {
            this.updateTotalDuration();
        }

        // Button Text Update
        const startBtn = document.getElementById('btn-start-batch');
        if (startBtn) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

            if (isCompress) {
                startBtn.innerHTML = `🚀 ${t('creator.batch.actionCompress', 'Video Compress')}`;
            } else if (isConvert) {
                startBtn.innerHTML = `🔄 ${t('creator.batch.actionConvert', 'Format Convert')}`;
            } else if (isMerge) {
                startBtn.innerHTML = `🎞️ ${t('creator.batch.actionMerge', 'Video Merge')}`;
            } else if (isRemoveAudio) {
                startBtn.innerHTML = `🔇 ${t('creator.batch.actionRemoveAudio', 'Remove Audio')}`;
            } else if (isVertical) {
                startBtn.innerHTML = `📱 ${t('creator.batch.actionVertical', 'Make Vertical')}`;
            } else if (isSpeed) {
                startBtn.innerHTML = `⚡ ${t('creator.batch.actionSpeed', 'Change Speed')}`;
            } else if (isGif) {
                startBtn.innerHTML = `🖼️ ${t('creator.batch.actionGif', 'Generate GIF')}`;
            } else if (isSilence) {
                startBtn.innerHTML = `✂️ ${t('creator.batch.actionSilence', 'Remove Silence')}`;
            }
        }

        // Notify Controller for deep UI refresh if validation needed (e.g., merge mode)
        this.batchFlow.onActionChanged(type);
    }

    showBatchUI(fileCount) {
        // 使用根容器切换而非逐个隐藏子元素，彻底隔离
        const singleView = document.getElementById('creator-single-view');
        const batchView = document.getElementById('creator-batch-view');

        if (singleView) singleView.classList.add('hidden');
        if (batchView) batchView.classList.remove('hidden');

        // 为主布局添加批量激活标记（如果内部样式还需要）
        document.querySelector('.creator-main-layout')?.classList.add('batch-active');

        // 确保批量面板可见
        const batchPanel = document.getElementById('batch-panel');
        if (batchPanel) batchPanel.classList.remove('hidden');

        this.updateBatchCount(fileCount);
        this.updateTotalDuration();
        this.batchFlow.refreshView();

        // 隐藏不需要的按钮
        const openFolderBtn = document.getElementById('btn-batch-open-folder');
        if (openFolderBtn) openFolderBtn.classList.add('hidden');
    }

    updateBatchCount(count) {
        const countEl = document.querySelector('#page-creator #batch-count') || document.getElementById('batch-count');
        if (countEl) countEl.textContent = count;
    }

    hideBatchUI() {
        const singleView = document.getElementById('creator-single-view');
        const batchView = document.getElementById('creator-batch-view');

        if (batchView) batchView.classList.add('hidden');
        if (singleView) singleView.classList.remove('hidden');

        // 移除网格布局的批量激活标记
        document.querySelector('.creator-main-layout')?.classList.remove('batch-active');

        // 恢复单文件逻辑
        if (!this.creatorFlow?.videoFile) {
            this.creatorFlow?.uiManager?.resetUI();
        } else {
            this.creatorFlow?.uiManager?.showSingleModeUI();
        }

        const openFolderBtn = document.getElementById('btn-batch-open-folder');
        if (openFolderBtn) openFolderBtn.classList.add('hidden');
    }

    isPreviewMode() {
        const checkedToggle = document.querySelector('input[name="batch-view-mode"]:checked');
        return checkedToggle ? checkedToggle.value === 'card' : true;
    }

    setBatchViewMode(mode) {
        const listContainer = document.getElementById('batch-list');
        const previewContainer = document.getElementById('batch-preview-strip');

        if (mode === 'card') {
            listContainer?.classList.add('hidden');
            previewContainer?.classList.remove('hidden');
        } else {
            listContainer?.classList.remove('hidden');
            previewContainer?.classList.add('hidden');
        }
    }
    updateTotalDuration() {
        const durationEl = document.getElementById('batch-total-duration');
        if (!durationEl) return;

        const actionType = document.getElementById('batch-action-select')?.value;

        // Only show for merge mode
        if (actionType !== this.batchFlow.TYPE_MERGE) {
            durationEl.classList.add('hidden');
            return;
        }

        durationEl.classList.remove('hidden');

        // Calculate total duration
        const batchFiles = this.batchFlow.batchFiles;
        const totalSeconds = batchFiles.reduce((sum, item) => sum + (item.duration || 0), 0);

        if (totalSeconds === 0) {
            durationEl.textContent = (window.i18n ? window.i18n.t('creator.batch.totalDuration', { duration: '...' }) : 'Total: ...');
            return;
        }

        // Format duration
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = Math.floor(totalSeconds % 60);

        let formatted;
        if (hours > 0) {
            formatted = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        durationEl.textContent = window.i18n ? window.i18n.t('creator.batch.totalDuration', { duration: formatted }) : `Total: ${formatted}`;
    }

    /**
     * Setup Transition Preview Logic
     */
    _setupTransitionPreview() {
        const transitionSelect = document.getElementById('batch-merge-transition');
        if (!transitionSelect || !window.TransitionManager) return;

        // Populate options from manager
        window.TransitionManager.initSelect('batch-merge-transition');

        // Listen for changes to update preview
        transitionSelect.addEventListener('change', (e) => {
            window.TransitionManager.updatePreview('batch-merge-transition-preview', e.target.value);
        });
    }

    _getBatchFiles() {
        return this.batchFlow.batchFiles;
    }

    /**
     * Switch between start and cancel buttons
     */
    setProcessingState(isProcessing) {
        const startBtn = document.getElementById('btn-start-batch');
        const cancelBtn = document.getElementById('btn-cancel-batch');

        if (isProcessing) {
            startBtn?.classList.add('hidden');
            cancelBtn?.classList.remove('hidden');
        } else {
            startBtn?.classList.remove('hidden');
            cancelBtn?.classList.add('hidden');
        }
    }
}

window.BatchUIManager = BatchUIManager;
