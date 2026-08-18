const fs = require('fs');

class OpenAITTSHandler {
    async getVoices() {
        // OpenAI voices are static and standard
        return [
            { Name: 'alloy', Gender: 'Neutral', DisplayName: 'Alloy (OpenAI)' },
            { Name: 'echo', Gender: 'Male', DisplayName: 'Echo (OpenAI)' },
            { Name: 'fable', Gender: 'British', DisplayName: 'Fable (OpenAI)' },
            { Name: 'onyx', Gender: 'Male', DisplayName: 'Onyx (OpenAI)' },
            { Name: 'nova', Gender: 'Female', DisplayName: 'Nova (OpenAI)' },
            { Name: 'shimmer', Gender: 'Female', DisplayName: 'Shimmer (OpenAI)' }
        ];
    }

    async generateAudio({ text, voice, rate, outputPath, apiKey }) {
        if (!apiKey) throw new Error('OpenAI API Key is required');

        // OpenAI TTS API does not natively support rate/pitch in the same way as Edge
        // Usually it's just 'speed' (0.25 to 4.0)
        // We can map 'rate' (-50% to +50%) to speed (0.5 to 1.5) approx

        let speed = 1.0;
        if (rate) {
            // rate is number, e.g. 50 (for +50%) or -20
            // logic: 1.0 + (rate / 100)
            const r = parseInt(rate, 10);
            if (!isNaN(r)) {
                speed = 1.0 + (r / 100);
            }
        }
        // Clamp speed to OpenAI limits (0.25 - 4.0)
        speed = Math.max(0.25, Math.min(4.0, speed));

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1', // or tts-1-hd
                input: text,
                voice: voice,
                speed: speed,
                response_format: 'mp3'
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI TTS Failed: ${response.status} - ${err}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(outputPath, Buffer.from(arrayBuffer));
        return outputPath;
    }
}

module.exports = new OpenAITTSHandler();
