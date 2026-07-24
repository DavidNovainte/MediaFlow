/**
 * MediaFlow - SpeedMonitor
 * 实时下载速度监控与平滑波动计算
 * 
 * 使用说明：
 * 1. 实例化：const monitor = new SpeedMonitor();
 * 2. 采样：monitor.mon_addSample(speedInBytesPerSecond);
 * 3. 获取平滑速度：monitor.mon_getSmoothedSpeed();
 * 4. 获取历史数据进行绘图：monitor.mon_getHistory();
 */

class SpeedMonitor {
    constructor(maxSize = 30) {
        this.mon_history = []; // 存储采样历史
        this.mon_maxSize = maxSize; // 最大保存的记录点数量
        this.mon_lastUpdateTime = Date.now();
    }

    /**
     * 添加一个新的速度采样点
     * @param {string|number} speedLabel - 速度值，支持数字 (bytes/s) 或 字符串 (如 "1.2 MB/s")
     */
    mon_addSample(speedLabel) {
        const speedValue = this.mon_parseSpeed(speedLabel);
        const now = Date.now();

        // 如果两次采样间隔太短（小于 200ms），则忽略，避免数据过于密集
        if (now - this.mon_lastUpdateTime < 200 && this.mon_history.length > 0) {
            return;
        }

        this.mon_history.push({
            value: speedValue,
            timestamp: now
        });

        // 维持窗口大小
        if (this.mon_history.length > this.mon_maxSize) {
            this.mon_history.shift();
        }

        this.mon_lastUpdateTime = now;
    }

    /**
     * 将各种格式的速度标签转换为字节数字
     * @private
     */
    mon_parseSpeed(speed) {
        if (typeof speed === 'number') return speed;
        if (typeof speed !== 'string') return 0;

        const match = speed.match(/([\d.]+)\s*([A-Za-z/]+)/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();

        if (unit.includes('GB')) return value * 1024 * 1024 * 1024;
        if (unit.includes('MB')) return value * 1024 * 1024;
        if (unit.includes('KB')) return value * 1024;
        if (unit.includes('KIB')) return value * 1024;
        if (unit.includes('MIB')) return value * 1024 * 1024;

        return value;
    }

    /**
     * 获取用于绘图的历史数据点 (0-1 之间的比例，相对于这段时间的峰值)
     */
    mon_getChartData() {
        if (this.mon_history.length === 0) return [];

        const max = Math.max(...this.mon_history.map(h => h.value), 1024); // 最小参考值为 1KB
        return this.mon_history.map(h => h.value / max);
    }

    /**
     * 获取平滑处理后的速度
     */
    mon_getSmoothedSpeed() {
        if (this.mon_history.length < 2) return this.mon_history[0]?.value || 0;

        // 取最近 5 个点的平均值
        const window = this.mon_history.slice(-5);
        const sum = window.reduce((acc, curr) => acc + curr.value, 0);
        return sum / window.length;
    }

    /**
     * 重置监控数据
     */
    reset() {
        this.mon_history = [];
        this.mon_lastUpdateTime = Date.now();
    }
}

// 导出为全局变量，方便在 Electron 环境中使用
window.SpeedMonitor = SpeedMonitor;
