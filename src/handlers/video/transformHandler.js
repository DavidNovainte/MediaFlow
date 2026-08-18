/**
 * transformHandler - 画面转换处理器 (旋转、镜像、裁剪)
 */
const FFmpegRunner = require('./FFmpegRunner');
const binaries = require('../../utils/binaries');
const { spawnSync } = require('child_process');

/**
 * 获取视频信息（用于进度计算和默认参数）
 */
function getVideoInfo(input) {
    const ffmpegPath = binaries.getFfmpegPath();
    try {
        const result = spawnSync(ffmpegPath, ['-i', input], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const output = result.stderr || '';
        const durMatch = output.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
        const resMatch = output.match(/Stream #.*Video:.* (\d+)x(\d+)/);

        return {
            duration: durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : 0,
            width: resMatch ? parseInt(resMatch[1]) : 0,
            height: resMatch ? parseInt(resMatch[2]) : 0
        };
    } catch {
        return { duration: 0, width: 0, height: 0 };
    }
}

/**
 * 通用转换处理函数
 */
async function handleTransform(event, options) {
    const { input, output, type, value, taskId = 'default' } = options;
    if (!input || !output) return { success: false, error: 'Missing path' };

    const info = getVideoInfo(input);
    const encoder = await FFmpegRunner.getBestEncoder('h264');
    const isHW = encoder.includes('nvenc') || encoder.includes('qsv') || encoder.includes('amf');
    let filter = '';

    switch (type) {
    case 'rotate':
        // value: '0', '90' (CW), '270' (CCW), '180'
        if (value === '90') filter = 'transpose=1';
        else if (value === '270') filter = 'transpose=2';
        else if (value === '180') filter = 'transpose=1,transpose=1';
        break;
    case 'mirror':
        // value: 'h' (horizontal), 'v' (vertical), 'none'
        if (value === 'v') filter = 'vflip';
        else if (value === 'h') filter = 'hflip';
        break;
    case 'crop': {
        // value: '16:9', '9:16', '1:1'
        if (!info.width || !info.height) return { success: false, error: 'Cannot detect resolution' };
        const [rw, rh] = value.split(':').map(Number);
        const targetRatio = rw / rh;
        const currentRatio = info.width / info.height;

        if (currentRatio > targetRatio) {
            const tw = Math.round(info.height * targetRatio);
            filter = `crop=${tw}:${info.height}`;
        } else {
            const th = Math.round(info.width / targetRatio);
            filter = `crop=${info.width}:${th}`;
        }
        break;
    }
    }

    const args = ['-y', '-i', input];
    if (filter) {
        args.push('-vf', filter, '-c:v', encoder);
        if (isHW) args.push('-rc', 'vbr', '-cq', '23');
        args.push('-preset', 'medium');
    } else {
        // 🚀 不需要变换时，直接流拷贝（秒转）
        args.push('-c:v', 'copy');
    }
    args.push('-c:a', 'copy', output);

    let lastPercent = 0;
    return await FFmpegRunner.run(args, {
        taskId,
        onProgress: (str) => {
            if (info.duration > 0) {
                const timeMatch = str.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                if (timeMatch) {
                    const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                    const percent = Math.min(Math.floor((currentTime / info.duration) * 100), 99);
                    if (percent > lastPercent) {
                        lastPercent = percent;
                        if (event.sender && !event.sender.isDestroyed()) {
                            event.sender.send('transform:progress', { progress: lastPercent });
                        }
                    }
                }
            }
        }
    });
}

module.exports = { handleTransform };
