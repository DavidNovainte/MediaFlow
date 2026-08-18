/**
 * Cloudflare R2 configuration example.
 * Copy to r2-config.js (gitignored) or set env vars used by load-r2-config.js.
 *
 * Env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_CUSTOM_DOMAIN, R2_DOWNLOAD_PREFIX
 */
module.exports = {
    accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID',
    accessKeyId: 'YOUR_R2_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_R2_SECRET_ACCESS_KEY',
    bucket: 'mediaflow-releases',
    customDomain: 'pub-xxxxxxxx.r2.dev',
    downloadPrefix: 'downloads'
};
