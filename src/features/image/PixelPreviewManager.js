/**
 * PixelPreviewManager.js
 * 负责图片预览区域的交互：对比滑块、缩放、平移
 */
class PixelPreviewManager {
    constructor() {
        this.container = document.getElementById('compare-container');
        this.slider = document.querySelector('.compare-slider');
        this.handle = document.getElementById('compare-handle');
        this.afterImg = document.getElementById('compare-after');

        this.isPanning = false;
        this.isSliding = false;

        this.state = {
            scale: 1,
            x: 0,
            y: 0,
            percent: 50,
            rotate: 0,
            scaleX: 1,
            scaleY: 1
        };

        this.init();
    }

    init() {
        if (!this.container || !this.handle) return;

        // 1. Slider Events
        this.handle.addEventListener('mousedown', (e) => {
            this.isSliding = true;
            this.container.style.cursor = 'col-resize';
            e.stopPropagation();
        });

        // 2. Pan Events
        this.container.addEventListener('mousedown', (e) => {
            if (this.isSliding) return;
            this.isPanning = true;
            this.container.classList.add('panning');
            this.startX = e.clientX - this.state.x;
            this.startY = e.clientY - this.state.y;
        });

        // 3. Global Mouse Events
        window.addEventListener('mousemove', (e) => {
            if (this.isSliding) {
                this.updateSlider(e);
            } else if (this.isPanning) {
                this.updatePan(e);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isSliding = false;
            this.isPanning = false;
            this.container.classList.remove('panning');
            this.container.style.cursor = 'grab';
        });

        // 4. Zoom Events
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.updateZoom(e);
        }, { passive: false });

        // Initial apply
        this.apply();
    }

    updateSlider(e) {
        const rect = this.slider.getBoundingClientRect();
        let x = e.clientX - rect.left;

        // Clamp
        x = Math.max(0, Math.min(x, rect.width));
        this.state.percent = (x / rect.width) * 100;

        this.apply();
    }

    updatePan(e) {
        this.state.x = e.clientX - this.startX;
        this.state.y = e.clientY - this.startY;
        this.apply();
    }

    updateZoom(e) {
        const delta = -e.deltaY;
        const factor = delta > 0 ? 1.1 : 0.9;
        this.zoom(factor);
    }

    zoom(factor) {
        this.state.scale = Math.max(0.1, Math.min(this.state.scale * factor, 10));
        this.apply();
    }

    zoomIn() { this.zoom(1.2); }
    zoomOut() { this.zoom(0.8); }

    updateImageTransform(rotate, scaleX, scaleY) {
        this.state.rotate = rotate;
        this.state.scaleX = scaleX ? -1 : 1;
        this.state.scaleY = scaleY ? -1 : 1;
        this.apply();
    }

    apply() {
        // Update Slider
        if (this.handle) {
            this.handle.style.left = `${this.state.percent}%`;
        }
        if (this.afterImg) {
            this.afterImg.style.clipPath = `inset(0 0 0 ${this.state.percent}%)`;
        }

        // Update Transform Variables
        this.container.style.setProperty('--preview-x', `${this.state.x}px`);
        this.container.style.setProperty('--preview-y', `${this.state.y}px`);
        this.container.style.setProperty('--preview-scale', this.state.scale);
        this.container.style.setProperty('--preview-rotate', `${this.state.rotate}deg`);
        this.container.style.setProperty('--preview-scale-x', this.state.scaleX);
        this.container.style.setProperty('--preview-scale-y', this.state.scaleY);

        // Update zoom level text if exists
        const zoomText = document.getElementById('zoom-percentage');
        if (zoomText) {
            zoomText.textContent = `${Math.round(this.state.scale * 100)}%`;
        }
    }

    reset() {
        this.state.x = 0;
        this.state.y = 0;
        this.state.scale = 1;
        this.apply();
    }
}

window.PixelPreviewManager = PixelPreviewManager;
