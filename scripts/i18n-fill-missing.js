/**
 * i18n-fill-missing.js
 * 1) Ensure en-US has keys that only existed in zh-CN (English values).
 * 2) Deep-merge missing keys from en-US into every other locale (per JSON file).
 *    - Never overwrites existing non-empty translations
 *    - UTF-8 without BOM
 *    - Stable JSON: 2-space indent + trailing newline
 *
 * Usage: node scripts/i18n-fill-missing.js
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, '../src/locales');
const SOURCE = 'en-US';

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

function writeJson(filePath, data) {
    const text = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, text, { encoding: 'utf8' });
}

/** Deep-add missing keys from source into target. Returns count of keys added. */
function fillMissing(source, target, stats) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return 0;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        // invalid target container — replace with deep clone of source
        return 0;
    }
    let added = 0;
    for (const key of Object.keys(source)) {
        const sv = source[key];
        if (!(key in target)) {
            target[key] = JSON.parse(JSON.stringify(sv));
            added += 1;
            stats.addedPaths.push(key);
            continue;
        }
        const tv = target[key];
        if (
            sv &&
            typeof sv === 'object' &&
            !Array.isArray(sv) &&
            tv &&
            typeof tv === 'object' &&
            !Array.isArray(tv)
        ) {
            added += fillMissing(sv, tv, stats);
        }
        // if target has string/number already, keep it (even if empty string)
    }
    return added;
}

function ensureEnUsExtras() {
    const patches = {
        'creator.json': (data) => {
            data.creator = data.creator || {};
            data.creator.batch = data.creator.batch || {};
            data.creator.batch.options = data.creator.batch.options || {};
            let n = 0;
            if (data.creator.batch.sortAsc === undefined) {
                data.creator.batch.sortAsc = 'Ascending';
                n++;
            }
            if (data.creator.batch.clearQueueTitle === undefined) {
                data.creator.batch.clearQueueTitle = 'Clear all tasks';
                n++;
            }
            if (data.creator.batch.options.margin === undefined) {
                data.creator.batch.options.margin = 'Keep margin (s)';
                n++;
            }
            return n;
        },
        'subtitle.json': (data) => {
            let n = 0;
            data.subtitle = data.subtitle || {};
            data.subtitle.messages = data.subtitle.messages || {};
            data.subtitle.settings = data.subtitle.settings || {};
            data.subtitle.settings.placeholder = data.subtitle.settings.placeholder || {};
            data.settings = data.settings || {};
            data.settings.placeholder = data.settings.placeholder || {};

            const msg = {
                preparing: 'Preparing environment...',
                identifyingBatch: 'Batch AI recognition in progress...',
                translatingBatch: 'Batch AI translation in progress...',
                ttsBatch: 'Batch AI dubbing in progress...',
                noSubData: 'No data yet. Run recognition first.',
                main: 'Main subtitle track',
                watermark: 'Watermark track',
                header: 'Title track',
                subtitle: 'External subtitle track',
                custom: 'Custom track',
                defaultTrackName: 'Track {n}'
            };
            for (const [k, v] of Object.entries(msg)) {
                if (data.subtitle.messages[k] === undefined) {
                    data.subtitle.messages[k] = v;
                    n++;
                }
            }
            if (data.subtitle.settings.placeholder.outputPath === undefined) {
                data.subtitle.settings.placeholder.outputPath = 'Select output folder...';
                n++;
            }
            if (data.subtitle.settings.placeholder.inputTemplateName === undefined) {
                data.subtitle.settings.placeholder.inputTemplateName = 'Enter template name';
                n++;
            }
            if (data.settings.placeholder.outputPath === undefined) {
                data.settings.placeholder.outputPath = 'Select output folder...';
                n++;
            }
            if (data.settings.placeholder.inputTemplateName === undefined) {
                data.settings.placeholder.inputTemplateName = 'Enter template name';
                n++;
            }
            return n;
        }
    };

    let total = 0;
    for (const [file, fn] of Object.entries(patches)) {
        const fp = path.join(localesDir, SOURCE, file);
        const data = readJson(fp);
        const n = fn(data);
        if (n > 0) {
            writeJson(fp, data);
            console.log(`[en-US] +${n} keys in ${file}`);
            total += n;
        } else {
            console.log(`[en-US] ${file} already complete for known extras`);
        }
    }
    return total;
}

function listLocaleDirs() {
    return fs
        .readdirSync(localesDir)
        .filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory())
        .sort();
}

function syncLocale(targetLocale, sourceFiles) {
    const targetDir = path.join(localesDir, targetLocale);
    let filesUpdated = 0;
    let keysAdded = 0;

    for (const file of sourceFiles) {
        const srcPath = path.join(localesDir, SOURCE, file);
        const dstPath = path.join(targetDir, file);
        const sourceData = readJson(srcPath);
        let targetData = {};
        let existed = false;
        if (fs.existsSync(dstPath)) {
            try {
                targetData = readJson(dstPath);
                existed = true;
            } catch (e) {
                console.warn(`[${targetLocale}] parse fail ${file}, recreating: ${e.message}`);
                targetData = {};
            }
        }

        const stats = { addedPaths: [] };
        const before = JSON.stringify(targetData);
        const added = fillMissing(sourceData, targetData, stats);
        // If file was missing entirely, targetData is full clone via fillMissing on empty {}
        if (!existed) {
            targetData = JSON.parse(JSON.stringify(sourceData));
            keysAdded += countLeaves(sourceData);
            writeJson(dstPath, targetData);
            filesUpdated++;
            console.log(`[${targetLocale}] created ${file} (${countLeaves(sourceData)} keys from en-US)`);
            continue;
        }

        if (added > 0 || before !== JSON.stringify(targetData)) {
            writeJson(dstPath, targetData);
            filesUpdated++;
            keysAdded += added;
            if (added > 0) {
                console.log(`[${targetLocale}] ${file}: +${added} missing keys`);
            }
        }
    }
    return { filesUpdated, keysAdded };
}

function countLeaves(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return 1;
    let n = 0;
    for (const v of Object.values(obj)) n += countLeaves(v);
    return n;
}

function flatten(obj, prefix = '', out = {}) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        if (prefix) out[prefix] = obj;
        return out;
    }
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
        else out[p] = v;
    }
    return out;
}

function loadMerged(lang) {
    const dir = path.join(localesDir, lang);
    const merged = {};
    const deepMerge = (target, source) => {
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
    };
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        deepMerge(merged, readJson(path.join(dir, file)));
    }
    return flatten(merged);
}

function verifyEncoding(lang) {
    const dir = path.join(localesDir, lang);
    const issues = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const buf = fs.readFileSync(path.join(dir, file));
        if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
            issues.push(`${file}: has UTF-8 BOM`);
        }
        const text = buf.toString('utf8').replace(/^\uFEFF/, '');
        if (text.includes('\uFFFD')) issues.push(`${file}: replacement char U+FFFD`);
        if (text.includes('\u0000')) issues.push(`${file}: null bytes`);
        try {
            JSON.parse(text);
        } catch (e) {
            issues.push(`${file}: JSON parse error ${e.message}`);
        }
    }
    return issues;
}

function main() {
    console.log('=== i18n fill missing (safe structural sync) ===\n');
    const enExtras = ensureEnUsExtras();
    console.log(`en-US extras total: ${enExtras}\n`);

    const sourceDir = path.join(localesDir, SOURCE);
    const sourceFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.json')).sort();
    const locales = listLocaleDirs().filter((l) => l !== SOURCE);

    let totalKeys = 0;
    let totalFiles = 0;
    for (const locale of locales) {
        console.log(`--- ${locale} ---`);
        const r = syncLocale(locale, sourceFiles);
        totalKeys += r.keysAdded;
        totalFiles += r.filesUpdated;
    }

    console.log('\n=== Verification (key count vs en-US) ===');
    const enFlat = loadMerged(SOURCE);
    const enCount = Object.keys(enFlat).length;
    console.log(`en-US: ${enCount} keys`);

    for (const locale of listLocaleDirs()) {
        if (locale === SOURCE) continue;
        const flat = loadMerged(locale);
        const missing = Object.keys(enFlat).filter((k) => !(k in flat));
        const enc = verifyEncoding(locale);
        const status = missing.length === 0 ? 'OK' : `MISSING ${missing.length}`;
        console.log(
            `${locale}: keys=${Object.keys(flat).length} vs en ${status}` +
                (enc.length ? ` | ENC: ${enc.join('; ')}` : ' | encoding OK')
        );
        if (missing.length && missing.length <= 12) {
            console.log('  missing sample:', missing.join(', '));
        } else if (missing.length) {
            console.log('  missing sample:', missing.slice(0, 8).join(', '), '...');
        }
    }

    const enEnc = verifyEncoding(SOURCE);
    console.log(`en-US encoding: ${enEnc.length ? enEnc.join('; ') : 'OK'}`);
    console.log(`\nDone. Files touched: ${totalFiles}, leaf keys added (approx): ${totalKeys}`);
}

main();
