/**
 * Korean strings for subtitle.json roots
 * @param {(key: string, ko: string) => void} t
 */
module.exports = function registerSubtitleKo(t) {
    t('subtitle.placeholder.videoName', 'video.mp4');
    t('subtitle.placeholder.videoDuration', '00:00:00');
    t('subtitle.batch.queue_title', '대기열');
    t('subtitle.batch.clear_queue', '대기열 비우기');
    t('subtitle.batch.add_folder', '추가');
    t('subtitle.batch.busy', '배치 작업 중입니다. 잠시 기다려 주세요');
    t('subtitle.batch.queue_empty', '대기열이 이미 비어 있습니다');
    t(
        'subtitle.panel.batch_hint',
        '선택한 줄에 일괄 검토 / 재번역 / 삭제 / TTS 소스 / 시간 이동'
    );
    t('subtitle.panel.selected_count', '{{count}}개 선택');
    t('subtitle.panel.locate_current', '현재 줄 찾기');
    t('subtitle.panel.locate_none', '찾을 자막이 없습니다');
    t('subtitle.panel.editing_track', '편집 중');
    t('subtitle.panel.track_cue_count', '{{count}}줄');
    t('subtitle.panel.toggleOriginal', '원문');
    t('subtitle.panel.shortcuts_title', '키보드 단축키');
    t('subtitle.search.regex', '정규식');
    t('subtitle.video.clear_video', '동영상과 자막 지우기');
    t('subtitle.editor.original_option', '원문');
    t('subtitle.editor.empty_title', '아직 자막이 없습니다');
    t(
        'subtitle.editor.empty_hint',
        '미디어를 가져와 인식을 실행하거나 수동으로 줄을 추가하세요'
    );
    t('subtitle.editor.empty_import', '동영상 가져오기');
    t('subtitle.editor.empty_ai', 'AI 인식');
    t('subtitle.editor.empty_add', '자막 추가');
    t('subtitle.editor.no_filter_match_title', '이 필터에 맞는 줄이 없습니다');
    t('subtitle.editor.no_filter_match_hint', '필터를 전체로 바꾸거나 검색을 지우세요');
    t('subtitle.editor.empty_clear_filter', '모두 보기');
    t('subtitle.editor.view_label_lite', '간단');
    t('subtitle.editor.view_label_full', '전체');
    t('subtitle.editor.view_lite_on', '간단 목록으로 전환됨');
    t('subtitle.editor.view_full_on', '전체 목록으로 전환됨');
    t('subtitle.editor.empty_hint_short', '가져오기 또는 인식부터 시작');
    t('subtitle.editor.empty_import_desc', '로컬 미디어 파일 선택');
    t('subtitle.editor.empty_ai_desc', '자막과 번역 생성');
    t('subtitle.editor.empty_add_desc', '손으로 줄 작성');
    t('subtitle.editor.no_filter_match_hint_short', '다른 필터 시도');
    t('subtitle.editor.empty_clear_filter_desc', '현재 필터 해제');
    t('subtitle.editor.empty_title_ready', '미디어 준비됨');
    t('subtitle.editor.empty_hint_ready', '인식을 실행하거나 줄을 추가하세요');
    t('subtitle.editor.empty_import_srt', '자막 가져오기');
    t('subtitle.editor.empty_import_srt_desc', 'SRT / ASS / VTT');
    t('subtitle.editor.empty_clear_media', '미디어 지우기');
    t('subtitle.editor.empty_clear_media_desc', '동영상을 제거하고 프로젝트 초기화');

    t('subtitle.messages.preparing', '환경을 준비하는 중…');
    t('subtitle.messages.identifyingBatch', '배치 AI 인식 중…');
    t('subtitle.messages.translatingBatch', '배치 AI 번역 중…');
    t('subtitle.messages.ttsBatch', '배치 AI 더빙 중…');
    t('subtitle.messages.noSubData', '데이터가 없습니다. 먼저 인식을 실행하세요');
    t('subtitle.messages.main', '메인 자막 트랙');
    t('subtitle.messages.watermark', '워터마크 트랙');
    t('subtitle.messages.header', '타이틀 트랙');
    t('subtitle.messages.subtitle', '외부 자막 트랙');
    t('subtitle.messages.custom', '사용자 지정 트랙');
    t('subtitle.messages.defaultTrackName', '트랙 {n}');
    t('subtitle.messages.nothing_to_clear', '지울 항목이 없습니다');

    t('toast.rerecognize_success', '다시 인식했습니다');
    t('toast.rerecognize_success_needs_retranslate', '다시 인식했습니다 — 다시 번역하세요');
    t('toast.rerecognize_retranslate_success', '다시 인식하고 번역했습니다');
    t('toast.rerecognize_failed', '다시 인식 실패');
    t('toast.select_video_first', '먼저 동영상을 선택하세요');
    t('toast.tts_auto_updating', 'TTS 업데이트 중…');
    t('toast.tts_auto_updated', 'TTS 업데이트됨');
    t('toast.tts_sync_failed', 'TTS 동기화 실패');
    t('toast.no_long_subs_found', '긴 자막을 찾지 못했습니다');
    t('toast.ai_optimize_all_success', 'AI 최적화 완료');
    t('toast.ai_optimize_failed', 'AI 최적화 실패');

    t('style.typography', '타이포그래피');
    t('style.font_family', '글꼴');
    t('style.font_size', '크기');
    t('style.bold', '굵게');
    t('style.italic', '기울임');
    t('style.position', '위치');
    t('style.refresh_fonts', '글꼴 새로고침');
    t('style.margin_h', '가로 여백');
    t('style.margin_v', '세로 여백');
    t('style.letter_spacing', '자간');
    t('style.line_spacing', '행간');
    t('style.effects', '효과');
    t('style.colors', '색상');
    t('style.color_font', '글자 색');
    t('style.color_outline', '외곽선 색');
    t('style.outline_width', '외곽선 두께');
    t('style.karaoke', '가라오케');
    t('style.karaoke_style', '가라오케 스타일');
    t('style.karaoke_style_highlight', '강조');
    t('style.karaoke_style_adaptive', '적응형');
    t('style.karaoke_style_progress', '진행');
    t('style.karaoke_color', '가라오케 색');
    t('style.shadows', '그림자');
    t('style.presets', '프리셋');
    t('style.preview_placeholder', '미리보기');
    t('style.enableBackground', '배경 사용');
    t('style.bgColor', '배경색');
    t('style.opacity', '불투명도');
    t('style.bg_mask', '배경 마스크');
    t('style.blur_mask', '블러 마스크');
    t('style.mask_height', '마스크 높이');
    t('style.blur_strength', '블러 강도');
    t('style.effects_blur', '블러');
    t('style.effects_x', 'X 오프셋');
    t('style.effects_y', 'Y 오프셋');
    t('style.blur_hint', '글자 뒤에 블러를 넣어 가독성 향상');
    t('style.template', '템플릿');
    t('style.saveTemplate', '템플릿 저장');
    t('style.deleteTemplate', '템플릿 삭제');
    t('style.font', '글꼴');
    t('style.fontSize', '크기');
    t('style.color', '색');
    t('style.outline', '외곽선');
    t('style.coordinates', '좌표');
    t('style.line_height', '줄 높이');
    t('style.border_color', '테두리 색');
    t('style.templates.default', '기본');
    t('style.templates.yellow', '노랑');
    t('style.templates.cinema', '시네마');
    t('style.templates.custom', '사용자 지정');
    t('style.fontWrap', '줄바꿈');

    t('tts.title', '음성 합성 (TTS)');
    t('tts.enable', 'TTS 사용');
    t('tts.audio_process', '오디오 처리');
    t('tts.engine', '엔진');
    t('tts.mode_remove', '원음 제거');
    t('tts.mode_keep', '원음 유지');
    t('tts.engineOptions.edge', 'Edge TTS');
    t('tts.engineOptions.openai', 'OpenAI');
    t('tts.engineOptions.elevenlabs', 'ElevenLabs');
    t('tts.openaiKey', 'OpenAI API 키');
    t('tts.elevenKey', 'ElevenLabs API 키');
    t('tts.lang', '언어');
    t('tts.voice', '목소리');
    t('tts.preview', '미리듣기');
    t('tts.local_settings', '로컬 설정');
    t('tts.reset', '초기화');
    t('tts.generating', '생성 중…');
    t('tts.playing', '재생 중…');
    t('tts.loading', '로드 중…');
    t('tts.load_failed', '로드 실패');
    t('tts.preview_text_default', '선택한 목소리 미리듣기입니다.');
    t('tts.emotion', '감정');
    t('tts.speed', '속도');
    t('tts.pitch', '피치');
    t('tts.origAudio', '원음');
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
    t('tts.modes.remove', '원음 제거');
    t('tts.modes.keepOriginal', '원음 유지');
    t('tts.modes.keepBgm', 'BGM만 유지');
    t('tts.modes.customBgm', '사용자 BGM');
    t('tts.selectBgm', 'BGM 선택');
    t('tts.voiceVolume', '목소리 볼륨');
    t('tts.bgmVolume', 'BGM 볼륨');
    t('tts.filters.all', '전체');
    t('tts.filters.common', '자주 사용');
    t('tts.filters.other', '기타');
    t('tts.languages.zh', '중국어');
    t('tts.languages.en', '영어');
    t('tts.languages.ja', '일본어');
    t('tts.languages.ko', '한국어');
    t('tts.languages.fr', '프랑스어');
    t('tts.languages.de', '독일어');
    t('tts.languages.es', '스페인어');
    t('tts.languages.ru', '러시아어');
    t('tts.languages.pt', '포르투갈어');
    t('tts.languages.it', '이탈리아어');
    t('tts.languages.id', '인도네시아어');
    t('tts.languages.vi', '베트남어');
    t('tts.languages.th', '태국어');
    t('tts.languages.ms', '말레이어');
    t('tts.languages.hi', '힌디어');
    t('tts.languages.ar', '아랍어');
    t('tts.languages.tr', '터키어');
    t('tts.languages.nl', '네덜란드어');
    t('tts.languages.pl', '폴란드어');
    t('tts.languages.sv', '스웨덴어');
    t('tts.languages.da', '덴마크어');
    t('tts.languages.no', '노르웨이어');
    t('tts.languages.fi', '핀란드어');
    t('tts.languages.cs', '체코어');
    t('tts.languages.ro', '루마니아어');
    t('tts.languages.bg', '불가리아어');
    t('tts.languages.el', '그리스어');
    t('tts.languages.he', '히브리어');
    t('tts.languages.hu', '헝가리어');
    t('tts.languages.uk', '우크라이나어');
    t('tts.languages.sk', '슬로바키아어');
    t('tts.languages.hr', '크로아티아어');
    t('tts.languages.af', '아프리칸스어');
    t('tts.voices.en-US-AriaNeural', 'Aria (EN-US)');
    t('tts.voices.ja-JP-NanamiNeural', 'Nanami (JA)');
    t('tts.voices.ja-JP-KeitaNeural', 'Keita (JA)');
    t('tts.voices.ko-KR-SunHiNeural', '선희 (KO)');
    t('tts.voices.ko-KR-InJoonNeural', '인준 (KO)');
    t('tts.voices.zh-CN-liaoning-XiaobeiNeural', 'Xiaobei 랴오닝 (ZH)');
    t('tts.voices.zh-CN-shaanxi-XiaoniNeural', 'Xiaoni 산시 (ZH)');

    t('settings.input_mode', '입력 모드');
    t('settings.single_file', '단일 파일');
    t('settings.batch_mode', '배치 처리');
    t('settings.inputSource', '입력 소스');
    t('settings.singleVideo', '단일 동영상');
    t('settings.batchFolder', '배치 폴더');
    t('settings.workMode', '작업 모드');
    t('settings.recognition', '자막 인식');
    t('settings.ai_auto', 'AI 자동');
    t('settings.import_srt', 'SRT 가져오기');
    t('settings.manual_input', '수동 입력');
    t('settings.select_srt', 'SRT 파일 선택');
    t('settings.auto_translate', '자동 번역');
    t('settings.aiRecognize', 'AI 인식·번역');
    t('settings.importFile', '자막 파일 가져오기');
    t('settings.manualCaption', '수동 대본 작성');
    t('settings.importSrt', 'SRT/ASS 가져오기');
    t('settings.translation', '번역 설정');
    t('settings.lang_settings', '언어 설정');
    t('settings.style_hint', '스타일 메모');
    t('settings.style_hint_placeholder', '예: 유머러스하게, 구어체로, 학술적으로…');
    t('settings.inspector.show', '상세 설정');
    t('settings.inspector.hide', '상세 숨기기');
    t('settings.sourceLang', '원본 언어');
    t('settings.targetLang', '대상 언어');
    t('settings.keep_bilingual', '이중 언어 표시 유지');
    t('settings.length_optimize', '긴 문장 처리');
    t('settings.optimize_strategy', '최적화 전략');
    t('settings.max_chars', '줄당 글자 수');
    t('settings.max_lines', '최대 줄 수');
    t('settings.templates.custom', '사용자 스타일');
    t('settings.strategyOptions.split', '스마트 분할');
    t('settings.strategyOptions.wrap', '강제 줄바꿈');
    t('settings.strategyOptions.scale', '시각 스케일');
    t('settings.engine', '인식/번역 엔진');
    t(
        'settings.engineHint',
        '인식과 이후 번역이 이 엔진을 공유합니다 (설정에서 API 키 구성)'
    );
    t('settings.engineOptions.groq', 'Groq (무료 추천)');
    t('settings.engineOptions.openai', 'OpenAI');
    t('settings.engineOptions.gemini', 'Gemini (추천)');
    t('settings.engineOptions.siliconflow', 'SiliconFlow');
    t('settings.engineOptions.deepl', 'DeepL');
    t('settings.lang.auto', '자동 감지');
    t('settings.lang.en', '영어');
    t('settings.lang.zh', '중국어');
    t('settings.lang.ja', '일본어');
    t('settings.lang.ko', '한국어');
    t('settings.lang.fr', '프랑스어');
    t('settings.lang.de', '독일어');
    t('settings.lang.es', '스페인어');
    t('settings.lang.ru', '러시아어');
    t('settings.lang.it', '이탈리아어');
    t('settings.lang.pt', '포르투갈어');
    t('settings.lang.vi', '베트남어');
    t('settings.lang.id', '인도네시아어');
    t('settings.lang.th', '태국어');
    t('settings.lang.tr', '터키어');
    t('settings.lang.ar', '아랍어');
    t('settings.lang.hi', '힌디어');
    t('settings.lang.zhHans', '중국어 간체');
    t('settings.lang.zhHant', '중국어 번체');
    t('settings.lang.sourceOnly', '받아쓰기만 (원어 유지)');
    t('settings.select_preset', '템플릿 선택');
    t('settings.save_preset', '스타일 저장');
    t('settings.import_preset', '템플릿 가져오기');
    t('settings.export_preset', '템플릿 내보내기');
    t('settings.fontOptions.msYaHei', 'Microsoft YaHei (기본)');
    t('settings.fontOptions.simHei', 'SimHei (호환)');
    t('settings.fontOptions.arial', 'Arial (라틴)');
    t('settings.posOptions.bottomCenter', '하단 중앙');
    t('settings.posOptions.topCenter', '상단 중앙');
    t('settings.posOptions.custom', '사용자 위치');
    t('settings.placeholder.outputPath', '출력 폴더 선택…');
    t('settings.placeholder.inputTemplateName', '템플릿 이름 입력');

    t(
        'subtitle.settings.engineHint',
        '인식과 번역이 이 엔진을 공유합니다 (설정에서 API 키 구성)'
    );
    t('subtitle.settings.engineOptions.openai', 'OpenAI');
    t('subtitle.settings.engineOptions.siliconflow', 'SiliconFlow');
    t('subtitle.settings.engineOptions.deepl', 'DeepL');
    t('subtitle.settings.lang.hi', '힌디어');
    t(
        'subtitle.actions.aiProcess_tip_with_engine',
        '현재 엔진({engine})으로 인식·번역합니다. 설정에서 변경할 수 있습니다.'
    );
    t('subtitle.export.precheck_title', '굽기 전 검사 ({{count}}줄)');
    t('subtitle.export.precheck_continue', '그래도 굽기를 계속할까요?');
    t('subtitle.tts.engine', '엔진');
    t('subtitle.tts.engineOptions.openai', 'OpenAI TTS');
    t('subtitle.tts.engineOptions.elevenlabs', 'ElevenLabs');
    t('subtitle.tts.emotion', '감정');
    t('subtitle.toast.undo_hint', ' (Ctrl+Z로 실행 취소)');
    t('subtitle.toast.media_cleared', '미디어와 자막을 지웠습니다');
    t('subtitle.toast.batch_queue_cleared', '배치 대기열을 비웠습니다');
    t(
        'subtitle.confirm.clear_media',
        '현재 동영상과 모든 자막을 지울까요? 언제든 다시 가져올 수 있습니다.'
    );
    t(
        'subtitle.confirm.clear_batch_queue',
        '배치 대기열({count}개 파일)을 비울까요? 현재 미디어도 지워집니다.'
    );

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
