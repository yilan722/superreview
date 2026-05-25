import type { FmpChartInterval, FmpIntradayRow, FmpQuote } from "./types";
import { emptyHistoryHint, resolveFmpSymbol, type ResolvedSymbol } from "./symbols";

const BASE = "https://financialmodelingprep.com/stable";

export function getFmpApiKey(): string {
  const key = import.meta.env.VITE_FMP_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "缺少 FMP API Key。请在项目根目录创建 .env 并设置 VITE_FMP_API_KEY=你的密钥",
    );
  }
  return key;
}

async function fmpGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", getFmpApiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FMP 请求失败 (${res.status}): ${path}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`FMP 返回非 JSON：${text.slice(0, 120)}`);
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (typeof obj["Error Message"] === "string") throw new Error(obj["Error Message"]);
    if (typeof obj["message"] === "string" && String(obj["message"]).includes("subscription")) {
      throw new Error(String(obj["message"]));
    }
  }
  return data as T;
}

export type IntradayResult = {
  rows: FmpIntradayRow[];
  resolved: ResolvedSymbol;
};

export async function fetchIntradayHistory(
  symbolInput: string,
  interval: FmpChartInterval,
): Promise<IntradayResult> {
  const resolved = resolveFmpSymbol(symbolInput);
  const rows = await fmpGet<FmpIntradayRow[]>(`/historical-chart/${interval}`, {
    symbol: resolved.fmp,
  });
  if (!Array.isArray(rows)) {
    throw new Error("FMP 返回的历史 K 线格式异常");
  }
  if (rows.length === 0) {
    throw new Error(
      `FMP 无「${resolved.input}」的历史 K 线（查询代码 ${resolved.fmp}）。${emptyHistoryHint(resolved)}`,
    );
  }
  return { rows, resolved };
}

export async function fetchQuote(symbolInput: string): Promise<FmpQuote> {
  const resolved = resolveFmpSymbol(symbolInput);
  const rows = await fmpGet<FmpQuote[]>("/quote", { symbol: resolved.fmp });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`未找到 ${resolved.input}（FMP: ${resolved.fmp}）的报价`);
  }
  return rows[0];
}

export { resolveFmpSymbol, type ResolvedSymbol };
