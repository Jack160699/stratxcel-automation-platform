"""
Generate favicon and Next app icons from public/logo-v2.png.

Does NOT modify or re-save public/logo-v2.png — that file is the canonical asset.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
APP = ROOT / "app"
LOGO = PUBLIC / "logo-v2.png"


def main() -> None:
    if not LOGO.is_file():
        print("Missing", LOGO, file=sys.stderr)
        sys.exit(1)

    data = LOGO.read_bytes()
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    w, h = im.size

    PUBLIC.mkdir(parents=True, exist_ok=True)

    for size, name in ((32, "favicon-32.png"), (64, "favicon-64.png"), (180, "favicon-180.png")):
        im.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name, optimize=True)

    im.resize((32, 32), Image.Resampling.LANCZOS).save(APP / "icon.png", optimize=True)
    im.resize((180, 180), Image.Resampling.LANCZOS).save(APP / "apple-icon.png", optimize=True)

    print("OK", w, h, "favicons + app icons (logo-v2.png unchanged)")


if __name__ == "__main__":
    main()
