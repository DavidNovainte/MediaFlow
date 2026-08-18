/**
 * PixelFileManager.js
 * 管理待处理图片的列表状态
 */

class PixelFileManager {
    /**
     * @param {PixelFlow} controller - PixelFlow 控制器引用
     */
    constructor(controller) {
        this.controller = controller;
        this.files = [];
        this.selectedIndex = -1;
    }

    /**
     * 添加文件
     */
    isSupportedImagePath(filePath, mimeType = '') {
        const p = String(filePath || '');
        if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(p)) return true;
        if (mimeType && String(mimeType).startsWith('image/')) {
            // Reject empty path masquerading as image/*
            if (/\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav)$/i.test(p)) return false;
            return true;
        }
        return false;
    }

    addFiles(newFiles) {
        const added = [];
        let skipped = 0;
        for (const file of newFiles) {
            const path = file?.path || file;
            const name = file?.name || String(path).split(/[/\\]/).pop();
            const type = file?.type || '';
            if (!this.isSupportedImagePath(path, type)) {
                skipped += 1;
                continue;
            }
            // 支持 File 对象或普通对象 (来自 IPC)
            const fileObj = {
                file: file,
                path,
                name,
                size: file?.size || 0,
                type: type || 'image/unknown'
            };
            this.files.push(fileObj);
            added.push(fileObj);
        }

        if (this.selectedIndex === -1 && this.files.length > 0) {
            this.selectedIndex = 0;
        }
        if (skipped > 0) {
            window.app?.showToast?.(
                window.i18n?.t?.('pixel.skipNonImages', { count: skipped })
                    || `Skipped ${skipped} non-image file(s). Use AI Enhance for short videos.`,
                'info'
            );
        }
        return added;
    }

    /**
     * 移除文件
     */
    removeFile(index) {
        if (index >= 0 && index < this.files.length) {
            this.files.splice(index, 1);
            if (this.selectedIndex >= this.files.length) {
                this.selectedIndex = this.files.length - 1;
            }
            if (this.files.length === 0) {
                this.selectedIndex = -1;
            }
        }
    }

    /**
     * 排序/移动文件
     */
    reorderFiles(from, to) {
        const maxIndex = this.files.length - 1;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > maxIndex) return;

        const targetIndex = Math.max(0, Math.min(to, maxIndex));
        if (from === targetIndex) return;

        const item = this.files.splice(from, 1)[0];
        const insertIndex = Math.max(0, Math.min(targetIndex, this.files.length));
        this.files.splice(insertIndex, 0, item);

        // 保持选中项跟随
        if (this.selectedIndex === from) {
            this.selectedIndex = insertIndex;
        } else if (from < this.selectedIndex && insertIndex >= this.selectedIndex) {
            this.selectedIndex--;
        } else if (from > this.selectedIndex && insertIndex <= this.selectedIndex) {
            this.selectedIndex++;
        }
    }

    setSelectedIndex(index) {
        if (index >= 0 && index < this.files.length) {
            this.selectedIndex = index;
        }
    }

    getFiles() {
        return this.files;
    }

    getCurrentFile() {
        return this.files[this.selectedIndex] || null;
    }

    clear() {
        this.files = [];
        this.selectedIndex = -1;
    }
}

window.PixelFileManager = PixelFileManager;
