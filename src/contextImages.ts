import type { ContextImages, ReviewState } from "./types";

export function emptyContextImages(): ContextImages {
  return { weekly: null, daily: null, h4: null };
}

export function normalizeContextImages(
  partial?: Partial<ContextImages> | null,
): ContextImages {
  const base = emptyContextImages();
  if (!partial) return base;
  return {
    weekly: partial.weekly ?? base.weekly,
    daily: partial.daily ?? base.daily,
    h4: partial.h4 ?? base.h4,
  };
}

export function normalizeReviewState(state: Partial<ReviewState>): ReviewState {
  return {
    chartImage: state.chartImage ?? null,
    contextImages: normalizeContextImages(state.contextImages),
    objects: state.objects ?? [],
    reviewNotes: state.reviewNotes ?? "",
    sessionTitle: state.sessionTitle ?? "",
  };
}

export function hasAnyChartImage(state: ReviewState): boolean {
  if (state.chartImage) return true;
  return !!(state.contextImages.weekly || state.contextImages.daily || state.contextImages.h4);
}
