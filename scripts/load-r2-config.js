/**
 * Load R2 config from env, then scripts/r2-config.js (gitignored local file).
 */
const fs = require('fs');
const path = require('path');

function fromEnv() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) return null;

    return {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket: process.env.R2_BUCKET || 'mediaflow-releases',
        customDomain: process.env.R2_CUSTOM_DOMAIN || '',
        downloadPrefix: process.env.R2_DOWNLOAD_PREFIX || 'downloads'
    };
}

function loadR2Config(baseDir = __dirname) {
    const envConfig = fromEnv();
    if (envConfig) return envConfig;

    const localPath = path.join(baseDir, 'r2-config.js');
    if (fs.existsSync(localPath)) {
        return require(localPath);
    }

    throw new Error(
        'R2 config missing. Set R2_* env vars or copy scripts/r2-config.example.js → scripts/r2-config.js'
    );
}

module.exports = { loadR2Config, fromEnv };
