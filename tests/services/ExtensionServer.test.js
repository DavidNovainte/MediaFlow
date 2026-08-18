describe('ExtensionServer', () => {
    let http;
    let server;
    let handlers;
    let requestHandler;

    beforeEach(() => {
        jest.resetModules();
        handlers = {};
        requestHandler = null;
        server = {
            on: jest.fn((eventName, handler) => {
                handlers[eventName] = handler;
                return server;
            }),
            listen: jest.fn((_port, _host, callback) => {
                if (typeof callback === 'function') callback();
                return server;
            }),
            close: jest.fn()
        };

        jest.doMock('http', () => ({
            createServer: jest.fn((handler) => {
                requestHandler = handler;
                return server;
            })
        }));
        jest.doMock('electron-store', () => class {
            get(_key, fallback) {
                return fallback;
            }
        });

        http = require('http');
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.dontMock('http');
        jest.dontMock('electron-store');
    });

    test('clears the running server reference after a listen error so startup can retry', () => {
        const extensionServer = require('../../services/ExtensionServer');

        extensionServer.start();
        expect(http.createServer).toHaveBeenCalledTimes(1);

        handlers.error(new Error('listen EADDRINUSE: address already in use 127.0.0.1:16412'));

        expect(extensionServer.server).toBeNull();

        extensionServer.start();

        expect(http.createServer).toHaveBeenCalledTimes(2);
    });

    test('status endpoint reports fully-unlocked free status', async () => {
        const extensionServer = require('../../services/ExtensionServer');
        const res = {
            setHeader: jest.fn(),
            writeHead: jest.fn(),
            end: jest.fn()
        };

        extensionServer.start();
        await requestHandler({ method: 'GET', url: '/api/status' }, res);

        expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        expect(JSON.parse(res.end.mock.calls[0][0])).toEqual(expect.objectContaining({
            success: true,
            isPro: true,
            planType: 'free',
            licenseType: 'free'
        }));
    });

    test('stop closes the active server and clears state', () => {
        const extensionServer = require('../../services/ExtensionServer');

        extensionServer.start();
        extensionServer.stop();

        expect(server.close).toHaveBeenCalled();
        expect(extensionServer.server).toBeNull();
    });
});
