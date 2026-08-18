const ASSGenerator = require('../../../src/handlers/subtitle/assGenerator');

describe('ASSGenerator', () => {
    it('exports every shadow layer as a separate ASS style and dialogue', () => {
        const ass = ASSGenerator.generate([
            {
                id: 1,
                subtitles: [{ start: 0, end: 1.5, text: 'Hello world' }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    fontColor: '#ffffff',
                    strokes: [{ width: 2, color: '#000000' }],
                    shadows: [
                        { x: 2, y: 2, blur: 4, color: '#111111' },
                        { x: -2, y: 3, blur: 8, color: '#33ccff' }
                    ]
                }
            }
        ], { width: 1920, height: 1080 });

        expect(ass).toContain('Style: Style_1_shad_0');
        expect(ass).toContain('Style: Style_1_shad_1');
        expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50,Style_1_shad_0');
        expect(ass).toContain('Dialogue: 1,0:00:00.00,0:00:01.50,Style_1_shad_1');
        expect(ass).toContain('Dialogue: 2,0:00:00.00,0:00:01.50,Style_1,');
        expect(ass).toContain('\\1a&HFE&\\3a&HFE&');
    });

    it('splits background, shadow, and text into separate layers when both are enabled', () => {
        const ass = ASSGenerator.generate([
            {
                id: 7,
                subtitles: [{ start: 2, end: 4, text: 'Layered box' }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 28,
                    fontColor: '#ffffff',
                    enableBackground: true,
                    bgColor: '#000000',
                    bgOpacity: 60,
                    shadows: [{ x: 4, y: 4, blur: 10, color: 'rgba(0,0,0,0.5)' }]
                }
            }
        ], { width: 1280, height: 720 });

        expect(ass).toContain('Style: Style_7_bg');
        expect(ass).toContain('Style: Style_7_shad_0');
        expect(ass).toContain('Dialogue: 0,0:00:02.00,0:00:04.00,Style_7_bg');
        expect(ass).toContain('Dialogue: 1,0:00:02.00,0:00:04.00,Style_7_shad_0');
        expect(ass).toContain('Dialogue: 2,0:00:02.00,0:00:04.00,Style_7,');
        expect(ass).not.toContain('Style_7_bg,,0,0,0,,{\\1a&HFF&\\3a&HFF&}');
    });

    it('keeps background boxes when there is no shadow layer', () => {
        const ass = ASSGenerator.generate([
            {
                id: 9,
                subtitles: [{ start: 5, end: 6, text: 'Background only' }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 30,
                    fontColor: '#ffffff',
                    enableBackground: true,
                    bgColor: '#223344',
                    bgOpacity: 55,
                    shadows: []
                }
            }
        ], { width: 1920, height: 1080 });

        expect(ass).toContain('Style: Style_9_bg');
        expect(ass).toContain('Dialogue: 0,0:00:05.00,0:00:06.00,Style_9_bg');
        expect(ass).not.toContain('Style_9_shad_0');
    });
    it('exports highlight karaoke as timed capsule-style word events', () => {
        const ass = ASSGenerator.generate([
            {
                id: 11,
                subtitles: [{
                    start: 0,
                    end: 2,
                    text: 'Challenge the roller\ndormitory',
                    karaokeText: 'Challenge the roller\ndormitory'
                }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    fontColor: '#ffffff',
                    enableKaraoke: true,
                    karaokeStyle: 'highlight',
                    karaokeColor: '#8b5cf6',
                    strokes: [{ width: 2, color: '#000000' }]
                }
            }
        ], { width: 1280, height: 720 });

        expect(ass).toContain('Style: Style_11_kara');
        expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:02.00,Style_11,');
        expect(ass).toContain('Dialogue: 1,0:00:00.00,0:00:00.50,Style_11_kara,');
        expect(ass).toContain('{\\alpha&H00&}Challenge');
        expect(ass).toContain('{\\alpha&HFF&}the');
    });
    it('ignores coarse single-block words timing data for highlight karaoke', () => {
        const ass = ASSGenerator.generate([
            {
                id: 12,
                subtitles: [{
                    start: 0,
                    end: 2,
                    text: 'Challenge the roller dormitory',
                    karaokeText: 'Challenge the roller dormitory',
                    words: [{ text: 'Challenge the roller dormitory', start: 0, end: 2 }]
                }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    fontColor: '#ffffff',
                    enableKaraoke: true,
                    karaokeStyle: 'highlight',
                    karaokeColor: '#8b5cf6'
                }
            }
        ], { width: 1280, height: 720 });

        expect(ass).toContain('Dialogue: 1,0:00:00.00,0:00:00.50,Style_12_kara,');
        expect(ass).toContain('{\\alpha&H00&}Challenge');
        expect(ass).toContain('{\\alpha&HFF&}the');
    });
    it('keeps wrapped single English words as one highlight token during export', () => {
        const ass = ASSGenerator.generate([
            {
                id: 13,
                subtitles: [{
                    start: 0,
                    end: 2,
                    text: 'Challenge the Rolling Pin Bed and\nBreakfast',
                    karaokeText: 'Challenge the Rolling Pin Bed and\nBreakfast'
                }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    fontColor: '#ffffff',
                    enableKaraoke: true,
                    karaokeStyle: 'highlight',
                    karaokeColor: '#8b5cf6'
                }
            }
        ], { width: 1280, height: 720 });

        expect(ass).toContain('{\\alpha&H00&}Breakfast');
        expect(ass).not.toContain('{\\alpha&H00&}B{\\alpha&HFF&}r');
    });

    it('does not double-apply shadow distance in shadow helper styles', () => {
        const ass = ASSGenerator.generate([
            {
                id: 14,
                subtitles: [{ start: 0, end: 1, text: 'Shadow' }],
                style: {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    fontColor: '#ffffff',
                    shadows: [{ x: 4, y: 2, blur: 2, color: '#000000' }]
                }
            }
        ], { width: 1280, height: 720 });

        expect(ass).toContain('Style: Style_14_shad_0,Arial,32');
        expect(ass).toContain(',0,2,64,64,72,1');
        expect(ass).toContain('\\xshad4');
        expect(ass).toContain('\\yshad2');
    });
});


