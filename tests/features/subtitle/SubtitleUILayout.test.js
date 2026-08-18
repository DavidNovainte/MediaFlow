/** @jest-environment jsdom */

describe('SubtitleUILayout inspector state persistence', () => {
    let state;
    let flow;

    beforeAll(() => {
        require('../../../src/features/subtitle/ui/SubtitleUIBase');
        require('../../../src/features/subtitle/ui/SubtitleUILayout');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        window.requestAnimationFrame = (callback) => callback();

        document.body.innerHTML = `
            <div id="page-subtitle">
                <main class="subtitle-main-layout"></main>
                <nav class="inspector-tabs">
                    <button class="inspector-tab active" data-tab="tab-list">List</button>
                    <button class="inspector-tab" data-tab="tab-general">General</button>
                    <button class="inspector-tab" data-tab="tab-style">Style</button>
                </nav>
                <div class="inspector-content">
                    <div class="tab-content active" id="tab-list">
                        <div id="subtitle-list-container"></div>
                    </div>
                    <div class="tab-content" id="tab-general">
                        <div class="settings-section">
                            <label class="section-label">General Section</label>
                            <div class="ctrl-row-pro">General Content</div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-style">
                        <div class="settings-section">
                            <label class="section-label">Style Section</label>
                            <div class="ctrl-row-pro">Style Content</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        state = {
            activeTab: 'tab-style',
            tabScrollPositions: {
                'tab-style': 72
            },
            collapsedSections: {
                'tab-style:section:1': true
            }
        };

        flow = {
            uiManager: {
                getInspectorState: jest.fn(() => ({
                    activeTab: state.activeTab,
                    tabScrollPositions: { ...state.tabScrollPositions },
                    collapsedSections: { ...state.collapsedSections }
                })),
                persistInspectorState: jest.fn((partialState) => {
                    state = {
                        ...state,
                        ...partialState,
                        tabScrollPositions: {
                            ...state.tabScrollPositions,
                            ...(partialState.tabScrollPositions || {})
                        },
                        collapsedSections: {
                            ...state.collapsedSections,
                            ...(partialState.collapsedSections || {})
                        }
                    };
                })
            }
        };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('restores the saved tab, scroll position, and collapsed section state', () => {
        const layout = new window.SubtitleUILayout(flow);

        layout.initTabs();
        layout.initCollapsibleSections();

        const activeButton = document.querySelector('.inspector-tab.active');
        const styleTab = document.getElementById('tab-style');
        const styleSection = styleTab.querySelector('.settings-section');
        const styleBody = styleTab.querySelector('.settings-section-body');

        expect(activeButton.dataset.tab).toBe('tab-style');
        expect(styleTab.classList.contains('active')).toBe(true);
        expect(styleTab.scrollTop).toBe(72);
        expect(styleSection.classList.contains('is-collapsed')).toBe(true);
        expect(styleBody.hidden).toBe(true);
    });

    it('reapplies saved inspector width and timeline height when the inspector is active', () => {
        const layout = new window.SubtitleUILayout(flow);
        const mainLayout = document.querySelector('.subtitle-main-layout');

        layout.timelineHeight = 318;
        layout.inspectorWidth = 536;
        mainLayout.classList.add('inspector-active');

        layout.applySavedLayoutDimensions();

        expect(mainLayout.style.gridTemplateRows).toBe('1fr 318px');
        // 3-column layout: list | preview | inspector
        expect(mainLayout.style.gridTemplateColumns).toBe('300px minmax(0, 1fr) 536px');
    });

    it('persists updated scroll position and section collapse changes', () => {
        state.activeTab = 'tab-general';
        state.tabScrollPositions = { 'tab-general': 12 };
        state.collapsedSections = {};

        const layout = new window.SubtitleUILayout(flow);

        layout.initTabs();
        layout.initCollapsibleSections();

        const generalTab = document.getElementById('tab-general');
        generalTab.scrollTop = 144;
        generalTab.dispatchEvent(new Event('scroll'));
        jest.runAllTimers();

        const toggle = generalTab.querySelector('.section-collapse-toggle');
        toggle.click();

        expect(state.tabScrollPositions['tab-general']).toBe(144);
        expect(state.collapsedSections['tab-general:section:1']).toBe(true);
    });
});