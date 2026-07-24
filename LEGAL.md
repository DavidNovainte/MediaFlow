# Legal Information

## Editions

- **MediaFlow Pro (official installers)** — commercial desktop product. This EULA / privacy notice applies to signed official builds distributed from MediaFlow channels.
- **MediaFlow Community (open-source export)** — Open Core subset licensed under **Apache-2.0** (see the Community repository `LICENSE`). Community source is not the same as the commercial Pro binary.

## End User License Agreement (EULA)

**Last Updated: January 2026**

This End User License Agreement ("Agreement") is a legal agreement between you ("User") and MediaFlow ("Company"). By installing or using the **official MediaFlow Pro** Software, you agree to be bound by this Agreement.

### 1. Grant of License
Subject to the terms of this Agreement, MediaFlow grants you a limited, non-exclusive, non-transferable license to install and use the Software for personal, non-commercial purposes.

### 2. Copyright & Content Usage
**CRITICAL NOTICE**: MediaFlow is a technical tool designed for data processing and local media management.
*   **User Responsibility**: You agree that you are solely responsible for ensuring that your use of the Software complies with all applicable laws and the Terms of Service of any third-party media platforms.
*   **No Piracy**: You MUST NOT use this Software to archive copyrighted content that you do not have permission to access or store. The Software is intended for archiving content you own, open-source content, or content under Creative Commons licenses.
*   **Liability**: MediaFlow disclaims any liability for misuse of the Software to infringe on third-party intellectual property rights.

### 3. Pro Version & Payments
*   Pro features are unlocked via a valid License Key purchased from our authorized reseller (LemonSqueezy/Gumroad).
*   License Keys are for your personal use only and may not be shared publicly. We reserve the right to revoke keys that show suspicious activity (e.g., used on excessive devices).

### 4. Disclaimer of Warranties
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

---

## Privacy Policy

**Last Updated: July 2026**

**We respect your privacy. Here is exactly what we track and what stays on your device:**

### 1. Data Collection
We do **NOT** collect logs of what media you archive or process. Media processing (download, transcribe, enhance, subtitles, etc.) happens **locally on your machine**.

**Local data on your device may include:**
*   **Settings** (download path, language, theme, concurrency, clipboard options) via Electron `electron-store`
*   **Local logs** under the app user-data folder (for troubleshooting). You can open this folder from **Settings → Privacy → Open logs folder**, and clear temp/cache/logs from Settings
*   **Temporary files** created during processing (cleaned on exit / manual cleanup)

**Optional clipboard link detection (off by default):**
*   When you enable it in **Settings → Privacy**, MediaFlow may read clipboard text **only on your PC** to detect capturable media URLs
*   Detection uses local URL rules; **clipboard content is not uploaded**
*   Matching links show a **system notification**; the app opens and fills a URL **only after you click** the notification
*   You can choose detection range (strict / balanced / loose) or turn the feature off at any time

**Optional local network features (Pro / advanced, not auto-started by default):**
*   **Mobile / LAN helper** and **browser extension helper** may listen on **localhost / local network** only when you enable them
*   PIN protection may apply for MobileFlow; traffic is for device-to-device transfer on your network, not to MediaFlow cloud media storage

**Optional error reporting (user toggle):**
*   If you enable “Send error reports”, **anonymized crash/error diagnostics** may be sent to our optional telemetry endpoint (e.g. Google Apps Script). This is **disabled or no-op** when not configured. We do not intentionally include your media files or download URLs in those reports

**For Activation (Pro Users Only)**:
When you activate the Pro version, the following data is sent to our license provider (LemonSqueezy) to verify your purchase:
*   **License Key**: To check validity.
*   **HWID (Hardware ID)**: A unique hash of your system components to prevent license abuse (e.g., one key used on 1000 computers).
*   **Device Name**: e.g., "Alex's PC".

### 2. Third-Party Services
*   **yt-dlp / ffmpeg / local AI tools**: May contact target media platforms or use local binaries you install; MediaFlow does not proxy your media library to our servers for normal archive workflows
*   **LemonSqueezy**: Handles all payment processing. We do not store your credit card details
*   **Auto-update**: Official builds may check a release CDN (e.g. R2/generic publish URL) for newer installers

### 3. Contact
For legal inquiries, please contact: mediaflow.service@gmail.com
