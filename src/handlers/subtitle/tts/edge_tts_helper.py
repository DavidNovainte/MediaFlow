import asyncio
import edge_tts
import json
import sys
import os

async def generate_with_timestamps(text, voice, rate, pitch, output_audio, style=None):
    words = []
    
    rate_str = rate if rate else "+0%"
    # Original rate_str and pitch_str for direct Communicate calls
    rate_str_direct = rate if rate else "+0%"
    pitch_str_direct = pitch if pitch else "+0Hz"

    try:
        # Ensure rate and pitch have valid defaults if they are None or "undefined"
        def clean_param(val, default):
            if not val or val == "undefined" or "undefined" in str(val).lower():
                return default
            return val

        safe_rate = clean_param(rate, "+0%")
        safe_pitch = clean_param(pitch, "+0Hz")

        if style and style != 'general':
            import html
            # For SSML, ensure they are strings with the right format
            rate_ssml = f"{safe_rate}" if "%" in str(safe_rate) else f"{safe_rate:+d}%"
            pitch_ssml = f"{safe_pitch}" if "Hz" in str(safe_pitch) else f"{safe_pitch:+d}Hz"

            # Infer lang from voice name (e.g., zh-CN-XiaoxiaoNeural -> zh-CN)
            lang = "en-US"
            if voice and "-" in voice:
                parts = voice.split("-")
                if len(parts) >= 2:
                    lang = f"{parts[0]}-{parts[1]}"

            # We initialize with a dummy text, then override self.texts with our custom SSML
            communicate = edge_tts.Communicate("dummy", voice, boundary='WordBoundary')
            text_escaped = html.escape(text)
            ssml = f"""
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{lang}">
    <voice name="{voice}">
        <mstts:express-as style="{style}">
            <prosody rate="{rate_ssml}" pitch="{pitch_ssml}">
                {text_escaped}
            </prosody>
        </mstts:express-as>
    </voice>
</speak>"""
            # Override the internal protected property to bypass escaping
            communicate.texts = [ssml.encode("utf-8")]
        else:
            # No style, pass text directly. Ensure boundary is set.
            communicate = edge_tts.Communicate(text, voice, rate=safe_rate, pitch=safe_pitch, boundary='WordBoundary')
        
        with open(output_audio, "wb") as file:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    file.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append({
                        "text": chunk["text"],
                        "start": chunk["offset"] / 10000000.0,
                        "duration": chunk["duration"] / 10000000.0
                    })

        formatted_words = []
        for w in words:
            formatted_words.append({
                "text": w["text"],
                "start": round(w["start"], 3),
                "end": round(w["start"] + w.get("duration", 0), 3)
            })

        return formatted_words

    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Error detail: {error_msg}", file=sys.stderr)
        return {"error": str(e), "detail": traceback.format_exc()}

async def main():
    # Force UTF-8 encoding for stdout and stderr to avoid GBK errors on Windows
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 6:
        print("Usage: python edge_tts_helper.py <text_or_path> <voice> <output_audio> <rate> <pitch> [style]")
        sys.exit(1)

    input_arg = sys.argv[1]
    voice = sys.argv[2]
    output_audio = sys.argv[3]
    rate = sys.argv[4]
    pitch = sys.argv[5]
    style = sys.argv[6] if len(sys.argv) > 6 else "general"

    # If input_arg is a path, read the file
    if os.path.exists(input_arg):
        with open(input_arg, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = input_arg

    result = await generate_with_timestamps(text, voice, rate, pitch, output_audio, style)
    
    if isinstance(result, list):
        # Check if output file exists and is not empty
        if not os.path.exists(output_audio) or os.path.getsize(output_audio) == 0:
            raise Exception("Generated audio file is empty or missing. Check network connection or voice validity.")
        
        # Output JSON result to stdout for Node.js to capture
        output = json.dumps({"success": True, "words": result}, ensure_ascii=False)
        sys.stdout.write(output + "\n")
    else:
        # Result is already an error dict from generate_with_timestamps
        error_data = result if isinstance(result, dict) else {"error": str(result)}
        output = json.dumps({"success": False, "error": error_data.get("error", "Unknown"), "detail": error_data.get("detail", "")}, ensure_ascii=False)
        sys.stdout.write(output + "\n")

if __name__ == "__main__":
    asyncio.run(main())
