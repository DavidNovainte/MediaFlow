/**
 * Build tmp/de-map.json (flat key -> German) for i18n-apply-locale-map.js
 * Run: node scripts/build-de-map.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const need = JSON.parse(
    fs.readFileSync(path.join(root, 'tmp/de-all-need.json'), 'utf8')
);

const map = Object.create(null);

function t(key, de) {
    map[key] = de;
}

// --- common / ui ---
t('common.modelManager.installedSection', 'Installiert');
t('common.scribe.qwen', 'Qwen');
t('common.video', 'Video');
t('common.transcribe.versionOriginal', 'Original');
t(
    'common.communityVersionMsg',
    'Community-Edition: Einzel-Download, Transkription, Komprimierung und AI-Enhance. Upgraden Sie auf Pro fuer Batch, Warteschlange und erweiterte Workflows.'
);
t('ui.name', 'Name');
t('params.normal', 'Normal');
t('pip.title', 'MediaFlow - Bild-im-Bild');

// --- creator ---
t('creator.transition.names.radial', 'Radial');
t('creator.gif.fps15', '15 FPS (Standard)');
t('creator.batch.options.codec', 'Codec');
t('creator.batch.options.speedTurbo', 'Turbo');
t('creator.batch.options.format', 'Format');
t('creator.batch.clearQueueTitle', 'Alle Aufgaben leeren');
t('creator.convert.formatMov', 'MOV (QuickTime)');
t('creator.convert.formatMkv', 'MKV (Matroska)');
t('creator.convert.qualityMedium', 'Standard');
t('creator.advanced.audioKeep', 'Standard (128k)');
t('creator.advanced.audioLow', 'Minimal (64k)');
t('creator.silence.threshold40', '-40 dB (Standard)');
t('creator.silence.unitSec', '{val} s');
t('creator.silence.statsOriginal', 'Original: {time}');
t('creator.denoise.engine', 'Engine');
t('creator.denoise.engineFfmpeg', 'FFmpeg (Standard)');
t('creator.denoise.engineDeepfilter', 'DeepFilterNet AI');
t('creator.watermark.typeText', 'Text');
t('creator.segment.defaultName', 'Segment {index}');
t('creator.transform.cropDesktop', '16:9 (Desktop)');
t('creator.export.typeVideoAudio', 'Video + Audio');

// --- download ---
t('download.pause', 'Pause');
t('download.playlist', 'Playlist');
t('download.formatVideo', 'Video');
t('download.formatAudio', 'Audio');
t('download.receivedFromExtension', 'Von Browser-Erweiterung empfangen');
t('download.receivedSilent', 'Hintergrund-Download gestartet');
t('download.autoStarting', 'Download wird gestartet...');
t('download.autoQueuedFromExternal', 'Zur Warteschlange hinzugefuegt (Download laeuft)');
t(
    'download.autoStartFailed',
    'Autostart fehlgeschlagen - nutzen Sie Speichern zum manuellen Download'
);
t(
    'download.busyManual',
    'Ein anderer Download laeuft. Starten Sie diesen danach, oder upgraden Sie fuer parallele Downloads.'
);
t(
    'download.pauseUnsupported',
    'Pause wird bei Einzel-Downloads nicht unterstuetzt. Mit Abbrechen stoppen.'
);
t('quality.p2160', '4K (2160p)');
t('quality.p1440', '2K (1440p)');
t('quality.p1080', '1080p HD');
t('quality.p720', '720p HD');
t('quality.p480', '480p');
t('quality.p360', '360p');

// --- editor ---
t('editor.zoom', 'Zoom');
t('editor.ripple', 'Ripple');
t('editor.kindVideo', 'Video');
t('editor.kindAudio', 'Audio');

// --- enhance ---
t('enhance.tabModel', 'Engine');
t('enhance.original', 'Original');
t('enhance.styleStandard', 'Standard');
t('enhance.labelOriginal', 'Original');
t(
    'enhance.hardwareWarning',
    'Dedizierte GPU empfohlen. Video-Enhance ist ein lokales Frame-MVP (<=45s / 2x); kann lange dauern.'
);
t('enhance.denoiseAuto', 'Auto');
t('enhance.styleX4PlusAnime', 'Anime (x4plus-anime)');
t(
    'enhance.noResultsToCompress',
    'Keine verstaerkten Bilder zum Senden (Videos bleiben im Ausgabeordner)'
);
t('enhance.videoScaleCapped', 'Video-Enhance ist in dieser Version auf 2x begrenzt');
t(
    'enhance.videoPreviewUnavailable',
    'Schnellvorschau gilt fuer Bilder. Starten Sie Enhance fuer kurze Videos (<=45s).'
);
t('enhance.videoSmartSkip', 'Video: CUGAN fuer Anime, Real-ESRGAN fuer Realfilm');
t('enhance.smartReasonAnime', 'Sieht nach Illustration / Anime aus -> CUGAN');
t('enhance.smartReasonPhoto', 'Sieht nach Foto aus -> Real-ESRGAN');
t('enhance.smartReasonPortrait', 'Gesicht / Portraetbereiche -> Portraet-Profil');
t('enhance.smartReasonError', 'Analyse fehlgeschlagen -> Real-ESRGAN');
t('enhance.smartBadge', 'KI-Empfehlung');
t(
    'enhance.videoReadyHint',
    'Video geladen. Max. 45s / 2x - Enhance starten druecken.'
);
t('enhance.videoDoneHint', 'Video fertig - Ausgabeordner oeffnen nutzen');
t(
    'enhance.videoPreviewFail',
    'Videovorschau nicht moeglich. Sie koennen Enhance trotzdem starten.'
);
t(
    'enhance.videoTooLongImport',
    '{count} Video(s) ueber {max}s uebersprungen (z. B. {duration}s). Zuerst kuerzen oder kuerzeres Material waehlen.'
);
t(
    'enhance.videoProbeFailImport',
    '{count} Video(s) uebersprungen: Dauer konnte nicht gelesen werden'
);
t(
    'enhance.videoTooLong',
    'Videos laenger als {max}s werden nicht unterstuetzt. Zuerst kuerzen oder kurzen Clip verwenden.'
);

// --- history / nav / pixel ---
t(
    'history.qrProOnly',
    'QR / mobiles Teilen ist eine Pro-Funktion. Upgraden zum Freischalten.'
);
t('history.showQRCodePro', 'QR-Code anzeigen - Pro');
t('nav.upgradeActiveHint', 'Lizenz anzeigen');
t('nav.extension', 'Browser-Erweiterung');
t(
    'pixel.skipNonImages',
    '{count} Nicht-Bilddatei(en) uebersprungen. Fuer kurze Videos AI Enhance nutzen.'
);
t('pixel.unsupportedPreview', 'Diese Datei kann nicht als Bild angezeigt werden');

// --- upgrade ---
t('upgrade.compare.communityTitle', 'Community');
t('upgrade.compare.community1', 'Einzel-Link-Erfassung - unbegrenzt');
t('upgrade.compare.community2', 'Lokale Transkription - Bildkompression - AI Enhance');
t('upgrade.compare.community3', 'Verlauf - Einstellungen und Kern-Engines');
t('upgrade.compare.pro1', 'Batch - Warteschlange - Browser-Erweiterung');
t('upgrade.compare.pro2', 'Creator-Tools - Timeline-Editor');
t('upgrade.compare.pro3', 'Untertitel - Mobile-Bruecke');
t('upgrade.plans.community.name', 'Community');
t('upgrade.plans.community.desc', 'Kernfunktionen - fuer immer kostenlos');
t('upgrade.plans.lifetime.name', 'Pro Lifetime');

// --- extension ---
t('extension.kicker', 'Browser-Erweiterung');
t('extension.title', 'MediaFlow Helper Pro');
t(
    'extension.lead',
    'Browser-Hilfe: Video-URL der aktuellen Seite erkennen, Medien scannen, stapelweise an die Desktop-App senden.'
);
t('extension.storeLabel', 'Chrome Web Store');
t('extension.cardTitle', 'Funktionen');
t(
    'extension.cardDesc',
    'Links beim Surfen erfassen und an MediaFlow uebergeben. Desktop-App geoeffnet lassen.'
);
t('extension.feature1', 'Mit einem Klick in die lokale Download-Warteschlange');
t('extension.feature2', 'Funktioniert mit Desktop-Pro-Lizenz');
t('extension.feature3', 'Praktisch fuer YouTube und gaengige Seiten');
t('extension.installChrome', 'Aus dem Chrome Web Store installieren');
t('extension.note', 'Erfordert Pro - MediaFlow-Desktop muss beim Senden laufen');
t('extension.howTitle', 'Schnellstart');
t('extension.how1', 'Erweiterung installieren und an die Symbolleiste anheften');
t('extension.how2', 'MediaFlow Desktop oeffnen (Pro aktiviert)');
t('extension.how3', 'Auf einer Videoseite: An MediaFlow senden oder Seite scannen');
t(
    'extension.how4',
    'Auf Listen-Seiten Batch-Scraping; bei Login-Waenden zuerst Cookies synchronisieren'
);
t('extension.tipLabel', 'Tipp');
t('extension.benefit1Title', 'Ein-Klick-Senden');
t('extension.benefit3Title', 'Beliebte Seiten');
t('extension.purposeLabel', 'Was es kann');
t(
    'extension.purpose1',
    'URL der aktuellen Videoseite landet direkt in der Desktop-Download-Warteschlange.'
);
t(
    'extension.purpose2',
    'Medien auf der Seite finden, mehrfach auswaehlen, an MediaFlow senden.'
);
t(
    'extension.purpose3',
    'Viele Eintraege von Profil- oder Listen-Seiten auf einmal erfassen.'
);
t(
    'extension.purpose4',
    'Browser-Login nutzen, um Alters-/Login-Sperren zu reduzieren.'
);
t('extension.purpose1Title', 'Ein-Klick-Senden');
t('extension.purpose2Title', 'Seite scannen');
t('extension.purpose3Title', 'Batch-Scraping');
t('extension.purpose4Title', 'Cookie-Sync');
t('extension.tipsTitle', 'Tipps');
t(
    'extension.tip1',
    'Desktop-App vor dem Senden geoeffnet lassen, sonst kann die Erweiterung Jobs nicht zustellen.'
);
t('extension.tip2', 'Cookie-Sync braucht den Desktop-LAN/Mobile-Helper (Port 8765).');
t(
    'extension.tip3',
    'Manche Seiten funktionieren besser, wenn Sie sich zuerst anmelden und dann Cookies syncen.'
);
t('extension.f1Title', 'URL erkennen und senden');
t(
    'extension.f1Desc',
    'Videoadresse der aktuellen Seite erkennen und an die Desktop-Medienerfassung senden.'
);
t('extension.f2Title', 'Seitenmedien scannen');
t(
    'extension.f2Desc',
    'Herunterladbare Medien finden, mehrfach auswaehlen und stapelweise senden.'
);
t('extension.f3Title', 'Batch-Scraping / Auto-Scroll');
t(
    'extension.f3Desc',
    'Profil-/Listen-Seiten scrollen und viele Eintraege sammeln; optional Datums- und Keyword-Filter.'
);
t('extension.f4Title', 'Multi-Site-Unterstuetzung');
t(
    'extension.f4Desc',
    'Adapter fuer TikTok / Douyin / Instagram / X; andere Seiten ueber generische Medienerkennung.'
);

// remaining extension keys from need (f5-f8, how5, tip4, etc.)
const extExtra = {
    'extension.f5Title': 'Cookie-Sync',
    'extension.f5Desc': 'Browser-Login an Desktop weitergeben, um Login-Walls zu umgehen.',
    'extension.f6Title': 'Playlist / Batch',
    'extension.f6Desc': 'Mehrere Links oder Listen-Eintraege an die Warteschlange senden.',
    'extension.f7Title': 'Status-Anzeige',
    'extension.f7Desc': 'Sieht, ob Desktop laeuft und Pro aktiv ist.',
    'extension.f8Title': 'Sicherheit',
    'extension.f8Desc': 'Nur lokale Verbindung zum Desktop; keine Cloud-Weiterleitung der URLs.',
    'extension.how5': 'In den Einstellungen den Empfangsmodus (Fokus / still) waehlen',
    'extension.tip4': 'Bei Fehlern Desktop neu starten und erneut senden',
    'extension.benefit2Title': 'Desktop Pro',
};
Object.assign(map, extExtra);

// --- mobile ---
t('mobile.status.port', 'Port: {port}');
t('mobile.settings.portTitle', 'Port');
t(
    'mobile.settings.portDesc',
    'Standard 8765 - aendern bei Konflikt - Neustart falls aktiv'
);
t('mobile.settings.savePort', 'Speichern');
t('mobile.settings.pinHint', 'Ohne PIN: jedes Geraet im LAN kann verbinden');
t(
    'mobile.messages.pinRecommend',
    'Tipp: PIN setzen, damit andere im selben WLAN diesen Link nicht nutzen.'
);
t('mobile.messages.portInvalid', 'Port muss zwischen 1024 und 65535 liegen');
t('mobile.messages.portSaved', 'Port als {port} gespeichert (gilt beim naechsten Start)');
t('mobile.messages.portSavedRestarted', 'Port auf {port} geaendert; Dienst neu gestartet');
t('mobile.remote.labelFormat', 'Format');
t('mobile.remote.optVideo', 'Video');
t('mobile.remote.navDesktop', 'Desktop');
t('mobile.remote.navDownloads', 'Downloads');
t('mobile.remote.navVideos', 'Videos');
t('mobile.remote.navMediaFlow', 'MediaFlow Downloads');
t('mobile.preview.poweredBy', 'Powered by MediaFlow');
t('mobile.cast.localFileTitle', 'Lokale Datei casten');
t('mobile.cast.streamTitle', 'Cast');
t('mobile.cast.imageTitle', 'Bild');
t('mobile.cast.fileTitle', 'Dokument');
t('mobile.cast.resolvingTitle', 'Link wird aufgeloest...');
t('mobile.playingLocal', 'Lokale Datei wird in eigenem Fenster abgespielt');
t('mobile.castLinkReceived', 'Cast-Link empfangen');
t('mobile.parsingUrl', 'Videoadresse wird analysiert...');
t('mobile.parseSuccess', 'Analysiert - wird gecastet');
t('mobile.parseError', 'Videoadresse konnte nicht analysiert werden');
t('mobile.castFail', 'Cast fehlgeschlagen');
t('mobile.castFailMsg', 'Cast fehlgeschlagen');
t('mobile.guide.title', 'Verbindung herstellen');
t(
    'mobile.guide.lead',
    'Im selben WLAN QR-Code scannen oder LAN-URL oeffnen, um Links und Dateien zu senden.'
);
t('mobile.guide.step1', 'Oben rechts auf Dienst starten klicken');
t(
    'mobile.guide.step2',
    'QR-Code mit dem Handy scannen oder LAN-Adresse im Browser oeffnen'
);
t(
    'mobile.guide.step3',
    '(Optional) Chrome-Erweiterung installieren, um Seitenvideos an MediaFlow zu senden'
);
t('mobile.extension.name', 'MediaFlow Helper Pro');
t(
    'mobile.extension.desc',
    'Offizielle Chrome-Erweiterung: Seiten-URL mit einem Klick in die PC-Download-Warteschlange senden.'
);
t('mobile.extension.install', 'Aus dem Chrome Web Store installieren');
t('mobile.extension.note', 'Erfordert Pro - arbeitet mit der Desktop-App zusammen');

// --- settings (global) ---
t('settings.externalReceiveMode', 'Erweiterung / Handy-Senden');
t(
    'settings.externalReceiveModeDesc',
    'Wenn ein Link von Browser-Erweiterung oder Handy ankommt (Download startet immer automatisch)'
);
t('settings.externalReceiveFocus', 'Fenster in den Vordergrund (Standard)');
t('settings.externalReceiveSilent', 'Stiller Hintergrund-Download');
t('settings.providerGroq', 'Groq (Multi-Key)');
t('settings.providerGemini', 'Google Gemini');
t('settings.providerDeepSeek', 'DeepSeek');
t('settings.providerSiliconFlow', 'SiliconFlow (Multi-Key)');
t('settings.providerCloudflare', 'Cloudflare Workers AI');
t('settings.providerQwen', 'Qwen');
t('settings.providerMoonshot', 'Moonshot / Kimi');
t('settings.providerZhipu', 'Zhipu AI');
t('settings.providerBaichuan', 'Baichuan');
t('settings.providerOpenAI', 'OpenAI');
t('settings.providerClaude', 'Anthropic Claude');
t('settings.providerMistral', 'Mistral AI');
t('settings.providerOpenRouter', 'OpenRouter');
t('settings.providerReplicate', 'Replicate');
t('settings.providerFal', 'Fal.ai');
t('settings.providerStability', 'Stability AI');
t('settings.proxyPort', 'Port');
t('settings.version', 'Version');
t('settings.modelStatus', 'Status');
t('settings.engineVersion', 'Version');
t('settings.licenseYtdlp', 'yt-dlp (Unlicense)');
t('settings.licenseFfmpeg', 'FFmpeg (LGPL v2.1)');
t('settings.storageTemp', 'Temp');
t('settings.sectionCloud', 'Cloud und API');
t('settings.providerKeysHeading', 'Anbieter-API-Keys');
t(
    'settings.apiOneProviderTip',
    'Standard-Anbieter waehlen -> Key einfuegen -> Speichern. Beim Wechseln wird der Key des Anbieters geladen.'
);
t(
    'settings.imageApiTip',
    'Getrennt von der Uebersetzung. Nur der Key des aktuellen Bild-Anbieters ist noetig.'
);
t('settings.providerGroupPrimary', 'Empfohlen');
t('settings.providerGroupMore', 'Weitere Anbieter');
t(
    'settings.providerHintOpenRouter',
    'OpenAI-kompatibles Gateway - ein Key fuer viele Modelle. Guter Einstiegspunkt.'
);
t(
    'settings.providerHintOpenAI',
    'Offizielle OpenAI-API. Auch von vielen kompatiblen Tools genutzt.'
);
t(
    'settings.providerHintMultiKey',
    'Optionale Multi-Key-Rotation unten fuer Rate-Limit-Resilienz.'
);
t('settings.configuredProviders', 'Konfiguriert');
t('settings.switchToConfigured', 'Zu diesem Anbieter wechseln');
t('settings.multiKeyTitle', 'Multi-Key-Rotation (optional)');
t('settings.configSaved', 'Konfiguration gespeichert');
t('settings.configSaveFailed', 'Speichern fehlgeschlagen');
t('settings.testingConnection', 'Verbindung wird getestet...');
t('settings.connectionOk', 'Verbindung OK');
t('settings.connectionFail', 'Verbindung fehlgeschlagen');

// --- tools / transcribe / compress ---
t('transcribe.diarizeEngine', 'Sprechererkennungs-Engine');
t(
    'transcribe.diarizeEngineSherpa',
    'Sherpa (empfohlen, kein HF - Modelle beim ersten Start)'
);
t('transcribe.diarizeEnginePyannote', 'pyannote (benoetigt Hugging-Face-Token)');
t(
    'transcribe.sherpaModelHint',
    'Modelle sind nicht gebuendelt; Download auf dieses Geraet beim ersten Einsatz (oder vorab).'
);
t('transcribe.sherpaReady', 'Sprechermodelle bereit (lokal zwischengespeichert)');
t('transcribe.sherpaDownloadBtn', 'Modelle vorab laden');
t('transcribe.sherpaDownloading', 'Wird geladen...');
t('transcribe.sherpaDownloadOk', 'Sprechermodelle bereit');
t('transcribe.sherpaDownloadFail', 'Modell-Download fehlgeschlagen: ');
t('transcribe.verOriginal', 'Original');
t('transcribe.colOriginal', 'Original');
t('transcribe.styleBalanced', 'Standard');
t('transcribe.remarkGroq', 'Whisper Large-v3');
t('transcribe.remarkSiliconFlow', 'Whisper Large-v3');
t('compress.fontSans', 'Sans Serif');
t('compress.fontSerif', 'Serif');
t('compress.fontMono', 'Monospace');
t('compress.positionLayout', 'Position und Layout');
t('compress.position', 'Position');
t('compress.rembgAnime', 'Anime (anime)');

// --- subtitle.json namespace keys (subtitle.*, toast.*, style.*, tts.*, settings.* in that file) ---
require('./build-de-map-subtitle.js')(t);

// Ensure every need key has an entry: fallback keep English only if still missing
let missing = 0;
for (const item of need) {
    if (map[item.k] === undefined) {
        // last resort: leave English (still better than missing key)
        map[item.k] = item.v;
        missing++;
    }
}

const outPath = path.join(root, 'tmp/de-map.json');
fs.writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, 'keys=', Object.keys(map).length, 'fallbackEn=', missing);
