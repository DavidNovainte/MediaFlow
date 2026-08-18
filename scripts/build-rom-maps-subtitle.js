/**
 * FR/ES/PT/RU subtitle + toast + style + tts + settings (subtitle.json roots)
 * @param {(key:string, fr:string, es:string, pt:string, ru:string)=>void} setAll
 */
module.exports = function registerRomSubtitle(setAll) {
    setAll('subtitle.batch.queue_title', 'File', 'Cola', 'Fila', 'Очередь');
    setAll('subtitle.batch.clear_queue', 'Vider la file', 'Vaciar cola', 'Limpar fila', 'Очистить очередь');
    setAll('subtitle.batch.add_folder', 'Ajouter', 'Añadir', 'Adicionar', 'Добавить');
    setAll(
        'subtitle.batch.busy',
        'Traitement par lot en cours, veuillez patienter',
        'Proceso por lotes en curso, espere',
        'Processo em lote em curso, aguarde',
        'Идёт пакетная обработка, подождите'
    );
    setAll(
        'subtitle.batch.queue_empty',
        'La file est déjà vide',
        'La cola ya está vacía',
        'A fila já está vazia',
        'Очередь уже пуста'
    );
    setAll(
        'subtitle.panel.batch_hint',
        'Cochez des lignes pour révision / retraduction / suppression / source TTS / décalage horaire en lot',
        'Marque líneas para revisión / retraducir / borrar / fuente TTS / desfase en lote',
        'Marque linhas para revisão / retraduzir / apagar / fonte TTS / desvio de tempo em lote',
        'Отметьте строки для пакетной проверки / перевода / удаления / TTS / сдвига времени'
    );
    setAll('subtitle.panel.selected_count', '{{count}} sélectionné(s)', '{{count}} seleccionado(s)', '{{count}} selecionado(s)', 'Выбрано: {{count}}');
    setAll('subtitle.panel.locate_current', 'Localiser la ligne actuelle', 'Localizar línea actual', 'Localizar linha atual', 'Найти текущую строку');
    setAll('subtitle.panel.locate_none', 'Aucun sous-titre à localiser', 'No hay subtítulo que localizar', 'Sem legenda para localizar', 'Нет субтитра для поиска');
    setAll('subtitle.panel.editing_track', 'Édition', 'Editando', 'A editar', 'Редактирование');
    setAll('subtitle.panel.track_cue_count', '{{count}} lignes', '{{count}} líneas', '{{count}} linhas', '{{count}} строк');
    setAll('subtitle.panel.toggleOriginal', 'Original', 'Original', 'Original', 'Оригинал');
    setAll('subtitle.panel.shortcuts_title', 'Raccourcis clavier', 'Atajos de teclado', 'Atalhos de teclado', 'Горячие клавиши');
    setAll('subtitle.search.regex', 'Regex', 'Regex', 'Regex', 'Regex');
    setAll(
        'subtitle.video.clear_video',
        'Effacer vidéo et sous-titres',
        'Borrar video y subtítulos',
        'Limpar vídeo e legendas',
        'Очистить видео и субтитры'
    );
    setAll('subtitle.editor.original_option', 'Original', 'Original', 'Original', 'Оригинал');
    setAll(
        'subtitle.editor.empty_title',
        'Pas encore de sous-titres',
        'Aún no hay subtítulos',
        'Ainda sem legendas',
        'Субтитров пока нет'
    );
    setAll(
        'subtitle.editor.empty_hint',
        'Importez un média et lancez la reconnaissance, ou ajoutez une ligne manuellement',
        'Importe un medio y ejecute el reconocimiento, o añada una línea manualmente',
        'Importe um meio e execute o reconhecimento, ou adicione uma linha manualmente',
        'Импортируйте медиа и запустите распознавание или добавьте строку вручную'
    );
    setAll('subtitle.editor.empty_import', 'Importer une vidéo', 'Importar video', 'Importar vídeo', 'Импорт видео');
    setAll('subtitle.editor.empty_ai', 'Reconnaissance IA', 'Reconocimiento IA', 'Reconhecimento IA', 'ИИ-распознавание');
    setAll('subtitle.editor.empty_add', 'Ajouter un sous-titre', 'Añadir subtítulo', 'Adicionar legenda', 'Добавить субтитр');
    setAll(
        'subtitle.editor.no_filter_match_title',
        'Aucune ligne ne correspond à ce filtre',
        'Ninguna línea coincide con este filtro',
        'Nenhuma linha corresponde a este filtro',
        'Нет строк по этому фильтру'
    );
    setAll(
        'subtitle.editor.no_filter_match_hint',
        'Passez le filtre à Tout, ou effacez la recherche',
        'Ponga el filtro en Todo o borre la búsqueda',
        'Ponha o filtro em Tudo ou limpe a pesquisa',
        'Поставьте фильтр «Все» или очистите поиск'
    );
    setAll('subtitle.editor.empty_clear_filter', 'Tout afficher', 'Mostrar todo', 'Mostrar tudo', 'Показать все');
    setAll('subtitle.editor.view_label_lite', 'Compact', 'Compacto', 'Compacto', 'Компакт');
    setAll('subtitle.editor.view_label_full', 'Complet', 'Completo', 'Completo', 'Полный');
    setAll(
        'subtitle.editor.view_lite_on',
        'Passage à la liste compacte',
        'Cambiado a lista compacta',
        'Mudou para lista compacta',
        'Переключено на компактный список'
    );
    setAll(
        'subtitle.editor.view_full_on',
        'Passage à la liste complète',
        'Cambiado a lista completa',
        'Mudou para lista completa',
        'Переключено на полный список'
    );
    setAll(
        'subtitle.editor.empty_hint_short',
        'Commencez par importer ou reconnaître',
        'Empiece importando o reconociendo',
        'Comece por importar ou reconhecer',
        'Начните с импорта или распознавания'
    );
    setAll(
        'subtitle.editor.empty_import_desc',
        'Choisir un fichier média local',
        'Elegir un archivo multimedia local',
        'Escolher um ficheiro multimédia local',
        'Выбрать локальный медиафайл'
    );
    setAll(
        'subtitle.editor.empty_ai_desc',
        'Générer sous-titres et traduction',
        'Generar subtítulos y traducción',
        'Gerar legendas e tradução',
        'Создать субтитры и перевод'
    );
    setAll(
        'subtitle.editor.empty_add_desc',
        'Écrire une ligne à la main',
        'Escribir una línea a mano',
        'Escrever uma linha à mão',
        'Написать строку вручную'
    );
    setAll(
        'subtitle.editor.no_filter_match_hint_short',
        'Essayez un autre filtre',
        'Pruebe otro filtro',
        'Tente outro filtro',
        'Попробуйте другой фильтр'
    );
    setAll(
        'subtitle.editor.empty_clear_filter_desc',
        'Effacer le filtre actuel',
        'Borrar el filtro actual',
        'Limpar o filtro atual',
        'Сбросить текущий фильтр'
    );
    setAll('subtitle.editor.empty_title_ready', 'Média prêt', 'Medio listo', 'Meio pronto', 'Медиа готово');
    setAll(
        'subtitle.editor.empty_hint_ready',
        'Lancez la reconnaissance ou ajoutez une ligne',
        'Ejecute el reconocimiento o añada una línea',
        'Execute o reconhecimento ou adicione uma linha',
        'Запустите распознавание или добавьте строку'
    );
    setAll('subtitle.editor.empty_import_srt', 'Importer des sous-titres', 'Importar subtítulos', 'Importar legendas', 'Импорт субтитров');
    setAll('subtitle.editor.empty_import_srt_desc', 'SRT / ASS / VTT', 'SRT / ASS / VTT', 'SRT / ASS / VTT', 'SRT / ASS / VTT');
    setAll('subtitle.editor.empty_clear_media', 'Effacer le média', 'Borrar medio', 'Limpar meio', 'Очистить медиа');
    setAll(
        'subtitle.editor.empty_clear_media_desc',
        'Retirer la vidéo et réinitialiser le projet',
        'Quitar el video y restablecer el proyecto',
        'Remover o vídeo e repor o projeto',
        'Удалить видео и сбросить проект'
    );

    setAll('subtitle.messages.preparing', 'Préparation de l’environnement…', 'Preparando el entorno…', 'A preparar o ambiente…', 'Подготовка окружения…');
    setAll('subtitle.messages.identifyingBatch', 'Reconnaissance IA par lot…', 'Reconocimiento IA por lotes…', 'Reconhecimento IA em lote…', 'Пакетное ИИ-распознавание…');
    setAll('subtitle.messages.translatingBatch', 'Traduction IA par lot…', 'Traducción IA por lotes…', 'Tradução IA em lote…', 'Пакетный ИИ-перевод…');
    setAll('subtitle.messages.ttsBatch', 'Doublage IA par lot…', 'Doblaje IA por lotes…', 'Dobragem IA em lote…', 'Пакетный ИИ-дубляж…');
    setAll(
        'subtitle.messages.noSubData',
        'Pas encore de données. Lancez d’abord la reconnaissance.',
        'Aún no hay datos. Ejecute primero el reconocimiento.',
        'Ainda sem dados. Execute primeiro o reconhecimento.',
        'Пока нет данных. Сначала запустите распознавание.'
    );
    setAll('subtitle.messages.main', 'Piste principale', 'Pista principal', 'Faixa principal', 'Основная дорожка');
    setAll('subtitle.messages.watermark', 'Piste filigrane', 'Pista de marca de agua', 'Faixa de marca de água', 'Дорожка водяного знака');
    setAll('subtitle.messages.header', 'Piste titre', 'Pista de título', 'Faixa de título', 'Дорожка заголовка');
    setAll('subtitle.messages.subtitle', 'Piste externe', 'Pista externa', 'Faixa externa', 'Внешняя дорожка');
    setAll('subtitle.messages.custom', 'Piste personnalisée', 'Pista personalizada', 'Faixa personalizada', 'Пользовательская дорожка');
    setAll('subtitle.messages.defaultTrackName', 'Piste {n}', 'Pista {n}', 'Faixa {n}', 'Дорожка {n}');
    setAll('subtitle.messages.nothing_to_clear', 'Rien à effacer', 'Nada que borrar', 'Nada a limpar', 'Нечего очищать');

    setAll('toast.rerecognize_success', 'Reconnu à nouveau', 'Reconocido de nuevo', 'Reconhecido de novo', 'Распознано снова');
    setAll(
        'toast.rerecognize_success_needs_retranslate',
        'Reconnu à nouveau — veuillez retraduire',
        'Reconocido de nuevo — vuelva a traducir',
        'Reconhecido de novo — traduza de novo',
        'Распознано снова — переведите заново'
    );
    setAll(
        'toast.rerecognize_retranslate_success',
        'Reconnu et traduit à nouveau',
        'Reconocido y traducido de nuevo',
        'Reconhecido e traduzido de novo',
        'Снова распознано и переведено'
    );
    setAll('toast.rerecognize_failed', 'Échec de la nouvelle reconnaissance', 'Error al reconocer de nuevo', 'Falha ao reconhecer de novo', 'Сбой повторного распознавания');
    setAll('toast.select_video_first', 'Sélectionnez d’abord une vidéo', 'Seleccione primero un video', 'Selecione primeiro um vídeo', 'Сначала выберите видео');
    setAll('toast.tts_auto_updating', 'Mise à jour TTS…', 'Actualizando TTS…', 'A atualizar TTS…', 'Обновление TTS…');
    setAll('toast.tts_auto_updated', 'TTS mis à jour', 'TTS actualizado', 'TTS atualizado', 'TTS обновлён');
    setAll('toast.tts_sync_failed', 'Échec de la sync TTS', 'Error de sincronización TTS', 'Falha de sincronização TTS', 'Сбой синхронизации TTS');
    setAll('toast.no_long_subs_found', 'Aucun sous-titre long trouvé', 'No se encontraron subtítulos largos', 'Não se encontraram legendas longas', 'Длинные субтитры не найдены');
    setAll('toast.ai_optimize_all_success', 'Optimisation IA terminée', 'Optimización IA completada', 'Otimização IA concluída', 'ИИ-оптимизация завершена');
    setAll('toast.ai_optimize_failed', 'Échec de l’optimisation IA', 'Error de optimización IA', 'Falha na otimização IA', 'Сбой ИИ-оптимизации');

    // style (short)
    setAll('style.typography', 'Typographie', 'Tipografía', 'Tipografia', 'Типографика');
    setAll('style.font_family', 'Police', 'Fuente', 'Tipo de letra', 'Шрифт');
    setAll('style.font_size', 'Taille', 'Tamaño', 'Tamanho', 'Размер');
    setAll('style.bold', 'Gras', 'Negrita', 'Negrito', 'Жирный');
    setAll('style.italic', 'Italique', 'Cursiva', 'Itálico', 'Курсив');
    setAll('style.position', 'Position', 'Posición', 'Posição', 'Позиция');
    setAll('style.refresh_fonts', 'Actualiser les polices', 'Actualizar fuentes', 'Atualizar tipos', 'Обновить шрифты');
    setAll('style.margin_h', 'Marge horizontale', 'Margen horizontal', 'Margem horizontal', 'Гор. отступ');
    setAll('style.margin_v', 'Marge verticale', 'Margen vertical', 'Margem vertical', 'Верт. отступ');
    setAll('style.letter_spacing', 'Espacement des lettres', 'Interletrado', 'Espaçamento de letras', 'Межбуквенный');
    setAll('style.line_spacing', 'Interligne', 'Interlineado', 'Entrelinha', 'Межстрочный');
    setAll('style.effects', 'Effets', 'Efectos', 'Efeitos', 'Эффекты');
    setAll('style.colors', 'Couleurs', 'Colores', 'Cores', 'Цвета');
    setAll('style.color_font', 'Couleur du texte', 'Color del texto', 'Cor do texto', 'Цвет текста');
    setAll('style.color_outline', 'Couleur du contour', 'Color del contorno', 'Cor do contorno', 'Цвет обводки');
    setAll('style.outline_width', 'Épaisseur du contour', 'Grosor del contorno', 'Espessura do contorno', 'Толщина обводки');
    setAll('style.karaoke', 'Karaoké', 'Karaoke', 'Karaoke', 'Караоке');
    setAll('style.karaoke_style', 'Style karaoké', 'Estilo karaoke', 'Estilo karaoke', 'Стиль караоке');
    setAll('style.karaoke_style_highlight', 'Surbrillance', 'Resaltado', 'Destaque', 'Подсветка');
    setAll('style.karaoke_style_adaptive', 'Adaptatif', 'Adaptativo', 'Adaptativo', 'Адаптивный');
    setAll('style.karaoke_style_progress', 'Progression', 'Progreso', 'Progresso', 'Прогресс');
    setAll('style.karaoke_color', 'Couleur karaoké', 'Color karaoke', 'Cor karaoke', 'Цвет караоке');
    setAll('style.shadows', 'Ombres', 'Sombras', 'Sombras', 'Тени');
    setAll('style.presets', 'Préréglages', 'Ajustes preestablecidos', 'Predefinições', 'Пресеты');
    setAll('style.preview_placeholder', 'Aperçu', 'Vista previa', 'Pré-visualização', 'Просмотр');
    setAll('style.enableBackground', 'Activer l’arrière-plan', 'Activar fondo', 'Ativar fundo', 'Включить фон');
    setAll('style.bgColor', 'Couleur de fond', 'Color de fondo', 'Cor de fundo', 'Цвет фона');
    setAll('style.opacity', 'Opacité', 'Opacidad', 'Opacidade', 'Непрозрачность');
    setAll('style.bg_mask', 'Masque de fond', 'Máscara de fondo', 'Máscara de fundo', 'Маска фона');
    setAll('style.blur_mask', 'Masque de flou', 'Máscara de desenfoque', 'Máscara de desfoque', 'Маска размытия');
    setAll('style.mask_height', 'Hauteur du masque', 'Altura de máscara', 'Altura da máscara', 'Высота маски');
    setAll('style.blur_strength', 'Intensité du flou', 'Intensidad de desenfoque', 'Intensidade do desfoque', 'Сила размытия');
    setAll('style.effects_blur', 'Flou', 'Desenfoque', 'Desfoque', 'Размытие');
    setAll('style.effects_x', 'Décalage X', 'Desplazamiento X', 'Deslocamento X', 'Смещение X');
    setAll('style.effects_y', 'Décalage Y', 'Desplazamiento Y', 'Deslocamento Y', 'Смещение Y');
    setAll(
        'style.blur_hint',
        'Flou derrière le texte pour la lisibilité',
        'Desenfoque detrás del texto para legibilidad',
        'Desfoque atrás do texto para legibilidade',
        'Размытие за текстом для читаемости'
    );
    setAll('style.template', 'Modèle', 'Plantilla', 'Modelo', 'Шаблон');
    setAll('style.saveTemplate', 'Enregistrer le modèle', 'Guardar plantilla', 'Guardar modelo', 'Сохранить шаблон');
    setAll('style.deleteTemplate', 'Supprimer le modèle', 'Eliminar plantilla', 'Eliminar modelo', 'Удалить шаблон');
    setAll('style.font', 'Police', 'Fuente', 'Fonte', 'Шрифт');
    setAll('style.fontSize', 'Taille', 'Tamaño', 'Tamanho', 'Размер');
    setAll('style.color', 'Couleur', 'Color', 'Cor', 'Цвет');
    setAll('style.outline', 'Contour', 'Contorno', 'Contorno', 'Обводка');
    setAll('style.coordinates', 'Coordonnées', 'Coordenadas', 'Coordenadas', 'Координаты');
    setAll('style.line_height', 'Hauteur de ligne', 'Altura de línea', 'Altura da linha', 'Высота строки');
    setAll('style.border_color', 'Couleur de bordure', 'Color de borde', 'Cor do bordo', 'Цвет рамки');
    setAll('style.templates.default', 'Par défaut', 'Predeterminado', 'Predefinido', 'По умолчанию');
    setAll('style.templates.yellow', 'Jaune', 'Amarillo', 'Amarelo', 'Жёлтый');
    setAll('style.templates.cinema', 'Cinéma', 'Cine', 'Cinema', 'Кино');
    setAll('style.templates.custom', 'Personnalisé', 'Personalizado', 'Personalizado', 'Свой');
    setAll('style.fontWrap', 'Retour à la ligne', 'Ajuste de línea', 'Quebra de linha', 'Перенос');

    // tts
    setAll('tts.title', 'Synthèse vocale (TTS)', 'Síntesis de voz (TTS)', 'Síntese de voz (TTS)', 'Синтез речи (TTS)');
    setAll('tts.enable', 'Activer le TTS', 'Activar TTS', 'Ativar TTS', 'Включить TTS');
    setAll('tts.audio_process', 'Traitement audio', 'Procesamiento de audio', 'Processamento de áudio', 'Обработка звука');
    setAll('tts.engine', 'Moteur', 'Motor', 'Motor', 'Движок');
    setAll('tts.mode_remove', 'Retirer l’audio d’origine', 'Quitar audio original', 'Remover áudio original', 'Убрать исходный звук');
    setAll('tts.mode_keep', 'Garder l’audio d’origine', 'Mantener audio original', 'Manter áudio original', 'Оставить исходный звук');
    setAll('tts.lang', 'Langue', 'Idioma', 'Idioma', 'Язык');
    setAll('tts.voice', 'Voix', 'Voz', 'Voz', 'Голос');
    setAll('tts.preview', 'Aperçu', 'Vista previa', 'Pré-visualização', 'Просмотр');
    setAll('tts.local_settings', 'Paramètres locaux', 'Ajustes locales', 'Definições locais', 'Локальные настройки');
    setAll('tts.reset', 'Réinitialiser', 'Restablecer', 'Repor', 'Сброс');
    setAll('tts.generating', 'Génération…', 'Generando…', 'A gerar…', 'Генерация…');
    setAll('tts.playing', 'Lecture…', 'Reproduciendo…', 'A reproduzir…', 'Воспроизведение…');
    setAll('tts.loading', 'Chargement…', 'Cargando…', 'A carregar…', 'Загрузка…');
    setAll('tts.load_failed', 'Échec du chargement', 'Error al cargar', 'Falha ao carregar', 'Ошибка загрузки');
    setAll(
        'tts.preview_text_default',
        'Ceci est un aperçu de la voix sélectionnée.',
        'Esta es una vista previa de la voz seleccionada.',
        'Esta é uma pré-visualização da voz selecionada.',
        'Это предпрослушивание выбранного голоса.'
    );
    setAll('tts.emotion', 'Émotion', 'Emoción', 'Emoção', 'Эмоция');
    setAll('tts.speed', 'Vitesse', 'Velocidad', 'Velocidade', 'Скорость');
    setAll('tts.pitch', 'Hauteur', 'Tono', 'Tom', 'Высота');
    setAll('tts.origAudio', 'Audio d’origine', 'Audio original', 'Áudio original', 'Исходный звук');
    setAll('tts.modes.remove', 'Retirer l’audio d’origine', 'Quitar audio original', 'Remover áudio original', 'Убрать исходный звук');
    setAll('tts.modes.keepOriginal', 'Garder l’audio d’origine', 'Mantener audio original', 'Manter áudio original', 'Оставить исходный звук');
    setAll('tts.modes.keepBgm', 'Garder seulement le BGM', 'Mantener solo BGM', 'Manter só BGM', 'Оставить только BGM');
    setAll('tts.modes.customBgm', 'BGM personnalisé', 'BGM personalizado', 'BGM personalizado', 'Свой BGM');
    setAll('tts.selectBgm', 'Choisir le BGM', 'Elegir BGM', 'Escolher BGM', 'Выбрать BGM');
    setAll('tts.voiceVolume', 'Volume de la voix', 'Volumen de voz', 'Volume da voz', 'Громкость голоса');
    setAll('tts.bgmVolume', 'Volume BGM', 'Volumen BGM', 'Volume BGM', 'Громкость BGM');
    setAll('tts.filters.all', 'Tout', 'Todo', 'Tudo', 'Все');
    setAll('tts.filters.common', 'Courant', 'Comunes', 'Comuns', 'Частые');
    setAll('tts.filters.other', 'Autres', 'Otros', 'Outros', 'Другие');

    // language names
    const langs = [
        ['zh', 'Chinois', 'Chino', 'Chinês', 'Китайский'],
        ['en', 'Anglais', 'Inglés', 'Inglês', 'Английский'],
        ['ja', 'Japonais', 'Japonés', 'Japonês', 'Японский'],
        ['ko', 'Coréen', 'Coreano', 'Coreano', 'Корейский'],
        ['fr', 'Français', 'Francés', 'Francês', 'Французский'],
        ['de', 'Allemand', 'Alemán', 'Alemão', 'Немецкий'],
        ['es', 'Espagnol', 'Español', 'Espanhol', 'Испанский'],
        ['ru', 'Russe', 'Ruso', 'Russo', 'Русский'],
        ['pt', 'Portugais', 'Portugués', 'Português', 'Португальский'],
        ['it', 'Italien', 'Italiano', 'Italiano', 'Итальянский'],
        ['id', 'Indonésien', 'Indonesio', 'Indonésio', 'Индонезийский'],
        ['vi', 'Vietnamien', 'Vietnamita', 'Vietnamita', 'Вьетнамский'],
        ['th', 'Thaï', 'Tailandés', 'Tailandês', 'Тайский'],
        ['ms', 'Malais', 'Malayo', 'Malaio', 'Малайский'],
        ['hi', 'Hindi', 'Hindi', 'Hindi', 'Хинди'],
        ['ar', 'Arabe', 'Árabe', 'Árabe', 'Арабский'],
        ['tr', 'Turc', 'Turco', 'Turco', 'Турецкий'],
        ['nl', 'Néerlandais', 'Neerlandés', 'Neerlandês', 'Нидерландский'],
        ['pl', 'Polonais', 'Polaco', 'Polaco', 'Польский'],
        ['sv', 'Suédois', 'Sueco', 'Sueco', 'Шведский'],
        ['da', 'Danois', 'Danés', 'Dinamarquês', 'Датский'],
        ['no', 'Norvégien', 'Noruego', 'Norueguês', 'Норвежский'],
        ['fi', 'Finnois', 'Finés', 'Finlandês', 'Финский'],
        ['cs', 'Tchèque', 'Checo', 'Checo', 'Чешский'],
        ['ro', 'Roumain', 'Rumano', 'Romeno', 'Румынский'],
        ['bg', 'Bulgare', 'Búlgaro', 'Búlgaro', 'Болгарский'],
        ['el', 'Grec', 'Griego', 'Grego', 'Греческий'],
        ['he', 'Hébreu', 'Hebreo', 'Hebraico', 'Иврит'],
        ['hu', 'Hongrois', 'Húngaro', 'Húngaro', 'Венгерский'],
        ['uk', 'Ukrainien', 'Ucraniano', 'Ucraniano', 'Украинский'],
        ['sk', 'Slovaque', 'Eslovaco', 'Eslovaco', 'Словацкий'],
        ['hr', 'Croate', 'Croata', 'Croata', 'Хорватский'],
        ['af', 'Afrikaans', 'Afrikáans', 'Afrikaans', 'Африкаанс']
    ];
    for (const [code, fr, es, pt, ru] of langs) {
        setAll(`tts.languages.${code}`, fr, es, pt, ru);
        setAll(`settings.lang.${code}`, fr, es, pt, ru);
    }
    setAll('settings.lang.auto', 'Détection auto', 'Detección automática', 'Deteção automática', 'Автоопределение');
    setAll('settings.lang.zhHans', 'Chinois simplifié', 'Chino simplificado', 'Chinês simplificado', 'Китайский (упр.)');
    setAll('settings.lang.zhHant', 'Chinois traditionnel', 'Chino tradicional', 'Chinês tradicional', 'Китайский (трад.)');
    setAll(
        'settings.lang.sourceOnly',
        'Transcription seule (garder la langue d’origine)',
        'Solo transcripción (mantener idioma original)',
        'Só transcrição (manter idioma original)',
        'Только расшифровка (сохранить исходный язык)'
    );

    // settings (subtitle file)
    setAll('settings.input_mode', 'Mode d’entrée', 'Modo de entrada', 'Modo de entrada', 'Режим ввода');
    setAll('settings.single_file', 'Fichier unique', 'Archivo único', 'Ficheiro único', 'Один файл');
    setAll('settings.batch_mode', 'Traitement par lot', 'Proceso por lotes', 'Processamento em lote', 'Пакетная обработка');
    setAll('settings.inputSource', 'Source d’entrée', 'Fuente de entrada', 'Fonte de entrada', 'Источник ввода');
    setAll('settings.singleVideo', 'Vidéo unique', 'Video único', 'Vídeo único', 'Одно видео');
    setAll('settings.batchFolder', 'Dossier lot', 'Carpeta de lote', 'Pasta de lote', 'Папка пакета');
    setAll('settings.workMode', 'Mode de travail', 'Modo de trabajo', 'Modo de trabalho', 'Режим работы');
    setAll('settings.recognition', 'Reconnaissance de sous-titres', 'Reconocimiento de subtítulos', 'Reconhecimento de legendas', 'Распознавание субтитров');
    setAll('settings.ai_auto', 'IA auto', 'IA auto', 'IA auto', 'ИИ авто');
    setAll('settings.import_srt', 'Importer SRT', 'Importar SRT', 'Importar SRT', 'Импорт SRT');
    setAll('settings.manual_input', 'Saisie manuelle', 'Entrada manual', 'Entrada manual', 'Ручной ввод');
    setAll('settings.select_srt', 'Choisir un fichier SRT', 'Seleccionar archivo SRT', 'Selecionar ficheiro SRT', 'Выбрать файл SRT');
    setAll('settings.auto_translate', 'Traduction automatique', 'Traducción automática', 'Tradução automática', 'Автоперевод');
    setAll('settings.aiRecognize', 'Reconnaissance et traduction IA', 'Reconocimiento y traducción IA', 'Reconhecimento e tradução IA', 'ИИ-распознавание и перевод');
    setAll('settings.importFile', 'Importer un fichier de sous-titres', 'Importar archivo de subtítulos', 'Importar ficheiro de legendas', 'Импорт файла субтитров');
    setAll('settings.manualCaption', 'Écrire un script manuellement', 'Escribir guion manualmente', 'Escrever guião manualmente', 'Написать сценарий вручную');
    setAll('settings.importSrt', 'Importer SRT/ASS', 'Importar SRT/ASS', 'Importar SRT/ASS', 'Импорт SRT/ASS');
    setAll('settings.translation', 'Paramètres de traduction', 'Ajustes de traducción', 'Definições de tradução', 'Настройки перевода');
    setAll('settings.lang_settings', 'Paramètres de langue', 'Ajustes de idioma', 'Definições de idioma', 'Языковые настройки');
    setAll('settings.style_hint', 'Note de style', 'Nota de estilo', 'Nota de estilo', 'Заметка о стиле');
    setAll(
        'settings.style_hint_placeholder',
        'ex. : plus humoristique, oral, académique…',
        'p. ej.: más humorístico, coloquial, académico…',
        'ex.: mais humorístico, coloquial, académico…',
        'напр.: юмористичнее, разговорно, академично…'
    );
    setAll('settings.inspector.show', 'Paramètres détaillés', 'Ajustes detallados', 'Definições detalhadas', 'Подробные настройки');
    setAll('settings.inspector.hide', 'Masquer les détails', 'Ocultar detalles', 'Ocultar detalhes', 'Скрыть подробности');
    setAll('settings.sourceLang', 'Langue source', 'Idioma de origen', 'Idioma de origem', 'Исходный язык');
    setAll('settings.targetLang', 'Langue cible', 'Idioma de destino', 'Idioma de destino', 'Целевой язык');
    setAll('settings.keep_bilingual', 'Garder l’affichage bilingue', 'Mantener visualización bilingüe', 'Manter visualização bilingue', 'Сохранить двуязычный вид');
    setAll('settings.length_optimize', 'Phrases longues', 'Frases largas', 'Frases longas', 'Длинные фразы');
    setAll('settings.optimize_strategy', 'Stratégie d’optimisation', 'Estrategia de optimización', 'Estratégia de otimização', 'Стратегия оптимизации');
    setAll('settings.max_chars', 'Limite par ligne', 'Límite por línea', 'Limite por linha', 'Лимит на строку');
    setAll('settings.max_lines', 'Lignes max', 'Líneas máx.', 'Linhas máx.', 'Макс. строк');
    setAll('settings.templates.custom', 'Style personnalisé', 'Estilo personalizado', 'Estilo personalizado', 'Свой стиль');
    setAll('settings.strategyOptions.split', 'Découpage intelligent', 'División inteligente', 'Divisão inteligente', 'Умное разбиение');
    setAll('settings.strategyOptions.wrap', 'Retour forcé', 'Ajuste forzado', 'Quebra forçada', 'Принудительный перенос');
    setAll('settings.strategyOptions.scale', 'Échelle visuelle', 'Escala visual', 'Escala visual', 'Визуальный масштаб');
    setAll('settings.engine', 'Moteur de reconnaissance / traduction', 'Motor de reconocimiento / traducción', 'Motor de reconhecimento / tradução', 'Движок распознавания / перевода');
    setAll(
        'settings.engineHint',
        'La reconnaissance et la traduction partagent ce moteur (configurez la clé API dans les paramètres)',
        'El reconocimiento y la traducción comparten este motor (configure la clave API en ajustes)',
        'O reconhecimento e a tradução partilham este motor (configure a chave API nas definições)',
        'Распознавание и перевод используют этот движок (ключ API — в настройках)'
    );
    setAll('settings.engineOptions.groq', 'Groq (gratuit recommandé)', 'Groq (gratis recomendado)', 'Groq (grátis recomendado)', 'Groq (бесплатно, рекомендуется)');
    setAll('settings.engineOptions.gemini', 'Gemini (recommandé)', 'Gemini (recomendado)', 'Gemini (recomendado)', 'Gemini (рекомендуется)');
    setAll('settings.select_preset', 'Choisir un modèle', 'Elegir plantilla', 'Escolher modelo', 'Выбрать шаблон');
    setAll('settings.save_preset', 'Enregistrer le style', 'Guardar estilo', 'Guardar estilo', 'Сохранить стиль');
    setAll('settings.import_preset', 'Importer un modèle', 'Importar plantilla', 'Importar modelo', 'Импорт шаблона');
    setAll('settings.export_preset', 'Exporter un modèle', 'Exportar plantilla', 'Exportar modelo', 'Экспорт шаблона');
    setAll('settings.fontOptions.msYaHei', 'Microsoft YaHei (défaut)', 'Microsoft YaHei (predeterminado)', 'Microsoft YaHei (predefinição)', 'Microsoft YaHei (по умолчанию)');
    setAll('settings.fontOptions.simHei', 'SimHei (compatible)', 'SimHei (compatible)', 'SimHei (compatível)', 'SimHei (совместимый)');
    setAll('settings.fontOptions.arial', 'Arial (latin)', 'Arial (latín)', 'Arial (latim)', 'Arial (латиница)');
    setAll('settings.posOptions.bottomCenter', 'Bas centre', 'Abajo centro', 'Inferior centro', 'Низ по центру');
    setAll('settings.posOptions.topCenter', 'Haut centre', 'Arriba centro', 'Superior centro', 'Верх по центру');
    setAll('settings.posOptions.custom', 'Position personnalisée', 'Posición personalizada', 'Posição personalizada', 'Своя позиция');
    setAll(
        'settings.placeholder.outputPath',
        'Choisir le dossier de sortie…',
        'Elegir carpeta de salida…',
        'Escolher pasta de saída…',
        'Выберите папку вывода…'
    );
    setAll(
        'settings.placeholder.inputTemplateName',
        'Entrer le nom du modèle',
        'Introducir nombre de plantilla',
        'Introduzir nome do modelo',
        'Введите имя шаблона'
    );

    setAll(
        'subtitle.settings.engineHint',
        'La reconnaissance et la traduction partagent ce moteur (clé API dans les paramètres)',
        'El reconocimiento y la traducción comparten este motor (clave API en ajustes)',
        'O reconhecimento e a tradução partilham este motor (chave API nas definições)',
        'Распознавание и перевод используют этот движок (ключ API — в настройках)'
    );
    setAll(
        'subtitle.actions.aiProcess_tip_with_engine',
        'Utilise le moteur actuel ({engine}) pour la reconnaissance et la traduction. Changez-le dans les paramètres.',
        'Usa el motor actual ({engine}) para reconocimiento y traducción. Cámbielo en ajustes.',
        'Usa o motor atual ({engine}) para reconhecimento e tradução. Altere nas definições.',
        'Использует текущий движок ({engine}) для распознавания и перевода. Смените в настройках.'
    );
    setAll(
        'subtitle.export.precheck_title',
        'Contrôle avant gravure ({{count}} lignes)',
        'Comprobación previa al quemado ({{count}} líneas)',
        'Verificação antes de gravar ({{count}} linhas)',
        'Проверка перед прожигом ({{count}} строк)'
    );
    setAll(
        'subtitle.export.precheck_continue',
        'Continuer la gravure quand même ?',
        '¿Continuar el quemado de todos modos?',
        'Continuar a gravação mesmo assim?',
        'Всё равно продолжить прожиг?'
    );
    setAll('subtitle.toast.undo_hint', ' (Ctrl+Z pour annuler)', ' (Ctrl+Z para deshacer)', ' (Ctrl+Z para anular)', ' (Ctrl+Z для отмены)');
    setAll(
        'subtitle.toast.media_cleared',
        'Média et sous-titres effacés',
        'Medio y subtítulos borrados',
        'Meio e legendas limpos',
        'Медиа и субтитры очищены'
    );
    setAll(
        'subtitle.toast.batch_queue_cleared',
        'File de lot vidée',
        'Cola de lote vaciada',
        'Fila de lote limpa',
        'Пакетная очередь очищена'
    );
    setAll(
        'subtitle.confirm.clear_media',
        'Effacer la vidéo actuelle et tous les sous-titres ? Vous pourrez réimporter à tout moment.',
        '¿Borrar el video actual y todos los subtítulos? Puede volver a importar en cualquier momento.',
        'Limpar o vídeo atual e todas as legendas? Pode reimportar a qualquer momento.',
        'Очистить текущее видео и все субтитры? Можно импортировать снова в любой момент.'
    );
    setAll(
        'subtitle.confirm.clear_batch_queue',
        'Vider la file de lot ({count} fichiers) ? Le média actuel sera aussi effacé.',
        '¿Vaciar la cola de lote ({count} archivos)? El medio actual también se borrará.',
        'Limpar a fila de lote ({count} ficheiros)? O meio atual também será limpo.',
        'Очистить пакетную очередь ({count} файлов)? Текущее медиа тоже будет очищено.'
    );
};
