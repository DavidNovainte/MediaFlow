jest.mock('../../services/LicenseManager', () => ({
    getStatus: jest.fn()
}));

const licenseManager = require('../../services/LicenseManager');
const { assertPro, withPro, PRO_DENIED } = require('../../src/utils/requirePro');

describe('requirePro', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows Pro users', async () => {
        licenseManager.getStatus.mockResolvedValue({ isPro: true });
        await expect(assertPro()).resolves.toBeNull();
    });

    it('denies free users with PRO_REQUIRED', async () => {
        licenseManager.getStatus.mockResolvedValue({ isPro: false });
        const denied = await assertPro();
        expect(denied).toMatchObject({ success: false, error: 'PRO_REQUIRED' });
        expect(denied.error).toBe(PRO_DENIED.error);
    });

    it('withPro short-circuits free users', async () => {
        licenseManager.getStatus.mockResolvedValue({ isPro: false });
        const inner = jest.fn().mockResolvedValue({ success: true });
        const wrapped = withPro(inner);
        const result = await wrapped({}, 'arg');
        expect(result.error).toBe('PRO_REQUIRED');
        expect(inner).not.toHaveBeenCalled();
    });

    it('withPro calls handler for Pro users', async () => {
        licenseManager.getStatus.mockResolvedValue({ isPro: true });
        const inner = jest.fn().mockResolvedValue({ success: true, data: 1 });
        const wrapped = withPro(inner);
        await expect(wrapped({}, 42)).resolves.toEqual({ success: true, data: 1 });
        expect(inner).toHaveBeenCalledWith({}, 42);
    });
});
