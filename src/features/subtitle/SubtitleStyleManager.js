class SubtitleStyleManager {
    constructor(flow) {
        this.flow = flow;

        // Modules
        this.templateManager = new window.SubtitleTemplateManager(this);
        this.previewHandler = new window.SubtitlePreviewHandler(this);

        // Style State
        this.styleTemplates = {
            'default': {
                name: window.i18n.t('subtitle.style.templates.default'),
                fontFamily: 'Microsoft YaHei',
                fontSize: 32, // 基准字号调优
                fontBold: false,
                fontItalic: false,
                fontColor: '#ffffff',
                outlineColor: '#000000',
                outlineWidth: 0,
                enableBackground: false,
                bgColor: '#000000',
                bgOpacity: 50,
                enableKaraoke: false,
                karaokeStyle: 'highlight',
                karaokeColor: '#3d6eb8',
                position: '2',
                marginV: 8,  // 8% 的边距在 720p 更加和谐
                marginH: 50,
                blurOriginal: false,
                blurMasks: [],
                strokes: [],
                shadows: []
            },
            'yellow': {
                name: window.i18n.t('subtitle.style.templates.yellow'),
                fontFamily: 'SimHei',
                fontSize: 36,
                fontBold: true,
                fontItalic: false,
                fontColor: '#ffff00',
                outlineColor: '#000000',
                outlineWidth: 0,
                enableBackground: false,
                bgColor: '#000000',
                bgOpacity: 60,
                enableKaraoke: false,
                karaokeStyle: 'highlight',
                karaokeColor: '#3d6eb8',
                position: '2',
                marginV: 8,
                marginH: 50,
                blurOriginal: false,
                blurMasks: [],
                strokes: [],
                shadows: []
            },
            'cinema': {
                name: window.i18n.t('subtitle.style.templates.cinema'),
                fontFamily: 'SimSun',
                fontSize: 28,
                fontBold: false,
                fontItalic: true,
                fontColor: '#ffffff',
                outlineColor: '#000000',
                outlineWidth: 0,
                enableBackground: false,
                bgColor: '#000000',
                bgOpacity: 60,
                enableKaraoke: false,
                karaokeStyle: 'highlight',
                karaokeColor: '#3d6eb8',
                position: '2',
                marginV: 10,
                marginH: 50,
                blurOriginal: false,
                blurMasks: [],
                strokes: [],
                shadows: []
            },
            'neon': {
                name: window.i18n.t('subtitle.settings.templates.neon'),
                fontFamily: 'Arial Black',
                fontSize: 34,
                fontBold: true,
                fontItalic: false,
                fontColor: '#00ffcc',
                outlineColor: '#000000',
                outlineWidth: 0,
                enableBackground: false,
                enableKaraoke: false,
                position: '2',
                marginV: 8,
                animation: 'popup',
                animationDuration: 300,
                strokes: [{ width: 2, color: '#000000', opacity: 100 }],
                shadows: [{ x: 4, y: 4, blur: 10, color: '#00ffcc' }]
            },
            'sweet': {
                name: window.i18n.t('subtitle.settings.templates.sweet'),
                fontFamily: 'Microsoft YaHei',
                fontSize: 32,
                fontBold: true,
                fontColor: '#ff66aa',
                outlineColor: '#ffffff',
                outlineWidth: 2,
                enableBackground: false,
                enableKaraoke: false,
                position: '2',
                marginV: 8,
                animation: 'popup',
                animationDuration: 400,
                strokes: [{ width: 2, color: '#ffffff', opacity: 100 }],
                shadows: [{ x: 2, y: 2, blur: 5, color: '#ffcce6' }]
            },
            'vibrant': {
                name: window.i18n.t('subtitle.settings.templates.vibrant'),
                fontFamily: 'Impact',
                fontSize: 38,
                fontBold: true,
                fontColor: '#ffffff',
                outlineColor: '#0044ff',
                outlineWidth: 0,
                enableBackground: false,
                enableKaraoke: false,
                position: '2',
                marginV: 8,
                animation: 'fade',
                animationDuration: 300,
                strokes: [{ width: 2, color: '#0044ff', opacity: 100 }],
                shadows: [{ x: 5, y: 5, blur: 0, color: 'rgba(0,0,0,0.5)' }]
            }
        };

        this.currentStyle = this.cloneStyle(this.styleTemplates['default']);
    }

    cloneStyle(style = {}) {
        const baseStyle = this.styleTemplates?.['default']
            ? { ...this.styleTemplates['default'] }
            : {};
        const source = style || {};
        const cloneArray = (value) => Array.isArray(value)
            ? value.map(item => (item && typeof item === 'object' ? { ...item } : item))
            : [];

        const normalized = {
            ...baseStyle,
            ...source
        };

        normalized.strokes = cloneArray(source.strokes ?? baseStyle.strokes);
        normalized.shadows = cloneArray(source.shadows ?? baseStyle.shadows);
        normalized.blurMasks = cloneArray(source.blurMasks ?? baseStyle.blurMasks);

        if (source.fontSize && source.fontSizeLocked === undefined) {
            normalized.fontSizeLocked = true;
        }

        if (normalized.marginV === 40 && normalized.position === '2') {
            normalized.marginV = 8;
        }

        return normalized;
    }

    saveCurrentStylePreference() {
        if (!this.flow?.preferenceManager) return;
        this.flow.preferenceManager.set('visualStyle', this.cloneStyle(this.currentStyle));
    }

    init() {
        this.cacheElements();

        // 尝试从持久化存储恢复样式
        if (this.flow.preferenceManager) {
            const savedStyle = this.flow.preferenceManager.get('visualStyle');
            if (savedStyle) {
                this.currentStyle = this.cloneStyle(savedStyle);
                console.log('[SubtitleStyleManager] Restored visual styles from preferences');
            }
        }

        // Init Sub-modules
        this.templateManager.init(this.elements);
        this.previewHandler.init(this.elements);

        this.injectAnimationUI();
        this.bindAnimationEvents();
        this.bindEvents();
        this.templateManager.loadCustomTemplates();

        this.applyStyleToUI();

        // 🟢 监听语言变更事件，刷新 UI
        window.addEventListener('languageChanged', () => {
            this.onLanguageChanged();
        });

        // 🟢 进阶交互：自动在后台预加载系统字体
        // 允许静默执行，这样用户进入页面时无需手动点击加载
        setTimeout(() => this.loadSystemFonts(true), 100);
    }

    onLanguageChanged() {
        console.log('[SubtitleStyleManager] Language changed, refreshing UI...');
        
        // 1. Refresh built-in template display names from current locale
        if (this.styleTemplates) {
            this.styleTemplates.default.name = window.i18n.t('subtitle.settings.templates.default');
            this.styleTemplates.yellow.name = window.i18n.t('subtitle.settings.templates.yellow');
            this.styleTemplates.cinema.name = window.i18n.t('subtitle.settings.templates.cinema');
            this.styleTemplates.neon.name = window.i18n.t('subtitle.settings.templates.neon');
            this.styleTemplates.sweet.name = window.i18n.t('subtitle.settings.templates.sweet');
            this.styleTemplates.vibrant.name = window.i18n.t('subtitle.settings.templates.vibrant');
        }

        // Rebuild preset <select> so options never stick in the previous language
        this.templateManager?.refreshTemplateSelect?.();

        // 2. 重新注入/刷新动态 UI
        if (window.i18n) {
            window.i18n.updateUI(this.elements.styleDetails);
        }

        // Select options with data-i18n
        if (this.animation) {
            Array.from(this.animation.options).forEach(opt => {
                const key = opt.getAttribute('data-i18n');
                if (key) opt.textContent = window.i18n.t(key);
            });
        }
        this.applyKaraokeI18n();

        // 3. 额外处理动态注入的按钮 (如智能避让)
        const avoidanceBtn = document.getElementById('btn-smart-avoid');
        if (avoidanceBtn && window.i18n) {
            window.i18n.updateUI(avoidanceBtn);
            avoidanceBtn.title = window.i18n.t('subtitle.style.auto_avoid_title');
        }
    }

    cacheElements() {
        // Cache all elements into an object to pass to sub-modules
        this.elements = {
            styleTemplate: document.getElementById('style-template'),
            btnSaveTemplate: document.getElementById('btn-save-template'),
            btnDeleteTemplate: document.getElementById('btn-delete-template'),
            styleDetails: document.getElementById('tab-style'),
            fontFamily: document.getElementById('font-family'),
            fontSize: document.getElementById('font-size'),
            btnBold: document.getElementById('btn-bold'),
            btnItalic: document.getElementById('btn-italic'),
            fontColor: document.getElementById('font-color'),
            outlineColor: document.getElementById('outline-color'),
            outlineWidth: document.getElementById('outline-width'),
            enableBackground: document.getElementById('enable-background'),
            bgSettings: document.getElementById('bg-settings'),
            bgColor: document.getElementById('bg-color'),
            bgOpacity: document.getElementById('bg-opacity'),
            enableKaraoke: document.getElementById('enable-karaoke'),
            karaokeSettings: document.getElementById('karaoke-settings'),
            karaokeStyle: document.getElementById('karaoke-style'),
            karaokeColor: document.getElementById('karaoke-color'),
            karaokeStyleLabel: document.querySelector('#karaoke-settings .ctrl-row-pro .ctrl-label'),
            bgOpacityValue: document.getElementById('bg-opacity-value'),
            subtitlePosition: document.getElementById('subtitle-position'),
            marginV: document.getElementById('margin-v'),
            marginH: document.getElementById('margin-h'),
            marginVValue: document.getElementById('margin-v-value'),
            marginHValue: document.getElementById('margin-h-value'),
            showPreview: document.getElementById('show-preview'),
            subtitleOverlay: document.getElementById('subtitle-overlay'),
            btnExportPreset: document.getElementById('btn-export-template') || document.getElementById('btn-export-preset'),
            btnImportPreset: document.getElementById('btn-import-template') || document.getElementById('btn-import-preset'),
            btnAddEffect: document.getElementById('btn-add-effect'),
            effectsList: document.getElementById('effects-list'),
            btnRefreshFonts: document.getElementById('btn-refresh-fonts'),
            btnAddBlurMask: document.getElementById('btn-add-blur-mask'),
            blurOriginal: document.getElementById('blur-original'),
            blurSettings: document.getElementById('blur-settings'),
            blurMasksList: document.getElementById('blur-masks-list'),
            blurEmptyHint: document.getElementById('blur-empty-hint'),
            letterSpacing: document.getElementById('letter-spacing'),
            lineHeight: document.getElementById('line-height'),
            letterSpacingValue: document.getElementById('letter-spacing-value'),
            lineHeightValue: document.getElementById('line-height-value')
        };

        // Also assign to 'this' for internal use in bindStyleInputs
        Object.assign(this, this.elements);
    }

    bindEvents() {
        // Bind Inputs
        try {
            this.bindStyleInputs();
        } catch (e) { console.error('Bind Style Inputs Failed:', e); }

        // Position/Margin Badge Displays
        this.marginV?.addEventListener('input', () => {
            if (this.marginVValue) this.marginVValue.textContent = this.marginV.value;
        });

        // 🟢 核心新增：监听视频加载完成，自动调整字号
        window.addEventListener('videoLoaded', async (e) => {
            console.log('[SubtitleStyleManager] Video loaded, calculating adaptive style...');
            const { width, height } = e.detail;
            if (width && height) {
                this.applyAdaptiveStyle(width, height);
            }
        });

        this.bgOpacity?.addEventListener('input', () => {
            if (this.bgOpacityValue) this.bgOpacityValue.textContent = this.bgOpacity.value + '%';
        });

        this.letterSpacing?.addEventListener('input', () => {
            if (this.letterSpacingValue) this.letterSpacingValue.textContent = this.letterSpacing.value;
        });

        this.lineHeight?.addEventListener('input', () => {
            if (this.lineHeightValue) this.lineHeightValue.textContent = this.lineHeight.value;
        });

        // Preset Events
        if (this.btnExportPreset) {
            this.btnExportPreset.addEventListener('click', () => this.exportPreset());
        }
        if (this.btnImportPreset) {
            this.btnImportPreset.addEventListener('click', () => this.importPreset());
        }

        // Font Refresh
        if (this.btnRefreshFonts) {
            this.btnRefreshFonts.addEventListener('click', () => this.loadSystemFonts());
        }

        // Effect Events
        if (this.btnAddEffect) {
            this.btnAddEffect.addEventListener('click', () => this.addEffect());
        }

        if (this.btnAddBlurMask) {
            this.btnAddBlurMask.addEventListener('click', () => this.addBlurMask());
        }
    }

    // Delegates
    updateSubtitlePreview() {
        this.previewHandler?.invalidateRenderCache?.();
        this.previewHandler.updateSubtitlePreview();
    }

    syncCurrentStyleToTrack() {
        if (!this.currentStyle || !this.flow) return;
        this.flow.currentStyle = this.currentStyle;
    }

    updateStyle(updates) {
        if (!this.currentStyle) return;
        this.currentStyle = this.cloneStyle(this.currentStyle);

        // 确保 strokes 基础结构存在，并同步旧字段
        if (updates.outlineColor || updates.outlineWidth !== undefined) {
            if (!this.currentStyle.strokes) this.currentStyle.strokes = [];
            if (this.currentStyle.strokes.length === 0) {
                this.currentStyle.strokes.push({ width: 0, color: '#000000', opacity: 100 });
            }
            if (updates.outlineColor) this.currentStyle.strokes[0].color = updates.outlineColor;
            if (updates.outlineWidth !== undefined) this.currentStyle.strokes[0].width = updates.outlineWidth;
        }

        Object.assign(this.currentStyle, updates);

        // 如果手动修改了样式，自动切换为“自定义”模板标识
        if (this.templateManager && this.templateManager.styleTemplate && this.templateManager.styleTemplate.value !== 'custom') {
            this.templateManager.styleTemplate.value = 'custom';
            this.templateManager.updateTemplateButtons();
        }

        // 核心同步：通过 Flow Setter 同步到当前活跃轨道
        if (this.flow) {
            this.syncCurrentStyleToTrack();
            this.saveCurrentStylePreference();
        }

        this.updateSubtitlePreview();
    }

    bindStyleInputs() {
        const wrapperUpdate = (key, value) => {
            const updates = { [key]: value };
            if (key === 'fontSize') {
                updates.fontSizeLocked = true;
            }
            this.updateStyle(updates);
        };

        const updateColorPickerBG = (el, color) => {
            const wrapper = el.parentElement;
            if (wrapper && wrapper.classList.contains('color-picker-pro')) {
                wrapper.style.backgroundColor = color;
                // Auto contrast border check? Maybe simpler just keep existing border
                // wrapper.style.borderColor = color; 
            }
        };

        const bind = (el, key, type = 'text') => {
            if (!el) return;
            const event = (type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';

            // Initial BG set
            if (el.type === 'color') updateColorPickerBG(el, el.value);

            el.addEventListener(event, (e) => {
                let val = type === 'checkbox' ? e.target.checked : e.target.value;

                // Special handling for "load-system" in font-family
                if (key === 'fontFamily' && val === 'load-system') {
                    this.loadSystemFonts();
                    return;
                }

                if (type === 'number') val = parseInt(val);

                if (el.type === 'color') updateColorPickerBG(el, val);

                wrapperUpdate(key, val);
            });
        };

        bind(this.fontFamily, 'fontFamily');
        bind(this.fontSize, 'fontSize', 'number');
        bind(this.fontColor, 'fontColor');

        // Legacy bindings (will update the first stroke/shadow for backward compatibility)
        if (this.outlineColor) {
            updateColorPickerBG(this.outlineColor, this.outlineColor.value);
            this.outlineColor.addEventListener('input', (e) => {
                const val = e.target.value;
                updateColorPickerBG(this.outlineColor, val);
                if (!this.currentStyle.strokes) this.currentStyle.strokes = [];
                if (this.currentStyle.strokes.length === 0) this.currentStyle.strokes.push({ width: 2, color: '#000000', opacity: 100 });
                this.currentStyle.strokes[0].color = val;
                this.syncCurrentStyleToTrack();
                this.updateSubtitlePreview();
                this.saveCurrentStylePreference();
            });
        }
        if (this.outlineWidth) {
            this.outlineWidth.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                if (!this.currentStyle.strokes) this.currentStyle.strokes = [];
                if (this.currentStyle.strokes.length === 0) this.currentStyle.strokes.push({ width: 2, color: '#000000', opacity: 100 });
                this.currentStyle.strokes[0].width = val;
                this.syncCurrentStyleToTrack();
                this.updateSubtitlePreview();
                this.saveCurrentStylePreference();
            });
        }

        bind(this.bgColor, 'bgColor');
        bind(this.bgOpacity, 'bgOpacity', 'number');
        bind(this.subtitlePosition, 'position');
        bind(this.marginV, 'marginV', 'number');
        bind(this.marginH, 'marginH', 'number');
        bind(this.letterSpacing, 'letterSpacing', 'number');
        bind(this.lineHeight, 'lineHeight', 'number');

        // Karaoke Binding
        bind(this.enableKaraoke, 'enableKaraoke', 'checkbox');
        bind(this.karaokeStyle, 'karaokeStyle');
        bind(this.karaokeColor, 'karaokeColor');

        // Animation Binding
        bind(this.animation, 'animation');
        // NOTE: animationDuration is handled exclusively by bindAnimationEvents() with proper
        // seconds→ms conversion. Do NOT add a bind() here — it fires last and overwrites with
        // parseInt("0.3") = 0, killing the animation duration.

        if (this.enableBackground) {
            this.enableBackground.addEventListener('change', (e) => {
                wrapperUpdate('enableBackground', e.target.checked);
                if (this.bgSettings) {
                    this.bgSettings.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        // Karaoke Settings Toggle
        if (this.enableKaraoke) {
            this.enableKaraoke.addEventListener('change', (e) => {
                if (this.karaokeSettings) {
                    this.karaokeSettings.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        if (this.btnBold) {
            this.btnBold.addEventListener('click', () => {
                const newVal = !this.currentStyle.fontBold;
                this.btnBold.classList.toggle('active', newVal);
                wrapperUpdate('fontBold', newVal);
            });
        }

        if (this.btnItalic) {
            this.btnItalic.addEventListener('click', () => {
                const newVal = !this.currentStyle.fontItalic;
                this.btnItalic.classList.toggle('active', newVal);
                wrapperUpdate('fontItalic', newVal);
            });
        }

        // Blur Mask Bindings
        if (this.blurOriginal) {
            this.blurOriginal.addEventListener('change', (e) => {
                const checked = e.target.checked;

                // Update local and master state
                if (this.currentStyle) {
                    this.currentStyle.blurOriginal = checked;
                }

                // CRITICAL: Auto-create first mask ONLY when manually enabled if none exist
                if (checked && (!this.currentStyle.blurMasks || this.currentStyle.blurMasks.length === 0)) {
                    this.addBlurMask(); // addBlurMask includes renderBlurMasksList and updateSubtitlePreview
                } else {
                    this.renderBlurMasksList(); // Just refresh visibility/render
                }

                // If template isn't 'custom', set to custom since we changed a child property
                const tm = this.templateManager;
                if (tm && tm.styleTemplate && tm.styleTemplate.value !== 'custom') {
                    tm.styleTemplate.value = 'custom';
                    tm.updateTemplateButtons();
                }

                this.updateSubtitlePreview();
            });
        }
    }

    applyStyleToUI() {
        const s = this.currentStyle;
        if (!s) return;
        this.applyKaraokeI18n();

        // Ensure legacy compatibility
        if (!s.strokes) {
            s.strokes = [];
            if (s.outlineWidth > 0) {
                s.strokes.push({
                    color: s.outlineColor || '#000000',
                    width: s.outlineWidth,
                    opacity: 100
                });
            }
        }
        if (!s.shadows) s.shadows = [];

        if (this.fontFamily) this.fontFamily.value = s.fontFamily;
        if (this.fontSize) this.fontSize.value = s.fontSize;
        if (this.fontColor) this.fontColor.value = s.fontColor;

        // Sync basic inputs with first stroke layer
        if (this.outlineColor && s.strokes.length > 0) this.outlineColor.value = s.strokes[0].color;
        if (this.outlineWidth && s.strokes.length > 0) this.outlineWidth.value = s.strokes[0].width;

        if (this.enableBackground) {
            this.enableBackground.checked = !!s.enableBackground;
            if (this.bgSettings) this.bgSettings.style.display = s.enableBackground ? 'block' : 'none';
        }
        if (this.bgColor) this.bgColor.value = s.bgColor || '#000000';
        if (this.bgOpacity) {
            this.bgOpacity.value = s.bgOpacity || 50;
            if (this.bgOpacityValue) this.bgOpacityValue.textContent = (s.bgOpacity || 50) + '%';
        }

        if (this.enableKaraoke) {
            this.enableKaraoke.checked = !!s.enableKaraoke;
            if (this.karaokeSettings) this.karaokeSettings.style.display = s.enableKaraoke ? 'block' : 'none';
        }
        if (this.karaokeStyle) this.karaokeStyle.value = s.karaokeStyle || 'highlight';
        if (this.karaokeColor) this.karaokeColor.value = s.karaokeColor || '#3d6eb8';

        if (this.btnBold) this.btnBold.classList.toggle('active', !!s.fontBold);
        if (this.btnItalic) this.btnItalic.classList.toggle('active', !!s.fontItalic);
        if (this.subtitlePosition) this.subtitlePosition.value = s.position || '2';
        if (this.marginV) {
            this.marginV.value = (s.marginV !== undefined && s.marginV !== null) ? s.marginV : 8;
            if (this.marginVValue) this.marginVValue.textContent = this.marginV.value;
        }
        
        // --- Inject UI Elements ---
        this.injectAvoidanceUIOnce();
        this.injectAnimationUI();
        this.bindAnimationEvents();

        if (this.marginH) {
            this.marginH.value = (s.marginH !== undefined && s.marginH !== null) ? s.marginH : 50;
            if (this.marginHValue) this.marginHValue.textContent = this.marginH.value;
        }

        if (this.letterSpacing) {
            this.letterSpacing.value = s.letterSpacing || 0;
            if (this.letterSpacingValue) this.letterSpacingValue.textContent = this.letterSpacing.value;
        }

        if (this.lineHeight) this.lineHeight.value = s.lineHeight || 1.4;
        if (this.lineHeightValue) this.lineHeightValue.textContent = s.lineHeight || 1.4;

        if (this.fontWrap) this.fontWrap.checked = s.fontWrap !== false;

        // Sync Animation
        if (this.animation) this.animation.value = s.animation || 'none';
        if (this.animationDuration) {
            const durS = ((s.animationDuration || 300) / 1000).toFixed(1);
            this.animationDuration.value = durS;
            if (this.animationDurationInput) this.animationDurationInput.value = durS;
        }

        // Restore Blur State
        if (this.blurOriginal) {
            this.blurOriginal.checked = !!s.blurOriginal;
        }

        // Initially ensure visibility matches toggle
        if (this.blurSettings) {
            this.blurSettings.style.display = s.blurOriginal ? 'block' : 'none';
        }
        if (this.btnAddBlurMask) {
            this.btnAddBlurMask.style.display = s.blurOriginal ? 'flex' : 'none';
        }

        this.renderBlurMasksList();
        this.renderEffectsUI();
        this.updateSubtitlePreview();
    }

    applyKaraokeI18n() {
        if (this.karaokeStyleLabel) {
            this.karaokeStyleLabel.textContent = window.i18n?.t('subtitle.style.karaoke_style') || 'Karaoke Style';
        }

        if (!this.karaokeStyle) return;

        const optionLabels = {
            highlight: window.i18n?.t('subtitle.style.karaoke_style_highlight') || 'Word Capsule Highlight',
            adaptive: window.i18n?.t('subtitle.style.karaoke_style_adaptive') || 'Smart Adaptive',
            progress: window.i18n?.t('subtitle.style.karaoke_style_progress') || 'Full-Line Progress'
        };

        Array.from(this.karaokeStyle.options).forEach((option) => {
            option.textContent = optionLabels[option.value] || option.textContent;
        });
    }

    // ==================== Effects Management ====================

    addEffect() {
        if (!this.currentStyle.shadows) this.currentStyle.shadows = [];
        // Default to a visible shadow/glow
        this.currentStyle.shadows.push({
            color: '#000000',
            blur: 2,
            x: 2,
            y: 2
        });
        this.syncCurrentStyleToTrack();
        this.renderEffectsUI();
        this.updateSubtitlePreview();
        this.saveCurrentStylePreference();

        // Switch to custom template
        if (this.templateManager.styleTemplate && this.templateManager.styleTemplate.value !== 'custom') {
            this.templateManager.styleTemplate.value = 'custom';
            this.templateManager.updateTemplateButtons();
        }
    }

    removeEffect(index) {
        if (!this.currentStyle.shadows) return;
        this.currentStyle.shadows.splice(index, 1);
        this.syncCurrentStyleToTrack();
        this.renderEffectsUI();
        this.updateSubtitlePreview();
        this.saveCurrentStylePreference();

        // Switch to custom template
        if (this.templateManager.styleTemplate && this.templateManager.styleTemplate.value !== 'custom') {
            this.templateManager.styleTemplate.value = 'custom';
            this.templateManager.updateTemplateButtons();
        }
    }

    updateEffect(index, key, value) {
        if (!this.currentStyle.shadows || !this.currentStyle.shadows[index]) return;
        this.currentStyle.shadows[index][key] = value;
        this.syncCurrentStyleToTrack();
        this.updateSubtitlePreview();
        this.saveCurrentStylePreference();

        // Switch to custom template
        if (this.templateManager.styleTemplate && this.templateManager.styleTemplate.value !== 'custom') {
            this.templateManager.styleTemplate.value = 'custom';
            this.templateManager.updateTemplateButtons();
        }
    }

    renderEffectsUI() {
        const list = this.effectsList;
        if (!list) return;

        list.innerHTML = '';
        const shadows = this.currentStyle.shadows || [];

        shadows.forEach((shadow, index) => {
            const item = document.createElement('div');
            item.className = 'effect-item';

            // Color Picker
            const colorGroup = document.createElement('div');
            colorGroup.className = 'effect-color-wrapper';
            colorGroup.style.backgroundColor = shadow.color;

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'effect-color-input';
            colorInput.value = shadow.color;
            colorInput.title = 'Color';
            colorInput.oninput = (e) => {
                colorGroup.style.backgroundColor = e.target.value;
                this.updateEffect(index, 'color', e.target.value);
            };

            colorGroup.appendChild(colorInput);

            // Inputs Wrapper
            const inputsWrapper = document.createElement('div');
            inputsWrapper.className = 'effect-inputs';

            // Helper to create valid input group
            const createInputGroup = (label, key) => {
                const group = document.createElement('div');
                group.className = 'effect-input-group';

                const span = document.createElement('span');
                span.className = 'effect-label';
                span.textContent = label;

                const input = document.createElement('input');
                input.className = 'effect-number-input setting-input';
                input.type = 'number';
                input.value = shadow[key];
                // input.style.width = width; // Managed by CSS now
                if (key === 'blur') {
                    input.min = 0;
                    input.max = 50;
                }

                input.oninput = (e) => this.updateEffect(index, key, parseInt(e.target.value) || 0);

                group.appendChild(span);
                group.appendChild(input);
                return group;
            };

            inputsWrapper.appendChild(createInputGroup(window.SubtitleUtils?.translateOrFallback?.('subtitle.style.effects_blur', 'Blur') || 'Blur', 'blur'));
            inputsWrapper.appendChild(createInputGroup(window.SubtitleUtils?.translateOrFallback?.('subtitle.style.effects_x', 'X') || 'X', 'x'));
            inputsWrapper.appendChild(createInputGroup(window.SubtitleUtils?.translateOrFallback?.('subtitle.style.effects_y', 'Y') || 'Y', 'y'));

            // Delete Button
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-effect-remove';
            btnDel.innerHTML = '&times;';
            btnDel.title = window.i18n.t('subtitle.panel.remove_track_title');
            btnDel.onclick = () => this.removeEffect(index);

            item.appendChild(colorGroup);
            item.appendChild(inputsWrapper);
            item.appendChild(btnDel);

            list.appendChild(item);
        });
    }

    // ==================== Blur Mask Management ====================

    renderBlurMasksList() {
        const list = this.blurMasksList;
        const emptyHint = this.blurEmptyHint;
        const btnAdd = this.btnAddBlurMask;
        if (!list) return;

        list.innerHTML = '';
        const masks = this.currentStyle.blurMasks || [];

        // Update visibility of hint and add button
        const showBlur = this.blurOriginal?.checked || false;
        const container = this.blurSettings;

        if (container) container.style.display = showBlur ? 'block' : 'none';
        if (btnAdd) btnAdd.style.display = showBlur ? 'flex' : 'none';

        if (masks.length === 0) {
            if (emptyHint) emptyHint.style.display = showBlur ? 'block' : 'none';
            this.updateBlurPreview();
            return;
        }

        if (emptyHint) emptyHint.style.display = 'none';

        masks.forEach((mask, index) => {
            const item = document.createElement('div');
            item.className = 'blur-mask-card';

            // Header: Label + Delete
            const header = document.createElement('div');
            header.className = 'mask-header';
            header.innerHTML = `<span class="mask-label">${window.i18n.t('subtitle.style.blur_mask')} ${index + 1}</span>`;

            const btnDel = document.createElement('button');
            btnDel.className = 'btn-icon-tiny-pro';
            btnDel.innerHTML = '<i class="fa-solid fa-times"></i>';
            btnDel.onclick = () => this.removeBlurMask(index);
            header.appendChild(btnDel);
            item.appendChild(header);

            // Controls
            const controls = document.createElement('div');
            controls.className = 'mask-controls';

            // Helper for slider
            const createSlider = (label, key, min, max, unit = '%') => {
                const row = document.createElement('div');
                row.className = 'mask-control-row';

                const labelSpan = document.createElement('span');
                labelSpan.className = 'tiny-label';
                labelSpan.textContent = label;

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = min;
                slider.max = max;
                slider.value = mask[key];
                slider.className = 'pro-slider-tiny';

                const valueBadge = document.createElement('span');
                valueBadge.className = 'tiny-value';
                valueBadge.textContent = mask[key] + unit;

                slider.oninput = (e) => {
                    const val = parseInt(e.target.value);
                    valueBadge.textContent = val + unit;
                    this.updateBlurMask(index, key, val);
                };

                row.appendChild(labelSpan);
                row.appendChild(slider);
                row.appendChild(valueBadge);
                return row;
            };

            controls.appendChild(createSlider(window.i18n.t('subtitle.style.margin_v'), 'y', 0, 100));
            controls.appendChild(createSlider(window.i18n.t('subtitle.style.mask_height'), 'height', 5, 100)); // Max increased to 100
            controls.appendChild(createSlider(window.i18n.t('subtitle.style.blur_strength'), 'strength', 0, 50, ''));

            item.appendChild(controls);
            list.appendChild(item);
        });

        this.updateBlurPreview();
    }

    addBlurMask() {
        if (!this.currentStyle.blurMasks) this.currentStyle.blurMasks = [];
        this.currentStyle.blurMasks.push({
            position: 'custom', // Fixed logic for now
            y: 50,
            height: 20,
            strength: 15
        });
        this.renderBlurMasksList();
    }

    removeBlurMask(index) {
        if (!this.currentStyle.blurMasks) return;
        this.currentStyle.blurMasks.splice(index, 1);
        this.renderBlurMasksList();
    }

    updateBlurMask(index, key, value) {
        if (!this.currentStyle.blurMasks || !this.currentStyle.blurMasks[index]) return;
        this.currentStyle.blurMasks[index][key] = value;
        this.updateBlurPreview();
    }

    updateBlurPreview() {
        const overlay = document.getElementById('blur-preview-overlay');
        if (!overlay) return;

        const showBlur = document.getElementById('blur-original')?.checked || false;
        if (!showBlur) {
            overlay.style.display = 'none';
            return;
        }

        overlay.style.display = 'block';
        overlay.innerHTML = '';
        // Note: Layout (width/height/left/top) is managed by UIManager's resize observer

        const masks = this.currentStyle.blurMasks || [];
        masks.forEach(mask => {
            const maskEl = document.createElement('div');
            maskEl.className = 'blur-mask-layer';

            // Logic: Y is 0-100% relative to video height
            // Height is 0-100% relative to video height
            // Centered at Y? Or Y is top? 
            // Previous logic: "Vertical Offset" usually meant Center Y or Top Y.
            // Let's assume Y is CENTER position in %.

            const top = mask.y - (mask.height / 2);

            maskEl.style.position = 'absolute';
            maskEl.style.left = '0';
            maskEl.style.width = '100%';
            maskEl.style.top = `${top}%`;
            maskEl.style.height = `${mask.height}%`;
            maskEl.style.backdropFilter = `blur(${mask.strength}px)`;
            maskEl.style.backgroundColor = 'rgba(0,0,0,0.1)'; // Light hint
            maskEl.style.borderTop = '1px dashed rgba(255,255,255,0.3)';
            maskEl.style.borderBottom = '1px dashed rgba(255,255,255,0.3)';
            maskEl.style.boxSizing = 'border-box';

            overlay.appendChild(maskEl);
        });
    }

    // ==================== Preset Management ====================

    async exportPreset() {
        const style = this.currentStyle;
        const json = JSON.stringify(style, null, 2);

        const filePath = await window.mediaflow.dialog.saveFile({
            title: window.i18n.t('subtitle.style.export_preset'),
            defaultPath: `style_${Date.now()}.json`,
            filters: [{ name: 'JSON Preset', extensions: ['json'] }]
        });

        if (!filePath) return;

        try {
            await window.mediaflow.fs.writeFile(filePath, json);
            window.app.showToast(window.i18n.t('toast.export_success'), 'success');
        } catch (e) {
            console.error('Export failed:', e);
            window.app.showToast(window.i18n.t('toast.export_failed') + ': ' + e.message, 'error');
        }
    }

    async importPreset() {
        const filePath = await window.mediaflow.dialog.openFile({
            title: window.i18n.t('subtitle.style.import_preset'),
            filters: [{ name: 'JSON Preset', extensions: ['json'] }],
            properties: ['openFile']
        });

        if (!filePath) return;

        try {
            const content = await window.mediaflow.fs.readFile(filePath);
            const style = JSON.parse(content);

            // Validate basic structure
            if (!style.fontFamily || !style.fontSize) {
                throw new Error(window.i18n.t('toast.invalid_preset'));
            }

            this.currentStyle = this.cloneStyle(style);
            this.applyStyleToUI();

            // Update Select to custom
            if (this.templateManager.styleTemplate) {
                this.templateManager.styleTemplate.value = 'custom';
            }

            window.app.showToast(window.i18n.t('toast.import_success'), 'success');
        } catch (e) {
            console.error('Import failed:', e);
            window.app.showToast(window.i18n.t('toast.import_failed') + ': ' + e.message, 'error');
        }
    }

    async loadSystemFonts(silent = false) {
        if (this._isLoadingFonts) return;
        if (this._fontsLoaded && silent) return; // Silent mode respects existing cache

        this._isLoadingFonts = true;

        const btn = this.btnRefreshFonts;
        const icon = btn?.querySelector('i');
        if (icon) icon.classList.add('fa-spin');

        if (!silent) window.app?.showToast?.(window.i18n.t('toast.loading_fonts'), 'info');

        try {
            // Invoke the new API
            const fonts = await window.mediaflow.system.getFonts();

            if (fonts && fonts.length > 0) {
                const select = this.fontFamily;
                const currentVal = select.value;

                // Build new options list
                let html = '';
                fonts.forEach(font => {
                    html += `<option value="${font}">${font}</option>`;
                });
                html += `<option value="load-system">${window.i18n.t('subtitle.style.load_system_fonts')}</option>`;

                select.innerHTML = html;

                // Try to restore previous selection
                if (fonts.includes(currentVal)) {
                    select.value = currentVal;
                } else if (this.currentStyle?.fontFamily && fonts.includes(this.currentStyle.fontFamily)) {
                    // Check if current style font is in the list
                    select.value = this.currentStyle.fontFamily;
                }

                this._fontsLoaded = true;
                if (!silent) window.app?.showToast?.(window.i18n.t('subtitle.style.load_fonts_success', { count: fonts.length }), 'success');
            }
        } catch (e) {
            console.error('[SubtitleStyleManager] Failed to load fonts:', e);
            if (!silent) window.app?.showToast?.(window.i18n.t('subtitle.style.load_fonts_failed'), 'error');
        } finally {
            this._isLoadingFonts = false;
            if (icon) icon.classList.remove('fa-spin');
        }
    }

    injectAnimationUI() {
        // Inject Animation controls as a NEW section in the Appearance Tab
        if (document.getElementById('subtitle-animation')) return;
        
        const styleTab = document.getElementById('tab-style');
        const container = styleTab?.querySelector('.v-stack-pro') || styleTab;
        if (!container) return;

        const animSection = document.createElement('div');
        animSection.id = 'anim-section-container';
        animSection.className = 'settings-section';
        animSection.innerHTML = `
            <label class="section-label">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span data-i18n="subtitle.style.animation_group">AI Animations</span>
            </label>
            <div class="ctrl-row-pro">
                <span class="ctrl-label" data-i18n="subtitle.style.animation">Enter Anim</span>
                <select id="subtitle-animation" class="setting-select">
                    <option value="none" data-i18n="subtitle.style.animations.none">None</option>
                    <option value="fade" data-i18n="subtitle.style.animations.fade">Fade</option>
                    <option value="popup" data-i18n="subtitle.style.animations.popup">Popup</option>
                    <option value="karaoke" data-i18n="subtitle.style.animations.karaoke">Karaoke</option>
                </select>
                <div class="value-badge">AI</div>
            </div>
            <div id="animation-duration-item" class="ctrl-row-pro">
                <span class="ctrl-label" data-i18n="subtitle.style.anim_duration">Duration (s)</span>
                <input type="range" id="subtitle-anim-duration" min="0" max="5.0" step="0.1" value="0.3" class="pro-slider">
                <div class="h-flex-pro" style="gap: 4px; align-items: center;">
                    <input type="number" id="subtitle-anim-duration-input" step="0.1" min="0" max="10.0" value="0.3" 
                        class="setting-input-pro" style="width: 54px; text-align: center; height: 24px; padding: 0;">
                    <span style="font-size: 11px; opacity: 0.7;">s</span>
                </div>
            </div>
        `;

        // Insert before style templates or at the end
        const templatesSection = container.querySelector('.settings-section:last-child');
        if (templatesSection) {
            container.insertBefore(animSection, templatesSection);
        } else {
            container.appendChild(animSection);
        }

        // Apply translation immediately
        if (window.i18n) window.i18n.updateUI(animSection);

        this.animation = document.getElementById('subtitle-animation');
        this.animationDuration = document.getElementById('subtitle-anim-duration');
        this.animationDurationInput = document.getElementById('subtitle-anim-duration-input');

        this.elements.animation = this.animation;
        this.elements.animationDuration = this.animationDuration;
        this.elements.animationDurationInput = this.animationDurationInput;
    }



    bindAnimationEvents() {
        if (!this.animation || this._animationBound) return;

        const wrapperUpdate = (key, val) => {
            if (this.currentStyle) {
                this.currentStyle[key] = val;
                this.updateSubtitlePreview();
                if (this.flow) {
                    this.flow.currentStyle = this.currentStyle;
                }
                this.saveCurrentStylePreference();
            }
        };

        this.animation.addEventListener('change', (e) => {
            wrapperUpdate('animation', e.target.value);
            
            // Switch to custom template
            const tm = this.templateManager;
            if (tm && tm.styleTemplate && tm.styleTemplate.value !== 'custom') {
                tm.styleTemplate.value = 'custom';
                tm.updateTemplateButtons();
            }
        });

        const syncDur = (valS, source) => {
            const ms = Math.round(parseFloat(valS) * 1000);
            if (isNaN(ms)) return;

            if (source !== 'slider' && this.animationDuration) this.animationDuration.value = valS;
            if (source !== 'input' && this.animationDurationInput) this.animationDurationInput.value = valS;
            
            wrapperUpdate('animationDuration', ms);
        };

        this.animationDuration?.addEventListener('input', (e) => {
            syncDur(e.target.value, 'slider');
        });

        this.animationDurationInput?.addEventListener('input', (e) => {
            syncDur(e.target.value, 'input');
        });

        this._animationBound = true;
    }

    injectAvoidanceUIOnce() {
        if (document.getElementById('btn-smart-avoid')) return;

        // Find the MarginV control to insert next to it
        const marginVContainer = this.marginV?.closest('.setting-item');
        if (!marginVContainer) return;

        const btn = document.createElement('button');
        btn.id = 'btn-smart-avoid';
        btn.className = 'btn-mini btn-accent';
        btn.style.marginLeft = '8px';
        btn.innerHTML = `
            <span class="icon">🤖</span>
            <span data-i18n="subtitle.style.auto_avoid">Smart Avoid</span>
        `;
        btn.setAttribute('data-i18n-title', 'subtitle.style.auto_avoid_title');
        
        // Apply translation immediately
        if (window.i18n) window.i18n.updateUI(btn);
        
        btn.title = window.i18n.t('subtitle.style.auto_avoid_title');

        btn.onclick = async () => {
            const icon = btn.querySelector('.icon');
            const originalIcon = icon.innerHTML;
            icon.innerHTML = '⌛';
            btn.disabled = true;

            try {
                if (this.flow.visualOptimizer) {
                    await this.flow.visualOptimizer.autoOptimizeAll();
                }
            } finally {
                icon.innerHTML = originalIcon;
                btn.disabled = false;
            }
        };

        // Insert after the value badge if exists
        const badge = marginVContainer.querySelector('.badge');
        if (badge) {
            badge.after(btn);
        } else {
            marginVContainer.querySelector('.setting-control')?.appendChild(btn);
        }
    }

    /**
     * 根据视频分辨率自动应用最佳样式
     */
    applyAdaptiveStyle(vWidth, vHeight) {
        if (!vWidth || !vHeight) return;

        console.log(`[SubtitleStyleManager] Applying adaptive style for ${vWidth}x${vHeight}`);

        // 1. 计算自适应字号
        // 逻辑：高度的 5% 作为基准，如果是竖屏则稍微缩小一点比例
        const ratio = vWidth < vHeight ? 0.045 : 0.05;
        let adaptiveSize = Math.round(vHeight * ratio);
        
        // 限制范围：最小 24px，最大 120px (针对 4K)
        adaptiveSize = Math.max(24, Math.min(120, adaptiveSize));

        // 2. 更新当前样式
        if (this.currentStyle) {
            if (this.currentStyle.fontSizeLocked && this.currentStyle.fontSize) {
                console.log(`[SubtitleStyleManager] Keeping remembered fontSize: ${this.currentStyle.fontSize}px`);
                this.applyStyleToUI();
                this.flow.updateSubtitlePreview();
                return;
            }

            this.currentStyle.fontSize = adaptiveSize;
            this.currentStyle.fontSizeLocked = false;
            
            // 如果是竖屏，自动调整 MarginH 为 10 (左右留白更多)
            if (vWidth < vHeight) {
                this.currentStyle.marginH = 10;
            } else {
                this.currentStyle.marginH = 50; // 横屏居中
            }

            this.syncCurrentStyleToTrack();
            this.applyStyleToUI();
            this.flow.updateSubtitlePreview();

            if (this.flow.preferenceManager) {
                this.saveCurrentStylePreference();
            }
            
            console.log(`[SubtitleStyleManager] Adaptive fontSize set to: ${adaptiveSize}px`);
        }
    }
}

window.SubtitleStyleManager = SubtitleStyleManager;
