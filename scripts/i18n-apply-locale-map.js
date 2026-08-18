/**
 * Apply a flat key→translation map to one locale.
 * Only replaces a value when it currently equals the en-US value (safe).
 *
 * Usage:
 *   node scripts/i18n-apply-locale-map.js de-DE tmp/de-map.json
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, '../src/locales');
const locale = process.argv[2];
const mapPath = process.argv[3];

if (!locale || !mapPath) {
    console.error('Usage: node scripts/i18n-apply-locale-map.js <locale> <map.json>');
    process.exit(1);
}

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(p, data) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getPath(obj, dotted) {
    const parts = dotted.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

function setPath(obj, dotted, value) {
    const parts = dotted.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
        cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        const sv = source[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
            }
            deepMerge(target[key], sv);
        } else {
            target[key] = sv;
        }
    }
}

function loadMerged(lang) {
    const dir = path.join(localesDir, lang);
    const merged = {};
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        deepMerge(merged, readJson(path.join(dir, file)));
    }
    return merged;
}

/** Which file owns a top-level root key (best-effort). */
function fileForKey(lang, dotted) {
    const root = dotted.split('.')[0];
    const dir = path.join(localesDir, lang);
    const enDir = path.join(localesDir, 'en-US');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

    // Prefer the same file as en-US when the path already lives there
    // (e.g. settings.* inside subtitle.json must not go to settings.json or merge overwrites).
    if (fs.existsSync(enDir)) {
        const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith('.json'));
        for (const file of enFiles) {
            try {
                const data = readJson(path.join(enDir, file));
                if (getPath(data, dotted) !== undefined) {
                    // write into locale counterpart
                    return file;
                }
            } catch {
                /* ignore */
            }
        }
    }

    // Prefer filename matching root
    const prefer = `${root}.json`;
    if (files.includes(prefer)) return prefer;
    // Search which file contains the path in target locale
    for (const file of files) {
        const data = readJson(path.join(dir, file));
        if (getPath(data, dotted) !== undefined) return file;
    }
    return files.includes('common.json') ? 'common.json' : files[0];
}

const map = readJson(path.resolve(mapPath));
const enMerged = loadMerged('en-US');
const localeDir = path.join(localesDir, locale);

let applied = 0;
let skippedDifferent = 0;
let skippedMissingEn = 0;
let skippedNoChange = 0;
const fileCache = {};

for (const [key, translation] of Object.entries(map)) {
    if (typeof translation !== 'string') continue;
    const enVal = getPath(enMerged, key);
    if (typeof enVal !== 'string') {
        skippedMissingEn++;
        continue;
    }

    const file = fileForKey(locale, key);
    const fp = path.join(localeDir, file);
    if (!fileCache[file]) {
        fileCache[file] = fs.existsSync(fp) ? readJson(fp) : {};
    }
    const data = fileCache[file];
    const cur = getPath(data, key);

    if (cur === translation) {
        skippedNoChange++;
        continue;
    }
    // Only replace English placeholders / untranslated
    if (cur !== undefined && cur !== enVal) {
        skippedDifferent++;
        continue;
    }
    setPath(data, key, translation);
    applied++;
}

for (const [file, data] of Object.entries(fileCache)) {
    writeJson(path.join(localeDir, file), data);
}

console.log(`[${locale}] applied=${applied} skippedDifferent=${skippedDifferent} skippedNoChange=${skippedNoChange} skippedMissingEn=${skippedMissingEn}`);
console.log(`Files written: ${Object.keys(fileCache).length}`);
