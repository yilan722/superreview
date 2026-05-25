#!/usr/bin/env python3
"""
Build (or incrementally update) encyclopedia page knowledge from local thumbs.

Output:
  public/encyclopedia-data/knowledge.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def detect_theme(pixels: list[tuple[int, int, int]]) -> str:
    if not pixels:
        return "light"
    avg = sum(luminance(r, g, b) for r, g, b in pixels) / len(pixels)
    return "dark" if avg < 95 else "light"


def classify_pixel(r: int, g: int, b: int, theme: str) -> str:
    lum = luminance(r, g, b)
    if theme == "dark":
        if lum < 44:
            return "skip"
        if g > r + 10 and g > b + 6 and g > 65:
            return "bull"
        if r > g + 10 and r > b + 6 and r > 65:
            return "bear"
        return "skip"
    # light
    if lum > 235:
        return "skip"
    if g > r + 12 and g > b:
        return "bull"
    if r > g + 12 and r > b:
        return "bear"
    if lum < 205:
        return "candle"
    return "skip"


def linreg_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    sx = sy = sxy = sxx = 0.0
    for i, v in enumerate(values):
        sx += i
        sy += v
        sxy += i * v
        sxx += i * i
    denom = n * sxx - sx * sx
    if denom == 0:
        return 0.0
    return (n * sxy - sx * sy) / denom


@dataclass
class ColBar:
    high: float
    low: float
    open: float
    close: float
    range: float
    valid: bool
    bull: bool


def extract_column_bars(img: Image.Image) -> tuple[list[ColBar], int]:
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = list(rgb.getdata())
    theme = detect_theme(px[:: max(1, len(px) // 6000)])

    bars: list[ColBar] = []
    for x in range(w):
        ys: list[int] = []
        bull = 0
        bear = 0
        for y in range(h):
            r, g, b = rgb.getpixel((x, y))
            kind = classify_pixel(r, g, b, theme)
            if kind == "skip":
                continue
            ys.append(y)
            if kind == "bull":
                bull += 1
            elif kind == "bear":
                bear += 1
        if len(ys) < h * 0.03:
            bars.append(ColBar(0.0, 0.0, 0.0, 0.0, 0.0, False, True))
            continue
        high = float(min(ys))
        low = float(max(ys))
        rng = max(1.0, low - high)
        sorted_ys = sorted(ys)
        open_y = float(sorted_ys[int(len(sorted_ys) * 0.25)])
        close_y = float(sorted_ys[int(len(sorted_ys) * 0.75)])
        bars.append(
            ColBar(
                high,
                low,
                open_y,
                close_y,
                rng,
                rng > h * 0.02,
                bull >= bear,
            )
        )
    return bars, h


def crop_chart(img: Image.Image) -> Image.Image:
    w, h = img.size
    l = int(w * 0.04)
    r = int(w * 0.96)
    t = int(h * 0.10)
    b = int(h * 0.78)
    return img.crop((l, t, r, b))


def page_kind(img: Image.Image, candle_dominance: float) -> str:
    rgb = img.convert("RGB")
    px = list(rgb.getdata())
    orange = 0
    for r, g, b in px[::8]:
        if r > 200 and 85 < g < 210 and b < 130:
            orange += 1
    orange_ratio = orange / max(1, len(px[::8]))
    if orange_ratio > 0.22:
        return "title_slide"
    if candle_dominance < 0.12:
        return "divider_slide"
    return "chart_slide"


def classify_setup(closes: list[float], bars: list[ColBar]) -> tuple[str, str, str, float]:
    valid = [b for b in bars if b.valid]
    if len(valid) < 6:
        return "unclear", "sideways", "mixed", 0.0

    ranges = [b.range for b in valid]
    avg_range = sum(ranges) / len(ranges)
    slope = linreg_slope(closes)
    gate = max(0.6, avg_range * 0.08)
    if abs(slope) < gate:
        direction = "sideways"
    else:
        direction = "down" if slope > 0 else "up"

    start_n = max(4, min(6, len(closes)))
    start_slope = linreg_slope(closes[:start_n])
    if abs(start_slope) < gate:
        opening = "tr_open"
    else:
        opening = "bear_from_open" if start_slope > 0 else "bull_from_open"

    overlap = 0.0
    for i in range(1, len(valid)):
        if abs(valid[i].close - valid[i - 1].close) < valid[i].range * 0.35:
            overlap += 1
    overlap /= max(1, len(valid) - 1)

    if overlap > 0.48:
        setup = "trading_range"
    elif direction == "up":
        setup = "bull_trend"
    elif direction == "down":
        setup = "bear_trend"
    else:
        setup = "mixed"

    return opening, direction, setup, overlap


def chunk_setups(valid: list[ColBar], chunk_size: int = 18) -> list[dict]:
    out: list[dict] = []
    if not valid:
        return out
    for s in range(0, len(valid), chunk_size):
        e = min(len(valid), s + chunk_size)
        chunk = valid[s:e]
        closes = [b.close for b in chunk]
        opening, direction, setup, overlap = classify_setup(closes, chunk)
        out.append(
            {
                "barStart": s + 1,
                "barEnd": e,
                "openingSetup": opening,
                "direction": direction,
                "setup": setup,
                "overlap": round(overlap, 4),
            }
        )
    return out


PHASE_META = {
    "bear_spike": ("熊市尖峰", "Bear spike"),
    "bull_spike": ("牛市尖峰", "Bull spike"),
    "bear_leg": ("空头腿", "Bear leg"),
    "bull_leg": ("多头腿", "Bull leg"),
    "tr": ("交易区间 TR", "Trading range"),
    "tr_lower_highs": ("TR 内 Lower Highs", "TR lower highs"),
    "tr_higher_lows": ("TR 内 Higher Lows", "TR higher lows"),
    "bear_breakout": ("熊市突破", "Bear breakout"),
    "bull_breakout": ("牛市突破", "Bull breakout"),
    "v_reversal_up": ("V 形反转向上", "V reversal up"),
    "v_reversal_down": ("V 形反转向下", "V reversal down"),
}


def median(nums: list[float]) -> float:
    if not nums:
        return 0.0
    s = sorted(nums)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2.0


def label_segment(chunk: list[ColBar], height: float, seg_idx: int) -> str:
    closes = [b.close for b in chunk]
    slope = linreg_slope(closes)
    ranges = [b.range for b in chunk]
    med_r = median(ranges) or height * 0.04
    overlap = 0.0
    for i in range(1, len(closes)):
        if abs(closes[i] - closes[i - 1]) < med_r * 0.4:
            overlap += 1
    overlap /= max(1, len(closes) - 1)
    bulls = sum(1 for b in chunk if b.bull)
    bears = len(chunk) - bulls
    n = len(chunk)
    bull_r = bulls / max(1, n)
    bear_r = bears / max(1, n)
    highs = [b.high for b in chunk]
    lows = [b.low for b in chunk]
    high_slope = linreg_slope(highs)
    low_slope = linreg_slope(lows)
    norm = med_r
    big_bear = sum(1 for b in chunk if not b.bull and b.range > med_r * 1.45)
    big_bull = sum(1 for b in chunk if b.bull and b.range > med_r * 1.45)
    is_last = seg_idx >= 2
    if big_bear >= 2 and slope > norm * 0.15 and bear_r > 0.55:
        return "bear_breakout" if is_last and overlap < 0.35 else "bear_spike"
    if big_bull >= 2 and slope < -norm * 0.15 and bull_r > 0.55:
        return "bull_breakout" if is_last and overlap < 0.35 else "bull_spike"
    if overlap > 0.48:
        if high_slope > norm * 0.04 and low_slope > norm * 0.02:
            return "tr_lower_highs"
        if high_slope < -norm * 0.04 and low_slope < -norm * 0.02:
            return "tr_higher_lows"
        return "tr"
    if slope > norm * 0.1 and bear_r > 0.52:
        return "bear_leg"
    if slope < -norm * 0.1 and bull_r > 0.52:
        return "bull_leg"
    if n >= 3:
        half = (n + 1) // 2
        s1 = linreg_slope(closes[:half])
        s2 = linreg_slope(closes[half:])
        if s1 > norm * 0.12 and s2 < -norm * 0.1:
            return "v_reversal_up"
        if s1 < -norm * 0.12 and s2 > norm * 0.1:
            return "v_reversal_down"
    if slope > norm * 0.08:
        return "bear_leg"
    if slope < -norm * 0.08:
        return "bull_leg"
    return "tr"


def extract_phases(chunk: list[ColBar], height: float) -> list[dict]:
    n = len(chunk)
    if n < 3:
        return []
    seg_count = 3 if n >= 12 else 2
    seg_len = max(3, n // seg_count)
    phases: list[dict] = []
    for s in range(0, n, seg_len):
        end = min(n, s + seg_len)
        if end - s < 2:
            continue
        sub = chunk[s:end]
        kind = label_segment(sub, height, len(phases))
        label, label_en = PHASE_META.get(kind, (kind, kind))
        phases.append(
            {
                "kind": kind,
                "label": label,
                "labelEn": label_en,
                "barStart": s + 1,
                "barEnd": end,
                "summary": f"{label}：{end - s} 根",
            }
        )
    return phases


def detect_direction(closes: list[float], avg_range: float) -> str:
    slope = linreg_slope(closes)
    gate = max(0.6, avg_range * 0.08)
    if abs(slope) < gate:
        return "sideways"
    return "down" if slope > 0 else "up"


def build_numeric_profile(chunk: list[ColBar], height: float, bar_start: int) -> dict | None:
    if len(chunk) < 6:
        return None
    closes = [b.close for b in chunk]
    min_c, max_c = min(closes), max(closes)
    span = max(1.0, max_c - min_c)
    shape = [round((c - min_c) / span, 5) for c in closes]
    polarity = []
    for b in chunk:
        body_ratio = abs(b.close - b.open) / max(1.0, b.range)
        if body_ratio < 0.22:
            polarity.append(0)
        else:
            polarity.append(1 if b.bull else -1)
    bulls = sum(1 for b in chunk if b.bull)
    bears = len(chunk) - bulls
    ranges = [b.range for b in chunk]
    avg_range = sum(ranges) / len(ranges)
    opening, direction, setup, overlap = classify_setup(closes, chunk)
    start_n = max(4, min(6, len(closes)))
    start_direction = detect_direction(closes[:start_n], avg_range)
    third = max(1, len(chunk) // 3)
    early = chunk[:third]
    late = chunk[-third:]
    phases = extract_phases(chunk, height)
    phase_sig = " → ".join(p["kind"] for p in phases)
    return {
        "barStart": bar_start,
        "barEnd": bar_start + len(chunk) - 1,
        "window": len(chunk),
        "shape": shape,
        "polarity": polarity,
        "bullCount": bulls,
        "bearCount": bears,
        "overlap": round(overlap, 4),
        "netSlope": round(linreg_slope(closes), 5),
        "earlySlope": round(linreg_slope([b.close for b in early]), 5) if early else 0,
        "lateSlope": round(linreg_slope([b.close for b in late]), 5) if late else 0,
        "direction": direction,
        "startDirection": start_direction,
        "openingSetup": opening,
        "setup": setup,
        "phaseSig": phase_sig,
        "phases": phases,
    }


def sliding_numeric_windows(valid: list[ColBar], height: float, window: int = 18, step: int = 3) -> list[dict]:
    out: list[dict] = []
    if len(valid) < 6:
        return out
    win = min(window, len(valid))
    max_start = max(0, len(valid) - win)
    for s in range(0, max_start + 1, step):
        chunk = valid[s : s + win]
        prof = build_numeric_profile(chunk, height, s + 1)
        if prof:
            out.append(prof)
    if not out and valid:
        prof = build_numeric_profile(valid[:win], height, 1)
        if prof:
            out.append(prof)
    return out


def load_json(path: Path, default: dict) -> dict:
    if not path.is_file():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="public/encyclopedia-data path")
    ap.add_argument("--resume", action="store_true", help="skip learned pages")
    args = ap.parse_args()

    out_dir = Path(args.out)
    index_path = out_dir / "index.json"
    knowledge_path = out_dir / "knowledge.json"
    thumbs_dir = out_dir / "thumbs"

    index = load_json(index_path, {"pages": []})
    pages = index.get("pages", [])

    existing = load_json(
        knowledge_path,
        {
            "version": 2,
            "indexVersion": index.get("version"),
            "generatedAt": "",
            "pageCount": 0,
            "pages": [],
        },
    )
    by_key = {
        f"{p.get('page')}:{p.get('chartHash','')}": p for p in existing.get("pages", [])
    }

    learned_pages: list[dict] = []
    processed = 0
    skipped = 0

    for entry in pages:
        page = entry.get("page")
        thumb = entry.get("thumb")
        chart_hash = entry.get("chartHash", "")
        key = f"{page}:{chart_hash}"
        if args.resume and key in by_key and by_key[key].get("windows"):
            learned_pages.append(by_key[key])
            skipped += 1
            continue
        if not thumb:
            continue
        img_path = out_dir / thumb
        if not img_path.is_file():
            # fallback to thumbs dir name if index path differs
            img_path = thumbs_dir / Path(thumb).name
            if not img_path.is_file():
                continue
        img = Image.open(img_path).convert("RGB")
        chart_raw = crop_chart(img)
        chart = chart_raw.resize(
            (220, max(60, int(220 * chart_raw.height / max(1, chart_raw.width))))
        )
        bars, h = extract_column_bars(chart)
        valid = [b for b in bars if b.valid]
        candle_dom = len(valid) / max(1, len(bars))
        kind = page_kind(img, candle_dom)
        closes = [b.close for b in valid]
        opening, direction, setup, overlap = classify_setup(closes, valid)
        chunks = chunk_setups(valid, 18)
        windows = sliding_numeric_windows(valid, h, 18, 3)

        learned_pages.append(
            {
                "page": page,
                "thumb": thumb,
                "chartHash": chart_hash,
                "kind": kind,
                "barCount": len(valid),
                "openingSetup": opening,
                "direction": direction,
                "setup": setup,
                "overlap": round(overlap, 4),
                "candleDominance": round(candle_dom, 4),
                "chunks": chunks,
                "windows": windows,
            }
        )
        processed += 1
        if processed % 100 == 0:
            print(f"learned {processed} pages...")

    learned_pages.sort(key=lambda p: p.get("page", 0))
    out = {
        "version": 2,
        "indexVersion": index.get("version"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pageCount": len(learned_pages),
        "pages": learned_pages,
    }
    with knowledge_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(
        f"knowledge saved: {knowledge_path} (total={len(learned_pages)}, learned={processed}, skipped={skipped})"
    )


if __name__ == "__main__":
    main()

