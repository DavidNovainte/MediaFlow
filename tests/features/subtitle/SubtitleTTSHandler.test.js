/** @jest-environment jsdom */

describe('SubtitleTTSHandler voice loading', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <select id="tts-engine"><option value="edge" selected>edge</option></select>
            <div id="tts-openai-key-row"></div>
            <div id="tts-eleven-key-row"></div>
            <select id="tts-voice"></select>
            <select id="tts-lang-filter"></select>
            <button id="btn-preview-voice"></button>
            <input id="tts-rate" value="100" />
            <span id="tts-rate-value"></span>
            <input id="tts-pitch" value="0" />
            <span id="tts-pitch-value"></span>
            <input id="voice-volume" value="80" />
            <span id="voice-volume-value"></span>
            <input id="bgm-volume" value="30" />
            <span id="bgm-volume-value"></span>
            <input id="enable-tts" type="checkbox" checked />
            <div id="tts-settings"></div>
        `;

        window.i18n = {
            currentLang: 'en-US',
            t: jest.fn((key) => key)
        };

        window.app = {
            showToast: jest.fn()
        };

        window.mediaflow = {
            tts: {
                getVoices: jest.fn().mockResolvedValue([]),
                generateFullAudio: jest.fn().mockResolvedValue({ path: 'out.mp3', words: [] }),
                onProgress: jest.fn(() => () => {})
            }
        };

        window.TTSConfig = {
            voiceFeaturedOrder: ['zh-CN-XiaoxiaoNeural'],
            languageNames: {
                all: 'All',
                zh: 'Chinese',
                ar: 'Arabic'
            },
            friendlyNames: {
                'zh-CN-XiaoxiaoNeural': 'Xiaoxiao',
                'ar-SA-ZariyahNeural': 'Zariyah'
            }
        };
    });

    afterEach(() => {
        jest.resetModules();
        delete window.SubtitleUtils;
        delete window.SubtitleTTSHandler;
        delete window.TTSConfig;
        delete window.mediaflow;
        delete window.i18n;
        delete window.app;
    });

    test('merges configured Edge voices when backend voice list is empty', async () => {
        require('../../../src/features/subtitle/SubtitleTTSHandler.js');

        const handler = new window.SubtitleTTSHandler({});
        handler.init({
            ttsEngine: document.getElementById('tts-engine'),
            ttsVoice: document.getElementById('tts-voice'),
            ttsRate: document.getElementById('tts-rate'),
            ttsPitch: document.getElementById('tts-pitch'),
            voiceVolume: document.getElementById('voice-volume'),
            bgmVolume: document.getElementById('bgm-volume'),
            btnPreviewVoice: document.getElementById('btn-preview-voice')
        });

        await handler.loadVoices();

        expect(handler.allVoices.map(v => v.Name)).toEqual(expect.arrayContaining([
            'zh-CN-XiaoxiaoNeural',
            'ar-SA-ZariyahNeural'
        ]));

        expect(Array.from(document.getElementById('tts-lang-filter').options).map(opt => opt.value)).toEqual(
            expect.arrayContaining(['all', 'zh', 'ar'])
        );

        const labels = Array.from(document.getElementById('tts-lang-filter').options).map(opt => opt.textContent);
        expect(labels).toEqual(expect.arrayContaining(['Chinese', 'Arabic']));
        expect(labels.some(label => label.includes('subtitle.tts.languages'))).toBe(false);

        const voiceLabels = Array.from(document.getElementById('tts-voice').options).map(opt => opt.textContent);
        expect(voiceLabels.some(label => label.includes('subtitle.tts.voices'))).toBe(false);
        expect(voiceLabels.some(label => label.includes('Arabic'))).toBe(true);
    });

    test('uses generated readable labels for non-curated locales', async () => {
        window.i18n.currentLang = 'fr-FR';
        window.i18n.t = jest.fn((key) => {
            if (key === 'subtitle.tts.languages.ar') return 'Arabe';
            if (key === 'subtitle.tts.languages.zh') return 'Chinois';
            if (key === 'subtitle.tts.voices.ar-SA-ZariyahNeural') return 'Zariyah (中文残留)';
            return key;
        });

        require('../../../src/features/subtitle/SubtitleTTSHandler.js');

        const handler = new window.SubtitleTTSHandler({});
        handler.init({
            ttsEngine: document.getElementById('tts-engine'),
            ttsVoice: document.getElementById('tts-voice'),
            ttsRate: document.getElementById('tts-rate'),
            ttsPitch: document.getElementById('tts-pitch'),
            voiceVolume: document.getElementById('voice-volume'),
            bgmVolume: document.getElementById('bgm-volume'),
            btnPreviewVoice: document.getElementById('btn-preview-voice')
        });

        await handler.loadVoices();

        const voiceLabels = Array.from(document.getElementById('tts-voice').options).map(opt => opt.textContent);
        expect(voiceLabels.some(label => label.includes('中文残留'))).toBe(false);
        expect(voiceLabels.some(label => label.includes('Arabic') || label.includes('arab'))).toBe(true);
    });

    test('forwards adapted dubbing text and target duration to batch generation', async () => {
        require('../../../src/features/subtitle/SubtitleUtils.js');
        require('../../../src/features/subtitle/SubtitleTTSHandler.js');

        const flow = {
            updateProgress: jest.fn(),
            dubAdapter: {
                prepareSubtitlesForTts: jest.fn().mockResolvedValue([{
                    id: 1,
                    start: 0,
                    end: 1.5,
                    ttsSource: 'translated',
                    translatedText: 'Original translated line',
                    dubText: 'Shortened dub line',
                    text: 'Shortened dub line',
                    targetDuration: 1.6,
                    maxRatePercent: 28,
                    dubStatus: 'compressed',
                    dubTiming: { availableDuration: 1.6 }
                }])
            }
        };

        const handler = new window.SubtitleTTSHandler(flow);
        handler.init({
            ttsEngine: document.getElementById('tts-engine'),
            ttsVoice: document.getElementById('tts-voice'),
            ttsRate: document.getElementById('tts-rate'),
            ttsPitch: document.getElementById('tts-pitch'),
            voiceVolume: document.getElementById('voice-volume'),
            bgmVolume: document.getElementById('bgm-volume'),
            btnPreviewVoice: document.getElementById('btn-preview-voice')
        });

        const subtitles = [{
            id: 1,
            start: 0,
            end: 1.5,
            ttsSource: 'translated',
            translatedText: 'Original translated line'
        }];

        await handler.generateBatch(subtitles);

        expect(window.mediaflow.tts.generateFullAudio).toHaveBeenCalledWith(expect.objectContaining({
            subtitles: [expect.objectContaining({
                text: 'Shortened dub line',
                targetDuration: 1.6,
                maxRatePercent: 28
            })]
        }));
        expect(subtitles[0].dubText).toBe('Shortened dub line');
        expect(subtitles[0].targetDuration).toBe(1.6);
        expect(subtitles[0].dubCaptionText).toBe('Shortened dub line');
        expect(subtitles[0].dubCaptionReady).toBe(true);
    });

    test('uses translated speech for legacy subtitles that were never manually switched', async () => {
        require('../../../src/features/subtitle/SubtitleUtils.js');
        require('../../../src/features/subtitle/SubtitleTTSHandler.js');

        const flow = {
            updateProgress: jest.fn(),
            dubAdapter: {
                prepareSubtitlesForTts: jest.fn((subtitles) => Promise.resolve(subtitles.map((subtitle) => ({ ...subtitle }))))
            }
        };

        const handler = new window.SubtitleTTSHandler(flow);
        handler.init({
            ttsEngine: document.getElementById('tts-engine'),
            ttsVoice: document.getElementById('tts-voice'),
            ttsRate: document.getElementById('tts-rate'),
            ttsPitch: document.getElementById('tts-pitch'),
            voiceVolume: document.getElementById('voice-volume'),
            bgmVolume: document.getElementById('bgm-volume'),
            btnPreviewVoice: document.getElementById('btn-preview-voice')
        });

        await handler.generateBatch([{
            id: 1,
            start: 0,
            end: 1.5,
            ttsSource: 'original',
            translatedText: 'English line',
            originalText: '中文原文'
        }]);

        expect(window.mediaflow.tts.generateFullAudio).toHaveBeenCalledWith(expect.objectContaining({
            subtitles: [expect.objectContaining({
                text: 'English line'
            })]
        }));
    });
});
