/**
 * Map image AI (upscale / rembg) technical errors to user-facing copy + recovery hints.
 * Works in renderer (script tag) and Node (require).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ImageAiErrorMap = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
    function rawOf(err) {
        if (err == null) return '';
        if (typeof err === 'string') return err;
        if (typeof err === 'object') {
            return String(err.code || err.error || err.message || err.stderr || '');
        }
        return String(err);
    }

    /**
     * @param {unknown} err
     * @param {{ t?: (key: string, fb?: string) => string }} [opts]
     * @returns {{ code: string, message: string, hint: string, openSettings: boolean }}
     */
    function mapImageAiError(err, opts = {}) {
        const t = (key, fb) => {
            try {
                if (typeof opts.t === 'function') {
                    const v = opts.t(key, fb);
                    if (v && v !== key) return v;
                }
                if (typeof root !== 'undefined' && root.i18n?.t) {
                    const v = root.i18n.t(key);
                    if (v && v !== key) return v;
                }
            } catch {
                /* ignore */
            }
            return fb;
        };

        const raw = rawOf(err);
        const hay = raw.toLowerCase();

        const pack = (code, messageKey, messageFb, hintKey, hintFb, openSettings) => ({
            code,
            message: t(messageKey, messageFb),
            hint: t(hintKey, hintFb),
            openSettings: !!openSettings
        });

        if (/python.*(not found|enoent|is not recognized)|no such file.*python|spawn python/i.test(raw) ||
            hay.includes('python_missing')) {
            return pack(
                'PYTHON_MISSING',
                'pixel.aiPythonMissing',
                'Python was not found on this computer.',
                'pixel.aiPythonMissingHint',
                'Install Python 3.10+ and restart MediaFlow. Settings → Engines shows environment status.',
                true
            );
        }

        if (/rembg|no module named|modulenotfounderror/i.test(raw) || hay.includes('rembg_missing')) {
            return pack(
                'REMBG_MISSING',
                'pixel.aiRembgMissing',
                'AI cutout package (rembg) is not installed.',
                'pixel.aiRembgMissingHint',
                'In a terminal: pip install rembg. Then retry cutout. See Settings → Engines for tips.',
                true
            );
        }

        if (/rembg_service|script.*not found|SCRIPT_MISSING/i.test(raw) || hay.includes('script_missing')) {
            return pack(
                'SCRIPT_MISSING',
                'pixel.aiScriptMissing',
                'Cutout script is missing from this install.',
                'pixel.aiScriptMissingHint',
                'Reinstall MediaFlow or restore services/python/rembg_service.py.',
                false
            );
        }

        if (
            /engine binary missing|EnhanceService unavailable|missing model|realesrgan-ncnn-vulkan|ENGINE_MISSING/i.test(
                raw
            ) ||
            hay.includes('engine_missing')
        ) {
            return pack(
                'ENGINE_MISSING',
                'pixel.aiEngineMissing',
                'AI upscale engine or model files are missing.',
                'pixel.aiEngineMissingHint',
                'Open Settings → Engines and click Install next to Real-ESRGAN (or place binaries in bin/).',
                true
            );
        }

        if (/ENOENT|not a function|backend not available|ai enhance service missing/i.test(raw)) {
            return pack(
                'SERVICE_MISSING',
                'pixel.aiServiceMissing',
                'AI image service is not available in this build.',
                'pixel.aiServiceMissingHint',
                'Update the app, or use basic compress without AI options.',
                false
            );
        }

        const fallback = raw || t('pixel.aiFailed', 'AI processing failed');
        return {
            code: 'UNKNOWN',
            message: fallback,
            hint: t(
                'pixel.aiGenericHint',
                'If this keeps failing, check Settings → Engines and that Python / models are installed.'
            ),
            openSettings: true
        };
    }

    /**
     * Single line for toast: message + short hint.
     */
    function formatImageAiError(err, opts) {
        const m = mapImageAiError(err, opts);
        if (m.hint && m.code !== 'UNKNOWN') {
            return `${m.message} — ${m.hint}`;
        }
        return m.message;
    }

    return { mapImageAiError, formatImageAiError, rawOf };
});
