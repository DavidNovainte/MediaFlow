/**
 * clipHandler - 视频剪辑处理器
 * 处理 video:clip IPC 调用
 */

const FFmpegRunner = require('./FFmpegRunner');

/**
 * 视频剪辑（单段）
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} options
 * @param {string} options.input - 输入文件路径
 * @param {string} options.output - 输出文件路径
 * @param {number} options.startTime - 开始时间（秒）
 * @param {number} options.endTime - 结束时间（秒）
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
async function handleClip(event, options) {
    const { input, output, startTime, endTime } = options;

    if (!input || !output) {
        return { success: false, error: 'Missing input or output path' };
    }

    try {
        const duration = endTime - startTime;
        const isGif = output.toLowerCase().endsWith('.gif');
        const args = ['-y'];

        if (isGif) {
            // GIF 导出逻辑
            args.push('-ss', String(startTime));
            args.push('-t', String(duration));
            args.push('-i', input);
            args.push('-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse');
            args.push(output);
        } else if (options.accurate) {
            // 精准剪辑逻辑 (重编码，分秒不差)
            // 先快搜到关键帧附近，再进行精准切
            args.push('-ss', String(Math.max(0, startTime - 10)));
            args.push('-i', input);
            args.push('-ss', String(startTime - Math.max(0, startTime - 10)));
            args.push('-t', String(duration));
            args.push('-c:v', 'libx264');
            args.push('-preset', 'ultrafast');
            args.push('-crf', '22');
            args.push('-c:a', 'aac');
            args.push(output);
        } else {
            // 极速剪辑逻辑 (流复制，存在关键帧偏移风险)
            args.push('-ss', String(startTime));
            args.push('-i', input);
            args.push('-t', String(duration));
            args.push('-c', 'copy');
            args.push('-avoid_negative_ts', 'make_zero');
            args.push(output);
        }

        const result = await FFmpegRunner.run(args);

        if (result.success) {
            return { success: true, output };
        } else {
            console.error('[video:clip] FFmpeg error:', result.error);
            return { success: false, error: `FFmpeg exited with code ${result.code}` };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { handleClip };
