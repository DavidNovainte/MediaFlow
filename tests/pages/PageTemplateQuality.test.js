const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const readPage = (pageName) => fs.readFileSync(
    path.join(__dirname, '../../src/pages', `${pageName}.html`),
    'utf8'
);

const flatten = (value, prefix = '', output = {}) => {
    Object.entries(value).forEach(([key, child]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            flatten(child, fullKey, output);
        } else {
            output[fullKey] = child;
        }
    });
    return output;
};

const readLocale = (locale) => {
    const localeDir = path.join(__dirname, '../../src/locales', locale);
    return fs.readdirSync(localeDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .reduce((translations, fileName) => ({
            ...translations,
            ...flatten(JSON.parse(fs.readFileSync(path.join(localeDir, fileName), 'utf8')))
        }), {});
};

const collectTemplateI18nKeys = (pageName) => {
    const document = new JSDOM(readPage(pageName)).window.document;
    const keys = new Set();

    [
        'data-i18n',
        'data-i18n-title',
        'data-i18n-placeholder',
        'data-i18n-title-attr'
    ].forEach((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => {
            keys.add(element.getAttribute(attribute));
        });
    });

    return [...keys].sort();
};

describe('Page template quality guards', () => {
    test.each(['subtitle', 'settings'])('%s template has no broken fallback placeholders', (pageName) => {
        const html = readPage(pageName);

        expect(html).not.toMatch(/\?{2,}/);
        expect(html).not.toContain('\uFFFD');
    });

    test('settings template keeps details sections balanced', () => {
        const html = readPage('settings');
        const detailsOpenCount = (html.match(/<details\b/gi) || []).length;
        const detailsCloseCount = (html.match(/<\/details>/gi) || []).length;

        expect(detailsCloseCount).toBe(detailsOpenCount);
    });

    test('subtitle template keeps critical fallback labels readable', () => {
        const document = new JSDOM(readPage('subtitle')).window.document;

        expect(document.getElementById('btn-start-burn').textContent).toContain('开始合成');
        // Title mentions engine switch in detailed settings (product copy evolved)
        expect(document.getElementById('btn-ai-process').getAttribute('title')).toContain('AI 自动分段识别与翻译');
        expect(document.getElementById('subtitle-export-modal').textContent).toContain('视频 + AI 配音');
        expect(document.getElementById('subtitle-export-modal').textContent).toContain('开始合成');
    });

    test.each(['subtitle', 'settings'])('%s template references existing zh-CN and en-US locale keys', (pageName) => {
        const keys = collectTemplateI18nKeys(pageName);
        const locales = {
            'zh-CN': readLocale('zh-CN'),
            'en-US': readLocale('en-US')
        };

        Object.entries(locales).forEach(([locale, translations]) => {
            const missingKeys = keys.filter((key) => !(key in translations));
            expect({ pageName, locale, missingKeys }).toEqual({ pageName, locale, missingKeys: [] });
        });
    });
});
