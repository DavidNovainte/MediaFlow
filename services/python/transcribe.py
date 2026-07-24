import sys
import json
import argparse
import os
import time

import shutil
import subprocess
import tempfile
from pathlib import Path

# Torch is only required for speaker diarization (pyannote). Import lazily so a
# broken torch install does not block basic faster-whisper transcription.
# Try to import faster_whisper (ctranslate2 backend)
try:
    from faster_whisper import WhisperModel
except ImportError as e:
    print(json.dumps({
        "error": (
            "本地转录依赖缺失 (faster-whisper / ctranslate2)。"
            f" 请在项目 .venv 中重装: pip install --force-reinstall faster-whisper ctranslate2 ({e})"
        )
    }, ensure_ascii=False), file=sys.stdout)
    sys.exit(1)
except OSError as e:
    # DLL load failures on Windows (WinError 126) often mean incomplete wheels
    print(json.dumps({
        "error": (
            "本地转录引擎 DLL 加载失败（安装可能不完整）。"
            "请在项目 .venv 执行: pip install --force-reinstall ctranslate2 faster-whisper torch --index-url https://download.pytorch.org/whl/cpu"
            f" 详情: {e}"
        )
    }, ensure_ascii=False), file=sys.stdout)
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="MediaFlow Local Transcription Service")
    parser.add_argument("--input", required=True, help="Input audio/video file path")
    parser.add_argument("--model", default="base", help="Whisper model size")
    parser.add_argument("--device", default="auto", help="Device to use (cuda, cpu, auto)")
    parser.add_argument("--compute_type", default="int8", help="Compute type")
    parser.add_argument("--language", default=None, help="Language code")
    parser.add_argument("--diarize", action="store_true", help="Enable speaker diarization")
    parser.add_argument(
        "--diarize-engine",
        default="sherpa",
        choices=["sherpa", "pyannote"],
        help="Diarization engine: sherpa (default, offline ONNX, no HF) or pyannote (needs HF token)",
    )
    parser.add_argument("--hf-token", default=None, help="Hugging Face Token (only for pyannote engine)")
    parser.add_argument("--isolate_vocals", action="store_true", help="Extract vocals before transcription")
    parser.add_argument("--initial_prompt", default=None, help="Initial prompt for context")
    
    args = parser.parse_args()
    
    transcribe_input = args.input
    temp_dir = None

    if not os.path.exists(args.input):
        print(json.dumps({"error": f"Input file not found: {args.input}"}), file=sys.stdout)
        sys.exit(1)

    # Vocal Isolation (Demucs)
    if args.isolate_vocals:
        print("Starting Vocal Isolation...", file=sys.stderr)
        if shutil.which("demucs") is None:
             print(json.dumps({"error": "Demucs not found. Please run: pip install demucs"}), file=sys.stdout)
             sys.exit(1)
        
        try:
            temp_dir = tempfile.mkdtemp()
            # Run demucs: demucs --two-stems=vocals -n htdemucs_ft --out temp_dir input_file
            # htdemucs_ft is fine-tuned, better but maybe slower? htdemucs is standard.
            cmd = ["demucs", "--two-stems", "vocals", "-n", "htdemucs", "--out", temp_dir, args.input]
            
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, stderr = process.communicate()
            
            if process.returncode != 0:
                print(f"Demucs failed: {stderr}", file=sys.stderr)
                # Fallback to original
            else:
                # Find the vocals.wav
                # Structure: temp_dir/htdemucs/filename/vocals.wav
                # We search recursively just in case
                vocals_found = False
                for root, dirs, files in os.walk(temp_dir):
                    if "vocals.wav" in files:
                        transcribe_input = os.path.join(root, "vocals.wav")
                        vocals_found = True
                        print(f"Vocals isolated: {transcribe_input}", file=sys.stderr)
                        break
                
                if not vocals_found:
                    print("Could not find vocals.wav in output", file=sys.stderr)

        except Exception as e:
             print(f"Isolation error: {e}", file=sys.stderr)

    try:
        # Load model
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

        # Transcribe
        segments, info = model.transcribe(
            transcribe_input, 
            beam_size=5, 
            language=args.language,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            condition_on_previous_text=False,
            initial_prompt=args.initial_prompt
        )

        output_segments = []
        full_text = []

        # Process segments generator
        for segment in segments:
            text = segment.text.strip()
            
            # Hallucination Filters
            # 1. Filter high no_speech_prob (hallucinations often occur in silence)
            if segment.no_speech_prob > 0.6:
                continue
                
            # 2. Filter repetitive loops (common: "字幕 字幕" or "Subtitle Subtitle")
            if len(text) > 0:
                # Calculate unique char ratio
                unique_chars = len(set(text))
                total_chars = len(text)
                if total_chars > 20 and unique_chars / total_chars < 0.2:
                    continue
                    
            # 3. Specific blocklist for common Chinese hallucinations
            hallucination_phrases = ["字幕", "未经作者授权", "感谢观看", "谢谢观看", "谢谢大家", "非常感谢您的观看", "请订阅我们的频道"]
            if any(phrase in text for phrase in hallucination_phrases) and len(text) < 15:
                continue
            
            if "字幕" in text and text.count("字幕") > 2:
                continue
            
            seg_data = {
                "id": segment.id,
                "start": segment.start,
                "end": segment.end,
                "text": text
            }
            output_segments.append(seg_data)
            full_text.append(text)
            print(f"PROGRESS:{segment.end:.2f}", file=sys.stderr, flush=True)

        # Diarization (default: sherpa-onnx, offline, no HF token; models lazy-downloaded)
        diarization_error = None
        diarize_engine = (args.diarize_engine or "sherpa").lower()
        if args.diarize:
            print(f"PROGRESS:{info.duration:.2f}", file=sys.stderr, flush=True)

            try:
                # Resolve ffmpeg for media → 16k wav
                base_dir = Path(__file__).resolve().parent.parent.parent
                ffmpeg_path = base_dir / "bin" / "ffmpeg.exe"
                if not ffmpeg_path.exists():
                    ffmpeg_path = base_dir / "bin" / "ffmpeg"
                ffmpeg_bin = str(ffmpeg_path) if ffmpeg_path.exists() else "ffmpeg"

                if diarize_engine == "sherpa":
                    # ---- sherpa-onnx (default) ----
                    sys.path.insert(0, str(Path(__file__).resolve().parent))
                    import sherpa_diarize as sd

                    print("DIARIZE_ENGINE:sherpa", file=sys.stderr, flush=True)
                    wav_path, is_temp = sd.prepare_wav_16k(transcribe_input, ffmpeg_bin=ffmpeg_bin)
                    try:
                        # Lazy: download models on first use into ~/.mediaflow/models/...
                        turns = sd.diarize_file(wav_path, ensure=True)
                        sd.assign_speakers_to_segments(output_segments, turns)
                    finally:
                        if is_temp and os.path.exists(wav_path):
                            try:
                                os.remove(wav_path)
                            except OSError:
                                pass

                else:
                    # ---- pyannote (legacy / optional, needs HF token) ----
                    if not args.hf_token:
                        raise Exception(
                            "pyannote 引擎需要 Hugging Face Token。"
                            "也可改用默认的 sherpa 引擎（免 HF，首次自动下载模型）。"
                        )

                    try:
                        import torch
                        import torchaudio
                    except Exception as te:
                        raise Exception(
                            f"pyannote 说话人分离需要完整的 torch/torchaudio: {te}. "
                            "请执行: pip install --force-reinstall torch torchaudio "
                            "--index-url https://download.pytorch.org/whl/cpu"
                        )

                    if os.name == "nt":
                        try:
                            torchaudio.set_audio_backend("soundfile")
                        except Exception:
                            pass

                    try:
                        from pyannote.audio import Pipeline
                    except ImportError:
                        raise Exception("pyannote.audio not installed. Run: pip install pyannote.audio")

                    try:
                        import soundfile as sf
                    except ImportError:
                        raise Exception("Library 'soundfile' missing. Run: pip install soundfile")

                    print("DIARIZE_ENGINE:pyannote", file=sys.stderr, flush=True)
                    pipeline = Pipeline.from_pretrained(
                        "pyannote/speaker-diarization-3.1", token=args.hf_token
                    )
                    if not pipeline:
                        raise Exception("Failed to load pyannote pipeline. Invalid Token?")

                    if args.device == "cuda" or (
                        args.device == "auto" and torch.cuda.is_available()
                    ):
                        pipeline.to(torch.device("cuda"))

                    temp_wav = None
                    load_path = args.input
                    ext = os.path.splitext(args.input)[1].lower()
                    if ext not in [".wav", ".flac"]:
                        fd, temp_wav_path = tempfile.mkstemp(suffix=".wav")
                        os.close(fd)
                        cmd = [
                            ffmpeg_bin, "-y", "-i", args.input,
                            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                            temp_wav_path,
                        ]
                        subprocess.run(
                            cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                        )
                        load_path = temp_wav_path
                        temp_wav = temp_wav_path

                    audio_data, file_samplerate = sf.read(load_path, dtype="float32")
                    if audio_data.ndim == 1:
                        waveform = torch.from_numpy(audio_data).unsqueeze(0)
                    else:
                        waveform = torch.from_numpy(audio_data.T)
                    sample_rate = file_samplerate

                    diarization = pipeline({"waveform": waveform, "sample_rate": sample_rate})
                    if hasattr(diarization, "annotation"):
                        diarization = diarization.annotation
                    elif hasattr(diarization, "exclusive_speaker_diarization"):
                        diarization = diarization.exclusive_speaker_diarization
                    elif isinstance(diarization, tuple):
                        diarization = diarization[0]

                    if temp_wav and os.path.exists(temp_wav):
                        os.remove(temp_wav)

                    all_tracks = (
                        list(diarization.itertracks(yield_label=True))
                        if hasattr(diarization, "itertracks")
                        else []
                    )
                    # Reuse sherpa aligner with normalized turns
                    turns = []
                    for turn, _, speaker in all_tracks:
                        clean = str(speaker).replace("SPEAKER_", "Speaker ")
                        if clean.startswith("SPEAKER"):
                            clean = clean.replace("SPEAKER", "Speaker")
                        turns.append({
                            "start": float(turn.start),
                            "end": float(turn.end),
                            "speaker": clean if clean.startswith("Speaker") else f"Speaker {clean}",
                        })
                    sys.path.insert(0, str(Path(__file__).resolve().parent))
                    import sherpa_diarize as sd
                    sd.assign_speakers_to_segments(output_segments, turns)

            except Exception as e:
                import traceback
                traceback.print_exc(file=sys.stderr)
                print(f"WARNING: Diarization failed: {e}", file=sys.stderr, flush=True)
                diarization_error = str(e)
                # Do NOT paint technical errors into speaker labels (was: "Err: Unable to cast…")
                # Leave segments without speaker; surface failure only via result.warning.

        has_any_speaker = any(seg.get("speaker") for seg in output_segments)

        result = {
            "success": True,
            "text": " ".join(full_text),
            "segments": output_segments,
            "language": info.language,
            "duration": info.duration,
            "has_speakers": bool(args.diarize and has_any_speaker and not diarization_error),
            "diarize_engine": diarize_engine if args.diarize else None,
        }

        if diarization_error:
            result["warning"] = f"说话人区分失败（字幕仍可用）: {diarization_error}"

        print(json.dumps(result), file=sys.stdout)

    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e), "success": False}), file=sys.stdout)
        sys.exit(1)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print("Cleaned up temp files", file=sys.stderr)
            except Exception as e:
                print(f"Cleanup error: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
