class CreatorFlowBootstrap {
    constructor(flow) {
        this.flow = flow;
        this._timelineActionHandler = null;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init() {
        const flow = this.flow;

        flow.uiManager.init();
        flow.previewHandler.init();
        flow.audioHandler.init();
        flow.audioMixer.init(flow.previewHandler.audioCtx, flow.previewHandler.gainNode);
        flow.loadGlobalSettings();

        this.bindResetButton();

        if (window.i18n?.updateUI) {
            window.i18n.updateUI();
        }

        this.initOptionalModules();
        flow.subtitleLaneManager?.init?.();
        flow.subtitleCutActions?.init?.();
        flow.subtitlePreviewOverlay?.init?.();

        flow.batchFlow = new window.BatchCreatorFlow(flow);
        flow.batchFlow.init();

        this.setupResizeHandle();
        this.setupPiP();
        this.bindTimelineActions();
    }

    initOptionalModules() {
        const flow = this.flow;

        if (window.SilenceProcessor) {
            flow.silenceProcessor = new window.SilenceProcessor(flow);
            flow.silenceProcessor.init();
        } else {
            console.error('SilenceProcessor not loaded');
        }

        if (window.VideoProcessor) {
            flow.videoProcessor = new window.VideoProcessor(flow);
            flow.videoProcessor.init();
        } else {
            console.error('VideoProcessor not found');
        }

        if (window.CreatorTimelineManager) {
            flow.timelineManager = new window.CreatorTimelineManager(flow);
            flow.timelineManager.init();
            this.bindTimelinePreviewSync();
        } else {
            console.error('CreatorTimelineManager not found');
        }
    }

    bindTimelinePreviewSync() {
        const flow = this.flow;
        if (!flow.timelineManager || !flow.previewHandler) return;

        flow.timelineManager.onSeek = (timelineOrSourceTime, sourceTime = null) => {
            const timelineTime = flow.timelineManager?.currentTime || 0;
            const resolvedSourceTime = Number.isFinite(sourceTime) ? sourceTime : timelineOrSourceTime;

            if (Number.isFinite(resolvedSourceTime)) {
                flow.previewHandler.seekTo?.(resolvedSourceTime);
            }

            void flow.previewHandler.alignPlaybackToTimeline?.();

            const snapshot = flow.previewHandler.getPlaybackSnapshot?.(timelineTime) || null;
            flow.audioMixer?.sync?.(timelineTime, false, snapshot);
        };
    }

    bindResetButton() {
        document.getElementById('btn-reset-video')?.addEventListener('click', () => this.flow.reset());
    }

    bindTimelineActions() {
        if (this._timelineActionHandler) {
            document.removeEventListener('timeline-action', this._timelineActionHandler);
        }

        this._timelineActionHandler = (e) => {
            if (e.detail?.action !== 'separateAudio') {
                return;
            }

            this.flow.uiManager.showProperties('audio');

            setTimeout(() => {
                const btnSeparate = document.getElementById('btn-demucs-separate');
                if (btnSeparate) {
                    btnSeparate.click();
                }
            }, 300);
        };

        document.addEventListener('timeline-action', this._timelineActionHandler);
    }

    setupResizeHandle() {
        const handle = document.getElementById('video-resize-handle');
        const mainLayout = document.querySelector('.creator-main-layout');
        if (!handle || !mainLayout) return;

        const savedHeight = localStorage.getItem('creator_timeline_height');
        if (savedHeight) {
            mainLayout.style.gridTemplateRows = `1fr ${savedHeight}px`;
        }

        let startY;
        let startHeight;

        const onMouseMove = (e) => {
            const deltaY = e.clientY - startY;
            let newHeight = startHeight - deltaY;

            const maxHeight = window.innerHeight * 0.8;
            if (newHeight < 180) newHeight = 180;
            if (newHeight > maxHeight) newHeight = maxHeight;

            mainLayout.style.gridTemplateRows = `1fr ${newHeight}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            mainLayout.classList.remove('resizing');

            const currentRows = getComputedStyle(mainLayout).gridTemplateRows.split(' ');
            const finalHeight = currentRows[currentRows.length - 1];
            localStorage.setItem('creator_timeline_height', finalHeight.replace('px', ''));

            document.body.style.cursor = '';
            handle.classList.remove('active');
        };

        handle.onmousedown = (e) => {
            e.preventDefault();
            startY = e.clientY;

            const timelineContainer = document.getElementById('creator-timeline-workspace');
            startHeight = timelineContainer ? timelineContainer.offsetHeight : 260;

            mainLayout.classList.add('resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'row-resize';
            handle.classList.add('active');
        };
    }

    setupPiP() {
        const pipBtn = document.getElementById('btn-pip-video');
        const video = document.getElementById('creator-video-preview');
        if (!pipBtn || !video) return;

        if (!document.pictureInPictureEnabled) {
            pipBtn.style.display = 'none';
            return;
        }

        pipBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const videoSrc = video.src || video.currentSrc;
            const currentTime = video.currentTime || 0;

            if (!videoSrc) {
                window.app?.showToast?.(window.i18n?.t('creator.toasts.loadVideoFirst') || 'Please load a video first', 'warning');
                return;
            }

            try {
                await window.mediaflow.pip.open({ videoSrc, currentTime });
                pipBtn.classList.add('active');
                window.app?.showToast?.(window.i18n?.t('creator.toasts.pipOpen') || 'Picture-in-Picture window opened', 'success');
            } catch (err) {
                console.error('PiP error:', err);
                const toastMsg = window.i18n?.t('creator.toasts.pipFail', { error: err.message || 'Unknown' }) || (`Failed to start PiP: ${err.message || 'Unknown'}`);
                window.app?.showToast?.(toastMsg, 'error');
            }
        };

        if (window.mediaflow?.pip?.onClosed) {
            window.mediaflow.pip.onClosed(() => {
                pipBtn.classList.remove('active');
            });
        }
    }

    enableVideoDrag(container) {
        let isDragging = false;
        let offsetX;
        let offsetY;

        const onMouseDown = (e) => {
            if (this.closest(e.target, '.video-controls-overlay') || e.target?.tagName === 'VIDEO') return;

            isDragging = true;
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        };

        const onMouseUp = () => {
            isDragging = false;
            container.style.cursor = '';
        };

        container.removeEventListener('mousedown', container._dragMouseDown);
        document.removeEventListener('mousemove', container._dragMouseMove);
        document.removeEventListener('mouseup', container._dragMouseUp);

        container._dragMouseDown = onMouseDown;
        container._dragMouseMove = onMouseMove;
        container._dragMouseUp = onMouseUp;

        container.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

window.CreatorFlowBootstrap = CreatorFlowBootstrap;
