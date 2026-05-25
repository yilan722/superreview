import type { UTCTimestamp } from "lightweight-charts";
import type { FmpIntradayRow, LwCandle } from "./types";

/** FMP intraday timestamps are US Eastern (NYSE). */
export function fmpDateToUnix(dateStr: string): UTCTimestamp {
  const [datePart, timePart] = dateStr.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const readEt = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const g = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
  };

  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 5; i++) {
    const p = readEt(guess);
    if (p.y === year && p.mo === month && p.d === day && p.h === hour && p.mi === minute && p.s === second) {
      return Math.floor(guess / 1000) as UTCTimestamp;
    }
    const deltaSec =
      (hour - p.h) * 3600 + (minute - p.mi) * 60 + (second - p.s) + (day - p.d) * 86400;
    guess += deltaSec * 1000;
  }
  return Math.floor(guess / 1000) as UTCTimestamp;
}

export function fmpRowsToLwCandles(rows: FmpIntradayRow[]): LwCandle[] {
  return [...rows]
    .reverse()
    .map((row) => ({
      time: fmpDateToUnix(row.date),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    }))
    .sort((a, b) => a.time - b.time);
}

export function bucketTime(unixSec: number, intervalMin: number): number {
  const intervalSec = intervalMin * 60;
  return Math.floor(unixSec / intervalSec) * intervalSec;
}
