import argparse
import os
import subprocess
import sys
from pathlib import Path

import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.audio import AudioFile, encode_mp3, prevent_clip
from demucs.pretrained import get_model


def parse_args():
    parser = argparse.ArgumentParser(description='MediaFlow Demucs compatibility wrapper')
    parser.add_argument('input', type=Path, help='Input media path')
    parser.add_argument('-o', '--output', type=Path, required=True, help='Output directory root')
    parser.add_argument('--model', default='htdemucs', help='Demucs model name')
    parser.add_argument('--two-stems', dest='stem', metavar='STEM', help='Separate only one stem and its complement')
    parser.add_argument('-j', '--jobs', type=int, default=max(1, os.cpu_count() or 1), help='Worker count')
    parser.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu', help='Execution device')
    return parser.parse_args()


def load_audio(track_path, audio_channels, samplerate):
    try:
        return AudioFile(track_path).read(streams=0, samplerate=samplerate, channels=audio_channels)
    except FileNotFoundError as error:
        raise RuntimeError('FFmpeg is not installed or is not available in PATH.') from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError('FFmpeg could not decode the selected media file.') from error


def write_audio(destination, wav, samplerate, bits_per_sample=16):
    destination.parent.mkdir(parents=True, exist_ok=True)
    suffix = destination.suffix.lower()
    clipped = prevent_clip(wav, mode='rescale')

    if suffix == '.mp3':
        encode_mp3(clipped, destination, samplerate, bitrate=320, quality=2, verbose=True)
        return

    data = clipped.detach().cpu().transpose(0, 1).numpy()

    if suffix == '.wav':
        sf.write(str(destination), data, samplerate, subtype=f'PCM_{bits_per_sample}')
        return

    if suffix == '.flac':
        sf.write(str(destination), data, samplerate, format='FLAC', subtype=f'PCM_{bits_per_sample}')
        return

    raise ValueError(f'Unsupported output suffix: {suffix}')


def save_sources(output_dir, input_path, sources, source_names, samplerate, selected_stem=None):
    track_name = input_path.stem

    if selected_stem is None:
        for source, name in zip(sources, source_names):
            write_audio(output_dir / f'{track_name}_{name}.wav', source, samplerate)
        return

    try:
        selected_index = source_names.index(selected_stem)
    except ValueError as error:
        raise RuntimeError(f'Stem "{selected_stem}" is not available in model sources: {", ".join(source_names)}') from error

    selected_source = sources[selected_index]
    remainder = torch.zeros_like(selected_source)
    for index, source in enumerate(sources):
        if index != selected_index:
            remainder += source

    write_audio(output_dir / f'{track_name}_{selected_stem}.wav', selected_source, samplerate)
    write_audio(output_dir / f'{track_name}_no_{selected_stem}.wav', remainder, samplerate)


def main():
    args = parse_args()
    if not args.input.exists():
        print(f'Input file does not exist: {args.input}', file=sys.stderr)
        return 2

    model = get_model(args.model)
    output_dir = args.output / args.model
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f'Separated tracks will be stored in {output_dir.resolve()}')
    print(f'Separating track {args.input}')

    wav = load_audio(args.input, model.audio_channels, model.samplerate)
    ref = wav.mean(0)
    offset = ref.mean()
    scale = ref.std()
    if torch.is_tensor(scale):
        scale_value = float(scale.item())
    else:
        scale_value = float(scale)
    if scale_value <= 1e-8:
        scale_value = 1.0

    wav = wav - offset
    wav = wav / scale_value

    sources = apply_model(
        model,
        wav[None],
        device=args.device,
        shifts=1,
        split=True,
        overlap=0.25,
        progress=True,
        num_workers=max(0, args.jobs)
    )[0]
    sources = (sources * scale_value) + offset

    save_sources(output_dir, args.input, sources, list(model.sources), model.samplerate, args.stem)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())