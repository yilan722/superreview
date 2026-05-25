import type { AssetKind } from "./symbols";

const ET = "America/New_York";

function etParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const g = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const wd = g("weekday");
  const hour = Number(g("hour"));
  const minute = Number(g("minute"));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { day, hour, minute, minutes: hour * 60 + minute };
}

/** FMP 美股 WebSocket 文档：美东 8:00–17:00 有推送。 */
export function isUsStockStreamWindow(date = new Date()): boolean {
  const { day, minutes } = etParts(date);
  if (day === 0 || day === 6) return false;
  return minutes >= 8 * 60 && minutes < 17 * 60;
}

/**
 * CME E-mini 等期货：周日 18:00 ET 开盘至周五 17:00 ET；每日 17:00–18:00 维护暂停。
 * 简化判断，足够决定是否做实时轮询。
 */
export function isFuturesStreamWindow(date = new Date()): boolean {
  const { day, minutes } = etParts(date);
  if (day === 6) return false; // Saturday
  if (day === 0) return minutes >= 18 * 60; // Sunday evening open
  if (day === 5 && minutes >= 17 * 60) return false; // Friday after close
  // Daily maintenance break Mon–Thu 17:00–18:00
  if (minutes >= 17 * 60 && minutes < 18 * 60) return false;
  return true;
}

export function shouldStreamLive(kind: AssetKind, date = new Date()): boolean {
  return kind === "commodity" ? isFuturesStreamWindow(date) : isUsStockStreamWindow(date);
}

export function marketClosedMessage(kind: AssetKind): string {
  if (kind === "commodity") {
    return "期货休市时段（或 CME 日维护 17:00–18:00 ET），仅显示历史 K 线，不推送实时更新。";
  }
  return "美股非推送时段（美东周一至周五 8:00–17:00），仅显示历史 K 线，不推送实时更新。";
}

export function streamWindowLabel(kind: AssetKind): string {
  return kind === "commodity"
    ? "CME 期货会话（含夜盘，每日 17:00–18:00 ET 维护暂停）"
    : "美东周一至周五 8:00–17:00（FMP 美股 WebSocket 时段）";
}
