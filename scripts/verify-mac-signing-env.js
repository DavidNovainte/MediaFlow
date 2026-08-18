const requiredVars = [
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID'
];

const optionalSigningVars = [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'CSC_NAME'
];

function verifyMacSigningEnv(env = process.env) {
    const missingRequired = requiredVars.filter((key) => !env[key]);
    const presentOptional = optionalSigningVars.filter((key) => !!env[key]);

    return {
        ok: missingRequired.length === 0,
        missingRequired,
        presentOptional
    };
}

if (require.main === module) {
    const result = verifyMacSigningEnv();

    if (!result.ok) {
        console.error('[verify-mac-signing-env] Missing required macOS notarization variables:');
        result.missingRequired.forEach((key) => console.error(`  - ${key}`));
        console.error('Fill them on the Mac build machine before running npm run build:mac.');
        process.exitCode = 1;
    } else {
        console.log('[verify-mac-signing-env] Required macOS notarization variables are present.');
        if (result.presentOptional.length > 0) {
            console.log(`  optional signing variables present: ${result.presentOptional.join(', ')}`);
        } else {
            console.log('  optional signing variables not set (OK if certificate is already in Keychain).');
        }
    }
}

module.exports = {
    verifyMacSigningEnv
};
