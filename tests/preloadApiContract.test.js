describe('preload mediaflow API contract', () => {
    let exposedApi;
    let ipcRenderer;

    beforeEach(() => {
        jest.resetModules();
        exposedApi = null;
        ipcRenderer = {
            invoke: jest.fn(),
            send: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn()
        };

        jest.doMock('electron', () => ({
            contextBridge: {
                exposeInMainWorld: jest.fn((name, api) => {
                    if (name === 'mediaflow') exposedApi = api;
                })
            },
            ipcRenderer
        }));

        require('../preload');
    });

    afterEach(() => {
        jest.dontMock('electron');
    });

    test('exposes dialog message boxes through the mediaflow namespace', () => {
        const options = { type: 'question', message: 'Confirm?' };

        exposedApi.dialog.showMessageBox(options);

        expect(ipcRenderer.invoke).toHaveBeenCalledWith('dialog:showMessageBox', options);
    });

    test('exposes safe file copying through the fs namespace', () => {
        exposedApi.fs.copyFile('source.mp4', 'target.mp4');

        expect(ipcRenderer.invoke).toHaveBeenCalledWith('fs:copyFile', 'source.mp4', 'target.mp4');
    });

    test('exposes engine update progress listener with cleanup', () => {
        const callback = jest.fn();
        const cleanup = exposedApi.engine.onUpdateProgress(callback);
        const listener = ipcRenderer.on.mock.calls[0][1];

        listener({}, { log: 'downloading' });
        cleanup();

        expect(ipcRenderer.on).toHaveBeenCalledWith('engine:updateProgress', expect.any(Function));
        expect(callback).toHaveBeenCalledWith({ log: 'downloading' });
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith('engine:updateProgress', listener);
    });

    test('exposes system.openLogsDir through the mediaflow namespace', () => {
        exposedApi.system.openLogsDir();
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('system:openLogsDir');
    });
});
