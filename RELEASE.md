# MediaFlow Community — release notes for maintainers

## What this build is

- **Open Core / Community** desktop app (`com.mediaflow.community`)
- Apache-2.0 source tree produced by `npm run export:community` from the private product monorepo
- Free tools: single-link capture, history, transcription, image compress (+ AI upscale/cutout in that toolbox), settings

## Build (unsigned DIY)

```bash
cd mediaflow-community   # this repo / export output
npm install
npm test
npm run build:win        # or build:mac / build:linux
```

Artifacts land in `dist/`.

### Binaries

- Prefer `bin/` with `yt-dlp`, `ffmpeg`, `ffprobe` (and Real-ESRGAN engines if shipping AI upscale).
- `electron-builder` `extraResources` copies selected `bin/` files into the installer.
- Do **not** commit large model packs into git; document download steps in README if needed.

## Signing & notarization (optional)

Community releases may ship **unsigned** for DIY builds. Official MediaFlow Pro uses a separate signing pipeline.

| Platform | Recommendation |
|----------|----------------|
| Windows | Optional Authenticode; SmartScreen may warn if unsigned |
| macOS | Optional Developer ID + notarization; Gatekeeper blocks unsigned apps |
| Linux | AppImage / deb as-is |

If you fork and sign:

1. Set identity env vars for `electron-builder` (see [electron-builder code signing](https://www.electron.build/code-signing.html)).
2. Never commit certificates or passwords to this repository.
3. Keep `appId` unique if you redistribute a modified fork (`com.yourorg.mediaflow-community`).

## Auto-update

Community package.json does **not** wire `electron-updater` to a public feed by default.  
If you enable updates, host your own `latest.yml` / generic provider and document the channel clearly so users do not mix Community and Pro feeds.

## Pre-release checklist

- [ ] `npm test` green
- [ ] Manual smoke: download one URL, compress image, optional cutout/upscale, transcribe short clip
- [ ] No `*.pem`, `r2-config`, telemetry secrets in tree
- [ ] README / OPEN_CORE matrix still matches shipped pages
- [ ] Version bump matches `package.json`

## Export from private monorepo

```bash
# in full MediaFlow product tree
npm run export:community
# output path: see scripts/community-manifest.json → defaultOutDir
```

## CI desktop builds (Windows + macOS)

GitHub Actions workflow: `.github/workflows/build-desktop.yml`

1. Open the repo on GitHub → **Actions** → **Build Desktop** → **Run workflow**
2. Wait for both jobs (Windows NSIS + macOS DMG)
3. Download artifacts from the run summary

Builds are **unsigned** (no Apple/Windows certificate). macOS users may need:
System Settings → Privacy & Security → Open Anyway

Tag a release (`v2.3.5`) to build automatically, or use workflow_dispatch anytime.

### Platform binaries

- **Windows** packages: `.exe` tools + Real-ESRGAN Windows zip models
- **macOS** packages: macOS binaries only (`yt-dlp`, `ffmpeg`, `realesrgan-ncnn-vulkan`) + shared `models/`
- CI downloads the correct platform zip on each runner — never ship Windows `.exe` inside a Mac app

