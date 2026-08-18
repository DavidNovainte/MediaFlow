/**
 * Scan src/ and services/ for user-facing Chinese string literals.
 * node scripts/scan-hardcoded-cjk.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function walk(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['node_modules', 'locales', 'dist', 'tmp', 'logs'].includes(e.name)) continue;
            walk(p, acc);
        } else if (/\.(js|html)$/.test(e.name)) {
            acc.push(p);
        }
    }
    return acc;
}

const cjk = /[\u4e00-\u9fff]/;
const findings = [];
const patterns = [
    { name: 'showToast', re: /showToast\s*\(/ },
    { name: 'Error', re: /new Error\s*\(/ },
    { name: 'textContent', re: /\.textContent\s*=/ },
    { name: 'innerHTML', re: /\.innerHTML\s*=/ },
    { name: 'i18nFallback', re: /i18n\?\.t\([^)]*\)\s*\|\|/ },
    { name: 'tFallback', re: /\.t\([^)]*\)\s*\|\|\s*[`'"]/ },
    { name: 'alert', re: /\balert\s*\(/ }
];

for (const abs of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'services'))]) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const lines = fs.readFileSync(abs, 'utf8').split(/\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!cjk.test(line)) continue;
        if (!/[`'"][^`'"]*[\u4e00-\u9fff]/.test(line)) continue;
        for (const { name, re } of patterns) {
            if (re.test(line)) {
                findings.push({
                    file: rel,
                    line: i + 1,
                    kind: name,
                    text: line.trim().slice(0, 200)
                });
                break;
            }
        }
    }
}

const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
console.log('counts', by, 'total', findings.length);
for (const f of findings) {
    console.log(`${f.kind}\t${f.file}:${f.line}\t${f.text}`);
}
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/hardcoded-cjk.json'), JSON.stringify(findings, null, 2) + '\n');
console.log('wrote tmp/hardcoded-cjk.json');
