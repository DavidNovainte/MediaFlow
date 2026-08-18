class SubtitleTTSHandler {
    constructor(flow) {
        this.flow = flow;
        this.ttsEngine = null;
        this.ttsVoice = null;
        this.ttsRate = null;
        this.ttsPitch = null;
        this.voiceVolume = null;
        this.bgmVolume = null;
        this.btnPreviewVoice = null;
        this.edgeInstallButton = null;
        this.edgeStatusHint = null;
        this.unsubEdgeInstallProgress = null;

        // State
        this.audio = new Audio();

        // 🆕 Initialize from TTSConfig (Global configuration)
        // These are critical for voice sorting and friendly names
        const config = window.TTSConfig || { voiceFeaturedOrder: [], languageNames: {}, friendlyNames: {} };
        this.voiceFeaturedOrder = config.voiceFeaturedOrder || [];
        this.languageNames = config.languageNames || {};
        this.voiceFriendlyNames = config.friendlyNames || {};
    }

    getCurrentUiLang() {
        return window.i18n?.currentLang || 'en-US';
    }

    getTranslationOrFallback(key, fallbackValue) {
        const translated = window.i18n?.t?.(key);
        if (translated && translated !== key) {
            return translated;
        }
        return fallbackValue;
    }

    getDisplayNames(locale) {
        try {
            return {
                language: new Intl.DisplayNames([locale], { type: 'language' }),
                region: new Intl.DisplayNames([locale], { type: 'region' })
            };
        } catch {
            return null;
        }
    }

    buildLanguageFallbackLabel(code) {
        const uiLang = this.getCurrentUiLang();
        const displayNames = this.getDisplayNames(uiLang);
        const localizedName = displayNames?.language?.of(code);
        return localizedName || this.languageNames[code] || code.toUpperCase();
    }

    buildVoiceFallbackLabel(voiceName) {
        const parts = voiceName.split('-');
        if (parts.length < 3) return voiceName;

        const uiLang = this.getCurrentUiLang();
        const displayNames = this.getDisplayNames(uiLang);
        const regionCode = parts[1];
        const shortName = parts.slice(2).join(' ').replace('Neural', '').trim();

        const languageLabel = displayNames?.language?.of(parts[0]) || parts[0].toUpperCase();
        const regionLabel = displayNames?.region?.of(regionCode) || regionCode;

        return `${shortName} (${languageLabel} - ${regionLabel})`;
    }

    shouldUseCuratedVoiceLabel() {
        const uiLang = this.getCurrentUiLang().toLowerCase();
        return uiLang.startsWith('zh') || uiLang.startsWith('en') || uiLang.startsWith('ja') || uiLang.startsWith('ko');
    }

    init(elements) {
        this.ttsEngine = elements.ttsEngine;
        this.ttsVoice = elements.ttsVoice;
        this.ttsRate = elements.ttsRate;
        this.ttsPitch = elements.ttsPitch;
        this.voiceVolume = elements.voiceVolume;
        this.bgmVolume = elements.bgmVolume;
        this.btnPreviewVoice = elements.btnPreviewVoice;

        this.ensureEdgeInstallControls();

        this.bindEvents();

        // 🆕 Listen for language changes to re-render lists
        window.addEventListener('languageChanged', (e) => {
            console.log('[SubtitleTTSHandler] Language changed, refreshing UI:', e.detail.lang);
            this.handleLanguageChange();
        });
    }

    bindEvents() {
        this.btnPreviewVoice?.addEventListener('click', () => this.previewVoice());
        this.edgeInstallButton?.addEventListener('click', () => this.installEdgeTts());

        // TTS Enable Toggle
        const enableTTS = document.getElementById('enable-tts');
        const ttsSettings = document.getElementById('tts-settings');

        if (enableTTS) {
            enableTTS.addEventListener('change', () => {
                if (ttsSettings) {
                    ttsSettings.style.display = enableTTS.checked ? 'block' : 'none';
                    if (enableTTS.checked) {
                        this.loadVoices(); // Load on enable
                    }
                }
            });
        }

        // Engine Change
        const ttsEngine = document.getElementById('tts-engine');
        const openAIEntry = document.getElementById('tts-openai-key-row');
        const elevenEntry = document.getElementById('tts-eleven-key-row');

        if (ttsEngine) {
            ttsEngine.addEventListener('change', () => {
                const engine = ttsEngine.value;
                // Toggle Key Inputs
                if (openAIEntry) openAIEntry.style.display = engine === 'openai' ? 'flex' : 'none';
                if (elevenEntry) elevenEntry.style.display = engine === 'elevenlabs' ? 'flex' : 'none';

                // Reload voices for new engine
                this.loadVoices();
            });
        }

        // Sliders updates
        const bindSlider = (el, valueEl, suffix = '') => {
            if (el && valueEl) {
                el.addEventListener('input', () => {
                    let val = el.value;
                    if (suffix === 'x') val = (val / 100).toFixed(1);
                    valueEl.textContent = val + suffix;
                });
                // Init value
                let val = el.value;
                if (suffix === 'x') val = (val / 100).toFixed(1);
                valueEl.textContent = val + suffix;
            }
        };

        bindSlider(this.ttsRate, document.getElementById('tts-rate-value'), 'x');
        bindSlider(this.ttsPitch, document.getElementById('tts-pitch-value'));
        bindSlider(this.voiceVolume, document.getElementById('voice-volume-value'), '%');
        bindSlider(this.bgmVolume, document.getElementById('bgm-volume-value'), '%');

        // Audio Mode Radio
        const btnSelectBgm = document.getElementById('btn-select-bgm');
        document.querySelectorAll('input[name="audio-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (btnSelectBgm) {
                    btnSelectBgm.style.display = e.target.value === 'custom-bgm' ? 'block' : 'none';
                }
            });
        });
    }

    handleLanguageChange() {
        // 1. Re-load voices to update labels in the dropdown
        this.loadVoices();

        // 2. Update other localized labels/placeholders if any
        // Sliders already updated via bindEvents but we can force refresh labels if needed
        this.refreshSliderLabels();
    }

    refreshSliderLabels() {
        // Suffixes and labels for sliders
        const update = (el, valueEl, suffix = '') => {
            if (el && valueEl) {
                let val = el.value;
                if (suffix === 'x') val = (val / 100).toFixed(1);
                valueEl.textContent = val + suffix;
            }
        };
        update(this.ttsRate, document.getElementById('tts-rate-value'), 'x');
        update(this.ttsPitch, document.getElementById('tts-pitch-value'));
        update(this.voiceVolume, document.getElementById('voice-volume-value'), '%');
        update(this.bgmVolume, document.getElementById('bgm-volume-value'), '%');
    }

    ensureEdgeInstallControls() {
        if (this.edgeInstallButton && this.edgeStatusHint) {
            return;
        }

        const engineRow = document.getElementById('tts-engine')?.closest('.ctrl-row-pro');
        if (!engineRow || !engineRow.parentElement) return;

        let row = document.getElementById('tts-edge-install-row');
        if (!row) {
            row = document.createElement('div');
            row.id = 'tts-edge-install-row';
            row.className = 'ctrl-row-pro';
            row.style.display = 'none';
            row.innerHTML = `
                <span class="ctrl-label">${this.getTranslationOrFallback('subtitle.tts.edgeStatus', 'Edge TTS')}</span>
                <div class="h-flex-pro" style="gap:8px; align-items:center; flex:1;">
                    <button type="button" id="btn-install-edge-tts" class="btn btn-xs btn-outline">Install Edge TTS</button>
                    <span id="tts-edge-status-hint" style="font-size:12px; color:var(--text-secondary);"></span>
                </div>
            `;
            engineRow.insertAdjacentElement('afterend', row);
        }

        this.edgeInstallButton = row.querySelector('#btn-install-edge-tts');
        this.edgeStatusHint = row.querySelector('#tts-edge-status-hint');
    }

    setEdgeInstallState(visible, hint = '') {
        const row = document.getElementById('tts-edge-install-row');
        if (!row) return;
        row.style.display = visible ? 'flex' : 'none';
        if (this.edgeStatusHint) {
            this.edgeStatusHint.textContent = hint || '';
        }
    }

    async installEdgeTts() {
        if (!window.mediaflow?.tts?.installEdge) return;

        this.setEdgeInstallState(true, this.getTranslationOrFallback('subtitle.tts.installing', 'Installing...'));
        if (this.edgeInstallButton) {
            this.edgeInstallButton.disabled = true;
        }

        if (!this.unsubEdgeInstallProgress && window.mediaflow.tts.onEdgeInstallProgress) {
            this.unsubEdgeInstallProgress = window.mediaflow.tts.onEdgeInstallProgress((data) => {
                this.setEdgeInstallState(true, data?.status || '');
            });
        }

        const result = await window.mediaflow.tts.installEdge();

        if (this.edgeInstallButton) {
            this.edgeInstallButton.disabled = false;
        }

        if (result?.success) {
            this.setEdgeInstallState(false, '');
            window.app?.showToast?.(
                this.getTranslationOrFallback('subtitle.tts.edgeInstalled', 'Edge TTS installed successfully'),
                'success'
            );
            await this.loadVoices();
            return;
        }

        this.setEdgeInstallState(true, result?.error || this.getTranslationOrFallback('subtitle.tts.installFailed', 'Install failed'));
        window.app?.showToast?.(
            result?.error || this.getTranslationOrFallback('subtitle.tts.installFailed', 'Install failed'),
            'error'
        );
    }

    async loadVoices() {

        const engineEl = document.getElementById('tts-engine');
        const engine = engineEl ? engineEl.value : 'edge';

        // Get API Key if needed
        let apiKey = '';
        if (engine === 'openai') {
            apiKey = document.getElementById('tts-openai-key')?.value.trim();
        } else if (engine === 'elevenlabs') {
            apiKey = document.getElementById('tts-eleven-key')?.value.trim();
        }

        try {
            this.ttsVoice.innerHTML = `<option>${window.i18n.t('subtitle.tts.loading')}</option>`;
            this.ttsVoice.disabled = true;

            if (engine === 'edge' && window.mediaflow?.tts?.checkEdge) {
                const edgeStatus = await window.mediaflow.tts.checkEdge();
                if (!edgeStatus?.available) {
                    this.setEdgeInstallState(true, edgeStatus?.error || this.getTranslationOrFallback('subtitle.tts.edgeNotReady', 'Edge TTS is not installed'));
                    this.ttsVoice.innerHTML = `<option>${this.getTranslationOrFallback('subtitle.tts.edgeNotReady', 'Edge TTS is not installed')}</option>`;
                    this.ttsVoice.disabled = true;
                    return;
                }
                this.setEdgeInstallState(false, '');
            } else {
                this.setEdgeInstallState(false, '');
            }

            let voices = [];
            try {
                voices = await window.mediaflow.tts.getVoices({ engine, apiKey });
            } catch (e) {
                console.warn('[SubtitleTTSHandler] API fetch failed, using fallback:', e);
            }

            console.log(`[SubtitleTTSHandler] Loaded ${voices?.length || 0} voices for ${engine}`);

            this.allVoices = voices || [];

            // Merge all configured Edge voices so UI can still show the complete list
            // even when the runtime voice listing is partial or temporarily unavailable.
            if (engine === 'edge') {
                const configuredVoiceNames = new Set([
                    ...this.voiceFeaturedOrder,
                    ...Object.keys(this.voiceFriendlyNames || {})
                ]);

                configuredVoiceNames.forEach(name => {
                    if (!this.allVoices.find(v => v.Name === name)) {
                        this.allVoices.push({ Name: name, Gender: '' });
                    }
                });
            }

            this.ttsVoice.innerHTML = '';
            this.ttsVoice.disabled = false;

            // Handle Language Filter Logic
            // Edge TTS has structured names (zh-CN-...). 
            // OpenAI/ElevenLabs do not.
            if (engine === 'edge') {
                const langFilter = document.getElementById('tts-lang-filter');
                if (langFilter && langFilter.parentElement) {
                    langFilter.parentElement.style.display = 'flex'; // Show filter
                    this.setupLanguageFilter(this.allVoices);
                }
                this.renderVoiceList();
            } else {
                // For OpenAI / ElevenLabs, hide language filter or just show all
                const langFilterRow = document.getElementById('tts-lang-filter').parentElement;
                if (langFilterRow) langFilterRow.style.display = 'none';

                // Render directly
                this.allVoices.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.Name; // ID
                    opt.textContent = v.DisplayName || v.Name;
                    this.ttsVoice.appendChild(opt);
                });

                // Trigger change to update preview state if needed
                if (this.allVoices.length > 0) this.ttsVoice.selectedIndex = 0;
            }

        } catch (error) {
            console.error('[SubtitleTTSHandler] Failed to load voices:', error);
            this.ttsVoice.innerHTML = `<option>${window.i18n.t('subtitle.tts.load_failed')}</option>`;
            window.app?.showToast?.(`${window.i18n.t('subtitle.tts.load_failed')}: ${error.message}`, 'error');
        }
    }

    setupLanguageFilter(voices) {
        const ttsLangFilter = document.getElementById('tts-lang-filter');
        if (!ttsLangFilter) return;

        // Remove old listeners
        const newFilter = ttsLangFilter.cloneNode(true);
        ttsLangFilter.parentNode.replaceChild(newFilter, ttsLangFilter);
        this.ttsLangFilter = newFilter;

        this.ttsLangFilter.innerHTML = '';

        // Option: All
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = window.i18n?.t('subtitle.tts.filters.all') || 'Notification';
        this.ttsLangFilter.appendChild(optAll);

        // Separator
        const optSep1 = document.createElement('option');
        optSep1.disabled = true;
        optSep1.textContent = window.i18n?.t('subtitle.tts.filters.common') || 'Notification';
        this.ttsLangFilter.appendChild(optSep1);

        // Priority Languages
        const priorityLangs = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi', 'th', 'vi', 'id', 'tr', 'nl', 'pl', 'sv', 'uk'];

        // Collect available codes
        const availableLangCodes = new Set();
        voices.forEach(v => {
            const parts = v.Name.split('-');
            if (parts.length >= 1) availableLangCodes.add(parts[0]);
        });

        // Add Priority Options
        priorityLangs.forEach(code => {
            if (availableLangCodes.has(code)) {
                const opt = document.createElement('option');
                opt.value = code;
                // Try i18n first, fallback to TTSConfig, then fallback to code
                opt.textContent = this.getTranslationOrFallback(
                    `subtitle.tts.languages.${code}`,
                    this.buildLanguageFallbackLabel(code)
                );
                this.ttsLangFilter.appendChild(opt);
            }
        });

        // Other Languages
        const otherLangs = Array.from(availableLangCodes)
            .filter(code => !priorityLangs.includes(code))
            .sort();

        if (otherLangs.length > 0) {
            const optSep2 = document.createElement('option');
            optSep2.disabled = true;
            optSep2.textContent = window.i18n?.t('subtitle.tts.filters.other') || 'Notification';
            this.ttsLangFilter.appendChild(optSep2);

            otherLangs.forEach(code => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = this.getTranslationOrFallback(
                    `subtitle.tts.languages.${code}`,
                    this.buildLanguageFallbackLabel(code)
                );
                this.ttsLangFilter.appendChild(opt);
            });
        }

        this.ttsLangFilter.addEventListener('change', () => this.renderVoiceList());
    }

    /**
     * 根据字幕目标语言同步 TTS 语种滤镜
     * @param {string} targetLang - 如 'zh-Hans', 'en-US', 'ko-KR'
     */
    syncWithTargetLanguage(targetLang) {
        if (!this.ttsLangFilter || !this.allVoices) return;

        // 1. 映射字幕语种代码到 TTS 语种前缀
        const langMap = {
            'zh-Hans': 'zh',
            'zh-Hant': 'zh',
            'en-US': 'en',
            'en-GB': 'en',
            'ko-KR': 'ko',
            'ja-JP': 'ja',
            'fr-FR': 'fr',
            'de-DE': 'de',
            'es-ES': 'es',
            'ru-RU': 'ru',
            'it-IT': 'it',
            'pt-PT': 'pt',
            'vi-VN': 'vi',
            'th-TH': 'th',
            'id-ID': 'id'
        };

        const ttsLang = langMap[targetLang] || (targetLang ? targetLang.split('-')[0] : 'all');
        console.log(`[SubtitleTTSHandler] Syncing with target language: ${targetLang} -> TTS Filter: ${ttsLang}`);

        // 2. 更新语种滤镜并触发渲染
        if (this.ttsLangFilter.value !== ttsLang) {
            // 检查滤镜中是否存在该选项，如果不存在则回退到 'all'
            const hasOption = Array.from(this.ttsLangFilter.options).some(opt => opt.value === ttsLang);
            this.ttsLangFilter.value = hasOption ? ttsLang : 'all';
            
            // 3. 自动匹配默认配音角色 (如果当前选中的配音不匹配新语种)
            this.autoSelectDefaultVoice(ttsLang);
            
            this.renderVoiceList();
        }
    }

    /**
     * 为新语种自动选择一个默认推荐的配音
     */
    autoSelectDefaultVoice(langCode) {
        if (!this.allVoices || !this.ttsVoice) return;

        // 常用语种的默认 Neural 配音映射 (优先使用推荐角色)
        const defaults = {
            'zh': 'zh-CN-XiaoxiaoNeural',
            'en': 'en-US-AriaNeural',
            'ko': 'ko-KR-SunHiNeural',
            'ja': 'ja-JP-NanamiNeural',
            'fr': 'fr-FR-DeniseNeural',
            'de': 'de-DE-KatjaNeural',
            'es': 'es-ES-ElviraNeural'
        };

        const defaultVoice = defaults[langCode];
        const currentVoice = this.ttsVoice.value;

        // 如果当前没有选中配音，或者当前配音不匹配新语种前缀
        if (!currentVoice || !currentVoice.startsWith(langCode)) {
            // 尝试找映射好的默认角色
            if (defaultVoice && this.allVoices.find(v => v.Name === defaultVoice)) {
                console.log(`[SubtitleTTSHandler] Auto-selecting default voice for ${langCode}: ${defaultVoice}`);
                this.ttsVoice.value = defaultVoice;
            } else {
                // 找不到映射，尝试找该语种下的第一个角色
                const firstInLang = this.allVoices.find(v => v.Name.startsWith(langCode));
                if (firstInLang) {
                    console.log(`[SubtitleTTSHandler] No specific default, selecting first for ${langCode}: ${firstInLang.Name}`);
                    this.ttsVoice.value = firstInLang.Name;
                }
            }
        }
    }

    renderVoiceList() {
        if (!this.ttsVoice || !this.allVoices) return;

        const filterLang = this.ttsLangFilter ? this.ttsLangFilter.value : 'all';
        const currentSelected = this.ttsVoice.value;

        this.ttsVoice.innerHTML = '';

        // Filter Voices by language
        let filteredVoices = this.allVoices.filter(v => {
            // Quality filter: Show ALL voices now, not just quality ones.
            // But we can prioritize. 
            // Was: const isQuality = v.Name.includes('Neural') || this.voiceFriendlyNames[v.Name];
            // if (!isQuality) return false; 

            // Language Filter Logic
            if (filterLang === 'all') return true;
            if (v.Name.startsWith(filterLang)) return true; // 'zh' matches 'zh-CN', 'zh-TW'

            return false;
        });

        // Sort: Recommended first, then Alphabetical
        filteredVoices.sort((a, b) => {
            const idxA = this.voiceFeaturedOrder.indexOf(a.Name);
            const idxB = this.voiceFeaturedOrder.indexOf(b.Name);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;

            return a.Name.localeCompare(b.Name);
        });

        // Render
        filteredVoices.forEach(v => {
            const option = document.createElement('option');
            option.value = v.Name;

            // Try to find friendly name in i18n first
            let label = this.shouldUseCuratedVoiceLabel() ? window.i18n?.t(`subtitle.tts.voices.${v.Name}`) : null;

            // If i18n returns key or empty, fallback to old friendlyNames or construct one
            if (!label || label === `subtitle.tts.voices.${v.Name}`) {
                if (this.getCurrentUiLang().startsWith('zh')) {
                    label = this.voiceFriendlyNames[v.Name];
                } else {
                    label = this.buildVoiceFallbackLabel(v.Name);
                }
            }

            // Fallback: "Locale - Name"
            if (!label) {
                label = this.buildVoiceFallbackLabel(v.Name);
            }

            option.textContent = label;

            if (label && label.includes('✨')) {
                option.style.fontWeight = 'bold';
                option.style.color = '#e11d48';
            } else {
                option.style.color = '#ffffff';
            }

            this.ttsVoice.appendChild(option);
        });

        // Restore selection
        if (currentSelected && this.ttsVoice.querySelector(`option[value="${currentSelected}"]`)) {
            this.ttsVoice.value = currentSelected;
        } else if (this.ttsVoice.options.length > 0) {
            this.ttsVoice.selectedIndex = 0;
        }

        console.log('[SubtitleTTSHandler] Rendered voices:', filteredVoices.length, 'Filter:', filterLang);
    }

    async previewVoice() {
        if (!this.ttsVoice) return;
        const voice = this.ttsVoice.value;
        let text = this.getTranslationOrFallback('subtitle.tts.preview_text_default', 'This is a voice preview test.'); // Default

        if (voice) {
            // Localize preview text based on language prefix
            if (voice.startsWith('zh')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.zh', '这是一个语音试听测试，效果怎么样？');
            else if (voice.startsWith('ja')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.ja', 'これは音声プレビューテストです。');
            else if (voice.startsWith('ko')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.ko', '이것은 음성 미리듣기 테스트입니다.');
            else if (voice.startsWith('fr')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.fr', 'Ceci est un test de prévisualisation vocale.');
            else if (voice.startsWith('de')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.de', 'Dies ist ein Sprachtest.');
            else if (voice.startsWith('es')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.es', 'Esta es una prueba de vista previa de voz.');
            else if (voice.startsWith('ru')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.ru', 'Это тест предварительного прослушивания голоса.');
            else if (voice.startsWith('pt')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.pt', 'Este é um teste de visualização de voz.');
            else if (voice.startsWith('it')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.it', 'Questo è un test di anteprima vocale.');
            else if (voice.startsWith('hi')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.hi', 'यह एक वॉयस प्रीव्यू टेस्ट है।');
            else if (voice.startsWith('th')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.th', 'นี่คือการทดสอบตัวอย่างเสียง');
            else if (voice.startsWith('vi')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.vi', 'Đây là bản thử nghiệm giọng nói.');
            else if (voice.startsWith('id')) text = this.getTranslationOrFallback('subtitle.tts.preview_text.id', 'Ini adalah tes pratinjau suara.');
        }

        try {
            const btn = this.btnPreviewVoice;
            const icon = btn?.querySelector('i');

            if (btn) {
                btn.disabled = true;
                if (icon) icon.className = 'fa-solid fa-spinner fa-spin'; // Loading icon
                btn.title = window.i18n.t('subtitle.tts.generating');
            }

            const options = {
                text: text,
                voice: voice,
                rate: parseInt(this.ttsRate?.value || 100) - 100,
                pitch: parseInt(this.ttsPitch?.value || 0),
                volume: parseInt(this.voiceVolume?.value || 100)
            };

            // Call Main Process to generate TTS audio
            const result = await window.mediaflow.tts.preview(options);
            if (result && result.success && result.audioData) {
                // Play audio
                const blob = new Blob([result.audioData], { type: 'audio/mp3' });
                const url = URL.createObjectURL(blob);
                this.audio.src = url;
                const playPromise = this.audio.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch((error) => {
                        if (error?.name === 'AbortError') return;
                        console.warn('[SubtitleTTSHandler] Voice preview interrupted:', error);
                    });
                }

                if (btn) {
                    if (icon) icon.className = 'fa-solid fa-volume-high fa-beat-fade'; // Playing icon
                    btn.title = window.i18n.t('subtitle.tts.playing');
                }

                this.audio.onended = () => {
                    if (btn) {
                        btn.disabled = false;
                        if (icon) icon.className = 'fa-solid fa-play';
                        btn.title = window.i18n.t('subtitle.tts.preview');
                    }
                    URL.revokeObjectURL(url);
                };
            } else {
                throw new Error(result?.error || 'Unknown error');
            }

        } catch (e) {
            console.error('[SubtitleTTSHandler] Preview failed:', e);
            window.app?.showToast?.(window.i18n.t('toast.preview_failed') + ': ' + e.message, 'error');
            const btn = this.btnPreviewVoice;
            const icon = btn?.querySelector('i');
            if (btn) {
                btn.disabled = false;
                if (icon) icon.className = 'fa-solid fa-play';
                btn.title = window.i18n.t('subtitle.tts.preview');
            }
        }
    }



    async previewSubtitle(text) {
        if (!text) return;
        const settings = this.getSettings();

        try {
            const tempDir = await window.mediaflow?.app?.getTempPath();
            const filename = `preview_sub_${Date.now()}.mp3`;
            const outputPath = await window.mediaflow?.path?.join(tempDir, filename);
            const voice = settings.voice || 'zh-CN-XiaoxiaoNeural';

            await window.mediaflow.tts.generate({
                text: text,
                voice: voice,
                rate: settings.rate,
                pitch: settings.pitch,
                outputPath: outputPath
            });

            const readResult = await window.mediaflow?.fs?.readAsDataUrl?.(outputPath);
            const { success, dataUrl } = readResult || {};
            if (success && dataUrl) {
                const audio = new Audio(dataUrl);
                const playPromise = audio.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch((error) => {
                        if (error?.name === 'AbortError') return;
                        console.warn('[SubtitleTTSHandler] Subtitle preview interrupted:', error);
                    });
                }
                window.app?.showToast?.(window.i18n.t('toast.playing'), 'success');
            } else {
                throw new Error(window.i18n.t('toast.read_audio_failed'));
            }
        } catch (e) {
            console.error('[SubtitleTTSHandler] Preview subtitle failed:', e);
            window.app?.showToast?.(window.i18n.t('toast.preview_failed') + ': ' + e.message, 'error');
        }
    }

    getSubtitleSpeechText(sub) {
        if (!sub) return '';
        return window.SubtitleUtils?.getSpeechText?.(sub)
            || String(sub.originalText || sub.text || '').trim();
    }

    markGeneratedDubCaptions(subtitles = [], preparedSubtitles = []) {
        if (!Array.isArray(subtitles) || subtitles.length === 0) {
            return;
        }

        subtitles.forEach((subtitle, index) => {
            if (!subtitle) return;

            const preparedSubtitle = preparedSubtitles[index] || subtitle;
            const captionText = String(preparedSubtitle?.dubText || preparedSubtitle?.dubCaptionText || '').trim();
            const usesTranslatedSpeech = window.SubtitleUtils?.getEffectiveTtsSource?.(subtitle) === 'translated';

            if (!captionText || !usesTranslatedSpeech) {
                return;
            }

            subtitle.dubCaptionText = captionText;
            subtitle.dubCaptionReady = true;
        });

        this.flow.updateSubtitlePreview?.();
        this.flow.uiManager?.settings?.refreshDubStatusPanel?.();
    }

    async prepareSubtitlesForTts(subtitles = []) {
        if (!Array.isArray(subtitles) || subtitles.length === 0) {
            return [];
        }

        if (!this.flow.dubAdapter?.prepareSubtitlesForTts) {
            return subtitles;
        }

        const prepared = await this.flow.dubAdapter.prepareSubtitlesForTts(subtitles);
        prepared.forEach((preparedSubtitle, index) => {
            const originalSubtitle = subtitles[index];
            if (!originalSubtitle) return;

            originalSubtitle.dubText = preparedSubtitle.dubText || '';
            originalSubtitle.dubStatus = preparedSubtitle.dubStatus || 'fit';
            originalSubtitle.dubTiming = preparedSubtitle.dubTiming || null;
            originalSubtitle.targetDuration = preparedSubtitle.targetDuration || null;
            originalSubtitle.maxRatePercent = preparedSubtitle.maxRatePercent || null;
        });

        this.flow.uiManager?.settings?.refreshDubStatusPanel?.();

        return prepared;
    }

    /**
     * 为单行字幕生成 TTS (实时同步专用)
     * @param {Object} sub - Subtitle object
     */
    async generateSingleSegment(sub) {
        if (!sub) return null;

        const [preparedSubtitle = sub] = await this.prepareSubtitlesForTts([sub]);
        const text = this.getSubtitleSpeechText(preparedSubtitle);
        if (!text) return null;

        const settings = this.getMergedSettings(preparedSubtitle);
        const tempDir = await window.mediaflow?.app?.getTempPath();
        const filename = `auto_sync_${sub.id}_${Date.now()}.mp3`;
        const outputPath = await window.mediaflow?.path?.join(tempDir, filename);

        try {
            await window.mediaflow.tts.generate({
                text: text,
                voice: settings.voice || 'zh-CN-XiaoxiaoNeural',
                rate: settings.rate,
                pitch: settings.pitch,
                outputPath: outputPath,
                targetDuration: preparedSubtitle.targetDuration,
                maxRatePercent: preparedSubtitle.maxRatePercent
            });

            // 获取合成后的真实时长 (s)
            const videoInfo = await window.mediaflow.subtitle.getVideoInfo(outputPath);
            const duration = videoInfo?.duration || 0;

            this.markGeneratedDubCaptions([sub], [preparedSubtitle]);
            
            return {
                path: outputPath,
                duration: duration
            };
        } catch (e) {
            console.error('[SubtitleTTSHandler] Single segment generation failed:', e);
            
            // 实时同步失败反馈：如果是网络问题或服务限流，提示用户
            const errorStr = String(e.message || e);
            if (errorStr.includes('EdgeTTS') || errorStr.includes('fetch')) {
                // 仅在非批量处理模式下静默失败改为 Toast 提醒，避免刷屏
                if (!this.flow.isProcessing) {
                    window.app?.showToast?.(this.getTranslationOrFallback('toast.tts_sync_failed', 'TTS sync failed, please check network (EdgeTTS)'), 'warning');
                }
            }
            return null;
        }
    }

    async generateBatch(subtitles) {
        if (!subtitles || subtitles.length === 0) return null;
        const settings = this.getSettings();
        const preparedSubtitles = await this.prepareSubtitlesForTts(subtitles);
        const payload = preparedSubtitles
            .map((subtitle) => ({
                ...subtitle,
                text: this.getSubtitleSpeechText(subtitle)
            }))
            .filter((subtitle) => subtitle.text && subtitle.text.trim().length > 0);

        if (!window.mediaflow?.tts) return null;
        this.isProcessing = true;

        // Reset progress
        this.flow.updateProgress(0, window.i18n.t('subtitle.progress.generating_all_tts'));

        // Handle progress events from backend
        const onProgress = (event, data) => {
            const { percent, text, index, total } = data;
            console.log(`[SubtitleTTSHandler] Progress: ${percent.toFixed(1)}% (${index + 1}/${total})`);
            const msg = window.i18n?.t('subtitle.progress.tts_gen_detail', {
                current: index + 1,
                total: total,
                text: text || ''
            }) || `Generating: ${index + 1}/${total}`;
            
            this.flow.updateProgress(percent, msg);
        };

        const cleanupListener = window.mediaflow.tts.onProgress?.(onProgress);

        try {
            // 构造 Edge 专用的语速语调格式
            let rateStr = (settings.rate >= 0 ? '+' : '') + settings.rate + '%';
            let pitchStr = (settings.pitch >= 0 ? '+' : '') + settings.pitch + 'Hz';

            const result = await window.mediaflow.tts.generateFullAudio({
                subtitles: payload,
                voice: settings.voice || 'zh-CN-XiaoxiaoNeural',
                rate: rateStr,
                pitch: pitchStr,
                style: 'general' // 目前界面未暴露 style 选择，默认为 general
            });

            if (result && result.path) {
                this.markGeneratedDubCaptions(subtitles, preparedSubtitles);
                console.log('[SubtitleTTSHandler] Batch generated:', result.path);
                return result; // Return full object { path, words }
            }
            return null;
        } catch (e) {
            console.error('[SubtitleTTSHandler] Batch generation error:', e);
            throw e;
        } finally {
            this.isProcessing = false;
            if (cleanupListener) cleanupListener();
        }
    }

    /**
     * Stop ongoing batch generation
     */
    stop() {
        if (!this.isProcessing) return;
        console.log('[SubtitleTTSHandler] Stopping process...');
        window.mediaflow?.tts?.stop();
        this.isProcessing = false;
    }

    getSettings() {
        return {
            enabled: document.getElementById('enable-tts')?.checked || false,
            engine: this.ttsEngine?.value || 'edge',
            voice: this.ttsVoice?.value,
            rate: parseInt(this.ttsRate?.value || 100) - 100,
            pitch: parseInt(this.ttsPitch?.value || 0),
            volume: parseInt(this.voiceVolume?.value || 80),
            bgmVolume: parseInt(this.bgmVolume?.value || 30),
            audioMode: document.querySelector('input[name="audio-mode"]:checked')?.value || 'remove'
        };
    }

    /**
     * 合并全局设置与单项本地设置 (单句覆盖全局)
     * @param {Object} sub - 字幕对象
     * @returns {Object} 合并后的设置
     */
    getMergedSettings(sub) {
        const globalSettings = this.getSettings();
        if (!sub || !sub.ttsLocal) return globalSettings;

        const local = sub.ttsLocal;
        return {
            ...globalSettings,
            voice: local.voice || globalSettings.voice,
            rate: local.rate !== undefined ? local.rate : globalSettings.rate,
            pitch: local.pitch !== undefined ? local.pitch : globalSettings.pitch,
            volume: local.volume !== undefined ? local.volume : globalSettings.volume
        };
    }
}

window.SubtitleTTSHandler = SubtitleTTSHandler;
