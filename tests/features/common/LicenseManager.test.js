/** @jest-environment jsdom */

describe('renderer LicenseManager subscription display', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="license-status-badge"></div>
            <div id="license-info-text"></div>
            <div id="license-details" class="hidden"></div>
            <button id="btn-activate-license"></button>
            <div id="upgrade-not-activated"></div>
            <div id="upgrade-activated" class="hidden"></div>
            <div id="license-status-container"></div>
            <div id="app-title"></div>
            <div class="nav-item-upgrade"></div>
            <div id="pro-plan-name"></div>
            <div id="pro-email"></div>
            <div id="pro-expiry"></div>
            <details id="license-diagnostics-panel">
                <summary>授权诊断</summary>
            </details>
            <div id="license-plan-type"></div>
            <div id="license-variant-id"></div>
            <div id="license-product-name"></div>
            <div id="license-expiry-raw"></div>
            <div id="license-estimated-expiry"></div>
            <div id="license-activated-at"></div>
        `;

        window.i18n = {
            t: jest.fn((key, params = {}) => {
                if (key === 'upgrade.plans.monthly.name') return '月度 Pro';
                if (key === 'upgrade.plans.annual.name') return '年度 Pro';
                if (key === 'upgrade.status.activated') return '已激活';
                if (key === 'upgrade.status.expiry') return '有效期至:';
                if (key === 'upgrade.status.expiry_lifetime') return '长期有效';
                if (key === 'upgrade.status.subscription_active') return '订阅有效';
                if (key === 'upgrade.status.days_remaining') return `剩余 ${params.days} 天`;
                if (key === 'common.status.processing') return '处理中';
                return key;
            })
        };

        window.mediaflow = {
            license: {
                getHWID: jest.fn().mockResolvedValue('HWID-TEST-123')
            },
            app: {
                isPackaged: jest.fn().mockResolvedValue(false)
            }
        };
    });

    afterEach(() => {
        jest.resetModules();
        delete window.LicenseManager;
        delete window.FeatureFlags;
        delete window.mediaflow;
        delete window.i18n;
    });

    test('includes editor in Pro page list via FeatureFlags', () => {
        require('../../../src/core/featureFlags.js');
        require('../../../src/features/common/LicenseManager.js');
        const manager = new window.LicenseManager({ router: {}, showToast: jest.fn() });
        // Matches FeatureFlags.PRO_PAGES (nav locks).
        expect(manager._mf_p_ids).toEqual(
            expect.arrayContaining(['creator', 'editor', 'subtitle', 'mobile'])
        );
        // Full product: enhance is not a nav Pro page (IPC withPro). Community lists enhance as Pro-only page.
        const edition = window.FeatureFlags?.EDITION || 'full';
        if (edition === 'community') {
            expect(manager._mf_p_ids).toContain('enhance');
        } else {
            expect(manager._mf_p_ids).not.toContain('enhance');
        }
    });

    test('shows estimated remaining days for monthly subscriptions without explicit expiry', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-04-10T00:00:00.000Z'));

        require('../../../src/core/featureFlags.js');
        require('../../../src/features/common/LicenseManager.js');
        const manager = new window.LicenseManager({ router: {}, showToast: jest.fn() });

        manager.updateLicenseUI({
            isPro: true,
            email: 'user@example.com',
            planType: 'monthly',
            productName: 'MediaFlow Pro - Monthly',
            variantId: 1463945,
            activatedAt: '2026-04-01T00:00:00.000Z',
            estimatedExpiry: '2026-05-01T00:00:00.000Z'
        });

        expect(document.getElementById('pro-expiry').textContent).toContain('剩余 21 天');
        expect(document.getElementById('pro-expiry').textContent).not.toContain('长期有效');
        expect(document.getElementById('license-status-badge').textContent).toBe('月度 Pro');
        expect(document.getElementById('license-plan-type').textContent).toBe('monthly');
        expect(document.getElementById('license-variant-id').textContent).toBe('1463945');
        expect(document.getElementById('license-product-name').textContent).toBe('MediaFlow Pro - Monthly');
        expect(document.getElementById('license-expiry-raw').textContent).toBe('-');
        expect(document.getElementById('license-estimated-expiry').textContent).toBe('2026-05-01T00:00:00.000Z');
        expect(document.getElementById('license-activated-at').textContent).toBe('2026-04-01T00:00:00.000Z');

        jest.useRealTimers();
    });

    test('hides diagnostics panel in packaged builds', async () => {
        window.mediaflow.app.isPackaged.mockResolvedValue(true);

        require('../../../src/features/common/LicenseManager.js');
        const manager = new window.LicenseManager({ router: {}, showToast: jest.fn() });

        await manager.updateDevOnlyVisibility();

        expect(document.getElementById('license-diagnostics-panel').classList.contains('hidden')).toBe(true);
    });
});
