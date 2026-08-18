/** @jest-environment jsdom */

describe('SubtitleTimelineRenderer source media guides', () => {
    beforeEach(() => {
        jest.resetModules();
        require('../../../src/features/subtitle/SubtitleTimelineRenderer.js');
    });

    afterEach(() => {
        delete window.SubtitleTimelineRenderer;
    });

    function createContext() {
        return {
            save: jest.fn(),
            restore: jest.fn(),
            scale: jest.fn(),
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            setLineDash: jest.fn()
        };
    }

    test('drawWaveform compacts source audio segments after removed gaps', () => {
        document.body.innerHTML = `
            <div id="tracks-viewport"></div>
            <div id="waveform-parent"><canvas id="waveform"></canvas></div>
        `;

        const canvas = document.getElementById('waveform');
        const parent = document.getElementById('waveform-parent');
        Object.defineProperty(parent, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 60 });
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

        const ctx = createContext();
        const renderer = new window.SubtitleTimelineRenderer({
            waveformCtx: ctx,
            waveformCanvas: canvas,
            peaks: [0.5, 0.5],
            pxPerSec: 50,
            duration: 10,
            flow: {
                videoFile: { duration: 10 },
                hasSourceTrim: jest.fn(() => true),
                getPlayableSourceSegments: jest.fn(() => [
                    { start: 0, end: 4 },
                    { start: 6, end: 10 }
                ])
            }
        });

        renderer.drawWaveform();

        const overlay = parent.querySelector('.source-waveform-segments');
        expect(overlay).not.toBeNull();
        expect(overlay.hidden).toBe(false);
        expect(parent.querySelectorAll('.source-waveform-segment')).toHaveLength(2);
        expect(parent.querySelectorAll('.source-waveform-gap')).toHaveLength(0);
        expect(parent.querySelectorAll('.source-waveform-cut')).toHaveLength(1);
        expect(parent.querySelector('.source-waveform-cut').style.left).toBe('200px');
        expect(ctx.fillRect).toHaveBeenCalledWith(199, 0, 2, 60);
        expect(ctx.moveTo).toHaveBeenCalledWith(200.5, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(200.5, 60);
    });

    test('drawWaveform keeps full audio visible for contiguous source split segments', () => {
        document.body.innerHTML = `
            <div id="tracks-viewport"></div>
            <div id="waveform-parent"><canvas id="waveform"></canvas></div>
        `;

        const canvas = document.getElementById('waveform');
        const parent = document.getElementById('waveform-parent');
        Object.defineProperty(parent, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 60 });
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

        const ctx = createContext();
        const renderer = new window.SubtitleTimelineRenderer({
            waveformCtx: ctx,
            waveformCanvas: canvas,
            peaks: [0.5, 0.5],
            pxPerSec: 50,
            duration: 10,
            flow: {
                videoFile: { duration: 10 },
                hasSourceTrim: jest.fn(() => false),
                getPlayableSourceSegments: jest.fn(() => [
                    { start: 0, end: 7 },
                    { start: 7, end: 10 }
                ])
            }
        });

        renderer.drawWaveform();

        const overlay = parent.querySelector('.source-waveform-segments');
        expect(overlay).not.toBeNull();
        expect(overlay.hidden).toBe(false);
        expect(parent.querySelectorAll('.source-waveform-segment')).toHaveLength(2);
        expect(parent.querySelectorAll('.source-waveform-gap')).toHaveLength(0);
        expect(parent.querySelectorAll('.source-waveform-cut')).toHaveLength(1);
        expect(parent.querySelector('.source-waveform-cut').style.left).toBe('350px');
        expect(ctx.fillRect).toHaveBeenCalledWith(349, 0, 2, 60);
        expect(ctx.moveTo).toHaveBeenCalledWith(350.5, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(350.5, 60);
        expect(ctx.fillRect.mock.calls.some(([x, , w]) => (
            Math.abs(x - 250) < 0.001 && Math.abs(w - 249.8) < 0.001
        ))).toBe(true);
        expect(ctx.fillRect.mock.calls.some(([x, , w]) => (
            Math.abs(x - 250) < 0.001 && Math.abs(w - 100) < 0.001
        ))).toBe(false);
    });

    test('drawWaveform hides source overlay when the source is not trimmed', () => {
        document.body.innerHTML = `
            <div id="tracks-viewport"></div>
            <div id="waveform-parent"><canvas id="waveform"></canvas></div>
        `;

        const canvas = document.getElementById('waveform');
        const parent = document.getElementById('waveform-parent');
        Object.defineProperty(parent, 'clientWidth', { configurable: true, value: 500 });
        Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 60 });
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

        const ctx = createContext();
        const renderer = new window.SubtitleTimelineRenderer({
            waveformCtx: ctx,
            waveformCanvas: canvas,
            peaks: [0.5, 0.4, 0.6, 0.3, 0.5],
            pxPerSec: 50,
            duration: 10,
            flow: {
                videoFile: { duration: 10 },
                hasSourceTrim: jest.fn(() => false),
                getPlayableSourceSegments: jest.fn(() => [{ start: 0, end: 10 }])
            }
        });

        renderer.drawWaveform();

        const overlay = parent.querySelector('.source-waveform-segments');
        expect(overlay).not.toBeNull();
        expect(overlay.hidden).toBe(true);
        expect(parent.querySelectorAll('.source-waveform-segment')).toHaveLength(0);
    });
});
