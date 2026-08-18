/**
 * Apply P0 product copy (enhance limits/pro + upgrade honesty) to non-en locales.
 * node scripts/apply-p0-product-i18n.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');

const mapByLang = {
    de: {
        'enhance.limitsTitle': 'Video-Enhance-Limits',
        'enhance.limitsBody':
            'Nur kurze Clips: ≤45s · max. Längskante 1280 · nur 2× · lokale GPU empfohlen.',
        'enhance.proRequiredBanner':
            'AI-Enhance ausführen erfordert Pro. Seite frei einsehbar; Start fordert Upgrade.',
        'enhance.proRequiredCta': 'Auf Pro upgraden',
        'enhance.cancelled': 'Abgebrochen',
        'enhance.processFail': 'Verarbeitung fehlgeschlagen',
        'enhance.errors.tooManyFrames':
            'Zu viele Frames für diese Version. Kürzerer Clip oder niedrigere FPS.',
        'enhance.errors.engineNotReady':
            'Engine nicht installiert. Zuerst aus der Modellliste laden.',
        'enhance.errors.gpuMemory':
            'GPU-Speicher/Treiber-Problem. Eco-Modus, andere Apps schließen oder kleineres Bild.',
        'enhance.errors.ffmpegMissing':
            'ffmpeg fehlt oder fehlgeschlagen. Einstellungen → Core engines prüfen.',
        'upgrade.boundaryNote':
            'Hinweis: Gratis-Tools ohne Lizenz. Pro-Seiten oder geschützte Engines zeigen Upgrade.',
        'upgrade.features.free_enhance': 'AI-Enhance-Seite (Pro zum Ausführen)',
        'upgrade.features.pro_enhance': 'AI-Enhance-Engines (lokal Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': 'Lokale Transkription · Bildkompression',
        'upgrade.compare.pro1':
            'Batch · Warteschlange · Erweiterung · AI-Enhance-Engines',
        'upgrade.subtitle':
            'Kostenlos: Einzel-Capture, Transkription, Komprimierung. Pro: Enhance-Engines, Batch, Creator, Editor, Untertitel und Mobile.',
        'common.proOnly': 'Pro-Funktion — upgraden zum Freischalten.'
    },
    ja: {
        'enhance.limitsTitle': '動画エンハンス制限',
        'enhance.limitsBody':
            '短いクリップのみ: ≤45秒 · 長辺≤1280 · 倍率は2×のみ · ローカル GPU 推奨。',
        'enhance.proRequiredBanner':
            'AI エンハンス実行には Pro が必要です。ページは無料で閲覧可。開始時にアップグレードを求めます。',
        'enhance.proRequiredCta': 'Pro にアップグレード',
        'enhance.cancelled': 'キャンセルしました',
        'enhance.processFail': '処理に失敗しました',
        'enhance.errors.tooManyFrames':
            'この版ではフレーム数が多すぎます。より短いクリップか低い FPS を。',
        'enhance.errors.engineNotReady':
            'エンジン未インストール。先にモデル一覧からダウンロード。',
        'enhance.errors.gpuMemory':
            'GPU メモリ/ドライバの問題。Eco モード、他アプリ終了、または小さい画像を。',
        'enhance.errors.ffmpegMissing':
            'ffmpeg が無い/失敗。設定 → コアエンジンを確認。',
        'upgrade.boundaryNote':
            'ヒント: 無料ツールはライセンス不要。Pro ページや門限エンジンはアップグレードを表示。',
        'upgrade.features.free_enhance': 'AI エンハンス画面（実行は Pro）',
        'upgrade.features.pro_enhance':
            'AI エンハンスエンジン（ローカル Real-ESRGAN / CUGAN）',
        'upgrade.compare.community2': 'ローカル文字起こし · 画像圧縮',
        'upgrade.compare.pro1': 'バッチ · キュー · 拡張 · AI エンハンスエンジン',
        'upgrade.subtitle':
            '無料: 単一取得・文字起こし・圧縮。Pro: エンハンスエンジン、バッチ、Creator、編集、字幕、モバイル。',
        'common.proOnly': 'Pro 機能 — アップグレードで解除。'
    },
    ko: {
        'enhance.limitsTitle': '동영상 향상 제한',
        'enhance.limitsBody':
            '짧은 클립만: ≤45초 · 긴 변 ≤1280 · 배율 2×만 · 로컬 GPU 권장.',
        'enhance.proRequiredBanner':
            'AI 향상 실행에는 Pro가 필요합니다. 페이지는 무료로 볼 수 있으며 시작 시 업그레이드를 안내합니다.',
        'enhance.proRequiredCta': 'Pro로 업그레이드',
        'enhance.cancelled': '취소됨',
        'enhance.processFail': '처리 실패',
        'enhance.errors.tooManyFrames':
            '이 버전에는 프레임이 너무 많습니다. 더 짧은 클립이나 낮은 프레임레이트를 사용하세요.',
        'enhance.errors.engineNotReady':
            '엔진이 설치되지 않았습니다. 모델 목록에서 먼저 다운로드하세요.',
        'enhance.errors.gpuMemory':
            'GPU 메모리/드라이버 문제. Eco 모드, 다른 앱 종료, 또는 더 작은 이미지를 사용하세요.',
        'enhance.errors.ffmpegMissing':
            'ffmpeg 없음/실패. 설정 → 핵심 엔진을 확인하세요.',
        'upgrade.boundaryNote':
            '안내: 무료 도구는 라이선스 없이 사용. Pro 페이지나 제한 엔진은 업그레이드를 표시합니다.',
        'upgrade.features.free_enhance': 'AI 향상 페이지(실행은 Pro)',
        'upgrade.features.pro_enhance': 'AI 향상 엔진(로컬 Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': '로컬 받아쓰기 · 이미지 압축',
        'upgrade.compare.pro1': '배치 · 대기열 · 확장 · AI 향상 엔진',
        'upgrade.subtitle':
            '무료: 단일 수집, 받아쓰기, 압축. Pro: 향상 엔진, 배치, Creator, 편집, 자막, 모바일.',
        'common.proOnly': 'Pro 기능 — 업그레이드로 잠금 해제.'
    },
    fr: {
        'enhance.limitsTitle': 'Limites d’amélioration vidéo',
        'enhance.limitsBody':
            'Clips courts uniquement : ≤45 s · grand côté ≤1280 · échelle 2× seulement · GPU local recommandé.',
        'enhance.proRequiredBanner':
            'Exécuter l’amélioration IA nécessite Pro. Page libre; Démarrer propose la mise à niveau.',
        'enhance.proRequiredCta': 'Passer à Pro',
        'enhance.cancelled': 'Annulé',
        'enhance.processFail': 'Échec du traitement',
        'enhance.errors.tooManyFrames':
            'Trop d’images pour cette version. Clip plus court ou FPS plus bas.',
        'enhance.errors.engineNotReady':
            'Moteur non installé. Téléchargez-le d’abord dans la liste.',
        'enhance.errors.gpuMemory':
            'Problème mémoire/driver GPU. Mode Eco, fermez d’autres apps, ou image plus petite.',
        'enhance.errors.ffmpegMissing':
            'ffmpeg manquant ou en échec. Paramètres → moteurs de base.',
        'upgrade.boundaryNote':
            'Astuce : outils gratuits sans licence. Pages Pro ou moteurs protégés affichent Upgrade.',
        'upgrade.features.free_enhance': 'Page AI enhance (Pro pour exécuter)',
        'upgrade.features.pro_enhance':
            'Moteurs AI enhance (local Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': 'Transcription locale · compression image',
        'upgrade.compare.pro1': 'Lot · file · extension · moteurs AI enhance',
        'upgrade.subtitle':
            'Gratuit : capture simple, transcription, compression. Pro : moteurs enhance, lot, Creator, éditeur, sous-titres et mobile.',
        'common.proOnly': 'Fonction Pro — passez à Pro pour débloquer.'
    },
    es: {
        'enhance.limitsTitle': 'Límites de mejora de video',
        'enhance.limitsBody':
            'Solo clips cortos: ≤45 s · lado largo ≤1280 · solo 2× · GPU local recomendada.',
        'enhance.proRequiredBanner':
            'Ejecutar mejora IA requiere Pro. Puede ver la página; Iniciar pedirá actualizar.',
        'enhance.proRequiredCta': 'Actualizar a Pro',
        'enhance.cancelled': 'Cancelado',
        'enhance.processFail': 'Error de procesamiento',
        'enhance.errors.tooManyFrames':
            'Demasiados fotogramas. Use un clip más corto o menor FPS.',
        'enhance.errors.engineNotReady':
            'Motor no instalado. Descárguelo primero de la lista.',
        'enhance.errors.gpuMemory':
            'Problema de VRAM/controlador. Modo Eco, cierre apps u use imagen más pequeña.',
        'enhance.errors.ffmpegMissing':
            'Falta ffmpeg o falló. Ajustes → motores principales.',
        'upgrade.boundaryNote':
            'Nota: herramientas gratis sin licencia. Páginas Pro o motores con puerta muestran Upgrade.',
        'upgrade.features.free_enhance': 'Página AI enhance (Pro para ejecutar)',
        'upgrade.features.pro_enhance':
            'Motores AI enhance (local Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': 'Transcripción local · compresión de imagen',
        'upgrade.compare.pro1': 'Lote · cola · extensión · motores AI enhance',
        'upgrade.subtitle':
            'Gratis: captura simple, transcripción, compresión. Pro: motores enhance, lote, Creator, editor, subtítulos y móvil.',
        'common.proOnly': 'Función Pro — actualice para desbloquear.'
    },
    pt: {
        'enhance.limitsTitle': 'Limites de melhoria de vídeo',
        'enhance.limitsBody':
            'Apenas clipes curtos: ≤45 s · lado longo ≤1280 · só 2× · GPU local recomendada.',
        'enhance.proRequiredBanner':
            'Executar melhoria IA requer Pro. Pode ver a página; Iniciar pede atualização.',
        'enhance.proRequiredCta': 'Atualizar para Pro',
        'enhance.cancelled': 'Cancelado',
        'enhance.processFail': 'Falha no processamento',
        'enhance.errors.tooManyFrames':
            'Demasiadas frames. Use um clipe mais curto ou FPS menor.',
        'enhance.errors.engineNotReady':
            'Motor não instalado. Descarregue primeiro da lista.',
        'enhance.errors.gpuMemory':
            'Problema de VRAM/driver. Modo Eco, feche apps ou use imagem menor.',
        'enhance.errors.ffmpegMissing':
            'ffmpeg em falta ou falhou. Definições → motores principais.',
        'upgrade.boundaryNote':
            'Nota: ferramentas grátis sem licença. Páginas Pro ou motores com porta mostram Upgrade.',
        'upgrade.features.free_enhance': 'Página AI enhance (Pro para executar)',
        'upgrade.features.pro_enhance':
            'Motores AI enhance (local Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': 'Transcrição local · compressão de imagem',
        'upgrade.compare.pro1': 'Lote · fila · extensão · motores AI enhance',
        'upgrade.subtitle':
            'Grátis: captura simples, transcrição, compressão. Pro: motores enhance, lote, Creator, editor, legendas e mobile.',
        'common.proOnly': 'Função Pro — atualize para desbloquear.'
    },
    ru: {
        'enhance.limitsTitle': 'Лимиты улучшения видео',
        'enhance.limitsBody':
            'Только короткие клипы: ≤45 с · длинная сторона ≤1280 · только 2× · рекомендуется локальный GPU.',
        'enhance.proRequiredBanner':
            'Запуск ИИ-улучшения требует Pro. Страницу можно открыть; «Старт» предложит апгрейд.',
        'enhance.proRequiredCta': 'Перейти на Pro',
        'enhance.cancelled': 'Отменено',
        'enhance.processFail': 'Ошибка обработки',
        'enhance.errors.tooManyFrames':
            'Слишком много кадров. Более короткий клип или меньший FPS.',
        'enhance.errors.engineNotReady':
            'Движок не установлен. Сначала скачайте из списка моделей.',
        'enhance.errors.gpuMemory':
            'Проблема VRAM/драйвера. Режим Eco, закройте приложения или меньшее изображение.',
        'enhance.errors.ffmpegMissing':
            'ffmpeg отсутствует или сбой. Настройки → основные движки.',
        'upgrade.boundaryNote':
            'Подсказка: бесплатные инструменты без лицензии. Pro-страницы и защищённые движки показывают Upgrade.',
        'upgrade.features.free_enhance': 'Страница AI enhance (Pro для запуска)',
        'upgrade.features.pro_enhance':
            'Движки AI enhance (локально Real-ESRGAN / CUGAN)',
        'upgrade.compare.community2': 'Локальная расшифровка · сжатие изображений',
        'upgrade.compare.pro1': 'Пакет · очередь · расширение · движки AI enhance',
        'upgrade.subtitle':
            'Бесплатно: одиночный захват, расшифровка, сжатие. Pro: движки enhance, пакет, Creator, редактор, субтитры и mobile.',
        'common.proOnly': 'Функция Pro — обновитесь, чтобы разблокировать.'
    }
};

const codes = [
    ['de-DE', 'de'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['fr-FR', 'fr'],
    ['es-ES', 'es'],
    ['pt-PT', 'pt'],
    ['ru-RU', 'ru']
];

for (const [locale, short] of codes) {
    const map = mapByLang[short];
    const mapPath = path.join(root, 'tmp', `p0-prod-${short}.json`);
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
    execFileSync(
        process.execPath,
        [path.join(root, 'scripts/i18n-apply-locale-map.js'), locale, mapPath],
        { stdio: 'inherit', cwd: root }
    );
}

// zh-TW from zh-CN for new enhance/upgrade keys
function deepPrefer(zhNode, twNode, enNode) {
    if (!zhNode || typeof zhNode !== 'object') return;
    if (!twNode || typeof twNode !== 'object') return;
    for (const k of Object.keys(zhNode)) {
        if (zhNode[k] && typeof zhNode[k] === 'object' && !Array.isArray(zhNode[k])) {
            if (!twNode[k] || typeof twNode[k] !== 'object') twNode[k] = {};
            deepPrefer(zhNode[k], twNode[k], enNode && enNode[k]);
        } else if (typeof zhNode[k] === 'string') {
            if (
                twNode[k] === undefined ||
                twNode[k] === (enNode && enNode[k]) ||
                twNode[k] === zhNode[k]
            ) {
                twNode[k] = zhNode[k];
            }
        }
    }
}

function read(rel) {
    return JSON.parse(
        fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '')
    );
}
function write(rel, data) {
    fs.writeFileSync(
        path.join(root, rel),
        JSON.stringify(data, null, 2) + '\n',
        'utf8'
    );
}

const zhE = read('src/locales/zh-CN/enhance.json');
const enE = read('src/locales/en-US/enhance.json');
const twE = read('src/locales/zh-TW/enhance.json');
deepPrefer(zhE.enhance, twE.enhance || (twE.enhance = {}), enE.enhance);
write('src/locales/zh-TW/enhance.json', twE);

const zhU = read('src/locales/zh-CN/upgrade.json');
const enU = read('src/locales/en-US/upgrade.json');
const twU = read('src/locales/zh-TW/upgrade.json');
deepPrefer(zhU.upgrade, twU.upgrade || (twU.upgrade = {}), enU.upgrade);
// light traditional
let s = JSON.stringify(twU, null, 2) + '\n';
const pairs = [
    ['免费', '免費'],
    ['单链', '單鏈'],
    ['转写', '轉寫'],
    ['压图', '壓圖'],
    ['解锁', '解鎖'],
    ['批量', '批次'],
    ['队列', '佇列'],
    ['剪辑', '剪輯'],
    ['手机互联', '手機互聯'],
    ['页面', '頁面'],
    ['运行引擎需', '執行引擎需'],
    ['说明', '說明'],
    ['许可证', '授權'],
    ['打开', '開啟'],
    ['提示升级', '提示升級'],
    ['浏览', '瀏覽'],
    ['设置', '設定']
];
for (const [a, b] of pairs) s = s.split(a).join(b);
fs.writeFileSync(path.join(root, 'src/locales/zh-TW/upgrade.json'), s, 'utf8');

console.log('P0 product i18n applied');
