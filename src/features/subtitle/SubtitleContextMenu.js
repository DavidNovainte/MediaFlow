/**
 * SubtitleContextMenu.js
 * 负责时间轴右键菜单的生成与交互逻辑
 */
class SubtitleContextMenu {
    constructor(flow) {
        this.flow = flow;
        this.menu = null;
        this.targetSub = null;
        this.targetIndex = -1;
        this.targetTrackId = -1;
    }

    /**
     * 在指定位置显示菜单
     */
    show(x, y, trackId, index) {
        this.hide(); // 先清理旧的

        this.targetTrackId = trackId;
        this.targetIndex = index;
        const track = this.flow.trackManager?.tracks.find(t => t.id === trackId);
        if (!track) return;
        this.targetSub = track.subtitles?.[index];
        if (!this.targetSub) return;

        this.menu = document.createElement('div');
        this.menu.className = 'subtitle-context-menu';

        const isAudio = track.type === 'audio';
        let items = [];

        if (isAudio) {
            // 配音轨专属菜单
            items = [
                { id: 'play', icon: 'fa-volume-high', label: window.i18n.t('subtitle.context_menu.preview_audio'), action: () => this.flow.audioActionHandler.previewClip(trackId, index) },
                { id: 'tts', icon: 'fa-microphone-lines', label: window.i18n.t('subtitle.context_menu.regenerate_audio'), action: () => this.flow.autoUpdateSubtitleTTS(index, true) },
                { type: 'separator' },
                { id: 'split', icon: 'fa-scissors', label: window.i18n.t('subtitle.context_menu.split'), action: () => this._runAction(index, () => this.flow.editor.handler.splitAtPlayhead()) },
                { type: 'separator' },
                { id: 'delete', icon: 'fa-trash', label: window.i18n.t('subtitle.context_menu.delete_audio'), action: () => this.flow.audioActionHandler.deleteClip(trackId, index), danger: true }
            ];
        } else {
            // 字幕轨常规菜单
            items = [
                { id: 'play', icon: 'fa-play', label: window.i18n.t('subtitle.context_menu.play'), action: () => this._runAction(index, () => this.flow.editor.playSubtitle(index)) },
                { id: 'preview-tts', icon: 'fa-volume-high', label: window.i18n.t('subtitle.context_menu.preview_audio'), action: () => this.flow.editor.previewTts(index) },
                { id: 'tts', icon: 'fa-microphone-lines', label: window.i18n.t('subtitle.context_menu.regenerate_audio'), action: () => this.flow.autoUpdateSubtitleTTS(index, true) },
                { type: 'separator' },
                { id: 'split', icon: 'fa-scissors', label: window.i18n.t('subtitle.context_menu.split'), action: () => this._runAction(index, () => this.flow.editor.splitSubtitle(index)) },
                { id: 'merge', icon: 'fa-link', label: window.i18n.t('subtitle.context_menu.merge'), action: () => this._runAction(index, () => this.flow.editor.mergeWithNext(index)) },
                { type: 'separator' },
                { id: 'delete', icon: 'fa-trash', label: window.i18n.t('subtitle.context_menu.delete'), action: () => this._runAction(index, () => this.flow.editor.deleteSubtitle(index)), danger: true }
            ];
        }

        items.forEach(item => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'menu-separator';
                this.menu.appendChild(sep);
                return;
            }

            const el = document.createElement('div');
            el.className = `menu-item ${item.danger ? 'danger' : ''}`;
            el.innerHTML = `
                <i class="fa-solid ${item.icon}"></i>
                <span>${item.label}</span>
            `;
            el.onclick = (e) => {
                e.stopPropagation();
                item.action();
                this.hide();
            };
            this.menu.appendChild(el);
        });

        document.body.appendChild(this.menu);

        // 智能定位：避免超出边界
        const menuWidth = 160;
        const menuHeight = this.menu.offsetHeight || 180;
        let left = x;
        let top = y;

        if (left + menuWidth > window.innerWidth) left -= menuWidth;
        if (top + menuHeight > window.innerHeight) top -= menuHeight;

        this.menu.style.left = `${left}px`;
        this.menu.style.top = `${top}px`;

        // 点击外部关闭
        this._onOutsideClick = (e) => {
            if (!this.menu.contains(e.target)) this.hide();
        };
        setTimeout(() => document.addEventListener('click', this._onOutsideClick), 10);
    }

    /**
     * 执行动作前的安全检查：确保轨道激活
     */
    _runAction(index, callback) {
        if (this.targetTrackId !== -1 && this.flow.activeTrackId !== this.targetTrackId) {
            console.log('[ContextMenu] Switching track to', this.targetTrackId);
            this.flow.trackManager.setActiveTrack(this.targetTrackId);
            // 给予少量延时让 Editor 刷新数据
            setTimeout(() => callback(), 50);
        } else {
            callback();
        }
    }

    hide() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        if (this._onOutsideClick) {
            document.removeEventListener('click', this._onOutsideClick);
            this._onOutsideClick = null;
        }
    }
}

window.SubtitleContextMenu = SubtitleContextMenu;
