/** @jest-environment jsdom */

describe('CreatorWorkflowImporter', () => {
    beforeAll(() => {
        require('../../../../src/features/shared/workflow/LocalizedEditProject');
        require('../../../../src/features/shared/workflow/LocalizedEditProjectStore');
        require('../../../../src/features/video/integration/CreatorWorkflowImporter');
    });

    beforeEach(() => {
        window.LocalizedEditProjectStore.clearPendingProject();
        window.app = {
            showToast: jest.fn()
        };
        window.i18n = {
            t: jest.fn((key) => key)
        };
        document.body.innerHTML = '';
    });

    it('imports a pending project into CreatorFlow and clears the store', async () => {
        const project = window.LocalizedEditProject.create({
            video: {
                path: 'C:/video/sample.mp4',
                name: 'sample.mp4',
                duration: 90
            },
            subtitleTracks: [
                {
                    id: 'track-1',
                    name: 'Main',
                    type: 'main',
                    segments: [
                        { id: 'sub-1', start: 0, end: 1.2, text: 'Hello' }
                    ]
                }
            ],
            audioTracks: [
                {
                    id: 'track-a1',
                    name: 'TTS',
                    type: 'audio',
                    segments: [
                        { id: 'clip-1', start: 0, end: 1.2, text: 'Hello', audioPath: 'C:/tts/voice.wav' }
                    ]
                }
            ]
        });
        window.LocalizedEditProjectStore.setPendingProject(project);

        const flow = {
            videoFile: null,
            audioFile: null,
            localizedEditProject: null,
            addLocalFile: jest.fn(),
            getMediaPath: jest.fn(() => ''),
            subtitleLaneManager: {
                syncProject: jest.fn()
            },
            subtitlePreviewOverlay: {
                syncProject: jest.fn()
            },
            subtitleAudioTrackImporter: {
                syncProject: jest.fn()
            },
            subtitleCutActions: {
                updateButtonState: jest.fn()
            }
        };

        const importer = new window.CreatorWorkflowImporter(flow);
        const imported = await importer.importPendingProject();

        expect(imported).toBe(true);
        expect(flow.addLocalFile).toHaveBeenCalledWith('C:/video/sample.mp4');
        expect(flow.localizedEditProject).toEqual(expect.objectContaining({
            video: expect.objectContaining({ path: 'C:/video/sample.mp4' }),
            subtitleTracks: expect.arrayContaining([
                expect.objectContaining({ id: 'track-1' })
            ])
        }));
        expect(flow.subtitleLaneManager.syncProject).toHaveBeenCalled();
        expect(flow.subtitlePreviewOverlay.syncProject).toHaveBeenCalled();
        expect(flow.subtitleAudioTrackImporter.syncProject).toHaveBeenCalledWith(expect.any(Object), { timelineMode: 'source' });
        expect(flow.subtitleCutActions.updateButtonState).toHaveBeenCalled();
        expect(window.LocalizedEditProjectStore.peekPendingProject()).toBeNull();
        expect(window.app.showToast).toHaveBeenCalledWith(
            'Imported 1 subtitle track(s) and 1 audio track(s) from Subtitle',
            'success'
        );
    });

    it('skips reloading media when the current source already matches', async () => {
        const project = window.LocalizedEditProject.create({
            video: {
                path: 'C:/video/sample.mp4',
                name: 'sample.mp4',
                duration: 90
            }
        });

        const flow = {
            videoFile: { path: 'C:/video/sample.mp4' },
            audioFile: null,
            localizedEditProject: null,
            addLocalFile: jest.fn(),
            getMediaPath: jest.fn(() => 'C:/video/sample.mp4'),
            subtitleLaneManager: {
                syncProject: jest.fn()
            },
            subtitlePreviewOverlay: {
                syncProject: jest.fn()
            },
            subtitleAudioTrackImporter: {
                syncProject: jest.fn()
            },
            subtitleCutActions: {
                updateButtonState: jest.fn()
            }
        };

        const importer = new window.CreatorWorkflowImporter(flow);
        const imported = await importer.importProject(project, { silent: true });

        expect(imported).toBe(true);
        expect(flow.addLocalFile).not.toHaveBeenCalled();
    });
});
