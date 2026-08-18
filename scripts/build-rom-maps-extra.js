/**
 * FR/ES/PT/RU strings for enhance, mobile, extension, settings, tools, creator.
 * @param {(key:string, fr:string, es:string, pt:string, ru:string)=>void} setAll
 */
module.exports = function registerRomExtra(setAll) {
    // creator bits
    setAll('creator.batch.clearQueueTitle', 'Tout effacer', 'Vaciar todas las tareas', 'Limpar todas as tarefas', 'Очистить все задачи');
    setAll('creator.silence.statsOriginal', 'Original : {time}', 'Original: {time}', 'Original: {time}', 'Оригинал: {time}');
    setAll('creator.segment.defaultName', 'Segment {index}', 'Segmento {index}', 'Segmento {index}', 'Сегмент {index}');
    setAll('creator.export.typeVideoAudio', 'Vidéo + Audio', 'Vídeo + Audio', 'Vídeo + Áudio', 'Видео + Аудио');
    setAll('creator.denoise.engine', 'Moteur', 'Motor', 'Motor', 'Движок');
    setAll('creator.watermark.typeText', 'Texte', 'Texto', 'Texto', 'Текст');

    // enhance
    setAll('enhance.tabModel', 'Moteur', 'Motor', 'Motor', 'Движок');
    setAll('enhance.original', 'Original', 'Original', 'Original', 'Оригинал');
    setAll('enhance.styleStandard', 'Standard', 'Estándar', 'Padrão', 'Стандарт');
    setAll('enhance.labelOriginal', 'Original', 'Original', 'Original', 'Оригинал');
    setAll(
        'enhance.hardwareWarning',
        'GPU dédié recommandé. L’amélioration vidéo est un MVP local (≤45 s / 2×) ; peut être long.',
        'Se recomienda GPU dedicada. La mejora de video es un MVP local (≤45 s / 2×); puede tardar.',
        'GPU dedicada recomendada. A melhoria de vídeo é um MVP local (≤45 s / 2×); pode demorar.',
        'Рекомендуется выделенный GPU. Улучшение видео — локальный MVP (≤45 с / 2×); может занять время.'
    );
    setAll('enhance.denoiseAuto', 'Auto', 'Auto', 'Auto', 'Авто');
    setAll(
        'enhance.noResultsToCompress',
        'Aucune image améliorée à envoyer (les vidéos restent dans le dossier de sortie)',
        'No hay imágenes mejoradas para enviar (los videos permanecen en la carpeta de salida)',
        'Sem imagens melhoradas para enviar (os vídeos ficam na pasta de saída)',
        'Нет улучшенных изображений для отправки (видео остаются в папке вывода)'
    );
    setAll(
        'enhance.videoScaleCapped',
        'L’amélioration vidéo est limitée à 2× dans cette version',
        'La mejora de video está limitada a 2× en esta versión',
        'A melhoria de vídeo está limitada a 2× nesta versão',
        'Улучшение видео ограничено 2× в этой версии'
    );
    setAll(
        'enhance.videoPreviewUnavailable',
        'Aperçu rapide pour images. Lancez l’amélioration pour de courtes vidéos (≤45 s).',
        'Vista previa rápida para imágenes. Inicie la mejora para videos cortos (≤45 s).',
        'Pré-visualização rápida para imagens. Inicie a melhoria para vídeos curtos (≤45 s).',
        'Быстрый просмотр — для изображений. Запустите улучшение для коротких видео (≤45 с).'
    );
    setAll(
        'enhance.videoSmartSkip',
        'Vidéo : CUGAN pour anime, Real-ESRGAN pour live',
        'Video: CUGAN para anime, Real-ESRGAN para real',
        'Vídeo: CUGAN para anime, Real-ESRGAN para real',
        'Видео: CUGAN для аниме, Real-ESRGAN для натуры'
    );
    setAll('enhance.smartReasonAnime', 'Semble illustration / anime → CUGAN', 'Parece ilustración / anime → CUGAN', 'Parece ilustração / anime → CUGAN', 'Похоже на иллюстрацию / аниме → CUGAN');
    setAll('enhance.smartReasonPhoto', 'Semble photo → Real-ESRGAN', 'Parece foto → Real-ESRGAN', 'Parece foto → Real-ESRGAN', 'Похоже на фото → Real-ESRGAN');
    setAll('enhance.smartReasonPortrait', 'Visage / portrait → profil Portrait', 'Rostro / retrato → perfil Retrato', 'Rosto / retrato → perfil Retrato', 'Лицо / портрет → профиль Портрет');
    setAll('enhance.smartReasonError', 'Échec d’analyse → Real-ESRGAN', 'Error de análisis → Real-ESRGAN', 'Falha de análise → Real-ESRGAN', 'Сбой анализа → Real-ESRGAN');
    setAll('enhance.smartBadge', 'Recommandation IA', 'Recomendación IA', 'Recomendação IA', 'Рекомендация ИИ');
    setAll(
        'enhance.videoReadyHint',
        'Vidéo chargée. Max 45 s / 2× — appuyez sur Démarrer l’amélioration.',
        'Video cargado. Máx. 45 s / 2× — pulse Iniciar mejora.',
        'Vídeo carregado. Máx. 45 s / 2× — prima Iniciar melhoria.',
        'Видео загружено. Макс. 45 с / 2× — нажмите Начать улучшение.'
    );
    setAll(
        'enhance.videoDoneHint',
        'Vidéo prête — ouvrez le dossier de sortie',
        'Video listo — abra la carpeta de salida',
        'Vídeo pronto — abra a pasta de saída',
        'Видео готово — откройте папку вывода'
    );
    setAll(
        'enhance.videoPreviewFail',
        'Impossible d’apercevoir la vidéo. Vous pouvez quand même démarrer l’amélioration.',
        'No se pudo previsualizar el video. Aún puede iniciar la mejora.',
        'Não foi possível pré-visualizar o vídeo. Ainda pode iniciar a melhoria.',
        'Не удалось предпросмотреть видео. Улучшение всё равно можно запустить.'
    );
    setAll(
        'enhance.videoTooLongImport',
        '{count} vidéo(s) de plus de {max} s ignorée(s) (ex. {duration} s). Coupez d’abord ou utilisez un clip court.',
        '{count} video(s) de más de {max} s omitido(s) (p. ej. {duration} s). Recorte primero o use un clip corto.',
        '{count} vídeo(s) com mais de {max} s ignorado(s) (ex. {duration} s). Corte primeiro ou use um clipe curto.',
        'Пропущено видео длиннее {max} с: {count} (напр. {duration} с). Сначала обрежьте или возьмите короткий клип.'
    );
    setAll(
        'enhance.videoProbeFailImport',
        '{count} vidéo(s) ignorée(s) : durée illisible',
        '{count} video(s) omitido(s): no se pudo leer la duración',
        '{count} vídeo(s) ignorado(s): não foi possível ler a duração',
        'Пропущено видео: {count} — не удалось прочитать длительность'
    );
    setAll(
        'enhance.videoTooLong',
        'Les vidéos de plus de {max} s ne sont pas prises en charge. Coupez d’abord ou utilisez un clip court.',
        'Los videos de más de {max} s no son compatibles. Recorte primero o use un clip corto.',
        'Vídeos com mais de {max} s não são suportados. Corte primeiro ou use um clipe curto.',
        'Видео длиннее {max} с не поддерживаются. Сначала обрежьте или используйте короткий клип.'
    );

    // mobile
    setAll('mobile.settings.portTitle', 'Port', 'Puerto', 'Porta', 'Порт');
    setAll(
        'mobile.settings.portDesc',
        'Par défaut 8765 · changez si occupé · redémarre si actif',
        'Predeterminado 8765 · cambie si está ocupado · reinicia si está activo',
        'Predefinido 8765 · altere se ocupado · reinicia se ativo',
        'По умолчанию 8765 · смените при занятости · перезапуск если активен'
    );
    setAll('mobile.settings.savePort', 'Enregistrer', 'Guardar', 'Guardar', 'Сохранить');
    setAll(
        'mobile.settings.pinHint',
        'Sans PIN : tout appareil du LAN peut se connecter',
        'Sin PIN: cualquier dispositivo de la LAN puede conectarse',
        'Sem PIN: qualquer dispositivo na LAN pode ligar-se',
        'Без PIN: любое устройство в LAN может подключиться'
    );
    setAll(
        'mobile.messages.pinRecommend',
        'Astuce : définissez un PIN pour empêcher d’autres personnes sur le même Wi‑Fi d’utiliser ce lien.',
        'Consejo: establezca un PIN para que otros en el mismo Wi‑Fi no usen este enlace.',
        'Dica: defina um PIN para que outros na mesma Wi‑Fi não usem este link.',
        'Совет: задайте PIN, чтобы другие в той же Wi‑Fi не использовали эту ссылку.'
    );
    setAll(
        'mobile.messages.portInvalid',
        'Le port doit être entre 1024 et 65535',
        'El puerto debe estar entre 1024 y 65535',
        'A porta deve estar entre 1024 e 65535',
        'Порт должен быть от 1024 до 65535'
    );
    setAll(
        'mobile.messages.portSaved',
        'Port enregistré comme {port} (au prochain démarrage)',
        'Puerto guardado como {port} (en el próximo inicio)',
        'Porta guardada como {port} (no próximo arranque)',
        'Порт сохранён как {port} (со следующего запуска)'
    );
    setAll(
        'mobile.messages.portSavedRestarted',
        'Port changé en {port} ; service redémarré',
        'Puerto cambiado a {port}; servicio reiniciado',
        'Porta alterada para {port}; serviço reiniciado',
        'Порт изменён на {port}; служба перезапущена'
    );
    setAll('mobile.remote.labelFormat', 'Format', 'Formato', 'Formato', 'Формат');
    setAll('mobile.remote.optVideo', 'Vidéo', 'Vídeo', 'Vídeo', 'Видео');
    setAll('mobile.remote.navDesktop', 'Bureau', 'Escritorio', 'Ambiente de trabalho', 'Рабочий стол');
    setAll('mobile.remote.navDownloads', 'Téléchargements', 'Descargas', 'Transferências', 'Загрузки');
    setAll('mobile.remote.navVideos', 'Vidéos', 'Vídeos', 'Vídeos', 'Видео');
    setAll('mobile.cast.localFileTitle', 'Caster un fichier local', 'Transmitir archivo local', 'Transmitir ficheiro local', 'Транслировать локальный файл');
    setAll('mobile.cast.imageTitle', 'Image', 'Imagen', 'Imagem', 'Изображение');
    setAll('mobile.cast.fileTitle', 'Document', 'Documento', 'Documento', 'Документ');
    setAll('mobile.cast.resolvingTitle', 'Résolution du lien…', 'Resolviendo enlace…', 'A resolver link…', 'Разрешение ссылки…');
    setAll(
        'mobile.playingLocal',
        'Lecture du fichier local dans une fenêtre séparée',
        'Reproduciendo archivo local en una ventana aparte',
        'A reproduzir ficheiro local numa janela separada',
        'Локальный файл воспроизводится в отдельном окне'
    );
    setAll('mobile.castLinkReceived', 'Lien de cast reçu', 'Enlace de cast recibido', 'Link de cast recebido', 'Ссылка cast получена');
    setAll('mobile.parsingUrl', 'Analyse de l’adresse vidéo…', 'Analizando dirección de video…', 'A analisar endereço de vídeo…', 'Разбор адреса видео…');
    setAll('mobile.parseSuccess', 'Analysé — diffusion', 'Analizado — emitiendo', 'Analisado — a transmitir', 'Разобрано — трансляция');
    setAll('mobile.parseError', 'Échec d’analyse de l’adresse vidéo', 'No se pudo analizar la dirección de video', 'Falha ao analisar o endereço de vídeo', 'Не удалось разобрать адрес видео');
    setAll('mobile.castFail', 'Échec du cast', 'Error de cast', 'Falha de cast', 'Сбой cast');
    setAll('mobile.castFailMsg', 'Échec du cast', 'Error de cast', 'Falha de cast', 'Сбой cast');
    setAll('mobile.guide.title', 'Comment se connecter', 'Cómo conectarse', 'Como ligar', 'Как подключиться');
    setAll(
        'mobile.guide.lead',
        'Sur le même Wi‑Fi, scannez le QR ou ouvrez l’URL LAN pour envoyer liens et fichiers.',
        'En la misma Wi‑Fi, escanee el QR o abra la URL LAN para enviar enlaces y archivos.',
        'Na mesma Wi‑Fi, leia o QR ou abra o URL LAN para enviar links e ficheiros.',
        'В той же Wi‑Fi отсканируйте QR или откройте LAN URL, чтобы отправлять ссылки и файлы.'
    );
    setAll('mobile.guide.step1', 'Cliquez sur « Démarrer le service » en haut à droite', 'Haga clic en «Iniciar servicio» arriba a la derecha', 'Clique em «Iniciar serviço» no canto superior direito', 'Нажмите «Запустить службу» справа вверху');
    setAll(
        'mobile.guide.step2',
        'Scannez le QR avec le téléphone, ou ouvrez l’adresse LAN dans un navigateur',
        'Escanee el QR con el teléfono o abra la dirección LAN en un navegador',
        'Leia o QR no telemóvel ou abra o endereço LAN no navegador',
        'Отсканируйте QR телефоном или откройте LAN-адрес в браузере'
    );
    setAll(
        'mobile.guide.step3',
        '(Optionnel) Installez l’extension Chrome pour envoyer des vidéos de page à MediaFlow',
        '(Opcional) Instale la extensión Chrome para enviar videos de página a MediaFlow',
        '(Opcional) Instale a extensão Chrome para enviar vídeos da página ao MediaFlow',
        '(Необязательно) Установите расширение Chrome, чтобы отправлять видео страниц в MediaFlow'
    );
    setAll(
        'mobile.extension.desc',
        'Extension Chrome officielle : envoyer l’URL de page en un clic vers la file de téléchargement du PC.',
        'Extensión oficial de Chrome: envíe la URL de la página con un clic a la cola de descarga del PC.',
        'Extensão oficial do Chrome: envie o URL da página com um clique para a fila de transferência do PC.',
        'Официальное расширение Chrome: отправка URL страницы в очередь загрузки ПК одним щелчком.'
    );
    setAll(
        'mobile.extension.install',
        'Installer depuis le Chrome Web Store',
        'Instalar desde Chrome Web Store',
        'Instalar a partir da Chrome Web Store',
        'Установить из Chrome Web Store'
    );
    setAll(
        'mobile.extension.note',
        'Nécessite Pro · s’associe à l’app de bureau',
        'Requiere Pro · se empareja con la app de escritorio',
        'Requer Pro · emparelha com a app de ambiente de trabalho',
        'Нужен Pro · работает с настольным приложением'
    );

    // extension (shared with mobile tone)
    setAll('extension.kicker', 'Extension navigateur', 'Extensión del navegador', 'Extensão do navegador', 'Расширение браузера');
    setAll(
        'extension.lead',
        'Assistant navigateur : résoudre l’URL vidéo de la page, scanner les médias, envoyer par lot au bureau.',
        'Asistente del navegador: resolver la URL de video de la página, escanear medios, enviar por lote al escritorio.',
        'Assistente do navegador: resolver o URL de vídeo da página, analisar meios, enviar em lote para o ambiente de trabalho.',
        'Помощник браузера: URL видео страницы, сканирование медиа, пакетная отправка на ПК.'
    );
    setAll('extension.storeLabel', 'Chrome Web Store', 'Chrome Web Store', 'Chrome Web Store', 'Chrome Web Store');
    setAll('extension.cardTitle', 'Fonctions', 'Funciones', 'Funções', 'Возможности');
    setAll(
        'extension.cardDesc',
        'Capturez des liens en naviguant et envoyez-les à MediaFlow. Gardez l’app de bureau ouverte.',
        'Capture enlaces al navegar y envíelos a MediaFlow. Mantenga la app de escritorio abierta.',
        'Capture links ao navegar e envie-os para o MediaFlow. Mantenha a app de ambiente de trabalho aberta.',
        'Собирайте ссылки в браузере и отправляйте в MediaFlow. Держите настольное приложение открытым.'
    );
    setAll(
        'extension.feature1',
        'Envoi en un clic vers la file de téléchargement locale',
        'Envío con un clic a la cola de descarga local',
        'Envio com um clique para a fila de transferência local',
        'Отправка в локальную очередь загрузки одним щелчком'
    );
    setAll(
        'extension.feature2',
        'Fonctionne avec la licence Pro de bureau',
        'Funciona con la licencia Pro de escritorio',
        'Funciona com a licença Pro de ambiente de trabalho',
        'Работает с лицензией Pro настольного приложения'
    );
    setAll(
        'extension.feature3',
        'Pratique pour YouTube et sites courants',
        'Útil para YouTube y sitios comunes',
        'Útil para YouTube e sites comuns',
        'Удобно для YouTube и популярных сайтов'
    );
    setAll(
        'extension.installChrome',
        'Installer depuis le Chrome Web Store',
        'Instalar desde Chrome Web Store',
        'Instalar a partir da Chrome Web Store',
        'Установить из Chrome Web Store'
    );
    setAll(
        'extension.note',
        'Nécessite Pro · l’app de bureau doit tourner à l’envoi',
        'Requiere Pro · la app de escritorio debe estar en ejecución al enviar',
        'Requer Pro · a app de ambiente de trabalho deve estar em execução ao enviar',
        'Нужен Pro · настольное приложение должно быть запущено при отправке'
    );
    setAll('extension.howTitle', 'Démarrage rapide', 'Inicio rápido', 'Início rápido', 'Быстрый старт');
    setAll('extension.how1', 'Installez l’extension et épinglez-la à la barre', 'Instale la extensión y fíjela a la barra', 'Instale a extensão e fixe-a na barra', 'Установите расширение и закрепите на панели');
    setAll('extension.how2', 'Ouvrez MediaFlow bureau (Pro activé)', 'Abra MediaFlow de escritorio (Pro activado)', 'Abra o MediaFlow de ambiente de trabalho (Pro ativado)', 'Откройте MediaFlow на ПК (Pro активирован)');
    setAll('extension.how3', 'Sur une page vidéo : Envoyer à MediaFlow ou Scanner la page', 'En una página de video: Enviar a MediaFlow o Escanear página', 'Numa página de vídeo: Enviar para MediaFlow ou Analisar página', 'На странице видео: Отправить в MediaFlow или Сканировать страницу');
    setAll(
        'extension.how4',
        'Sur les listes, utilisez le lot ; pour les murs de connexion, synchronisez d’abord les cookies',
        'En listas use el lote; para muros de inicio de sesión, sincronice cookies primero',
        'Em listas use o lote; para muros de início de sessão, sincronize cookies primeiro',
        'На списках используйте пакет; при стенах входа сначала синхронизируйте cookies'
    );
    setAll('extension.tipLabel', 'Astuce', 'Consejo', 'Dica', 'Совет');
    setAll('extension.benefit1Title', 'Envoi en un clic', 'Envío con un clic', 'Envio com um clique', 'Отправка одним щелчком');
    setAll('extension.benefit3Title', 'Sites populaires', 'Sitios populares', 'Sites populares', 'Популярные сайты');
    setAll('extension.purposeLabel', 'Ce qu’il peut faire', 'Qué puede hacer', 'O que pode fazer', 'Что умеет');
    setAll(
        'extension.purpose1',
        'L’URL de la page vidéo va directement dans la file de téléchargement du bureau.',
        'La URL de la página de video va directo a la cola de descarga del escritorio.',
        'O URL da página de vídeo vai direto para a fila de transferência do ambiente de trabalho.',
        'URL страницы видео сразу попадает в очередь загрузки на ПК.'
    );
    setAll(
        'extension.purpose2',
        'Trouver les médias de la page, multi-sélectionner, envoyer à MediaFlow.',
        'Encontrar medios de la página, multiseleccionar y enviar a MediaFlow.',
        'Encontrar meios da página, multisselecionar e enviar para o MediaFlow.',
        'Найти медиа на странице, выбрать несколько и отправить в MediaFlow.'
    );
    setAll(
        'extension.purpose3',
        'Récupérer plusieurs éléments de profils ou listes en une fois.',
        'Recoger varios elementos de perfiles o listas de una vez.',
        'Recolher vários itens de perfis ou listas de uma vez.',
        'Собрать много элементов с профилей или списков за раз.'
    );
    setAll(
        'extension.purpose4',
        'Réutiliser l’état de connexion du navigateur pour réduire les murs d’âge / login.',
        'Reutilizar el inicio de sesión del navegador para reducir muros de edad / login.',
        'Reutilizar o início de sessão do navegador para reduzir muros de idade / login.',
        'Использовать вход в браузере, чтобы реже упираться в возраст/логин.'
    );
    setAll('extension.purpose1Title', 'Envoi en un clic', 'Envío con un clic', 'Envio com um clique', 'Отправка одним щелчком');
    setAll('extension.purpose2Title', 'Scanner la page', 'Escanear página', 'Analisar página', 'Сканировать страницу');
    setAll('extension.purpose3Title', 'Lot / scrape', 'Lote / scrape', 'Lote / scrape', 'Пакет / scrape');
    setAll('extension.purpose4Title', 'Sync cookies', 'Sincronizar cookies', 'Sincronizar cookies', 'Синхронизация cookies');
    setAll('extension.tipsTitle', 'Astuces', 'Consejos', 'Dicas', 'Советы');
    setAll(
        'extension.tip1',
        'Gardez l’app de bureau ouverte avant d’envoyer, sinon l’extension ne peut pas livrer les tâches.',
        'Mantenga la app de escritorio abierta antes de enviar; si no, la extensión no puede entregar trabajos.',
        'Mantenha a app de ambiente de trabalho aberta antes de enviar; caso contrário a extensão não entrega tarefas.',
        'Держите настольное приложение открытым перед отправкой, иначе расширение не доставит задания.'
    );
    setAll(
        'extension.tip2',
        'La sync des cookies nécessite l’aide LAN/mobile du bureau (port 8765).',
        'La sincronización de cookies necesita el ayudante LAN/móvil del escritorio (puerto 8765).',
        'A sincronização de cookies precisa do ajudante LAN/móvel do ambiente de trabalho (porta 8765).',
        'Синхронизация cookies требует LAN/мобильный помощник на ПК (порт 8765).'
    );
    setAll(
        'extension.tip3',
        'Certains sites marchent mieux si vous vous connectez d’abord, puis synchronisez les cookies.',
        'Algunos sitios funcionan mejor si inicia sesión primero y luego sincroniza cookies.',
        'Alguns sites funcionam melhor se iniciar sessão primeiro e depois sincronizar cookies.',
        'Некоторые сайты работают лучше, если сначала войти, затем синхронизировать cookies.'
    );
    setAll('extension.f1Title', 'Résoudre et envoyer l’URL', 'Resolver y enviar URL', 'Resolver e enviar URL', 'Разобрать и отправить URL');
    setAll(
        'extension.f1Desc',
        'Détecter l’adresse vidéo de la page et l’envoyer à la capture média du bureau.',
        'Detectar la dirección de video de la página y enviarla a la captura del escritorio.',
        'Detetar o endereço de vídeo da página e enviá-lo para a captura do ambiente de trabalho.',
        'Определить адрес видео страницы и отправить в захват на ПК.'
    );
    setAll('extension.f2Title', 'Scanner les médias de la page', 'Escanear medios de la página', 'Analisar meios da página', 'Сканировать медиа страницы');
    setAll(
        'extension.f2Desc',
        'Trouver les médias téléchargeables, multi-sélectionner, envoi par lot — pas seulement une URL.',
        'Encontrar medios descargables, multiseleccionar, envío por lote — no solo una URL.',
        'Encontrar meios transferíveis, multisselecionar, envio em lote — não só um URL.',
        'Найти скачиваемые медиа, выбрать несколько, пакетная отправка — не только один URL.'
    );
    setAll('extension.f3Title', 'Lot / défilement auto', 'Lote / desplazamiento auto', 'Lote / deslocamento auto', 'Пакет / автопрокрутка');
    setAll(
        'extension.f3Desc',
        'Faire défiler profils/listes pour collecter beaucoup d’éléments ; filtres date et mot-clé optionnels.',
        'Desplazar perfiles/listas para reunir muchos elementos; filtros de fecha y palabra clave opcionales.',
        'Deslocar perfis/listas para reunir muitos itens; filtros de data e palavra-chave opcionais.',
        'Прокрутка профилей/списков для сбора многих элементов; опциональные фильтры даты и слов.'
    );
    setAll('extension.f4Title', 'Multi-sites', 'Multi-sitio', 'Multi-site', 'Мульти-сайты');
    setAll(
        'extension.f4Desc',
        'Adaptateurs TikTok / Douyin / Instagram / X ; autres sites via détection générique.',
        'Adaptadores TikTok / Douyin / Instagram / X; otros sitios vía detección genérica.',
        'Adaptadores TikTok / Douyin / Instagram / X; outros sites via deteção genérica.',
        'Адаптеры TikTok / Douyin / Instagram / X; остальные через общий поиск медиа.'
    );
    setAll('extension.f5Title', 'Sync cookies', 'Sincronizar cookies', 'Sincronizar cookies', 'Синхронизация cookies');
    setAll(
        'extension.f5Desc',
        'Transmettre l’état de connexion du navigateur au bureau pour contourner les murs de login.',
        'Pasar el inicio de sesión del navegador al escritorio para eludir muros de login.',
        'Passar o início de sessão do navegador para o ambiente de trabalho para contornar muros de login.',
        'Передать вход браузера на ПК, чтобы обходить стены входа.'
    );
    setAll('extension.f6Title', 'Playlist / lot', 'Lista / lote', 'Lista / lote', 'Плейлист / пакет');
    setAll(
        'extension.f6Desc',
        'Envoyer plusieurs liens ou éléments de liste vers la file.',
        'Enviar varios enlaces o elementos de lista a la cola.',
        'Enviar vários links ou itens de lista para a fila.',
        'Отправить несколько ссылок или пунктов списка в очередь.'
    );
    setAll('extension.f7Title', 'État', 'Estado', 'Estado', 'Статус');
    setAll(
        'extension.f7Desc',
        'Voir si le bureau tourne et si Pro est actif.',
        'Ver si el escritorio está en ejecución y si Pro está activo.',
        'Ver se o ambiente de trabalho está a correr e se o Pro está ativo.',
        'Видеть, запущено ли приложение и активен ли Pro.'
    );
    setAll('extension.f8Title', 'Sécurité', 'Seguridad', 'Segurança', 'Безопасность');
    setAll(
        'extension.f8Desc',
        'Connexion locale au bureau uniquement ; pas de transfert cloud des URL.',
        'Solo conexión local al escritorio; sin enviar URL a la nube.',
        'Apenas ligação local ao ambiente de trabalho; sem enviar URL para a cloud.',
        'Только локальное соединение с ПК; URL в облако не отправляются.'
    );
    setAll(
        'extension.how5',
        'Choisissez le mode de réception (focus / silencieux) dans les paramètres',
        'Elija el modo de recepción (foco / silencioso) en ajustes',
        'Escolha o modo de receção (foco / silencioso) nas definições',
        'Выберите режим приёма (фокус / тихий) в настройках'
    );
    setAll(
        'extension.tip4',
        'En cas d’échec, redémarrez le bureau et renvoyez',
        'Si falla, reinicie el escritorio y reenvíe',
        'Se falhar, reinicie o ambiente de trabalho e reenvie',
        'При сбое перезапустите приложение и отправьте снова'
    );

    // settings cloud
    setAll('settings.externalReceiveMode', 'Extension / envoi téléphone', 'Extensión / envío del teléfono', 'Extensão / envio do telemóvel', 'Расширение / отправка с телефона');
    setAll(
        'settings.externalReceiveModeDesc',
        'Quand un lien arrive de l’extension ou du téléphone (démarrage auto toujours)',
        'Cuando llega un enlace de la extensión o el teléfono (siempre inicia descarga)',
        'Quando chega um link da extensão ou do telemóvel (inicia sempre a transferência)',
        'Когда ссылка приходит из расширения или телефона (загрузка всегда стартует)'
    );
    setAll(
        'settings.externalReceiveFocus',
        'Mettre la fenêtre au premier plan (défaut)',
        'Traer la ventana al frente (predeterminado)',
        'Trazer a janela para a frente (predefinição)',
        'Вывести окно на передний план (по умолчанию)'
    );
    setAll(
        'settings.externalReceiveSilent',
        'Téléchargement silencieux en arrière-plan',
        'Descarga silenciosa en segundo plano',
        'Transferência silenciosa em segundo plano',
        'Тихая фоновая загрузка'
    );
    setAll('settings.sectionCloud', 'Cloud et API', 'Nube y API', 'Cloud e API', 'Облако и API');
    setAll('settings.providerKeysHeading', 'Clés API des fournisseurs', 'Claves API de proveedores', 'Chaves API de fornecedores', 'API-ключи провайдеров');
    setAll(
        'settings.apiOneProviderTip',
        'Choisissez un fournisseur par défaut → collez la clé → Enregistrer. Changer de fournisseur charge sa clé.',
        'Elija un proveedor predeterminado → pegue la clave → Guardar. Al cambiar se carga su clave.',
        'Escolha um fornecedor predefinido → cole a chave → Guardar. Ao mudar carrega a respetiva chave.',
        'Выберите провайдера по умолчанию → вставьте ключ → Сохранить. При смене загружается его ключ.'
    );
    setAll(
        'settings.imageApiTip',
        'Séparée de la traduction. Seule la clé du fournisseur d’image actuel est requise.',
        'Separada de la traducción. Solo se necesita la clave del proveedor de imagen actual.',
        'Separada da tradução. Só é necessária a chave do fornecedor de imagem atual.',
        'Отдельно от перевода. Нужен только ключ текущего провайдера изображений.'
    );
    setAll('settings.providerGroupPrimary', 'Recommandé', 'Recomendado', 'Recomendado', 'Рекомендуемые');
    setAll('settings.providerGroupMore', 'Plus de fournisseurs', 'Más proveedores', 'Mais fornecedores', 'Другие провайдеры');
    setAll(
        'settings.providerHintOpenRouter',
        'Passerelle compatible OpenAI — une clé pour de nombreux modèles. Bon point d’entrée.',
        'Puerta compatible con OpenAI: una clave para muchos modelos. Buen punto de entrada.',
        'Gateway compatível com OpenAI — uma chave para muitos modelos. Bom ponto de entrada.',
        'Шлюз, совместимый с OpenAI — один ключ для многих моделей. Удобная точка входа.'
    );
    setAll(
        'settings.providerHintOpenAI',
        'API OpenAI officielle. Aussi utilisée par de nombreux outils compatibles.',
        'API oficial de OpenAI. También usada por muchas herramientas compatibles.',
        'API oficial da OpenAI. Também usada por muitas ferramentas compatíveis.',
        'Официальный API OpenAI. Также используется многими совместимыми инструментами.'
    );
    setAll(
        'settings.providerHintMultiKey',
        'Rotation multi-clés optionnelle ci-dessous pour résister aux limites de débit.',
        'Rotación multi-clave opcional abajo para resistir límites de tasa.',
        'Rotação multi-chave opcional abaixo para resistir a limites de taxa.',
        'Ниже — опциональная ротация нескольких ключей против лимитов.'
    );
    setAll('settings.configuredProviders', 'Configuré', 'Configurado', 'Configurado', 'Настроено');
    setAll('settings.switchToConfigured', 'Passer à ce fournisseur', 'Cambiar a este proveedor', 'Mudar para este fornecedor', 'Переключить на этого провайдера');
    setAll('settings.multiKeyTitle', 'Rotation multi-clés (optionnel)', 'Rotación multi-clave (opcional)', 'Rotação multi-chave (opcional)', 'Ротация ключей (необязательно)');
    setAll('settings.configSaved', 'Configuration enregistrée', 'Configuración guardada', 'Configuração guardada', 'Конфигурация сохранена');
    setAll('settings.configSaveFailed', 'Échec de l’enregistrement', 'Error al guardar', 'Falha ao guardar', 'Ошибка сохранения');
    setAll('settings.testingConnection', 'Test de connexion…', 'Probando conexión…', 'A testar ligação…', 'Проверка соединения…');
    setAll('settings.connectionOk', 'Connexion OK', 'Conexión OK', 'Ligação OK', 'Соединение OK');
    setAll('settings.connectionFail', 'Échec de connexion', 'Error de conexión', 'Falha de ligação', 'Ошибка соединения');
    setAll(
        'settings.licenseNotice',
        'Le cœur de ce projet repose sur yt-dlp et FFmpeg.',
        'El núcleo de este proyecto se basa en yt-dlp y FFmpeg.',
        'O núcleo deste projeto assenta em yt-dlp e FFmpeg.',
        'Основа этого проекта — yt-dlp и FFmpeg.'
    );

    // tools
    setAll('transcribe.diarizeEngine', 'Moteur de diarisation', 'Motor de diarización', 'Motor de diarização', 'Движок диаризации');
    setAll(
        'transcribe.diarizeEngineSherpa',
        'Sherpa (recommandé, sans HF — modèles au premier usage)',
        'Sherpa (recomendado, sin HF — modelos en el primer uso)',
        'Sherpa (recomendado, sem HF — modelos no primeiro uso)',
        'Sherpa (рекомендуется, без HF — модели при первом запуске)'
    );
    setAll(
        'transcribe.diarizeEnginePyannote',
        'pyannote (jeton Hugging Face requis)',
        'pyannote (requiere token de Hugging Face)',
        'pyannote (requer token Hugging Face)',
        'pyannote (нужен токен Hugging Face)'
    );
    setAll(
        'transcribe.sherpaModelHint',
        'Les modèles ne sont pas inclus ; téléchargement sur cet appareil au premier usage (ou à l’avance).',
        'Los modelos no se incluyen; se descargan en este equipo en el primer uso (o de antemano).',
        'Os modelos não estão incluídos; descarregam-se neste equipamento no primeiro uso (ou de antemão).',
        'Модели не входят в поставку; скачиваются на это устройство при первом использовании (или заранее).'
    );
    setAll('transcribe.sherpaReady', 'Modèles de locuteurs prêts (cache local)', 'Modelos de hablante listos (caché local)', 'Modelos de orador prontos (cache local)', 'Модели спикеров готовы (локальный кэш)');
    setAll('transcribe.sherpaDownloadBtn', 'Pré-télécharger les modèles', 'Precargar modelos', 'Pré-descarregar modelos', 'Скачать модели заранее');
    setAll('transcribe.sherpaDownloading', 'Téléchargement…', 'Descargando…', 'A descarregar…', 'Загрузка…');
    setAll('transcribe.sherpaDownloadOk', 'Modèles de locuteurs prêts', 'Modelos de hablante listos', 'Modelos de orador prontos', 'Модели спикеров готовы');
    setAll('transcribe.sherpaDownloadFail', 'Échec du téléchargement des modèles : ', 'Error al descargar modelos: ', 'Falha ao descarregar modelos: ', 'Ошибка загрузки моделей: ');
    setAll('compress.positionLayout', 'Position et mise en page', 'Posición y diseño', 'Posição e esquema', 'Позиция и вёрстка');
};
