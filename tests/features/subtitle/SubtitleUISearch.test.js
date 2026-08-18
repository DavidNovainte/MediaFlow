/** @jest-environment jsdom */

describe('SubtitleUISearch', () => {
    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <button id="btn-toggle-search"></button>
            <div id="search-replace-bar" class="search-replace-bar hidden">
                <input id="input-search" />
                <button id="btn-search-case"></button>
                <button id="btn-search-regex"></button>
                <button id="btn-search-prev"></button>
                <button id="btn-search-next"></button>
                <button id="btn-close-search"></button>
                <input id="input-replace" />
                <select id="search-scope">
                    <option value="all">all</option>
                    <option value="translation">translation</option>
                    <option value="original">original</option>
                </select>
                <button id="btn-replace"></button>
                <button id="btn-replace-all"></button>
                <div id="search-stats"></div>
            </div>
            <div id="subtitle-list-container">
                <div class="subtitle-item" data-index="0">
                    <textarea class="subtitle-textarea original-text">hello world</textarea>
                    <textarea class="subtitle-textarea translated-text">bonjour</textarea>
                </div>
                <div class="subtitle-item" data-index="1">
                    <textarea class="subtitle-textarea original-text">goodbye</textarea>
                    <textarea class="subtitle-textarea translated-text">hello again</textarea>
                </div>
            </div>
        `;

        require('../../../src/features/subtitle/ui/SubtitleUIBase.js');
        require('../../../src/features/subtitle/ui/SubtitleUISearch.js');
    });

    afterEach(() => {
        delete window.SubtitleUIBase;
        delete window.SubtitleUISearch;
    });

    test('highlights current subtitle search results and delegates replace actions to the search handler', () => {
        const subtitles = [
            { originalText: 'hello world', translatedText: 'bonjour' },
            { originalText: 'goodbye', translatedText: 'hello again' }
        ];

        const flow = {
            editor: {
                subtitles,
                getOriginalText: jest.fn((sub) => sub.originalText || ''),
                getTranslatedText: jest.fn((sub) => sub.translatedText || '')
            },
            searchHandler: {
                results: [],
                currentIndex: -1,
                search: jest.fn(() => [0, 1]),
                focusCurrent: jest.fn(),
                replaceCurrent: jest.fn(),
                replaceAll: jest.fn()
            }
        };

        const searchUI = new window.SubtitleUISearch(flow);
        searchUI.bindEvents();

        document.getElementById('btn-toggle-search').click();

        const searchInput = document.getElementById('input-search');
        searchInput.value = 'hello';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(flow.searchHandler.search).toHaveBeenCalledWith('hello', {
            caseSensitive: false,
            isRegex: false,
            scope: 'all'
        });
        expect(document.getElementById('search-stats').textContent).toBe('1 / 2');

        searchUI.renderHighlights();

        expect(document.querySelector('.subtitle-item[data-index="0"]').classList.contains('contains-search-result')).toBe(true);
        expect(document.querySelector('.subtitle-item[data-index="0"] .original-text').classList.contains('search-highlight-input')).toBe(true);
        expect(document.querySelector('.subtitle-item[data-index="0"]').classList.contains('search-match-active')).toBe(true);

        document.getElementById('btn-search-next').click();
        expect(flow.searchHandler.focusCurrent).toHaveBeenCalled();

        document.getElementById('input-replace').value = 'hi';
        document.getElementById('btn-replace').click();
        expect(flow.searchHandler.replaceCurrent).toHaveBeenCalledWith('hello', 'hi', {
            caseSensitive: false,
            isRegex: false,
            scope: 'all'
        });

        document.getElementById('btn-replace-all').click();
        expect(flow.searchHandler.replaceAll).toHaveBeenCalledWith('hello', 'hi', {
            caseSensitive: false,
            isRegex: false,
            scope: 'all'
        });
    });
});