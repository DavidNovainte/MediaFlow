/**
 * Translate newly added hardcoded-replacement keys into all locales.
 * node scripts/patch-new-keys-all-langs.js
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const { execFileSync } = require('child_process');

/** flat key -> { de, ja, ko, fr, es, pt, ru } */
const T = {
    'editor.timelineEmpty': {
        de: 'Timeline ist leer',
        ja: 'タイムラインが空です',
        ko: '타임라인이 비어 있습니다',
        fr: 'La timeline est vide',
        es: 'La línea de tiempo está vacía',
        pt: 'A linha do tempo está vazia',
        ru: 'Таймлайн пуст'
    },
    'editor.exportNotReady': {
        de: 'Exportpipeline ist noch nicht bereit',
        ja: '書き出しパイプラインの準備ができていません',
        ko: '내보내기 파이프라인이 아직 준비되지 않았습니다',
        fr: 'Le pipeline d’export n’est pas encore prêt',
        es: 'El flujo de exportación aún no está listo',
        pt: 'O fluxo de exportação ainda não está pronto',
        ru: 'Конвейер экспорта ещё не готов'
    },
    'editor.exportFailed': {
        de: 'Export fehlgeschlagen',
        ja: '書き出しに失敗しました',
        ko: '내보내기 실패',
        fr: 'Échec de l’export',
        es: 'Error al exportar',
        pt: 'Falha na exportação',
        ru: 'Ошибка экспорта'
    },
    'editor.exportAudioOk': {
        de: 'Audio erfolgreich exportiert',
        ja: '音声の書き出しが完了しました',
        ko: '오디오를 내보냈습니다',
        fr: 'Audio exporté avec succès',
        es: 'Audio exportado correctamente',
        pt: 'Áudio exportado com sucesso',
        ru: 'Аудио успешно экспортировано'
    },
    'editor.exportVideoOk': {
        de: 'Video erfolgreich exportiert',
        ja: '動画の書き出しが完了しました',
        ko: '동영상을 내보냈습니다',
        fr: 'Vidéo exportée avec succès',
        es: 'Video exportado correctamente',
        pt: 'Vídeo exportado com sucesso',
        ru: 'Видео успешно экспортировано'
    },
    'editor.nothingToPlay': {
        de: 'Nichts abspielbar (Clips zur Timeline hinzufügen oder Video/Audio in der Bibliothek wählen)',
        ja: '再生できる内容がありません（タイムラインに追加するか、ライブラリで映像/音声を選択）',
        ko: '재생할 내용이 없습니다(타임라인에 추가하거나 라이브러리에서 비디오/오디오 선택)',
        fr: 'Rien à lire (ajoutez des clips à la timeline ou sélectionnez vidéo/audio dans la bibliothèque)',
        es: 'No hay nada que reproducir (añada clips a la línea de tiempo o seleccione vídeo/audio en la biblioteca)',
        pt: 'Nada para reproduzir (adicione clips à linha do tempo ou selecione vídeo/áudio na biblioteca)',
        ru: 'Нечего воспроизводить (добавьте клипы на таймлайн или выберите видео/аудио в библиотеке)'
    },
    'editor.playFailed': {
        de: 'Wiedergabe fehlgeschlagen',
        ja: '再生に失敗しました',
        ko: '재생 실패',
        fr: 'Échec de la lecture',
        es: 'Error de reproducción',
        pt: 'Falha na reprodução',
        ru: 'Ошибка воспроизведения'
    },
    'editor.pause': {
        de: 'Pause',
        ja: '一時停止',
        ko: '일시정지',
        fr: 'Pause',
        es: 'Pausa',
        pt: 'Pausa',
        ru: 'Пауза'
    },
    'editor.play': {
        de: 'Abspielen',
        ja: '再生',
        ko: '재생',
        fr: 'Lecture',
        es: 'Reproducir',
        pt: 'Reproduzir',
        ru: 'Воспроизведение'
    },
    'editor.pausePreview': {
        de: 'Vorschau pausieren',
        ja: 'プレビューを一時停止',
        ko: '미리보기 일시정지',
        fr: 'Pause de l’aperçu',
        es: 'Pausar vista previa',
        pt: 'Pausar pré-visualização',
        ru: 'Пауза предпросмотра'
    },
    'editor.playPreview': {
        de: 'Vorschau abspielen',
        ja: 'プレビューを再生',
        ko: '미리보기 재생',
        fr: 'Lire l’aperçu',
        es: 'Reproducir vista previa',
        pt: 'Reproduzir pré-visualização',
        ru: 'Воспроизвести предпросмотр'
    },
    'editor.lockTrack': {
        de: 'Spur sperren',
        ja: 'トラックをロック',
        ko: '트랙 잠금',
        fr: 'Verrouiller la piste',
        es: 'Bloquear pista',
        pt: 'Bloquear faixa',
        ru: 'Заблокировать дорожку'
    },
    'editor.unlockTrack': {
        de: 'Spur entsperren',
        ja: 'トラックのロック解除',
        ko: '트랙 잠금 해제',
        fr: 'Déverrouiller la piste',
        es: 'Desbloquear pista',
        pt: 'Desbloquear faixa',
        ru: 'Разблокировать дорожку'
    },
    'editor.trackHidden': {
        de: 'Spur ist ausgeblendet.',
        ja: 'トラックは非表示です。',
        ko: '트랙이 숨겨져 있습니다.',
        fr: 'La piste est masquée.',
        es: 'La pista está oculta.',
        pt: 'A faixa está oculta.',
        ru: 'Дорожка скрыта.'
    },
    'editor.trackSoloInactive': {
        de: 'Spur außerhalb Solo inaktiv.',
        ja: 'ソロ外のためトラックは非アクティブです。',
        ko: '솔로 외에서는 트랙이 비활성입니다.',
        fr: 'Piste inactive hors solo.',
        es: 'Pista inactiva fuera de solo.',
        pt: 'Faixa inativa fora do solo.',
        ru: 'Дорожка неактивна вне соло.'
    },
    'common.saveFailed': {
        de: 'Speichern fehlgeschlagen',
        ja: '保存に失敗しました',
        ko: '저장 실패',
        fr: 'Échec de l’enregistrement',
        es: 'Error al guardar',
        pt: 'Falha ao guardar',
        ru: 'Ошибка сохранения'
    },
    'common.processing': {
        de: 'Verarbeitung...',
        ja: '処理中...',
        ko: '처리 중...',
        fr: 'Traitement...',
        es: 'Procesando...',
        pt: 'A processar...',
        ru: 'Обработка...'
    },
    'common.processingPercent': {
        de: 'Verarbeitung... {percent}%',
        ja: '処理中... {percent}%',
        ko: '처리 중... {percent}%',
        fr: 'Traitement... {percent}%',
        es: 'Procesando... {percent}%',
        pt: 'A processar... {percent}%',
        ru: 'Обработка... {percent}%'
    },
    'update.available': {
        de: 'Neue Version v{version} gefunden. Wird im Hintergrund vorbereitet...',
        ja: '新バージョン v{version} が見つかりました。バックグラウンドで準備中...',
        ko: '새 버전 v{version}을(를) 찾았습니다. 백그라운드에서 준비 중...',
        fr: 'Nouvelle version v{version} trouvée. Préparation en arrière-plan...',
        es: 'Nueva versión v{version} encontrada. Preparando en segundo plano...',
        pt: 'Nova versão v{version} encontrada. A preparar em segundo plano...',
        ru: 'Найдена новая версия v{version}. Готовится в фоне...'
    },
    'update.downloaded': {
        de: 'Neue Version v{version} ist installierbereit!',
        ja: '新バージョン v{version} のダウンロードが完了しました！',
        ko: '새 버전 v{version} 다운로드가 완료되었습니다!',
        fr: 'La nouvelle version v{version} est prête à installer !',
        es: '¡La nueva versión v{version} está lista para instalar!',
        pt: 'A nova versão v{version} está pronta para instalar!',
        ru: 'Новая версия v{version} готова к установке!'
    },
    'update.restartAndInstall': {
        de: 'Neu starten und aktualisieren',
        ja: '再起動して更新',
        ko: '다시 시작하여 업데이트',
        fr: 'Redémarrer et mettre à jour',
        es: 'Reiniciar y actualizar',
        pt: 'Reiniciar e atualizar',
        ru: 'Перезапустить и обновить'
    },
    'update.checking': {
        de: 'Suche nach Updates...',
        ja: '更新を確認中...',
        ko: '업데이트 확인 중...',
        fr: 'Recherche de mises à jour...',
        es: 'Buscando actualizaciones...',
        pt: 'A procurar atualizações...',
        ru: 'Проверка обновлений...'
    },
    'update.latest': {
        de: 'Bereits aktuell',
        ja: 'すでに最新です',
        ko: '이미 최신입니다',
        fr: 'Déjà à jour',
        es: 'Ya está actualizado',
        pt: 'Já está atualizado',
        ru: 'Уже актуальная версия'
    },
    'update.failed': {
        de: 'Update-Prüfung fehlgeschlagen, später erneut versuchen',
        ja: '更新の確認に失敗しました。後でもう一度お試しください',
        ko: '업데이트 확인 실패, 나중에 다시 시도하세요',
        fr: 'Échec de la vérification, réessayez plus tard',
        es: 'Error al buscar actualizaciones, inténtelo más tarde',
        pt: 'Falha na verificação, tente mais tarde',
        ru: 'Не удалось проверить обновления, попробуйте позже'
    },
    'download.fullLength': {
        de: 'Gesamtlänge',
        ja: '全長ダウンロード',
        ko: '전체 길이',
        fr: 'Durée complète',
        es: 'Duración completa',
        pt: 'Duração completa',
        ru: 'Полная длина'
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
    'download.parseListFailed': {
        de: 'Liste konnte nicht gelesen werden',
        ja: 'リストの解析に失敗しました',
        ko: '목록 분석 실패',
        fr: 'Échec de l’analyse de la liste',
        es: 'Error al analizar la lista',
        pt: 'Falha ao analisar a lista',
        ru: 'Не удалось разобрать список'
    },
    'enhance.processingPercent': {
        de: 'Verarbeitung... {percent}%',
        ja: '処理中... {percent}%',
        ko: '처리 중... {percent}%',
        fr: 'Traitement... {percent}%',
        es: 'Procesando... {percent}%',
        pt: 'A processar... {percent}%',
        ru: 'Обработка... {percent}%'
    },
    'pixel.aiEnhancingPercent': {
        de: 'KI-Enhance... {percent}%',
        ja: 'AI エンハンス中... {percent}%',
        ko: 'AI 향상 중... {percent}%',
        fr: 'Amélioration IA... {percent}%',
        es: 'Mejora IA... {percent}%',
        pt: 'Melhoria IA... {percent}%',
        ru: 'ИИ-улучшение... {percent}%'
    },
    'pixel.confirmDeletePreset': {
        de: 'Voreinstellung "{name}" löschen? Dies kann nicht rückgängig gemacht werden.',
        ja: 'プリセット「{name}」を削除しますか？この操作は取り消せません。',
        ko: '프리셋 "{name}"을(를) 삭제할까요? 되돌릴 수 없습니다.',
        fr: 'Supprimer le préréglage « {name} » ? Irréversible.',
        es: '¿Eliminar el ajuste "{name}"? No se puede deshacer.',
        pt: 'Eliminar a predefinição "{name}"? Não pode ser anulado.',
        ru: 'Удалить пресет «{name}»? Это нельзя отменить.'
    },
    'toast.tts_auto_failed': {
        de: 'Sprach-Update fehlgeschlagen',
        ja: '音声の更新に失敗しました',
        ko: '음성 업데이트 실패',
        fr: 'Échec de la mise à jour vocale',
        es: 'Error al actualizar la voz',
        pt: 'Falha ao atualizar a voz',
        ru: 'Не удалось обновить озвучку'
    },
    'subtitle.messages.trackFallback': {
        de: 'Spur {id}',
        ja: 'トラック {id}',
        ko: '트랙 {id}',
        fr: 'Piste {id}',
        es: 'Pista {id}',
        pt: 'Faixa {id}',
        ru: 'Дорожка {id}'
    },
    'subtitle.messages.cueCount': {
        de: '{count} Einträge',
        ja: '{count} 行',
        ko: '{count}줄',
        fr: '{count} lignes',
        es: '{count} líneas',
        pt: '{count} linhas',
        ru: '{count} строк'
    },
    'subtitle.timeline.emptyHint': {
        de: 'Noch keine Untertiteldaten',
        ja: 'まだ字幕データがありません',
        ko: '아직 자막 데이터가 없습니다',
        fr: 'Pas encore de données de sous-titres',
        es: 'Aún no hay datos de subtítulos',
        pt: 'Ainda sem dados de legendas',
        ru: 'Пока нет данных субтитров'
    },
    'transcribe.clipSelected': {
        de: 'Auswahl schneiden ({start} - {end}) [{duration}s]',
        ja: '選択をクリップ ({start} - {end}) [{duration}s]',
        ko: '선택 구간 클립 ({start} - {end}) [{duration}s]',
        fr: 'Couper la sélection ({start} - {end}) [{duration}s]',
        es: 'Recortar selección ({start} - {end}) [{duration}s]',
        pt: 'Recortar seleção ({start} - {end}) [{duration}s]',
        ru: 'Вырезать выделение ({start} - {end}) [{duration}s]'
    },
    'transcribe.clipSelectedShort': {
        de: 'Ausgewählte Segmente schneiden',
        ja: '選択した段落をクリップ',
        ko: '선택한 구간 클립',
        fr: 'Couper les segments sélectionnés',
        es: 'Recortar segmentos seleccionados',
        pt: 'Recortar segmentos selecionados',
        ru: 'Вырезать выбранные сегменты'
    }
};

// write maps and apply via existing tool
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
    for (const [key, langs] of Object.entries(T)) {
        if (langs[short]) map[key] = langs[short];
    }
    // player strings reuse common processing style
    const playerPack = {
        'player.resolving': {
            de: 'Medien-URL wird aufgelöst...',
            ja: 'メディア URL を解決中...',
            ko: '미디어 URL 확인 중...',
            fr: 'Résolution de l’URL média...',
            es: 'Resolviendo URL de medios...',
            pt: 'A resolver URL de média...',
            ru: 'Разрешение URL медиа...'
        },
        'player.preparing': {
            de: 'Wiedergabe wird vorbereitet...',
            ja: '再生を準備中...',
            ko: '재생 준비 중...',
            fr: 'Préparation de la lecture...',
            es: 'Preparando reproducción...',
            pt: 'A preparar reprodução...',
            ru: 'Подготовка воспроизведения...'
        },
        'player.loading': {
            de: 'Laden...',
            ja: '読み込み中...',
            ko: '로드 중...',
            fr: 'Chargement...',
            es: 'Cargando...',
            pt: 'A carregar...',
            ru: 'Загрузка...'
        },
        'player.castError': {
            de: 'Cast-Fehler: {message}',
            ja: 'キャストエラー: {message}',
            ko: '캐스트 오류: {message}',
            fr: 'Erreur de cast : {message}',
            es: 'Error de cast: {message}',
            pt: 'Erro de cast: {message}',
            ru: 'Ошибка cast: {message}'
        },
        'player.unknownError': {
            de: 'Unbekannter Fehler',
            ja: '不明なエラー',
            ko: '알 수 없는 오류',
            fr: 'Erreur inconnue',
            es: 'Error desconocido',
            pt: 'Erro desconhecido',
            ru: 'Неизвестная ошибка'
        },
        'player.imageLoadFailed': {
            de: 'Bild konnte nicht geladen werden',
            ja: '画像の読み込みに失敗しました',
            ko: '이미지 로드 실패',
            fr: 'Échec du chargement de l’image',
            es: 'Error al cargar la imagen',
            pt: 'Falha ao carregar a imagem',
            ru: 'Не удалось загрузить изображение'
        },
        'player.parsingLink': {
            de: 'Link wird analysiert...',
            ja: 'リンクを解析中...',
            ko: '링크 분석 중...',
            fr: 'Analyse du lien...',
            es: 'Analizando enlace...',
            pt: 'A analisar link...',
            ru: 'Разбор ссылки...'
        },
        'player.parseFailed': {
            de: 'Analyse fehlgeschlagen: {error}',
            ja: '解析失敗: {error}',
            ko: '분석 실패: {error}',
            fr: 'Échec de l’analyse : {error}',
            es: 'Error al analizar: {error}',
            pt: 'Falha na análise: {error}',
            ru: 'Ошибка разбора: {error}'
        },
        'player.unsupportedLink': {
            de: 'Nicht unterstützter Link',
            ja: '未対応のリンク',
            ko: '지원되지 않는 링크',
            fr: 'Lien non pris en charge',
            es: 'Enlace no compatible',
            pt: 'Link não suportado',
            ru: 'Неподдерживаемая ссылка'
        },
        'player.parseError': {
            de: 'Analysefehler: {error}',
            ja: '解析エラー: {error}',
            ko: '분석 오류: {error}',
            fr: 'Erreur d’analyse : {error}',
            es: 'Error de análisis: {error}',
            pt: 'Erro de análise: {error}',
            ru: 'Ошибка анализа: {error}'
        },
        'player.hlsFatal': {
            de: 'Wiedergabe fehlgeschlagen: schwerwiegender HLS-Fehler',
            ja: '再生失敗: HLS の致命的エラー',
            ko: '재생 실패: HLS 치명적 오류',
            fr: 'Échec de lecture : erreur HLS fatale',
            es: 'Error de reproducción: error HLS fatal',
            pt: 'Falha de reprodução: erro HLS fatal',
            ru: 'Ошибка воспроизведения: фатальная ошибка HLS'
        },
        'player.hlsUnsupported': {
            de: 'Wiedergabe fehlgeschlagen: Browser unterstützt HLS nicht',
            ja: '再生失敗: ブラウザが HLS 非対応',
            ko: '재생 실패: 브라우저가 HLS를 지원하지 않음',
            fr: 'Échec de lecture : le navigateur ne prend pas en charge HLS',
            es: 'Error de reproducción: el navegador no admite HLS',
            pt: 'Falha de reprodução: o navegador não suporta HLS',
            ru: 'Ошибка воспроизведения: браузер не поддерживает HLS'
        },
        'player.playbackFailed': {
            de: 'Wiedergabe fehlgeschlagen: {error}',
            ja: '再生失敗: {error}',
            ko: '재생 실패: {error}',
            fr: 'Échec de lecture : {error}',
            es: 'Error de reproducción: {error}',
            pt: 'Falha de reprodução: {error}',
            ru: 'Ошибка воспроизведения: {error}'
        },
        'transcribe.errors.apiKeyMissing': {
            de: 'API-Schlüssel ist nicht gesetzt',
            ja: 'API キーが設定されていません',
            ko: 'API 키가 설정되지 않았습니다',
            fr: 'La clé API n’est pas définie',
            es: 'La clave API no está configurada',
            pt: 'A chave API não está definida',
            ru: 'API-ключ не задан'
        },
        'transcribe.errors.apiKeyMissingSettings': {
            de: 'API-Schlüssel ist nicht gesetzt. Bitte in den Einstellungen konfigurieren.',
            ja: 'API キーが設定されていません。設定で構成してください。',
            ko: 'API 키가 설정되지 않았습니다. 설정에서 구성하세요.',
            fr: 'La clé API n’est pas définie. Configurez-la dans les paramètres.',
            es: 'La clave API no está configurada. Configúrela en ajustes.',
            pt: 'A chave API não está definida. Configure-a nas definições.',
            ru: 'API-ключ не задан. Настройте его в параметрах.'
        },
        'transcribe.errors.audioExtractTimeout': {
            de: 'Audio-Extraktion abgelaufen (60s). Prüfen Sie, ob das Quellvideo beschädigt ist.',
            ja: '音声抽出がタイムアウトしました (60s)。元動画の破損を確認してください。',
            ko: '오디오 추출 시간 초과(60s). 원본 동영상 손상 여부를 확인하세요.',
            fr: 'Extraction audio expirée (60 s). Vérifiez si la vidéo source est endommagée.',
            es: 'Tiempo de extracción de audio agotado (60 s). Compruebe si el video de origen está dañado.',
            pt: 'Extração de áudio expirou (60 s). Verifique se o vídeo de origem está danificado.',
            ru: 'Тайм-аут извлечения аудио (60 с). Проверьте, не повреждено ли исходное видео.'
        }
    };
    for (const [key, langs] of Object.entries(playerPack)) {
        if (langs[short]) map[key] = langs[short];
    }
    const mapPath = path.join(root, 'tmp', `newkeys-${short}.json`);
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
    execFileSync(process.execPath, [path.join(root, 'scripts/i18n-apply-locale-map.js'), locale, mapPath], {
        stdio: 'inherit',
        cwd: root
    });
}
console.log('done');
