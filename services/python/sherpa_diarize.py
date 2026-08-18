#!/usr/bin/env python3
"""
MediaFlow — offline speaker diarization via sherpa-onnx.

Models are NOT bundled. They download on first use into:
  ~/.mediaflow/models/sherpa-diarization/

Usage (CLI):
  python sherpa_diarize.py --status
  python sherpa_diarize.py --download
  python sherpa_diarize.py --input audio.wav

Library:
  from sherpa_diarize import ensure_models, diarize_file, models_ready
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable, List, Optional


# ---------------------------------------------------------------------------
# Paths & model URLs (GitHub releases — no HF token)
# ---------------------------------------------------------------------------

def default_model_root() -> Path:
    env = os.environ.get("MEDIAFLOW_MODELS") or os.environ.get("MEDIAFLOW_MODEL_DIR")
    if env:
        return Path(env) / "sherpa-diarization"
    return Path.home() / ".mediaflow" / "models" / "sherpa-diarization"


MODEL_ROOT = default_model_root()

# Official sherpa-onnx release assets
SEG_ARCHIVE_URL_OFFICIAL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
)
SEG_DIR_NAME = "sherpa-onnx-pyannote-segmentation-3-0"
SEG_ONNX_NAME = "model.onnx"

# Note: upstream tag is misspelled "recongition"
EMB_URL_OFFICIAL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-recongition-models/"
    "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
)
EMB_ONNX_NAME = "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"


def resolve_model_url(official_url: str) -> str:
    """
    Optional mirror for users who cannot reach GitHub Releases.

    MEDIAFLOW_MODEL_MIRROR examples:
      - prefix proxy:  https://ghproxy.net/   →  https://ghproxy.net/https://github.com/...
      - template:      https://mirror.example/{url}  ( {url} = full official URL )
    """
    mirror = (os.environ.get("MEDIAFLOW_MODEL_MIRROR") or "").strip()
    if not mirror:
        return official_url
    if "{url}" in mirror:
        return mirror.replace("{url}", official_url)
    # prefix style (ghproxy / mirror frontends)
    return mirror.rstrip("/") + "/" + official_url


def seg_archive_url() -> str:
    return resolve_model_url(SEG_ARCHIVE_URL_OFFICIAL)


def emb_url() -> str:
    return resolve_model_url(EMB_URL_OFFICIAL)


def _seg_onnx() -> Path:
    return MODEL_ROOT / SEG_DIR_NAME / SEG_ONNX_NAME


def _emb_onnx() -> Path:
    return MODEL_ROOT / EMB_ONNX_NAME


def models_ready(root: Optional[Path] = None) -> bool:
    r = root or MODEL_ROOT
    return (r / SEG_DIR_NAME / SEG_ONNX_NAME).is_file() and (r / EMB_ONNX_NAME).is_file()


def model_status() -> dict:
    ready = models_ready()
    return {
        "ready": ready,
        "dir": str(MODEL_ROOT),
        "segmentation": str(_seg_onnx()),
        "embedding": str(_emb_onnx()),
        "segmentation_exists": _seg_onnx().is_file(),
        "embedding_exists": _emb_onnx().is_file(),
        "engine": "sherpa-onnx",
        "requires_hf_token": False,
    }


# ---------------------------------------------------------------------------
# Lazy download
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _download(url: str, dest: Path, label: str, progress_cb: Optional[Callable[[str, float], None]] = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    if tmp.exists():
        try:
            tmp.unlink()
        except OSError:
            pass

    _log(f"DIARIZE_MODEL:start {label}")
    if progress_cb:
        progress_cb(label, 0.0)

    def _reporthook(block_num: int, block_size: int, total_size: int) -> None:
        if total_size <= 0:
            return
        pct = min(100.0, block_num * block_size * 100.0 / total_size)
        if block_num % 32 == 0 or pct >= 99.9:
            _log(f"DIARIZE_MODEL:progress {label} {pct:.1f}")
            if progress_cb:
                progress_cb(label, pct)

    try:
        urllib.request.urlretrieve(url, str(tmp), reporthook=_reporthook)
        tmp.replace(dest)
        _log(f"DIARIZE_MODEL:done {label}")
        if progress_cb:
            progress_cb(label, 100.0)
    except Exception as e:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise RuntimeError(f"下载模型失败 ({label}): {e}") from e


def ensure_models(progress_cb: Optional[Callable[[str, float], None]] = None, force: bool = False) -> dict:
    """Download missing diarization models into MODEL_ROOT (lazy)."""
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)

    seg_path = _seg_onnx()
    emb_path = _emb_onnx()

    if force or not seg_path.is_file():
        archive = MODEL_ROOT / "sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
        _download(seg_archive_url(), archive, "segmentation", progress_cb)
        # Extract
        _log("DIARIZE_MODEL:extract segmentation")
        with tarfile.open(archive, "r:bz2") as tar:
            tar.extractall(path=MODEL_ROOT)
        # cleanup archive to save disk
        try:
            archive.unlink()
        except OSError:
            pass
        if not seg_path.is_file():
            raise RuntimeError(f"解压后未找到分割模型: {seg_path}")

    if force or not emb_path.is_file():
        _download(emb_url(), emb_path, "embedding", progress_cb)
        if not emb_path.is_file():
            raise RuntimeError(f"embedding 模型下载失败: {emb_path}")

    _log("DIARIZE_MODEL:ready")
    return model_status()


# ---------------------------------------------------------------------------
# Diarization
# ---------------------------------------------------------------------------

def _require_sherpa():
    try:
        import sherpa_onnx  # noqa: F401
        return
    except ImportError as e:
        raise RuntimeError(
            "未安装 sherpa-onnx。请在项目 .venv 执行: "
            "pip install -U sherpa-onnx"
            f" ({e})"
        ) from e


def diarize_file(
    audio_path: str,
    num_speakers: int = -1,
    threshold: float = 0.5,
    ensure: bool = True,
) -> List[dict]:
    """
    Run offline diarization.

    Returns list of {start, end, speaker} with speaker labels like "Speaker 0".
    """
    _require_sherpa()
    import sherpa_onnx

    if ensure:
        ensure_models()

    if not models_ready():
        raise RuntimeError("说话人区分模型未就绪，请先下载模型")

    try:
        import soundfile as sf
    except ImportError as e:
        raise RuntimeError("缺少 soundfile。pip install soundfile") from e

    import numpy as np

    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(_seg_onnx()),
            ),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(_emb_onnx()),
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=num_speakers if num_speakers and num_speakers > 0 else -1,
            threshold=float(threshold),
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )

    if not config.validate():
        raise RuntimeError("sherpa-onnx diarization 配置无效（请检查模型路径）")

    sd = sherpa_onnx.OfflineSpeakerDiarization(config)

    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    audio = np.ascontiguousarray(audio[:, 0], dtype=np.float32)  # mono 1-D float32

    if sample_rate != sd.sample_rate:
        try:
            import librosa
            audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=sd.sample_rate)
            audio = np.ascontiguousarray(audio, dtype=np.float32)
            sample_rate = sd.sample_rate
        except ImportError:
            raise RuntimeError(
                f"音频采样率 {sample_rate} != 模型 {sd.sample_rate}，"
                "请 pip install librosa 或先转为 16k mono WAV"
            )

    # Callback signature required by pybind: (processed_chunks, num_chunks) -> int
    # Return 0 to continue; non-zero aborts. Wrong arity/return causes:
    #   "Unable to cast Python instance to C++ type" (shown as Err: in UI before fix)
    def _progress(num_processed_chunks, num_total_chunks):
        try:
            total = int(num_total_chunks)
            done = int(num_processed_chunks)
            if total > 0:
                pct = 100.0 * done / total
                _log(f"DIARIZE_MODEL:run {pct:.1f}")
        except Exception:
            pass
        return 0

    try:
        result = sd.process(audio, callback=_progress)
    except TypeError:
        # Older builds may not accept callback
        result = sd.process(audio)

    if hasattr(result, "sort_by_start_time"):
        result = result.sort_by_start_time()

    turns = []
    for r in result:
        spk = getattr(r, "speaker", None)
        if spk is None:
            continue
        try:
            label = f"Speaker {int(spk)}"
        except (TypeError, ValueError):
            label = f"Speaker {spk}"
        turns.append({
            "start": float(r.start),
            "end": float(r.end),
            "speaker": label,
        })
    return turns


def assign_speakers_to_segments(segments: list, turns: List[dict]) -> list:
    """Attach best-overlap speaker labels onto whisper segments (mutates list)."""
    if not turns:
        for seg in segments:
            seg.setdefault("speaker", "Speaker 0")
        return segments

    for seg in segments:
        seg_start = float(seg.get("start", 0))
        seg_end = float(seg.get("end", 0))
        votes = []
        for turn in turns:
            start = max(seg_start, turn["start"])
            end = min(seg_end, turn["end"])
            if end > start:
                # weight by overlap duration
                votes.extend([turn["speaker"]] * max(1, int((end - start) * 100)))

        if votes:
            best = max(set(votes), key=votes.count)
            seg["speaker"] = best
            continue

        # closest turn within 5s
        closest = None
        min_dist = 5.0
        for turn in turns:
            if turn["start"] >= seg_end:
                dist = turn["start"] - seg_end
            elif turn["end"] <= seg_start:
                dist = seg_start - turn["end"]
            else:
                dist = 0.0
            if dist < min_dist:
                min_dist = dist
                closest = turn["speaker"]
        seg["speaker"] = closest or "Speaker 0"

    return segments


def prepare_wav_16k(input_path: str, ffmpeg_bin: str = "ffmpeg") -> tuple:
    """
    Ensure 16k mono wav for diarization.
    Returns (path, is_temp).
    """
    ext = os.path.splitext(input_path)[1].lower()
    if ext in (".wav", ".flac"):
        return input_path, False

    import subprocess

    fd, temp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    cmd = [
        ffmpeg_bin, "-y", "-i", input_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        temp_path,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return temp_path, True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(description="MediaFlow sherpa-onnx diarization (lazy models)")
    parser.add_argument("--status", action="store_true", help="Print model readiness JSON")
    parser.add_argument("--download", action="store_true", help="Download models now")
    parser.add_argument("--force", action="store_true", help="Re-download models")
    parser.add_argument("--input", default=None, help="Audio/video path to diarize")
    parser.add_argument("--num-speakers", type=int, default=-1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args(argv)

    if args.status:
        print(json.dumps(model_status(), ensure_ascii=False))
        return 0

    if args.download or args.force:
        try:
            st = ensure_models(force=args.force)
            print(json.dumps({"success": True, **st}, ensure_ascii=False))
            return 0
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
            return 1

    if args.input:
        try:
            turns = diarize_file(args.input, num_speakers=args.num_speakers, threshold=args.threshold)
            print(json.dumps({"success": True, "turns": turns, "count": len(turns)}, ensure_ascii=False))
            return 0
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
            return 1

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
