/**
 * SubtitleUITransform.js
 * 
 * 专门处理视频画面形变的 UI 逻辑（依赖 flow 实例）：
 * 1. 裁剪区域选框 (Crop)
 * 2. 视频缩放 (Zoom In/Out)
 * 3. 安全区基准线 (Safe Areas)
 * 4. 视频翻转 (Mirror)
 */

class SubtitleUITransform extends window.SubtitleUIBase {
    constructor(flow) {
        super(flow);
        this.currentScale = 1;

        // 绑定自身方法
        this.bindEvents = this.bindEvents.bind(this);
        this.initVideoCrop = this.initVideoCrop.bind(this);
        this.initVideoMirror = this.initVideoMirror.bind(this);
        this.toggleSafeAreas = this.toggleSafeAreas.bind(this);
    }

    bindEvents() {
        this.initVideoCrop();
        this.initVideoMirror();

        // 缩放控制 (Zoom)
        const zoomInBtn = document.getElementById('subtitle-btn-zoom-inc');
        const zoomOutBtn = document.getElementById('subtitle-btn-zoom-dec');
        const zoomTrigger = document.getElementById('video-zoom-trigger'); // 100% 文本触发器

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.adjustZoom(0.1));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.adjustZoom(-0.1));
        if (zoomTrigger) zoomTrigger.addEventListener('click', () => this.showZoomMenu(zoomTrigger));

        // 安全区按钮
        const safeAreaBtn = document.getElementById('btn-toggle-safe-area');
        if (safeAreaBtn) {
            safeAreaBtn.addEventListener('click', () => this.toggleSafeAreas());
            const savedState = localStorage.getItem('subtitleSafeAreasEnabled');
            if (savedState === 'true') {
                this.toggleSafeAreas(true);
            }
        }

        // 全局快捷键绑定 (配合 UI 提示: Alt+ / Alt-)
        document.addEventListener('keydown', (e) => {
            if (e.altKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    this.adjustZoom(0.1);
                } else if (e.key === '-' || e.key === '_') {
                    e.preventDefault();
                    this.adjustZoom(-0.1);
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.setZoom(1.0);
                }
            }
        });

        // 滚轮缩放绑定 (Alt + 滚轮)
        const container = document.getElementById('video-container');
        if (container) {
            container.addEventListener('wheel', (e) => {
                if (e.altKey) {
                    e.preventDefault();
                    // 向上转 deltaY 为负，向下转为正
                    const delta = e.deltaY < 0 ? 0.05 : -0.05;
                    this.adjustZoom(delta);
                }
            }, { passive: false });
        }
    }

    // ----------------- 视频翻转 (Mirror) -----------------
    initVideoMirror() {
        const mirrorBtn = document.getElementById('btn-mirror-video');
        const { video } = this.elements;

        if (mirrorBtn && video) {
            mirrorBtn.addEventListener('click', () => {
                const isMirrored = video.style.transform === 'scaleX(-1)';
                video.style.transform = isMirrored ? 'scaleX(1)' : 'scaleX(-1)';
                mirrorBtn.classList.toggle('active', !isMirrored);

                // 同步设置到 Flow 引擎
                this.flow.videoSettings.isMirrored = !isMirrored;
            });
        }
    }

    // ----------------- 视频裁剪 (Crop) -----------------
    initVideoCrop() {
        const cropBtn = document.getElementById('crop-btn');
        const { video, scaler } = this.elements;
        const container = scaler || this.elements.container; // 兼容旧版或主监控器
        if (!cropBtn || !video || !container) return;

        let cropOverlay = null;

        cropBtn.addEventListener('click', () => {
            if (this.flow.cropSettings.isCropped) {
                // 如果已裁剪，则清除
                this.flow.cropSettings = { isCropped: false, x: 0, y: 0, width: 100, height: 100, aspect: 'free' };
                this.applyCrop(this.flow.cropSettings);
                cropBtn.classList.remove('active');
                if (cropOverlay) {
                    cropOverlay.remove();
                    cropOverlay = null;
                }
                return;
            }

            // 打开菜单
            this.showCropMenu(cropBtn, (settings) => {
                this.flow.cropSettings = settings;
                this.applyCrop(settings);
                cropBtn.classList.add('active');

                if (!cropOverlay) {
                    cropOverlay = document.createElement('div');
                    cropOverlay.className = 'crop-overlay';
                    cropOverlay.innerHTML = `
                        <div class="crop-box">
                            <div class="crop-handle nw"></div>
                            <div class="crop-handle n"></div>
                            <div class="crop-handle ne"></div>
                            <div class="crop-handle e"></div>
                            <div class="crop-handle se"></div>
                            <div class="crop-handle s"></div>
                            <div class="crop-handle sw"></div>
                            <div class="crop-handle w"></div>
                        </div>
                    `;
                    container.appendChild(cropOverlay);
                    this._bindCropInteraction(cropOverlay.querySelector('.crop-box'), container);
                }
                this.updateCropOverlay(settings, cropOverlay);
            });
        });
    }

    _bindCropInteraction(cropBox, container) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY;
        let startLeft, startTop, startWidth, startHeight;
        let resizeHandle = '';

        const parseVal = (v, def) => {
            const parsed = parseFloat(v);
            return isNaN(parsed) ? def : parsed;
        };

        const onMouseDown = (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;

            // 获取当前裁剪框的百分比位置
            startLeft = parseVal(cropBox.style.left, 0);
            startTop = parseVal(cropBox.style.top, 0);
            startWidth = parseVal(cropBox.style.width, 100);
            startHeight = parseVal(cropBox.style.height, 100);

            if (e.target?.classList?.contains('crop-handle')) {
                isResizing = true;
                resizeHandle = Array.from(e.target.classList || []).find(c => c !== 'crop-handle');
            } else {
                isDragging = true;
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging && !isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // 转换像素增量为百分比
            // 注意：缩放状态下应使用实际被缩放元素的 rect
            const rect = container.getBoundingClientRect();
            const dxPct = (dx / rect.width) * 100;
            const dyPct = (dy / rect.height) * 100;

            let newLeft = startLeft;
            let newTop = startTop;
            let newWidth = startWidth;
            let newHeight = startHeight;

            if (isDragging) {
                newLeft += dxPct;
                newTop += dyPct;
            } else if (isResizing) {
                if (resizeHandle.includes('e')) newWidth += dxPct;
                if (resizeHandle.includes('s')) newHeight += dyPct;
                if (resizeHandle.includes('w')) { newLeft += dxPct; newWidth -= dxPct; }
                if (resizeHandle.includes('n')) { newTop += dyPct; newHeight -= dyPct; }

                // 保持特定比例
                if (this.flow.cropSettings.aspect && this.flow.cropSettings.aspect !== 'free') {
                    const [wRatio, hRatio] = this.flow.cropSettings.aspect.split(':').map(Number);
                    if (wRatio && hRatio) {
                        const aspect = wRatio / hRatio;
                        // 以宽度为准计算高度
                        newHeight = newWidth / aspect;
                    }
                }
            }

            // 越界保护
            newLeft = Math.max(0, Math.min(newLeft, 100 - newWidth));
            newTop = Math.max(0, Math.min(newTop, 100 - newHeight));
            newWidth = Math.max(10, Math.min(newWidth, 100 - newLeft));
            newHeight = Math.max(10, Math.min(newHeight, 100 - newTop));

            cropBox.style.left = `${newLeft}%`;
            cropBox.style.top = `${newTop}%`;
            cropBox.style.width = `${newWidth}%`;
            cropBox.style.height = `${newHeight}%`;

            this.flow.cropSettings.x = newLeft;
            this.flow.cropSettings.y = newTop;
            this.flow.cropSettings.width = newWidth;
            this.flow.cropSettings.height = newHeight;

            this.applyCrop(this.flow.cropSettings);
        };

        const onMouseUp = () => {
            isDragging = false;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        cropBox.addEventListener('mousedown', onMouseDown);
    }

    showCropMenu(anchorEl, onSelect) {
        // 先移除旧菜单
        const oldMenu = document.getElementById('crop-ratio-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'crop-ratio-menu';
        menu.className = 'dropdown-menu show';
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000';

        const ratios = [
            { label: window.i18n.t('subtitle.crop.free'), value: 'free' },
            { label: window.i18n.t('subtitle.crop.ratio16_9'), value: '16:9' },
            { label: window.i18n.t('subtitle.crop.ratio9_16'), value: '9:16' },
            { label: window.i18n.t('subtitle.crop.ratio1_1'), value: '1:1' },
            { label: window.i18n.t('subtitle.crop.ratio4_3'), value: '4:3' },
            { label: window.i18n.t('subtitle.crop.custom'), value: 'custom' }
        ];

        let html = '';
        ratios.forEach(r => {
            const isActive = this.flow.cropSettings.aspect === r.value ? 'active' : '';
            html += `<div class="dropdown-item ${isActive}" data-value="${r.value}">${r.label}</div>`;
        });
        menu.innerHTML = html;

        document.body.appendChild(menu);

        // 定位
        const rect = anchorEl.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;

        menu.onclick = (e) => {
            const item = this.closest(e.target, '.dropdown-item');
            if (item) {
                const val = item.dataset.value;
                if (val === 'custom') {
                    this.showCustomCropPrompt(onSelect);
                } else {
                    onSelect({ isCropped: true, aspect: val, x: 20, y: 20, width: 60, height: val === 'free' ? 60 : 60 / (parseFloat(val.split(':')[0]) / parseFloat(val.split(':')[1])) });
                }
                menu.remove();
            }
        };

        const closer = (e) => {
            if (!menu.contains(e.target) && e.target !== anchorEl) {
                menu.remove();
                document.removeEventListener('click', closer);
            }
        };
        setTimeout(() => document.addEventListener('click', closer), 10);
    }

    showCustomCropPrompt(onSelect) {
        let overlay = document.querySelector('.custom-prompt-overlay');
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.className = 'custom-prompt-overlay';
        overlay.innerHTML = `
            <div class="custom-prompt-modal glass-panel">
                <h4>${window.i18n.t('subtitle.crop.customTitle')}</h4>
                <p>${window.i18n.t('subtitle.crop.customDesc')}</p>
                <div class="input-group">
                    <input type="number" id="custom-crop-w" placeholder="${window.i18n.t('subtitle.crop.width')}" value="16" min="1">
                    <span>:</span>
                    <input type="number" id="custom-crop-h" placeholder="${window.i18n.t('subtitle.crop.height')}" value="9" min="1">
                </div>
                <div class="buttons">
                    <button class="cancel-btn">${window.i18n.t('subtitle.crop.cancel')}</button>
                    <button class="confirm-btn">${window.i18n.t('subtitle.crop.confirm')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const wInput = overlay.querySelector('#custom-crop-w');
        const hInput = overlay.querySelector('#custom-crop-h');

        const close = () => { if (overlay) overlay.remove(); };

        overlay.querySelector('.cancel-btn').onclick = close;
        overlay.querySelector('.confirm-btn').onclick = () => {
            const w = parseFloat(wInput.value);
            const h = parseFloat(hInput.value);
            if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                const aspect = `${w}:${h}`;
                const ratio = w / h;
                const width = 60;
                const height = width / ratio;
                onSelect({ isCropped: true, aspect, x: 20, y: 20, width, height });
            }
            close();
        };
    }

    applyCrop(settings) {
        const { video } = this.elements;
        if (!video) return;
        if (!settings.isCropped) {
            video.style.clipPath = 'none';
        } else {
            // polygon 实现百分比裁剪
            const left = settings.x;
            const top = settings.y;
            const right = 100 - (settings.x + settings.width);
            const bottom = 100 - (settings.y + settings.height);
            video.style.clipPath = `polygon(${left}% ${top}%, ${100 - right}% ${top}%, ${100 - right}% ${100 - bottom}%, ${left}% ${100 - bottom}%)`;
        }
    }

    updateCropOverlay(settings, cropOverlay) {
        if (!cropOverlay) return;
        const cropBox = cropOverlay.querySelector('.crop-box');
        if (cropBox) {
            cropBox.style.left = `${settings.x}%`;
            cropBox.style.top = `${settings.y}%`;
            cropBox.style.width = `${settings.width}%`;
            cropBox.style.height = `${settings.height}%`;
        }
    }

    // ----------------- 视频缩放 (Zoom) -----------------
    adjustZoom(delta) {
        this.setZoom(this.currentScale + delta);
    }

    setZoom(scale) {
        this.currentScale = Math.max(0.1, Math.min(scale, 5));
        const scaler = document.getElementById('video-content-scaler'); // 切换至内部 scaler
        const zoomText = document.getElementById('video-zoom-percent');

        if (scaler) {
            scaler.style.transform = `scale(${this.currentScale})`;
            scaler.style.transformOrigin = 'center center';
            scaler.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }

        if (zoomText) {
            zoomText.textContent = `${Math.round(this.currentScale * 100)}%`;
        }
    }

    showZoomMenu(anchorEl) {
        const oldMenu = document.getElementById('zoom-preset-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'zoom-preset-menu';
        menu.className = 'v-zoom-popover active';
        menu.style.position = 'fixed'; // 恢复 fixed 定位，避免受父级相对定位干扰
        menu.style.zIndex = '10000';

        const presets = [50, 75, 100, 125, 150, 200];
        let html = '';
        presets.forEach(p => {
            const isActive = Math.round(this.currentScale * 100) === p ? 'active' : '';
            html += `<div class="pop-item ${isActive}" data-scale="${p / 100}">${p}%</div>`;
        });
        menu.innerHTML = html;
        document.body.appendChild(menu); // 挂载到 body 以确保 fixed 定位生效

        const rect = anchorEl.getBoundingClientRect();

        // 精确对齐逻辑：
        // 1. Bottom: 视口底部到按钮顶部的距离 + 间隔
        // 2. Left: 按钮左缘 + 按钮宽度一半 (配合 CSS 的 translateX(-50%) 实现完美水平居中)
        menu.style.bottom = `${window.innerHeight - rect.top + 5}px`;
        menu.style.left = `${rect.left + rect.width / 2}px`;

        menu.onclick = (e) => {
            const item = this.closest(e.target, '.pop-item');
            if (item) {
                const scale = parseFloat(item.dataset.scale);
                this.setZoom(scale);
                menu.remove();
            }
        };

        const closer = (e) => {
            if (!menu.contains(e.target) && e.target !== anchorEl) {
                menu.remove();
                document.removeEventListener('click', closer);
            }
        };
        setTimeout(() => document.addEventListener('click', closer), 10);
    }

    // ----------------- 安全区 (Safe Areas) -----------------
    toggleSafeAreas(force) {
        const scaler = document.getElementById('video-content-scaler');
        const container = scaler || document.getElementById('video-container');
        const btn = document.getElementById('btn-toggle-safe-area');

        if (!container) return;

        let safeAreaOverlay = container.querySelector('.safe-area-overlay');
        // 如果 force 有值则用 force，否则切换当前状态
        const willEnable = force !== undefined ? force : !safeAreaOverlay;

        if (willEnable) {
            if (!safeAreaOverlay) {
                safeAreaOverlay = document.createElement('div');
                safeAreaOverlay.className = 'safe-area-overlay';
                safeAreaOverlay.innerHTML = `
                    <div class="safe-line v c"></div>
                    <div class="safe-line h c"></div>
                    <div class="safe-line h t"></div>
                    <div class="safe-line h b"></div>
                    <div class="safe-line v l"></div>
                    <div class="safe-line v r"></div>
                    <div class="safe-area-box title-safe"></div>
                    <div class="safe-area-box action-safe"></div>
                `;
                container.appendChild(safeAreaOverlay);
            }
            if (btn) btn.classList.add('active');
            localStorage.setItem('subtitleSafeAreasEnabled', 'true');
        } else {
            if (safeAreaOverlay) {
                safeAreaOverlay.remove();
            }
            if (btn) btn.classList.remove('active');
            localStorage.setItem('subtitleSafeAreasEnabled', 'false');
        }
    }
}

window.SubtitleUITransform = SubtitleUITransform;
