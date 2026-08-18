const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const binaries = require('./binaries');

const shouldLogBrandingFailures = process.env.NODE_ENV !== 'test';

function logBrandingFailure(level, ...args) {
    if (shouldLogBrandingFailures) {
        console[level](...args);
    }
}

/**
 * 视频后期处理：清洗元数据、注入首帧作为封面图
 * @param {string} filePath - 视频文件路径
 * @returns {Promise<boolean>} 是否处理成功
 */
async function postProcessVideo(filePath) {
    const ffmpegPath = binaries.getFfmpegPath();
    const tempVideo = `${filePath}.branding.mp4`;
    const tempCover = `${filePath}.cover.jpg`;

    try {
        logBrandingFailure('log', `[Branding] Starting post-process for ${path.basename(filePath)}`);

        // 1. 提取首帧作为封面 (在 0.5 秒处提取以避开可能的黑屏)
        spawnSync(ffmpegPath, [
            '-y', '-ss', '00:00:00.5', '-i', filePath,
            '-vframes', '1', '-q:v', '2', tempCover
        ], { windowsHide: true });

        if (!fs.existsSync(tempCover)) {
            logBrandingFailure('warn', '[Branding] Failed to extract cover, proceeding with metadata only.');
        }

        // 2. 注入封面 & 清洗元数据
        const args = ['-y', '-i', filePath];
        if (fs.existsSync(tempCover)) {
            args.push('-i', tempCover, '-map', '0', '-map', '1', '-disposition:v:1', 'attached_pic');
        } else {
            args.push('-map', '0');
        }


        // 动态获取版本号
        const packageJson = require('../../package.json');
        const appVersion = packageJson.version;

        args.push(
            '-vcodec', 'copy', '-acodec', 'copy',
            '-map_metadata', '-1', // 清洗所有原始元数据
            '-metadata:g', 'comment=Processed by MediaFlow',
            '-metadata:g', 'description=MediaFlow Video Toolkit',
            '-metadata:g', `software=MediaFlow v${appVersion}`,
            tempVideo
        );



        const result = spawnSync(ffmpegPath, args, { windowsHide: true });

        if (result?.status === 0 && fs.existsSync(tempVideo)) {
            try {
                fs.unlinkSync(filePath);
                fs.renameSync(tempVideo, filePath);
                logBrandingFailure('log', '[Branding] Brand injection successful.');
                return true;
            } catch (e) {
                logBrandingFailure('error', '[Branding] Final swap failed:', e.message);
            }
        } else {
            logBrandingFailure('warn', '[Branding] Metadata injection failed (FFmpeg error).');
        }
    } catch (e) {
        logBrandingFailure('error', '[Branding] Post-processing error:', e);
    } finally {
        if (fs.existsSync(tempCover)) {
            try {
                fs.unlinkSync(tempCover);
            } catch (cleanupError) {
                void cleanupError;
            }
        }
        if (fs.existsSync(tempVideo)) {
            try {
                fs.unlinkSync(tempVideo);
            } catch (cleanupError) {
                void cleanupError;
            }
        }
    }
    return false;
}

module.exports = {
    postProcessVideo
};
