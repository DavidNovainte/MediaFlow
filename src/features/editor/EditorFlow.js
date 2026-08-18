class EditorFlow {
    static VIDEO_FILMSTRIP_FRAME_COUNT = 10;
    static LONG_VIDEO_FILMSTRIP_FRAME_COUNT = 72;
    static VERY_LONG_VIDEO_FILMSTRIP_FRAME_COUNT = 144;
    static VIDEO_FILMSTRIP_CACHE_VERSION = 'v2';
    static MAX_VIDEO_FILMSTRIP_SPRITE_WIDTH = 16384;

    constructor(app) {
        this.app = app;
        this.store = new window.EditorProjectStore();
        this.importer = new window.EditorMediaImporter(this);
        this.exportManager = new window.EditorExportManager(this);
        this.uiManager = new window.EditorUIManager(this);
        this.previewManager = new window.EditorPreviewManager(this);
        this.playbackManager = new window.EditorPlaybackManager(this);
        this.timelineManager = new window.EditorTimelineManager(this);
        this.timelineSelectionManager = new window.EditorTimelineSelectionManager(this);
        this.timelineViewportManager = new window.EditorTimelineViewportManager(this);
        this.timelineActions = new window.EditorTimelineActions(this);
        this.inspectorManager = new window.EditorInspectorManager(this);
        this.unsubscribe = null;
        this.metadataJobs = new Map();
        this.waveformJobs = new Map();
        this.filmstripJobs = new Map();
        this.posterFrameJobs = new Map();
        this.filmstripCacheDirPromise = null;
        this.waveformAudioContext = null;
    }

    safeRender(label, renderFn, state) {
        if (typeof renderFn !== 'function') return;
        try {
            renderFn(state);
        } catch (error) {
            console.error(`[EditorFlow] ${label} render failed:`, error);
        }
    }

    renderSnapshot(state = this.store.getState()) {
        this.safeRender('ui', (snapshot) => this.uiManager.render(snapshot), state);
        this.safeRender('export', (snapshot) => this.exportManager.render(snapshot), state);
        this.safeRender('preview', (snapshot) => this.previewManager.render(snapshot), state);
        this.safeRender('playback', (snapshot) => this.playbackManager.render(snapshot), state);
        this.safeRender('timeline', (snapshot) => this.timelineManager.render(snapshot), state);
        this.safeRender('timeline viewport', (snapshot) => this.timelineViewportManager.render(snapshot), state);
        this.safeRender('timeline actions', (snapshot) => this.timelineActions.render(snapshot), state);
        this.safeRender('inspector', (snapshot) => this.inspectorManager.render(snapshot), state);
    }

    renderPlayheadSnapshot(state = this.store.getState()) {
        if (this.playbackManager?.isPlaying && typeof this.previewManager.renderPlaybackTick === 'function') {
            this.safeRender('preview tick', (snapshot) => this.previewManager.renderPlaybackTick(snapshot), state);
        } else {
            this.safeRender('preview', (snapshot) => this.previewManager.render(snapshot), state);
        }

        this.safeRender('timeline', (snapshot) => this.timelineManager.render(snapshot), state);
        this.safeRender('timeline viewport', (snapshot) => this.timelineViewportManager.render(snapshot), state);
    }

    renderCurrentState() {
        const render = () => this.renderSnapshot(this.store.getState());

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                render();
                window.requestAnimationFrame(() => render());
            });
            return;
        }

        render();
        setTimeout(() => render(), 0);
    }

    init() {
        this.uiManager.init();
        this.exportManager.init();
        this.previewManager.init();
        this.playbackManager.init();
        this.timelineManager.init();
        this.timelineSelectionManager.init();
        this.timelineViewportManager.init();
        this.timelineActions.init();
        this.inspectorManager.init();
        this.unsubscribe?.();
        this.unsubscribe = this.store.subscribe((state, metadata = {}) => {
            if (metadata.changeType === 'playhead') {
                this.renderPlayheadSnapshot(state);
                return;
            }

            this.renderSnapshot(state);
        });
    }

    getWaveformAudioContext() {
        if (this.waveformAudioContext && this.waveformAudioContext.state !== 'closed') {
            return this.waveformAudioContext;
        }

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;
        this.waveformAudioContext = new AudioContextCtor();
        return this.waveformAudioContext;
    }

    resolveWaveformInputPath(asset) {
        const explicitPath = String(asset?.path || asset?.file?.path || '').trim();
        if (explicitPath) return explicitPath;

        const source = String(asset?.src || '').trim();
        if (!source || /^(blob:|data:|https?:)/i.test(source)) return '';

        return source
            .replace(/^media-file:\/\//i, '')
            .replace(/^file:\/\//i, '');
    }

    /**
     * Target peak count scales with duration, but stays bounded for long pure-audio assets
     * (e.g. 50+ min podcasts) so extract/decode stays responsive and timeline paint is dense enough.
     */
    getWaveformSampleBudget(durationSec = 0) {
        const duration = Math.max(0, Number(durationSec) || 0);
        if (duration <= 30) return 160;
        if (duration <= 120) return 320;
        if (duration <= 600) return 640;
        if (duration <= 1800) return 960;
        return 1280;
    }

    async createWaveformPeaks(asset) {
        const source = String(asset?.src || '').trim();
        if (!source) return null;

        const duration = Math.max(0, Number(asset?.duration) || 0);
        const sampleBudget = this.getWaveformSampleBudget(duration);
        // Keep samplesPerSec modest for long files: total peaks ≈ min(budget, duration * sps)
        const samplesPerSec = duration > 0
            ? Math.max(2, Math.min(40, Math.ceil(sampleBudget / Math.max(duration, 1))))
            : 12;

        const waveformInputPath = this.resolveWaveformInputPath(asset);
        if (waveformInputPath && window.mediaflow?.video?.extractAudio) {
            const result = await window.mediaflow.video.extractAudio({
                input: waveformInputPath,
                samplesPerSec
            });
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to extract waveform peaks');
            }
            const peaks = Array.isArray(result.peaks) && result.peaks.length ? result.peaks : null;
            return peaks ? this.downsamplePeaks(peaks, sampleBudget) : null;
        }

        const audioContext = this.getWaveformAudioContext();
        if (!audioContext) return null;

        const response = await fetch(source);
        if (!response.ok) {
            throw new Error(`Failed to fetch media for waveform: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        const channelCount = Math.max(audioBuffer.numberOfChannels || 0, 1);
        const sampleCount = sampleBudget;
        const blockSize = Math.max(1, Math.floor(audioBuffer.length / sampleCount));
        const peaks = [];

        for (let peakIndex = 0; peakIndex < sampleCount; peakIndex += 1) {
            const start = peakIndex * blockSize;
            const end = peakIndex === sampleCount - 1 ? audioBuffer.length : Math.min(audioBuffer.length, start + blockSize);
            let peak = 0;

            for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
                const channelData = audioBuffer.getChannelData(channelIndex);
                // Stride long blocks for multi-hour audio decode speed
                const stride = Math.max(1, Math.floor((end - start) / 4000));
                for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
                    const amplitude = Math.abs(channelData[sampleIndex] || 0);
                    if (amplitude > peak) peak = amplitude;
                }
            }

            peaks.push(Number(Math.min(1, peak).toFixed(4)));
        }

        return peaks;
    }

    downsamplePeaks(peaks, targetCount) {
        if (!Array.isArray(peaks) || !peaks.length) return peaks;
        const target = Math.max(32, Math.min(Number(targetCount) || peaks.length, peaks.length));
        if (peaks.length <= target) return peaks;

        const result = new Array(target);
        for (let i = 0; i < target; i += 1) {
            const start = Math.floor((i / target) * peaks.length);
            const end = Math.max(start + 1, Math.floor(((i + 1) / target) * peaks.length));
            let max = 0;
            for (let p = start; p < end; p += 1) {
                const value = Array.isArray(peaks[p])
                    ? Math.max(...peaks[p].map((n) => Math.abs(Number(n) || 0)))
                    : Math.abs(Number(peaks[p]) || 0);
                if (value > max) max = value;
            }
            result[i] = max;
        }
        return result;
    }

    async loadVideoElement(source) {
        return await new Promise((resolve, reject) => {
            const video = document.createElement('video');
            let settled = false;

            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                video.removeEventListener('error', onError);
            };

            const settle = (callback) => {
                if (settled) return;
                settled = true;
                cleanup();
                callback();
            };

            const onLoadedMetadata = () => settle(() => resolve(video));
            const onError = () => settle(() => reject(new Error('Failed to load video metadata for filmstrip generation')));

            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.src = source;
            video.load();
        });
    }

    async seekVideo(video, time) {
        return await new Promise((resolve, reject) => {
            let settled = false;

            const cleanup = () => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
            };

            const settle = (callback) => {
                if (settled) return;
                settled = true;
                cleanup();
                callback();
            };

            const onSeeked = () => settle(resolve);
            const onError = () => settle(() => reject(new Error('Failed to seek video for filmstrip generation')));

            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.currentTime = time;
        });
    }

    cleanupVideoElement(video) {
        if (!video) return;
        try {
            video.pause();
        } catch (error) {
            void error;
        }
        video.removeAttribute('src');
        try {
            video.load();
        } catch (error) {
            void error;
        }
    }

    async loadMediaMetadata(asset) {
        const source = String(asset?.src || '').trim();
        const kind = asset?.kind === 'audio' ? 'audio' : asset?.kind === 'video' ? 'video' : null;
        if (!source || !kind) return null;

        const media = document.createElement(kind);
        try {
            await new Promise((resolve, reject) => {
                let settled = false;
                const cleanup = () => {
                    media.removeEventListener('loadedmetadata', onLoadedMetadata);
                    media.removeEventListener('error', onError);
                };
                const settle = (callback) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    callback();
                };
                const onLoadedMetadata = () => settle(resolve);
                const onError = () => settle(() => reject(new Error('Failed to load media metadata')));

                media.preload = 'metadata';
                media.muted = true;
                media.playsInline = true;
                media.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
                media.addEventListener('error', onError, { once: true });
                media.src = source;
                media.load();
            });

            const metadata = {
                duration: Math.max(Number(media.duration) || 0, 0)
            };
            if (kind === 'video') {
                metadata.width = Math.max(Number(media.videoWidth) || 0, 0);
                metadata.height = Math.max(Number(media.videoHeight) || 0, 0);
            }
            return metadata;
        } finally {
            this.cleanupVideoElement(media);
        }
    }

    ensureMetadataForAsset(asset) {
        if (!asset?.id || !asset.src) return;
        if (asset.kind !== 'video' && asset.kind !== 'audio') return;

        const hasDuration = (Number(asset.duration) || 0) > 0;
        const hasVideoSize = asset.kind !== 'video' || ((Number(asset.width) || 0) > 0 && (Number(asset.height) || 0) > 0);
        if (hasDuration && hasVideoSize) return;
        if (this.metadataJobs.has(asset.id)) return;

        const job = this.loadMediaMetadata(asset)
            .then((metadata) => {
                if (!metadata?.duration) return;
                const patch = { duration: metadata.duration };
                if (asset.kind === 'video') {
                    if (metadata.width) patch.width = metadata.width;
                    if (metadata.height) patch.height = metadata.height;
                }
                this.store.updateAsset(asset.id, patch);
            })
            .catch((error) => {
                console.warn('[EditorFlow] Metadata detection failed:', error);
            })
            .finally(() => {
                this.metadataJobs.delete(asset.id);
            });

        this.metadataJobs.set(asset.id, job);
    }

    getVideoFilmstripFrameCount(duration) {
        const safeDuration = Math.max(Number(duration) || 0, 0);
        if (safeDuration >= 30 * 60) return EditorFlow.VERY_LONG_VIDEO_FILMSTRIP_FRAME_COUNT;
        if (safeDuration >= 5 * 60) return EditorFlow.LONG_VIDEO_FILMSTRIP_FRAME_COUNT;
        return EditorFlow.VIDEO_FILMSTRIP_FRAME_COUNT;
    }

    getVideoFilmstripFrameWidth(sourceWidth, sampleCount) {
        const safeSourceWidth = Math.max(Number(sourceWidth) || 0, 1);
        const safeSampleCount = Math.max(Number(sampleCount) || 1, 1);
        const maxPerFrameWidth = Math.max(Math.floor(EditorFlow.MAX_VIDEO_FILMSTRIP_SPRITE_WIDTH / safeSampleCount), 1);
        const preferredWidth = Math.min(160, safeSourceWidth);

        if (maxPerFrameWidth >= 48) {
            return Math.max(48, Math.min(preferredWidth, maxPerFrameWidth));
        }

        return Math.min(preferredWidth, maxPerFrameWidth);
    }

    getVideoFilmstripPartialCommitStep(sampleCount) {
        const safeSampleCount = Math.max(Number(sampleCount) || 1, 1);
        return Math.max(2, Math.ceil(safeSampleCount / 18));
    }

    getVideoFilmstripSampleTime(duration, index, sampleCount) {
        const safeDuration = Math.max(Number(duration) || 0, 0);
        const safeSampleCount = Math.max(Number(sampleCount) || 1, 1);
        const safeIndex = Math.min(Math.max(Number(index) || 0, 0), Math.max(safeSampleCount - 1, 0));

        if (safeDuration <= 0.12) return 0;
        if (safeSampleCount === 1) {
            return Math.min(Math.max(Math.min(safeDuration * 0.08, 1.2), 0.05), Math.max(safeDuration - 0.05, 0));
        }

        const ratio = (safeIndex + 0.5) / safeSampleCount;
        return Math.min(Math.max(safeDuration * ratio, 0.05), Math.max(safeDuration - 0.05, 0));
    }

    canUseDiskFilmstripCache() {
        return !!(
            window.mediaflow?.app?.getAppPath
            && window.mediaflow?.app?.getTempPath
            && window.mediaflow?.path?.join
            && window.mediaflow?.fs?.mkdir
            && window.mediaflow?.fs?.readAsDataUrl
            && window.mediaflow?.shell?.fileExists
            && window.mediaflow?.video?.extractFrame
        );
    }

    canUseDiskFilmstripSpriteCache() {
        return !!(
            this.canUseDiskFilmstripCache()
            && window.mediaflow?.fs?.readFile
            && window.mediaflow?.fs?.writeFile
        );
    }

    resolveVideoPosterCacheInput(asset) {
        const explicitPath = String(asset?.path || asset?.file?.path || '').trim();
        if (explicitPath) return explicitPath;

        const source = String(asset?.src || '').trim();
        if (!source || /^(blob:|data:|https?:)/i.test(source)) return '';
        return source.replace(/^file:\/\//i, '');
    }

    async resolveVideoPosterCacheIdentity(asset) {
        const inputPath = this.resolveVideoPosterCacheInput(asset);
        let fileSize = Math.max(Number(asset?.file?.size) || 0, 0);
        let lastModified = Math.max(Number(asset?.file?.lastModified) || 0, 0);

        if (inputPath && (!fileSize || !lastModified) && window.mediaflow?.fs?.stat) {
            try {
                const statResult = await window.mediaflow.fs.stat(inputPath);
                if (statResult?.success) {
                    fileSize = Math.max(fileSize, Number(statResult.size) || 0);
                    lastModified = Math.max(lastModified, Number(statResult.mtimeMs ?? statResult.lastModified) || 0);
                }
            } catch (error) {
                void error;
            }
        }

        return {
            inputPath,
            source: String(asset?.path || asset?.src || ''),
            name: String(asset?.name || ''),
            duration: String(Number(asset?.duration) || 0),
            fileSize: String(fileSize),
            lastModified: String(lastModified)
        };
    }

    createVideoPosterCacheKey(asset) {
        const seed = [
            EditorFlow.VIDEO_FILMSTRIP_CACHE_VERSION,
            String(asset?.source || asset?.path || asset?.src || ''),
            String(asset?.name || ''),
            String(asset?.duration || Number(asset?.duration) || 0),
            String(asset?.fileSize || asset?.file?.size || ''),
            String(asset?.lastModified || asset?.file?.lastModified || '')
        ].join('|');

        let hash = 2166136261;
        for (let index = 0; index < seed.length; index += 1) {
            hash ^= seed.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return `poster-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    createVideoFilmstripSpriteCacheKey(asset) {
        return this.createVideoPosterCacheKey(asset).replace(/^poster-/, 'filmstrip-');
    }

    async getFilmstripCacheDirectory() {
        if (!this.canUseDiskFilmstripCache()) return null;
        if (!this.filmstripCacheDirPromise) {
            this.filmstripCacheDirPromise = (async () => {
                const baseDir = await window.mediaflow.app.getAppPath('userData')
                    || await window.mediaflow.app.getTempPath();
                if (!baseDir) return null;

                const cacheDir = await window.mediaflow.path.join(baseDir, 'cache', 'editor-filmstrip-posters');
                const mkdirResult = await window.mediaflow.fs.mkdir(cacheDir);
                if (!mkdirResult?.success) return null;
                return cacheDir;
            })().catch(() => null);
        }

        return await this.filmstripCacheDirPromise;
    }

    async readPosterFrameCache(cacheFilePath) {
        if (!cacheFilePath || !await window.mediaflow.shell.fileExists(cacheFilePath)) {
            return null;
        }

        const readResult = await window.mediaflow.fs.readAsDataUrl(cacheFilePath);
        return readResult?.success ? readResult.dataUrl : null;
    }

    async readVideoFilmstripSpriteCache(cacheIdentity) {
        if (!cacheIdentity?.inputPath || !this.canUseDiskFilmstripSpriteCache()) return null;

        const cacheDir = await this.getFilmstripCacheDirectory();
        if (!cacheDir) return null;

        const cacheKey = this.createVideoFilmstripSpriteCacheKey(cacheIdentity);
        const cacheFilePath = await window.mediaflow.path.join(cacheDir, `${cacheKey}.json`);
        if (!await window.mediaflow.shell.fileExists(cacheFilePath)) return null;

        try {
            const content = await window.mediaflow.fs.readFile(cacheFilePath);
            const payload = JSON.parse(content);
            const spriteSource = String(payload?.src || '').trim();
            const frameCount = Math.max(Number(payload?.frameCount) || 0, 0);
            if (!spriteSource || !frameCount) return null;

            return {
                src: spriteSource,
                frameCount
            };
        } catch (error) {
            void error;
            return null;
        }
    }

    async writeVideoFilmstripSpriteCache(cacheIdentity, sprite) {
        if (!cacheIdentity?.inputPath || !this.canUseDiskFilmstripSpriteCache()) return false;

        const spriteSource = String(sprite?.src || '').trim();
        const frameCount = Math.max(Number(sprite?.frameCount) || 0, 0);
        if (!spriteSource || !frameCount) return false;

        const cacheDir = await this.getFilmstripCacheDirectory();
        if (!cacheDir) return false;

        const cacheKey = this.createVideoFilmstripSpriteCacheKey(cacheIdentity);
        const cacheFilePath = await window.mediaflow.path.join(cacheDir, `${cacheKey}.json`);
        const writeResult = await window.mediaflow.fs.writeFile(cacheFilePath, JSON.stringify({
            src: spriteSource,
            frameCount
        }));
        return writeResult?.success === true;
    }

    async loadOrCreateVideoPosterFrame(asset, cacheIdentity = null) {
        if (!asset?.id || asset.kind !== 'video' || !this.canUseDiskFilmstripCache()) return null;
        if (this.posterFrameJobs.has(asset.id)) {
            return await this.posterFrameJobs.get(asset.id);
        }

        const job = (async () => {
            const resolvedCacheIdentity = cacheIdentity || await this.resolveVideoPosterCacheIdentity(asset);
            if (!resolvedCacheIdentity.inputPath) return null;

            const cacheDir = await this.getFilmstripCacheDirectory();
            if (!cacheDir) return null;

            const cacheKey = this.createVideoPosterCacheKey(resolvedCacheIdentity);
            const cacheFilePath = await window.mediaflow.path.join(cacheDir, `${cacheKey}.jpg`);
            const cachedFrame = await this.readPosterFrameCache(cacheFilePath);
            if (cachedFrame) return cachedFrame;

            const sampleTime = this.getVideoFilmstripSampleTime(Number(asset?.duration) || 0, 0, 1);
            const extractResult = await window.mediaflow.video.extractFrame({
                input: resolvedCacheIdentity.inputPath,
                output: cacheFilePath,
                time: sampleTime
            });
            if (!extractResult?.success) return null;

            return await this.readPosterFrameCache(cacheFilePath);
        })().finally(() => {
            this.posterFrameJobs.delete(asset.id);
        });

        this.posterFrameJobs.set(asset.id, job);
        return await job;
    }

    async createVideoFilmstripFrames(asset, options = {}) {
        const source = String(asset?.src || '').trim();
        if (!source) return null;
        if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
            return null;
        }

        const video = await this.loadVideoElement(source);
        try {
            const duration = Math.max(Number(asset?.duration) || Number(video.duration) || 0, 0);
            const width = Math.max(Number(video.videoWidth) || 0, 0);
            const height = Math.max(Number(video.videoHeight) || 0, 0);
            if (!duration || !width || !height) return null;

            const requestedSampleCount = Number(options.sampleCount);
            const sampleCount = Number.isFinite(requestedSampleCount) && requestedSampleCount > 0
                ? Math.max(Math.round(requestedSampleCount), 1)
                : this.getVideoFilmstripFrameCount(duration);
            const targetWidth = this.getVideoFilmstripFrameWidth(width, sampleCount);
            const targetHeight = Math.max(1, Math.round((height / width) * targetWidth));
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const context = canvas.getContext('2d');
            if (!context) return null;

            const spriteCanvas = document.createElement('canvas');
            spriteCanvas.width = targetWidth * sampleCount;
            spriteCanvas.height = targetHeight;
            const spriteContext = spriteCanvas.getContext('2d');
            const onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
            const frames = [];
            for (let index = 0; index < sampleCount; index += 1) {
                const targetTime = this.getVideoFilmstripSampleTime(duration, index, sampleCount);
                await this.seekVideo(video, targetTime);
                context.clearRect(0, 0, targetWidth, targetHeight);
                context.drawImage(video, 0, 0, targetWidth, targetHeight);
                spriteContext?.drawImage(canvas, index * targetWidth, 0, targetWidth, targetHeight);
                frames.push(canvas.toDataURL('image/webp', 0.72));
                onFrame?.([...frames], { index, sampleCount, duration });
            }

            const normalizedFrames = frames.filter(Boolean);
            if (!normalizedFrames.length) return null;

            if (!spriteContext) {
                return normalizedFrames;
            }

            return {
                frames: normalizedFrames,
                sprite: {
                    src: spriteCanvas.toDataURL('image/webp', 0.72),
                    frameCount: normalizedFrames.length
                }
            };
        } finally {
            this.cleanupVideoElement(video);
        }
    }

    normalizeVideoFilmstripResult(result) {
        if (Array.isArray(result)) {
            return {
                frames: result.filter(Boolean),
                sprite: null
            };
        }

        const frames = Array.isArray(result?.frames) ? result.frames.filter(Boolean) : [];
        const spriteSource = String(result?.sprite?.src || '').trim();
        const spriteFrameCount = Math.max(Number(result?.sprite?.frameCount) || frames.length || 0, 0);

        return {
            frames,
            sprite: spriteSource && spriteFrameCount
                ? {
                    src: spriteSource,
                    frameCount: spriteFrameCount
                }
                : null
        };
    }

    hasCompleteVideoFilmstrip(asset) {
        if (!asset || asset.kind !== 'video') return false;
        const expectedFrameCount = this.getVideoFilmstripFrameCount(asset.duration);
        const spriteFrameCount = Math.max(Number(asset?.filmstripSprite?.frameCount) || 0, 0);
        if (asset?.filmstripSprite?.src) {
            return spriteFrameCount >= expectedFrameCount;
        }

        const frameCount = Array.isArray(asset?.filmstripFrames) ? asset.filmstripFrames.length : 0;
        return frameCount >= expectedFrameCount;
    }

    ensureWaveformForAsset(asset) {
        if (!asset?.id) return;
        // Video-linked A tracks share the video asset — still need peaks for audio waveform
        if (asset.kind !== 'audio' && asset.kind !== 'video') return;
        if (!asset.src || asset.waveformPeaks || asset.waveformStatus === 'pending') return;
        // Allow a re-try after prior failure (e.g. long pure-audio extract race)
        if (asset.waveformStatus === 'failed' && this.waveformJobs.has(asset.id)) return;
        if (this.waveformJobs.has(asset.id)) return;

        this.store.updateAsset(asset.id, { waveformStatus: 'pending' });

        const job = this.createWaveformPeaks(asset)
            .then((peaks) => {
                if (Array.isArray(peaks) && peaks.length) {
                    this.store.updateAsset(asset.id, {
                        waveformPeaks: peaks,
                        waveformStatus: 'ready'
                    });
                    // Re-paint canvases without full timeline rebuild when possible
                    try {
                        const state = this.store.state;
                        if (this.timelineManager?.paintClipWaveforms) {
                            requestAnimationFrame(() => this.timelineManager.paintClipWaveforms(state));
                        } else {
                            this.timelineManager?.render?.(state);
                        }
                    } catch (_) { /* ignore */ }
                    return;
                }

                this.store.updateAsset(asset.id, { waveformStatus: 'failed' });
            })
            .catch((error) => {
                console.warn('[EditorFlow] Waveform generation failed:', error);
                this.store.updateAsset(asset.id, { waveformStatus: 'failed' });
            })
            .finally(() => {
                this.waveformJobs.delete(asset.id);
            });

        this.waveformJobs.set(asset.id, job);
    }

    ensureFilmstripForAsset(asset) {
        if (!asset?.id) return;
        if (asset.kind !== 'video') return;
        if (!asset.src || asset.filmstripStatus === 'pending' || this.hasCompleteVideoFilmstrip(asset)) return;
        if (this.filmstripJobs.has(asset.id)) return;

        this.store.updateAsset(asset.id, { filmstripStatus: 'pending' });

        const commitPartialFrames = (frames) => {
            const normalizedFrames = Array.isArray(frames) ? frames.filter(Boolean) : [];
            if (!normalizedFrames.length) return;

            const currentAsset = this.store.getAssetById(asset.id);
            const currentCount = Array.isArray(currentAsset?.filmstripFrames) ? currentAsset.filmstripFrames.length : 0;
            if (normalizedFrames.length <= currentCount) return;

            this.store.updateAsset(asset.id, {
                filmstripFrames: normalizedFrames,
                filmstripStatus: 'pending'
            });
        };

        let cacheIdentity = null;
        const job = (async () => {
            cacheIdentity = await this.resolveVideoPosterCacheIdentity(asset);
            const cachedSprite = await this.readVideoFilmstripSpriteCache(cacheIdentity);
            if (cachedSprite) {
                return {
                    frames: [],
                    sprite: cachedSprite
                };
            }

            const cachedPosterFrame = await this.loadOrCreateVideoPosterFrame(asset, cacheIdentity);
            if (cachedPosterFrame) {
                commitPartialFrames([cachedPosterFrame]);
            }

            return await this.createVideoFilmstripFrames(asset, {
                onFrame: (frames, meta) => {
                    if (!frames?.length) return;
                    const commitStep = this.getVideoFilmstripPartialCommitStep(meta.sampleCount);
                    if (frames.length === 1 || frames.length === meta.sampleCount || frames.length % commitStep === 0) {
                        commitPartialFrames(frames);
                    }
                }
            });
        })()
            .then((result) => {
                const { frames, sprite } = this.normalizeVideoFilmstripResult(result);
                if (frames.length || sprite?.src) {
                    if (sprite?.src) {
                        void this.writeVideoFilmstripSpriteCache(cacheIdentity, sprite);
                    }
                    this.store.updateAsset(asset.id, {
                        filmstripFrames: sprite?.src ? [] : frames,
                        filmstripSprite: sprite,
                        filmstripStatus: 'ready'
                    });
                    return;
                }

                this.store.updateAsset(asset.id, { filmstripStatus: 'failed' });
            })
            .catch((error) => {
                console.warn('[EditorFlow] Filmstrip generation failed:', error);
                const currentAsset = this.store.getAssetById(asset.id);
                if ((Array.isArray(currentAsset?.filmstripFrames) && currentAsset.filmstripFrames.length) || currentAsset?.filmstripSprite?.src) {
                    this.store.updateAsset(asset.id, { filmstripStatus: 'ready' });
                    return;
                }

                this.store.updateAsset(asset.id, { filmstripStatus: 'failed' });
            })
            .finally(() => {
                this.filmstripJobs.delete(asset.id);
            });

        this.filmstripJobs.set(asset.id, job);
    }

    ensureWaveformsForAssets(assets = []) {
        (Array.isArray(assets) ? assets : []).forEach((asset) => this.ensureWaveformForAsset(asset));
    }

    ensureVideoFilmstripsForAssets(assets = []) {
        (Array.isArray(assets) ? assets : []).forEach((asset) => this.ensureFilmstripForAsset(asset));
    }

    ensureMetadataForAssets(assets = []) {
        (Array.isArray(assets) ? assets : []).forEach((asset) => this.ensureMetadataForAsset(asset));
    }

    addAssets(assets) {
        const normalized = Array.isArray(assets) ? assets : [];
        if (normalized.length === 0) return;

        const hadTimelineClips = this.store.getTimelineClipCount() > 0;
        const added = this.store.upsertAssets(normalized);
        if (!added.length) return;

        const shouldAutoInsertAll = normalized.length > 1 || !hadTimelineClips;
        if (shouldAutoInsertAll) {
            this.store.addAssetsToTimeline(added.map(asset => asset.id));
        }

        this.store.selectAsset(added[0].id);
        this.ensureMetadataForAssets(added);
        this.ensureWaveformsForAssets(added);
        this.ensureVideoFilmstripsForAssets(added);
        if (!this.store.getState().name || this.store.getState().name === '未命名剪辑') {
            // Keep chrome title short — full media names live on asset cards / tooltips only
            const assetCount = this.store.getState()?.assets?.length || added.length;
            const shortName = assetCount > 1
                ? (window.i18n?.t?.('editor.projectMulti') || '时间线剪辑')
                : (window.i18n?.t?.('editor.projectSingle') || '单片段剪辑');
            this.store.setProjectName(shortName);
        }
    }

    handleFileSelect(arg) {
        const list = arg instanceof FileList ? Array.from(arg) : (Array.isArray(arg) ? arg : [arg]);
        this.addAssets(this.importer.importFiles(list));
    }

    addLocalFile(filePath) {
        this.addAssets(this.importer.importLocalPath(filePath));
    }
}

window.EditorFlow = EditorFlow;

if (typeof module !== 'undefined') {
    module.exports = EditorFlow;
}
