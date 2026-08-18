class CreatorPreviewPresentation {
    constructor(preview) {
        this.preview = preview;
    }

    updateExtraMetadata(file) {
        const { fps, codec, filesize, filename } = this.preview.elements;
        const fileName = typeof file === 'string'
            ? file.split(/[/\\]/).pop()
            : file?.name;
        const filePath = typeof file === 'string'
            ? file
            : file?.path;

        if (filename && fileName) {
            filename.textContent = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
            filename.title = fileName;
        }
        if (filesize) {
            filesize.textContent = file?.size ? this.formatFileSize(file.size) : '-';
        }
        if (filePath) {
            this.fetchMediaInfo(filePath);
        } else {
            if (fps) fps.textContent = '-';
            if (codec) codec.textContent = '-';
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    async fetchMediaInfo(filePath) {
        const { fps, codec } = this.preview.elements;
        try {
            if (window.mediaflow?.video?.probe) {
                const result = await window.mediaflow.video.probe(filePath);
                if (result.success && result.info) {
                    const videoStream = result.info.streams?.find(s => s.codec_type === 'video');
                    if (videoStream) {
                        if (fps) {
                            const fpsValue = this.parseFrameRate(videoStream.r_frame_rate || videoStream.avg_frame_rate);
                            fps.textContent = fpsValue ? fpsValue + ' fps' : '-';
                        }
                        if (codec && videoStream.codec_name) {
                            codec.textContent = videoStream.codec_name.toUpperCase();
                        }
                    }
                }
            }
        } catch (e) { void e; }
    }

    parseFrameRate(fpsString) {
        if (!fpsString) return null;
        if (fpsString.includes('/')) {
            const [num, den] = fpsString.split('/').map(Number);
            if (den && den !== 0) return (num / den).toFixed(2);
        }
        return parseFloat(fpsString).toFixed(0);
    }

    updateDurationDisplay(seconds) {
        const { duration } = this.preview.elements;
        if (duration) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            duration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    setVideoVisibility(visible) {
        const video = this.preview.elements.video;
        if (!video) return;
        if (visible) {
            video.style.visibility = 'visible';
            video.style.opacity = '1';
            video.style.pointerEvents = 'auto';
        } else {
            video.style.visibility = 'hidden';
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
        }
    }

    applyTransform(transform = {}) {
        const video = this.preview.elements.video;
        if (!video) return;
        let transformStr = '';
        if (transform.rotate) transformStr += `rotate(${transform.rotate}deg) `;
        if (transform.mirror === 'h') transformStr += 'scaleX(-1) ';
        else if (transform.mirror === 'v') transformStr += 'scaleY(-1) ';
        else if (transform.mirror === 'both') transformStr += 'scale(-1, -1) ';
        if (transform.scale && transform.scale !== 1) transformStr += `scale(${transform.scale}) `;
        video.style.transform = transformStr.trim();
    }

    updateVerticalPreview(isVisible, options = {}) {
        const video = this.preview.elements.video;
        const pipContainer = document.getElementById('vertical-pip-container');
        const pipCanvas = document.getElementById('vertical-pip-canvas');
        if (!video || !pipContainer || !pipCanvas) return;
        if (isVisible) {
            pipContainer.classList.remove('pip-hidden');
            if (this.preview._pipRaf) cancelAnimationFrame(this.preview._pipRaf);
            const renderFrame = () => {
                if (video.readyState === 0) {
                    this.preview._pipRaf = requestAnimationFrame(renderFrame);
                    return;
                }
                pipCanvas.width = 360;
                pipCanvas.height = 640;
                const ctx = pipCanvas.getContext('2d');
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                if (!vw || !vh) return;
                const bgScale = Math.max(pipCanvas.width / vw, pipCanvas.height / vh);
                const bgW = vw * bgScale;
                const bgH = vh * bgScale;
                const bgX = (pipCanvas.width - bgW) / 2;
                const bgY = (pipCanvas.height - bgH) / 2;
                if (options.bgStyle === 'color') {
                    ctx.fillStyle = options.bgColor || '#000000';
                    ctx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
                } else {
                    ctx.filter = `blur(${options.blurRadius || 20}px) brightness(0.8)`;
                    ctx.drawImage(video, bgX, bgY, bgW, bgH);
                    ctx.filter = 'none';
                }
                const baseScale = Math.min(pipCanvas.width / vw, pipCanvas.height / vh);
                const userScaleX = (options.scaleX !== undefined ? options.scaleX : 100) / 100;
                const userScaleY = (options.scaleY !== undefined ? options.scaleY : 100) / 100;
                const finalW = vw * baseScale * userScaleX;
                const finalH = vh * baseScale * userScaleY;
                const offsetXPercent = (options.offsetX !== undefined ? options.offsetX : 0) / 100;
                const finalX = (pipCanvas.width - finalW) / 2 + (pipCanvas.width / 2 * offsetXPercent);
                const offsetPercent = (options.offset !== undefined ? options.offset : 0) / 100;
                const finalY = (pipCanvas.height - finalH) / 2 + (pipCanvas.height / 2 * offsetPercent);
                ctx.drawImage(video, finalX, finalY, finalW, finalH);
                if (!video.paused) this.preview._pipRaf = requestAnimationFrame(renderFrame);
            };
            renderFrame();
        } else {
            pipContainer.classList.add('pip-hidden');
            if (this.preview._pipRaf) cancelAnimationFrame(this.preview._pipRaf);
        }
    }

    updateCropPreview(isVisible, options = {}) {
        const video = this.preview.elements.video;
        const pipContainer = document.getElementById('crop-pip-container');
        const pipCanvas = document.getElementById('crop-pip-canvas');
        if (!video || !pipContainer || !pipCanvas) return;
        if (isVisible) {
            pipContainer.classList.remove('pip-hidden');
            if (this.preview._cropRaf) cancelAnimationFrame(this.preview._cropRaf);
            const renderFrame = () => {
                if (video.readyState === 0) {
                    this.preview._cropRaf = requestAnimationFrame(renderFrame);
                    return;
                }
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                if (!vw || !vh) return;
                const targetW = parseInt(options.targetW) || vw;
                const targetH = parseInt(options.targetH) || vh;
                const ratio = targetW / targetH;
                pipCanvas.width = 480;
                pipCanvas.height = Math.round(480 / ratio);
                const ctx = pipCanvas.getContext('2d');
                ctx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
                let sw, sh, sx, sy;
                if (vw / vh > ratio) {
                    sh = vh;
                    sw = vh * ratio;
                    sx = (vw - sw) / 2;
                    sy = 0;
                } else {
                    sw = vw;
                    sh = vw / ratio;
                    sx = 0;
                    sy = (vh - sh) / 2;
                }
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, pipCanvas.width, pipCanvas.height);
                if (!video.paused) this.preview._cropRaf = requestAnimationFrame(renderFrame);
            };
            renderFrame();
        } else {
            pipContainer.classList.add('pip-hidden');
            if (this.preview._cropRaf) cancelAnimationFrame(this.preview._cropRaf);
        }
    }
}

window.CreatorPreviewPresentation = CreatorPreviewPresentation;
