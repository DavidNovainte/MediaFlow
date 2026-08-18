const fs = require('fs');
const { spawn } = require('child_process');
const demucsHandler = require('../../audio/demucsHandler');

let cachedEdgePython = null;
const EDGE_RETRYABLE_ERROR_MARKERS = [
    'NoAudioReceived',
    'Service Unavailable',
    '503',
    'ClientConnectorError',
    'Timeout'
];
const EDGE_GENERATE_RETRY_DELAY_MS = 350;
const EDGE_GENERATE_MAX_RETRIES = 1;

class EdgeTTSHandler {
    runProcess(cmd, args, options = {}) {
        return new Promise((resolve) => {
            const { timeoutMs = 15000, ...spawnOptions } = options;
            const proc = spawn(cmd, args, {
                windowsHide: true,
                shell: false,
                ...spawnOptions
            });
            let stdout = '';
            let stderr = '';
            let settled = false;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => finish({ code, stdout, stderr }));
            proc.on('error', (error) => finish({ code: -1, stdout, stderr, error }));

            setTimeout(() => {
                try {
                    proc.kill();
                } catch (error) {
                    void error;
                }
                finish({ code: -1, stdout, stderr, error: new Error('Timeout') });
            }, timeoutMs);
        });
    }

    getPythonCandidates() {
        const candidates = [];
        const pushCandidate = (cmd, args, version) => {
            if (!cmd) return;
            candidates.push({ cmd, args: Array.isArray(args) ? args : [], version });
        };

        if (cachedEdgePython) {
            pushCandidate(cachedEdgePython.cmd, cachedEdgePython.args, cachedEdgePython.version);
        }

        if (process.platform === 'win32') {
            ['3.11', '3.12', '3.10', '3.9', '3.8', '3.13', '3.14'].forEach((version) => {
                pushCandidate('py', [`-${version}`], version);
            });
            pushCandidate('python', [], 'default');
            pushCandidate('C:\\Users\\Alexandre\\AppData\\Local\\Programs\\Python\\Python311\\python.exe', [], '3.11-direct');
            pushCandidate('C:\\Users\\Alexandre\\AppData\\Local\\Programs\\Python\\Python313\\python.exe', [], '3.13-direct');
        } else {
            pushCandidate('python3', [], 'default');
            pushCandidate('python', [], 'fallback');
        }

        const seen = new Set();
        return candidates.filter(({ cmd, args }) => {
            const key = `${cmd}::${(args || []).join(' ')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async findEdgePython() {
        if (cachedEdgePython) {
            return cachedEdgePython;
        }

        const candidates = this.getPythonCandidates();
        for (const candidate of candidates) {
            const result = await this.runProcess(candidate.cmd, [...candidate.args, '-c', 'import edge_tts; print("OK")'], {
                timeoutMs: 10000
            });

            if (result.code === 0 && result.stdout.includes('OK')) {
                cachedEdgePython = candidate;
                return candidate;
            }
        }

        const fallbackPython = await demucsHandler.findPython();
        return fallbackPython;
    }

    async findInstallPython() {
        const candidates = this.getPythonCandidates();
        for (const candidate of candidates) {
            const result = await this.runProcess(candidate.cmd, [...candidate.args, '--version'], {
                timeoutMs: 10000
            });
            if (result.code === 0) {
                return candidate;
            }
        }

        return demucsHandler.findPython();
    }

    buildUserFriendlyError(prefix, stderr = '') {
        const output = String(stderr || '').trim();
        if (!output) {
            return prefix;
        }

        if (output.includes('No module named edge_tts')) {
            return 'Edge TTS dependency is missing in the selected Python environment. Please install edge_tts or switch to another TTS engine.';
        }
        if (output.includes('503') || output.includes('Service Unavailable')) {
            return 'Edge TTS service is temporarily unavailable (503). Please try again later.';
        }
        if (output.includes('ClientConnectorError') || output.includes('Timeout')) {
            return 'Network connection to Edge TTS failed. Please check your connection and try again.';
        }
        if (output.includes('NoAudioReceived')) {
            return 'Edge TTS returned no audio for this request. Please retry once or adjust the voice/text settings.';
        }

        return `${prefix}: ${output.split('\n').pop() || output}`;
    }

    isRetryableGenerateError(stderr = '') {
        const output = String(stderr || '');
        return EDGE_RETRYABLE_ERROR_MARKERS.some((marker) => output.includes(marker));
    }

    async wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async checkAvailability() {
        try {
            const python = await this.findEdgePython();
            const result = await this.runProcess(
                python.cmd,
                [...python.args, '-c', 'import edge_tts; print("OK")'],
                { timeoutMs: 10000 }
            );

            if (result.code === 0 && result.stdout.includes('OK')) {
                cachedEdgePython = python;
                return { available: true, pythonVersion: python.version };
            }

            return {
                available: false,
                pythonVersion: python.version,
                error: this.buildUserFriendlyError('Edge TTS unavailable', result.stderr || result.error?.message || '')
            };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }

    async installDependency(onProgress = null) {
        const python = await this.findInstallPython();
        const report = (status) => {
            if (typeof onProgress === 'function') {
                onProgress(status);
            }
        };

        report(`Using Python ${python.version}...`);
        const result = await this.runProcess(
            python.cmd,
            [...python.args, '-m', 'pip', 'install', 'edge-tts'],
            { timeoutMs: 120000 }
        );

        if (result.code === 0) {
            cachedEdgePython = null;
            const check = await this.checkAvailability();
            if (check.available) {
                return { success: true, pythonVersion: check.pythonVersion };
            }

            return { success: false, error: check.error || 'Edge TTS installed but verification failed.' };
        }

        return {
            success: false,
            error: this.buildUserFriendlyError('Edge TTS install failed', result.stderr || result.error?.message || '')
        };
    }

    async getVoices() {
        console.log('[EdgeTTS] Listing voices...');
        const python = await this.findEdgePython();
        const result = await this.runProcess(
            python.cmd,
            [...python.args, '-m', 'edge_tts', '--list-voices'],
            { timeoutMs: 20000 }
        );

        if (result.code === 0) {
            const voices = [];
            const lines = result.stdout.split('\n');
            let currentVoice = {};

            lines.forEach((line) => {
                if (line.startsWith('Name: ')) {
                    if (currentVoice.Name) voices.push(currentVoice);
                    currentVoice = { Name: line.replace('Name: ', '').trim() };
                } else if (line.startsWith('Gender: ')) {
                    currentVoice.Gender = line.replace('Gender: ', '').trim();
                }
            });

            if (currentVoice.Name) voices.push(currentVoice);
            return voices;
        }

        console.error('[EdgeTTS] List failed:', result.stderr || result.error?.message || '');
        throw new Error(this.buildUserFriendlyError('Failed to list Edge voices', result.stderr || result.error?.message || ''));
    }

    async generateAudio({ text, voice, rate, pitch, outputPath }) {
        const args = ['-m', 'edge_tts', '--text', text, '--write-media', outputPath, '--voice', voice];

        if (rate !== undefined && rate !== null) {
            let rateStr = String(rate);
            if (!rateStr.startsWith('+') && !rateStr.startsWith('-')) {
                rateStr = (parseInt(rate, 10) >= 0 ? '+' : '') + rateStr;
            }
            args.push('--rate', rateStr.includes('%') ? rateStr : rateStr + '%');
        }

        if (pitch !== undefined && pitch !== null) {
            let pitchStr = String(pitch);
            if (!pitchStr.startsWith('+') && !pitchStr.startsWith('-')) {
                pitchStr = (parseInt(pitch, 10) >= 0 ? '+' : '') + pitchStr;
            }
            args.push('--pitch', pitchStr.includes('Hz') ? pitchStr : pitchStr + 'Hz');
        }

        console.log('[EdgeTTS] Generating:', args.join(' '));
        const python = await this.findEdgePython();

        for (let attempt = 0; attempt <= EDGE_GENERATE_MAX_RETRIES; attempt += 1) {
            const result = await this.runProcess(
                python.cmd,
                [...python.args, ...args],
                { timeoutMs: 120000 }
            );

            if (result.code === 0) {
                return outputPath;
            }

            const errorOutput = result.stderr || result.error?.message || '';
            const canRetry = attempt < EDGE_GENERATE_MAX_RETRIES && this.isRetryableGenerateError(errorOutput);

            if (!canRetry) {
                throw new Error(this.buildUserFriendlyError('EdgeTTS failed', errorOutput));
            }

            console.warn(`[EdgeTTS] Transient failure detected, retrying request (${attempt + 1}/${EDGE_GENERATE_MAX_RETRIES + 1})...`);
            await fs.promises.unlink(outputPath).catch(() => {});
            await this.wait(EDGE_GENERATE_RETRY_DELAY_MS);
        }

        throw new Error('EdgeTTS failed after retry.');
    }
}

module.exports = new EdgeTTSHandler();
