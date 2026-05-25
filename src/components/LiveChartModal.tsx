import { LiveChartPanel } from "./LiveChartPanel";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LiveChartModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="live-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="live-modal"
        role="dialog"
        aria-labelledby="live-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="live-modal-header">
          <div>
            <h2 id="live-modal-title">实时 K 线</h2>
            <p className="live-modal-sub">
              FMP 实时 K 线 + 百科 OHLC 数值匹配（选交易日开盘 18 根，对比 Brooks 结构形态）。
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>
        <LiveChartPanel />
      </div>
    </div>
  );
}
