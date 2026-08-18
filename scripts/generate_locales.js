const fs = require('fs');
const path = require('path');

// Read the locales.js file content manually since it's an ES module-ish format or global var
// We'll just read the file and eval/parse it to get the object.
const localesPath = path.join(__dirname, '../extension/locales.js');
const raw = fs.readFileSync(localesPath, 'utf8');

// Extract the object part
// file content is: const MF_LOCALES = { ... }; window.MF_LOCALES = MF_LOCALES;
const start = raw.indexOf('{');
const end = raw.lastIndexOf('};') + 1;
const jsonString = raw.substring(start, end);

// Safe eval or JSON parse? It's JS object notation (keys might not be quoted? check write_to_file output).
// In my previous step, I used standard JSON format for keys except it was a JS object.
// Keys were quoted "en": { "extName": ... }
// So it should be parsable as JSON if I remove trailing commas (if any).
// Actually, let's just use eval since we trust our own file.
const MF_LOCALES = eval('(' + jsonString + ')');

const extDir = path.join(__dirname, '../extension/_locales');

if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir);
}

Object.keys(MF_LOCALES).forEach(lang => {
    // Message structure for chrome i18n:
    // { "key": { "message": "value" }, ... }
    const localeObj = MF_LOCALES[lang];
    const chromeMessages = {};

    Object.keys(localeObj).forEach(key => {
        let msg = localeObj[key];
        // Chrome i18n placeholders format: $1 -> $1
        // But we need to define placeholders if we use $N.
        // My previous fix did manual definition.
        // For automation, if it contains $1, we add placeholders.

        const entry = {
            message: msg
        };

        if (msg.includes('$1')) {
            entry.placeholders = {
                "1": { "content": "$1" } // Chrome actually expects named placeholders often, but positionals work if defined.
                // Actually, Chrome requires placeholders to be defined to use $var$.
                // But wait, $1 is only for substitute within JS? 
                // Chrome messages.json uses $PLACEHOLDER$ format usually?
                // Actually, Chrome i18n uses $PLACEHOLDER$. $1 is used in the "content" of the placeholder.
                // ex: "message": "Found $COUNT$ videos", "placeholders": { "count": { "content": "$1" } }

                // My locales.js implementation uses $1 directly in the string for MY custom getText.
                // But for pure Chrome i18n (if used natively), we need strict format.
                // However, the only keys that MATTER for Manifest/Chrome UI are extName, extDesc.
                // The rest are used by my getText().
                // So for extName/extDesc, they don't have variables.
                // For the others, if I just dump them, Chrome might warn but it works or I don't care because I use getText.
                // BUT, to look professional, I should format them right?
                // Actually, I am replacing all in-app usage with getText.
                // The only consumer of _locales is:
                // 1. Manifest (name, desc)
                // 2. CSS (__MSG_@@ui_locale__) - not used
                // 3. chrome.i18n.getMessage called by OTHER extensions? No.

                // So, primarily Name and Description.
                // I will just dump the rest as is. Chrome ignores unused placeholders or allows $ chars if no placeholders defined?
                // Just to be safe, I will escape $ if not intended? No.
                // Let's just write them. Chrome is lenient if you don't call getMessage on them.
            };
            if (msg.includes('$2')) {
                entry.placeholders["2"] = { "content": "$2" };
            }
        }

        // Fix placeholders keys to be case insensitive names? 
        // Actually, for my custom getText, I use $1. 
        // For Chrome, I'll just leave it.
        chromeMessages[key] = entry;
    });

    const targetDir = path.join(extDir, lang);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir);
    }

    fs.writeFileSync(path.join(targetDir, 'messages.json'), JSON.stringify(chromeMessages, null, 4));
    console.log(`Generated ${lang}`);
});
