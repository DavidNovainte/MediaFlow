/**
 * ScribeClipHandler.js
 * 负责视频片段的选择、交互和剪辑逻辑
 */

class ScribeClipHandler {
    /**
     * @param {ScribeFlow} scribeflow - ScribeFlow 实例
     */
    constructor(scribeflow) {
        this.app = scribeflow; // 引用主实例以获取 segments, audioFile 等
        this.selectedSegments = new Set();
        this.lastClickedIndex = null;
        this.container = null;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    /**
     * 初始化段落选择功能
     * @param {HTMLElement} container - 包含字幕段落的容器
     */
    initSelection(container) {
        this.container = container;
        this.selectedSegments.clear();

        container.querySelectorAll('.transcript-segment').forEach(seg => {
            const idx = parseInt(seg.dataset.idx);

            // Handle text editing delegation to ScribeFlow or handle here?
            // To be safe, we let ScribeFlow handle text editing logic if it was inline,
            // but looking at original code, it was mixed.
            // For now, we only handle SELECTION logic here to avoid complex binding issues.
            // The text editing logic stays in ScribeFlow or we extract it later to ScribeEditor.

            // Text editing logic is better handled by ScribeEditor. 
            // For now, we will attaching selection listeners.

            // Click to select row (only if not clicking text)
            seg.addEventListener('click', (e) => {
                // If text editor clicked (contenteditable), let it edit, don't select row unless intended?
                // Usually we want to separate editing from selection.
                // But allowing timestamp click is good.
                if (e.target?.classList?.contains('segment-text') || this.closest(e.target, '.segment-text')) return;

                // If user selected text (drag selection), don't trigger row selection
                if (window.getSelection().toString()) return;

                if (e.shiftKey && this.lastClickedIndex !== null) {
                    // Shift+Click: Range from last clicked
                    const start = Math.min(this.lastClickedIndex, idx);
                    const end = Math.max(this.lastClickedIndex, idx);

                    // Add entire range
                    for (let i = start; i <= end; i++) {
                        this.selectedSegments.add(i);
                    }
                } else if (e.ctrlKey || e.metaKey) {
                    // Ctrl/Cmd+Click: Toggle
                    if (this.selectedSegments.has(idx)) {
                        this.selectedSegments.delete(idx);
                        // If we deselect the last clicked, should we update lastClickedIndex? 
                        // It's usually fine to keep it as the last "interacted" index.
                    } else {
                        this.selectedSegments.add(idx);
                    }
                    this.lastClickedIndex = idx;
                } else {
                    // Normal Click: Single select
                    this.selectedSegments.clear();
                    this.selectedSegments.add(idx);
                    this.lastClickedIndex = idx;
                }

                this.updateUI();
            });
        });

        // 绑定剪辑按钮事件
        const btnClip = document.getElementById('btn-clip-selection');
        // Remove old listeners by cloning (simple way) or just overwriting onclick if strictly managed
        // But addEventListener adds up. scribeflow.js creates new DOM elements often, so listeners are fresh.
        // We can just add listener.
        if (btnClip) {
            // Remove previous listener to avoid duplicates if init is called multiple times
            const newBtn = btnClip.cloneNode(true);
            btnClip.parentNode.replaceChild(newBtn, btnClip);

            newBtn.addEventListener('click', () => {
                if (this.selectedSegments.size > 0) {
                    this.clipSelectedSegments();
                } else {
                    window.app?.showToast(window.i18n?.t('scribe.selectSegmentFirst') || 'Please select a segment to clip first', 'warning');
                }
            });
        }
    }

    /**
     * 更新 UI 状态
     */
    updateUI() {
        if (!this.container) return;

        this.container.querySelectorAll('.transcript-segment').forEach(seg => {
            const idx = parseInt(seg.dataset.idx);
            if (this.selectedSegments.has(idx)) {
                seg.classList.add('selected');
            } else {
                seg.classList.remove('selected');
            }
        });

        // 更新剪辑按钮状态
        const clipBtn = document.getElementById('btn-clip-selection');
        if (clipBtn) {
            if (this.selectedSegments.size > 0) {
                const times = this.getSelectedTimeRange();
                const duration = (times.end - times.start).toFixed(1);
                clipBtn.textContent = window.i18n?.t('transcribe.clipSelected', { start: this.formatTime(times.start), end: this.formatTime(times.end), duration }) || `Clip selection (${this.formatTime(times.start)} - ${this.formatTime(times.end)}) [${duration}s]`;
                clipBtn.disabled = false;
            } else {
                clipBtn.textContent = window.i18n?.t('transcribe.clipSelectedShort') || 'Clip selected segments';
                clipBtn.disabled = true;
            }
        }
    }

    /**
     * 获取选中段落的时间范围
     */
    getSelectedTimeRange() {
        const indices = Array.from(this.selectedSegments).sort((a, b) => a - b);
        const segments = this.app.segments; // Access from ScribeFlow

        if (!segments) return { start: 0, end: 0 };

        const firstSeg = segments[indices[0]];
        const lastSeg = segments[indices[indices.length - 1]];

        return {
            start: firstSeg?.start || 0,
            end: lastSeg?.end || (lastSeg?.start + 5) || 0
        };
    }

    /**
     * 剪辑选中的段落
     */
    async clipSelectedSegments() {
        const audioFile = this.app.audioFile; // Access from ScribeFlow

        if (!audioFile?.path) {
            window.app?.showToast(window.i18n?.t('scribe.noSourcePath') || 'Cannot get source file path', 'error');
            return;
        }

        const times = this.getSelectedTimeRange();

        try {
            // 选择保存路径
            const savePath = await window.mediaflow?.dialog.saveFile({
                title: '保存剪辑片段',
                defaultPath: `clip_${this.formatTime(times.start).replace(':', 'm')}s.mp4`,
                filters: [
                    { name: 'Video', extensions: ['mp4', 'mkv', 'webm'] },
                    { name: 'Audio', extensions: ['mp3', 'm4a', 'wav'] },
                    { name: 'GIF', extensions: ['gif'] }
                ]
            });

            if (!savePath) return;

            const isPrecise = document.getElementById('check-precise-clip')?.checked;
            window.app?.showToast(isPrecise ? (window.i18n?.t('scribe.preciseClipping') || 'Precise clipping (transcoding)...') : (window.i18n?.t('scribe.fastClipping') || 'Fast clipping...'), 'info');

            // 调用 FFmpeg 剪辑
            const result = await window.mediaflow?.video.clip({
                input: audioFile.path,
                output: savePath,
                startTime: times.start,
                endTime: times.end,
                accurate: isPrecise
            });

            if (result?.success) {
                window.app?.showToast(window.i18n?.t('scribe.clipDone', {path: savePath}) || `Clipping complete: ${savePath}`, 'success');
            } else {
                throw new Error(result?.error || 'Clip failed');
            }

        } catch (error) {
            console.error('[ScribeClipHandler] Clip error:', error);
            window.app?.showToast((window.i18n?.t('scribe.clipFailed') || 'Clipping failed:') + ' ' + error.message, 'error');
        }
    }

    /**
     * 格式化时间
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.ScribeClipHandler = ScribeClipHandler;
