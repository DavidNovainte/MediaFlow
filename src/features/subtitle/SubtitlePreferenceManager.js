console.log('[SubtitlePreferenceManager] Loading script...');
class SubtitlePreferenceManager {
    constructor(flow) {
        this.flow = flow;
        this.preferences = {
            sourceLanguage: 'auto',
            targetLanguage: 'zh-Hans',
            translationEngine: 'groq',
            translationConcurrency: 2,
            keepBilingual: false,
            fixedTranslationsEnabled: false,
            fixedTranslations: [],
            lengthOptimize: false,
            lengthStrategy: 'split',
            maxChars: 30,
            maxLines: 2,
            enableTTS: false,
            ttsEngine: 'edge',
            ttsVoice: 'zh-CN-XiaoxiaoNeural',
            ttsRate: 100,
            ttsPitch: 0,
            dubAdaptationMode: 'off',
            dubAutoCompress: true,
            dubAutoSpeedUp: true,
            dubAllowGapExtension: true,
            audioMode: 'remove',
            voiceVolume: 80,
            bgmVolume: 30,
            showPreview: true,
            textLayoutMode: 'stacked',
            editorDisplayMode: 'translated',
            outputPath: '',
            uiState: {
                inspectorVisible: true,
                activeTab: 'tab-general',
                tabScrollPositions: {},
                collapsedSections: {}
            },
            // 字幕样式记忆 (默认字号 14, 默认无描边)
            visualStyle: {
                fontFamily: 'Microsoft YaHei',
                fontSize: 32,
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
                marginV: 8,
                marginH: 50,
                wrapWidth: 90,
                letterSpacing: 0,
                lineHeight: 1.4,
                blurOriginal: false,
                blurMasks: [],
                strokes: [],
                shadows: []
            }
        };
    }

    async init() {
        await this.loadPreferences();
        this.bindPreferenceEvents();
    }

    async loadPreferences() {
        try {
            const saved = await window.mediaflow.store.get('subtitlePreferences');
            if (saved) {
                // Only restore keys that belong to standard preferences (exclude visual styles)
                for (const key of Object.keys(this.preferences)) {
                    if (saved[key] !== undefined) {
                        this.preferences[key] = saved[key];
                    }
                }
                const concurrency = Number(this.preferences.translationConcurrency);
                this.preferences.translationConcurrency = Math.max(
                    1,
                    Math.min(4, Number.isFinite(concurrency) ? concurrency : 2)
                );
                if (saved.visualStyle) {
                    this.preferences.visualStyle = { ...this.preferences.visualStyle, ...saved.visualStyle };
                }
                if (saved.uiState) {
                    this.preferences.uiState = {
                        ...this.preferences.uiState,
                        ...saved.uiState,
                        tabScrollPositions: {
                            ...this.preferences.uiState.tabScrollPositions,
                            ...(saved.uiState.tabScrollPositions || {})
                        },
                        collapsedSections: {
                            ...this.preferences.uiState.collapsedSections,
                            ...(saved.uiState.collapsedSections || {})
                        }
                    };
                }
                this.applyPreferencesToUI();
            }
            console.log('[SubtitlePreferenceManager] Preferences loaded');
        } catch (e) {
            console.error('[SubtitlePreferenceManager] Failed to load preferences:', e);
        }
    }

    applyPreferencesToUI() {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setCheck = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };
        setVal('source-language', this.preferences.sourceLanguage);
        setVal('target-language', this.preferences.targetLanguage);
        setVal('translation-engine', this.preferences.translationEngine);
        setVal('translation-concurrency', this.preferences.translationConcurrency);

        setCheck('keep-bilingual', this.preferences.keepBilingual);
        setCheck('fixed-translations-enabled', this.preferences.fixedTranslationsEnabled);

        setCheck('length-optimize', this.preferences.lengthOptimize);
        setVal('length-strategy', this.preferences.lengthStrategy);
        setVal('max-chars', this.preferences.maxChars);
        setVal('max-lines', this.preferences.maxLines);

        // TTS Prefs
        setCheck('enable-tts', this.preferences.enableTTS);
        const ttsSettings = document.getElementById('tts-settings');
        if (ttsSettings) ttsSettings.style.display = this.preferences.enableTTS ? 'block' : 'none';

        setVal('tts-engine', this.preferences.ttsEngine);
        setVal('tts-voice', this.preferences.ttsVoice);
        setVal('tts-rate', this.preferences.ttsRate);
        const ttsRateValue = document.getElementById('tts-rate-value');
        if (ttsRateValue) ttsRateValue.textContent = (this.preferences.ttsRate / 100).toFixed(1) + 'x';

        setVal('tts-pitch', this.preferences.ttsPitch);
        const ttsPitchValue = document.getElementById('tts-pitch-value');
        if (ttsPitchValue) ttsPitchValue.textContent = this.preferences.ttsPitch;

        setVal('dub-adaptation-mode', this.preferences.dubAdaptationMode);
        setCheck('dub-auto-compress', this.preferences.dubAutoCompress);
        setCheck('dub-auto-speedup', this.preferences.dubAutoSpeedUp);
        setCheck('dub-allow-gap-extension', this.preferences.dubAllowGapExtension);

        setVal('audio-mode', this.preferences.audioMode);
        setVal('voice-volume', this.preferences.voiceVolume);
        const voiceVolumeValue = document.getElementById('voice-volume-value');
        if (voiceVolumeValue) voiceVolumeValue.textContent = `${this.preferences.voiceVolume}%`;

        setVal('bgm-volume', this.preferences.bgmVolume);
        const bgmVolumeValue = document.getElementById('bgm-volume-value');
        if (bgmVolumeValue) bgmVolumeValue.textContent = `${this.preferences.bgmVolume}%`;

        setCheck('show-preview', this.preferences.showPreview);

        if (this.flow.outputPath) this.flow.outputPath.value = this.preferences.outputPath || '';

        // Trigger updates
        if (this.flow.mediaHandler && typeof this.flow.mediaHandler.updateBlurPreview === 'function') {
            this.flow.mediaHandler.updateBlurPreview();
        }
        if (this.flow.styleManager && typeof this.flow.styleManager.updateSubtitlePreview === 'function') {
            this.flow.styleManager.updateSubtitlePreview();
        }

        // 重要：调用 UIManager 更新复杂的依赖布局 (如策略面板、行数限制等)
        if (this.flow.uiManager) {
            this.flow.uiManager.updateLengthStrategyUI();
            this.flow.uiManager.settings?.renderFixedTranslations?.(this.preferences.fixedTranslations || []);
            this.flow.uiManager.settings?.syncFixedTranslationEditorState?.();
            this.flow.uiManager.settings?.updateDubAdaptationUI?.();
        }
    }

    async savePreferences() {
        try {
            await window.mediaflow.store.set('subtitlePreferences', this.preferences);
        } catch (e) {
            console.error('[SubtitlePreferenceManager] Failed to save preferences:', e);
        }
    }

    bindPreferenceEvents() {
        const updatePref = (key, value) => {
            this.preferences[key] = value;
            this.savePreferences();
        };

        const bindInput = (id, key, type = 'text') => {
            const el = document.getElementById(id);
            if (!el) return;
            const event = (type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(event, (e) => {
                let val = type === 'checkbox' ? e.target.checked : e.target.value;
                if (type === 'number') val = parseFloat(val);
                updatePref(key, val);
            });
        };

        bindInput('source-language', 'sourceLanguage');
        bindInput('target-language', 'targetLanguage');
        bindInput('translation-engine', 'translationEngine');
        bindInput('translation-concurrency', 'translationConcurrency', 'number');
        bindInput('keep-bilingual', 'keepBilingual', 'checkbox');
        bindInput('fixed-translations-enabled', 'fixedTranslationsEnabled', 'checkbox');
        bindInput('length-optimize', 'lengthOptimize', 'checkbox');
        bindInput('length-strategy', 'lengthStrategy');
        bindInput('max-chars', 'maxChars', 'number');
        bindInput('max-lines', 'maxLines', 'number');
        bindInput('output-path', 'outputPath');


        bindInput('show-preview', 'showPreview', 'checkbox');

        bindInput('enable-tts', 'enableTTS', 'checkbox');
        bindInput('tts-engine', 'ttsEngine');
        bindInput('tts-voice', 'ttsVoice');
        bindInput('tts-rate', 'ttsRate', 'number');
        bindInput('tts-pitch', 'ttsPitch', 'number');
        bindInput('dub-adaptation-mode', 'dubAdaptationMode');
        bindInput('dub-auto-compress', 'dubAutoCompress', 'checkbox');
        bindInput('dub-auto-speedup', 'dubAutoSpeedUp', 'checkbox');
        bindInput('dub-allow-gap-extension', 'dubAllowGapExtension', 'checkbox');
        bindInput('audio-mode', 'audioMode');
        bindInput('voice-volume', 'voiceVolume', 'number');
        bindInput('bgm-volume', 'bgmVolume', 'number');

        // Additional Logic Listeners (that affect UI state)
        // 子面板联动逻辑已由 SubtitleUIManager 统一处理，此处不再重复绑定以防冲突

        document.getElementById('enable-tts')?.addEventListener('change', (e) => {
            const settings = document.getElementById('tts-settings');
            if (settings) settings.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    get(key) {
        return this.preferences[key];
    }

    set(key, value) {
        this.preferences[key] = value;
        this.savePreferences();
    }

    updatePreferences(partialPreferences = {}) {
        if (!partialPreferences || typeof partialPreferences !== 'object') return;

        Object.entries(partialPreferences).forEach(([key, value]) => {
            if (key === 'visualStyle' && value && typeof value === 'object') {
                this.preferences.visualStyle = { ...this.preferences.visualStyle, ...value };
                return;
            }

            if (key === 'uiState' && value && typeof value === 'object') {
                this.preferences.uiState = {
                    ...this.preferences.uiState,
                    ...value,
                    tabScrollPositions: {
                        ...this.preferences.uiState.tabScrollPositions,
                        ...(value.tabScrollPositions || {})
                    },
                    collapsedSections: {
                        ...this.preferences.uiState.collapsedSections,
                        ...(value.collapsedSections || {})
                    }
                };
                return;
            }

            this.preferences[key] = value;
        });

        this.savePreferences();
    }

    getUIState() {
        return {
            ...this.preferences.uiState,
            tabScrollPositions: { ...(this.preferences.uiState.tabScrollPositions || {}) },
            collapsedSections: { ...(this.preferences.uiState.collapsedSections || {}) }
        };
    }

    setUIState(partialState = {}) {
        this.preferences.uiState = {
            ...this.preferences.uiState,
            ...partialState,
            tabScrollPositions: {
                ...this.preferences.uiState.tabScrollPositions,
                ...(partialState.tabScrollPositions || {})
            },
            collapsedSections: {
                ...this.preferences.uiState.collapsedSections,
                ...(partialState.collapsedSections || {})
            }
        };
        this.savePreferences();
    }
}

window.SubtitlePreferenceManager = SubtitlePreferenceManager;
