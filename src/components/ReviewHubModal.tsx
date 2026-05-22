import { useEffect, useState } from "react";
import {
  deleteHubEntry,
  formatHubDate,
  loadHubEntries,
  type HubEntry,
} from "../hub/storage";

interface ReviewHubModalProps {
  open: boolean;
  activeId: string | null;
  refreshKey?: number;
  onClose: () => void;
  onOpen: (entry: HubEntry) => void;
}

export function ReviewHubModal({
  open,
  activeId,
  refreshKey = 0,
  onClose,
  onOpen,
}: ReviewHubModalProps) {
  const [entries, setEntries] = useState<HubEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadHubEntries()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries([]);
          setLoadError(err instanceof Error ? err.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  if (!open) return null;

  const refresh = () => {
    setLoading(true);
    loadHubEntries()
      .then(setEntries)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  };

  return (
    <div className="hub-overlay" onClick={onClose} role="presentation">
      <div
        className="hub-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="hub-title"
      >
        <header className="hub-modal-header">
          <div>
            <h2 id="hub-title">Review Hub</h2>
            <p>已保存的复盘 · 点击打开继续编辑</p>
          </div>
          <button type="button" className="hub-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="hub-list">
          {loading && <p className="hub-empty">加载中…</p>}
          {loadError && !loading && (
            <p className="hub-empty hub-empty--error">无法加载：{loadError}</p>
          )}
          {!loading && !loadError && entries.length === 0 && (
            <p className="hub-empty">还没有保存的复盘。完成分析后点顶部「保存到 Hub」。</p>
          )}
          {!loading &&
            !loadError &&
            entries.map((entry) => (
              <article
                key={entry.id}
                className={`hub-card ${entry.id === activeId ? "is-active" : ""}`}
              >
                <div className="hub-card-body" onClick={() => onOpen(entry)}>
                  <h3>{entry.title}</h3>
                  <p className="hub-card-meta">
                    更新于 {formatHubDate(entry.updatedAt)}
                    {entry.state.objects.length > 0 &&
                      ` · ${entry.state.objects.length} 个标注`}
                    {entry.state.chartImage ? " · 主图" : ""}
                    {entry.state.contextImages?.weekly ||
                    entry.state.contextImages?.daily ||
                    entry.state.contextImages?.h4
                      ? " · 多周期"
                      : ""}
                  </p>
                  {entry.state.reviewNotes && (
                    <p className="hub-card-snippet">
                      {entry.state.reviewNotes.slice(0, 120)}
                      {entry.state.reviewNotes.length > 120 ? "…" : ""}
                    </p>
                  )}
                </div>
                <div className="hub-card-actions">
                  <button type="button" onClick={() => onOpen(entry)}>
                    打开
                  </button>
                  <button
                    type="button"
                    className="btn-danger-text"
                    onClick={() => {
                      if (!window.confirm(`删除「${entry.title}」？`)) return;
                      void deleteHubEntry(entry.id).then(refresh);
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
        </div>
      </div>
    </div>
  );
}
