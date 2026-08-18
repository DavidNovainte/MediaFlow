# MediaFlow 2.4.0 — Packaged Smoke Test

Use a **clean Windows user profile** when possible. Install from:

`dist/MediaFlow Setup 2.4.0.exe`

Do **not** only test with `npm run dev`.

---

## 0. Pre-flight

- [ ] Installer builds: `MediaFlow Setup 2.4.0.exe` + `latest.yml` exist under `dist/`
- [ ] (Optional) Signed build if `CSC_LINK` is configured
- [ ] Close any running MediaFlow / Electron instances

---

## 1. Install & first launch

- [ ] Run installer; change install dir if you want; finish install
- [ ] Launch from Start Menu / Desktop
- [ ] App window appears (no silent hang)
- [ ] Version in Settings shows **v2.4.0**
- [ ] Onboarding shows once (can skip)
  - [ ] Download step does **not** claim a free daily limit for single-link
  - [ ] Clipboard step is optional / default off
- [ ] Default page is Download

---

## 2. Core engines

- [ ] Settings → Core engines: yt-dlp / ffmpeg show installed (or clear missing toast + path to fix)
- [ ] If missing: note error; reinstall or `npm run bin:download` for dev rebuild only

---

## 3. Free download (single)

- [ ] Paste a public YouTube (or other) **video** URL → Analyze → Capture
- [ ] Progress updates; file lands in download folder
- [ ] Cancel mid-download once (single or queue cancel) → task stops cleanly
- [ ] Open folder / open file works

**Clipboard (optional feature)**

- [ ] Settings → Privacy: Clipboard watch **off** by default
- [ ] Copy `https://www.youtube.com/` (homepage) with watch **on** → **no** notification
- [ ] Copy a real `watch?v=` link with watch **on** → system notification
- [ ] Click notification → app focuses and fills URL (does not steal focus before click)
- [ ] Detection range: try Balanced; switch Strict/Loose if needed

---

## 4. Settings / privacy

- [ ] Theme light/dark switches
- [ ] Language switch updates UI
- [ ] Max concurrent downloads change saves
- [ ] **Open logs folder** opens Explorer under userData logs
- [ ] Cleanup temp works (optional)
- [ ] Error reporting toggle present (no crash)

---

## 5. Transcribe (Scribe)

- [ ] Open Transcribe; add a short local audio/video
- [ ] Start transcription (cloud or local)
- [ ] Progress visible
- [ ] **Cancel transcription** during run → stops; returns to options; toast “cancelled”
- [ ] (Optional) Complete one full run and export SRT/TXT

---

## 6. Image compress (Community)

- [ ] Open image tools; compress one image → success

---

## 7. All features unlocked (free)

- [ ] Batch mode / queue: add 2 URLs, progress, cancel all
- [ ] Enhance: start + cancel
- [ ] Subtitle page loads local video without Mobile server
- [ ] Mobile: server does **not** auto-start on 8765 unless enabled
- [ ] Donation page opens; links work

---

## 8. Creator / Editor / Mobile

- [ ] Creator tools: quick clip / export
- [ ] Editor: open a short local video in timeline
- [ ] Mobile connect: server does **not** auto-start on 8765 unless enabled

---

## 9. Protocol / extension (if used)

- [ ] `mediaflow://download?url=https://...` focuses app (if registered)
- [ ] Extension local helper: only as documented

---

## 10. Update channel (after R2 upload)

- [ ] Upload `MediaFlow Setup 2.4.0.exe` + `latest.yml` to publish CDN
- [ ] Install **previous** version → sees update → downloads → restart installs 2.4.0

---

## 11. Exit cleanliness

- [ ] Quit app
- [ ] No leftover high-CPU electron/ffmpeg/python from MediaFlow (Task Manager)
- [ ] Re-open once more OK

---

## Sign-off

| Item | Result |
|------|--------|
| Build artifact | `MediaFlow Setup 2.4.0.exe` |
| Smoke date | |
| Tester | |
| Blockers | |
| Ready to publish | Yes / No |

---

## Related commands

```bash
npm run build:win:checked
```
