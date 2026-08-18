/**
 * Japanese strings for subtitle.json roots (subtitle / toast / style / tts / settings / …)
 * @param {(key: string, ja: string) => void} t
 */
module.exports = function registerSubtitleJa(t) {
    t('subtitle.placeholder.videoName', 'video.mp4');
    t('subtitle.placeholder.videoDuration', '00:00:00');
    t('subtitle.batch.queue_title', 'キュー');
    t('subtitle.batch.clear_queue', 'キューをクリア');
    t('subtitle.batch.add_folder', '追加');
    t('subtitle.batch.busy', 'バッチ処理中です。しばらくお待ちください');
    t('subtitle.batch.queue_empty', 'キューは既に空です');
    t(
        'subtitle.panel.batch_hint',
        'チェックした行に一括レビュー / 再翻訳 / 削除 / TTS ソース / 時間シフト'
    );
    t('subtitle.panel.selected_count', '{{count}} 件選択');
    t('subtitle.panel.locate_current', '現在の行を表示');
    t('subtitle.panel.locate_none', '表示する字幕がありません');
    t('subtitle.panel.editing_track', '編集中');
    t('subtitle.panel.track_cue_count', '{{count}} 行');
    t('subtitle.panel.toggleOriginal', '原文');
    t('subtitle.panel.shortcuts_title', 'キーボードショートカット');
    t('subtitle.search.regex', '正規表現');
    t('subtitle.video.clear_video', '動画と字幕をクリア');
    t('subtitle.editor.original_option', '原文');
    t('subtitle.editor.empty_title', 'まだ字幕がありません');
    t(
        'subtitle.editor.empty_hint',
        'メディアを取り込み認識を実行するか、手動で行を追加してください'
    );
    t('subtitle.editor.empty_import', '動画を取り込む');
    t('subtitle.editor.empty_ai', 'AI 認識');
    t('subtitle.editor.empty_add', '字幕を追加');
    t('subtitle.editor.no_filter_match_title', 'このフィルタに一致する行がありません');
    t('subtitle.editor.no_filter_match_hint', 'フィルタを「すべて」にするか検索をクリア');
    t('subtitle.editor.empty_clear_filter', 'すべて表示');
    t('subtitle.editor.view_label_lite', '簡易');
    t('subtitle.editor.view_label_full', '詳細');
    t('subtitle.editor.view_lite_on', '簡易リストに切り替えました');
    t('subtitle.editor.view_full_on', '詳細リストに切り替えました');
    t('subtitle.editor.empty_hint_short', '取り込みまたは認識から開始');
    t('subtitle.editor.empty_import_desc', 'ローカルのメディアファイルを選択');
    t('subtitle.editor.empty_ai_desc', '字幕と翻訳を生成');
    t('subtitle.editor.empty_add_desc', '手書きで行を追加');
    t('subtitle.editor.no_filter_match_hint_short', '別のフィルタを試す');
    t('subtitle.editor.empty_clear_filter_desc', '現在のフィルタを解除');
    t('subtitle.editor.empty_title_ready', 'メディア準備完了');
    t('subtitle.editor.empty_hint_ready', '認識を実行するか行を追加');
    t('subtitle.editor.empty_import_srt', '字幕を取り込む');
    t('subtitle.editor.empty_import_srt_desc', 'SRT / ASS / VTT');
    t('subtitle.editor.empty_clear_media', 'メディアをクリア');
    t('subtitle.editor.empty_clear_media_desc', '動画を削除してプロジェクトをリセット');

    t('subtitle.messages.preparing', '環境を準備しています…');
    t('subtitle.messages.identifyingBatch', 'バッチ AI 認識中…');
    t('subtitle.messages.translatingBatch', 'バッチ AI 翻訳中…');
    t('subtitle.messages.ttsBatch', 'バッチ AI 音声中…');
    t('subtitle.messages.noSubData', 'データがありません。先に認識を実行してください');
    t('subtitle.messages.main', 'メイン字幕トラック');
    t('subtitle.messages.watermark', 'ウォーターマークトラック');
    t('subtitle.messages.header', 'タイトルトラック');
    t('subtitle.messages.subtitle', '外部字幕トラック');
    t('subtitle.messages.custom', 'カスタムトラック');
    t('subtitle.messages.defaultTrackName', 'トラック {n}');
    t('subtitle.messages.nothing_to_clear', 'クリアするものがありません');

    t('toast.rerecognize_success', '再認識しました');
    t('toast.rerecognize_success_needs_retranslate', '再認識しました — 再翻訳してください');
    t('toast.rerecognize_retranslate_success', '再認識して翻訳しました');
    t('toast.rerecognize_failed', '再認識に失敗しました');
    t('toast.select_video_first', '先に動画を選択してください');
    t('toast.tts_auto_updating', 'TTS を更新中…');
    t('toast.tts_auto_updated', 'TTS を更新しました');
    t('toast.tts_sync_failed', 'TTS 同期に失敗しました');
    t('toast.no_long_subs_found', '長い字幕は見つかりませんでした');
    t('toast.ai_optimize_all_success', 'AI 最適化が完了しました');
    t('toast.ai_optimize_failed', 'AI 最適化に失敗しました');

    t('style.typography', 'タイポグラフィ');
    t('style.font_family', 'フォント');
    t('style.font_size', 'サイズ');
    t('style.bold', '太字');
    t('style.italic', '斜体');
    t('style.position', '位置');
    t('style.refresh_fonts', 'フォントを更新');
    t('style.margin_h', '左右余白');
    t('style.margin_v', '上下余白');
    t('style.letter_spacing', '字間');
    t('style.line_spacing', '行間');
    t('style.effects', '効果');
    t('style.colors', '色');
    t('style.color_font', '文字色');
    t('style.color_outline', '縁取り色');
    t('style.outline_width', '縁取り幅');
    t('style.karaoke', 'カラオケ');
    t('style.karaoke_style', 'カラオケスタイル');
    t('style.karaoke_style_highlight', 'ハイライト');
    t('style.karaoke_style_adaptive', 'アダプティブ');
    t('style.karaoke_style_progress', 'プログレス');
    t('style.karaoke_color', 'カラオケ色');
    t('style.shadows', '影');
    t('style.presets', 'プリセット');
    t('style.preview_placeholder', 'プレビュー');
    t('style.enableBackground', '背景を有効化');
    t('style.bgColor', '背景色');
    t('style.opacity', '不透明度');
    t('style.bg_mask', '背景マスク');
    t('style.blur_mask', 'ぼかしマスク');
    t('style.mask_height', 'マスク高さ');
    t('style.blur_strength', 'ぼかし強度');
    t('style.effects_blur', 'ぼかし');
    t('style.effects_x', 'X オフセット');
    t('style.effects_y', 'Y オフセット');
    t('style.blur_hint', '文字の背後にぼかしを入れて読みやすく');
    t('style.template', 'テンプレート');
    t('style.saveTemplate', 'テンプレートを保存');
    t('style.deleteTemplate', 'テンプレートを削除');
    t('style.font', 'フォント');
    t('style.fontSize', 'サイズ');
    t('style.color', '色');
    t('style.outline', '縁取り');
    t('style.coordinates', '座標');
    t('style.line_height', '行の高さ');
    t('style.border_color', '枠線色');
    t('style.templates.default', '標準');
    t('style.templates.yellow', 'イエロー');
    t('style.templates.cinema', 'シネマ');
    t('style.templates.custom', 'カスタム');
    t('style.fontWrap', '折り返し');

    t('tts.title', '音声読み上げ (TTS)');
    t('tts.enable', 'TTS を有効化');
    t('tts.audio_process', '音声処理');
    t('tts.engine', 'エンジン');
    t('tts.mode_remove', '原音を削除');
    t('tts.mode_keep', '原音を残す');
    t('tts.engineOptions.edge', 'Edge TTS');
    t('tts.engineOptions.openai', 'OpenAI');
    t('tts.engineOptions.elevenlabs', 'ElevenLabs');
    t('tts.openaiKey', 'OpenAI API キー');
    t('tts.elevenKey', 'ElevenLabs API キー');
    t('tts.lang', '言語');
    t('tts.voice', '声');
    t('tts.preview', 'プレビュー');
    t('tts.local_settings', 'ローカル設定');
    t('tts.reset', 'リセット');
    t('tts.generating', '生成中…');
    t('tts.playing', '再生中…');
    t('tts.loading', '読み込み中…');
    t('tts.load_failed', '読み込みに失敗しました');
    t('tts.preview_text_default', '選択した声のプレビューです。');
    t('tts.emotion', '感情');
    t('tts.speed', '速度');
    t('tts.pitch', 'ピッチ');
    t('tts.origAudio', '原音');
    // keep language-native samples for preview_text.*
    t('tts.preview_text.zh', '这是一个语音试听测试，效果怎么样？');
    t('tts.preview_text.en', 'This is a voice preview test, how does it sound?');
    t('tts.preview_text.ja', 'これは音声プレビューテストです。効果はどうですか？');
    t('tts.preview_text.ko', '이것은 음성 미리듣기 테스트입니다. 효과가 어떻습니까?');
    t('tts.preview_text.fr', "Ceci est un test de prévisualisation vocale. Qu'en pensez-vous ?");
    t('tts.preview_text.de', 'Dies ist ein Sprachtest. Wie hört es sich an?');
    t('tts.preview_text.es', 'Esta es una prueba de vista previa de voz. ¿Cómo suena?');
    t('tts.preview_text.ru', 'Это тест предварительного прослушивания голоса. Как это звучит?');
    t('tts.preview_text.pt', 'Este é um teste de visualização de voz. Como soa?');
    t('tts.preview_text.it', 'Questa è un anteprima della voce.');
    t('tts.preview_text.hi', 'यह एक वॉयस प्रीव्यू टेस्ट है। यह कैसा लग रहा है?');
    t('tts.preview_text.th', 'นี่คือการทดสอบตัวอย่างเสียง เสียงเป็นอย่างไรบ้าง?');
    t('tts.preview_text.vi', 'Đây là bản thử nghiệm giọng nói. Nghe như thế nào?');
    t('tts.preview_text.id', 'Ini adalah tes pratinjau suara. Bagaimana kedengarannya?');
    t('tts.modes.remove', '原音を削除');
    t('tts.modes.keepOriginal', '原音を残す');
    t('tts.modes.keepBgm', 'BGM のみ残す');
    t('tts.modes.customBgm', 'カスタム BGM');
    t('tts.selectBgm', 'BGM を選択');
    t('tts.voiceVolume', '声の音量');
    t('tts.bgmVolume', 'BGM 音量');
    t('tts.filters.all', 'すべて');
    t('tts.filters.common', 'よく使う');
    t('tts.filters.other', 'その他');
    t('tts.languages.zh', '中国語');
    t('tts.languages.en', '英語');
    t('tts.languages.ja', '日本語');
    t('tts.languages.ko', '韓国語');
    t('tts.languages.fr', 'フランス語');
    t('tts.languages.de', 'ドイツ語');
    t('tts.languages.es', 'スペイン語');
    t('tts.languages.ru', 'ロシア語');
    t('tts.languages.pt', 'ポルトガル語');
    t('tts.languages.it', 'イタリア語');
    t('tts.languages.id', 'インドネシア語');
    t('tts.languages.vi', 'ベトナム語');
    t('tts.languages.th', 'タイ語');
    t('tts.languages.ms', 'マレー語');
    t('tts.languages.hi', 'ヒンディー語');
    t('tts.languages.ar', 'アラビア語');
    t('tts.languages.tr', 'トルコ語');
    t('tts.languages.nl', 'オランダ語');
    t('tts.languages.pl', 'ポーランド語');
    t('tts.languages.sv', 'スウェーデン語');
    t('tts.languages.da', 'デンマーク語');
    t('tts.languages.no', 'ノルウェー語');
    t('tts.languages.fi', 'フィンランド語');
    t('tts.languages.cs', 'チェコ語');
    t('tts.languages.ro', 'ルーマニア語');
    t('tts.languages.bg', 'ブルガリア語');
    t('tts.languages.el', 'ギリシャ語');
    t('tts.languages.he', 'ヘブライ語');
    t('tts.languages.hu', 'ハンガリー語');
    t('tts.languages.uk', 'ウクライナ語');
    t('tts.languages.sk', 'スロバキア語');
    t('tts.languages.hr', 'クロアチア語');
    t('tts.languages.af', 'アフリカーンス語');
    t('tts.voices.en-US-AriaNeural', 'Aria (EN-US)');
    t('tts.voices.ja-JP-NanamiNeural', '七海 (JA)');
    t('tts.voices.ja-JP-KeitaNeural', '圭太 (JA)');
    t('tts.voices.ko-KR-SunHiNeural', 'SunHi (KO)');
    t('tts.voices.ko-KR-InJoonNeural', 'InJoon (KO)');
    t('tts.voices.zh-CN-liaoning-XiaobeiNeural', 'Xiaobei 遼寧 (ZH)');
    t('tts.voices.zh-CN-shaanxi-XiaoniNeural', 'Xiaoni 陝西 (ZH)');

    // settings inside subtitle.json (critical for merge order)
    t('settings.input_mode', '入力モード');
    t('settings.single_file', '単一ファイル');
    t('settings.batch_mode', 'バッチ処理');
    t('settings.inputSource', '入力ソース');
    t('settings.singleVideo', '単一動画');
    t('settings.batchFolder', 'バッチフォルダ');
    t('settings.workMode', '作業モード');
    t('settings.recognition', '字幕認識');
    t('settings.ai_auto', 'AI 自動');
    t('settings.import_srt', 'SRT を取り込む');
    t('settings.manual_input', '手動入力');
    t('settings.select_srt', 'SRT ファイルを選択');
    t('settings.auto_translate', '自動翻訳');
    t('settings.aiRecognize', 'AI 認識・翻訳');
    t('settings.importFile', '字幕ファイルを取り込む');
    t('settings.manualCaption', '手動で台本を書く');
    t('settings.importSrt', 'SRT/ASS を取り込む');
    t('settings.translation', '翻訳設定');
    t('settings.lang_settings', '言語設定');
    t('settings.style_hint', 'スタイルメモ');
    t(
        'settings.style_hint_placeholder',
        '例: くだけた口調、ユーモア、学術的に…'
    );
    t('settings.inspector.show', '詳細設定');
    t('settings.inspector.hide', '詳細を隠す');
    t('settings.sourceLang', 'ソース言語');
    t('settings.targetLang', 'ターゲット言語');
    t('settings.keep_bilingual', '二言語表示を残す');
    t('settings.length_optimize', '長い文の処理');
    t('settings.optimize_strategy', '最適化戦略');
    t('settings.max_chars', '1 行の上限');
    t('settings.max_lines', '最大行数');
    t('settings.templates.custom', 'カスタムスタイル');
    t('settings.strategyOptions.split', 'スマート分割');
    t('settings.strategyOptions.wrap', '強制折り返し');
    t('settings.strategyOptions.scale', '見た目スケール');
    t('settings.engine', '認識 / 翻訳エンジン');
    t(
        'settings.engineHint',
        '認識とその後の翻訳で同じエンジンを共有します（設定で API キーを構成）'
    );
    t('settings.engineOptions.groq', 'Groq（無料おすすめ）');
    t('settings.engineOptions.openai', 'OpenAI');
    t('settings.engineOptions.gemini', 'Gemini（おすすめ）');
    t('settings.engineOptions.siliconflow', 'SiliconFlow');
    t('settings.engineOptions.deepl', 'DeepL');
    t('settings.lang.auto', '自動検出');
    t('settings.lang.en', '英語');
    t('settings.lang.zh', '中国語');
    t('settings.lang.ja', '日本語');
    t('settings.lang.ko', '韓国語');
    t('settings.lang.fr', 'フランス語');
    t('settings.lang.de', 'ドイツ語');
    t('settings.lang.es', 'スペイン語');
    t('settings.lang.ru', 'ロシア語');
    t('settings.lang.it', 'イタリア語');
    t('settings.lang.pt', 'ポルトガル語');
    t('settings.lang.vi', 'ベトナム語');
    t('settings.lang.id', 'インドネシア語');
    t('settings.lang.th', 'タイ語');
    t('settings.lang.tr', 'トルコ語');
    t('settings.lang.ar', 'アラビア語');
    t('settings.lang.hi', 'ヒンディー語');
    t('settings.lang.zhHans', '簡体字中国語');
    t('settings.lang.zhHant', '繁体字中国語');
    t('settings.lang.sourceOnly', '文字起こしのみ（原語を保持）');
    t('settings.select_preset', 'テンプレートを選択');
    t('settings.save_preset', 'スタイルを保存');
    t('settings.import_preset', 'テンプレートを取り込む');
    t('settings.export_preset', 'テンプレートを書き出す');
    t('settings.fontOptions.msYaHei', 'Microsoft YaHei（既定）');
    t('settings.fontOptions.simHei', 'SimHei（互換）');
    t('settings.fontOptions.arial', 'Arial（欧文）');
    t('settings.posOptions.bottomCenter', '下中央');
    t('settings.posOptions.topCenter', '上中央');
    t('settings.posOptions.custom', 'カスタム位置');
    t('settings.placeholder.outputPath', '出力フォルダを選択…');
    t('settings.placeholder.inputTemplateName', 'テンプレート名を入力');

    // nested subtitle.settings / actions / export / tts / toast / confirm
    t(
        'subtitle.settings.engineHint',
        '認識と翻訳で同じエンジンを共有します（設定で API キーを構成）'
    );
    t('subtitle.settings.engineOptions.openai', 'OpenAI');
    t('subtitle.settings.engineOptions.siliconflow', 'SiliconFlow');
    t('subtitle.settings.engineOptions.deepl', 'DeepL');
    t('subtitle.settings.lang.hi', 'ヒンディー語');
    t(
        'subtitle.actions.aiProcess_tip_with_engine',
        '現在のエンジン（{engine}）で認識と翻訳を行います。設定で変更できます。'
    );
    t('subtitle.export.precheck_title', '焼き込み前チェック（{{count}} 行）');
    t('subtitle.export.precheck_continue', 'このまま焼き込みを続けますか？');
    t('subtitle.tts.engine', 'エンジン');
    t('subtitle.tts.engineOptions.openai', 'OpenAI TTS');
    t('subtitle.tts.engineOptions.elevenlabs', 'ElevenLabs');
    t('subtitle.tts.emotion', '感情');
    t('subtitle.toast.undo_hint', '（Ctrl+Z で元に戻す）');
    t('subtitle.toast.media_cleared', 'メディアと字幕をクリアしました');
    t('subtitle.toast.batch_queue_cleared', 'バッチキューをクリアしました');
    t(
        'subtitle.confirm.clear_media',
        '現在の動画とすべての字幕をクリアしますか？いつでも再取り込みできます。'
    );
    t(
        'subtitle.confirm.clear_batch_queue',
        'バッチキュー（{count} ファイル）をクリアしますか？現在のメディアもクリアされます。'
    );

    // keep multi-lang preview samples under subtitle.tts if present
    t('subtitle.tts.preview_text.zh', '这是一个语音试听测试，效果怎么样？');
    t('subtitle.tts.preview_text.en', 'This is a voice preview test, how does it sound?');
    t('subtitle.tts.preview_text.ja', 'これは音声プレビューテストです。効果はどうですか？');
    t('subtitle.tts.preview_text.ko', '이것은 음성 미리듣기 테스트입니다. 효과가 어떻습니까?');
    t(
        'subtitle.tts.preview_text.fr',
        "Ceci est un test de prévisualisation vocale. Qu'en pensez-vous ?"
    );
    t('subtitle.tts.preview_text.de', 'Dies ist ein Sprachtest. Wie hört es sich an?');
    t('subtitle.tts.preview_text.es', 'Esta es una prueba de vista previa de voz. ¿Cómo suena?');
    t(
        'subtitle.tts.preview_text.ru',
        'Это тест предварительного прослушивания голоса. Как это звучит?'
    );
    t('subtitle.tts.preview_text.pt', 'Este é um teste de visualização de voz. Como soa?');
    t('subtitle.tts.preview_text.hi', 'यह एक वॉयस प्रीव्यू टेस्ट है। यह कैसा लग रहा है?');
    t('subtitle.tts.preview_text.th', 'นี่คือการทดสอบตัวอย่างเสียง เสียงเป็นอย่างไรบ้าง?');
    t('subtitle.tts.preview_text.vi', 'Đây là bản thử nghiệm giọng nói. Nghe như thế nào?');
    t('subtitle.tts.preview_text.id', 'Ini adalah tes pratinjau suara. Bagaimana kedengarannya?');
};
