class SubtitleTemplateManager {
    constructor(styleManager) {
        this.styleManager = styleManager;
        this.flow = styleManager.flow;
        this.styleTemplate = null;
        this.btnSaveTemplate = null;
        this.btnDeleteTemplate = null;
    }

    init(elements) {
        this.styleTemplate = elements.styleTemplate;
        this.btnSaveTemplate = elements.btnSaveTemplate;
        this.btnDeleteTemplate = elements.btnDeleteTemplate;
        this.bindEvents();
    }

    bindEvents() {
        this.styleTemplate?.addEventListener('change', () => this.onTemplateChange());
        this.btnSaveTemplate?.addEventListener('click', () => this.saveCurrentTemplate());
        this.btnDeleteTemplate?.addEventListener('click', () => this.deleteCurrentTemplate());
    }

    async loadCustomTemplates() {
        try {
            const custom = await window.mediaflow.store.get('subtitleTemplates') || {};
            // Access styleTemplates via styleManager
            Object.assign(this.styleManager.styleTemplates, custom);
            this.refreshTemplateSelect();
            console.log('[SubtitleTemplateManager] Loaded custom templates:', Object.keys(custom));
        } catch (e) {
            console.error('[SubtitleTemplateManager] Failed to load templates:', e);
        }
    }

    refreshTemplateSelect() {
        if (!this.styleTemplate) return;

        const currentVal = this.styleTemplate.value;
        this.styleTemplate.innerHTML = '';

        // Default templates
        const defaults = ['default', 'yellow', 'cinema', 'neon', 'sweet', 'vibrant'];
        defaults.forEach(key => {
            const t = this.styleManager.styleTemplates[key];
            if (t) {
                const opt = document.createElement('option');
                opt.value = key;
                // Use i18n for name if available, fallback to hardcoded name
                opt.textContent = window.i18n?.t(`subtitle.settings.templates.${key}`) || t.name;
                this.styleTemplate.appendChild(opt);
            }
        });

        // Separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        this.styleTemplate.appendChild(separator);

        // Custom templates
        const customKeys = Object.keys(this.styleManager.styleTemplates).filter(k => k.startsWith('custom_'));
        customKeys.forEach(key => {
            const t = this.styleManager.styleTemplates[key];
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${t.name} ${window.i18n.t('subtitle.settings.templates.custom_suffix')}`;
            this.styleTemplate.appendChild(opt);
        });

        // Custom/Unsaved option
        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = window.i18n.t('subtitle.settings.templates.custom_label');
        this.styleTemplate.appendChild(customOpt);

        // Restore selection or default
        if (this.styleManager.styleTemplates[currentVal] || currentVal === 'custom') {
            this.styleTemplate.value = currentVal;
        } else {
            this.styleTemplate.value = 'default';
        }

        this.updateTemplateButtons();
    }

    updateTemplateButtons() {
        const val = this.styleTemplate.value;
        const builtIns = ['default', 'yellow', 'cinema', 'neon', 'sweet', 'vibrant'];
        const isCustom = val !== 'custom' && !builtIns.includes(val);

        if (this.btnDeleteTemplate) {
            this.btnDeleteTemplate.style.display = isCustom ? 'inline-flex' : 'none';
        }
    }

    onTemplateChange() {
        const val = this.styleTemplate.value;
        if (val === 'custom') return;

        const t = this.styleManager.styleTemplates[val];
        if (t) {
            // 通过 flow.currentStyle setter 整体赋值，确保同步到轨道
            this.flow.currentStyle = this.styleManager.cloneStyle(t);
            this.styleManager.applyStyleToUI();
            this.updateTemplateButtons();
        }
    }

    async saveCurrentTemplate() {
        const currentVal = this.styleTemplate.value;
        let defaultName = window.i18n.t('subtitle.settings.templates.default_name');
        if (currentVal !== 'custom' && this.styleManager.styleTemplates[currentVal]) {
            defaultName = this.styleManager.styleTemplates[currentVal].name;
            if (['default', 'yellow', 'cinema'].includes(currentVal)) {
                defaultName += ` ${window.i18n.t('subtitle.settings.templates.copy_suffix')}`;
            }
        }

        const overlay = document.createElement('div');
        overlay.id = 'dynamic-template-modal';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.7); display: flex;
            justify-content: center; align-items: center; z-index: 999999;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--bg-card); padding: 24px; border-radius: 12px;
            width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            border: 1px solid #333;
        `;

        const title = document.createElement('h4');
        title.textContent = window.i18n.t('subtitle.settings.templates.modal_title');
        title.style.cssText = 'margin: 0 0 16px 0; color: #fff; font-size: 16px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultName;
        input.placeholder = window.i18n.t('subtitle.settings.templates.input_placeholder');
        input.style.cssText = `
            width: 100%; padding: 10px 12px; border: 1px solid #444; border-radius: 6px;
            background: #2a2a2a; color: #fff; font-size: 14px; margin-bottom: 20px; box-sizing: border-box;
        `;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';

        const createBtn = (text, bg) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                padding: 8px 16px; border: ${bg === '#333' ? '1px solid #555' : 'none'};
                border-radius: 6px; background: ${bg}; color: #fff; cursor: pointer; font-size: 14px;
            `;
            return btn;
        };

        const btnCancel = createBtn(window.i18n.t('common.actions.cancel'), '#333');
        const btnSave = createBtn(window.i18n.t('common.actions.save'), '#4d82c9');

        btnContainer.appendChild(btnCancel);
        btnContainer.appendChild(btnSave);
        modalContent.appendChild(title);
        modalContent.appendChild(input);
        modalContent.appendChild(btnContainer);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);

        input.focus();
        input.select();

        const closeModal = () => {
            if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        };

        const handleSave = async () => {
            const name = input.value.trim();
            if (!name) return;

            let id;
            if (currentVal.startsWith('custom_')) {
                id = currentVal;
            } else {
                id = 'custom_' + Date.now();
            }

            const newTemplate = {
                ...this.styleManager.currentStyle,
                name: name
            };

            this.styleManager.styleTemplates[id] = newTemplate;
            await this.persistTemplates();

            this.refreshTemplateSelect();
            this.styleTemplate.value = id;
            this.updateTemplateButtons();

            if (this.flow && this.flow.activeTrackId) {
                const track = this.flow.tracks.find(t => t.id === this.flow.activeTrackId);
                if (track) track.style = this.styleManager.cloneStyle(newTemplate);
            }

            window.app?.showToast?.(window.i18n.t('subtitle.settings.templates.save_success', { name: name }), 'success');
            closeModal();
        };

        btnCancel.addEventListener('click', closeModal);
        btnSave.addEventListener('click', handleSave);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') closeModal();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    async deleteCurrentTemplate() {
        const id = this.styleTemplate.value;
        if (!this.styleManager.styleTemplates[id]) return;

        const templateName = this.styleManager.styleTemplates[id].name;
        const confirmed = await window.app?.showConfirm(window.i18n.t('subtitle.settings.templates.delete_confirm', { name: templateName }));
        if (!confirmed) return;

        delete this.styleManager.styleTemplates[id];
        await this.persistTemplates();

        this.refreshTemplateSelect();
        this.onTemplateChange();
    }

    async persistTemplates() {
        const defaults = ['default', 'yellow', 'cinema'];
        const toSave = {};
        for (const key in this.styleManager.styleTemplates) {
            if (!defaults.includes(key)) {
                toSave[key] = this.styleManager.styleTemplates[key];
            }
        }
        await window.mediaflow.store.set('subtitleTemplates', toSave);
        console.log('[SubtitleTemplateManager] Templates saved');
    }
}

window.SubtitleTemplateManager = SubtitleTemplateManager;
