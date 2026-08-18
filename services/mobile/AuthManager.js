/**
 * MediaFlow - AuthManager
 * 手机互联 - 安全认证管理器
 */

const crypto = require('crypto');

class AuthManager {
    constructor() {
        this.pin = null;                        // 4-6位 PIN 码，null 表示不启用
        this.activeSessions = new Map();        // token -> { createdAt, lastAccess }
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 会话过期时间：24小时
        this.cleanupInterval = null;

        // PIN 暴力破解防护
        this.failedAttempts = 0;                // 连续失败次数
        this.lockoutUntil = 0;                  // 锁定截止时间戳
        this.MAX_ATTEMPTS = 5;                  // 最大失败次数
        this.LOCKOUT_DURATION = 300 * 1000;     // 锁定时长 300 秒

        // 启动定期会话清理
        this.startSessionCleanup();
    }

    /**
     * 启动定期会话清理任务
     */
    startSessionCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            for (const [token, session] of this.activeSessions) {
                if (now - session.lastAccess > this.sessionTimeout) {
                    this.activeSessions.delete(token);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.log(`[MobileFlow:Auth] Cleaned ${cleaned} expired sessions, active: ${this.activeSessions.size}`);
            }
        }, 60 * 60 * 1000); // 每小时执行

        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    /**
     * 设置 PIN 码
     * @param {string|null} pin 
     */
    setPin(pin) {
        this.pin = pin;
        console.log('[MobileFlow:Auth] PIN authentication', pin ? 'enabled' : 'disabled');
    }

    /**
     * 生成会话 Token
     */
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * 验证 PIN 并创建会话
     */
    verifyPinAndCreateSession(inputPin) {
        if (!this.pin) {
            return { success: true, token: null };
        }

        // 速率限制检查：防止暴力破解
        const now = Date.now();
        if (this.failedAttempts >= this.MAX_ATTEMPTS && now < this.lockoutUntil) {
            const remainingSeconds = Math.ceil((this.lockoutUntil - now) / 1000);
            console.warn(`[MobileFlow:Auth] PIN 尝试被锁定，剩余 ${remainingSeconds} 秒`);
            return { success: false, error: `尝试次数过多，请 ${remainingSeconds} 秒后重试`, locked: true };
        }

        if (inputPin === this.pin) {
            // 验证成功，重置计数
            this.failedAttempts = 0;
            this.lockoutUntil = 0;
            const token = this.generateToken();
            this.activeSessions.set(token, {
                createdAt: Date.now(),
                lastAccess: Date.now()
            });
            return { success: true, token };
        }

        // 失败计数
        this.failedAttempts++;
        if (this.failedAttempts >= this.MAX_ATTEMPTS) {
            this.lockoutUntil = now + this.LOCKOUT_DURATION;
            console.warn(`[MobileFlow:Auth] PIN 失败 ${this.MAX_ATTEMPTS} 次，锁定 ${this.LOCKOUT_DURATION / 1000} 秒`);
        }

        return { success: false, error: 'PIN 码错误' };
    }

    /**
     * 验证会话 Token
     */
    validateSession(token) {
        if (!this.pin) return true;
        if (!token) return false;

        const session = this.activeSessions.get(token);
        if (!session) return false;

        // 检查是否过期
        if (Date.now() - session.lastAccess > this.sessionTimeout) {
            this.activeSessions.delete(token);
            return false;
        }

        // 更新最后访问时间
        session.lastAccess = Date.now();
        return true;
    }

    /**
     * 认证中间件
     */
    getMiddleware() {
        return (req, res, next) => {
            if (!this.pin) return next();

            const token = req.cookies?.mf_token || req.headers['x-mf-token'] || req.query.token;

            if (this.validateSession(token)) {
                return next();
            }

            res.status(401).json({ success: false, error: '需要验证 PIN 码', requireAuth: true });
        };
    }

    /**
     * 挂载认证相关路由
     */
    mountRoutes(app) {
        // 检查是否需要 PIN 认证
        app.get('/api/auth/check', (req, res) => {
            const token = req.cookies?.mf_token || req.headers['x-mf-token'];
            res.json({
                requirePin: !!this.pin,
                authenticated: this.validateSession(token)
            });
        });

        // PIN 登录
        app.post('/api/auth/login', (req, res) => {
            const { pin } = req.body;
            const result = this.verifyPinAndCreateSession(pin);

            if (result.success && result.token) {
                res.cookie('mf_token', result.token, {
                    httpOnly: true,
                    maxAge: this.sessionTimeout,
                    sameSite: 'strict'
                });
            }

            res.json(result);
        });

        // 登出
        app.post('/api/auth/logout', (req, res) => {
            const token = req.cookies?.mf_token;
            if (token) {
                this.activeSessions.delete(token);
                res.clearCookie('mf_token');
            }
            res.json({ success: true });
        });
    }
}

module.exports = new AuthManager();
