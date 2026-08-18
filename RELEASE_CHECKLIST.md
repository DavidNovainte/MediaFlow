# MediaFlow Release Checklist

## 0. Pre-ship UX / perf smoke (dev build)

- [ ] **Enhance**: first open may briefly load scripts (lazy); large image previews without hang; before/after works
- [ ] **Enhance cold start**: before opening Enhance, DevTools Network should not list `EnhanceFlow.js` until first visit
- [ ] **Compress**: queue thumbs + compare preview load; batch concurrency setting persists
- [ ] **Creator batch**: local file preview seeks (media-file)
- [ ] **Download multi-task**: progress reaches 100%, UI stays responsive
- [ ] **Subtitle burn**: progress updates without flooding
- [ ] **Dark + light**: header buttons 32px; active tabs readable (not white-on-white)
- [ ] **Confirm dialog**: Cancel/OK localized (取消/确定 in zh-CN)
- [ ] Icons unified dark brand on desktop + extension + website (if shipping all three)

## 1. Release Prep

- [ ] Run `npm run test:ci`
- [ ] Confirm `test:ci` is green
- [ ] App version is **2.4.0** (or the version you are shipping)
- [ ] Donation link (`https://mediaflowing.com/donate`) reachable

## 1b. Signing & distribution (manual — not automated in repo)

- [ ] Windows Authenticode: set `CSC_LINK` / `CSC_KEY_PASSWORD` (or cert store) before `build:win`
- [ ] Upload `MediaFlow Setup x.y.z.exe` + `latest.yml` to R2 / CDN
- [ ] Optional Mac: `build:mac:release` with Apple env from `mac-signing.env.example`; leave `macInstaller` empty until a real DMG exists
- [ ] Expect SmartScreen warnings until reputation builds on signed builds

## 2. Version

- [ ] App version in `package.json` is correct
- [ ] `extension/manifest.json` version matches desktop

## 3. Apps Script (optional telemetry)

- [ ] `SPREADSHEET_ID` is filled in `../App script/LogBackend.gs`
- [ ] `WEBHOOK_TOKEN` in `../App script/LogBackend.gs` is set
- [ ] Same token is set via env or `scripts/telemetry.local.js` (gitignored) for desktop client
- [ ] Google Apps Script is deployed as a new Web App version
- [ ] Error logs write into the expected sheet

## 4. Packaged App Smoke Test

After building the installer, install the packaged app and verify:

- [ ] App launches normally
- [ ] **Mobile server does NOT auto-start** (8765 free unless user enables)
- [ ] Download page opens; all features work without any license / activation
- [ ] Subtitle page loads local video **without** Mobile on
- [ ] Settings shows yt-dlp / ffmpeg status (or engine list)
- [ ] Donation page opens and links work

## 5. Build Output

- [ ] Run `npm run build:checked` for a guarded full build
- [ ] Or run `npm run build:win:checked` for the Windows release build
- [ ] Confirm installer appears in `dist`
- [ ] Confirm expected artifact name includes the correct version

## 6. Extension (MediaFlow Helper) — before store / zip ship

- [ ] Version in `extension/manifest.json` matches desktop (`2.4.0` or shipping version)
- [ ] Locale audit: every `_locales/*/messages.json` has all EN keys, **0** identical-to-EN leftovers (except intentional brand tokens inside sentences)
- [ ] Reload unpacked extension after locale edits
- [ ] Popup language selector: force **简体中文** / **English** / one EU / **日本語** — no half-English buttons
- [ ] Options page language selector matches popup and reloads UI
- [ ] Desktop app running: one-click **Send**, **Scan page media** on a non-adapter site, multi-select send
- [ ] Profile batch scrape on IG / TikTok / Douyin (where logged in)
- [ ] Cookie sync only after enabling Mobile/LAN helper (port **8765**); status API is **16412**
- [ ] App stopped: Send / Scan / Sync / Batch show “app not running” (no silent fail)
- [ ] See also `EXTENSION_SMOKE_TEST.md`

## 7. Final Manual Check

- [ ] No user-facing test links remain
- [ ] No user-facing debug text remains
- [ ] No obvious broken copy on key pages
- [ ] Ready to publish
