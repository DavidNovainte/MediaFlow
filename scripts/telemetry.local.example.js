/**
 * Optional local telemetry config for error reporting (Google Apps Script).
 * Copy to telemetry.local.js and fill in real values. Never commit telemetry.local.js.
 *
 * Env vars take precedence when set:
 *   MEDIAFLOW_APPS_SCRIPT_URL
 *   MEDIAFLOW_APPS_SCRIPT_TOKEN
 */
module.exports = {
    url: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    token: 'CHANGE_ME_TO_A_LONG_RANDOM_TOKEN'
};
