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
  onClose: () => void;
  onOpen: (entry: HubEntry) => void;
}

export function ReviewHubModal({ open, activeId, onClose, onOpen }: ReviewHubModalProps) {
  const [entries, setEntries] = useState<HubEntry[]>([]);

  useEffect(() => {
    if (open) setEntries(loadHubEntries());
  }, [open]);

  if (!open) return null;

  const refresh = () => setEntries(loadHubEntries());

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
          {entries.length === 0 ? (
            <p className="hub-empty">还没有保存的复盘。完成分析后点顶部「保存到 Hub」。</p>
          ) : (
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
                      deleteHubEntry(entry.id);
                      refresh();
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
