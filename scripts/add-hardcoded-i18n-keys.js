/**
 * Add locale keys needed to replace hardcoded Chinese UI strings.
 * node scripts/add-hardcoded-i18n-keys.js
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(rel) {
    return JSON.parse(
        fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '')
    );
}
function write(rel, data) {
    fs.writeFileSync(path.join(root, rel), JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function ensure(obj, parts, value) {
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (cur[last] === undefined) {
        cur[last] = value;
        return 1;
    }
    return 0;
}

function patchLang(lang, packs) {
    let n = 0;
    for (const [file, entries] of Object.entries(packs)) {
        const rel = `src/locales/${lang}/${file}`;
        const data = read(rel);
        for (const [dotted, value] of Object.entries(entries)) {
            n += ensure(data, dotted.split('.'), value);
        }
        write(rel, data);
    }
    return n;
}

const en = {
    'editor.json': {
        'editor.timelineEmpty': 'Timeline is empty',
        'editor.exportNotReady': 'Export pipeline is not ready yet',
        'editor.exportFailed': 'Export failed',
        'editor.exportAudioOk': 'Audio exported successfully',
        'editor.exportVideoOk': 'Video exported successfully',
        'editor.nothingToPlay':
            'Nothing to play (add clips to the timeline, or select video/audio in the library)',
        'editor.playFailed': 'Playback failed',
        'editor.pause': 'Pause',
        'editor.play': 'Play',
        'editor.pausePreview': 'Pause preview',
        'editor.playPreview': 'Play preview',
        'editor.lockTrack': 'Lock track',
        'editor.unlockTrack': 'Unlock track',
        'editor.trackHidden': 'Track is hidden.',
        'editor.trackSoloInactive': 'Track is inactive outside solo.'
    },
    'common.json': {
        'common.saveFailed': 'Save failed',
        'common.processing': 'Processing...',
        'common.processingPercent': 'Processing... {percent}%',
        'update.available': 'New version v{version} found. Preparing in the background...',
        'update.downloaded': 'New version v{version} is ready to install!',
        'update.restartAndInstall': 'Restart and update',
        'update.checking': 'Checking for updates...',
        'update.latest': 'Already up to date',
        'update.failed': 'Update check failed, try again later',
        'player.resolving': 'Resolving media URL...',
        'player.preparing': 'Preparing playback...',
        'player.loading': 'Loading...',
        'player.castError': 'Cast error: {message}',
        'player.unknownError': 'Unknown error',
        'player.imageLoadFailed': 'Image failed to load',
        'player.parsingLink': 'Parsing link...',
        'player.parseFailed': 'Parse failed: {error}',
        'player.unsupportedLink': 'Unsupported link',
        'player.parseError': 'Parse error: {error}',
        'player.hlsFatal': 'Playback failed: fatal HLS error',
        'player.hlsUnsupported': 'Playback failed: browser does not support HLS',
        'player.playbackFailed': 'Playback failed: {error}'
    },
    'download.json': {
        'download.fullLength': 'Full length',
        'download.clipDuration': 'Clip: {duration}',
        'download.parseListFailed': 'Failed to parse list'
    },
    'enhance.json': {
        'enhance.processingPercent': 'Processing... {percent}%',
        'enhance.errors.apiKeyMissing':
            'API key for {provider} is not configured. Add it in Settings.',
        'enhance.errors.unsupportedProvider': 'Unsupported cloud provider: {provider}',
        'enhance.errors.replicateFailed': 'Replicate failed: {error}',
        'enhance.errors.replicateRequestFailed': 'Replicate API request failed: {error}',
        'enhance.errors.falNoUrl': 'Fal.ai did not return a valid image URL',
        'enhance.errors.falFailed': 'Fal.ai API call failed: {error}',
        'enhance.errors.stabilityFailed': 'Stability AI failed: {error}',
        'enhance.errors.openaiNoUpscale':
            'OpenAI does not support Real-ESRGAN-style upscaling here. Use Replicate.',
        'enhance.errors.unzipFailed': 'Extract failed. Try unpacking the package manually.',
        'enhance.errors.engineMissing': '[{name}] engine binary missing: {exe}',
        'enhance.errors.cropFailed': 'Crop failed: {error}',
        'enhance.errors.noEngineConfig': 'No download config found for this engine'
    },
    'pixel.json': {
        'pixel.aiEnhancingPercent': 'AI enhance... {percent}%',
        'pixel.confirmDeletePreset': 'Delete preset "{name}"? This cannot be undone.'
    },
    'subtitle.json': {
        'toast.tts_auto_failed': 'Voice update failed',
        'subtitle.messages.trackFallback': 'Track {id}',
        'subtitle.messages.cueCount': '{count} cues',
        'subtitle.timeline.emptyHint': 'No subtitle data yet'
    },
    'tools.json': {
        'transcribe.errors.apiKeyMissing': 'API key is not set',
        'transcribe.errors.apiKeyMissingSettings':
            'API key is not set. Configure it in Settings.',
        'transcribe.errors.audioExtractTimeout':
            'Audio extract timed out (60s). Check if the source video is corrupt.',
        'transcribe.clipSelected': 'Clip selection ({start} - {end}) [{duration}s]',
        'transcribe.clipSelectedShort': 'Clip selected segments'
    }
};

const zh = {
    'editor.json': {
        'editor.timelineEmpty': '时间线为空',
        'editor.exportNotReady': '导出流程尚未就绪',
        'editor.exportFailed': '导出失败',
        'editor.exportAudioOk': '音频导出成功',
        'editor.exportVideoOk': '视频导出成功',
        'editor.nothingToPlay':
            '当前没有可播放内容（请把素材加入时间线，或在素材库选中视频/音频）',
        'editor.playFailed': '播放失败',
        'editor.pause': '暂停',
        'editor.play': '播放',
        'editor.pausePreview': '暂停预览',
        'editor.playPreview': '播放预览',
        'editor.lockTrack': '锁定轨道',
        'editor.unlockTrack': '解锁轨道',
        'editor.trackHidden': '轨道已隐藏。',
        'editor.trackSoloInactive': '轨道在独听之外未激活。'
    },
    'common.json': {
        'common.saveFailed': '保存失败',
        'common.processing': '处理中...',
        'common.processingPercent': '处理中... {percent}%',
        'update.available': '发现新版本 v{version}，正在后台为您准备...',
        'update.downloaded': '新版本 v{version} 已下载完成！',
        'update.restartAndInstall': '重启并更新',
        'update.checking': '正在检查更新...',
        'update.latest': '已是最新版本',
        'update.failed': '检查更新失败，请稍后再试',
        'player.resolving': '正在解析资源地址...',
        'player.preparing': '正在准备播放...',
        'player.loading': '加载资源...',
        'player.castError': '投屏错误: {message}',
        'player.unknownError': '未知错误',
        'player.imageLoadFailed': '图片加载失败',
        'player.parsingLink': '正在解析链接...',
        'player.parseFailed': '解析失败: {error}',
        'player.unsupportedLink': '不支持的链接',
        'player.parseError': '解析出错: {error}',
        'player.hlsFatal': '播放失败: HLS 解析致命错误',
        'player.hlsUnsupported': '播放失败: 浏览器不支持 HLS',
        'player.playbackFailed': '播放失败: {error}'
    },
    'download.json': {
        'download.fullLength': '全长下载',
        'download.clipDuration': '剪辑: {duration}',
        'download.parseListFailed': '解析列表失败'
    },
    'enhance.json': {
        'enhance.processingPercent': '处理中... {percent}%',
        'enhance.errors.apiKeyMissing': '未配置 {provider} 的 API Key，请前往设置页面添加。',
        'enhance.errors.unsupportedProvider': '不支持的云端供应商: {provider}',
        'enhance.errors.replicateFailed': 'Replicate 处理失败: {error}',
        'enhance.errors.replicateRequestFailed': 'Replicate API 请求失败: {error}',
        'enhance.errors.falNoUrl': 'Fal.ai 未返回有效的图片 URL',
        'enhance.errors.falFailed': 'Fal.ai API 调用失败: {error}',
        'enhance.errors.stabilityFailed': 'Stability AI 调用失败: {error}',
        'enhance.errors.openaiNoUpscale':
            'OpenAI 目前不直接支持类似 Real-ESRGAN 的超分模型，请使用 Replicate 驱动。',
        'enhance.errors.unzipFailed': '解压失败，请尝试手动解压下载的资源包。',
        'enhance.errors.engineMissing': '[{name}] 引擎执行文件缺失: {exe}',
        'enhance.errors.cropFailed': '裁剪失败: {error}',
        'enhance.errors.noEngineConfig': '未找到该引擎的下载配置'
    },
    'pixel.json': {
        'pixel.aiEnhancingPercent': 'AI 增强处理中... {percent}%',
        'pixel.confirmDeletePreset': '确定要删除预设 "{name}" 吗？此操作无法撤销。'
    },
    'subtitle.json': {
        'toast.tts_auto_failed': '配音更新失败',
        'subtitle.messages.trackFallback': '轨道 {id}',
        'subtitle.messages.cueCount': '{count} 条',
        'subtitle.timeline.emptyHint': '暂无字幕数据'
    },
    'tools.json': {
        'transcribe.errors.apiKeyMissing': 'API Key 未设置',
        'transcribe.errors.apiKeyMissingSettings':
            'API Key 未设置。请在设置中配置相应的 API Key。',
        'transcribe.errors.audioExtractTimeout':
            '音频提取超时 (60s)，请检查原视频是否损坏',
        'transcribe.clipSelected': '剪辑选中 ({start} - {end}) [{duration}s]',
        'transcribe.clipSelectedShort': '剪辑选中段落'
    }
};

const a = patchLang('en-US', en);
const b = patchLang('zh-CN', zh);
console.log('en-US new keys:', a, 'zh-CN new keys:', b);
