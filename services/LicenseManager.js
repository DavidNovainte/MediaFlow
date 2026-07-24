const axios = require('axios'); // Ensure axios is available or use fetch
const Store = require('electron-store');
const { getHWID } = require('../src/utils/hwid');

class LicenseManager {
    constructor() {
        this.store = null;
        // LemonSqueezy config
        // SALES (current): one Lifetime checkout only — see pricing.json lifetimeLink.
        // LEGACY: MONTHLY_VARIANT_ID kept so old keys still activate & display correctly.
        this.API_URL = 'https://api.lemonsqueezy.com/v1';
        this.STORE_ID = '';
        this.PRODUCT_ID = 931129;
        /** @deprecated Do not sell — only accept existing keys */
        this.MONTHLY_VARIANT_ID = 1463945;
        /** Current Pro Lifetime variant */
        this.LIFETIME_VARIANT_ID = 1463941;
        // Accept product id + lifetime + legacy monthly (activation only)
        this.PRODUCT_IDS = [this.PRODUCT_ID, this.LIFETIME_VARIANT_ID, this.MONTHLY_VARIANT_ID];
    }

    init(store) {
        this.store = store;
        console.log('[LicenseManager] Initialized');
    }

    /**
     * Activate a license key
     * @param {string} licenseKey 
     * @param {string} instanceName 
     * @returns {Promise<{success: boolean, isPro: boolean, message: string, expiry: string|null}>}
     */
    async activate(licenseKey, instanceName = 'MediaFlow-Desktop') {
        if (!licenseKey) return { success: false, message: 'Invalid license key' };
        licenseKey = licenseKey.trim();

        // [寮€鍙戠幆澧冧笓鐢╙ 浠呭湪寮€鍙戣€呮湰鍦扮粓绔繍琛?"npm run dev" 鎴?"electron ." 鏃剁敓鏁?
        // 涓€鏃﹂€氳繃 electron-builder 鎵撳寘鎴?exe/dmg/AppImage, app.isPackaged 灏变細姘镐箙鍙樻垚 true, 杩欐浠ｇ爜绛変簬浣滃簾銆?
        const { app } = require('electron');
        if (licenseKey.toUpperCase().startsWith('TEST-') && app && !app.isPackaged) {
            console.log('[LicenseManager] Developer test license bypass enabled.');
            const mockExpiry = new Date();
            mockExpiry.setFullYear(mockExpiry.getFullYear() + 1);
            const licenseData = {
                key: licenseKey,
                isPro: true,
                status: 'active',
                expiry: mockExpiry.toISOString(),
                instanceId: 'dev-local-instance',
                customerEmail: 'dev@studio.local'
            };
            this.saveLicense(licenseData);
            return { success: true, isPro: true, message: 'Developer Test License Activated', expiry: licenseData.expiry };
        }

        // 绾噣楠岃瘉锛氱洿鎺ヨ蛋鍚戠湡姝ｇ殑 LemonSqueezy 鍚庣婵€娲?
        // REAL ACTIVATION (LemonSqueezy)
        try {
            // Docs: https://docs.lemonsqueezy.com/api/licenses#activate-a-license-key
            const response = await axios.post(`${this.API_URL}/licenses/activate`, {
                license_key: licenseKey,
                instance_name: instanceName
            }, {
                headers: { 'Accept': 'application/json' }
            });

            // Check verified status
            if (response.data && response.data.activated) {
                console.log('[LicenseManager] Activation Response Data:', JSON.stringify(response.data, null, 2));
                const meta = response.data.meta;
                const license = response.data.license_key;

                // Security Check: Verify Product ID
                // Prevent using keys from other products
                // Check both product_id and variant_id for flexibility
                const vid = meta.variant_id;
                const pid = meta.product_id;
                if (!this.PRODUCT_IDS.includes(pid) && !this.PRODUCT_IDS.includes(vid)) {
                    console.error(`[LicenseManager] Security Alert: Key mismatch! PID:${pid}, VID:${vid}. Expected one of: ${this.PRODUCT_IDS}`);
                    return { success: false, message: 'Activation Result: Invalid Product Key (Mismatch)' };
                }

                const licenseData = {
                    key: licenseKey,
                    isPro: true,
                    status: 'active',
                    expiry: license.expires_at, // Could be null if lifetime
                    instanceId: response.data.instance.id,
                    customerEmail: meta.customer_email,
                    customerName: meta.customer_name,
                    productName: meta.product_name,
                    variantId: meta.variant_id || license.variant_id || license.product_id, 
                    activatedAt: new Date().toISOString()
                };

                this.saveLicense(licenseData);
                console.log(`[LicenseManager] Real license activated: ${meta.product_name}`);

                return {
                    success: true,
                    isPro: true,
                    message: 'Activation Successful',
                    expiry: licenseData.expiry,
                    estimatedExpiry: this.getEstimatedExpiry(licenseData),
                    email: licenseData.customerEmail,
                    productName: licenseData.productName,
                    variantId: licenseData.variantId,
                    activatedAt: licenseData.activatedAt,
                    planType: this.resolvePlanType(licenseData)
                };
            } else {
                const errorMsg = response.data.error || 'Activation failed: Invalid Key';
                return { success: false, message: errorMsg, error: errorMsg };
            }
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            console.error('[LicenseManager] Activation error details:', error.response?.data || error); // Detailed log

            return { success: false, message: `Activation Error: ${errorMsg}`, error: errorMsg };
        }
    }

    /**
     * 鍙栨秷婵€娲诲綋鍓嶈鍙瘉
     * 璋冪敤 LemonSqueezy deactivate API 閲婃斁璁惧鍚嶉
     */
    async deactivate() {
        const current = this.getLicense();
        if (!current || !current.key) return { success: true };

        // 濡傛灉鏄湡瀹炶鍙瘉锛岃皟鐢?LemonSqueezy API 鍙栨秷婵€娲?
        if (current.instanceId && current.instanceId !== 'test-instance-id') {
            try {
                const response = await axios.post(`${this.API_URL}/licenses/deactivate`, {
                    license_key: current.key,
                    instance_id: current.instanceId
                }, {
                    headers: { 'Accept': 'application/json' }
                });

                if (response.data && response.data.deactivated) {
                    console.log('[LicenseManager] License deactivated remotely.');
                } else {
                    console.warn('[LicenseManager] Unexpected deactivate response.', response.data);
                }
            } catch (error) {
                console.error('[LicenseManager] Deactivate API failed:', error.response?.data || error.message);
                // 鍗充娇 API 澶辫触锛屼粛鐒舵竻闄ゆ湰鍦版暟鎹紙鐢ㄦ埛鍙兘宸茬绾匡級
            }
        }

        this.store.delete('license_data');
        this.store.delete('isPro');
        return { success: true, message: 'Deactivated' };
    }

    /**
     * Validate current license with the server
     * Plugs the vulnerability of local clock modification and refunded purchases.
     */
    async validate() {
        const current = this.getLicense();
        if (!current || !current.key) return { success: false, message: 'No license to validate' };
        
        // [寮€鍙戠幆澧冧笓鐢╙ 鎷︽埅闈欓粯楠岃瘉
        const { app } = require('electron');
        if (current.key.toUpperCase().startsWith('TEST-') && app && !app.isPackaged) {
            return { success: true, isPro: true, expiry: current.expiry, message: 'Developer Test Mode Validated' };
        }

        // 娌℃湁浠讳綍鍚庨棬锛屾墍鏈夊瘑閽ュ繀椤诲湪鏈嶅姟鍣ㄥ緱鍒扮‘璁?
        try {
            const response = await axios.post(`${this.API_URL}/licenses/validate`, {
                license_key: current.key,
                instance_id: current.instanceId || ''
            }, {
                headers: { 'Accept': 'application/json' }
            });

            if (response.data && response.data.valid) {
                const meta = response.data.meta;
                const license = response.data.license_key;

                // Sync the latest expiration timestamp and data from LemonSqueezy
                const licenseData = {
                    ...current,
                    status: license.status,
                    expiry: license.expires_at,
                    customerName: meta.customer_name,
                    customerEmail: meta.customer_email,
                    productName: meta.product_name,
                    variantId: meta.variant_id || license.variant_id || license.product_id // 鏀寔鑷姩琛ュ叏缂哄け鐨勫彉浣?ID
                };

                this.saveLicense(licenseData);
                console.log(`[LicenseManager] License validated remotely. Status: ${license.status}, Expiry: ${license.expires_at || 'Lifetime/Never'}`);
                
                return {
                    success: true,
                    isPro: true,
                    expiry: license.expires_at,
                    estimatedExpiry: this.getEstimatedExpiry(licenseData),
                    email: meta.customer_email,
                    productName: meta.product_name,
                    variantId: meta.variant_id || license.variant_id || license.product_id,
                    activatedAt: licenseData.activatedAt,
                    planType: this.resolvePlanType(licenseData),
                    message: 'License Validated'
                };
            } else {
                console.warn(`[LicenseManager] Validation failed: Server returned invalid status. License revoked.`);
                // 褰诲簳鍚婇攢鏈湴鎺堟潈
                this.store.delete('license_data');
                this.store.delete('isPro');
                
                // Return the fully refreshed status payload after revoking local access.
                return await this.getStatus();
            }
        } catch (error) {
            console.error('[LicenseManager] Validation request failed:', error?.response?.data || error.message);
            // 鍖哄垎鏂綉鎯呭喌鍜岃灏佸彿鎯呭喌
            // 只有明确拒绝 (401/403/404) 才清除本地许可证。
            // 408/429/423 等临时错误不应消除用户的 Pro 状态。
            if (error.response && [401, 403, 404].includes(error.response.status)) {
                 console.warn('[LicenseManager] Terminal API error. Clearing local state.');
                 this.store.delete('license_data');
                 this.store.delete('isPro');
                 return await this.getStatus();
            }
            // 鏂綉鎴朙emonSqueezy鎸備簡锛屾殏鏃舵斁琛岋紝渚濊禆鍘熸湁鐨勬湰鍦?expiry date 鍙栨秷鏈哄埗
            return await this.getStatus();
        }
    }

    /**
     * Get current license status
     */
    async getStatus() {
        if (!this.store) {
            const Store = require('electron-store');
            this.store = new Store();
        }

        const data = this.getLicense();

        // 1. Check if activated Pro
        if (data && data.isPro) {
            let expired = false;
            if (data.expiry) {
                const now = new Date();
                const exp = new Date(data.expiry);
                if (now > exp) {
                    expired = true;
                }
            }

            if (!expired) {
                const planType = this.resolvePlanType(data);
                let isAnnual = planType === 'annual';
                if (data.expiry && data.activatedAt) {
                    // 濡傛灉娌℃湁杩囨湡鏃ユ湡锛屼笖娌℃湁鍙樹綋 ID 鎴栬€?ID 鍖归厤骞村害锛屽垯璁や负鏄案涔呯増
                    const activated = new Date(data.activatedAt);
                    const expiryDate = new Date(data.expiry);
                    if (!Number.isNaN(activated.getTime()) && !Number.isNaN(expiryDate.getTime())) {
                        const days = (expiryDate.getTime() - activated.getTime()) / (1000 * 60 * 60 * 24);
                        if (days > 300) isAnnual = true;
                    }
                } else {
                    isAnnual = false;
                }

                return {
                    isPro: true,
                    isAnnual: isAnnual,
                    isLifetime: planType === 'lifetime',
                    expiry: data.expiry,
                    estimatedExpiry: this.getEstimatedExpiry(data),
                    email: data.customerEmail,
                    productName: data.productName,
                    variantId: data.variantId,
                    activatedAt: data.activatedAt,
                    planType: planType
                };
            }
        }

        return {
            isPro: false,
            isAnnual: false,
            isLifetime: false,
            expiry: null,
            email: null,
            expired: false,
            planType: 'free'
        };
    }

    /**
     * Get HWID (Async)
     */
    async getMachineId() {
        return await getHWID();
    }

    // --- Internal Helpers ---

    saveLicense(data) {
        if (!this.store) return;
        this.store.set('license_data', data);
        this.store.set('isPro', data.isPro); // Sync backward compatibility
    }

    getLicense() {
        if (!this.store) return null;
        return this.store.get('license_data');
    }

    resolvePlanType(data) {
        if (!data) return 'free';

        const variantId = data.variantId ? data.variantId.toString() : '';
        const productName = (data.productName || '').toLowerCase();

        if (variantId === String(this.MONTHLY_VARIANT_ID)) return 'monthly';
        if (variantId === String(this.LIFETIME_VARIANT_ID)) return 'lifetime';

        if (productName.includes('monthly') || productName.includes('month')) {
            return 'monthly';
        }

        if (productName.includes('yearly') || productName.includes('annual')) {
            return 'annual';
        }

        if (data.expiry && data.activatedAt) {
            const activated = new Date(data.activatedAt);
            const expiryDate = new Date(data.expiry);
            if (!Number.isNaN(activated.getTime()) && !Number.isNaN(expiryDate.getTime())) {
                const days = (expiryDate.getTime() - activated.getTime()) / (1000 * 60 * 60 * 24);
                return days > 300 ? 'annual' : 'monthly';
            }
        }

        return 'lifetime';
    }

    getEstimatedExpiry(data, planType = this.resolvePlanType(data)) {
        if (!data) return null;
        if (data.expiry) return data.expiry;
        if (!data.activatedAt) return null;
        if (planType !== 'monthly' && planType !== 'annual') return null;

        const estimatedExpiry = new Date(data.activatedAt);
        if (Number.isNaN(estimatedExpiry.getTime())) return null;

        if (planType === 'monthly') {
            estimatedExpiry.setMonth(estimatedExpiry.getMonth() + 1);
        } else {
            estimatedExpiry.setFullYear(estimatedExpiry.getFullYear() + 1);
        }

        return estimatedExpiry.toISOString();
    }
}

module.exports = new LicenseManager();


