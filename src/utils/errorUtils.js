// 错误消息映射表 - 将技术性错误转换为用户友好提示
const ERROR_PATTERNS = [
    // 非视频链接相关
    { pattern: /\[generic\]/i, message: '此链接不是支持的视频链接' },
    { pattern: /Unable to download webpage/i, message: '无法访问该链接，可能不是视频页面' },
    { pattern: /HTTP Error 401/i, message: '需要登录权限才能访问此链接' },
    { pattern: /HTTP Error 400/i, message: '请求无效，请检查链接格式' },
    { pattern: /is not a valid URL/i, message: '链接格式无效' },
    { pattern: /Unsupported URL/i, message: '不支持的链接格式' },
    { pattern: /Unsupported url scheme/i, message: '不支持的链接格式，请输入有效的视频链接' },

    // 视频不可用
    { pattern: /Video unavailable/i, message: '视频不可用，可能已被删除或设为私密' },
    { pattern: /Private video/i, message: '这是私密视频，无法下载' },
    { pattern: /Sign in to confirm your age/i, message: '此视频有年龄限制，需要登录才能观看' },
    { pattern: /This video is available to this channel's members/i, message: '这是会员专属视频，需要订阅才能观看' },
    { pattern: /copyright/i, message: '视频因版权问题无法下载' },
    { pattern: /blocked.*country/i, message: '此视频在您所在地区不可用' },
    { pattern: /geo.?restricted/i, message: '此视频有地区限制，无法在当前地区观看' },

    // HTTP 错误
    { pattern: /HTTP Error 403/i, message: '访问被拒绝 — 视频可能需要登录、有年龄限制或地区限制，请尝试同步浏览器 Cookie 后重试' },
    { pattern: /HTTP Error 404/i, message: '视频不存在或已被删除' },
    { pattern: /HTTP Error 429/i, message: '请求过于频繁，请稍后再试' },

    // 解析错误
    { pattern: /Unable to extract/i, message: '无法解析视频信息，链接可能无效' },
    { pattern: /No video formats/i, message: '未找到可下载的视频格式' },
    { pattern: /Failed to get video info/i, message: '无法获取视频信息' },
    { pattern: /Failed to parse/i, message: '解析视频信息失败' },

    // 网络错误
    { pattern: /Connection refused|Connection reset/i, message: '网络连接失败，请检查网络设置' },
    { pattern: /timed? ?out/i, message: '连接超时，请检查网络或稍后重试' },
    { pattern: /CERTIFICATE_VERIFY_FAILED/i, message: 'SSL证书验证失败，请检查网络设置' },

    // 权限限制
    { pattern: /Login required/i, message: '需要登录才能下载此内容' },
    { pattern: /Premieres in/i, message: '视频尚未发布（首播中）' },
    { pattern: /Live event will begin/i, message: '直播尚未开始' },
    { pattern: /members-only/i, message: '这是会员专属内容' },
    { pattern: /rate.?limit/i, message: '请求太频繁，请稍等几分钟后再试' },

    // 视频处理与本地系统相关 (FFmpeg / FS)
    { pattern: /No such file or directory/i, message: '文件不存在或已被删除，请重新检查文件路径' },
    { pattern: /Permission denied/i, message: '权限不足，无法访问或写入文件' },
    { pattern: /Output file already exists/i, message: '输出文件已存在，请更改保存名称' },
    { pattern: /Invalid data found when processing input/i, message: '视频文件损坏或格式不支持' },
    { pattern: /Out of memory/i, message: '系统内存不足，处理失败' },
    { pattern: /Disk full|No space left on device/i, message: '磁盘空间已满，无法保存视频' },
    { pattern: /Too many open files/i, message: '系统资源耗尽，请尝试重启软件' },
    { pattern: /Immediate exit/i, message: '用户已取消操作' }
];

/**
 * 将技术性错误转换为用户友好的提示
 */
function formatError(error, defaultMsg = '操作失败，请重试') {
    if (!error) return defaultMsg;

    const errorStr = String(error);

    // 检查是否匹配已知错误模式
    for (const { pattern, message } of ERROR_PATTERNS) {
        if (pattern.test(errorStr)) {
            return message;
        }
    }

    // 如果错误信息很长，尝试截取核心
    if (errorStr.length > 50) {
        // 尝试提取关键词之后的内容 (支持 FFmpeg 和 yt-dlp 风格)
        const errorMatch = errorStr.match(/(?:ERROR:|failed:|Error:)\s*(.+?)(?:\n|$)/i);
        if (errorMatch) {
            return errorMatch[1].substring(0, 100).trim();
        }
    }

    // 针对本地文件系统错误的特例处理
    if (errorStr.includes('ENOENT')) return '找不到指定的文件或目录';
    if (errorStr.includes('EACCES')) return '权限不足，无法访问此文件';

    return errorStr.length > 120 ? (errorStr.substring(0, 120) + '...') : errorStr;
}

/**
 * 获取友好的URL错误提示
 */
function getFriendlyUrlError(error) {
    if (!error) return '链接无法解析';
    const errorStr = String(error).toLowerCase();

    if (errorStr.includes('unsupported url') || errorStr.includes('not supported')) {
        return '不支持此类型链接';
    }
    if (errorStr.includes('video unavailable') || errorStr.includes('not available')) {
        return '视频不可用或已删除';
    }
    if (errorStr.includes('private') || errorStr.includes('sign in')) {
        return '私密视频，需要登录';
    }
    if (errorStr.includes('unable to extract')) {
        return '无法获取视频信息';
    }
    if (errorStr.includes('http error 404') || errorStr.includes('not found')) {
        return '视频不存在';
    }
    if (errorStr.includes('http error 403') || errorStr.includes('forbidden')) {
        return '无权访问此视频';
    }
    if (errorStr.includes('geo') || errorStr.includes('country')) {
        return '地区限制，无法访问';
    }

    return formatError(error);
}

// 导出模块
const ErrorUtils = {
    ERROR_PATTERNS,
    formatError,
    getFriendlyUrlError
};

// 支持 CommonJS 模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorUtils;
}

// 支持浏览器全局 (向后兼容)
if (typeof window !== 'undefined') {
    window.ErrorUtils = ErrorUtils;
}
