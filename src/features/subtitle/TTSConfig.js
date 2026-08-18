/**
 * TTS Configuration & Friendly Names
 *
 * Defines the mapping for recommended voices and friendly display names.
 * Used by SubtitleTTSHandler.js
 * Classic script (not ES module) so FeatureLoader can lazy-load it.
 */
const TTSConfig = {
    // Friendly Names Map (Locale + Name -> Display Name)
    friendlyNames: {
        // --- Chinese (中文) ---
        'zh-CN-XiaoxiaoNeural': '✨ 🇨🇳 晓晓 (最为自然-活泼)',
        'zh-CN-YunxiNeural': '✨ 🇨🇳 云希 (最为自然-沉稳)',
        'zh-CN-XiaoyiNeural': '✨ 🇨🇳 晓伊 (知性悦耳)',
        'zh-CN-YunxiaNeural': '✨ 🇨🇳 云夏 (少年感)',
        'zh-CN-YunjianNeural': '🇨🇳 云健 (体育解说)',
        'zh-CN-YunyangNeural': '🇨🇳 云扬 (新闻播报)',
        'zh-CN-XiaobeiNeural': '🇨🇳 晓贝 (辽宁口音)',
        'zh-CN-XiaoniNeural': '🇨🇳 晓妮 (陕西口音)',
        'zh-TW-YunJheNeural': '🇹🇼 云哲 (台湾温柔/情感)',
        'zh-TW-HsiaoYuNeural': '🇹🇼 晓雨 (台湾女声)',
        'zh-HK-HiuGaaiNeural': '🇭🇰 晓佳 (粤语女声)',
        'zh-HK-HiuMaanNeural': '🇭🇰 晓曼 (粤语女声)',
        'zh-HK-WanLungNeural': '🇭🇰 云龙 (粤语男声)',
        'zh-CN-liaoning-XiaobeiNeural': '🇨🇳 晓贝 (辽宁方言)',
        'zh-CN-shaanxi-XiaoniNeural': '🇨🇳 晓妮 (陕西方言)',

        // --- English (英语) ---
        // US
        'en-US-GuyNeural': '✨ 🇺🇸 Guy (经典自然男声)',
        'en-US-JennyNeural': '✨ 🇺🇸 Jenny (经典自然女声)',
        'en-US-ChristopherNeural': '✨ 🇺🇸 Christopher (超真实-活泼)',
        'en-US-EricNeural': '✨ 🇺🇸 Eric (超真实-活力)',
        'en-US-SteffanNeural': '✨ 🇺🇸 Steffan (热情洋溢)',
        'en-US-AndrewNeural': '✨ 🇺🇸 Andrew (旁白大师)',
        'en-US-AndrewMultilingualNeural': '✨ 🇺🇸 Andrew (多语言)',
        'en-US-AvaNeural': '✨ 🇺🇸 Ava (治愈系)',
        'en-US-AvaMultilingualNeural': '✨ 🇺🇸 Ava (多语言)',
        'en-US-BrianNeural': '✨ 🇺🇸 Brian (专业青年)',
        'en-US-BrianMultilingualNeural': '✨ 🇺🇸 Brian (多语言)',
        'en-US-AriaNeural': '🇺🇸 Aria (朋友感)',
        'en-US-DavisNeural': '🇺🇸 Davis (专业叙述)',
        'en-US-JaneNeural': '🇺🇸 Jane (明亮女声)',
        'en-US-JasonNeural': '🇺🇸 Jason (年轻活力)',
        'en-US-SaraNeural': '🇺🇸 Sara (多面手)',
        'en-US-TonyNeural': '🇺🇸 Tony (戏剧感)',
        'en-US-NancyNeural': '🇺🇸 Nancy (表现力强)',
        'en-US-MichelleNeural': '🇺🇸 Michelle (甜美)',

        'en-US-EmmaNeural': '🇺🇸 Emma (新闻播报)',
        'en-US-EmmaMultilingualNeural': '🇺🇸 Emma (多语言)',
        'en-US-AnaNeural': '🇺🇸 Ana (可爱的)',
        'en-US-RogerNeural': '🇺🇸 Roger (生动)',
        // UK
        'en-GB-RyanNeural': '✨ 🇬🇧 Ryan (英式标准)',
        'en-GB-SoniaNeural': '✨ 🇬🇧 Sonia (英式知性)',
        'en-GB-AlfieNeural': '🇬🇧 Alfie (年轻英式)',
        'en-GB-ThomasNeural': '🇬🇧 Thomas (成熟英式)',
        'en-GB-MaisieNeural': '🇬🇧 Maisie (活泼英式)',
        'en-GB-LibbyNeural': '🇬🇧 Libby (中性英式)',
        // Other English
        'en-AU-NatashaNeural': '🇦🇺 Natasha (澳洲女声)',
        'en-AU-WilliamMultilingualNeural': '🇦🇺 William (澳洲男声)',
        'en-CA-ClaraNeural': '🇨🇦 Clara (加拿大女声)',
        'en-CA-LiamNeural': '🇨🇦 Liam (加拿大男声)',
        'en-HK-SamNeural': '🇭🇰 Sam (香港男声)',
        'en-HK-YanNeural': '🇭🇰 Yan (香港女声)',
        'en-IE-ConnorNeural': '🇮🇪 Connor (爱尔兰男声)',
        'en-IE-EmilyNeural': '🇮🇪 Emily (爱尔兰女声)',
        'en-IN-NeerjaNeural': '🇮🇳 Neerja (印度女声)',
        'en-IN-PrabhatNeural': '🇮🇳 Prabhat (印度男声)',
        'en-NZ-MitchellNeural': '🇳🇿 Mitchell (新西兰男声)',
        'en-NZ-MollyNeural': '🇳🇿 Molly (新西兰女声)',
        'en-SG-LunaNeural': '🇸🇬 Luna (新加坡女声)',
        'en-SG-WayneNeural': '🇸🇬 Wayne (新加坡男声)',
        'en-PH-JamesNeural': '🇵🇭 James (菲律宾男声)',
        'en-PH-RosaNeural': '🇵🇭 Rosa (菲律宾女声)',
        'en-ZA-LeahNeural': '🇿🇦 Leah (南非女声)',
        'en-ZA-LukeNeural': '🇿🇦 Luke (南非男声)',

        // --- Japanese (日语) ---
        'ja-JP-NanamiNeural': '✨ 🇯🇵 七海 (甜美自然)',
        'ja-JP-KeitaNeural': '✨ 🇯🇵 圭太 (活力男声)',

        // --- Korean (韩语) ---
        'ko-KR-SunHiNeural': '✨ 🇰🇷 善熙 (清晰女声)',
        'ko-KR-InJoonNeural': '✨ 🇰🇷 仁俊 (沉稳男声)',
        'ko-KR-HyunsuMultilingualNeural': '🇰🇷 Hyunsu (多语言)',

        // --- French (法语) ---
        'fr-FR-DeniseNeural': '✨ 🇫🇷 Denise (法国女声)',
        'fr-FR-HenriNeural': '✨ 🇫🇷 Henri (法国男声)',
        'fr-FR-EloiseNeural': '🇫🇷 Eloise (法国女声)',
        'fr-FR-RemyMultilingualNeural': '🇫🇷 Remy (多语言)',
        'fr-FR-VivienneMultilingualNeural': '🇫🇷 Vivienne (多语言)',
        'fr-CA-AntoineNeural': '🇨🇦 Antoine (加拿大法语)',
        'fr-CA-JeanNeural': '🇨🇦 Jean (加拿大法语)',
        'fr-CA-SylvieNeural': '🇨🇦 Sylvie (加拿大法语)',
        'fr-CH-ArianeNeural': '🇨🇭 Ariane (瑞士法语)',
        'fr-CH-FabriceNeural': '🇨🇭 Fabrice (瑞士法语)',
        'fr-BE-CharlineNeural': '🇧🇪 Charline (比利时法语)',
        'fr-BE-GerardNeural': '🇧🇪 Gerard (比利时法语)',

        // --- German (德语) ---
        'de-DE-KatjaNeural': '✨ 🇩🇪 Katja (德国女声)',
        'de-DE-ConradNeural': '✨ 🇩🇪 Conrad (德国男声)',
        'de-DE-AmalaNeural': '🇩🇪 Amala (德国女声)',
        'de-DE-KillianNeural': '🇩🇪 Killian (德国男声)',
        'de-DE-FlorianMultilingualNeural': '🇩🇪 Florian (多语言)',
        'de-DE-SeraphinaMultilingualNeural': '🇩🇪 Seraphina (多语言)',
        'de-AT-IngridNeural': '🇦🇹 Ingrid (奥地利德语)',
        'de-AT-JonasNeural': '🇦🇹 Jonas (奥地利德语)',
        'de-CH-JanNeural': '🇨🇭 Jan (瑞士德语)',
        'de-CH-LeniNeural': '🇨🇭 Leni (瑞士德语)',

        // --- Spanish (西班牙语) ---
        'es-ES-ElviraNeural': '✨ 🇪🇸 Elvira (西班牙女声)',
        'es-ES-AlvaroNeural': '✨ 🇪🇸 Alvaro (西班牙男声)',
        'es-MX-DaliaNeural': '🇲🇽 Dalia (墨西哥女声)',
        'es-MX-JorgeNeural': '🇲🇽 Jorge (墨西哥男声)',
        'es-US-AlonsoNeural': '🇺🇸 Alonso (美国西语)',
        'es-US-PalomaNeural': '🇺🇸 Paloma (美国西语)',
        'es-AR-ElenaNeural': '🇦🇷 Elena (阿根廷)',
        'es-CO-SalomeNeural': '🇨🇴 Salome (哥伦比亚)',

        // --- Russian (俄语) ---
        'ru-RU-SvetlanaNeural': '✨ 🇷🇺 Svetlana (俄罗斯女声)',
        'ru-RU-DmitryNeural': '✨ 🇷🇺 Dmitry (俄罗斯男声)',

        // --- Portuguese (葡萄牙语) ---
        'pt-BR-FranciscaNeural': '✨ 🇧🇷 Francisca (巴西女声)',
        'pt-BR-AntonioNeural': '✨ 🇧🇷 Antonio (巴西男声)',
        'pt-PT-RaquelNeural': '🇵🇹 Raquel (葡萄牙女声)',
        'pt-PT-DuarteNeural': '🇵🇹 Duarte (葡萄牙男声)',

        // --- Italian (意大利语) ---
        'it-IT-IsabellaNeural': '✨ 🇮🇹 Isabella (意大利女声)',
        'it-IT-DiegoNeural': '✨ 🇮🇹 Diego (意大利男声)',
        'it-IT-ElsaNeural': '🇮🇹 Elsa (意大利女声)',

        // --- Arabic (阿拉伯语) ---
        'ar-SA-ZariyahNeural': '🇸🇦 Zariyah (沙特女声)',
        'ar-SA-HamedNeural': '🇸🇦 Hamed (沙特男声)',
        'ar-AE-FatimaNeural': '🇦🇪 Fatima (阿联酋)',
        'ar-EG-SalmaNeural': '🇪🇬 Salma (埃及)',

        // --- Hindi (印地语) ---
        'hi-IN-SwaraNeural': '🇮🇳 Swara (印地女声)',
        'hi-IN-MadhurNeural': '🇮🇳 Madhur (印地男声)',

        // --- Thai (泰语) ---
        'th-TH-PremwadeeNeural': '🇹🇭 Premwadee (泰语女声)',
        'th-TH-NiwatNeural': '🇹🇭 Niwat (泰语男声)',

        // --- Vietnamese (越南语) ---
        'vi-VN-HoaiMyNeural': '🇻🇳 HoaiMy (越南女声)',
        'vi-VN-NamMinhNeural': '🇻🇳 NamMinh (越南男声)',

        // --- Indonesian (印尼语) ---
        'id-ID-GadisNeural': '🇮🇩 Gadis (印尼女声)',
        'id-ID-ArdiNeural': '🇮🇩 Ardi (印尼男声)',

        // --- Other Languages (Sample) ---
        'af-ZA-AdriNeural': '🇿🇦 Adri (南非荷兰语)',
        'bg-BG-KalinaNeural': '🇧🇬 Kalina (保加利亚语)',
        'cs-CZ-VlastaNeural': '🇨🇿 Vlasta (捷克语)',
        'da-DK-ChristelNeural': '🇩🇰 Christel (丹麦语)',
        'el-GR-AthinaNeural': '🇬🇷 Athina (希腊语)',
        'fi-FI-NooraNeural': '🇫🇮 Noora (芬兰语)',
        'he-IL-HilaNeural': '🇮🇱 Hila (希伯来语)',
        'hr-HR-GabrijelaNeural': '🇭🇷 Gabrijela (克罗地亚语)',
        'hu-HU-NoemiNeural': '🇭🇺 Noemi (匈牙利语)',
        'ms-MY-YasminNeural': '🇲🇾 Yasmin (马来语)',
        'nb-NO-PernilleNeural': '🇳🇴 Pernille (挪威语)',
        'nl-NL-FennaNeural': '🇳🇱 Fenna (荷兰语)',
        'pl-PL-ZofiaNeural': '🇵🇱 Zofia (波兰语)',
        'ro-RO-AlinaNeural': '🇷🇴 Alina (罗马尼亚语)',
        'sk-SK-ViktoriaNeural': '🇸🇰 Viktoria (斯洛伐克语)',
        'sv-SE-SofieNeural': '🇸🇪 Sofie (瑞典语)',
        'tr-TR-EmelNeural': '🇹🇷 Emel (土耳其语)',
        'uk-UA-PolinaNeural': '🇺🇦 Polina (乌克兰语)'
    },

    // Names of languages for display in filter
    languageNames: {
        'all': '✨ 全部语言 (All Languages)',
        'zh': '🇨🇳 中文 (Chinese)',
        'en': '🇺🇸 英语 (English)',
        'ja': '🇯🇵 日语 (Japanese)',
        'ko': '🇰🇷 韩语 (Korean)',
        'fr': '🇫🇷 法语 (French)',
        'de': '🇩🇪 德语 (German)',
        'es': '🇪🇸 西班牙语 (Spanish)',
        'ru': '🇷🇺 俄语 (Russian)',
        'pt': '🇵🇹 葡萄牙语 (Portuguese)',
        'it': '🇮🇹 意大利语 (Italian)',
        'id': '🇮🇩 印尼语 (Indonesian)',
        'vi': '🇻🇳 越南语 (Vietnamese)',
        'th': '🇹🇭 泰语 (Thai)',
        'ms': '🇲🇾 马来语 (Malay)',
        'hi': '🇮🇳 印地语 (Hindi)',
        'ar': '🇸🇦 阿拉伯语 (Arabic)',
        'tr': '🇹🇷 土耳其语 (Turkish)',
        'nl': '🇳🇱 荷兰语 (Dutch)',
        'pl': '🇵🇱 波兰语 (Polish)',
        'sv': '🇸🇪 瑞典语 (Swedish)',
        'da': '🇩🇰 丹麦语 (Danish)',
        'no': '🇳🇴 挪威语 (Norwegian)',
        'nb': '🇳🇴 挪威语 (Norwegian)',
        'fi': '🇫🇮 芬兰语 (Finnish)',
        'cs': '🇨🇿 捷克语 (Czech)',
        'ro': '🇷🇴 罗马尼亚语 (Romanian)',
        'bg': '🇧🇬 保加利亚语 (Bulgarian)',
        'el': '🇬🇷 希腊语 (Greek)',
        'he': '🇮🇱 希伯来语 (Hebrew)',
        'hu': '🇭🇺 匈牙利语 (Hungarian)',
        'uk': '🇺🇦 乌克兰语 (Ukrainian)',
        'sk': '🇸🇰 斯洛伐克语 (Slovak)',
        'hr': '🇭🇷 克罗地亚语 (Croatian)',
        'af': '🇿🇦 南非荷兰语 (Afrikaans)'
    },
    // Priority order for voices (featured at the top)
    voiceFeaturedOrder: [
        'zh-CN-XiaoxiaoNeural',
        'zh-CN-YunxiNeural',
        'zh-CN-XiaoyiNeural',
        'zh-CN-YunxiaNeural',
        'zh-TW-YunJheNeural',
        'ja-JP-NanamiNeural',
        'ja-JP-KeitaNeural',
        'ko-KR-SunHiNeural',
        'ko-KR-InJoonNeural',
        'en-US-GuyNeural',
        'en-US-JennyNeural',
        'en-US-ChristopherNeural',
        'en-US-EricNeural',
        'en-US-AndrewNeural',
        'en-US-AvaNeural',
        'en-GB-RyanNeural',
        'en-GB-SoniaNeural',
        'fr-FR-DeniseNeural',
        'fr-FR-HenriNeural',
        'de-DE-KatjaNeural',
        'de-DE-ConradNeural',
        'es-ES-ElviraNeural',
        'es-ES-AlvaroNeural',
        'ru-RU-SvetlanaNeural',
        'ru-RU-DmitryNeural',
        'pt-BR-FranciscaNeural',
        'pt-BR-AntonioNeural',
        'it-IT-IsabellaNeural',
        'it-IT-DiegoNeural'
    ]
};

if (typeof window !== 'undefined') {
    window.TTSConfig = TTSConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TTSConfig;
}
