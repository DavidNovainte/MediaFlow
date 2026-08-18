/**
 * SubtitleUISettings.js
 * 
 * 专门处理 UI 随设置改变而联动的逻辑（如输入框显隐、按钮文本切换）：
 * 1. 同步长句处理策略 UI 状态
 * 2. 同步字幕输入模式 (单语/双语) UI
 * 3. 动态更新 AI 翻译/增强按钮的名称
 */

class SubtitleUISettings extends window.SubtitleUIBase {
    constructor(flow) {
        super(flow);

        // 绑定自身方法
        this.bindEvents = this.bindEvents.bind(this);
        this.handleFixedTranslationInput = this.handleFixedTranslationInput.bind(this);
    }

    translateOrFallback(key, fallback, params) {
        const translated = window.i18n?.t?.(key, params);
        const resolved = translated && translated !== key ? translated : fallback;
        if (!params || typeof resolved !== 'string') {
            return resolved;
        }

        return Object.entries(params).reduce(
            (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
            resolved
        );
    }

    bindEvents() {
        // AI 服务设置变化，可能需要更新翻译按钮的文案
        const llmProviderSelect = document.getElementById('translation-engine');
        if (llmProviderSelect) {
            llmProviderSelect.addEventListener('change', () => {
                this.updateAIButtonText();
            });
        }

        // 初始化一次
        this.updateLengthStrategyUI();
        this.updateAIButtonText();
        this.bindFixedTranslationEvents();
        this.bindDubAdaptationEvents();
        this.renderFixedTranslations(this.flow.preferenceManager?.get('fixedTranslations') || []);
        this.syncFixedTranslationEditorState();
        this.updateDubAdaptationUI();
    }

    bindDubAdaptationEvents() {
        ['dub-adaptation-mode', 'dub-auto-compress', 'dub-auto-speedup', 'dub-allow-gap-extension'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => {
                this.updateDubAdaptationUI();
            });
        });
    }

    getDubModeMeta(mode = 'off') {
        switch (mode) {
        case 'balanced':
            return {
                description: this.translateOrFallback(
                    'subtitle.dubbing.modes.balanced',
                    'Default mode. Mild overflow prefers sentence splitting, light compression, and slight speed-up only when needed.'
                ),
                lockAdvanced: false
            };
        case 'strict':
            return {
                description: this.translateOrFallback(
                    'subtitle.dubbing.modes.strict',
                    'Stay closer to the original subtitle timing window. Compression is more aggressive and timing risks are surfaced earlier.'
                ),
                lockAdvanced: false
            };
        case 'preserve':
            return {
                description: this.translateOrFallback(
                    'subtitle.dubbing.modes.preserve',
                    'Preserve meaning first. The system avoids strong compression and only applies limited speed-up to reduce severe overflow.'
                ),
                lockAdvanced: true
            };
        default:
            return {
                description: this.translateOrFallback(
                    'subtitle.dubbing.modes.off',
                    'When disabled, the system will not rewrite or adapt translated text specifically for dubbing.'
                ),
                lockAdvanced: false
            };
        }
    }

    focusDubStatusPanel({ activateTab = true, pulse = true } = {}) {
        const panel = document.getElementById('dub-status-panel');
        if (!panel) return;

        if (activateTab) {
            const mainLayout = document.querySelector('.subtitle-main-layout');
            if (mainLayout && !mainLayout.classList.contains('inspector-active')) {
                mainLayout.classList.add('inspector-active');
                this.flow.uiManager?.persistInspectorState?.({ inspectorVisible: true });
            }
            this.flow.uiManager?.activateTab?.('tab-process');
        }

        this.refreshDubStatusPanel();

        if (pulse) {
            panel.classList.remove('dub-status-panel-pulse');
            void panel.offsetWidth;
            panel.classList.add('dub-status-panel-pulse');
        }

        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    refreshDubStatusPanel() {
        const panel = document.getElementById('dub-status-panel');
        const title = document.getElementById('dub-status-title');
        const desc = document.getElementById('dub-status-description');
        const statDuration = document.getElementById('dub-status-duration');
        const statBorrow = document.getElementById('dub-status-borrow');
        const statRatio = document.getElementById('dub-status-ratio');
        const segment = document.getElementById('dub-status-segmentation');
        const source = document.getElementById('dub-status-source');
        const adapted = document.getElementById('dub-status-adapted');

        if (!panel || !title || !desc || !statDuration || !statBorrow || !statRatio || !segment || !source || !adapted) {
            return;
        }

        const mode = document.getElementById('dub-adaptation-mode')?.value || 'off';
        if (mode === 'off') {
            panel.dataset.state = 'neutral';
            title.textContent = this.translateOrFallback('subtitle.dubbing.panel.off.title', 'Dubbing adaptation is off');
            desc.textContent = this.translateOrFallback(
                'subtitle.dubbing.panel.off.description',
                'When enabled, the system can compress long translations, borrow nearby gaps, and combine that with slight speech-rate adjustments.'
            );
            statDuration.textContent = this.translateOrFallback('subtitle.dubbing.panel.off.duration', 'Disabled');
            statBorrow.textContent = this.translateOrFallback('subtitle.dubbing.panel.off.borrow', 'Off');
            statRatio.textContent = '--';
            segment.textContent = this.translateOrFallback(
                'subtitle.dubbing.panel.off.segment',
                'Once enabled, this area will show whether the current line is split into multiple speech segments and how much pause is reserved inside it.'
            );
            source.textContent = this.translateOrFallback(
                'subtitle.dubbing.panel.off.source',
                'Translated text is not being rewritten specifically for dubbing right now.'
            );
            adapted.textContent = this.translateOrFallback(
                'subtitle.dubbing.panel.off.adapted',
                'Switch to Balanced or Strict mode to see the adaptation result for the current subtitle here.'
            );
            return;
        }

        const activeIndex = this.flow.editor?.activeSubtitleIndex ?? -1;
        const subtitle = activeIndex >= 0 ? this.flow.editor?.subtitles?.[activeIndex] : null;
        const state = this.flow.dubAdapter?.getInspectorState?.(subtitle) || {
            hasSubtitle: false,
            title: this.translateOrFallback('subtitle.dubbing.panel.empty.title', 'No subtitle selected'),
            description: this.translateOrFallback('subtitle.dubbing.panel.empty.description', 'Select a subtitle to see its dubbing adaptation details here.')
        };

        panel.dataset.state = state.tone || 'neutral';
        title.textContent = state.title;
        desc.textContent = state.description;
        statDuration.textContent = state.durationText || this.translateOrFallback('subtitle.dubbing.panel.stats.not_calculated', 'Not calculated');
        statBorrow.textContent = state.borrowText || '0.00s';
        statRatio.textContent = state.ratioText || '--';
        segment.textContent = state.segmentText || this.translateOrFallback('subtitle.dubbing.segment.single', 'Currently using a single dubbed segment with no extra speech splitting.');
        source.textContent = state.sourceText || this.translateOrFallback('subtitle.dubbing.panel.stats.no_source', 'No translated text is available to show.');
        adapted.textContent = state.dubText || this.translateOrFallback('subtitle.dubbing.panel.stats.no_dub_text', 'No dubbing-ready text has been generated yet.');
    }

    bindFixedTranslationEvents() {
        document.getElementById('btn-add-fixed-translation')?.addEventListener('click', () => {
            const entries = this.getFixedTranslationEntriesFromUI();
            entries.push({ source: '', target: '' });
            this.renderFixedTranslations(entries);
            this.persistFixedTranslations();
            const lastInput = document.querySelector('#fixed-translation-list .fixed-translation-row:last-child .fixed-translation-source');
            lastInput?.focus();
        });

        document.getElementById('fixed-translations-enabled')?.addEventListener('change', () => {
            this.syncFixedTranslationEditorState();
        });

        document.getElementById('btn-toggle-fixed-translation-bulk')?.addEventListener('click', () => {
            document.getElementById('fixed-translation-bulk')?.classList.toggle('hidden');
        });

        document.getElementById('btn-apply-fixed-translation-bulk')?.addEventListener('click', () => {
            const textarea = document.getElementById('fixed-translation-bulk-input');
            if (!textarea) return;

            const imported = this.parseFixedTranslationBulk(textarea.value);
            if (!imported.length) {
                window.app?.showToast?.(this.translateOrFallback('subtitle.fixedTranslations.import_none', 'No fixed translation entries were detected for import.'), 'warning');
                return;
            }

            const mergedMap = new Map();
            [...this.getFixedTranslationEntriesFromUI(), ...imported].forEach((entry) => {
                const source = String(entry.source || '').trim();
                const target = String(entry.target || '').trim();
                if (!source || !target) return;
                mergedMap.set(source, { source, target });
            });

            const merged = Array.from(mergedMap.values());
            this.renderFixedTranslations(merged);
            this.persistFixedTranslations();
            textarea.value = '';
            document.getElementById('fixed-translation-bulk')?.classList.add('hidden');
            window.app?.showToast?.(
                this.translateOrFallback('subtitle.fixedTranslations.import_success', 'Imported {count} fixed translations.', {
                    count: imported.length
                }),
                'success'
            );
        });

        document.getElementById('fixed-translation-list')?.addEventListener('input', this.handleFixedTranslationInput);
        document.getElementById('fixed-translation-list')?.addEventListener('change', this.handleFixedTranslationInput);
        document.getElementById('fixed-translation-list')?.addEventListener('click', (event) => {
            const removeButton = this.closest(event.target, '.fixed-translation-remove');
            if (!removeButton) return;

            removeButton.closest('.fixed-translation-row')?.remove();
            this.persistFixedTranslations();
            this.syncFixedTranslationEmptyState();
        });
    }

    handleFixedTranslationInput() {
        this.persistFixedTranslations();
    }

    parseFixedTranslationBulk(rawText = '') {
        return String(rawText || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const parts = line.split(/=>|->|=|\t/).map((part) => part.trim()).filter(Boolean);
                if (parts.length < 2) return null;
                return {
                    source: parts[0],
                    target: parts.slice(1).join(' ')
                };
            })
            .filter(Boolean);
    }

    getFixedTranslationEntriesFromUI() {
        return Array.from(document.querySelectorAll('#fixed-translation-list .fixed-translation-row')).map((row) => ({
            source: row.querySelector('.fixed-translation-source')?.value?.trim() || '',
            target: row.querySelector('.fixed-translation-target')?.value?.trim() || ''
        })).filter((entry) => entry.source && entry.target);
    }

    renderFixedTranslations(entries = []) {
        const list = document.getElementById('fixed-translation-list');
        if (!list) return;

        list.innerHTML = entries.map((entry) => `
            <div class="fixed-translation-row">
                <input type="text" class="setting-input-pro fixed-translation-input fixed-translation-source" placeholder="${this.escapeAttribute(this.translateOrFallback('subtitle.fixedTranslations.source_placeholder', 'Source term / original text'))}" value="${this.escapeAttribute(entry.source || '')}">
                <input type="text" class="setting-input-pro fixed-translation-input fixed-translation-target" placeholder="${this.escapeAttribute(this.translateOrFallback('subtitle.fixedTranslations.target_placeholder', 'Preferred translation'))}" value="${this.escapeAttribute(entry.target || '')}">
                <button class="btn-secondary-pro btn-sm fixed-translation-remove" type="button" title="${this.escapeAttribute(this.translateOrFallback('subtitle.fixedTranslations.remove_title', 'Remove entry'))}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        this.syncFixedTranslationEmptyState();
        this.syncFixedTranslationCount();
    }

    escapeAttribute(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    syncFixedTranslationEmptyState() {
        const empty = document.getElementById('fixed-translation-empty');
        const count = this.getFixedTranslationEntriesFromUI().length;
        if (empty) {
            empty.style.display = count ? 'none' : 'block';
        }
        this.syncFixedTranslationCount();
    }

    syncFixedTranslationCount() {
        const badge = document.getElementById('fixed-translation-count');
        if (badge) {
            badge.textContent = this.translateOrFallback('subtitle.fixedTranslations.count', '{count} entries', {
                count: this.getFixedTranslationEntriesFromUI().length
            });
        }
    }

    syncFixedTranslationEditorState() {
        const editor = document.getElementById('fixed-translation-editor');
        const enabled = !!document.getElementById('fixed-translations-enabled')?.checked;
        if (!editor) return;

        editor.classList.toggle('is-disabled', !enabled);
        editor.querySelectorAll('input, textarea, button').forEach((element) => {
            element.disabled = !enabled;
        });
    }

    persistFixedTranslations() {
        const entries = this.getFixedTranslationEntriesFromUI();
        this.flow.preferenceManager?.set?.('fixedTranslations', entries);
        this.syncFixedTranslationEmptyState();
    }

    // ----------------- 设置同步 (Settings Sync) -----------------
    /**
     * 更新输入框模式相关的 UI
     * @param {string} mode 'bilingual', 'cn-only', 'en-only'
     */
    updateInputModeUI(mode) {
        const itemContainer = document.getElementById('subtitle-list');
        if (!itemContainer) return;

        itemContainer.classList.remove('mode-bilingual', 'mode-cn-only', 'mode-en-only');
        itemContainer.classList.add(`mode-${mode}`);

        const btns = document.querySelectorAll('.mode-toggle-btn');
        btns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }

    /**
     * 当模式改变时的级联反应
     * @param {string} mode 
     */
    onSubtitleModeChange(mode) {
        this.updateInputModeUI(mode);
        this.flow.videoSettings.inputMode = mode;

        const mergeMethodGroup = document.getElementById('merge-method-group');
        const secondarySubtitleGroup = document.getElementById('secondary-subtitle-group');

        const modeBilingualRadio = document.getElementById('mode-bilingual');
        const modeCnOnlyRadio = document.getElementById('mode-cn-only');
        const modeEnOnlyRadio = document.getElementById('mode-en-only');

        if (mode === 'bilingual') {
            if (modeBilingualRadio) modeBilingualRadio.checked = true;
            if (mergeMethodGroup) mergeMethodGroup.parentElement.style.display = 'block';
            if (secondarySubtitleGroup) secondarySubtitleGroup.parentElement.style.display = 'block';
        } else {
            if (mode === 'cn-only' && modeCnOnlyRadio) modeCnOnlyRadio.checked = true;
            if (mode === 'en-only' && modeEnOnlyRadio) modeEnOnlyRadio.checked = true;

            if (mergeMethodGroup) mergeMethodGroup.parentElement.style.display = 'none';
            if (secondarySubtitleGroup) secondarySubtitleGroup.parentElement.style.display = 'none';
        }
    }

    /**
     * AI 识别按钮文案：
     * - 按钮本体固定为中性「智能识别」，避免看起来像写死某个厂商
     * - 实际 provider 来自「翻译引擎」下拉（#translation-engine），写入 title 提示
     */
    updateAIButtonText() {
        const aiProcessBtn = document.getElementById('btn-ai-process');
        const providerOptions = document.getElementById('translation-engine');
        if (!aiProcessBtn || !providerOptions) return;

        const selected = providerOptions.options[providerOptions.selectedIndex];
        const providerId = providerOptions.value || 'groq';
        // Prefer full option label, fall back to id
        const engineLabel = (selected?.textContent || selected?.text || providerId)
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\s*\(.*\)\s*$/, '') // drop parenthetical suffix for shorter tip
            || providerId;

        const labelSpan = aiProcessBtn.querySelector('span[data-i18n="subtitle.actions.aiProcess"]')
            || aiProcessBtn.querySelector('span');
        if (labelSpan) {
            // Neutral label — never bake provider brand into the button face
            labelSpan.textContent = this.translateOrFallback(
                'subtitle.actions.aiProcess',
                '智能识别'
            );
        }

        const tip = this.translateOrFallback(
            'subtitle.actions.aiProcess_tip_with_engine',
            '使用当前引擎（{engine}）自动分段识别与翻译。可在详细设置 → 翻译引擎中切换。',
            { engine: engineLabel }
        );
        aiProcessBtn.setAttribute('title', tip);
        aiProcessBtn.setAttribute('data-i18n-title', ''); // avoid i18n clobbering dynamic tip
        aiProcessBtn.dataset.engine = providerId;
    }

    /**
     * 更新长句处理策略 UI
     */
    updateLengthStrategyUI() {
        const handleLongSubsCheckbox = document.getElementById('length-optimize');
        const lengthStrategyOptions = document.getElementById('length-settings-row');

        if (handleLongSubsCheckbox && lengthStrategyOptions) {
            lengthStrategyOptions.style.display = handleLongSubsCheckbox.checked ? 'block' : 'none';
        }
    }

    updateDubAdaptationUI() {
        const mode = document.getElementById('dub-adaptation-mode')?.value || 'off';
        const advanced = document.getElementById('dub-adaptation-advanced');
        const statusPanel = document.getElementById('dub-status-panel');
        const modeHint = document.getElementById('dub-adaptation-mode-hint');
        const modeMeta = this.getDubModeMeta(mode);
        if (advanced) {
            advanced.style.display = mode === 'off' ? 'none' : 'block';
        }
        const lockTip = this.translateOrFallback(
            'subtitle.dubbing.controls.lockedByPreserve',
            '「保留原意」模式下已关闭此项（避免压缩/加速改变文意）'
        );

        ['dub-auto-compress', 'dub-auto-speedup', 'dub-allow-gap-extension'].forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            const row = element.closest('.ctrl-row-pro');

            if (modeMeta.lockAdvanced && (id === 'dub-auto-compress' || id === 'dub-auto-speedup')) {
                element.checked = false;
                element.disabled = true;
                element.title = lockTip;
                row?.classList.add('is-locked');
                row?.setAttribute('title', lockTip);
                return;
            }

            element.disabled = false;
            element.removeAttribute('title');
            row?.classList.remove('is-locked');
            row?.removeAttribute('title');
        });
        if (modeHint) {
            modeHint.textContent = modeMeta.description;
        }
        if (statusPanel) {
            statusPanel.style.display = 'grid';
        }
        this.refreshDubStatusPanel();
    }
}

window.SubtitleUISettings = SubtitleUISettings;
