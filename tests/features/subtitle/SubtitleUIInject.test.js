/** @jest-environment jsdom */

describe('SubtitleUIInject timed import', () => {
    beforeEach(() => {
        jest.resetModules();

        window.i18n = {
            t: jest.fn((key) => key)
        };
        window.app = {
            showToast: jest.fn()
        };
        window.mediaflow = {
            dialog: {
                showMessageBox: jest.fn()
            }
        };
        window.SubtitleUIBase = class {
            constructor(flow) {
                this.flow = flow;
            }
        };

        require('../../../src/features/subtitle/ui/SubtitleUIInject.js');
    });

    afterEach(() => {
        delete window.i18n;
        delete window.app;
        delete window.mediaflow;
        delete window.SubtitleUIBase;
        delete window.SubtitleUIInject;
    });

    test('injects subtitles using explicit time ranges', () => {
        const track = { id: 'main', name: 'Main', subtitles: [] };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track],
                renderTracks: jest.fn()
            },
            timeline: {
                render: jest.fn()
            },
            updateSubtitlePreview: jest.fn(),
            uiManager: {
                updateInputModeUI: jest.fn()
            }
        };
        flow.editor = {
            subtitles: [],
            render: jest.fn(() => flow.timeline.render()),
            addToHistory: jest.fn()
        };

        const inject = new window.SubtitleUIInject(flow);
        inject.handleInjection([
            '00:00-00:03\tMost people see old pallets; these guys see a luxury estate.',
            '00:03-00:05\tHonestly, they\'re working faster than my internet connection.'
        ].join('\n'), 'original-only', 9);

        expect(track.subtitles).toHaveLength(2);
        expect(track.subtitles[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 3,
            originalText: 'Most people see old pallets; these guys see a luxury estate.'
        }));
        expect(track.subtitles[1]).toEqual(expect.objectContaining({
            start: 3,
            end: 5,
            originalText: "Honestly, they're working faster than my internet connection."
        }));
        expect(flow.trackManager.renderTracks).toHaveBeenCalled();
        expect(flow.timeline.render).toHaveBeenCalled();
    });

    test('warns instead of injecting when timed rows are malformed', () => {
        const track = { id: 'main', name: 'Main', subtitles: [] };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track],
                renderTracks: jest.fn()
            },
            timeline: {
                render: jest.fn()
            },
            updateSubtitlePreview: jest.fn(),
            uiManager: {
                updateInputModeUI: jest.fn()
            }
        };
        flow.editor = {
            subtitles: [],
            render: jest.fn(() => flow.timeline.render()),
            addToHistory: jest.fn()
        };

        const inject = new window.SubtitleUIInject(flow);
        inject.handleInjection('00:00-00:03\tvalid line\n00:03-XX:05\tbroken line', 'original-only', 3);

        expect(track.subtitles).toHaveLength(0);
        expect(window.mediaflow.dialog.showMessageBox).toHaveBeenCalled();
        expect(flow.trackManager.renderTracks).not.toHaveBeenCalled();
    });

    test('keeps modal content when confirm fails on malformed timed rows', () => {
        document.body.innerHTML = '';

        const track = { id: 'main', name: 'Main', subtitles: [] };
        const flow = {
            trackManager: {
                activeTrackId: 'main',
                tracks: [track],
                renderTracks: jest.fn()
            },
            timeline: {
                render: jest.fn()
            },
            updateSubtitlePreview: jest.fn(),
            uiManager: {
                updateInputModeUI: jest.fn()
            }
        };
        flow.editor = {
            subtitles: [],
            render: jest.fn(() => flow.timeline.render()),
            addToHistory: jest.fn()
        };

        const inject = new window.SubtitleUIInject(flow);
        inject.showInjectionModal();

        const modal = document.getElementById('text-injection-modal');
        const textarea = modal.querySelector('#injection-textarea');
        const confirmBtn = modal.querySelector('.confirm-inject-btn');

        textarea.value = '00:00-00:03\tvalid line\n00:03-XX:05\tbroken line';
        confirmBtn.click();

        expect(modal.classList.contains('show')).toBe(true);
        expect(textarea.value).toContain('broken line');
        expect(window.mediaflow.dialog.showMessageBox).toHaveBeenCalled();
    });
});
