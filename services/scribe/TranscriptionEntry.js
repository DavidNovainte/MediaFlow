/**
 * MediaFlow - TranscriptionEntry
 * 音视频转录 - 核心入口与逻辑协调
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getFfmpegPath } = require('../../src/utils/binaries');

// 导入其他专业模块
const localEngine = require('./LocalWhisperEngine');
const cloudEngine = require('./CloudWhisperEngine');

class TranscriptionEntry {
    constructor() { }

    /**
     * 提取音频 / 压缩音频
     */
    async extractAudio(inputPath, outputPath, options = {}) {
        const ffmpegPath = getFfmpegPath();
        if (!ffmpegPath) throw new Error('FFmpeg binary not found');

        return new Promise((resolve, reject) => {
            const startTime = Number(options.startTime);
            const duration = Number(options.duration);
            const args = [
                '-y'
            ];

            if (Number.isFinite(startTime) && startTime > 0) {
                args.push('-ss', startTime.toString());
            }

            args.push('-i', inputPath);

            if (Number.isFinite(duration) && duration > 0) {
                args.push('-t', duration.toString());
            }

            args.push(
                '-vn',
                '-acodec', 'libmp3lame',
                '-q:a', '2', // ~192kbps (更高质量利于 ASR)
                outputPath
            );
            const proc = spawn(ffmpegPath, args, { windowsHide: true });

            const timeout = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error('Audio extract timed out (60s). Check if the source video is corrupt.'));
            }, 60000);

            proc.stderr.on('data', () => { });
            proc.stdout.on('data', () => { });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exited with code ${code}`));
            });
            proc.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /**
     * 转录音频文件 (Main Entry Point)
     */
    async transcribe(filePath, options = {}) {
        const { onProgress = () => { }, mode = 'cloud' } = options;

        // 如果是本地模式，直接跳转
        if (mode === 'local') {
            return localEngine.transcribeLocal(filePath, options);
        }

        let finalPath = filePath;
        let isTempAudio = false;
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'].includes(path.extname(filePath).toLowerCase());

        try {
            if (isVideo) {
                console.log('[TranscriptionEntry] Extracting audio to temp...');
                onProgress(2);
                const tempAudio = path.join(os.tmpdir(), `mediaflow_v_${Date.now()}.mp3`);
                await this.extractAudio(filePath, tempAudio, options);
                finalPath = tempAudio;
                isTempAudio = true;
                onProgress(10);
            }

            const stats = fs.statSync(finalPath);
            const fileSizeInBytes = stats.size;
            const maxSizeInBytes = 24 * 1024 * 1024; // 24MB API limit

            let result;
            if (fileSizeInBytes > maxSizeInBytes) {
                console.log('[TranscriptionEntry] File large, using chunking...');
                result = await this.transcribeWithChunking(finalPath, options);
            } else {
                result = await cloudEngine.transcribeSingle(finalPath, options);
            }

            if (isTempAudio && fs.existsSync(finalPath)) {
                try { fs.unlinkSync(finalPath); } catch (_) { }
            }
            return result;

        } catch (e) {
            console.error('[TranscriptionEntry] Error:', e);
            if (isTempAudio && finalPath && fs.existsSync(finalPath)) {
                try { fs.unlinkSync(finalPath); } catch (_) { }
            }
            return { success: false, error: e.message };
        }
    }

    /**
     * Split audio into chunks
     */
    async splitAudio(inputPath, outputDir, segmentTime = 600) {
        const ffmpegPath = getFfmpegPath();
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const pattern = path.join(outputDir, 'segment_%03d.mp3');

        return new Promise((resolve, reject) => {
            const args = [
                '-y', '-i', inputPath,
                '-vn', '-f', 'segment',
                '-segment_time', String(segmentTime),
                '-c:a', 'libmp3lame',
                '-b:a', '128k',
                pattern
            ];
            const proc = spawn(ffmpegPath, args);
            proc.stderr.on('data', () => { });
            proc.stdout.on('data', () => { });
            proc.on('close', (code) => {
                if (code === 0) {
                    const files = fs.readdirSync(outputDir)
                        .filter(f => f.startsWith('segment_') && f.endsWith('.mp3'))
                        .sort()
                        .map(f => path.join(outputDir, f));
                    resolve(files);
                } else {
                    reject(new Error(`FFmpeg split failed with code ${code}`));
                }
            });
            proc.on('error', reject);
        });
    }

    /**
     * Transcribe large file by chunking
     */
    async transcribeWithChunking(filePath, options) {
        const { onProgress = () => { } } = options;
        const tempDir = path.join(os.tmpdir(), `mediaflow_chunks_${Date.now()}`);

        try {
            onProgress(5);
            const chunks = await this.splitAudio(filePath, tempDir, 600);

            let combinedText = '';
            let combinedSegments = [];
            let totalDuration = 0;

            for (let i = 0; i < chunks.length; i++) {
                const chunkResult = await cloudEngine.transcribeSingle(chunks[i], {
                    ...options,
                    onProgress: (p) => {
                        const slotSize = 90 / chunks.length;
                        const globalP = 10 + (i * slotSize) + (p / 100 * slotSize);
                        onProgress(globalP);
                    }
                });

                if (!chunkResult.success) throw new Error(`Chunk ${i + 1} failed: ${chunkResult.error}`);

                const offset = totalDuration;
                const fixedSegments = (chunkResult.segments || []).map(seg => ({
                    ...seg,
                    start: seg.start + offset,
                    end: seg.end + offset
                }));

                combinedSegments.push(...fixedSegments);
                combinedText += (combinedText ? ' ' : '') + (chunkResult.text || '');
                totalDuration += 600; // 必须使用固定的分段步进，而非 API 返回值，防止漂移累计
            }

            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { }
            onProgress(100);

            return {
                success: true,
                text: combinedText.trim(),
                segments: combinedSegments,
                language: 'auto',
                duration: totalDuration
            };
        } catch (error) {
            if (fs.existsSync(tempDir)) {
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { }
            }
            return { success: false, error: error.message };
        }
    }
}

module.exports = new TranscriptionEntry();
