/**
 * German strings for subtitle.json keys (and toast/style/tts/settings roots in that file).
 * @param {(key: string, de: string) => void} t
 */
module.exports = function registerSubtitleDe(t) {
    // batch / panel / editor
    t('subtitle.placeholder.videoName', 'video.mp4');
    t('subtitle.batch.queue_title', 'Warteschlange');
    t('subtitle.batch.clear_queue', 'Warteschlange leeren');
    t('subtitle.batch.add_folder', 'Hinzufuegen');
    t('subtitle.batch.busy', 'Batch laeuft, bitte warten');
    t('subtitle.batch.queue_empty', 'Warteschlange ist bereits leer');
    t(
        'subtitle.panel.batch_hint',
        'Eintraege markieren fuer Batch-Pruefung / Neuuebersetzen / Loeschen / TTS-Quelle / Zeitverschiebung'
    );
    t('subtitle.panel.selected_count', '{{count}} ausgewaehlt');
    t('subtitle.panel.locate_current', 'Aktuellen Eintrag finden');
    t('subtitle.panel.locate_none', 'Kein Untertitel zum Finden');
    t('subtitle.panel.editing_track', 'Bearbeitung');
    t('subtitle.panel.track_cue_count', '{{count}} Eintraege');
    t('subtitle.panel.toggleOriginal', 'Original');
    t('subtitle.panel.shortcuts_title', 'Tastenkuerzel');
    t('subtitle.search.regex', 'Regex');
    t('subtitle.video.clear_video', 'Video und Untertitel leeren');
    t('subtitle.editor.original_option', 'Original');
    t('subtitle.editor.empty_title', 'Noch keine Untertitel');
    t(
        'subtitle.editor.empty_hint',
        'Medium importieren und Erkennung starten, oder Eintrag manuell hinzufuegen'
    );
    t('subtitle.editor.empty_import', 'Video importieren');
    t('subtitle.editor.empty_ai', 'KI-Erkennung');
    t('subtitle.editor.empty_add', 'Untertitel hinzufuegen');
    t('subtitle.editor.no_filter_match_title', 'Keine Eintraege fuer diesen Filter');
    t('subtitle.editor.no_filter_match_hint', 'Filter auf Alle stellen oder Suche leeren');
    t('subtitle.editor.empty_clear_filter', 'Alle anzeigen');
    t('subtitle.editor.view_label_lite', 'Kompakt');
    t('subtitle.editor.view_label_full', 'Voll');
    t('subtitle.editor.view_lite_on', 'Zur kompakten Liste gewechselt');
    t('subtitle.editor.view_full_on', 'Zur vollen Liste gewechselt');
    t('subtitle.editor.empty_hint_short', 'Zuerst importieren oder erkennen');
    t('subtitle.editor.empty_import_desc', 'Lokale Mediendatei waehlen');
    t('subtitle.editor.empty_ai_desc', 'Untertitel und Uebersetzung erzeugen');
    t('subtitle.editor.empty_add_desc', 'Eintrag von Hand schreiben');
    t('subtitle.editor.no_filter_match_hint_short', 'Anderen Filter versuchen');
    t('subtitle.editor.empty_clear_filter_desc', 'Aktuellen Filter zuruecksetzen');
    t('subtitle.editor.empty_title_ready', 'Medium bereit');
    t('subtitle.editor.empty_hint_ready', 'Erkennung starten oder Eintrag hinzufuegen');
    t('subtitle.editor.empty_import_srt', 'Untertitel importieren');
    t('subtitle.editor.empty_import_srt_desc', 'SRT / ASS / VTT');
    t('subtitle.editor.empty_clear_media', 'Medium leeren');

    // messages (new keys + any en-identical)
    t('subtitle.messages.preparing', 'Umgebung wird vorbereitet...');
    t('subtitle.messages.identifyingBatch', 'Batch-KI-Erkennung laeuft...');
    t('subtitle.messages.translatingBatch', 'Batch-KI-Uebersetzung laeuft...');
    t('subtitle.messages.ttsBatch', 'Batch-KI-Synchronisation laeuft...');
    t('subtitle.messages.noSubData', 'Noch keine Daten. Zuerst Erkennung ausfuehren.');
    t('subtitle.messages.main', 'Haupt-Untertitelspur');
    t('subtitle.messages.watermark', 'Wasserzeichen-Spur');
    t('subtitle.messages.header', 'Titel-Spur');
    t('subtitle.messages.subtitle', 'Externe Untertitelspur');
    t('subtitle.messages.custom', 'Benutzerdefinierte Spur');
    t('subtitle.messages.defaultTrackName', 'Spur {n}');

    // toast
    t('toast.rerecognize_success', 'Erneut erkannt');
    t(
        'toast.rerecognize_success_needs_retranslate',
        'Erneut erkannt - bitte neu uebersetzen'
    );
    t('toast.rerecognize_retranslate_success', 'Erneut erkannt und uebersetzt');
    t('toast.rerecognize_failed', 'Erneute Erkennung fehlgeschlagen');
    t('toast.select_video_first', 'Bitte zuerst ein Video waehlen');
    t('toast.tts_auto_updating', 'TTS wird aktualisiert...');
    t('toast.tts_auto_updated', 'TTS aktualisiert');
    t('toast.tts_sync_failed', 'TTS-Sync fehlgeschlagen');
    t('toast.no_long_subs_found', 'Keine langen Untertitel gefunden');
    t('toast.ai_optimize_all_success', 'KI-Optimierung abgeschlossen');
    t('toast.ai_optimize_failed', 'KI-Optimierung fehlgeschlagen');

    // style
    t('style.typography', 'Typografie');
    t('style.font_family', 'Schriftart');
    t('style.font_size', 'Schriftgroesse');
    t('style.bold', 'Fett');
    t('style.italic', 'Kursiv');
    t('style.position', 'Position');
    t('style.refresh_fonts', 'Schriften aktualisieren');
    t('style.margin_h', 'Horizontaler Rand');
    t('style.margin_v', 'Vertikaler Rand');
    t('style.letter_spacing', 'Zeichenabstand');
    t('style.line_spacing', 'Zeilenabstand');
    t('style.effects', 'Effekte');
    t('style.colors', 'Farben');
    t('style.color_font', 'Textfarbe');
    t('style.color_outline', 'Konturfarbe');
    t('style.outline_width', 'Konturstaerke');
    t('style.karaoke', 'Karaoke');
    t('style.karaoke_style', 'Karaoke-Stil');
    t('style.karaoke_style_highlight', 'Hervorheben');
    t('style.karaoke_style_adaptive', 'Adaptiv');
    t('style.karaoke_style_progress', 'Fortschritt');
    t('style.karaoke_color', 'Karaoke-Farbe');
    t('style.shadows', 'Schatten');
    t('style.presets', 'Vorlagen');
    t('style.preview_placeholder', 'Vorschau');
    t('style.enableBackground', 'Hintergrund aktivieren');
    t('style.bgColor', 'Hintergrundfarbe');
    t('style.opacity', 'Deckkraft');
    t('style.bg_mask', 'Hintergrundmaske');
    t('style.blur_mask', 'Unschaerfe-Maske');
    t('style.mask_height', 'Maskenhoehe');
    t('style.blur_strength', 'Unschaerfe-Staerke');
    t('style.effects_blur', 'Unschaerfe');
    t('style.effects_x', 'X-Versatz');
    t('style.effects_y', 'Y-Versatz');
    t('style.blur_hint', 'Unschaerfe fuer Lesbarkeit hinter dem Text');
    t('style.template', 'Vorlage');
    t('style.saveTemplate', 'Vorlage speichern');
    t('style.deleteTemplate', 'Vorlage loeschen');
    t('style.font', 'Schrift');
    t('style.fontSize', 'Groesse');
    t('style.color', 'Farbe');
    t('style.outline', 'Kontur');
    t('style.coordinates', 'Koordinaten');
    t('style.line_height', 'Zeilenhoehe');
    t('style.border_color', 'Randfarbe');
    t('style.templates.default', 'Standard');
    t('style.templates.yellow', 'Gelb');
    t('style.templates.cinema', 'Kino');
    t('style.templates.custom', 'Benutzerdefiniert');
    t('style.fontWrap', 'Zeilenumbruch');

    // tts
    t('tts.title', 'Sprachausgabe (TTS)');
    t('tts.enable', 'TTS aktivieren');
    t('tts.audio_process', 'Audio-Verarbeitung');
    t('tts.engine', 'Engine');
    t('tts.mode_remove', 'Originalton entfernen');
    t('tts.mode_keep', 'Originalton behalten');
    t('tts.engineOptions.edge', 'Edge TTS');
    t('tts.engineOptions.openai', 'OpenAI');
    t('tts.engineOptions.elevenlabs', 'ElevenLabs');
    t('tts.openaiKey', 'OpenAI API-Key');
    t('tts.elevenKey', 'ElevenLabs API-Key');
    t('tts.lang', 'Sprache');
    t('tts.voice', 'Stimme');
    t('tts.preview', 'Vorschau');
    t('tts.local_settings', 'Lokale Einstellungen');
    t('tts.reset', 'Zuruecksetzen');
    t('tts.generating', 'Wird erzeugt...');
    t('tts.playing', 'Wiedergabe...');
    t('tts.loading', 'Laden...');
    t('tts.load_failed', 'Laden fehlgeschlagen');
    t('tts.preview_text_default', 'Dies ist eine Vorschau der gewaehlten Stimme.');
    t('tts.emotion', 'Emotion');
    t('tts.speed', 'Geschwindigkeit');
    t('tts.pitch', 'Tonhoehe');
    t('tts.origAudio', 'Original-Audio');
    t('tts.preview_text.zh', 'Dies ist eine Stimmvorschau.');
    t('tts.preview_text.en', 'This is a voice preview.');
    t('tts.preview_text.ja', 'これは音声プレビューです。');
    t('tts.preview_text.ko', '이것은 음성 미리듣기입니다.');
    t('tts.preview_text.fr', 'Ceci est un apercu de la voix.');
    t('tts.preview_text.de', 'Dies ist eine Stimmvorschau.');
    t('tts.preview_text.es', 'Esta es una vista previa de la voz.');
    t('tts.preview_text.ru', 'Это предварительное прослушивание голоса.');
    t('tts.preview_text.pt', 'Esta e uma pre-visualizacao da voz.');
    t('tts.preview_text.it', 'Questa e un anteprima della voce.');
    t('tts.preview_text.hi', 'यह आवाज़ का पूर्वावलोकन है।');
    t('tts.preview_text.th', 'นี่คือตัวอย่างเสียง');
    t('tts.preview_text.vi', 'Day la ban xem truoc giong noi.');
    t('tts.preview_text.id', 'Ini adalah pratinjau suara.');
    t('tts.modes.remove', 'Originalton entfernen');
    t('tts.modes.keepOriginal', 'Originalton behalten');
    t('tts.modes.keepBgm', 'Nur BGM behalten');
    t('tts.modes.customBgm', 'Eigenes BGM');
    t('tts.selectBgm', 'BGM waehlen');
    t('tts.voiceVolume', 'Stimm-Lautstaerke');
    t('tts.bgmVolume', 'BGM-Lautstaerke');
    t('tts.filters.all', 'Alle');
    t('tts.filters.common', 'Haeufig');
    t('tts.filters.other', 'Weitere');
    t('tts.languages.zh', 'Chinesisch');
    t('tts.languages.en', 'Englisch');
    t('tts.languages.ja', 'Japanisch');
    t('tts.languages.ko', 'Koreanisch');
    t('tts.languages.fr', 'Franzoesisch');
    t('tts.languages.de', 'Deutsch');
    t('tts.languages.es', 'Spanisch');
    t('tts.languages.ru', 'Russisch');
    t('tts.languages.pt', 'Portugiesisch');
    t('tts.languages.it', 'Italienisch');
    t('tts.languages.id', 'Indonesisch');
    t('tts.languages.vi', 'Vietnamesisch');
    t('tts.languages.th', 'Thai');
    t('tts.languages.ms', 'Malaiisch');
    t('tts.languages.hi', 'Hindi');
    t('tts.languages.ar', 'Arabisch');
    t('tts.languages.tr', 'Tuerkisch');
    t('tts.languages.nl', 'Niederlaendisch');
    t('tts.languages.pl', 'Polnisch');
    t('tts.languages.sv', 'Schwedisch');
    t('tts.languages.da', 'Daenisch');
    t('tts.languages.no', 'Norwegisch');
    t('tts.languages.fi', 'Finnisch');
    t('tts.languages.cs', 'Tschechisch');
    t('tts.languages.ro', 'Rumaenisch');
    t('tts.languages.bg', 'Bulgarisch');
    t('tts.languages.el', 'Griechisch');
    t('tts.languages.he', 'Hebraeisch');
    t('tts.languages.hu', 'Ungarisch');
    t('tts.languages.uk', 'Ukrainisch');
    t('tts.languages.sk', 'Slowakisch');
    t('tts.languages.hr', 'Kroatisch');
    t('tts.languages.af', 'Afrikaans');
    // voice names often stay as product IDs
    t('tts.voices.en-US-AriaNeural', 'Aria (EN-US)');
    t('tts.voices.ja-JP-NanamiNeural', 'Nanami (JA)');
    t('tts.voices.ja-JP-KeitaNeural', 'Keita (JA)');
    t('tts.voices.ko-KR-SunHiNeural', 'SunHi (KO)');
    t('tts.voices.ko-KR-InJoonNeural', 'InJoon (KO)');
    t('tts.voices.zh-CN-liaoning-XiaobeiNeural', 'Xiaobei Liaoning (ZH)');
    t('tts.voices.zh-CN-shaanxi-XiaoniNeural', 'Xiaoni Shaanxi (ZH)');

    // settings block inside subtitle.json
    t('settings.input_mode', 'Eingabemodus');
    t('settings.single_file', 'Einzeldatei');
    t('settings.batch_mode', 'Batch-Verarbeitung');
    t('settings.inputSource', 'Eingabequelle');
    t('settings.singleVideo', 'Einzelvideo');
    t('settings.batchFolder', 'Batch-Ordner');
    t('settings.workMode', 'Arbeitsmodus');
    t('settings.recognition', 'Untertitelerkennung');
    t('settings.import_srt', 'SRT importieren');
    t('settings.manual_input', 'Manuelle Eingabe');
    t('settings.select_srt', 'SRT-Datei waehlen');
    t('settings.auto_translate', 'Automatisch uebersetzen');
    t('settings.aiRecognize', 'KI erkennen und uebersetzen');
    t('settings.importFile', 'Untertiteldatei importieren');
    t('settings.manualCaption', 'Kommentar manuell schreiben');
    t('settings.importSrt', 'SRT/ASS-Datei importieren');
    t('settings.translation', 'Uebersetzungseinstellungen');
    t('settings.lang_settings', 'Spracheinstellungen');
    t('settings.style_hint', 'Stilhinweis');
    t(
        'settings.style_hint_placeholder',
        'z. B. humorvoll, umgangssprachlich, akademisch...'
    );
    t('settings.inspector.show', 'Details anzeigen');
    t('settings.inspector.hide', 'Details ausblenden');
    t('settings.sourceLang', 'Quellsprache');
    t('settings.targetLang', 'Zielsprache');
    t('settings.keep_bilingual', 'Zweisprachige Anzeige behalten');
    t('settings.length_optimize', 'Lange Saetze');
    t('settings.optimize_strategy', 'Optimierungsstrategie');
    t('settings.max_chars', 'Zeichen pro Zeile');
    t('settings.max_lines', 'Max. Zeilen');
    t('settings.templates.custom', 'Benutzerdefinierter Stil');
    t('settings.strategyOptions.split', 'Intelligent teilen');
    t('settings.strategyOptions.wrap', 'Zeilenumbruch erzwingen');
    t('settings.strategyOptions.scale', 'Visuell skalieren');
    t('settings.engine', 'Erkennungs-/Uebersetzungs-Engine');
    t(
        'settings.engineHint',
        'Erkennung und Uebersetzung teilen diese Engine (API-Key in den Einstellungen)'
    );
    t('settings.engineOptions.groq', 'Groq (kostenlos empfohlen)');
    t('settings.engineOptions.openai', 'OpenAI');
    t('settings.engineOptions.gemini', 'Gemini (empfohlen)');
    t('settings.engineOptions.siliconflow', 'SiliconFlow');
    t('settings.engineOptions.deepl', 'DeepL');
    t('settings.lang.auto', 'Automatisch erkennen');
    t('settings.lang.en', 'Englisch');
    t('settings.lang.zh', 'Chinesisch');
    t('settings.lang.ja', 'Japanisch');
    t('settings.lang.ko', 'Koreanisch');
    t('settings.lang.fr', 'Franzoesisch');
    t('settings.lang.de', 'Deutsch');
    t('settings.lang.es', 'Spanisch');
    t('settings.lang.ru', 'Russisch');
    t('settings.lang.it', 'Italienisch');
    t('settings.lang.pt', 'Portugiesisch');
    t('settings.lang.vi', 'Vietnamesisch');
    t('settings.lang.id', 'Indonesisch');
    t('settings.lang.th', 'Thai');
    t('settings.lang.tr', 'Tuerkisch');
    t('settings.lang.ar', 'Arabisch');
    t('settings.lang.hi', 'Hindi');
    t('settings.lang.zhHans', 'Vereinfachtes Chinesisch');
    t('settings.lang.zhHant', 'Traditionelles Chinesisch');
    t('settings.lang.sourceOnly', 'Nur Transkript (Originalsprache behalten)');
    t('settings.select_preset', 'Vorlage waehlen');
    t('settings.save_preset', 'Stil speichern');
    t('settings.import_preset', 'Vorlage importieren');
    t('settings.export_preset', 'Vorlage exportieren');
    t('settings.fontOptions.msYaHei', 'Microsoft YaHei (Standard)');
    t('settings.fontOptions.simHei', 'SimHei (kompatibel)');
    t('settings.fontOptions.arial', 'Arial (Latein)');
    t('settings.posOptions.bottomCenter', 'Unten mittig');
    t('settings.posOptions.topCenter', 'Oben mittig');
    t('settings.posOptions.custom', 'Benutzerdefinierte Position');
    t('settings.placeholder.outputPath', 'Ausgabeordner waehlen...');
    t('settings.placeholder.inputTemplateName', 'Vorlagennamen eingeben');
};
