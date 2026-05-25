import { useEffect, useMemo, useState } from "react";
import { loadEncyclopediaIndex, encyclopediaDisplayUrl, encyclopediaThumbUrl } from "../encyclopedia/loadIndex";
import { BAR_WINDOW } from "../encyclopedia/match18Bars";
import {
  format18BarReadout,
  matchEncyclopediaByNumericKnowledge,
} from "../encyclopedia/matchNumericKnowledge";
import {
  formatOhlcExport,
  groupCandlesByEtDay,
  pickSessionBars,
  profileFromOhlc,
  type SessionPickMode,
} from "../encyclopedia/ohlcBars";
import type { AssetKind } from "../fmp/symbols";
import type { FmpChartInterval, LwCandle } from "../fmp/types";
import type { EncyclopediaMatch } from "../encyclopedia/types";

type Props = {
  symbol: string;
  interval: FmpChartInterval;
  assetKind: AssetKind;
  candles: LwCandle[];
};

export function OhlcEncyclopediaMatch({ symbol, interval, assetKind, candles }: Props) {
  const sessions = useMemo(() => groupCandlesByEtDay(candles), [candles]);
  const [dateKey, setDateKey] = useState("");
  const [pickMode, setPickMode] = useState<SessionPickMode>("day_open");
  const [startBar, setStartBar] = useState(1);
  const [barWindow, setBarWindow] = useState(BAR_WINDOW);
  const [topK, setTopK] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [queryAnalysis, setQueryAnalysis] = useState<string | null>(null);
  const [queryBrooks, setQueryBrooks] = useState<
    import("../encyclopedia/openingBarsBrooks").OpeningBarsBrooksAnalysis | null
  >(null);
  const [selectedBars, setSelectedBars] = useState<LwCandle[]>([]);
  const [matches, setMatches] = useState<EncyclopediaMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<EncyclopediaMatch | null>(null);

  useEffect(() => {
    if (sessions.length && !sessions.some((s) => s.dateKey === dateKey)) {
      setDateKey(sessions[0]!.dateKey);
    }
  }, [sessions, dateKey]);

  const activeDay = sessions.find((s) => s.dateKey === dateKey) ?? sessions[0];

  const previewBars = useMemo(() => {
    if (!activeDay) return [];
    return pickSessionBars(activeDay, barWindow, pickMode, assetKind, startBar);
  }, [activeDay, barWindow, pickMode, assetKind, startBar]);

  useEffect(() => {
    setSelectedBars(previewBars);
  }, [previewBars]);

  const runMatch = async () => {
    if (previewBars.length < 6) {
      setError(`所选时段仅 ${previewBars.length} 根 K 线，至少需要 6 根才能匹配。`);
      return;
    }
    setBusy(true);
    setError(null);
    setMatches([]);
    setSelectedMatch(null);
    try {
      const queryProfile = profileFromOhlc(previewBars, barWindow);
      setQueryBrooks(queryProfile.brooks ?? null);
      setQueryAnalysis(format18BarReadout(queryProfile));
      setProgress("阿布四段叙事 + Brooks 元素比对…");
      const { matches: hit, report } = await matchEncyclopediaByNumericKnowledge(
        queryProfile,
        {
          topK,
          onProgress: (done, total) =>
            setProgress(`Brooks 结构扫描 ${done}/${total} 页…`),
        },
      );
      const index = await loadEncyclopediaIndex();
      const previewByPage = new Map(
        (index?.pages ?? []).map((p) => [p.page, p.preview]),
      );
      const hitWithPreview = hit.map((m) => ({
        ...m,
        preview: m.preview ?? previewByPage.get(m.page),
      }));
      setProgress(null);
      if (!hitWithPreview.length) {
        setError(`全库 ${report.indexPages} 页中未找到可比较的数值结构。`);
        return;
      }
      if (report.lowConfidenceFallback) {
        setError(
          `未找到高置信匹配（最高约 ${report.bestBrooksScore ?? hitWithPreview[0]?.score}%）。以下按相对最接近排序，请人工对照。`,
        );
      }
      setMatches(hitWithPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匹配失败");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const copyOhlc = async () => {
    if (!selectedBars.length) return;
    await navigator.clipboard.writeText(formatOhlcExport(selectedBars));
  };

  if (!candles.length) {
    return (
      <div className="ohlc-match-panel ohlc-match-panel--empty">
        加载 K 线后可选择交易日，导出开盘 18 根 OHLC 并做百科数值匹配。
      </div>
    );
  }

  return (
    <div className="ohlc-match-panel">
      <header className="ohlc-match-header">
        <div>
          <h3>百科 OHLC 匹配</h3>
          <p className="ohlc-match-sub">
            {symbol} · {interval} · 阿布四段叙事 + Brooks 元素（开盘先跌 / V反转 / 牛腿 / TR·LH）
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => void runMatch()} disabled={busy}>
          {busy ? "匹配中…" : "按 18 根 OHLC 匹配百科"}
        </button>
      </header>

      <div className="ohlc-match-controls">
        <label className="live-chart-field">
          <span>交易日 (ET)</span>
          <select value={dateKey} onChange={(e) => setDateKey(e.target.value)}>
            {sessions.map((s) => (
              <option key={s.dateKey} value={s.dateKey}>
                {s.dateKey} ({s.candles.length} 根)
              </option>
            ))}
          </select>
        </label>
        <label className="live-chart-field">
          <span>选取</span>
          <select value={pickMode} onChange={(e) => setPickMode(e.target.value as SessionPickMode)}>
            <option value="day_open">当日开盘起 1–N 根</option>
            <option value="rth_open">RTH 9:30 起 1–N 根</option>
            <option value="custom">自定义起始棒</option>
          </select>
        </label>
        {pickMode === "custom" && (
          <label className="live-chart-field">
            <span>起始棒</span>
            <input
              type="number"
              min={1}
              max={500}
              value={startBar}
              onChange={(e) => setStartBar(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        )}
        <label className="live-chart-field">
          <span>窗口</span>
          <input
            type="number"
            min={12}
            max={24}
            value={barWindow}
            onChange={(e) => setBarWindow(Math.max(12, Math.min(24, Number(e.target.value) || 18)))}
          />
        </label>
        <label className="live-chart-field">
          <span>Top</span>
          <input
            type="number"
            min={5}
            max={30}
            value={topK}
            onChange={(e) => setTopK(Math.max(5, Math.min(30, Number(e.target.value) || 12)))}
          />
        </label>
        <button type="button" className="btn-ghost" onClick={() => void copyOhlc()} disabled={!selectedBars.length}>
          复制 OHLC JSON
        </button>
      </div>

      <div className="ohlc-match-preview">
        <span>
          已选 <strong>{selectedBars.length}</strong> 根
          {selectedBars.length >= 1 && (
            <>
              {" "}
              · O={selectedBars[0]!.open.toFixed(2)} → C=
              {selectedBars[selectedBars.length - 1]!.close.toFixed(2)}
            </>
          )}
        </span>
      </div>

      {progress && <div className="ohlc-match-progress">{progress}</div>}
      {error && <div className="ohlc-match-error">{error}</div>}

      {queryBrooks && (
        <div className="ohlc-brooks-metrics">
          <h4>
            开盘 {queryBrooks.barCount} 根 · {queryBrooks.classificationLabel}
            <span className="ohlc-data-badge ohlc-data-badge--live">FMP 真实 OHLC</span>
          </h4>
          <table className="ohlc-brooks-table">
            <tbody>
              <tr>
                <th>开盘</th>
                <td>{queryBrooks.open.toFixed(2)}</td>
                <th>{queryBrooks.barCount} 根后收</th>
                <td>{queryBrooks.close.toFixed(2)}</td>
              </tr>
              <tr>
                <th>净涨跌</th>
                <td>
                  {queryBrooks.netChange >= 0 ? "+" : ""}
                  {queryBrooks.netChange.toFixed(2)} pts
                </td>
                <th>总波幅</th>
                <td>{queryBrooks.totalRange.toFixed(2)} pts</td>
              </tr>
              <tr>
                <th>阳 / 阴</th>
                <td>
                  {queryBrooks.bullCount} : {queryBrooks.bearCount}
                </td>
                <th>收近高 / 收近低</th>
                <td>
                  {queryBrooks.closeNearHighCount} / {queryBrooks.closeNearLowCount}
                </td>
              </tr>
              {queryBrooks.largestBullBar && (
                <tr>
                  <th>最大阳线</th>
                  <td colSpan={3}>
                    Bar {queryBrooks.largestBullBar.index} (+{queryBrooks.largestBullBar.points.toFixed(2)} pts)
                  </td>
                </tr>
              )}
              {queryBrooks.largestBearBar && (
                <tr>
                  <th>最大阴线</th>
                  <td colSpan={3}>
                    Bar {queryBrooks.largestBearBar.index} ({queryBrooks.largestBearBar.points.toFixed(2)} pts)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <table className="ohlc-brooks-table ohlc-brooks-phases">
            <thead>
              <tr>
                <th>阶段</th>
                <th>Bar</th>
                <th>形态</th>
                <th>核心特征</th>
              </tr>
            </thead>
            <tbody>
              {queryBrooks.phases.map((ph) => (
                <tr key={`${ph.barStart}-${ph.kind}`}>
                  <td>{ph.label}</td>
                  <td>
                    {ph.barStart}–{ph.barEnd}
                  </td>
                  <td>{ph.pattern}</td>
                  <td>{ph.characteristics}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {queryAnalysis && (
        <pre className="ohlc-match-analysis">{queryAnalysis}</pre>
      )}

      {matches.length > 0 && (
        <div className="ohlc-match-results">
          <h4>相似百科页 ({matches.length})</h4>
          <ul className="ohlc-match-list">
            {matches.map((m) => (
              <li key={m.page}>
                <button
                  type="button"
                  className={`ohlc-match-card ${selectedMatch?.page === m.page ? "active" : ""}`}
                  onClick={() => setSelectedMatch(m)}
                >
                  <img src={encyclopediaThumbUrl(m.thumb)} alt="" width={72} height={48} />
                  <div className="ohlc-match-card-body">
                    <strong>
                      第 {m.page} 页 · {m.score}%
                      {m.verified ? " ✓" : m.lowConfidence ? " · 低置信" : ""}
                    </strong>
                    <span>{m.slidePhaseSig || m.queryPhaseSig}</span>
                    {m.reasons?.slice(0, 2).map((r) => (
                      <span key={r} className="ohlc-match-reason">
                        {r}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedMatch && (
        <div className="ohlc-match-detail">
          <header>
            <strong>第 {selectedMatch.page} 页</strong>
            <button type="button" className="btn-ghost" onClick={() => setSelectedMatch(null)}>
              关闭
            </button>
          </header>
          <img
            src={encyclopediaDisplayUrl(selectedMatch)}
            alt={`百科第 ${selectedMatch.page} 页`}
            className="ohlc-match-detail-img"
          />
          {selectedMatch.brooksElementRows?.length ? (
            <table className="ohlc-phase-table ohlc-brooks-align-table">
              <thead>
                <tr>
                  <th>Brooks 元素</th>
                  <th>你的 {barWindow} 根 K 线</th>
                  <th>百科 slide（相对结构，非报价）</th>
                  <th>匹配</th>
                </tr>
              </thead>
              <tbody>
                {selectedMatch.brooksElementRows.map((row) => (
                  <tr key={`${row.elementEn}-${row.queryDetail}`} className={row.matched ? "match-yes" : ""}>
                    <td>{row.element}</td>
                    <td>{row.queryDetail}</td>
                    <td>{row.slideDetail}</td>
                    <td>{row.matched ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selectedMatch.phaseAlignments?.length ? (
            <table className="ohlc-phase-table">
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>查询棒</th>
                  <th>百科棒</th>
                  <th>匹配</th>
                </tr>
              </thead>
              <tbody>
                {selectedMatch.phaseAlignments.map((row) => (
                  <tr key={row.brooksElement} className={row.matched ? "match-yes" : ""}>
                    <td>{row.brooksElement}</td>
                    <td>{row.queryBars}</td>
                    <td>{row.slideBars}</td>
                    <td>{row.matched ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      )}
    </div>
  );
}
