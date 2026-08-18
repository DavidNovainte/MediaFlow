/**
 * MediaFlow - 预加载脚本
 * 暴露安全的 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('mediaflow', {
    // 窗口控制
    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
        setSize: (width, height) => ipcRenderer.send('window:setSize', { width, height }),
        getSize: () => ipcRenderer.invoke('window:getSize'),
        setTitle: (title) => ipcRenderer.send('window:setTitle', title)
    },

    // 路径处理 (通过 IPC 调用主进程)
    path: {
        dirname: (p) => ipcRenderer.invoke('path:dirname', p),
        basename: (p, ext) => ipcRenderer.invoke('path:basename', p, ext),
        extname: (p) => ipcRenderer.invoke('path:extname', p),
        join: (...args) => ipcRenderer.invoke('path:join', ...args)
    },

    // 文件系统操作
    fs: {
        mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
        stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
        readAsDataUrl: (filePath) => ipcRenderer.invoke('fs:readAsDataUrl', filePath),
        delete: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
        copyFile: (sourcePath, targetPath) => ipcRenderer.invoke('fs:copyFile', sourcePath, targetPath),
        readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
        readFileBuffer: (filePath) => ipcRenderer.invoke('fs:readFileBuffer', filePath),
        writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
        writeFileBuffer: (filePath, buffer) => ipcRenderer.invoke('fs:writeFileBuffer', filePath, buffer),
    },

    // File operations wrapper
    file: {
        deleteFile: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
        scanVideo: (folder) => ipcRenderer.invoke('file:scan-video', folder)
    },


    // 视频操作
    video: {
        getInfo: (url) => ipcRenderer.invoke('video:getInfo', url),
        getPlaylistInfo: (url) => ipcRenderer.invoke('video:getPlaylistInfo', url),
        download: (options) => ipcRenderer.invoke('video:download', options),
        testProxy: (config) => ipcRenderer.invoke('video:testProxy', config),
        cancelDownload: (id) => ipcRenderer.send('video:cancelDownload', id),
        onProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('download:progress', listener);
            return () => ipcRenderer.removeListener('download:progress', listener);
        },
        onWarning: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('download:warning', listener);
            return () => ipcRenderer.removeListener('download:warning', listener);
        },
        onCompressProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('video:compressProgress', listener);
            // 返回清理函数
            return () => ipcRenderer.removeListener('video:compressProgress', listener);
        },
        onVerticalProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('vertical:progress', listener);
            return () => ipcRenderer.removeListener('vertical:progress', listener);
        },
        onConvertProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('convert:progress', listener);
            return () => ipcRenderer.removeListener('convert:progress', listener);
        },
        onMergeProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('merge:progress', listener);
            return () => ipcRenderer.removeListener('merge:progress', listener);
        },
        onProtocolAction: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('protocol:action', listener);
            return () => ipcRenderer.removeListener('protocol:action', listener);
        },
        // 剪贴板视频链接事件 (ClipboardWatcher -> 渲染进程)
        onClipboardUrl: (callback) => {
            const listener = (event, url) => callback(url);
            ipcRenderer.on('clipboard:videoUrl', listener);
            return () => ipcRenderer.removeListener('clipboard:videoUrl', listener);
        },
        // License 已迁移到独立 license 命名空间（见下方）

        // Video Processing
        clip: (options) => ipcRenderer.invoke('video:clip', options),
        probe: (filePath) => ipcRenderer.invoke('video:probe', filePath),
        makeVertical: (options) => ipcRenderer.invoke('video:makeVertical', options),
        merge: (options) => ipcRenderer.invoke('video:merge', options),
        compress: (options) => ipcRenderer.invoke('video:compress', options),
        convert: (options) => ipcRenderer.invoke('video:convert', options),
        multiClip: (options) => ipcRenderer.invoke('video:multiClip', options),
        extractAudio: (input) => ipcRenderer.invoke('video:extractAudio', input),
        removeAudio: (options) => ipcRenderer.invoke('video:removeAudio', options),
        watermark: (options) => ipcRenderer.invoke('video:watermark', options),

        // 变速/截帧/GIF
        changeSpeed: (options) => ipcRenderer.invoke('video:changeSpeed', options),
        extractFrame: (options) => ipcRenderer.invoke('video:extractFrame', options),
        createGIF: (options) => ipcRenderer.invoke('video:createGIF', options),
        onSpeedProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('speed:progress', listener);
            return () => ipcRenderer.removeListener('speed:progress', listener);
        },
        onGIFProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('gif:progress', listener);
            return () => ipcRenderer.removeListener('gif:progress', listener);
        },

        // 画面转换 (旋转/镜像/裁剪)
        transform: (options) => ipcRenderer.invoke('video:transform', options),
        onTransformProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('transform:progress', listener);
            return () => ipcRenderer.removeListener('transform:progress', listener);
        },

        cancel: () => ipcRenderer.send('video:cancel'),
        cancelCompression: () => ipcRenderer.send('video:cancel')
    },

    // 系统操作
    shell: {
        openPath: (path) => ipcRenderer.send('shell:openPath', path),
        showItemInFolder: (path) => ipcRenderer.send('shell:showItemInFolder', path),
        openExtensionFolder: () => ipcRenderer.send('shell:openExtensionFolder'),
        openExternal: (url) => ipcRenderer.send('shell:openExternal', url),
        fileExists: (path) => ipcRenderer.invoke('shell:fileExists', path)
    },

    // 对话框
    dialog: {
        selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
        saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
        openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
        showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options)
    },



    // 存储操作
    store: {
        get: (key, defaultValue) => ipcRenderer.invoke('store:get', key, defaultValue),
        set: (key, value) => ipcRenderer.invoke('store:set', key, value)
    },

    // 应用信息
    app: {
        platform: process.platform,
        getLocale: () => ipcRenderer.invoke('app:getLocale'),
        getTempPath: () => ipcRenderer.invoke('app:getTempPath'),
        getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),
        getVersion: () => ipcRenderer.invoke('app:getVersion'),
        isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
        generateQr: (text) => ipcRenderer.invoke('app:generateQr', text)
    },


    // 系统维护 (存储清理)
    system: {
        getStorageStats: () => ipcRenderer.invoke('system:getStorageStats'),
        cleanup: () => ipcRenderer.invoke('system:cleanup'),
        getFonts: () => ipcRenderer.invoke('system:getFonts'),
        openModelsDir: () => ipcRenderer.send('system:openModelsDir'),
        openLogsDir: () => ipcRenderer.invoke('system:openLogsDir'),
        reportError: (data) => ipcRenderer.invoke('system:reportError', data),
        getBinaryStatus: () => ipcRenderer.invoke('system:getBinaryStatus')
    },

    // 国际化
    i18n: {
        readLocale: (lang) => ipcRenderer.invoke('i18n:readLocale', lang)
    },

    // 🆕 系统通知
    notification: {
        show: (options) => ipcRenderer.invoke('notification:show', options)
    },

    // 下载核心引擎
    downloader: {
        check: () => ipcRenderer.invoke('downloader:check')
    },

    // ScribeFlow - 转录服务
    transcribe: {
        setApiKey: (apiKey) => ipcRenderer.invoke('transcribe:setApiKey', apiKey),
        start: (filePath, options) => ipcRenderer.invoke('transcribe:start', filePath, options),
        startLocal: (filePath, options) => ipcRenderer.invoke('transcribe:startLocal', filePath, options),
        cancel: () => ipcRenderer.invoke('transcribe:cancel'),
        checkLocalEnv: () => ipcRenderer.invoke('transcribe:checkLocalEnv'),
        onProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('transcribe:progress', listener);
            return () => ipcRenderer.removeListener('transcribe:progress', listener);
        },
        translate: (text, targetLang) => ipcRenderer.invoke('transcribe:translate', text, targetLang),
        exportSRT: (segments) => ipcRenderer.invoke('transcribe:exportSRT', segments),
        exportBilingualSRT: (segments, translations) => ipcRenderer.invoke('transcribe:exportBilingualSRT', segments, translations),
        exportText: (segments, includeTimestamps) => ipcRenderer.invoke('transcribe:exportText', segments, includeTimestamps),
        getDownloadedModels: () => ipcRenderer.invoke('transcribe:getDownloadedModels'),
        deleteModel: (modelId) => ipcRenderer.invoke('transcribe:deleteModel', modelId),
        downloadModel: (modelName) => ipcRenderer.invoke('transcribe:downloadModel', modelName),
        getSherpaModelStatus: () => ipcRenderer.invoke('transcribe:getSherpaModelStatus'),
        downloadSherpaModels: () => ipcRenderer.invoke('transcribe:downloadSherpaModels'),
        onSherpaModelProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('transcribe:sherpaModelProgress', listener);
            return () => ipcRenderer.removeListener('transcribe:sherpaModelProgress', listener);
        },
        exportZip: (files) => ipcRenderer.invoke('transcribe:exportZip', files),
        // AI 字幕优化功能
        polish: (segments, options) => ipcRenderer.invoke('transcribe:polish', segments, options),
        summarize: (segments, options) => ipcRenderer.invoke('transcribe:summarize', segments, options),
        translateBatch: (text, languages, options) => ipcRenderer.invoke('transcribe:translateBatch', text, languages, options),
        onTranslateBatchProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('transcribe:translateBatchProgress', listener);
            return () => ipcRenderer.removeListener('transcribe:translateBatchProgress', listener);
        }
    },

    // Translation - 多提供商翻译服务
    translation: {
        getProviders: () => ipcRenderer.invoke('translation:getProviders'),
        setKeys: (provider, keys, accountId) => ipcRenderer.invoke('translation:setKeys', provider, keys, accountId),
        setModel: (provider, model) => ipcRenderer.invoke('translation:setModel', provider, model),
        setDefaultProvider: (provider) => ipcRenderer.invoke('translation:setDefaultProvider', provider),
        translate: (text, targetLang, provider) => ipcRenderer.invoke('translation:translate', text, targetLang, provider),
        testConnection: (provider) => ipcRenderer.invoke('translation:testConnection', provider)
    },

    // PixelFlow - 图片压缩服务（含压缩内 AI 超分；独立 Enhance 页仍为 Pro 产品）
    compress: {
        single: (inputPath, outputPath, options) => ipcRenderer.invoke('compress:single', inputPath, outputPath, options),
        batch: (files, outputDir, options) => ipcRenderer.invoke('compress:batch', files, outputDir, options),
        preview: (inputPath, options) => ipcRenderer.invoke('compress:preview', inputPath, options),
        getInfo: (filePath) => ipcRenderer.invoke('compress:getInfo', filePath),
        /** AI upscale used by PixelFlow preview/pipeline (Community-safe; no enhance page) */
        aiUpscale: (inputPath, options) => ipcRenderer.invoke('compress:aiUpscale', inputPath, options),
        getAiEngineStatus: () => ipcRenderer.invoke('compress:getAiEngineStatus'),
        downloadAiEngine: (engineId) => ipcRenderer.invoke('compress:downloadAiEngine', engineId),
        onProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('compress:progress', listener);
            return () => ipcRenderer.removeListener('compress:progress', listener);
        },
        onAiUpscaleProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('compress:aiUpscaleProgress', listener);
            return () => ipcRenderer.removeListener('compress:aiUpscaleProgress', listener);
        },
        onAiEngineDownloadProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('compress:aiEngineDownloadProgress', listener);
            return () => ipcRenderer.removeListener('compress:aiEngineDownloadProgress', listener);
        }
    },

    // MobileFlow - 手机互联服务
    mobileflow: {
        start: (port) => ipcRenderer.invoke('mobileflow:start', port),
        stop: () => ipcRenderer.invoke('mobileflow:stop'),
        setPin: (pin) => ipcRenderer.invoke('mobileflow:setPin', pin),
        getRemoteQR: (ip) => ipcRenderer.invoke('mobileflow:getRemoteQR', ip),
        getFileQR: (filePath) => ipcRenderer.invoke('mobileflow:getFileQR', filePath),
        getPendingUrls: () => ipcRenderer.invoke('mobileflow:getPendingUrls'),
        onUrlReceived: (callback) => {
            const listener = (event, url) => callback(url);
            ipcRenderer.on('mobileflow:urlReceived', listener);
            return () => ipcRenderer.removeListener('mobileflow:urlReceived', listener);
        },
        openPlayer: (data) => ipcRenderer.invoke('mobileflow:openPlayer', data),
        sendPlayerCommand: (command) => ipcRenderer.invoke('mobileflow:playerCommand', command)
    },

    // 播放器监听 (独立窗口用)
    player: {
        onPlay: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('player:play', listener);
            return () => ipcRenderer.removeListener('player:play', listener);
        },
        onCommand: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('player:command', listener);
            return () => ipcRenderer.removeListener('player:command', listener);
        }
    },

    // 剪贴板监听
    clipboard: {
        getEnabled: () => ipcRenderer.invoke('clipboard:getEnabled'),
        setEnabled: (enabled) => ipcRenderer.invoke('clipboard:setEnabled', enabled),
        getDetectMode: () => ipcRenderer.invoke('clipboard:getDetectMode'),
        setDetectMode: (mode) => ipcRenderer.invoke('clipboard:setDetectMode', mode),
        copyFiles: (filePaths) => ipcRenderer.invoke('clipboard:copyFiles', filePaths),
        onVideoUrl: (callback) => {
            const listener = (event, url) => callback(url);
            ipcRenderer.on('clipboard:videoUrl', listener);
            return () => ipcRenderer.removeListener('clipboard:videoUrl', listener);
        }
    },

    // PixelFlow - 图片工具服务 & Proxy
    image: {
        proxy: (url) => ipcRenderer.invoke('image:proxy', url),
        removeBackground: (inputPath, outputPath, options) => ipcRenderer.invoke('image:remove-bg', inputPath, outputPath, options),
        getInfo: (filePath) => ipcRenderer.invoke('compress:getInfo', filePath)
    },

    // CreatorFlow - 视频工具服务
    creator: {
        detectSilence: (filePath, options) => ipcRenderer.invoke('creator:detectSilence', filePath, options),
        removeSilence: (filePath, segments, options) => ipcRenderer.invoke('creator:removeSilence', filePath, segments, options),
        cancel: (taskId) => ipcRenderer.invoke('creator:cancelTask', taskId),
        mix: (options) => ipcRenderer.invoke('creator:mix', options),
        mixMultiple: (options) => ipcRenderer.invoke('creator:mixMultiple', options),
        export: (job) => ipcRenderer.invoke('creator:export', job),
        onProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('creator:progress', listener);
            // Return cleanup function
            return () => ipcRenderer.removeListener('creator:progress', listener);
        }
    },

    // AudioFlow - 音频处理服务
    audio: {
        // FFmpeg 降噪
        denoise: (options) => ipcRenderer.invoke('audio:denoise', options),
        getDenoisePresets: () => ipcRenderer.invoke('audio:getDenoisePresets'),
        cancelDenoise: () => ipcRenderer.send('audio:cancelDenoise'),
        onDenoiseProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('denoise:progress', listener);
            return () => ipcRenderer.removeListener('denoise:progress', listener);
        },

        // DeepFilterNet AI
        deepfilter: (options) => ipcRenderer.invoke('audio:deepfilter', options),
        cancelDeepFilter: () => ipcRenderer.send('audio:cancelDeepFilter'),
        isDeepFilterAvailable: () => ipcRenderer.invoke('audio:isDeepFilterAvailable'),
        onDeepFilterProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('deepfilter:progress', listener);
            return () => ipcRenderer.removeListener('deepfilter:progress', listener);
        },

        // 云端 API
        apiEnhance: (options) => ipcRenderer.invoke('audio:apiEnhance', options),
        setApiConfig: (config) => ipcRenderer.invoke('audio:setApiConfig', config),
        getApiConfig: () => ipcRenderer.invoke('audio:getApiConfig'),
        isApiConfigured: () => ipcRenderer.invoke('audio:isApiConfigured'),
        onApiEnhanceProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('apienhance:progress', listener);
            return () => ipcRenderer.removeListener('apienhance:progress', listener);
        },

        // 模型管理
        getModelsStatus: () => ipcRenderer.invoke('audio:getModelsStatus'),
        downloadModel: (modelId) => ipcRenderer.invoke('audio:downloadModel', modelId),
        deleteModel: (modelId) => ipcRenderer.invoke('audio:deleteModel', modelId),
        onModelDownloadProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('model:downloadProgress', listener);
            return () => ipcRenderer.removeListener('model:downloadProgress', listener);
        },

        // Demucs 人声分离
        demucsCheck: () => ipcRenderer.invoke('audio:demucsCheck'),
        demucsInstall: () => ipcRenderer.invoke('audio:demucsInstall'),
        demucsSeparate: (options) => ipcRenderer.invoke('audio:demucsSeparate', options),
        demucsSave: (data) => ipcRenderer.invoke('audio:demucsSave', data),
        demucsCancel: () => ipcRenderer.send('audio:demucsCancel'),
        onDemucsProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('demucs:progress', listener);
            return () => ipcRenderer.removeListener('demucs:progress', listener);
        },
        onDemucsInstallProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('demucs:installProgress', listener);
            return () => ipcRenderer.removeListener('demucs:installProgress', listener);
        },

        // 统一取消
        cancel: () => ipcRenderer.send('audio:cancel')
    },

    // Subtitle Flow
    subtitle: {
        burn: (options) => ipcRenderer.invoke('subtitle:burn', options),
        cancel: () => ipcRenderer.invoke('subtitle:cancel'),
        parseSrt: (content) => ipcRenderer.invoke('subtitle:parse-srt', content),
        getVideoInfo: (filePath) => ipcRenderer.invoke('subtitle:get-video-info', filePath),
        onBurnProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('subtitle:burn-progress', listener);
            return () => ipcRenderer.removeListener('subtitle:burn-progress', listener);
        }
    },

    // TTS - 文字转语音
    tts: {
        getVoices: (options) => ipcRenderer.invoke('tts:voices', options),
        checkEdge: () => ipcRenderer.invoke('tts:edgeCheck'),
        installEdge: () => ipcRenderer.invoke('tts:edgeInstall'),
        generate: (options) => ipcRenderer.invoke('tts:generate', options),
        preview: (options) => ipcRenderer.invoke('tts:preview', options),
        generateFullAudio: (options) => ipcRenderer.invoke('tts:generateFullAudio', options),
        stop: () => ipcRenderer.send('tts:stop'),
        onProgress: (callback) => {
            const listener = (event, data) => callback(null, data);
            ipcRenderer.on('tts:progress', listener);
            return () => ipcRenderer.removeListener('tts:progress', listener);
        },
        onEdgeInstallProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('tts:edgeInstallProgress', listener);
            return () => ipcRenderer.removeListener('tts:edgeInstallProgress', listener);
        }
    },

    // PiP 画中画
    pip: {
        open: (options) => ipcRenderer.invoke('pip:open', options),
        onClosed: (callback) => {
            const listener = () => callback();
            ipcRenderer.on('pip:closed', listener);
            return () => ipcRenderer.removeListener('pip:closed', listener);
        }
    },

    // 自动更新
    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        quitAndInstall: () => ipcRenderer.send('updater:quit-and-install'),
        onAvailable: (callback) => {
            const listener = (event, info) => callback(info);
            ipcRenderer.on('updater:available', listener);
            return () => ipcRenderer.removeListener('updater:available', listener);
        },
        onDownloaded: (callback) => {
            const listener = (event, info) => callback(info);
            ipcRenderer.on('updater:downloaded', listener);
            return () => ipcRenderer.removeListener('updater:downloaded', listener);
        },
        onError: (callback) => {
            const listener = (event, err) => callback(err);
            ipcRenderer.on('updater:error', listener);
            return () => ipcRenderer.removeListener('updater:error', listener);
        }
    },

    // 🆕 AI 画质增强
    enhance: {
        getEngines: () => ipcRenderer.invoke('enhance:getEngines'),
        getEngineOptions: (engineId) => ipcRenderer.invoke('enhance:getEngineOptions', engineId),
        image: (inputPath, outputPath, options) => ipcRenderer.invoke('enhance:image', inputPath, outputPath, options),
        video: (inputPath, outputPath, options) => ipcRenderer.invoke('enhance:video', inputPath, outputPath, options),
        probeVideo: (inputPath) => ipcRenderer.invoke('enhance:probeVideo', inputPath),
        preview: (inputPath, options) => ipcRenderer.invoke('enhance:preview', inputPath, options),
        batch: (inputPaths, outputDir, options) => ipcRenderer.invoke('enhance:batch', inputPaths, outputDir, options),
        downloadEngine: (engineId) => ipcRenderer.invoke('enhance:downloadEngine', engineId),
        cancel: () => ipcRenderer.send('enhance:cancel'),
        cleanup: () => ipcRenderer.invoke('enhance:cleanup'),
        onProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('enhance:progress', listener);
            return () => ipcRenderer.removeListener('enhance:progress', listener);
        },
        onBatchProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('enhance:batchProgress', listener);
            return () => ipcRenderer.removeListener('enhance:batchProgress', listener);
        },
        onFileComplete: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('enhance:fileComplete', listener);
            return () => ipcRenderer.removeListener('enhance:fileComplete', listener);
        }
    },
    // 核心引擎组件管理
    engine: {
        getDetailedStatus: () => ipcRenderer.invoke('engine:getDetailedStatus'),
        checkUpdates: () => ipcRenderer.invoke('engine:checkUpdates'),
        performUpdate: (component) => ipcRenderer.invoke('engine:performUpdate', component),
        onUpdateProgress: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('engine:updateProgress', listener);
            return () => ipcRenderer.removeListener('engine:updateProgress', listener);
        }
    },
    // 日志系统 (通过 IPC 转发)
    log: {
        info: (msg) => ipcRenderer.send('log:info', msg),
        warn: (msg) => ipcRenderer.send('log:warn', msg),
        error: (msg) => ipcRenderer.send('log:error', msg),
        ffmpeg: (cmd, stderr) => ipcRenderer.send('log:ffmpeg', cmd, stderr)
    }
});

// 安全提醒: electronAPI 已移除，所有 IPC 调用必须通过 mediaflow 命名空间
