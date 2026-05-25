import { useEffect, useRef, useState } from "react";
import { encyclopediaDisplayUrl } from "../encyclopedia/loadIndex";
import {
  locateSimilarRegion,
  queryCompareAspect,
  rectToPercent,
  type LocatedRegion,
} from "../encyclopedia/locateRegion";
import { CHART_CROP } from "../encyclopedia/phash";
import type { EncyclopediaHashMode, EncyclopediaMatch } from "../encyclopedia/types";

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
  match: EncyclopediaMatch;
  queryImage: string;
  queryCrop: CropRect | null;
  queryHashes: { fullHash: string; chartHash: string };
  mode: EncyclopediaHashMode;
  showRegions?: boolean;
  onClose: () => void;
};

function pickQueryHash(
  hashes: { fullHash: string; chartHash: string },
  mode: EncyclopediaHashMode,
): string {
  if (mode === "full") return hashes.fullHash;
  if (mode === "chart") return hashes.chartHash;
  return hashes.chartHash;
}

export function EncyclopediaMatchDetail({
  match,
  queryImage,
  queryCrop,
  queryHashes,
  mode,
  showRegions = true,
  onClose,
}: Props) {
  const [region, setRegion] = useState<LocatedRegion | null>(null);
  const [locating, setLocating] = useState(true);
  const [zoom, setZoom] = useState(1);
  const queryImgRef = useRef<HTMLImageElement>(null);
  const slideImgRef = useRef<HTMLImageElement>(null);
  const [queryNatural, setQueryNatural] = useState({ w: 1, h: 1 });
  const [slideNatural, setSlideNatural] = useState({ w: 1, h: 1 });

  const slideUrl = encyclopediaDisplayUrl(match);
  const queryHash = pickQueryHash(queryHashes, mode);

  useEffect(() => {
    let cancelled = false;
    setLocating(true);
    setRegion(null);

    const run = async () => {
      const qImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("查询图加载失败"));
        el.src = queryImage;
      });
      const aspect = queryCompareAspect(
        qImg.naturalWidth,
        qImg.naturalHeight,
        queryCrop,
      );
      const located = await locateSimilarRegion(slideUrl, queryHash, aspect);
      if (!cancelled) {
        setRegion(located);
        setLocating(false);
      }
    };

    void run().catch(() => {
      if (!cancelled) setLocating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slideUrl, queryHash, queryImage, queryCrop]);

  const queryBox =
    queryCrop && queryCrop.w > 20 && queryCrop.h > 20
      ? rectToPercent(queryCrop, queryNatural.w, queryNatural.h)
      : rectToPercent(
          {
            x: queryNatural.w * CHART_CROP.left,
            y: queryNatural.h * CHART_CROP.top,
            w: queryNatural.w * (CHART_CROP.right - CHART_CROP.left),
            h: queryNatural.h * (CHART_CROP.bottom - CHART_CROP.top),
          },
          queryNatural.w,
          queryNatural.h,
        );

  const slideBox = region
    ? rectToPercent(region.rect, slideNatural.w, slideNatural.h)
    : null;

  return (
    <div className="ency-detail-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ency-detail"
        role="dialog"
        aria-label={`百科页 ${match.page} 详情`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ency-detail-header">
          <div>
            <h3>PDF 第 {match.page} 页</h3>
            <p>
              18棒相似 <strong>{match.score}%</strong>
              {match.phaseScore != null && (
                <>
                  {" "}
                  · 阶段叙事 <strong>{match.phaseScore}%</strong>
                </>
              )}
              {match.verified ? " · 已验证" : " · 未验证"}
              {match.slidePhaseLabel && (
                <>
                  {" "}
                  · 百科 <em>
                    {match.slidePhaseLabel}
                    {match.slideScaleLabel ? ` · ${match.slideScaleLabel}` : ""}
                  </em>
                </>
              )}
              {region && (
                <>
                  {" "}
                  · 局部视觉 <strong>{region.localScore}%</strong>
                </>
              )}
            </p>
          </div>
          <div className="ency-detail-actions">
            <div className="ency-zoom-group" aria-label="缩放">
              {[1, 1.5, 2].map((z) => (
                <button
                  key={z}
                  type="button"
                  className={zoom === z ? "btn-primary" : "btn-ghost"}
                  onClick={() => setZoom(z)}
                >
                  {z === 1 ? "100%" : `${z * 100}%`}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost" onClick={onClose}>
              返回列表
            </button>
          </div>
        </header>

        <div className="ency-detail-body">
          <figure className="ency-detail-pane">
            <figcaption>你的截图 · 比对区域</figcaption>
            <div className="ency-detail-img-wrap">
              <img
                ref={queryImgRef}
                src={queryImage}
                alt="查询截图"
                onLoad={() => {
                  if (queryImgRef.current) {
                    setQueryNatural({
                      w: queryImgRef.current.naturalWidth,
                      h: queryImgRef.current.naturalHeight,
                    });
                  }
                }}
              />
              {showRegions && (
                <div className="ency-region-box ency-region-query" style={queryBox} />
              )}
            </div>
          </figure>

          <figure className="ency-detail-pane ency-detail-pane-slide">
            <figcaption>
              百科幻灯片
              {showRegions
                ? locating
                  ? " · 正在定位相似区域…"
                  : " · 黄框为局部最相似 K 线区"
                : " · 不显示框选区域"}
              {!match.preview && " · 仅缩略图（请运行 npm run encyclopedia:previews 生成高清）"}
            </figcaption>
            <div
              className="ency-detail-scroll"
              style={{ "--ency-zoom": zoom } as React.CSSProperties}
            >
              <div className="ency-detail-img-wrap ency-detail-zoomed">
                <img
                  ref={slideImgRef}
                  src={slideUrl}
                  alt={`百科第 ${match.page} 页`}
                  onLoad={() => {
                    if (slideImgRef.current) {
                      setSlideNatural({
                        w: slideImgRef.current.naturalWidth,
                        h: slideImgRef.current.naturalHeight,
                      });
                    }
                  }}
                />
                {showRegions && slideBox && !locating && (
                  <div className="ency-region-box ency-region-slide" style={slideBox}>
                    <span className="ency-region-label">相似区域</span>
                  </div>
                )}
                {showRegions && locating && <div className="ency-detail-loading">定位中…</div>}
              </div>
            </div>
          </figure>
        </div>

        {match.queryPhaseSig && (
          <p className="ency-phase-sig">
            截图阶段：<strong>{match.queryPhaseSig}</strong>
            {match.slidePhaseSig && (
              <>
                {" "}
                · 百科阶段：<strong>{match.slidePhaseSig}</strong>
              </>
            )}
          </p>
        )}

        {match.phaseAlignments && match.phaseAlignments.length > 0 && (
          <div className="ency-phase-table-wrap">
            <h4>Brooks 元素 ↔ 阶段对照（细颗粒度）</h4>
            <table className="ency-phase-table">
              <thead>
                <tr>
                  <th>Brooks 元素</th>
                  <th>你的截图</th>
                  <th>百科 slide</th>
                  <th>EMA20关系</th>
                </tr>
              </thead>
              <tbody>
                {match.phaseAlignments.map((row, idx) => (
                  <tr
                    key={`${row.brooksElement}-${idx}`}
                    className={row.matched ? "ency-phase-row-ok" : "ency-phase-row-miss"}
                  >
                    <td>{row.brooksElement}</td>
                    <td>{row.queryBars}</td>
                    <td>{row.slideBars}</td>
                    <td>{row.queryEma} ↔ {row.slideEma}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(match.reasons?.length || match.cautions?.length) ? (
          <div className="ency-structure-panel ency-structure-panel-full">
            {match.reasons && match.reasons.length > 0 && (
              <div>
                <h4>匹配依据</h4>
                <ul>
                  {match.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {match.cautions && match.cautions.length > 0 && (
              <div>
                <h4>需注意</h4>
                <ul className="ency-cautions-list">
                  {match.cautions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        <p className="ency-detail-foot">
          分数基于价格行为匹配（整图或18棒模式）。为避免误导，默认不显示自动框选区域。
        </p>
      </div>
    </div>
  );
}
