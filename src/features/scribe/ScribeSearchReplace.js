/**
 * ScribeSearchReplace.js
 * 负责转录文本的查找与替换功能
 */

class ScribeSearchReplace {
    /**
     * @param {ScribeFlow} scribeflow
     */
    constructor(scribeflow) {
        this.app = scribeflow;
        this.container = null;
        this.matches = []; // [{segmentIdx, charStart, charEnd}]
        this.currentMatchIdx = -1;
        this.isOpen = false;
    }

    init() {
        this.renderUI();
        this.bindEvents();
        this.bindGlobalShortcuts();
    }

    renderUI() {
        const div = document.createElement('div');
        div.className = 'scribe-search-modal';
        div.id = 'scribe-search-modal';

        div.innerHTML = `
            <div class="search-header">
                <span class="search-title">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    ${window.i18n?.t('common.transcribe.searchTitle') || 'Find & Replace'}
                </span>
                <button class="btn-close-search" id="btn-close-search">×</button>
            </div>
            
            <div class="search-input-group">
                <div class="search-field">
                    <input type="text" id="search-input" placeholder="${window.i18n?.t('common.transcribe.searchPlaceholder') || 'Find...'}">
                    <span class="match-count" id="search-match-count"></span>
                </div>
                <div class="search-field">
                    <input type="text" id="replace-input" placeholder="${window.i18n?.t('common.transcribe.replacePlaceholder') || 'Replace with...'}">
                </div>
            </div>

            <div class="search-actions">
                <div class="search-nav">
                    <button class="btn-search-nav" id="btn-prev-match" title="${window.i18n?.t('common.transcribe.prevMatch') || 'Previous'} (Shift+Enter)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="btn-search-nav" id="btn-next-match" title="${window.i18n?.t('common.transcribe.nextMatch') || 'Next'} (Enter)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-replace-all" id="btn-replace-all">${window.i18n?.t('common.transcribe.replaceAll') || 'Replace All'}</button>
                    <button class="btn-replace-action" id="btn-replace-one">${window.i18n?.t('common.transcribe.replace') || 'Replace'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(div);
        this.container = div;
    }

    bindEvents() {
        const closeBtn = this.container.querySelector('#btn-close-search');
        const searchInput = this.container.querySelector('#search-input');
        const replaceInput = this.container.querySelector('#replace-input');
        const prevBtn = this.container.querySelector('#btn-prev-match');
        const nextBtn = this.container.querySelector('#btn-next-match');
        const replaceBtn = this.container.querySelector('#btn-replace-one');
        const replaceAllBtn = this.container.querySelector('#btn-replace-all');

        closeBtn.addEventListener('click', () => this.close());

        searchInput.addEventListener('input', () => {
            this.performSearch(searchInput.value);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    this.prevMatch();
                } else {
                    this.nextMatch();
                }
                e.preventDefault();
            }
        });

        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                this.replaceCurrent();
                e.preventDefault();
            }
        });

        prevBtn.addEventListener('click', () => this.prevMatch());
        nextBtn.addEventListener('click', () => this.nextMatch());

        replaceBtn.addEventListener('click', () => this.replaceCurrent());
        replaceAllBtn.addEventListener('click', () => this.replaceAll());
    }

    bindGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.open();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    open() {
        this.container.classList.add('active');
        this.isOpen = true;
        const input = this.container.querySelector('#search-input');
        input.focus();
        if (input.value) {
            input.select();
            this.performSearch(input.value);
        }
    }

    close() {
        this.container.classList.remove('active');
        this.isOpen = false;
        // Optional: Clear highlights when closing
        // this.app.editor.render(); 
    }

    getSegments() {
        return this.app.currentVersion === 'polished' ? this.app.polishedSegments : this.app.rawSegments;
    }

    performSearch(term) {
        if (!term) {
            this.matches = [];
            this.currentMatchIdx = -1;
            this.updateCountUI();
            this.app.editor.render(); // Clear highlights
            return;
        }

        const segments = this.getSegments();
        if (!segments) return;

        this.matches = [];
        const lowerTerm = term.toLowerCase();

        segments.forEach((seg, sIdx) => {
            const text = seg.text || '';
            const lowerText = text.toLowerCase();
            let index = 0;

            while ((index = lowerText.indexOf(lowerTerm, index)) >= 0) {
                this.matches.push({
                    segmentIdx: sIdx,
                    charStart: index,
                    charEnd: index + term.length
                });
                index += term.length;
            }
        });

        if (this.matches.length > 0) {
            this.currentMatchIdx = 0;
            this.scrollToMatch(0);
        } else {
            this.currentMatchIdx = -1;
        }

        this.updateCountUI();
        // Here we could implement high-perf highlighting, but for now re-rendering list usually breaks focus or is heavy.
        // A better approach for Highlight (Ctrl+F style) without breaking DOM is using a specific Highlight Overlay or modifying innerHTML directly.
        // For simplicity: We will just scroll to match. A true highlight needs render support in Editor.
        // Let's scroll first.
    }

    nextMatch() {
        if (this.matches.length === 0) return;
        this.currentMatchIdx++;
        if (this.currentMatchIdx >= this.matches.length) {
            this.currentMatchIdx = 0;
        }
        this.scrollToMatch(this.currentMatchIdx);
        this.updateCountUI();
    }

    prevMatch() {
        if (this.matches.length === 0) return;
        this.currentMatchIdx--;
        if (this.currentMatchIdx < 0) {
            this.currentMatchIdx = this.matches.length - 1;
        }
        this.scrollToMatch(this.currentMatchIdx);
        this.updateCountUI();
    }

    scrollToMatch(matchIdx) {
        const match = this.matches[matchIdx];
        if (!match) return;

        // Notify Editor to highlight/scroll
        // This requires Editor to support "selecting" a range or at least a segment.
        // Let's reuse 'highlightCurrentSegment' logic but maybe blink it.
        // Or better: Just scroll the segment into view and define a temporary selection.

        const segEl = document.getElementById(`segment-${match.segmentIdx}`);
        if (segEl) {
            segEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Visual feedback
            const textEl = segEl.querySelector('.segment-text');
            if (textEl) {
                textEl.classList.add('flash-highlight');
                setTimeout(() => textEl.classList.remove('flash-highlight'), 1000);
            }
        }
    }

    updateCountUI() {
        const el = this.container.querySelector('#search-match-count');
        if (this.matches.length === 0) {
            el.textContent = window.i18n?.t('common.transcribe.noResults') || 'No results';
        } else {
            el.textContent = `${this.currentMatchIdx + 1}/${this.matches.length}`;
        }
    }

    replaceCurrent() {
        if (this.currentMatchIdx === -1 || !this.matches[this.currentMatchIdx]) return;

        const replaceTerm = this.container.querySelector('#replace-input').value || '';
        const searchInput = this.container.querySelector('#search-input');
        const searchTerm = searchInput.value;
        const match = this.matches[this.currentMatchIdx];

        const segments = this.getSegments();
        const segment = segments[match.segmentIdx];

        // Check if text still matches (it might have changed)
        const currentText = segment.text;
        const targetStr = currentText.substring(match.charStart, match.charEnd);

        if (targetStr.toLowerCase() === searchTerm.toLowerCase()) {
            // Do replacement
            const pre = currentText.substring(0, match.charStart);
            const post = currentText.substring(match.charEnd);
            segment.text = pre + replaceTerm + post; // Preserve case? No, simple replace.

            // Re-render editor
            this.app.editor.render();

            // Re-calculate matches because indices shifted
            this.performSearch(searchTerm);

            window.app?.showToast(window.i18n?.t('common.transcribe.replaced') || 'Replaced', 'success');
        }
    }

    replaceAll() {
        const searchTerm = this.container.querySelector('#search-input').value;
        const replaceTerm = this.container.querySelector('#replace-input').value || '';

        if (!searchTerm) return;

        const segments = this.getSegments();
        let count = 0;

        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); // Escape regex chars, Global Case-insensitive

        segments.forEach(seg => {
            if (seg.text && regex.test(seg.text)) {
                // Count occurrences
                const matches = seg.text.match(regex);
                count += matches ? matches.length : 0;
                seg.text = seg.text.replace(regex, replaceTerm);
            }
        });

        this.app.editor.render();
        this.performSearch(searchTerm); // Refresh matches (should be 0)

        window.app?.showToast(window.i18n?.t('common.transcribe.replacedAllCount', { count }) || `Replaced all ${count} matches`, 'success');
    }
}

window.ScribeSearchReplace = ScribeSearchReplace;
