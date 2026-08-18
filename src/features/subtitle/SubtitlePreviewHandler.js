/**
 * SubtitlePreviewHandler.js
 * 负责字幕预览区的所有交互：渲染、单击选中（包围盒）、双击编辑、拖拽位置、拉伸大小。
 * 核心设计：全百分比坐标闭环，免疫 CSS 缩放干扰。
 */
class SubtitlePreviewHandler {
    constructor(styleManager) {
        this.styleManager = styleManager;
        this.flow = styleManager.flow;
        this.subtitleOverlay = null;
        this.showPreview = null;

        // UI 元素引用
        this.marginV = null;
        this.marginH = null;
        this.subtitlePosition = null;
        this.marginVValue = null;
        this.marginHValue = null;

        // 状态
        this.isDragging = false;
        this._isInlineEditing = false;
        this._boundingBox = null;
        this._selectedSub = null;
        this._selectedIndex = -1;
        this._selectedSpan = null;
        this._boxWasResized = false;

        this._renderCache = {};
        this._injectStyles();
    }

    _injectStyles() {
        if (document.getElementById('subtitle-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'subtitle-editor-styles';
        style.textContent = `
            @keyframes subtitleFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes subtitlePopIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
            .anim-fade { animation: subtitleFadeIn var(--anim-dur, 300ms) ease-out forwards; }
            .anim-popup { animation: subtitlePopIn var(--anim-dur, 300ms) cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }

            /* 包围盒容器 */
            #subtitle-bounding-box {
                position: absolute;
                z-index: 1000;
                pointer-events: auto;
                border: 1.5px dashed rgba(108, 99, 255, 0.8);
                box-sizing: border-box;
                cursor: move;
                background: rgba(108, 99, 255, 0.05); /* 淡淡的背景表示可拖拽区域 */
            }
            #subtitle-bounding-box.editing-mode {
                cursor: default;
                background: transparent;
            }

            /* 拉伸手柄 */
            .resize-handle {
                position: absolute;
                width: 10px;
                height: 10px;
                background: #6c63ff;
                border: 2px solid #fff;
                border-radius: 50%;
                z-index: 1005;
                pointer-events: auto;
                box-shadow: 0 0 4px rgba(0,0,0,0.4);
            }
            .handle-nw { top: -6px; left: -6px; cursor: nw-resize; }
            .handle-n  { top: -6px; left: calc(50% - 5px); cursor: n-resize; }
            .handle-ne { top: -6px; right: -6px; cursor: ne-resize; }
            .handle-e  { top: calc(50% - 5px); right: -6px; cursor: e-resize; }
            .handle-se { bottom: -6px; right: -6px; cursor: se-resize; }
            .handle-s  { bottom: -6px; left: calc(50% - 5px); cursor: s-resize; }
            .handle-sw { bottom: -6px; left: -6px; cursor: sw-resize; }
            .handle-w  { top: calc(50% - 5px); left: -6px; cursor: w-resize; }

            #subtitle-bounding-box textarea.subtitle-inline-ta {
                width: 100%; height: 100%;
                background: transparent; border: none; outline: none;
                resize: none; cursor: text; overflow: visible;
                white-space: pre-wrap; word-break: break-word;
                box-sizing: border-box;
                user-select: text; -webkit-user-select: text;
            }
            .subtitle-mirror-text {
                width: 100%; height: 100%;
                display: block;
                pointer-events: none; /* 让点击能穿透到 box 触发拖拽 */
                white-space: pre-wrap; word-break: break-word;
                box-sizing: border-box;
                user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init(elements) {
        if (!elements || !elements.subtitleOverlay) {
            console.warn('[SubtitlePreview] Init failed: subtitleOverlay element not found');
            return;
        }
        this.subtitleOverlay = elements.subtitleOverlay;
        this.showPreview = elements.showPreview;
        this.marginV = elements.marginV;
        this.marginH = elements.marginH;
        this.subtitlePosition = elements.subtitlePosition;
        this.marginVValue = elements.marginVValue;
        this.marginHValue = elements.marginHValue;
        
        console.log('[SubtitlePreview] Initializing with overlay:', this.subtitleOverlay.id);
        this._bindEvents();
    }

    _bindEvents() {
        this.showPreview?.addEventListener('change', () => this.updateSubtitlePreview());

        if (this.subtitleOverlay) {
            this._resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => this.updateSubtitlePreview());
            });
            this._resizeObserver.observe(this.subtitleOverlay);
        }

        // 单击选中
        this.subtitleOverlay?.addEventListener('click', (e) => {
            // [FIX] 如果点击已经在活跃的包围盒内部（例如点击 Textarea 移动光标），直接返回
            if (this._boundingBox && this._boundingBox.contains(e.target)) return;

            const span = this.closest(e.target, '.subtitle-preview-text');
            if (!span) {
                this._destroyBoundingBox();
                return;
            }
            e.stopPropagation();
            const { sub, index, trackId } = this._resolveSubFromSpan(span);
            if (!sub) return;

            // [核心修复] 如果点击的是非激活轨道的字幕，在显示包围盒之前先切换轨道
            // 这样能够保证全局的 this.styleManager.currentStyle 正确同步为目标轨道的样式
            // 从而避免包围盒使用错误轨道的 marginH/marginV 导致位置跳变
            if (trackId && this.flow.trackManager?.activeTrackId !== trackId) {
                console.log('[SubtitlePreview] Single-click switching active track to:', trackId);
                this.flow.trackManager.setActiveTrack(trackId);
            }

            if (this._boundingBox && this._selectedSub === sub) {
                // 如果已经选中了，再次点击直接进编辑
                this._showBoundingBox(span, sub, index, true);
                return;
            }

            this._showBoundingBox(span, sub, index, false);
            
            // [NEW] 单击也同步跳转右侧字幕列表（无需聚焦输入框，仅滚动）
            if (this.flow.editor) {
                this.flow.editor.focusSubtitle(index, false, false);
                // Actually focusSubtitle currently always focuses. I'll let it focus.
            }
        });

        // 双击编辑
        this.subtitleOverlay?.addEventListener('dblclick', (e) => {
            console.log('[SubtitlePreview] Dblclick event detected on overlay');
            // [FIX] 如果已经在编辑框内部双击，保持现状
            if (this._isInlineEditing && this._boundingBox && this._boundingBox.contains(e.target)) return;
            const span = this.closest(e.target, '.subtitle-preview-text');
            if (!span) return;
            e.stopPropagation();
            e.preventDefault();

            const { sub, index, trackId } = this._resolveSubFromSpan(span);
            console.log('[SubtitlePreview] Dblclick on span:', { subId: sub?.id, index, trackId });

            if (sub) {
                // 1. 开启预览区行内编辑
                this._showBoundingBox(span, sub, index, true);
                
                // 2. 同步跳转右侧字幕列表并聚焦
                if (this.flow.editor) {
                    // 如果点击的字幕属于非活跃轨道，则尝试切换轨道
                    if (trackId && this.flow.trackManager.activeTrackId !== trackId) {
                        console.log('[SubtitlePreview] Dblclick switching active track to:', trackId);
                        this.flow.trackManager.setActiveTrack(trackId);
                        this.flow.editor.render(); // setActiveTrack 虽然内置了 render，但多调一次保证万无一失
                    }
                    
                    console.log('[SubtitlePreview] Requesting editor focus for index:', index);
                    this.flow.editor.focusSubtitle(index);
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (this._boundingBox && !this._boundingBox.contains(e.target) &&
                !this.closest(e.target, '.subtitle-preview-text')) {
                this._destroyBoundingBox();
            }
        }, true);
    }

    _resolveSubFromSpan(span) {
        const trackId = span.closest('.subtitle-draggable')?.dataset?.trackId;
        const subId = span.dataset.subId;
        
        let track = trackId ? this.flow.trackManager?.tracks.find(t => String(t.id) === String(trackId)) : null;
        if (!track) track = this.flow.trackManager?.tracks.find(t => t.id === this.flow.trackManager.activeTrackId);
        
        if (!track) return { sub: null, index: -1, trackId };

        let index = -1;
        let sub = null;

        if (subId) {
            index = track.subtitles?.findIndex(s => String(s.id) === String(subId)) ?? -1;
            if (index !== -1) sub = track.subtitles[index];
        }

        // 备选：如果 ID 匹配失败，回退到时间匹配
        if (index === -1 && track.subtitles) {
            const currentTime = this.flow?.video?.currentTime ?? 0;
            index = track.subtitles.findIndex(s => s.start <= currentTime && s.end >= currentTime);
            if (index !== -1) sub = track.subtitles[index];
        }

        return { sub, index, trackId: track.id };
    }

    _showBoundingBox(anchorSpan, sub, index, editMode) {
        this._destroyBoundingBox(true);

        this._selectedSub = sub;
        this._selectedIndex = index;
        this._selectedSpan = anchorSpan;
        this._boxWasResized = false;

        const overlayW = this.subtitleOverlay.clientWidth;
        const overlayH = this.subtitleOverlay.clientHeight;
        const overlayRect = this.subtitleOverlay.getBoundingClientRect();
        const spanRect = anchorSpan.getBoundingClientRect();
        const cs = window.getComputedStyle(anchorSpan);

        // 从当前样式直接反推像素位置，保持渲染一致性
        const wrapperEl = anchorSpan.closest('.subtitle-draggable');
        const wrapperRect = wrapperEl?.getBoundingClientRect();
        const usesCustomLayout = wrapperEl?.style?.transform?.includes('translate(-50%, -50%)');
        const wrapperWidth = usesCustomLayout ? (wrapperRect?.width || 0) : 0;
        const boxW = Math.max(spanRect.width + 16, wrapperWidth || 0);
        const boxH = spanRect.height + 32;

        const box = document.createElement('div');
        box.id = 'subtitle-bounding-box';
        
        // 【关键修复】使用渲染同款逻辑反推坐标
        const rawLeft = usesCustomLayout
            ? (wrapperRect.left - overlayRect.left)
            : (spanRect.left - overlayRect.left - 8);
        const rawTop = spanRect.top - overlayRect.top - 16;
        const leftPx = Math.max(0, Math.min(rawLeft, Math.max(0, overlayW - boxW))); /*
            : (spanRect.top - this.subtitleOverlay.getBoundingClientRect().top - (32-16)/2); // 非custom模式保留视觉对齐

        
        */
        const topPx = Math.max(0, Math.min(rawTop, Math.max(0, overlayH - boxH)));
        box.style.width  = boxW + 'px';
        box.style.height = boxH + 'px';
        box.style.left   = leftPx + 'px';
        box.style.top    = topPx + 'px';
        if (editMode) box.classList.add('editing-mode');

        ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
            const h = document.createElement('div');
            h.className = `resize-handle handle-${dir}`;
            h.dataset.dir = dir;
            box.appendChild(h);
            this._bindResizeHandle(h, box, cs);
        });

        this.subtitleOverlay.appendChild(box);
        this._boundingBox = box;
        anchorSpan.style.visibility = 'hidden';

        this._bindBoxDrag(box, anchorSpan);

        if (editMode) {
            this._activateTextarea(box, anchorSpan, sub, index, cs);
        } else {
            this._renderTextMirror(box, cs, this._getCurrentText(sub));
        }
    }

    _renderTextMirror(box, cs, text) {
        const mirror = document.createElement('div');
        mirror.className = 'subtitle-mirror-text';
        mirror.style.cssText = `
            font-size: ${cs.fontSize}; font-family: ${cs.fontFamily};
            font-weight: ${cs.fontWeight}; font-style: ${cs.fontStyle};
            color: ${cs.color}; text-align: ${cs.textAlign};
            line-height: ${cs.lineHeight}; letter-spacing: ${cs.letterSpacing};
            text-shadow: ${cs.textShadow}; -webkit-text-stroke: ${cs.webkitTextStroke};
            background: ${cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'transparent'};
            padding: ${cs.padding};
        `;
        mirror.innerHTML = text.replace(/\n/g, '<br>');
        mirror.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            console.log('[SubtitlePreview] Mirror text dblclick detected, syncing...');
            this._activateTextarea(box, this._selectedSpan, this._selectedSub, this._selectedIndex, cs);
            
            // 同步跳转右侧字幕列表
            if (this.flow.editor) {
                this.flow.editor.focusSubtitle(this._selectedIndex);
            }
            
            mirror.remove();
        });
        box.appendChild(mirror);
    }

    _activateTextarea(box, anchorSpan, sub, index, cs) {
        this._isInlineEditing = true;
        const text = this._getCurrentText(sub);
        const ta = document.createElement('textarea');
        ta.className = 'subtitle-inline-ta';
        ta.value = text;
        ta.style.cssText = `
            font-size: ${cs.fontSize}; font-family: ${cs.fontFamily};
            font-weight: ${cs.fontWeight}; font-style: ${cs.fontStyle};
            color: ${cs.color}; text-align: ${cs.textAlign};
            line-height: ${cs.lineHeight}; letter-spacing: ${cs.letterSpacing};
            text-shadow: ${cs.textShadow}; -webkit-text-stroke: ${cs.webkitTextStroke};
            background: ${cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'transparent'};
            padding: ${cs.padding};
        `;
        const baseFontSize = parseFloat(cs.fontSize);
        box.appendChild(ta);
        requestAnimationFrame(() => { 
            ta.focus(); 
            // 不再全选，以便用户直接点击特定位置
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
        });

        let committed = false;
        const commit = () => {
            if (committed) return; committed = true;
            this._isInlineEditing = false;
            this._commitEdit(ta, sub, index, baseFontSize, box, anchorSpan);
        };
        const cancel = () => {
            if (committed) return; committed = true;
            this._isInlineEditing = false;
            this._destroyBoundingBox();
        };

        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        ta.addEventListener('blur', (e) => {
            if (box.contains(e.relatedTarget)) return;
            setTimeout(() => { if (box.isConnected && !committed) commit(); }, 200);
        });
        ta.addEventListener('mousedown', () => { /* 不阻止，让 textarea 的默认行为（如移动光标）能触发 */ });
    }

    _commitEdit(ta, sub, index, baseFontSize, box, anchorSpan) {
        const editor = this.flow.editor;
        if (editor) {
            let original = sub.originalText || '', translated = sub.translatedText || '';
            const fullText = ta.value.trim();
            const displayMode = this.getOverlayDisplayMode();

            if (displayMode === 'bilingual') {
                const lines = fullText.split('\n');
                if (lines.length >= 2) { original = lines[0].trim(); translated = lines.slice(1).join('\n').trim(); }
                else { if (sub.translatedText) translated = fullText; else original = fullText; }
            } else if (displayMode === 'original') original = fullText;
            else { if (sub.translatedText) translated = fullText; else original = fullText; }

            this._syncPositionFromBox(box, anchorSpan, baseFontSize);
            editor.updateSubtitleText(index, original, translated);
        }
        this._destroyBoundingBox();
    }

    _syncPositionFromBox(box, anchorSpan, baseFontSize = null) {
        const overlayW = this.subtitleOverlay.clientWidth;
        const overlayH = this.subtitleOverlay.clientHeight;
        if (!overlayW || !overlayH) return;

        const left = parseFloat(box.style.left) || 0;
        const top  = parseFloat(box.style.top)  || 0;
        const w    = box.offsetWidth;
        const h    = box.offsetHeight;

        const centerX = left + w / 2;
        const centerY = top  + h / 2;

        const s = this.styleManager.currentStyle;
        s.marginH = Math.max(0, Math.min(100, Math.round((centerX / overlayW) * 100)));
        s.marginV = Math.max(0, Math.min(100, Math.round((centerY / overlayH) * 100)));
        s.position = 'custom';

        // 同步宽度 (Wrap Width)
        if (this._boxWasResized) {
            s.wrapWidth = Math.min(100, Math.max(10, Math.round((w / overlayW) * 100)));
        }

        // 同步字号 (针对拖拽缩放)
        const mirror = box.querySelector('.subtitle-mirror-text');
        const ta = box.querySelector('textarea.subtitle-inline-ta');
        const target = ta || mirror;
        if (target && baseFontSize) {
            const finalFontSize = parseFloat(target.style.fontSize) || baseFontSize;
            if (Math.abs(finalFontSize - baseFontSize) > 0.1) {
                const vH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--v-render-h')) || 450;
                s.fontSize = Math.round(finalFontSize / (vH / 720));
                s.fontSizeLocked = true;
            }
        }

        if (this.marginH) this.marginH.value = s.marginH;
        if (this.marginV) this.marginV.value = s.marginV;
        if (this.marginHValue) this.marginHValue.textContent = s.marginH;
        if (this.marginVValue) this.marginVValue.textContent = s.marginV;
        if (this.subtitlePosition) this.subtitlePosition.value = 'custom';

        const trackId = this._selectedSpan?.closest('.subtitle-draggable')?.dataset?.trackId;
        const track = this.flow.trackManager?.tracks.find(t => String(t.id) === String(trackId));
        if (track) {
            track.style = this.styleManager?.cloneStyle
                ? this.styleManager.cloneStyle(s)
                : { ...s };
        }
        this.flow.preferenceManager?.set?.(
            'visualStyle',
            this.styleManager?.cloneStyle ? this.styleManager.cloneStyle(s) : { ...s }
        );
    }

    _destroyBoundingBox(skipRefresh = false) {
        if (this._boundingBox) { this._boundingBox.remove(); this._boundingBox = null; }
        if (this._selectedSpan) { this._selectedSpan.style.visibility = 'visible'; this._selectedSpan = null; }
        this._selectedSub = null;
        this._selectedIndex = -1;
        this._isInlineEditing = false;
        if (!skipRefresh) this.updateSubtitlePreview();
    }

    getOverlayDisplayMode() {
        return this.flow.timeline?.displayMode || 'translated';
    }

    _getCurrentText(sub) {
        const displayMode = this.getOverlayDisplayMode();
        if (displayMode === 'bilingual') return sub.translatedText ? `${sub.originalText || ''}\n${sub.translatedText}` : (sub.originalText || sub.text || '');
        if (displayMode === 'original') return sub.originalText || sub.text || '';
        return sub.translatedText || sub.originalText || sub.text || '';
    }

    _bindResizeHandle(handle, box, cs) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            const dir = handle.dataset.dir;
            const startX = e.clientX, startY = e.clientY;
            const startLeft = parseFloat(box.style.left) || 0, startTop = parseFloat(box.style.top) || 0;
            const startW = box.offsetWidth, startH = box.offsetHeight;
            const startFontSize = parseFloat(cs.fontSize), ta = box.querySelector('textarea.subtitle-inline-ta');

            const onMove = (me) => {
                const dx = me.clientX - startX, dy = me.clientY - startY;
                let nL = startLeft, nT = startTop, nW = startW, nH = startH;
                if (dir.includes('e')) nW = Math.max(60, startW + dx);
                if (dir.includes('s')) nH = Math.max(40, startH + dy);
                if (dir.includes('w')) { nW = Math.max(60, startW - dx); nL = startLeft + dx; }
                if (dir.includes('n')) { nH = Math.max(40, startH - dy); nT = startTop + dy; }
                box.style.width = nW + 'px'; box.style.height = nH + 'px';
                box.style.left = nL + 'px'; box.style.top = nT + 'px';

                // 【核心增强】缩放文字
                const mirror = box.querySelector('.subtitle-mirror-text');
                const target = ta || mirror;
                if ((dir.includes('n') || dir.includes('s')) && target) {
                    target.style.fontSize = (startFontSize * (nH / startH)) + 'px';
                }
                this._boxWasResized = true;
            };
            const onUp = () => { 
                document.removeEventListener('mousemove', onMove); 
                document.removeEventListener('mouseup', onUp); 
                if (this._boxWasResized && !this._isInlineEditing) {
                    this._syncPositionFromBox(box, this._selectedSpan, startFontSize); 
                }
            };
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        });
    }

    _bindBoxDrag(box, anchorSpan) {
        box.addEventListener('mousedown', (e) => {
            if (e.target?.classList?.contains('resize-handle') || e.target?.tagName === 'TEXTAREA') return;
            e.preventDefault(); e.stopPropagation();
            const startX = e.clientX, startY = e.clientY;
            const startL = parseFloat(box.style.left) || 0, startT = parseFloat(box.style.top) || 0;
            let moved = false;
            const onMove = (me) => { moved = true; box.style.left = (startL + me.clientX - startX) + 'px'; box.style.top = (startT + me.clientY - startY) + 'px'; };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
                if (moved && !this._isInlineEditing) {
                    this._syncPositionFromBox(box, anchorSpan);
                    return;
                }

                if (!moved && !this._isInlineEditing && this._selectedSub) {
                    const mirror = box.querySelector('.subtitle-mirror-text');
                    if (mirror) {
                        box.classList.add('editing-mode');
                        mirror.remove();
                        this._activateTextarea(
                            box,
                            anchorSpan,
                            this._selectedSub,
                            this._selectedIndex,
                            window.getComputedStyle(anchorSpan)
                        );
                    }
                }
            };
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        });
    }

    bindSubtitleDrag() {}

    invalidateRenderCache() {
        this._renderCache = {};
    }

    updateSubtitlePreview() {
        if (!this.subtitleOverlay || this.isDragging || this._isInlineEditing || this._boundingBox) return;
        const show = this.showPreview ? this.showPreview.checked : true;
        if (!show) { this.subtitleOverlay.innerHTML = ''; return; }
        const tracks = this.flow.trackManager?.tracks || [];
        const visibleTracks = tracks.filter(t => t.visible !== false && t.type !== 'audio');
        if (visibleTracks.length > 0) {
            visibleTracks.forEach(track => {
                const lid = `track-layer-${track.id}`;
                let layer = this.subtitleOverlay.querySelector(`#${lid}`);
                if (!layer) { layer = document.createElement('div'); layer.id = lid; layer.className = 'subtitle-track-layer'; this.subtitleOverlay.appendChild(layer); }
                let active = null; const ct = this.flow.video?.currentTime || 0;
                if (track.subtitles) { const hits = track.subtitles.filter(s => s.start <= ct && s.end >= ct); if (hits.length) { hits.sort((a,b)=>b.start-a.start); active = hits[0]; } }
                this.renderSubtitleToOverlay(active, layer, track.style, ct, track.id);
            });
            this.subtitleOverlay.querySelectorAll('.subtitle-track-layer').forEach(l => { if (!visibleTracks.some(t => `track-layer-${t.id}` === l.id)) l.remove(); });
        } else this.subtitleOverlay.innerHTML = '';
    }

    renderSubtitleToOverlay(content, overlay, overrideStyle = null, currentTime = null, trackId = null) {
        if (!overlay) return;
        const s = overrideStyle || this.styleManager.currentStyle;
        if (!s) return;
        const vH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--v-render-h')) || overlay.clientHeight || 450;
        const scale = vH / 720; const fs = (s.fontSize || 28) * scale;
        const cId = trackId || 'default'; const wrapW = s.wrapWidth || 90;
        const strokeKey = (s.strokes || []).map(st => `${st.width}_${st.color}`).join('|');
        const shadowKey = (s.shadows || []).map(sh => `${sh.x}_${sh.y}_${sh.blur}_${sh.color}`).join('|');
        const displayMode = this.getOverlayDisplayMode();
        const isKaraokeActive = s.enableKaraoke || s.animation === 'karaoke';
        let kProgress = 0;
        if (isKaraokeActive && currentTime !== null && content && typeof content === 'object') {
            const dur = content.end - content.start;
            if (dur > 0) {
                kProgress = Math.max(0, Math.min(100, ((currentTime - content.start) / dur) * 100));
            }
        }

        let htmlText = '';
        const karaokeColor = s.karaokeColor || '#3d6eb8';
        const karaokeStyle = s.karaokeStyle || 'highlight';
        const escapeHtml = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const plainHtml = (text) => escapeHtml(text).replace(/\n/g, '<br>');
        const hasWordBoundaries = (text) => /\s/.test(text.trim()) && text.trim().split(/\s+/).length > 1;
        const usesComplexScript = (text) => /[\u3400-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0600-\u06ff]/i.test(text);
        const highlightRadius = Math.max(2, Math.round(4 * scale));
        const primaryKaraokeLine = displayMode === 'translated' ? 'translated' : 'original';
        const buildWordSpan = (wordText, isActive) => {
            const safeText = plainHtml(wordText);
            if (!isActive) return safeText;
            const stableStyle = `display: inline-block; background: ${karaokeColor}; color: #fff; border-radius: ${highlightRadius}px; padding: 0.08em 0.32em; margin: 0 0.08em; box-decoration-break: clone; -webkit-box-decoration-break: clone;`;
            return `<span style="${stableStyle}">${safeText}</span>`;
        };
        const renderProgressKaraoke = (rawText) => {
            const progress = Math.max(0, Math.min(100, kProgress));
            const gradientStyle = `background-image: linear-gradient(90deg, ${karaokeColor} 0%, ${karaokeColor} ${progress}%, ${s.fontColor} ${progress}%, ${s.fontColor} 100%); background-clip: text; -webkit-background-clip: text; color: transparent; -webkit-text-fill-color: transparent;`;
            return `<span style="${gradientStyle}">${plainHtml(rawText)}</span>`;
        };
        const shouldUseProgressKaraoke = (rawText) => {
            const normalized = String(rawText || '').trim();
            if (!normalized) return false;
            const tokenCount = hasWordBoundaries(normalized)
                ? normalized.split(/\s+/).filter(Boolean).length
                : Array.from(normalized).length;
            return normalized.includes('\n')
                || normalized.length > 28
                || tokenCount > 8
                || !hasWordBoundaries(normalized)
                || usesComplexScript(normalized);
        };
        const tokenizeKaraoke = (rawText) => {
            const raw = String(rawText || '').replace(/\r/g, '').trim();
            if (!raw) return [];

            const tokens = [];
            raw.split('\n').forEach((line, lineIndex, lines) => {
                const splitByWord = hasWordBoundaries(line) && karaokeStyle !== 'progress';
                if (splitByWord) {
                    line.split(/(\s+)/).filter(token => token !== '').forEach((token) => {
                        if (/^\s+$/.test(token)) tokens.push({ text: token, type: 'space' });
                        else tokens.push({ text: token, type: 'timed' });
                    });
                } else if (usesComplexScript(line)) {
                    Array.from(line).forEach((char) => {
                        if (/^\s$/.test(char)) tokens.push({ text: char, type: 'space' });
                        else tokens.push({ text: char, type: 'timed' });
                    });
                } else {
                    tokens.push({ text: line, type: 'timed' });
                }

                if (lineIndex < lines.length - 1) {
                    tokens.push({ text: '\n', type: 'break' });
                }
            });

            return tokens;
        };
        const renderWordKaraoke = (rawText, lineType) => {
            if (!rawText) return '';
            const alignedWords = Array.isArray(content?.words)
                ? content.words.filter(word => String(word?.text || '').trim())
                : [];
            const normalizedRawText = String(rawText || '').replace(/\s+/g, '');
            const normalizedAlignedWords = alignedWords.map(word => word.text || '').join('').replace(/\s+/g, '');
            const canUseAlignedWords = lineType === 'original'
                && alignedWords.length > 1
                && normalizedRawText
                && normalizedRawText === normalizedAlignedWords;

            if (canUseAlignedWords) {
                return alignedWords.map((word, idx) => {
                    const isActive = currentTime >= word.start && currentTime < word.end;
                    const spacer = idx < alignedWords.length - 1 ? ' ' : '';
                    return buildWordSpan(word.text || '', isActive) + spacer;
                }).join('');
            }

            const tokens = tokenizeKaraoke(rawText);
            const timedTokens = tokens.filter(token => token.type === 'timed');
            if (timedTokens.length === 0) return plainHtml(rawText);

            const duration = Math.max(0.001, (content?.end || 0) - (content?.start || 0));
            let timedIndex = 0;
            return tokens.map((token) => {
                if (token.type === 'break') return '<br>';
                if (token.type === 'space') return escapeHtml(token.text);

                const wordStart = (content?.start || 0) + ((duration / timedTokens.length) * timedIndex);
                const wordEnd = (content?.start || 0) + ((duration / timedTokens.length) * (timedIndex + 1));
                const isActive = currentTime >= wordStart && currentTime < wordEnd;
                timedIndex += 1;
                return buildWordSpan(token.text, isActive);
            }).join('');
        };

        if (content && typeof content === 'object') {
            const o = content.originalText || content.text || '';
            const t = window.SubtitleUtils?.getDisplayTranslatedText?.(content)
                || content.translatedText
                || '';
            const renderLine = (rawText, lineType) => {
                if (!rawText) return '';
                const shouldApplyKaraoke = isKaraokeActive && currentTime !== null && lineType === primaryKaraokeLine;
                if (!shouldApplyKaraoke) return plainHtml(rawText);
                if (karaokeStyle === 'progress') return renderProgressKaraoke(rawText);
                if (karaokeStyle === 'highlight') return renderWordKaraoke(rawText, lineType);
                if (shouldUseProgressKaraoke(rawText)) return renderProgressKaraoke(rawText);
                return renderWordKaraoke(rawText, lineType);
            };

            const oHtml = renderLine(o, 'original');
            const tHtml = renderLine(t, 'translated');

            if (displayMode === 'bilingual') htmlText = tHtml ? `${oHtml}<br>${tHtml}` : oHtml;
            else if (displayMode === 'original') htmlText = oHtml;
            else htmlText = tHtml || oHtml;
        } else {
            htmlText = plainHtml(typeof content === 'string' ? content : '');
        }

        // [FIX] 拦截空文本渲染，防止 Padding 产生背景黑点
        if (!htmlText || !htmlText.trim().replace(/<br\s*\/?>/gi, '')) {
            const cHash = '', sHash = `empty_${cId}`;
            if (this._renderCache[cId]?.c === cHash && this._renderCache[cId]?.s === sHash) return;
            this._renderCache[cId] = { c: cHash, s: sHash };
            overlay.innerHTML = '';
            return;
        }
        const kHash = isKaraokeActive ? `_k${Math.floor(kProgress)}` : '';

        const cHash = `${htmlText}`;
        const sHash = `${vH}_${displayMode}_${s.fontFamily}_${s.fontSize}_${s.fontColor}_${!!s.fontBold}_${!!s.fontItalic}_${s.lineHeight}_${s.letterSpacing}_${s.position}_${s.marginV}_${s.marginH}_${strokeKey}_${shadowKey}_${wrapW}_${!!s.enableBackground}_${s.bgColor}_${s.bgOpacity}_${s.animation}_${s.animationDuration}_${karaokeStyle}_${karaokeColor}${kHash}`;
        
        // 【核心优化】由于高频 RAF 重绘会销毁 DOM 导致 dblclick 失效，这里实行极严格的脏检查
        // 只有内容或样式真正变化时才更新 innerHTML
        if (this._renderCache[cId]?.c === cHash && this._renderCache[cId]?.s === sHash) {
            return;
        }
        
        this._renderCache[cId] = { c: cHash, s: sHash };

        const cssEx = []; 
        if (s.strokes?.[0]?.width > 0) cssEx.push(`-webkit-text-stroke: ${s.strokes[0].width * scale}px ${s.strokes[0].color}`);
        const shP = (s.shadows || []).map(sh => `${sh.x*scale}px ${sh.y*scale}px ${sh.blur*scale}px ${sh.color}`);
        cssEx.push(shP.length ? `text-shadow: ${shP.join(', ')}` : 'text-shadow: none');

        let bg = ''; if (s.enableBackground) {
            const h = s.bgColor || '#000', r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
            bg = `background-color: rgba(${r},${g},${b},${(s.bgOpacity||100)/100}); padding: 0.15em 0.4em; border-radius: ${4*scale}px; box-decoration-break: clone; -webkit-box-decoration-break: clone;`;
        }

        const pos = s.position || '2'; let wSt;
        if (pos === 'custom') wSt = `position: absolute; left: ${s.marginH}%; top: ${s.marginV}%; transform: translate(-50%, -50%); width: ${wrapW}%; max-width: ${wrapW}%; text-align: ${s.textAlign || 'center'}; white-space: pre-wrap; pointer-events: none;`;
        else {
            const al = { '1':'left','4':'left','7':'left','3':'right','6':'right','9':'right' }[pos] || 'center';
            wSt = `position: absolute; width: 100%; left: 0; text-align: ${al}; padding: 0 ${(100-wrapW)/2}%; pointer-events: none; white-space: pre-wrap;`;
            if (['7','8','9'].includes(pos)) wSt += ` top: ${s.marginV||10}%;`;
            else if (['1','2','3'].includes(pos)) wSt += ` bottom: ${s.marginV||10}%;`;
            else wSt += ' top: 50%; transform: translateY(-50%);';
        }

        // Suppress CSS entry animation when karaoke is actively playing — karaoke re-renders
        // the DOM every frame (progress updates), which restarts the fade/popup animation from
        // scratch each time, making the text invisible (perpetually at opacity ~0).
        const suppressAnim = isKaraokeActive && currentTime !== null;
        const animClass = (s.animation && s.animation !== 'none' && s.animation !== 'karaoke' && !suppressAnim) ? `anim-${s.animation}` : '';
        const animDur = (s.animationDuration || 300) + 'ms';
        const subId = content && typeof content === 'object' ? (content.id || '') : '';

        overlay.innerHTML = `<div class="subtitle-draggable" data-track-id="${trackId||''}" style="${wSt}"><span class="subtitle-preview-text ${animClass}" data-sub-id="${subId}" style="display: inline-block; --anim-dur: ${animDur}; font-family: '${s.fontFamily}', sans-serif; font-size: ${fs}px; font-weight: ${s.fontBold?'bold':'normal'}; font-style: ${s.fontItalic?'italic':'normal'}; color: ${s.fontColor}; ${cssEx.join('; ')}; ${bg} line-height: ${s.lineHeight||1.4}; letter-spacing: ${(s.letterSpacing||0)*scale}px; pointer-events: auto; user-select: none; cursor: pointer; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; max-width: 100%;">${htmlText}</span></div>`;
    }
}
window.SubtitlePreviewHandler = SubtitlePreviewHandler;
