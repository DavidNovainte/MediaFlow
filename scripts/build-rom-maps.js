/**
 * Build FR / ES / PT / RU maps from shared structure + per-language strings.
 * Usage: node scripts/build-rom-maps.js
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function loadNeed(code) {
    return JSON.parse(fs.readFileSync(path.join(root, `tmp/${code}-all-need.json`), 'utf8'));
}

/** @type {Record<string, Record<string, string>>} */
const L = {
    fr: {},
    es: {},
    pt: {},
    ru: {}
};

function setAll(key, fr, es, pt, ru) {
    L.fr[key] = fr;
    L.es[key] = es;
    L.pt[key] = pt;
    L.ru[key] = ru;
}

// —— Core UI ——
setAll('common.video', 'Vidéo', 'Vídeo', 'Vídeo', 'Видео');
setAll('common.transcribe.versionOriginal', 'Original', 'Original', 'Original', 'Оригинал');
setAll('common.modelManager.installedSection', 'Installé', 'Instalado', 'Instalado', 'Установлено');
setAll(
    'common.communityVersionMsg',
    'Édition Community : capture simple, transcription, compression et AI enhance. Passez à Pro pour le lot, la file et les flux avancés.',
    'Edición Community: captura simple, transcripción, compresión y AI enhance. Actualice a Pro para lote, cola y flujos avanzados.',
    'Edição Community: captura simples, transcrição, compressão e AI enhance. Atualize para Pro para lote, fila e fluxos avançados.',
    'Редакция Community: одиночная загрузка, расшифровка, сжатие и AI enhance. Перейдите на Pro для пакета, очереди и расширенных сценариев.'
);
setAll('ui.name', 'Nom', 'Nombre', 'Nome', 'Имя');
setAll('params.normal', 'Normal', 'Normal', 'Normal', 'Обычный');
setAll('pip.title', 'MediaFlow - Image dans l’image', 'MediaFlow - Imagen en imagen', 'MediaFlow - Imagem em imagem', 'MediaFlow - Картинка в картинке');

setAll('download.pause', 'Pause', 'Pausa', 'Pausa', 'Пауза');
setAll('download.playlist', 'Playlist', 'Lista de reproducción', 'Lista de reprodução', 'Плейлист');
setAll('download.formatVideo', 'Vidéo', 'Vídeo', 'Vídeo', 'Видео');
setAll('download.formatAudio', 'Audio', 'Audio', 'Áudio', 'Аудио');
setAll(
    'download.receivedFromExtension',
    'Reçu depuis l’extension de navigateur',
    'Recibido desde la extensión del navegador',
    'Recebido da extensão do navegador',
    'Получено из расширения браузера'
);
setAll(
    'download.receivedSilent',
    'Téléchargement en arrière-plan démarré',
    'Descarga en segundo plano iniciada',
    'Transferência em segundo plano iniciada',
    'Фоновая загрузка начата'
);
setAll(
    'download.autoStarting',
    'Démarrage du téléchargement…',
    'Iniciando descarga…',
    'A iniciar transferência…',
    'Запуск загрузки…'
);
setAll(
    'download.autoQueuedFromExternal',
    'Ajouté à la file (téléchargement en cours)',
    'Añadido a la cola (descarga en curso)',
    'Adicionado à fila (transferência em curso)',
    'Добавлено в очередь (загрузка идёт)'
);
setAll(
    'download.autoStartFailed',
    'Échec du démarrage auto — utilisez Enregistrer pour télécharger manuellement',
    'Error al iniciar automáticamente — use Guardar para descargar manualmente',
    'Falha no início automático — use Guardar para transferir manualmente',
    'Автозапуск не удался — используйте Сохранить для ручной загрузки'
);
setAll(
    'download.busyManual',
    'Un autre téléchargement est en cours. Lancez celui-ci après, ou passez à Pro pour le parallèle.',
    'Otra descarga está en curso. Inicie esta después o actualice a Pro para paralelo.',
    'Outra transferência está em curso. Inicie esta depois ou atualize para Pro para paralelo.',
    'Идёт другая загрузка. Запустите эту после или обновитесь до Pro для параллели.'
);
setAll(
    'download.pauseUnsupported',
    'La pause n’est pas prise en charge pour les téléchargements simples. Utilisez Annuler.',
    'La pausa no es compatible con descargas individuales. Use Cancelar.',
    'A pausa não é suportada em transferências simples. Use Cancelar.',
    'Пауза не поддерживается для одиночных загрузок. Используйте Отмена.'
);

setAll(
    'history.qrProOnly',
    'QR / partage mobile est une fonction Pro. Passez à Pro pour débloquer.',
    'QR / compartir móvil es Pro. Actualice para desbloquear.',
    'QR / partilha móvel é Pro. Atualize para desbloquear.',
    'QR / мобильный обмен — функция Pro. Обновитесь, чтобы разблокировать.'
);
setAll('history.showQRCodePro', 'Afficher le QR · Pro', 'Mostrar código QR · Pro', 'Mostrar código QR · Pro', 'Показать QR · Pro');
setAll('nav.upgradeActiveHint', 'Voir la licence', 'Ver licencia', 'Ver licença', 'Показать лицензию');
setAll('nav.extension', 'Extension navigateur', 'Extensión del navegador', 'Extensão do navegador', 'Расширение браузера');
setAll(
    'pixel.skipNonImages',
    '{count} fichier(s) non image ignoré(s). Utilisez AI Enhance pour de courtes vidéos.',
    '{count} archivo(s) no imagen omitido(s). Use AI Enhance para videos cortos.',
    '{count} ficheiro(s) não imagem ignorado(s). Use AI Enhance para vídeos curtos.',
    'Пропущено не-изображений: {count}. Для коротких видео используйте AI Enhance.'
);
setAll(
    'pixel.unsupportedPreview',
    'Impossible d’afficher ce fichier comme image',
    'No se puede previsualizar este archivo como imagen',
    'Não é possível pré-visualizar este ficheiro como imagem',
    'Нельзя показать этот файл как изображение'
);

setAll('upgrade.compare.communityTitle', 'Community', 'Community', 'Community', 'Community');
setAll(
    'upgrade.compare.community1',
    'Capture lien unique · illimité',
    'Captura de un enlace · ilimitada',
    'Captura de um link · ilimitada',
    'Одиночная ссылка · без лимита'
);
setAll(
    'upgrade.compare.community2',
    'Transcription locale · compression image · AI enhance',
    'Transcripción local · compresión de imagen · AI enhance',
    'Transcrição local · compressão de imagem · AI enhance',
    'Локальная расшифровка · сжатие изображений · AI enhance'
);
setAll(
    'upgrade.compare.community3',
    'Historique · paramètres et moteurs de base',
    'Historial · ajustes y motores principales',
    'Histórico · definições e motores principais',
    'История · настройки и базовые движки'
);
setAll(
    'upgrade.compare.pro1',
    'Lot · file · extension navigateur',
    'Lote · cola · extensión del navegador',
    'Lote · fila · extensão do navegador',
    'Пакет · очередь · расширение браузера'
);
setAll(
    'upgrade.compare.pro2',
    'Outils Creator · éditeur de timeline',
    'Herramientas Creator · editor de línea de tiempo',
    'Ferramentas Creator · editor de linha do tempo',
    'Инструменты Creator · редактор таймлайна'
);
setAll(
    'upgrade.compare.pro3',
    'Sous-titres · pont mobile',
    'Subtítulos · puente móvil',
    'Legendas · ponte móvel',
    'Субтитры · мобильный мост'
);
setAll('upgrade.plans.community.name', 'Community', 'Community', 'Community', 'Community');
setAll(
    'upgrade.plans.community.desc',
    'Outils essentiels — gratuits pour toujours',
    'Herramientas básicas — gratis para siempre',
    'Ferramentas principais — grátis para sempre',
    'Базовые инструменты — бесплатно навсегда'
);
setAll('upgrade.plans.lifetime.name', 'Pro à vie', 'Pro de por vida', 'Pro vitalício', 'Pro навсегда');

// enhance / mobile / settings / extension / tools — load from sibling module to keep file smaller
require('./build-rom-maps-extra.js')(setAll);
require('./build-rom-maps-subtitle.js')(setAll);

for (const code of ['fr', 'es', 'pt', 'ru']) {
    const locale = { fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU' }[code];
    const need = loadNeed(code);
    const map = { ...L[code] };
    let fallback = 0;
    for (const item of need) {
        if (map[item.k] === undefined) {
            map[item.k] = item.v;
            fallback++;
        }
    }
    const out = path.join(root, `tmp/${code}-map.json`);
    fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n', 'utf8');
    console.log(locale, 'keys', Object.keys(map).length, 'fallbackEn', fallback);
}
