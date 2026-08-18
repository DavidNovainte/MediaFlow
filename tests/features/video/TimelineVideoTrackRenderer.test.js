/** @jest-environment jsdom */

describe('TimelineVideoTrackRenderer', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = {
            t: jest.fn(() => 'Clip <img src=x onerror=alert(1)>')
        };
        require('../../../src/features/video/timeline/render/TimelineVideoTrackRenderer.js');
    });

    afterEach(() => {
        delete window.TimelineVideoTrackRenderer;
        delete window.i18n;
    });

    test('renders segment labels as text', () => {
        const manager = {
            selectedSegmentIndex: -1,
            selectedTrackId: null,
            isDraggingClip: false,
            isTrimmingClip: false,
            renderVideoTracks: jest.fn(),
            captureState: jest.fn(),
            syncVolumeUI: jest.fn(),
            showSegmentContextMenu: jest.fn(),
            app: {
                uiManager: {
                    showProperties: jest.fn()
                }
            }
        };

        const element = window.TimelineVideoTrackRenderer.createSegmentElement(
            manager,
            { id: 'v1' },
            { start: 0, end: 2, path: 'clip.mp4' },
            0,
            100
        );

        expect(element.querySelector('img')).toBeNull();
        expect(element.textContent).toContain('Clip <img src=x onerror=alert(1)>');
    });
});
