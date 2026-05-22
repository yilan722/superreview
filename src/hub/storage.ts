import type { ReviewState } from "../types";

export interface HubEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  state: ReviewState;
}

export type HubSaveResult =
  | { ok: true; entry: HubEntry }
  | { ok: false; error: string };

const HUB_KEY = "trade-review-hub-v1";
const DRAFT_KEY = "trade-review-draft-v1";
const ACTIVE_HUB_ID_KEY = "trade-review-active-hub-id-v1";
const IDB_NAME = "trade-review-hub-db-v1";
const IDB_STORE = "entries";

function newId() {
  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hubErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "QuotaExceededError") {
      return "浏览器存储空间已满。请在 Review Hub 中删除旧复盘，或减少上传的图片数量后再试。";
    }
    return err.message || err.name;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
}

function openHubDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error("无法打开 IndexedDB"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
  });
}

function idbGetAll(db: IDBDatabase): Promise<HubEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve((req.result as HubEntry[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("读取 Hub 失败"));
  });
}

function idbPut(db: IDBDatabase, entry: HubEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("写入 Hub 失败"));
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("删除 Hub 条目失败"));
  });
}

/** Legacy localStorage hub list (migrated to IndexedDB on first load). */
function loadHubEntriesFromLocalStorage(): HubEntry[] {
  try {
    const raw = localStorage.getItem(HUB_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as HubEntry[];
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

async function migrateLocalStorageToIdb(db: IDBDatabase): Promise<void> {
  const legacy = loadHubEntriesFromLocalStorage();
  if (!legacy.length) return;
  for (const entry of legacy) {
    await idbPut(db, entry);
  }
  try {
    localStorage.removeItem(HUB_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadHubEntries(): Promise<HubEntry[]> {
  const db = await openHubDb();
  try {
    await migrateLocalStorageToIdb(db);
    const entries = await idbGetAll(db);
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export function loadDraft(): Partial<ReviewState> & { hubId?: string | null } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveDraft(state: ReviewState, hubId: string | null) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, hubId }));
    if (hubId) {
      localStorage.setItem(ACTIVE_HUB_ID_KEY, hubId);
    } else {
      localStorage.removeItem(ACTIVE_HUB_ID_KEY);
    }
  } catch {
    /* draft quota — hub uses IndexedDB */
  }
}

export function loadActiveHubId(): string | null {
  return localStorage.getItem(ACTIVE_HUB_ID_KEY);
}

export async function getHubEntry(id: string): Promise<HubEntry | undefined> {
  const entries = await loadHubEntries();
  return entries.find((e) => e.id === id);
}

export async function upsertHubEntry(
  state: ReviewState,
  existingId: string | null,
): Promise<HubSaveResult> {
  const db = await openHubDb();
  try {
    await migrateLocalStorageToIdb(db);
    const entries = await idbGetAll(db);
    const now = Date.now();
    const title =
      state.sessionTitle.trim() ||
      `复盘 ${new Date(now).toLocaleDateString("zh-CN")}`;

    if (existingId) {
      const idx = entries.findIndex((e) => e.id === existingId);
      if (idx >= 0) {
        const updated: HubEntry = {
          ...entries[idx],
          title,
          updatedAt: now,
          state,
        };
        await idbPut(db, updated);
        return { ok: true, entry: updated };
      }
    }

    const created: HubEntry = {
      id: newId(),
      title,
      createdAt: now,
      updatedAt: now,
      state,
    };
    await idbPut(db, created);
    return { ok: true, entry: created };
  } catch (err) {
    return { ok: false, error: hubErrorMessage(err) };
  } finally {
    db.close();
  }
}

export async function deleteHubEntry(id: string): Promise<void> {
  const db = await openHubDb();
  try {
    await idbDelete(db, id);
    if (loadActiveHubId() === id) {
      localStorage.removeItem(ACTIVE_HUB_ID_KEY);
    }
  } finally {
    db.close();
  }
}

export function formatHubDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
