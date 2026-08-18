console.log('[SubtitleAIHandler] Loading script...');
class SubtitleAIHandler {
    constructor(flow) {
        this.flow = flow;
    }

    normalizeCompressionText(text) {
        return String(text || '')
            .replace(/\r?\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    containsCompressionHallucination(text = '') {
        const output = String(text || '').trim();
        if (!output) return true;

        const suspiciousPatterns = [
            /it seems like you're asking/i,
            /here are (some|several|a few)/i,
            /compression algorithms?/i,
            /online text compression tools?/i,
            /programming libraries?/i,
            /\*\*/,
            /(?:^|\s)\d+\.\s/,
            /(?:^|\n)\s*[-*•]\s+/
        ];

        return suspiciousPatterns.some((pattern) => pattern.test(output));
    }

    getCompressionSimilarity(sourceText = '', candidateText = '', isChinese = false) {
        const source = String(sourceText || '').trim().toLowerCase();
        const candidate = String(candidateText || '').trim().toLowerCase();
        if (!source || !candidate) return 0;

        if (isChinese) {
            const sourceChars = new Set(Array.from(source).filter((char) => /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7afA-Za-z0-9]/.test(char)));
            const candidateChars = Array.from(candidate).filter((char) => sourceChars.has(char));
            return candidateChars.length / Math.max(1, Array.from(candidate).filter((char) => /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7afA-Za-z0-9]/.test(char)).length);
        }

        const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'they', 'them', 'your', 'into', 'will']);
        const tokenize = (value) => value
            .split(/[^a-z0-9']+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !stopWords.has(token));

        const sourceTokens = new Set(tokenize(source));
        const candidateTokens = tokenize(candidate);
        if (!candidateTokens.length) return 0;

        const overlapCount = candidateTokens.filter((token) => sourceTokens.has(token)).length;
        return overlapCount / candidateTokens.length;
    }

    isCompressionResultUsable(sourceText = '', candidateText = '', maxChars = 0, isChinese = false) {
        const source = this.normalizeCompressionText(sourceText);
        const candidate = this.normalizeCompressionText(candidateText);
        if (!candidate) return false;
        if (window.TranslationService?._isHallucination?.(candidate)) return false;
        if (this.containsCompressionHallucination(candidate)) return false;

        const allowedMaxLength = Math.max(maxChars > 0 ? Math.ceil(maxChars * 1.25) : 0, Math.ceil(source.length * 1.08));
        if (candidate.length > allowedMaxLength && candidate.length > source.length) {
            return false;
        }

        const similarity = this.getCompressionSimilarity(source, candidate, isChinese);
        return similarity >= (isChinese ? 0.35 : 0.42);
    }

    buildCompressionPrompt(text, maxChars, isChinese) {
        if (isChinese) {
            return [
                `任务：把下面这句中文字幕轻微压缩到约 ${maxChars} 字。`,
                '规则：',
                '1. 只能轻微缩短，不能改主题，不能补充解释。',
                '2. 保留原句核心意思、语气、人物关系、数字和专有名词。',
                '3. 不要写说明，不要分点，不要加标题，不要 Markdown。',
                '4. 如果无法在不丢失关键信息的前提下明显缩短，就原样输出。',
                '5. 只输出最终字幕文本，单行返回。',
                '',
                '原文：',
                text
            ].join('\n');
        }

        return [
            `Task: Slightly shorten the following subtitle to about ${maxChars} characters.`,
            'Rules:',
            '1. Keep the same meaning, tone, subject, and key details.',
            '2. Preserve names, numbers, and factual content.',
            '3. Do not explain, summarize broadly, answer questions, or add lists.',
            '4. If meaningful shortening is not possible without losing important meaning, return the original text unchanged.',
            '5. Output only the final subtitle line as a single line.',
            '',
            'Original subtitle:',
            text
        ].join('\n');
    }

    normalizeRecognitionSubtitles(subtitles = []) {
        return subtitles.map((subtitle) => ({
            ...subtitle,
            text: subtitle.text || subtitle.translatedText || subtitle.originalText || ''
        })).sort((left, right) => left.start - right.start);
    }

    getRecognitionTargetTrack() {
        const tracks = Array.isArray(this.flow.tracks) ? this.flow.tracks : [];
        const activeTrackId = this.flow.activeTrackId || this.flow.trackManager?.activeTrackId;
        const activeTrack = tracks.find((track) => track.id === activeTrackId) || null;

        if (activeTrack && activeTrack.type !== 'audio') {
            return activeTrack;
        }

        return tracks.find((track) => track.type === 'main') || null;
    }

    async resolveRecognitionWriteMode(targetTrack) {
        const existingCount = Array.isArray(targetTrack?.subtitles) ? targetTrack.subtitles.length : 0;
        if (!targetTrack || existingCount === 0) {
            return 'replace';
        }

        const title = this.translateOrFallback('subtitle.confirm.ai_track_write_title', 'AI subtitle import');
        const message = this.translateOrFallback(
            'subtitle.confirm.ai_track_write_mode',
            `The current track already has ${existingCount} subtitles. Type append to add new subtitles after the existing ones, or replace to overwrite this track. Leave empty to append.`,
            { count: existingCount }
        );

        if (typeof window.app?.showChoice === 'function') {
            const choice = await window.app.showChoice(title, message, [
                {
                    value: 'append',
                    label: this.translateOrFallback('subtitle.common.append', 'Append'),
                    className: 'btn btn-secondary'
                },
                {
                    value: 'replace',
                    label: this.translateOrFallback('subtitle.common.replace', 'Replace'),
                    className: 'btn btn-primary'
                }
            ]);
            if (choice === 'append' || choice === 'replace') {
                return choice;
            }
            return null;
        }

        if (typeof window.app?.showPrompt === 'function') {
            const value = await window.app.showPrompt(title, message, 'append');
            if (value === null) return null;

            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized) return 'append';
            if (['replace', 'overwrite', 'r', 'o', '覆盖', '替换'].includes(normalized)) return 'replace';
            if (['append', 'merge', 'a', 'm', '追加', '附加'].includes(normalized)) return 'append';
            return 'append';
        }

        const confirmedReplace = await window.app?.showConfirm?.(message);
        return confirmedReplace ? 'replace' : 'append';
    }

    buildTrackSubtitles(targetTrack, subtitles, mode = 'replace') {
        const normalizedIncoming = this.normalizeRecognitionSubtitles(subtitles);
        if (mode === 'append') {
            const existing = this.normalizeRecognitionSubtitles(targetTrack?.subtitles || []);
            return existing.concat(normalizedIncoming).sort((left, right) => left.start - right.start);
        }
        return normalizedIncoming;
    }

    translateOrFallback(key, fallback, params) {
        return window.SubtitleUtils?.translateOrFallback?.(key, fallback, params) ?? fallback;
    }

    async getRecognitionContext() {
        const provider = this.flow.translationEngine?.value || 'groq';
        const lang = this.flow.sourceLanguage?.value || 'auto';

        let apiKey = null;
        try {
            const storedKeys = await window.mediaflow.store.get(`translation-keys-${provider}`);
            if (Array.isArray(storedKeys)) {
                apiKey = storedKeys.length > 0 ? storedKeys[0] : null;
            } else {
                apiKey = storedKeys;
            }
        } catch (e) {
            console.error('[SubtitleAI] Error fetching API key:', e);
        }

        if (!apiKey) {
            throw new Error(this.translateOrFallback('subtitle.messages.api_key_missing', `API key missing for ${provider}`, { provider }));
        }

        // Whisper's prompt is transcription context, not an instruction. The
        // old prompt ended with “词风：”; when speech became quiet, Whisper
        // hallucinated that prompt text as subtitle content (e.g. “词风/Ci
        // Feng”). Language is already sent as a dedicated API field.
        const initialPrompt = '';

        return { provider, lang, apiKey, initialPrompt };
    }

    async transcribeSegment(videoFile, { startTime = 0, duration = 0 } = {}) {
        if (!videoFile?.path) throw new Error('Video file not loaded');

        const { provider, lang, apiKey, initialPrompt } = await this.getRecognitionContext();

        return window.TranslationService.transcribe(videoFile, {
            language: lang,
            provider,
            apiKey,
            prompt: initialPrompt,
            startTime,
            duration
        });
    }

    async runAIProcess() {
        if (!this.flow.videoFile) {
            window.app?.showToast?.(window.i18n.t('toast.select_video_first'), 'warning');
            return;
        }

        const modeRadio = document.querySelector('input[name="subtitle-mode"]:checked');
        const mode = modeRadio?.value;
        if (mode !== 'ai') {
            // 核心改进：点击 AI 按钮时，如果当前不是 AI 模式，自动尝试切换过去，而不是生硬报错
            const aiRadio = document.querySelector('input[name="subtitle-mode"][value="ai"]');
            if (aiRadio) {
                aiRadio.checked = true;
                aiRadio.dispatchEvent(new Event('change'));
                // 给 UI 切换留一点点喘息时间
                await new Promise(r => setTimeout(r, 100));
            } else {
                window.app?.showToast?.(window.i18n.t('subtitle.messages.switchAiFirst'), 'warning');
                return;
            }
        }

        const { provider, lang, apiKey, initialPrompt } = await this.getRecognitionContext();
        const targetLang = this.flow.targetLanguage?.value || 'zh-Hans';

        this.flow.showProgress(
            window.i18n.t('subtitle.progress.processing'),
            window.i18n.t('subtitle.progress.identifying')
        );

        try {
            // 1. Transcribe (Get original subtitles)
            const segments = await window.TranslationService.transcribe(this.flow.videoFile, {
                language: lang,
                provider: provider,
                apiKey: apiKey,
                prompt: initialPrompt
            });

            // 再次确保初始段落是有序的 (防御性编程)
            let finalSubtitles = segments.sort((a, b) => a.start - b.start);

            // 2. Translate (If needed)
            if (targetLang !== 'none' && targetLang !== 'source' && targetLang !== lang) {
                this.flow.updateProgress(50, window.i18n.t('subtitle.progress.translating'));
                const hint = this.flow.aiStyleHint?.value || '';
                const translationResolution = await this.flow.service.resolveSegmentTranslations(segments, targetLang, {
                    provider: provider,
                    hint: hint,
                    onProgress: (p) => {
                        this.flow.updateProgress(50 + (p / 2), window.i18n.t('subtitle.progress.translating'));
                    }
                });
                const translatedSegments = translationResolution.segments;

                if (this.flow.keepBilingual?.checked) {
                    finalSubtitles = segments.map((seg, i) => ({
                        ...seg,
                        originalText: seg.text,
                        translatedText: translatedSegments[i]?.translatedText || '',
                        text: `${seg.text}\n${translatedSegments[i]?.translatedText || ''}`,
                        translationTargetLang: targetLang || null
                    })).sort((a, b) => a.start - b.start); // 合并后排序
                } else {
                    finalSubtitles = segments.map((seg, i) => ({
                        ...seg,
                        originalText: seg.text,
                        translatedText: translatedSegments[i]?.translatedText || '',
                        text: translatedSegments[i]?.text || seg.text,
                        translationTargetLang: targetLang || null
                    })).sort((a, b) => a.start - b.start); // 合约后排序
                }

                if (translationResolution.memoryHits > 0) {
                    window.app?.showToast?.(`复用了 ${translationResolution.memoryHits} 条翻译记忆`, 'info');
                }
            } else {
                // No Translation
                finalSubtitles = segments.map(seg => ({
                    ...seg,
                    originalText: seg.text,
                    translatedText: '',
                    text: seg.text,
                    translationTargetLang: null
                }));
            }

            // 3. Length Optimization
            if (this.flow.lengthOptimize?.checked && this.flow.qualityHandler) {
                this.flow.updateProgress(95, window.i18n.t('subtitle.progress.optimizing'));
                // autoSplitAll 内部会对新生成的段落插入到对应位置，但我们在此处进行最终保底排序
                finalSubtitles = this.flow.qualityHandler.autoSplitAll(finalSubtitles).sort((a, b) => a.start - b.start);
            }

            // 4. Update target subtitle track
            const targetTrack = this.getRecognitionTargetTrack();
            if (targetTrack) {
                const writeMode = await this.resolveRecognitionWriteMode(targetTrack);
                if (!writeMode) {
                    window.app?.showToast?.(this.translateOrFallback('subtitle.messages.aiCancelled', 'AI subtitle import cancelled'), 'info');
                    return;
                }

                targetTrack.subtitles = this.buildTrackSubtitles(targetTrack, finalSubtitles, writeMode);
                
                this.flow.trackManager.renderTracks();
                this.flow.trackManager.setActiveTrack(targetTrack.id);
            } else {
                this.flow.trackManager.addTrack(window.i18n.t('subtitle.messages.mainTrack'), 'main');
                const tracks = this.flow.trackManager.tracks;
                const newTrack = tracks[tracks.length - 1];
                newTrack.subtitles = this.normalizeRecognitionSubtitles(finalSubtitles);
                
                this.flow.trackManager.renderTracks();
                this.flow.trackManager.setActiveTrack(newTrack.id);
            }

            // Cache results for batch handler
            if (this.flow.batchHandler && this.flow.videoFile) {
                this.flow.batchHandler.updateFileSubtitles(this.flow.videoFile.path, targetTrack?.subtitles || this.normalizeRecognitionSubtitles(finalSubtitles));
            }

            window.app?.showToast?.(window.i18n.t('subtitle.messages.aiDone', { count: finalSubtitles.length }), 'success');


        } catch (error) {
            console.error('[SubtitleAI] Error:', error);
            window.app?.showToast?.(window.i18n.t('subtitle.messages.aiFailed') + error.message, 'error');
        } finally {
            this.flow.hideProgress();
            this.flow.isProcessing = false;
        }
    }
    async retranslateSubtitle(originalText, targetLang, options = {}) {
        if (!originalText) return null;
        try {
            const provider = this.flow.translationEngine?.value || 'groq';
            const targetLangLabel = window.TranslationService?.constructor?.getLangName?.(targetLang) || targetLang;
            const styleHint = String(options.styleHint || '').trim();
            const glossaryEntries = Array.isArray(options.glossaryEntries) ? options.glossaryEntries : [];
            const glossaryLines = glossaryEntries.map((entry) => `- ${entry.source} => ${entry.target}`);
            const prompt = (styleHint || glossaryLines.length)
                ? [
                    `Translate the following subtitle into ${targetLangLabel}.`,
                    'Output only the translated subtitle text.',
                    'Keep the translation concise, natural, and suitable for video subtitles.',
                    styleHint ? `Style guidance: ${styleHint}` : '',
                    glossaryLines.length ? 'Preferred fixed translations:' : '',
                    ...glossaryLines,
                    '',
                    'Input:',
                    originalText
                ].filter(Boolean).join('\n')
                : originalText;
            const result = await window.mediaflow.translation.translate(
                prompt,
                (styleHint || glossaryLines.length) ? 'none' : targetLangLabel,
                provider
            );
            if (result && result.success) {
                const text = result.translation.trim();

                // 检查是否返回了 "None" (防止 LLM 在无翻译结果时返回此占位符)
                if (text.toLowerCase() === 'none' || text === '') {
                    throw new Error('AI returned no valid translation (None/Empty)');
                }

                // 检查幻觉
                if (window.TranslationService?._isHallucination?.(text)) {
                    throw new Error('AI generated invalid content (Hallucination detection)');
                }
                return text;
            }
            throw new Error(result?.error || 'Translation failed');
        } catch (e) {
            console.error('[SubtitleAIHandler] Retranslate error:', e);
            throw e;
        }
    }

    async compressSubtitle(text, maxChars, isChinese) {
        if (!text) return null;
        try {
            const prompt = this.buildCompressionPrompt(text, maxChars, isChinese);

            const provider = this.flow.translationEngine?.value || 'groq';
            const result = await window.mediaflow.translation.translate(prompt, 'none', provider);
            if (result && result.success) {
                const compressedText = this.normalizeCompressionText(result.translation);
                if (!this.isCompressionResultUsable(text, compressedText, maxChars, isChinese)) {
                    console.warn('[SubtitleAIHandler] Compression result rejected, falling back to original text.');
                    return text;
                }
                return compressedText;
            }
            throw new Error(result?.error || 'Compression failed');
        } catch (e) {
            console.error('[SubtitleAIHandler] Compress error:', e);
            return text;
        }
    }

    async splitTextSemantically(text) {
        if (!text) return [];
        this.flow.showProgress(window.i18n.t('subtitle.messages.ai_splitting'));

        try {
            // Construct Prompt
            const prompt = `
            Task: Split the following text into short, natural subtitle segments.
            Rules:
            1. Output exactly one segment per line.
            2. Keep segments short (max 20 Chinese chars or 10 English words).
            3. Split at punctuation marks or distinct semantic pauses.
            4. Do NOT change or summarize the text. Keep it exact.
            5. Output ONLY the split lines. No markdown, no prefixes.
            
            Text:
            ${text}
            `;

            // Call API
            const provider = this.flow.translationEngine?.value || 'groq';
            const result = await window.mediaflow.translation.translate(prompt, 'none', provider);

            if (result && result.success) {
                const lines = result.translation.split('\n').map(l => l.trim()).filter(l => l);
                // Convert to subtitle objects
                return lines.map((line, index) => ({
                    id: Date.now() + index,
                    text: line,
                    originalText: line,
                    translatedText: '', // Translation can be done later
                    start: 0,
                    end: 0
                }));
            }
            throw new Error(result?.error || 'AI response invalid');

        } catch (e) {
            console.error('[SubtitleAIHandler] Split error:', e);
            throw e;
        } finally {
            this.flow.hideProgress();
        }
    }
}

window.SubtitleAIHandler = SubtitleAIHandler;
