const { mapImageAiError, formatImageAiError } = require('../../src/utils/imageAiErrorMap');

describe('imageAiErrorMap', () => {
    const t = (key, fb) => fb;

    it('maps python missing', () => {
        const m = mapImageAiError('spawn python ENOENT', { t });
        expect(m.code).toBe('PYTHON_MISSING');
        expect(m.openSettings).toBe(true);
    });

    it('maps rembg missing', () => {
        const m = mapImageAiError("ModuleNotFoundError: No module named 'rembg'", { t });
        expect(m.code).toBe('REMBG_MISSING');
    });

    it('maps engine missing', () => {
        const m = mapImageAiError('EnhanceService unavailable', { t });
        expect(m.code).toBe('ENGINE_MISSING');
    });

    it('formatImageAiError includes hint for known codes', () => {
        const s = formatImageAiError({ code: 'PYTHON_MISSING', message: 'PYTHON_MISSING' }, { t });
        expect(s.toLowerCase()).toMatch(/python/);
    });
});
