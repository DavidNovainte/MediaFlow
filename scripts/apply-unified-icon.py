# -*- coding: utf-8 -*-
"""
Apply ONE master dark icon (with transparent rounded corners) to:
  - Desktop app (assets/icons/*)
  - Extension (extension/icons/*)
  - Website (real 1.MediaUniverse + workspace copy)

Usage:
  python scripts/apply-unified-icon.py path/to/dark-icon.png
  python scripts/apply-unified-icon.py   # uses assets/icons/mediaflow-icon-source.png

Corner radius defaults to ~22% of the side (Windows 11 / modern desktop app look).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing pillow...")
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]  # MediaFlow/
UNIVERSE = ROOT.parent  # 2.MediaFlow/
WEBSITE_CANDIDATES = [
    # Real production website (outside workspace) — preferred
    Path(r"F:/Codage/MediaUniverse/1.MediaUniverse/src/assets/images"),
    # Workspace copy (stale mirror — keep in sync if present)
    UNIVERSE / "1.MediaUniverse" / "src" / "assets" / "images",
]

DEFAULT_SOURCE = ROOT / "assets" / "icons" / "mediaflow-icon-source.png"
# Windows 11-ish continuous corner; also matches website rounded-md at small sizes
DEFAULT_RADIUS_RATIO = 0.22


def load_master(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    if abs(w - h) > 2:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        im = im.crop((left, top, left + side, top + side))
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.Resampling.LANCZOS)
    return im


def apply_rounded_mask(im: Image.Image, radius_ratio: float = DEFAULT_RADIUS_RATIO) -> Image.Image:
    """Cut opaque square plate into transparent rounded-rect icon."""
    im = im.convert("RGBA")
    w, h = im.size
    radius = max(1, int(round(min(w, h) * radius_ratio)))
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    # Slight inset keeps anti-aliased edge clean on dark UI backgrounds
    inset = 0
    draw.rounded_rectangle(
        (inset, inset, w - 1 - inset, h - 1 - inset),
        radius=radius,
        fill=255,
    )
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def save_png(im: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = im if size is None else im.resize((size, size), Image.Resampling.LANCZOS)
    out.save(path, format="PNG", optimize=True)
    rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    print(f"  wrote {rel} ({out.size[0]}x{out.size[1]})")


def write_ico(im: Image.Image, path: Path) -> None:
    """Build a multi-size .ico via png-to-ico (Pillow ICO often drops frames)."""
    import subprocess
    import tempfile

    sizes = [16, 24, 32, 48, 64, 128, 256]
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mf-ico-") as tmp:
        tmp_path = Path(tmp)
        pngs: list[str] = []
        for s in sizes:
            p = tmp_path / f"icon-{s}.png"
            im.resize((s, s), Image.Resampling.LANCZOS).save(p, format="PNG")
            pngs.append(str(p))
        # Prefer project-local png-to-ico through node for consistent multi-size output
        script = (
            "const fs=require('fs');"
            "const pngToIco=require('png-to-ico');"
            f"const files={pngs!r};"
            "pngToIco(files).then((buf)=>{fs.writeFileSync(process.argv[1], buf);})"
            ".catch((e)=>{console.error(e);process.exit(1);});"
        )
        # png-to-ico may be ESM-only — fall back to dynamic import runner
        runner = ROOT / "tmp" / "_write_ico_runner.mjs"
        runner.parent.mkdir(parents=True, exist_ok=True)
        runner.write_text(
            "import fs from 'fs';\n"
            "import pngToIco from 'png-to-ico';\n"
            "const out = process.argv[2];\n"
            "const files = process.argv.slice(3);\n"
            "const buf = await pngToIco(files);\n"
            "fs.writeFileSync(out, buf);\n",
            encoding="utf-8",
        )
        subprocess.check_call(
            ["node", str(runner), str(path), *pngs],
            cwd=str(ROOT),
        )
    print(f"  wrote {path.relative_to(ROOT)} (ico multi-size, {path.stat().st_size} bytes)")


def apply(src: Path, radius_ratio: float = DEFAULT_RADIUS_RATIO) -> None:
    if not src.is_file():
        raise SystemExit(
            f"Source not found: {src}\n"
            f"Save your DARK MediaFlow icon PNG as:\n  {DEFAULT_SOURCE}\n"
            f"or pass the path: python scripts/apply-unified-icon.py <file.png>"
        )

    print(f"Master: {src}")
    print(f"Rounded corners: {radius_ratio:.0%} of side (transparent outside)")
    raw = load_master(src)

    icons = ROOT / "assets" / "icons"
    icons.mkdir(parents=True, exist_ok=True)

    # Keep unrounded full-bleed source for future re-exports
    master_path = icons / "mediaflow-icon-source.png"
    if src.resolve() != master_path.resolve():
        raw.save(master_path, format="PNG", optimize=True)
        print(f"  saved source -> {master_path.relative_to(ROOT)}")
    else:
        # Re-normalize square 1024 source in place if needed
        if Image.open(master_path).size != (1024, 1024):
            raw.save(master_path, format="PNG", optimize=True)

    master = apply_rounded_mask(raw, radius_ratio=radius_ratio)

    # Desktop masters used by electron-builder / tray
    save_png(master, icons / "mediaflow-studio-icon.png", 1024)
    save_png(master, icons / "icon.png", 1024)
    for s in (16, 24, 32, 48, 64, 128, 256):
        save_png(master, icons / f"mediaflow-studio-icon-{s}.png", s)
    write_ico(master, icons / "mediaflow-studio-icon.ico")
    write_ico(master, icons / "icon.ico")

    # Size strip preview on checkerboard-ish dark bg
    strip_h = 128
    gaps = 20
    sizes_prev = [16, 24, 32, 48, 64, 128]
    total_w = sum(sizes_prev) + gaps * (len(sizes_prev) - 1) + 40
    preview = Image.new("RGBA", (total_w, strip_h + 40), (30, 30, 35, 255))
    x = 20
    for s in sizes_prev:
        tile = master.resize((s, s), Image.Resampling.LANCZOS)
        preview.paste(tile, (x, 20 + (strip_h - s) // 2), tile)
        x += s + gaps
    preview.save(icons / "mediaflow-studio-icon-size-preview.png")
    print("  wrote size preview")

    # Extension
    ext = ROOT / "extension" / "icons"
    save_png(master, ext / "icon.png", 128)
    save_png(master, ext / "icon16.png", 16)
    save_png(master, ext / "icon48.png", 48)
    save_png(master, ext / "icon128.png", 128)

    # Website logos (real site + optional workspace copy)
    for web in WEBSITE_CANDIDATES:
        if not web.is_dir():
            continue
        save_png(master, web / "logo.png", 1024)
        save_png(master, web / "favicon-32.png", 32)
        save_png(master, web / "apple-touch-icon.png", 180)
        print(f"  website dir: {web}")

    # Verify transparent corners on master
    c = master.getpixel((0, 0))
    print(f"\nCorner alpha check (0,0)={c}  (expect a=0)")
    print("Done. Unified ROUNDED dark icon applied to desktop + extension + website.")
    print("Next: rebuild installer / reload unpacked extension / redeploy website.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    radius = DEFAULT_RADIUS_RATIO
    for a in sys.argv[1:]:
        if a.startswith("--radius="):
            radius = float(a.split("=", 1)[1])
    src = Path(args[0]) if args else DEFAULT_SOURCE
    apply(src, radius_ratio=radius)
