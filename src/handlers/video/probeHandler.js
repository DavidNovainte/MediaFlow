/**
 * probeHandler - 视频信息探测处理器
 * 处理 video:probe IPC 调用
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const binaries = require('../../utils/binaries');

/**
 * 获取视频详细信息
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} filePath - 视频文件路径
 * @returns {Promise<{success: boolean, info?: Object, error?: string}>}
 */
async function handleProbe(event, filePath) {
    if (!filePath) {
        return { success: false, error: 'Missing file path' };
    }

    try {
        const ffprobePath = binaries.getFfprobePath();

        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            filePath
        ]);

        const info = JSON.parse(stdout);
        return { success: true, info };
    } catch (error) {
        console.error('[video:probe] Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { handleProbe };
