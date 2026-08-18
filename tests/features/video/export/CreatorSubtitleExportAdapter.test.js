/** @jest-environment jsdom */

describe('CreatorSubtitleExportAdapter', () => {
    let adapter;

    beforeAll(() => {
        window.SubtitleSegmentAdapter = {
            buildDisplayText: jest.fn((segment, mode) => {
                if (mode === 'bilingual') {
                    return `${segment.originalText}\n${segment.translatedText}`;
                }
                return segment.translatedText || segment.originalText;
            })
        };

        adapter = require('../../../../src/features/video/export/CreatorSubtitleExportAdapter');
    });

    it('maps subtitle segments into compact timeline time while preserving track styles', () => {
        const tracks = adapter.buildTracks({
            videoFile: { path: 'C:/video/source.mp4' },
            localizedEditProject: {
                video: { path: 'C:/video/source.mp4' },
                displayMode: 'bilingual',
                subtitleTracks: [
                    {
                        id: 'sub-main',
                        visible: true,
                        style: {
                            fontColor: '#ff00ff',
                            enableBackground: true
                        },
                        segments: [
                            {
                                id: 'seg-1',
                                start: 12,
                                end: 14,
                                originalText: 'Hello',
                                translatedText: 'Bonjour'
                            }
                        ]
                    }
                ]
            },
            timelineManager: {
                tracks: {
                    v1: {
                        enabled: true,
                        muted: false,
                        segments: [
                            {
                                start: 0,
                                end: 2,
                                sourceStart: 12,
                                speed: 1,
                                file: { path: 'C:/video/source.mp4' }
                            }
                        ]
                    }
                }
            }
        });

        expect(tracks).toHaveLength(1);
        expect(tracks[0].style).toEqual(expect.objectContaining({
            fontColor: '#ff00ff',
            enableBackground: true
        }));
        expect(tracks[0].subtitles).toHaveLength(1);
        expect(tracks[0].subtitles[0]).toEqual(expect.objectContaining({
            start: 0,
            end: 2,
            text: 'Hello\nBonjour'
        }));
    });

    it('prefers prepared render tracks so karaoke and bilingual export fields survive creator export', () => {
        const tracks = adapter.buildTracks({
            videoFile: { path: 'C:/video/source.mp4' },
            localizedEditProject: {
                video: { path: 'C:/video/source.mp4' },
                displayMode: 'translated',
                subtitleTracks: [],
                renderTracks: [
                    {
                        id: 'render-main',
                        visible: true,
                        style: {
                            fontColor: '#ff00ff',
                            enableBackground: true
                        },
                        segments: [
                            {
                                id: 'seg-render-1',
                                start: 12,
                                end: 14,
                                text: 'Hello\nBonjour',
                                karaokeText: 'Hello',
                                karaokeSecondaryText: 'Bonjour',
                                words: [
                                    { text: 'Hello', start: 12, end: 13 }
                                ]
                            }
                        ]
                    }
                ]
            },
            timelineManager: {
                tracks: {
                    v1: {
                        enabled: true,
                        muted: false,
                        segments: [
                            {
                                start: 0,
                                end: 2,
                                sourceStart: 12,
                                speed: 1,
                                file: { path: 'C:/video/source.mp4' }
                            }
                        ]
                    }
                }
            }
        });

        expect(tracks).toHaveLength(1);
        expect(tracks[0].subtitles[0]).toEqual(expect.objectContaining({
            text: 'Hello\nBonjour',
            karaokeText: 'Hello',
            karaokeSecondaryText: 'Bonjour'
        }));
    });
});
