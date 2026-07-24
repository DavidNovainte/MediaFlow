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

    // 许可证操作（独立命名空间，从 video 迁移）
    license: {
        activate: (key) => ipcRenderer.invoke('license:activate', key),
        getStatus: () => ipcRenderer.invoke('license:status'),
        getHWID: () => ipcRenderer.invoke('license:getHWID'),
        validate: () => ipcRenderer.invoke('license:validate'),
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
        getPricingConfig: () => ipcRenderer.invoke('app:getPricingConfig'),
        fetchRemotePricing: () => ipcRenderer.invoke('app:fetchRemotePricing')
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

    // mobileflow removed in Community edition
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

    // creator removed in Community edition
    // audio removed in Community edition
// subtitle removed in Community edition
    // tts removed in Community edition
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

    // enhance removed in Community edition
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
