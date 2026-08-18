/**
 * SubtitleService.js
 * 处理字幕相关的核心业务逻辑，包括 AI 处理、TTS 生成和批量解析。
 */
class SubtitleService {
    constructor(flow) {
        this.flow = flow;
    }

    /**
     * 估计文本的舒适阅读时长
     */
    estimateDuration(text) {
        return window.SubtitleUtils?.estimateDuration(text) || 1.5;
    }

    normalizeTranslationMemoryKey(text) {
        return String(text || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    getFixedTranslationEntries() {
        const enabled = !!this.flow.preferenceManager?.get?.('fixedTranslationsEnabled');
        if (!enabled) return [];

        const entries = this.flow.preferenceManager?.get?.('fixedTranslations');
        if (!Array.isArray(entries)) return [];

        return entries
            .map((entry) => ({
                source: String(entry?.source || '').trim(),
                target: String(entry?.target || '').trim()
            }))
            .filter((entry) => entry.source && entry.target);
    }

    getExactFixedTranslationHit(text) {
        const key = this.normalizeTranslationMemoryKey(text);
        if (!key) return null;

        const match = this.getFixedTranslationEntries().find((entry) => this.normalizeTranslationMemoryKey(entry.source) === key);
        return match?.target || null;
    }

    getRelevantFixedTranslations(texts = []) {
        const normalizedTexts = texts.map((text) => this.normalizeTranslationMemoryKey(text)).filter(Boolean);
        if (!normalizedTexts.length) return [];

        return this.getFixedTranslationEntries()
            .filter((entry) => normalizedTexts.some((text) => text.includes(this.normalizeTranslationMemoryKey(entry.source))))
            .slice(0, 20);
    }

    collectTranslationMemory(targetLang) {
        const candidates = [];
        const subtitleTracks = Array.isArray(this.flow.trackManager?.tracks)
            ? this.flow.trackManager.tracks.filter((track) => track.type !== 'audio')
            : [];

        subtitleTracks.forEach((track) => {
            (track.subtitles || []).forEach((subtitle) => {
                candidates.push(subtitle);
            });
        });

        if (!candidates.length && Array.isArray(this.flow.editor?.subtitles)) {
            candidates.push(...this.flow.editor.subtitles);
        }

        const memory = new Map();
        candidates.forEach((subtitle) => {
            const source = String(subtitle?.originalText || subtitle?.text || '').trim();
            const translation = String(subtitle?.translatedText || '').trim();
            if (!source || !translation) return;
            if (subtitle.reviewStatus === 'needs-work') return;
            if (subtitle.translationTargetLang && targetLang && subtitle.translationTargetLang !== targetLang) return;

            const key = this.normalizeTranslationMemoryKey(source);
            if (!key) return;

            const score = (subtitle.locked ? 4 : 0) + (subtitle.reviewStatus === 'approved' ? 2 : 0) + 1;
            const existing = memory.get(key);
            if (!existing || score >= existing.score) {
                memory.set(key, {
                    translation,
                    score,
                    reviewStatus: subtitle.reviewStatus || 'pending',
                    locked: !!subtitle.locked
                });
            }
        });

        return memory;
    }

    getTranslationMemoryHit(text, targetLang) {
        const key = this.normalizeTranslationMemoryKey(text);
        if (!key) return null;

        return this.collectTranslationMemory(targetLang).get(key)?.translation || null;
    }

    async resolveSegmentTranslations(segments, targetLang, options = {}) {
        const { provider = 'groq', onProgress = () => {} } = options;
        const translatedSegments = JSON.parse(JSON.stringify(segments)).map((seg) => ({
            ...seg,
            originalText: seg.originalText || seg.text || '',
            translatedText: seg.translatedText || ''
        }));
        const misses = [];
        const missIndexes = [];
        let memoryHits = 0;
        let fixedTranslationHits = 0;

        translatedSegments.forEach((segment, index) => {
            const fixedTranslation = this.getExactFixedTranslationHit(segment.originalText || segment.text);
            if (fixedTranslation) {
                translatedSegments[index].translatedText = fixedTranslation;
                translatedSegments[index].text = fixedTranslation;
                translatedSegments[index].translationSource = 'fixed';
                translatedSegments[index].translationTargetLang = targetLang || null;
                fixedTranslationHits += 1;
                return;
            }

            const memoryTranslation = this.getTranslationMemoryHit(segment.originalText || segment.text, targetLang);
            if (memoryTranslation) {
                translatedSegments[index].translatedText = memoryTranslation;
                translatedSegments[index].text = memoryTranslation;
                translatedSegments[index].translationSource = 'memory';
                translatedSegments[index].translationTargetLang = targetLang || null;
                memoryHits += 1;
                return;
            }

            misses.push(segment);
            missIndexes.push(index);
        });

        if (!misses.length) {
            onProgress(100);
            return {
                segments: translatedSegments,
                fixedTranslationHits,
                memoryHits,
                aiTranslations: 0
            };
        }

        const glossaryEntries = this.getRelevantFixedTranslations(misses.map((segment) => segment.originalText || segment.text || ''));
        const concurrencyRaw = Number(
            options.concurrency
            ?? this.flow.preferenceManager?.get?.('translationConcurrency')
            ?? this.flow.translationConcurrency?.value
            ?? 2
        );
        const concurrency = Math.max(1, Math.min(4, Number.isFinite(concurrencyRaw) ? concurrencyRaw : 2));
        const translatedMisses = await window.TranslationService.translateSubtitles(misses, targetLang, {
            provider,
            styleHint: options.hint || this.flow.aiStyleHint?.value || '',
            glossaryEntries,
            concurrency,
            onProgress
        });

        missIndexes.forEach((segmentIndex, missIndex) => {
            const translated = translatedMisses[missIndex] || {};
            translatedSegments[segmentIndex] = {
                ...translatedSegments[segmentIndex],
                ...translated,
                originalText: translatedSegments[segmentIndex].originalText,
                translatedText: translated.translatedText || '',
                text: translated.text || translatedSegments[segmentIndex].originalText,
                translationSource: 'ai',
                translationTargetLang: targetLang || null
            };
        });

        return {
            segments: translatedSegments,
            fixedTranslationHits,
            memoryHits,
            aiTranslations: misses.length
        };
    }

    /**
     * 解析批量文本并生成字幕条目
     */
    parseBatchText(text, startTime = 0) {
        const lines = text.split('\n').filter(line => line.trim());
        const newSubs = [];
        let currentTime = startTime;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const duration = this.estimateDuration(trimmedLine);

            newSubs.push({
                id: Date.now() + newSubs.length,
                start: currentTime,
                end: currentTime + duration,
                text: trimmedLine,
                originalText: trimmedLine,
                translatedText: '',
                ttsSource: 'original',
                translationTargetLang: null
            });

            currentTime += duration + 0.5; // 预留 0.5 秒间隙
        }

        return newSubs;
    }

    /**
     * AI 智能拆分文本
     * @param {string} text - 原始长文本
     * @returns {Promise<Array>} - 分割好的字幕对象数组
     */
    async splitTextWithAI(text) {
        if (this.flow.aiHandler && this.flow.aiHandler.splitTextSemantically) {
            return await this.flow.aiHandler.splitTextSemantically(text);
        }
        // Fallback: simple split
        return this.parseBatchText(text);
    }

    /**
     * 强制对齐字幕到视频时长 (Linear Alignment)
     * @param {Array} subtitles - 字幕数组
     * @param {number} videoDuration - 视频总时长(秒)
     * @returns {Array} - 对齐后的字幕
     */
    forceAlignSubtitles(subtitles, videoDuration) {
        if (!videoDuration || videoDuration <= 0) return subtitles;
        if (!subtitles || subtitles.length === 0) return [];

        // Calculate total weight (char length) for proportional distribution
        const totalWeight = subtitles.reduce((acc, sub) => acc + (sub.text ? sub.text.length : 1), 0);

        let currentTime = 0;
        const gap = 0.1; // 100ms gap between subs
        // Ensure we don't have negative time if too many subs
        const totalGapTime = (subtitles.length - 1) * gap;
        const availableDuration = Math.max(1, videoDuration - totalGapTime);

        const timePerWeight = availableDuration / Math.max(1, totalWeight);

        return subtitles.map(sub => {
            const weight = sub.text ? sub.text.length : 1;
            const duration = weight * timePerWeight;

            const start = parseFloat(currentTime.toFixed(3));
            const end = parseFloat((start + duration).toFixed(3));

            currentTime = end + gap;

            return {
                ...sub,
                start,
                end,
                originalText: sub.text, // Ensure text sync
                translatedText: '',
                translationTargetLang: null
            };
        });
    }

    /**
     * 为单条字幕请求 AI 重译
     */
    async retranslate(text, targetLang, options = {}) {
        if (options.allowFixedTranslations !== false) {
            const fixedTranslation = this.getExactFixedTranslationHit(text);
            if (fixedTranslation) {
                return fixedTranslation;
            }
        }

        if (options.allowMemory !== false) {
            const memoryHit = this.getTranslationMemoryHit(text, targetLang);
            if (memoryHit) {
                return memoryHit;
            }
        }

        if (!this.flow.aiHandler) throw new Error('AI Handler not found');
        return await this.flow.aiHandler.retranslateSubtitle(text, targetLang, {
            styleHint: this.flow.aiStyleHint?.value || '',
            glossaryEntries: this.getRelevantFixedTranslations([text])
        });
    }

    async reRecognizeSubtitle(videoFile, subtitle, options = {}) {
        if (!this.flow.aiHandler) throw new Error('AI Handler not found');
        if (!videoFile?.path) throw new Error('Video file not loaded');
        if (!subtitle) throw new Error('Subtitle not found');

        const padding = Number.isFinite(options.padding) ? options.padding : 0.2;
        const startTime = Math.max(0, Number(subtitle.start || 0) - padding);
        const duration = Math.max(0.4, Number(subtitle.end || 0) - Number(subtitle.start || 0) + padding * 2);

        const segments = await this.flow.aiHandler.transcribeSegment(videoFile, {
            startTime,
            duration
        });

        const transcript = (segments || [])
            .map((segment) => String(segment?.text || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();

        if (!transcript) {
            throw new Error('No speech recognized in this segment');
        }

        return transcript;
    }

    /**
     * 为单条字幕请求 AI 压缩（缩短长度）
     */
    async compressTranslation(text, maxChars, isChinese) {
        if (!this.flow.aiHandler) throw new Error('AI Handler not found');
        return await this.flow.aiHandler.compressSubtitle(text, maxChars, isChinese);
    }

    /**
     * 批量生成所有字幕的 TTS
     */
    async generateBatchTTS(subtitles) {
        if (!this.flow.ttsHandler) throw new Error('TTS Handler not found');

        return await this.flow.ttsHandler.generateBatch(subtitles);
    }
    /**
     * 为字幕生成单词级时间戳（估算）
     * 用于卡拉OK动态高亮效果
     */
    estimateWordTimestamps(subtitle) {
        if (!subtitle || !subtitle.text) return [];

        // If words already exist (e.g. from Whisper), return them
        if (subtitle.words && subtitle.words.length > 0) return subtitle.words;

        const text = subtitle.translatedText || subtitle.text;
        const duration = subtitle.end - subtitle.start;
        const startTime = subtitle.start;

        // Check if CJK
        const isCJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text);

        let tokens = [];

        if (isCJK && typeof Intl !== 'undefined' && Intl.Segmenter) {
            // Detect Language logic for Segmenter
            const hasKana = /[\u3040-\u30ff]/.test(text);
            const locale = hasKana ? 'ja' : 'zh-CN';

            // Use Intl.Segmenter for smart word segmentation
            const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
            const segments = Array.from(segmenter.segment(text));

            // Keep all segments to preserve whitespace and symbols, but map them
            tokens = segments.map(s => s.segment);

            // Re-filter empty or purely blank if needed? 
            // Actually ASS needs them to preserve layout.
        } else if (isCJK) {
            // Fallback: split but keep spaces
            tokens = text.match(/[\u4e00-\u9fa5]+|[^\s\u4e00-\u9fa5]+|\s+/g) || [];
        } else {
            // Western: Split but keep spaces as tokens? 
            // For Western, usually splitting by space is fine because we add the space back in join(' ')
            // But for consistency let's use a capture group
            tokens = text.split(/(\s+)/).filter(t => t.length > 0);
        }

        if (tokens.length === 0) return [];

        const timePerChar = duration / text.length;
        let currentTime = startTime;

        const words = tokens.map(token => {
            const tokenLen = token.length;
            const tokenDuration = tokenLen * timePerChar;
            const word = {
                text: token,
                start: parseFloat(currentTime.toFixed(3)),
                end: parseFloat((currentTime + tokenDuration).toFixed(3))
            };
            currentTime += tokenDuration;
            return word;
        });

        // Fix rounding errors for last word to match exact end time
        if (words.length > 0) {
            words[words.length - 1].end = subtitle.end;
        }

        return words;
    }
}

window.SubtitleService = SubtitleService;
