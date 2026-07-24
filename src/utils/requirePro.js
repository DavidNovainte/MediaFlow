/**
 * Main-process Pro license gate for IPC handlers.
 * Renderer gates are UX only — always re-check here for mutating Pro work.
 *
 * LicenseManager is required lazily so unit tests can mock it before first assertPro().
 */

const PRO_DENIED = Object.freeze({
    success: false,
    error: 'PRO_REQUIRED',
    message: 'Pro license required'
});

function getLicenseManager() {
    return require('../../services/LicenseManager');
}

/**
 * @returns {Promise<null | { success: false, error: string, message: string }>}
 */
async function assertPro() {
    try {
        const licenseManager = getLicenseManager();
        const status = await licenseManager.getStatus();
        if (status?.isPro) return null;
        return { ...PRO_DENIED };
    } catch (error) {
        return {
            success: false,
            error: 'PRO_REQUIRED',
            message: error?.message || 'Pro license required'
        };
    }
}

/**
 * Wrap an existing ipcMain.handle callback with a Pro check.
 * @param {(event: any, ...args: any[]) => any} handler
 */
function withPro(handler) {
    return async (event, ...args) => {
        const denied = await assertPro();
        if (denied) return denied;
        return handler(event, ...args);
    };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {string} channel
 * @param {(event: any, ...args: any[]) => any} handler
 */
function handlePro(ipcMain, channel, handler) {
    ipcMain.handle(channel, withPro(handler));
}

module.exports = {
    assertPro,
    withPro,
    handlePro,
    PRO_DENIED
};
