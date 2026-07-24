# Changelog

All notable changes to this project will be documented in this file.

## [2.3.5] - 2026-07-16

### Added
- **First-run onboarding** (welcome → first capture path → engines if missing). Persists `onboardingComplete`.
- Shared **download error map** (`downloadErrorMap.js`) for Analyze / execute / queue messages.
- `download:warning` preload hook + toast CTA to Settings when ffmpeg is missing.
- **Multi visual-track export (MVP)**: Editor/Creator planner treats the lowest video/image track as primary and stacks higher tracks as timed overlays (PiP / multi-layer) with scale/position/opacity.
- Subtitle batch translation **limited concurrency** (default 2), failed-batch retry, missing-line recovery, and partial-failure toast.
- Subtitle setting **翻译并发** (1–4) persisted with other subtitle preferences.
- Overlay video tracks **auto-mix embedded/linked audio** into export when volume > 0.
- **Editor lazy-load** via `FeatureLoader.ensureEditor()` (cold start no longer parses Editor scripts).
- **Subtitle lazy-load** via `FeatureLoader.ensureSubtitle()`; `TTSConfig` converted to classic script for on-demand load.
- **Creator lazy-load** via `FeatureLoader.ensureCreator()`; export planner scripts stay cold-start for Editor export.

### Changed
- Creator export prefers **hardware H.264** (NVENC/QSV/AMF) with automatic **libx264 fallback** on encode failure.

### Changed (P1 product clarity)
- Sidebar groups **Video workflow** vs **Advanced / lab**.
- Creator / Editor labels clarify roles: quick one-shot tools vs multi-track timeline.
- **Advanced / lab nav collapses by default** (Mobile only in advanced group); remembers `navAdvancedExpanded`.
- Website schema/copy is **Windows-first** (macOS = Coming Soon, not listed as shipped OS).

### Fixed (binaries)
- Bundled/ensured **ffmpeg + ffprobe** under `bin/` (copy from system or `npm run bin:download`).
- `binaries.js` falls back to PATH; startup toast + download precheck when tools missing.
- Analyze (`video:getInfo`) fails fast with `YTDLP_MISSING` instead of opaque spawn errors.
- End-user binary toast points to **Settings → Core engines** (not npm).

### Fixed (P0 stability)
- Subtitle preview always uses `media-file://` (no dependency on MobileFlow port 8765 / broken `/stream?path=`).
- Mobile LAN server **defaults to off** (`mobileflowAutostart` false) to avoid port/firewall noise.
- Main-process **Pro IPC gates** for enhance, creator, editor video tools, subtitle burn/TTS, mobile start, demucs/AI audio.
- Free **download daily limit** enforced in main process (`video:download` + `downloadQuota`).
- Settings falls back to core binary status (yt-dlp / ffmpeg) when EngineManager is unavailable.
- Main-process Pro for **batch/playlist/queue download**, **image:remove-bg**, **compress AI upscale**, **subtitle:save-srt**.

### Removed
- **Voice Clone** entire feature (UI page, nav, IPC handlers, Python model services, preload API, tests, Pro marketing bullet). Too fragile for shipping.
- Half-finished **subscriptions** page and locales.
- Dead legacy RSA license module `src/utils/license.js`.
- Achievements / badges feature (earlier in cycle).

### Docs
- `RELEASE_CHECKLIST.md` updated (real website path, signing/upload as manual steps).
- Version aligned to **2.3.5** across package, UI fallback, extension, mobile health.

## [2.3.1] - 2026-04-03

### Fixed
- Creator 页面支持点击预览画面直接播放/暂停，降低新用户学习成本。
- 修复视频工具导出弹窗在部分页面加载顺序下无法打开的问题。
- 收口多语言文案缺失与 `????`/问号回退问题，补齐全站 locale key 覆盖。

## [2.3.0] - 2026-03-30

### Added
- **全球國際化同步 (i18n Parity)**: 完成了所有 10 種支持語言（英、中簡、中繁、法、德、西、日、韓、葡、俄）的功能對齊，確保 UI 體驗高度一致。
- **TTS 配音預覽優化**: 為所有語言添加了本地化的試聽文本 (`preview_text`)，大幅提升跨語言語音測試體驗。
- **右鍵菜單增強**: 同步了所有語言的字幕音效管理功能，包括試聽、重新生成與刪除配音。

### Fixed
- **UI 佔位符與提示**: 補全了各語言中缺失的 `tooShortToSplit` 等提示文本，消除了 `i18n:missing_key` 隱患。
- **打包路徑兼容性**: 優化了 Electron ASAR 環境下的國際化配置文件解析邏輯，確保打包後語言包加載穩定。

## [2.2.0] - 2026-03-25

### Fixed
- **试用与会员逻辑分流**: 彻底隔离了 `TrialManager` 与 `LicenseManager` 的逻辑。激活 Pro 后将不再显示试用相关的干扰日志。
- **计天逻辑优化**: 将试用期“已过天数”计算由 `Math.round` 代替 `Math.floor`，使显示更符合自然日感官（例如解决了“14天跨度显示为13天”的问题）。
- **授权有效期同步**: 优化了 `LicenseManager` 在订阅版 `expires_at` 为空时的本地保底估算逻辑，确保 UI 始终显示正确的剩余天数。

## [2.1.0] - 2026-03-18

### Added
- **增强视频工具箱**: 深度审计并优化了 `VideoProcessor` 与各视频处理 Handler 的稳定性。
- **TTS 增强**: 引入了更友好的微软 Edge TTS 错误捕获，自动识别并提示 503 与网络连通性问题。
- **架构升级**: 完成了全项目的架构审计，统一了主渲染进程间的 IPC 交互规范。

### Fixed
- **版本号同步**: 统一了 `package.json`, `index.html` 以及 `CHANGELOG.md` 的版本标识。
- **核心稳定**: 修复了多个静默错误并优化了日志系统的防御性。

## [2.0.5] - 2026-03-10

### Added
- **全面国际化**: 新增并完善了 10 种语言包 (英语、法语、德语、韩语、日语、俄语、西班牙语等)。
- **首次使用引导 (Onboarding)**: 为新用户增加了动态多语言的新手引导流程。

### Fixed
- **UI 修复**: 修复了 AI 画质增强界面的模型下拉框闪烁问题。
- **图标修复**: 移除了多语言翻译中与 FontAwesome 冲突的冗余 Emoji 图标。
- **界面完善**: 恢复了设置页面中关于开源许可声明 (yt-dlp, FFmpeg) 的板块并修复了外部链接的点击跳转。
- **上下文菜单**: 修复了视频工具箱中右键菜单 (Context Menu) 的样式重叠与背景缺失问题。

## [2.0.0] - 2026-03-07

### Added
- **CreatorFlow Pro**: 全新视频工具箱，支持批量压缩、转换、竖屏转换、倍速、GIF 生成及静音移除。
- **AI 画质增强**: 集成 Real-CUGAN 与 Real-ESRGAN，支持视频与图片超分修复。
- **智能字幕工具**: 支持 AI 自动转文字 (Whisper/DeepFilterNet) 及双语字幕翻译。
- **MobileFlow**: 支持手机与电脑互联，快捷分享媒体。
- **自动更新**: 集成 electron-updater，支持静默更新与版本检测。
- **多平台支持**: 优化了 Windows/macOS/Linux 的兼容性。

### Changed
- **UI 升级**: 采用全新的深色玻璃拟态设计，优化了设置页与下载队列体验。
- **性能优化**: 引入 GPU Turbo 加速技术，显著提升 AI 处理速度。
- **下载引擎**: 升级至最新的 yt-dlp 与 FFmpeg 内核。

### Removed
- 移除了下载动作中的“自动压缩图片”冗余选项。

### Fixed
- 修复了 Windows 路径下媒体播放的兼容性问题。
- 修复了下载大型播放列表时的内存溢出问题。
