const fs = require('fs');
const path = require('path');

const baseDir = 'f:/Codage/VideoDownloader/MediaFlow/src/locales';
const translations = {
    'ja-JP': {
        style: {
            animation_group: 'AI アニメーション',
            animation: 'アニメーション効果',
            anim_duration: '持続時間 (s)',
            animations: { none: 'なし (ASSのみ)', fade: 'フェード', popup: 'ポップアップ', karaoke: 'カラオケ' },
            auto_avoid: 'スマート回避',
            auto_avoid_title: '焼き付け字幕や透かしを自動的に分析して回避します',
            load_system_fonts: 'システムフォントを再読み込み...',
            load_fonts_success: '{count} 個のシステムフォントを読み込みました',
            load_fonts_failed: 'フォントの読み込みに失敗しました'
        },
        templates: {
            default: 'デフォルト', yellow: 'ブライトイエロー', cinema: 'クラシックシネマ',
            neon: 'ネオングロウ', sweet: 'スイートピンク', vibrant: 'ビブラントブルー',
            modal_title: 'スタイルテンプレートを保存', input_placeholder: 'テンプレート名を入力してください',
            default_name: 'マイスタイル', copy_suffix: '(コピー)', save_success: 'テンプレート "{name}" を保存しました',
            delete_confirm: 'テンプレート "{name}" を削除してもよろしいですか？',
            custom_suffix: '(カスタム)', custom_label: 'カスタム..'
        }
    },
    'ko-KR': {
        style: {
            animation_group: 'AI 애니메이션',
            animation: '애니메이션 효과',
            anim_duration: '지속 시간 (s)',
            animations: { none: '없음 (ASS 전용)', fade: '페이드 인/아웃', popup: '팝업', karaoke: '가라오케' },
            auto_avoid: '지능형 회피',
            auto_avoid_title: '이미 인쇄된 자막이나 워터마크를 자동으로 분석하여 피합니다',
            load_system_fonts: '시스템 글꼴 다시 로드...',
            load_fonts_success: '{count}개의 시스템 글꼴을 성공적으로 로드했습니다',
            load_fonts_failed: '글꼴 로드 실패'
        },
        templates: {
            default: '기본 스타일', yellow: '밝은 노란색', cinema: '클래식 시네마',
            neon: '네온 글로우', sweet: '스위트 핑크', vibrant: '비브란트 블루',
            modal_title: '스타일 템플릿 저장', input_placeholder: '템플릿 이름을 입력하세요',
            default_name: '내 스타일', copy_suffix: '(사본)', save_success: '템플릿 "{name}" 저장됨',
            delete_confirm: '템플릿 "{name}"을(를) 삭제하시겠습니까?',
            custom_suffix: '(사용자 정의)', custom_label: '사용자 정의..'
        }
    },
    'es-ES': {
        style: {
            animation_group: 'Animaciones IA',
            animation: 'Efecto de animación',
            anim_duration: 'Duración (s)',
            animations: { none: 'Ninguna (Solo ASS)', fade: 'Desvanecer (Fade)', popup: 'Emergente (Pop)', karaoke: 'Karaoke' },
            auto_avoid: 'Evitación Inteligente',
            auto_avoid_title: 'Analiza y evita automáticamente subtítulos incrustados o marcas de agua',
            load_system_fonts: 'Recargar fuentes del sistema...',
            load_fonts_success: 'Se cargaron con éxito {count} fuentes del sistema',
            load_fonts_failed: 'Error al cargar las fuentes'
        },
        templates: {
            default: 'Estilo predeterminado', yellow: 'Amarillo brillante', cinema: 'Cine clásico',
            neon: 'Resplandor neón', sweet: 'Rosa dulce', vibrant: 'Azul vibrante',
            modal_title: 'Guardar plantilla de estilo', input_placeholder: 'Ingrese el nombre de la plantilla',
            default_name: 'Mi estilo', copy_suffix: '(Copia)', save_success: 'Plantilla "{name}" guardada',
            delete_confirm: '¿Está seguro de que desea eliminar la plantilla "{name}"?',
            custom_suffix: '(Personalizado)', custom_label: 'Personalizado..'
        }
    },
    'ru-RU': {
        style: {
            animation_group: 'AI-анимации',
            animation: 'Эффект анимации',
            anim_duration: 'Длительность (с)',
            animations: { none: 'Нет (Только ASS)', fade: 'Затухание', popup: 'Всплывающий', karaoke: 'Караоке' },
            auto_avoid: 'Умное уклонение',
            auto_avoid_title: 'Автоматический анализ и обход вшитых субтитров/водяных знаков',
            load_system_fonts: 'Перезагрузить системные шрифты...',
            load_fonts_success: 'Успешно загружено {count} системных шрифта(ов)',
            load_fonts_failed: 'Ошибка загрузки шрифтов'
        },
        templates: {
            default: 'Стандартный стиль', yellow: 'Ярко-желтый', cinema: 'Классическое кино',
            neon: 'Неоновое свечение', sweet: 'Сладкий розовый', vibrant: 'Яркий синий',
            modal_title: 'Сохранить шаблон стиля', input_placeholder: 'Введите название шаблона',
            default_name: 'Мой стиль', copy_suffix: '(Копия)', save_success: 'Шаблон "{name}" сохранен',
            delete_confirm: 'Вы уверены, что хотите удалить шаблон "{name}"?',
            custom_suffix: '(Пользовательский)', custom_label: 'Пользовательский..'
        }
    },
    'pt-PT': {
        style: {
            animation_group: 'Animações IA',
            animation: 'Efeito de Animação',
            anim_duration: 'Duração (s)',
            animations: { none: 'Nenhuma (Apenas ASS)', fade: 'Desvanecer (Fade)', popup: 'Popup', karaoke: 'Karaoke' },
            auto_avoid: 'Evitamento Inteligente',
            auto_avoid_title: 'Analisa e evita automaticamente legendas embutidas/marcas d\'água',
            load_system_fonts: 'Recarregar Fontes do Sistema...',
            load_fonts_success: '{count} fontes do sistema carregadas com sucesso',
            load_fonts_failed: 'Falha ao carregar fontes'
        },
        templates: {
            default: 'Estilo Padrão', yellow: 'Amarelo Brilhante', cinema: 'Cinema Clássico',
            neon: 'Brilho Neon', sweet: 'Rosa Doce', vibrant: 'Azul Vibrante',
            modal_title: 'Guardar modelo de estilo', input_placeholder: 'Insira o nome do modelo',
            default_name: 'Meu estilo', copy_suffix: '(Cópia)', save_success: 'Modelo "{name}" guardado',
            delete_confirm: 'Tem a certeza que deseja eliminar o modelo "{name}"?',
            custom_suffix: '(Personalizado)', custom_label: 'Personalizado..'
        }
    }
};

for (const lang of Object.keys(translations)) {
    const filePath = path.join(baseDir, lang, 'subtitle.json');
    if (!fs.existsSync(filePath)) {
        console.error('File missing: ' + filePath);
        continue;
    }
    
    let content;
    try {
        content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error('JSON Parse error: ' + filePath);
        continue;
    }

    const t = translations[lang];

    if (content.subtitle) {
        content.subtitle.style = t.style;
        if (content.subtitle.settings) {
            if (!content.subtitle.settings.templates) content.subtitle.settings.templates = {};
            Object.assign(content.subtitle.settings.templates, t.templates);
        }
    }

    // Some files have templates at top level settings
    if (content.settings && content.settings.templates) {
        Object.assign(content.settings.templates, t.templates);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log('Successfully updated ' + lang);
}
