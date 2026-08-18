# MediaFlow

<p align="center">
  <img src="assets/icons/mediaflow-studio-icon-256.png" width="128" alt="MediaFlow icon">
</p>

<h1 align="center">MediaFlow</h1>

<p align="center">An open-source desktop media toolkit for downloading, processing, transcribing, enhancing, and creating with media.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="GPLv3 license"></a>
  <img src="https://img.shields.io/badge/Platform-Windows-lightgrey.svg" alt="Windows">
</p>

MediaFlow is a free desktop application built with Electron. It brings common media workflows into one local workspace, with no paid edition, activation key, or feature lock.

## Features

- Download videos and audio from supported platforms through yt-dlp
- Batch, playlist, and queued downloads
- Local speech-to-text and AI-assisted text polishing
- Image and video enhancement with Real-ESRGAN and Real-CUGAN
- Video utilities including trimming, speed changes, frame capture, GIF export, vertical-video tools, and watermarking
- Multi-track editing
- Subtitle translation, text-to-speech, and dubbing workflows
- LAN/mobile transfer and QR-code sharing
- Image compression and format conversion

## Screenshots

Screenshots will be added as the interface documentation is finalized.

## Development

### Requirements

- Node.js 20 or newer
- npm
- Windows is the primary supported desktop platform; macOS and Linux development builds are also supported

### Run locally

```bash
npm install
npm run bin:download
npm run dev
```

The binary download step retrieves the local media engines used by the application. Those downloaded binaries are intentionally excluded from this repository.

### Test, lint, and build

```bash
npm run test:ci
npm run lint
npm run build:win
```

## Repository scope

This repository contains the open-source MediaFlow desktop application only.

The official website and the optional browser extension are separate proprietary components. Their source code is not included here and is not covered by this repository's GPLv3 license. The desktop app may include integration points for those services, but those integrations do not make the private components open source.

## Third-party components

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — Unlicense
- [FFmpeg](https://ffmpeg.org/) — LGPL 2.1
- Other dependencies retain their respective licenses; see the dependency metadata and project notices.

## Contributing

Issues and pull requests are welcome. Please do not include cookies, private credentials, access tokens, signing keys, downloaded binaries, personal media, or production logs in an issue or pull request.

## License

MediaFlow is released under the [GNU General Public License v3.0 only](LICENSE).

The software is provided without warranty. Use it responsibly and comply with the terms of service and copyright laws that apply to the content and platforms you use.
