/**
 * Confetti.js
 * 轻量级彩纸动画组件
 * 使用 Canvas 实现高性能渲染
 */
class Confetti {
    constructor(options = {}) {
        // 配置项
        this.colors = options.colors || [
            '#4d82c9', // 品牌紫
            '#3d6eb8', // 品牌紫2
            '#22c55e', // 成功绿
            '#f59e0b', // 警告橙
            '#ef4444', // 错误红
            '#06b6d4', // 青色
            '#ec4899'  // 粉色
        ];
        this.particleCount = options.particleCount || 150;
        this.duration = options.duration || 3000;
        this.gravity = options.gravity || 0.5;
        this.spread = options.spread || 70;

        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.animationId = null;
        this.startTime = null;
    }

    /**
     * 创建 Canvas 覆盖层
     */
    _createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'confetti-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 99999;
        `;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * 生成粒子
     */
    _createParticles() {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight * 0.3; // 从屏幕上方 1/3 处发射

        for (let i = 0; i < this.particleCount; i++) {
            // 随机角度和速度
            const angle = (Math.random() * this.spread - this.spread / 2) * Math.PI / 180;
            const velocity = Math.random() * 8 + 4;

            this.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.sin(angle) * velocity * (Math.random() > 0.5 ? 1 : -1),
                vy: -Math.cos(angle) * velocity,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                shape: Math.random() > 0.5 ? 'rect' : 'circle',
                opacity: 1
            });
        }
    }

    /**
     * 动画循环
     */
    _animate(timestamp) {
        if (!this.startTime) this.startTime = timestamp;
        const elapsed = timestamp - this.startTime;

        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 更新和绘制每个粒子
        this.particles.forEach(p => {
            // 物理更新
            p.vy += this.gravity * 0.1;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;

            // 渐隐效果 (最后 500ms 开始渐隐)
            if (elapsed > this.duration - 500) {
                p.opacity = Math.max(0, 1 - (elapsed - (this.duration - 500)) / 500);
            }

            // 绘制粒子
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.globalAlpha = p.opacity;
            this.ctx.fillStyle = p.color;

            if (p.shape === 'rect') {
                this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
        });

        // 继续动画或销毁
        if (elapsed < this.duration) {
            this.animationId = requestAnimationFrame(this._animate.bind(this));
        } else {
            this.destroy();
        }
    }

    /**
     * 公开方法：触发彩纸效果
     */
    fire() {
        this._createCanvas();
        this._createParticles();
        this.startTime = null;
        this.animationId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
    }
}

// 导出到全局
window.Confetti = Confetti;
