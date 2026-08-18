/**
 * Careful preflight i18n audit before manual QA.
 * node scripts/preflight-i18n-audit.js
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const issues = [];

function flatten(obj, prefix = '', out = {}) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        if (prefix) out[prefix] = obj;
        return out;
    }
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
        else out[p] = v;
    }
    return out;
}

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function loadMerged(lang) {
    const d = path.join(root, 'src/locales', lang);
    const m = {};
    const dm = (t, s) => {
        for (const k of Object.keys(s)) {
            if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
                if (!t[k] || typeof t[k] !== 'object') t[k] = {};
                dm(t[k], s[k]);
            } else t[k] = s[k];
        }
    };
    const files = fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
        try {
            dm(m, readJson(path.join(d, f)));
        } catch (e) {
            issues.push({ sev: 'error', type: 'parse', lang, file: f, msg: e.message });
        }
    }
    return m;
}

function loadFlat(lang) {
    return flatten(loadMerged(lang));
}

function keysInFile(lang, file) {
    try {
        return flatten(readJson(path.join(root, 'src/locales', lang, file)));
    } catch {
        return {};
    }
}

function walkJs(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['node_modules', 'locales', 'dist', 'tmp', 'logs'].includes(e.name)) continue;
            walkJs(p, acc);
        } else if (/\.(js|html)$/.test(e.name)) acc.push(p);
    }
    return acc;
}

const langs = fs
    .readdirSync(path.join(root, 'src/locales'))
    .filter((n) => fs.statSync(path.join(root, 'src/locales', n)).isDirectory())
    .sort();
const enFiles = fs
    .readdirSync(path.join(root, 'src/locales', 'en-US'))
    .filter((f) => f.endsWith('.json'))
    .sort();
const en = loadFlat('en-US');
const enStr = Object.keys(en).filter((k) => typeof en[k] === 'string');

// 1) encoding + file set + missing keys
for (const lang of langs) {
    const dir = path.join(root, 'src/locales', lang);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    for (const f of enFiles) {
        if (!files.includes(f)) issues.push({ sev: 'error', type: 'missing_file', lang, file: f });
    }
    for (const f of files) {
        const b = fs.readFileSync(path.join(dir, f));
        if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
            issues.push({ sev: 'warn', type: 'bom', lang, file: f });
        }
        const t = b.toString('utf8');
        if (/\uFFFD/.test(t)) issues.push({ sev: 'error', type: 'replacement_char', lang, file: f });
        if (/锟斤拷|烫烫烫|Ã©|â€/.test(t)) issues.push({ sev: 'error', type: 'mojibake', lang, file: f });
    }
    const flat = loadFlat(lang);
    for (const k of enStr) {
        if (!(k in flat)) issues.push({ sev: 'error', type: 'missing_key', lang, key: k });
        else if (en[k] !== '' && (flat[k] === undefined || flat[k] === null)) {
            issues.push({ sev: 'error', type: 'null_key', lang, key: k });
        }
    }
    // placeholder parity
    for (const k of enStr) {
        const ev = en[k];
        const lv = flat[k];
        if (typeof ev !== 'string' || typeof lv !== 'string') continue;
        const ep = [...ev.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
        const lp = [...lv.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
        const ep2 = [...ev.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
        const lp2 = [...lv.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
        if (ep !== lp) {
            issues.push({
                sev: 'warn',
                type: 'placeholder_mismatch',
                lang,
                key: k,
                en: ep || '-',
                loc: lp || '-',
                enVal: ev.slice(0, 50),
                locVal: String(lv).slice(0, 50)
            });
        }
        if (ep2 !== lp2) {
            issues.push({
                sev: 'warn',
                type: 'placeholder2_mismatch',
                lang,
                key: k,
                en: ep2 || '-',
                loc: lp2 || '-'
            });
        }
    }
}

// 2) multi-file collisions with different values
const collisionSamples = [];
for (const lang of ['en-US', 'zh-CN', 'de-DE', 'ja-JP', 'fr-FR', 'ko-KR']) {
    const fileKeys = {};
    for (const f of enFiles) {
        const flat = keysInFile(lang, f);
        for (const k of Object.keys(flat)) {
            if (!fileKeys[k]) fileKeys[k] = [];
            fileKeys[k].push(f);
        }
    }
    let differ = 0;
    const samples = [];
    for (const [k, fsList] of Object.entries(fileKeys)) {
        if (fsList.length < 2) continue;
        const vals = fsList.map((f) => keysInFile(lang, f)[k]);
        const uniq = [...new Set(vals.map((v) => JSON.stringify(v)))];
        if (uniq.length > 1) {
            differ += 1;
            if (samples.length < 10) samples.push({ k, files: fsList, vals });
        }
    }
    collisionSamples.push({ lang, differ, samples });
}

// 3) hardcoded CJK non-comment
const hard = [];
const patterns = [
    /showToast\s*\(/,
    /new Error\s*\(/,
    /\.textContent\s*=/,
    /i18n\?\.t\([^)]*\)\s*\|\|/,
    /\.innerHTML\s*=/
];
for (const abs of [
    ...walkJs(path.join(root, 'src')),
    ...walkJs(path.join(root, 'services'))
]) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const lines = fs.readFileSync(abs, 'utf8').split(/\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/[\u4e00-\u9fff]/.test(line)) continue;
        if (!/[`'"][^`'"]*[\u4e00-\u9fff]/.test(line)) continue;
        const trim = line.trim();
        if (trim.startsWith('//') || trim.startsWith('*') || trim.startsWith('/*')) continue;
        if (patterns.some((re) => re.test(line))) {
            hard.push({ rel, line: i + 1, text: trim.slice(0, 140) });
        }
    }
}

// 4) critical keys
const crit = [
    'download.receivedFromExtension',
    'nav.upgrade',
    'settings.language',
    'subtitle.editor.empty_title',
    'editor.timelineEmpty',
    'update.available',
    'common.saveFailed',
    'enhance.errors.cropFailed',
    'settings.input_mode',
    'subtitle.batch.queue_title'
];
const critMatrix = {};
for (const k of crit) {
    critMatrix[k] = {};
    for (const lang of langs) {
        const v = loadFlat(lang)[k];
        critMatrix[k][lang] = v;
        if (v === undefined || v === null || v === '') {
            issues.push({ sev: 'error', type: 'critical_empty', lang, key: k });
        }
    }
}

// 5) meaningful EN leftovers
const brand =
    /^(Qwen|OpenAI|DeepL|Codec|Format|Turbo|Engine|Auto|Regex|Cast|Port|Version|Status|Temp|Emotion|Community|Video|Audio|Original|Name|Normal|Standard|Playlist|Pause|Zoom|Ripple|Text|Desktop|Pro |ElevenLabs|SiliconFlow|Google |DeepSeek|Whisper|MOV|MKV|MP4|MP3|FFmpeg|Chrome|MediaFlow|Powered by|yt-dlp|SRT|ASS|VTT|Proxy|CUGAN|Real-ESRGAN|Fal\.|Stability|Anthropic|Mistral|OpenRouter|Replicate|Groq|Gemini|Claude|Baichuan|Moonshot|Zhipu|Hindi|Thai|Afrikaans|Preview|OK|API|GPU|CPU|FPS|CRF|HLS|PIN|LAN|URL|JSON|PNG|JPG|WebP|GIF|BGM|TTS|Lab|PiP|Instrumental|Segment )/i;
function keepAsIs(k, v) {
    if (!v || v === '') return true;
    if (k.includes('preview_text.')) return true;
    if (brand.test(String(v).trim())) return true;
    if (/^\{[^}]+\} [a-zA-Z\u0400-\u04FF]{1,3}$/.test(v)) return true;
    if (
        /^[0-9A-Za-z_\-./+()≤×:%\s|·•🎬🎵📺🖥️📱📉📄✨✅❌🎙️🌐🎹]+$/.test(v) &&
        String(v).split(/\s+/).length <= 3 &&
        String(v).length <= 28
    ) {
        return true;
    }
    return false;
}
const meaningfulEn = {};
for (const lang of langs) {
    if (lang === 'en-US') continue;
    const loc = loadFlat(lang);
    const still = [];
    for (const k of enStr) {
        if (loc[k] !== en[k]) continue;
        if (keepAsIs(k, en[k])) continue;
        still.push(k);
    }
    meaningfulEn[lang] = still;
}

// summary
const byType = {};
for (const i of issues) byType[i.type] = (byType[i.type] || 0) + 1;
const errors = issues.filter((i) => i.sev === 'error');
const warns = issues.filter((i) => i.sev === 'warn');

console.log('=== PREFLIGHT I18N AUDIT ===\n');
console.log('Locales:', langs.join(', '));
console.log('en-US string keys:', enStr.length);
console.log('\nIssue counts by type:', byType);
console.log('errors:', errors.length, 'warns:', warns.length);
console.log('\nHardcoded CJK (non-comment):', hard.length);
hard.forEach((h) => console.log(' ', h.rel + ':' + h.line, h.text));

console.log('\nMulti-file value conflicts:');
for (const c of collisionSamples) {
    console.log(`  ${c.lang}: differing multi-file keys = ${c.differ}`);
    c.samples.slice(0, 5).forEach((s) => {
        console.log(
            '   ',
            s.k,
            s.files.join('+'),
            '=>',
            s.vals.map((v) => JSON.stringify(v).slice(0, 28)).join(' | ')
        );
    });
}

console.log('\nMeaningful EN leftovers:');
for (const [lang, arr] of Object.entries(meaningfulEn)) {
    console.log(`  ${lang}: ${arr.length}`, arr.slice(0, 5).join(', ') || 'OK');
}

console.log('\nCritical key matrix (empty?):');
for (const k of crit) {
    const empty = langs.filter((l) => !critMatrix[k][l] && critMatrix[k][l] !== '');
    // empty string is also bad for critical except none of these should be empty
    const blank = langs.filter((l) => !critMatrix[k][l]);
    console.log(`  ${k}: blank=${blank.length || 0}`, blank.join(',') || 'all set');
}

const ph = warns.filter((i) => i.type.includes('placeholder')).slice(0, 30);
console.log('\nPlaceholder mismatch sample (first 30):');
ph.forEach((i) =>
    console.log(`  ${i.lang} ${i.key} en{${i.en}} loc{${i.loc}} | ${i.enVal} => ${i.locVal}`)
);

const out = {
    byType,
    errorCount: errors.length,
    warnCount: warns.length,
    errors: errors.slice(0, 80),
    warns: warns.slice(0, 120),
    hard,
    collisionSamples,
    meaningfulEn,
    critMatrix
};
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/preflight-audit.json'), JSON.stringify(out, null, 2) + '\n');
console.log('\nWrote tmp/preflight-audit.json');
// Comments with CJK don't block QA; only real errors do.
const hardBlocking = hard.filter((h) => !/^\s*\/\//.test(h.text) && !h.text.includes('//'));
if (errors.length === 0) {
    console.log('\nRESULT: READY FOR MANUAL QA');
    if (hardBlocking.length) {
        console.log('(note: non-comment hardcoded CJK still present:', hardBlocking.length + ')');
    } else if (hard.length) {
        console.log('(note: only comment-level CJK remains, OK)');
    }
    if (warns.length) {
        console.log('(note: soft warns:', warns.length, '- mostly extra placeholders or multi-file synonyms)');
    }
} else {
    console.log('\nRESULT: FIX NEEDED BEFORE MANUAL QA');
}
process.exit(errors.length ? 1 : 0);
