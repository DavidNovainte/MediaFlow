/**
 * SubtitleUISearch.js
 * 
 * 专门处理字幕搜索与替换相关的 UI 和交互逻辑：
 * 1. 弹出和隐藏搜索框
 * 2. 局部高亮搜索结果
 * 3. 结果跳转与定位
 * 4. 替换指定文本
 */

class SubtitleUISearch extends window.SubtitleUIBase {
    constructor(flow) {
        super(flow);

        // 搜索相关状态
        this.searchResults = [];
        this.currentSearchIndex = -1;
        this.currentSearchTerm = '';
        this.currentOptions = {
            caseSensitive: false,
            isRegex: false,
            scope: 'all'
        };
        this.highlightRefreshFrame = null;
        this.listObserver = null;

        // 绑定自身方法
        this.bindEvents = this.bindEvents.bind(this);
    }

    bindEvents() {
        this.initSearchReplace();
        this.bindListObserver();
    }

    // ----------------- 搜索与替换 (Search & Replace) -----------------
    initSearchReplace() {
        const toggleBtn = document.getElementById('btn-toggle-search');
        const searchBox = document.getElementById('search-replace-bar');
        const closeBtn = document.getElementById('btn-close-search');

        const searchInput = document.getElementById('input-search');
        const replaceInput = document.getElementById('input-replace');
        const prevBtn = document.getElementById('btn-search-prev');
        const nextBtn = document.getElementById('btn-search-next');
        const replaceBtn = document.getElementById('btn-replace');
        const replaceAllBtn = document.getElementById('btn-replace-all');
        const caseBtn = document.getElementById('btn-search-case');
        const regexBtn = document.getElementById('btn-search-regex');
        const scopeSelect = document.getElementById('search-scope');

        if (!toggleBtn || !searchBox || !searchInput) return;

        const getOptions = () => ({
            caseSensitive: caseBtn?.classList.contains('active') || false,
            isRegex: regexBtn?.classList.contains('active') || false,
            scope: scopeSelect?.value || 'all'
        });

        const executeSearch = ({ preserveCurrentIndex = false } = {}) => {
            this.performSearch(searchInput.value, getOptions(), {
                preferredIndex: preserveCurrentIndex ? this.currentSearchIndex : 0
            });
        };

        // Toggle visibility
        const toggleSearch = () => {
            const isHidden = searchBox.classList.contains('hidden');
            if (isHidden) {
                searchBox.classList.remove('hidden');
                searchInput.focus();
                // 自动搜索选中的文本
                const selection = window.getSelection().toString();
                if (selection) {
                    searchInput.value = selection;
                    executeSearch();
                }
            } else {
                searchBox.classList.add('hidden');
                this.clearSearch();
            }
        };

        toggleBtn.addEventListener('click', toggleSearch);
        closeBtn.addEventListener('click', () => {
            searchBox.classList.add('hidden');
            this.clearSearch();
        });

        // 快捷键支持 (Ctrl+F)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const subtitlesLength = document.querySelectorAll('.subtitle-item').length;
                if (subtitlesLength > 0) {
                    toggleSearch();
                }
            }
        });

        // Search Logic
        searchInput.addEventListener('input', () => executeSearch());
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) this.navigateSearch(-1);
                else this.navigateSearch(1);
            } else if (e.key === 'Escape') {
                searchBox.classList.add('hidden');
                this.clearSearch();
            }
        });

        caseBtn?.addEventListener('click', () => {
            caseBtn.classList.toggle('active');
            executeSearch({ preserveCurrentIndex: true });
        });

        regexBtn?.addEventListener('click', () => {
            regexBtn.classList.toggle('active');
            executeSearch({ preserveCurrentIndex: true });
        });

        scopeSelect?.addEventListener('change', () => executeSearch({ preserveCurrentIndex: true }));

        prevBtn.addEventListener('click', () => this.navigateSearch(-1));
        nextBtn.addEventListener('click', () => this.navigateSearch(1));

        // Replace Logic
        replaceBtn.addEventListener('click', () => {
            if (this.currentSearchIndex >= 0 && this.searchResults.length > 0) {
                this.flow.searchHandler.currentIndex = this.currentSearchIndex;
                this.flow.searchHandler.replaceCurrent(searchInput.value, replaceInput.value, getOptions());
                executeSearch({ preserveCurrentIndex: true });
            }
        });

        replaceAllBtn.addEventListener('click', () => {
            if (this.searchResults.length > 0) {
                this.flow.searchHandler.replaceAll(searchInput.value, replaceInput.value, getOptions());
                executeSearch();
            }
        });
    }

    bindListObserver() {
        const listContainer = document.getElementById('subtitle-list-container');
        if (!listContainer || typeof MutationObserver === 'undefined') return;

        this.listObserver?.disconnect?.();
        this.listObserver = new MutationObserver(() => {
            if (!this.currentSearchTerm) return;
            this.scheduleHighlightRefresh();
        });
        this.listObserver.observe(listContainer, { childList: true, subtree: true });
    }

    performSearch(term, options = {}, { preferredIndex = 0 } = {}) {
        this.clearSearch({ keepTerm: false });
        if (!term) {
            this.updateSearchStats(0, -1);
            return;
        }

        this.currentSearchTerm = term;
        this.currentOptions = {
            caseSensitive: !!options.caseSensitive,
            isRegex: !!options.isRegex,
            scope: options.scope || 'all'
        };

        this.searchResults = this.flow.searchHandler.search(term, this.currentOptions) || [];

        if (this.searchResults.length === 0) {
            this.currentSearchIndex = -1;
            this.updateSearchStats(0, -1);
            return;
        }

        this.currentSearchIndex = Math.min(Math.max(preferredIndex, 0), this.searchResults.length - 1);
        this.flow.searchHandler.currentIndex = this.currentSearchIndex;
        this.scheduleHighlightRefresh();
        this.updateSearchStats(this.searchResults.length, this.currentSearchIndex);
    }

    clearSearch({ keepTerm = false } = {}) {
        this.searchResults = [];
        this.currentSearchIndex = -1;
        if (!keepTerm) {
            this.currentSearchTerm = '';
        }
        this.currentOptions = {
            caseSensitive: false,
            isRegex: false,
            scope: 'all'
        };
        if (this.flow.searchHandler) {
            this.flow.searchHandler.results = [];
            this.flow.searchHandler.currentIndex = -1;
        }

        document.querySelectorAll('.search-highlight-input').forEach(el => el.classList.remove('search-highlight-input'));
        document.querySelectorAll('.search-highlight-active').forEach(el => el.classList.remove('search-highlight-active'));
        document.querySelectorAll('.contains-search-result').forEach(el => el.classList.remove('contains-search-result'));
        document.querySelectorAll('.search-match-active').forEach(el => el.classList.remove('search-match-active'));

        this.updateSearchStats(0, -1);
    }

    navigateSearch(direction) {
        if (this.searchResults.length === 0) return;

        this.currentSearchIndex += direction;

        // 循环
        if (this.currentSearchIndex < 0) {
            this.currentSearchIndex = this.searchResults.length - 1;
        } else if (this.currentSearchIndex >= this.searchResults.length) {
            this.currentSearchIndex = 0;
        }

        this.flow.searchHandler.currentIndex = this.currentSearchIndex;
        this.focusSearchResult();
        this.updateSearchStats(this.searchResults.length, this.currentSearchIndex);
    }

    focusSearchResult() {
        const targetIndex = this.searchResults[this.currentSearchIndex];
        if (targetIndex === undefined) return;

        this.flow.searchHandler.currentIndex = this.currentSearchIndex;
        this.flow.searchHandler.focusCurrent();
        this.scheduleHighlightRefresh({ focusActiveMatch: true });
    }

    scheduleHighlightRefresh({ focusActiveMatch = false } = {}) {
        if (this.highlightRefreshFrame) {
            cancelAnimationFrame(this.highlightRefreshFrame);
        }

        this.highlightRefreshFrame = requestAnimationFrame(() => {
            this.highlightRefreshFrame = null;
            this.renderHighlights({ focusActiveMatch });
        });
    }

    renderHighlights({ focusActiveMatch = false } = {}) {
        document.querySelectorAll('.search-highlight-input').forEach((el) => el.classList.remove('search-highlight-input'));
        document.querySelectorAll('.search-highlight-active').forEach((el) => el.classList.remove('search-highlight-active'));
        document.querySelectorAll('.contains-search-result').forEach((el) => el.classList.remove('contains-search-result'));
        document.querySelectorAll('.search-match-active').forEach((el) => el.classList.remove('search-match-active'));

        if (!this.currentSearchTerm || this.searchResults.length === 0) {
            return;
        }

        const resultIndexSet = new Set(this.searchResults);
        const activeSubtitleIndex = this.searchResults[this.currentSearchIndex];

        document.querySelectorAll('.subtitle-item[data-index]').forEach((item) => {
            const index = Number.parseInt(item.dataset.index, 10);
            if (!resultIndexSet.has(index)) return;

            item.classList.add('contains-search-result');
            const fieldMatches = this.getFieldMatches(index);

            if (fieldMatches.original?.matched) {
                item.querySelector('.original-text')?.classList.add('search-highlight-input');
            }
            if (fieldMatches.translation?.matched) {
                item.querySelector('.translated-text')?.classList.add('search-highlight-input');
            }

            if (index === activeSubtitleIndex) {
                item.classList.add('search-match-active');
                const preferredField = fieldMatches.translation?.matched
                    ? item.querySelector('.translated-text')
                    : item.querySelector('.original-text');

                if (preferredField) {
                    preferredField.classList.add('search-highlight-active');
                    if (focusActiveMatch) {
                        this.focusMatchedRange(preferredField, fieldMatches.translation?.matched ? fieldMatches.translation : fieldMatches.original);
                    }
                }
            }
        });
    }

    updateSearchStats(total, current) {
        const stats = document.getElementById('search-stats');
        if (stats) {
            if (!this.currentSearchTerm) {
                stats.textContent = '';
            } else if (total === 0) {
                stats.textContent = '0 / 0';
            } else {
                stats.textContent = `${current + 1} / ${total}`;
            }
        }
    }

    getFieldMatches(index) {
        const sub = this.flow.editor?.subtitles?.[index];
        const matcher = this.createMatcher(this.currentSearchTerm, this.currentOptions);
        if (!sub || !matcher) {
            return {
                original: { matched: false, start: -1, length: 0 },
                translation: { matched: false, start: -1, length: 0 }
            };
        }

        const originalText = this.flow.editor?.getOriginalText?.(sub) || '';
        const translationText = this.flow.editor?.getTranslatedText?.(sub) || '';
        const originalMatch = (this.currentOptions.scope === 'all' || this.currentOptions.scope === 'original')
            ? matcher(originalText)
            : null;
        const translationMatch = (this.currentOptions.scope === 'all' || this.currentOptions.scope === 'translation')
            ? matcher(translationText)
            : null;

        return {
            original: originalMatch || { matched: false, start: -1, length: 0 },
            translation: translationMatch || { matched: false, start: -1, length: 0 }
        };
    }

    createMatcher(query, options = {}) {
        if (!query) return null;

        if (options.isRegex) {
            try {
                const regex = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
                return (text) => {
                    if (!text) return null;
                    regex.lastIndex = 0;
                    const match = regex.exec(text);
                    if (!match) return null;
                    return {
                        matched: true,
                        start: match.index,
                        length: String(match[0] || '').length
                    };
                };
            } catch {
                return null;
            }
        }

        const normalizedQuery = options.caseSensitive ? query : query.toLowerCase();
        return (text) => {
            const sourceText = String(text || '');
            const haystack = options.caseSensitive ? sourceText : sourceText.toLowerCase();
            const start = haystack.indexOf(normalizedQuery);
            if (start === -1) return null;
            return {
                matched: true,
                start,
                length: query.length
            };
        };
    }

    focusMatchedRange(field, matchInfo) {
        if (!field || !matchInfo?.matched) return;

        field.focus({ preventScroll: true });
        try {
            field.setSelectionRange(matchInfo.start, matchInfo.start + matchInfo.length);
        } catch {
            // ignore unsupported selection ranges
        }
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 意味着整个被匹配的字符串
    }
}

window.SubtitleUISearch = SubtitleUISearch;
