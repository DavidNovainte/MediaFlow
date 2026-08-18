/**
 * ScribeExporter.js
 * 负责 ScribeFlow 的所有文件导出、下载和剪贴板操作
 */

class ScribeExporter {
    /**
     * @param {ScribeFlow} scribeflow - ScribeFlow 实例
     */
    constructor(scribeflow) {
        this.app = scribeflow; // 引用主实例
    }

    /**
     * 复制总结文字到剪贴板
     */
    async copySummary() {
        // 优先获取已保存的 summary 变量，其次尝试从 DOM 获取
        const content = this.app.currentSummary || document.getElementById('summary-content')?.innerText;
        if (!content) return;

        try {
            await navigator.clipboard.writeText(content);
            window.app?.showToast(window.i18n?.t('common.transcribe.summaryCopied') || 'Summary copied', 'success');
        } catch (e) {
            console.error('[ScribeExporter] Copy failed:', e);
            window.app?.showToast(window.i18n?.t('common.error') || 'Copy failed', 'error');
        }
    }

    /**
     * 导出总结为 TXT 文件
     */
    exportSummaryTXT() {
        const content = this.app.currentSummary || document.getElementById('summary-content')?.innerText;
        if (!content) return;

        // 使用通用下载方法
        this.downloadFile(content, `summary_${Date.now()}.txt`, 'text/plain');
        window.app?.showToast(window.i18n?.t('common.report.loading') || 'Processing...', 'success');
    }

    /**
     * 复制当前所有字幕文本
     */
    async copyText() {
        const segments = this.app.segments || this.app.rawSegments;
        if (!segments || segments.length === 0) return;

        const formattedLines = segments.map((seg, index) => {
            const time = this._formatScribeTime(seg.start);
            const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
            const text = (seg.text || '').trim();
            
            // 如果有对应的翻译，也格式化进去
            let line = `[${time}] ${speaker}${text}`;
            if (this.app.translations && this.app.translations[index]) {
                line += `\n(${this.app.translations[index]})`;
            }
            return line;
        });

        const finalContent = formattedLines.join('\n\n');

        try {
            await navigator.clipboard.writeText(finalContent);
            window.app?.showToast(window.i18n?.t('common.scribe.copiedToClipboard') || 'Copied to clipboard', 'success');
        } catch (e) {
            console.error('[ScribeExporter] Copy text failed:', e);
            window.app?.showToast(window.i18n?.t('common.error') || 'Copy failed', 'error');
        }
    }

    /**
     * 格式化 ScribeFlow 的时间 (M:SS)
     */
    _formatScribeTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * 导出 SRT 字幕文件
     */
    async exportSRT() {
        try {
            // 调用后端生成 SRT 内容
            const srtContent = await window.mediaflow?.transcribe.exportSRT(this.app.segments);
            if (srtContent) {
                this.downloadFile(srtContent, 'transcript.srt', 'text/srt');
            } else {
                window.app?.showToast(window.i18n?.t('scribe.srtGenFailedEmpty') || 'SRT generation failed: content is empty', 'error');
            }
        } catch (error) {
            console.error('[ScribeExporter] Export SRT error:', error);
            window.app?.showToast(window.i18n?.t('common.error') || 'SRT export failed', 'error');
        }
    }

    /**
     * 导出纯文本 TXT
     */
    async exportTXT() {
        try {
            // 调用后端生成 TXT 内容 (第二个参数 true 可能代表 includeTimestamps 或 formatting)
            const txtContent = await window.mediaflow?.transcribe.exportText(this.app.segments, true);
            if (txtContent) {
                this.downloadFile(txtContent, 'transcript.txt', 'text/plain');
            } else {
                window.app?.showToast(window.i18n?.t('scribe.txtGenFailedEmpty') || 'TXT generation failed: content is empty', 'error');
            }
        } catch (error) {
            console.error('[ScribeExporter] Export TXT error:', error);
            window.app?.showToast(window.i18n?.t('common.error') || 'TXT export failed', 'error');
        }
    }

    /**
     * 批量导出所有成功的结果为 ZIP
     */
    async exportAllZip() {
        if (!this.app.results || this.app.results.length === 0) {
            window.app?.showToast(window.i18n?.t('common.transcribe.noExportResults') || 'No results to export', 'warning');
            return;
        }

        const successResults = this.app.results.filter(r => r.success);
        if (successResults.length === 0) {
            window.app?.showToast(window.i18n?.t('common.transcribe.noTranscribeResults') || 'No successful transcription results', 'warning');
            return;
        }

        try {
            window.app?.showToast(window.i18n?.t('common.status.processing') || 'Processing...', 'info');

            // 准备文件列表
            const files = [];
            for (const result of successResults) {
                const baseName = result.file.replace(/\.[^/.]+$/, ''); // 去掉扩展名

                // 生成 SRT
                if (result.segments && result.segments.length > 0) {
                    const srtContent = await window.mediaflow?.transcribe.exportSRT(result.segments);
                    files.push({ name: `${baseName}.srt`, content: srtContent });
                }

                // 生成 TXT
                // 如果 result.text 存在则使用，否则重新凭借 segments
                const txtContent = result.text || result.segments.map(s => s.text).join(' ');
                files.push({ name: `${baseName}.txt`, content: txtContent });
            }

            // 调用主进程创建 ZIP
            const zipResult = await window.mediaflow?.transcribe.exportZip(files);

            if (zipResult && zipResult.success) {
                // 主进程可能直接保存了文件或者返回了成功状态
                // 这里的提示稍微改一下
                window.app?.showToast(window.i18n?.t('common.transcribe.packSuccess') || 'Packaged successfully', 'success');
            } else {
                throw new Error(zipResult?.error || 'Operation failed');
            }
        } catch (error) {
            console.error('[ScribeExporter] ZIP export error:', error);
            window.app?.showToast((window.i18n?.t('common.error') || 'Export failed:') + ' ' + error.message, 'error');
        }
    }

    /**
     * 通用文件下载方法
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        window.app?.showToast(window.i18n?.t('common.transcribe.fileSaved', { filename }) || `Saved ${filename}`, 'success');
    }
}

window.ScribeExporter = ScribeExporter;
