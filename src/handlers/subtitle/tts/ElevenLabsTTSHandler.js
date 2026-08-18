const fs = require('fs');

class ElevenLabsTTSHandler {
    constructor() {
        this.baseUrl = 'https://api.elevenlabs.io/v1';
    }

    async getVoices(apiKey) {
        if (!apiKey) throw new Error('ElevenLabs API Key is required');

        const response = await fetch(`${this.baseUrl}/voices`, {
            headers: {
                'xi-api-key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs Voices Fetch Failed: ${response.status}`);
        }

        const data = await response.json();
        /* 
           Data structure: 
           { voices: [ { voice_id: "...", name: "...", category: "premade" ...} ] }
        */
        return data.voices.map(v => ({
            Name: v.voice_id, // We use ID as the internal identifier
            DisplayName: `${v.name} (${v.category || 'Standard'})`,
            Gender: v.labels?.gender || 'Unknown',
            PreviewUrl: v.preview_url
        }));
    }

    async generateAudio({ text, voice, outputPath, apiKey }) {
        if (!apiKey) throw new Error('ElevenLabs API Key is required');

        // Voice ID is passed as 'voice'
        const voiceId = voice;

        // ElevenLabs doesn't support 'rate' nicely in request body unless utilizing specific model settings
        // But similarity_boost and stability are common. 
        // For now we map standard params.

        const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2', // Better for multiple languages
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`ElevenLabs TTS Failed: ${response.status} - ${err}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(outputPath, Buffer.from(arrayBuffer));
        return outputPath;
    }
}

module.exports = new ElevenLabsTTSHandler();
