/**
 * PixelPresetUI.js
 * 专门负责自定义预设下拉菜单的渲染和交互
 */
class PixelPresetUI {
    /**
     * @param {PixelPresetManager} manager - 预设管理器引用
     */
    constructor(manager) {
        this.manager = manager;
        this._dropdownListPortal = null;
        this._clickOutsideHandler = null;
        this._resizeHandler = null;
    }

    render(presets) {
        const container = document.getElementById('custom-presets-container');
        const wrapper = document.getElementById('custom-presets-wrapper');
        if (!container) return;

        container.innerHTML = '';

        // 如果没有预设，隐藏整个区域
        if (presets.length === 0) {
            if (wrapper) wrapper.classList.add('hidden');
            return;
        }

        // 有预设时，显示区域
        if (wrapper) wrapper.classList.remove('hidden');

        // Create Dropdown Container
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.className = 'preset-dropdown-group';

        // --- Custom Select Structure ---
        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'preset-select-wrapper';
        selectWrapper.style.flex = '1';
        selectWrapper.style.position = 'relative';

        // 1. Trigger
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `
            <span id="current-preset-label">选择预设...</span>
            <span class="custom-select-arrow">▼</span>
        `;

        let dropdownList = null;

        // Update Label Helper
        const updateSelected = (name) => {
            const label = trigger.querySelector('#current-preset-label');
            if (label) label.textContent = name || 'Notification';
            const preset = presets.find(p => p.name === name);
            if (preset) trigger.dataset.selectedId = preset.id;
        };

        const closeDropdown = () => {
            if (dropdownList && document.body.contains(dropdownList)) {
                dropdownList.classList.remove('show');
            }
            trigger.classList.remove('active');
            if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
            if (this._clickOutsideHandler) document.removeEventListener('click', this._clickOutsideHandler);
            this._resizeHandler = null;
            this._clickOutsideHandler = null;
        };

        const updatePosition = () => {
            if (!dropdownList || !dropdownList.classList.contains('show')) return;
            const rect = trigger.getBoundingClientRect();
            const scrollTop = window.scrollY || document.documentElement.scrollTop;

            dropdownList.style.top = `${rect.bottom + scrollTop + 4}px`;
            dropdownList.style.left = `${rect.left}px`;
            dropdownList.style.width = `${rect.width}px`;
        };

        const clickOutside = (e) => {
            if (dropdownList && !dropdownList.contains(e.target) && !trigger.contains(e.target)) {
                closeDropdown();
            }
        };

        const createDropdownPortal = () => {
            const el = document.createElement('div');
            el.className = 'custom-options-dropdown';
            el.style.position = 'absolute'; // 相对于 body
            el.style.zIndex = '9999'; // 确保在最顶层

            presets.forEach(preset => {
                const option = document.createElement('div');
                option.className = 'custom-option';
                option.textContent = preset.name;
                option.dataset.id = preset.id;

                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.manager.applyPreset(preset.id);
                    updateSelected(preset.name);
                    closeDropdown();
                });

                el.appendChild(option);
            });

            return el;
        };

        // Toggle Logic
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();

            const isActive = trigger.classList.contains('active');

            if (isActive) {
                closeDropdown();
            } else {
                // Open
                this._dropdownListPortal = createDropdownPortal();

                // Cleanup existing if any
                if (document.body.contains(this._dropdownListPortal)) {
                    // Should be new element, but safety check
                }

                // Remove old portal if exists (though we create new one)
                const old = document.querySelector('.custom-options-dropdown');
                if (old && old.parentNode) old.parentNode.removeChild(old);

                document.body.appendChild(this._dropdownListPortal);
                dropdownList = this._dropdownListPortal;

                // Initial Position
                const rect = trigger.getBoundingClientRect();
                const scrollTop = window.scrollY || document.documentElement.scrollTop;
                dropdownList.style.top = `${rect.bottom + scrollTop + 4}px`;
                dropdownList.style.left = `${rect.left}px`;
                dropdownList.style.width = `${rect.width}px`;

                requestAnimationFrame(() => {
                    dropdownList.classList.add('show');
                    trigger.classList.add('active');
                });

                this._resizeHandler = updatePosition;
                this._clickOutsideHandler = clickOutside;

                window.addEventListener('resize', this._resizeHandler);
                document.addEventListener('click', this._clickOutsideHandler);
            }
        });

        selectWrapper.appendChild(trigger);

        // --- Delete Button ---
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon btn-cancel-preset';
        deleteBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.title = '删除当前预设';

        deleteBtn.addEventListener('click', () => {
            const selectedId = trigger.dataset.selectedId;
            if (!selectedId) {
                window.app?.showToast(window.i18n?.t('pixel.selectPresetFirst') || 'Please select a preset first', 'warning');
                return;
            }
            const preset = presets.find(p => p.id === selectedId);
            if (preset) {
                this.showDeleteModal(preset, selectedId);
            }
        });

        dropdownWrapper.appendChild(selectWrapper);
        dropdownWrapper.appendChild(deleteBtn);
        container.appendChild(dropdownWrapper);
    }

    showDeleteModal(preset, selectedId) {
        const modal = document.getElementById('preset-delete-modal');
        const confirmBtn = document.getElementById('confirm-delete-preset');
        const cancelBtns = modal.querySelectorAll('.modal-close, .modal-close-btn');
        const msg = document.getElementById('delete-preset-confirm-msg');

        if (msg) msg.textContent = window.i18n?.t('pixel.confirmDeletePreset', { name: preset.name }) || `Delete preset "${preset.name}"? This cannot be undone.`;

        const close = () => {
            modal.classList.add('hidden');
        };

        modal.classList.remove('hidden');

        // Re-bind confirm button
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', () => {
            this.manager.deletePreset(selectedId);
            close();
        });

        cancelBtns.forEach(btn => {
            btn.onclick = close;
        });
    }

    highlight() {
        // Highlighting logic if needed, or if it was part of render
        // Currently it seems this was done by toggling classes on items in the main list
        // kept if useful for other UI updates
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }
}

window.PixelPresetUI = PixelPresetUI;
