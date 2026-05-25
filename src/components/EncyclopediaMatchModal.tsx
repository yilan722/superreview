import { useEffect, useRef, useState } from "react";
import { EncyclopediaMatchDetail } from "./EncyclopediaMatchDetail";
import { loadEncyclopediaIndex, encyclopediaThumbUrl } from "../encyclopedia/loadIndex";
import {
  BAR_WINDOW,
  detectQueryImageKind,
  format18BarReadout,
  matchEncyclopediaBy18Bars,
} from "../encyclopedia/match18Bars";
import { chartPageScoreFromDataUrl } from "../encyclopedia/chartPageScore";
import { computeHashesFromDataUrl } from "../encyclopedia/phash";
import type {
  EncyclopediaHashMode,
  EncyclopediaMatch,
  MatchReport,
} from "../encyclopedia/types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-fill from main chart screenshot */
  initialImage?: string | null;
};

export function EncyclopediaMatchModal({ open, onClose, initialImage }: Props) {
  const [queryImage, setQueryImage] = useState<string | null>(null);
  const [mode] = useState<EncyclopediaHashMode>("chart");
  const [topK, setTopK] = useState(12);
  const [matches, setMatches] = useState<EncyclopediaMatch[]>([]);
  const [queryHashes, setQueryHashes] = useState<{
    fullHash: string;
    chartHash: string;
  } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<EncyclopediaMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexPages, setIndexPages] = useState(0);
  const [pdfHint, setPdfHint] = useState<string | null>(null);
  const [querySummary, setQuerySummary] = useState<string | null>(null);
  const [queryAnalysis, setQueryAnalysis] = useState<string | null>(null);
  const [queryTags, setQueryTags] = useState<string[]>([]);
  const [matchProgress, setMatchProgress] = useState<string | null>(null);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    setQueryImage(initialImage ?? null);
    setMatches([]);
    setQueryHashes(null);
    setSelectedMatch(null);
    setQuerySummary(null);
    setQueryAnalysis(null);
    setMatchProgress(null);
    setQueryTags([]);
    setMatchReport(null);
    setError(null);
    void loadEncyclopediaIndex().then((idx) => {
      if (idx) {
        setIndexPages(idx.pages.length);
        setPdfHint(idx.pdfPathHint ?? idx.pdfFile ?? null);
      } else {
        setIndexPages(0);
        setPdfHint(null);
      }
    });
  }, [open, initialImage]);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQueryImage(reader.result as string);
      setMatches([]);
      setQueryHashes(null);
      setSelectedMatch(null);
    };
    reader.readAsDataURL(file);
  };

  const runMatch = async () => {
    if (!queryImage) {
      setError("请先上传或粘贴一张截图");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const index = await loadEncyclopediaIndex();
      if (!index?.pages.length) {
        setError(
          "尚未建立百科索引。请在项目根目录运行 npm run encyclopedia:build（首次会较慢）",
        );
        return;
      }
      const qChart = await chartPageScoreFromDataUrl(
        queryImage,
        null,
      );

      const hashes = await computeHashesFromDataUrl(queryImage);
      setQueryHashes(hashes);

      if (qChart < 0.22) {
        setError(
          "未能识别可用 K 线。请上传更清晰截图（整张图或18根K都支持）。",
        );
        return;
      }

      const queryKind = await detectQueryImageKind(queryImage);
      const dynamicWindow =
        queryKind.kind === "eighteen_bars"
          ? Math.max(12, Math.min(24, queryKind.barCount))
          : Math.max(30, Math.min(100, queryKind.barCount));
      let finalMatches: EncyclopediaMatch[] = [];
      let finalReport: MatchReport;

      if (queryKind.kind === "eighteen_bars") {
        setMatchProgress(`检测到近18棒图（约${queryKind.barCount}根），正在比对前${dynamicWindow}根…`);
        const { queryProfile, matches: hit, report } = await matchEncyclopediaBy18Bars(
          index,
          queryImage,
          null,
          {
            topK,
            barWindow: dynamicWindow,
            onProgress: (done, total) =>
              setMatchProgress(`18棒价格行为扫描 ${done}/${total} 页…`),
          },
        );
        finalMatches = hit;
        finalReport = report;
        setQuerySummary(`18根K图（识别 ${queryProfile.barCount} 根）`);
        setQueryAnalysis(format18BarReadout(queryProfile));
        setQueryTags([queryProfile.phaseSig || "18棒分析", ...queryProfile.patternTags.slice(0, 4)]);
      } else {
        setMatchProgress(`检测到整图（约${queryKind.barCount}根），按前${dynamicWindow}根结构匹配…`);
        const { queryProfile, matches: hit, report } = await matchEncyclopediaBy18Bars(
          index,
          queryImage,
          null,
          {
            topK,
            barWindow: dynamicWindow,
            onProgress: (done, total) =>
              setMatchProgress(`N棒价格行为扫描 ${done}/${total} 页…`),
          },
        );
        finalMatches = hit;
        finalReport = report;
        setQuerySummary(`整图模式：前${queryProfile.window}根价格行为`);
        setQueryAnalysis(format18BarReadout(queryProfile));
        setQueryTags([queryProfile.phaseSig || `前${queryProfile.window}根`, ...queryProfile.patternTags.slice(0, 4)]);
      }

      setMatchReport(finalReport);
      setMatchProgress(null);
      if (!finalMatches.length) {
        setMatches([]);
        setError(
          `全库 ${finalReport.indexPages} 页中未能解析出可比较的 K 线。请换更清晰截图后重试。`,
        );
        return;
      }
      setError(
        finalReport.lowConfidenceFallback
          ? `未找到高置信匹配（最高约 ${finalReport.bestBrooksScore ?? finalMatches[0]?.score}%）。以下按全库相对最接近排序，请人工对照。`
          : null,
      );
      setMatches(finalMatches);
      setSelectedMatch(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匹配失败");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  if (selectedMatch && queryImage && queryHashes) {
    return (
      <EncyclopediaMatchDetail
        match={selectedMatch}
        queryImage={queryImage}
        queryCrop={null}
        queryHashes={queryHashes}
        mode={mode}
        showRegions={false}
        onClose={() => setSelectedMatch(null)}
      />
    );
  }

  return (
    <div className="ency-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ency-modal"
        role="dialog"
        aria-labelledby="ency-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ency-modal-header">
          <div>
            <h2 id="ency-modal-title">百科相似页定位</h2>
            <p className="ency-modal-sub">
              视觉检索 + K 线/EMA20 结构解读。索引已收录{" "}
              <strong>{indexPages || "—"}</strong> 页
              {pdfHint ? (
                <>
                  {" "}
                  · PDF：<span className="ency-pdf-hint">{pdfHint}</span>
                </>
              ) : null}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="ency-modal-body">
          <section className="ency-query">
            <div className="ency-toolbar">
              <label className="ency-upload">
                上传截图
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {initialImage && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setQueryImage(initialImage);
                    setMatches([]);
                  }}
                >
                  使用当前主图
                </button>
              )}
            </div>

            {queryImage ? (
              <div
                ref={imgWrapRef}
                className="ency-query-preview"
              >
                <img ref={imgRef} src={queryImage} alt="查询截图" draggable={false} />
              </div>
            ) : (
              <p className="ency-placeholder">上传 K 线截图，或从主画布带入当前图</p>
            )}

            <div className="ency-options">
              <p className="ency-mode-note">
                自动模式：上传整张图则按整图结构匹配；上传18根K图则按前{BAR_WINDOW}根价格行为匹配。无需框选。
              </p>
              <label>
                结果数量
                <input
                  type="number"
                  min={4}
                  max={30}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value) || 12)}
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !queryImage}
                onClick={() => void runMatch()}
              >
                {busy ? matchProgress ?? "18棒匹配…" : `按 ${BAR_WINDOW} 根 K 线查找`}
              </button>
            </div>
            {error && (
              <p
                className={
                  matchReport?.lowConfidenceFallback
                    ? "ency-error ency-warn"
                    : "ency-error"
                }
              >
                {error}
              </p>
            )}
            {matchReport && (
              <div className="ency-match-report">
                <strong>匹配报告（可核对，非黑箱）</strong>
                <ol>
                  <li>
                    自动识别 K 线主图（忽略成交量/副图等指标）· 截图 K 线得分{" "}
                    <strong>{(matchReport.queryChartScore * 100).toFixed(0)}%</strong>
                  </li>
                  <li>
                    扫描索引 <strong>{matchReport.indexPages}</strong> 页
                  </li>
                  <li>
                    {matchReport.matchMode === "18bars" ? (
                      <>
                        以<strong>前 {matchReport.barWindow ?? BAR_WINDOW} 根</strong> K 线扫描{" "}
                        <strong>{matchReport.scannedCandidates}</strong> 页 → 展示{" "}
                        <strong>{matches.length}</strong> 页（分数 = 18棒相似度）
                      </>
                    ) : (
                      <>
                        整图结构扫描 <strong>{matchReport.scannedCandidates}</strong> 页 → 展示{" "}
                        <strong>{matches.length}</strong> 页（分数 = 整图结构相似度）
                      </>
                    )}
                  </li>
                </ol>
                <p className="ency-match-report-note">
                  {matchReport.matchMode === "18bars"
                    ? `已先做百科标签归档（开局/趋势/setup），再筛选匹配。${
                        matchReport.skippedIncompatible
                          ? `已过滤不相容页 ${matchReport.skippedIncompatible} 页。`
                          : ""
                      }`
                    : "整图模式会比较整段价格行为结构（趋势/区间/形态），不依赖框选。"}
                </p>
              </div>
            )}
            {querySummary && (
              <div className="ency-query-readout">
                <strong>截图结构解读（阿布式）</strong>
                <p>{querySummary}</p>
                {queryAnalysis && (
                  <pre className="ency-query-analysis">{queryAnalysis}</pre>
                )}
                {queryTags.length > 0 && (
                  <div className="ency-tags">
                    {queryTags.map((t) => (
                      <span key={t} className="ency-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="ency-hint">
              你只需上传截图：系统会自动识别类型并匹配，不再显示框选框。
            </p>
          </section>

          <section className="ency-results">
            <h3>匹配结果</h3>
            {matches.length > 0 && (
              <p className="ency-results-hint">点击卡片放大百科页，并标出最相似的 K 线区域</p>
            )}
            {!matches.length && !busy && (
              <p className="ency-placeholder">运行匹配后，这里会显示最相似的 PDF 页码与缩略图</p>
            )}
            <ul className="ency-result-grid">
              {matches.map((m) => (
                <li key={m.page}>
                  <button
                    type="button"
                    className="ency-result-card"
                    onClick={() => setSelectedMatch(m)}
                  >
                    <div className="ency-result-thumb-wrap">
                      <img
                        src={encyclopediaThumbUrl(m.thumb)}
                        alt={`PDF 第 ${m.page} 页`}
                        loading="lazy"
                      />
                    </div>
                    <div className="ency-result-meta">
                      <strong>PDF 第 {m.page} 页</strong>
                      {m.verified && <span className="ency-verified">已验证</span>}
                      {m.lowConfidence && !m.verified && (
                        <span className="ency-low-conf">参考</span>
                      )}
                      {m.slidePhaseLabel && (
                        <span className="ency-phase">
                          {m.slidePhaseLabel}
                          {m.slideScaleLabel ? ` · ${m.slideScaleLabel}` : ""}
                        </span>
                      )}
                      <span className="ency-score">
                        18棒 {m.score}%
                        {m.phaseScore != null && ` · 阶段 ${m.phaseScore}%`}
                        {m.chartScore != null &&
                          ` · K线图 ${(m.chartScore * 100).toFixed(0)}%`}
                      </span>
                      <span className="ency-dist">
                        哈希距 full {m.fullDistance} · chart {m.chartDistance}
                      </span>
                      {m.reasons && m.reasons.length > 0 && (
                        <ul className="ency-reasons">
                          {m.reasons.slice(0, 2).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                      {m.cautions && m.cautions.length > 0 && (
                        <p className="ency-caution-line">{m.cautions[0]}</p>
                      )}
                      <span className="ency-open-hint">点击查看放大 →</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
