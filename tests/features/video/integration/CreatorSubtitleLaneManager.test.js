/** @jest-environment jsdom */

describe('CreatorSubtitleLaneManager', () => {
    beforeAll(() => {
        require('../../../../src/features/video/integration/CreatorSubtitleProject');
        require('../../../../src/features/video/integration/CreatorSubtitleLaneManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="btn-timeline-subtitle-cuts" class="hidden">
                <span class="subtitle-cut-count"></span>
            </button>
            <div id="creator-timeline-workspace">
                <div class="timeline-body">
                    <div class="timeline-track ruler-track"></div>
                </div>
            </div>
        `;

        window.i18n = {
            t: jest.fn((key) => key)
        };
    });

    it('renders a subtitle lane and updates the active chip', () => {
        const flow = {
            localizedEditProject: {
                metadata: { activeTrackId: 'main-1' },
                subtitleTracks: [
                    {
                        id: 'main-1',
                        visible: true,
                        segments: [
                            { id: 's1', start: 0, end: 1, displayText: 'Hello' },
                            { id: 's2', start: 2, end: 3, displayText: 'World' }
                        ]
                    }
                ]
            },
            timelineManager: {
                duration: 10,
                pixelsPerSecond: 50,
                zoomLevel: 100,
                currentTime: 0.5,
                getMappedTimelineTime: jest.fn((value) => value),
                getMappedSourceTime: jest.fn((value) => value),
                updatePlayheadPosition: jest.fn(),
                onSeek: jest.fn()
            }
        };

        const manager = new window.CreatorSubtitleLaneManager(flow);
        manager.init();

        const lane = document.getElementById('track-subtitle-guide');
        const chips = Array.from(document.querySelectorAll('.subtitle-guide-segment'));
        const button = document.getElementById('btn-timeline-subtitle-cuts');

        expect(lane).not.toBeNull();
        expect(chips).toHaveLength(2);
        expect(chips[0].classList.contains('active')).toBe(true);
        expect(chips[1].classList.contains('active')).toBe(false);
        expect(button.classList.contains('hidden')).toBe(false);
        expect(button.querySelector('.subtitle-cut-count').textContent).toBe('2');

        flow.timelineManager.currentTime = 2.5;
        manager.updateActiveState();

        expect(chips[0].classList.contains('active')).toBe(false);
        expect(chips[1].classList.contains('active')).toBe(true);
    });
});
