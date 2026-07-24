/**
 * LicenseManager.js
 * Manages application license, activation, and pro features
 */

class LicenseManager {
    constructor(app) {
        this.app = app;
        this._mf_auth_v = false; // 闅愯棌鐨勬潈闄愮姸鎬?(Original: isPro)
        this._decoy_v_1 = true;  // 璇卞鍙橀噺锛氳瀵肩牬瑙ｈ€呰涓鸿繖鏄紑鍏?
        this._decoy_v_2 = false; // 璇卞鍙橀噺
        this._cachedHwid = null;
        this._dynamicLinks = {}; // Store dynamic payment links
        this._lastStatus = null; // Store last known license status
        // Pro page IDs — single source: src/core/featureFlags.js
        const flags = (typeof window !== 'undefined' && window.FeatureFlags) || null;
        this._mf_p_ids = flags?.PRO_PAGES
            ? [...flags.PRO_PAGES]
            : ['creator', 'editor', 'subtitle', 'mobile'];
    }

    // [Developer Tool] 瑷疆鐐?true 浠ュ湪闁嬬櫦鏅傝В閹栨墍鏈夊姛鑳?(鎵撳寘鍓嶅繀闋堣ō鐐?false)
    static DEV_BYPASS = false;
    static MONTHLY_VARIANT_ID = '1463945';
    static LIFETIME_VARIANT_ID = '1463941';

    async init() {
        await this.updateDevOnlyVisibility();
        await this.initLicenseSystem();
        
        // Listen for language changes to refresh license labels
        window.addEventListener('languageChanged', () => {
            console.log('[LicenseManager] Language changed, refreshing UI...');
            if (this._lastStatus) {
                this.updateLicenseUI(this._lastStatus);
            }
        });
    }

    async updateDevOnlyVisibility() {
        const diagnosticsPanel = document.getElementById('license-diagnostics-panel');
        if (!diagnosticsPanel) return;

        try {
            const isPackaged = await window.mediaflow?.app?.isPackaged?.();
            diagnosticsPanel.classList.toggle('hidden', !!isPackaged);
        } catch (error) {
            if (!String(error?.message || error).includes('No handler registered')) {
                console.warn('[LicenseManager] Failed to resolve packaged state for dev-only panels:', error);
            }
            diagnosticsPanel.classList.remove('hidden');
        }
    }

    /**
     * Initialize License System
     */
    async initLicenseSystem() {
        try {
            // Fast local render first to avoid UI blocking
            let status = await window.mediaflow.license.getStatus();
            console.log('[LicenseManager] Initial status received:', status);
            this._lastStatus = status;
            this.updateLicenseUI(status);

            // 🆕 过期预警：剩余 ≤7 天时每天提示一次
            if (status?.isPro) {
                try {
                    const expiry = this.getEffectiveExpiry(status);
                    if (expiry) {
                        const diffDays = Math.ceil((new Date(expiry) - new Date()) / 86400000);
                        if (diffDays > 0 && diffDays <= 7) {
                            const today = new Date().toISOString().split('T')[0];
                            const lastWarn = await window.mediaflow?.store.get('_expiryWarnDate');
                            if (lastWarn !== today) {
                                await window.mediaflow?.store.set('_expiryWarnDate', today);
                                this.app.showToast(
                                    window.i18n?.t('common.license.expiryWarning', { days: diffDays }) ||
                                    `Your Pro license expires in ${diffDays} day(s). Renew to avoid interruption.`,
                                    'warning'
                                );
                            }
                        }
                    }
                } catch (warnErr) {
                    console.warn('[License] Expiry warning check failed:', warnErr);
                }
            }

            // Silent server-side validation to block refunds and sync auto-renewals
            if (status && status.isPro) {
                window.mediaflow.license.validate().then((validResult) => {
                    // Overwrite UI if server revokes or changes expiry length
                    if (validResult && !validResult.isPro) {
                        this.updateLicenseUI(validResult);
                        this.app.showToast(window.i18n?.t('license.revoked') || 'Your Pro access has been revoked or expired.', 'error');
                    } else if (validResult) {
                        const shouldRefresh =
                            validResult.expiry !== status.expiry ||
                            validResult.estimatedExpiry !== status.estimatedExpiry ||
                            validResult.planType !== status.planType ||
                            validResult.variantId !== status.variantId ||
                            validResult.activatedAt !== status.activatedAt;

                        if (shouldRefresh) {
                            this.updateLicenseUI({ ...status, ...validResult }); // Sync UI with newly renewed date
                        }
                    }
                }).catch(e => console.error('[License] Async validation check failed:', e));
            }
        } catch (e) {
            console.error('License init failed:', e);
        }

        // Bind events
        document.getElementById('btn-activate-license')?.addEventListener('click', () => {
            const modal = document.getElementById('license-modal');
            modal?.classList.remove('hidden');
            // Get and show HWID
            this.showHWID();
        });

        document.getElementById('btn-close-license-modal')?.addEventListener('click', () => {
            document.getElementById('license-modal')?.classList.add('hidden');
        });

        document.getElementById('btn-cancel-license')?.addEventListener('click', () => {
            document.getElementById('license-modal')?.classList.add('hidden');
        });

        document.getElementById('btn-copy-hwid')?.addEventListener('click', async () => {
            const hwidInput = document.getElementById('input-hwid');
            if (!hwidInput) return;
            hwidInput.select();
            document.execCommand('copy');
            this.app.showToast(window.i18n?.t('license.machineCodeCopied') || 'Machine code copied', 'success');
        });

        document.getElementById('btn-submit-license')?.addEventListener('click', async () => {
            const key = document.getElementById('input-license-key')?.value?.trim();
            if (!key) {
                this.showLicenseError(window.i18n?.t('common.license.activation.error') || 'Please enter license key');
                return;
            }

            try {
                this.showLicenseError(''); // Clear error
                const btn = document.getElementById('btn-submit-license');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = window.i18n?.t('common.license.activation.loading') || 'Activating...';
                }

                const result = await window.mediaflow.license.activate(key);

                if (btn) {
                    btn.disabled = false;
                    btn.textContent = window.i18n?.t('common.license.activation.submit') || 'Activate';
                }

                if (result?.success) {
                    this.app.showToast(window.i18n?.t('common.license.activation.success') || 'Activation successful!', 'success');
                    document.getElementById('license-modal')?.classList.add('hidden');
                    // Compatible with both flat and payload structures
                    const expiry = result.expiry || (result.payload && result.payload.expiry);
                    const email = result.email || (result.payload && result.payload.email);
                    const productName = result.productName || (result.payload && result.payload.productName);
                    const variantId = result.variantId || (result.payload && result.payload.variantId);
                    const activatedAt = result.activatedAt || (result.payload && result.payload.activatedAt);
                    this.updateLicenseUI({ 
                        isPro: true, 
                        expiry: expiry, 
                        email: email,
                        productName: productName,
                        variantId: variantId,
                        activatedAt: activatedAt
                    });
                } else {
                    const err = result?.error || 'Unknown error';
                    this.showLicenseError((window.i18n?.t('common.license.activation.failed', { error: err }) || 'Activation failed: ' + err));
                }
            } catch (e) {
                console.error(e);
                this.showLicenseError((window.i18n?.t('common.license.activation.systemError', { error: e.message }) || 'System error: ' + e.message));
                const btn = document.getElementById('btn-submit-license');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = window.i18n?.t('common.license.activation.submit') || 'Activate';
                }
            }
        });

        document.getElementById('btn-buy-lifetime')?.addEventListener('click', () => {
            window.mediaflow.shell.openExternal(this.getPurchaseLink());
        });

        document.getElementById('btn-show-activate')?.addEventListener('click', () => {
            const modal = document.getElementById('license-modal');
            modal?.classList.remove('hidden');
            this.showHWID();
        });


        // Purchase / extra license buttons
        document.getElementById('btn-renew-show')?.addEventListener('click', () => {
            window.mediaflow.shell.openExternal(this.getPurchaseLink());
        });

        document.getElementById('btn-activate-new')?.addEventListener('click', () => {
            const modal = document.getElementById('license-modal');
            modal.classList.remove('hidden');
            this.showHWID();
        });

        // 缁熶竴鎷︽埅渚ц竟鏍忕偣鍑婚€昏緫 (濡傛灉鍔熻兘琚攣瀹?
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const pageId = item.dataset.page;
                if (this._mf_p_ids.includes(pageId) && !this.checkFeatureAccess()) {
                    // 鎷︽埅骞惰烦杞埌鍗囩骇椤甸潰
                    e.preventDefault();
                    e.stopPropagation();
                    this.app.router?.switchPage('upgrade');
                    this.app.showToast(window.i18n?.t('common.proFeatureMsg') || 'Unlock Pro features for the complete experience.', 'warning');
                }
            }, true); // 浣跨敤 Capture 闃舵纭繚鎷︽埅
        });

        // Fetch dynamic pricing
        this.fetchPricingConfig();
    }

    /**
     * Fetch dynamic pricing configuration
     * Allows changing prices without app updates
     */
    async fetchPricingConfig() {
        try {
            // Priority 1: Try local config first (Fast & Reliable)
            const localData = await window.mediaflow.app.getPricingConfig();
            if (localData) {
                this.updatePricingUI(localData);
            }

            // Priority 2: Try remote config via Main Process (SILENT, no console ERR)
            const remoteData = await window.mediaflow.app.fetchRemotePricing();
            if (remoteData) {
                this.updatePricingUI(remoteData);
            }
        } catch {
            // Completely silent
        }
    }

    updatePricingUI(data) {
        if (!data) return;

        // Purchase UI: lifetime only (no monthly/annual checkout).
        // Legacy annual/monthly keys are still recognized by resolvePlanType for existing licenses.
        const lifetimePrice = data.lifetime;
        const lifetimeLink = data.lifetimeLink;

        if (lifetimeLink) {
            this._dynamicLinks = {
                lifetime: lifetimeLink
            };
        }

        const lifetimePriceEl = document.querySelector('[data-i18n="upgrade.plans.lifetime.price"]');
        if (lifetimePriceEl && lifetimePrice) lifetimePriceEl.textContent = lifetimePrice;

        if (data.currency) {
            document.querySelectorAll('.price-currency').forEach(el => el.textContent = data.currency);
        }

        const badge = document.querySelector('.card-badge');
        if (badge && data.badge) badge.textContent = data.badge;
    }

    /** Single live Lemon checkout (Pro Lifetime). */
    getPurchaseLink() {
        return (
            this._dynamicLinks?.lifetime ||
            'https://mediaflowservice.lemonsqueezy.com/checkout/buy/9fc1f7c2-9916-4a62-81fd-1959865d56c6'
        );
    }

    /**
     * 瀹夊叏鐨勬牳蹇冩潈闄愭牎楠屾柟娉?
     * 閬垮厤鐩存帴璇诲彇鍙橀噺锛屽鍔犳牎楠屽己搴?
     */
    checkFeatureAccess() {
        // [Dev Bypass] 闁嬬櫦鐠板鍎厛
        if (LicenseManager.DEV_BYPASS) return true;

        // 澶氶噸鐙€鎱嬫牎椹楋紝闃叉鍠竴璁婇噺琚収瀛樹慨鏀?
        const s1 = this._mf_auth_v === true;
        const s2 = this._decoy_v_1 !== this._decoy_v_2;
        // 瀵﹂殯涓婂彲浠ュ皪鎺?Native 灞ょ殑绨藉悕椹楄瓑
        return s1 && s2;
    }

    get isPro() {
        return this.checkFeatureAccess();
    }

    async showHWID() {
        const input = document.getElementById('input-hwid');
        if (!input) return;
        try {
            const hwid = await window.mediaflow.license.getHWID();
            input.value = hwid || 'Unknown';
        } catch {
            input.value = 'Error';
        }
    }

    showLicenseError(msg) {
        const el = document.getElementById('license-error-msg');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    getPlanNameTranslation(key, fallback) {
        const translated = window.i18n?.t(key);
        if (!translated || translated === key) return fallback;
        return translated;
    }

    resolvePlanType(status) {
        if (!status) return 'free';
        if (status.planType) return status.planType;

        const variantId = status.variantId ? status.variantId.toString() : '';
        const productName = (status.productName || '').toLowerCase();

        if (variantId === LicenseManager.MONTHLY_VARIANT_ID) return 'monthly';
        if (variantId === LicenseManager.LIFETIME_VARIANT_ID) return 'lifetime';

        if (productName.includes('monthly') || productName.includes('month')) {
            return 'monthly';
        }

        if (productName.includes('yearly') || productName.includes('annual')) {
            return 'annual';
        }

        return 'lifetime';
    }

    getEffectiveExpiry(status) {
        if (!status) return null;
        if (status.expiry) return status.expiry;
        if (status.estimatedExpiry) return status.estimatedExpiry;

        const planType = this.resolvePlanType(status);
        if (!status.activatedAt || (planType !== 'monthly' && planType !== 'annual')) {
            return null;
        }

        const estimatedExpiry = new Date(status.activatedAt);
        if (Number.isNaN(estimatedExpiry.getTime())) return null;

        if (planType === 'monthly') {
            estimatedExpiry.setMonth(estimatedExpiry.getMonth() + 1);
        } else {
            estimatedExpiry.setFullYear(estimatedExpiry.getFullYear() + 1);
        }

        return estimatedExpiry.toISOString();
    }

    getExpiryDateText(status) {
        const effectiveExpiry = this.getEffectiveExpiry(status);
        if (effectiveExpiry) {
            const expDate = new Date(effectiveExpiry);
            const diffDays = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
            const daysLeftStr = window.i18n?.t('upgrade.status.days_remaining', { days: diffDays }) || `(Remaining ${diffDays} days)`;

            if (diffDays > 0) {
                return `${expDate.toLocaleDateString()} ${daysLeftStr}`;
            }
        }

        const planType = this.resolvePlanType(status);
        if (planType === 'monthly' || planType === 'annual') {
            return window.i18n?.t('upgrade.status.subscription_active') || 'Access Active';
        }

        return window.i18n?.t('upgrade.status.expiry_lifetime') || 'Lifetime';
    }

    formatDiagnosticValue(value) {
        if (value === null || value === undefined || value === '') return '-';
        return String(value);
    }

    updateLicenseDiagnostics(status) {
        const planTypeMap = {
            monthly: 'monthly',
            annual: 'annual',
            lifetime: 'lifetime',
            free: 'free'
        };

        const planTypeEl = document.getElementById('license-plan-type');
        const variantIdEl = document.getElementById('license-variant-id');
        const productNameEl = document.getElementById('license-product-name');
        const expiryRawEl = document.getElementById('license-expiry-raw');
        const estimatedExpiryEl = document.getElementById('license-estimated-expiry');
        const activatedAtEl = document.getElementById('license-activated-at');

        if (planTypeEl) planTypeEl.textContent = this.formatDiagnosticValue(planTypeMap[this.resolvePlanType(status)] || this.resolvePlanType(status));
        if (variantIdEl) variantIdEl.textContent = this.formatDiagnosticValue(status?.variantId);
        if (productNameEl) productNameEl.textContent = this.formatDiagnosticValue(status?.productName);
        if (expiryRawEl) expiryRawEl.textContent = this.formatDiagnosticValue(status?.expiry);
        if (estimatedExpiryEl) estimatedExpiryEl.textContent = this.formatDiagnosticValue(this.getEffectiveExpiry(status));
        if (activatedAtEl) activatedAtEl.textContent = this.formatDiagnosticValue(status?.activatedAt);
    }

    updateLicenseUI(status) {
        console.log('[LicenseManager] Updating UI with status:', status);
        this._lastStatus = status;
        this._mf_auth_v = !!(status && status.isPro);
        console.log('[LicenseManager] Feature access set to:', this._mf_auth_v);

        const badge = document.getElementById('license-status-badge');
        const info = document.getElementById('license-info-text');
        const details = document.getElementById('license-details');
        const btn = document.getElementById('btn-activate-license');
        const upgradeNotActivated = document.getElementById('upgrade-not-activated');
        const upgradeActivated = document.getElementById('upgrade-activated');
        const licenseStatusContainer = document.getElementById('license-status-container');
        const appTitle = document.getElementById('app-title');
        const sidebarUpgrade = document.querySelector('.nav-item-upgrade');

        if (licenseStatusContainer) {
            licenseStatusContainer.style.display = 'none';
        }

        if (this.checkFeatureAccess()) {
            const proLabel = window.i18n?.t('upgrade.status.activated') || 'PRO Version';
            const devLabel = 'PRO Developer';

            if (badge) {
                if (LicenseManager.DEV_BYPASS) {
                    badge.textContent = devLabel;
                    badge.className = 'badge badge-pro';
                    badge.style.background = 'linear-gradient(45deg, #8e44ad, #2f5fad)';
                } else {
                    let finalLabel = proLabel;
                    const planType = this.resolvePlanType(status);
                    const vid = status.variantId ? status.variantId.toString() : '';
                    const name = (status.productName || '').toLowerCase();
                    console.log(`[LicenseManager] Identification - VID: "${vid}", Name: "${name}"`);

                    if (planType === 'monthly' || vid === LicenseManager.MONTHLY_VARIANT_ID) {
                        finalLabel = this.getPlanNameTranslation('upgrade.plans.monthly.name', 'Legacy Monthly Pro');
                    } else if (planType === 'lifetime' || vid === LicenseManager.LIFETIME_VARIANT_ID || name.includes('lifetime') || name.includes('permanent') || name.includes('one-time')) {
                        finalLabel = this.getPlanNameTranslation('upgrade.plans.lifetime.name', 'Pro Lifetime');
                    } else if (name.includes('yearly') || name.includes('annual')) {
                        finalLabel = this.getPlanNameTranslation('upgrade.plans.annual.name', 'Legacy Annual Pro');
                    } else if (status.productName) {
                        finalLabel = status.productName;
                    }

                    badge.textContent = finalLabel;
                    badge.className = 'badge badge-pro';
                    badge.style.background = 'linear-gradient(45deg, #f39c12, #e67e22)';

                    const proPlanBadge = document.getElementById('pro-plan-name');
                    if (proPlanBadge) proPlanBadge.textContent = finalLabel;
                }
            }

            const expiryDateText = this.getExpiryDateText(status);

            if (info) {
                const expiryMsg = window.i18n?.t('upgrade.status.expiry') || 'Valid until:';
                const displayPlanName = (badge && badge.textContent && badge.textContent !== proLabel)
                    ? badge.textContent
                    : proLabel;
                info.textContent = `${displayPlanName} ${expiryMsg} ${expiryDateText}`;
                info.style.color = '#f39c12';
            }

            const loadingText = window.i18n?.t('common.status.processing') || 'Loading...';
            const displayHwid = status.hwid || this._cachedHwid || loadingText;
            if (details) {
                details.textContent = `ID: ${status.email || 'N/A'}\nHWID: ${displayHwid}`;
                details.classList.remove('hidden');
            }

            if (!status.hwid && !this._cachedHwid) {
                window.mediaflow.license.getHWID().then(hwid => {
                    this._cachedHwid = hwid;
                    if (details) {
                        details.textContent = `ID: ${status.email || 'N/A'}\nHWID: ${hwid || 'N/A'}`;
                    }
                });
            }

            if (btn) btn.style.display = 'none';
            if (upgradeNotActivated) upgradeNotActivated.classList.add('hidden');
            if (upgradeActivated) {
                upgradeActivated.classList.remove('hidden');
                const proEmail = document.getElementById('pro-email');
                const proExpiry = document.getElementById('pro-expiry');
                if (proEmail) proEmail.textContent = status.email || '-';
                if (proExpiry) proExpiry.textContent = expiryDateText;
                this.updateLicenseDiagnostics(status);
            }

            if (appTitle) {
                const isCommunity = window.FeatureFlags?.EDITION === 'community';
                if (isCommunity) {
                    appTitle.textContent = 'MediaFlow Community';
                } else {
                    const suffix = LicenseManager.DEV_BYPASS ? ' (Dev Mode)' : ' Pro';
                    appTitle.textContent = 'MediaFlow' + suffix;
                }
            }

            this.updateUpgradeNavLabel(true);
            if (sidebarUpgrade) sidebarUpgrade.style.display = 'flex';
        } else {
            if (badge) {
                const communityLabel =
                    window.i18n?.t('upgrade.plans.community.name') ||
                    window.i18n?.t('upgrade.plans.free.name') ||
                    'Community';
                badge.textContent = communityLabel;
                badge.className = 'badge badge-free';
                badge.style.background = '#52525b';
            }

            if (info) {
                info.textContent =
                    window.i18n?.t('common.communityVersionMsg') ||
                    window.i18n?.t('common.freeVersionMsg') ||
                    'Community edition: single capture, transcribe, compress. Upgrade to Pro for batch, queue, and advanced workflows.';
                info.style.color = 'var(--text-secondary)';
            }

            if (details) details.classList.add('hidden');
            if (btn) btn.style.display = 'block';
            if (upgradeNotActivated) upgradeNotActivated.classList.remove('hidden');
            if (upgradeActivated) upgradeActivated.classList.add('hidden');
            if (appTitle) {
                appTitle.textContent =
                    window.FeatureFlags?.EDITION === 'community'
                        ? 'MediaFlow Community'
                        : 'MediaFlow';
            }
            this.updateUpgradeNavLabel(false);
            if (sidebarUpgrade) sidebarUpgrade.style.display = '';
        }

        // Native window title (frameless apps still show this in taskbar / alt-tab)
        try {
            const isCommunity = window.FeatureFlags?.EDITION === 'community';
            const title = isCommunity
                ? 'MediaFlow Community'
                : this.checkFeatureAccess()
                    ? 'MediaFlow Pro'
                    : 'MediaFlow';
            document.title = title;
            window.mediaflow?.window?.setTitle?.(title);
        } catch (_) {}

        this.updateSidebarLockState();
    }

    /**
     * Bottom nav: "升级 Pro" when Community, "Pro 已激活" when licensed.
     * Avoid spamming PRO on every feature item for paid users.
     */
    updateUpgradeNavLabel(isPro) {
        const item = document.querySelector('.nav-item-upgrade');
        if (!item) return;
        const label =
            item.querySelector('[data-i18n="nav.upgrade"]') ||
            item.querySelector('span:not(.nav-pro-badge):not(.nav-pro-lock)');
        if (!label) return;

        if (isPro) {
            label.textContent =
                window.i18n?.t('nav.upgradeActive') ||
                window.i18n?.t('upgrade.status.activated') ||
                'Pro 已激活';
            label.removeAttribute('data-i18n'); // prevent i18n from overwriting with "升级 Pro"
            item.classList.add('nav-upgrade-active');
            item.title = window.i18n?.t('nav.upgradeActiveHint') || 'View license';
        } else {
            label.setAttribute('data-i18n', 'nav.upgrade');
            label.textContent = window.i18n?.t('nav.upgrade') || 'Upgrade to Pro';
            item.classList.remove('nav-upgrade-active');
            item.removeAttribute('title');
        }
    }

    /**
     * Community only: subtle lock on Pro pages (no wall of PRO badges when already licensed).
     */
    updateSidebarLockState() {
        const isPro = this.checkFeatureAccess();
        const proPages = this._mf_p_ids || [];

        document.querySelectorAll('.nav-item').forEach((item) => {
            const pageId = item.dataset.page;
            if (!pageId || !proPages.includes(pageId)) return;

            item.setAttribute('data-pro', 'true');

            // Remove legacy PRO chips when licensed (or never show spam for Pro users)
            const oldBadge = item.querySelector('.nav-pro-badge');
            if (oldBadge) oldBadge.remove();

            let lock = item.querySelector('.nav-pro-lock');
            if (!isPro) {
                if (!lock) {
                    lock = document.createElement('span');
                    lock.className = 'nav-pro-lock';
                    lock.setAttribute('aria-hidden', 'true');
                    lock.innerHTML =
                        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
                    item.appendChild(lock);
                }
                item.classList.add('locked-feature');
                item.title =
                    window.i18n?.t('common.proFeatureMsg') ||
                    'Pro feature — upgrade to unlock';
            } else {
                if (lock) lock.remove();
                item.classList.remove('locked-feature');
                if (item.getAttribute('title') && /pro|升级|unlock|功能/i.test(item.getAttribute('title') || '')) {
                    item.removeAttribute('title');
                }
            }
        });
    }
}

window.LicenseManager = LicenseManager;



