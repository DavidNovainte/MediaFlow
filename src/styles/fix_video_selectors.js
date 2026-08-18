const fs = require('fs');
let content = fs.readFileSync('f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/video.css', 'utf8');

// Regex: Find #page-subtitle followed by any characters that are NOT a comma or brace, ending with a comma or brace.
content = content.replace(/#page-subtitle([^{,]*)([,{}])/g, function (match, inner, endChar) {
    if (endChar === '{') {
        return `#page-subtitle${inner}, #page-creator${inner} {`;
    } else if (endChar === ',') {
        return `#page-subtitle${inner}, #page-creator${inner},`;
    }
    return match;
});

fs.writeFileSync('f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/video.css', content);
console.log('Successfully duplicated all video.css selectors for #page-creator.');
