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

describe('locale coverage', () => {
    const localesRoot = path.resolve(__dirname, '../../src/locales');
    const baseLocaleDir = path.join(localesRoot, 'en-US');
    const localeDirs = fs.readdirSync(localesRoot).filter((name) => (
        fs.statSync(path.join(localesRoot, name)).isDirectory()
    ));
    const baseLocaleFiles = fs.readdirSync(baseLocaleDir).filter((name) => name.endsWith('.json'));

    for (const locale of localeDirs) {
        if (locale === 'en-US') continue;

        for (const fileName of baseLocaleFiles) {
            it(`${locale} covers every key in ${fileName}`, () => {
                const baseFile = path.join(baseLocaleDir, fileName);
                const localeFile = path.join(localesRoot, locale, fileName);

                const baseLocale = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
                const localeData = fs.existsSync(localeFile)
                    ? JSON.parse(fs.readFileSync(localeFile, 'utf8'))
                    : {};

                const baseKeys = Object.keys(flattenKeys(baseLocale));
                const localeKeys = Object.keys(flattenKeys(localeData));
                const missingKeys = baseKeys.filter((key) => !localeKeys.includes(key));

                expect(missingKeys).toEqual([]);
            });
        }
    }
});
