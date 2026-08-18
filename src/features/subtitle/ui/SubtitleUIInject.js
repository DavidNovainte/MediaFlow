/**
 * SubtitleUIInject.js
 * 
 * 处理纯文本注入（Srt/Txt/Excel 剪贴板快速粘贴）的 Modal UI。
 */

class SubtitleUIInject extends window.SubtitleUIBase {
    constructor(flow) {
        super(flow);
        this.bindEvents = this.bindEvents.bind(this);
    }

    translateOrFallback(key, fallback) {
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : fallback;
    }

    bindEvents() {
        const injectBtn = document.getElementById('inject-text-btn');
        if (injectBtn) {
            injectBtn.addEventListener('click', () => this.showInjectionModal());
        }

        // 监听语言变更事件，重置模态框
        window.addEventListener('languageChanged', () => {
            const oldModal = document.getElementById('text-injection-modal');
            if (oldModal) {
                oldModal.remove();
            }
        });
    }

    // ----------------- 文本注入模态框 (Injection Modal) -----------------
    /**
     * 显示文本注入模态框
     */
    showInjectionModal() {
        this.renderInjectionModal();
        const modal = document.getElementById('text-injection-modal');
        if (modal) {
            modal.classList.add('show');
            // Auto focus
            setTimeout(() => {
                const ta = modal.querySelector('textarea');
                if (ta) ta.focus();
            }, 100);
        }
    }

    renderInjectionModal() {
        let modal = document.getElementById('text-injection-modal');
        if (modal) {
            // 如果已经存在且语言已变，则先移除旧的以重新生成
            modal.remove();
            modal = null;
        }

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'text-injection-modal';
            modal.className = 'inj-backdrop';

            // 计算建议平均时长：总视频时长 / 文本行数（这里用默认每句 3 秒，等用户输入后再算）
            const defaultDuration = 3.0;

            modal.innerHTML = `
                <div class="inj-dialog glass-panel">
                    <div class="inj-header">
                        <h3><span class="icon">📝</span> ${window.i18n.t('subtitle.quick_inject.title')}</h3>
                        <button class="close-btn" title="${window.i18n.t('subtitle.crop.cancel')}">&times;</button>
                    </div>
                    <div class="inj-body">
                        <div class="injection-modes">
                            <label class="radio-card active">
                                <input type="radio" name="inject-mode" value="original-only" checked>
                                <div class="card-content">
                                    <span class="icon">📄</span>
                                    <span class="title">${window.i18n.t('subtitle.quick_inject.mode_original')}</span>
                                    <span class="desc">${window.i18n.t('subtitle.quick_inject.mode_original_desc')}</span>
                                </div>
                            </label>
                            <label class="radio-card">
                                <input type="radio" name="inject-mode" value="translation-only">
                                <div class="card-content">
                                    <span class="icon">🎯</span>
                                    <span class="title">${window.i18n.t('subtitle.quick_inject.mode_translation')}</span>
                                    <span class="desc">${window.i18n.t('subtitle.quick_inject.mode_translation_desc')}</span>
                                </div>
                            </label>
                            <label class="radio-card">
                                <input type="radio" name="inject-mode" value="bilingual">
                                <div class="card-content">
                                    <span class="icon">🌐</span>
                                    <span class="title">${window.i18n.t('subtitle.quick_inject.mode_bilingual')}</span>
                                    <span class="desc">${window.i18n.t('subtitle.quick_inject.mode_bilingual_desc')}</span>
                                </div>
                            </label>
                        </div>
                        <div class="injection-options">
                            <div class="input-group">
                                <label>${window.i18n.t('subtitle.quick_inject.default_duration')}</label>
                                <input type="number" id="inject-default-duration" value="${defaultDuration}" min="0.5" step="0.5" class="param-input">
                            </div>
                        </div>
                        <div class="injection-area">
                            <textarea id="injection-textarea" placeholder="${window.i18n.t('subtitle.quick_inject.placeholder')}" spellcheck="false"></textarea>
                        </div>
                    </div>
                    <div class="inj-footer">
                        <div class="stats"><span id="inject-line-count">0</span> ${window.i18n.t('subtitle.quick_inject.stats').replace('{count}', '')}</div>
                        <div class="actions">
                            <button class="btn secondary cancel-inject-btn">${window.i18n.t('subtitle.quick_inject.cancel')}</button>
                            <button class="btn primary confirm-inject-btn">${window.i18n.t('subtitle.quick_inject.confirm')}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);


            // Bind events for the modal
            const closeBtn = modal.querySelector('.close-btn');
            const cancelBtn = modal.querySelector('.cancel-inject-btn');
            const confirmBtn = modal.querySelector('.confirm-inject-btn');
            const textarea = modal.querySelector('#injection-textarea');
            const countSpan = modal.querySelector('#inject-line-count');
            const radioCards = modal.querySelectorAll('.radio-card');
            const durationInput = modal.querySelector('#inject-default-duration');

            const closeModal = () => {
                modal.classList.remove('show');
                textarea.value = '';
                countSpan.innerText = '0';
            };

            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            radioCards.forEach(card => {
                const radio = card.querySelector('input');
                radio.addEventListener('change', () => {
                    radioCards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
            });

            textarea.addEventListener('input', () => {
                const lines = textarea.value.split('\n').filter(line => line.trim().length > 0);
                countSpan.innerText = lines.length;
            });

            confirmBtn.onclick = () => {
                const text = textarea.value;
                const mode = modal.querySelector('input[name="inject-mode"]:checked').value;
                const duration = parseFloat(durationInput.value) || 3.0;

                if (text.trim().length === 0) {
                    this.showInjectionWarning(window.i18n.t('subtitle.quick_inject.empty_error'));
                    return;
                }

                const injected = this.handleInjection(text, mode, duration);
                if (injected) {
                    closeModal();
                }
            };
        }
    }

    /**
     * 将长文本按标点符号拆分为句子，确保单条字幕长度适中
     */
    splitIntoSentences(text) {
        if (!text) return [];
        // 按换行符初步拆分
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const result = [];

        for (const line of lines) {
            // 如果单行包含多个句子（基于常见标点），进一步拆分
            // 匹配 . ? ! 。 ？ ！ 后面跟着空格或直接结尾
            const sentences = line.split(/([.!?。！？]\s*)/).reduce((acc, part, i) => {
                if (i % 2 === 0) {
                    if (part.trim()) acc.push(part.trim());
                } else if (acc.length > 0) {
                    // 将标点符号拼回到上一句末尾
                    acc[acc.length - 1] += part.trim();
                }
                return acc;
            }, []);

            if (sentences.length === 0 && line.trim()) {
                result.push(line.trim());
            } else {
                result.push(...sentences);
            }
        }
        return result.filter(s => s.length > 0);
    }

    parseInjectTimeToken(value) {
        const normalized = String(value || '').trim().replace(',', '.');
        if (!normalized) return null;

        const parts = normalized.split(':').map((part) => part.trim());
        if (!parts.length || parts.some((part) => part === '')) return null;

        const numericParts = parts.map((part) => Number(part));
        if (numericParts.some((part) => !Number.isFinite(part) || part < 0)) return null;

        if (numericParts.length === 3) {
            return (numericParts[0] * 3600) + (numericParts[1] * 60) + numericParts[2];
        }

        if (numericParts.length === 2) {
            return (numericParts[0] * 60) + numericParts[1];
        }

        if (numericParts.length === 1) {
            return numericParts[0];
        }

        return null;
    }

    parseTimedInjectionLine(line) {
        const trimmed = String(line || '').trim();
        if (!trimmed) return null;

        const match = trimmed.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*(?:-->|[-–—])\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)(?:\s+|\t+)(.+)$/);
        if (!match) return null;

        const start = this.parseInjectTimeToken(match[1]);
        const end = this.parseInjectTimeToken(match[2]);
        const payload = String(match[3] || '').trim();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !payload) {
            return null;
        }

        const columns = payload.split('\t').map((segment) => segment.trim()).filter(Boolean);

        return {
            start,
            end,
            payload,
            columns
        };
    }

    createInjectedSubtitle({ id, start, end, mode, payload, columns }) {
        let originalText = '';
        let translatedText = '';

        if (mode === 'bilingual') {
            originalText = columns[0] || payload;
            translatedText = columns.length > 1 ? columns.slice(1).join(' ') : '';
        } else if (mode === 'original-only') {
            originalText = payload;
        } else if (mode === 'translation-only') {
            translatedText = payload;
        }

        return {
            id,
            start,
            end,
            originalText,
            translatedText,
            text: translatedText ? `${originalText}\n${translatedText}` : (originalText || translatedText || payload),
            ttsSource: 'original'
        };
    }

    showInjectionWarning(message) {
        if (window.mediaflow?.dialog?.showMessageBox) {
            window.mediaflow.dialog.showMessageBox({
                type: 'warning',
                title: this.translateOrFallback('subtitle.quick_inject.title', 'Quick Text Inject'),
                message
            });
            return;
        }

        window.app?.showToast?.(message, 'warning');
    }

    /**
     * 处理用户输入的注入文本
     */
    handleInjection(text, mode, defaultDuration = 3.0) {
        const rawLines = text.split('\n').filter(l => l.trim().length > 0).map(l => l.trim());
        if (rawLines.length === 0) return false;

        const timedLinePrefixPattern = /^((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*(?:-->|[-–—])/;
        const timedCandidates = rawLines.filter((line) => timedLinePrefixPattern.test(line));
        const parsedTimedLines = rawLines.map((line) => this.parseTimedInjectionLine(line));
        const useTimedLayout = rawLines.length > 0 && parsedTimedLines.every(Boolean);

        if (!useTimedLayout && timedCandidates.length > 0) {
            this.showInjectionWarning(this.translateOrFallback(
                'subtitle.quick_inject.timecode_error',
                'Detected timed subtitle lines, but some rows could not be parsed. Use the format 00:00-00:03<TAB>Subtitle text.'
            ));
            return false;
        }

        // --- 核心修复：按标点符号智能拆分 ---
        // 双语模式按行配对，不进行二次句法拆分（避免打乱配对）；单语模式则进行智能拆分。
        let processedLines = [];
        if (useTimedLayout) {
            processedLines = parsedTimedLines;
        } else if (mode === 'bilingual') {
            processedLines = rawLines;
        } else {
            processedLines = this.splitIntoSentences(text);
        }

        if (processedLines.length === 0) return false;

        // 记录历史
        if (this.flow.editor) this.flow.editor.addToHistory();

        const newItems = [];
        let currentTime = 0;

        // --- 核心修复：获取当前激活轨道并同步更新 ---
        const activeTrackId = this.flow.trackManager?.activeTrackId;
        const activeTrack = this.flow.trackManager?.tracks.find(t => t.id === activeTrackId);
        
        if (!activeTrack) {
            console.error('[SubtitleUIInject] No active track found for injection');
            return false;
        }

        // 如果轨道已有字幕，从末尾开始追加
        if (activeTrack.subtitles && activeTrack.subtitles.length > 0) {
            currentTime = activeTrack.subtitles[activeTrack.subtitles.length - 1].end;
        }

        if (useTimedLayout) {
            for (let i = 0; i < processedLines.length; i += 1) {
                newItems.push(this.createInjectedSubtitle({
                    id: Date.now() + i,
                    start: processedLines[i].start,
                    end: processedLines[i].end,
                    mode,
                    payload: processedLines[i].payload,
                    columns: processedLines[i].columns
                }));
            }
        } else if (mode === 'bilingual') {
            // 双语模式：两行为一组
            for (let i = 0; i < processedLines.length; i += 2) {
                const original = processedLines[i] || '';
                const translation = processedLines[i + 1] || '';
                if (!original && !translation) continue;

                newItems.push({
                    id: Date.now() + i,
                    start: currentTime,
                    end: currentTime + defaultDuration,
                    originalText: original,
                    translatedText: translation,
                    text: translation ? `${original}\n${translation}` : original,
                    ttsSource: 'original'
                });
                currentTime += defaultDuration;
            }
        } else {
            // 单语模式：一行一句
            for (let i = 0; i < processedLines.length; i++) {
                const line = processedLines[i];
                newItems.push({
                    id: Date.now() + i,
                    start: currentTime,
                    end: currentTime + defaultDuration,
                    originalText: mode === 'original-only' ? line : '',
                    translatedText: mode === 'translation-only' ? line : '',
                    text: line,
                    ttsSource: 'original'
                });
                currentTime += defaultDuration;
            }
        }

        if (newItems.length > 0) {
            // --- 核心修复：直接更新轨道数据并确保引用正确 ---
            activeTrack.subtitles = [...(activeTrack.subtitles || []), ...newItems];
            let editorRendered = false;
            
            // 同步更新编辑器的数据引用
            if (this.flow.editor) {
                this.flow.editor.subtitles = activeTrack.subtitles;
                this.flow.editor.render();
                this.flow.editor.addToHistory();
                editorRendered = true;
            }

            // --- 核心修复：强制刷新所有相关组件 ---
            if (this.flow.trackManager) this.flow.trackManager.renderTracks();
            if (!editorRendered && this.flow.timeline) this.flow.timeline.render();
            if (this.flow.updateSubtitlePreview) this.flow.updateSubtitlePreview();

            // 更新 UI 模式
            if (this.flow.uiManager) {
                this.flow.uiManager.updateInputModeUI(mode);
            }

            // 滚动到底部
            const listContainer = document.getElementById('subtitle-list-container');
            if (listContainer) {
                setTimeout(() => {
                    listContainer.scrollTop = listContainer.scrollHeight;
                }, 150);
            }

            console.log(`[SubtitleUIInject] Injected ${newItems.length} items to track: ${activeTrack.name}`);
            window.app?.showToast?.(window.i18n.t('subtitle.quick_inject.success').replace('{count}', newItems.length), 'success');
            return true;
        }

        return false;
    }
}

window.SubtitleUIInject = SubtitleUIInject;
