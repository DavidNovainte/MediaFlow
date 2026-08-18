/**
 * BatchInputManager.js
 * Manages the Smart Chip Input for batch downloads.
 * Handles pasting, validation, and chip rendering.
 */
class BatchInputManager {
    constructor(containerId, inputId) {
        this.container = document.getElementById(containerId);
        this.input = document.getElementById(inputId);
        // Find wrapper for styling events (glass panel)
        this.wrapper = this.container ? this.container.closest('.batch-input-wrapper') : null;

        this.chips = new Set(); // Store unique URLs

        // Callback for external updates
        this.onUpdate = null;

        this.init();
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init() {
        if (!this.container || !this.input) return;

        // Container click focuses input (Robust)
        this.container.addEventListener('click', (e) => {
            // Prevent focusing if we clicked a remove button
            if (this.closest(e.target, '.chip-remove')) return;

            this.input.focus();
        });

        // Focus handling for styling
        this.input.addEventListener('focus', () => {
            if (this.wrapper) this.wrapper.classList.add('focused');
            else this.container.classList.add('focused');
        });
        this.input.addEventListener('blur', () => {
            if (this.wrapper) this.wrapper.classList.remove('focused');
            else this.container.classList.remove('focused');

            // Process remaining text on blur
            const val = this.input.value.trim();
            if (val) {
                this.processInput(val);
                this.input.value = '';
            }
        });

        // Paste Handling on Input
        this.input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            this.processInput(text);
        });

        // 🆕 Global Paste Support (with Visibility Check)
        document.addEventListener('paste', (e) => {
            // Only handle if this component is visible
            if (this.container.offsetParent === null) return;

            // If focus is on the input, the input's own paste handler will catch it (and stopPropagation/preventDefault there if needed).
            // But if we are just "active" in the UI sense (e.g. user clicked the box but focus was lost or on body), handle it.
            // Note: input 'paste' fires BEFORE document 'paste' unless stopped.

            // We want to capture it if the user INTENEDED to paste here.
            // Heuristic: If active element is body (no specific focus) AND we are visible batch mode...
            // OR if active element is within our wrapper.

            const active = document.activeElement;
            const isBody = active === document.body || active === document.documentElement;
            const isChild = this.wrapper ? this.wrapper.contains(active) : this.container.contains(active);

            if (isChild || isBody) {
                // Check if we already handled it in input listener?
                // The input viewer calls e.preventDefault().
                if (e.defaultPrevented) return;

                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                if (text) {
                    this.processInput(text);
                    // Also ensure we visually focus
                    this.input.focus();
                }
            }
        });

        // Key Handling (Enter/Space to create chip, Backspace to delete)
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
                e.preventDefault();
                const val = this.input.value.trim();
                // ... logic continues ...
                if (val) {
                    this.processInput(val);
                    this.input.value = '';
                }
            } else if (e.key === 'Backspace' && this.input.value === '') {
                // Delete last chip
                if (this.chips.size > 0) {
                    this.removeLastChip();
                }
            }
        });
    }

    processInput(text) {
        console.log('[BatchInput] Processing input:', text);
        // Simple regex to split by whitespace, comma, or newline
        const items = text.split(/[\s,\n]+/).filter(item => item.trim() !== '');

        // Stricter URL pattern (require http/https)
        const urlPattern = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/i;

        let addedCount = 0;
        items.forEach(item => {
            if (this.chips.has(item)) return; // Duplicate check

            const isUrl = urlPattern.test(item);
            // Allow any valid HTTP/HTTPS URL, as yt-dlp supports hundreds of generic sites
            const isSupported = true; 

            const isValid = isUrl && isSupported;

            console.log(`[BatchInput] Item: ${item}, isUrl: ${isUrl}, isSupported: ${isSupported}, isValid: ${isValid}`);

            this.addChip(item, isValid);
            this.chips.add(item);
            addedCount++;
        });

        if (addedCount > 0 && this.onUpdate) {
            this.onUpdate(Array.from(this.chips));
        }

        this.updateEmptyState();
    }

    addChip(text, isValid) {
        const chip = document.createElement('div');
        chip.className = `url-chip ${isValid ? 'valid' : 'invalid'}`;
        chip.innerHTML = `
            <span class="chip-icon">${isValid ? '🔗' : '⚠️'}</span>
            <span class="chip-text">${text}</span>
            <button class="chip-remove">×</button>
        `;

        chip.querySelector('.chip-remove').addEventListener('click', () => {
            this.chips.delete(text);
            chip.remove();
            this.updateEmptyState();
            if (this.onUpdate) this.onUpdate(Array.from(this.chips));
        });

        // Insert before the input
        this.container.insertBefore(chip, this.input);
    }

    removeLastChip() {
        const lastChip = this.container.querySelector('.url-chip:last-of-type');
        if (lastChip) {
            const text = lastChip.querySelector('.chip-text').textContent;
            this.chips.delete(text);
            lastChip.remove();
            this.updateEmptyState();
            if (this.onUpdate) this.onUpdate(Array.from(this.chips));
        }
    }

    updateEmptyState() {
        const emptyTip = document.getElementById('batch-empty-tip');
        const clearBtn = document.getElementById('btn-clear-batch-input');
        const hasChips = this.chips.size > 0;

        if (emptyTip) {
            emptyTip.style.display = !hasChips && this.input.value === '' ? 'flex' : 'none';
        }

        // 🆕 显示/隐藏清空按钮
        if (clearBtn) {
            clearBtn.style.display = hasChips ? 'block' : 'none';
        }
    }

    getUrls() {
        return Array.from(this.chips);
    }

    clear() {
        this.chips.clear();
        const chips = this.container.querySelectorAll('.url-chip');
        chips.forEach(c => c.remove());
        this.updateEmptyState();
    }

    // 🆕 绑定清空按钮事件（由 BatchManager 调用）
    bindClearButton() {
        const clearBtn = document.getElementById('btn-clear-batch-input');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clear();
                window.app?.showToast(window.i18n?.t('batch.inputCleared') || 'Input cleared', 'info');
            });
        }
    }
}

window.BatchInputManager = BatchInputManager;
