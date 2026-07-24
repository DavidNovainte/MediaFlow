/**
 * SettingsVersionLoader.js
 * 负责动态加载和显示应用版本号
 */

async function loadAppVersion() {
    try {
        const version = await window.mediaflow.app.getVersion();
        const versionDisplay = document.getElementById('app-version-display');
        if (versionDisplay) {
            versionDisplay.textContent = `MediaFlow v${version}`;
        }
    } catch (error) {
        console.error('[Settings] Failed to load app version:', error);
        const versionDisplay = document.getElementById('app-version-display');
        if (versionDisplay) {
            versionDisplay.textContent = 'MediaFlow';
        }
    }
}

// 页面加载时自动执行
document.addEventListener('DOMContentLoaded', () => {
    loadAppVersion();
});
