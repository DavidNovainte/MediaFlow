/**
 * Build tmp/ko-map.json (Korean). Run:
 *   node scripts/build-ko-map.js && node scripts/i18n-apply-locale-map.js ko-KR tmp/ko-map.json
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const need = JSON.parse(fs.readFileSync(path.join(root, 'tmp/ko-all-need.json'), 'utf8'));
const map = Object.create(null);
const t = (k, v) => {
    map[k] = v;
};

t('common.scribe.qwen', 'Qwen');
t('common.video', '동영상');
t('common.transcribe.versionOriginal', '원문');
t('common.modelManager.installedSection', '설치됨');
t('ui.name', '이름');
t('params.normal', '보통');
t('pip.title', 'MediaFlow - 화면 속 화면');

t('creator.transition.names.radial', '방사형');
t('creator.gif.fps15', '15 FPS (표준)');
t('creator.batch.options.codec', '코덱');
t('creator.batch.options.speedTurbo', '터보');
t('creator.batch.options.format', '형식');
t('creator.batch.clearQueueTitle', '모든 작업 지우기');
t('creator.convert.formatMov', 'MOV (QuickTime)');
t('creator.convert.formatMkv', 'MKV (Matroska)');
t('creator.convert.qualityMedium', '표준');
t('creator.advanced.audioKeep', '표준 (128k)');
t('creator.advanced.audioLow', '최소 (64k)');
t('creator.silence.threshold40', '-40 dB (표준)');
t('creator.silence.unitSec', '{val} 초');
t('creator.silence.statsOriginal', '원본: {time}');
t('creator.denoise.engine', '엔진');
t('creator.denoise.engineFfmpeg', 'FFmpeg (표준)');
t('creator.denoise.engineDeepfilter', 'DeepFilterNet AI');
t('creator.watermark.typeText', '텍스트');
t('creator.segment.defaultName', '세그먼트 {index}');
t('creator.transform.cropDesktop', '16:9 (데스크톱)');
t('creator.export.typeVideoAudio', '동영상 + 오디오');

t('download.pause', '일시정지');
t('download.playlist', '재생목록');
t('download.formatVideo', '동영상');
t('download.formatAudio', '오디오');
t('download.receivedFromExtension', '브라우저 확장 프로그램에서 수신함');
t('download.receivedSilent', '백그라운드 다운로드 시작됨');
t('download.autoStarting', '다운로드를 시작하는 중…');
t('download.autoQueuedFromExternal', '대기열에 추가됨 (다운로드 진행 중)');
t('download.autoStartFailed', '자동 시작 실패 — 저장으로 수동 다운로드하세요');
t(
    'download.busyManual',
    '다른 다운로드가 진행 중입니다. 끝난 뒤 시작하거나, 병렬 다운로드는 Pro로 업그레이드하세요.'
);
t(
    'download.pauseUnsupported',
    '단일 다운로드에서는 일시정지를 지원하지 않습니다. 중지하려면 취소를 사용하세요.'
);
t('quality.p2160', '4K (2160p)');
t('quality.p1440', '2K (1440p)');
t('quality.p1080', '1080p HD');
t('quality.p720', '720p HD');
t('quality.p480', '480p');
t('quality.p360', '360p');

t('editor.zoom', '확대/축소');
t('editor.ripple', '리플');
t('editor.kindVideo', '동영상');
t('editor.kindAudio', '오디오');

t('enhance.tabModel', '엔진');
t('enhance.original', '원본');
t('enhance.styleStandard', '표준');
t('enhance.labelOriginal', '원본');
t(
    'enhance.hardwareWarning',
    '전용 GPU를 권장합니다. 동영상 향상은 로컬 프레임 MVP(≤45초 / 2×)이며 시간이 걸릴 수 있습니다.'
);
t('enhance.denoiseAuto', '자동');
t('enhance.styleX4PlusAnime', '애니 (x4plus-anime)');
t(
    'enhance.noResultsToCompress',
    '보낼 향상된 이미지가 없습니다 (동영상은 출력 폴더에 유지)'
);
t('enhance.videoScaleCapped', '이 버전에서 동영상 향상은 2×까지입니다');
t(
    'enhance.videoPreviewUnavailable',
    '빠른 미리보기는 이미지용입니다. 짧은 동영상(≤45초)은 향상을 시작하세요.'
);
t('enhance.videoSmartSkip', '동영상: 애니메이션은 CUGAN, 실사는 Real-ESRGAN');
t('enhance.smartReasonAnime', '일러스트 / 애니 같음 → CUGAN');
t('enhance.smartReasonPhoto', '사진 같음 → Real-ESRGAN');
t('enhance.smartReasonPortrait', '얼굴 / 인물 영역 → 인물 프로필');
t('enhance.smartReasonError', '분석 실패 → Real-ESRGAN');
t('enhance.smartBadge', 'AI 추천');
t('enhance.videoReadyHint', '동영상 로드됨. 최대 45초 / 2× — 향상 시작을 누르세요.');
t('enhance.videoDoneHint', '동영상 준비됨 — 출력 폴더 열기');
t('enhance.videoPreviewFail', '동영상 미리보기를 할 수 없습니다. 그래도 향상을 시작할 수 있습니다.');
t(
    'enhance.videoTooLongImport',
    '{max}초 초과 동영상 {count}개 건너뜀 (예: {duration}초). 먼저 자르거나 짧은 자료를 사용하세요.'
);
t('enhance.videoProbeFailImport', '길이를 읽을 수 없는 동영상 {count}개 건너뜀');
t(
    'enhance.videoTooLong',
    '{max}초보다 긴 동영상은 지원되지 않습니다. 먼저 자르거나 짧은 클립을 사용하세요.'
);

t('history.qrProOnly', 'QR / 모바일 공유는 Pro 기능입니다. 업그레이드로 잠금 해제.');
t('history.showQRCodePro', 'QR 코드 표시 · Pro');
t('nav.upgradeActiveHint', '라이선스 보기');
t('nav.extension', '브라우저 확장');
t(
    'pixel.skipNonImages',
    '이미지가 아닌 파일 {count}개 건너뜀. 짧은 동영상은 AI 향상을 사용하세요.'
);
t('pixel.unsupportedPreview', '이 파일은 이미지로 미리볼 수 없습니다');

t('upgrade.compare.communityTitle', 'Community');
t('upgrade.compare.community1', '단일 링크 수집 · 무제한');
t('upgrade.compare.community2', '로컬 받아쓰기 · 이미지 압축 · AI 향상');
t('upgrade.compare.community3', '기록 · 설정 및 핵심 엔진');
t('upgrade.compare.pro1', '배치 · 대기열 · 브라우저 확장');
t('upgrade.compare.pro2', 'Creator 도구 · 타임라인 편집기');
t('upgrade.compare.pro3', '자막 · 모바일 브리지');
t('upgrade.plans.community.name', 'Community');
t('upgrade.plans.community.desc', '핵심 도구 — 영원히 무료');
t('upgrade.plans.lifetime.name', 'Pro 평생');

t('extension.kicker', '브라우저 확장');
t('extension.title', 'MediaFlow Helper Pro');
t(
    'extension.lead',
    '브라우저 도우미: 현재 페이지 동영상 URL 확인, 페이지 미디어 스캔, 데스크톱으로 일괄 전송.'
);
t('extension.storeLabel', 'Chrome 웹 스토어');
t('extension.cardTitle', '기능');
t(
    'extension.cardDesc',
    '탐색 중 링크를 수집해 MediaFlow로 전달합니다. 데스크톱 앱을 실행해 두세요.'
);
t('extension.feature1', '원클릭으로 로컬 다운로드 대기열에 추가');
t('extension.feature2', '데스크톱 Pro 라이선스와 연동');
t('extension.feature3', 'YouTube 등 주요 사이트에 편리');
t('extension.installChrome', 'Chrome 웹 스토어에서 설치');
t('extension.note', 'Pro 필요 · 전송 시 MediaFlow 데스크톱 실행');
t('extension.howTitle', '빠른 시작');
t('extension.how1', '확장을 설치하고 도구 모음에 고정');
t('extension.how2', 'MediaFlow 데스크톱 열기 (Pro 활성화)');
t('extension.how3', '동영상 페이지에서: MediaFlow로 보내기 또는 페이지 스캔');
t(
    'extension.how4',
    '목록 페이지는 배치 수집; 로그인 벽이 있으면 먼저 Cookie 동기화'
);
t('extension.tipLabel', '팁');
t('extension.benefit1Title', '원클릭 전송');
t('extension.benefit2Title', 'Desktop Pro');
t('extension.benefit3Title', '인기 사이트');
t('extension.purposeLabel', '할 수 있는 일');
t(
    'extension.purpose1',
    '현재 동영상 페이지 URL이 데스크톱 다운로드 대기열로 바로 갑니다.'
);
t('extension.purpose2', '페이지 미디어를 찾아 다중 선택 후 MediaFlow로 전송.');
t('extension.purpose3', '프로필/목록 페이지에서 여러 항목을 한 번에 수집.');
t('extension.purpose4', '브라우저 로그인 상태를 활용해 연령/로그인 벽 실패를 줄입니다.');
t('extension.purpose1Title', '원클릭 전송');
t('extension.purpose2Title', '페이지 스캔');
t('extension.purpose3Title', '배치 수집');
t('extension.purpose4Title', 'Cookie 동기화');
t('extension.tipsTitle', '팁');
t(
    'extension.tip1',
    '전송 전에 데스크톱 앱을 열어 두세요. 꺼져 있으면 작업을 전달할 수 없습니다.'
);
t('extension.tip2', 'Cookie 동기화에는 데스크톱 LAN/모바일 헬퍼(포트 8765)가 필요합니다.');
t(
    'extension.tip3',
    '일부 사이트는 먼저 로그인한 뒤 Cookie를 동기화하면 더 잘 동작합니다.'
);
t('extension.f1Title', 'URL 확인 및 전송');
t(
    'extension.f1Desc',
    '현재 페이지 동영상 주소를 감지해 데스크톱 미디어 수집으로 보냅니다.'
);
t('extension.f2Title', '페이지 미디어 스캔');
t(
    'extension.f2Desc',
    '다운로드 가능한 미디어를 찾아 다중 선택 후 일괄 전송 — 단일 URL만이 아닙니다.'
);
t('extension.f3Title', '배치 수집 / 자동 스크롤');
t(
    'extension.f3Desc',
    '프로필/목록을 스크롤하며 여러 항목 수집. 날짜·키워드 필터 선택 가능.'
);
t('extension.f4Title', '멀티 사이트 지원');
t(
    'extension.f4Desc',
    'TikTok / Douyin / Instagram / X 어댑터. 그 외는 일반 미디어 검색.'
);
t('extension.f5Title', 'Cookie 동기화');
t('extension.f5Desc', '브라우저 로그인 상태를 데스크톱에 넘겨 로그인 벽을 줄입니다.');
t('extension.f6Title', '재생목록 / 배치');
t('extension.f6Desc', '여러 링크나 목록 항목을 대기열로 전송.');
t('extension.f7Title', '상태 표시');
t('extension.f7Desc', '데스크톱 실행 여부와 Pro 활성 상태를 확인.');
t('extension.f8Title', '보안');
t('extension.f8Desc', '데스크톱으로의 로컬 연결만 사용. URL을 클라우드로 보내지 않습니다.');
t('extension.how5', '설정에서 수신 모드(전면 / 무음) 선택');
t('extension.tip4', '실패 시 데스크톱을 다시 시작하고 재전송');

t('mobile.status.port', '포트: {port}');
t('mobile.settings.portTitle', '포트');
t('mobile.settings.portDesc', '기본 8765 · 충돌 시 변경 · 실행 중이면 재시작');
t('mobile.settings.savePort', '저장');
t('mobile.settings.pinHint', 'PIN 없음: 같은 LAN의 모든 기기가 연결 가능');
t(
    'mobile.messages.pinRecommend',
    '팁: 같은 Wi-Fi의 다른 사람이 이 링크를 쓰지 못하도록 PIN을 설정하세요.'
);
t('mobile.messages.portInvalid', '포트는 1024–65535 사이여야 합니다');
t('mobile.messages.portSaved', '포트를 {port}(으)로 저장했습니다 (다음 시작부터 적용)');
t('mobile.messages.portSavedRestarted', '포트를 {port}(으)로 변경하고 서비스를 재시작했습니다');
t('mobile.remote.labelFormat', '형식');
t('mobile.remote.optVideo', '동영상');
t('mobile.remote.navDesktop', '데스크톱');
t('mobile.remote.navDownloads', '다운로드');
t('mobile.remote.navVideos', '동영상');
t('mobile.remote.navMediaFlow', 'MediaFlow 다운로드');
t('mobile.preview.poweredBy', 'Powered by MediaFlow');
t('mobile.cast.localFileTitle', '로컬 파일 캐스트');
t('mobile.cast.streamTitle', '캐스트');
t('mobile.cast.imageTitle', '이미지');
t('mobile.cast.fileTitle', '문서');
t('mobile.cast.resolvingTitle', '링크 확인 중…');
t('mobile.playingLocal', '로컬 파일을 별도 창에서 재생 중');
t('mobile.castLinkReceived', '캐스트 링크 수신됨');
t('mobile.parsingUrl', '동영상 주소 분석 중…');
t('mobile.parseSuccess', '분석 완료 — 캐스트합니다');
t('mobile.parseError', '동영상 주소를 분석하지 못했습니다');
t('mobile.castFail', '캐스트 실패');
t('mobile.castFailMsg', '캐스트 실패');
t('mobile.guide.title', '연결 방법');
t(
    'mobile.guide.lead',
    '같은 Wi-Fi에서 QR을 스캔하거나 LAN URL을 열어 링크와 파일을 보낼 수 있습니다.'
);
t('mobile.guide.step1', '오른쪽 위 "서비스 시작" 클릭');
t('mobile.guide.step2', '폰으로 QR 스캔 또는 브라우저에서 LAN 주소 열기');
t(
    'mobile.guide.step3',
    '(선택) Chrome 확장을 설치해 페이지 동영상을 MediaFlow로 전송'
);
t('mobile.extension.name', 'MediaFlow Helper Pro');
t(
    'mobile.extension.desc',
    '공식 Chrome 확장: 페이지 URL을 원클릭으로 PC 다운로드 대기열에 보냅니다.'
);
t('mobile.extension.install', 'Chrome 웹 스토어에서 설치');
t('mobile.extension.note', 'Pro 필요 · 데스크톱 앱과 연동');

t('settings.externalReceiveMode', '확장 / 휴대폰 전송');
t(
    'settings.externalReceiveModeDesc',
    '브라우저 확장이나 휴대폰에서 링크가 올 때 (항상 자동으로 다운로드 시작)'
);
t('settings.externalReceiveFocus', '창을 앞으로 (기본)');
t('settings.externalReceiveSilent', '무음 백그라운드 다운로드');
t('settings.providerGroq', 'Groq (멀티 키)');
t('settings.providerGemini', 'Google Gemini');
t('settings.providerDeepSeek', 'DeepSeek');
t('settings.providerSiliconFlow', 'SiliconFlow (멀티 키)');
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
t('settings.proxyPort', '포트');
t('settings.proxyTitle', '프록시');
t('settings.version', '버전');
t('settings.modelStatus', '상태');
t('settings.engineVersion', '버전');
t('settings.licenseYtdlp', 'yt-dlp (Unlicense)');
t('settings.licenseFfmpeg', 'FFmpeg (LGPL v2.1)');
t('settings.storageTemp', '임시');
t('settings.sectionCloud', '클라우드 및 API');
t('settings.providerKeysHeading', '제공자 API 키');
t(
    'settings.apiOneProviderTip',
    '기본 제공자를 선택 → 키 붙여넣기 → 저장. 전환 시 해당 제공자 키를 불러옵니다.'
);
t(
    'settings.imageApiTip',
    '번역과 별개입니다. 현재 이미지 제공자 키만 있으면 됩니다.'
);
t('settings.providerGroupPrimary', '추천');
t('settings.providerGroupMore', '기타 제공자');
t(
    'settings.providerHintOpenRouter',
    'OpenAI 호환 게이트웨이 — 하나의 키로 여러 모델. 좋은 진입점입니다.'
);
t(
    'settings.providerHintOpenAI',
    '공식 OpenAI API. 많은 OpenAI 호환 도구에서도 사용됩니다.'
);
t(
    'settings.providerHintMultiKey',
    '속도 제한 대응을 위해 아래에서 선택적 멀티 키 순환을 사용할 수 있습니다.'
);
t('settings.configuredProviders', '구성됨');
t('settings.switchToConfigured', '이 제공자로 전환');
t('settings.multiKeyTitle', '멀티 키 순환 (선택)');
t('settings.configSaved', '구성을 저장했습니다');
t('settings.configSaveFailed', '저장 실패');
t('settings.testingConnection', '연결 테스트 중…');
t('settings.connectionOk', '연결 OK');
t('settings.connectionFail', '연결 실패');

t('transcribe.diarizeEngine', '화자 분리 엔진');
t(
    'transcribe.diarizeEngineSherpa',
    'Sherpa (권장, HF 불필요 — 첫 사용 시 모델 다운로드)'
);
t('transcribe.diarizeEnginePyannote', 'pyannote (Hugging Face 토큰 필요)');
t(
    'transcribe.sherpaModelHint',
    '모델은 포함되지 않습니다. 첫 사용 시(또는 미리) 이 기기에 다운로드됩니다.'
);
t('transcribe.sherpaReady', '화자 모델 준비됨 (이 기기에 캐시)');
t('transcribe.sherpaDownloadBtn', '모델 미리 다운로드');
t('transcribe.sherpaDownloading', '다운로드 중…');
t('transcribe.sherpaDownloadOk', '화자 모델 준비됨');
t('transcribe.sherpaDownloadFail', '모델 다운로드 실패: ');
t('transcribe.verOriginal', '원문');
t('transcribe.colOriginal', '원문');
t('transcribe.styleBalanced', '표준');
t('transcribe.remarkGroq', 'Whisper Large-v3');
t('transcribe.remarkSiliconFlow', 'Whisper Large-v3');
t('compress.fontSans', '고딕 (Sans)');
t('compress.fontSerif', '명조 (Serif)');
t('compress.fontMono', '고정폭');
t('compress.positionLayout', '위치 및 레이아웃');
t('compress.position', '위치');
t('compress.rembgAnime', '애니 (anime)');

require('./build-ko-map-subtitle.js')(t);

let fallback = 0;
for (const item of need) {
    if (map[item.k] === undefined) {
        map[item.k] = item.v;
        fallback++;
    }
}
const out = path.join(root, 'tmp/ko-map.json');
fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log('Wrote', out, 'keys=', Object.keys(map).length, 'fallbackEn=', fallback);
