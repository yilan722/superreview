import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { CandleEngine } from "../fmp/candleEngine";
import { fetchIntradayHistory, getFmpApiKey } from "../fmp/client";
import { streamWindowLabel } from "../fmp/marketHours";
import { connectLiveStream } from "../fmp/stream";
import type { AssetKind } from "../fmp/symbols";
import { fmpRowsToLwCandles } from "../fmp/time";
import {
  CHART_INTERVAL_OPTIONS,
  INTERVAL_MINUTES,
  type FmpChartInterval,
  type LwCandle,
  type StreamStatus,
} from "../fmp/types";
import { OhlcEncyclopediaMatch } from "./OhlcEncyclopediaMatch";

type Props = {
  defaultSymbol?: string;
  defaultInterval?: FmpChartInterval;
};

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: "待命",
  connecting: "WebSocket 连接中",
  live: "实时 · WebSocket",
  polling: "实时 · REST 轮询",
  paused: "休市 · 仅历史",
  error: "连接异常",
  closed: "已断开",
};

export function LiveChartPanel({
  defaultSymbol = "ESUSD",
  defaultInterval = "5min",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const engineRef = useRef(new CandleEngine(INTERVAL_MINUTES[defaultInterval]));
  const streamRef = useRef<ReturnType<typeof connectLiveStream> | null>(null);

  const [symbol, setSymbol] = useState(defaultSymbol);
  const [interval, setInterval] = useState<FmpChartInterval>(defaultInterval);
  const [inputSymbol, setInputSymbol] = useState(defaultSymbol);
  const [aliasNote, setAliasNote] = useState<string | null>(null);
  const [fmpSymbol, setFmpSymbol] = useState<string | null>(null);
  const [assetKind, setAssetKind] = useState<AssetKind>("commodity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [barCount, setBarCount] = useState(0);
  const [candles, setCandles] = useState<LwCandle[]>([]);

  const applyStatus = useCallback((s: StreamStatus, detail?: string) => {
    setStatus(s);
    setStatusDetail(detail ?? null);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f1419" },
        textColor: "#8b9cb3",
      },
      grid: {
        vertLines: { color: "#1e2836" },
        horzLines: { color: "#1e2836" },
      },
      rightPriceScale: { borderColor: "#2a3544" },
      timeScale: {
        borderColor: "#2a3544",
        timeVisible: true,
        secondsVisible: interval === "1min",
      },
      crosshair: { vertLine: { labelBackgroundColor: "#3b82f6" } },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      ro.disconnect();
      streamRef.current?.close();
      streamRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [interval]);

  const loadAndStream = useCallback(
    async (sym: string, iv: FmpChartInterval) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      setLoading(true);
      setError(null);
      applyStatus("idle");
      setLastPrice(null);
      setAliasNote(null);
      setFmpSymbol(null);
      setCandles([]);

      streamRef.current?.close();
      streamRef.current = null;

      const intervalMin = INTERVAL_MINUTES[iv];
      engineRef.current.setIntervalMinutes(intervalMin);

      try {
        const { rows, resolved } = await fetchIntradayHistory(sym, iv);
        setAliasNote(resolved.aliasNote);
        setFmpSymbol(resolved.fmp);
        setAssetKind(resolved.kind);

        const loaded = fmpRowsToLwCandles(rows);
        setCandles(loaded);
        series.setData(
          loaded as { time: Time; open: number; high: number; low: number; close: number }[],
        );
        engineRef.current.seedFromHistory(loaded);
        setBarCount(loaded.length);
        if (loaded.length) setLastPrice(loaded[loaded.length - 1]!.close);
        chart.timeScale().fitContent();

        streamRef.current = connectLiveStream({
          symbolInput: sym,
          fmpSymbol: resolved.fmp,
          assetKind: resolved.kind,
          apiKey: getFmpApiKey(),
          onTick: (tick) => {
            const bar = engineRef.current.applyPrice(tick.price, tick.time);
            if (!bar) return;
            series.update(
              bar as { time: Time; open: number; high: number; low: number; close: number },
            );
            setLastPrice(bar.close);
            setCandles((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              const lw: LwCandle = {
                time: bar.time as LwCandle["time"],
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
              };
              if (last && last.time === lw.time) next[next.length - 1] = lw;
              else if (!last || (lw.time as number) > (last.time as number)) next.push(lw);
              return next;
            });
            setBarCount((n) => {
              const lastHist = loaded[loaded.length - 1]?.time ?? 0;
              return bar.time > lastHist ? Math.max(n, loaded.length + 1) : n;
            });
          },
          onStatus: applyStatus,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载失败";
        setError(msg);
        applyStatus("error", msg);
      } finally {
        setLoading(false);
      }
    },
    [applyStatus],
  );

  useEffect(() => {
    void loadAndStream(symbol, interval);
  }, [symbol, interval, loadAndStream]);

  const onApplySymbol = () => {
    const next = inputSymbol.trim();
    if (!next) return;
    setSymbol(next);
  };

  return (
    <div className="live-chart-panel">
      <div className="live-chart-toolbar">
        <label className="live-chart-field">
          <span>标的</span>
          <input
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onApplySymbol()}
            placeholder="ES1! / ESUSD / AAPL"
          />
        </label>
        <button type="button" className="btn-ghost" onClick={onApplySymbol} disabled={loading}>
          加载
        </button>
        <label className="live-chart-field">
          <span>周期</span>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as FmpChartInterval)}
            disabled={loading}
          >
            {CHART_INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void loadAndStream(symbol, interval)}
          disabled={loading}
        >
          刷新
        </button>
        <div className="live-chart-meta">
          <span className={`live-status live-status--${status}`} title={statusDetail ?? undefined}>
            {STATUS_LABEL[status]}
          </span>
          {statusDetail && <span className="live-status-hint">{statusDetail}</span>}
          {aliasNote && <span className="live-alias">{aliasNote}</span>}
          {fmpSymbol && (
            <span className="live-fmp-code" title={streamWindowLabel(assetKind)}>
              FMP: {fmpSymbol}
            </span>
          )}
          {lastPrice != null && (
            <span className="live-price">
              {symbol} <strong>{lastPrice.toFixed(2)}</strong>
            </span>
          )}
          <span className="live-bars">{barCount} 根 K 线</span>
        </div>
      </div>

      {error && <div className="live-chart-error">{error}</div>}

      <div className="live-chart-canvas-wrap" ref={containerRef} />
      {loading && <div className="live-chart-loading">加载历史 K 线…</div>}
      <OhlcEncyclopediaMatch
        symbol={symbol}
        interval={interval}
        assetKind={assetKind}
        candles={candles}
      />
    </div>
  );
}
