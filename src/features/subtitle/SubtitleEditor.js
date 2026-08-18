/**
 * SubtitleEditor.js
 * 字幕编辑器核心：管理数据、历史记录与各模块协调。
 */
class SubtitleEditor {
    constructor(subtitleFlow) {
        this.flow = subtitleFlow;
        this.container = null;
        this.subtitles = [];
        this.activeSubtitleIndex = -1;
        this.loopingSubtitleIndex = -1;
        // Default lite in left list for density; restore user preference when set
        const savedView = localStorage.getItem('subtitle_list_view_mode');
        this.viewMode = (savedView === 'full' || savedView === 'lite') ? savedView : 'lite';
        this.showOriginal = false;
        this.showTranslation = true;
        this.showTtsSourceSelector = true;
        this.textLayoutMode = 'stacked';
        this.reviewFilter = 'all';

        // 历史记录 (弃用全局栈，改用轨道私有栈)
        this.maxHistory = 50;

        // 委托子模块
        this.renderer = new window.SubtitleListRenderer(this);
        this.handler = new window.SubtitleEditorActionHandler(this);
    }

    translateOrFallback(key, fallback) {
        const translated = window.i18n?.t?.(key);
        return translated && translated !== key ? translated : fallback;
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.renderer.init(this.container);
        this.applyViewModeToDom();
        this.setTextLayoutMode(this.textLayoutMode, { persist: false, announce: false });
        this.bindShortcuts();
        this.updateToggleUI();

        // 监听语言变更，刷新动态生成的列表内容（空状态、Tooltip 等）
        window.addEventListener('languageChanged', () => {
            console.log('[SubtitleEditor] Language changed, refreshing UI...');
            this.updateToggleUI(); 
            this.render(); // 刷新渲染器中的 i18n 文本 (如 No Data)
        });
    }

    applyViewModeToDom() {
        const listContainer = document.getElementById('subtitle-list-container');
        if (listContainer) {
            listContainer.classList.toggle('editor-lite-mode', this.viewMode === 'lite');
        }
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'subtitle') return;
            if (!this.container || this.container.style.display === 'none') return;
            if (document.getElementById('subtitle-shortcuts-overlay')) {
                if (e.key === 'Escape') document.getElementById('subtitle-shortcuts-overlay')?.remove();
                return;
            }

            const isInput = e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || !!e.target?.isContentEditable;
            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // Ctrl + Z/Y (撤销重做) - 即使在输入框也由我们全局处理
            if (mod && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                return;
            }
            if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
                return;
            }

            // Ctrl+F search
            if (mod && key === 'f') {
                e.preventDefault();
                document.getElementById('btn-toggle-search')?.click();
                setTimeout(() => document.getElementById('search-input')?.focus?.(), 50);
                return;
            }

            // Ctrl+Enter: in field → next cue (list renderer); outside → add cue
            if (mod && e.key === 'Enter' && !isInput) {
                e.preventDefault();
                this.addSubtitle?.();
                return;
            }

            // ? shortcuts help (shift+/ or bare ?)
            if (!isInput && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
                e.preventDefault();
                this.flow?.showShortcutsHelp?.();
                return;
            }

            if (e.altKey && !mod && key === 'l') {
                e.preventDefault();
                this.toggleTextLayoutMode();
                return;
            }

            if (!isInput && e.altKey && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                this.navigateVisibleSubtitles(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }

            if (!isInput && this.activeSubtitleIndex !== -1) {
                if (key === 'q') {
                    e.preventDefault();
                    if (!this.isSubtitleLocked(this.activeSubtitleIndex) && this.setReviewStatus(this.activeSubtitleIndex, 'approved')) {
                        window.app?.showToast?.(this.translateOrFallback('subtitle.review.approved', '已审'), 'success');
                    }
                    return;
                }

                if (key === 'w') {
                    e.preventDefault();
                    if (!this.isSubtitleLocked(this.activeSubtitleIndex) && this.setReviewStatus(this.activeSubtitleIndex, 'needs-work')) {
                        window.app?.showToast?.(this.translateOrFallback('subtitle.review.needs_work', '重做'), 'warning');
                    }
                    return;
                }

                if (key === 'l' && !e.altKey) {
                    e.preventDefault();
                    const locked = this.toggleSubtitleLock(this.activeSubtitleIndex);
                    if (typeof locked === 'boolean') {
                        window.app?.showToast?.(
                            locked
                                ? this.translateOrFallback('subtitle.review.locked', '已锁定')
                                : this.translateOrFallback('subtitle.review.unlocked', '已解锁'),
                            'info'
                        );
                    }
                    return;
                }
            }

            // 单按 S (在播放头剪断)
            if (key === 's' && !isInput && !mod) {
                e.preventDefault();
                this.splitAtPlayhead();
                return;
            }

            // Delete / Backspace
            if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
                e.preventDefault();
                this.handler.deleteSubtitles();
            }
        });
    }

    render(subtitles) {
        this.subtitles = this.normalizeSubtitles(subtitles || this.subtitles);
        this.syncActiveTrackSubtitles();
        console.log('[SubtitleEditor] Rendering subtitles. Count:', this.subtitles.length);
        if (this.renderer) {
            console.log('[SubtitleEditor] Calling renderer.render()...');
            this.renderer.render(this.subtitles);
        } else {
            console.error('[SubtitleEditor] Renderer MISING!');
        }
        // 渲染时通知时间轴刷新
        if (this.flow.timeline) {
            console.log('[SubtitleEditor] Calling timeline.render()...');
            this.flow.timeline.render(this.subtitles);
        }
    }

    // --- 数据更新入口 ---
    getOriginalText(sub) {
        if (!sub) return '';
        if (typeof sub.originalText === 'string' && sub.originalText.length > 0) {
            return sub.originalText;
        }

        const compositeText = typeof sub.text === 'string' ? sub.text : '';
        return compositeText.split('\n')[0] || '';
    }

    getTranslatedText(sub) {
        if (!sub) return '';
        if (typeof sub.translatedText === 'string' && sub.translatedText.length > 0) {
            return sub.translatedText;
        }

        const compositeText = typeof sub.text === 'string' ? sub.text : '';
        if (!compositeText.includes('\n')) return '';
        return compositeText.split('\n').slice(1).join('\n');
    }

    syncSubtitleCompositeText(sub) {
        if (!sub) return;

        const original = this.getOriginalText(sub);
        const translated = this.getTranslatedText(sub);

        sub.originalText = original;
        sub.translatedText = translated;
        sub.text = original && translated
            ? `${original}\n${translated}`
            : (translated || original || '');
    }

    syncActiveTrackSubtitles() {
        const track = this.getActiveTrack();
        if (!track || track.type === 'audio') return;
        track.subtitles = this.subtitles;
    }

    normalizeSubtitle(sub = {}) {
        if (!sub || typeof sub !== 'object') return sub;

        if (typeof sub.selected !== 'boolean') {
            sub.selected = false;
        }

        if (!['pending', 'approved', 'needs-work'].includes(sub.reviewStatus)) {
            sub.reviewStatus = 'pending';
        }

        sub.locked = !!sub.locked;
        if (!['original', 'translated'].includes(sub.ttsSource)) {
            sub.ttsSource = window.SubtitleUtils?.getPreferredTtsSource?.(sub) || 'original';
        }
        if (typeof sub.ttsSourceUserSet !== 'boolean') {
            sub.ttsSourceUserSet = false;
        }
        if (sub.translationTargetLang === undefined) {
            sub.translationTargetLang = null;
        }
        return sub;
    }

    normalizeSubtitles(subtitles = []) {
        if (!Array.isArray(subtitles)) return [];
        return subtitles.map((sub) => this.normalizeSubtitle(sub));
    }

    isValidReviewFilter(filter) {
        return ['all', 'pending', 'approved', 'needs-work', 'locked', 'unlocked', 'selected', 'qc'].includes(filter);
    }

    getFilteredSubtitleEntries() {
        return this.subtitles
            .map((sub, index) => ({ sub: this.normalizeSubtitle(sub), index }))
            .filter(({ sub, index }) => {
                switch (this.reviewFilter) {
                case 'pending':
                case 'approved':
                case 'needs-work':
                    return sub.reviewStatus === this.reviewFilter;
                case 'locked':
                    return !!sub.locked;
                case 'unlocked':
                    return !sub.locked;
                case 'selected':
                    return !!sub.selected;
                case 'qc':
                    return !!this.flow?.qualityHandler?.getErrorIndexSet?.().has(index);
                default:
                    return true;
                }
            });
    }

    setReviewFilter(filter = 'all') {
        if (!this.isValidReviewFilter(filter)) return;
        this.reviewFilter = filter;
        this.render();
    }

    navigateVisibleSubtitles(delta = 1) {
        const entries = this.getFilteredSubtitleEntries();
        if (!entries.length) return;

        const currentPosition = entries.findIndex((entry) => entry.index === this.activeSubtitleIndex);
        const fallbackIndex = delta >= 0 ? 0 : entries.length - 1;
        const nextPosition = currentPosition === -1
            ? fallbackIndex
            : Math.max(0, Math.min(entries.length - 1, currentPosition + delta));
        const nextEntry = entries[nextPosition];
        if (!nextEntry) return;

        this.setActive(nextEntry.index, true);
    }

    isSubtitleLocked(indexOrSubtitle) {
        const sub = typeof indexOrSubtitle === 'number'
            ? this.subtitles[indexOrSubtitle]
            : indexOrSubtitle;
        return !!sub?.locked;
    }

    getSelectedIndices({ includeActiveFallback = false, editableOnly = false } = {}) {
        const indices = this.subtitles
            .map((sub, index) => (sub?.selected ? index : -1))
            .filter((index) => index !== -1);

        if (!indices.length && includeActiveFallback && this.activeSubtitleIndex !== -1) {
            indices.push(this.activeSubtitleIndex);
        }

        return editableOnly
            ? indices.filter((index) => !this.isSubtitleLocked(index))
            : indices;
    }

    setReviewStatus(index, status, { render = true, addHistory = true } = {}) {
        if (!['pending', 'approved', 'needs-work'].includes(status)) return false;

        const sub = this.subtitles[index];
        if (!sub) return false;

        this.normalizeSubtitle(sub);
        if (sub.reviewStatus === status) return false;

        this.ensureHistoryBaseline();
        sub.reviewStatus = status;
        this.markHistoryDirty();

        if (render) {
            this.render();
        }

        if (addHistory) {
            this.addToHistory();
        }

        return true;
    }

    setReviewStatusForSelection(status) {
        const indices = this.getSelectedIndices({ includeActiveFallback: true });
        if (!indices.length) return 0;

        this.ensureHistoryBaseline();
        let changedCount = 0;
        indices.forEach((index) => {
            const sub = this.subtitles[index];
            this.normalizeSubtitle(sub);
            if (sub && sub.reviewStatus !== status) {
                sub.reviewStatus = status;
                changedCount += 1;
            }
        });

        if (!changedCount) return 0;

        this.markHistoryDirty();
        this.render();
        this.addToHistory();
        return changedCount;
    }

    toggleSubtitleLock(index, { render = true, addHistory = true } = {}) {
        const sub = this.subtitles[index];
        if (!sub) return false;

        this.ensureHistoryBaseline();
        this.normalizeSubtitle(sub);
        sub.locked = !sub.locked;
        this.markHistoryDirty();

        if (render) {
            this.render();
        }

        if (addHistory) {
            this.addToHistory();
        }

        return sub.locked;
    }

    setLockForSelection(locked) {
        const indices = this.getSelectedIndices({ includeActiveFallback: true });
        if (!indices.length) return 0;

        this.ensureHistoryBaseline();
        let changedCount = 0;
        indices.forEach((index) => {
            const sub = this.subtitles[index];
            this.normalizeSubtitle(sub);
            if (sub && sub.locked !== locked) {
                sub.locked = locked;
                changedCount += 1;
            }
        });

        if (!changedCount) return 0;

        this.markHistoryDirty();
        this.render();
        this.addToHistory();
        return changedCount;
    }

    updateSubtitleText(index, original, translated) {
        const sub = this.subtitles[index];
        if (sub) {
            if (this.isSubtitleLocked(sub)) return;
            sub.originalText = typeof original === 'string' ? original : '';
            sub.translatedText = typeof translated === 'string' ? translated : '';
            sub.translationTargetLang = sub.translatedText
                ? (this.flow.targetLanguage?.value || sub.translationTargetLang || null)
                : null;
            this.syncSubtitleCompositeText(sub);
            this.syncActiveTrackSubtitles();
            this.markHistoryDirty();
            this.flow.updateSubtitlePreview();

            // Programmatic updates (AI retranslate/compress/re-recognize) must refresh
            // the focused row as well, otherwise the virtual list keeps showing stale text.
            if (this.renderer) {
                this.renderer._forceRefreshFocused = true;
            }

            // 【核心修复】轻量化更新时间轴上的文本显示，而不触发全量 render
            if (this.flow.timeline?.clipsManager?._syncTextUI) {
                this.flow.timeline.clipsManager._syncTextUI(index);
            }

            if (this._ttsUpdateTimer) {
                clearTimeout(this._ttsUpdateTimer);
                this._ttsUpdateTimer = null;
            }

            // --- 鲁棒性：触发自动保存 ---
            this.flow.triggerAutoSave?.();
        }
    }

    updateSubtitle(index, field, value) {
        const sub = this.subtitles[index];
        if (!sub || !['start', 'end'].includes(field) || Number.isNaN(value)) return;
        if (this.isSubtitleLocked(sub)) return;

        this.ensureHistoryBaseline();

        if (field === 'start') {
            sub.start = Math.max(0, Math.min(value, sub.end - 0.1));
        } else {
            sub.end = Math.max(sub.start + 0.1, value);
        }

        const activeSub = sub;
        this.subtitles = [...this.subtitles].sort((a, b) => a.start - b.start);

        const track = this.getActiveTrack();
        if (track) {
            track.subtitles = this.subtitles;
        }

        this.activeSubtitleIndex = this.subtitles.indexOf(activeSub);
        this.render();
        this.flow.updateSubtitlePreview();
        this.flow.triggerAutoSave?.();
        this.addToHistory();
    }

    setActive(index, seekVideo = false) {
        this.activeSubtitleIndex = index;
        if (seekVideo && this.subtitles[index] && this.flow.video) {
            this.flow.video.currentTime = this.subtitles[index].start;
            if (this.flow.video.paused) this.flow.updateSubtitlePreview();
        }

        // --- 列表 UI 对齐 ---
        this.container.querySelectorAll('.subtitle-item.active').forEach(el => el.classList.remove('active'));

        // 核心修复：针对虚拟列表使用逻辑滚动接口
        if (this.renderer && typeof this.renderer.scrollToIndex === 'function') {
            this.renderer.scrollToIndex(index);
        }

        const curr = this.container.querySelector(`.subtitle-item[data-index="${index}"]`);
        if (curr) curr.classList.add('active');
        this.flow.uiManager?.settings?.refreshDubStatusPanel?.();

        // --- 时间轴 UI 对齐 ---
        if (this.flow.timeline) {
            // 【核心修复】如果存在轻量化同步接口，则优先调用，避免全量 render 销毁 DOM 导致双击失效
            if (this.flow.timeline.clipsManager && typeof this.flow.timeline.clipsManager._syncSelectionUI === 'function') {
                this.flow.timeline.clipsManager._syncSelectionUI();
            } else {
                this.flow.timeline.render();
            }
        }
    }

    /**
     * 强力聚焦并定位到特定字幕项 (用于双击预览区跳转)
     */
    focusSubtitle(index, seekVideo = false, focusInput = true) {
        if (index < 0 || index >= this.subtitles.length) return;

        // 1. 设置活跃状态并滚动
        this.setActive(index, seekVideo);

        // 2. 延时查找并聚焦输入框 (给虚拟列表生成 DOM 的时间)
        if (!focusInput) return;

        setTimeout(() => {
            if (!this.container) return;
            const item = this.container.querySelector(`.subtitle-item[data-index="${index}"]`);
            if (item) {
                // 优先聚焦译文框
                const textarea = item.querySelector('.translated-text') || item.querySelector('.original-text');
                if (textarea) {
                    textarea.focus({ preventScroll: true });
                    // 将光标移至末尾，方便继续录入
                    const len = textarea.value.length;
                    textarea.setSelectionRange(len, len);
                }
            }
        }, 300); // 增加延迟到 300ms 确保虚拟列表滚动彻底完成
    }

    // --- 业务操作转发至 Handler ---
    scrollToIndex(index) { this.renderer?.scrollToIndex?.(index); }
    addSubtitle() { this.handler.addSubtitle(); }
    deleteSubtitle(index) { this.handler.deleteSubtitle(index); }
    mergeWithNext(index) { this.handler.mergeWithNext(index); }
    splitSubtitle(index) { this.handler.splitSubtitle(index); }
    splitAtPlayhead() { this.handler.splitAtPlayhead(); }
    playSubtitle(index) { this.handler.playSubtitle(index); }
    loopSubtitle(index) { this.handler.loopSubtitle(index); }
    reRecognize(index) { this.handler.reRecognize(index); }
    reRecognizeAndRetranslate(index) { this.handler.reRecognize(index, { retranslate: true }); }
    retranslate(index) { this.handler.retranslate(index); }
    retranslateSelected() { this.handler.retranslateSelected(); }
    deleteSelected() { this.handler.deleteSelected(); }
    shiftSelected(offset) { this.handler.shiftSelected(offset); }
    compressTranslation(index) { this.handler.compressTranslation(index); }
    setTtsSource(index, source) { this.handler.setTtsSource(index, source); }
    setTtsSourceForSelection(source) { return this.handler.setTtsSourceForSelection(source); }
    updateSubtitleLocalTTS(index, settings) { this.handler.updateSubtitleLocalTTS(index, settings); }
    previewTts(index) { this.handler.previewTts(index); }
    moveSubtitle(from, to) { this.handler.moveSubtitle(from, to); }
    compressAllOverLimit() { this.handler.compressAllOverLimit(); }
    generateAllTTS() { this.handler.generateAllTTS(); }

    // --- 列表编辑区显示控制 ---
    /**
     * 三段式循环切换编辑列表显示语言: 译文 -> 双语 -> 原文
     */
    setDisplayMode(mode, { persist = true, announce = true } = {}) {
        const normalizedMode = window.SubtitleDisplayMode?.normalize
            ? window.SubtitleDisplayMode.normalize(mode)
            : (['translated', 'bilingual', 'original'].includes(mode) ? mode : 'translated');

        if (window.SubtitleDisplayMode?.applyToEditor) {
            window.SubtitleDisplayMode.applyToEditor(this, normalizedMode);
        } else {
            this.showOriginal = normalizedMode !== 'translated';
            this.showTranslation = normalizedMode !== 'original';
        }

        if (persist) {
            this.flow.preferenceManager?.set?.('editorDisplayMode', normalizedMode);
        }

        this.updateToggleUI();
        this.render();

        if (announce) {
            let msg = '';
            if (this.showOriginal && this.showTranslation) msg = window.i18n.t('subtitle.editor.status_bilingual');
            else if (this.showOriginal) msg = window.i18n.t('subtitle.editor.status_original');
            else msg = window.i18n.t('subtitle.editor.status_translated');
            window.app?.showToast?.(msg, 'info');
        }
    }

    cycleDisplayMode() {
        const currentMode = window.SubtitleDisplayMode?.fromEditor
            ? window.SubtitleDisplayMode.fromEditor(this)
            : (this.showOriginal ? (this.showTranslation ? 'bilingual' : 'original') : 'translated');
        const nextMode = window.SubtitleDisplayMode?.cycle
            ? window.SubtitleDisplayMode.cycle(currentMode)
            : (currentMode === 'translated' ? 'bilingual' : (currentMode === 'bilingual' ? 'original' : 'translated'));

        this.setDisplayMode(nextMode);
    }

    // 这些方法内部改写为调用 cycleDisplayMode，确保逻辑统一
    toggleOriginal() { this.cycleDisplayMode(); }
    toggleTranslation() { this.cycleDisplayMode(); }

    setTextLayoutMode(mode, { persist = true, announce = true } = {}) {
        const normalizedMode = mode === 'split' ? 'split' : 'stacked';
        this.textLayoutMode = normalizedMode;

        this.renderer?.applyTextLayoutMode?.(normalizedMode);
        this.updateToggleUI();

        if (persist) {
            this.flow.preferenceManager?.set?.('textLayoutMode', normalizedMode);
        }

        if (announce) {
            const toastKey = normalizedMode === 'split'
                ? 'subtitle.editor.status_layout_split'
                : 'subtitle.editor.status_layout_stacked';
            window.app?.showToast?.(window.i18n?.t?.(toastKey) || normalizedMode, 'info');
        }
    }

    toggleTextLayoutMode() {
        const nextMode = this.textLayoutMode === 'split' ? 'stacked' : 'split';
        this.setTextLayoutMode(nextMode);
    }

    updateToggleUI() {
        if (!this.flow) return;
        
        const btnDisplayMode = this.flow.btnCycleDisplayMode;
        if (btnDisplayMode) {
            const currentMode = window.SubtitleDisplayMode?.fromEditor
                ? window.SubtitleDisplayMode.fromEditor(this)
                : (this.showOriginal ? (this.showTranslation ? 'bilingual' : 'original') : 'translated');

            let badgeLabel;
            let title;
            if (currentMode === 'bilingual') {
                badgeLabel = this.translateOrFallback('subtitle.editor.display_label_bilingual', '双语');
                title = this.translateOrFallback('subtitle.editor.toggle_display_bilingual', '编辑列表：当前双语显示 (点击切到原文)');
            } else if (currentMode === 'original') {
                badgeLabel = this.translateOrFallback('subtitle.editor.display_label_original', '原文');
                title = this.translateOrFallback('subtitle.editor.toggle_display_original', '编辑列表：当前仅显示原文 (点击切到译文)');
            } else {
                badgeLabel = this.translateOrFallback('subtitle.editor.display_label_translated', '译文');
                title = this.translateOrFallback('subtitle.editor.toggle_display_translated', '编辑列表：当前仅显示译文 (点击切到双语)');
            }

            btnDisplayMode.dataset.displayMode = currentMode;
            btnDisplayMode.title = title;

            const badge = btnDisplayMode.querySelector('#subtitle-editor-display-badge, .toolbar-mode-badge');
            if (badge) {
                badge.textContent = badgeLabel;
            }
        }

        const btnTextLayout = this.flow.btnToggleTextLayout;
        if (btnTextLayout) {
            const isSplit = this.textLayoutMode === 'split';
            btnTextLayout.classList.toggle('active', isSplit);
            btnTextLayout.setAttribute('aria-pressed', isSplit ? 'true' : 'false');
            btnTextLayout.dataset.layoutMode = this.textLayoutMode;
            btnTextLayout.dataset.layoutLabel = isSplit
                ? window.i18n.t('subtitle.editor.layout_label_split')
                : window.i18n.t('subtitle.editor.layout_label_stacked');
            btnTextLayout.title = isSplit
                ? window.i18n.t('subtitle.editor.toggle_layout_split')
                : window.i18n.t('subtitle.editor.toggle_layout_stacked');

            const badge = btnTextLayout.querySelector('#subtitle-text-layout-badge, .toolbar-mode-badge');
            if (badge) {
                badge.textContent = btnTextLayout.dataset.layoutLabel;
            }
        }

        const btnView = this.flow.btnToggleView || document.getElementById('btn-toggle-view');
        if (btnView) {
            const isLite = this.viewMode === 'lite';
            btnView.classList.toggle('active', isLite);
            btnView.setAttribute('aria-pressed', isLite ? 'true' : 'false');
            btnView.title = isLite
                ? this.translateOrFallback('subtitle.editor.toggle_view_lite', '列表：精简视图（点击切换完整）')
                : this.translateOrFallback('subtitle.editor.toggle_view_full', '列表：完整视图（点击切换精简）');
            const icon = btnView.querySelector('i');
            if (icon) {
                icon.className = isLite ? 'fa-solid fa-list' : 'fa-solid fa-table-list';
            }
            const badge = btnView.querySelector('#subtitle-view-mode-badge, .toolbar-mode-badge');
            if (badge) {
                badge.textContent = isLite
                    ? this.translateOrFallback('subtitle.editor.view_label_lite', '精简')
                    : this.translateOrFallback('subtitle.editor.view_label_full', '完整');
            }
        }
    }

    toggleViewMode() {
        this.viewMode = (this.viewMode === 'lite' ? 'full' : 'lite');
        try {
            localStorage.setItem('subtitle_list_view_mode', this.viewMode);
        } catch (_) { /* ignore */ }
        this.applyViewModeToDom();
        this.renderer?.refreshTextLayoutMode?.();
        this.updateToggleUI();
        this.render();
        const msg = this.viewMode === 'lite'
            ? this.translateOrFallback('subtitle.editor.view_lite_on', '已切换到精简列表')
            : this.translateOrFallback('subtitle.editor.view_full_on', '已切换到完整列表');
        window.app?.showToast?.(msg, 'info');
    }

    // --- 历史管理 ---
    /**
     * 获取当前激活轨道
     */
    getActiveTrack() {
        return this.flow.trackManager?.tracks.find(t => t.id === this.flow.trackManager.activeTrackId);
    }

    withTrackAsActive(trackId, callback) {
        if (typeof callback !== 'function') return undefined;

        const trackManager = this.flow?.trackManager;
        if (!trackManager || !trackId || trackManager.activeTrackId === trackId) {
            return callback();
        }

        const previousTrackId = trackManager.activeTrackId;
        trackManager.activeTrackId = trackId;

        try {
            return callback();
        } finally {
            trackManager.activeTrackId = previousTrackId;
        }
    }

    markHistoryDirty() {
        const track = this.getActiveTrack();
        if (track) {
            track.historyDirty = true;
        }
    }

    ensureHistoryBaseline() {
        const track = this.getActiveTrack();
        if (!track) return;

        if (!track.history) track.history = [];
        if (track.historyIndex === undefined) track.historyIndex = -1;

        if (!track.historyDirty && track.historyIndex >= 0 && track.history[track.historyIndex] !== undefined) {
            return;
        }

        this.addToHistory();
    }

    /**
     * 添加历史记录点
     * @param {boolean} force 是否强制添加（跳过内容重复检查）
     */
    addToHistory(force = false) {
        const track = this.getActiveTrack();
        if (!track) return;

        // 确保轨道有历史栈初始化
        if (!track.history) track.history = [];
        if (track.historyIndex === undefined) track.historyIndex = -1;
        if (track.historyDirty === undefined) track.historyDirty = false;

        const entry = JSON.stringify(this.subtitles);
        
        // 如果内容没变且不是强制保存，则不增加记录
        if (!force && track.history[track.historyIndex] === entry) {
            return;
        }

        // 截断重做路径
        if (track.historyIndex < track.history.length - 1) {
            track.history = track.history.slice(0, track.historyIndex + 1);
        }

        track.history.push(entry); 
        track.historyIndex++;

        if (track.history.length > this.maxHistory) {
            track.history.shift();
            track.historyIndex--;
        }

        track.historyDirty = false;
        
        console.log(`[SubtitleEditor] History pushed for track ${track.name}. Index:`, track.historyIndex);
    }

    undo() {
        const track = this.getActiveTrack();
        if (!track || !track.history || track.historyIndex <= 0) {
            window.app?.showToast?.(window.i18n.t('subtitle.editor.no_more_undo'), 'warning');
            return;
        }

        track.historyIndex--;
        const snapshot = JSON.parse(track.history[track.historyIndex]);
        
        // 重要：同步更新编辑器引用和轨道引用
        this.subtitles = snapshot;
        track.subtitles = snapshot;
        track.historyDirty = false;

        this.render();
        this.flow.updateSubtitlePreview();
        window.app?.showToast?.(window.i18n.t('subtitle.editor.undo_done'), 'info');
        console.log(`[SubtitleEditor] Undo done for track ${track.name}. Remaining history:`, track.historyIndex + 1);
    }

    redo() {
        const track = this.getActiveTrack();
        if (!track || !track.history || track.historyIndex >= track.history.length - 1) {
            window.app?.showToast?.(window.i18n.t('subtitle.editor.no_more_redo'), 'warning');
            return;
        }

        track.historyIndex++;
        const snapshot = JSON.parse(track.history[track.historyIndex]);
        
        // 重要：同步更新编辑器引用和轨道引用
        this.subtitles = snapshot;
        track.subtitles = snapshot;
        track.historyDirty = false;

        this.render();
        this.flow.updateSubtitlePreview();
        window.app?.showToast?.(window.i18n.t('subtitle.editor.redo_done'), 'info');
        console.log(`[SubtitleEditor] Redo done for track ${track.name}. Index:`, track.historyIndex);
    }
}

window.SubtitleEditor = SubtitleEditor;
