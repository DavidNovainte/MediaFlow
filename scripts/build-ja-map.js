/**
 * Build tmp/ja-map.json for Japanese UI (flat key -> ja).
 * Run: node scripts/build-ja-map.js && node scripts/i18n-apply-locale-map.js ja-JP tmp/ja-map.json
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const need = JSON.parse(fs.readFileSync(path.join(root, 'tmp/ja-all-need.json'), 'utf8'));

const map = Object.create(null);
function t(k, v) {
    map[k] = v;
}

// ---- common / brands kept where natural ----
t('common.scribe.qwen', 'Qwen');
t('common.video', '動画');
t('common.transcribe.versionOriginal', '原文');
t('ui.name', '名前');
t('params.normal', '標準');
t('pip.title', 'MediaFlow - ピクチャーインピクチャー');

// ---- creator ----
t('creator.transition.names.radial', '放射');
t('creator.gif.fps15', '15 FPS（標準）');
t('creator.batch.options.codec', 'コーデック');
t('creator.batch.options.speedTurbo', 'ターボ');
t('creator.batch.options.format', '形式');
t('creator.batch.clearQueueTitle', 'すべてのタスクをクリア');
t('creator.convert.formatMov', 'MOV (QuickTime)');
t('creator.convert.formatMkv', 'MKV (Matroska)');
t('creator.convert.qualityMedium', '標準');
t('creator.advanced.audioKeep', '標準 (128k)');
t('creator.advanced.audioLow', '最小 (64k)');
t('creator.silence.threshold40', '-40 dB（標準）');
t('creator.silence.unitSec', '{val} 秒');
t('creator.silence.statsOriginal', '元の長さ: {time}');
t('creator.denoise.engine', 'エンジン');
t('creator.denoise.engineFfmpeg', 'FFmpeg（標準）');
t('creator.denoise.engineDeepfilter', 'DeepFilterNet AI');
t('creator.watermark.typeText', 'テキスト');
t('creator.segment.defaultName', 'セグメント {index}');
t('creator.transform.cropDesktop', '16:9（デスクトップ）');
t('creator.export.typeVideoAudio', '動画 + 音声');

// ---- download ----
t('download.pause', '一時停止');
t('download.playlist', 'プレイリスト');
t('download.formatVideo', '動画');
t('download.formatAudio', '音声');
t('download.receivedFromExtension', 'ブラウザ拡張機能から受信しました');
t('download.receivedSilent', 'バックグラウンドダウンロードを開始しました');
t('download.autoStarting', 'ダウンロードを開始しています…');
t('download.autoQueuedFromExternal', 'キューに追加しました（ダウンロード中）');
t('download.autoStartFailed', '自動開始に失敗しました。保存から手動でダウンロードしてください');
t(
    'download.busyManual',
    '別のダウンロードが進行中です。完了後に開始するか、並列ダウンロードは Pro にアップグレードしてください。'
);
t(
    'download.pauseUnsupported',
    '単一ダウンロードでは一時停止できません。停止するにはキャンセルを使用してください。'
);
t('quality.p2160', '4K (2160p)');
t('quality.p1440', '2K (1440p)');
t('quality.p1080', '1080p HD');
t('quality.p720', '720p HD');
t('quality.p480', '480p');
t('quality.p360', '360p');

// ---- editor ----
t('editor.zoom', 'ズーム');
t('editor.ripple', 'リップル');
t('editor.kindVideo', '動画');
t('editor.kindAudio', '音声');

// ---- enhance ----
t('enhance.tabModel', 'エンジン');
t('enhance.original', 'オリジナル');
t('enhance.styleStandard', '標準');
t('enhance.labelOriginal', 'オリジナル');
t(
    'enhance.hardwareWarning',
    '専用 GPU を推奨します。動画エンハンスはローカルフレーム MVP（≤45秒 / 2×）で時間がかかることがあります。'
);
t('enhance.denoiseAuto', '自動');
t('enhance.styleX4PlusAnime', 'アニメ (x4plus-anime)');
t(
    'enhance.noResultsToCompress',
    '送信できるエンハンス済み画像がありません（動画は出力フォルダに残ります）'
);
t('enhance.videoScaleCapped', 'このバージョンでは動画エンハンスは 2× までです');
t(
    'enhance.videoPreviewUnavailable',
    'クイックプレビューは画像向けです。短い動画（≤45秒）はエンハンスを開始してください。'
);
t('enhance.videoSmartSkip', '動画: アニメは CUGAN、実写は Real-ESRGAN');
t('enhance.smartReasonAnime', 'イラスト / アニメの可能性 → CUGAN');
t('enhance.smartReasonPhoto', '写真の可能性 → Real-ESRGAN');
t('enhance.smartReasonPortrait', '顔 / ポートレート領域 → ポートレート設定');
t('enhance.smartReasonError', '解析失敗 → Real-ESRGAN');
t('enhance.smartBadge', 'AI おすすめ');
t('enhance.videoReadyHint', '動画を読み込みました。最大 45秒 / 2× — エンハンス開始を押してください。');
t('enhance.videoDoneHint', '動画の準備ができました — 出力フォルダを開く');
t('enhance.videoPreviewFail', '動画プレビューできません。そのままエンハンス開始できます。');
t(
    'enhance.videoTooLongImport',
    '{max}秒超の動画を {count} 件スキップしました（例: {duration}秒）。先に切り取るか短い素材を使ってください。'
);
t('enhance.videoProbeFailImport', '長さを読めない動画を {count} 件スキップしました');
t(
    'enhance.videoTooLong',
    '{max}秒を超える動画は非対応です。先に切り取るか短いクリップを使用してください。'
);

// ---- history / nav / pixel ----
t('history.qrProOnly', 'QR / モバイル共有は Pro 機能です。アップグレードで解除できます。');
t('history.showQRCodePro', 'QRコードを表示 · Pro');
t('nav.upgradeActiveHint', 'ライセンスを表示');
t('nav.extension', 'ブラウザ拡張');
t(
    'pixel.skipNonImages',
    '画像以外のファイルを {count} 件スキップしました。短い動画は AI エンハンスを利用してください。'
);
t('pixel.unsupportedPreview', 'このファイルは画像としてプレビューできません');

// ---- upgrade ----
t('upgrade.compare.communityTitle', 'Community');
t('upgrade.compare.community1', '単一リンク取得 · 無制限');
t('upgrade.compare.community2', 'ローカル文字起こし · 画像圧縮 · AI エンハンス');
t('upgrade.compare.community3', '履歴 · 設定とコアエンジン');
t('upgrade.compare.pro1', 'バッチ · キュー · ブラウザ拡張');
t('upgrade.compare.pro2', 'Creator ツール · タイムライン編集');
t('upgrade.compare.pro3', '字幕 · モバイル連携');
t('upgrade.plans.community.name', 'Community');
t('upgrade.plans.community.desc', 'コア機能 — ずっと無料');
t('upgrade.plans.lifetime.name', 'Pro ライフタイム');

// ---- extension ----
t('extension.kicker', 'ブラウザ拡張');
t('extension.title', 'MediaFlow Helper Pro');
t(
    'extension.lead',
    'ブラウザ用ヘルパー: 現在のページの動画 URL を解決し、ページ内メディアをスキャンしてデスクトップへ一括送信。'
);
t('extension.storeLabel', 'Chrome ウェブストア');
t('extension.cardTitle', 'できること');
t(
    'extension.cardDesc',
    'ブラウズ中にリンクを取得して MediaFlow に渡します。デスクトップアプリを起動したままにしてください。'
);
t('extension.feature1', 'ワンクリックでローカルダウンロードキューへ');
t('extension.feature2', 'デスクトップ Pro ライセンスと連携');
t('extension.feature3', 'YouTube など主要サイト向け');
t('extension.installChrome', 'Chrome ウェブストアからインストール');
t('extension.note', 'Pro が必要 · 送信時は MediaFlow デスクトップを起動');
t('extension.howTitle', 'クイックスタート');
t('extension.how1', '拡張をインストールしてツールバーに固定');
t('extension.how2', 'MediaFlow デスクトップを開く（Pro 有効）');
t('extension.how3', '動画ページで: MediaFlow に送信、またはページをスキャン');
t(
    'extension.how4',
    '一覧ページではバッチ取得; ログイン壁がある場合は先に Cookie 同期'
);
t('extension.tipLabel', 'ヒント');
t('extension.benefit1Title', 'ワンクリック送信');
t('extension.benefit2Title', 'Desktop Pro');
t('extension.benefit3Title', '人気サイト');
t('extension.purposeLabel', 'できること');
t(
    'extension.purpose1',
    '現在の動画ページ URL をデスクトップのダウンロードキューへ直接送ります。'
);
t('extension.purpose2', 'ページ上のメディアを検出し、複数選択して MediaFlow に送信。');
t('extension.purpose3', 'プロフィールや一覧ページからまとめて取得。');
t('extension.purpose4', 'ブラウザのログイン状態を使い、年齢制限・ログイン壁を減らします。');
t('extension.purpose1Title', 'ワンクリック送信');
t('extension.purpose2Title', 'ページをスキャン');
t('extension.purpose3Title', 'バッチ取得');
t('extension.purpose4Title', 'Cookie 同期');
t('extension.tipsTitle', 'ヒント');
t(
    'extension.tip1',
    '送信前にデスクトップアプリを起動してください。起動していないとジョブを届けられません。'
);
t('extension.tip2', 'Cookie 同期にはデスクトップの LAN/モバイルヘルパー（ポート 8765）が必要です。');
t(
    'extension.tip3',
    '先にログインしてから Cookie を同期すると成功しやすいサイトがあります。'
);
t('extension.f1Title', 'URL を解決して送信');
t(
    'extension.f1Desc',
    '現在のページの動画アドレスを検出し、デスクトップのメディア取得へ送ります。'
);
t('extension.f2Title', 'ページ内メディアをスキャン');
t(
    'extension.f2Desc',
    'ダウンロード可能なメディアを見つけ、複数選択して一括送信 — 単一 URL だけではありません。'
);
t('extension.f3Title', 'バッチ取得 / 自動スクロール');
t(
    'extension.f3Desc',
    'プロフィール・一覧をスクロールして多数の項目を収集。日付・キーワードフィルタも利用可。'
);
t('extension.f4Title', 'マルチサイト対応');
t(
    'extension.f4Desc',
    'TikTok / Douyin / Instagram / X 向けアダプタ。その他は汎用メディアスキャン。'
);
t('extension.f5Title', 'Cookie 同期');
t('extension.f5Desc', 'ブラウザのログイン状態をデスクトップへ渡し、ログイン壁を回避しやすくします。');
t('extension.f6Title', 'プレイリスト / バッチ');
t('extension.f6Desc', '複数リンクや一覧項目をキューへ送信。');
t('extension.f7Title', '状態表示');
t('extension.f7Desc', 'デスクトップ起動と Pro 有効状態を確認。');
t('extension.f8Title', 'セキュリティ');
t('extension.f8Desc', 'デスクトップへのローカル接続のみ。URL をクラウド転送しません。');
t('extension.how5', '設定で受信モード（前面表示 / サイレント）を選択');
t('extension.tip4', '失敗時はデスクトップを再起動して再送信');

// ---- mobile ----
t('mobile.status.port', 'ポート: {port}');
t('mobile.settings.portTitle', 'ポート');
t('mobile.settings.portDesc', '既定 8765 · 競合時は変更 · 稼働中なら再起動');
t('mobile.settings.savePort', '保存');
t('mobile.settings.pinHint', 'PIN なし: 同一 LAN のどの端末からも接続可能');
t(
    'mobile.messages.pinRecommend',
    'ヒント: 同じ Wi-Fi の他者がこのリンクを使えないよう PIN を設定してください。'
);
t('mobile.messages.portInvalid', 'ポートは 1024〜65535 の範囲で指定してください');
t('mobile.messages.portSaved', 'ポートを {port} に保存しました（次回起動から有効）');
t('mobile.messages.portSavedRestarted', 'ポートを {port} に変更し、サービスを再起動しました');
t('mobile.remote.labelFormat', '形式');
t('mobile.remote.optVideo', '動画');
t('mobile.remote.navDesktop', 'デスクトップ');
t('mobile.remote.navDownloads', 'ダウンロード');
t('mobile.remote.navVideos', '動画');
t('mobile.remote.navMediaFlow', 'MediaFlow ダウンロード');
t('mobile.preview.poweredBy', 'Powered by MediaFlow');
t('mobile.cast.localFileTitle', 'ローカルファイルをキャスト');
t('mobile.cast.streamTitle', 'キャスト');
t('mobile.cast.imageTitle', '画像');
t('mobile.cast.fileTitle', 'ドキュメント');
t('mobile.cast.resolvingTitle', 'リンクを解決中…');
t('mobile.playingLocal', 'ローカルファイルを別ウィンドウで再生中');
t('mobile.castLinkReceived', 'キャストリンクを受信しました');
t('mobile.parsingUrl', '動画アドレスを解析中…');
t('mobile.parseSuccess', '解析完了 — キャストします');
t('mobile.parseError', '動画アドレスの解析に失敗しました');
t('mobile.castFail', 'キャストに失敗しました');
t('mobile.castFailMsg', 'キャストに失敗しました');
t('mobile.guide.title', '接続方法');
t(
    'mobile.guide.lead',
    '同じ Wi-Fi で QR をスキャンするか LAN URL を開き、リンクやファイルを送信できます。'
);
t('mobile.guide.step1', '右上の「サービス開始」をクリック');
t('mobile.guide.step2', 'スマホで QR をスキャン、またはブラウザで LAN アドレスを開く');
t(
    'mobile.guide.step3',
    '（任意）Chrome 拡張を入れ、ページの動画を MediaFlow に送信'
);
t('mobile.extension.name', 'MediaFlow Helper Pro');
t(
    'mobile.extension.desc',
    '公式 Chrome 拡張: ページ URL をワンクリックで PC のダウンロードキューへ。'
);
t('mobile.extension.install', 'Chrome ウェブストアからインストール');
t('mobile.extension.note', 'Pro が必要 · デスクトップアプリと連携');

// ---- settings (app) ----
t('settings.externalReceiveMode', '拡張 / スマホ送信');
t(
    'settings.externalReceiveModeDesc',
    'ブラウザ拡張やスマホからリンクを受け取ったとき（常に自動でダウンロード開始）'
);
t('settings.externalReceiveFocus', 'ウィンドウを前面に（既定）');
t('settings.externalReceiveSilent', 'サイレントでバックグラウンドダウンロード');
t('settings.providerGroq', 'Groq（マルチキー）');
t('settings.providerGemini', 'Google Gemini');
t('settings.providerDeepSeek', 'DeepSeek');
t('settings.providerSiliconFlow', 'SiliconFlow（マルチキー）');
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
t('settings.proxyPort', 'ポート');
t('settings.proxyTitle', 'プロキシ');
t('settings.version', 'バージョン');
t('settings.modelStatus', '状態');
t('settings.engineVersion', 'バージョン');
t('settings.licenseYtdlp', 'yt-dlp (Unlicense)');
t('settings.licenseFfmpeg', 'FFmpeg (LGPL v2.1)');
t('settings.storageTemp', '一時');
t('settings.sectionCloud', 'クラウドと API');
t('settings.providerKeysHeading', 'プロバイダー API キー');
t(
    'settings.apiOneProviderTip',
    '既定プロバイダーを選び → キーを貼り付け → 保存。切り替えるとそのプロバイダーのキーを読み込みます。'
);
t(
    'settings.imageApiTip',
    '翻訳とは別です。現在の画像プロバイダーのキーだけで構いません。'
);
t('settings.providerGroupPrimary', 'おすすめ');
t('settings.providerGroupMore', 'その他のプロバイダー');
t(
    'settings.providerHintOpenRouter',
    'OpenAI 互換ゲートウェイ — 1 つのキーで多数のモデル。入口として便利です。'
);
t(
    'settings.providerHintOpenAI',
    '公式 OpenAI API。多くの OpenAI 互換ツールでも利用されます。'
);
t(
    'settings.providerHintMultiKey',
    'レート制限対策として、下で任意のマルチキーローテーションを利用できます。'
);
t('settings.configuredProviders', '設定済み');
t('settings.switchToConfigured', 'このプロバイダーに切り替え');
t('settings.multiKeyTitle', 'マルチキーローテーション（任意）');
t('settings.configSaved', '設定を保存しました');
t('settings.configSaveFailed', '保存に失敗しました');
t('settings.testingConnection', '接続をテスト中…');
t('settings.connectionOk', '接続 OK');
t('settings.connectionFail', '接続に失敗しました');

// ---- tools ----
t('transcribe.diarizeEngine', '話者分離エンジン');
t(
    'transcribe.diarizeEngineSherpa',
    'Sherpa（推奨、HF 不要 — 初回にモデルをダウンロード）'
);
t('transcribe.diarizeEnginePyannote', 'pyannote（Hugging Face トークンが必要）');
t(
    'transcribe.sherpaModelHint',
    'モデルは同梱されていません。初回利用時（または事前）にこの端末へダウンロードされます。'
);
t('transcribe.sherpaReady', '話者モデル準備完了（この端末にキャッシュ）');
t('transcribe.sherpaDownloadBtn', 'モデルを事前ダウンロード');
t('transcribe.sherpaDownloading', 'ダウンロード中…');
t('transcribe.sherpaDownloadOk', '話者モデル準備完了');
t('transcribe.sherpaDownloadFail', 'モデルのダウンロードに失敗: ');
t('transcribe.verOriginal', '原文');
t('transcribe.colOriginal', '原文');
t('transcribe.styleBalanced', '標準');
t('transcribe.remarkGroq', 'Whisper Large-v3');
t('transcribe.remarkSiliconFlow', 'Whisper Large-v3');
t('compress.fontSans', 'ゴシック（Sans）');
t('compress.fontSerif', '明朝（Serif）');
t('compress.fontMono', '等幅');
t('compress.positionLayout', '位置とレイアウト');
t('compress.position', '位置');
t('compress.rembgAnime', 'アニメ (anime)');

// subtitle-heavy keys
require('./build-ja-map-subtitle.js')(t);

// fill any remaining need keys with EN as last resort (should be rare)
let fallback = 0;
for (const item of need) {
    if (map[item.k] === undefined) {
        map[item.k] = item.v;
        fallback++;
    }
}

const out = path.join(root, 'tmp/ja-map.json');
fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log('Wrote', out, 'keys=', Object.keys(map).length, 'fallbackEn=', fallback);
