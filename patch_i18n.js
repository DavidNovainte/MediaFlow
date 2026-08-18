const fs = require('fs');
const path = require('path');
const localesDirs = ['zh-CN', 'zh-TW', 'en-US', 'fr-FR', 'es-ES', 'de-DE', 'pt-PT', 'ja-JP', 'ko-KR', 'ru-RU'];
const translations = {
    "zh-CN": "分离音频",
    "zh-TW": "分離音訊",
    "en-US": "Separate Audio",
    "fr-FR": "Séparer l'audio",
    "es-ES": "Separar audio",
    "de-DE": "Audio trennen",
    "pt-PT": "Separar áudio",
    "ja-JP": "音声を分離",
    "ko-KR": "오디오 분리",
    "ru-RU": "Извлечь аудио"
};

localesDirs.forEach(dir => {
    const filePath = path.join('src', 'locales', dir, 'creator.json');
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const regex = /("menuRelink"\s*:\s*"[^"]+",)/;
        if (regex.test(content) && !content.includes('menuSeparateAudio')) {
            content = content.replace(regex, `$1\n            "menuSeparateAudio": "${translations[dir]}",`);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated ' + dir);
        } else {
            console.log('Failed or already exists for ' + dir);
        }
    } else {
        console.log('File not found: ' + filePath);
    }
});
