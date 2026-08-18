/**
 * VideoEnhanceService.js
 * Constrained local video enhance MVP:
 * extract frames → AI upscale → reassemble + copy audio.
 *
 * Limits (product safety):
 * - max duration 45s
 * - max long edge 1280 before enhance
 * - scale capped at 2x
 * - max ~1080 frames (safety)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const binaries = require('../../utils/binaries');
const engineManager = require('./EngineManager');

const MAX_DURATION_SEC = 45;
const MAX_LONG_EDGE = 1280;
const MAX_SCALE = 2;
const MAX_FRAMES = 1080;
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);

class VideoEnhanceService {
    constructor() {
        this.cancelled = false;
        this._ffProc = null;
        this.tempRoot = path.join(os.tmpdir(), 'mediaflow-enhance-video');
        this.ensureDir(this.tempRoot);
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    isVideoPath(filePath) {
        const ext = path.extname(String(filePath || '')).toLowerCase();
        return VIDEO_EXTS.has(ext);
    }

    cancel() {
        this.cancelled = true;
        if (this._ffProc && !this._ffProc.killed) {
            try {
                this._ffProc.kill('SIGTERM');
            } catch {
                // ignore
            }
        }
        engineManager.cancelAll?.() || engineManager.cancel?.();
    }

    resetCancel() {
        this.cancelled = false;
    }

    assertNotCancelled() {
        if (this.cancelled) {
            const err = new Error('Process cancelled');
            err.code = 'CANCELLED';
            throw err;
        }
    }

    runProcess(bin, args, { onStderr } = {}) {
        return new Promise((resolve, reject) => {
            const proc = spawn(bin, args, {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            this._ffProc = proc;
            let stderr = '';
            proc.stderr.on('data', (d) => {
                const t = d.toString();
                stderr += t;
                onStderr?.(t);
            });
            proc.stdout.on('data', () => {});
            proc.on('error', (err) => {
                this._ffProc = null;
                reject(err);
            });
            proc.on('close', (code) => {
                this._ffProc = null;
                if (this.cancelled) {
                    reject(Object.assign(new Error('Process cancelled'), { code: 'CANCELLED' }));
                    return;
                }
                if (code === 0) resolve({ success: true });
                else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-400)}`));
            });
        });
    }

    /**
     * Normalize path for Windows (long path / Unicode).
     */
    normalizeInputPath(inputPath) {
        let p = String(inputPath || '').trim();
        if (!p) return p;
        // Strip file:// prefix if any
        if (p.startsWith('file:///')) {
            p = decodeURIComponent(p.replace(/^file:\/\/\//i, ''));
            if (process.platform === 'win32') p = p.replace(/\//g, '\\');
        } else if (p.startsWith('file://')) {
            p = decodeURIComponent(p.replace(/^file:\/\//i, ''));
        }
        try {
            if (fs.existsSync(p)) {
                return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
            }
        } catch {
            // keep original
        }
        return p;
    }

    runFfprobeJson(ffprobe, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(ffprobe, args, {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsVerbatimArguments: false
            });
            let out = '';
            let err = '';
            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.stderr.on('data', (d) => { err += d.toString(); });
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code === 0 && out.trim()) resolve(out);
                else reject(new Error(`ffprobe exit ${code}: ${err || out || 'no output'}`));
            });
        });
    }

    parseProbeJson(raw) {
        const json = JSON.parse(raw || '{}');
        const stream = (json.streams && json.streams[0]) || {};
        const format = json.format || {};
        let duration = Number(stream.duration || format.duration || 0);
        // Some containers report N/A → NaN
        if (!Number.isFinite(duration) || duration < 0) duration = 0;
        // Prefer format duration when stream lacks it
        if (duration <= 0 && format.duration) {
            duration = Number(format.duration) || 0;
        }
        const width = Number(stream.width || 0);
        const height = Number(stream.height || 0);
        const rateStr = stream.avg_frame_rate || stream.r_frame_rate || '24/1';
        let fps = 24;
        if (typeof rateStr === 'string' && rateStr.includes('/')) {
            const [a, b] = rateStr.split('/').map(Number);
            if (a > 0 && b > 0) fps = a / b;
        } else if (Number(rateStr) > 0) {
            fps = Number(rateStr);
        }
        if (!Number.isFinite(fps) || fps <= 0) fps = 24;
        fps = Math.min(60, Math.max(1, Math.round(fps * 1000) / 1000));
        return { duration, width, height, fps };
    }

    async probe(inputPath) {
        if (typeof binaries.initBinaries === 'function') binaries.initBinaries();
        const ffprobe = binaries.getFfprobePath?.() || binaries.ffprobePath;
        if (!ffprobe || !fs.existsSync(ffprobe)) {
            throw new Error('ffprobe not found. Install core engines in Settings.');
        }

        const resolved = this.normalizeInputPath(inputPath);
        if (!resolved || !fs.existsSync(resolved)) {
            throw new Error(`File not found: ${inputPath}`);
        }

        // Primary: stream + format
        const argsFull = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,duration',
            '-show_entries', 'format=duration',
            '-of', 'json',
            resolved
        ];
        // Fallback: format only (some weird mp4s)
        const argsFormat = [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            resolved
        ];

        let raw;
        try {
            raw = await this.runFfprobeJson(ffprobe, argsFull);
        } catch (e1) {
            console.warn('[VideoEnhance] probe full failed, try format-only:', e1.message);
            try {
                raw = await this.runFfprobeJson(ffprobe, argsFormat);
            } catch (e2) {
                console.error('[VideoEnhance] probe failed for', resolved, e2.message);
                throw new Error(`ffprobe failed: ${e2.message}`);
            }
        }

        const meta = this.parseProbeJson(raw);
        console.log('[VideoEnhance] probe ok', {
            path: resolved,
            duration: meta.duration,
            size: `${meta.width}x${meta.height}`,
            fps: meta.fps
        });
        return meta;
    }

    parseLimits(meta, options = {}) {
        if (!meta.duration || meta.duration <= 0) {
            throw new Error('Could not read video duration');
        }
        if (meta.duration > MAX_DURATION_SEC) {
            throw new Error(
                `Video longer than ${MAX_DURATION_SEC}s is not supported in this MVP. Trim first or use a short clip.`
            );
        }
        if (!meta.width || !meta.height) {
            throw new Error('Could not read video resolution');
        }

        let scale = Number(options.scale) || 2;
        if (scale < 2) scale = 2;
        if (scale > MAX_SCALE) scale = MAX_SCALE;

        const longEdge = Math.max(meta.width, meta.height);
        let preScale = 1;
        if (longEdge > MAX_LONG_EDGE) {
            preScale = MAX_LONG_EDGE / longEdge;
        }

        const estFrames = Math.ceil(meta.duration * meta.fps) + 2;
        if (estFrames > MAX_FRAMES) {
            throw new Error(
                `Too many frames (~${estFrames}). MVP limit is ${MAX_FRAMES}. Use a shorter clip or lower FPS source.`
            );
        }

        return { scale, preScale, estFrames };
    }

    listFrames(dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
            .sort();
    }

    async extractFrames(inputPath, framesDir, meta, preScale) {
        if (typeof binaries.initBinaries === 'function') binaries.initBinaries();
        const ffmpeg = binaries.getFfmpegPath?.() || binaries.ffmpegPath;
        if (!ffmpeg || !fs.existsSync(ffmpeg)) {
            throw new Error('ffmpeg not found. Install core engines in Settings.');
        }

        this.ensureDir(framesDir);
        const pattern = path.join(framesDir, 'frame_%06d.png');
        const vf = [];
        if (preScale < 0.999) {
            const w = Math.max(2, Math.floor((meta.width * preScale) / 2) * 2);
            const h = Math.max(2, Math.floor((meta.height * preScale) / 2) * 2);
            vf.push(`scale=${w}:${h}`);
        }
        // Keep original timing; PNG sequence + -framerate on encode
        const args = [
            '-y',
            '-i', inputPath,
            ...(vf.length ? ['-vf', vf.join(',')] : []),
            '-vsync', '0',
            '-start_number', '1',
            pattern
        ];
        await this.runProcess(ffmpeg, args);
        const frames = this.listFrames(framesDir);
        if (!frames.length) throw new Error('No frames extracted from video');
        if (frames.length > MAX_FRAMES) {
            throw new Error(`Extracted ${frames.length} frames exceeds MVP limit ${MAX_FRAMES}`);
        }
        return frames;
    }

    async encodeVideo(framesOutDir, frameCount, fps, sourcePath, outputPath) {
        if (typeof binaries.initBinaries === 'function') binaries.initBinaries();
        const ffmpeg = binaries.getFfmpegPath?.() || binaries.ffmpegPath;
        const pattern = path.join(framesOutDir, 'frame_%06d.png');
        // Prefer copy audio when present; fall back to AAC. Optional map avoids fail on mute clips.
        const args = [
            '-y',
            '-framerate', String(fps),
            '-start_number', '1',
            '-i', pattern,
            '-i', sourcePath,
            '-map', '0:v:0',
            '-map', '1:a?',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'veryfast',
            '-crf', '18',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputPath
        ];
        try {
            await this.runProcess(ffmpeg, args);
        } catch (firstErr) {
            // Mute / odd audio: encode video-only
            console.warn('[VideoEnhance] mux with audio failed, retry video-only:', firstErr.message);
            this.assertNotCancelled();
            const videoOnly = [
                '-y',
                '-framerate', String(fps),
                '-start_number', '1',
                '-i', pattern,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'veryfast',
                '-crf', '18',
                '-an',
                '-movflags', '+faststart',
                outputPath
            ];
            await this.runProcess(ffmpeg, videoOnly);
        }
        if (!fs.existsSync(outputPath)) {
            throw new Error('Video encode finished but output missing');
        }
        return { frameCount };
    }

    rmDirSafe(dir) {
        try {
            if (dir && fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn('[VideoEnhance] temp cleanup failed:', e.message);
        }
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     * @param {object} options
     * @param {(n:number, text?:string)=>void} onProgress
     */
    async enhanceVideo(inputPath, outputPath, options = {}, onProgress) {
        this.resetCancel();
        if (!inputPath || !fs.existsSync(inputPath)) {
            throw new Error('Input video does not exist');
        }
        if (!this.isVideoPath(inputPath)) {
            throw new Error('Not a supported video file');
        }

        const engineId = engineManager.normalizeEngineId(options.engineId || 'esrgan');
        const engine = engineManager.selectEngine(engineId);
        if (!engine) {
            throw new Error(`Unknown enhance engine: ${engineId}`);
        }

        const jobId = `vid_${Date.now()}`;
        const workDir = path.join(this.tempRoot, jobId);
        const framesIn = path.join(workDir, 'in');
        const framesOut = path.join(workDir, 'out');
        this.ensureDir(framesIn);
        this.ensureDir(framesOut);

        // Force mp4 output for MVP stability
        let finalOut = outputPath;
        if (!/\.mp4$/i.test(finalOut)) {
            finalOut = finalOut.replace(/\.[^/.]+$/, '') + '.mp4';
        }
        this.ensureDir(path.dirname(finalOut));

        try {
            if (onProgress) onProgress(2, 'Probing video…');
            const meta = await this.probe(inputPath);
            this.assertNotCancelled();
            const { scale, preScale } = this.parseLimits(meta, options);

            if (onProgress) onProgress(6, 'Extracting frames…');
            const frames = await this.extractFrames(inputPath, framesIn, meta, preScale);
            this.assertNotCancelled();

            const total = frames.length;
            if (onProgress) onProgress(10, `Enhancing ${total} frames…`);

            for (let i = 0; i < total; i++) {
                this.assertNotCancelled();
                const name = frames[i];
                const inFrame = path.join(framesIn, name);
                const outFrame = path.join(framesOut, name);
                // Prefer sequential %06d names
                const seqName = `frame_${String(i + 1).padStart(6, '0')}.png`;
                const outSeq = path.join(framesOut, seqName);

                await engineManager.enhanceWith(
                    engineId,
                    inFrame,
                    outSeq,
                    {
                        scale,
                        format: 'png',
                        performanceMode: options.performanceMode || 'balanced',
                        model: options.model,
                        denoise: options.denoise
                    },
                    () => {}
                );

                // Rename if engine wrote different name
                if (!fs.existsSync(outSeq) && fs.existsSync(outFrame)) {
                    fs.renameSync(outFrame, outSeq);
                }
                if (!fs.existsSync(outSeq)) {
                    throw new Error(`Enhanced frame missing: ${seqName}`);
                }

                const pct = 10 + Math.round(((i + 1) / total) * 75);
                if (onProgress) {
                    onProgress(pct, `Frame ${i + 1}/${total}`);
                }
            }

            this.assertNotCancelled();
            if (onProgress) onProgress(90, 'Encoding video…');
            await this.encodeVideo(framesOut, total, meta.fps, inputPath, finalOut);
            this.assertNotCancelled();
            if (onProgress) onProgress(100, 'Done');

            return {
                success: true,
                outputPath: finalOut,
                output: finalOut,
                kind: 'video',
                frames: total,
                fps: meta.fps,
                scale,
                duration: meta.duration
            };
        } finally {
            this.rmDirSafe(workDir);
            this._ffProc = null;
        }
    }
}

module.exports = new VideoEnhanceService();
module.exports.VIDEO_EXTS = VIDEO_EXTS;
module.exports.MAX_DURATION_SEC = MAX_DURATION_SEC;
module.exports.MAX_LONG_EDGE = MAX_LONG_EDGE;
module.exports.MAX_SCALE = MAX_SCALE;
