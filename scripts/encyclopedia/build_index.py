#!/usr/bin/env python3
"""
Build a perceptual-hash index + thumbnails for the Al Brooks encyclopedia PDF.

Usage:
  pip install -r scripts/encyclopedia/requirements.txt
  python3 scripts/encyclopedia/build_index.py \\
    --pdf "/path/to/阿布图表百科全书8800合并版-原版-中文目录.pdf" \\
    --out public/encyclopedia-data

Options:
  --from 1 --to 500     Process a page range (1-based, inclusive)
  --thumb-width 320     Grid thumbnail width in pixels
  --preview-width 1280  HD preview for zoom view (PDF native width is 2560)
  --render-width 640    Width used when computing hashes (downscaled from render)
  --previews-only       Regenerate previews/ for pages already in index (no re-hash)
  --resume              Skip pages already present in index.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HASH_SIZE = 8


def dhash_hex(img: Image.Image) -> str:
    gray = img.convert("L").resize(
        (HASH_SIZE + 1, HASH_SIZE), Image.Resampling.LANCZOS
    )
    pixels = list(gray.getdata())
    bits: list[int] = []
    for row in range(HASH_SIZE):
        row_start = row * (HASH_SIZE + 1)
        for col in range(HASH_SIZE):
            left = pixels[row_start + col]
            right = pixels[row_start + col + 1]
            bits.append(1 if left > right else 0)
    value = 0
    for bit in bits:
        value = (value << 1) | bit
    return f"{value:016x}"


def chart_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    left = int(w * 0.04)
    right = int(w * 0.96)
    top = int(h * 0.10)
    bottom = int(h * 0.78)
    return img.crop((left, top, right, bottom))


def render_page(pdf: Path, page: int, width: int, tmp_dir: Path) -> Path:
    prefix = tmp_dir / f"p{page}"
    cmd = [
        "pdftoppm",
        "-f",
        str(page),
        "-l",
        str(page),
        "-scale-to",
        str(width),
        "-png",
        str(pdf),
        str(prefix),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    matches = sorted(tmp_dir.glob(f"p{page}-*.png"))
    if not matches:
        raise FileNotFoundError(f"pdftoppm produced no output for page {page}")
    return matches[0]


def load_index(path: Path) -> dict:
    if not path.is_file():
        return {
            "version": 2,
            "hashSize": HASH_SIZE,
            "pages": [],
        }
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("pages", [])
    data["version"] = 2
    return data


def save_preview(img: Image.Image, preview_width: int, previews_dir: Path, page: int) -> str:
    previews_dir.mkdir(parents=True, exist_ok=True)
    name = f"{page:05d}.jpg"
    out = previews_dir / name
    preview = img
    if img.width != preview_width:
        ph = max(1, int(img.height * (preview_width / img.width)))
        preview = img.resize((preview_width, ph), Image.Resampling.LANCZOS)
    preview.save(out, "JPEG", quality=92, optimize=True)
    return f"previews/{name}"


def save_thumb(img: Image.Image, thumb_width: int, thumbs_dir: Path, page: int) -> str:
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    name = f"{page:05d}.jpg"
    out = thumbs_dir / name
    th = max(1, int(img.height * (thumb_width / img.width)))
    thumb = img.resize((thumb_width, th), Image.Resampling.LANCZOS)
    thumb.save(out, "JPEG", quality=85, optimize=True)
    return f"thumbs/{name}"


def chart_page_score(img: Image.Image) -> float:
    """0-1: real candlestick chart vs title/divider slide."""
    chart = chart_crop(img).convert("RGB")
    w, h = chart.size
    if w < 20 or h < 20:
        return 0.0
    small = chart.resize((120, max(32, int(h * 120 / w))), Image.Resampling.LANCZOS)
    sw, sh = small.size
    px = list(small.getdata())
    orange = blue = samples = 0
    for r, g, b in px:
        samples += 1
        if r > 200 and 85 < g < 210 and b < 130:
            orange += 1
        if b > r + 18 and b > g + 8 and b > 90 and r < 220:
            blue += 1
    orange_ratio = orange / max(1, samples)
    ema_ratio = blue / max(1, samples)

    candle_cols = 0
    col_hl: list[float] = []
    for x in range(sw):
        col_ys: list[int] = []
        for y in range(sh):
            r, g, b = px[y * sw + x]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 200:
                col_ys.append(y)
        if len(col_ys) < sh * 0.04:
            continue
        span = max(col_ys) - min(col_ys)
        col_hl.append(span / sh)
        body_est = span * 0.45
        has_tail = span > body_est * 1.2
        if 0.02 < span / sh < 0.38 and has_tail:
            candle_cols += 1

    candle_ratio = candle_cols / sw
    if candle_ratio < 0.14:
        return 0.0
    if orange_ratio > 0.28:
        return min(0.08, candle_ratio * 0.1)
    hl = sum(col_hl) / len(col_hl) if col_hl else 0.0
    score = min(0.55, candle_ratio * 0.95) + min(0.25, hl * 1.5)
    if ema_ratio > 0.003:
        score += 0.12
    if candle_ratio > 0.3:
        score = max(score, 0.52)
    return min(1.0, max(0.0, score))


def hash_source(img: Image.Image, render_width: int) -> Image.Image:
    if img.width <= render_width:
        return img
    rh = max(1, int(img.height * (render_width / img.width)))
    return img.resize((render_width, rh), Image.Resampling.LANCZOS)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build encyclopedia slide index")
    parser.add_argument("--pdf", required=True, type=Path, help="Path to encyclopedia PDF")
    parser.add_argument(
        "--out",
        default="public/encyclopedia-data",
        type=Path,
        help="Output directory (index.json + thumbs/)",
    )
    parser.add_argument("--from", dest="page_from", type=int, default=1)
    parser.add_argument("--to", dest="page_to", type=int, default=0, help="0 = until end")
    parser.add_argument("--thumb-width", type=int, default=320)
    parser.add_argument("--preview-width", type=int, default=1280)
    parser.add_argument("--render-width", type=int, default=640, help="Width for hashing")
    parser.add_argument(
        "--previews-only",
        action="store_true",
        help="Only rebuild previews/ for indexed pages (faster upgrade)",
    )
    parser.add_argument(
        "--chart-scores-only",
        action="store_true",
        help="Only update chartScore for pages already in index",
    )
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"PDF not found: {args.pdf}", file=sys.stderr)
        return 1

    out = args.out
    thumbs = out / "thumbs"
    previews = out / "previews"
    thumbs.mkdir(parents=True, exist_ok=True)
    previews.mkdir(parents=True, exist_ok=True)
    index_path = out / "index.json"

    data = load_index(path=index_path)
    data["pdfFile"] = args.pdf.name
    data["pdfPathHint"] = str(args.pdf.resolve())
    data["previewWidth"] = args.preview_width
    existing = {p["page"] for p in data["pages"]}
    by_page = {p["page"]: p for p in data["pages"]}

    page_to = args.page_to
    if page_to <= 0:
        info = subprocess.run(
            ["pdfinfo", str(args.pdf)],
            capture_output=True,
            text=True,
            check=False,
        )
        page_to = 9027
        for line in info.stdout.splitlines():
            if line.startswith("Pages:"):
                page_to = int(line.split(":")[1].strip())
                break

    master_width = max(args.preview_width, args.render_width)

    if args.previews_only or args.chart_scores_only:
        if not by_page:
            print("No pages in index.json — run a full build first.", file=sys.stderr)
            return 1
        pages_to_process = sorted(by_page)
        hi = args.page_to if args.page_to > 0 else pages_to_process[-1]
        pages_to_process = [p for p in pages_to_process if args.page_from <= p <= hi]
    else:
        pages_to_process = list(range(args.page_from, page_to + 1))

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for page in pages_to_process:
            if (
                not args.previews_only
                and not args.chart_scores_only
                and args.resume
                and page in existing
            ):
                continue
            try:
                rendered = render_page(args.pdf, page, master_width, tmp_dir)
                img = Image.open(rendered)
                score = round(chart_page_score(img), 3)

                if args.chart_scores_only:
                    entry = dict(by_page[page])
                    entry["chartScore"] = score
                elif args.previews_only:
                    preview_rel = save_preview(img, args.preview_width, previews, page)
                    entry = dict(by_page[page])
                    entry["preview"] = preview_rel
                else:
                    preview_rel = save_preview(img, args.preview_width, previews, page)
                    hash_img = hash_source(img, args.render_width)
                    entry = {
                        "page": page,
                        "thumb": save_thumb(img, args.thumb_width, thumbs, page),
                        "preview": preview_rel,
                        "fullHash": dhash_hex(hash_img),
                        "chartHash": dhash_hex(chart_crop(hash_img)),
                        "chartScore": score,
                    }

                data["pages"] = [p for p in data["pages"] if p["page"] != page]
                data["pages"].append(entry)
                data["pages"].sort(key=lambda p: p["page"])
                by_page[page] = entry

                if page % 25 == 0 or page == pages_to_process[0]:
                    with index_path.open("w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
                    label = (
                        "chartScore"
                        if args.chart_scores_only
                        else "preview"
                        if args.previews_only
                        else "indexed"
                    )
                    print(f"page {page} {label} ({len(data['pages'])} total)")
            except subprocess.CalledProcessError as e:
                print(f"page {page}: pdftoppm failed: {e.stderr.decode()}", file=sys.stderr)
            except Exception as e:
                print(f"page {page}: {e}", file=sys.stderr)

    with index_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Done. {len(data['pages'])} pages -> {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
