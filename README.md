# MediaFlow Community (Open Core)

Local-first toolkit for **single-link capture**, **history**, **image compress**, and **transcription**.

This is the slim **Community / Open Core** edition. Image compress (including AI upscale + cutout in that toolbox) is free. Advanced product surfaces (dedicated AI Enhance page, batch queue, creator, editor, subtitles, mobile bridge) ship only in the **official MediaFlow Pro** product.

## Features (this repo)

| Feature | Notes |
|---------|--------|
| Media capture | Single URL, format/quality picker |
| History | Local download / job history |
| Image tools | Compress / convert / resize + AI upscale + cutout |
| Transcription | Local speech-to-text (+ optional diarization) |
| Settings | Preferences, engines status, i18n |
| Upgrade | Link to official Pro / license |

## Not included

- Dedicated AI Enhance page (超分工作台)
- Batch / playlist / queue capture
- Creator, multi-track editor, subtitle studio, mobile bridge
- Browser extension package (use official Pro channel if needed)

**Get Pro:** [mediaflowing.com](https://mediaflowing.com/)

## Requirements

- Node.js 18+
- Windows / macOS / Linux
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/) on `PATH`, or under `bin/`
- Optional AI image tools: Python 3.10+ with `pip install rembg`; Real-ESRGAN models under `bin/` (see **Settings → Engines**)

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

CI runs on push/PR (`.github/workflows/ci.yml`).

## Build / release

```bash
npm run build:win   # or build:mac / build:linux
```

Signing, auto-update, and packaging notes: see **[RELEASE.md](./RELEASE.md)**.

## License

- **This repo:** Apache-2.0  
- **Official Pro app:** proprietary  

See `OPEN_CORE.md` and `CONTRIBUTING.md`. Please do not PR closed Pro modules into this tree.

## Legal / content use

You are responsible for complying with applicable laws and third-party platform terms when capturing or processing media.
