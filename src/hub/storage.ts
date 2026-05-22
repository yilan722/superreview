import type { ReviewState } from "../types";

export interface HubEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  state: ReviewState;
}

const HUB_KEY = "trade-review-hub-v1";
const DRAFT_KEY = "trade-review-draft-v1";
const ACTIVE_HUB_ID_KEY = "trade-review-active-hub-id-v1";

function newId() {
  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadHubEntries(): HubEntry[] {
  try {
    const raw = localStorage.getItem(HUB_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as HubEntry[];
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeHub(entries: HubEntry[]) {
  localStorage.setItem(HUB_KEY, JSON.stringify(entries));
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
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...state, hubId }),
    );
    if (hubId) {
      localStorage.setItem(ACTIVE_HUB_ID_KEY, hubId);
    } else {
      localStorage.removeItem(ACTIVE_HUB_ID_KEY);
    }
  } catch {
    /* quota */
  }
}

export function loadActiveHubId(): string | null {
  return localStorage.getItem(ACTIVE_HUB_ID_KEY);
}

export function getHubEntry(id: string): HubEntry | undefined {
  return loadHubEntries().find((e) => e.id === id);
}

export function upsertHubEntry(
  state: ReviewState,
  existingId: string | null,
): HubEntry {
  const entries = loadHubEntries();
  const now = Date.now();
  const title = state.sessionTitle.trim() || `复盘 ${new Date(now).toLocaleDateString("zh-CN")}`;

  if (existingId) {
    const idx = entries.findIndex((e) => e.id === existingId);
    if (idx >= 0) {
      const updated: HubEntry = {
        ...entries[idx],
        title,
        updatedAt: now,
        state,
      };
      entries[idx] = updated;
      writeHub(entries);
      return updated;
    }
  }

  const created: HubEntry = {
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    state,
  };
  writeHub([created, ...entries]);
  return created;
}

export function deleteHubEntry(id: string) {
  writeHub(loadHubEntries().filter((e) => e.id !== id));
  if (loadActiveHubId() === id) {
    localStorage.removeItem(ACTIVE_HUB_ID_KEY);
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
