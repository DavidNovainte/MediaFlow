/**
 * SubtitleUILayout.js
 * 
 * 专门处理布局自适应相关 UI 逻辑：
 * 1. 左右分栏拖拽调整 (Resizer)
 * 2. 视频元素随窗口自适应 (VideoLayoutObserver)
 * 3. 影院模式切换 (Cinema Mode)
 * 4. 侧边栏 Tabs 切换 (Settings vs AI Enhance)
 */

class SubtitleUILayout extends window.SubtitleUIBase {
    constructor(flow) {
        super(flow);
        this.videoLayoutObserver = null;
        this.tabButtons = [];
        this.tabContents = [];
        this.tabIndicator = null;
        this.updateTabIndicator = () => {};
        this.scrollSaveTimers = new Map();
        // 存储用户偏好的高度和宽度
        this.timelineHeight = parseInt(localStorage.getItem('subtitle_timeline_height')) || 260;
        this.inspectorWidth = parseInt(localStorage.getItem('subtitle_inspector_width')) || 420;
        this.listWidth = this.clampListWidth(parseInt(localStorage.getItem('subtitle_list_width'), 10) || 300);

        // 绑定自身方法
        this.bindEvents = this.bindEvents.bind(this);
    }

    clampListWidth(w) {
        const n = Number(w) || 300;
        return Math.min(480, Math.max(220, n));
    }

    clampInspectorWidth(w) {
        const n = Number(w) || 420;
        const maxWidth = Math.max(360, window.innerWidth * 0.55);
        return Math.min(maxWidth, Math.max(280, n));
    }

    /**
     * List | Preview [| Inspector] columns from persisted widths.
     */
    applyColumnLayout(mainLayout = document.querySelector('.subtitle-main-layout')) {
        if (!mainLayout) return;
        const listW = this.clampListWidth(this.listWidth);
        this.listWidth = listW;
        if (mainLayout.classList.contains('inspector-active')) {
            const inspW = this.clampInspectorWidth(this.inspectorWidth);
            this.inspectorWidth = inspW;
            mainLayout.style.gridTemplateColumns = `${listW}px minmax(0, 1fr) ${inspW}px`;
        } else {
            mainLayout.style.gridTemplateColumns = `${listW}px minmax(0, 1fr)`;
        }
    }

    bindEvents() {
        this.applySavedLayoutDimensions();

        this.initListResizer();
        this.initLayoutResizer();
        this.initTimelineResizer(); // 垂直高度调整
        this.setupVideoLayoutObserver();
        this.initTabs();
        this.initCollapsibleSections();
        this.initCinemaMode();
        this.initHeaderDropdowns();
    }

    getInspectorUIState() {
        return this.flow.uiManager?.getInspectorState?.() || {
            activeTab: 'tab-general',
            tabScrollPositions: {},
            collapsedSections: {}
        };
    }

    persistUIState(partialState = {}) {
        this.flow.uiManager?.persistInspectorState?.(partialState);
    }

    applySavedLayoutDimensions() {
        const mainLayout = document.querySelector('.subtitle-main-layout');
        if (!mainLayout) return;

        if (this.timelineHeight !== 260) {
            mainLayout.style.gridTemplateRows = `1fr ${this.timelineHeight}px`;
        }

        this.applyColumnLayout(mainLayout);
        if (this.timelineHeight) {
            mainLayout.style.setProperty('--subtitle-timeline-h', `${this.timelineHeight}px`);
        }
    }

    getScrollContainerForTab(tabId) {
        if (!tabId) return null;
        if (tabId === 'tab-list') {
            return document.getElementById('subtitle-list-container') || document.getElementById(tabId);
        }
        return document.getElementById(tabId);
    }

    scheduleScrollPersistence(tabId, scrollTop) {
        const existingTimer = this.scrollSaveTimers.get(tabId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            const currentState = this.getInspectorUIState();
            this.persistUIState({
                tabScrollPositions: {
                    ...(currentState.tabScrollPositions || {}),
                    [tabId]: Math.max(0, Math.round(scrollTop))
                }
            });
            this.scrollSaveTimers.delete(tabId);
        }, 120);

        this.scrollSaveTimers.set(tabId, timer);
    }

    restoreTabScroll(tabId) {
        const savedScroll = Number(this.getInspectorUIState().tabScrollPositions?.[tabId] || 0);
        if (!savedScroll) return;

        const scrollContainer = this.getScrollContainerForTab(tabId);
        if (!scrollContainer) return;

        const applyScroll = () => {
            scrollContainer.scrollTop = savedScroll;
        };

        requestAnimationFrame(applyScroll);

        if (tabId === 'tab-list' && typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(() => {
                applyScroll();
                if (scrollContainer.scrollTop === savedScroll) {
                    observer.disconnect();
                }
            });
            observer.observe(scrollContainer, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 3000);
        }
    }

    bindTabScrollPersistence(tabId) {
        const scrollContainer = this.getScrollContainerForTab(tabId);
        if (!scrollContainer || scrollContainer.dataset.scrollPersistenceBound === 'true') return;

        scrollContainer.dataset.scrollPersistenceBound = 'true';
        scrollContainer.addEventListener('scroll', () => {
            this.scheduleScrollPersistence(tabId, scrollContainer.scrollTop);
        }, { passive: true });
    }

    // ----------------- Header Dropdowns -----------------
    initHeaderDropdowns() {
        const pathBtn = document.getElementById('btn-path-dropdown');
        const pathContent = document.getElementById('path-dropdown-content');

        if (pathBtn && pathContent) {
            // Toggle dropdown
            pathBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevents document click from immediately closing it
                pathContent.classList.toggle('show');
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (pathContent.classList.contains('show') && !pathContent.contains(e.target) && !pathBtn.contains(e.target)) {
                    pathContent.classList.remove('show');
                }
            });
        }
    }

    // ----------------- 布局拖拽 (Layout Resizer) -----------------
    /**
     * Left list column drag — same pattern as inspector, state-driven.
     */
    initListResizer() {
        const resizer = document.getElementById('list-resizer');
        const mainLayout = document.querySelector('.subtitle-main-layout');
        if (!resizer || !mainLayout) return;

        let isResizing = false;
        let startX = 0;
        let startWidthState = 0;

        resizer.addEventListener('mousedown', (e) => {
            if (mainLayout.classList.contains('cinema-mode')) return;
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            startX = e.clientX;
            startWidthState = this.listWidth;

            document.body.style.cursor = 'col-resize';
            mainLayout.style.transition = 'none';
            mainLayout.classList.add('resizing');
            document.body.style.userSelect = 'none';
            resizer.classList.add('active');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Drag right → wider list
            const dx = e.clientX - startX;
            this.listWidth = this.clampListWidth(startWidthState + dx);
            this.applyColumnLayout(mainLayout);
            mainLayout.style.gridTemplateRows = `1fr ${this.timelineHeight}px`;
            mainLayout.style.setProperty('--subtitle-timeline-h', `${this.timelineHeight}px`);
        });

        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = '';
            mainLayout.classList.remove('resizing');
            mainLayout.style.transition = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('active');
            localStorage.setItem('subtitle_list_width', String(Math.round(this.listWidth)));
            window.dispatchEvent(new Event('resize'));
        };

        document.addEventListener('mouseup', stopResize);
        document.addEventListener('mouseleave', stopResize);
    }

    /**
     * Right inspector width drag (state-driven).
     */
    initLayoutResizer() {
        const resizer = document.getElementById('inspector-resizer');
        const mainLayout = document.querySelector('.subtitle-main-layout');

        if (!resizer || !mainLayout) return;

        let isResizing = false;
        let startX = 0;
        let startWidthState = 0; // 记录按下时的起始状态值

        resizer.addEventListener('mousedown', (e) => {
            // 只有在侧边栏激活状态下才允许拖拽
            if (!mainLayout.classList.contains('inspector-active')) return;

            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            startX = e.clientX;
            // 始终从我们维护的 this.inspectorWidth 起步，而非 CSS 正在动画中的中间值
            startWidthState = this.inspectorWidth;

            document.body.style.cursor = 'col-resize';
            // 立即禁掉 transition，进入绝对控制模式
            mainLayout.style.transition = 'none';
            mainLayout.classList.add('resizing');
            document.body.style.userSelect = 'none';
            resizer.classList.add('active');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            // 计算位移增量: 向左拖拽 (clientX 变小) = dx 为正 = 宽度变大
            const dx = startX - e.clientX;
            this.inspectorWidth = this.clampInspectorWidth(startWidthState + dx);
            this.applyColumnLayout(mainLayout);

            // Keep timeline row height in sync while dragging inspector width
            mainLayout.style.gridTemplateRows = `1fr ${this.timelineHeight}px`;
            mainLayout.style.setProperty('--subtitle-timeline-h', `${this.timelineHeight}px`);
        });

        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;

            document.body.style.cursor = '';
            mainLayout.classList.remove('resizing');
            // 恢复 CSS 文件中定义的过渡动画
            mainLayout.style.transition = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('active');

            // 写入持久化存储
            localStorage.setItem('subtitle_inspector_width', String(Math.round(this.inspectorWidth)));
            // 触发表内的组件重绘（波形图、视频列表等）
            window.dispatchEvent(new Event('resize'));
        };

        document.addEventListener('mouseup', stopResize);
        document.addEventListener('mouseleave', stopResize);
    }

    // ----------------- 底部高度拖拽 (Timeline Resizer) -----------------
    initTimelineResizer() {
        // 延迟初始化，确保 DOM 已完全渲染
        setTimeout(() => this._setupTimelineResizer(), 300);
    }

    _setupTimelineResizer() {
        const mainLayout = document.querySelector('.subtitle-main-layout');
        // 直接把 timeline-header 作为拖拽柄
        const handle = document.querySelector('#subtitle-timeline-container .timeline-header');

        if (!mainLayout || !handle) {
            console.warn('[TimelineResizer] 无法找到元素', { mainLayout, handle });
            return;
        }

        console.log('[TimelineResizer] 初始化成功', handle);

        // 把 header 改为拖拽柄样式
        handle.style.cursor = 'row-resize';
        handle.title = window.i18n.t('subtitle.layout.drag_resize');

        let isResizing = false;
        let hasMovedStarted = false;
        let startY, startHeight;
        const dragThreshold = 3;

        handle.addEventListener('mousedown', (e) => {
            // 防止与内部按键冲突
            if (this.closest(e.target, 'button') || this.closest(e.target, 'input') || this.closest(e.target, 'select')) return;

            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            hasMovedStarted = false;
            startY = e.clientY;
            startHeight = this.timelineHeight;

            handle.style.background = 'rgba(77, 130, 201, 0.15)';
            document.body.style.cursor = 'row-resize';
            mainLayout.style.transition = 'none';
            mainLayout.classList.add('resizing');
            document.body.style.userSelect = 'none';
            console.log('[TimelineResizer] 开始拖拽', startY, startHeight);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const dy = startY - e.clientY;

            if (!hasMovedStarted) {
                if (Math.abs(dy) > dragThreshold) {
                    hasMovedStarted = true;
                } else {
                    return;
                }
            }

            let newHeight = startHeight + dy;

            const maxHeight = window.innerHeight * 0.7;
            if (newHeight < 60) newHeight = 60;
            if (newHeight > maxHeight) newHeight = maxHeight;

            this.timelineHeight = newHeight;
            mainLayout.style.gridTemplateRows = `1fr ${newHeight}px`;
        });

        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;
            handle.style.background = '';
            document.body.style.cursor = '';
            mainLayout.style.transition = '';
            mainLayout.classList.remove('resizing');
            document.body.style.userSelect = '';

            localStorage.setItem('subtitle_timeline_height', this.timelineHeight);
            window.dispatchEvent(new Event('resize'));
            console.log('[TimelineResizer] 拖拽结束', this.timelineHeight);
        };

        document.addEventListener('mouseup', stopResize);
    }

    // ----------------- 视频自适应对齐 (Video Layout Observer) -----------------
    setupVideoLayoutObserver() {
        const { video, container } = this.elements;
        if (!video || !container) return;

        const updateLayout = () => {
            if (!video.videoWidth || !video.videoHeight) return;

            const vRatio = video.videoWidth / video.videoHeight;
            const cRect = container.getBoundingClientRect();
            // 剔除 padding
            const cStyle = window.getComputedStyle(container);
            const cWidth = cRect.width - parseFloat(cStyle.paddingLeft) - parseFloat(cStyle.paddingRight);
            const cHeight = cRect.height - parseFloat(cStyle.paddingTop) - parseFloat(cStyle.paddingBottom);
            const cRatio = cWidth / cHeight;

            let renderWidth, renderHeight;

            if (vRatio > cRatio) {
                // 视频比容器更宽，基于宽度适配
                renderWidth = cWidth;
                renderHeight = cWidth / vRatio;
            } else {
                // 视频比容器更长，基于高度适配
                renderHeight = cHeight;
                renderWidth = cHeight * vRatio;
            }

            // 更新容器内覆盖层的位置，使其绝对贴合实际的画面区域
            const topOffset = (cHeight - renderHeight) / 2;
            const leftOffset = (cWidth - renderWidth) / 2;

            container.style.setProperty('--video-render-width', `${renderWidth}px`);
            container.style.setProperty('--video-render-height', `${renderHeight}px`);
            container.style.setProperty('--video-render-top', `${topOffset}px`);
            container.style.setProperty('--video-render-left', `${leftOffset}px`);
            
            // 兼容性变量，供 SubtitlePreviewHandler 使用
            document.documentElement.style.setProperty('--v-render-h', `${renderHeight}px`);
            document.documentElement.style.setProperty('--v-render-w', `${renderWidth}px`);
        };

        // 绑定事件
        video.addEventListener('loadedmetadata', updateLayout);
        window.addEventListener('resize', updateLayout);

        // 使用 ResizeObserver 监听容器本身的尺寸变化 (比 window resize 更精确)
        this.videoLayoutObserver = new ResizeObserver(() => {
            // 用 requestAnimationFrame 防抖
            requestAnimationFrame(updateLayout);
        });
        this.videoLayoutObserver.observe(container);

        // 初始化跑一次
        if (video.readyState >= 1) updateLayout();
    }

    // ----------------- Tabs 切换 -----------------
    initTabs() {
        const page = document.getElementById('page-subtitle');
        if (!page) return;

        const tabBtns = Array.from(page.querySelectorAll('.inspector-tab'));
        const tabContents = Array.from(page.querySelectorAll('.tab-content'));
        const indicator = page.querySelector('.tab-indicator'); // Optional

        if (!tabBtns.length || !tabContents.length) return;

        this.tabButtons = tabBtns;
        this.tabContents = tabContents;
        this.tabIndicator = indicator;
        tabBtns.forEach((btn) => this.bindTabScrollPersistence(btn.getAttribute('data-tab')));

        this.updateTabIndicator = (activeTab) => {
            if (!indicator) return;
            indicator.style.width = `${activeTab.offsetWidth}px`;
            indicator.style.left = `${activeTab.offsetLeft}px`;
        };

        const setActiveTab = (targetId, { persist = true } = {}) => {
            const targetBtn = tabBtns.find((btn) => btn.getAttribute('data-tab') === targetId) || tabBtns[0];
            if (!targetBtn) return;

            tabBtns.forEach((btn) => {
                btn.classList.toggle('active', btn === targetBtn);
            });

            tabContents.forEach((content) => {
                content.classList.toggle('active', content.id === targetBtn.getAttribute('data-tab'));
            });

            this.updateTabIndicator(targetBtn);
            this.restoreTabScroll(targetBtn.getAttribute('data-tab'));

            if (persist) {
                this.flow.uiManager?.persistInspectorState?.({
                    activeTab: targetBtn.getAttribute('data-tab')
                });
            }
        };

        this.activateTab = (targetId, options = {}) => {
            setActiveTab(targetId, options);
        };

        this.applyPersistedTabState = (targetId) => {
            setActiveTab(targetId, { persist: false });
        };

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveTab(btn.getAttribute('data-tab'));
            });
        });

        // Initialize active state
        let savedActiveTab = this.flow.uiManager?.getInspectorState?.().activeTab;
        // List tab moved out of inspector — migrate old preference
        if (savedActiveTab === 'tab-list') {
            savedActiveTab = 'tab-general';
        }
        const initialActiveId = tabBtns.some((btn) => btn.getAttribute('data-tab') === savedActiveTab)
            ? savedActiveTab
            : (page.querySelector('.inspector-tab.active')?.getAttribute('data-tab') || tabBtns[0].getAttribute('data-tab'));
        if (initialActiveId) {
            setActiveTab(initialActiveId, { persist: false });
            setTimeout(() => {
                const currentActive = page.querySelector('.inspector-tab.active');
                if (currentActive) this.updateTabIndicator(currentActive);
            }, 50); // wait for layout paint
        }
        window.addEventListener('resize', () => {
            const currentActive = page.querySelector('.inspector-tab.active');
            if (currentActive) this.updateTabIndicator(currentActive);
        });
    }

    initCollapsibleSections() {
        const page = document.getElementById('page-subtitle');
        if (!page) return;

        const collapsedSections = this.getInspectorUIState().collapsedSections || {};
        const tabContents = Array.from(page.querySelectorAll('.tab-content')).filter((tab) => tab.id !== 'tab-list');

        tabContents.forEach((tab) => {
            const sections = Array.from(tab.querySelectorAll('.settings-section'));
            sections.forEach((section, index) => {
                if (section.dataset.collapseReady === 'true') return;

                const sectionKey = `${tab.id}:section:${index + 1}`;
                const directChildren = Array.from(section.children);
                let header = directChildren.find((child) => child.classList?.contains('section-header')) || null;

                if (!header) {
                    const label = directChildren.find((child) => child.classList?.contains('section-label'));
                    if (!label) return;

                    header = document.createElement('div');
                    header.className = 'section-header section-header-generated';
                    section.insertBefore(header, label);
                    header.appendChild(label);
                }

                let body = directChildren.find((child) => child.classList?.contains('settings-section-body')) || null;
                if (!body) {
                    body = document.createElement('div');
                    body.className = 'settings-section-body';

                    Array.from(section.children).forEach((child) => {
                        if (child !== header) {
                            body.appendChild(child);
                        }
                    });

                    section.appendChild(body);
                }

                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'section-collapse-toggle';
                toggleBtn.setAttribute('aria-label', 'Toggle section');
                toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
                header.appendChild(toggleBtn);

                const applyCollapsedState = (collapsed) => {
                    section.classList.toggle('is-collapsed', collapsed);
                    body.hidden = collapsed;
                    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
                };

                applyCollapsedState(collapsedSections[sectionKey] === true);

                toggleBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const nextCollapsed = !section.classList.contains('is-collapsed');
                    applyCollapsedState(nextCollapsed);

                    const currentState = this.getInspectorUIState();
                    this.persistUIState({
                        collapsedSections: {
                            ...(currentState.collapsedSections || {}),
                            [sectionKey]: nextCollapsed
                        }
                    });
                });

                section.dataset.collapseReady = 'true';
                section.dataset.sectionKey = sectionKey;
            });
        });
    }

    // ----------------- 影院模式 (Cinema Mode) -----------------
    initCinemaMode() {
        const cinemaBtn = document.getElementById('btn-cinema-mode');
        const layout = document.querySelector('.subtitle-main-layout');
        if (!cinemaBtn || !layout) return;

        let isCinema = false;

        const toggleCinema = () => {
            isCinema = !isCinema;
            const icon = cinemaBtn.querySelector('i');

            if (isCinema) {
                layout.classList.add('cinema-mode');
                cinemaBtn.classList.add('active');
                if (icon) {
                    icon.className = 'fa-solid fa-compress';
                }
                // 使用 title 提示而非 innerHTML 覆盖
                cinemaBtn.title = cinemaBtn.dataset.i18nTitleExit || 'Notification';
            } else {
                layout.classList.remove('cinema-mode');
                cinemaBtn.classList.remove('active');
                if (icon) {
                    icon.className = 'fa-solid fa-expand';
                }
                cinemaBtn.title = cinemaBtn.dataset.i18nTitle || 'Notification';
            }
            // 触发布局重算
            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
        };

        cinemaBtn.addEventListener('click', toggleCinema);
    }
}

window.SubtitleUILayout = SubtitleUILayout;
