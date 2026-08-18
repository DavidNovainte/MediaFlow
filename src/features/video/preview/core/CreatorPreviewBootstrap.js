class CreatorPreviewBootstrap {
    constructor(preview) {
        this.preview = preview;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupAudioNodes();
    }

    bindEvents() {
        const preview = this.preview;

        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;

            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                preview.togglePlayback();
            }
        });

        preview.elements.previewStage?.addEventListener('click', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;
            if (this.closest(e.target, '.video-controls-overlay')) return;
            preview.togglePlayback();
        });

        preview.elements.video?.addEventListener('click', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;
            e.stopPropagation();
            preview.togglePlayback();
        });

        preview.elements.audioPlaceholder?.addEventListener('click', () => {
            if (window.app?.router?.currentPage !== 'creator') return;
            preview.togglePlayback();
        });
    }

    cacheElements() {
        const preview = this.preview;

        preview.elements = {
            previewStage: document.querySelector('#page-creator .video-preview-full'),
            video: document.getElementById('creator-video-preview'),
            videoStandby: document.getElementById('creator-video-preview-standby'),
            audioPlayer: document.getElementById('creator-audio-preview'),
            audioPlaceholder: document.getElementById('audio-placeholder'),
            duration: document.getElementById('creator-duration'),
            resolution: document.getElementById('creator-resolution'),
            fps: document.getElementById('creator-fps'),
            codec: document.getElementById('creator-codec'),
            filesize: document.getElementById('creator-filesize'),
            filename: document.getElementById('creator-filename')
        };

        preview.ensureStandbyVideo();
    }

    setupAudioNodes() {
        const preview = this.preview;
        const player = preview.app.isAudioOnly ? preview.elements.audioPlayer : preview.elements.video;
        if (!player) return;

        try {
            if (!preview.audioCtx || preview.audioCtx.state === 'closed') {
                preview.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                preview.gainNode = null;
                preview.audioSource = null;
            }

            if (!preview.gainNode) {
                preview.gainNode = preview.audioCtx.createGain();
                preview.gainNode.connect(preview.audioCtx.destination);
            }

            if (preview.audioSource) {
                if (preview.audioSource.context === preview.audioCtx && preview.audioSource.mediaElement === player) {
                    return;
                }
                try {
                    preview.audioSource.disconnect();
                } catch (e) { void e; }
            }

            preview.audioSource = preview.audioCtx.createMediaElementSource(player);
            preview.gainNode.channelCount = 2;
            preview.gainNode.channelCountMode = 'explicit';
            preview.gainNode.channelInterpretation = 'speakers';
            preview.audioSource.connect(preview.gainNode);

            console.log('[Preview] Web Audio API master link established');
        } catch (err) {
            console.warn('[Preview] Web Audio API initialization failed:', err);
        }
    }

    reset() {
        const preview = this.preview;
        const { video, videoStandby, audioPlayer } = preview.elements;

        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.style.transform = '';
        }

        if (videoStandby) {
            videoStandby.pause();
            videoStandby.removeAttribute('src');
            videoStandby.load();
        }

        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
        }

        preview.videoDuration = 0;
        preview._currentVideoSrc = '';
        preview._standbyVideoSrc = '';
    }
}

window.CreatorPreviewBootstrap = CreatorPreviewBootstrap;
