class SubtitleListRenderer {
    constructor(editor) {
        this.editor = editor;
        this.container = null;
        this.listContent = null;
        this.virtualShim = null; // 鍗犱綅灞傦紝璐熻矗鎾戝紑楂樺害

        // 铏氭嫙婊氬姩閰嶇疆
        this.BUFFER = 5;        // 涓婁笅缂撳啿鍖烘暟閲?
        this.subtitles = [];    // 缂撳瓨瀛楀箷鏁版嵁
        this.entries = [];      // 褰撳墠杩囨护瑙嗗浘涓殑瀛楀箷鏉＄洰 { sub, index }
        this.entryHeights = [];
        this.entryOffsets = [];
        this.totalContentHeight = 0;

        this.startIndex = 0;
        this.endIndex = 0;
        this._isInteracting = false; // 璁板綍鐢ㄦ埛鏄惁姝ｅ湪杈撳叆锛岄槻姝㈤噸缁橀棯鐑?
        this.textLayoutMode = 'stacked';
        this._effectiveTextLayoutMode = 'stacked';
        this.MIN_SPLIT_LAYOUT_WIDTH = 560;
        this._resizeObserver = null;
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
    }

    translateOrFallback(key, fallback, params) {
        const translated = window.i18n?.t?.(key, params);
        return translated && translated !== key ? translated : fallback;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeAttribute(value) {
        return this.escapeHtml(value);
    }

    sanitizeClassName(value) {
        return String(value ?? '').replace(/[^a-z0-9_-]/gi, '') || 'neutral';
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    get ITEM_GAP() {
        if (this.isCompactListPanel()) return this.editor.viewMode === 'lite' ? 4 : 6;
        return this.editor.viewMode === 'lite' ? 12 : 16;
    }

    getRenderModeKey() {
        return this.editor.viewMode === 'lite' ? 'lite' : 'full';
    }

    get ITEM_CARD_HEIGHT() {
        return this.getDefaultCardHeight();
    }

    /** Left list panel is ~300px — use dense cards so one cue is not a full screen. */
    isCompactListPanel() {
        const w = this.container?.clientWidth || 0;
        if (w > 0 && w < 420) return true;
        return !!this.container?.closest?.('#subtitle-list-aside, .list-aside-pro');
    }

    getDefaultCardHeight() {
        const isLite = this.editor.viewMode === 'lite';
        const compact = this.isCompactListPanel();
        const showOrig = this.editor.showOriginal;
        const showTrans = this.editor.showTranslation;
        const visibleLines = (showOrig ? 1 : 0) + (showTrans ? 1 : 0);
        const hasAudio = this.editor.flow?.trackManager?.tracks.some(t => t.type === 'audio' && t.visible !== false);
        const audioH = hasAudio ? (compact ? 32 : 46) : 0;
        const isSplitLayout = !isLite && this._effectiveTextLayoutMode === 'split';

        if (isLite) {
            return (visibleLines === 0 ? 32 : (compact ? 30 : 36) * visibleLines + (compact ? 8 : 12)) + audioH;
        }

        // Compact left rail: tight fit — header + short fields, no dead bottom space
        if (compact) {
            if (visibleLines === 0) return 36 + audioH;
            if (visibleLines === 1) return 63 + audioH;
            return 92 + audioH;
        }

        let baseH = 212;
        if (visibleLines === 1) {
            baseH = isSplitLayout ? 136 : 152;
        } else if (visibleLines === 0) {
            baseH = 120;
        } else if (isSplitLayout) {
            baseH = 148;
        }

        return baseH + audioH;
    }

    // 鍔ㄦ€佽幏鍙栧崟椤归珮搴?
    get ITEM_HEIGHT() {
        return this.ITEM_CARD_HEIGHT + this.ITEM_GAP;
    }

    getVisibleTextCount() {
        return (this.editor.showOriginal ? 1 : 0) + (this.editor.showTranslation ? 1 : 0);
    }

    getApproxTextColumnWidth() {
        const containerWidth = Math.max(this.container?.clientWidth || 0, 420);

        if (this._effectiveTextLayoutMode === 'split' && this.editor?.viewMode !== 'lite') {
            return Math.max((containerWidth - 420) / 2, 150);
        }

        return Math.max(containerWidth - 250, 220);
    }

    getWeightedTextLength(text) {
        return Array.from(text || '').reduce((total, char) => {
            if (char === '\n' || char === '\r') return total;
            if (/\s/.test(char)) return total + 0.35;
            return total + (char.charCodeAt(0) <= 127 ? 0.55 : 1);
        }, 0);
    }

    estimateTextLines(text, approxCharsPerLine) {
        if (!text) return 1;

        const safeCharsPerLine = Math.max(approxCharsPerLine || 1, 1);
        return String(text)
            .split(/\r?\n/)
            .reduce((lines, segment) => lines + Math.max(1, Math.ceil(this.getWeightedTextLength(segment) / safeCharsPerLine)), 0);
    }

    getEstimatedTextHeightExtra(sub) {
        if (this.editor.viewMode === 'lite') {
            return 0;
        }

        const visibleTextCount = this.getVisibleTextCount();
        if (visibleTextCount === 0) {
            return 0;
        }

        const compact = this.isCompactListPanel();
        // Compact fields are deliberately single-line; text length must not
        // inflate the virtual card height.
        if (compact) return 0;

        const columnWidth = this.getApproxTextColumnWidth();
        const originalCharsPerLine = Math.max(compact ? 10 : 12, Math.floor(columnWidth / (compact ? 8 : 9)));
        const translatedCharsPerLine = Math.max(compact ? 10 : 12, Math.floor(columnWidth / (compact ? 7 : 8)));
        const originalLines = this.editor.showOriginal
            ? this.estimateTextLines(this.getOriginalText(sub), originalCharsPerLine)
            : 0;
        const translatedLines = this.editor.showTranslation
            ? this.estimateTextLines(this.getTranslatedText(sub), translatedCharsPerLine)
            : 0;
        // Compact left rail keeps short fields; only grow for multi-line content
        const lineH = compact ? 14 : 18;
        const lineHTrans = compact ? 14 : 20;
        const originalExtra = Math.max(0, originalLines - 1) * lineH;
        const translatedExtra = Math.max(0, translatedLines - 1) * lineHTrans;
        const extra = this._effectiveTextLayoutMode === 'split'
            ? Math.max(originalExtra, translatedExtra)
            : (originalExtra + translatedExtra);
        return compact ? Math.min(extra, 48) : extra;
    }

    getEstimatedHeaderHeightExtra() {
        if (this.editor.viewMode === 'lite') {
            return 0;
        }

        // Compact cards force a single header row — no wrap budget
        if (this.isCompactListPanel()) {
            return 0;
        }

        const containerWidth = this.container?.clientWidth || 0;
        if (!containerWidth) {
            return 0;
        }

        if (this._effectiveTextLayoutMode === 'split') {
            return containerWidth < 860 ? 12 : 0;
        }

        return containerWidth < 960 ? 20 : 0;
    }

    getEntryCardHeight(entry) {
        const sub = entry?.sub || entry;
        const baseHeight = this.getDefaultCardHeight();
        const extraHeight = this.getEstimatedHeaderHeightExtra() + this.getEstimatedTextHeightExtra(sub);
        const cap = this.isCompactListPanel() ? 200 : 360;
        return Math.max(baseHeight, Math.min(baseHeight + extraHeight, cap));
    }

    getEntryHeightAt(entryIndex) {
        return this.entryHeights[entryIndex] || this.ITEM_HEIGHT;
    }

    rebuildEntryOffsets() {
        let runningOffset = 0;
        this.entryOffsets = this.entryHeights.map((height) => {
            const current = runningOffset;
            runningOffset += height;
            return current;
        });
        this.totalContentHeight = runningOffset;
    }

    refreshEntryMetrics() {
        this.entryHeights = this.entries.map((entry) => this.getEntryCardHeight(entry) + this.ITEM_GAP);
        this.rebuildEntryOffsets();
    }

    findEntryIndexAtOffset(offset) {
        if (!this.entryHeights.length) {
            return 0;
        }

        const targetOffset = Math.max(0, offset);
        let low = 0;
        let high = this.entryOffsets.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const start = this.entryOffsets[mid];
            const end = start + this.entryHeights[mid];

            if (targetOffset < start) {
                high = mid - 1;
            } else if (targetOffset >= end) {
                low = mid + 1;
            } else {
                return mid;
            }
        }

        return Math.max(0, Math.min(this.entryHeights.length - 1, low));
    }

    applyItemHeight(item, renderedEntryIndex) {
        const itemHeight = Math.max(32, this.getEntryHeightAt(renderedEntryIndex) - this.ITEM_GAP);
        item.style.setProperty('--subtitle-item-height', `${itemHeight}px`);
    }

    measureItemCardHeight(item, renderedEntryIndex) {
        if (!item) return null;

        // Compact rail: trust virtual metrics so empty/short cues stay dense
        if (this.isCompactListPanel() && this.editor.viewMode !== 'lite') {
            return this.getEntryCardHeight(this.entries[renderedEntryIndex]);
        }

        const previousHeight = item.style.height;
        item.style.height = 'auto';
        const measuredCardHeight = Math.ceil(item.scrollHeight || item.getBoundingClientRect().height || 0);
        item.style.height = previousHeight;

        const minimumCardHeight = Math.max(this.getDefaultCardHeight(), this.getEntryCardHeight(this.entries[renderedEntryIndex]));
        return Math.max(minimumCardHeight, measuredCardHeight);
    }

    syncMeasuredVisibleHeights(visibleEntries) {
        let hasChanges = false;

        visibleEntries.forEach((entry, visibleIndex) => {
            const renderedEntryIndex = this.startIndex + visibleIndex;
            const item = this.listContent.children[visibleIndex];
            if (!item) return;

            const measuredCardHeight = this.measureItemCardHeight(item, renderedEntryIndex);
            const nextHeight = measuredCardHeight + this.ITEM_GAP;
            if (Math.abs(nextHeight - this.getEntryHeightAt(renderedEntryIndex)) > 1) {
                this.entryHeights[renderedEntryIndex] = nextHeight;
                hasChanges = true;
            }
        });

        if (!hasChanges) {
            return;
        }

        this.rebuildEntryOffsets();
        if (this.virtualShim) {
            this.virtualShim.style.height = `${this.totalContentHeight}px`;
        }
        this.updateVisibleRange(true);
    }

    init(container) {
        this.container = container;
        if (!this.container) return;

        // 鍒濆鍖栫粨鏋?
        this.container.innerHTML = `
            <div class="virtual-shim" style="position: relative; width: 100%;">
                <div class="subtitle-editor-list" id="subtitle-list-content" style="position: absolute; top: 0; left: 0; width: 100%;"></div>
            </div>
        `;

        this.virtualShim = this.container.querySelector('.virtual-shim');
        this.listContent = document.getElementById('subtitle-list-content');

        // 缁戝畾婊氬姩浜嬩欢 (绉婚櫎 >20 鐨勭‖闄愬埗锛岀‘淇濆缁堝搷搴?
        this.container.addEventListener('scroll', () => {
            this.closeSecondaryActionMenus();
            this.updateVisibleRange();
        }, { passive: true });

        if (!this._documentClickBound) {
            document.addEventListener('click', this.handleDocumentClick);
            this._documentClickBound = true;
        }

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => {
                this.refreshTextLayoutMode();
                this.syncAdaptiveActionLayouts();
                // Width change can flip compact/full card density
                if (this.entries?.length) {
                    this.refreshEntryMetrics();
                    if (this.virtualShim) {
                        this.virtualShim.style.height = `${this.totalContentHeight}px`;
                    }
                    this.updateVisibleRange(true);
                }
            });
            this._resizeObserver.observe(this.container);
        }

        this.applyTextLayoutMode(this.editor?.textLayoutMode || 'stacked');

        this.initialized = true;
    }

    applyTextLayoutMode(mode) {
        this.textLayoutMode = mode === 'split' ? 'split' : 'stacked';
        this.refreshTextLayoutMode();
    }

    refreshTextLayoutMode() {
        if (!this.container) return;

        const prevEffectiveMode = this._effectiveTextLayoutMode;

        const effectiveMode = this.textLayoutMode === 'split'
            && this.editor?.viewMode !== 'lite'
            && this.container.clientWidth >= this.MIN_SPLIT_LAYOUT_WIDTH
            ? 'split'
            : 'stacked';

        this._effectiveTextLayoutMode = effectiveMode;
        this.container.dataset.textLayoutPreference = this.textLayoutMode;
        this.container.dataset.textLayoutEffective = effectiveMode;
        this.container.classList.toggle('subtitle-layout-split', effectiveMode === 'split');
        this.container.classList.toggle('subtitle-layout-stacked', effectiveMode !== 'split');
        this.container.style.setProperty('--subtitle-item-height', `${this.ITEM_CARD_HEIGHT}px`);
        this.container.style.setProperty('--subtitle-item-gap', `${this.ITEM_GAP}px`);

        if (this.initialized) {
            this.refreshEntryMetrics();
            if (this.virtualShim) {
                this.virtualShim.style.height = `${this.totalContentHeight}px`;
            }
            if (prevEffectiveMode !== effectiveMode) {
                this.updateVisibleRange(true);
            }
        }
    }

    /**
     * 娓叉煋鎺у埗涓績
     */
    render(subtitles) {
        console.log('[SubtitleListRenderer] render() called. Subtitles count:', subtitles?.length, 'Initialized:', this.initialized, 'Container:', !!this.container);
        if (!this.container || !this.initialized) {
            console.warn('[SubtitleListRenderer] Skipping render: container or initialized missing');
            return;
        }
        this.refreshTextLayoutMode();
        if (subtitles) {
            this.subtitles = this.editor?.normalizeSubtitles ? this.editor.normalizeSubtitles(subtitles) : subtitles;
            // 濡傛灉浼犲叆浜嗘暟鎹紙閫氬父鏄姞杞芥垨鎾ら攢閲嶅仛锛夛紝鍒欏己鍒跺埛鏂版墍鏈?DOM锛屽寘鎷劍鐐归」
            this._forceRefreshFocused = true;
        }

        this.entries = this.editor?.getFilteredSubtitleEntries
            ? this.editor.getFilteredSubtitleEntries()
            : this.subtitles.map((sub, index) => ({ sub, index }));
        const emptyStateMessage = this.subtitles.length === 0
            ? window.i18n.t('subtitle.editor.no_data')
            : this.translateOrFallback('subtitle.editor.no_filter_match', '褰撳墠绛涢€変笅娌℃湁瀛楀箷');

        // 鏇存柊鎬婚珮搴?
        this.refreshEntryMetrics();
        const totalHeight = this.totalContentHeight;
        console.log('[SubtitleListRenderer] Total height calculated:', totalHeight, 'px');
        this.virtualShim.style.height = `${totalHeight}px`;

        if (this.entries.length === 0) {
            console.log('[SubtitleListRenderer] No data to render. Showing empty state.');
            // Keep shim tall enough so guided empty content is not clipped
            this.virtualShim.style.height = `${Math.max(this.container?.clientHeight || 240, 240)}px`;
            this.listContent.style.transform = 'translateY(0)';
            this.renderEmptyState(emptyStateMessage, this.subtitles.length === 0);
            this._forceRefreshFocused = false;
            return;
        }

        document.getElementById('subtitle-list-aside')?.classList.remove('list-is-empty');
        console.log('[SubtitleListRenderer] Updating visible range...');
        this.updateVisibleRange(true);
        this._forceRefreshFocused = false;
    }

    /**
     * Quiet empty state. Action order depends on context (no media / has media / filter).
     */
    renderEmptyState(message, isTrulyEmpty) {
        const t = (key, fallback) => {
            const v = window.i18n?.t?.(key);
            return v && v !== key ? v : fallback;
        };

        const hasVideo = !!(this.editor?.flow?.videoFile || this.editor?.flow?.videoPlayer?.src);

        let title;
        let hint;
        let actionDefs;

        if (!isTrulyEmpty) {
            title = t('subtitle.editor.no_filter_match_title', '当前筛选无结果');
            hint = t('subtitle.editor.no_filter_match_hint_short', '换个筛选条件试试');
            actionDefs = [
                {
                    action: 'clear-filter',
                    primary: true,
                    icon: 'fa-filter-circle-xmark',
                    label: t('subtitle.editor.empty_clear_filter', '显示全部'),
                    desc: t('subtitle.editor.empty_clear_filter_desc', '清除当前筛选')
                }
            ];
        } else if (hasVideo) {
            // Media ready — recognition is the natural next step
            title = t('subtitle.editor.empty_title_ready', '媒体已就绪');
            hint = t('subtitle.editor.empty_hint_ready', '可以识别字幕，或手动添加');
            actionDefs = [
                {
                    action: 'ai',
                    primary: true,
                    icon: 'fa-wand-sparkles',
                    label: t('subtitle.editor.empty_ai', '智能识别'),
                    desc: t('subtitle.editor.empty_ai_desc', '自动生成字幕与翻译')
                },
                {
                    action: 'add',
                    primary: false,
                    icon: 'fa-plus',
                    label: t('subtitle.editor.empty_add', '添加字幕'),
                    desc: t('subtitle.editor.empty_add_desc', '手动写入一条')
                },
                {
                    action: 'import-srt',
                    primary: false,
                    icon: 'fa-file-import',
                    label: t('subtitle.editor.empty_import_srt', '导入字幕'),
                    desc: t('subtitle.editor.empty_import_srt_desc', 'SRT / ASS / VTT')
                },
                {
                    action: 'clear-media',
                    primary: false,
                    icon: 'fa-trash-can',
                    label: t('subtitle.editor.empty_clear_media', '清除媒体'),
                    desc: t('subtitle.editor.empty_clear_media_desc', '移除视频，回到空白项目')
                }
            ];
        } else {
            title = t('subtitle.editor.empty_title', '还没有字幕');
            hint = t('subtitle.editor.empty_hint_short', '从导入或识别开始');
            actionDefs = [
                {
                    action: 'import-video',
                    primary: true,
                    icon: 'fa-file-video',
                    label: t('subtitle.editor.empty_import', '导入视频'),
                    desc: t('subtitle.editor.empty_import_desc', '选择本地媒体文件')
                },
                {
                    action: 'ai',
                    primary: false,
                    icon: 'fa-wand-sparkles',
                    label: t('subtitle.editor.empty_ai', '智能识别'),
                    desc: t('subtitle.editor.empty_ai_desc', '需先有媒体文件')
                },
                {
                    action: 'add',
                    primary: false,
                    icon: 'fa-plus',
                    label: t('subtitle.editor.empty_add', '添加字幕'),
                    desc: t('subtitle.editor.empty_add_desc', '手动写入一条')
                }
            ];
        }

        const actionsHtml = `
            <div class="empty-state-actions" role="list">
                ${actionDefs.map((a) => `
                <button type="button" class="empty-action ${a.primary ? 'is-primary' : ''}" data-empty-action="${a.action}" role="listitem">
                    <span class="empty-action-icon"><i class="fa-solid ${a.icon}"></i></span>
                    <span class="empty-action-text">
                        <span class="empty-action-label">${this.escapeHtml(a.label)}</span>
                        <span class="empty-action-desc">${this.escapeHtml(a.desc)}</span>
                    </span>
                    <i class="fa-solid fa-chevron-right empty-action-chevron" aria-hidden="true"></i>
                </button>`).join('')}
            </div>`;

        this.listContent.innerHTML = `
            <div class="empty-state-guided">
                <div class="empty-state-icon-wrap" aria-hidden="true">
                    <i class="fa-solid fa-closed-captioning"></i>
                </div>
                <p class="empty-state-title">${this.escapeHtml(title)}</p>
                <p class="empty-state-hint">${this.escapeHtml(hint)}</p>
                ${actionsHtml}
            </div>`;

        document.getElementById('subtitle-list-aside')?.classList.add('list-is-empty');

        this.listContent.querySelectorAll('[data-empty-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleEmptyAction(btn.dataset.emptyAction);
            });
        });
    }

    handleEmptyAction(action) {
        const flow = this.editor?.flow;
        switch (action) {
        case 'import-video':
            if (flow?.mediaHandler?.selectVideo) {
                flow.mediaHandler.selectVideo();
            } else {
                document.getElementById('btn-select-video')?.click();
            }
            break;
        case 'import-srt':
            this.setSubtitleModeRadio('import');
            flow?.trackManager?.importSubtitle?.();
            break;
        case 'ai':
            this.setSubtitleModeRadio('ai');
            document.getElementById('btn-ai-process')?.click();
            break;
        case 'add':
            // Keep "+" visible: AI mode hides add button in toolbar
            this.setSubtitleModeRadio('manual');
            this.editor?.addSubtitle?.();
            break;
        case 'clear-media':
            flow?.mediaHandler?.clearMedia?.();
            break;
        case 'clear-filter': {
            const filter = document.getElementById('subtitle-review-filter');
            if (filter) {
                filter.value = 'all';
                filter.dispatchEvent(new Event('change', { bubbles: true }));
            }
            this.editor?.setReviewFilter?.('all');
            break;
        }
        default:
            break;
        }
    }

    setSubtitleModeRadio(mode) {
        const radio = document.querySelector(`input[name="subtitle-mode"][value="${mode}"]`);
        if (!radio) return;
        if (!radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * 璁＄畻骞舵洿鏂板彲瑙佸尯鍩?
     * @param {boolean} force 鏄惁寮哄埗閲嶆柊娓叉煋
     */
    updateVisibleRange(force = false) {
        const scrollTop = this.container.scrollTop;
        const viewportHeight = this.container.clientHeight;

        let start = this.findEntryIndexAtOffset(scrollTop) - this.BUFFER;
        let end = this.findEntryIndexAtOffset(scrollTop + viewportHeight) + this.BUFFER + 1;

        start = Math.max(0, start);
        end = Math.min(this.entries.length, end);

        // 濡傛灉鑼冨洿娌″彉涓斾笉鏄己鍒跺埛鏂帮紝鍒欒烦杩囷紙闄ら潪鐢ㄦ埛姝ｅ湪杈撳叆锛屾垜浠篃瑕佷繚鎸佹洿鏂帮級
        if (!force && start === this.startIndex && end === this.endIndex && !this._isInteracting) {
            return;
        }

        this.startIndex = start;
        this.endIndex = end;

        this.renderVisibleItems();
    }

    /**
     * 鎵ц瀹為檯鐨?DOM 娓叉煋锛堜粎閽堝鍙椤癸級
     */
    renderVisibleItems() {
        const visibleEntries = this.entries.slice(this.startIndex, this.endIndex);

        // Clear guided / legacy empty states before painting cue cards
        if (this.listContent.querySelector('.empty-state-guided, .empty-state-small')) {
            this.listContent.innerHTML = '';
        }

        // 鍋忕Щ瀹瑰櫒鍒板綋鍓嶈閲?
        const offsetY = this.entryOffsets[this.startIndex] || 0;
        this.listContent.style.transform = `translateY(${offsetY}px)`;

        // 鑾峰彇褰撳墠宸叉湁鐨勫厓绱?
        const existingElements = Array.from(this.listContent.children);

        // 娓叉煋/鏇存柊閫昏緫
        visibleEntries.forEach(({ sub, index }, i) => {
            let el = existingElements[i];
            const renderedEntryIndex = this.startIndex + i;

            if (el) {
                if (el.dataset.renderMode !== this.getRenderModeKey()) {
                    const replacement = this.createSubtitleElement(sub, index);
                    this.listContent.replaceChild(replacement, el);
                    el = replacement;
                } else {
                    this.updateElement(el, sub, index);
                }
            } else {
                el = this.createSubtitleElement(sub, index);
                this.listContent.appendChild(el);
            }

            this.applyItemHeight(el, renderedEntryIndex);
        });

        // 绉婚櫎澶氫綑鐨?DOM 鑺傜偣
        while (this.listContent.children.length > visibleEntries.length) {
            this.listContent.lastElementChild.remove();
        }

        this.syncAdaptiveActionLayouts();
        this.syncMeasuredVisibleHeights(visibleEntries);
    }

    getOriginalText(sub) {
        return this.editor?.getOriginalText ? this.editor.getOriginalText(sub) : '';
    }

    getTranslatedText(sub) {
        return this.editor?.getTranslatedText ? this.editor.getTranslatedText(sub) : '';
    }

    normalizeSingleLineText(value) {
        return String(value || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }

    updateElement(div, sub, index) {
        const nextSubtitleId = this.getSubtitleIdentity(sub, index);
        const prevSubtitleId = div.dataset.subtitleId || '';
        const prevIndex = Number.parseInt(div.dataset.index, 10);
        const isFocused = div.contains(document.activeElement);
        const identityChanged = prevSubtitleId !== nextSubtitleId || prevIndex !== index;

        // 鏇存柊绱㈠紩鏄剧ず
        div.dataset.index = index;
        div.dataset.subtitleId = nextSubtitleId;
        // Keep ⋯ open only for the same cue; otherwise strip expanded state
        if (this._floatingMenuOwnerIndex !== index) {
            div.classList.remove('actions-expanded');
        }
        const indexEl = div.querySelector('.subtitle-index');
        if (indexEl) {
            indexEl.textContent = `#${index + 1}`;
        }
        this.updateEventHandlers(div, index);

        // 濡傛灉鐢ㄦ埛姝ｅ湪缂栬緫杩欎釜妗嗭紝鍒ゆ柇鏄惁涓哄巻鍙插洖閫€瑙﹀彂鐨勫己鍒跺埛鏂?
        if (isFocused && !this._forceRefreshFocused && !identityChanged) return;

        // 濮嬬粓鏇存柊鏃堕棿锛屽洜涓虹Щ鍔ㄤ綅缃彲鑳藉鑷存椂闂存樉绀洪渶瑕佸埛鏂帮紙鎴栬€呰櫧鐒舵椂闂存病鍙樹絾瀵硅薄鍙樹簡锛?
        const startInput = div.querySelector('.start-time');
        const endInput = div.querySelector('.end-time');
        if (startInput) startInput.value = window.SubtitleUtils.formatTime(sub.start);
        if (endInput) endInput.value = window.SubtitleUtils.formatTime(sub.end);

        // 鏇存柊鏂囨湰鍐呭
        const originInput = div.querySelector('.original-text');
        const transInput = div.querySelector('.translated-text');
        if (originInput) {
            originInput.wrap = 'off';
            originInput.value = this.normalizeSingleLineText(this.getOriginalText(sub));
        }
        if (transInput) {
            transInput.wrap = 'off';
            transInput.value = this.normalizeSingleLineText(this.getTranslatedText(sub));
        }

        // Active 鐘舵€佹洿鏂?
        const isActive = (index === this.editor.activeSubtitleIndex);
        div.classList.toggle('active', isActive);

        // 鍚屾 UI 鐘舵€?(璇€熴€乀TS婧愮瓑)
        this.syncUIState(div, sub, index);

        // 鎵ц灞€閮ㄥ浗闄呭寲鍒锋柊锛岀‘淇?Tooltip 绛夊睘鎬ч殢璇█鏇存柊
        if (window.i18n && window.i18n.updateUI) {
            window.i18n.updateUI(div);
        }
    }

    syncUIState(div, sub, index) {
        // 鍚屾鍕鹃€夌姸鎬?
        const checkbox = div.querySelector('.subtitle-select-checkbox');
        if (checkbox) {
            checkbox.checked = !!sub.selected;
            div.classList.toggle('selected', !!sub.selected);
        }

        const normalizedStatus = ['pending', 'approved', 'needs-work'].includes(sub.reviewStatus)
            ? sub.reviewStatus
            : 'pending';
        div.dataset.reviewStatus = normalizedStatus;
        div.classList.toggle('is-locked', !!sub.locked);
        div.classList.toggle('status-approved', normalizedStatus === 'approved');
        div.classList.toggle('status-needs-work', normalizedStatus === 'needs-work');
        div.classList.toggle('status-pending', normalizedStatus === 'pending');

        const reviewBadge = div.querySelector('.review-badge');
        if (reviewBadge) {
            reviewBadge.className = `review-badge review-${normalizedStatus}`;
            reviewBadge.textContent = this.getReviewStatusMeta(normalizedStatus).label;
        }

        const dubBadge = div.querySelector('.dub-fit-badge');
        if (dubBadge) {
            const dubMeta = this.getDubStatusMeta(sub.dubStatus);
            dubBadge.className = `dub-fit-badge dub-fit-${dubMeta.tone}`;
            dubBadge.textContent = dubMeta.shortLabel;
            dubBadge.title = dubMeta.label;
            dubBadge.hidden = !dubMeta.shortLabel;
        }

        const lockButton = div.querySelector('.btn-lock-subtitle');
        if (lockButton) {
            lockButton.classList.toggle('active', !!sub.locked);
            lockButton.title = sub.locked
                ? this.translateOrFallback('subtitle.review.unlock_item', '瑙ｉ攣褰撳墠瀛楀箷')
                : this.translateOrFallback('subtitle.review.lock_item', '閿佸畾褰撳墠瀛楀箷');
            const icon = lockButton.querySelector('i');
            if (icon) {
                icon.className = sub.locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            }
        }

        const lockableFields = div.querySelectorAll('.start-time, .end-time, .original-text, .translated-text, .tts-source-select');
        lockableFields.forEach((field) => {
            field.disabled = !!sub.locked;
        });

        const mutatingButtons = div.querySelectorAll(
            '.btn-rerecognize, .btn-retranslate, .btn-rerecognize-translate, .btn-split, .btn-merge, .btn-compress, .btn-delete, .btn-review-approve, .btn-review-reset, .btn-review-needs-work'
        );
        mutatingButtons.forEach((button) => {
            button.disabled = !!sub.locked;
        });

        const reviewApproveButton = div.querySelector('.btn-review-approve');
        if (reviewApproveButton) {
            reviewApproveButton.classList.toggle('active', normalizedStatus === 'approved');
        }

        const reviewNeedsWorkButton = div.querySelector('.btn-review-needs-work');
        if (reviewNeedsWorkButton) {
            reviewNeedsWorkButton.classList.toggle('active', normalizedStatus === 'needs-work');
        }

        const reviewResetButton = div.querySelector('.btn-review-reset');
        if (reviewResetButton) {
            reviewResetButton.classList.toggle('active', normalizedStatus === 'pending');
        }

        // 铏界劧 updateElement 宸茬粡澶勭悊浜嗗熀纭€鍊硷紝浣?SubtitleListRenderer 鍙兘杩樻湁鍏朵粬 UI 瑁呴グ
        // 杩欓噷鐨?syncUIState 璐熻矗澶勭悊 CPS 瀹炴椂鐩戞祴涓庢姤璀?
        // CPS 瀹炴椂鐩戞祴涓庢姤璀︼細瑙ｈ€︽樉绀烘枃鏈笌璁＄畻鏂囨湰锛岄伩鍏嶅弻璇悎骞跺共鎵?
        const textForCps = sub.translatedText || sub.originalText || sub.text;
        const duration = sub.end - sub.start;
        const cps = window.SubtitleUtils.getCPS(textForCps, duration);
        const limit = window.SubtitleUtils.getCPSLimit(textForCps);
        const isOverLimit = cps > limit;

        const speedBadge = div.querySelector('.speed-badge');
        if (speedBadge) {
            speedBadge.className = `speed-badge ${isOverLimit ? 'warning' : ''}`;
            speedBadge.textContent = `${cps} CPS`;
            speedBadge.title = isOverLimit ? window.i18n.t('subtitle.editor.speed_over_limit', { limit: limit }) : window.i18n.t('subtitle.editor.speed_normal');
        }

        const textStack = div.querySelector('.subtitle-text-stack');
        if (textStack) {
            textStack.classList.toggle('tts-warning', isOverLimit);
        }

        const origRow = div.querySelector('.original-row');
        if (origRow) {
            origRow.classList.toggle('hidden', !this.editor.showOriginal);
        }

        const transRow = div.querySelector('.translation-row');
        if (transRow) {
            transRow.classList.toggle('hidden', !this.editor.showTranslation);
        }

        this.syncAudioPreview(div, sub);

        // 妫€鏌?TTS 閰嶉煶婧?
        const ttsSelect = div.querySelector('.tts-source-select');
        if (ttsSelect) {
            ttsSelect.value = window.SubtitleUtils?.getEffectiveTtsSource?.(sub) || sub.ttsSource || 'original';
        }

        const loopButton = div.querySelector('.btn-loop');
        if (loopButton) {
            loopButton.classList.toggle('active', index === this.editor.loopingSubtitleIndex);
        }

        // --- 璐ㄦ (QC) 鐘舵€佸悓姝?---
        const qcHandler = this.editor.flow.qualityHandler;
        const errors = qcHandler ? qcHandler.getErrorsByIndex(index) : [];

        div.classList.toggle('has-qc-error', errors.some(e => e.type === 'overlap'));
        div.classList.toggle('has-qc-warning', errors.some(e => e.type === 'short' || e.type === 'overflow'));

        const qcContainer = div.querySelector('.qc-error-list');
        if (qcContainer) {
            qcContainer.innerHTML = this.renderQCBadges(errors);
        }
    }

    updateEventHandlers(div, index) {
        div.dataset.index = String(index);
    }

    coerceDataId(value) {
        if (/^-?\d+$/.test(String(value ?? ''))) {
            return Number(value);
        }
        return value;
    }

    handleSubtitleAction(actionTarget, index) {
        if (!actionTarget || actionTarget.disabled) return;

        const action = actionTarget.dataset.subtitleAction;
        const editor = this.editor;
        const qualityHandler = editor.flow?.qualityHandler;

        switch (action) {
        case 'preview-tts':
            editor.previewTts?.(index);
            break;
        case 'toggle-lock':
            editor.toggleSubtitleLock?.(index);
            break;
        case 'play':
            editor.playSubtitle?.(index);
            break;
        case 'loop':
            editor.loopSubtitle?.(index);
            break;
        case 'rerecognize':
            editor.reRecognize?.(index);
            break;
        case 'retranslate':
            editor.retranslate?.(index);
            break;
        case 'set-review-status':
            editor.setReviewStatus?.(index, actionTarget.dataset.reviewStatus);
            break;
        case 'rerecognize-translate':
            editor.reRecognizeAndRetranslate?.(index);
            break;
        case 'split':
            editor.splitSubtitle?.(index);
            break;
        case 'merge':
            editor.mergeWithNext?.(index);
            break;
        case 'compress':
            editor.compressTranslation?.(index);
            break;
        case 'delete':
            editor.deleteSubtitle?.(index);
            break;
        case 'preview-audio':
            editor.flow?.audioActionHandler?.previewClip?.(
                this.coerceDataId(actionTarget.dataset.trackId),
                Number.parseInt(actionTarget.dataset.clipIndex, 10)
            );
            break;
        case 'qc-fix':
            if (actionTarget.dataset.qcType === 'overlap') qualityHandler?.fixOverlap?.(index);
            if (actionTarget.dataset.qcType === 'short') qualityHandler?.fixShort?.(index);
            if (actionTarget.dataset.qcType === 'overflow') qualityHandler?.fixOverflow?.(index);
            break;
        default:
            break;
        }
    }

    createSubtitleElement(sub, index) {
        const div = document.createElement('div');
        const isLite = this.editor.viewMode === 'lite';
        const initialStatus = ['pending', 'approved', 'needs-work'].includes(sub.reviewStatus)
            ? sub.reviewStatus
            : 'pending';
        div.className = `subtitle-item ${index === this.editor.activeSubtitleIndex ? 'active' : ''} ${sub.locked ? 'is-locked' : ''} status-${initialStatus}`.trim();
        div.dataset.index = index;
        div.dataset.subtitleId = this.getSubtitleIdentity(sub, index);
        div.dataset.reviewStatus = initialStatus;
        div.dataset.renderMode = this.getRenderModeKey();
        div.draggable = true;

        const originalText = this.normalizeSingleLineText(this.getOriginalText(sub));
        const translatedText = this.normalizeSingleLineText(this.getTranslatedText(sub));
        const safeOriginalText = this.escapeHtml(originalText);
        const safeTranslatedText = this.escapeHtml(translatedText);
        const showOrigRow = this.editor.showOriginal ? '' : 'hidden';

        const text = translatedText || originalText;
        const duration = (sub.end - sub.start) || 1;
        const cps = window.SubtitleUtils.getCPS(text, duration);
        const limit = window.SubtitleUtils.getCPSLimit(text);
        const isOverLimit = cps > limit;

        const warningClass = isOverLimit ? 'tts-warning' : '';
        const speedBadge = this.createSpeedBadge(text, duration, isOverLimit, cps, limit);
        const ttsControls = this.createTTSControls(sub);
        const previewBtn = this.editor.showTtsSourceSelector ? `<button class="btn-icon-sm" type="button" data-i18n-title="subtitle.editor.preview_tts_tip" title="${window.i18n.t('subtitle.editor.preview_tts_tip')}" data-subtitle-action="preview-tts"><i class="fa-solid fa-volume-high"></i></button>` : '';
        const reviewMeta = this.getReviewStatusMeta(initialStatus);
        const reviewBadgeHtml = isLite
            ? ''
            : `<span class="review-badge review-${this.sanitizeClassName(reviewMeta.status)}">${this.escapeHtml(reviewMeta.label)}</span>`;
        const dubMeta = this.getDubStatusMeta(sub.dubStatus);
        const dubBadgeHtml = isLite || !dubMeta.shortLabel
            ? ''
            : `<span class="dub-fit-badge dub-fit-${this.sanitizeClassName(dubMeta.tone)}" title="${this.escapeAttribute(dubMeta.label)}">${this.escapeHtml(dubMeta.shortLabel)}</span>`;
        const lockTitle = sub.locked
            ? this.translateOrFallback('subtitle.review.unlock_item', '瑙ｉ攣褰撳墠瀛楀箷')
            : this.translateOrFallback('subtitle.review.lock_item', '閿佸畾褰撳墠瀛楀箷');
        const lockedAttr = sub.locked ? 'disabled' : '';
        const compact = this.isCompactListPanel();
        // Narrow list: keep one header row; move play/rerecognize/etc. into ⋯
        const primaryActions = compact
            ? `${previewBtn}`
            : `${previewBtn}
                        <button class="btn-icon-sm btn-play" type="button" data-i18n-title="subtitle.editor.play_tip" title="${window.i18n.t('subtitle.editor.play_tip')}" data-subtitle-action="play"><i class="fa-solid fa-play"></i></button>
                        <button class="btn-icon-sm btn-loop ${index === this.editor.loopingSubtitleIndex ? 'active' : ''}" type="button" data-i18n-title="subtitle.editor.play_loop_tip" title="${window.i18n.t('subtitle.editor.play_loop_tip')}" data-subtitle-action="loop"><i class="fa-solid fa-repeat"></i></button>
                        <button class="btn-icon-sm btn-rerecognize" type="button" data-i18n-title="subtitle.editor.rerecognize_tip" title="${window.i18n.t('subtitle.editor.rerecognize_tip')}" data-subtitle-action="rerecognize" ${lockedAttr}><i class="fa-solid fa-wave-square"></i></button>
                        <button class="btn-icon-sm btn-retranslate" type="button" data-i18n-title="subtitle.editor.retranslate_tip" title="${window.i18n.t('subtitle.editor.retranslate_tip')}" data-subtitle-action="retranslate" ${lockedAttr}><i class="fa-solid fa-rotate"></i></button>`;

        const compactMenuExtras = compact
            ? `
                            <button class="btn-icon-sm btn-play" type="button" data-i18n-title="subtitle.editor.play_tip" title="${window.i18n.t('subtitle.editor.play_tip')}" data-subtitle-action="play"><i class="fa-solid fa-play"></i></button>
                            <button class="btn-icon-sm btn-loop ${index === this.editor.loopingSubtitleIndex ? 'active' : ''}" type="button" data-i18n-title="subtitle.editor.play_loop_tip" title="${window.i18n.t('subtitle.editor.play_loop_tip')}" data-subtitle-action="loop"><i class="fa-solid fa-repeat"></i></button>
                            <button class="btn-icon-sm btn-rerecognize" type="button" data-i18n-title="subtitle.editor.rerecognize_tip" title="${window.i18n.t('subtitle.editor.rerecognize_tip')}" data-subtitle-action="rerecognize" ${lockedAttr}><i class="fa-solid fa-wave-square"></i></button>
                            <button class="btn-icon-sm btn-retranslate" type="button" data-i18n-title="subtitle.editor.retranslate_tip" title="${window.i18n.t('subtitle.editor.retranslate_tip')}" data-subtitle-action="retranslate" ${lockedAttr}><i class="fa-solid fa-rotate"></i></button>`
            : '';

        const headerHtml = isLite
            ? ''
            : `
            <div class="subtitle-time-row ${compact ? 'is-compact' : ''}">
                <label class="subtitle-checkbox-wrapper">
                    <input type="checkbox" class="subtitle-select-checkbox" ${sub.selected ? 'checked' : ''}>
                </label>
                <span class="drag-handle" data-i18n-title="subtitle.editor.drag_sort_tip" title="${window.i18n.t('subtitle.editor.drag_sort_tip')}"><i class="fa-solid fa-grip-vertical"></i></span>
                <span class="subtitle-index">#${index + 1}</span>
                <div class="time-inputs">
                    <input type="text" class="subtitle-time-input start-time" value="${window.SubtitleUtils.formatTime(sub.start)}">
                    <i class="fa-solid fa-arrow-right time-sep"></i>
                    <input type="text" class="subtitle-time-input end-time" value="${window.SubtitleUtils.formatTime(sub.end)}">
                </div>
                ${compact ? '' : speedBadge}
                ${reviewBadgeHtml}
                ${compact ? '' : dubBadgeHtml}
                ${compact ? '' : ttsControls}
                <button class="btn-icon-sm btn-lock-subtitle ${sub.locked ? 'active' : ''}" type="button" title="${lockTitle}" data-subtitle-action="toggle-lock">
                    <i class="fa-solid ${sub.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <div class="subtitle-actions">
                    <div class="subtitle-actions-primary">
                        ${primaryActions}
                    </div>
                    <div class="subtitle-actions-more">
                        <button class="btn-icon-sm btn-more-actions" type="button" data-i18n-title="subtitle.editor.more_actions_tip" title="${window.i18n.t('subtitle.editor.more_actions_tip')}"><i class="fa-solid fa-ellipsis"></i></button>
                        <div class="subtitle-actions-menu">
                            ${compactMenuExtras}
                            <button class="btn-icon-sm btn-review-approve ${reviewMeta.status === 'approved' ? 'active' : ''}" type="button" title="${this.escapeAttribute(this.translateOrFallback('subtitle.review.mark_approved', 'Mark approved'))}" data-subtitle-action="set-review-status" data-review-status="approved" ${lockedAttr}><i class="fa-solid fa-check"></i></button>
                            <button class="btn-icon-sm btn-review-needs-work ${reviewMeta.status === 'needs-work' ? 'active' : ''}" type="button" title="${this.escapeAttribute(this.translateOrFallback('subtitle.review.mark_needs_work', 'Mark needs work'))}" data-subtitle-action="set-review-status" data-review-status="needs-work" ${lockedAttr}><i class="fa-solid fa-triangle-exclamation"></i></button>
                            <button class="btn-icon-sm btn-review-reset ${reviewMeta.status === 'pending' ? 'active' : ''}" type="button" title="${this.escapeAttribute(this.translateOrFallback('subtitle.review.mark_pending', 'Mark pending'))}" data-subtitle-action="set-review-status" data-review-status="pending" ${lockedAttr}><i class="fa-solid fa-clock-rotate-left"></i></button>
                            <button class="btn-icon-sm btn-rerecognize-translate" type="button" data-i18n-title="subtitle.editor.rerecognize_retranslate_tip" title="${window.i18n.t('subtitle.editor.rerecognize_retranslate_tip')}" data-subtitle-action="rerecognize-translate" ${lockedAttr}><i class="fa-solid fa-language"></i></button>
                            <button class="btn-icon-sm btn-split" type="button" data-i18n-title="subtitle.editor.split_tip" title="${window.i18n.t('subtitle.editor.split_tip')}" data-subtitle-action="split" ${lockedAttr}><i class="fa-solid fa-scissors"></i></button>
                            <button class="btn-icon-sm btn-merge" type="button" data-i18n-title="subtitle.editor.merge_tip" title="${window.i18n.t('subtitle.editor.merge_tip')}" data-subtitle-action="merge" ${lockedAttr}><i class="fa-solid fa-link"></i></button>
                            <button class="btn-icon-sm btn-compress" type="button" data-i18n-title="subtitle.editor.compress_tip" title="${window.i18n.t('subtitle.editor.compress_tip')}" data-subtitle-action="compress" ${lockedAttr}><i class="fa-solid fa-compress"></i></button>
                            <button class="btn-icon-sm btn-delete" type="button" data-i18n-title="subtitle.editor.delete_tip" title="${window.i18n.t('subtitle.editor.delete_tip')}" data-subtitle-action="delete" ${lockedAttr}><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;

        const hideLabels = compact ? 'is-compact-text' : '';
        div.classList.toggle('is-compact-card', compact);
        div.innerHTML = `
            ${headerHtml}
            <div class="subtitle-text-stack ${warningClass} ${hideLabels}">
                <div class="text-row original-row ${showOrigRow}">
                    <span class="text-label" data-i18n="subtitle.editor.original_label">${this.escapeHtml(window.i18n.t('subtitle.editor.original_label'))}</span>
                    <textarea class="subtitle-textarea original-text" wrap="off" data-i18n-placeholder="subtitle.editor.original_placeholder" placeholder="${this.escapeAttribute(window.i18n.t('subtitle.editor.original_placeholder'))}" ${sub.locked ? 'disabled' : ''}>${safeOriginalText}</textarea>
                </div>
                <div class="text-row translation-row">
                    <span class="text-label" data-i18n="subtitle.editor.translated_label">${this.escapeHtml(window.i18n.t('subtitle.editor.translated_label'))}</span>
                    <textarea class="subtitle-textarea translated-text" wrap="off" data-i18n-placeholder="subtitle.editor.translated_placeholder" placeholder="${this.escapeAttribute(window.i18n.t('subtitle.editor.translated_placeholder'))}" ${sub.locked ? 'disabled' : ''}>${safeTranslatedText}</textarea>
                </div>
                ${this.createAudioPreview(sub)}
                <div class="qc-error-list">
                    ${this.renderQCBadges(this.editor.flow.qualityHandler ? this.editor.flow.qualityHandler.getErrorsByIndex(index) : [])}
                </div>
            </div>
        `;

        this.bindItemEvents(div);
        return div;
    }

    getSubtitleIdentity(sub, index) {
        if (sub?.id !== undefined && sub?.id !== null) {
            return String(sub.id);
        }

        return `${index}:${sub?.start ?? ''}:${sub?.end ?? ''}`;
    }

    getReviewStatusMeta(status) {
        switch (status) {
        case 'approved':
            return { status: 'approved', label: this.translateOrFallback('subtitle.review.approved', '宸插') };
        case 'needs-work':
            return { status: 'needs-work', label: this.translateOrFallback('subtitle.review.needs_work', '閲嶅仛') };
        default:
            return { status: 'pending', label: this.translateOrFallback('subtitle.review.pending', '寰呭') };
        }
    }

    getDubStatusMeta(status) {
        return this.editor.flow?.dubAdapter?.getStatusMeta?.(status) || {
            tone: 'neutral',
            shortLabel: '',
            label: ''
        };
    }

    createAudioPreview(sub) {
        const audioTracks = this.editor.flow?.trackManager?.tracks?.filter((track) => track.type === 'audio' && track.visible !== false) || [];
        let foundClip = null;
        let foundTrackId = null;
        let foundIndex = -1;

        for (const track of audioTracks) {
            const index = track.subtitles?.findIndex((clip) => clip.originId === sub.id);
            if (index !== -1) {
                foundClip = track.subtitles[index];
                foundTrackId = track.id;
                foundIndex = index;
                break;
            }
        }

        if (!foundClip) return '';

        const duration = (foundClip.end - foundClip.start).toFixed(2);
        const audioTagLabel = window.SubtitleUtils?.translateOrFallback?.('subtitle.editor.audio_tag', 'Dubbing') || 'Dubbing';

        return `
                        <div class="subtitle-audio-preview">
                            <i class="fa-solid fa-waveform-lines"></i>
                            <span class="audio-tag">${this.escapeHtml(audioTagLabel)}</span>
                            <span class="audio-duration">${this.escapeHtml(duration)}s</span>
                            <div class="audio-spacer"></div>
                            <button class="btn-preview-audio" type="button" data-subtitle-action="preview-audio" data-track-id="${this.escapeAttribute(foundTrackId)}" data-clip-index="${this.escapeAttribute(foundIndex)}">
                                <i class="fa-solid fa-play"></i>
                            </button>
                        </div>`;
    }

    syncAudioPreview(div, sub) {
        const currentPreview = div.querySelector('.subtitle-audio-preview');
        const nextHtml = this.createAudioPreview(sub).trim();

        if (!nextHtml) {
            currentPreview?.remove();
            return;
        }

        const template = document.createElement('template');
        template.innerHTML = nextHtml;
        const nextPreview = template.content.firstElementChild;
        if (!nextPreview) return;

        if (currentPreview) {
            currentPreview.replaceWith(nextPreview);
            return;
        }

        const qcContainer = div.querySelector('.qc-error-list');
        qcContainer?.before(nextPreview);
    }

    createSpeedBadge(text, duration, isOverLimit, cps, limit) {
        if (!text || text.length === 0) return '';
        const title = isOverLimit ? window.i18n.t('subtitle.editor.cps_over_limit_tip', { cps, limit }) : window.i18n.t('subtitle.editor.cps_normal_tip', { cps });
        return `<span class="speed-badge ${isOverLimit ? 'warning' : ''}" title="${this.escapeAttribute(title)}">${this.escapeHtml(cps)} CPS</span>`;
    }

    createTTSControls(sub) {
        if (!this.editor.showTtsSourceSelector) return '';
        const ttsSource = window.SubtitleUtils?.getEffectiveTtsSource?.(sub) || sub.ttsSource || 'original';
        const disabledAttr = sub.locked ? 'disabled' : '';

        return `
            <div class="tts-source-wrapper">
                <i class="fa-solid fa-microphone-lines"></i>
                <select class="tts-source-select" ${disabledAttr}>
                    <option value="original" ${ttsSource === 'original' ? 'selected' : ''}>${window.i18n.t('subtitle.editor.original_option')}</option>
                    <option value="translated" ${ttsSource === 'translated' ? 'selected' : ''}>${window.i18n.t('subtitle.editor.translated_option')}</option>
                </select>
            </div>`;
    }

    renderQCBadges(errors) {
        if (!errors || errors.length === 0) return '';

        return errors.map(err => {
            const isError = err.type === 'overlap';
            const className = isError ? 'error' : 'warning';
            const icon = isError ? 'fa-circle-xmark' : 'fa-circle-exclamation';
            let fixBtn = '';

            if (err.type === 'overlap') {
                fixBtn = `<button class="btn-qc-fix btn-fix-overlap" type="button" data-subtitle-action="qc-fix" data-qc-type="overlap">${this.escapeHtml(window.i18n.t('subtitle.qc.fix_overlap'))}</button>`;
            } else if (err.type === 'short') {
                fixBtn = `<button class="btn-qc-fix btn-fix-short" type="button" data-subtitle-action="qc-fix" data-qc-type="short">${this.escapeHtml(window.i18n.t('subtitle.qc.fix_short'))}</button>`;
            } else if (err.type === 'overflow') {
                fixBtn = `<button class="btn-qc-fix btn-fix-overflow" type="button" data-subtitle-action="qc-fix" data-qc-type="overflow">${this.escapeHtml(window.i18n.t('subtitle.qc.fix_overflow'))}</button>`;
            }

            return `
                <div class="qc-tag ${className}">
                    <i class="fa-solid ${icon}"></i>
                    <span>${this.escapeHtml(err.message)}</span>
                    ${fixBtn}
                </div>
            `;
        }).join('');
    }

    bindItemEvents(div) {
        const startInput = div.querySelector('.start-time');
        const endInput = div.querySelector('.end-time');
        const originalInput = div.querySelector('.original-text');
        const translatedInput = div.querySelector('.translated-text');

        const getIndex = () => parseInt(div.dataset.index);

        div.addEventListener('click', (e) => {
            const actionTarget = this.closest(e.target, '[data-subtitle-action]');
            if (!actionTarget || !div.contains(actionTarget)) return;

            e.preventDefault();
            e.stopPropagation();
            this.handleSubtitleAction(actionTarget, getIndex());
        });

        const ttsSourceSelect = div.querySelector('.tts-source-select');
        ttsSourceSelect?.addEventListener('change', (e) => {
            this.editor.setTtsSource?.(getIndex(), e.target.value);
        });

        // 鑱斿姩瀵绘椂锛氱偣鍑绘暣琛岋紙閬垮紑杈撳叆妗嗗拰鎸夐挳锛夌珛鍒昏烦杞棰?
        div.addEventListener('click', (e) => {
            const isInput = ['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target?.tagName);
            const isButton = this.closest(e.target, 'button');
            if (!isInput && !isButton) {
                this.editor.setActive(getIndex(), true);
            }
        });

        const moreActionsBtn = div.querySelector('.btn-more-actions');
        moreActionsBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Wide layouts that already inline secondary actions: no popup
            if (div.classList.contains('actions-inline') && !this.isCompactListPanel()) return;
            const alreadyOpen = this._floatingMenu?.dataset?.ownerIndex === String(getIndex());
            this.closeSecondaryActionMenus();
            if (!alreadyOpen) {
                this.openFloatingActionsMenu(div, getIndex(), e.currentTarget || moreActionsBtn);
            }
        });

        const dubBadge = div.querySelector('.dub-fit-badge');
        dubBadge?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = getIndex();
            this.editor.setActive(idx);
            this.editor.flow.uiManager?.settings?.focusDubStatusPanel?.();
        });

        const onFocus = () => {
            this._isInteracting = true;
            if (this.editor.activeSubtitleIndex !== getIndex()) {
                this.editor.setActive(getIndex());
            }
            // 璁板綍缂栬緫鍓嶇殑蹇収
            this.editor.addToHistory();
        };

        const onBlur = () => {
            this._isInteracting = false;
            // 澶卞幓鐒︾偣鍚庯紝濡傛灉鍐呭鏈夊彉锛岃褰曠紪杈戝悗鐨勫揩鐓?
            this.editor.addToHistory(); 
        };

        const updateText = () => {
            [originalInput, translatedInput].forEach((input) => {
                if (!input) return;
                input.value = input.value.replace(/[\r\n]+/g, ' ').replace(/^\s+/, '');
            });
            const idx = getIndex();
            this.editor.updateSubtitleText(idx, originalInput?.value || '', translatedInput ? translatedInput.value : '');
        };

        const onCtrlEnter = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                const nextIndex = getIndex() + 1;
                if (nextIndex < this.subtitles.length) {
                    this.editor.setActive(nextIndex, true);
                    // 寤惰繜鑱氱劍纭繚铏氭嫙鍒楄〃宸叉洿鏂?
                    setTimeout(() => {
                        const nextItem = this.listContent.querySelector(`.subtitle-item[data-index="${nextIndex}"]`);
                        if (nextItem) {
                            // 浼樺厛鑱氱劍璇戞枃妗?
                            const nextField = nextItem.querySelector('.translated-text') || nextItem.querySelector('.original-text');
                            nextField?.focus();
                            // 灏嗗厜鏍囩Щ鑷虫湯灏?
                            if (nextField) {
                                const val = nextField.value;
                                nextField.value = '';
                                nextField.value = val;
                            }
                        }
                    }, 80);
                } else {
                    window.app?.showToast?.(window.i18n.t('toast.last_sentence'), 'info');
                }
            }
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        };

        if (originalInput) {
            originalInput.addEventListener('focus', onFocus);
            originalInput.addEventListener('blur', onBlur);
            originalInput.addEventListener('input', updateText);
            originalInput.addEventListener('keydown', onCtrlEnter);
        }

        if (translatedInput) {
            translatedInput.addEventListener('focus', onFocus);
            translatedInput.addEventListener('blur', onBlur);
            translatedInput.addEventListener('input', updateText);
            translatedInput.addEventListener('keydown', onCtrlEnter);
        }

        if (startInput) {
            startInput.addEventListener('change', (e) => {
                const time = window.SubtitleUtils.parseTime(e.target.value);
                if (time !== null) this.editor.updateSubtitle(getIndex(), 'start', time);
            });
        }

        if (endInput) {
            endInput.addEventListener('change', (e) => {
                const time = window.SubtitleUtils.parseTime(e.target.value);
                if (time !== null) this.editor.updateSubtitle(getIndex(), 'end', time);
            });
        }

        // 缁戝畾鍙抽敭鑿滃崟
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = getIndex();
            // 鍒楄〃椤归€氬父瀵瑰簲褰撳墠婵€娲昏建閬撲腑鐨勫瓧骞?
            const trackId = this.editor.flow.activeTrackId;
            this.editor.flow.contextMenu?.show(e.clientX, e.clientY, trackId, idx);
        });

        // 鎷栨嫿浜嬩欢
        div.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', getIndex());
                e.dataTransfer.effectAllowed = 'move';
            }
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        div.addEventListener('dragover', (e) => {
            // 鍙湁鎷栨嫿鍚岀被鍨嬬殑椤规椂鍏佽
            if (e.dataTransfer?.types?.includes('text/plain')) {
                e.preventDefault();
                div.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });

        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-over');
            const fromIdx = parseInt(e.dataTransfer?.getData?.('text/plain'));
            const toIdx = getIndex();

            if (!isNaN(fromIdx) && fromIdx !== toIdx) {
                this.editor.moveSubtitle(fromIdx, toIdx);
            }
        });

        // Multi-select: checkbox drives batch toolbar visibility
        const checkbox = div.querySelector('.subtitle-select-checkbox');
        checkbox?.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = getIndex();
            const checked = e.target.checked;

            if (e.shiftKey && this._lastCheckedIndex !== undefined) {
                const start = Math.min(this._lastCheckedIndex, idx);
                const end = Math.max(this._lastCheckedIndex, idx);
                for (let i = start; i <= end; i++) {
                    if (this.editor.subtitles[i]) {
                        this.editor.subtitles[i].selected = checked;
                    }
                }
                this._lastCheckedIndex = idx;
                this.editor.render();
            } else {
                if (this.editor.subtitles[idx]) {
                    this.editor.subtitles[idx].selected = checked;
                    div.classList.toggle('selected', checked);
                }
                this._lastCheckedIndex = idx;
            }

            // Keep timeline multi-select set + batch bar in sync
            this.notifySelectionChanged();
        });
    }

    /**
     * Push list checkbox selection into timeline selectedIndices and show batch bar.
     */
    notifySelectionChanged() {
        const clips = this.editor?.flow?.timeline?.clipsManager;
        if (clips) {
            const trackId = this.editor.flow.activeTrackId;
            const next = new Set();
            (this.editor.subtitles || []).forEach((sub, i) => {
                if (sub?.selected) next.add(i);
            });
            clips.selectedTrackId = trackId;
            clips.selectedIndices = next;
            clips._syncSelectionUI?.();
        } else {
            // Fallback: only toggle batch bar from list flags
            const bar = document.getElementById('list-batch-actions-bar');
            const aside = document.getElementById('subtitle-list-aside');
            const count = (this.editor.subtitles || []).filter((s) => s?.selected).length;
            const show = count > 0;
            aside?.classList.toggle('has-selection', show);
            bar?.classList.toggle('is-visible', show);
            bar?.classList.toggle('has-batch-tools', show);
        }
    }

    /**
     * 鍏ㄩ€?鍙栨秷鍏ㄩ€?
     */
    selectAll(checked) {
        const entries = this.editor?.getFilteredSubtitleEntries
            ? this.editor.getFilteredSubtitleEntries()
            : this.subtitles.map((sub, index) => ({ sub, index }));
        entries.forEach(({ index }) => {
            if (this.editor.subtitles[index]) {
                this.editor.subtitles[index].selected = checked;
            }
        });
        this.editor.render();
        this.notifySelectionChanged();
    }

    scrollToIndex(index) {
        if (!this.container) {
            console.warn('[SubtitleList] Scroll container not found');
            return;
        }
        const viewportHeight = this.container.clientHeight;
        const renderedIndex = this.entries.findIndex((entry) => entry.index === index);
        const targetIndex = renderedIndex >= 0 ? renderedIndex : index;
        const itemH = this.getEntryHeightAt(targetIndex);
        const itemTop = this.entryOffsets[targetIndex] || (targetIndex * this.ITEM_HEIGHT);

        // 璁＄畻灞呬腑鍋忕Щ閲忥細鐩爣椤剁 - (瑙嗗彛涓€鍗?- 鍗＄墖涓€鍗?
        // Clicking an already visible subtitle must not recenter the virtual
        // list. Reposition only when the target is actually outside the view.
        const scrollTop = this.container.scrollTop;
        const itemBottom = itemTop + itemH;
        const viewBottom = scrollTop + viewportHeight;
        let finalScroll = scrollTop;
        if (itemTop < scrollTop) {
            finalScroll = itemTop;
        } else if (itemBottom > viewBottom) {
            finalScroll = itemBottom - viewportHeight;
        }
        finalScroll = Math.max(0, finalScroll);

        if (Math.abs(finalScroll - scrollTop) < 1) return;

        console.log(`[SubtitleList] Scrolling to index ${index} (H=${itemH}px), Top: ${finalScroll}`);

        // 浣跨敤 auto 鐬椂婊氬姩锛岄槻姝㈣櫄鎷熷垪琛ㄩ噸缁樻墦鏂?scroll 浜嬩欢
        this.container.scrollTo({
            top: finalScroll,
            behavior: 'auto'
        });
    }

    closeSecondaryActionMenus() {
        this.listContent?.querySelectorAll('.subtitle-item.actions-expanded').forEach((item) => {
            item.classList.remove('actions-expanded');
        });
        if (this._floatingMenu) {
            this._floatingMenu.remove();
            this._floatingMenu = null;
        }
        this._floatingMenuOwnerIndex = null;
    }

    /**
     * Body-level floating menu. Virtual list uses transform, so fixed children
     * are clipped by overflow:auto — portal avoids that entirely.
     */
    openFloatingActionsMenu(itemEl, index, anchorBtn) {
        const sub = this.subtitles?.[index] || this.entries?.find((e) => e.index === index)?.sub;
        const locked = !!sub?.locked;
        const lockedAttr = locked ? 'disabled' : '';
        const reviewStatus = ['pending', 'approved', 'needs-work'].includes(sub?.reviewStatus)
            ? sub.reviewStatus
            : 'pending';
        const isLooping = index === this.editor.loopingSubtitleIndex;
        const compact = this.isCompactListPanel();

        const items = [];
        if (compact) {
            items.push(
                { action: 'play', icon: 'fa-play', label: this.translateOrFallback('subtitle.editor.play_tip', '播放') },
                { action: 'loop', icon: 'fa-repeat', label: this.translateOrFallback('subtitle.editor.play_loop_tip', '循环播放'), active: isLooping },
                { action: 'rerecognize', icon: 'fa-wave-square', label: this.translateOrFallback('subtitle.editor.rerecognize_tip', '重新识别'), locked: true },
                { action: 'retranslate', icon: 'fa-rotate', label: this.translateOrFallback('subtitle.editor.retranslate_tip', '重新翻译'), locked: true },
                { type: 'sep' }
            );
        }
        items.push(
            { action: 'set-review-status', review: 'approved', icon: 'fa-check', label: this.translateOrFallback('subtitle.review.mark_approved', '标为已审'), active: reviewStatus === 'approved', locked: true },
            { action: 'set-review-status', review: 'needs-work', icon: 'fa-triangle-exclamation', label: this.translateOrFallback('subtitle.review.mark_needs_work', '标为重做'), active: reviewStatus === 'needs-work', locked: true },
            { action: 'set-review-status', review: 'pending', icon: 'fa-clock-rotate-left', label: this.translateOrFallback('subtitle.review.mark_pending', '标为待审'), active: reviewStatus === 'pending', locked: true },
            { type: 'sep' },
            { action: 'rerecognize-translate', icon: 'fa-language', label: this.translateOrFallback('subtitle.editor.rerecognize_retranslate_tip', '识别并翻译'), locked: true },
            { action: 'split', icon: 'fa-scissors', label: this.translateOrFallback('subtitle.editor.split_tip', '拆分'), locked: true },
            { action: 'merge', icon: 'fa-link', label: this.translateOrFallback('subtitle.editor.merge_tip', '合并下一条'), locked: true },
            { action: 'compress', icon: 'fa-compress', label: this.translateOrFallback('subtitle.editor.compress_tip', '压缩时长'), locked: true },
            { type: 'sep' },
            { action: 'delete', icon: 'fa-trash', label: this.translateOrFallback('subtitle.editor.delete_tip', '删除'), locked: true, danger: true }
        );

        const menu = document.createElement('div');
        menu.className = 'subtitle-floating-actions-menu';
        menu.dataset.ownerIndex = String(index);
        menu.setAttribute('role', 'menu');
        menu.innerHTML = items.map((it) => {
            if (it.type === 'sep') return '<div class="floating-menu-sep" role="separator"></div>';
            const dis = it.locked && locked ? 'disabled' : '';
            const active = it.active ? 'is-active' : '';
            const danger = it.danger ? 'is-danger' : '';
            const reviewAttr = it.review ? ` data-review-status="${it.review}"` : '';
            return `<button type="button" class="floating-menu-item ${active} ${danger}" data-subtitle-action="${it.action}"${reviewAttr} ${dis} role="menuitem">
                <i class="fa-solid ${it.icon}"></i><span>${this.escapeHtml(it.label)}</span>
            </button>`;
        }).join('');

        menu.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const actionTarget = this.closest(e.target, '[data-subtitle-action]');
            if (!actionTarget || actionTarget.disabled) return;
            this.handleSubtitleAction(actionTarget, index);
            this.closeSecondaryActionMenus();
        });

        document.body.appendChild(menu);
        this._floatingMenu = menu;
        this._floatingMenuOwnerIndex = index;
        itemEl?.classList.add('actions-expanded');

        const rect = (anchorBtn || itemEl)?.getBoundingClientRect?.() || { top: 80, left: 80, bottom: 100, right: 120, width: 28, height: 28 };
        const menuRect = menu.getBoundingClientRect();
        const pad = 8;
        let top = rect.bottom + 6;
        let left = rect.right - menuRect.width;
        if (left < pad) left = pad;
        if (left + menuRect.width > window.innerWidth - pad) {
            left = Math.max(pad, window.innerWidth - menuRect.width - pad);
        }
        if (top + menuRect.height > window.innerHeight - pad) {
            top = Math.max(pad, rect.top - menuRect.height - 6);
        }
        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
    }

    syncAdaptiveActionLayouts() {
        this.listContent?.querySelectorAll('.subtitle-item').forEach((item) => {
            this.syncRowActionLayout(item);
        });
    }

    syncRowActionLayout(item) {
        const timeRow = item?.querySelector('.subtitle-time-row');
        const moreActions = item?.querySelector('.subtitle-actions-more');
        if (!timeRow || !moreActions) return;

        // Narrow left list: keep ⋯ menu, never force secondary actions inline
        if (this.isCompactListPanel()) {
            item.classList.remove('actions-inline');
            return;
        }

        item.classList.remove('actions-inline');
        // Don't strip open floating menu owner while measuring width
        const ownerOpen = this._floatingMenu && item.classList.contains('actions-expanded');
        if (!ownerOpen) {
            item.classList.remove('actions-expanded');
        }

        if (timeRow.clientWidth <= 0) {
            return;
        }

        item.classList.add('actions-inline');
        const fitsInline = timeRow.scrollWidth <= (timeRow.clientWidth + 1);
        if (!fitsInline) {
            item.classList.remove('actions-inline');
        }
    }

    handleDocumentClick(e) {
        const inside = this.closest(e?.target, '.subtitle-floating-actions-menu, .btn-more-actions, .subtitle-actions-more');
        if (inside) return;
        this.closeSecondaryActionMenus();
    }
}

window.SubtitleListRenderer = SubtitleListRenderer;

