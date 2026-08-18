/**
 * MediaFlow - MediaStreamManager
 * 手机互联 - 媒体流与转码引擎
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getFfmpegPath } = require('../../src/utils/binaries');

class MediaStreamManager {
    constructor() {
        this.mimeTypes = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.m4v': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml'
        };
    }

    /**
     * 获取文件路径 (通过注入的 FileBrowseManager)
     */
    getFilePath(fileId, fileBrowseManager) {
        return fileBrowseManager.getFilePathById(fileId);
    }

    /**
     * 挂载流媒体相关路由
     */
    mountRoutes(app, fileBrowseManager) {
        // 文件下载 (PC -> Phone)
        app.get('/download/:fileId', (req, res) => {
            const filePath = this.getFilePath(req.params.fileId, fileBrowseManager);
            if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('文件不存在');

            const ext = path.extname(filePath).toLowerCase();
            const stat = fs.statSync(filePath);
            const contentType = this.mimeTypes[ext] || 'application/octet-stream';
            // 手机兼容性处理: 使用 ascii 文件名
            const safeFileName = `mediaflow_export${ext}`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
            fs.createReadStream(filePath).pipe(res);
        });

        // 兼容模式流媒体 (实时转码 H.264)
        app.get('/stream-compatible/:fileId', (req, res) => {
            const filePath = this.getFilePath(req.params.fileId, fileBrowseManager);
            const { start } = req.query;

            if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('文件不存在');

            let ffmpegPath;
            try { ffmpegPath = getFfmpegPath(); } catch (e) {
                return res.status(500).send('Internal Server Error: FFmpeg missing');
            }

            res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' });

            const args = [
                '-i', filePath,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
                '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
                '-f', 'mp4',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                'pipe:1'
            ];
            if (start) args.unshift('-ss', String(start));

            const ffmpegProcess = spawn(ffmpegPath, args);
            ffmpegProcess.stdout.pipe(res);
            req.on('close', () => {
                ffmpegProcess.kill();
                console.log('[MobileFlow:Stream] Transcode session closed');
            });
        });

        // 标准流媒体播放 (Range 支持)
        app.get('/stream/:fileId', (req, res) => {
            const filePath = this.getFilePath(req.params.fileId, fileBrowseManager);
            if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('文件不存在');

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            const ext = path.extname(filePath).toLowerCase();
            const contentType = this.mimeTypes[ext] || 'application/octet-stream';

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': contentType,
                });
                file.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': contentType,
                    'Accept-Ranges': 'bytes',
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
    }
}

module.exports = new MediaStreamManager();
