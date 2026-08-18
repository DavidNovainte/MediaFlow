/**
 * QueueAnimation.js
 * 队列动画管理器 - 处理"加入队列"的飞入动画和任务徽章
 */
class QueueAnimation {
    constructor() {
        this.queueButton = null;
        this.badge = null;
    }

    /**
     * 初始化，缓存 DOM 元素
     */
    init() {
        this.queueButton = document.getElementById('btn-toggle-queue');
        this.badge = document.getElementById('queue-badge');

        // 确保徽章元素存在
        if (this.queueButton && !this.badge) {
            this.badge = document.createElement('span');
            this.badge.id = 'queue-badge';
            this.badge.className = 'queue-badge hidden';
            this.badge.textContent = '0';
            this.queueButton.style.position = 'relative';
            this.queueButton.appendChild(this.badge);
        }
    }

    /**
     * 飞入动画：从源元素飞向队列按钮
     * @param {HTMLElement} sourceElement - 缩略图元素
     */
    flyToQueue(sourceElement) {
        if (!sourceElement || !this.queueButton) {
            console.warn('[QueueAnimation] Missing elements');
            return;
        }

        // 获取源和目标位置
        const sourceRect = sourceElement.getBoundingClientRect();
        const targetRect = this.queueButton.getBoundingClientRect();

        // 创建克隆元素
        const clone = document.createElement('div');
        clone.className = 'queue-fly-clone';
        clone.innerHTML = `<img src="${sourceElement.src || sourceElement.querySelector('img')?.src || ''}" alt="">`;

        // 设置初始位置和大小
        Object.assign(clone.style, {
            position: 'fixed',
            left: `${sourceRect.left}px`,
            top: `${sourceRect.top}px`,
            width: `${sourceRect.width}px`,
            height: `${sourceRect.height}px`,
            zIndex: '9999',
            pointerEvents: 'none',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });

        document.body.appendChild(clone);

        // 强制重绘
        clone.offsetHeight;

        // 计算目标位置（队列按钮中心）
        const targetX = targetRect.left + targetRect.width / 2 - 20;
        const targetY = targetRect.top + targetRect.height / 2 - 20;

        // 执行动画
        requestAnimationFrame(() => {
            Object.assign(clone.style, {
                left: `${targetX}px`,
                top: `${targetY}px`,
                width: '40px',
                height: '40px',
                opacity: '0.5',
                transform: 'rotate(10deg) scale(0.5)'
            });
        });

        // 动画结束后清理
        setTimeout(() => {
            clone.remove();
            this.pulseBadge();
        }, 500);
    }

    /**
     * 更新徽章数字
     * @param {number} count - 队列任务数
     */
    updateBadge(count) {
        if (!this.badge) return;

        if (count > 0) {
            this.badge.textContent = count > 99 ? '99+' : count;
            this.badge.classList.remove('hidden');
        } else {
            this.badge.classList.add('hidden');
        }
    }

    /**
     * 徽章弹跳动画
     */
    pulseBadge() {
        if (!this.badge) return;

        this.badge.classList.remove('pulse');
        // 强制重绘
        this.badge.offsetHeight;
        this.badge.classList.add('pulse');

        setTimeout(() => {
            this.badge.classList.remove('pulse');
        }, 300);
    }
}

// 创建全局单例
window.queueAnimation = new QueueAnimation();
