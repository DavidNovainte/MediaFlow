const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { ipcMain, app } = require('electron');

/**
 * Auto Updater Configuration and Logic
 */

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Auto-download is true by default, but explicit is better
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/**
 * Initialize the Auto Updater
 * @param {BrowserWindow} mainWindow - The main application window to send events to
 */
function initAutoUpdater(mainWindow) {
    if (!mainWindow) return;

    // --- Updater Event Handlers ---

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        // Optional: send status to renderer if you want to show a spinner
        // mainWindow.webContents.send('updater:status', 'checking');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available.', info);
        mainWindow.webContents.send('updater:available', info);
        // Toast is handled in renderer
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available.', info);
        // mainWindow.webContents.send('updater:not-available', info);
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater. ' + err);
        mainWindow.webContents.send('updater:error', err.toString());
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
        log.info(log_message);

        // Send progress to renderer to show a progress bar if desired
        mainWindow.webContents.send('updater:progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded. Auto-installing in 2s.', info);

        // Notify renderer to show a brief "updating..." state
        mainWindow.webContents.send('updater:downloaded', info);

        // Auto-close the running app and install the update immediately.
        setTimeout(() => {
            try {
                autoUpdater.quitAndInstall();
            } catch (e) {
                log.error('Auto-install failed, will install on app quit instead.', e);
            }
        }, 2000);
    });

    // --- IPC Handlers for User Interaction ---

    // Triggered when user clicks "Check for Updates" manually (if you add such button)
    ipcMain.handle('updater:check', async () => {
        try {
            return await autoUpdater.checkForUpdates();
        } catch (e) {
            log.error('Failed to check for updates manually', e);
            throw e;
        }
    });

    // Triggered when user clicks "Restart Now" on the update prompt
    ipcMain.on('updater:quit-and-install', () => {
        autoUpdater.quitAndInstall();
    });

    // --- Initial Check ---
    // Check for updates immediately after initialization (with a slight delay to ensure window is ready)
    setTimeout(async () => {
        // 🔒 SAFETY: Only check for updates in packaged app to prevent dev freeze
        if (app.isPackaged) {
            try {
                await autoUpdater.checkForUpdatesAndNotify();
            } catch (e) {
                log.error('Failed to check for updates on startup:', e);
                // Silent fail - do not annoy user on startup if network is down
            }
        } else {
            log.info('Skipping auto-update check in unpacked/dev mode.');
        }
    }, 3000);
}

module.exports = { initAutoUpdater };
