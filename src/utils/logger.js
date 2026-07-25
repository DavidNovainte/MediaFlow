/**
 * Logger.js
 * 负责应用日志记录，包括系统运行、用户操作及 FFmpeg 详细错误日志。
 *
 * Remote telemetry (Google Apps Script) is optional and loaded from:
 *   1. process.env.MEDIAFLOW_APPS_SCRIPT_URL / MEDIAFLOW_APPS_SCRIPT_TOKEN
 *   2. scripts/telemetry.local.js (gitignored)
 * If neither is configured, reporting is skipped.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('node:fs');

function loadTelemetryConfig() {
    const envUrl = process.env.MEDIAFLOW_APPS_SCRIPT_URL || '';
    const envToken = process.env.MEDIAFLOW_APPS_SCRIPT_TOKEN || '';
    if (envUrl && envToken) {
        return { url: envUrl, token: envToken, source: 'env' };
    }

    try {
        const localPath = path.join(__dirname, '..', '..', 'scripts', 'telemetry.local.js');
        if (fs.existsSync(localPath)) {
            // Clear cache so tests can swap the file
            delete require.cache[require.resolve(localPath)];
            const local = require(localPath);
            if (local?.url && local?.token) {
                return { url: local.url, token: local.token, source: 'local' };
            }
        }
    } catch {
        // ignore missing / invalid local telemetry config
    }

    return { url: '', token: '', source: 'none' };
}

class Logger {
    constructor() {
        // 在打包环境中获取 userData 路径，开发环境中获取当前目录
        try {
            this.logDir = path.join(app.getPath('userData'), 'logs');
        } catch {
            this.logDir = path.join(process.cwd(), 'logs');
        }

        this.reportingEnabled = true;
        this.logFile = path.join(this.logDir, `mediaflow_${new Date().toISOString().split('T')[0]}.log`);
        this._initDir();
    }

    _initDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    info(msg) { this._write('INFO', msg); }
    warn(msg) { this._write('WARN', msg); }
    error(msg) { this._write('ERROR', msg); }

    /**
     * 特殊记录：FFmpeg 命令行及其输出
     */
    ffmpeg(cmd, stderr) {
        let msg = `\n[FFmpeg Command]\n${cmd}\n[FFmpeg Stderr]\n${stderr}\n`;
        this._write('FFMPEG', msg);
    }

    _write(level, msg) {
        // 🛡️ 防爆截断：防止超长 JSON 或乱码导致内存泄漏/控制台卡死
        if (typeof msg === 'string' && msg.length > 5000) {
            msg = msg.substring(0, 2000) +
                `\n... [已拦截：内容过长，截断了 ${msg.length - 4000} 个字符] ...\n` +
                msg.substring(msg.length - 2000);
        }

        const timestamp = new Date().toLocaleString();
        const line = `[${timestamp}] [${level}] ${msg}\n`;
        // 生产环境下依然向控制台输出，便于调试
        console.log(line);
        try {
            fs.appendFileSync(this.logFile, line, 'utf8');
        } catch (e) {
            console.error('Failed to write log:', e);
        }
    }

    getLogPath() {
        return this.logFile;
    }

    /**
     * 全局接管并保护 console.log/warn/error，避免第三方库（如 yt-dlp）
     * 意外打印了 10MB+ 的文本直接导致终端假死。
     */
    setupGlobalConsoleAntiExplosion() {
        const MAX_LEN = 5000;
        const truncate = (args) => {
            return args.map(arg => {
                if (typeof arg === 'string' && arg.length > MAX_LEN) {
                    return arg.substring(0, 2000) +
                        `\n... [GLOBAL CONSOLE PROTECT: 隐藏了 ${arg.length - MAX_LEN} 字符] ...\n` +
                        arg.substring(arg.length - 2000);
                }
                return arg;
            });
        };

        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;

        console.log = (...args) => origLog.apply(console, truncate(args));
        console.warn = (...args) => origWarn.apply(console, truncate(args));
        console.error = (...args) => origError.apply(console, truncate(args));

        origLog('[Logger] Global console anti-explosion protection enabled.');
    }

    /**
     * 将日志上报到 Google Sheets（需配置 telemetry）
     * @param {Object} data 上报的数据对象
     */
    async reportToGoogleSheets(data) {
        if (!this.reportingEnabled) return { success: false, error: 'Reporting disabled' };

        const telemetry = loadTelemetryConfig();
        if (!telemetry.url || !telemetry.token) {
            return { success: false, error: 'Telemetry not configured' };
        }

        try {
            const axios = require('axios');
            // 构造上报 payload
            const payload = {
                timestamp: new Date().toISOString(),
                version: data.version || 'unknown',
                platform: process.platform,
                type: data.type || 'LOG',
                message: data.message || '',
                stack: data.stack || '',
                hwid: data.hwid || 'unknown',
                isPro: data.isPro || false,
                logs: data.logs ? JSON.stringify(data.logs) : '',
                token: telemetry.token
            };

            const response = await axios.post(telemetry.url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            const responseData = response?.data;
            if (typeof responseData === 'string') {
                const normalized = responseData.trim();
                if (/^error\s*:/i.test(normalized)) {
                    throw new Error(normalized);
                }

                if (normalized && normalized !== 'Success') {
                    throw new Error(`Unexpected Apps Script response: ${normalized}`);
                }
            } else if (responseData && typeof responseData === 'object' && responseData.success === false) {
                throw new Error(responseData.error || 'Apps Script rejected the report');
            }

            return { success: true };
        } catch (error) {
            this.error(`[Logger] Failed to report to Google Sheets: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// 导出单例
module.exports = new Logger();
