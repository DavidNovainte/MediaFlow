/**
 * TranslationService (Frontend)
 * 处理前端翻译逻辑、API 调用封装
 */

console.log('[TranslationService] Script loaded');

class TranslationService {
    constructor() {
        this.isTranscribing = false;
        this.isTranslating = false;
    }

    static LANG_FULL_NAMES = {
        'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
        'en-US': 'English', 'fr-FR': 'French', 'de-DE': 'German',
        'es-ES': 'Spanish', 'ja-JP': 'Japanese', 'ko-KR': 'Korean',
        'pt-PT': 'Portuguese', 'ru-RU': 'Russian',
        'zh': 'Simplified Chinese', 'en': 'English', 'ja': 'Japanese',
        'ko': 'Korean', 'fr': 'French', 'de': 'German',
        'es': 'Spanish', 'pt': 'Portuguese', 'ru': 'Russian'
    };

    static getLangName(code) {
        return TranslationService.LANG_FULL_NAMES[code] || code;
    }

    /**
     * 转录视频/音频
     * @param {File} file - 视频文件对象
     * @param {Object} options - 选项 { language, provider, apiKey }
     * @returns {Promise<Array>} Segments
     */
    async transcribe(file, options = {}) {
        if (this.isTranscribing) throw new Error('Transcription already in progress');
        this.isTranscribing = true;

        try {
            const transcribeOptions = {
                language: options.language === 'auto' ? null : options.language,
                provider: options.provider || 'groq',
                apiKey: options.apiKey,
                prompt: options.prompt || options.initialPrompt,
                startTime: options.startTime,
                duration: options.duration,
                responseFormat: 'verbose_json',
                timestampGranularity: 'word'
            };

            console.log('[TranslationService] Starting transcription:', file.path, transcribeOptions);
            const result = await window.mediaflow.transcribe.start(file.path, transcribeOptions);

            if (!result.success) {
                throw new Error(result.error || 'Transcription failed');
            }

            const segments = result.segments
                .filter(seg => seg.text && !this._isHallucination(seg.text))
                .sort((a, b) => a.start - b.start)
                .map((seg, index) => ({
                    id: index + 1,
                    start: seg.start,
                    end: seg.end,
                    text: seg.text ? seg.text.trim() : '',
                    words: seg.words || []
                }));

            console.log('[TranslationService] Processed segments:', segments.length);
            return segments;

        } finally {
            this.isTranscribing = false;
        }
    }

    /**
     * 翻译字幕段落 (批量) - 有限并发、失败批次重试、限流提示
     * @param {Array} segments - 原文字幕数组
     * @param {string} targetLang - 目标语言
     * @param {Object} options - { provider, onProgress, styleHint, glossaryEntries, concurrency }
     * @returns {Promise<Array>} 翻译后的字幕数组（附 _meta）
     */
    async translateSubtitles(segments, targetLang, options = {}) {
        const {
            provider = 'groq',
            onProgress = () => {},
            styleHint = '',
            glossaryEntries = [],
            concurrency = 2
        } = options;

        const translatedSegments = JSON.parse(JSON.stringify(segments)).map((seg) => ({
            ...seg,
            originalText: seg.originalText || seg.text || '',
            translatedText: seg.translatedText || ''
        }));

        const BATCH_SIZE = 20;
        const MAX_RETRIES = 2;
        const total = segments.length;
        if (!total) {
            onProgress(100);
            translatedSegments._meta = {
                totalBatches: 0,
                failedBatches: 0,
                missingLines: 0,
                concurrency: 0
            };
            return translatedSegments;
        }

        const langName = TranslationService.getLangName(targetLang);
        const promptOptions = { styleHint, glossaryEntries };
        const jobs = [];
        for (let i = 0; i < total; i += BATCH_SIZE) {
            jobs.push({
                startIndex: i,
                batch: segments.slice(i, i + BATCH_SIZE)
            });
        }

        let completedUnits = 0;
        const bumpProgress = (units = 1) => {
            completedUnits = Math.min(total, completedUnits + units);
            onProgress(Math.round((completedUnits / total) * 100));
        };

        const runJob = async (job) => {
            const result = await this._translateBatchWithRetries({
                batch: job.batch,
                langName,
                provider,
                promptOptions,
                maxRetries: MAX_RETRIES
            });

            if (result?.success) {
                const appliedCount = this._applySubtitleBatchTranslations(
                    job.batch,
                    translatedSegments,
                    job.startIndex,
                    result.translation
                );
                if (appliedCount < job.batch.length) {
                    console.warn(
                        `[TranslationService] Batch @${job.startIndex} translated ${appliedCount}/${job.batch.length} lines`
                    );
                }
                bumpProgress(job.batch.length);
                return { ok: true, job };
            }

            bumpProgress(job.batch.length);
            return { ok: false, job };
        };

        const workerCount = Math.max(1, Math.min(Number(concurrency) || 2, jobs.length));
        let cursor = 0;
        const failedJobs = [];

        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (cursor < jobs.length) {
                const index = cursor;
                cursor += 1;
                const outcome = await runJob(jobs[index]);
                if (!outcome.ok) {
                    failedJobs.push(outcome.job);
                }
            }
        }));

        // 失败批次再串行重试一轮，降低限流碰撞
        let recoveredBatches = 0;
        for (const job of failedJobs) {
            const result = await this._translateBatchWithRetries({
                batch: job.batch,
                langName,
                provider,
                promptOptions,
                maxRetries: MAX_RETRIES + 1,
                baseDelayMs: 1200
            });
            if (!result?.success) continue;

            this._applySubtitleBatchTranslations(
                job.batch,
                translatedSegments,
                job.startIndex,
                result.translation
            );
            recoveredBatches += 1;
        }

        // 仍缺译文的行：再打包补译一次
        const missingIndexes = [];
        translatedSegments.forEach((seg, index) => {
            const source = String(seg.originalText || seg.text || '').trim();
            const translated = String(seg.translatedText || '').trim();
            if (source && !translated) {
                missingIndexes.push(index);
            }
        });

        if (missingIndexes.length) {
            const missSegments = missingIndexes.map((index) => segments[index]);
            for (let i = 0; i < missSegments.length; i += BATCH_SIZE) {
                const localBatch = missSegments.slice(i, i + BATCH_SIZE);
                const globalStartIndexes = missingIndexes.slice(i, i + BATCH_SIZE);
                const result = await this._translateBatchWithRetries({
                    batch: localBatch,
                    langName,
                    provider,
                    promptOptions,
                    maxRetries: MAX_RETRIES,
                    baseDelayMs: 1000
                });
                if (!result?.success) continue;

                // 映射到全局 index：临时 buffer 再写回
                const temp = localBatch.map((seg) => ({
                    ...seg,
                    originalText: seg.originalText || seg.text || '',
                    translatedText: ''
                }));
                this._applySubtitleBatchTranslations(localBatch, temp, 0, result.translation);
                temp.forEach((seg, localIndex) => {
                    const globalIndex = globalStartIndexes[localIndex];
                    if (globalIndex == null) return;
                    if (!seg.translatedText) return;
                    translatedSegments[globalIndex].translatedText = seg.translatedText;
                    translatedSegments[globalIndex].text = seg.text || seg.translatedText;
                });
            }
        }

        let stillMissing = 0;
        translatedSegments.forEach((seg) => {
            const source = String(seg.originalText || '').trim();
            const translated = String(seg.translatedText || '').trim();
            if (source && !translated) stillMissing += 1;
        });

        const failedBatches = Math.max(0, failedJobs.length - recoveredBatches);
        translatedSegments._meta = {
            totalBatches: jobs.length,
            failedBatches,
            recoveredBatches,
            missingLines: stillMissing,
            concurrency: workerCount
        };

        if (failedBatches > 0 || stillMissing > 0) {
            console.warn(
                `[TranslationService] partial translation: failedBatches=${failedBatches}, missingLines=${stillMissing}`
            );
            const message = window.i18n?.t?.('subtitle.messages.translationPartial', {
                failed: failedBatches,
                missing: stillMissing
            });
            window.app?.showToast?.(
                (message && message !== 'subtitle.messages.translationPartial')
                    ? message
                    : `翻译部分失败：${failedBatches} 批未完成，${stillMissing} 条仍无译文（已保留原文，可重试）`,
                'warning',
                7000
            );
        }

        onProgress(100);
        return translatedSegments;
    }

    async _translateBatchWithRetries({
        batch,
        langName,
        provider,
        promptOptions,
        maxRetries = 2,
        baseDelayMs = 800
    }) {
        const batchText = batch
            .map((seg, idx) => `[${idx + 1}] ${seg.originalText || seg.text || ''}`)
            .join('\n');
        const prompt = this._buildSubtitleBatchPrompt(batchText, langName, promptOptions);

        let result = null;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
                result = await window.mediaflow.translation.translate(prompt, 'none', provider);
                if (result?.success) {
                    return result;
                }
            } catch (e) {
                const msg = (e.message || '').toLowerCase();
                if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit')) {
                    window.app?.showToast(
                        window.i18n?.t('transcribe.rateLimitWarn')
                            || '⚠️ Rate limit hit. Add more API keys in Settings.',
                        'warning',
                        6000
                    );
                    // 限流后多等一会再试
                    if (attempt < maxRetries) {
                        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt + 1)));
                        continue;
                    }
                    return result || { success: false, error: e.message };
                }
                if (attempt < maxRetries) {
                    await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
                    continue;
                }
                return { success: false, error: e.message };
            }

            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
            }
        }

        return result || { success: false, error: 'Translation batch failed' };
    }

    _buildSubtitleBatchPrompt(batchText, langName, options = {}) {
        const styleHint = String(options.styleHint || '').trim();
        const glossaryEntries = Array.isArray(options.glossaryEntries) ? options.glossaryEntries : [];
        const promptLines = [
            `Translate the following subtitle lines into ${langName}.`,
            'Rules:',
            '1. Keep exactly the same number of lines as the input.',
            '2. Keep the [n] prefix exactly as provided for every line.',
            '3. Return one translated subtitle per line.',
            '4. Do not merge, skip, reorder, or add lines.',
            '5. Output only the translated subtitle lines.',
            '6. Keep the tone natural for video subtitles and prioritize consistency across repeated terms.'
        ];

        if (styleHint) {
            promptLines.push(`7. Style guidance: ${styleHint}`);
        }

        if (glossaryEntries.length) {
            promptLines.push('', 'Preferred fixed translations:');
            glossaryEntries.forEach((entry) => {
                promptLines.push(`- ${entry.source} => ${entry.target}`);
            });
        }

        promptLines.push('', 'Input:', batchText);
        return promptLines.join('\n');
    }

    _applySubtitleBatchTranslations(batch, translatedSegments, batchStartIndex, rawTranslation) {
        const lines = String(rawTranslation || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
        const unresolvedIndexes = new Set(batch.map((_, index) => index));
        const fallbackLines = [];
        let appliedCount = 0;

        lines.forEach(line => {
            const numberedMatch = line.match(/^\[(\d+)\]\s*(.*)$/);

            if (!numberedMatch) {
                fallbackLines.push(line);
                return;
            }

            const localIndex = parseInt(numberedMatch[1], 10) - 1;
            if (localIndex < 0 || localIndex >= batch.length) return;

            const cleanedText = this._normalizeTranslatedLine(numberedMatch[2]);
            if (!cleanedText) return;

            const globalIndex = batchStartIndex + localIndex;
            translatedSegments[globalIndex].translatedText = cleanedText;
            translatedSegments[globalIndex].text = cleanedText;
            unresolvedIndexes.delete(localIndex);
            appliedCount++;
        });

        unresolvedIndexes.forEach(localIndex => {
            const fallbackLine = fallbackLines.shift();
            const cleanedText = this._normalizeTranslatedLine(fallbackLine);
            if (!cleanedText) return;

            const globalIndex = batchStartIndex + localIndex;
            translatedSegments[globalIndex].translatedText = cleanedText;
            translatedSegments[globalIndex].text = cleanedText;
            appliedCount++;
        });

        return appliedCount;
    }

    _normalizeTranslatedLine(text) {
        if (!text) return '';

        const cleaned = String(text)
            .replace(/^(?:\[\d+\]|\d+[.)-]|[-*•])\s*/, '')
            .trim();

        if (!cleaned || this._isHallucination(cleaned)) {
            return '';
        }

        return cleaned;
    }

    /**
     * 单文本翻译 (用于重译)
     * @param {string} text - 原文
     * @param {string} targetLang - 目标语言
     * @param {Object} options - { provider }
     * @returns {Promise<{success: boolean, translation?: string, error?: string}>}
     */
    async translate(text, targetLang, options = {}) {
        const provider = options.provider || 'groq';
        const langName = TranslationService.getLangName(targetLang);

        try {
            const result = await window.mediaflow.translation.translate(text, langName, provider);
            return result;
        } catch (e) {
            console.error('Single translation error:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * 检测是否为模型幻觉 (Hallucination)
     * @param {string} text 
     * @returns {boolean}
     */
    _isHallucination(text) {
        if (!text) return false;

        const strictPatterns = [
            /^[.\s]*$/,
            /^subtitle by$/i,
            /^translated by$/i,
            /^captioned by$/i,
            /^ripped by$/i,
            /^encoded by$/i,
            /^copyright/i,
            /^all rights reserved/i,
            /^thank you for watching$/i,
            /^thanks for watching$/i,
            /^please subscribe$/i,
            /^subscribe to my channel$/i,
            /^like and subscribe$/i,
            /^[.\s]*subtitles[.\s]*$/i,
            /^no audio$/i,
            /^silence$/i,
            /^music$/i,
            /^applause$/i,
            /^foreign$/i,
            /^uncorrected$/i,
            /^transcript$/i,
            /^transcribed by$/i,
            /^L'Église de l'Église$/i,
            /^The Church of the Church$/i,
            /^L'Eglise de l'Eglise$/i
        ];

        const partialPatterns = [
            /chinese\s+subtitle\s+volunteer/i,
            /amara\.org/i,
            /www\.opensubtitles\.org/i,
            /subscene\.com/i,
            /addic7ed\.com/i,
            /ted\s+talks/i
        ];

        const lower = text.trim().toLowerCase();

        if (strictPatterns.some(p => p.test(lower))) return true;
        if (partialPatterns.some(p => p.test(lower))) return true;
        if (text.length < 2 && !/[\u4e00-\u9fa5a-zA-Z0-9]/.test(text)) return true;

        return false;
    }
}

window.TranslationService = new TranslationService();
