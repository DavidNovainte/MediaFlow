jest.mock('node:fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn()
}));

jest.mock('axios', () => ({
    post: jest.fn()
}));

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/mock/userData')
    }
}));

describe('logger', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env = {
            ...ORIGINAL_ENV,
            MEDIAFLOW_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test-deployment/exec',
            MEDIAFLOW_APPS_SCRIPT_TOKEN: 'test-token'
        };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('enables error reporting by default', () => {
        const logger = require('../../src/utils/logger');
        expect(logger.reportingEnabled).toBe(true);
    });

    it('posts error payloads to the Google Sheets endpoint', async () => {
        const axios = require('axios');
        axios.post.mockResolvedValue({ status: 200, data: 'Success' });

        const logger = require('../../src/utils/logger');
        const result = await logger.reportToGoogleSheets({
            type: 'USER_REPORT',
            version: '2.3.0',
            message: 'boom',
            stack: 'trace',
            hwid: 'abc',
            logs: [{ level: 'error', message: 'boom' }]
        });

        expect(result).toEqual({ success: true });
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post.mock.calls[0][0]).toContain('script.google.com/macros/s/');
        expect(axios.post.mock.calls[0][1]).toMatchObject({
            type: 'USER_REPORT',
            version: '2.3.0',
            message: 'boom',
            stack: 'trace',
            hwid: 'abc',
            token: 'test-token'
        });
    });

    it('skips reporting when telemetry is not configured', async () => {
        delete process.env.MEDIAFLOW_APPS_SCRIPT_URL;
        delete process.env.MEDIAFLOW_APPS_SCRIPT_TOKEN;
        const fs = require('node:fs');
        fs.existsSync.mockImplementation((p) => !String(p).includes('telemetry.local.js'));

        const axios = require('axios');
        const logger = require('../../src/utils/logger');
        const result = await logger.reportToGoogleSheets({
            type: 'TEST_REPORT',
            message: 'boom'
        });

        expect(result).toEqual({ success: false, error: 'Telemetry not configured' });
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('treats Apps Script text errors as failed submissions', async () => {
        const axios = require('axios');
        axios.post.mockResolvedValue({ status: 200, data: 'Error: Cannot call SpreadsheetApp.getActiveSpreadsheet()' });

        const logger = require('../../src/utils/logger');
        const result = await logger.reportToGoogleSheets({
            type: 'TEST_REPORT',
            version: '2.3.0',
            message: 'boom'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Error: Cannot call SpreadsheetApp.getActiveSpreadsheet()');
    });

    it('treats Apps Script JSON failures as failed submissions', async () => {
        const axios = require('axios');
        axios.post.mockResolvedValue({ status: 200, data: { success: false, error: 'Unknown action' } });

        const logger = require('../../src/utils/logger');
        const result = await logger.reportToGoogleSheets({
            type: 'TEST_REPORT',
            version: '2.3.0',
            message: 'boom'
        });

        expect(result).toEqual({ success: false, error: 'Unknown action' });
    });
});
