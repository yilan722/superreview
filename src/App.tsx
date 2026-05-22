import { useCallback, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import { ChartWorkspace } from "./components/ChartWorkspace";
import {
  CollapsibleSidebar,
  loadPanelOpen,
  savePanelOpen,
} from "./components/CollapsibleSidebar";
import { ObjectPalette } from "./components/ObjectPalette";
import { ReviewHubModal } from "./components/ReviewHubModal";
import { ReviewPanel } from "./components/ReviewPanel";
import {
  emptyContextImages,
  hasAnyChartImage,
  normalizeReviewState,
} from "./contextImages";
import {
  loadActiveHubId,
  loadDraft,
  saveDraft,
  upsertHubEntry,
  type HubEntry,
} from "./hub/storage";
import { DEFAULT_REVIEW_NOTES, reviewNotesOrDefault } from "./reviewTemplate";
import type {
  CanvasObject,
  CanvasTool,
  ContextImages,
  ContextSlot,
  ImageSlot,
  ReviewState,
} from "./types";
import "./App.css";

function emptyState(): ReviewState {
  return {
    chartImage: null,
    contextImages: emptyContextImages(),
    objects: [],
    reviewNotes: DEFAULT_REVIEW_NOTES,
    sessionTitle: "",
  };
}

function hasSaveableContent(state: ReviewState) {
  if (
    hasAnyChartImage(state) ||
    state.objects.length > 0 ||
    state.sessionTitle.trim()
  ) {
    return true;
  }
  const notes = state.reviewNotes.trim();
  return !!notes && notes !== DEFAULT_REVIEW_NOTES.trim();
}

function hasContent(state: ReviewState) {
  return hasSaveableContent(state);
}

export default function App() {
  const draft = normalizeReviewState(loadDraft() as Partial<ReviewState>);
  const [chartImage, setChartImage] = useState<string | null>(draft.chartImage ?? null);
  const [contextImages, setContextImages] = useState<ContextImages>(
    draft.contextImages ?? emptyContextImages(),
  );
  const [objects, setObjects] = useState<CanvasObject[]>(draft.objects ?? []);
  const [reviewNotes, setReviewNotes] = useState(() => reviewNotesOrDefault(draft.reviewNotes));
  const [sessionTitle, setSessionTitle] = useState(draft.sessionTitle ?? "");
  const [hubId, setHubId] = useState<string | null>(
    (loadDraft() as { hubId?: string | null }).hubId ?? loadActiveHubId(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<CanvasTool>(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubRefresh, setHubRefresh] = useState(0);
  const [hubSaving, setHubSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(loadPanelOpen);
  const [pasteTarget, setPasteTarget] = useState<ImageSlot>("main");

  const selected = objects.find((o) => o.id === selectedId);

  const currentState = useCallback(
    (): ReviewState => ({
      chartImage,
      contextImages,
      objects,
      reviewNotes,
      sessionTitle,
    }),
    [chartImage, contextImages, objects, reviewNotes, sessionTitle],
  );

  useEffect(() => {
    saveDraft(currentState(), hubId);
  }, [chartImage, contextImages, objects, reviewNotes, sessionTitle, hubId, currentState]);

  useEffect(() => {
    if (!saveToast) return;
    const t = window.setTimeout(() => setSaveToast(null), 2800);
    return () => clearTimeout(t);
  }, [saveToast]);

  const setContextImage = useCallback((slot: ContextSlot, url: string | null) => {
    setContextImages((prev) => ({ ...prev, [slot]: url }));
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const url = reader.result as string;
            if (pasteTarget === "main") setChartImage(url);
            else setContextImage(pasteTarget, url);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteTarget, setContextImage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (selectedId) {
          setObjects((prev) => prev.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const applyState = (state: ReviewState, id: string | null) => {
    const n = normalizeReviewState(state);
    setChartImage(n.chartImage);
    setContextImages(n.contextImages);
    setObjects(n.objects);
    setReviewNotes(reviewNotesOrDefault(n.reviewNotes));
    setSessionTitle(n.sessionTitle);
    setHubId(id);
    setSelectedId(null);
    setActiveTool(null);
    setPasteTarget("main");
  };

  const handleUpdateObject = useCallback((id: string, patch: Partial<CanvasObject>) => {
    setObjects((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              ...patch,
              props: patch.props ? { ...o.props, ...patch.props } : o.props,
            }
          : o,
      ),
    );
  }, []);

  const handleSelectedNoteChange = useCallback(
    (note: string) => {
      if (!selectedId) return;
      setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, note } : o)));
    },
    [selectedId],
  );

  const togglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      savePanelOpen(next);
      return next;
    });
  };

  const saveToHub = async () => {
    if (hubSaving) return;
    const state = currentState();
    if (!hasSaveableContent(state)) {
      window.alert("当前没有可保存的内容。请先上传 K 线截图、添加标注，或填写复盘笔记。");
      return;
    }
    setHubSaving(true);
    const result = await upsertHubEntry(state, hubId);
    setHubSaving(false);
    if (!result.ok) {
      window.alert(`保存失败：${result.error}`);
      return;
    }
    const { entry } = result;
    setHubId(entry.id);
    setSessionTitle(entry.title);
    setHubRefresh((n) => n + 1);
    setHubOpen(true);
    setSaveToast(`已保存到 Review Hub：${entry.title}`);
  };

  const newReview = () => {
    const state = currentState();
    if (hasContent(state)) {
      const saveFirst = window.confirm(
        "是否先将当前复盘保存到 Review Hub？\n\n确定 = 保存并新建\n取消 = 不保存，直接新建",
      );
      if (saveFirst) void saveToHub();
      else if (!window.confirm("不保存并新建空白复盘？")) return;
    }
    applyState(emptyState(), null);
  };

  const openFromHub = (entry: HubEntry) => {
    const state = currentState();
    if (hasContent(state) && hubId !== entry.id) {
      const ok = window.confirm(
        `打开「${entry.title}」将替换当前未保存到 Hub 的编辑内容。继续？`,
      );
      if (!ok) return;
    }
    applyState(normalizeReviewState(entry.state), entry.id);
    setHubOpen(false);
  };

  const exportPng = useCallback(async () => {
    const el = document.querySelector(".chart-grid-main .chart-canvas") as HTMLElement | null;
    if (!el || !chartImage) return;
    const shot = await html2canvas(el, { useCORS: true, backgroundColor: "#0f1419", scale: 2 });
    const link = document.createElement("a");
    link.download = `${sessionTitle || "trade-review"}.png`;
    link.href = shot.toDataURL("image/png");
    link.click();
  }, [chartImage, sessionTitle]);

  const clearSession = () => {
    if (!window.confirm("清空当前画布（不删除 Hub 中已保存的复盘）？")) return;
    applyState(emptyState(), hubId);
  };

  return (
    <div className={`app ${panelOpen ? "" : "app-panel-collapsed"}`}>
      <header className="app-header">
        <div className="brand">
          <h1>Trade Review</h1>
          <span>
            Candle by Candle · Write on Charts
            {hubId && <em className="header-linked"> · 已关联 Hub</em>}
          </span>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-new" onClick={newReview}>
            ＋ 新建复盘
          </button>
          <button type="button" className="btn-ghost" onClick={() => setHubOpen(true)}>
            Review Hub
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveToHub()}
            disabled={hubSaving}
          >
            {hubSaving ? "保存中…" : "保存到 Hub"}
          </button>
          <button type="button" onClick={exportPng} disabled={!chartImage}>
            导出主图 PNG
          </button>
          <button type="button" className="btn-ghost" onClick={clearSession}>
            清空画布
          </button>
        </div>
      </header>

      {saveToast && <div className="save-toast">{saveToast}</div>}

      <ReviewHubModal
        open={hubOpen}
        activeId={hubId}
        refreshKey={hubRefresh}
        onClose={() => setHubOpen(false)}
        onOpen={openFromHub}
      />

      <div className="workspace">
        <CollapsibleSidebar open={panelOpen} onToggle={togglePanel}>
          <ReviewPanel
            sessionTitle={sessionTitle}
            reviewNotes={reviewNotes}
            selectedNote={selected?.note ?? ""}
            onTitleChange={setSessionTitle}
            onNotesChange={setReviewNotes}
            onSelectedNoteChange={handleSelectedNoteChange}
          />
        </CollapsibleSidebar>

        <ChartWorkspace
          sidebarOpen={panelOpen}
          chartImage={chartImage}
          contextImages={contextImages}
          objects={objects}
          selectedId={selectedId}
          activeTool={activeTool}
          pasteTarget={pasteTarget}
          onPasteTargetChange={setPasteTarget}
          onMainImageChange={setChartImage}
          onContextImageChange={setContextImage}
          onToolChange={setActiveTool}
          onSelect={setSelectedId}
          onAddObject={(obj) => setObjects((prev) => [...prev, obj])}
          onUpdateObject={handleUpdateObject}
          onRemoveObject={(id) => {
            setObjects((prev) => prev.filter((o) => o.id !== id));
            if (selectedId === id) setSelectedId(null);
          }}
          onDeleteSelected={() => {
            if (!selectedId) return;
            setObjects((prev) => prev.filter((o) => o.id !== selectedId));
            setSelectedId(null);
          }}
          onNormalizeObjects={(migrated) => setObjects(migrated)}
        />

        <ObjectPalette
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onDragStart={() => {}}
        />
      </div>
    </div>
  );
}
