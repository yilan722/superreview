import type { ReactNode } from "react";

const STORAGE_KEY = "trade-review-panel-open";

export function loadPanelOpen(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function savePanelOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface CollapsibleSidebarProps {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSidebar({ open, onToggle, children }: CollapsibleSidebarProps) {
  return (
    <div className={`sidebar-wrap ${open ? "is-open" : "is-collapsed"}`}>
      <aside className="sidebar-panel" aria-hidden={!open}>
        {children}
      </aside>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggle}
        title={open ? "收起复盘笔记" : "展开复盘笔记"}
        aria-expanded={open}
      >
        {open ? "‹" : "›"}
      </button>
    </div>
  );
}
