import { bucketTime } from "./time";
import type { LwCandle } from "./types";

/** Aggregates tick/quote updates into OHLC bars for series.update(). */
export class CandleEngine {
  private intervalMin: number;
  private current: LwCandle | null = null;

  constructor(intervalMin: number) {
    this.intervalMin = intervalMin;
  }

  setIntervalMinutes(intervalMin: number) {
    this.intervalMin = intervalMin;
    this.current = null;
  }

  seedFromHistory(candles: LwCandle[]) {
    this.current = candles.length ? { ...candles[candles.length - 1]! } : null;
  }

  applyPrice(price: number, unixSec = Math.floor(Date.now() / 1000)): LwCandle | null {
    const bucket = bucketTime(unixSec, this.intervalMin);

    if (!this.current || bucket > this.current.time) {
      this.current = {
        time: bucket as LwCandle["time"],
        open: price,
        high: price,
        low: price,
        close: price,
      };
      return { ...this.current };
    }

    if (bucket < this.current.time) return null;

    this.current = {
      ...this.current,
      high: Math.max(this.current.high, price),
      low: Math.min(this.current.low, price),
      close: price,
    };
    return { ...this.current };
  }
}
