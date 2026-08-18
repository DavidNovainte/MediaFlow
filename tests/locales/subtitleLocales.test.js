const fs = require('fs');
const path = require('path');

function flattenKeys(obj, prefix = '') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenKeys(value, nextKey));
        } else {
            result[nextKey] = value;
        }
    }

    return result;
}

describe('subtitle locale completeness', () => {
    const localesRoot = path.resolve(__dirname, '../../src/locales');
    const baseLocalePath = path.join(localesRoot, 'en-US', 'subtitle.json');
    const baseLocale = JSON.parse(fs.readFileSync(baseLocalePath, 'utf8'));
    const baseKeys = Object.keys(flattenKeys(baseLocale));

    for (const locale of fs.readdirSync(localesRoot)) {
        const localeFile = path.join(localesRoot, locale, 'subtitle.json');
        if (!fs.existsSync(localeFile) || locale === 'en-US') continue;

        it(`${locale} covers every subtitle locale key`, () => {
            const localeData = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
            const localeKeys = Object.keys(flattenKeys(localeData));
            const missingKeys = baseKeys.filter((key) => !localeKeys.includes(key));

            expect(missingKeys).toEqual([]);
        });
    }
});
