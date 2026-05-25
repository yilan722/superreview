/**
 * Reconstruct EighteenBarProfile from offline-built JSON (no image / pixel at runtime).
 */
import type { EighteenBarProfile, EmaBarRelation } from "./eighteenBarProfile";
import type { NarrativePhase, PhaseKind } from "./narrativePhases";
import {
  analyzeSlideStructure,
  type BrooksSignature,
  type OpeningBarsBrooksAnalysis,
} from "./openingBarsBrooks";

export type StoredNumericPhase = {
  kind: PhaseKind;
  label: string;
  labelEn: string;
  barStart: number;
  barEnd: number;
  summary: string;
};

export type StoredNumericProfile = {
  barStart: number;
  barEnd: number;
  window: number;
  shape: number[];
  polarity: number[];
  bullCount: number;
  bearCount: number;
  overlap: number;
  netSlope: number;
  earlySlope: number;
  lateSlope: number;
  direction: EighteenBarProfile["direction"];
  startDirection: EighteenBarProfile["startDirection"];
  openingSetup: EighteenBarProfile["openingSetup"];
  setup: EighteenBarProfile["setup"];
  phaseSig: string;
  phases: StoredNumericPhase[];
  emaByBar?: EmaBarRelation[];
  patternTags?: string[];
  brooks?: OpeningBarsBrooksAnalysis;
  brooksSig?: BrooksSignature;
};

export function profileFromStored(stored: StoredNumericProfile): EighteenBarProfile {
  const n = stored.shape.length;
  const emaByBar: EmaBarRelation[] =
    stored.emaByBar && stored.emaByBar.length === n
      ? stored.emaByBar
      : new Array(n).fill("unknown");

  const brooks =
    stored.brooks ??
    (stored.shape.length >= 6
      ? analyzeSlideStructure(stored.shape, stored.polarity)
      : undefined);

  return {
    window: stored.window || n,
    barCount: n,
    bars: [],
    phases: stored.phases as NarrativePhase[],
    phaseSig: stored.phaseSig,
    shape: stored.shape,
    polarity: stored.polarity,
    bullCount: stored.bullCount,
    bearCount: stored.bearCount,
    overlap: stored.overlap,
    netSlope: stored.netSlope,
    earlySlope: stored.earlySlope,
    lateSlope: stored.lateSlope,
    direction: stored.direction,
    startDirection: stored.startDirection,
    openingSetup: stored.openingSetup,
    setup: stored.setup,
    emaByBar,
    emaSummary: "EMA不明",
    patternTags: stored.patternTags ?? [],
    summary: brooks?.summary ?? `数值索引 · 棒 ${stored.barStart}–${stored.barEnd} · ${stored.setup}`,
    brooks,
  };
}

export function hasNumericWindows(page: { windows?: StoredNumericProfile[] }): boolean {
  return Array.isArray(page.windows) && page.windows.length > 0 && page.windows[0]!.shape?.length >= 6;
}
