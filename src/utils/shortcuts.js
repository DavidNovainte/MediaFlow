/**
 * MediaFlow - 蹇嵎閿鐞嗗櫒
 * 鍏ㄥ眬蹇嵎閿郴缁燂紝鏀寔鑷畾涔夐厤缃?
 */

class ShortcutsManager {
    constructor(app) {
        this.app = app;
        this.isEditing = false;
        this.editingAction = null;

        // 榛樿蹇嵎閿厤缃?
        this.defaultShortcuts = {
            'paste-and-parse': { key: 'v', ctrl: true, shift: false, alt: false },
            'start-download': { key: 'd', ctrl: true, shift: false, alt: false },
            'add-to-queue': { key: 'd', ctrl: true, shift: true, alt: false },
            'toggle-pause': { key: ' ', ctrl: false, shift: false, alt: false },
            'cancel': { key: 'Escape', ctrl: false, shift: false, alt: false },
            'nav-download': { key: '1', ctrl: true, shift: false, alt: false },
            'nav-history': { key: '2', ctrl: true, shift: false, alt: false },
            'nav-creator': { key: '3', ctrl: true, shift: false, alt: false },
            'nav-transcribe': { key: '4', ctrl: true, shift: false, alt: false },
            'nav-enhance': { key: '5', ctrl: true, shift: false, alt: false },
            'nav-subtitle': { key: '6', ctrl: true, shift: false, alt: false },
            'nav-compress': { key: '7', ctrl: true, shift: false, alt: false },
            'nav-mobile': { key: '8', ctrl: true, shift: false, alt: false },
            'nav-settings': { key: ',', ctrl: true, shift: false, alt: false },
            'toggle-sidebar': { key: 'b', ctrl: true, shift: false, alt: false }
        };

        // 椤甸潰ID鏄犲皠
        this.pageMap = {
            'nav-download': 'download',
            'nav-history': 'history',
            'nav-creator': 'creator',
            'nav-transcribe': 'transcribe',
            'nav-enhance': 'enhance',
            'nav-subtitle': 'subtitle',
            'nav-compress': 'compress',
            'nav-mobile': 'mobile',
            'nav-settings': 'settings'
        };

        // 鍔犺浇鐢ㄦ埛鑷畾涔夊揩鎹烽敭
        this.shortcuts = { ...this.defaultShortcuts };
        this.loadShortcuts();
    }

    /**
     * 鍒濆鍖栧揩鎹烽敭绯荤粺
     */
    init() {
        this.bindGlobalShortcuts();
        this.bindSettingsUI();
    }

    /**
     * 浠庡瓨鍌ㄥ姞杞借嚜瀹氫箟蹇嵎閿?
     */
    async loadShortcuts() {
        try {
            const saved = await window.mediaflow?.store?.get('customShortcuts');
            if (saved) {
                this.shortcuts = { ...this.defaultShortcuts, ...saved };
            }
        } catch (e) {
            console.warn('[Shortcuts] Failed to load custom shortcuts:', e);
        }
        this.updateUI();
    }

    /**
     * 淇濆瓨蹇嵎閿埌瀛樺偍
     */
    async saveShortcuts() {
        try {
            await window.mediaflow?.store?.set('customShortcuts', this.shortcuts);
        } catch (e) {
            console.warn('[Shortcuts] Failed to save shortcuts:', e);
        }
    }

    /**
     * 缁戝畾鍏ㄥ眬蹇嵎閿洃鍚?
     */
    bindGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 濡傛灉姝ｅ湪缂栬緫蹇嵎閿紝涓嶈Е鍙戞搷浣?
            if (this.isEditing) return;

            // 濡傛灉鐒︾偣鍦ㄨ緭鍏ユ锛屽彧鍝嶅簲鐗瑰畾蹇嵎閿?
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

            for (const [action, shortcut] of Object.entries(this.shortcuts)) {
                if (this.matchShortcut(e, shortcut)) {
                    // 空格在转录/字幕页用于播放媒体，只允许下载页响应“暂停下载”。
                    if (action === 'toggle-pause' && this.app.router?.currentPage !== 'download') {
                        continue;
                    }

                    // 鍦ㄨ緭鍏ユ鍐呮椂锛屽彧鍏佽 Escape 鍜屽鑸揩鎹烽敭
                    if (isInput && !action.startsWith('nav-') && action !== 'cancel') {
                        continue;
                    }

                    e.preventDefault();
                    this.executeAction(action);
                    return;
                }
            }
        });
    }

    /**
     * 妫€鏌ユ寜閿簨浠舵槸鍚﹀尮閰嶅揩鎹烽敭
     */
    matchShortcut(event, shortcut) {
        const key = event.key.toLowerCase();
        const shortcutKey = shortcut.key.toLowerCase();

        return key === shortcutKey &&
            event.ctrlKey === shortcut.ctrl &&
            event.shiftKey === shortcut.shift &&
            event.altKey === shortcut.alt;
    }

    /**
     * 鎵ц蹇嵎閿搷浣?
     */
    executeAction(action) {
        console.log('[Shortcuts] Executing:', action);

        switch (action) {
        case 'paste-and-parse':
            this.app.downloadManager?.pasteAndParse?.();
            break;
        case 'start-download':
            document.getElementById('btn-download')?.click();
            break;
        case 'add-to-queue':
            this.app.showToast?.(window.i18n.t('common.shortcuts.queue_dev'), 'info');
            break;
        case 'toggle-pause':
            this.app.downloadManager?.togglePause?.();
            break;
        case 'cancel': {
            const modal = document.querySelector('.modal-overlay');
            if (modal) {
                modal.remove();
            } else {
                this.app.downloadManager?.cancel?.();
            }
            break;
        }
        case 'toggle-sidebar':
            this.app.ui?.toggleSidebar?.();
            break;
        default:
            // 椤甸潰瀵艰埅
            if (action.startsWith('nav-')) {
                const pageId = this.pageMap[action];
                if (pageId) {
                    this.app.navigateTo?.(pageId);
                    // 涔熷皾璇曠偣鍑诲搴旂殑瀵艰埅閾炬帴
                    const navLink = document.querySelector(`[data-page="${pageId}"]`);
                    navLink?.click();
                }
            }
        }
    }

    /**
     * 缁戝畾璁剧疆椤甸潰UI浜嬩欢
     */
    bindSettingsUI() {
        // 蹇嵎閿寜閽偣鍑?- 杩涘叆缂栬緫妯″紡
        document.querySelectorAll('.shortcut-key').forEach(btn => {
            btn.addEventListener('click', () => {
                this.startEditing(btn.dataset.action, btn);
            });
        });

        // 鎭㈠榛樿鎸夐挳
        const btnReset = document.getElementById('btn-reset-shortcuts');
        if (btnReset) {
            btnReset.onclick = async () => {
                this.shortcuts = { ...this.defaultShortcuts };
                await this.saveShortcuts();
                this.updateUI();
                this.app.showToast?.(window.i18n.t('common.shortcuts.reset_success'), 'success');
            };
        }
    }

    /**
     * 寮€濮嬬紪杈戝揩鎹烽敭
     */
    startEditing(action, button) {
        // 娓呴櫎涔嬪墠鐨勭紪杈戠姸鎬?
        document.querySelectorAll('.shortcut-key.editing').forEach(b => {
            b.classList.remove('editing');
        });

        this.isEditing = true;
        this.editingAction = action;
        button.classList.add('editing');
        button.textContent = window.i18n.t('common.shortcuts.press_new');

        // 鐩戝惉鎸夐敭
        const keyHandler = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 蹇界暐鍗曠嫭鐨勪慨楗伴敭
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                return;
            }

            // 淇濆瓨鏂板揩鎹烽敭
            this.shortcuts[action] = {
                key: e.key,
                ctrl: e.ctrlKey,
                shift: e.shiftKey,
                alt: e.altKey
            };

            await this.saveShortcuts();
            this.updateUI();
            this.stopEditing();
            this.app.showToast?.(window.i18n.t('common.shortcuts.update_success'), 'success');

            document.removeEventListener('keydown', keyHandler, true);
        };

        // ESC 鍙栨秷缂栬緫
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.stopEditing();
                this.updateUI();
                document.removeEventListener('keydown', keyHandler, true);
                document.removeEventListener('keydown', escHandler, true);
            }
        };

        document.addEventListener('keydown', keyHandler, true);
        document.addEventListener('keydown', escHandler, true);

        // 3绉掕秴鏃?
        setTimeout(() => {
            if (this.isEditing && this.editingAction === action) {
                this.stopEditing();
                this.updateUI();
                document.removeEventListener('keydown', keyHandler, true);
            }
        }, 5000);
    }

    /**
     * 鍋滄缂栬緫
     */
    stopEditing() {
        this.isEditing = false;
        this.editingAction = null;
        document.querySelectorAll('.shortcut-key.editing').forEach(b => {
            b.classList.remove('editing');
        });
    }

    /**
     * 鏇存柊UI鏄剧ず
     */
    updateUI() {
        for (const [action, shortcut] of Object.entries(this.shortcuts)) {
            const btn = document.querySelector(`.shortcut-key[data-action="${action}"]`);
            if (btn) {
                btn.textContent = this.formatShortcut(shortcut);
            }
        }
    }

    /**
     * 鏍煎紡鍖栧揩鎹烽敭鏄剧ず鏂囨湰
     */
    formatShortcut(shortcut) {
        const parts = [];
        if (shortcut.ctrl) parts.push('Ctrl');
        if (shortcut.shift) parts.push('Shift');
        if (shortcut.alt) parts.push('Alt');

        // 鐗规畩閿悕鏄犲皠
        let keyName = shortcut.key;
        const keyMap = {
            ' ': 'Space',
            'Escape': 'Esc',
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right'
        };
        keyName = keyMap[keyName] || keyName.toUpperCase();
        parts.push(keyName);

        return parts.join('+');
    }
}

// 瀵煎嚭
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShortcutsManager;
}

// 娴忚鍣ㄧ幆澧?
if (typeof window !== 'undefined') {
    window.ShortcutsManager = ShortcutsManager;
}


