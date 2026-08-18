/** @jest-environment jsdom */

describe('CreatorSubtitlePreviewOverlay', () => {
    beforeAll(() => {
        require('../../../../src/features/video/integration/CreatorSubtitleProject');
        require('../../../../src/features/video/integration/CreatorSubtitlePreviewOverlay');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="page-creator">
                <div class="video-preview-full" style="position: relative;">
                    <video id="creator-video-preview"></video>
                </div>
            </div>
        `;

        const previewStage = document.querySelector('.video-preview-full');
        const video = document.getElementById('creator-video-preview');
        Object.defineProperty(previewStage, 'clientWidth', { value: 400, configurable: true });
        Object.defineProperty(previewStage, 'clientHeight', { value: 800, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 1080, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 1920, configurable: true });

        window.i18n = {
            t: jest.fn((key) => key)
        };
    });

    it('renders imported subtitle text with style into the Creator preview', () => {
        const project = {
            displayMode: 'bilingual',
            metadata: { activeTrackId: 'sub-main' },
            subtitleTracks: [
                {
                    id: 'sub-main',
                    visible: true,
                    style: {
                        fontFamily: 'Microsoft YaHei',
                        fontSize: 34,
                        fontBold: true,
                        fontColor: '#ffe066',
                        outlineColor: '#000000',
                        outlineWidth: 2,
                        enableBackground: true,
                        bgColor: '#111111',
                        bgOpacity: 60,
                        position: '2',
                        marginV: 10
                    },
                    segments: [
                        {
                            id: 'seg-1',
                            start: 1,
                            end: 3,
                            displayText: 'Hello\\n你好'
                        }
                    ]
                }
            ]
        };

        const flow = {
            isAudioOnly: false,
            localizedEditProject: project,
            timelineManager: {
                currentTime: 1.5,
                getMappedSourceTime: jest.fn(() => 1.5)
            }
        };

        const overlay = new window.CreatorSubtitlePreviewOverlay(flow);
        overlay.init();
        overlay.syncProject(project, { silent: true });

        const overlayEl = document.getElementById('creator-subtitle-overlay');
        const textEl = overlayEl.querySelector('.creator-subtitle-text');

        expect(overlayEl.classList.contains('hidden')).toBe(false);
        expect(textEl.innerHTML).toContain('Hello');
        expect(textEl.innerHTML).toContain('你好');
        expect(textEl.style.color).toBe('rgb(255, 224, 102)');
        expect(textEl.style.fontWeight).toBe('700');
        expect(textEl.style.textAlign).toBe('center');
        expect(parseInt(textEl.style.fontSize, 10)).toBeGreaterThan(20);
    });

    it('renders prepared render tracks as separate styled subtitle layers', () => {
        const project = {
            displayMode: 'bilingual',
            renderTracks: [
                {
                    id: 'track-en',
                    visible: true,
                    style: {
                        fontFamily: 'Arial',
                        fontSize: 28,
                        fontBold: true,
                        fontColor: '#ff00ff',
                        enableBackground: true,
                        bgColor: '#ffffff',
                        bgOpacity: 100,
                        position: '8',
                        marginV: 10
                    },
                    segments: [
                        {
                            id: 'seg-en',
                            start: 1,
                            end: 3,
                            text: 'Do you see this'
                        }
                    ]
                },
                {
                    id: 'track-zh',
                    visible: true,
                    style: {
                        fontFamily: 'SimHei',
                        fontSize: 34,
                        fontBold: true,
                        fontColor: '#ffff00',
                        strokes: [{ width: 2, color: '#000000' }],
                        position: '2',
                        marginV: 18
                    },
                    segments: [
                        {
                            id: 'seg-zh',
                            start: 1,
                            end: 3,
                            text: '你看到这个吗'
                        }
                    ]
                }
            ]
        };

        const flow = {
            isAudioOnly: false,
            localizedEditProject: project,
            timelineManager: {
                currentTime: 1.5,
                getMappedSourceTime: jest.fn(() => 1.5)
            }
        };

        const overlay = new window.CreatorSubtitlePreviewOverlay(flow);
        overlay.init();
        overlay.syncProject(project, { silent: true });

        const renderedNodes = Array.from(document.querySelectorAll('#creator-subtitle-overlay .creator-subtitle-text'));
        expect(renderedNodes).toHaveLength(2);
        expect(renderedNodes[0].innerHTML).toContain('Do you see this');
        expect(renderedNodes[1].innerHTML).toContain('你看到这个吗');
        expect(renderedNodes[0].style.background).toBe('rgb(255, 255, 255)');
        expect(renderedNodes[1].style.color).toBe('rgb(255, 255, 0)');
    });

    it('renders karaoke highlight styling in the Creator preview overlay', () => {
        const project = {
            displayMode: 'translated',
            renderTracks: [
                {
                    id: 'track-karaoke',
                    visible: true,
                    style: {
                        fontFamily: 'Arial',
                        fontSize: 28,
                        fontColor: '#ffffff',
                        enableKaraoke: true,
                        karaokeStyle: 'highlight',
                        karaokeColor: '#ff4db8',
                        position: '2',
                        marginV: 10
                    },
                    segments: [
                        {
                            id: 'seg-karaoke',
                            start: 1,
                            end: 3,
                            text: 'First step completely',
                            words: [
                                { text: 'First', start: 1, end: 1.5 },
                                { text: 'step', start: 1.5, end: 2 },
                                { text: 'completely', start: 2, end: 3 }
                            ]
                        }
                    ]
                }
            ]
        };

        const flow = {
            isAudioOnly: false,
            localizedEditProject: project,
            timelineManager: {
                currentTime: 1.25,
                getMappedSourceTime: jest.fn(() => 1.25)
            }
        };

        const overlay = new window.CreatorSubtitlePreviewOverlay(flow);
        overlay.init();
        overlay.syncProject(project, { silent: true });

        const textEl = document.querySelector('#creator-subtitle-overlay .creator-subtitle-text');
        expect(textEl.innerHTML).toContain('background:#ff4db8');
        expect(textEl.innerHTML).toContain('First');
    });
});
