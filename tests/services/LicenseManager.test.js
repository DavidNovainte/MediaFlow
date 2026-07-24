jest.mock('../../src/utils/hwid', () => ({
    getHWID: jest.fn().mockResolvedValue('HWID-TEST')
}));

const licenseManager = require('../../services/LicenseManager');

describe('LicenseManager status normalization', () => {
    afterEach(() => {
        licenseManager.store = null;
        jest.clearAllMocks();
    });

    test('returns monthly plan type and estimated expiry when expiry is missing', async () => {
        licenseManager.store = {
            get: jest.fn((key) => {
                if (key === 'license_data') {
                    return {
                        isPro: true,
                        customerEmail: 'user@example.com',
                        productName: 'MediaFlow Pro - Monthly',
                        variantId: 1463945,
                        activatedAt: '2026-04-01T00:00:00.000Z',
                        expiry: null
                    };
                }
                return null;
            })
        };

        const status = await licenseManager.getStatus();

        expect(status.isPro).toBe(true);
        expect(status.planType).toBe('monthly');
        expect(status.estimatedExpiry).toBe('2026-05-01T00:00:00.000Z');
    });

    test('returns lifetime plan type when lifetime variant has no expiry', async () => {
        licenseManager.store = {
            get: jest.fn((key) => {
                if (key === 'license_data') {
                    return {
                        isPro: true,
                        customerEmail: 'user@example.com',
                        productName: 'MediaFlow Pro Lifetime',
                        variantId: 1463941,
                        activatedAt: '2026-04-01T00:00:00.000Z',
                        expiry: null
                    };
                }
                return null;
            })
        };

        const status = await licenseManager.getStatus();

        expect(status.isPro).toBe(true);
        expect(status.planType).toBe('lifetime');
        expect(status.isLifetime).toBe(true);
        expect(status.estimatedExpiry).toBeNull();
    });
});
