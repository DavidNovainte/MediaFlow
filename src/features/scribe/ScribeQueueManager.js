/**
 * ScribeQueueManager.js
 * 负责 ScribeFlow 的文件队列管理
 * 包含：文件选择、队列渲染、拖拽排序、文件删除等
 */

class ScribeQueueManager {
    /**
     * @param {ScribeFlow} scribeflow - ScribeFlow 实例
     */
    constructor(scribeflow) {
        this.app = scribeflow; // 引用主实例
    }

    /**
     * 处理多文件选择 (批量)
     */
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    handleFilesSelect(files) {
        if (!files || files.length === 0) return;

        // 验证文件类型
        const validTypes = ['audio/', 'video/'];
        const validExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.mkv', '.mov', '.avi', '.flv', '.webm', '.ogg', '.wma', '.aac'];

        const validFiles = files.filter(file => {
            let isValid = validTypes.some(type => file.type.startsWith(type));
            if (!isValid) {
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                isValid = validExtensions.includes(ext);
            }
            return isValid;
        });

        if (validFiles.length === 0) {
            window.app?.showToast(window.i18n?.t('scribe.selectAudioVideo') || 'Please select an audio or video file', 'error');
            return;
        }

        // 预设当前操作文件 (防止未开始转录就尝试剪辑)
        if (!this.app.audioFile) {
            this.app.audioFile = validFiles[0];
        }

        // Add to queue (avoid duplicates by name)
        validFiles.forEach(file => {
            if (!this.app.audioFiles.some(f => f.name === file.name)) {
                this.app.audioFiles.push(file);
            }
        });

        // 显示选项区域
        document.getElementById('upload-zone-audio')?.classList.add('hidden');
        document.getElementById('transcribe-options')?.classList.remove('hidden');

        // Render queue
        this.renderQueue();
    }

    /**
     * 渲染文件队列
     */
    renderQueue() {
        const queueEl = document.getElementById('scribe-file-queue');
        const countEl = document.getElementById('scribe-queue-count');
        if (!queueEl) return;

        if (countEl) {
            countEl.textContent = window.i18n ? window.i18n.t('transcribe.selectedCount', { count: this.app.audioFiles.length }) : `Selected ${this.app.audioFiles.length} files`;
        }

        if (this.app.audioFiles.length === 0) {
            queueEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); border: 2px dashed rgba(255,255,255,0.2); border-radius: 8px;">${window.i18n?.t('transcribe.dropFilesHint') || 'Drag and drop more files here'}</div>`;
            this.setupQueueDropZone(queueEl);
            return;
        }

        queueEl.innerHTML = this.app.audioFiles.map((file, idx) => `
            <div class="scribe-queue-item" draggable="true" data-index="${idx}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid var(--fill-hover); cursor: grab; transition: background 0.2s;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <span style="color: var(--text-muted); font-size: 12px; width: 20px; cursor: grab;">⋮⋮</span>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary);" title="${this.escapeHtml(file.name || '')}">${this.escapeHtml(file.name || '')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="color: var(--text-muted); font-size: 12px;">${this.escapeHtml(this.formatFileSize(file.size || 0))}</span>
                    <button class="btn-remove-file" data-index="${idx}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px 6px; font-size: 14px;">✕</button>
                </div>
            </div>
        `).join('');

        // Bind remove buttons
        queueEl.querySelectorAll('.btn-remove-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.index);
                this.removeFromQueue(idx);
            });
        });

        // Setup drag-reorder
        this.setupDragReorder(queueEl);

        // Setup drop zone for adding more files
        this.setupQueueDropZone(queueEl);
    }

    /**
     * 设置队列拖放添加文件
     */
    setupQueueDropZone(queueEl) {
        queueEl.addEventListener('dragover', (e) => {
            // Only handle file drops, not internal reorder
            if (e.dataTransfer?.types?.includes('Files')) {
                e.preventDefault();
                queueEl.style.background = 'rgba(124, 58, 237, 0.2)';
            }
        });

        queueEl.addEventListener('dragleave', () => {
            queueEl.style.background = '';
        });

        queueEl.addEventListener('drop', (e) => {
            queueEl.style.background = '';
            if (e.dataTransfer?.files?.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files);
                this.handleFilesSelect(files);
            }
        });
    }

    /**
     * 设置拖拽排序
     */
    setupDragReorder(queueEl) {
        let draggedIdx = null;

        queueEl.querySelectorAll('.scribe-queue-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedIdx = parseInt(item.dataset.index);
                item.style.opacity = '0.5';
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', draggedIdx);
                }
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                draggedIdx = null;
            });

            item.addEventListener('dragover', (e) => {
                if (draggedIdx !== null) {
                    e.preventDefault();
                    item.style.background = 'rgba(124, 58, 237, 0.3)';
                }
            });

            item.addEventListener('dragleave', () => {
                item.style.background = '';
            });

            item.addEventListener('drop', (e) => {
                item.style.background = '';
                if (draggedIdx !== null) {
                    e.preventDefault();
                    const targetIdx = parseInt(item.dataset.index);
                    if (draggedIdx !== targetIdx) {
                        this.reorderQueue(draggedIdx, targetIdx);
                    }
                }
            });
        });
    }

    /**
     * 重新排序队列
     */
    reorderQueue(fromIdx, toIdx) {
        const [moved] = this.app.audioFiles.splice(fromIdx, 1);
        this.app.audioFiles.splice(toIdx, 0, moved);
        this.renderQueue();
    }

    /**
     * 从队列移除文件
     */
    removeFromQueue(index) {
        this.app.audioFiles.splice(index, 1);
        this.renderQueue();
        if (this.app.audioFiles.length === 0) {
            // Reset main app if queue is empty
            if (typeof this.app.reset === 'function') {
                this.app.reset();
            }
        }
    }

    /**
     * 清空队列
     */
    clearQueue() {
        this.app.audioFiles = [];
        if (typeof this.app.reset === 'function') {
            this.app.reset();
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        const k = 1024;
        const dm = 2; // decimals
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

window.ScribeQueueManager = ScribeQueueManager;
