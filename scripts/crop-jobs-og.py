"""One-off / maintenance: build ss/jobs-og.jpg (1200x630) from ss/mMMXL.jpg for link previews."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ss" / "mMMXL.jpg"
OUT = ROOT / "ss" / "jobs-og.jpg"
TW, TH = 1200, 630


def cover_crop(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    sw, sh = im.size
    scale = max(target_w / sw, target_h / sh)
    nw = int(sw * scale + 0.5)
    nh = int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    return im.crop((left, top, left + target_w, top + target_h))


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing source: {SRC}")
    im = Image.open(SRC).convert("RGB")
    out = cover_crop(im, TW, TH)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, format="JPEG", quality=88, optimize=True)
    print(f"[crop-jobs-og] wrote {OUT} ({TW}x{TH}) from {SRC}")


if __name__ == "__main__":
    main()
