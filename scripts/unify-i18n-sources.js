/**
 * Remove multi-file i18n duplicates so each key has one owner.
 * Canonical:
 *   modal.*     → modal.json
 *   queue.*     → download.json
 *   download.*  → download.json (not patches)
 *   mobile.*    → mobile.json (not patches)
 *   settings.*  → settings.json (not patches)
 *   update.*    → common.json (not patches)
 *
 * node scripts/unify-i18n-sources.js
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const localesDir = path.join(root, 'src/locales');

function read(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
function write(p, data) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function deletePath(obj, dotted) {
    const parts = dotted.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!cur || typeof cur !== 'object') return false;
        cur = cur[parts[i]];
    }
    if (!cur || typeof cur !== 'object') return false;
    const last = parts[parts.length - 1];
    if (!(last in cur)) return false;
    delete cur[last];
    return true;
}

function hasPath(obj, dotted) {
    const parts = dotted.split('.');
    let cur = obj;
    for (const p of parts) {
        if (!cur || typeof cur !== 'object' || !(p in cur)) return false;
        cur = cur[p];
    }
    return true;
}

let total = 0;
for (const lang of fs.readdirSync(localesDir).filter((n) =>
    fs.statSync(path.join(localesDir, n)).isDirectory()
)) {
    const dir = path.join(localesDir, lang);
    let removed = 0;

    const commonPath = path.join(dir, 'common.json');
    const downloadPath = path.join(dir, 'download.json');
    const modalPath = path.join(dir, 'modal.json');
    const patchesPath = path.join(dir, 'patches.json');
    const mobilePath = path.join(dir, 'mobile.json');
    const settingsPath = path.join(dir, 'settings.json');

    if (fs.existsSync(commonPath) && fs.existsSync(modalPath)) {
        const common = read(commonPath);
        if (common.modal) {
            // Prefer modal.json; drop nested modal from common
            delete common.modal;
            write(commonPath, common);
            removed += 1;
        }
    }

    if (fs.existsSync(commonPath) && fs.existsSync(downloadPath)) {
        const common = read(commonPath);
        const download = read(downloadPath);
        if (common.queue && download.queue) {
            delete common.queue;
            write(commonPath, common);
            removed += 1;
        }
    }

    if (fs.existsSync(patchesPath)) {
        const patches = read(patchesPath);
        let dirty = false;

        if (fs.existsSync(downloadPath) && patches.download) {
            const download = read(downloadPath);
            for (const k of Object.keys(patches.download)) {
                if (hasPath(download, `download.${k}`)) {
                    delete patches.download[k];
                    dirty = true;
                    removed += 1;
                }
            }
            if (patches.download && Object.keys(patches.download).length === 0) {
                delete patches.download;
            }
        }

        if (fs.existsSync(mobilePath) && patches.mobile) {
            const mobile = read(mobilePath);
            for (const k of Object.keys(patches.mobile)) {
                if (hasPath(mobile, `mobile.${k}`)) {
                    delete patches.mobile[k];
                    dirty = true;
                    removed += 1;
                }
            }
            if (patches.mobile && Object.keys(patches.mobile).length === 0) {
                delete patches.mobile;
            }
        }

        if (fs.existsSync(settingsPath) && patches.settings) {
            const settings = read(settingsPath);
            for (const k of Object.keys(patches.settings)) {
                if (hasPath(settings, `settings.${k}`)) {
                    delete patches.settings[k];
                    dirty = true;
                    removed += 1;
                }
            }
            if (patches.settings && Object.keys(patches.settings).length === 0) {
                delete patches.settings;
            }
        }

        if (fs.existsSync(commonPath) && patches.update) {
            const common = read(commonPath);
            if (common.update) {
                for (const k of Object.keys(patches.update)) {
                    if (k in common.update) {
                        delete patches.update[k];
                        dirty = true;
                        removed += 1;
                    }
                }
                if (Object.keys(patches.update).length === 0) delete patches.update;
            }
        }

        if (patches.queue && fs.existsSync(downloadPath)) {
            const download = read(downloadPath);
            if (download.queue) {
                delete patches.queue;
                dirty = true;
                removed += 1;
            }
        }

        if (dirty) write(patchesPath, patches);
    }

    if (removed) {
        console.log(`[${lang}] removed ${removed} duplicate namespace(s)/key(s)`);
        total += removed;
    }
}

console.log(`Done. Total removals: ${total}`);
