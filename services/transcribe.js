/**
 * MediaFlow - Transcribe Service (ScribeFlow/MobileFlow)
 * 音视频转录服务 - 采用模块化重构后的封装
 */

const entry = require('./scribe/TranscriptionEntry');
const localEngine = require('./scribe/LocalWhisperEngine');
const cloudEngine = require('./scribe/CloudWhisperEngine');
const aiHandler = require('./scribe/AIAssistantHandler');
const exporter = require('./scribe/SubExportManager');

class TranscribeService {
    constructor() {
        this.apiKey = null;
    }

    // --- 认证与配置 ---
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        cloudEngine.setApiKey(apiKey);
        aiHandler.setApiKey(apiKey);
    }

    // --- 核心转录业务 (由 Entry 协调) ---
    async transcribe(filePath, options = {}) {
        if (!options.apiKey) options.apiKey = this.apiKey;
        return entry.transcribe(filePath, options);
    }

    async extractAudio(inputPath, outputPath) {
        return entry.extractAudio(inputPath, outputPath);
    }

    async splitAudio(inputPath, outputDir, segmentTime) {
        return entry.splitAudio(inputPath, outputDir, segmentTime);
    }

    async transcribeWithChunking(filePath, options) {
        return entry.transcribeWithChunking(filePath, options);
    }

    // --- 本地引擎特有方法 ---
    async transcribeLocal(filePath, options = {}) {
        return localEngine.transcribeLocal(filePath, options);
    }

    async checkLocalEnv() {
        return localEngine.checkLocalEnv();
    }

    /**
     * Cancel in-flight local (and related) transcription workers.
     * Cloud HTTP cannot always be aborted mid-request; callers also stop the UI loop.
     */
    cancel() {
        try {
            localEngine.killAll();
        } catch (e) {
            console.warn('[TranscribeService] cancel local engines:', e?.message || e);
        }
        return { success: true };
    }

    async getDownloadedModels() {
        return localEngine.getDownloadedModels();
    }

    async deleteModel(modelId) {
        return localEngine.deleteModel(modelId);
    }

    async downloadModel(modelName, onProgress) {
        return localEngine.downloadModel(modelName, onProgress);
    }

    async getSherpaModelStatus() {
        return localEngine.getSherpaModelStatus();
    }

    async downloadSherpaModels(onProgress) {
        return localEngine.downloadSherpaModels(onProgress || (() => { }));
    }

    // --- 云端引擎特有方法 ---
    async _transcribeSingle(filePath, options = {}) {
        return cloudEngine.transcribeSingle(filePath, options);
    }

    // --- AI 辅助业务 ---
    async translate(text, targetLang, options) {
        return aiHandler.translate(text, targetLang, options);
    }

    async polishText(segments, options) {
        return aiHandler.polishText(segments, options);
    }

    async summarizeText(segments, options) {
        return aiHandler.summarizeText(segments, options);
    }

    async translateBatch(text, languages, options) {
        return aiHandler.translateBatch(text, languages, options);
    }

    // --- 导出业务 ---
    exportToSRT(segments) {
        return exporter.exportToSRT(segments);
    }

    exportToBilingualSRT(segments, translations) {
        return exporter.exportToBilingualSRT(segments, translations);
    }

    formatSRTTime(seconds) {
        return exporter.formatSRTTime(seconds);
    }

    exportToText(segments, includeTimestamps) {
        return exporter.exportToText(segments, includeTimestamps);
    }
}

module.exports = new TranscribeService();
