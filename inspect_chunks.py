import asyncio
import edge_tts

async def test():
    voice = "en-US-GuyNeural"
    text = "Hello world"
    ssml = f"""
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice name="{voice}">
        <prosody rate="+0%" pitch="+0Hz">
            {text}
        </prosody>
    </voice>
</speak>"""
    
    communicate = edge_tts.Communicate(ssml, voice)
    types = {}
    async for chunk in communicate.stream():
        t = chunk['type']
        types[t] = types.get(t, 0) + 1
        if t == 'WordBoundary':
            print(f"WordBoundary found: {chunk['text']} at {chunk['offset']}")
    
    print(f"Summary of chunk types with SSML: {types}")

if __name__ == "__main__":
    asyncio.run(test())
