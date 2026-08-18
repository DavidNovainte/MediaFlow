/**
 * SubtitleSearchHandler.js
 * 字幕搜索与替换逻辑引擎
 */
class SubtitleSearchHandler {
    constructor(editor) {
        this.editor = editor;
        this.searchQuery = '';
        this.replaceQuery = '';
        this.isRegex = false;
        this.caseSensitive = false;
        this.scope = 'all'; // 'all', 'translation', 'original'
        this.results = [];
        this.currentIndex = -1;
    }

    /**
     * 执行搜索并更新结果集
     */
    search(query, options = {}) {
        this.searchQuery = query;
        this.isRegex = options.isRegex || false;
        this.caseSensitive = options.caseSensitive || false;
        this.scope = options.scope || 'all';
        this.results = [];
        this.currentIndex = -1;

        if (!query) return [];

        const subs = this.editor.subtitles;
        let regex;

        if (this.isRegex) {
            try {
                regex = new RegExp(query, this.caseSensitive ? 'g' : 'gi');
            } catch (e) {
                console.error('[SearchHandler] Invalid Regex:', e);
                return [];
            }
        }

        subs.forEach((sub, index) => {
            const hasMatch = this.checkMatch(sub, query, regex);
            if (hasMatch) {
                this.results.push(index);
            }
        });

        return this.results;
    }

    checkMatch(sub, query, regex) {
        const texts = [];
        if (this.scope === 'all' || this.scope === 'original') texts.push(this.editor.getOriginalText(sub));
        if (this.scope === 'all' || this.scope === 'translation') texts.push(this.editor.getTranslatedText(sub));

        return texts.some(text => {
            if (!text) return false;
            if (this.isRegex && regex) {
                return regex.test(text);
            } else {
                const target = this.caseSensitive ? text : text.toLowerCase();
                const search = this.caseSensitive ? query : query.toLowerCase();
                return target.includes(search);
            }
        });
    }

    /**
     * 替换所有匹配项
     */
    replaceAll(searchQuery, replaceQuery, options = {}) {
        const results = this.search(searchQuery, options);
        if (results.length === 0) return 0;

        // 记录历史
        this.editor.addToHistory();

        let count = 0;
        const regex = this.isRegex ? new RegExp(searchQuery, this.caseSensitive ? 'g' : 'gi') : null;

        results.forEach(index => {
            const sub = this.editor.subtitles[index];
            if (!sub || this.editor.isSubtitleLocked?.(index)) {
                return;
            }
            let modified = false;

            if (this.scope === 'all' || this.scope === 'original') {
                const oldText = this.editor.getOriginalText(sub);
                const newText = this.performReplace(oldText, searchQuery, replaceQuery, regex);
                if (newText !== oldText) {
                    sub.originalText = newText;
                    modified = true;
                }
            }

            if (this.scope === 'all' || this.scope === 'translation') {
                const oldText = this.editor.getTranslatedText(sub);
                const newText = this.performReplace(oldText, searchQuery, replaceQuery, regex);
                if (newText !== oldText) {
                    sub.translatedText = newText;
                    modified = true;
                }
            }

            if (modified) {
                this.editor.syncSubtitleCompositeText(sub);
                count++;
            }
        });

        if (count > 0) {
            this.editor.render(this.editor.subtitles);
            this.editor.addToHistory();
            this.editor.flow.updateSubtitlePreview();
        }

        return count;
    }

    performReplace(text, search, replace, regex) {
        if (!text) return text;
        if (this.isRegex && regex) {
            return text.replace(regex, replace);
        } else {
            // 普通文本全局替换 (String.replaceAll fits well here)
            // Note: If not case sensitive, we need a regex for global replace anyway
            const flags = this.caseSensitive ? 'g' : 'gi';
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const r = new RegExp(escapedSearch, flags);
            return text.replace(r, replace);
        }
    }

    /**
     * 定位到下一个结果
     */
    next() {
        if (this.results.length === 0) return -1;
        this.currentIndex = (this.currentIndex + 1) % this.results.length;
        this.focusCurrent();
        return this.results[this.currentIndex];
    }

    /**
     * 定位到上一个结果
     */
    prev() {
        if (this.results.length === 0) return -1;
        this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
        this.focusCurrent();
        return this.results[this.currentIndex];
    }

    focusCurrent() {
        const index = this.results[this.currentIndex];
        if (index !== undefined) {
            this.editor.setActive(index);
            this.editor.scrollToIndex(index);
        }
    }

    /**
     * 替换当前匹配项
     */
    replaceCurrent(searchQuery, replaceQuery, options = {}) {
        if (this.currentIndex === -1 || this.results.length === 0) return false;

        const index = this.results[this.currentIndex];
        const sub = this.editor.subtitles[index];
        if (!sub || this.editor.isSubtitleLocked?.(index)) return false;

        // 记录历史
        this.editor.addToHistory();

        const regex = this.isRegex ? new RegExp(searchQuery, this.caseSensitive ? 'g' : 'gi') : null;
        let modified = false;

        if (this.scope === 'all' || this.scope === 'original') {
            const oldText = this.editor.getOriginalText(sub);
            const newText = this.performReplace(oldText, searchQuery, replaceQuery, regex);
            if (newText !== oldText) {
                sub.originalText = newText;
                modified = true;
            }
        }

        if (this.scope === 'all' || this.scope === 'translation') {
            const oldText = this.editor.getTranslatedText(sub);
            const newText = this.performReplace(oldText, searchQuery, replaceQuery, regex);
            if (newText !== oldText) {
                sub.translatedText = newText;
                modified = true;
            }
        }

        if (modified) {
            this.editor.syncSubtitleCompositeText(sub);
            this.editor.render(this.editor.subtitles);
            this.editor.addToHistory();
            this.editor.flow.updateSubtitlePreview();

            // 替换后自动查找下一个
            this.search(this.searchQuery, options);
            if (this.results.length > 0) {
                // 如果结果集变了（比如当前项不再匹配），currentIndex 可能需要重新寻找
                // 简单起见，直接跳到下一个
                this.next();
            }
            return true;
        }
        return false;
    }
}

window.SubtitleSearchHandler = SubtitleSearchHandler;
