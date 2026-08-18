/** @jest-environment jsdom */

describe('ScribeMediaPlayer', () => {
    beforeAll(() => {
        require('../../../src/features/scribe/ScribeMediaPlayer');
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="transcribe-result"></div>';
        window.i18n = { t: jest.fn((key) => key) };
    });

    afterEach(() => {
        delete window.i18n;
    });

    function createPlayer() {
        const player = new window.ScribeMediaPlayer({
            editor: {
                highlightCurrentSegment: jest.fn(),
                clearHighlight: jest.fn()
            }
        });
        player.init();
        return player;
    }

    test('toggles mute from the player mute button', () => {
        createPlayer();

        const audio = document.getElementById('scribe-audio-element');
        const muteButton = document.getElementById('btn-player-mute');

        expect(audio.muted).toBe(false);

        muteButton.click();

        expect(audio.muted).toBe(true);
        expect(muteButton.getAttribute('aria-pressed')).toBe('true');
        expect(muteButton.title).toBe('common.ui.unmute');

        muteButton.click();

        expect(audio.muted).toBe(false);
        expect(audio.volume).toBe(1);
        expect(muteButton.getAttribute('aria-pressed')).toBe('false');
    });

    test('syncs mute state with volume slider changes', () => {
        createPlayer();

        const audio = document.getElementById('scribe-audio-element');
        const volume = document.getElementById('player-volume');
        const muteButton = document.getElementById('btn-player-mute');

        volume.value = '0';
        volume.dispatchEvent(new Event('input', { bubbles: true }));

        expect(audio.muted).toBe(true);
        expect(muteButton.getAttribute('aria-pressed')).toBe('true');

        volume.value = '0.4';
        volume.dispatchEvent(new Event('input', { bubbles: true }));

        expect(audio.volume).toBeCloseTo(0.4);
        expect(audio.muted).toBe(false);
        expect(muteButton.getAttribute('aria-pressed')).toBe('false');
    });
});
