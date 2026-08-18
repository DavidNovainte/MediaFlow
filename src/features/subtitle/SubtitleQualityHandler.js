/**
 * SubtitleQualityHandler.js
 * 字幕自动质检 (QC) 与修复逻辑引擎
 */
class SubtitleQualityHandler {
    constructor(editor) {
        this.editor = editor;
        this.errors = []; // 存储错误信息: { index, type: 'overlap'|'short'|'overflow', message }
        this.currentIndex = -1;
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d');

        // 配置阈值
        this.CONFIG = {
            SHORT_THRESHOLD: 0.8, // 少于 0.8s 标记为过短
            CHINESE_CHAR_LIMIT: 18, // 中文单行超过 18 字警告
            ENGLISH_CHAR_LIMIT: 45 // 英文单行超过 45 字警告
        };
    }

    getDisplayText(sub) {
        const displayMode = this.editor.flow.timeline?.displayMode || 'translated';
        const original = sub.originalText || sub.text || '';
        const translated = sub.translatedText || '';

        if (displayMode === 'bilingual') {
            return translated ? `${original}\n${translated}` : original;
        }
        if (displayMode === 'original') {
            return original;
        }
        return translated || original;
    }

    getActiveStyle() {
        return this.editor.flow.styleManager?.currentStyle || {};
    }

    getRenderScale() {
        const overlay = this.editor.flow.styleManager?.previewHandler?.subtitleOverlay;
        const overlayHeight = overlay?.clientHeight || 0;
        const cssHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--v-render-h')) || 0;
        const renderHeight = overlayHeight || cssHeight || 720;
        return renderHeight / 720;
    }

    getAvailableLineWidthPx(style) {
        const overlay = this.editor.flow.styleManager?.previewHandler?.subtitleOverlay;
        const overlayWidth = overlay?.clientWidth || 0;
        const wrapWidth = Math.max(20, Math.min(100, Number(style.wrapWidth) || 90));
        const baseWidth = overlayWidth || 720;
        return baseWidth * (wrapWidth / 100);
    }

    measureLineWidthPx(line, style) {
        if (!line) return 0;
        if (!this.measureCtx) return line.length * ((style.fontSize || 32) * this.getRenderScale());

        const fontSize = Math.max(12, (style.fontSize || 32) * this.getRenderScale());
        const fontWeight = style.fontBold ? '700' : '400';
        const fontStyle = style.fontItalic ? 'italic' : 'normal';
        const fontFamily = style.fontFamily || 'Microsoft YaHei';
        const letterSpacing = (style.letterSpacing || 0) * this.getRenderScale();

        this.measureCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
        const measured = this.measureCtx.measureText(line).width;
        return measured + Math.max(0, line.length - 1) * letterSpacing;
    }

    estimateWrappedLineCount(text, style, availableWidthPx) {
        const paragraphs = String(text || '').split('\n');
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
            const line = paragraph || '';
            if (!line.trim()) {
                totalLines += 1;
                return;
            }

            let currentWidth = 0;
            let currentLines = 1;
            const hasSpaces = /\s/.test(line.trim()) && line.trim().split(/\s+/).length > 1;
            const tokens = hasSpaces ? line.split(/(\s+)/).filter(Boolean) : Array.from(line);

            tokens.forEach((token) => {
                const tokenWidth = this.measureLineWidthPx(token, style);
                if (currentWidth > 0 && currentWidth + tokenWidth > availableWidthPx) {
                    currentLines += 1;
                    currentWidth = 0;
                }

                if (tokenWidth > availableWidthPx && token.length > 1) {
                    Array.from(token).forEach((char) => {
                        const charWidth = this.measureLineWidthPx(char, style);
                        if (currentWidth > 0 && currentWidth + charWidth > availableWidthPx) {
                            currentLines += 1;
                            currentWidth = 0;
                        }
                        currentWidth += charWidth;
                    });
                    return;
                }

                currentWidth += tokenWidth;
            });

            totalLines += currentLines;
        });

        return totalLines;
    }

    /**
     * 执行全量质检扫描
     */
    runQC() {
        this.errors = [];
        const subs = this.editor.subtitles;

        subs.forEach((sub, index) => {
            // 1. 检查重叠 (Overlap)
            if (index > 0) {
                const prev = subs[index - 1];
                if (sub.start < prev.end - 0.001) { // 留出 1ms 容差
                    this.errors.push({
                        index,
                        type: 'overlap',
                        message: window.i18n?.t('subtitle.qc.errors.overlap', { index: index }) || `Overlaps with item ${index}`
                    });
                }
            }

            // 2. 检查过短 (Short Duration)
            const duration = sub.end - sub.start;
            if (duration < this.CONFIG.SHORT_THRESHOLD) {
                this.errors.push({
                    index,
                    type: 'short',
                    message: window.i18n?.t('subtitle.qc.errors.short', { duration: duration.toFixed(2) }) || `Duration too short (${duration.toFixed(2)}s)`
                });
            }

            // 3. 检查视觉溢出 (Overflow)
            const text = this.getDisplayText(sub);
            if (!text) return;
            const isChinese = /[\u4e00-\u9fa5]/.test(text);

            // 优先联动 UI 上的单行上限设置
            let limit = parseInt(this.editor.flow.maxChars?.value);
            if (isNaN(limit) || limit <= 0) {
                limit = isChinese ? this.CONFIG.CHINESE_CHAR_LIMIT : this.CONFIG.ENGLISH_CHAR_LIMIT;
            }

            // 简单的行长度检查
            const maxLines = parseInt(this.editor.flow.maxLines?.value) || 2;
            const activeStyle = this.getActiveStyle();
            const availableWidthPx = this.getAvailableLineWidthPx(activeStyle);
            const lines = text.split('\n');
            const hasLongLine = lines.some(line => line.length > limit);
            const estimatedLineCount = availableWidthPx > 0
                ? this.estimateWrappedLineCount(text, activeStyle, availableWidthPx)
                : 0;
            const visuallyOverflowing = estimatedLineCount > maxLines;
            if (hasLongLine || visuallyOverflowing) {
                this.errors.push({
                    index,
                    type: 'overflow',
                    message: window.i18n?.t('subtitle.qc.errors.overflow', { limit: limit }) || `Single line exceeds ${limit} characters`
                });
            }
        });

        console.log(`[SubtitleQC] Scan completed. Found ${this.errors.length} issues.`);
        return this.errors;
    }

    /**
     * 获取指定索引的错误
     */
    getErrorsByIndex(index) {
        return this.errors.filter(err => err.index === index);
    }

    getErrorIndexSet() {
        return new Set(this.errors.map((err) => err.index));
    }

    getErrorEntries() {
        return this.errors.map((error, queueIndex) => ({
            ...error,
            queueIndex,
            subtitle: this.editor.subtitles[error.index] || null,
            locked: !!this.editor.subtitles[error.index]?.locked
        }));
    }

    focusError(queueIndex) {
        if (!this.errors.length || queueIndex < 0 || queueIndex >= this.errors.length) return -1;
        this.currentIndex = queueIndex;
        const index = this.errors[queueIndex].index;
        this.editor.setActive(index, true);
        return index;
    }

    /**
     * 导航到下一个错误
     */
    nextError() {
        if (this.errors.length === 0) return -1;
        this.currentIndex = (this.currentIndex + 1) % this.errors.length;
        return this.focusError(this.currentIndex);
    }

    /**
     * 自动修复：对齐时间
     */
    fixOverlap(index) {
        const subs = this.editor.subtitles;
        if (index <= 0 || !subs[index] || this.editor.isSubtitleLocked?.(index)) return false;

        const prev = subs[index - 1];
        const sub = subs[index];

        this.editor.addToHistory();
        sub.start = prev.end;

        // 如果开始时间超过结束时间，则顺延结束时间
        if (sub.end <= sub.start) {
            sub.end = sub.start + 1.0;
        }

        this.editor.render(subs);
        this.runQC(); // 重新扫描
        this.editor.flow.updateSubtitlePreview();
        return true;
    }

    /**
     * 自动修复：延长显示时间
     */
    fixShort(index) {
        const sub = this.editor.subtitles[index];
        if (!sub || this.editor.isSubtitleLocked?.(index)) return false;

        this.editor.addToHistory();
        sub.end = sub.start + 1.0;

        this.editor.render(this.editor.subtitles);
        this.runQC();
        this.editor.flow.updateSubtitlePreview();
        return true;
    }

    /**
     * 自动修复：长句优化引擎 (支持 Split / Wrap / Scale 策略)
     */
    fixOverflow(index) {
        const f = this.editor.flow;
        const sub = this.editor.subtitles[index];
        if (!sub || this.editor.isSubtitleLocked?.(index)) return false;

        const strategy = f.lengthStrategy?.value || 'split';
        const limit = parseInt(f.maxChars?.value) || 25;
        const mainText = sub.translatedText || sub.text;

        if (mainText.length <= limit) return false;

        this.editor.addToHistory();

        if (strategy === 'split') {
            // --- 策略 1: 智能分条 (Split) ---
            const splitIndex = this._calculateSplitPoint(mainText);
            const part1 = mainText.slice(0, splitIndex).trim();
            const part2 = mainText.slice(splitIndex).trim();

            if (!part1 || !part2 || part1.length < 4 || part2.length < 4) {
                window.app.showToast(window.i18n?.t('subtitle.tooShortToSplit') || 'Sentence too short to split', 'warning');
                return false;
            }

            const ratio = part1.length / (part1.length + part2.length);
            const { sub1, sub2 } = this._splitSubtitleData(sub, ratio, part1, part2);
            this.editor.subtitles.splice(index, 1, sub1, sub2);
            window.app.showToast(window.i18n?.t('subtitle.splitSuccess') || 'Split into two subtitles successfully', 'success');
        }
        else if (strategy === 'wrap') {
            // --- 策略 2: 自动折行 (Wrap) ---
            const splitIndex = this._calculateSplitPoint(mainText);

            // 为主文本插入换行符
            const part1 = mainText.slice(0, splitIndex).trim();
            const part2 = mainText.slice(splitIndex).trim();
            const newText = `${part1}\n${part2}`;

            if (sub.translatedText) {
                sub.translatedText = newText;
                sub.text = sub.translatedText;
            } else {
                sub.text = newText;
            }

            // 同步为原文插入换行 (如果存在且较长)
            if (sub.originalText && sub.originalText.length > 5) {
                const ratio = part1.length / (part1.length + part2.length);
                const oLimit = Math.floor(sub.originalText.length * ratio);
                let oSplit = oLimit;
                if (!/[\u4e00-\u9fa5]/.test(sub.originalText)) {
                    const sp = sub.originalText.lastIndexOf(' ', oLimit + 8);
                    if (sp !== -1 && sp > oLimit - 12) oSplit = sp;
                }
                sub.originalText = `${sub.originalText.slice(0, oSplit).trim()}\n${sub.originalText.slice(oSplit).trim()}`;
            }
            window.app.showToast(window.i18n?.t('subtitle.newlineInserted') || 'Line break automatically inserted', 'success');
        }
        else {
            // --- 策略 3: 视觉缩放 (Scale) ---
            window.app.showToast(window.i18n?.t('subtitle.autoScaled') || 'Auto-scaled for display', 'info');
            return true;
        }

        // 刷新列表与预览
        this.editor.render(this.editor.subtitles);
        this.runQC();
        f.updateSubtitlePreview();
        return true;
    }

    /**
     * 全量自动优化：对整个数组进行遍历处理
     */
    autoSplitAll(subtitles) {
        if (!subtitles || subtitles.length === 0) return subtitles;

        const f = this.editor.flow;
        const strategy = f.lengthStrategy?.value || 'split';
        let limit = parseInt(f.maxChars?.value);
        const isCJK = subtitles.some(s => /[\u4e00-\u9fa5]/.test(s.translatedText || s.text));
        if (isNaN(limit) || limit <= 0) {
            limit = isCJK ? this.CONFIG.CHINESE_CHAR_LIMIT : this.CONFIG.ENGLISH_CHAR_LIMIT;
        }

        console.log(`[SubtitleQC] Auto-optimizing entire track with limit: ${limit}, strategy: ${strategy}`);

        let i = 0;
        let count = 0;
        while (i < subtitles.length) {
            const sub = subtitles[i];
            if (sub?.locked) {
                i++;
                continue;
            }
            const mainText = sub.translatedText || sub.text;

            if (mainText.length > limit) {
                const splitIndex = this._calculateSplitPoint(mainText);
                const part1 = mainText.slice(0, splitIndex).trim();
                const part2 = mainText.slice(splitIndex).trim();

                // 防粉碎保护
                if (part1 && part2 && part1.length >= 4 && part2.length >= 4) {
                    if (strategy === 'split') {
                        const ratio = part1.length / (part1.length + part2.length);
                        const { sub1, sub2 } = this._splitSubtitleData(sub, ratio, part1, part2);
                        subtitles.splice(i, 1, sub1, sub2);
                        count++;
                        continue; // 继续检查新生成的项
                    } else if (strategy === 'wrap') {
                        // 换行模式：原地修改
                        sub.text = `${part1}\n${part2}`;
                        if (sub.translatedText) sub.translatedText = sub.text;

                        // 同步为原文插入换行 (如果存在且较长)
                        if (sub.originalText && sub.originalText.length > 5) {
                            const ratio = part1.length / (part1.length + part2.length);
                            const oLimit = Math.floor(sub.originalText.length * ratio);
                            let oSplit = oLimit;
                            if (!/[\u4e00-\u9fa5]/.test(sub.originalText)) {
                                const sp = sub.originalText.lastIndexOf(' ', oLimit + 8);
                                if (sp !== -1 && sp > oLimit - 12) oSplit = sp;
                            }
                            sub.originalText = `${sub.originalText.slice(0, oSplit).trim()}\n${sub.originalText.slice(oSplit).trim()}`;
                        }
                        count++;
                    }
                }
            }
            i++;
        }

        if (count > 0) console.log(`[SubtitleQC] Auto-Optimize (${strategy}) finished. Processed ${count} items.`);
        return subtitles;
    }

    /**
     * 核心逻辑：执行字幕数据对象的物理切割
     * 确保原文、译文和显示文本同步比例拆分
     */
    _splitSubtitleData(sub, ratio, mainPart1, mainPart2) {
        const totalDuration = sub.end - sub.start;
        const midTime = sub.start + (totalDuration * ratio);
        const clean = (t) => t ? t.replace(/\n/g, ' ').trim() : '';

        // 创建副本
        const sub1 = { ...sub, end: midTime };
        const sub2 = { ...sub, start: midTime, id: Date.now() + Math.random(), audioPath: null };

        // 1. 同步拆分原文 (如果有)
        if (sub.originalText && sub.originalText.length > 5) {
            const origLimit = Math.floor(sub.originalText.length * ratio);
            let origSplitIndex = origLimit;

            // 针对非 CJK 语系优化原文拆分点：寻找最近的空格
            if (!/[\u4e00-\u9fa5]/.test(sub.originalText)) {
                // 搜索范围稍微拓宽一点，优先找单词边界
                const spacePos = sub.originalText.lastIndexOf(' ', origLimit + 10);
                if (spacePos !== -1 && spacePos > origLimit - 15) {
                    origSplitIndex = spacePos;
                }
            }

            // 物理切割：第一部分取到 index，第二部分从 index+1 开始（跳过那个空格）
            // 如果 origSplitIndex 刚好指向空格，跳过它防止第二段开头带空格或重复
            const leftPart = sub.originalText.slice(0, origSplitIndex);
            // 关键：如果切割点在空格，sub2 应该从空格后一个字开始，彻底杜绝词语重复
            const skip = sub.originalText[origSplitIndex] === ' ' ? 1 : 0;
            const rightPart = sub.originalText.slice(origSplitIndex + skip);

            sub1.originalText = clean(leftPart);
            sub2.originalText = clean(rightPart);
        } else {
            sub1.originalText = null;
            sub2.originalText = null;
        }

        // 2. 更新译文/显示文本 (传入的 mainPart1/2 已经是由 slice 产生的互斥切片)
        if (sub.translatedText) {
            sub1.translatedText = clean(mainPart1);
            sub2.translatedText = clean(mainPart2);
            sub1.text = sub1.translatedText;
            sub2.text = sub2.translatedText;
        } else {
            sub1.text = clean(mainPart1);
            sub2.text = clean(mainPart2);
            if (!sub.originalText) {
                sub1.originalText = sub1.text;
                sub2.originalText = sub2.text;
            }
        }

        return { sub1, sub2 };
    }

    /**
     * 内部辅助：计算拆分点
     * 确保返回的索引能够物理切分字符串且不产生重复
     */
    _calculateSplitPoint(text) {
        let splitIndex = Math.ceil(text.length / 2);
        if (!/[\u4e00-\u9fa5]/.test(text)) {
            // 在中间点附近 12 个字符范围内找最后一个空格
            const spacePos = text.lastIndexOf(' ', splitIndex + 12);
            // 如果找到了合理的空格位置，则以此为切割锚点
            if (spacePos !== -1 && spacePos > splitIndex - 12) {
                return spacePos;
            }
        }
        return splitIndex;
    }
}

window.SubtitleQualityHandler = SubtitleQualityHandler;
