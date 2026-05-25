/** FMP commodity / futures symbols (from commodities-list). */
export const FMP_COMMODITY_SYMBOLS = new Set([
  "ESUSD", "GCUSD", "ZMUSD", "ZOUSX", "ZLUSX", "ZCUSX", "ZQUSD", "ALIUSD", "ZBUSD",
  "KEUSX", "ZFUSD", "SILUSD", "HEUSX", "PLUSD", "HGUSD", "MGCUSD", "SBUSX", "SIUSD",
  "CTUSX", "DXUSD", "ZSUSX", "LBUSD", "LEUSX", "NGUSD", "CLUSD", "OJUSX", "KCUSX",
  "PAUSD", "GFUSX", "ZTUSD", "ZRUSD", "CCUSD", "NQUSD", "ZNUSD", "RTYUSD", "BZUSD",
  "HOUSD", "DCUSD", "YMUSD", "RBUSD",
]);

/** TradingView continuous contract root → FMP symbol. */
const TV_ROOT_TO_FMP: Record<string, string> = {
  ES: "ESUSD",
  MES: "ESUSD",
  NQ: "NQUSD",
  MNQ: "NQUSD",
  YM: "YMUSD",
  MYM: "YMUSD",
  RTY: "RTYUSD",
  M2K: "RTYUSD",
  GC: "GCUSD",
  MGC: "MGCUSD",
  CL: "CLUSD",
  NG: "NGUSD",
  SI: "SIUSD",
  HG: "HGUSD",
  ZB: "ZBUSD",
  ZN: "ZNUSD",
  ZF: "ZFUSD",
  ZT: "ZTUSD",
};

export type AssetKind = "stock" | "commodity";

export type ResolvedSymbol = {
  /** User input as typed */
  input: string;
  /** Symbol sent to FMP API */
  fmp: string;
  kind: AssetKind;
  /** e.g. ES1! → ESUSD */
  aliasNote: string | null;
};

function tvRoot(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/1!$/, "")
    .replace(/!$/, "");
}

export function resolveFmpSymbol(input: string): ResolvedSymbol {
  const raw = input.trim();
  if (!raw) {
    return { input: raw, fmp: raw, kind: "stock", aliasNote: null };
  }

  const upper = raw.toUpperCase();
  const root = tvRoot(raw);

  if (FMP_COMMODITY_SYMBOLS.has(upper)) {
    return { input: raw, fmp: upper, kind: "commodity", aliasNote: null };
  }

  const mapped = TV_ROOT_TO_FMP[root];
  if (mapped) {
    const aliasNote = upper !== mapped ? `${upper} → FMP: ${mapped}` : null;
    return { input: raw, fmp: mapped, kind: "commodity", aliasNote };
  }

  // TradingView-style but unknown root
  if (/1!$|!$/.test(raw)) {
    const guess = `${root}USD`;
    if (FMP_COMMODITY_SYMBOLS.has(guess)) {
      return {
        input: raw,
        fmp: guess,
        kind: "commodity",
        aliasNote: `${upper} → FMP: ${guess}`,
      };
    }
  }

  return { input: raw, fmp: upper, kind: "stock", aliasNote: null };
}

export function emptyHistoryHint(resolved: ResolvedSymbol): string {
  if (/1!|!/.test(resolved.input)) {
    return `TradingView 代码「${resolved.input}」不能直接用于 FMP。请改用 FMP 代码，例如 ES 期货用 ESUSD、纳指期货用 NQUSD。`;
  }
  if (resolved.kind === "commodity") {
    return "请确认 FMP 商品列表中存在该代码（commodities-list）。";
  }
  return "请确认美股代码正确，且当前套餐包含该标的的分时数据。";
}
