/**
 * Translate remaining meaningful English-only keys (mostly enhance.errors).
 * node scripts/patch-remaining-en.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');

const packs = {
    'enhance.errors.apiKeyMissing': {
        de: 'API-Schlüssel für {provider} ist nicht konfiguriert. Bitte in den Einstellungen hinzufügen.',
        ja: '{provider} の API キーが未設定です。設定で追加してください。',
        ko: '{provider} API 키가 구성되지 않았습니다. 설정에서 추가하세요.',
        fr: 'Clé API pour {provider} non configurée. Ajoutez-la dans les paramètres.',
        es: 'La clave API de {provider} no está configurada. Añádala en Ajustes.',
        pt: 'Chave API de {provider} não configurada. Adicione-a nas Definições.',
        ru: 'API-ключ для {provider} не настроен. Добавьте его в Настройках.'
    },
    'enhance.errors.unsupportedProvider': {
        de: 'Nicht unterstützter Cloud-Anbieter: {provider}',
        ja: '未対応のクラウドプロバイダー: {provider}',
        ko: '지원되지 않는 클라우드 제공자: {provider}',
        fr: 'Fournisseur cloud non pris en charge : {provider}',
        es: 'Proveedor en la nube no compatible: {provider}',
        pt: 'Fornecedor cloud não suportado: {provider}',
        ru: 'Неподдерживаемый облачный провайдер: {provider}'
    },
    'enhance.errors.replicateFailed': {
        de: 'Replicate fehlgeschlagen: {error}',
        ja: 'Replicate 失敗: {error}',
        ko: 'Replicate 실패: {error}',
        fr: 'Échec Replicate : {error}',
        es: 'Error de Replicate: {error}',
        pt: 'Falha Replicate: {error}',
        ru: 'Сбой Replicate: {error}'
    },
    'enhance.errors.replicateRequestFailed': {
        de: 'Replicate-API-Anfrage fehlgeschlagen: {error}',
        ja: 'Replicate API リクエスト失敗: {error}',
        ko: 'Replicate API 요청 실패: {error}',
        fr: 'Échec de la requête API Replicate : {error}',
        es: 'Error de solicitud API Replicate: {error}',
        pt: 'Falha no pedido API Replicate: {error}',
        ru: 'Ошибка запроса API Replicate: {error}'
    },
    'enhance.errors.falNoUrl': {
        de: 'Fal.ai hat keine gültige Bild-URL zurückgegeben',
        ja: 'Fal.ai が有効な画像 URL を返しませんでした',
        ko: 'Fal.ai가 유효한 이미지 URL을 반환하지 않았습니다',
        fr: 'Fal.ai n’a pas renvoyé d’URL d’image valide',
        es: 'Fal.ai no devolvió una URL de imagen válida',
        pt: 'A Fal.ai não devolveu um URL de imagem válido',
        ru: 'Fal.ai не вернул действительный URL изображения'
    },
    'enhance.errors.falFailed': {
        de: 'Fal.ai-API-Aufruf fehlgeschlagen: {error}',
        ja: 'Fal.ai API 呼び出し失敗: {error}',
        ko: 'Fal.ai API 호출 실패: {error}',
        fr: 'Échec de l’appel API Fal.ai : {error}',
        es: 'Error de llamada API Fal.ai: {error}',
        pt: 'Falha na chamada API Fal.ai: {error}',
        ru: 'Ошибка вызова API Fal.ai: {error}'
    },
    'enhance.errors.stabilityFailed': {
        de: 'Stability AI fehlgeschlagen: {error}',
        ja: 'Stability AI 失敗: {error}',
        ko: 'Stability AI 실패: {error}',
        fr: 'Échec Stability AI : {error}',
        es: 'Error de Stability AI: {error}',
        pt: 'Falha Stability AI: {error}',
        ru: 'Сбой Stability AI: {error}'
    },
    'enhance.errors.openaiNoUpscale': {
        de: 'OpenAI unterstützt hier kein Real-ESRGAN-ähnliches Upscaling. Nutzen Sie Replicate.',
        ja: 'OpenAI はここで Real-ESRGAN 系の超解像を直接サポートしません。Replicate を使ってください。',
        ko: 'OpenAI는 여기서 Real-ESRGAN 유형 초해상을 직접 지원하지 않습니다. Replicate를 사용하세요.',
        fr: 'OpenAI ne prend pas en charge un upscale type Real-ESRGAN ici. Utilisez Replicate.',
        es: 'OpenAI no admite aquí un upscale tipo Real-ESRGAN. Use Replicate.',
        pt: 'A OpenAI não suporta aqui um upscale tipo Real-ESRGAN. Use o Replicate.',
        ru: 'OpenAI здесь не поддерживает апскейл вроде Real-ESRGAN. Используйте Replicate.'
    },
    'enhance.errors.unzipFailed': {
        de: 'Entpacken fehlgeschlagen. Versuchen Sie, das Paket manuell zu entpacken.',
        ja: '解凍に失敗しました。パッケージを手動で解凍してみてください。',
        ko: '압축 해제 실패. 패키지를 수동으로 풀어 보세요.',
        fr: 'Échec de l’extraction. Essayez de décompresser le package manuellement.',
        es: 'Error al extraer. Intente descomprimir el paquete manualmente.',
        pt: 'Falha na extração. Tente descomprimir o pacote manualmente.',
        ru: 'Не удалось распаковать. Попробуйте распаковать пакет вручную.'
    },
    'enhance.errors.engineMissing': {
        de: '[{name}] Engine-Binary fehlt: {exe}',
        ja: '[{name}] エンジン実行ファイルがありません: {exe}',
        ko: '[{name}] 엔진 실행 파일 없음: {exe}',
        fr: '[{name}] binaire du moteur manquant : {exe}',
        es: '[{name}] falta el binario del motor: {exe}',
        pt: '[{name}] binário do motor em falta: {exe}',
        ru: '[{name}] отсутствует бинарник движка: {exe}'
    },
    'enhance.errors.cropFailed': {
        de: 'Zuschneiden fehlgeschlagen: {error}',
        ja: '切り抜き失敗: {error}',
        ko: '자르기 실패: {error}',
        fr: 'Échec du recadrage : {error}',
        es: 'Error al recortar: {error}',
        pt: 'Falha ao recortar: {error}',
        ru: 'Ошибка обрезки: {error}'
    },
    'enhance.errors.noEngineConfig': {
        de: 'Keine Download-Konfiguration für diese Engine gefunden',
        ja: 'このエンジンのダウンロード設定が見つかりません',
        ko: '이 엔진의 다운로드 구성을 찾을 수 없습니다',
        fr: 'Aucune configuration de téléchargement pour ce moteur',
        es: 'No se encontró configuración de descarga para este motor',
        pt: 'Não foi encontrada configuração de transferência para este motor',
        ru: 'Не найдена конфигурация загрузки для этого движка'
    },
    'creator.silence.unitSec': {
        de: '{val} s',
        ja: '{val} 秒',
        ko: '{val} 초',
        fr: '{val} s',
        es: '{val} s',
        pt: '{val} s',
        ru: '{val} с'
    },
    'creator.segment.defaultName': {
        de: 'Segment {index}',
        ja: 'セグメント {index}',
        ko: '세그먼트 {index}',
        fr: 'Segment {index}',
        es: 'Segmento {index}',
        pt: 'Segmento {index}',
        ru: 'Сегмент {index}'
    },
    'creator.silence.segmentsCount': {
        de: '{count} Segmente',
        ja: '{count} セグメント',
        ko: '{count}개 구간',
        fr: '{count} segments',
        es: '{count} segmentos',
        pt: '{count} segmentos',
        ru: '{count} сегментов'
    },
    'creator.demucs.tracks.instrumental': {
        de: '🎹 Instrumental',
        ja: '🎹 インスト',
        ko: '🎹 반주',
        fr: '🎹 Instrumental',
        es: '🎹 Instrumental',
        pt: '🎹 Instrumental',
        ru: '🎹 Инструментал'
    },
    'download.clipDuration': {
        de: 'Schnitt: {duration}',
        ja: 'クリップ: {duration}',
        ko: '클립: {duration}',
        fr: 'Clip : {duration}',
        es: 'Clip: {duration}',
        pt: 'Clipe: {duration}',
        ru: 'Клип: {duration}'
    },
    'common.communityVersionMsg': {
        de: 'Community-Edition: Einzel-Download, Transkription, Komprimierung und AI-Enhance. Upgraden Sie auf Pro für Batch, Warteschlange und erweiterte Workflows.',
        ja: 'Community 版: 単一取得、文字起こし、圧縮、AI エンハンス。バッチ・キュー・高度なワークフローは Pro へ。',
        ko: 'Community 에디션: 단일 수집, 받아쓰기, 압축, AI 향상. 배치·대기열·고급 워크플로는 Pro로 업그레이드하세요.',
        fr: 'Édition Community : capture simple, transcription, compression et AI enhance. Passez à Pro pour le lot, la file et les flux avancés.',
        es: 'Edición Community: captura simple, transcripción, compresión y AI enhance. Actualice a Pro para lote, cola y flujos avanzados.',
        pt: 'Edição Community: captura simples, transcrição, compressão e AI enhance. Atualize para Pro para lote, fila e fluxos avançados.',
        ru: 'Редакция Community: одиночная загрузка, расшифровка, сжатие и AI enhance. Перейдите на Pro для пакета, очереди и расширенных сценариев.'
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
    const map = {};
    for (const [key, langs] of Object.entries(packs)) {
        if (langs[short]) map[key] = langs[short];
    }
    const mapPath = path.join(root, 'tmp', `remain-${short}.json`);
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
    execFileSync(process.execPath, [path.join(root, 'scripts/i18n-apply-locale-map.js'), locale, mapPath], {
        stdio: 'inherit',
        cwd: root
    });
}

// zh-TW: force any remaining en-identical that zh-CN has Chinese for
function read(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
function write(p, d) {
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
}
function prefer(enN, zhN, twN, st) {
    if (!enN || typeof enN !== 'object' || Array.isArray(enN)) return;
    if (!twN || typeof twN !== 'object') return;
    for (const k of Object.keys(enN)) {
        const ev = enN[k];
        const zv = zhN && zhN[k];
        const tv = twN[k];
        if (ev && typeof ev === 'object' && !Array.isArray(ev)) {
            if (!twN[k] || typeof twN[k] !== 'object') twN[k] = {};
            prefer(ev, zv || {}, twN[k], st);
        } else if (typeof ev === 'string' && typeof tv === 'string' && typeof zv === 'string') {
            if (tv === ev && zv !== ev && zv.trim()) {
                twN[k] = zv;
                st.n++;
            }
        }
    }
}
let total = 0;
const enDir = path.join(root, 'src/locales/en-US');
for (const f of fs.readdirSync(enDir).filter((x) => x.endsWith('.json'))) {
    const en = read(path.join(enDir, f));
    const zh = read(path.join(root, 'src/locales/zh-CN', f));
    const twp = path.join(root, 'src/locales/zh-TW', f);
    if (!fs.existsSync(twp)) continue;
    const tw = read(twp);
    const st = { n: 0 };
    prefer(en, zh, tw, st);
    if (st.n) {
        write(twp, tw);
        console.log('zh-TW', f, '+', st.n);
        total += st.n;
    }
}
console.log('zh-TW preferred total', total);
console.log('done');
