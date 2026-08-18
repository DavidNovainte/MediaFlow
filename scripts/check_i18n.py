#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare locale JSON key trees against en-US (project-relative paths)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "locales"
BASE = "en-US"


def get_all_keys(d, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    if isinstance(d, dict):
        for k, v in d.items():
            new_key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                keys |= get_all_keys(v, new_key)
            else:
                keys.add(new_key)
    return keys


def load_merged(lang: str) -> dict:
    lang_dir = LOCALES / lang
    merged: dict = {}

    def deep_merge(target: dict, source: dict) -> None:
        for key, val in source.items():
            if isinstance(val, dict) and not isinstance(val, list):
                if key not in target or not isinstance(target.get(key), dict):
                    target[key] = {}
                deep_merge(target[key], val)
            else:
                target[key] = val

    for path in sorted(lang_dir.glob("*.json")):
        with path.open("r", encoding="utf-8-sig") as f:
            deep_merge(merged, json.load(f))
    return merged


def main() -> int:
    if not LOCALES.is_dir():
        print(f"Locales dir not found: {LOCALES}", file=sys.stderr)
        return 1

    base = load_merged(BASE)
    base_keys = get_all_keys(base)
    print(f"Base {BASE}: {len(base_keys)} leaf keys")
    print(f"Locales root: {LOCALES}")
    print()

    exit_code = 0
    for lang_dir in sorted(p for p in LOCALES.iterdir() if p.is_dir()):
        lang = lang_dir.name
        if lang == BASE:
            continue
        data = load_merged(lang)
        keys = get_all_keys(data)
        missing = sorted(base_keys - keys)
        extra = sorted(keys - base_keys)
        print(f"--- {lang} ---")
        print(f"  keys: {len(keys)}  missing_vs_{BASE}: {len(missing)}  extra: {len(extra)}")
        if missing:
            exit_code = 1
            for k in missing[:15]:
                print(f"  - missing {k}")
            if len(missing) > 15:
                print(f"  ... +{len(missing) - 15} more")
        else:
            print("  structure: OK (all en-US keys present)")
        # encoding smoke
        for path in lang_dir.glob("*.json"):
            raw = path.read_bytes()
            if raw.startswith(b"\xef\xbb\xbf"):
                print(f"  warn: BOM in {path.name}")
            if b"\x00" in raw:
                print(f"  error: null bytes in {path.name}")
                exit_code = 1
        print()

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
