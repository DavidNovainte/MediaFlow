/**
 * DownloadProgressUI.js
 * 专门处理下载进度条更新、速度提示与速度图表绘制。
 */
class DownloadProgressUI {
    constructor(ui) {
        this.ui = ui;
    }

    updateProgress(data, speedMonitor) {
        const e = this.ui.elements;
        const percent = Math.round(data.progress || 0);

        if (percent <= 0 && data.speed && data.speed !== '0 KB/s') {
            e.progressBar?.classList.add('indeterminate');
            if (e.progressText) e.progressText.textContent = window.i18n?.t('download.streaming') || 'Streaming...';  // i18n
        } else {
            e.progressBar?.classList.remove('indeterminate');
            if (e.progressBar) e.progressBar.style.width = `${percent}%`;
            if (e.progressText) e.progressText.textContent = `${percent}%`;
        }

        if (e.progressSpeed) e.progressSpeed.textContent = data.speed || '';
        if (e.progressEta) e.progressEta.textContent = data.eta || '';

        if (speedMonitor && data.speed) {
            speedMonitor.mon_addSample(data.speed);
            this.drawSpeedChart(speedMonitor.mon_getChartData());
        }
    }

    drawSpeedChart(data) {
        const canvas = this.ui.elements.speedChart;
        if (!canvas || data.length < 2) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        // 确保 canvas 尺寸与显示尺寸一致
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.moveTo(0, height);
        const step = width / (data.length - 1);
        data.forEach((ratio, i) => {
            ctx.lineTo(i * step, height - (ratio * (height - 10)) - 5);
        });
        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(77, 130, 201, 0.4)');
        grad.addColorStop(1, 'rgba(77, 130, 201, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(77, 130, 201, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    resetProgress() {
        const e = this.ui.elements;
        const ctx = e.speedChart?.getContext('2d');
        ctx?.clearRect(0, 0, e.speedChart.width, e.speedChart.height);
        if (e.progressBar) e.progressBar.style.width = '0%';
    }

    showProgressUI(show) {
        const e = this.ui.elements;
        e.progressArea?.classList.toggle('hidden', !show);
        e.btnDownload?.classList.toggle('hidden', show);
        e.btnCancel?.classList.toggle('hidden', !show);
        if (e.btnPause) {
            e.btnPause.classList.add('hidden');
            e.btnPause.disabled = true;
            e.btnPause.setAttribute('aria-hidden', 'true');
        }
    }
}

window.DownloadProgressUI = DownloadProgressUI;
