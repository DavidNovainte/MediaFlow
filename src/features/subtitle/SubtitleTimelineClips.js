/**
 * SubtitleTimelineClips.js
 * 负责时间轴上字幕块 (Clips) 的 DOM 构建与交互 (拖拽、缩放、磁吸对齐)
 */
class SubtitleTimelineClips {
    constructor(timeline) {
        this.timeline = timeline;
        this.enableSnapping = true;
        this.snapThreshold = 8; // 磁吸半径 (像素)
        this.snapGuide = null;

        // 多选状态管理
        this.selectedIndices = new Set();
        this.selectedTrackId = null;
        this.lastSelectedIndex = null; // 用于 Shift+Click 范围选择

        // Ensure batch bar (select-all / filter) is visible once DOM is ready
        setTimeout(() => this._syncBatchBarVisibility?.(), 0);
    }

    getRenderableTracks() {
        const tracks = this.timeline.flow.trackManager?.tracks || [];
        const sourceTrack = this.timeline.flow.getSourceTrackData?.();
        return sourceTrack ? [sourceTrack, ...tracks] : tracks;
    }

    getTrackById(trackId) {
        return this.getRenderableTracks().find((track) => track.id === trackId) || null;
    }

    isSourceTrackId(trackId) {
        return trackId === this.timeline.flow.sourceTrackId;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
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

    coerceDataId(value) {
        if (/^-?\d+$/.test(String(value ?? ''))) {
            return Number(value);
        }
        return value;
    }

    syncEditorSelection({ renderList = false } = {}) {
        const tracks = this.timeline.flow.trackManager?.tracks || [];
        const selectedTrackId = this.selectedTrackId;

        tracks.forEach((track) => {
            (track.subtitles || []).forEach((sub, index) => {
                sub.selected = !!(track.id === selectedTrackId && this.selectedIndices.has(index));
            });
        });

        if (this.isSourceTrackId(selectedTrackId)) {
            (this.timeline.flow.sourceSegments || []).forEach((segment, index) => {
                segment.selected = this.selectedIndices.has(index);
            });
        } else {
            (this.timeline.flow.sourceSegments || []).forEach((segment) => {
                segment.selected = false;
            });
        }

        this.syncSelectAllCheckbox();

        if (!renderList) {
            this._syncSelectionUI();
            return;
        }

        if (this.isSourceTrackId(selectedTrackId)) {
            this._syncSelectionUI();
            return;
        }

        if (selectedTrackId !== null && this.timeline.flow.activeTrackId !== selectedTrackId) {
            this.timeline.flow.trackManager?.setActiveTrack?.(selectedTrackId);
        } else {
            const activeTrack = tracks.find((track) => track.id === (selectedTrackId ?? this.timeline.flow.activeTrackId));
            this.timeline.flow.editor?.render?.(activeTrack?.subtitles || []);
        }

        this._syncSelectionUI();
    }

    syncSelectAllCheckbox() {
        const checkbox = document.getElementById('btn-select-all-subs');
        if (!checkbox) return;

        const tracks = this.timeline.flow.trackManager?.tracks || [];
        const activeTrackId = this.selectedTrackId ?? this.timeline.flow.activeTrackId;

        if (this.isSourceTrackId(activeTrackId)) {
            const total = this.timeline.flow.sourceSegments?.length || 0;
            const selectedCount = this.timeline.flow.sourceSegments?.filter((segment) => segment.selected).length || 0;
            checkbox.checked = total > 0 && selectedCount === total;
            checkbox.indeterminate = selectedCount > 0 && selectedCount < total;
            return;
        }

        const activeTrack = tracks.find((track) => track.id === activeTrackId);
        const total = activeTrack?.subtitles?.length || 0;
        const selectedCount = activeTrack
            ? activeTrack.subtitles.filter((sub) => sub.selected).length
            : 0;

        checkbox.checked = total > 0 && selectedCount === total;
        checkbox.indeterminate = selectedCount > 0 && selectedCount < total;
        this._syncBatchBarVisibility?.();
    }

    selectRangeByPixels(trackId, startPx, endPx, { renderList = false, preserveExisting = false } = {}) {
        const row = this.timeline.tracksList?.querySelector(`.timeline-track-row[data-track-id="${trackId}"]`);
        if (!row) return;

        const minX = Math.min(startPx, endPx);
        const maxX = Math.max(startPx, endPx);
        const nextSelected = preserveExisting && this.selectedTrackId === trackId
            ? new Set(this.selectedIndices)
            : new Set();

        row.querySelectorAll('.timeline-clip').forEach((el) => {
            const index = Number.parseInt(el.dataset.index, 10);
            if (Number.isNaN(index)) return;

            const left = Number.parseFloat(el.style.left) || 0;
            const width = Number.parseFloat(el.style.width) || 0;
            const right = left + width;
            const intersects = right >= minX && left <= maxX;

            if (intersects) {
                nextSelected.add(index);
            } else if (!preserveExisting) {
                nextSelected.delete(index);
            }
        });

        this.selectedTrackId = trackId;
        this.selectedIndices = nextSelected;
        this.lastSelectedIndex = nextSelected.size > 0
            ? Array.from(nextSelected).sort((a, b) => a - b).at(-1)
            : null;
        this.syncEditorSelection({ renderList });
    }

    getOriginalText(sub) {
        return this.timeline.flow.editor?.getOriginalText
            ? this.timeline.flow.editor.getOriginalText(sub)
            : '';
    }

    getTranslatedText(sub) {
        return this.timeline.flow.editor?.getTranslatedText
            ? this.timeline.flow.editor.getTranslatedText(sub)
            : '';
    }

    getDisplayDuration() {
        const displayDuration = this.timeline.getDisplayDuration?.();
        return Number.isFinite(displayDuration) && displayDuration > 0
            ? displayDuration
            : (this.timeline.duration || 0);
    }

    getClipDisplayRange(sub, index, track) {
        if (!sub || !track) return null;

        if (track.type === 'source') {
            const mappedSegment = this.timeline.flow.getSourceTimelineSegments?.()[index];
            if (mappedSegment) {
                return {
                    start: mappedSegment.timelineStart,
                    end: mappedSegment.timelineEnd
                };
            }
        }

        const start = Number(sub.start || 0);
        const end = Math.max(start, Number(sub.end || start));
        if (end <= start) return null;

        if (this.timeline.flow.hasSourceTrim?.()) {
            return this.timeline.flow.getSourceRangeTimelineRange?.(start, end);
        }

        return { start, end };
    }

    render() {
        const list = this.timeline.tracksList;
        const headers = document.getElementById('timeline-track-headers');
        if (!list) return;

        // --- 核心优化：虚拟化裁剪 (Viewport Clipping) ---
        const viewport = list.parentElement;
        const scrollLeft = viewport?.scrollLeft || 0;
        const viewportWidth = viewport?.clientWidth || 0;
        const pxPerSec = this.timeline.pxPerSec;
        const totalWidth = Math.max(
            Math.ceil(this.getDisplayDuration() * pxPerSec),
            Math.ceil(viewportWidth || 0)
        );

        // 计算可见时间窗口 (包含 1s 缓冲区)
        const visibleStart = Math.max(0, (scrollLeft / pxPerSec) - 1);
        const visibleEnd = viewportWidth > 32
            ? ((scrollLeft + viewportWidth) / pxPerSec + 1)
            : Number.POSITIVE_INFINITY;

        list.innerHTML = '';
        if (totalWidth > 0) {
            list.style.width = `${totalWidth}px`;
            list.style.minWidth = `${totalWidth}px`;
        }
        if (headers) headers.innerHTML = '';

        const tracks = this.getRenderableTracks();

        if (!tracks.length) {
            this.showEmptyHint();
            return;
        }

        const activeTrackId = this.timeline.flow.activeTrackId;
        const activeSubIndex = this.timeline.flow.editor?.activeSubtitleIndex ?? -1;

        const listFragment = document.createDocumentFragment();
        const headerFragment = document.createDocumentFragment();

        tracks.forEach((track) => {
            if (track.visible === false) return;
            const isSourceTrack = track.type === 'source';
            const isTrackActive = track.id === activeTrackId || (isSourceTrack && track.id === this.selectedTrackId);

            // 1. 渲染轨道标头 (Track Header)
            if (headers) {
                const hItem = document.createElement('div');
                hItem.className = `track-header-item ${isTrackActive ? 'active' : ''}`;
                hItem.dataset.trackId = track.id; // [NEW] 注入 ID 用于轻量化同步
                if (isSourceTrack) {
                    hItem.innerHTML = `
                        <div class="track-header-color" style="background: ${track.color || '#0ea5e9'}"></div>
                        <span class="track-header-name">${this.escapeHtml(track.name)}</span>
                    `;
                    hItem.addEventListener('click', () => {
                        this.selectedTrackId = track.id;
                        this.selectedIndices = new Set();
                        this.lastSelectedIndex = null;
                        this.syncEditorSelection({ renderList: false });
                    });
                } else {
                    hItem.innerHTML = `
                        <div class="track-header-color" style="background: ${track.color || '#6b9ad4'}"></div>
                        <span class="track-header-name">${this.escapeHtml(track.name)}</span>
                        <div class="track-header-controls">
                            <div class="track-header-btn" data-track-header-action="shift" title="轨道全体平移 (偏移时间)">
                                <i class="fa-solid fa-clock-rotate-left"></i>
                            </div>
                            <div class="track-header-btn ${track.locked ? 'active' : ''}" data-track-header-action="toggle-lock" title="锁定/解锁轨道">
                                <i class="fa-solid ${track.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                            </div>
                            <div class="track-header-btn" data-track-header-action="toggle-visibility" title="隐藏/显示轨道">
                                <i class="fa-solid fa-eye-slash"></i>
                            </div>
                        </div>
                    `;
                    hItem.addEventListener('click', (event) => {
                        const actionTarget = this.closest(event.target, '[data-track-header-action]');
                        if (actionTarget) {
                            event.preventDefault();
                            event.stopPropagation();
                            const trackId = this.coerceDataId(hItem.dataset.trackId);
                            const action = actionTarget.dataset.trackHeaderAction;
                            if (action === 'shift') {
                                this.timeline.promptTrackShift?.(trackId);
                            } else if (action === 'toggle-lock') {
                                this.timeline.flow.trackManager?.toggleLock?.(trackId);
                            } else if (action === 'toggle-visibility') {
                                this.timeline.flow.trackManager?.toggleVisibility?.(trackId);
                            }
                            return;
                        }

                        if (this.timeline.flow.activeTrackId !== track.id) {
                            this.timeline.flow.trackManager.setActiveTrack(track.id);
                        }
                    });
                }
                headerFragment.appendChild(hItem);
            }

            // 2. 渲染轨道行 (Track Row)
            const row = document.createElement('div');
            row.className = `timeline-track-row ${isTrackActive ? 'active' : ''} ${track.locked ? 'locked' : ''} ${isSourceTrack ? 'source-track' : ''}`;
            row.dataset.trackId = track.id;
            if (totalWidth > 0) {
                row.style.width = `${totalWidth}px`;
                row.style.minWidth = `${totalWidth}px`;
            }

            (track.subtitles || []).forEach((sub, index) => {
                // 虚拟化过滤：只渲染在可见窗口内的片段
                const displayRange = this.getClipDisplayRange(sub, index, track);
                if (!displayRange) return;

                const isVisible = (displayRange.end >= visibleStart && displayRange.start <= visibleEnd);
                if (!isVisible) return;

                const isActive = (track.id === activeTrackId && index === activeSubIndex);
                const isSelected = (track.id === this.selectedTrackId && this.selectedIndices.has(index));
                const el = this.createClipElement(sub, index, isActive || isSelected, track.id, displayRange);
                row.appendChild(el);
            });

            listFragment.appendChild(row);
        });

        list.appendChild(listFragment);
        if (headers) headers.appendChild(headerFragment);
    }

    /**
     * [CORE FIX] 轻量化同步选中状态
     * 避免全量 render() 导致 DOM 销毁从而破坏 dblclick 事件
     */
    _syncSelectionUI() {
        const activeTrackId = this.timeline.flow.activeTrackId;
        const activeSubIndex = this.timeline.flow.editor?.activeSubtitleIndex ?? -1;

        // 1. 更新轨道行和标头的高亮
        document.querySelectorAll('.timeline-track-row').forEach(row => {
            const tId = parseInt(row.dataset.trackId);
            const isSourceTrack = tId === this.timeline.flow.sourceTrackId;
            row.classList.toggle('active', tId === activeTrackId || (isSourceTrack && tId === this.selectedTrackId));
        });
        document.querySelectorAll('.track-header-item').forEach(header => {
            const tId = parseInt(header.dataset.trackId);
            const isSourceTrack = tId === this.timeline.flow.sourceTrackId;
            header.classList.toggle('active', tId === activeTrackId || (isSourceTrack && tId === this.selectedTrackId));
        });

        // 2. 更新所有片段的高亮状态
        document.querySelectorAll('.timeline-clip').forEach(el => {
            const idx = parseInt(el.dataset.index);
            const tId = parseInt(el.dataset.trackId);
            
            const isActive = (tId === activeTrackId && idx === activeSubIndex);
            const isSelected = (tId === this.selectedTrackId && this.selectedIndices.has(idx));
            
            el.classList.toggle('active', isActive || isSelected);
        });

        // 3. 同时同步 Timeline 自身的 render 状态（非 DOM 重建）
        if (this.timeline.updatePlayheadPosition) {
            this.timeline.renderPlayhead();
        }

        // 4. Batch toolbar: only when something is selected (left list chrome)
        this._syncBatchBarVisibility();
    }

    _syncBatchBarVisibility() {
        const aside = document.getElementById('subtitle-list-aside');
        const bar = document.getElementById('list-batch-actions-bar');
        if (!aside && !bar) return;

        let selectedCount = this.selectedIndices?.size || 0;
        if (!selectedCount) {
            // also count list checkboxes / segment.selected flags
            const tracks = this.timeline.flow.trackManager?.tracks || [];
            const activeTrackId = this.selectedTrackId ?? this.timeline.flow.activeTrackId;
            if (this.isSourceTrackId?.(activeTrackId)) {
                selectedCount = (this.timeline.flow.sourceSegments || []).filter((s) => s.selected).length;
            } else {
                const activeTrack = tracks.find((t) => t.id === activeTrackId);
                selectedCount = activeTrack?.subtitles?.filter((s) => s.selected).length || 0;
            }
        }
        // Editor list checkboxes may set sub.selected without selectedIndices yet
        if (!selectedCount) {
            const subs = this.timeline.flow.editor?.subtitles || [];
            selectedCount = subs.filter((s) => s?.selected).length;
        }

        const showTools = selectedCount > 0;
        // Filter/select-all always visible; batch tools only with selection
        aside?.classList.toggle('has-selection', showTools);
        bar?.classList.add('is-visible');
        bar?.classList.toggle('has-batch-tools', showTools);
        bar?.setAttribute('data-selected-count', String(selectedCount));

        const countEl = bar?.querySelector('#batch-selected-count');
        if (countEl) {
            if (showTools) {
                countEl.hidden = false;
                const key = 'subtitle.panel.selected_count';
                const translated = window.i18n?.t?.(key, { count: selectedCount });
                countEl.textContent = (translated && translated !== key)
                    ? translated
                    : `已选 ${selectedCount}`;
            } else {
                countEl.hidden = true;
            }
        }

        const hint = bar?.querySelector('.batch-bar-hint');
        if (hint) {
            hint.hidden = showTools;
            const key = 'subtitle.panel.batch_hint';
            const fallback = '勾选字幕后可批量审核 / 重译 / 删除 / 配音来源 / 时间平移';
            const translated = window.i18n?.t?.(key);
            hint.textContent = (translated && translated !== key) ? translated : fallback;
        }
    }

    /**
     * [CORE FIX] 轻量化同步片段文字内容 (Live Updates)
     * 避免全量 render() 导致输入失焦或性能抖动
     */
    _syncTextUI(index) {
        const sub = this.timeline.flow.editor?.subtitles[index];
        if (!sub) return;
        
        const displayMode = this.timeline.displayMode || 'translated';
        let text = '';
        if (displayMode === 'bilingual') {
            const orig = (sub.originalText || sub.text?.split('\n')[0] || '');
            const trans = (sub.translatedText || sub.text || '');
            text = trans ? `${orig} / ${trans}` : orig;
        } else if (displayMode === 'original') {
            text = (sub.originalText || sub.text?.split('\n')[0] || '');
        } else {
            text = (sub.translatedText || sub.text || '');
        }
        
        // CPS 检测等
        const textForCps = sub.translatedText || sub.originalText || (sub.text && sub.text.split('\n')[0]) || '';
        const duration = (sub.end - sub.start) || 0.1;
        const cps = window.SubtitleUtils?.getCPS(textForCps, duration) || 0;
        const limit = window.SubtitleUtils?.getCPSLimit(textForCps) || 20;
        const isOverLimit = cps > limit;
        
        // 查找对应的 DOM 元素更新 (必须限定为当前活跃轨道，防止跨轨道污染)
        const activeTrackId = this.timeline.flow.activeTrackId;
        const els = document.querySelectorAll(`.timeline-clip[data-index="${index}"][data-track-id="${activeTrackId}"]`);
        els.forEach(el => {
            const contentEl = el.querySelector('.clip-content');
            if (contentEl) contentEl.textContent = text || '...';
            
            // 更新警告样式
            if (isOverLimit) {
                el.classList.add('has-warning');
                if (!el.querySelector('.clip-warning')) {
                    const warn = document.createElement('div');
                    warn.className = 'clip-warning';
                    warn.title = `阅读速度过快 (${cps} CPS，限值 ${limit})`;
                    warn.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
                    el.insertBefore(warn, el.querySelector('.handle-right'));
                } else {
                    el.querySelector('.clip-warning').title = `阅读速度过快 (${cps} CPS，限值 ${limit})`;
                }
            } else {
                el.classList.remove('has-warning');
                const warn = el.querySelector('.clip-warning');
                if (warn) warn.remove();
            }
        });
    }

    showEmptyHint() {
        const list = this.timeline.tracksList;
        if (!list) return;
        const hint = document.createElement('div');
        hint.className = 'timeline-empty-hint';
        hint.innerHTML = '<i class="fa-solid fa-i-cursor"></i> ' + (window.i18n?.t('subtitle.timeline.emptyHint') || 'No subtitle data yet');
        list.appendChild(hint);
    }

    createClipElement(sub, index, isActive = false, trackId, displayRange = null) {
        const el = document.createElement('div');

        // 根据时间轴模式选择显示原文还是译文/双语
        const displayMode = this.timeline.displayMode || 'translated';
        let text = '';
        if (displayMode === 'bilingual') {
            const orig = this.getOriginalText(sub);
            const trans = this.getTranslatedText(sub) || sub.text || '';
            text = trans ? `${orig} / ${trans}` : orig;
        } else if (displayMode === 'original') {
            text = this.getOriginalText(sub);
        } else {
            text = this.getTranslatedText(sub) || sub.text || '';
        }

        const duration = (sub.end - sub.start) || 0.1;
        const subTrack = this.getTrackById(trackId);
        const isAudio = subTrack?.type === 'audio';
        const isSource = subTrack?.type === 'source';

        el.className = `timeline-clip ${isActive ? 'active' : ''}`;
        el.dataset.index = index;
        el.dataset.trackId = trackId;

        const displayStart = Number(displayRange?.start ?? sub.start ?? 0);
        const displayEnd = Math.max(displayStart, Number(displayRange?.end ?? sub.end ?? displayStart));
        const left = displayStart * this.timeline.pxPerSec;
        const width = Math.max(10, (displayEnd - displayStart) * this.timeline.pxPerSec);

        el.style.left = `${left}px`;
        el.style.width = `${width}px`;

        if (isSource) {
            const sourceLabel = this.timeline.flow.getSourceSegmentLabel?.() || sub.text || 'Source Segment';
            el.classList.add('timeline-source-clip');
            el.innerHTML = `
                <div class="clip-source-icons" aria-hidden="true">
                    <i class="fa-solid fa-film"></i>
                    <i class="fa-solid fa-waveform-lines"></i>
                </div>
                <div class="clip-content">${sourceLabel}</div>
            `;
        } else if (isAudio) {
            el.classList.add('timeline-audio-clip');
            el.innerHTML = `
                <div class="clip-handle handle-left left"></div>
                <div class="clip-icon"><i class="fa-solid fa-microphone-lines"></i></div>
                <div class="clip-content">${sub.text || 'Audio'}</div>
                <div class="clip-handle handle-right right"></div>
            `;
        } else {
            // CPS 计算逻辑下沉：使用独立的单语字段而非合并后的 text，防止双语误报
            const textForCps = sub.translatedText || sub.originalText || (sub.text && sub.text.split('\n')[0]) || '';
            const cps = window.SubtitleUtils.getCPS(textForCps, duration);
            const limit = window.SubtitleUtils.getCPSLimit(textForCps);
            const isOverLimit = cps > limit;
            if (isOverLimit) el.classList.add('has-warning');

            const warningIcon = isOverLimit ? `<div class="clip-warning" title="阅读速度过快 (${cps} CPS，限值 ${limit})"><i class="fa-solid fa-circle-exclamation"></i></div>` : '';

            el.innerHTML = `
                <div class="clip-handle handle-left left"></div>
                <div class="clip-content">${text || '...'}</div>
                ${warningIcon}
                <div class="clip-handle handle-right right"></div>
            `;
        }

        // --- 核心优化：右键菜单绑定 ---
        if (!isSource) {
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.timeline.flow.contextMenu?.show(e.clientX, e.clientY, trackId, index);
            });
        }

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[Timeline] Clip clicked:', index, 'Track:', trackId);

            if (e.shiftKey && this.lastSelectedIndex !== null && this.selectedTrackId === trackId) {
                // Shift+Click: 范围选择
                const start = Math.min(this.lastSelectedIndex, index);
                const end = Math.max(this.lastSelectedIndex, index);

                // 确保在同一轨道
                this.selectedTrackId = trackId;

                for (let i = start; i <= end; i++) {
                    this.selectedIndices.add(i);
                }
                this.lastSelectedIndex = index;
                this.syncEditorSelection({ renderList: true });
            } else if (e.ctrlKey || e.metaKey) {
                // Ctrl+Click: 切换多选
                if (this.selectedTrackId !== trackId) {
                    this.selectedTrackId = trackId;
                    this.selectedIndices.clear();
                }
                if (this.selectedIndices.has(index)) {
                    this.selectedIndices.delete(index);
                } else {
                    this.selectedIndices.add(index);
                }
                this.lastSelectedIndex = index;
                this.syncEditorSelection({ renderList: true });
            } else {
                // 常规单选
                this.selectedIndices.clear();
                this.selectedTrackId = trackId; // 确保选中当前轨道
                this.selectedIndices.add(index); // 加入当前项到多选集合，保持逻辑一致
                this.lastSelectedIndex = index;

                this.syncEditorSelection({ renderList: !isSource && this.timeline.flow.activeTrackId === trackId });

                if (!isSource && this.timeline.flow.activeTrackId !== trackId) {
                    this.timeline.flow.trackManager.setActiveTrack(trackId);
                }
                
                // 【核心修复】单点时间轴也触发列表同步跳转与聚焦 (与预览区双击逻辑对齐)
                if (!isSource) {
                    console.log('[Timeline] Single-click syncing to editor focus for index:', index);
                    this.timeline.flow.editor?.focusSubtitle(index, true);
                }

                // 【关键修复】使用轻量化更新代替全量 render
                this._syncSelectionUI();
            }
        });

        // --- 核心优化：双击快速编辑 (Scroll To View + Focus) ---
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[Timeline] Clip dblclicked:', index, 'Track:', trackId);

            if (isSource) {
                if (this.timeline.flow.video) {
                    this.timeline.flow.video.currentTime = sub.start;
                }
                this._syncSelectionUI();
                return;
            }

            // 1. 确保轨道激活
            if (this.timeline.flow.activeTrackId !== trackId) {
                this.timeline.flow.trackManager.setActiveTrack(trackId);
            }

            const track = this.timeline.flow.trackManager?.tracks.find(t => t.id === trackId);
            if (track?.type !== 'audio') {
                // 字幕轨：统一由编辑器处理高亮、滚动与聚焦，并跳转视频时间
                console.log('[Timeline] Requesting editor focus from dblclick:', index);
                this.timeline.flow.editor?.focusSubtitle(index, true);
            } else {
                // 音轨双击：预览该音频片段
                if (this.timeline.flow.ttsHandler) {
                    this.timeline.flow.ttsHandler.previewSubtitle(sub.text || sub.originalText);
                }
            }
            
            this._syncSelectionUI();
        });

        if (!isSource) {
            this.bindClipDrag(el, sub, index, trackId);
        }
        return el;
    }

    bindClipDrag(el, sub, index, trackId) {
        const editor = this.timeline.flow.editor;
        let startX = 0, startVal = 0, type = '';
        let initialTrackId = trackId;
        let dragStarted = false;
        const DRAG_THRESHOLD_PX = 4;

        // 批量移动快照
        let dragTargets = [];

        const onMove = (e) => {
            if (!dragStarted) {
                const moveDistance = Math.abs(e.clientX - startX);
                if (moveDistance < DRAG_THRESHOLD_PX) {
                    return;
                }

                dragStarted = true;
                if (editor) editor.addToHistory();
                el.classList.add('dragging');
            }

            // 1. 横向位移 (时间修改)
            let dx = (e.clientX - startX) / this.timeline.pxPerSec;

            // 计算主锚点的最终时间 (主块进行磁吸)
            let masterTime = startVal + dx;
            let masterSnappedTime = this.applySnapping(masterTime, index, trackId);
            let finalDx = masterSnappedTime - startVal; // 最终实际位移量

            dragTargets.forEach(target => {
                const subRef = target.sub;
                const origVal = target.startVal;

                if (type === 'move') {
                    const dur = subRef.end - subRef.start;
                    subRef.start = origVal + finalDx;
                    subRef.end = subRef.start + dur;
                } else if (type === 'left') {
                    subRef.start = Math.max(0, Math.min(subRef.end - 0.1, origVal + finalDx));
                } else if (type === 'right') {
                    subRef.end = Math.max(subRef.start + 0.1, Math.min(this.timeline.duration, origVal + finalDx));
                }
            });

            // 重新渲染视觉
            if (dragTargets.length > 1) {
                this.render();
            } else {
                el.style.left = `${sub.start * this.timeline.pxPerSec}px`;
                el.style.width = `${(sub.end - sub.start) * this.timeline.pxPerSec}px`;
            }

            // 2. 纵向检测 (仅单选支持跨轨)
            if (type === 'move' && dragTargets.length === 1) {
                const targetRow = this.findTargetRowAt(e.clientY);
                this.updateRowDragHighlight(targetRow, initialTrackId);
            }

            if (this.timeline.flow.updateSubtitlePreview) this.timeline.flow.updateSubtitlePreview();
        };

        const onUp = (e) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);

            if (!dragStarted) {
                return;
            }

            el.classList.remove('dragging');
            this.hideSnapGuide();
            this.clearRowHighlights();

            // 处理跨轨道转移 (仅单选)
            if (dragTargets.length === 1) {
                const targetRow = this.findTargetRowAt(e.clientY);
                const targetTrackId = targetRow ? parseInt(targetRow.dataset.trackId) : null;

                if (targetTrackId && targetTrackId !== initialTrackId) {
                    this.timeline.flow.trackManager.moveSubtitleBetweenTracks(initialTrackId, targetTrackId, index);
                    return;
                }
            }

            if (editor) {
                editor.render();
                editor.addToHistory();
            }
        };

        el.addEventListener('mousedown', (e) => {
            const track = this.timeline.flow.trackManager?.tracks.find(t => t.id === trackId);
            if (track?.locked) return;

            if (e.button !== 0) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey) return;

            const handle = this.closest(e.target, '.clip-handle');
            type = handle ? (handle.className.includes('left') ? 'left' : 'right') : 'move';
            e.stopPropagation();

            startX = e.clientX;
            startVal = (type === 'right' ? sub.end : sub.start);
            dragStarted = false;

            // 捕获所有选中块的状态
            const isInSelection = (this.selectedTrackId === trackId && this.selectedIndices.has(index));
            if (isInSelection) {
                dragTargets = Array.from(this.selectedIndices).map(idx => {
                    const s = track.subtitles[idx];
                    return {
                        idx,
                        sub: s,
                        startVal: (type === 'right' ? s.end : s.start)
                    };
                });
            } else {
                dragTargets = [{ idx: index, sub, startVal }];
            }

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    /**
     * 根据鼠标坐标寻找目标行
     */
    findTargetRowAt(y) {
        const rows = this.timeline.tracksList.querySelectorAll('.timeline-track-row');
        for (const row of rows) {
            const rect = row.getBoundingClientRect();
            if (y >= rect.top && y <= rect.bottom) return row;
        }
        return null;
    }

    /**
     * 更新行高亮反馈
     */
    updateRowDragHighlight(targetRow, sourceTrackId) {
        this.clearRowHighlights();
        if (!targetRow) return;

        const targetTrackId = parseInt(targetRow.dataset.trackId);
        if (targetTrackId === sourceTrackId) return;

        const track = this.timeline.flow.trackManager?.tracks.find(t => t.id === targetTrackId);
        if (track?.locked) {
            targetRow.classList.add('drag-reject'); // 锁定行拒绝拖入
        } else {
            targetRow.classList.add('drag-over'); // 合法目标行
        }
    }

    /**
     * 清除所有行高亮
     */
    clearRowHighlights() {
        const rows = this.timeline.tracksList.querySelectorAll('.timeline-track-row');
        rows.forEach(r => r.classList.remove('drag-over', 'drag-reject'));
    }

    applySnapping(time, excludeIndex, trackId) {
        if (!this.enableSnapping) return time;
        const threshold = this.snapThreshold / this.timeline.pxPerSec; // 捕捉半径转换为时间
        const targets = [0, this.timeline.duration, this.timeline.currentTime];

        // 跨轨道捕捉：不仅捕捉当前轨道，还捕捉所有可见轨道的端点
        const tracks = this.timeline.flow.trackManager?.tracks || [];
        tracks.forEach(track => {
            if (track.visible === false) return;
            (track.subtitles || []).forEach((s, idx) => {
                if (track.id === trackId && idx === excludeIndex) return;
                targets.push(s.start, s.end);
            });
        });

        // 1. 基础磁吸 (端点、播放头)
        for (const target of targets) {
            if (Math.abs(time - target) < threshold) {
                this.showSnapGuide(target);
                return target;
            }
        }

        // 2. 静音区磁吸 (波形波谷)
        const silenceTime = this.findSilenceSnap(time, threshold);
        if (silenceTime !== time) {
            this.showSnapGuide(silenceTime, 'var(--accent-primary)');
            return silenceTime;
        }

        this.hideSnapGuide();
        return time;
    }

    findSilenceSnap(time, threshold) {
        const peaks = this.timeline.peaks;
        if (!peaks || !this.timeline.duration) return time;
        const dur = this.timeline.duration;
        const centerIdx = Math.floor((time / dur) * peaks.length);
        const winSize = Math.floor((0.2 / dur) * peaks.length); // 搜索 0.2s 窗口

        let minVal = 1.0, minTime = time;
        for (let i = centerIdx - winSize; i <= centerIdx + winSize; i++) {
            if (i < 0 || i >= peaks.length) continue;
            const v = Math.abs(peaks[i]);
            if (v < minVal) { minVal = v; minTime = (i / peaks.length) * dur; }
        }

        // 如果最小值足够低（静音）且在磁吸半径内，则吸附
        return (minVal < 0.05 && Math.abs(minTime - time) < threshold) ? minTime : time;
    }

    showSnapGuide(time, color = '#ff2d55') {
        if (!this.snapGuide) {
            const body = this.timeline.container?.querySelector('.timeline-body');
            if (!body) return;
            this.snapGuide = document.createElement('div');
            this.snapGuide.className = 'timeline-snap-guide';
            body.appendChild(this.snapGuide);
        }
        const scrollLeft = this.timeline.tracksList?.parentElement?.scrollLeft || 0;
        const x = (time * this.timeline.pxPerSec) - scrollLeft;
        this.snapGuide.style.transform = `translateX(${x}px)`;
        this.snapGuide.style.display = 'block';
        this.snapGuide.style.background = color;
    }

    hideSnapGuide() {
        if (this.snapGuide) this.snapGuide.style.display = 'none';
    }

    /**
     * 局部更新特定的片段 UI (文字、警告狀態等)
     * 避免全量 render 導致的性能抖動
     */
    updateClipUI(index, trackId) {
        const row = this.timeline.tracksList?.querySelector(`.timeline-track-row[data-track-id="${trackId}"]`);
        if (!row) return;

        const el = row.querySelector(`.timeline-clip[data-index="${index}"]`);
        if (!el) return;

        const track = this.timeline.flow.trackManager?.tracks.find(t => t.id === trackId);
        if (!track) return;

        const sub = track.subtitles?.[index];
        if (!sub) return;

        const contentEl = el.querySelector('.clip-content');
        if (!contentEl) return;

        // 重新計算顯示文字
        const displayMode = this.timeline.displayMode || 'translated';
        let text = '';
        if (displayMode === 'bilingual') {
            const orig = this.getOriginalText(sub);
            const trans = this.getTranslatedText(sub) || sub.text || '';
            text = trans ? `${orig} / ${trans}` : orig;
        } else if (displayMode === 'original') {
            text = this.getOriginalText(sub);
        } else {
            text = this.getTranslatedText(sub) || sub.text || '';
        }

        contentEl.textContent = text || (track.type === 'audio' ? 'Audio' : '...');

        // 重新檢查警告狀態 (僅針對字幕軌道)
        if (track.type !== 'audio') {
            const duration = (sub.end - sub.start) || 0.1;
            const textForCps = sub.translatedText || sub.originalText || (sub.text && sub.text.split('\n')[0]) || '';
            const cps = window.SubtitleUtils.getCPS(textForCps, duration);
            const limit = window.SubtitleUtils.getCPSLimit(textForCps);
            const isOverLimit = cps > limit;

            el.classList.toggle('has-warning', isOverLimit);
            
            // 更新警告圖標
            let warningIcon = el.querySelector('.clip-warning');
            if (isOverLimit) {
                if (!warningIcon) {
                    warningIcon = document.createElement('div');
                    warningIcon.className = 'clip-warning';
                    warningIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
                    el.insertBefore(warningIcon, el.querySelector('.handle-right'));
                }
                warningIcon.title = `閱讀速度過快 (${cps} CPS，限值 ${limit})`;
            } else if (warningIcon) {
                warningIcon.remove();
            }
        }
    }
}

window.SubtitleTimelineClips = SubtitleTimelineClips;
