import { fetchQuote } from "./client";
import { marketClosedMessage, shouldStreamLive } from "./marketHours";
import type { AssetKind } from "./symbols";
import type { FmpTradeTick, StreamStatus } from "./types";

type StatusListener = (status: StreamStatus, detail?: string) => void;
type TickListener = (tick: FmpTradeTick) => void;

const STOCK_WS_URLS = [
  "wss://websockets.financialmodelingprep.com",
  "wss://financialmodelingprep.com/ws/us-stocks",
];

function parseTradeMessage(raw: unknown, symbol: string): FmpTradeTick | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;

  const ticker = String(msg.s ?? msg.symbol ?? msg.ticker ?? "").toUpperCase();
  if (ticker && ticker !== symbol.toUpperCase()) return null;

  const msgType = String(msg.t ?? "");
  let price = NaN;
  if (msgType === "Q") {
    const bp = Number(msg.bp);
    const ap = Number(msg.ap);
    if (Number.isFinite(bp) && Number.isFinite(ap)) price = (bp + ap) / 2;
    else if (Number.isFinite(ap)) price = ap;
    else if (Number.isFinite(bp)) price = bp;
  } else {
    price = Number(msg.lp ?? msg.price ?? msg.p);
  }
  if (!Number.isFinite(price) || price <= 0) return null;

  const size = Number(msg.ls ?? msg.size ?? msg.v ?? 0);
  const tsRaw = msg.timestamp ?? msg.ts;
  const tsNum = Number(tsRaw);
  const time =
    Number.isFinite(tsNum) && tsNum > 1_000_000_000
      ? tsNum > 1_000_000_000_000
        ? Math.floor(tsNum / 1000)
        : Math.floor(tsNum)
      : Math.floor(Date.now() / 1000);

  return { symbol: symbol.toUpperCase(), price, size: Number.isFinite(size) ? size : 0, time };
}

function parseControlMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;
  const event = String(msg.event ?? msg.type ?? "").toLowerCase();
  if (!event) return null;

  if (event === "login") {
    const status = String(msg.status ?? msg.message ?? msg.msg ?? "").toLowerCase();
    if (status.includes("fail") || status.includes("error") || status.includes("invalid")) {
      return `WebSocket 登录失败：${String(msg.message ?? msg.msg ?? status)}`;
    }
    return "login_ok";
  }
  if (event === "subscribe") return "subscribed";
  if (event === "error") return String(msg.message ?? msg.msg ?? "WebSocket 服务端报错");
  return null;
}

export type LiveStreamOptions = {
  symbolInput: string;
  /** FMP API symbol (e.g. ESUSD) */
  fmpSymbol: string;
  assetKind: AssetKind;
  apiKey: string;
  onTick: TickListener;
  onStatus: StatusListener;
};

export type LiveStreamHandle = {
  close: () => void;
};

export function connectLiveStream(opts: LiveStreamOptions): LiveStreamHandle {
  const { symbolInput, fmpSymbol, assetKind, apiKey, onTick, onStatus } = opts;

  let closed = false;
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let urlIndex = 0;
  let wsAttempts = 0;
  let lastPrice: number | null = null;
  let gotLiveData = false;

  const sym = fmpSymbol.toUpperCase();
  const symLower = sym.toLowerCase();

  const clearConnectTimer = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const startPolling = (reason: string) => {
    if (closed || pollTimer) return;
    clearConnectTimer();
    onStatus("polling", reason);
    void fetchQuote(symbolInput)
      .then((q) => {
        if (closed) return;
        lastPrice = q.price;
        const ts =
          q.timestamp > 1_000_000_000_000 ? Math.floor(q.timestamp / 1000) : q.timestamp;
        onTick({ symbol: sym, price: q.price, size: 0, time: ts });
      })
      .catch(() => {
        /* interval will retry */
      });
    pollTimer = setInterval(() => {
      void fetchQuote(symbolInput)
        .then((q) => {
          if (closed) return;
          if (lastPrice !== null && q.price === lastPrice) return;
          lastPrice = q.price;
          const ts =
            q.timestamp > 1_000_000_000_000
              ? Math.floor(q.timestamp / 1000)
              : q.timestamp;
          onTick({ symbol: sym, price: q.price, size: 0, time: ts });
        })
        .catch((err) => {
          onStatus("error", err instanceof Error ? err.message : "报价轮询失败");
        });
    }, 3000);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!closed) connectStockWs();
    }, 3000);
  };

  const onConnectTimeout = () => {
    connectTimer = null;
    if (closed || gotLiveData) return;
    ws?.close();
    ws = null;
    if (wsAttempts >= 2) {
      startPolling(
        assetKind === "commodity"
          ? "FMP WebSocket 不支持期货推送；交易时段内已改用报价 REST 轮询（约 3 秒）。"
          : "WebSocket 暂无推送，已改用报价 REST 轮询（约 3 秒）。",
      );
      return;
    }
    scheduleReconnect();
  };

  const connectStockWs = () => {
    if (closed) return;
    stopPolling();
    clearConnectTimer();
    wsAttempts += 1;
    onStatus("connecting", `正在连接 FMP 美股 WebSocket…`);

    const url = STOCK_WS_URLS[urlIndex % STOCK_WS_URLS.length]!;
    urlIndex += 1;
    ws = new WebSocket(url);
    connectTimer = setTimeout(onConnectTimeout, 10_000);

    ws.onopen = () => {
      onStatus("connecting", "握手成功，登录并订阅…");
      ws?.send(JSON.stringify({ event: "login", data: { apiKey } }));
      ws?.send(JSON.stringify({ event: "subscribe", data: { ticker: [symLower] } }));
    };

    ws.onmessage = (ev) => {
      if (closed) return;
      try {
        const payload = JSON.parse(String(ev.data)) as unknown;
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          const ctrl = parseControlMessage(item);
          if (ctrl === "login_ok") {
            onStatus("connecting", `已登录，等待 ${symbolInput} 推送…`);
            continue;
          }
          if (ctrl === "subscribed") continue;
          if (ctrl && ctrl !== "login_ok" && ctrl !== "subscribed") {
            onStatus("error", ctrl);
            ws?.close();
            startPolling(`${ctrl}；已改用 REST 轮询。`);
            return;
          }

          const tick = parseTradeMessage(item, sym);
          if (!tick) continue;
          gotLiveData = true;
          clearConnectTimer();
          lastPrice = tick.price;
          onTick(tick);
          onStatus("live", "WebSocket 推送中");
        }
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      if (closed) return;
      onStatus("error", "WebSocket 网络异常");
    };

    ws.onclose = () => {
      ws = null;
      clearConnectTimer();
      if (closed || gotLiveData) return;
      if (wsAttempts >= 2) {
        startPolling("WebSocket 连接断开，已改用 REST 轮询。");
        return;
      }
      scheduleReconnect();
    };
  };

  const startLive = () => {
    if (!shouldStreamLive(assetKind)) {
      onStatus("paused", marketClosedMessage(assetKind));
      return;
    }

    if (assetKind === "commodity") {
      // FMP WebSocket 仅覆盖美股/外汇/ crypto，期货用 REST 报价轮询
      startPolling("期货实时：FMP 无期货 WebSocket，交易时段内 REST 报价轮询（约 3 秒）。");
      return;
    }

    connectStockWs();
  };

  startLive();

  return {
    close: () => {
      closed = true;
      stopPolling();
      clearConnectTimer();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      ws = null;
      onStatus("closed");
    },
  };
}
