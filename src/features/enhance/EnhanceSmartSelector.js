/**
 * EnhanceSmartSelector.js - lightweight content analysis for engine pick.
 * Anime vs photo vs portrait (skin-weighted) heuristics on a downscaled canvas.
 */

class EnhanceSmartSelector {
    constructor(controller) {
        this.controller = controller;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.sampleSize = 256;
    }

    /**
     * @param {string} imagePath
     * @returns {Promise<{engine:string, scale?:number, confidence:number, reason:string}>}
     */
    async recommend(imagePath) {
        try {
            if (/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(String(imagePath || ''))) {
                return {
                    engine: 'esrgan',
                    scale: 2,
                    confidence: 0,
                    reason: 'video_skip'
                };
            }

            const img = await this.loadImage(imagePath);
            const scores = this.analyzeContent(img);
            const longEdge = Math.max(img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
            img.src = '';

            let engine = 'esrgan';
            let reason = 'detected_photo';
            let confidence = 1 - scores.animeScore;

            if (scores.animeScore > 0.6) {
                engine = 'cugan';
                reason = 'detected_anime';
                confidence = scores.animeScore;
            } else if (scores.portraitScore > 0.45 && scores.animeScore < 0.45) {
                // Photo-first portrait profile (Real-ESRGAN x4plus under gfpgan id)
                engine = 'gfpgan';
                reason = 'detected_portrait';
                confidence = scores.portraitScore;
            }

            // Large sources: keep 2× to protect VRAM / time
            let scale = 2;
            if (longEdge > 0 && longEdge <= 900 && engine !== 'gfpgan') {
                scale = 2;
            }
            if (longEdge >= 2000) {
                scale = 2;
            }

            return { engine, scale, confidence, reason, longEdge };
        } catch (error) {
            console.warn('[SmartSelector] Analysis failed, fallback to default:', error);
            return { engine: 'esrgan', scale: 2, confidence: 0, reason: 'error' };
        }
    }

    loadImage(src) {
        const tryUrl = (url) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const probe = document.createElement('canvas');
                    probe.width = 2;
                    probe.height = 2;
                    const ctx = probe.getContext('2d');
                    ctx.drawImage(img, 0, 0, 2, 2);
                    ctx.getImageData(0, 0, 1, 1);
                    resolve(img);
                } catch (taintErr) {
                    reject(taintErr || new Error('canvas tainted'));
                }
            };
            img.onerror = () => reject(new Error('image load error'));
            img.src = url;
        });

        return (async () => {
            const mediaUrl = window.urlUtils?.pathToMediaUrl?.(src) || '';
            if (mediaUrl) {
                try {
                    return await tryUrl(mediaUrl);
                } catch (e) {
                    void e;
                }
            }
            const res = await window.mediaflow?.fs?.readAsDataUrl?.(src);
            if (res?.success && res.dataUrl) {
                return tryUrl(res.dataUrl);
            }
            throw new Error('Failed to read file for analysis');
        })();
    }

    /**
     * Heuristics:
     * - flat + ink edges → anime
     * - skin-like chroma in center → portrait
     */
    analyzeContent(img) {
        this.canvas.width = this.sampleSize;
        this.canvas.height = this.sampleSize;
        this.ctx.drawImage(img, 0, 0, this.sampleSize, this.sampleSize);

        const imageData = this.ctx.getImageData(0, 0, this.sampleSize, this.sampleSize);
        const data = imageData.data;
        const totalPixels = this.sampleSize * this.sampleSize;

        let flatCount = 0;
        let edgeCount = 0;
        let skinCount = 0;
        let centerSkin = 0;
        let centerTotal = 0;

        const cx0 = Math.floor(this.sampleSize * 0.25);
        const cx1 = Math.floor(this.sampleSize * 0.75);
        const cy0 = Math.floor(this.sampleSize * 0.2);
        const cy1 = Math.floor(this.sampleSize * 0.85);

        for (let y = 0; y < this.sampleSize; y++) {
            for (let x = 0; x < this.sampleSize; x++) {
                const i = (y * this.sampleSize + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (x > 0) {
                    const pi = i - 4;
                    const diff = Math.abs(r - data[pi]) + Math.abs(g - data[pi + 1]) + Math.abs(b - data[pi + 2]);
                    if (diff < 15) flatCount += 1;
                    if (diff > 50) edgeCount += 1;
                }

                const isSkin = this.isSkinTone(r, g, b);
                if (isSkin) skinCount += 1;

                const inCenter = x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1;
                if (inCenter) {
                    centerTotal += 1;
                    if (isSkin) centerSkin += 1;
                }
            }
        }

        const flatRatio = flatCount / totalPixels;
        const edgeRatio = edgeCount / totalPixels;
        const skinRatio = skinCount / totalPixels;
        const centerSkinRatio = centerTotal ? centerSkin / centerTotal : 0;

        let animeLikelihood = 0;
        if (flatRatio > 0.5) animeLikelihood += 0.55;
        if (flatRatio > 0.7) animeLikelihood += 0.25;
        if (edgeRatio > 0.05 && edgeRatio < 0.22) animeLikelihood += 0.2;
        // Strong skin presence fights anime score slightly
        if (centerSkinRatio > 0.18) animeLikelihood -= 0.15;
        animeLikelihood = Math.max(0, Math.min(1, animeLikelihood));

        // Portrait: enough center skin, not anime-flat
        let portraitScore = 0;
        if (centerSkinRatio > 0.12) portraitScore += 0.35;
        if (centerSkinRatio > 0.22) portraitScore += 0.3;
        if (skinRatio > 0.08) portraitScore += 0.15;
        if (flatRatio < 0.55) portraitScore += 0.15;
        if (animeLikelihood < 0.5) portraitScore += 0.1;
        portraitScore = Math.max(0, Math.min(1, portraitScore));

        return {
            animeScore: animeLikelihood,
            portraitScore,
            flatRatio,
            edgeRatio,
            skinRatio,
            centerSkinRatio
        };
    }

    /** Rough YCbCr-ish skin gate (good enough for thumbnail sampling). */
    isSkinTone(r, g, b) {
        // Reject near-gray / near-black / near-white
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 60 || min > 240) return false;
        if (max - min < 15) return false;
        // Classic RGB skin inequalities (loose)
        if (r <= 80 || g <= 30 || b <= 15) return false;
        if (r < g || r < b) return false;
        if (g - b > 80) return false;
        // Prefer warm tones
        if (r - g < 8) return false;
        return true;
    }
}

window.EnhanceSmartSelector = EnhanceSmartSelector;
