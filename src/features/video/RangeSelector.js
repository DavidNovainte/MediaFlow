/**
 * RangeSelector.js
 * 视频时间范围选择器 & 片段管理 (Enhanced)
 * Features: Multi-select, Drag&Drop, Context Menu, Hover Preview
 */

class RangeSelector {
    constructor(core) {
        this.core = core;
        this.videoDuration = 0;
        this.startPercent = 0;
        this.endPercent = 30;
        this.isDragging = null;

        // Advanced Segment Management
        this.savedSegments = [];
        this.selectedSegmentIds = new Set(); // Multi-select support
        this.draggedSegmentId = null; // DnD

        // Context Menu
        this.contextMenu = new window.ContextMenu(); // Assumes ContextMenu.js is loaded

        // Hover Preview
        this.previewTimer = null;
        this.previewVideo = null;
    }

    init() {
        this.bindElements();
        this.bindEvents();
        this.setupGlobalHelpers();
        this.initPreviewPlayer();
        this.bindShortcuts();
    }

    bindElements() {
        this.rangeTrack = document.getElementById('range-track');
        this.rangeSelected = document.getElementById('range-selected');
        this.handleStart = document.getElementById('range-handle-start');
        this.handleEnd = document.getElementById('range-handle-end');
        this.playhead = document.getElementById('range-playhead');
        this.durationDisplay = document.getElementById('range-duration');
        this.startTimeInput = document.getElementById('clip-start-time');
        this.endTimeInput = document.getElementById('clip-end-time');
        this.previewBtn = document.getElementById('btn-preview-clip');
        this.video = document.getElementById('creator-video-preview');
        this.addSegmentBtn = document.getElementById('btn-add-segment');
        this.segmentList = document.getElementById('segment-list');
        this.segmentDisplay = document.getElementById('saved-segments-display');
    }

    bindEvents() {
        // Video Metadata Loaded
        if (this.video) {
            this.video.addEventListener('loadedmetadata', () => {
                this.videoDuration = this.video.duration;
                if (this.durationDisplay) this.durationDisplay.textContent = this.formatTime(this.videoDuration);
                this.endPercent = 100;
                if (this.endTimeInput) this.endTimeInput.value = this.formatTime(this.videoDuration);
                this.updateDisplay();
                // Reset segments on new video load
                this.clearClipSegments();
            });

            this.video.addEventListener('timeupdate', () => {
                if (this.videoDuration > 0 && !this.isDragging) {
                    const percent = (this.video.currentTime / this.videoDuration) * 100;
                    if (this.playhead) this.playhead.style.left = percent + '%';
                }
            });

            // Handle already loaded state
            if (this.video.readyState >= 1) {
                this.videoDuration = this.video.duration;
                if (this.durationDisplay) this.durationDisplay.textContent = this.formatTime(this.videoDuration);
                if (this.endPercent === 30 && this.videoDuration > 0) this.endPercent = 100; // Default full range
                if (this.endTimeInput) this.endTimeInput.value = this.formatTime((this.endPercent / 100) * this.videoDuration);
                this.updateDisplay();
            }

            // Listen for loadstart to clear segments
            this.video.addEventListener('loadstart', () => {
                this.clearClipSegments();
            });
        }

        // Drag handling
        if (this.rangeTrack) {
            this.rangeTrack.addEventListener('mousedown', (e) => this.onDragStart(e));
            this.rangeTrack.addEventListener('click', (e) => this.onTrackClick(e));

            document.addEventListener('mousemove', (e) => this.onDragMove(e));
            document.addEventListener('mouseup', () => this.onDragEnd());
        }

        // Input changes
        if (this.startTimeInput) this.startTimeInput.addEventListener('change', () => this.onStartTimeChange());
        if (this.endTimeInput) this.endTimeInput.addEventListener('change', () => this.onEndTimeChange());

        // Fine Tuning Buttons
        this.bindAdjusterEvents();

        if (this.previewBtn) this.previewBtn.addEventListener('click', () => this.togglePreview());

        // Add Segment
        if (this.addSegmentBtn) {
            this.addSegmentBtn.onclick = () => this.addSegment();
        }

        // Click outside to deselect
        document.addEventListener('click', (e) => {
            if (!this.closest(e.target, '#segment-list') && !this.closest(e.target, '.mediaflow-context-menu')) {
                this.deselectAll();
            }
        });
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only if Creator tab is active (heuristic)
            if (document.getElementById('creator-upload-zone')?.classList.contains('hidden')) {
                // Ctrl + A: Select All
                if (e.ctrlKey && e.key === 'a') {
                    if (document.activeElement.tagName !== 'INPUT') {
                        e.preventDefault();
                        this.selectAll();
                    }
                }
                // Delete / Backspace: Remove Selected
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (document.activeElement.tagName !== 'INPUT') {
                        this.removeSelectedSegments();
                    }
                }
            }
        });
    }

    setupGlobalHelpers() {
        // Expose segments for export (used by VideoProcessor)
        window.getClipSegments = () => {
            // Priority: Selected Segments > All Segments > Current Range
            if (this.selectedSegmentIds.size > 0) {
                return this.savedSegments
                    .filter(s => this.selectedSegmentIds.has(s.id))
                    .map(this.mapSegmentToTime.bind(this));
            }

            if (this.savedSegments.length > 0) {
                return this.savedSegments.map(this.mapSegmentToTime.bind(this));
            }

            // Fallback: Current inputs
            if (this.videoDuration > 0) {
                return [{
                    start: (this.startPercent / 100) * this.videoDuration,
                    end: (this.endPercent / 100) * this.videoDuration
                }];
            }
            return [];
        };

        // Legacy/Direct helpers
        window.removeClipSegment = (id) => this.removeClipSegment(id); // Keep individual remove for 'x' button
        window.jumpToClipSegment = (id) => this.jumpToClipSegment(id);
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    mapSegmentToTime(s) {
        return {
            start: (s.startPercent / 100) * this.videoDuration,
            end: (s.endPercent / 100) * this.videoDuration,
            name: s.name // Include custom name
        };
    }

    // ================= Logic =================

    bindAdjusterEvents() {
        // Start Time Adjusters
        document.getElementById('btn-start-minus')?.addEventListener('click', () => this.nudgeTime('start', -0.1));
        document.getElementById('btn-start-plus')?.addEventListener('click', () => this.nudgeTime('start', 0.1));

        // End Time Adjusters
        document.getElementById('btn-end-minus')?.addEventListener('click', () => this.nudgeTime('end', -0.1));
        document.getElementById('btn-end-plus')?.addEventListener('click', () => this.nudgeTime('end', 0.1));
    }

    nudgeTime(type, delta) {
        if (!this.videoDuration) return;

        let currentPercent = type === 'start' ? this.startPercent : this.endPercent;
        let currentTime = (currentPercent / 100) * this.videoDuration;

        currentTime += delta;
        currentTime = Math.max(0, Math.min(currentTime, this.videoDuration));

        const newPercent = (currentTime / this.videoDuration) * 100;

        if (type === 'start') {
            // Ensure start < end
            if (newPercent < this.endPercent) {
                this.startPercent = newPercent;
            }
        } else {
            // Ensure end > start
            if (newPercent > this.startPercent) {
                this.endPercent = newPercent;
            }
        }

        this.updateDisplay();

        // Jump video to the adjusted point for feedback
        if (this.video) {
            this.video.currentTime = currentTime;
        }
    }

    togglePreview() {
        if (this.isPreviewing) {
            this.stopPreview();
        } else {
            this.previewClip();
        }
    }

    previewClip() {
        if (!this.video || this.videoDuration <= 0) return;

        // Clear any existing interval first to prevent overlap
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
            this.previewInterval = null;
        }

        // Visual Feedback
        this.isPreviewing = true;
        this.updatePreviewButtonState(true);

        const start = (this.startPercent / 100) * this.videoDuration;
        const end = (this.endPercent / 100) * this.videoDuration;

        // Check if we should resume or restart
        const current = this.video.currentTime;

        // Resume if we have a saved position from last stop, OR if current is within range
        if (this.lastPreviewPosition !== undefined &&
            this.lastPreviewPosition >= start &&
            this.lastPreviewPosition < end) {
            // Use saved position
            this.video.currentTime = this.lastPreviewPosition;
            this.lastPreviewPosition = undefined; // Clear after use
        } else if (current < start || current >= end) {
            // Outside range, reset to start
            this.video.currentTime = start;
        }
        // else: current is within range, just play from current position

        this.video.play();

        // Loop monitor
        this.previewInterval = setInterval(() => {
            if (this.video.currentTime >= end) {
                this.video.currentTime = start; // Loop back
            }
        }, 100);
    }

    stopPreview() {
        // Save current position for resume
        if (this.video) {
            this.lastPreviewPosition = this.video.currentTime;
            this.video.pause();
        }

        this.isPreviewing = false;
        this.updatePreviewButtonState(false);

        if (this.previewInterval) {
            clearInterval(this.previewInterval);
            this.previewInterval = null;
        }
    }

    updatePreviewButtonState(isPlaying) {
        if (!this.previewBtn) return;
        const icon = this.previewBtn.querySelector('.icon-play');
        const text = this.previewBtn.querySelector('.text');

        if (isPlaying) {
            if (icon) icon.textContent = '⏸'; // or use pause icon svg
            if (text) text.textContent = window.i18n?.t('creator.segment.stop') || 'Stop';
            this.previewBtn.classList.add('active'); // Style for active state
        } else {
            if (icon) icon.textContent = '▶';
            if (text) text.textContent = window.i18n?.t('creator.segment.preview') || 'Preview Segment';
            this.previewBtn.classList.remove('active');
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds)) seconds = 0;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    }

    updateDisplay() {
        if (!this.rangeSelected || !this.handleStart || !this.handleEnd) return;
        this.rangeSelected.style.left = this.startPercent + '%';
        this.rangeSelected.style.width = (this.endPercent - this.startPercent) + '%';
        this.handleStart.style.left = this.startPercent + '%';
        this.handleEnd.style.left = this.endPercent + '%';

        if (this.videoDuration > 0) {
            const startTime = (this.startPercent / 100) * this.videoDuration;
            const endTime = (this.endPercent / 100) * this.videoDuration;
            if (this.startTimeInput) this.startTimeInput.value = this.formatTime(startTime);
            if (this.endTimeInput) this.endTimeInput.value = this.formatTime(endTime);
        }
    }

    getPercentFromEvent(e) {
        if (!this.rangeTrack) return 0;
        const rect = this.rangeTrack.getBoundingClientRect();
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        return Math.max(0, Math.min(100, (x / rect.width) * 100));
    }

    onDragStart(e) {
        const handleEl = this.closest(e.target, '.range-handle');
        const handle = handleEl?.dataset?.handle;
        if (handle) {
            this.isDragging = handle;
            e.preventDefault();
            e.stopPropagation();
        }
    }

    onDragMove(e) {
        if (!this.isDragging) return;
        e.preventDefault(); // Prevent text selection/drag behaviors
        const percent = this.getPercentFromEvent(e);

        if (this.isDragging === 'start') {
            // Ensure at least 1% gap
            this.startPercent = Math.min(percent, this.endPercent - 1);
            this.startPercent = Math.max(0, this.startPercent); // Clamp 0
        } else if (this.isDragging === 'end') {
            this.endPercent = Math.max(percent, this.startPercent + 1);
            this.endPercent = Math.min(100, this.endPercent); // Clamp 100
        }
        this.updateDisplay();
    }

    onDragEnd() {
        if (this.isDragging) {
            this.isDragging = null;
            // Optional: Snap logic could go here
        }
    }

    onTrackClick(e) {
        if (e.target?.classList?.contains('range-handle')) return;
        const percent = this.getPercentFromEvent(e);
        if (this.video && this.videoDuration > 0) {
            this.video.currentTime = (percent / 100) * this.videoDuration;
        }
    }

    onStartTimeChange() {
        if (!this.startTimeInput) return;
        const seconds = this.parseTime(this.startTimeInput.value);
        if (this.videoDuration > 0) {
            this.startPercent = Math.min((seconds / this.videoDuration) * 100, this.endPercent - 0.1);
            this.updateDisplay();
        }
    }

    onEndTimeChange() {
        if (!this.endTimeInput) return;
        const seconds = this.parseTime(this.endTimeInput.value);
        if (this.videoDuration > 0) {
            this.endPercent = Math.max((seconds / this.videoDuration) * 100, this.startPercent + 0.1);
            this.updateDisplay();
        }
    }

    // ================= Multi-Segment Logic =================

    addSegment() {
        if (this.videoDuration <= 0) {
            console.warn('Video duration is 0, cannot add segment');
            return;
        }
        const segment = {
            id: Date.now(),
            startPercent: this.startPercent,
            endPercent: this.endPercent,
            startTime: this.formatTime((this.startPercent / 100) * this.videoDuration),
            endTime: this.formatTime((this.endPercent / 100) * this.videoDuration),
            name: window.i18n?.t('creator.segment.defaultName', { index: this.savedSegments.length + 1 }) || `Clip ${this.savedSegments.length + 1}`
        };
        this.savedSegments.push(segment);

        if (this.segmentList) {
            this.segmentList.style.display = 'flex';
        }
        this.renderSegmentList();
        this.renderSegmentMarkers();
    }

    removeClipSegment(id) {
        const index = this.savedSegments.findIndex(s => s.id === id);
        if (index > -1) {
            this.savedSegments.splice(index, 1);
            this.selectedSegmentIds.delete(id); // Remove from selection
            this.renderSegmentList();
            this.renderSegmentMarkers();
        }
    }

    removeSelectedSegments() {
        this.savedSegments = this.savedSegments.filter(s => !this.selectedSegmentIds.has(s.id));
        this.selectedSegmentIds.clear();
        this.renderSegmentList();
        this.renderSegmentMarkers();
    }

    jumpToClipSegment(id) {
        const seg = this.savedSegments.find(s => s.id === id);
        if (!seg || this.videoDuration <= 0) return;

        if (this.video) {
            const startTime = (seg.startPercent / 100) * this.videoDuration;
            this.video.currentTime = startTime;

            // Do NOT update global range, just jump timeline
            // If user wants to edit it, they can modify inputs manually, 
            // but usually this is just for review.
            // Actually, for better UX, let's update the inputs to match so they can tweak it?
            // Yes, let's sync.
            this.startPercent = seg.startPercent;
            this.endPercent = seg.endPercent;
            this.updateDisplay();
        }
    }

    clearClipSegments() {
        this.savedSegments.length = 0;
        this.selectedSegmentIds.clear();
        this.renderSegmentList();
        this.renderSegmentMarkers();
        this.startPercent = 0;
        this.endPercent = 100;
        this.updateDisplay();
    }

    // ================= Selection & UI =================

    toggleSelection(id, multi) {
        if (!multi) {
            this.selectedSegmentIds.clear();
            this.selectedSegmentIds.add(id);
        } else {
            if (this.selectedSegmentIds.has(id)) {
                this.selectedSegmentIds.delete(id);
            } else {
                this.selectedSegmentIds.add(id);
            }
        }
        this.updateSelectionVisuals();
    }

    selectAll() {
        this.savedSegments.forEach(s => this.selectedSegmentIds.add(s.id));
        this.updateSelectionVisuals();
    }

    deselectAll() {
        this.selectedSegmentIds.clear();
        this.updateSelectionVisuals();
    }

    updateSelectionVisuals() {
        if (!this.segmentList) return;
        this.segmentList.querySelectorAll('.segment-item').forEach(el => {
            const id = parseInt(el.dataset.id);
            const isSelected = this.selectedSegmentIds.has(id);

            el.classList.toggle('selected', isSelected);
            if (isSelected) {
                el.style.borderColor = 'var(--accent-primary)';
                el.style.background = 'rgba(107, 70, 193, 0.3)';
            } else {
                el.style.borderColor = '';
                el.style.background = '';
            }
        });
    }

    // ================= Rendering & Interactivity =================

    renderSegmentList() {
        if (!this.segmentList) return;

        const shouldShow = this.savedSegments.length > 0;
        this.segmentList.style.display = shouldShow ? 'flex' : 'none';
        if (shouldShow) this.segmentList.classList.remove('hidden');

        this.segmentList.innerHTML = this.savedSegments.map((seg, i) => {
            const isSelected = this.selectedSegmentIds.has(seg.id);
            return `
            <div class="segment-item ${isSelected ? 'selected' : ''}" 
                 draggable="true"
                 data-id="${seg.id}"
                 style="cursor:pointer; position:relative; ${isSelected ? 'border-color:var(--accent-primary); background:rgba(107, 70, 193, 0.3);' : ''}">
                <span class="segment-index">#${i + 1}</span>
                <span class="segment-name" title="${window.i18n?.t('creator.segment.rename') || 'Double-click to rename'}">${seg.name}</span>
                <span class="segment-time" style="font-size:11px; opacity:0.7; margin-left:8px;">${seg.startTime} → ${seg.endTime}</span>
                <button class="segment-remove">×</button>
            </div>
        `; }).join('');

        // Re-bind events (DnD, ContextMenu)
        this.segmentList.querySelectorAll('.segment-item').forEach(el => {
            const id = parseInt(el.dataset.id);

            // Double Click (Rename)
            el.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.renameSegment(id);
            });

            // Click (Selection)
            el.addEventListener('click', (e) => {
                // Ignore if clicked on remove button
                if (this.closest(e.target, '.segment-remove')) {
                    this.removeClipSegment(id);
                    return;
                }

                const multi = e.ctrlKey || e.shiftKey;
                this.toggleSelection(id, multi);
                this.jumpToClipSegment(id);
            });

            // Context Menu
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // If right-clicked item is not in selection, select it (and deselect others)
                if (!this.selectedSegmentIds.has(id)) {
                    this.toggleSelection(id, false);
                }
                this.showContextMenu(e);
            });

            // Drag & Drop
            el.addEventListener('dragstart', (e) => {
                this.draggedSegmentId = id;
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                this.draggedSegmentId = null;
            });
            el.addEventListener('dragover', (e) => {
                e.preventDefault(); // Necessary for drop
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetId = parseInt(el.dataset.id);
                if (this.draggedSegmentId && this.draggedSegmentId !== targetId) {
                    this.reorderSegments(this.draggedSegmentId, targetId);
                }
            });

            // Hover Preview
            el.addEventListener('mouseenter', (e) => this.showHoverPreview(e, id));
            el.addEventListener('mouseleave', () => this.hideHoverPreview());
        });

        // Attach instance to window for inline calls
        window.rangeSelector = this;
    }

    reorderSegments(fromId, toId) {
        const fromIndex = this.savedSegments.findIndex(s => s.id === fromId);
        const toIndex = this.savedSegments.findIndex(s => s.id === toId);
        if (fromIndex === -1 || toIndex === -1) return;

        const [moved] = this.savedSegments.splice(fromIndex, 1);
        this.savedSegments.splice(toIndex, 0, moved);

        this.renderSegmentList();
        // Markers update is optional for reorder, but good to keep sync
        this.renderSegmentMarkers();
    }

    renameSegment(id) {
        // Find the element if not passed
        const el = this.segmentList.querySelector(`.segment-item[data-id="${id}"]`);
        if (!el) return;

        const nameSpan = el.querySelector('.segment-name');
        if (!nameSpan) return;

        const currentName = nameSpan.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'segment-rename-input'; // Ensure CSS handles this if needed
        input.style.cssText = `
            border: 1px solid var(--accent-primary);
            background: var(--bg-primary);
            color: var(--text-primary);
            border-radius: 4px;
            padding: 2px 4px;
            font-size: 13px;
            width: 120px;
        `;

        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== '') {
                const seg = this.savedSegments.find(s => s.id === id);
                if (seg) {
                    seg.name = newName;
                    nameSpan.textContent = newName;
                }
            } else {
                nameSpan.textContent = currentName; // Revert if empty
            }
            input.replaceWith(nameSpan);
        };

        const cancel = () => {
            input.replaceWith(nameSpan);
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent accidental form submit or other triggers
                save();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
            e.stopPropagation(); // Prevent bubbling to parent click handlers
        });

        // Click propagation stop on input itself to prevent drag/select while typing
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());

        nameSpan.replaceWith(input);
        input.focus();
        input.select();
    }

    renderSegmentMarkers() {
        if (!this.segmentDisplay) return;
        this.segmentDisplay.innerHTML = this.savedSegments.map(seg => `
            <div class="saved-segment-marker" 
                 style="left: ${seg.startPercent}%; width: ${seg.endPercent - seg.startPercent}%;">
            </div>
        `).join('');
    }

    // ================= Advanced UI Features =================

    showContextMenu(e) {
        const selectedCount = this.selectedSegmentIds.size;
        const isMulti = selectedCount > 1;

        const t = (key, params) => window.i18n?.t(key, params) || key;

        const items = [
            {
                label: isMulti ?
                    t('creator.segment.processMulti', { count: selectedCount }) :
                    t('creator.segment.processThis'),
                disabled: true
            },
            { type: 'divider' },
            // Video Tools
            {
                label: t('creator.segment.menuVideo'), children: [
                    { label: t('creator.tools.vertical'), action: () => this.triggerAction('vertical') },
                    {
                        label: t('creator.tools.speed'), children: [
                            { label: t('creator.menu.speed05'), action: () => this.triggerAction('speed', 0.5) },
                            { label: t('creator.menu.speed15'), action: () => this.triggerAction('speed', 1.5) },
                            { label: t('creator.menu.speed20'), action: () => this.triggerAction('speed', 2.0) },
                            { label: t('creator.menu.speedCustom'), action: () => this.triggerAction('speed', 'custom') }
                        ]
                    },
                    { label: t('creator.tools.gif'), action: () => this.triggerAction('gif') },
                    {
                        label: t('creator.batch.actionCompress'), children: [
                            { label: t('creator.menu.compressH264'), action: () => this.triggerAction('compress', 'h264') },
                            { label: t('creator.menu.compressH265'), action: () => this.triggerAction('compress', 'h265') }
                        ]
                    },
                    {
                        label: t('creator.batch.actionConvert'), children: [
                            { label: t('creator.menu.convertMp4'), action: () => this.triggerAction('convert', 'mp4') },
                            { label: t('creator.menu.convertMov'), action: () => this.triggerAction('convert', 'mov') },
                            { label: t('creator.menu.convertMp3'), action: () => this.triggerAction('convert', 'mp3') }
                        ]
                    }
                ]
            },
            // Audio Tools
            {
                label: t('creator.segment.menuAudio'), children: [
                    { label: t('creator.tools.demucs'), action: () => this.triggerAction('demucs') },
                    { label: t('creator.tools.denoise'), action: () => this.triggerAction('denoise') },
                    { label: t('creator.tools.silence'), action: () => this.triggerAction('silence') }
                ]
            },
            { type: 'divider' },
            {
                label: t('creator.segment.rename'), action: () => {
                    if (!isMulti) this.renameSegment([...this.selectedSegmentIds][0]);
                }, disabled: isMulti
            },
            { label: t('creator.segment.delete'), action: () => this.removeSelectedSegments() },
            {
                label: t('creator.segment.openLocation'), action: () => {
                    this.core.showFileInFolder(this.core.videoFile?.path);
                }
            }
        ];

        this.contextMenu.show(e, items);
    }

    triggerAction(action, data) {
        // Delegate to CreatorFlow (glue layer)
        const segments = this.savedSegments.filter(s => this.selectedSegmentIds.has(s.id));
        if (window.creatorFlow) {
            window.creatorFlow.handleSegmentAction(action, data, segments);
        }
    }

    // ================= Hover Preview =================

    initPreviewPlayer() {
        // Create invisible preview player container
        const div = document.createElement('div');
        div.id = 'segment-hover-preview';
        div.style.cssText = `
            position: fixed;
            display: none;
            width: 240px;
            height: 135px;
            background: #000;
            border: 2px solid var(--accent-primary);
            border-radius: 6px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            pointer-events: none; /* Ignore mouse */
        `;

        const video = document.createElement('video');
        video.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
        video.muted = false; // We want sound!

        div.appendChild(video);
        document.body.appendChild(div);

        this.previewVideo = video;
        this.previewContainer = div;
    }

    showHoverPreview(e, segmentId) {
        // 500ms delay before showing
        this.previewTimer = setTimeout(() => {
            const seg = this.savedSegments.find(s => s.id === segmentId);
            if (!seg || !this.video || !this.previewVideo) return;

            // Set source (same as main video)
            if (this.previewVideo.src !== this.video.src) {
                this.previewVideo.src = this.video.src;
            }

            // Position
            const rect = e.currentTarget?.getBoundingClientRect?.() || e.target?.getBoundingClientRect?.();
            if (!rect) return;
            this.previewContainer.style.left = `${rect.right + 10}px`;
            this.previewContainer.style.top = `${rect.top}px`;
            this.previewContainer.style.display = 'block';

            // Play range
            const start = (seg.startPercent / 100) * this.videoDuration;
            const end = (seg.endPercent / 100) * this.videoDuration;

            this.previewVideo.currentTime = start;
            this.previewVideo.play();

            // Monitor stop
            this.previewVideoCheck = setInterval(() => {
                if (this.previewVideo.currentTime >= end) {
                    this.previewVideo.currentTime = start;
                    // Loop
                }
            }, 100);

        }, 400); // 400ms hover delay
    }

    hideHoverPreview() {
        clearTimeout(this.previewTimer);
        clearInterval(this.previewVideoCheck);
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
        if (this.previewVideo) {
            this.previewVideo.pause();
        }
    }
}

window.RangeSelector = RangeSelector;
