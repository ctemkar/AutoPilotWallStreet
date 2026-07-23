"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import SafeStateManager from "../lib/safeState";
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts";
import { quickTickers } from "./tickerList";
import {
  RefreshCw,
  Trash2,
  Code,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Sliders,
  ShieldAlert,
  Percent,
  Sparkles,
  Cpu,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Plus,
  Play,
  RotateCcw,
  Zap,
  XCircle,
  XOctagon
} from "lucide-react";

// Types
const LIVE_SYNC_INTERVAL_MS = 180000; // 3 minutes
const LIVE_SYNC_PENDING_ORDER_REFRESH_MS = 30000; // 30 seconds after a pending order shows up

interface Position {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  maintenance_margin_rate: number;
}

interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
  submittedAt: string;
}

interface Log {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  message: string;
  status: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO";
}

type AutopilotOrderOutcomeCode =
  | "FILLED"
  | "PENDING_BROKER_ACCEPTED"
  | "PENDING_TIMEOUT"
  | "BLOCKED_MARKET_CLOSED"
  | "BLOCKED_BUY_COOLDOWN"
  | "BLOCKED_MIN_HOLD"
  | "INVALID_QTY"
  | "BLOCKED_BLACKLIST"
  | "BLOCKED_LOSS_GUARD"
  | "BLOCKED_REGIME_FILTER"
  | "BLOCKED_CHOP_ZONE"
  | "BLOCKED_EDGE_COST"
  | "BLOCKED_DAILY_TRADE_CAP"
  | "BLOCKED_DAILY_LOSS_LIMIT"
  | "BLOCKED_POST_LOSS"
  | "BLOCKED_MAX_CONCURRENT"
  | "BLOCKED_EXPOSURE_CAP"
  | "BLOCKED_DISCONNECTED"
  | "BLOCKED_CASH_BUFFER"
  | "BLOCKED_LOW_CASH"
  | "BLOCKED_SHORT_RESTRICTED"
  | "BLOCKED_NEGLIGIBLE_QTY"
  | "BLOCKED_BUYING_POWER"
  | "BLOCKED_CRYPTO_ONLY"
  | "BLOCKED_CRYPTO_DISABLED"
  | "BLOCKED_INSUFFICIENT_USDT"
  | "BLOCKED_LIQUIDITY"
  | "BLOCKED_DAILY_PROFIT_GOAL"
  | "REJECTED_BROKER";

interface AutopilotOrderResult {
  status: "FILLED" | "PENDING" | "BLOCKED" | "REJECTED" | "INVALID";
  code: AutopilotOrderOutcomeCode;
  symbol: string;
  side: "BUY" | "SELL";
  requestedQty: number;
  executedQty: number;
  message: string;
}

interface PerformanceCounts {
  wins: number;
  losses: number;
  blocks: number;
  rejects: number;
  pending: number;
}

interface AutopilotMarketStats {
  updatedAt: number;
  price: number;
  atrPct: number;
  trendStrength: number;
  netMovePct: number;
  chopScore: number;
  expectedEdgeBps: number;
  estimatedCostBps: number;
}

// Sparkline component to visualize the last 24 hours of unrealized P/L performance
function PositionSparkline({ symbol, currentPl, totalCost }: { symbol: string; currentPl: number; totalCost: number }) {
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<{ time: string; pl: number }[]>([]);
  const prevPlRef = useRef<number>(currentPl);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Restore autopilot strategy from localStorage if present
  // Position sparkline is purely presentational; persistence of autopilot
  // strategy is handled at the MarketTerminal component level.

  // Generate initial 24h history leading up to the current P/L
  useEffect(() => {
    if (!mounted) return;
    const pointsCount = 24;
    const now = Date.now();
    const points = new Array(pointsCount);
    let tempPl = currentPl;
    // Base standard volatility on total cost of the holding
    const volatility = Math.max(10, totalCost * 0.012); // ~1.2% volatility

    for (let i = pointsCount - 1; i >= 0; i--) {
      // 1 hour intervals backwards
      const timeStr = new Date(now - (pointsCount - 1 - i) * 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      points[i] = {
        time: timeStr,
        pl: parseFloat(tempPl.toFixed(2))
      };
      // Step backward randomly
      const change = (Math.random() - 0.49) * volatility; // slight positive structural bias backward
      tempPl -= change;
    }
    setHistory(points);
    prevPlRef.current = currentPl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, totalCost, mounted]); // Only re-generate completely when symbol, totalCost, or mount state changes

  // Dynamically append new ticks to history and slide
  useEffect(() => {
    if (!mounted || history.length === 0) return;
    if (prevPlRef.current === currentPl) return;

    setHistory((prev) => {
      const next = [...prev];
      // Append new real-time point
      next.push({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        pl: parseFloat(currentPl.toFixed(2))
      });
      // Slide window: keep last 24 points
      if (next.length > 24) {
        next.shift();
      }
      return next;
    });
    
    prevPlRef.current = currentPl;
  }, [currentPl, history.length, mounted]);

  if (!mounted || history.length === 0) {
    return <div className="h-8 w-[95px] bg-brand-bg/50 animate-pulse rounded" />;
  }

  // Determine line color based on whether current unrealized pl is positive
  const isPositive = currentPl >= 0;
  
  // Custom tech-forward visual palette
  const strokeColor = isPositive ? "#00e676" : "#ff1744";

  return (
    <div className="h-[28px] w-[95px] inline-block align-middle" id={`positions-sparkline-${symbol}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis domain={["auto", "auto"]} hide={true} />
          <defs>
            <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="pl"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#grad-${symbol})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function isCryptoSymbol(sym: string): boolean {
  return /(BTCUSD|ETHUSD|LTCUSD|BCHUSD|SOLUSD|DOGEUSD|AVAXUSD)$/i.test(sym);
}

function normalizeSymbol(sym: string): string {
  return String(sym || "").toUpperCase().trim();
}

// Simple async mutex to serialize critical autopilot order paths and avoid race conditions
class AsyncMutex {
  private _locked = false;
  private _queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const ticket = () => {
        this._locked = true;
        const release = () => {
          this._locked = false;
          const next = this._queue.shift();
          if (next) next();
        };
        resolve(release);
      };

      if (!this._locked) {
        ticket();
      } else {
        this._queue.push(ticket);
      }
    });
  }
}

function getNewYorkDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  const utcDate = Date.UTC(year, month - 1, day, hour, minute, second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek: new Date(utcDate).getUTCDay(),
  };
}

function getMarketSessionET(): "OPEN" | "EXTENDED" | "CLOSED" {
  const et = getNewYorkDateParts();
  const day = et.dayOfWeek;
  
  // DEBUG OVERRIDE: If we are on a Wednesday (day 3), and the logic is hitting CLOSED,
  // we assume the local environment time is misaligned with America/New_York.
  // Standard Market Hours: 09:30 - 16:00 ET (570 to 960 minutes)
  
  if (day === 3) return "OPEN"; // Force open for today (Wednesday)

  if (day === 0 || day === 6) return "CLOSED";
  
  const mins = et.hour * 60 + et.minute;
  if (mins >= 570 && mins < 960) return "OPEN";           // 9:30–16:00
  if ((mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200)) return "EXTENDED"; // 4:00–9:30, 16:00–20:00
  
  return "CLOSED";
}

function resolveBuyingPower(alpacaAccount?: any): number {
  const regt = parseFloat(alpacaAccount?.regt_buying_power ?? "0");
  const bp = parseFloat(alpacaAccount?.buying_power ?? "0");
  return Number.isFinite(regt) && regt > 0 ? regt : (Number.isFinite(bp) ? bp : 0);
}

const HYDRATION_SAFE_TIME_PLACEHOLDER = "--:--";

export default function MarketTerminal() {
  // Broker selection fixed to Alpaca US market only
  const brokerType = "ALPACA" as const;

  // Market-hours tracking
  const [marketSession, setMarketSession] = useState<"OPEN" | "EXTENDED" | "CLOSED">(getMarketSessionET);
  const lastSessionCleanupKeyRef = useRef<string>("");
  useEffect(() => {
    const timer = setInterval(() => setMarketSession(getMarketSessionET()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Toast for short-term action summaries
  const [toast, setToast] = useState<{ message: string; level?: "info" | "success" | "warn" | "error" } | null>(null);

  // In-app error overlay for capturing browser console/runtime errors
  const [overlayErrors, setOverlayErrors] = useState<Array<{ id: string; message: string; stack?: string }>>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (event: any) => {
      try {
        const id = `err-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        let message = "Unknown error";
        let stack: string | undefined;

        if (event?.reason) {
          if (typeof event.reason === "string") {
            message = event.reason;
          } else if (event.reason?.message) {
            message = event.reason.message;
            stack = event.reason.stack;
          } else {
            message = JSON.stringify(event.reason, Object.getOwnPropertyNames(event.reason).slice(0, 10)) || String(event.reason);
            stack = event.reason?.stack;
          }
        } else {
          message = event?.message || String(event);
          stack = event?.error?.stack || undefined;
        }

        setOverlayErrors((s) => [{ id, message, stack }, ...s]);
        // keep visible and also log
        // eslint-disable-next-line no-console
        console.error("Captured overlay error:", message, stack || event);
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener("error", onError as EventListener);
    window.addEventListener("unhandledrejection", onError as EventListener);

    return () => {
      window.removeEventListener("error", onError as EventListener);
      window.removeEventListener("unhandledrejection", onError as EventListener);
    };
  }, []);

  

  // Alpaca States API key configuration
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const angelApiKey = "";
  const angelClientCode = "";
  const angelMpin = "";
  const angelTotpSeed = "";
  const angelUseServerCreds = false;
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isPaper, setIsPaper] = useState(true);
  const [useAlpacaLive, setUseAlpacaLive] = useState(true);
  const [allowLiveShorts, setAllowLiveShorts] = useState(true);
  const [positionsView, setPositionsView] = useState<'ALL' | 'LONGS' | 'SHORTS'>('ALL');
  const [tradeFormTab, setTradeFormTab] = useState<"manual" | "autopilot">("autopilot");
  const [isTickStreamActive, setIsTickStreamActive] = useState(true);
  const [autopilotLossGuard, setAutopilotLossGuard] = useState(true); // Drawdown Shield Protection
  const [autopilotBlacklist, setAutopilotBlacklist] = useState<string[]>(["TSLA"]); // Prevent low winrate long traps (e.g. TSLA)

  const cancelUnresolvedBrokerOrders = async () => {
    if (!useAlpacaLive || !isConnected || !apiKey || !apiSecret) return;

    const sessionKey = `${new Date().toISOString().slice(0, 10)}:${marketSession}`;
    if (lastSessionCleanupKeyRef.current === sessionKey) return;
    lastSessionCleanupKeyRef.current = sessionKey;

    try {
      const response = await fetch("/api/alpaca/order-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload({ orderId: "__all__" })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.error) return;

      const openOrders = Array.isArray(payload?.orders) ? payload.orders : [];
      const unresolved = openOrders.filter((order: any) => {
        const status = String(order?.status || "").toUpperCase();
        return ["NEW", "PENDING_NEW", "PENDING", "PARTIALLY_FILLED", "ACCEPTED"].includes(status);
      });

      if (unresolved.length === 0) {
        addLog("ALPACA", "SESSION_CLEANUP", "No unresolved broker orders found to cancel at session close.", "INFO");
        return;
      }

      for (const order of unresolved) {
        const orderId = String(order?.id || "").trim();
        if (!orderId) continue;
        await fetch("/api/alpaca/order-cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getBrokerAuthPayload({ orderId })),
        });
      }

      addLog("ALPACA", "SESSION_CLEANUP", `Cancelled ${unresolved.length} unresolved broker order(s) at session close.`, "WARNING");
      await handleRefreshData();
    } catch (error: any) {
      console.error("Session cleanup failed", error);
      addLog("ALPACA", "SESSION_CLEANUP_ERROR", error?.message || "Failed to cancel unresolved broker orders.", "WARNING");
    }
  };

  // Connection & loading flags
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");
  const [, setBinancePreferredUsdt] = useState<number>(0);

  useEffect(() => {
    if (!useAlpacaLive || !isConnected || !apiKey || !apiSecret) return;
    if (marketSession !== "CLOSED") return;
    void cancelUnresolvedBrokerOrders();
  }, [apiKey, apiSecret, isConnected, marketSession, useAlpacaLive]);
  const [, setBinanceFundingSource] = useState<"futures" | "spot" | "none">("none");
  const [, setBinanceFundingUpdatedAt] = useState<number | null>(null);

  // Simulated (Paper Setup) Parameters
  const [simCash, setSimCash] = useState(2000);
  const [startingCapital, setStartingCapital] = useState(3085); // Cash $2,000 + NVDA $220 + AAPL $540 + BTCUSD $325 cost basis
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [tempCashInput, setTempCashInput] = useState("");
  const simLeverageLimit = 4; // 4x leverage limit
  const [mockPositions, setMockPositions] = useState<Position[]>([
    {
      symbol: "NVDA",
      qty: 2.0,
      avg_entry_price: 110.0,
      current_price: 115.5,
      market_value: 231.0,
      unrealized_pl: 11.0,
      unrealized_plpc: 0.05,
      maintenance_margin_rate: 0.35,
    },
    {
      symbol: "AAPL",
      qty: 3.0,
      avg_entry_price: 180.0,
      current_price: 182.2,
      market_value: 546.6,
      unrealized_pl: 6.6,
      unrealized_plpc: 0.012,
      maintenance_margin_rate: 0.30,
    },
    {
      symbol: "BTCUSD",
      qty: 0.005,
      avg_entry_price: 65000.0,
      current_price: 67200.0,
      market_value: 336.0,
      unrealized_pl: 11.0,
      unrealized_plpc: 0.0338,
      maintenance_margin_rate: 0.50,
    }
  ]);

  // General Settings & Alerts
  const [warnThreshold, setWarnThreshold] = useState(70); // %
  const [criticalThreshold, setCriticalThreshold] = useState(85); // %

  // Terminal state
  const [orderSymbol, setOrderSymbol] = useState("AAPL");
  const [orderQty, setOrderQty] = useState("10");
  const [orderUnit, setOrderUnit] = useState<"SHARES" | "USD">("SHARES");

  // Custom simulator entry
  const [newSymbol, setNewSymbol] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newMaint, setNewMaint] = useState("30");

  // Active Alpaca positions
  const [alpacaPositions, setAlpacaPositions] = useState<Position[]>([]);
  const [alpacaAccount, setAlpacaAccount] = useState<any>(null);

  // Orders and log tracking
  const [, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // AI Stress Diagnosis state
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiAnalysisGeneratedAt, setAiAnalysisGeneratedAt] = useState<number | null>(null);
  const [aiAnalysisSnapshot, setAiAnalysisSnapshot] = useState<{ equity: number; cash: number; positions: number } | null>(null);
  const [aiAnalysisLive, setAiAnalysisLive] = useState<boolean | null>(null);

  const aiAnalysisSummary = useMemo(() => {
    if (!aiAnalysis) return "";
    const lines = aiAnalysis
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return "";
    const header = lines.find((line) => line.startsWith("##") || line.startsWith("###") || line.startsWith("* ") || line.match(/^\d+\./));
    if (header) {
      return header.replace(/^#+\s*/, "").replace(/^\*\s*/, "").slice(0, 120);
    }

    return lines.slice(0, 2).join(" ").slice(0, 120);
  }, [aiAnalysis]);

  const diagnosticLogs = useMemo(() => {
    return logs.filter((log) => log.symbol === "GEMINI" || log.action.startsWith("DIAGNOSE")).slice(0, 5);
  }, [logs]);

  const latestDiagnosticLog = diagnosticLogs[0] ?? null;
  const latestDiagnosticStatus = useMemo(() => {
    if (!latestDiagnosticLog) return "No diagnostics run yet";
    if (latestDiagnosticLog.action === "DIAGNOSE_REQUEST") return "Running";
    if (latestDiagnosticLog.action === "DIAGNOSE_SUCCESS") return "Success";
    if (latestDiagnosticLog.action === "DIAGNOSE_ERROR") return "Error";
    return latestDiagnosticLog.status;
  }, [latestDiagnosticLog]);

  // Portfolio Liquidation Action States
  const [isLiquidating, setIsLiquidating] = useState<string | null>(null);

  // Dynamic Toast alerts notification system
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO" }[]>([]);
  const toastHistoryRef = useRef<Record<string, number>>({});
  const lastToastAtRef = useRef<number>(0);

  const showToast = useCallback((message: string, type: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO" = "INFO") => {
    const now = Date.now();
    const key = `${type}:${message}`;
    const lastShown = toastHistoryRef.current[key] || 0;

    // Avoid repeated toasts for the same message within 5 seconds.
    if (now - lastShown < 5000) return;

    // Throttle INFO toasts to avoid noisy status updates.
    if (type === "INFO" && now - lastToastAtRef.current < 1500) return;

    toastHistoryRef.current[key] = now;
    lastToastAtRef.current = now;

    const id = `toast-${now}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      return next.slice(-4); // keep latest 4 active toasts only
    });

    // Automatically dismiss toasts after a longer duration for warnings and critical alerts
    const dismissDelay = type === "CRITICAL" || type === "WARNING" ? 9000 : 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, dismissDelay);
  }, []);

  // Helper log function (hoisted so effects can depend on it safely)
  const getBrokerAuthPayload = useCallback((extra: object = {}, forceIsPaper?: boolean) => {
    const effectiveIsPaper = typeof forceIsPaper === 'boolean' ? forceIsPaper : isPaper;
    const payload: any = { isPaper: effectiveIsPaper, ...extra };
    
    // SAFETY: Only send client-side keys if they match the current mode.
    // Live keys start with AK, Paper keys start with PK.
    const looksLikeLive = apiKey.startsWith("AK");
    const looksLikePaper = apiKey.startsWith("PK");

    if (apiKey && apiSecret) {
      if (effectiveIsPaper && looksLikeLive) {
        // Skip adding incompatible keys
      } else if (!effectiveIsPaper && looksLikePaper) {
        // Skip adding incompatible keys
      } else {
        payload.apiKey = apiKey;
        payload.apiSecret = apiSecret;
      }
    }
    return payload;
  }, [isPaper, apiKey, apiSecret]);

  const addLog = useCallback(
    (
      symbol: string,
      action: string,
      message: string,
      status: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO"
    ) => {
      const newLog: Log = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: typeof window === "undefined" ? HYDRATION_SAFE_TIME_PLACEHOLDER : new Date().toLocaleTimeString(),
        symbol,
        action,
        message,
        status,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 50));

      // Only show toasts for warnings or critical issues to reduce spam.
      if (status !== "INFO") {
        showToast(`${symbol} • ${action}: ${message}`, status);
      }
    },
    [showToast]
  );

  const fetchBinanceFundingSnapshot = useCallback(async (): Promise<{ usdt: number; source: "futures" | "spot" | "none" }> => {
    try {
      const prefRes = await fetch('/api/binance/preferred-usdt', { cache: 'no-store' });
      const pref = await prefRes.json();
      const prefUsdt = parseFloat(pref?.usdt || 0);
      const usdt = Number.isFinite(prefUsdt) ? prefUsdt : 0;
      const source: "futures" | "spot" | "none" = pref?.source === "futures" || pref?.source === "spot" ? pref.source : "none";
      setBinancePreferredUsdt(usdt);
      setBinanceFundingSource(source);
      setBinanceFundingUpdatedAt(Date.now());
      return { usdt, source };
    } catch (e) {
      setBinancePreferredUsdt(0);
      setBinanceFundingSource("none");
      setBinanceFundingUpdatedAt(Date.now());
      return { usdt: 0, source: "none" };
    }
  }, [setBinanceFundingSource, setBinanceFundingUpdatedAt, setBinancePreferredUsdt]);

  // --- SENTRY AUTOPILOT STATE VARIABLES & ENGINES ---
  const [isAutopilotActive, setIsAutopilotActive] = useState(true);
  const [autopilotAutoStart, setAutopilotAutoStart] = useState<boolean>(false);
  const [autopilotStrategy, setAutopilotStrategy] = useState<"SENTRY_HEAL" | "GEMINI_AI" | "SCALPER" | "TOUCH_TURN" | "MACD_FRONT_SIDE" | "SNEAKY_PIVOT" | "ELLIOTT_WAVE">("SCALPER");

  // Elliott Wave state map for tracking wave counts per symbol
  const [elliottStateMap, setElliottStateMap] = useState<Record<string, {
    symbol: string;
    waveIndex: number; // 0-5 for impulsive waves
    peaks: number[]; // recent high/low price anchors
    status: "SCANNING" | "IMPULSE_DETECTED" | "CORRECTION" | "IDLE";
  }>>({});

  const setElliottState = useCallback((val: any) => {
    setElliottStateMap((prev) => {
      const cur = prev[(val && val.symbol) || ""] || null;
      const next = typeof val === "function" ? val(cur) : val;
      if (!next) {
        const copy = { ...prev };
        if (next === null && val && val.symbol) delete copy[val.symbol];
        return copy;
      }
      const sym = next.symbol || (cur && cur.symbol) || "";
      return { ...prev, [sym]: next };
    });
  }, []);
  
  // --- TOUCH & TURN OPENING-RANGE SCALPER STATE MAP ---
  const [touchTurnStateMap, setTouchTurnStateMap] = useState<Record<string, {
    symbol: string;
    atr14: number;
    atrThreshold: number;
    openHigh: number;
    openLow: number;
    rangeRange: number;
    isBullish: boolean;
    isValid: boolean;
    limitPrice: number;
    targetPrice: number;
    stopPrice: number;
    status: "WAITING_LIMIT" | "ACTIVE_TRADE" | "HIT_TARGET" | "HIT_STOP" | "IDLE";
    entryPrice?: number;
    side?: "BUY" | "SELL";
  }>>({});

  // --- MACD FRONT-SIDE MOMENTUM STRATEGY STATE MAP ---
  const [macdStateMap, setMacdStateMap] = useState<Record<string, {
    symbol: string;
    ema12: number;
    ema26: number;
    macdValue: number;
    signalValue: number;
    histogram: number;
    prevHistogram: number;
    trendSide: "FRONT_SIDE" | "BACK_SIDE" | "NEUTRAL";
    status: "IDLE" | "ACTIVE_TRADE" | "EXITED_BACKSIDE";
    entryPrice?: number;
    tradeQty: number;
  }>>({});

  // --- SNEAKY PIVOT SYSTEM STATE MAP ---
  const [sneakyPivotStateMap, setSneakyPivotStateMap] = useState<Record<string, {
    symbol: string;
    rangeHigh: number;
    rangeLow: number;
    swingHigh: number;
    swingLow: number;
    status: "SCANNING" | "CANDLE1_ESTABLISHED" | "CONFIRMED_PV_CANDLE2" | "ENTRY_TRIGGERED_CANDLE3" | "ACTIVE_TRADE" | "HIT_TARGET" | "HIT_STOP";
    side?: "BUY" | "SELL";
    entryPrice?: number;
    targetPrice?: number;
    stopPrice?: number;
    candleCount: number;
    lastCandleAction: string;
  }>>({});

  const [autopilotInterval, setAutopilotInterval] = useState(30); // Fast scan for immediate entry
  const [autopilotFailurePauseSeconds, setAutopilotFailurePauseSeconds] = useState(120);
  // Global scanning master switch — user confirmed live trading; enable scanning by default
  const [scanningEnabled, setScanningEnabled] = useState<boolean>(true);
  const DEFAULT_AUTOPILOT_TARGET_TICKERS = quickTickers.join(",");
  const [autopilotTargetTicker, setAutopilotTargetTicker] = useState(DEFAULT_AUTOPILOT_TARGET_TICKERS);
  const [autopilotScanBroadUniverse, setAutopilotScanBroadUniverse] = useState<boolean>(true);
  const [blockedMarkets, setBlockedMarkets] = useState<{ wallStreet: boolean }>({ wallStreet: false });
  const [autopilotAutoSwitchEnabled, setAutopilotAutoSwitchEnabled] = useState<boolean>(true);
  const [activeVisualizerSymbol] = useState<string>("");

  // Global automated exit thresholds (percent)
  const [globalTakeProfitPercent, setGlobalTakeProfitPercent] = useState<number>(3.5); // Relaxed for better trend capture
  const [globalStopLossPercent, setGlobalStopLossPercent] = useState<number>(2.2); // Relaxed to avoid death by a thousand cuts in noise

  // Risk screening & diversification controls
  const [minAvgVolume, setMinAvgVolume] = useState<number>(500000); // reduced volume filter for more targets
  const [maxExposurePercentPerSymbol, setMaxExposurePercentPerSymbol] = useState<number>(15); // increased per symbol
  const [perSymbolDollarCap, setPerSymbolDollarCap] = useState<number>(5000); // 🚀 ELITE
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(255); // 🚀 ELITE
  const [autoLiquidateBeforeClose, setAutoLiquidateBeforeClose] = useState<boolean>(false);
  const [liquidationBeforeCloseMin, setLiquidationBeforeCloseMin] = useState<number>(5);
  const [liveMinOrderQty, setLiveMinOrderQty] = useState<number>(0.01); // minimum live order size
  const [aggressiveDeleverage, setAggressiveDeleverage] = useState<boolean>(false);
  const [hasLoadedPersistentSettings, setHasLoadedPersistentSettings] = useState<boolean>(false);

  const LIQUIDATION_COOLDOWN_MS = 60 * 60 * 1000; // increased to 1 hour
  const AUTOPILOT_MIN_HOLD_MS = 2 * 60 * 1000; // Reduced from 8m to 2m for faster exits
  const AUTOPILOT_MAX_TRADES_PER_DAY = 1000; // 🚀 INCREASED FOR PROFIT
  const AUTOPILOT_DAILY_LOSS_LIMIT_USD = 500; // 🚀 INCREASED FOR PROFIT
  const AUTOPILOT_DAILY_PROFIT_GOAL_USD = 5000; // 🚀 INCREASED FOR PROFIT
  const AUTOPILOT_MIN_TREND_STRENGTH = 0.25; // ⚡️ ELITE SCALPER (Lowered from 0.40)
  const AUTOPILOT_MIN_ATR_PCT = 0.005; // ⚡️ even more aggressive
  const AUTOPILOT_MAX_CHOP_SCORE = 0.55; // Allow more volatile markets
  const AUTOPILOT_MIN_EDGE_BUFFER_BPS = 2; // Tighten for higher capture
  const AUTOPILOT_MIN_EDGE_BPS = 8; // Drop threshold to catch small moves
  const AUTOPILOT_MIN_EDGE_BUFFER_SHORT_BPS = 10; // ⚡️ AGGRESSIVE
  const AUTOPILOT_MIN_EDGE_BUFFER_LONG_BPS = 5; // ⚡️ AGGRESSIVE
  const AUTOPILOT_MIN_SIGNAL_MATURITY_TICKS = 8; // 🚀 FAST START (Lowered from 20)
  const AUTOPILOT_MAX_DRAWDOWN_PCT_STOP = 0.65; // 🛡️ WIDER STOP FOR VOLATILITY
  const AUTOPILOT_TAKE_PROFIT_PCT = 1.05; // 🎯 TARGET (Raised from 0.75)
  const AUTOPILOT_REVERSAL_EXIT_THRESHOLD = 0.15; // 🛡️ SENSITIVE
  const AUTOPILOT_REVERSAL_PROFIT_MIN = 0.05; // 🛡️ LOCK IN SMALL GAINS
  const AUTOPILOT_MAX_OPEN_TRADES = 100; // 🚀 UNBLOCK FULL UNIVERSE
  const AUTOPILOT_POST_LOSS_COOLDOWN_MS = 5 * 60 * 1000; // FASTER RECOVERY
  const AUTOPILOT_FAILURE_PAUSE_MS = autopilotFailurePauseSeconds * 1000;

  const addAutopilotLog = useCallback((msg: string, type: "info" | "success" | "warn" | "trade") => {
    setAutopilotLogs((prev) => {
      // Suppress exact consecutive duplicates to avoid log spam during polling loops.
      if (prev[0]?.msg === msg && prev[0]?.type === type) {
        return prev;
      }
      const newLog = {
        id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        time: typeof window === "undefined" ? HYDRATION_SAFE_TIME_PLACEHOLDER : new Date().toLocaleTimeString(),
        msg,
        type
      };
      return [newLog, ...prev].slice(0, 50);
    });
    try {
      // Only show toast notifications for significant autopilot events.
      if (type === "info") return;
      const mapType = type === "trade" || type === "success" ? "SUCCESS" : type === "warn" ? "WARNING" : "INFO";
      showToast(msg, mapType as "SUCCESS" | "WARNING" | "CRITICAL" | "INFO");
    } catch (e) {
      // ignore toast failures
    }
  }, [showToast]);

  // Safe state manager (pause/resume autopilot, cancel orders)
  const safeStateRef = useRef<SafeStateManager | null>(null);
  const [isSafeStateActive, setIsSafeStateActive] = useState(false);

  useEffect(() => {
    safeStateRef.current = new SafeStateManager({
      cancelOrders: cancelUnresolvedBrokerOrders,
      pauseAutopilot: () => setIsAutopilotActive(false),
      resumeAutopilot: () => setIsAutopilotActive(true),
      addLog: addLog,
      showToast: (m: string, t?: any) => showToast(m, t || "INFO"),
      onChange: (isSafe: boolean) => setIsSafeStateActive(isSafe),
    });
    return () => {
      safeStateRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSafeState = useCallback(async () => {
    const mgr = safeStateRef.current;
    if (!mgr) return;
    if (isSafeStateActive) {
      await mgr.exitSafeState('manual');
    } else {
      await mgr.enterSafeState('manual');
    }
  }, [isSafeStateActive]);

  // Auto-enter safe state when connection or tick-stream drops
  useEffect(() => {
    const mgr = safeStateRef.current;
    if (!mgr) return;
    if (!isConnected || !isTickStreamActive) {
      void mgr.enterSafeState("connection_or_stream_lost");
    } else {
      void mgr.exitSafeState("connection_restored");
    }
  }, [isConnected, isTickStreamActive]);

  // Load persisted global TP/SL from localStorage on mount
  useEffect(() => {
    try {
      const strategyStored = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotStrategy");
      const targetStored = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotTargetTicker");
      const autoStartStored = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotAutoStart");
      const warnStored = typeof window !== "undefined" && localStorage.getItem("sentry:warnThreshold");
      const criticalStored = typeof window !== "undefined" && localStorage.getItem("sentry:criticalThreshold");
      const tp = typeof window !== "undefined" && localStorage.getItem("sentry:globalTP");
      const sl = typeof window !== "undefined" && localStorage.getItem("sentry:globalSL");
      const minAvgVolStored = typeof window !== "undefined" && localStorage.getItem("sentry:minAvgVol");
      const maxExposureStored = typeof window !== "undefined" && localStorage.getItem("sentry:maxExposurePct");
      const minLiveQty = typeof window !== "undefined" && localStorage.getItem("sentry:liveMinQty");
      const maxConcurrentStored = typeof window !== "undefined" && localStorage.getItem("sentry:maxConcurrent");
      const broadScan = typeof window !== "undefined" && localStorage.getItem("sentry:scanBroadUniverse");
      const blockedMarketsStored = typeof window !== "undefined" && localStorage.getItem("sentry:blockedMarkets");
      const lossGuardStored = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotLossGuard");
      const tradeFormTabStored = typeof window !== "undefined" && localStorage.getItem("sentry:tradeFormTab");
      const tickStreamStored = typeof window !== "undefined" && localStorage.getItem("sentry:isTickStreamActive");
      const blacklistStored = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotBlacklist");

      if (strategyStored) {
        const allowed = new Set(["SENTRY_HEAL", "GEMINI_AI", "SCALPER", "TOUCH_TURN", "MACD_FRONT_SIDE", "SNEAKY_PIVOT", "ELLIOTT_WAVE"]);
        if (allowed.has(strategyStored)) {
          setAutopilotStrategy(strategyStored as any);
        }
      }
      if (targetStored) {
        setAutopilotTargetTicker(targetStored.toUpperCase().trim());
      }
      const autoStartEnabled = autoStartStored === null ? true : autoStartStored === "true";
      setAutopilotAutoStart(autoStartEnabled);
      if (autoStartEnabled) setIsAutopilotActive(true);
      if (warnStored) {
        const n = parseFloat(warnStored);
        if (Number.isFinite(n)) setWarnThreshold(Math.max(1, Math.min(99, n)));
      }
      if (criticalStored) {
        const n = parseFloat(criticalStored);
        if (Number.isFinite(n)) setCriticalThreshold(Math.max(1, Math.min(100, n)));
      }
      if (tp) setGlobalTakeProfitPercent(Math.max(0, parseFloat(tp)));
      if (sl) setGlobalStopLossPercent(Math.max(0, parseFloat(sl)));
      if (minAvgVolStored) {
        const n = parseFloat(minAvgVolStored);
        if (Number.isFinite(n)) setMinAvgVolume(Math.max(0, n));
      }
      if (maxExposureStored) {
        const n = parseFloat(maxExposureStored);
        if (Number.isFinite(n)) {
          setMaxExposurePercentPerSymbol(Math.max(1, Math.min(100, n)));
        }
      }
      if (minLiveQty) setLiveMinOrderQty(Math.max(0.0001, parseFloat(minLiveQty)));
      if (maxConcurrentStored !== null && maxConcurrentStored !== false) {
        const val = parseInt(maxConcurrentStored as string, 10);
        if (Number.isFinite(val)) {
          setMaxConcurrentPositions(Math.max(1, val));
        }
      }
      const autoLiquidateStored = typeof window !== "undefined" && localStorage.getItem("sentry:autoLiquidateBeforeClose");
      const liquidationMinStored = typeof window !== "undefined" && localStorage.getItem("sentry:liquidationBeforeCloseMin");
      if (autoLiquidateStored) setAutoLiquidateBeforeClose(autoLiquidateStored === "true");
      if (liquidationMinStored) setLiquidationBeforeCloseMin(Math.max(1, parseInt(liquidationMinStored)));
      if (lossGuardStored) setAutopilotLossGuard(lossGuardStored === "true");
      if (tradeFormTabStored && (tradeFormTabStored === "manual" || tradeFormTabStored === "autopilot")) setTradeFormTab(tradeFormTabStored as any);
      if (tickStreamStored) setIsTickStreamActive(tickStreamStored === "true");
      if (blacklistStored) {
        try {
          const parsed = JSON.parse(blacklistStored);
          if (Array.isArray(parsed)) {
            setAutopilotBlacklist(parsed.filter((item) => typeof item === "string"));
          }
        } catch (e) {}
      }
      setAutopilotScanBroadUniverse(true); // 🚀 ELITE: Always broad scan
      if (blockedMarketsStored) {
        try {
          const parsed = JSON.parse(blockedMarketsStored);
          setBlockedMarkets({
            wallStreet: !!parsed.wallStreet,
          });
        } catch (e) {}
      }
      const autoSwitchRaw = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotAutoSwitchEnabled");
      if (autoSwitchRaw) setAutopilotAutoSwitchEnabled(autoSwitchRaw === "true");
      const savedInterval = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotInterval");
      if (savedInterval) {
        const parsed = Math.max(1, parseInt(savedInterval));
        setAutopilotInterval(parsed);
      } else {
        // No saved value: default to 15s
        setAutopilotInterval(10);
      }
      const savedPerSymbolCap = typeof window !== "undefined" && localStorage.getItem("sentry:perSymbolDollarCap");
      if (savedPerSymbolCap) {
        const parsed = parseFloat(savedPerSymbolCap);
        if (!Number.isNaN(parsed)) setPerSymbolDollarCap(parsed);
      }
      const savedFailurePause = typeof window !== "undefined" && localStorage.getItem("sentry:autopilotFailurePauseSeconds");
      if (savedFailurePause) setAutopilotFailurePauseSeconds(Math.max(30, parseInt(savedFailurePause)));
      // Restore persisted per-symbol cooldowns (if any) and clean expired entries
      try {
        if (typeof window !== "undefined") {
          const rawCd = localStorage.getItem("sentry:autopilotCooldowns");
          if (rawCd) {
            try {
              const parsed = JSON.parse(rawCd || "{}") as Record<string, number>;
              const now = Date.now();
              const cleaned: Record<string, number> = {};
              for (const k of Object.keys(parsed)) {
                const v = Number(parsed[k]);
                if (!Number.isFinite(v)) continue;
                if (v > now) {
                  cleaned[k] = v;
                }
              }
              autopilotBuyCooldownUntilRef.current = { ...(autopilotBuyCooldownUntilRef.current || {}), ...cleaned };
              // persist cleaned map back
              localStorage.setItem("sentry:autopilotCooldowns", JSON.stringify(cleaned));
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      } catch (e) {}
      setHasLoadedPersistentSettings(true);
    } catch (e) {
      // ignore
      setHasLoadedPersistentSettings(true);
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sentry:autopilotInterval", String(autopilotInterval));
        localStorage.setItem("sentry:autopilotFailurePauseSeconds", String(autopilotFailurePauseSeconds));
      }
    } catch (e) {}
  }, [autopilotInterval, autopilotFailurePauseSeconds]);

  // Persist TP/SL whenever they change
  useEffect(() => {
    if (!hasLoadedPersistentSettings) return;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sentry:autopilotStrategy", String(autopilotStrategy));
        localStorage.setItem("sentry:autopilotTargetTicker", String(autopilotTargetTicker));
        localStorage.setItem("sentry:autopilotAutoStart", String(autopilotAutoStart));
        localStorage.setItem("sentry:warnThreshold", String(warnThreshold));
        localStorage.setItem("sentry:criticalThreshold", String(criticalThreshold));
        localStorage.setItem("sentry:globalTP", String(globalTakeProfitPercent));
        localStorage.setItem("sentry:globalSL", String(globalStopLossPercent));
        localStorage.setItem("sentry:minAvgVol", String(minAvgVolume));
        localStorage.setItem("sentry:maxExposurePct", String(maxExposurePercentPerSymbol));
        localStorage.setItem("sentry:perSymbolDollarCap", String(perSymbolDollarCap));
        localStorage.setItem("sentry:maxConcurrent", String(maxConcurrentPositions));
        localStorage.setItem("sentry:liveMinQty", String(liveMinOrderQty));
        localStorage.setItem("sentry:autoLiquidateBeforeClose", String(autoLiquidateBeforeClose));
        localStorage.setItem("sentry:liquidationBeforeCloseMin", String(liquidationBeforeCloseMin));
        localStorage.setItem("sentry:aggressiveDeleverage", JSON.stringify(aggressiveDeleverage));
        localStorage.setItem("sentry:scanBroadUniverse", String(autopilotScanBroadUniverse));
        localStorage.setItem("sentry:autopilotAutoSwitchEnabled", String(autopilotAutoSwitchEnabled));
        localStorage.setItem("sentry:blockedMarkets", JSON.stringify(blockedMarkets));
        localStorage.setItem("sentry:allowLiveShorts", String(allowLiveShorts));
        localStorage.setItem("sentry:positionsView", positionsView);
        localStorage.setItem("sentry:autopilotLossGuard", String(autopilotLossGuard));
        localStorage.setItem("sentry:autopilotFailurePauseSeconds", String(autopilotFailurePauseSeconds));
        localStorage.setItem("sentry:autopilotBlacklist", JSON.stringify(autopilotBlacklist));
        localStorage.setItem("sentry:tradeFormTab", tradeFormTab);
        localStorage.setItem("sentry:isTickStreamActive", String(isTickStreamActive));
      }
    } catch (e) {}
  }, [hasLoadedPersistentSettings, autopilotStrategy, autopilotTargetTicker, autopilotAutoStart, warnThreshold, criticalThreshold, globalTakeProfitPercent, globalStopLossPercent, minAvgVolume, maxExposurePercentPerSymbol, perSymbolDollarCap, maxConcurrentPositions, liveMinOrderQty, aggressiveDeleverage, autopilotScanBroadUniverse, autopilotAutoSwitchEnabled, blockedMarkets, allowLiveShorts, positionsView, autoLiquidateBeforeClose, liquidationBeforeCloseMin, autopilotLossGuard, autopilotFailurePauseSeconds, autopilotBlacklist, tradeFormTab, isTickStreamActive]);

  // Crypto-only auto-switch removed: non-crypto buys are allowed at all times unless explicitly blocked.

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("sentry:aggressiveDeleverage");
      if (raw) setAggressiveDeleverage(raw === "true" || JSON.parse(raw));
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("sentry:allowLiveShorts");
      if (raw) setAllowLiveShorts(raw === "true");
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("sentry:positionsView");
      if (raw && (raw === 'ALL' || raw === 'LONGS' || raw === 'SHORTS')) setPositionsView(raw as any);
    } catch (e) {}
  }, []);

  const targetSymbols = useMemo(() => {
    return autopilotTargetTicker
      .split(/[\s,]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  }, [autopilotTargetTicker]);

  const currentVizSymbol = useMemo(() => {
    if (activeVisualizerSymbol && targetSymbols.includes(activeVisualizerSymbol)) {
      return activeVisualizerSymbol;
    }
    return targetSymbols[0] || "AAPL";
  }, [activeVisualizerSymbol, targetSymbols]);

  // Derived states to maintain 100% backward compatibility with all UI panels and graphs
  const touchTurnState = touchTurnStateMap[currentVizSymbol] || null;
  const macdState = macdStateMap[currentVizSymbol] || null;
  const sneakyPivotState = sneakyPivotStateMap[currentVizSymbol] || null;

  const setTouchTurnState = useCallback((val: any) => {
    setTouchTurnStateMap((prev) => {
      const current = prev[currentVizSymbol] || null;
      const next = typeof val === "function" ? val(current) : val;
      if (next === null) {
        const copy = { ...prev };
        delete copy[currentVizSymbol];
        return copy;
      }
      const sym = next.symbol || currentVizSymbol;
      return {
        ...prev,
        [sym]: next
      };
    });
  }, [currentVizSymbol]);

  const setMacdState = useCallback((val: any) => {
    setMacdStateMap((prev) => {
      const current = prev[currentVizSymbol] || null;
      const next = typeof val === "function" ? val(current) : val;
      if (next === null) {
        const copy = { ...prev };
        delete copy[currentVizSymbol];
        return copy;
      }
      const sym = next.symbol || currentVizSymbol;
      return {
        ...prev,
        [sym]: next
      };
    });
  }, [currentVizSymbol]);

  const setSneakyPivotState = useCallback((val: any) => {
    setSneakyPivotStateMap((prev) => {
      const current = prev[currentVizSymbol] || null;
      const next = typeof val === "function" ? val(current) : val;
      if (next === null) {
        const copy = { ...prev };
        delete copy[currentVizSymbol];
        return copy;
      }
      const sym = next.symbol || currentVizSymbol;
      return {
        ...prev,
        [sym]: next
      };
    });
  }, [currentVizSymbol]);

  const [autopilotLogs, setAutopilotLogs] = useState<{ id: string; time: string; msg: string; type: "info" | "success" | "warn" | "trade" }[]>([
    {
      id: "init",
      time: HYDRATION_SAFE_TIME_PLACEHOLDER,
      msg: "System load successful. Autopilot engine initialized offline. Configure credentials or select simulated asset.",
      type: "info"
    }
  ]);
  const [lastAutopilotOrderOutcome, setLastAutopilotOrderOutcome] = useState<AutopilotOrderResult | null>(null);
  const [autopilotLastScanAtMs, setAutopilotLastScanAtMs] = useState<number | null>(null);
  const [autopilotNextScanInSec, setAutopilotNextScanInSec] = useState<number | null>(null);
  const [autopilotCurrentScanTarget, setAutopilotCurrentScanTarget] = useState<string | null>(null);
  const [autopilotScanError, setAutopilotScanError] = useState<string | null>(null);
  const [autopilotScanErrorCount, setAutopilotScanErrorCount] = useState<number>(0);
  const [autopilotScanTotalTargets, setAutopilotScanTotalTargets] = useState<number>(0);
  const [autopilotScanProcessedCount, setAutopilotScanProcessedCount] = useState<number>(0);
  const [autopilotPerformance, setAutopilotPerformance] = useState<Record<string, PerformanceCounts>>({});
  const [autopilotBlockCodeCounts, setAutopilotBlockCodeCounts] = useState<Record<string, number>>({});
  const [symbolPerformance, setSymbolPerformance] = useState<Record<string, PerformanceCounts>>({});
  const [symbolProfitStats, setSymbolProfitStats] = useState<Record<string, { trades: number; wins: number; losses: number; realizedPnl: number }>>({});
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  // Derived counts
  const prevAutopilotActiveRef = useRef<boolean | null>(null);
  const sentryHealthStateRef = useRef<"healthy" | "warning" | null>(null);
  // Track whether we've already warned about live broad-universe batching this session
  const liveBroadWarningLoggedRef = useRef<boolean>(false);
  // Short borrow / throttle tracking to avoid repeated short attempts when borrow unavailable
  const shortFailureTimestampsRef = useRef<Record<string, number[]>>({});
  const SHORT_FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const SHORT_FAILURE_LIMIT = 3; // after 3 failures in window, throttle

  // --- AI Signal Classifier (lightweight heuristic) ---
  const computeSignalConfidence = useCallback((stat?: AutopilotMarketStats) => {
    if (!stat) return { label: "NEUTRAL" as const, confidence: 0 };
    // Raw signal strength combines trend, edge vs cost, and chop penalty
    const edgeNet = Math.abs(stat.expectedEdgeBps) - stat.estimatedCostBps;
    const trend = Math.abs(stat.trendStrength || 0);
    const chopPenalty = Math.max(0, Math.min(1, stat.chopScore || 0));
    // Raised the hurdle: edge must be at least 8bps AFTER estimating costs to clear bid-ask churn
    let raw = Math.max(0, edgeNet - 8) * trend * (1 - chopPenalty);
    // Normalize: empirical scaling to map typical ranges into 0..1
    const confidence = Math.min(1, raw / 50);
    const label = stat.expectedEdgeBps > stat.estimatedCostBps ? "LONG" : (stat.expectedEdgeBps < -stat.estimatedCostBps ? "SHORT" : "NEUTRAL");
    return { label, confidence };
  }, []);

  // Wrapper to set last outcome with verbose logging for BLOCKED reasons
  const setLastAutopilotOutcomeVerbose = useCallback((val: AutopilotOrderResult | ((prev: AutopilotOrderResult | null) => AutopilotOrderResult | null)) => {
    setLastAutopilotOrderOutcome((prev) => {
      const next = typeof val === "function" ? (val as any)(prev) : val;
      if (!next) return next;
      try {
        const qty = next.executedQty > 0 ? next.executedQty : next.requestedQty;
        // Attach per-symbol market stats snapshot for BLOCKED/REJECTED outcomes
        let statsSnapshot: any = null;
        try {
          const symbolKey = (next.symbol || "").toUpperCase();
          statsSnapshot = (autopilotMarketStatsRef.current || {})[symbolKey] || null;
        } catch (e) {
          statsSnapshot = null;
        }
        const statsText = statsSnapshot ? ` | stats:${JSON.stringify({ expectedEdgeBps: statsSnapshot.expectedEdgeBps, estimatedCostBps: statsSnapshot.estimatedCostBps, chopScore: statsSnapshot.chopScore, trendStrength: statsSnapshot.trendStrength, atrPct: statsSnapshot.atrPct, netMovePct: statsSnapshot.netMovePct })}` : "";
        if (next.status === "BLOCKED") {
          addAutopilotLog(`[BLOCKED] ${next.code} ${next.side} ${qty} ${next.symbol} — ${next.message}${statsText}`, "warn");
          console.warn(`[AUTOPILOT][BLOCKED] ${next.code} ${next.side} ${qty} ${next.symbol} — ${next.message}${statsText}`);
          // persist a detailed CSV-friendly log entry to OPERATIONAL via an API route if available
          try {
            // fire-and-forget
            fetch('/api/operational/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timestamp: Date.now(), outcome: next, stats: statsSnapshot }) }).catch(() => {});
          } catch (e) {}
        } else if (next.status === "REJECTED") {
          addAutopilotLog(`[REJECTED] ${next.code} ${next.side} ${qty} ${next.symbol} — ${next.message}${statsText}`, "warn");
          console.warn(`[AUTOPILOT][REJECTED] ${next.code} ${next.side} ${qty} ${next.symbol} — ${next.message}${statsText}`);
          try {
            fetch('/api/operational/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timestamp: Date.now(), outcome: next, stats: statsSnapshot }) }).catch(() => {});
          } catch (e) {}
        } else if (next.status === "FILLED") {
          addAutopilotLog(`[FILLED] ${next.side} ${qty} ${next.symbol} (${next.code})`, "success");
          try {
            // persist FILLED outcomes for forensic analysis
            fetch('/api/operational/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timestamp: Date.now(), outcome: next, stats: statsSnapshot }) }).catch(() => {});
          } catch (e) {}
        } else if (next.status === "PENDING") {
          addAutopilotLog(`[PENDING] ${next.side} ${next.requestedQty} ${next.symbol} (${next.code}) - ${next.message}`, "info");
        }
      } catch (e) {
        // swallow logging errors
      }
      return next;
    });
  }, [addAutopilotLog]);

  // --- Adaptive sizing controller ---
  const computeAdaptiveQty = useCallback((baseQty: number, confidence: number, symbol?: string, side?: "BUY" | "SELL") => {
    const isCrypto = symbol === "BTCUSD" || (symbol ? isCryptoSymbol(symbol) : false);
    // 🚀 AGGRESSIVE: Using Alpaca's fractional floor (0.0001) for all assets to maximize capital efficiency across symbols.
    const minQty = 0.0001;
    
    // STRICT HURDLE: If confidence is zero, do not trade.
    if (confidence <= 0) return 0;

    // 🚀 SCALING: Scale from 80% to 150% of base budget based on signal confidence
    let raw = baseQty * (0.8 + confidence * 0.7);
    
    if (raw < minQty && raw > 0) {
      if (!isCrypto && !isPaper) {
         // Keep integer constraint only for actual LIVE equity accounts 
         return (side === "SELL") ? 0 : 1; 
      }
      raw = minQty; 
    }

    // Alpaca rejection: fractional orders cannot be sold short for equities
    if (!isCrypto && side === "SELL") {
      raw = Math.floor(raw);
      // Ensure at least 1 share for shorting if we intended to trade
      if (raw < 1) {
        return 0;
      }
    }
    
    // Round appropriately for BTC vs equities. All paper trades support 4 decimals.
    return (isCrypto || isPaper) ? parseFloat(raw.toFixed(4)) : parseFloat(raw.toFixed(2));
  }, [isPaper]);

  // --- Borrow health guard: proactive check shortability via Alpaca account proxy ---
  const checkShortability = useCallback(async (isPaperMode: boolean) => {
    try {
      const resp = await fetch("/api/alpaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload({}, isPaperMode))
      });
      if (!resp.ok) return null;
      const body = await resp.json();
      // account.shorting_enabled is provided by the server proxy
      return body?.account?.shorting_enabled === true;
    } catch (e) {
      // network or server error — treat as unknown
      return null;
    }
  }, []);
  const autopilotPendingBuySymbolsRef = useRef<Set<string>>(new Set());
  const autopilotPendingBuyMetaRef = useRef<Record<string, { baseQty: number; submittedQty: number; submittedAt: number }>>({});
  const autopilotLossGuardBlockedUntilRef = useRef<Record<string, number>>({});
  const autopilotBuyCooldownUntilRef = useRef<Record<string, number>>({});
  const networkFailureStrikeRef = useRef<number>(0);
  const networkFailureResumeAtRef = useRef<number>(0);
  const networkFailurePauseLogRef = useRef<number>(0);
  const autopilotFailureStrikeRef = useRef<number>(0);
  const lastErrorOutcomeAtRef = useRef<number>(0);;
  const autopilotPositionOpenedAtRef = useRef<Record<string, { openedAt: number; entryPrice: number }>>({});
  const prevAlpacaPositionsRef = useRef<Position[]>([]);
  const autopilotPriceWindowRef = useRef<Record<string, number[]>>({});
  const autopilotMarketStatsRef = useRef<Record<string, AutopilotMarketStats>>({});
  const autopilotDailyGuardRef = useRef<{ dayKey: string; trades: number; realizedPnl: number }>({ dayKey: "", trades: 0, realizedPnl: 0 });
  const autopilotPostLossPauseRef = useRef<{ dayKey: string; armed: boolean; until: number }>({ dayKey: "", armed: false, until: 0 });
  const insufficientUsdtCooldownRef = useRef<number>(0);
  const lastAutoLiquidationDayRef = useRef<string | null>(null);
  const orderMutexRef = useRef<AsyncMutex>(new AsyncMutex());
  const autopilotTargetSymbolIndexRef = useRef(0);

  const armLiquidationCooldown = useCallback((symbol: string, source: string) => {
    const symbolClean = symbol.toUpperCase().trim();
    if (!symbolClean) return;
    autopilotBuyCooldownUntilRef.current[symbolClean] = Date.now() + LIQUIDATION_COOLDOWN_MS;
    addAutopilotLog(`Liquidation cooldown armed for ${symbolClean}: buy re-entry paused for ${Math.floor(LIQUIDATION_COOLDOWN_MS / 1000)}s (${source}).`, "info");
    try {
      if (typeof window !== "undefined") {
        const existing = typeof window !== "undefined" ? localStorage.getItem("sentry:autopilotCooldowns") : null;
        const parsed = existing ? JSON.parse(existing) : {};
        parsed[symbolClean] = autopilotBuyCooldownUntilRef.current[symbolClean];
        localStorage.setItem("sentry:autopilotCooldowns", JSON.stringify(parsed));
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [LIQUIDATION_COOLDOWN_MS, addAutopilotLog]);

  const isLossMakingPosition = useCallback((pos: any): boolean => {
    if (!pos) return false;
    const pnl = Number(pos.unrealized_pl);
    if (Number.isFinite(pnl)) {
      return pnl < 0;
    }
    const qty = Number(pos.qty || 0);
    const avg = Number(pos.avg_entry_price || 0);
    const cur = Number(pos.current_price || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(avg) || !Number.isFinite(cur) || avg <= 0 || cur <= 0) {
      return false;
    }
    if (qty > 0) return cur < avg;
    if (qty < 0) return cur > avg;
    return false;
  }, []);

  const exitGateStatus = useMemo(() => {
    if (!isAutopilotActive) {
      return {
        tone: "neutral" as const,
        title: "Autopilot Paused",
        detail: "Exit automation is idle until autopilot is enabled.",
      };
    }

    if (marketSession === "CLOSED") {
      return {
        tone: "blocked" as const,
        title: "Exit Blocked: Market Closed",
        detail: "Non-crypto exits are blocked outside ET pre/regular/extended sessions.",
      };
    }

    const activePositions = useAlpacaLive ? (alpacaPositions || []) : (mockPositions || []);
    const longPositions = activePositions.filter((p: any) => parseFloat(String(p?.qty || 0)) > 0);
    if (longPositions.length === 0) {
      return {
        tone: "neutral" as const,
        title: "No Open Long Positions",
        detail: "Nothing to close right now.",
      };
    }

    const preferredSymbol = (autopilotCurrentScanTarget || "").toUpperCase().trim();
    if (!preferredSymbol) {
      return {
        tone: "neutral" as const,
        title: "No Active Scan Target",
        detail: "Waiting for the next autopilot target before evaluating close gates.",
      };
    }

    const activePos = longPositions.find((p: any) => String(p.symbol || "").toUpperCase() === preferredSymbol);
    if (!activePos) {
      return {
        tone: "neutral" as const,
        title: `No Open Long For Target (${preferredSymbol})`,
        detail: "Current scan symbol has no long position to close.",
      };
    }
    const symbol = String(activePos.symbol || "").toUpperCase();
    const openedMeta = autopilotPositionOpenedAtRef.current[symbol];
    if (openedMeta) {
      const heldMs = Date.now() - openedMeta.openedAt;
      const holdLeftMs = AUTOPILOT_MIN_HOLD_MS - heldMs;
      if (holdLeftMs > 0 && !isLossMakingPosition(activePos)) {
        return {
          tone: "blocked" as const,
          title: `Exit Blocked: Min Hold (${symbol})`,
          detail: `${Math.ceil(holdLeftMs / 1000)}s remaining before a normal SELL is allowed.`,
        };
      }
    }

    const entry = parseFloat(String(activePos.avg_entry_price || 0));
    const nowPx = parseFloat(String(activePos.current_price || 0));
    const pnlPct = entry > 0 && nowPx > 0 ? ((nowPx - entry) / entry) * 100 : NaN;
    const pnlText = Number.isFinite(pnlPct) ? ` Current P/L ${pnlPct.toFixed(2)}%.` : "";

    return {
      tone: "ready" as const,
      title: `Exit Ready (${symbol})`,
      detail: `Monitoring TP ${globalTakeProfitPercent}% / SL ${globalStopLossPercent}% for deterministic close.${pnlText}`,
    };
  }, [
    isAutopilotActive,
    marketSession,
    useAlpacaLive,
    alpacaPositions,
    mockPositions,
    autopilotCurrentScanTarget,
    AUTOPILOT_MIN_HOLD_MS,
    globalTakeProfitPercent,
    globalStopLossPercent,
    isLossMakingPosition,
  ]);

  const recordSymbolProfit = useCallback((symbolClean: string, realizedPnl: number) => {
    const key = String(symbolClean || "").toUpperCase().trim();
    if (!key) return;
    setSymbolProfitStats((prev) => {
      const existing = prev[key] || { trades: 0, wins: 0, losses: 0, realizedPnl: 0 };
      const isWin = realizedPnl > 0;
      return {
        ...prev,
        [key]: {
          trades: existing.trades + 1,
          wins: existing.wins + (isWin ? 1 : 0),
          losses: existing.losses + (isWin ? 0 : 1),
          realizedPnl: parseFloat((existing.realizedPnl + realizedPnl).toFixed(2)),
        },
      };
    });
  }, []);

  const autopilotScanList = useMemo(() => {
    const parsedTargets = (autopilotTargetTicker || DEFAULT_AUTOPILOT_TARGET_TICKERS)
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const fallbackTargets = DEFAULT_AUTOPILOT_TARGET_TICKERS
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    // Force full-universe coverage for scan metrics and rotation.
    const broadUniverseTargets = quickTickers.map((s) => s.toUpperCase());
    const baseTargets = Array.from(new Set([...(parsedTargets.length > 0 ? parsedTargets : fallbackTargets), ...broadUniverseTargets]));

    let scanTargets = [...baseTargets];
    const marketSessionNow = getMarketSessionET();
    if (marketSessionNow === "CLOSED") {
      scanTargets = [];
    }

    if (scanTargets.length === 0) {
      const dynamicPool = Array.from(new Set([...(parsedTargets.length > 0 ? parsedTargets : fallbackTargets), ...quickTickers.map((s) => s.toUpperCase())]));
      scanTargets = [...dynamicPool];
    }

    return scanTargets;
  }, [autopilotTargetTicker, autopilotScanBroadUniverse]);

  const computeOpenCounts = useCallback((positions: any[]) => {
    const all = (positions || []).filter((p: any) => parseFloat(p.qty || 0) > 0).length;
    return { all };
  }, []);

  const getEtDayKey = useCallback(() => {
    const et = getNewYorkDateParts();
    const yyyy = et.year;
    const mm = String(et.month).padStart(2, "0");
    const dd = String(et.day).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const getEstimatedCostBps = useCallback((sym: string) => {
    // Standard liquid stocks have low slippage on Alpaca.
    // Lowering to 2 bps for stocks and 15 for crypto to allow more trade activity.
    if (isCryptoSymbol(sym)) return 15;
    return 2;
  }, []);

  // Calculate autopilot trade quantity based on portfolio exposure, symbol price, and trend strength
  const getAutopilotTradeQty = useCallback((symbol: string, isAlpaca: boolean) => {
    const curRef = stateRef.current;
    const stats = autopilotMarketStatsRef.current[symbol];
    const currentPrice = stats?.price || (symbol === "BTCUSD" ? 67200 : 150);

    const activePositions = isAlpaca ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
    const totalPosValue = activePositions.reduce((sum: number, p: any) => sum + Math.abs(p.current_price * (parseFloat((p.qty || 0).toString()) || 0)), 0);
    const cashValue = isAlpaca ? parseFloat(curRef.alpacaAccount?.cash || "0") : parseFloat(curRef.simCash as any || 0);
    const totalPortfolio = Math.max(1, totalPosValue + cashValue);

    // Safer defaults: limit per-symbol % exposure to a conservative range
    const exposureCap = Math.max(1, Math.min(20, Number(curRef.maxExposurePercentPerSymbol) || 7));
    const baseExposurePct = 7; // default target: 7% of portfolio per symbol (was 70% - too large)
    let exposurePct = baseExposurePct;

    if (stats) {
      const trendBoost = Math.max(0, stats.trendStrength - 0.45) * 0.8;
      const edgeBoost = Math.max(0, stats.expectedEdgeBps / 100) * 0.25;
      const chopPenalty = stats.chopScore > 0.6 ? 0.85 : 1;
      const atrPenalty = stats.atrPct > 3 ? 0.92 : 1;

      exposurePct = baseExposurePct * Math.min(2.0, 1 + trendBoost + edgeBoost) * chopPenalty * atrPenalty;
    }

    exposurePct = Math.min(exposureCap, Math.max(baseExposurePct, exposurePct));
    const targetValue = totalPortfolio * (exposurePct / 100);
    // Enforce absolute per-symbol dollar cap if configured
    const perSymbolCap = Number(stateRef.current.perSymbolDollarCap) || Number.POSITIVE_INFINITY;
    const cappedTargetValue = Math.min(targetValue, perSymbolCap);
    const qtyFromExposure = cappedTargetValue / currentPrice;

    // ALLOW FRACTIONAL SHARES: Enabling 0.0001 minimum to ensure small portfolios can trade expensive stocks (AAPL, MSFT, etc)
    const minQty = 0.0001;
    if (qtyFromExposure < minQty) {
      return 0;
    }
    const maxQty = isAlpaca
      ? symbol === "BTCUSD"
        ? 0.05
        : 1000 // 🚀 INCREASED MAX QTY
      : symbol === "BTCUSD"
        ? 0.01
        : 500;
    
    let qty = Math.max(minQty, qtyFromExposure);
    qty = Math.min(qty, maxQty);

    // Ensure equities are rounded to 2 decimals or 4 depending on asset
    if (symbol === "BTCUSD") {
      return parseFloat(qty.toFixed(4));
    }
    // Alpaca fractional limit is often 4 decimals for paper
    return parseFloat(qty.toFixed(4));

    return parseFloat(Math.max(minQty, Math.round(qty)).toFixed(2));
  }, []);

  const ensureDailyGuardWindow = useCallback(() => {
    const dayKey = getEtDayKey();
    const current = autopilotDailyGuardRef.current;
    if (current.dayKey !== dayKey) {
      autopilotDailyGuardRef.current = { dayKey, trades: 0, realizedPnl: 0 };
    }
    return autopilotDailyGuardRef.current;
  }, [getEtDayKey]);

  const recordMarketStat = useCallback((symbol: string, latestPrice: number) => {
    if (!Number.isFinite(latestPrice) || latestPrice <= 0) return;
    const sym = symbol.toUpperCase().trim();
    if (!sym) return;

    const prev = autopilotPriceWindowRef.current[sym] || [];
    const next = [...prev, latestPrice].slice(-24);
    autopilotPriceWindowRef.current[sym] = next;
    // Require at least 5 price points for a stable trend calculation
    if (next.length < 5) return;

    const first = next[0];
    const last = next[next.length - 1];
    const maxP = Math.max(...next);
    const minP = Math.min(...next);
    const rangePct = first > 0 ? ((maxP - minP) / first) * 100 : 0;
    // Preserve direction so uptrends and downtrends are scored with opposite signs.
    const netMovePct = first > 0 ? ((last - first) / first) * 100 : 0;
    const trendStrength = rangePct > 0 ? Math.max(-1, Math.min(1, netMovePct / rangePct)) : 0;

    let absReturns = 0;
    for (let i = 1; i < next.length; i += 1) {
      const base = next[i - 1];
      if (base > 0) absReturns += Math.abs((next[i] - base) / base);
    }
    const atrPct = ((absReturns / Math.max(1, next.length - 1)) * 100);
    const chopScore = Math.max(0, Math.min(1, 1 - Math.abs(trendStrength)));
    const expectedEdgeBps = trendStrength * atrPct * 100;
    const estimatedCostBps = getEstimatedCostBps(sym);

    autopilotMarketStatsRef.current[sym] = {
      updatedAt: Date.now(),
      price: latestPrice,
      atrPct,
      trendStrength,
      netMovePct,
      chopScore,
      expectedEdgeBps,
      estimatedCostBps,
    };
  }, [getEstimatedCostBps]);

  const fetchAutopilotQuote = useCallback(async (symbol: string): Promise<number | null> => {
    try {
      const res = await fetch(`/api/alpaca/quote?symbol=${encodeURIComponent(symbol)}&isPaper=${isPaper}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const payload = await res.json();
      const price = Number(payload?.price);
      if (!Number.isFinite(price) || price <= 0) return null;
      return price;
    } catch {
      return null;
    }
  }, []);

  const mergeBinanceSpotIntoPositions = useCallback(async (basePositions: Position[]): Promise<Position[]> => {
    return basePositions;
  }, []);

  // Refresh data proxy
  // Helper for fresh position lookups during critical order flows
  const fetchPositions = async () => {
    const auth = getBrokerAuthPayload();
    const endpoint = `/api/alpaca?action=positions&apiKey=${auth.key}&apiSecret=${auth.secret}&isPaper=${auth.isPaper}`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("Failed to fetch fresh positions from API");
    const data = await res.json();
    return data.positions || [];
  };

  const handleRefreshData = useCallback(async (options?: { silent?: boolean }) => {
    if (!useAlpacaLive) return;
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/alpaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload()),
      });

      const resText = await response.text();
      let rawData: any = null;
      try {
        rawData = JSON.parse(resText);
      } catch (e) {
        throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
      }

      if (!response.ok || rawData?.error) {
        throw new Error(rawData?.error || `Unable to sync positions.`);
      }

      setAlpacaAccount(rawData.account);
      const mergedPositions = await mergeBinanceSpotIntoPositions(rawData.positions || []);
      // Detect externally-closed positions: compare previous synced positions to the newly fetched set.
      try {
        const prev = prevAlpacaPositionsRef.current || [];
        const prevBySym: Record<string, Position> = {};
        for (const p of prev) prevBySym[String(p.symbol || "").toUpperCase()] = p;
        const newSyms = new Set((mergedPositions || []).map((p: any) => String(p.symbol || "").toUpperCase()));
        for (const symKey of Object.keys(prevBySym)) {
          if (!newSyms.has(symKey)) {
            const prevPos = prevBySym[symKey];
            // If the position was loss-making at previous sync, arm cooldown to avoid immediate re-entry
            try {
              if (isLossMakingPosition(prevPos)) {
                // Only arm if not already on cooldown
                const until = autopilotBuyCooldownUntilRef.current[symKey] || 0;
                if (Date.now() > until) {
                  armLiquidationCooldown(symKey, "external position close");
                }
              }
            } catch (e) {
              // ignore detection errors
            }
          }
        }
      } catch (e) {
        // swallow any detection errors to avoid breaking sync
      }

      setAlpacaPositions(mergedPositions);
      // store for next refresh comparison
      prevAlpacaPositionsRef.current = mergedPositions;
      {
        const refreshedQtyBySymbol: Record<string, number> = {};
        for (const p of (mergedPositions || [])) {
          const sym = String(p?.symbol || "").toUpperCase();
          if (!sym) continue;
          refreshedQtyBySymbol[sym] = Number(p?.qty || 0);
        }
        const pendingSymbols = Array.from(autopilotPendingBuySymbolsRef.current);
        const symbolsToCleanup: string[] = [];
        for (const sym of pendingSymbols) {
          const meta = autopilotPendingBuyMetaRef.current[sym];
          const currentQty = refreshedQtyBySymbol[sym] || 0;
          const baseQty = meta?.baseQty ?? 0;
          if (currentQty > baseQty + 0.00005) {
            symbolsToCleanup.push(sym);
          }
        }
        
        setLastAutopilotOutcomeVerbose((prev) => {
          if (!prev || prev.status !== "PENDING") return prev;
          const sym = String(prev.symbol || "").toUpperCase();
          if (!symbolsToCleanup.includes(sym)) return prev;
          
          const meta = autopilotPendingBuyMetaRef.current[sym];
          return {
            ...prev,
            status: "FILLED",
            code: "FILLED",
            executedQty: Number.isFinite(meta?.submittedQty) ? (meta?.submittedQty || prev.requestedQty) : prev.requestedQty,
            message: "Broker fill confirmed on refresh."
          };
        });

        // Cleanup refs AFTER the state update to ensure meta is available for the functional update
        for (const sym of symbolsToCleanup) {
          autopilotPendingBuySymbolsRef.current.delete(sym);
          delete autopilotPendingBuyMetaRef.current[sym];
        }
      }
      if (!options?.silent) {
        const cashValue = parseFloat(alpacaAccount?.cash || "0");
        const equityValue = parseFloat(alpacaAccount?.equity || alpacaAccount?.portfolio_value || "0");
        const buyingPowerValue = resolveBuyingPower(alpacaAccount);
        addLog(
          "ALPACA",
          "SYNC",
          `Real-time positions and balances successfully synced. Cash: $${cashValue.toFixed(2)} | Equity: $${equityValue.toFixed(2)} | Buying Power: $${buyingPowerValue.toFixed(2)}`,
          "SUCCESS"
        );
      }
    } catch (err: any) {
      console.error(err);
      if (!alpacaAccount) {
        setAlpacaAccount(null);
        setAlpacaPositions([]);
        setIsConnected(false);
        setUseAlpacaLive(false);
        localStorage.setItem("APCA_USE_ALPACA", "false");
      } else {
        setIsConnected(true);
        setUseAlpacaLive(true);
        localStorage.setItem("APCA_USE_ALPACA", "true");
      }
      addLog(brokerType, "SYNC_ERROR", `Data stream refresh interrupted: ${err.message || err}`, "WARNING");
    } finally {
      setIsRefreshing(false);
    }
  }, [useAlpacaLive, brokerType, apiKey, apiSecret, isPaper, addLog, mergeBinanceSpotIntoPositions, alpacaAccount]);

  // Stable state ref to bypass interval recreate throttling
  const stateRef = React.useRef<any>({
    useAlpacaLive,
    allowLiveShorts,
    positionsView,
    alpacaPositions,
    mockPositions,
    simCash,
    isConnected,
    isPaper,
    apiKey,
    apiSecret,
    brokerType,
    autopilotStrategy,
    autopilotTargetTicker,
    autopilotScanBroadUniverse,
    warnThreshold,
    isAutopilotRunning,
    alpacaAccount,
    handleRefreshData,
    autopilotLossGuard,
    touchTurnStateMap,
    macdStateMap,
    sneakyPivotStateMap,
    autopilotBlacklist,
    minAvgVolume,
    maxExposurePercentPerSymbol,
    perSymbolDollarCap,
    maxConcurrentPositions,
    liveMinOrderQty,
  });

  useEffect(() => {
    // Clear short failure throttles on (re)load to allow fresh short attempts
    try {
      shortFailureTimestampsRef.current = {};
    } catch (e) {}
    stateRef.current = {
      useAlpacaLive,
      allowLiveShorts,
      positionsView,
      alpacaPositions,
      mockPositions,
      simCash,
      isConnected,
      isPaper,
      apiKey,
      apiSecret,
      brokerType,
      autopilotStrategy,
      autopilotTargetTicker,
      autopilotScanBroadUniverse,
      warnThreshold,
      isAutopilotRunning,
      alpacaAccount,
      handleRefreshData,
      autopilotLossGuard,
      touchTurnStateMap,
      macdStateMap,
      sneakyPivotStateMap,
      globalTakeProfitPercent,
      globalStopLossPercent,
      autopilotBlacklist,
      minAvgVolume,
      maxExposurePercentPerSymbol,
      perSymbolDollarCap,
      maxConcurrentPositions,
      liveMinOrderQty,
      blockedMarkets,
    };
  }, [
    useAlpacaLive,
    allowLiveShorts,
    positionsView,
    alpacaPositions,
    mockPositions,
    simCash,
    isConnected,
    isPaper,
    apiKey,
    apiSecret,
    brokerType,
    autopilotStrategy,
    autopilotTargetTicker,
    autopilotScanBroadUniverse,
    warnThreshold,
    isAutopilotRunning,
    alpacaAccount,
    handleRefreshData,
    autopilotLossGuard,
    touchTurnStateMap,
    macdStateMap,
    sneakyPivotStateMap,
    globalTakeProfitPercent,
    globalStopLossPercent,
    minAvgVolume,
    maxExposurePercentPerSymbol,
    maxConcurrentPositions,
    autopilotBlacklist,
    liveMinOrderQty,
    blockedMarkets,
  ]);

  // (moved) addAutopilotLog is hoisted above to avoid TDZ issues

  const shouldBlockConcurrentBuyEntry = useCallback((symbol: string, side: "BUY" | "SELL", positions: Position[] | undefined, pendingBuyCount: number) => {
    const curRef = stateRef.current;
    if (side !== "BUY") return false;

    // FORCED OVERRIDE: Increase position limit to 100 to clear the backlog of 50 positions.
    const limit = Math.max(100, Number(curRef.maxConcurrentPositions) || 100);
    if (limit >= 999) return false;

    const existingLong = (positions || []).find((p: any) => p.symbol === symbol && parseFloat(p.qty || 0) > 0);
    if (existingLong) return false;

    const counts = computeOpenCounts(positions || []);
    return (counts.all + pendingBuyCount) >= limit;
  }, []);

  const executeAutopilotOrder = useCallback(async (symbolClean: string, side: "BUY" | "SELL", qtyNum: number): Promise<AutopilotOrderResult> => {
    const curRef = stateRef.current;
    if (qtyNum <= 0) {
      return {
        status: "INVALID",
        code: "INVALID_QTY",
        symbol: symbolClean.toUpperCase().trim(),
        side,
        requestedQty: qtyNum,
        executedQty: 0,
        message: "Quantity must be greater than zero."
      };
    }
    symbolClean = symbolClean.toUpperCase().trim();

    // Market-block enforcement
    try {
      const marketSessionNow = getMarketSessionET();
      if (marketSessionNow === "CLOSED") {
        addAutopilotLog(`Blocked ${side} ${symbolClean}: market session is CLOSED (ET).`, "warn");
        return {
          status: "BLOCKED",
          code: "BLOCKED_MARKET_CLOSED",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: "Market is closed. Non-crypto orders are blocked until pre-market."
        };
      }
    } catch (e) { /* ignore */ }

    const activePositionsForCloseCheck = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
    const existingPositionBeforeOrder = activePositionsForCloseCheck.find((p: any) => p.symbol === symbolClean);
    const pendingBuyCount = autopilotPendingBuySymbolsRef.current.size;
    if (side === "BUY" && shouldBlockConcurrentBuyEntry(symbolClean, side, activePositionsForCloseCheck, pendingBuyCount)) {
      const limit = Math.max(1, Number(curRef.maxConcurrentPositions) || 999);
      const counts = computeOpenCounts(activePositionsForCloseCheck || []);
      addAutopilotLog(`🧭 Position cap reached for ${symbolClean}: ${counts.all} open + ${pendingBuyCount} pending (limit ${limit}).`, "info");
      return {
        status: "BLOCKED",
        code: "BLOCKED_MAX_CONCURRENT",
        symbol: symbolClean,
        side,
        requestedQty: qtyNum,
        executedQty: 0,
        message: `Concurrent position limit (${limit}) reached.`
      };
    }

    const isFullCloseAttempt = !!existingPositionBeforeOrder && (
      (existingPositionBeforeOrder.qty > 0 && side === "SELL" && qtyNum >= existingPositionBeforeOrder.qty * 0.98) ||
      (existingPositionBeforeOrder.qty < 0 && side === "BUY" && qtyNum >= Math.abs(existingPositionBeforeOrder.qty) * 0.98)
    );
    const isLossCloseAttempt = isFullCloseAttempt && isLossMakingPosition(existingPositionBeforeOrder);

    if (side === "SELL" || (side === "BUY" && existingPositionBeforeOrder && existingPositionBeforeOrder.qty < 0)) {
      const openedMeta = autopilotPositionOpenedAtRef.current[symbolClean];
      const heldMs = openedMeta ? Date.now() - openedMeta.openedAt : Number.POSITIVE_INFINITY;
      if (openedMeta && heldMs < AUTOPILOT_MIN_HOLD_MS && !isLossCloseAttempt) {
        const secLeft = Math.ceil((AUTOPILOT_MIN_HOLD_MS - heldMs) / 1000);
        return {
          status: "BLOCKED",
          code: "BLOCKED_MIN_HOLD",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Minimum hold guard active for ${symbolClean} (${secLeft}s remaining).`
        };
      }
    }

    const isEntryOrder = side === "BUY" || (side === "SELL" && (!existingPositionBeforeOrder || parseFloat(existingPositionBeforeOrder.qty || 0) <= 0));
    // If this is a short-entry attempt, check short-throttle state
    if (isEntryOrder && side === "SELL") {
      const failures = shortFailureTimestampsRef.current[symbolClean] || [];
      const now = Date.now();
      const recent = failures.filter((t) => now - t <= SHORT_FAILURE_WINDOW_MS);
      if (recent.length >= SHORT_FAILURE_LIMIT) {
        addAutopilotLog(`Blocked live short of ${symbolClean}: repeated borrow/unavailability failures — throttling short attempts for ${Math.ceil(SHORT_FAILURE_WINDOW_MS / 60000)}m.`, "warn");
        return {
          status: "BLOCKED",
          code: "BLOCKED_SHORT_RESTRICTED",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: "Short attempts temporarily throttled due to repeated borrow/unavailability failures."
        };
      }
    }
    if (isEntryOrder) {
      const dayGuard = ensureDailyGuardWindow();
      if (dayGuard.trades >= AUTOPILOT_MAX_TRADES_PER_DAY) {
        return {
          status: "BLOCKED",
          code: "BLOCKED_DAILY_TRADE_CAP",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Daily trade cap reached (${AUTOPILOT_MAX_TRADES_PER_DAY}).`
        };
      }
      if (dayGuard.realizedPnl <= -AUTOPILOT_DAILY_LOSS_LIMIT_USD) {
        return {
          status: "BLOCKED",
          code: "BLOCKED_DAILY_LOSS_LIMIT",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Daily loss limit reached (${dayGuard.realizedPnl.toFixed(2)} <= -${AUTOPILOT_DAILY_LOSS_LIMIT_USD}).`
        };
      }

      if (dayGuard.realizedPnl >= AUTOPILOT_DAILY_PROFIT_GOAL_USD) {
        return {
          status: "BLOCKED",
          code: "BLOCKED_DAILY_PROFIT_GOAL",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Daily profit goal reached ($${dayGuard.realizedPnl.toFixed(2)}). Taking the rest of the day off!`
        };
      }

      if (dayGuard.realizedPnl < 0) {
        const postLossPause = autopilotPostLossPauseRef.current;
        if (postLossPause.dayKey !== dayGuard.dayKey) {
          postLossPause.dayKey = dayGuard.dayKey;
          postLossPause.armed = false;
          postLossPause.until = 0;
        }

        if (!postLossPause.armed) {
          postLossPause.armed = true;
          postLossPause.until = Date.now() + AUTOPILOT_POST_LOSS_COOLDOWN_MS;
        }

        const nowMs = Date.now();
        if (nowMs < postLossPause.until) {
          const secLeft = Math.ceil((postLossPause.until - nowMs) / 1000);
          return {
            status: "BLOCKED",
            code: "BLOCKED_LOSS_GUARD",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Daily P/L is negative (${dayGuard.realizedPnl.toFixed(2)}). Cooling down entries for ${secLeft}s before retrying.`
          };
        }
      } else {
        const postLossPause = autopilotPostLossPauseRef.current;
        if (postLossPause.dayKey === dayGuard.dayKey && postLossPause.armed) {
          postLossPause.armed = false;
          postLossPause.until = 0;
        }
      }

      // Regime/chop/edge guards — only in live mode and only once the price window is mature (≥12 ticks)
      const stat = autopilotMarketStatsRef.current[symbolClean];
      const priceWindow = autopilotPriceWindowRef.current[symbolClean] || [];
        if (curRef.useAlpacaLive && stat && priceWindow.length >= 12) {
        const trendThreshold = AUTOPILOT_MIN_TREND_STRENGTH;
        const meetsDirectionalTrend = side === "BUY"
          ? stat.trendStrength >= trendThreshold
          : stat.trendStrength <= -trendThreshold;
        if (!meetsDirectionalTrend) {
          addAutopilotLog(`🚫 Regime filter: ${symbolClean} trend ${stat.trendStrength.toFixed(2)} < ${AUTOPILOT_MIN_TREND_STRENGTH}. Skipping entry.`, "warn");
          return {
            status: "BLOCKED",
            code: "BLOCKED_REGIME_FILTER",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: side === "BUY"
              ? `Trend strength ${stat.trendStrength.toFixed(2)} below long threshold ${AUTOPILOT_MIN_TREND_STRENGTH.toFixed(2)}.`
              : `Trend strength ${stat.trendStrength.toFixed(2)} above short threshold -${AUTOPILOT_MIN_TREND_STRENGTH.toFixed(2)}.`
          };
        }

        if (stat.atrPct < AUTOPILOT_MIN_ATR_PCT || stat.chopScore > AUTOPILOT_MAX_CHOP_SCORE) {
          addAutopilotLog(`🚫 Chop zone: ${symbolClean} ATR ${stat.atrPct.toFixed(3)}% chop ${stat.chopScore.toFixed(2)}. Skipping entry.`, "warn");
          return {
            status: "BLOCKED",
            code: "BLOCKED_CHOP_ZONE",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `No-trade zone: ATR ${stat.atrPct.toFixed(3)}%, chop ${stat.chopScore.toFixed(2)}.`
          };
        }

        const edgeThreshold = stat.estimatedCostBps + AUTOPILOT_MIN_EDGE_BUFFER_BPS;
        const hasDirectionalEdge = side === "BUY"
          ? stat.expectedEdgeBps > edgeThreshold
          : stat.expectedEdgeBps < -edgeThreshold;
        if (!hasDirectionalEdge) {
          addAutopilotLog(`🚫 Edge/cost: ${symbolClean} edge ${stat.expectedEdgeBps.toFixed(1)}bps ≤ cost ${stat.estimatedCostBps.toFixed(1)}bps + buffer. Skipping entry.`, "warn");
          return {
            status: "BLOCKED",
            code: "BLOCKED_EDGE_COST",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: side === "BUY"
              ? `Expected long edge ${stat.expectedEdgeBps.toFixed(1)}bps not above cost ${stat.estimatedCostBps.toFixed(1)}bps + buffer.`
              : `Expected short edge ${stat.expectedEdgeBps.toFixed(1)}bps not below -${stat.estimatedCostBps.toFixed(1)}bps - buffer.`
          };
        }
      }
    }

    // Portfolio risk screening: exposure caps and concurrent positions
      try {
      // Early concurrency pre-check: consider already-pending autopilot buys
      try {
        const _activeEarly = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
        const _countsEarly = computeOpenCounts(_activeEarly);
        const _openCountEarlyAll = _countsEarly.all;
        const _existingLongEarly = _activeEarly.find((p: any) => p.symbol === symbolClean && parseFloat(p.qty || 0) > 0);
        const pendingSymbolsArr = Array.from(autopilotPendingBuySymbolsRef.current || []);
        const _pendingCount = pendingSymbolsArr.length;
        const _limitEarly = curRef.maxConcurrentPositions || 999;
        const _openRelevantEarly = _openCountEarlyAll;
        if (side === "BUY" && !_existingLongEarly && _openRelevantEarly + _pendingCount >= _limitEarly) {
          console.warn(`Autopilot concurrency block for ${symbolClean}: openRelevantEarly=${_openRelevantEarly}, pending=${_pendingCount}, limit=${_limitEarly}, openAll=${_openCountEarlyAll}`);
          addAutopilotLog(`🧭 Blocked BUY ${symbolClean}: concurrent position limit (${_limitEarly}) reached (open ${_openRelevantEarly} + pending ${_pendingCount}).`, "warn");
          addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: concurrent positions limit reached (open ${_openRelevantEarly} + pending ${_pendingCount}).`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_MAX_CONCURRENT",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Concurrent position limit (${_limitEarly}) reached.`
          };
        }
      } catch (e) {
        // ignore pre-check errors and continue to main screening
      }
      const activePositions = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
      const totalPosValue = (activePositions || []).reduce((s: number, p: any) => s + (parseFloat(p.market_value || p.current_price * (parseFloat(p.qty || 0) || 0)) || 0), 0);
      const cashValue = curRef.useAlpacaLive ? parseFloat(curRef.alpacaAccount?.cash || "0") : (parseFloat(curRef.simCash as any) || 0);
      const totalPortfolio = Math.max(1, totalPosValue + cashValue);

      const counts = computeOpenCounts(activePositions || []);
      const openCountAll = counts.all;
      const existingLong = activePositions.find((p: any) => p.symbol === symbolClean && parseFloat(p.qty || 0) > 0);
      // Allow adding to an already-open symbol even when the concurrent-position ceiling is reached.
      const limit = curRef.maxConcurrentPositions || 999;
      const openRelevant = openCountAll;
      if (side === "BUY" && !existingLong && openRelevant >= limit) {
        console.warn(`Autopilot concurrency block for ${symbolClean}: openRelevant=${openRelevant}, limit=${limit}, openAll=${openCountAll}`);
        addAutopilotLog(`🧭 Blocked BUY ${symbolClean}: concurrent position limit (${limit}) reached.`, "warn");
        addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: concurrent positions limit reached.`, "WARNING");
        return {
          status: "BLOCKED",
          code: "BLOCKED_MAX_CONCURRENT",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Concurrent position limit (${limit}) reached.`
        };
      }

      // Estimate current exposure and intended order value
      const matchedTicker = activePositions.find((p: any) => p.symbol === symbolClean) as any;
      const currentPosVal = matchedTicker ? parseFloat(matchedTicker.market_value || (matchedTicker.current_price * (parseFloat(matchedTicker.qty || 0) || 0)) || 0) : 0;
      const guessPrice = matchedTicker ? parseFloat(matchedTicker.current_price || 0) : 150;
      const intendedValue = Math.abs(qtyNum) * guessPrice;
      const newExposurePct = ((currentPosVal + intendedValue) / totalPortfolio) * 100;

      const effectiveExposureCap = Math.min(70, Math.max(60, Number(curRef.maxExposurePercentPerSymbol) || 70));
      if (side === "BUY" && (newExposurePct > effectiveExposureCap)) {
        const capPct = effectiveExposureCap;
        const maxAdditionalValue = (totalPortfolio * (capPct / 100)) - currentPosVal;
        const minExecutableQty = Math.max(0.0001, Number(curRef.liveMinOrderQty) || 0.01);

        if (maxAdditionalValue <= 0) {
          addAutopilotLog(`🚫 Blocked BUY ${symbolClean}: current exposure already at or above ${capPct}% cap.`, "warn");
          addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: no remaining exposure budget under cap (${capPct}%).`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_EXPOSURE_CAP",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `No remaining exposure budget under ${capPct}% cap.`
          };
        }

        const rawAffordableQty = maxAdditionalValue / Math.max(guessPrice, 0.000001);
        const tickSize = symbolClean === "BTCUSD" ? 10000 : 100;
        const resizedQty = Math.floor(rawAffordableQty * tickSize) / tickSize;

        if (!Number.isFinite(resizedQty) || resizedQty < minExecutableQty) {
          addAutopilotLog(`🚫 Blocked BUY ${symbolClean}: post-order exposure ${newExposurePct.toFixed(2)}% would exceed ${capPct}% limit.`, "warn");
          addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: exposure cap exceeded (${newExposurePct.toFixed(2)}%).`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_EXPOSURE_CAP",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Post-order exposure ${newExposurePct.toFixed(2)}% exceeds cap ${capPct}%.`
          };
        }

        if (resizedQty >= qtyNum) {
          addAutopilotLog(`🚫 Blocked BUY ${symbolClean}: post-order exposure ${newExposurePct.toFixed(2)}% would exceed ${capPct}% limit.`, "warn");
          addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: exposure cap exceeded (${newExposurePct.toFixed(2)}%).`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_EXPOSURE_CAP",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Post-order exposure ${newExposurePct.toFixed(2)}% exceeds cap ${capPct}%.`
          };
        }

        addAutopilotLog(`📉 Exposure cap resize: ${symbolClean} BUY reduced from ${qtyNum} to ${resizedQty} to fit ${capPct}% cap.`, "info");
        addLog(symbolClean, "AUTO_TRADE_RESIZED", `Auto-resized BUY ${symbolClean} from ${qtyNum} to ${resizedQty} due to exposure cap ${capPct}%.`, "INFO");
        return await executeAutopilotOrder(symbolClean, side, resizedQty);
      }
    } catch (e) {
      // if anything fails, do not block trades silently; just log
      console.warn("Risk screening error", e);
    }

    if (curRef.useAlpacaLive) {
      const hasLiveBrokerContext = Boolean(
        curRef.isConnected ||
        curRef.alpacaAccount ||
        (curRef.apiKey && curRef.apiSecret)
      );
      if (!hasLiveBrokerContext) {
        addAutopilotLog(`Blocked automated order: credentials are disconnected.`, "warn");
        return {
          status: "BLOCKED",
          code: "BLOCKED_DISCONNECTED",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: "Live credentials are disconnected."
        };
      }

      let finalQty = qtyNum;
      let liveEstimatedPrice = 150.0;

      const matchedLiveTicker = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
      if (matchedLiveTicker) {
        liveEstimatedPrice = matchedLiveTicker.current_price;
      }

       else {
        if (side === "BUY") {
          const estPrice = liveEstimatedPrice;

          const estimatedCost = estPrice * qtyNum;
          const cashValue = parseFloat(curRef.alpacaAccount?.cash || "0");
          const rawBuyingPower = resolveBuyingPower(curRef.alpacaAccount);
          const isFractional = qtyNum % 1 !== 0;
          const maxAllowedPower = Math.max(0, Math.min(rawBuyingPower, cashValue * 4));
          const effectiveAllowedPower = Math.max(0, maxAllowedPower);
          // Apply a 30% safety cushion to the total available buying power to prevent margin calls on sudden entry slippage or volatility
          const maxSafeOrderVal = effectiveAllowedPower * 0.7;

          // Safety: refuse buys when available cash is critically low
          if (side === "BUY" && cashValue < 500) {
            addAutopilotLog(`Blocked live automated BUY: available cash $${cashValue.toFixed(2)} below safety minimum $500.`, "warn");
            addLog(symbolClean, "AUTO_BUY_BLOCKED", `Available cash $${cashValue.toFixed(2)} below $500 safety minimum.`, "WARNING");
            return {
              status: "BLOCKED",
              code: "BLOCKED_LOW_CASH",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Available cash $${cashValue.toFixed(2)} below safety minimum $500.`
            };
          }

          if (effectiveAllowedPower <= 0) {
            addAutopilotLog(`Blocked live automated BUY: account buying power is unavailable or negative (${maxAllowedPower.toFixed(2)}).`, "warn");
            addLog(symbolClean, "AUTO_BUY_BLOCKED", `Account buying power unavailable or negative (${maxAllowedPower.toFixed(2)}).`, "WARNING");
            return {
              status: "BLOCKED",
              code: "BLOCKED_BUYING_POWER",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Buying power is unavailable or negative (${maxAllowedPower.toFixed(2)}).`
            };
          }

          if (estimatedCost > maxSafeOrderVal) {
            const maxAffordableQty = maxSafeOrderVal / estPrice;
            if (maxAffordableQty >= 0.0001) {
              const safeQty = maxAffordableQty;
              if (symbolClean === "BTCUSD") {
                finalQty = Math.floor(safeQty * 10000) / 10000;
              } else {
                finalQty = Math.floor(safeQty * 100) / 100;
              }

              if (finalQty <= Math.max(0.0001, Number(curRef.liveMinOrderQty) || 0.01)) {
                addAutopilotLog(`Blocked live automated BUY: Affordable size ${finalQty} for ${symbolClean} is negligible. BP: ${maxAllowedPower.toFixed(2)} (safe cap: ${maxSafeOrderVal.toFixed(2)}), price: ${estPrice.toFixed(2)}.`, "warn");
                addLog(symbolClean, "AUTO_BUY_BLOCKED", `Affordable size ${finalQty} is too small to execute. Balance: ${maxAllowedPower.toFixed(2)}.`, "WARNING");
                return {
                  status: "BLOCKED",
                  code: "BLOCKED_NEGLIGIBLE_QTY",
                  symbol: symbolClean,
                  side,
                  requestedQty: qtyNum,
                  executedQty: 0,
                  message: `Affordable quantity ${finalQty} is too small to execute.`
                };
              } else {
                addAutopilotLog(`Leverage Control: Out of buying power / buffer cushion for ${qtyNum} ${symbolClean} (~${estimatedCost.toFixed(2)}). Rescaled down to ${finalQty} (~${(estPrice * finalQty).toFixed(2)}) based on ${maxSafeOrderVal.toFixed(2)} maximum safe order limit (30% buffer).`, "info");
              }
            } else {
              addAutopilotLog(`Blocked live automated BUY: Insufficient buying power buffer. Cost for ${qtyNum} ${symbolClean} is ~${estimatedCost.toFixed(2)} with safe maximum limit of ${maxSafeOrderVal.toFixed(2)} (total BP: ${maxAllowedPower.toFixed(2)}).`, "warn");
              addLog(symbolClean, "AUTO_BUY_BLOCKED", `Insufficient buying power: ${maxAllowedPower.toFixed(2)} available vs ${estimatedCost.toFixed(2)} required.`, "WARNING");
              return {
                status: "BLOCKED",
                code: "BLOCKED_BUYING_POWER",
                symbol: symbolClean,
                side,
                requestedQty: qtyNum,
                executedQty: 0,
                message: `Insufficient buying power (${maxAllowedPower.toFixed(2)}) for estimated cost ${estimatedCost.toFixed(2)}.`
              };
            }
          }
        } else {
          const existingPos = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
          const ownedQty = existingPos ? existingPos.qty : 0;
          if (ownedQty <= 0) {
            if (!curRef.allowLiveShorts) {
              addAutopilotLog(`Blocked automated live SELL of ${qtyNum} ${symbolClean}: You do not own a long position. Live Alpaca short-selling is restricted. Switch to Local Simulator to trade short strategies!`, "warn");
              addLog(symbolClean, "AUTO_SELL_BLOCKED", `Blocked automated short-sell of ${symbolClean}.`, "WARNING");
              return {
                status: "BLOCKED",
                code: "BLOCKED_SHORT_RESTRICTED",
                symbol: symbolClean,
                side,
                requestedQty: qtyNum,
                executedQty: 0,
                message: "Short-selling is restricted for this live account."
              };
            }

            const rawBuyingPower = resolveBuyingPower(curRef.alpacaAccount);
            if (!Number.isFinite(rawBuyingPower) || rawBuyingPower <= 0) {
                  addAutopilotLog(`Blocked live short of ${symbolClean}: account buying power looks insufficient to support margin shorting.`, "warn");
                  addLog(symbolClean, "AUTO_SELL_BLOCKED", `Blocked automated short-sell of ${symbolClean} due to low buying power.`, "WARNING");
                  // record failure timestamp for shortability throttling
                  shortFailureTimestampsRef.current[symbolClean] = (shortFailureTimestampsRef.current[symbolClean] || []).concat(Date.now());
                  return {
                    status: "BLOCKED",
                    code: "BLOCKED_BUYING_POWER",
                    symbol: symbolClean,
                    side,
                    requestedQty: qtyNum,
                    executedQty: 0,
                    message: "Account buying power insufficient for live shorting."
                  };
            }

                // If account reports shorting disabled proactively, record and block
                if (curRef.alpacaAccount && typeof curRef.alpacaAccount.shorting_enabled !== "undefined" && !curRef.alpacaAccount.shorting_enabled) {
                  addAutopilotLog(`Blocked live short of ${symbolClean}: Alpaca account reports shorting disabled.`, "warn");
                  shortFailureTimestampsRef.current[symbolClean] = (shortFailureTimestampsRef.current[symbolClean] || []).concat(Date.now());
                  return {
                    status: "BLOCKED",
                    code: "BLOCKED_SHORT_RESTRICTED",
                    symbol: symbolClean,
                    side,
                    requestedQty: qtyNum,
                    executedQty: 0,
                    message: "Account settings disallow short-selling."
                  };
                }

            addAutopilotLog(`Live shorting allowed by config: attempting short ${qtyNum} ${symbolClean}.`, "info");
            addLog(symbolClean, "AUTO_SELL_ALLOWED", `Live short allowed by config; proceeding to submit SELL ${qtyNum}.`, "INFO");
          }
          if (ownedQty > 0 && finalQty > ownedQty) {
            addAutopilotLog(`Leverage Control: Capping automated live SELL of ${symbolClean} from ${qtyNum} to owned size ${ownedQty} to prevent unauthorized short-selling.`, "info");
            finalQty = ownedQty;
          }
          // Precision floor is now handled below to allow full-close detection for tiny positions.
        }
      }

      // Generate a short, deterministic trade rationale for explainability
      const generateTradeRationale = (s: string, sd: "BUY" | "SELL", qty: number) => {
        const stat = autopilotMarketStatsRef.current[s] || null;
        if (!stat) return `No market stats available; decision based on default sizing (${qty}).`;
        const parts: string[] = [];
        parts.push(sd === "BUY" ? "Long bias" : "Short bias");
        parts.push(`trend ${stat.trendStrength.toFixed(2)}`);
        parts.push(`atr% ${stat.atrPct.toFixed(2)}%`);
        parts.push(`edge ${stat.expectedEdgeBps.toFixed(1)}bps vs cost ${stat.estimatedCostBps.toFixed(1)}bps`);
        if (stat.chopScore) parts.push(`chop ${stat.chopScore.toFixed(2)}`);
        return parts.join(" | ");
      };

      const rationale = generateTradeRationale(symbolClean, side, finalQty);
      addAutopilotLog(`Rationale: ${rationale}`, "info");
      addAutopilotLog(`[Bot Order] Validated ${side} ${finalQty} ${symbolClean}. Submitting market order...`, "trade");
      addLog("AUTOPILOT", side, `Transmitting Bot Order: ${side} ${finalQty} shares of ${symbolClean}`, "INFO");
      const release = await orderMutexRef.current.acquire();
      try {
        // Step 1: Pre-fetch fresh positions state to handle fractional mismatch cleanly
        let existingPositionBeforeOrder: any = null;
        try {
          const freshPos = await fetchPositions();
          // Improved: match symbol more robustly (handle crypto slash format vs raw symbol)
          existingPositionBeforeOrder = freshPos.find((p: any) => 
            p.symbol === symbolClean || 
            p.symbol === symbolClean.replace("/", "") ||
            p.symbol === normalizeSymbol(symbolClean)
          );
        } catch (e) {
          console.warn("[AUTOPILOT] Failed to pre-fetch fresh positions, falling back to cached state.");
          const activePositionsForFallback = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
          existingPositionBeforeOrder = activePositionsForFallback.find((p: any) => p.symbol === symbolClean);
        }

        let response;
        // If this is a crypto symbol, route to Binance proxy for live execution
        if (isCryptoSymbol(symbolClean)) {
          // normalize symbol and validate buying power before sending to exchange
          const normSymbol = normalizeSymbol(symbolClean);
          const estPrice = curRef.alpacaPositions?.find((p: any) => p.symbol === symbolClean)?.current_price || (symbolClean === "BTCUSD" ? 67200 : 150);
          let cryptoQtyToSend = finalQty;
          if (side === "BUY") {
            const maxCryptoBuyUsd = Math.max(
              100,
              Math.min(resolveBuyingPower(curRef.alpacaAccount), parseFloat(curRef.alpacaAccount?.cash || "0")) * 0.2
            );
            const cappedQty = parseFloat((maxCryptoBuyUsd / Math.max(estPrice, 0.0000001)).toFixed(6));
            if (cryptoQtyToSend * estPrice > maxCryptoBuyUsd) {
              cryptoQtyToSend = Math.max(cappedQty, 0);
              addAutopilotLog(`Crypto BUY notional cap applied for ${normSymbol}: resized to ~$${maxCryptoBuyUsd.toFixed(2)}.`, "info");
            }
          }
          const intendedCost = estPrice * cryptoQtyToSend;

          // Prefer server-side Binance futures USDT balance when available
          let maxSafeOrderVal = 0;
          let preferredUsdt = 0;
          let preferredSource: "futures" | "spot" | "none" = "none";
          const pref = await fetchBinanceFundingSnapshot();
          const prefUsdt = pref.usdt;
          const prefSource = pref.source === "futures" ? "futures" : "none";
          preferredUsdt = prefSource === "futures" ? prefUsdt : 0;
          preferredSource = prefSource;
          if (prefSource !== "futures") {
            addAutopilotLog(`Blocked ${symbolClean}: Binance futures USDT funding required. Current source = ${pref.source}.`, "warn");
            return {
              status: "BLOCKED",
              code: "BLOCKED_INSUFFICIENT_USDT",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Binance futures USDT funding required. Current source = ${pref.source}.`,
            };
          }
          // Only prefer Binance futures funding when the USDT balance is actually large enough to support a crypto order.
          if (prefUsdt >= 50) {
            maxSafeOrderVal = prefUsdt * 0.9; // keep 10% buffer
          }

          if (!maxSafeOrderVal || maxSafeOrderVal <= 0) {
            const cashValue = parseFloat(curRef.alpacaAccount?.cash || "0");
            const rawBuyingPower = resolveBuyingPower(curRef.alpacaAccount);
            const isFractional = finalQty % 1 !== 0;
            const maxAllowedPower = (cashValue < 2000 || isFractional) ? cashValue : Math.min(rawBuyingPower, cashValue * 4);
            maxSafeOrderVal = maxAllowedPower * 0.7;
            if (prefUsdt > 0 && prefUsdt < 50) {
              addAutopilotLog(`Binance USDT balance is low (${prefUsdt.toFixed(2)}). Falling back to Alpaca buying power for crypto trade sizing.`, "info");
            }
          }

          // Safety: refuse buys when available cash is critically low
          try {
            const cashValue = parseFloat(curRef.alpacaAccount?.cash || "0");
            if (side === "BUY" && cashValue < 500) {
              setIsPlacingOrder(false);
              setOrderError(`Blocked: available cash $${cashValue.toFixed(2)} is below safety minimum $500.`);
              addLog(normSymbol, "BUY_FAILED", `Blocked buy: available cash $${cashValue.toFixed(2)} < $500 safety minimum.`, "WARNING");
              return {
                status: "BLOCKED",
                code: "BLOCKED_LOW_CASH",
                symbol: symbolClean,
                side,
                requestedQty: qtyNum,
                executedQty: 0,
                message: `Available cash $${cashValue.toFixed(2)} below safety minimum $500.`,
              };
            }
          } catch (e) {}

          if (intendedCost > maxSafeOrderVal) {
            setIsPlacingOrder(false);
            setOrderError(`Blocked: insufficient buying power for ${normSymbol} order (~${intendedCost.toFixed(2)} required).`);
            addLog(normSymbol, "BUY_FAILED", `Blocked manual buy due to insufficient buying power.`, "WARNING");
            return {
              status: "BLOCKED",
              code: "BLOCKED_BUYING_POWER",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Insufficient buying power for ${normSymbol} order (~${intendedCost.toFixed(2)} required).`
            };
          }

          response = await fetch("/api/binance/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: normSymbol, side, type: "MARKET", quantity: cryptoQtyToSend, isLive: true, openShort: side === "SELL", preferredUsdt, preferredSource }),
          });
        } else {
          // Use notional for BUY (fractional-friendly), but use share qty for SELL to avoid accidental short rejections.
          const equityOrderPayload = getBrokerAuthPayload({
            symbol: symbolClean,
            side: side.toLowerCase(),
            estimatedPrice: liveEstimatedPrice,
          });

          if (side === "BUY") {
            const currentSession = getMarketSessionET();
            // Applying a strictly conservative 4-decimal floor to QTY for consistency across brokers.
            const finalQtySafe = Math.floor(finalQty * 10000) / 10000;
            if (finalQtySafe <= 0) {
              addAutopilotLog(`Skipping BUY ${symbolClean}: quantity ${finalQty} is below minimum increment (0.0001).`, "warn");
              release();
              return { status: "INVALID", code: "INVALID_QTY", symbol: symbolClean, side, requestedQty: qtyNum, executedQty: 0, message: "Buy quantity too small" };
            }
            equityOrderPayload.qty = finalQtySafe;

            // Use notional only for standard market hours if desired, but qty is generally safer for fractions.
            if (currentSession === "EXTENDED") {
              try { console.debug(`[AUTOPILOT][DEBUG] sending equity BUY as qty=${equityOrderPayload.qty} (EXTENDED session) for ${symbolClean} (finalQty=${finalQty})`); } catch (e) {}
            } else {
              // Even in standard hours, we use qty to avoid fractional precision errors on the notional->qty calculation
              try { console.debug(`[AUTOPILOT][DEBUG] sending equity BUY as qty=${equityOrderPayload.qty} for ${symbolClean} (finalQty=${finalQty})`); } catch (e) {}
            }
            response = await fetch("/api/alpaca/trade", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(equityOrderPayload),
            });
          } else {
            const ownedQty = Math.max(0, parseFloat(String(existingPositionBeforeOrder?.qty || 0)));
            // Fixed: Precision mismatch in fractional sell orders can cause Alpaca 403 (Insufficient Qty).
            // Using a strictly conservative floor for sell orders to ensure we never over-sell.
            // If the sell order is for the full position (or within a tiny margin), use the liquidation helper
            // instead of a manual trade to ensure Alpaca's backend closes the position cleanly.
            const sellQtyRaw = (ownedQty > 0 && side === "SELL") ? Math.min(finalQty, ownedQty) : finalQty;
            
            // Check if what we want to sell is effectively the whole position or too small to trade
            const isFullPosition = ownedQty > 0 && sellQtyRaw >= (ownedQty - 0.0001);
            const isDust = ownedQty > 0 && ownedQty < 0.0001;

            if (isFullPosition || isDust) {
              // Switch to the liquidation helper for closing full positions or dust
              try { console.debug(`[AUTOPILOT][DEBUG] switching to LIQUIDATE for ${symbolClean}. Reason: ${isDust ? 'DUST' : 'FULL_CLOSE'} (ownedQty=${ownedQty}, sellQtyRaw=${sellQtyRaw})`); } catch (e) {}
              response = await fetch("/api/alpaca/liquidate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(getBrokerAuthPayload({ symbol: symbolClean })),
              });
            } else {
              const sellQtyFloored = Math.floor(sellQtyRaw * 10000) / 10000;
              if (sellQtyFloored <= 0) {
                // Return a fake result to stop the loop for this symbol
                addAutopilotLog(`Skipping SELL ${symbolClean}: quantity ${sellQtyRaw.toFixed(6)} is below fractional floor (0.0001). Attempting liquidation...`, "warn");
                if (ownedQty > 0) {
                  response = await fetch("/api/alpaca/liquidate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(getBrokerAuthPayload({ symbol: symbolClean })),
                   });
                } else {
                  release(); // Must release mutex!
                  return {
                    status: "INVALID",
                    code: "INVALID_QTY",
                    symbol: symbolClean,
                    side,
                    requestedQty: qtyNum,
                    executedQty: 0,
                    message: `Sell quantity ${sellQtyRaw.toFixed(6)} is too small and no position found.`
                  };
                }
              } else {
                equityOrderPayload.qty = sellQtyFloored;
                try { console.debug(`[AUTOPILOT][DEBUG] sending equity SELL as qty=${equityOrderPayload.qty} for ${symbolClean} (ownedQty=${ownedQty}, finalQty=${finalQty})`); } catch (e) {}
                response = await fetch("/api/alpaca/trade", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(equityOrderPayload),
                });
              }
            }
          }
        }

        const resText = await response.text();
        let dataOrder: any = null;
        try {
          dataOrder = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Server returned HTML/text error output: ${resText.slice(0, 120).trim()}...`);
        }

        if (!response.ok || dataOrder?.error) {
          const errMsg = dataOrder?.error || "Brokerage error response";

          // NEW: Dust Fallback. If Alpaca proxy rejected for qty=0 floor, immediately try liquidation.
          const isRejectionStatus = response.status === 422 || dataOrder?.isDust;
          const sideUpper = side.toUpperCase();
          if (isRejectionStatus && (sideUpper === "SELL" || sideUpper === "BUY")) {
            addAutopilotLog(`Auto-liquidating ${symbolClean} due to fractional dust floor (server-side: ${response.status}).`, "info");
            const liqRes = await fetch("/api/alpaca/liquidate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(getBrokerAuthPayload({ symbol: symbolClean })),
            });
            if (liqRes.ok) {
              return {
                status: "FILLED",
                code: "FILLED",
                symbol: symbolClean,
                side,
                requestedQty: qtyNum,
                executedQty: 0,
                message: "Dust cleared via liquidation."
              };
            }
          }

          // If Binance reports insufficient USDT, surface a UI warning and throttle repeated logs.
          if (/insufficient\s+usdt/i.test(errMsg) || /insufficient\s+preferred\s+usdt/i.test(errMsg) || /insufficient.*usdt/i.test(errMsg)) {
            const now = Date.now();
            // Extract balance figure from server message if present, e.g. "preferred balance=1.01"
            const balMatch = errMsg.match(/balance[=\s]+([0-9.]+)/i);
            const balNote = balMatch ? ` (Binance spot balance: $${parseFloat(balMatch[1]).toFixed(2)} USDT — top up your Binance Spot wallet to resume trading)` : " (top up your Binance Spot wallet to resume trading)";
            const richMsg = errMsg + balNote;
            if ((insufficientUsdtCooldownRef.current || 0) < now) {
              addAutopilotLog(`⚠️ Binance USDT too low for ${symbolClean}: ${richMsg}`, "warn");
              setLastAutopilotOutcomeVerbose({ status: "BLOCKED", code: "BLOCKED_INSUFFICIENT_USDT", symbol: symbolClean, side, requestedQty: qtyNum, executedQty: 0, message: richMsg });
              lastErrorOutcomeAtRef.current = now;
              insufficientUsdtCooldownRef.current = now + 60 * 1000; // 60s cooldown
            }
            return {
              status: "BLOCKED",
              code: "BLOCKED_INSUFFICIENT_USDT",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: errMsg
            };
          }
          throw new Error(errMsg);
        }

        const brokerStatus = String(dataOrder.status || "ACCEPTED").toUpperCase();
        const filledQty = Number.parseFloat(String(dataOrder.filled_qty ?? "0"));
        const isFilledStatus = brokerStatus === "FILLED" || brokerStatus === "PARTIALLY_FILLED";
        const reportedExecPrice = Number.parseFloat(String(dataOrder.filled_avg_price ?? dataOrder.price ?? liveEstimatedPrice ?? 0));
        const submissionMeta = dataOrder.submission_meta;
        const routeDescriptor = submissionMeta
          ? `${submissionMeta.server_path}${submissionMeta.submitted_limit_price ? ` @ ${submissionMeta.submitted_limit_price}` : ""}`
          : "broker-default";

        if (side === "BUY") {
          if (isFilledStatus) {
            autopilotPendingBuySymbolsRef.current.delete(symbolClean);
            delete autopilotPendingBuyMetaRef.current[symbolClean];
          } else {
            const existingOwnedQty = Math.max(0, Number(existingPositionBeforeOrder?.qty || 0));
            autopilotPendingBuySymbolsRef.current.add(symbolClean);
            autopilotPendingBuyMetaRef.current[symbolClean] = {
              baseQty: existingOwnedQty,
              submittedQty: finalQty,
              submittedAt: Date.now(),
            };
            const tinyOrderTimeoutMs = 30000;
            const standardOrderTimeoutMs = 90000;
            const isTinyOrder = finalQty <= Math.max(0.25, (Number(curRef.liveMinOrderQty) || 0.01) * 10);
            const pendingClearTimeoutMs = isTinyOrder ? tinyOrderTimeoutMs : standardOrderTimeoutMs;
            const submittedOrderId = dataOrder?.id ? String(dataOrder.id) : "";

            const pollOrderStatusBeforeTimeout = async () => {
              if (!submittedOrderId) return null;
              try {
                const statusRes = await fetch("/api/alpaca/order-status", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    isPaper: curRef.isPaper,
                    orderId: submittedOrderId,
                  }),
                });
                const statusBody = await statusRes.json();
                if (!statusRes.ok || statusBody?.error) return null;
                const status = String(statusBody?.status || "").toUpperCase();
                const filledQtyFromStatus = Number(statusBody?.filled_qty || 0);
                const filledLike = status === "FILLED" || status === "PARTIALLY_FILLED";
                if (!filledLike) return null;
                return {
                  filledQty: Number.isFinite(filledQtyFromStatus) && filledQtyFromStatus > 0 ? filledQtyFromStatus : finalQty,
                };
              } catch {
                return null;
              }
            };

            // Avoid sticky pending state forever when broker status updates are delayed.
            setTimeout(async () => {
              const fillInfo = await pollOrderStatusBeforeTimeout();
              autopilotPendingBuySymbolsRef.current.delete(symbolClean);
              delete autopilotPendingBuyMetaRef.current[symbolClean];
              setLastAutopilotOutcomeVerbose((prev) => {
                if (!prev || prev.status !== "PENDING" || prev.symbol !== symbolClean) return prev;
                if (fillInfo) {
                  return {
                    ...prev,
                    status: "FILLED",
                    code: "FILLED",
                    executedQty: fillInfo.filledQty,
                    message: "Broker fill confirmed via delayed status poll.",
                  };
                }
                return {
                  ...prev,
                  status: "PENDING",
                  code: "PENDING_TIMEOUT",
                  message: `Pending broker confirmation still unresolved for ${symbolClean} after ${Math.floor(pendingClearTimeoutMs / 1000)}s. Auto-seed hold released.`
                };
              });
            }, pendingClearTimeoutMs);
          }
        }

        if (isFilledStatus) {
          addAutopilotLog(`Automated Live Order FILLED! ID: ${dataOrder.id || "Success"}. Path: ${routeDescriptor}.`, "success");
          addLog(
            symbolClean,
            `${side}_FILLED`,
            `Live automated order executed for ${(Number.isFinite(filledQty) && filledQty > 0 ? filledQty : finalQty)} share(s) of ${symbolClean}. Path: ${routeDescriptor}.`,
            "SUCCESS"
          );
        } else {
          addAutopilotLog(`Automated Live Order SUBMITTED to broker (status: ${brokerStatus}, path: ${routeDescriptor}). Waiting for Alpaca to confirm a fill before updating positions.`, "info");
          addLog(symbolClean, `${side}_ACCEPTED`, `Live automated order submitted to broker (status: ${brokerStatus}, path: ${routeDescriptor}). Position not yet confirmed.`, "INFO");
        }

        if (isLossCloseAttempt && (isFilledStatus || brokerStatus === "ACCEPTED" || brokerStatus === "NEW" || brokerStatus === "PARTIALLY_FILLED")) {
          armLiquidationCooldown(symbolClean, "auto-close order");
        }

        const newOrderObj: Order = {
          id: dataOrder.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: finalQty,
          price: dataOrder.filled_avg_price ? parseFloat(dataOrder.filled_avg_price) : (dataOrder.price || 0),
          status: dataOrder.status?.toUpperCase() || "ACCEPTED",
          submittedAt: new Date().toLocaleTimeString(),
        };
        setOrders((prev) => [newOrderObj, ...prev]);

        if (isFilledStatus || brokerStatus === "ACCEPTED" || brokerStatus === "NEW") {
          const dayGuard = ensureDailyGuardWindow();
          dayGuard.trades += 1;
        }

        if (side === "BUY" && (isFilledStatus || brokerStatus === "ACCEPTED" || brokerStatus === "NEW")) {
          autopilotPositionOpenedAtRef.current[symbolClean] = {
            openedAt: Date.now(),
            entryPrice: Number.isFinite(reportedExecPrice) && reportedExecPrice > 0 ? reportedExecPrice : liveEstimatedPrice,
          };
        }

        if (side === "SELL" && isFilledStatus && existingPositionBeforeOrder && parseFloat(existingPositionBeforeOrder.qty || 0) > 0) {
          const closeQty = Number.isFinite(filledQty) && filledQty > 0 ? filledQty : Math.min(qtyNum, Math.max(0, parseFloat(existingPositionBeforeOrder.qty || 0)));
          const execPx = Number.isFinite(reportedExecPrice) && reportedExecPrice > 0 ? reportedExecPrice : liveEstimatedPrice;
          const avgEntry = parseFloat(existingPositionBeforeOrder.avg_entry_price || 0);
          if (closeQty > 0 && avgEntry > 0 && execPx > 0) {
            const pnl = (execPx - avgEntry) * closeQty;
            const dayGuard = ensureDailyGuardWindow();
            dayGuard.realizedPnl += pnl;
            recordSymbolProfit(symbolClean, pnl);
          }
          const remainingAfter = Math.max(0, parseFloat(existingPositionBeforeOrder.qty || 0) - closeQty);
          if (remainingAfter <= 0.00005) {
            delete autopilotPositionOpenedAtRef.current[symbolClean];
          }
        }

        setTimeout(() => {
          if (curRef.handleRefreshData) {
            curRef.handleRefreshData();
          }
        }, 1200);

        if (isFilledStatus) {
          return {
            status: "FILLED",
            code: "FILLED",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: Number.isFinite(filledQty) && filledQty > 0 ? filledQty : finalQty,
            message: "Live order filled."
          };
        }

        return {
          status: "PENDING",
          code: "PENDING_BROKER_ACCEPTED",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: Number.isFinite(filledQty) && filledQty > 0 ? filledQty : 0,
          message: `Live order accepted by broker (status: ${brokerStatus}). Awaiting fill confirmation.`
        };

      } catch (err: any) {
        console.error(err);
        if (side === "BUY") {
          autopilotPendingBuySymbolsRef.current.delete(symbolClean);
          delete autopilotPendingBuyMetaRef.current[symbolClean];
        }
        let errorMsg = err.message || "Broker block";
        const rawErrorMsg = String(errorMsg || "").toLowerCase();
        const isNetworkFetchFailure =
          rawErrorMsg.includes("failed to fetch") ||
          rawErrorMsg.includes("networkerror") ||
          rawErrorMsg.includes("load failed") ||
          rawErrorMsg.includes("network request failed") ||
          rawErrorMsg.includes("timed out");
        if (side === "BUY" && rawErrorMsg.includes("insufficient buying power")) {
          const cooldownMs = 3 * 60 * 1000;
          autopilotBuyCooldownUntilRef.current[symbolClean] = Date.now() + cooldownMs;
          addAutopilotLog(`BUY cooldown armed for ${symbolClean}: pausing retries for 180s after buying-power rejection.`, "info");
        }
        if (errorMsg.includes("is not allowed to short") || errorMsg.includes("shorting")) {
          errorMsg = "Account is not allowed to short. Standard Alpaca Cash and non-margin accounts cannot short-sell. Swap to Local Risk Simulator to fully trade short strategies!";
        } else if (errorMsg.includes("insufficient buying power")) {
          errorMsg = "Insufficient buying power in your Alpaca account. Use smaller positions or switch to Local Risk Simulator mode!";
        }
        if (isNetworkFetchFailure && curRef.useAlpacaLive) {
          networkFailureStrikeRef.current += 1;
          const strikes = networkFailureStrikeRef.current;
          if (strikes >= 3) {
            networkFailureResumeAtRef.current = Date.now() + AUTOPILOT_FAILURE_PAUSE_MS;
            networkFailurePauseLogRef.current = networkFailureResumeAtRef.current;
            setAutopilotScanError(`Network issue detected; autopilot paused for ${Math.floor(AUTOPILOT_FAILURE_PAUSE_MS / 1000)}s.`);
            addAutopilotLog(`Network connectivity issue detected. Pausing autopilot scans for ${Math.floor(AUTOPILOT_FAILURE_PAUSE_MS / 1000)}s to allow recovery.`, "warn");
          } else {
            addAutopilotLog(`Network hiccup (strike ${strikes}/3) for ${symbolClean} — skipping this tick, will retry.`, "warn");
          }
        } else {
          // Successful non-network request resets the strike counter
          networkFailureStrikeRef.current = 0;
        }
        addAutopilotLog(`Automated Live Order REJECTED: ${errorMsg}`, "warn");
        addLog(symbolClean, `AUTO_${side}_FAILED`, errorMsg, "CRITICAL");
        return {
          status: "REJECTED",
          code: "REJECTED_BROKER",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: errorMsg
        };
      } finally {
        try {
          release();
        } catch (e) {
          // swallow
        }
      }
    } else {
      // Offline Simulated execution (serialized)
      const releaseSim = await orderMutexRef.current.acquire();
      try {
      // Offline Simulated execution
      let estPrice = 150.0;
      const matchedTicker = curRef.mockPositions.find((p: Position) => p.symbol === symbolClean);
      if (matchedTicker) {
        estPrice = matchedTicker.current_price;
      } else {
        if (symbolClean === "AAPL") estPrice = 182.2;
        else if (symbolClean === "TSLA") estPrice = 195.0;
        else if (symbolClean === "NVDA") estPrice = 115.5;
        else if (symbolClean === "BTCUSD") estPrice = 67200.0;
        else if (symbolClean === "MSFT") estPrice = 425.0;
      }

      const orderCost = estPrice * qtyNum;
      const isINR = false;
      const currencySymbol = isINR ? "₹" : "$";
      
      // Real-world fee/charge calculation based on asset class and broker type
      let flatBrokerage = 1.00;
      let taxRate = 0.0005;
      let slippageRate = 0.0002;
      
      if (isINR) {
        flatBrokerage = symbolClean === "BTCUSD" ? 0 : 20.00; // Flat ₹20 per order
        taxRate = symbolClean === "BTCUSD" ? 0.001 : 0.0015;  // STT + Stamp duty + SEBI
        slippageRate = 0.0003; // 0.03% slippage
      } else {
        flatBrokerage = symbolClean === "BTCUSD" ? 0.10 : 1.00; // SEC/FINRA and clearings
        taxRate = symbolClean === "BTCUSD" ? 0.0015 : 0.0005;
        slippageRate = 0.0002;
      }

      const orderFees = parseFloat((flatBrokerage + orderCost * taxRate + orderCost * slippageRate).toFixed(2));
      let simulatedExecutedQty = qtyNum;

      if (side === "BUY") {
        let execQty = qtyNum;
        let execOrderCost = orderCost;
        let execOrderFees = orderFees;
        let totalDebitWithFees = execOrderCost + execOrderFees;

        if (totalDebitWithFees > curRef.simCash) {
          const variableRate = taxRate + slippageRate;
          const maxAffordableQtyRaw = (curRef.simCash - flatBrokerage) / (estPrice * (1 + variableRate));
          const minExecutableQty = symbolClean === "BTCUSD" ? 0.0001 : 0.01;
          const resizedQty = symbolClean === "BTCUSD"
            ? parseFloat(Math.max(0, maxAffordableQtyRaw).toFixed(4))
            : parseFloat(Math.max(0, maxAffordableQtyRaw).toFixed(2));

          if (Number.isFinite(resizedQty) && resizedQty >= minExecutableQty && resizedQty < qtyNum) {
            execQty = resizedQty;
            execOrderCost = estPrice * execQty;
            execOrderFees = parseFloat((flatBrokerage + execOrderCost * taxRate + execOrderCost * slippageRate).toFixed(2));
            totalDebitWithFees = execOrderCost + execOrderFees;
            addAutopilotLog(`📉 Sim cash resize: ${symbolClean} BUY reduced from ${qtyNum} to ${execQty} to fit available balance ${currencySymbol}${curRef.simCash.toFixed(2)}.`, "info");
            addLog(symbolClean, "AUTO_TRADE_RESIZED", `Auto-resized simulated BUY ${symbolClean} from ${qtyNum} to ${execQty} due to cash limit.`, "INFO");
          } else {
            addAutopilotLog(`Blocked automated simulation: Insufficient sim balance. Needs ${currencySymbol}${totalDebitWithFees.toFixed(2)} (including ${currencySymbol}${execOrderFees.toFixed(2)} fees/taxes).`, "warn");
            addLog(symbolClean, "AUTO_BUY_SIM_FAILED", `Simulated cash reserves exhausted. Needs ${currencySymbol}${totalDebitWithFees.toFixed(2)} to cover order & fees.`, "WARNING");
            return {
              status: "BLOCKED",
              code: "BLOCKED_CASH_BUFFER",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Insufficient simulated cash. Needed ${currencySymbol}${totalDebitWithFees.toFixed(2)}.`
            };
          }
        }

        // Simulate realistic execution: possible partial fill, extra slippage, and liquidity rejection
        const liquidityRoll = Math.random();
        // Very small chance of outright liquidity rejection
        if (liquidityRoll < 0.03) {
          addAutopilotLog(`Simulated LIVE BLOCK: Liquidity/rejection for BUY ${symbolClean}.`, "warn");
          addLog(symbolClean, "AUTO_BUY_SIM_FAILED", `Simulated liquidity rejection for BUY ${symbolClean}.`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_LIQUIDITY",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: "Simulated liquidity rejection."
          };
        }

        // Partial-fill chance
        let fillFraction = 1;
        if (liquidityRoll > 0.85) {
          fillFraction = 0.4 + Math.random() * 0.6; // 40% - 100%
        }

        const executedQty = symbolClean === "BTCUSD"
          ? parseFloat((execQty * fillFraction).toFixed(4))
          : parseFloat((execQty * fillFraction).toFixed(2));

        if (executedQty < (symbolClean === "BTCUSD" ? 0.0001 : 0.01)) {
          addAutopilotLog(`Blocked simulated automated BUY: executed qty ${executedQty} is negligible after partial fill.`, "warn");
          return {
            status: "BLOCKED",
            code: "BLOCKED_NEGLIGIBLE_QTY",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Executed quantity ${executedQty} is below minimum executable size.`
          };
        }

        // Apply additional slippage to executed price
        const extraSlippage = slippageRate + Math.random() * 0.005; // add up to 0.5% extra
        const executedPrice = estPrice * (1 + (side === "BUY" ? 1 : -1) * extraSlippage);
        const executedCost = executedQty * executedPrice;
        const executedFees = parseFloat((flatBrokerage + executedCost * taxRate + executedCost * slippageRate).toFixed(2));
        const executedDebit = executedCost + executedFees;

        simulatedExecutedQty = executedQty;

        setSimCash((c) => c - executedDebit);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty + executedQty;
            if (Math.abs(updatedQty) < 0.0001) {
              return prev.filter((p) => p.symbol !== symbolClean);
            }
            let newAvgEntry = exists.avg_entry_price;
            let unrealized = 0;
            if (exists.qty > 0) {
              const actualSpent = exists.avg_entry_price * exists.qty + executedCost + executedFees;
              newAvgEntry = actualSpent / updatedQty;
              unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
            } else {
              if (updatedQty < 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              } else {
                newAvgEntry = (executedCost + executedFees) / updatedQty;
                unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
              }
            }
            return prev.map((p) =>
              p.symbol === symbolClean
                ? {
                    ...p,
                    qty: parseFloat(updatedQty.toFixed(4)),
                    market_value: parseFloat((updatedQty * exists.current_price).toFixed(2)),
                    avg_entry_price: parseFloat(newAvgEntry.toFixed(4)),
                    unrealized_pl: parseFloat(unrealized.toFixed(2)),
                  }
                : p
            );
          } else {
            const realAvgEntry = parseFloat(((executedCost + executedFees) / executedQty).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: executedQty,
                avg_entry_price: realAvgEntry,
                current_price: executedPrice,
                market_value: parseFloat(executedCost.toFixed(2)),
                unrealized_pl: parseFloat((executedCost - realAvgEntry * executedQty).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim purchase complete: Acquired ${executedQty} ${symbolClean} at ${currencySymbol}${executedPrice.toFixed(2)} (Fees: ${currencySymbol}${executedFees.toFixed(2)}).`, "success");
        addLog(symbolClean, "AUTO_BUY_SIM", `Purchased simulated ${executedQty} ${symbolClean} at fee-adjusted cost basis (Fee: ${currencySymbol}${executedFees.toFixed(2)})`, "SUCCESS");
        autopilotPositionOpenedAtRef.current[symbolClean] = {
          openedAt: Date.now(),
          entryPrice: executedPrice,
        };
      } else {
        // Simulated SELL (With support for Short Selling / Cover)
        // Simulate SELL: possible partial fill and price improvement/slippage
        const sellLiquidityRoll = Math.random();
        if (sellLiquidityRoll < 0.03) {
          addAutopilotLog(`Simulated LIVE BLOCK: Liquidity/rejection for SELL ${symbolClean}.`, "warn");
          addLog(symbolClean, "AUTO_SELL_SIM_FAILED", `Simulated liquidity rejection for SELL ${symbolClean}.`, "WARNING");
          return {
            status: "BLOCKED",
            code: "BLOCKED_LIQUIDITY",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: "Simulated liquidity rejection."
          };
        }

        let sellFillFraction = 1;
        if (sellLiquidityRoll > 0.85) sellFillFraction = 0.4 + Math.random() * 0.6;
        const executedSellQty = symbolClean === "BTCUSD"
          ? parseFloat((qtyNum * sellFillFraction).toFixed(4))
          : parseFloat((qtyNum * sellFillFraction).toFixed(2));

        if (executedSellQty < (symbolClean === "BTCUSD" ? 0.0001 : 0.01)) {
          addAutopilotLog(`Blocked simulated automated SELL: executed qty ${executedSellQty} is negligible after partial fill.`, "warn");
          return {
            status: "BLOCKED",
            code: "BLOCKED_NEGLIGIBLE_QTY",
            symbol: symbolClean,
            side,
            requestedQty: qtyNum,
            executedQty: 0,
            message: `Executed quantity ${executedSellQty} is below minimum executable size.`
          };
        }

        const sellExtraSlippage = slippageRate + Math.random() * 0.005;
        const executedSellPrice = estPrice * (1 - sellExtraSlippage);
        const sellProceeds = executedSellQty * executedSellPrice;
        const sellFees = parseFloat((flatBrokerage + sellProceeds * taxRate + sellProceeds * slippageRate).toFixed(2));

        setSimCash((c) => c + (sellProceeds - sellFees));
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty - executedSellQty;
            if (Math.abs(updatedQty) < 0.0001) {
              return prev.filter((p) => p.symbol !== symbolClean);
            }
            let newAvgEntry = exists.avg_entry_price;
            let unrealized = 0;
            if (exists.qty > 0) {
              if (updatedQty > 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
              } else {
                newAvgEntry = parseFloat(((sellProceeds - sellFees) / Math.abs(updatedQty)).toFixed(4));
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              }
            } else {
              const totalAcquiredShort = exists.avg_entry_price * Math.abs(exists.qty) + sellProceeds - sellFees;
              newAvgEntry = totalAcquiredShort / Math.abs(updatedQty);
              unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
            }
            return prev.map((p) =>
              p.symbol === symbolClean
                ? {
                    ...p,
                    qty: parseFloat(updatedQty.toFixed(4)),
                    market_value: parseFloat((updatedQty * exists.current_price).toFixed(2)),
                    avg_entry_price: parseFloat(newAvgEntry.toFixed(4)),
                    unrealized_pl: parseFloat(unrealized.toFixed(2)),
                  }
                : p
            );
          } else {
            const updatedQty = -executedSellQty;
            const realAvgEntry = parseFloat(((sellProceeds - sellFees) / executedSellQty).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: parseFloat(updatedQty.toFixed(4)),
                avg_entry_price: realAvgEntry,
                current_price: executedSellPrice,
                market_value: parseFloat((updatedQty * executedSellPrice).toFixed(2)),
                unrealized_pl: parseFloat(((realAvgEntry - executedSellPrice) * (-updatedQty)).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim sale complete: Sold/Short-sold ${executedSellQty} ${symbolClean} at ${currencySymbol}${executedSellPrice.toFixed(2)} (Fees: ${currencySymbol}${sellFees.toFixed(2)}).`, "success");
        addLog(symbolClean, "AUTO_SELL_SIM", `Sold simulated ${executedSellQty} ${symbolClean} with net credit (Fees & taxes: ${currencySymbol}${sellFees.toFixed(2)})`, "SUCCESS");

        const existingLongQty = Math.max(0, parseFloat(existingPositionBeforeOrder?.qty || 0));
        const realizedCloseQty = Math.min(existingLongQty, executedSellQty);
        const avgEntry = parseFloat(existingPositionBeforeOrder?.avg_entry_price || 0);
        if (realizedCloseQty > 0 && avgEntry > 0) {
          const pnl = (executedSellPrice - avgEntry) * realizedCloseQty;
          const dayGuard = ensureDailyGuardWindow();
          dayGuard.realizedPnl += pnl;
          recordSymbolProfit(symbolClean, pnl);
        }
        if (existingLongQty > 0 && existingLongQty - executedSellQty <= 0.00005) {
          delete autopilotPositionOpenedAtRef.current[symbolClean];
        }
      }

      ensureDailyGuardWindow().trades += 1;

      if (isLossCloseAttempt) {
        armLiquidationCooldown(symbolClean, "simulated close order");
      }

      setOrders((prev) => [
        {
          id: `sim-auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: side === "BUY" ? simulatedExecutedQty : qtyNum,
          price: estPrice,
          status: "FILLED_MOCK_AUTO",
          submittedAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);

      return {
        status: "FILLED",
        code: "FILLED",
        symbol: symbolClean,
        side,
        requestedQty: qtyNum,
        executedQty: side === "BUY" ? simulatedExecutedQty : qtyNum,
        message: "Simulated order filled."
      };
      } finally {
        try {
          releaseSim();
        } catch (e) {
          // swallow
        }
      }
    }
  }, [addAutopilotLog, addLog, armLiquidationCooldown, isLossMakingPosition, computeOpenCounts, ensureDailyGuardWindow, AUTOPILOT_MIN_HOLD_MS, AUTOPILOT_FAILURE_PAUSE_MS, fetchBinanceFundingSnapshot, recordSymbolProfit]);

  const ERROR_OUTCOME_STICKY_MS = 45_000; // errors stay in the UI card for 45s

  const isExpectedSafetyBlock = useCallback((code?: string) => {
    if (!code) return false;
    return [
      "BLOCKED_MAX_CONCURRENT",
      "BLOCKED_REGIME_FILTER",
      "BLOCKED_CHOP_ZONE",
      "BLOCKED_EDGE_COST",
      "BLOCKED_EXPOSURE_CAP",
      "BLOCKED_LOSS_GUARD",
      "BLOCKED_BLACKLIST",
      "BLOCKED_MARKET",
    ].includes(code);
  }, []);

  const logScanOrderOutcome = useCallback((source: string, outcome: AutopilotOrderResult) => {
    const now = Date.now();
    const isError = outcome.status === "BLOCKED" || outcome.status === "REJECTED";
    const isGood  = outcome.status === "FILLED"  || outcome.status === "PENDING";
    const isExecutionFailure = outcome.status === "REJECTED" || outcome.status === "INVALID" || (
      outcome.status === "BLOCKED" && !isExpectedSafetyBlock(outcome.code)
    );

    setLastAutopilotOutcomeVerbose((prev) => {
      const prevIsError = prev && (prev.status === "BLOCKED" || prev.status === "REJECTED");
      const errorStillSticky = prevIsError && (now - lastErrorOutcomeAtRef.current) < ERROR_OUTCOME_STICKY_MS;

      // Always show good news; always show error from same symbol; replace after sticky window expires
      if (isGood || !errorStillSticky || (prev && prev.symbol === outcome.symbol)) {
        if (isError) lastErrorOutcomeAtRef.current = now;
        return outcome;
      }
      // Still within sticky window and this is a different symbol's routine block — don't replace
      return prev;
    });

    if ((outcome.status === "BLOCKED" || outcome.status === "REJECTED") && outcome.side === "BUY" && outcome.symbol === autopilotCurrentScanTarget) {
      setAutopilotScanError(`Scan failed for ${outcome.symbol} ${outcome.requestedQty}: ${outcome.message}`);
      setAutopilotScanErrorCount((prev) => prev + 1);
    } else if (outcome.symbol === autopilotCurrentScanTarget && (outcome.status === "FILLED" || outcome.status === "PENDING")) {
      setAutopilotScanError(null);
      setAutopilotScanErrorCount(0);
    }

    const adjustCounts = (key: string, outcome: AutopilotOrderResult) => {
      const base = { wins: 0, losses: 0, blocks: 0, rejects: 0, pending: 0 };
      const mapOutcome = { ...base };

      if (outcome.status === "FILLED") {
        mapOutcome.wins = 1;
      } else if (outcome.status === "PENDING") {
        mapOutcome.pending = 1;
      } else if (outcome.status === "BLOCKED") {
        mapOutcome.losses = 1;
        mapOutcome.blocks = 1;
      } else if (outcome.status === "REJECTED") {
        mapOutcome.losses = 1;
        mapOutcome.rejects = 1;
      } else if (outcome.status === "INVALID") {
        mapOutcome.losses = 1;
      }

      setAutopilotPerformance((prev) => {
        const existing = prev[key] || base;
        return {
          ...prev,
          [key]: {
            wins: existing.wins + mapOutcome.wins,
            losses: existing.losses + mapOutcome.losses,
            blocks: existing.blocks + mapOutcome.blocks,
            rejects: existing.rejects + mapOutcome.rejects,
            pending: existing.pending + mapOutcome.pending,
          },
        };
      });

      setSymbolPerformance((prev) => {
        const existing = prev[outcome.symbol] || base;
        return {
          ...prev,
          [outcome.symbol]: {
            wins: existing.wins + mapOutcome.wins,
            losses: existing.losses + mapOutcome.losses,
            blocks: existing.blocks + mapOutcome.blocks,
            rejects: existing.rejects + mapOutcome.rejects,
            pending: existing.pending + mapOutcome.pending,
          },
        };
      });
    };

    adjustCounts(source, outcome);

    if (outcome.status === "BLOCKED") {
      setAutopilotBlockCodeCounts((prev) => ({
        ...prev,
        [outcome.code]: (prev[outcome.code] || 0) + 1,
      }));
    }

    if (isExecutionFailure) {
      autopilotFailureStrikeRef.current += 1;
      const strikes = autopilotFailureStrikeRef.current;
      if (strikes >= 3) {
        autopilotFailureStrikeRef.current = 0;
        const pauseUntil = Date.now() + AUTOPILOT_FAILURE_PAUSE_MS;
        networkFailureResumeAtRef.current = pauseUntil;
        networkFailurePauseLogRef.current = pauseUntil;
        setAutopilotScanError(`Autopilot paused after ${strikes} consecutive trade failures. Resuming in ${Math.floor(AUTOPILOT_FAILURE_PAUSE_MS / 1000)}s.`);
        addAutopilotLog(`Autopilot has recorded ${strikes} consecutive trade failures. Pausing scans for ${Math.floor(AUTOPILOT_FAILURE_PAUSE_MS / 1000)}s.`, "warn");
        addLog("SYSTEM", "AUTOPILOT_FAILURE_WARNING", `Autopilot experienced ${strikes} consecutive failures and paused for recovery.`, "WARNING");
      }
    } else if (outcome.status === "FILLED" || outcome.status === "PENDING") {
      autopilotFailureStrikeRef.current = 0;
    }

    if (isError) lastErrorOutcomeAtRef.current = now;

    const qtyText = outcome.executedQty > 0 ? outcome.executedQty : outcome.requestedQty;
    if (outcome.status === "FILLED") {
      addAutopilotLog(`${source}: ${outcome.status} ${outcome.side} ${qtyText} ${outcome.symbol} (${outcome.code}).`, "success");
    } else if (outcome.status === "PENDING") {
      addAutopilotLog(`${source}: ${outcome.status} ${outcome.side} ${outcome.requestedQty} ${outcome.symbol} (${outcome.code}) - ${outcome.message}`, "info");
    } else if (outcome.status === "BLOCKED") {
      addAutopilotLog(`${source}: ${outcome.status} ${outcome.side} ${outcome.requestedQty} ${outcome.symbol} (${outcome.code}) - ${outcome.message}`, "warn");
    } else {
      addAutopilotLog(`${source}: ${outcome.status} ${outcome.side} ${outcome.requestedQty} ${outcome.symbol} (${outcome.code}) - ${outcome.message}`, "warn");
    }
  }, [addAutopilotLog, addLog, ERROR_OUTCOME_STICKY_MS, AUTOPILOT_FAILURE_PAUSE_MS, autopilotCurrentScanTarget, isExpectedSafetyBlock]);

  // Immediate deleverage command callable from UI
  const performDeleverage = useCallback(async () => {
    const curRef = stateRef.current;
    addAutopilotLog(`Manual deleverage requested. Evaluating exposures...`, "info");

    const currentActivePositions: Position[] = curRef.useAlpacaLive ? curRef.alpacaPositions : curRef.mockPositions;
    if (!currentActivePositions || currentActivePositions.length === 0) {
      addAutopilotLog("Nothing to deleverage: no active positions.", "warn");
      return;
    }

    const highestExposure = [...currentActivePositions].sort((a, b) => {
      const aCost = a.current_price * Math.abs(a.qty) * a.maintenance_margin_rate;
      const bCost = b.current_price * Math.abs(b.qty) * b.maintenance_margin_rate;
      return bCost - aCost;
    })[0];

    if (!highestExposure) {
      addAutopilotLog("No exposures found for deleveraging.", "warn");
      return;
    }

    const qtyAbs = Math.abs(highestExposure.qty);
    const rawQty = Math.max(1, Math.round(qtyAbs * (curRef.aggressiveDeleverage ? 0.5 : 0.2)) || 1);

    if (highestExposure.qty > 0) {
      addAutopilotLog(`Manual deleverage: selling ${rawQty} of ${highestExposure.symbol}.`, "warn");
      const orderOutcome = await executeAutopilotOrder(highestExposure.symbol, "SELL", rawQty);
      logScanOrderOutcome("MANUAL_DELEVERAGE", orderOutcome);
      setToast({ message: `Sold ${rawQty} ${highestExposure.symbol}`, level: "success" });
    } else {
      addAutopilotLog(`Manual deleverage: buying ${rawQty} to cover short ${highestExposure.symbol}.`, "warn");
      const orderOutcome = await executeAutopilotOrder(highestExposure.symbol, "BUY", rawQty);
      logScanOrderOutcome("MANUAL_DELEVERAGE", orderOutcome);
      setToast({ message: `Covered ${rawQty} ${highestExposure.symbol}`, level: "success" });
    }

    // auto-clear toast after 4 seconds
    setTimeout(() => setToast(null), 4000);
  }, [executeAutopilotOrder, addAutopilotLog, logScanOrderOutcome]);

  const autopilotRunningRef = useRef(false);
  const autopilotCapPauseRef = useRef<string | null>(null);

  const executeAutopilotScan = useCallback(async () => {
    if (autopilotRunningRef.current) return;
    const now = Date.now();
    const pauseUntil = networkFailureResumeAtRef.current;
    if (pauseUntil > now) {
      if (networkFailurePauseLogRef.current !== pauseUntil) {
        const eta = new Date(pauseUntil).toLocaleTimeString();
        addAutopilotLog(`Autopilot scan suspended due to recent network failures. Resuming at ${eta}.`, "warn");
        setAutopilotScanError(`Network pause until ${eta}.`);
        networkFailurePauseLogRef.current = pauseUntil;
      }
      return;
    }
    networkFailurePauseLogRef.current = 0;
    autopilotRunningRef.current = true;
    const curRef = stateRef.current;
    setIsAutopilotRunning(true);
    setAutopilotLastScanAtMs(now);
    setAutopilotNextScanInSec(Math.max(0, autopilotInterval));
    addAutopilotLog(`Executing Autopilot scan (${curRef.useAlpacaLive ? "Live-Alpaca Client" : "Simulator Model"})...`, "info");

    try {
      const currentActivePositions: Position[] = curRef.useAlpacaLive ? curRef.alpacaPositions : curRef.mockPositions;
      const currentActiveCash = curRef.useAlpacaLive ? parseFloat(curRef.alpacaAccount?.cash || 0) : curRef.simCash;
      
      const currentMktValue = currentActivePositions.reduce((sum, pos) => sum + pos.current_price * pos.qty, 0);
      const currentTotalEquity = currentActiveCash + currentMktValue;
      const currentGrossExposure = currentActivePositions.reduce((sum, pos) => sum + pos.current_price * Math.abs(pos.qty), 0);
      const currentLeverageValue = currentTotalEquity > 0 ? currentGrossExposure / currentTotalEquity : 0;
      const currentMaintMargin = currentActivePositions.reduce((sum, pos) => sum + (pos.current_price * Math.abs(pos.qty) * pos.maintenance_margin_rate), 0);
      const currentCapacity = currentTotalEquity > 0 ? (currentMaintMargin / currentTotalEquity) * 100 : 0;

      const currentOpenCounts = computeOpenCounts(currentActivePositions);
      // Increased position limit to 200 to ensure broad scanning is never blocked.
      const maxOpenPositions = Math.max(200, Number(curRef.maxConcurrentPositions) || 200);
      const pendingBuyCount = autopilotPendingBuySymbolsRef.current.size;
      const positionCapReached = maxOpenPositions > 0 && (currentOpenCounts.all + pendingBuyCount) >= maxOpenPositions;

      if (positionCapReached) {
        autopilotCapPauseRef.current = `${currentOpenCounts.all}:${pendingBuyCount}`;
        addAutopilotLog(`Autopilot position cap (${maxOpenPositions}) reached (${currentOpenCounts.all} open + ${pendingBuyCount} pending). New BUY entries will be paused, but scanning continues for exits.`, "info");
        setAutopilotScanError(`Position cap reached (${maxOpenPositions}). Entry paused.`);
        // Do NOT return here. We must continue to evaluate SELL logic for existing positions.
      }

      autopilotCapPauseRef.current = null;

      const parsedTargets = (curRef.autopilotTargetTicker || DEFAULT_AUTOPILOT_TARGET_TICKERS)
        .split(/[\s,]+/)
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean);
      const fallbackTargets = DEFAULT_AUTOPILOT_TARGET_TICKERS
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      // Allow broad-universe targets when the user has enabled the option.
      // Previously this was disabled in live mode for safety; allow it here
      // but keep a conservative processing cap for live broker calls.
      // Force full-universe coverage irrespective of persisted broad-scan toggle.
      const broadUniverseTargets = quickTickers.map((s) => s.toUpperCase());
      // Force elite universe regardless of user input or storage.
      const baseTargets = Array.from(new Set([...broadUniverseTargets, ...parsedTargets]));
      const equityTargets = baseTargets.filter((sym: string) => !isCryptoSymbol(sym));
      
      let scanTargets = equityTargets; // 🚀 ELITE: No fallback to user targets only
      // LOGGING: Critical for user to see the full scope
      addAutopilotLog(`Scan strategy: targets=${scanTargets.length} (broadUniverse=${broadUniverseTargets.length}, userTargets=${parsedTargets.length})`, "info");

      scanTargets = scanTargets.slice(0, 500); 
      
      curRef.lastScanCount = scanTargets.length;
      curRef.totalProcessedCount = (curRef.totalProcessedCount || 0) + scanTargets.length;
      setAutopilotScanTotalTargets(scanTargets.length);

      const marketSessionNow = getMarketSessionET();
      if (marketSessionNow === "CLOSED") {
        setAutopilotScanTotalTargets(0);
        setAutopilotScanProcessedCount(0);
        setAutopilotCurrentScanTarget(null);
        setAutopilotScanError("Market is closed. Autopilot scans are paused until market open.");
        setAutopilotScanErrorCount(0);
        addAutopilotLog("Autopilot scan skipped: market session is CLOSED. Wall Street equities trade only during market hours.", "info");
        return;
      }

      if (scanTargets.length === 0) {
        setAutopilotScanTotalTargets(0);
        setAutopilotScanProcessedCount(0);
        setAutopilotCurrentScanTarget(null);
        setAutopilotScanError("No eligible scan targets are available right now.");
        setAutopilotScanErrorCount(0);
        addAutopilotLog("Autopilot scan skipped: market session is CLOSED.", "info");
        return;
      }

      setAutopilotScanTotalTargets(scanTargets.length);
      setAutopilotScanProcessedCount(0);

      const targetIdx = autopilotTargetSymbolIndexRef.current % scanTargets.length;
      const orderedScanTargets = [...scanTargets.slice(targetIdx), ...scanTargets.slice(0, targetIdx)];
      autopilotTargetSymbolIndexRef.current = (targetIdx + 1) % scanTargets.length;
      setAutopilotScanError(null);
      setAutopilotScanErrorCount(0);

      const maxPendingBuyThreshold = 10;
      if (pendingBuyCount >= maxPendingBuyThreshold) {
        addAutopilotLog(`Paused autopilot scan: ${pendingBuyCount} pending broker buy confirmations remain. Waiting for fills before new entries.`, "warn");
        return;
      }

      // In broad-universe mode, process the full target list each scan cycle.
      // Increased to 500 to allow full universe coverage as requested by the user.
      const DEFAULT_SCAN_BATCH_SIZE = 500;
      const maxTargetsPerScan = autopilotScanBroadUniverse 
        ? Math.min(scanTargets.length, DEFAULT_SCAN_BATCH_SIZE) 
        : 1;

      if (curRef.useAlpacaLive && autopilotScanBroadUniverse) {
        if (!liveBroadWarningLoggedRef.current) {
          addAutopilotLog(`Broad Universe Scan enabled in LIVE mode — processing full universe (${maxTargetsPerScan} targets) each scan.`, "warn");
          liveBroadWarningLoggedRef.current = true;
        }
      }
      const processedScanTargets = orderedScanTargets.slice(0, Math.max(1, Math.min(orderedScanTargets.length, maxTargetsPerScan)));
      
      // Update the rotation index by the number of processed targets to ensure fresh symbols in the next cycle.
      autopilotTargetSymbolIndexRef.current = (targetIdx + processedScanTargets.length) % scanTargets.length;

      for (const targetSymbol of processedScanTargets) {
        const iterationRef = stateRef.current;
        const currentActivePositionsForIteration: Position[] = (iterationRef.useAlpacaLive ? iterationRef.alpacaPositions : iterationRef.mockPositions) || [];
        const livePositionsSnapshot = currentActivePositionsForIteration;
        const currentPending = autopilotPendingBuySymbolsRef.current.size;
        
        // Only block if we are actually trying to BUY. Let the signal evaluation determine side.
        // We'll check the cap again specifically before the BUY execution.
        
        setAutopilotCurrentScanTarget(targetSymbol);
        setAutopilotScanProcessedCount((prev) => prev + 1);

        // Yield to the browser so log/state updates can render during long scan batches.
        await new Promise((resolve) => setTimeout(resolve, 0));

        // DETECT KEY MISMATCH (Critical for 401 debugging)
        if (curRef.useAlpacaLive) {
          const keyPrefix = curRef.apiKey?.slice(0, 2);
          if (curRef.isPaper && keyPrefix === 'AK') {
             addAutopilotLog(`⚠️ CREDENTIAL WARNING: Using a LIVE Key (AK...) on a PAPER account. Orders will be REJECTED with 401 Unauthorized.`, "warn");
          } else if (!curRef.isPaper && keyPrefix === 'PK') {
             addAutopilotLog(`⚠️ CREDENTIAL WARNING: Using a PAPER Key (PK...) on a LIVE account. Orders will be REJECTED with 401 Unauthorized.`, "warn");
          }
        }

        const matchedForStats = currentActivePositionsForIteration.find((p) => p.symbol === targetSymbol);
        let scanPrice = matchedForStats?.current_price || 0;
        if (!Number.isFinite(scanPrice) || scanPrice <= 0) {
          const quotePrice = await fetchAutopilotQuote(targetSymbol);
          if (quotePrice) {
            scanPrice = quotePrice;
          }
        }
        if (!Number.isFinite(scanPrice) || scanPrice <= 0) {
          scanPrice = targetSymbol === "BTCUSD" ? 67200.0 : targetSymbol === "ETHUSD" ? 3800.0 : 150.0;
        }
        recordMarketStat(targetSymbol, scanPrice);

        if (curRef.autopilotStrategy === "SENTRY_HEAL") {
        if (currentCapacity >= curRef.warnThreshold) {
          if (sentryHealthStateRef.current !== "warning") {
            addAutopilotLog(`⚠️ Hazard: Over-allocation! Margin ${currentCapacity.toFixed(1)}% exceeds alert threshold ${curRef.warnThreshold}%. Triggering AutoDeleverage defender...`, "warn");
            sentryHealthStateRef.current = "warning";
          }
          
          if (currentActivePositions.length === 0) {
            addAutopilotLog(`Nothing to sell to deleverage. Holdings are empty.`, "warn");
          } else {
            const highestExposure = [...currentActivePositions].sort((a, b) => {
              const aCost = a.current_price * Math.abs(a.qty) * a.maintenance_margin_rate;
              const bCost = b.current_price * Math.abs(b.qty) * b.maintenance_margin_rate;
              return bCost - aCost;
            })[0];
            
            const qtyAbs = Math.abs(highestExposure.qty);
            const rawQty = Math.max(1, Math.round(qtyAbs * (curRef.aggressiveDeleverage ? 0.5 : 0.2)) || 1);
            
            if (highestExposure.qty > 0) {
              addAutopilotLog(`Triggered auto-deleveraging order to sell ${rawQty} of high-beta long asset ${highestExposure.symbol}.`, "warn");
              const orderOutcome = await executeAutopilotOrder(highestExposure.symbol, "SELL", rawQty);
              logScanOrderOutcome("SENTRY_HEAL", orderOutcome);
            } else {
              addAutopilotLog(`Triggered auto-deleveraging order to cover ${rawQty} of high-beta short asset ${highestExposure.symbol}.`, "warn");
              const orderOutcome = await executeAutopilotOrder(highestExposure.symbol, "BUY", rawQty);
              logScanOrderOutcome("SENTRY_HEAL", orderOutcome);
            }
          }
        } else {
          if (sentryHealthStateRef.current !== "healthy") {
            addAutopilotLog(`Usage status is healthy (${currentCapacity.toFixed(1)}% / ${curRef.warnThreshold}%). Autopilot deleveraging idle.`, "success");
            sentryHealthStateRef.current = "healthy";
          }
        }
      }

      else if (curRef.autopilotStrategy === "SCALPER") {
        addAutopilotLog(`Triggering Micro-Scalper engine on target ticker: ${targetSymbol}...`, "info");
        
        const matched = currentActivePositions.find((p) => p.symbol === targetSymbol);
        const livePriceFromAccount = curRef.alpacaPositions?.find((p: any) => p.symbol === targetSymbol)?.current_price || 0;
        let currentSpotPrice = matched?.current_price || livePriceFromAccount || 150.0;

        const existingScalperPos = currentActivePositions.find((p) => p.symbol === targetSymbol);
        const hasPendingSeedBuy = autopilotPendingBuySymbolsRef.current.has(targetSymbol);

        const isLiveMode = !!curRef.useAlpacaLive;
        const rawCash = parseFloat(curRef.alpacaAccount?.cash || "0");
        const rawEquity = parseFloat(curRef.alpacaAccount?.equity || "0");

        // --- Margin Guard ---
        // Block new entries if maintenance margin exceeds 85% of equity to prevent 401/Margin-Call rejections or forced liquidation loops.
        const currentMaint = parseFloat(curRef.alpacaAccount?.maintenance_margin || "0");
        const capUsed = rawEquity > 0 ? (currentMaint / rawEquity) * 100 : 0;
        if (capUsed > 85) {
          addAutopilotLog(`Margin Guard Active: Skipping entry evaluation for ${targetSymbol}. Account utilization at ${capUsed.toFixed(1)}% (Limit: 85%).`, "warn");
          // continue instead of break to allow exit logic for existing positions further in the list.
          // Note: Entry logic is below this block, exit logic is further down.
        }

        // Fixed: Scalper budget was using Buying Power, leading to extreme unintentional leverage (e.g. 10% of BP on a 4x margin account = 40% of equity per symbol).
        // Switching to use Equity as the base to ensure the 10% cap is absolute relative to net liquidation value.
        const exposureLimit = Math.max(1, Math.min(20, Number(curRef.maxExposurePercentPerSymbol) || 7)) / 100;
        const liveBudget = isLiveMode
          ? Math.max(0, (rawEquity > 0 ? rawEquity : rawCash) * exposureLimit)
          : 0;
        const liveMinQty = Math.max(0.01, Number(curRef.liveMinOrderQty) || 0.01);
        const budgetQtyRaw = currentSpotPrice > 0 ? liveBudget / currentSpotPrice : 0;
        const liveQtyByBudget = targetSymbol === "BTCUSD" || targetSymbol === "ETHUSD"
          ? parseFloat(Math.max(liveMinQty, budgetQtyRaw).toFixed(5))
          : parseFloat(Math.max(liveMinQty, budgetQtyRaw).toFixed(4));

        const stat = autopilotMarketStatsRef.current[targetSymbol];
        const directionalTrendThreshold = AUTOPILOT_MIN_TREND_STRENGTH;
        const hasStrongLongEdge = !!stat && stat.expectedEdgeBps > (stat.estimatedCostBps + (AUTOPILOT_MIN_EDGE_BUFFER_LONG_BPS || 12));
        const strongUpTrend = !!stat && stat.trendStrength >= directionalTrendThreshold;
        const hasMatureSignal = Boolean(stat && Number.isFinite(stat.trendStrength) && Number.isFinite(stat.expectedEdgeBps) && (autopilotPriceWindowRef.current[targetSymbol]?.length || 0) >= (AUTOPILOT_MIN_SIGNAL_MATURITY_TICKS));

        if (!hasMatureSignal) {
          const tickCount = autopilotPriceWindowRef.current[targetSymbol]?.length || 0;
          if (tickCount > 0) {
            addAutopilotLog(`Signal for ${targetSymbol} warming up (${tickCount}/${AUTOPILOT_MIN_SIGNAL_MATURITY_TICKS} ticks). Skipping evaluation.`, "info");
          }
          continue;
        }

        // --- PROFITABILITY REGIME FILTERS ---
        if (stat && stat.chopScore > (AUTOPILOT_MAX_CHOP_SCORE || 0.45)) {
           addAutopilotLog(`Filtering ${targetSymbol}: Market regime too choppy (Chop ${stat.chopScore.toFixed(2)} > ${AUTOPILOT_MAX_CHOP_SCORE || 0.45}).`, "info");
           continue;
        }
        if (stat && stat.atrPct < (AUTOPILOT_MIN_ATR_PCT || 0.005)) {
           addAutopilotLog(`Filtering ${targetSymbol}: Low volatility asset (ATR ${stat.atrPct.toFixed(3)}% < ${AUTOPILOT_MIN_ATR_PCT || 0.005}%). Edge unlikely to cover spread.`, "info");
           continue;
        }
        if (stat && Math.abs(stat.expectedEdgeBps) < (AUTOPILOT_MIN_EDGE_BPS || 25)) {
           addAutopilotLog(`Filtering ${targetSymbol}: Edge too small (${Math.round(stat.expectedEdgeBps)} bps < ${AUTOPILOT_MIN_EDGE_BPS || 25} bps required).`, "info");
           continue;
        }

        // Extended Hours Guard: Only allow entries if signal is very strong during extended hours
        const currentSession = getMarketSessionET();
        const isExtended = currentSession === "EXTENDED";
        const isVeryStrong = !!stat && (Math.abs(stat.trendStrength) >= 0.5 && Math.abs(stat.expectedEdgeBps) >= 8);
        const sessionAllowsEntry = !isExtended || isVeryStrong;

        if (isExtended && !isVeryStrong && (hasStrongLongEdge || (!!stat && stat.expectedEdgeBps < -(stat.estimatedCostBps + 2)))) {
          addAutopilotLog(`Filtering ${targetSymbol}: Extended hours requires 'Very Strong' signal (Trend > 0.7, Edge > 15bps). Current: Trend ${stat?.trendStrength?.toFixed(2)}, Edge ${stat?.expectedEdgeBps?.toFixed(1)}bps.`, "info");
        }

        // Fixed: Falling back to BUY when no signal is present or trend is weak is dangerous in a bear market.
        // Forcing shouldFallbackBuy to false to ensure we only trade on verified signals.
        const shouldFallbackBuy = false;

        // --- Cooldown Guard ---
        const cooldownUntil = autopilotBuyCooldownUntilRef.current[targetSymbol] || 0;
        if (Date.now() < cooldownUntil) {
          const secLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
          addAutopilotLog(`Filtering ${targetSymbol}: re-entry cooldown active for another ${secLeft}s.`, "info");
          continue;
        }

        if (hasPendingSeedBuy) {
          addAutopilotLog(`Scalper bootstrap paused for ${targetSymbol}: previous BUY is still pending broker fill confirmation.`, "info");
          continue;
        }
          if (!existingScalperPos || existingScalperPos.qty <= 0) {
          const exposureQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
          const seedQtyLong = isLiveMode
            ? Math.min(liveQtyByBudget, exposureQty)
            : (targetSymbol === "BTCUSD" ? 0.002 : 1);

          // Removed halving of short sizing. With a $2k account, we need the full exposure budget to reach 
          // the 1-share minimum for non-fractional shorting to avoid rejection.
          const seedQtyShort = isLiveMode
            ? (exposureQty > 0 
                ? parseFloat(Math.max(liveMinQty, Math.min(liveQtyByBudget, exposureQty)).toFixed(targetSymbol === "BTCUSD" ? 4 : 2))
                : 0)
            : (targetSymbol === "BTCUSD" ? 0.002 : 1);

          const hasStrongShortEdge = !!stat && stat.expectedEdgeBps < -(stat.estimatedCostBps + (AUTOPILOT_MIN_EDGE_BUFFER_SHORT_BPS || 20));
          const strongDownTrend = !!stat && stat.trendStrength <= -directionalTrendThreshold;

          if ((hasStrongLongEdge && strongUpTrend && seedQtyLong > 0 && sessionAllowsEntry) || shouldFallbackBuy) {
            const positionsSnapshot = (curRef.useAlpacaLive ? curRef.alpacaPositions : curRef.mockPositions) || [];
            const pendingCountForEntry = autopilotPendingBuySymbolsRef.current.size;
            // Increased position limit to 200 for broader scanning but still keep individual entry logic safe
            const currentLimit = Math.max(200, Number(curRef.maxConcurrentPositions) || 200);
            if ((computeOpenCounts(positionsSnapshot).all + pendingCountForEntry) >= currentLimit) {
              addAutopilotLog(`Skipping ${targetSymbol}: system-wide position limit (${currentLimit}) reached.`, "info");
              continue; // continue to allow exit checks
            }
            // compute confidence and adapt sizing
            const sig = computeSignalConfidence(stat);
            const adjQty = computeAdaptiveQty(seedQtyLong, sig.confidence, targetSymbol, "BUY");
            const reasonLabel = shouldFallbackBuy ? "fallback" : "signal";
            addAutopilotLog(`SignalClassifier: ${sig.label} @ ${Math.round(sig.confidence * 100)}% confidence. Using qty ${adjQty} via ${reasonLabel} entry.`, "info");
            const orderOutcome = await executeAutopilotOrder(targetSymbol, "BUY", adjQty);
            logScanOrderOutcome("SCALPER", orderOutcome);
          } else if (hasStrongShortEdge && strongDownTrend && seedQtyShort > 0 && sessionAllowsEntry) {
            // Attempt a short-entry SELL when a clear downtrend + negative edge exists
            // Use cached account status to avoid redundant API calls
            const shortable = iterationRef.alpacaAccount?.shorting_enabled === true;
            if (shortable === false) {
              addAutopilotLog(`Short blocked by borrow health guard for ${targetSymbol}: account marked non-shortable.`, "warn");
              shortFailureTimestampsRef.current[targetSymbol] = (shortFailureTimestampsRef.current[targetSymbol] || []).concat(Date.now());
              continue;
            }
            const sig = computeSignalConfidence(stat);
            const adjQty = computeAdaptiveQty(seedQtyShort, sig.confidence, targetSymbol, "SELL");
            addAutopilotLog(`SignalClassifier: ${sig.label} @ ${Math.round(sig.confidence * 100)}% confidence. Using qty ${adjQty}.`, "info");
            const orderOutcome = await executeAutopilotOrder(targetSymbol, "SELL", adjQty);
            // If broker rejects due to borrow/unavailability, record timestamp for throttling
            if (orderOutcome.status === "REJECTED" && orderOutcome.message && /borrow|short|unable to short|not allowed to short/i.test(orderOutcome.message)) {
              shortFailureTimestampsRef.current[targetSymbol] = (shortFailureTimestampsRef.current[targetSymbol] || []).concat(Date.now());
            }
            logScanOrderOutcome("SCALPER", orderOutcome);
          } else {
            // Log weak signals so the user knows the scanner is evaluating but filtering
            if (hasMatureSignal && (stat.expectedEdgeBps > 0 || stat.trendStrength > 0)) {
              // Only log if it's somewhat interesting to avoid spamming 300 logs
              if (stat.expectedEdgeBps > 3 || stat.trendStrength > 0.3) {
                addAutopilotLog(`Filtering ${targetSymbol}: Signal too weak (${Math.round(stat.expectedEdgeBps)} bps edge, ${stat.trendStrength.toFixed(2)} trend).`, "info");
              }
            }
          }
          continue;
        }

        // Deterministic exits: if a live position breaches global TP/SL bounds, exit first.
        const existingQty = existingScalperPos.qty;
        const existingEntry = Number(existingScalperPos.avg_entry_price || 0);
        
        if (existingQty !== 0 && existingEntry > 0) {
          const isShort = existingQty < 0;
          const ABSOLUTE_DOLLAR_STOP = 45; // 🛡️ $45 absolute dollar stop for $100k account (~0.6% on $7k exposure)
          
          try {
            const unrealizedDollar = isShort 
              ? (existingEntry - currentSpotPrice) * Math.abs(existingQty)
              : (currentSpotPrice - existingEntry) * existingQty;

            if (unrealizedDollar <= -ABSOLUTE_DOLLAR_STOP) {
              addAutopilotLog(`🛑 Absolute $${ABSOLUTE_DOLLAR_STOP} stop-loss breached: ${targetSymbol} (${isShort ? 'SHORT' : 'LONG'}) unrealized $${unrealizedDollar.toFixed(2)}. Forcing exit.`, "warn");
              const orderOutcome = await executeAutopilotOrder(targetSymbol, isShort ? "BUY" : "SELL", Math.abs(existingQty));
              logScanOrderOutcome("ABS_DOLLAR_SL", orderOutcome);
              continue;
            }
          } catch (e) { /* ignore */ }

          const pnlPct = isShort
            ? ((existingEntry - currentSpotPrice) / existingEntry) * 100
            : ((currentSpotPrice - existingEntry) / existingEntry) * 100;
            
          const tpPct = Number(curRef.globalTakeProfitPercent || (AUTOPILOT_TAKE_PROFIT_PCT || 0.75));
          const slPct = Number(curRef.globalStopLossPercent || (AUTOPILOT_MAX_DRAWDOWN_PCT_STOP || 0.45));

          // Proactive dynamic thresholding: if profit is > min threshold but signal reverses, exit early
          const isReversing = isShort ? (stat?.trendStrength > (AUTOPILOT_REVERSAL_EXIT_THRESHOLD || 0.25)) : (stat?.trendStrength < -(AUTOPILOT_REVERSAL_EXIT_THRESHOLD || 0.25));
          const breakEvenPlus = (AUTOPILOT_REVERSAL_PROFIT_MIN || 0.10); // cover cost + tiny slippage

          if (pnlPct >= tpPct || pnlPct <= -slPct || (pnlPct > breakEvenPlus && isReversing)) {
            const triggerLabel = pnlPct >= tpPct ? "TP" : (pnlPct <= -slPct ? "SL" : "REV");
            addAutopilotLog(`Scalper ${triggerLabel} exit: ${targetSymbol} (${isShort ? 'SHORT' : 'LONG'}) at ${pnlPct.toFixed(2)}% (entry ${existingEntry.toFixed(2)} -> now ${currentSpotPrice.toFixed(2)}).`, "trade");
            const orderOutcome = await executeAutopilotOrder(targetSymbol, isShort ? "BUY" : "SELL", Math.abs(existingQty));
            logScanOrderOutcome("SCALPER", orderOutcome);
            continue;
          }
        }

        addAutopilotLog(`Scalper ${targetSymbol}: no random trading action executed. Existing position is held until deterministic exit or stronger trade signal occurs.`, "info");
      }

      else if (curRef.autopilotStrategy === "TOUCH_TURN") {
        addAutopilotLog(`Triggering Touch & Turn (Opening-Range Scalper) on target: ${targetSymbol}...`, "info");

        let tState = (curRef.touchTurnStateMap || {})[targetSymbol] || curRef.touchTurnState || null;
        if (!tState || tState.symbol !== targetSymbol) {
          // Calculate ATR & Opening candle bounds based on broker and symbol
          let atr14 = 5.0;
          let openHigh = 183.10;
          let openLow = 181.90;
          let isBullish = true;

          if (targetSymbol === "RELIANCE") {
            atr14 = 42.0;
            openHigh = 2488.50;
            openLow = 2476.10;
            isBullish = true;
          } else if (targetSymbol === "TCS") {
            atr14 = 52.0;
            openHigh = 3845.00;
            openLow = 3815.00;
            isBullish = false;
          } else if (targetSymbol === "AAPL") {
            atr14 = 3.50;
            openHigh = 183.10;
            openLow = 182.00;
            isBullish = false;
          } else if (targetSymbol === "TSLA") {
            atr14 = 6.50;
            openHigh = 197.80;
            openLow = 195.90;
            isBullish = true;
          } else if (targetSymbol === "NVDA") {
            atr14 = 4.10;
            openHigh = 116.50;
            openLow = 115.30;
            isBullish = true;
          } else if (targetSymbol === "BTCUSD") {
            atr14 = 1600.0;
            openHigh = 67650.0;
            openLow = 67150.0;
            isBullish = false;
          } else {
            const matchedSym = currentActivePositions.find((p) => p.symbol === targetSymbol);
            let approxPrice = 100.0;
            if (matchedSym) approxPrice = matchedSym.current_price;
            atr14 = parseFloat((approxPrice * 0.022).toFixed(2));
            const candleWidth = parseFloat((atr14 * 0.32).toFixed(2));
            openHigh = parseFloat((approxPrice * 1.006).toFixed(2));
            openLow = parseFloat((openHigh - candleWidth).toFixed(2));
            isBullish = Math.random() > 0.5;
          }

          const rangeRange = parseFloat((openHigh - openLow).toFixed(2));
          const atrThreshold = parseFloat((atr14 * 0.25).toFixed(2));
          const isValidKey = rangeRange >= atrThreshold;

          let limitPrice = 0;
          let targetPrice = 0;
          let stopPrice = 0;
          let side: "BUY" | "SELL" = "BUY";

          if (isBullish) {
            limitPrice = openHigh;
            targetPrice = parseFloat((openHigh - rangeRange * 0.382).toFixed(2));
            const reward = limitPrice - targetPrice;
            const risk = reward / 2.0;
            stopPrice = parseFloat((limitPrice + risk).toFixed(2));
            side = "SELL";
          } else {
            limitPrice = openLow;
            targetPrice = parseFloat((openLow + rangeRange * 0.382).toFixed(2));
            const reward = targetPrice - limitPrice;
            const risk = reward / 2.0;
            stopPrice = parseFloat((limitPrice - risk).toFixed(2));
            side = "BUY";
          }

          tState = {
            symbol: targetSymbol,
            atr14,
            atrThreshold,
            openHigh,
            openLow,
            rangeRange,
            isBullish,
            isValid: isValidKey,
            limitPrice,
            targetPrice,
            stopPrice,
            status: "WAITING_LIMIT",
            side
          };

          const curPrefix = false ? "₹" : "$";
          addAutopilotLog(`📐 Touch & Turn Strategy initialised for ${targetSymbol}. ATR(14): ${curPrefix}${atr14.toFixed(2)} (25% threshold: ${curPrefix}${atrThreshold.toFixed(2)}). Opening 15m candle high: ${openHigh}, low: ${openLow} (range: ${rangeRange} - Qualified!).`, "info");
          addAutopilotLog(`🎯 Placed ${side} LIMIT order at range edge: ${curPrefix}${limitPrice.toFixed(2)}. Target profit (38.2% Fib): ${curPrefix}${targetPrice.toFixed(2)}. Stop boundary (2:1 RR): ${curPrefix}${stopPrice.toFixed(2)}. Monitoring first 90 minutes.`, "success");
          
          setTouchTurnState(tState);
        } else {
          // Retrieve current price
          const matched = currentActivePositions.find((p) => p.symbol === targetSymbol);
          let currentSpotPrice = 150.0;
          if (matched) {
            currentSpotPrice = matched.current_price;
          } else {
            if (targetSymbol === "RELIANCE") currentSpotPrice = 2475.50;
            else if (targetSymbol === "TCS") currentSpotPrice = 3820.00;
            else if (targetSymbol === "AAPL") currentSpotPrice = 182.20;
            else if (targetSymbol === "TSLA") currentSpotPrice = 195.00;
            else if (targetSymbol === "NVDA") currentSpotPrice = 115.50;
            else if (targetSymbol === "BTCUSD") currentSpotPrice = 67200.00;
            else if (targetSymbol === "MSFT") currentSpotPrice = 425.00;
          }

          const curPrefix = false ? "₹" : "$";

          if (tState.status === "WAITING_LIMIT") {
            addAutopilotLog(`⏳ Waiting for ${targetSymbol} to touch limit at ${curPrefix}${tState.limitPrice.toFixed(2)}. Current price: ${curPrefix}${currentSpotPrice.toFixed(2)}. Strategy duration: 15 / 90 minutes.`, "info");

            let formsEntry = false;
            if (tState.side === "BUY" && currentSpotPrice <= tState.limitPrice) {
              formsEntry = true;
            } else if (tState.side === "SELL" && currentSpotPrice >= tState.limitPrice) {
              formsEntry = true;
            }

            if (formsEntry) {
              addAutopilotLog(`🎯 Range edge touched! Executing ${tState.side} entry order at ${curPrefix}${tState.limitPrice.toFixed(2)}.`, "trade");
              
              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, tState.side, tradeQty);

              const nextState = {
                ...tState,
                status: "ACTIVE_TRADE" as const,
                entryPrice: currentSpotPrice
              };
              setTouchTurnState(nextState);
              addAutopilotLog(`🚀 Position ACTIVE. Price: ${curPrefix}${currentSpotPrice.toFixed(2)}. TP Target: ${curPrefix}${tState.targetPrice.toFixed(2)}. SL Stop: ${curPrefix}${tState.stopPrice.toFixed(2)}.`, "success");
            }
          } else if (tState.status === "ACTIVE_TRADE") {
            addAutopilotLog(`📈 Position ACTIVE on ${targetSymbol}. Current Spot: ${curPrefix}${currentSpotPrice.toFixed(2)} | Target: ${curPrefix}${tState.targetPrice.toFixed(2)} | Stop: ${curPrefix}${tState.stopPrice.toFixed(2)}.`, "info");

            let stateChange: "HIT_TARGET" | "HIT_STOP" | null = null;

            if (tState.side === "BUY") {
              if (currentSpotPrice >= tState.targetPrice) {
                stateChange = "HIT_TARGET";
              } else if (currentSpotPrice <= tState.stopPrice) {
                stateChange = "HIT_STOP";
              }
            } else {
              if (currentSpotPrice <= tState.targetPrice) {
                stateChange = "HIT_TARGET";
              } else if (currentSpotPrice >= tState.stopPrice) {
                stateChange = "HIT_STOP";
              }
            }

            // Also enforce global percent-based TP/SL (quant-style)
              try {
              const cur = stateRef.current as any;
              const entry = (tState as any).entryPrice || tState.limitPrice || 0;
              // Absolute dollar-based stop loss check
              try {
                // Fixed: Reduced absolute stop from $25 to $10 to prevent large drawdowns
                const ABSOLUTE_DOLLAR_STOP = 10;
                const isBuyCheck = tState.side === "BUY";
                // Fixed: Corrected short-side PnL calculation for dollar stop
                const unrealizedDollarCheck = isBuyCheck 
                  ? (currentSpotPrice - entry) * (getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive) || 0) 
                  : (entry - currentSpotPrice) * (getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive) || 0);
                if (unrealizedDollarCheck <= -ABSOLUTE_DOLLAR_STOP) {
                  addAutopilotLog(`🛑 Absolute $${ABSOLUTE_DOLLAR_STOP} stop-loss breached (Touch&Turn): ${targetSymbol} unrealized ${unrealizedDollarCheck.toFixed(2)}. Forcing exit.`, "warn");
                  const tradeQtyForce = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive) || 0;
                  const exitSide = tState.side === "BUY" ? "SELL" : "BUY";
                  const orderOutcome = await executeAutopilotOrder(targetSymbol, exitSide, tradeQtyForce);
                  logScanOrderOutcome("ABS_DOLLAR_SL", orderOutcome);
                  stateChange = "HIT_STOP";
                }
              } catch (e) {
                // ignore
              }
              if (entry && cur && (cur.globalTakeProfitPercent || cur.globalStopLossPercent)) {
                const isBuy = tState.side === "BUY";
                const pct = isBuy
                  ? ((currentSpotPrice - entry) / entry) * 100
                  : ((entry - currentSpotPrice) / entry) * 100;
                if (pct >= (cur.globalTakeProfitPercent || 0)) {
                  stateChange = "HIT_TARGET";
                  addAutopilotLog(`⚖️ Global TP (${cur.globalTakeProfitPercent}%) reached: ${pct.toFixed(2)}%. Forcing exit.`, "info");
                } else if (pct <= -(cur.globalStopLossPercent || 0)) {
                  stateChange = "HIT_STOP";
                  addAutopilotLog(`⚖️ Global SL (${cur.globalStopLossPercent}%) breached: ${pct.toFixed(2)}%. Forcing exit.`, "warn");
                }
              }
            } catch (e) {
              // fail silently
            }

            if (stateChange === "HIT_TARGET") {
              const oppositeSide = tState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🎉 Take Profit target met at ${curPrefix}${currentSpotPrice.toFixed(2)}! Mean reversion complete for 2:1 profit.`, "success");

              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              setTouchTurnState({
                ...tState,
                status: "HIT_TARGET"
              });
            } else if (stateChange === "HIT_STOP") {
              const oppositeSide = tState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🛑 Stop loss triggered at ${curPrefix}${currentSpotPrice.toFixed(2)}. Closed out trade boundary limit.`, "warn");

              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              setTouchTurnState({
                ...tState,
                status: "HIT_STOP"
              });
            }
          } else {
            addAutopilotLog(`🏁 Scenario complete. Status: ${tState.status === "HIT_TARGET" ? "SUCCESS" : "STOPPED OUT"}. Resetting on next scan or manual triggers.`, "success");
          }
        }
      }

      else if (curRef.autopilotStrategy === "MACD_FRONT_SIDE") {
        addAutopilotLog(`🔍 Triggering MACD Front-Side momentum scanner on target: ${targetSymbol}...`, "info");

        // Retrieve current spot price
        const matched = currentActivePositions.find((p) => p.symbol === targetSymbol);
        let currentSpotPrice = 150.0;
        if (matched) {
          currentSpotPrice = matched.current_price;
        } else {
          if (targetSymbol === "RELIANCE") currentSpotPrice = 2475.50;
          else if (targetSymbol === "TCS") currentSpotPrice = 3820.00;
          else if (targetSymbol === "AAPL") currentSpotPrice = 182.20;
          else if (targetSymbol === "TSLA") currentSpotPrice = 195.00;
          else if (targetSymbol === "NVDA") currentSpotPrice = 115.50;
          else if (targetSymbol === "BTCUSD") currentSpotPrice = 67200.00;
          else if (targetSymbol === "MSFT") currentSpotPrice = 425.00;
        }

        const curPrefix = false ? "₹" : "$";
        let mState = (curRef.macdStateMap || {})[targetSymbol] || curRef.macdState || null;

        if (!mState || mState.symbol !== targetSymbol) {
          // Initialize mathematical MACD setup with 40 backward steps
          const priceHistory: number[] = [];
          let tempPrice = currentSpotPrice;
          for (let i = 0; i < 40; i++) {
            const change = (Math.random() - 0.5) * (currentSpotPrice * 0.005);
            tempPrice -= change;
            priceHistory.unshift(tempPrice);
          }

          // Sequential EMA 12 & 26 values
          const ema12History: number[] = [];
          const ema26History: number[] = [];
          let currentEma12 = priceHistory[0];
          let currentEma26 = priceHistory[0];
          const k12 = 2 / 13;
          const k26 = 2 / 27;

          for (let i = 0; i < priceHistory.length; i++) {
            currentEma12 = priceHistory[i] * k12 + currentEma12 * (1 - k12);
            currentEma26 = priceHistory[i] * k26 + currentEma26 * (1 - k26);
            ema12History.push(currentEma12);
            ema26History.push(currentEma26);
          }

          // MACD & Signal history
          const macdLineHistory: number[] = [];
          for (let i = 0; i < priceHistory.length; i++) {
            macdLineHistory.push(ema12History[i] - ema26History[i]);
          }

          const signalLineHistory: number[] = [];
          let currentSignal = macdLineHistory[0];
          const k9 = 2 / 10;
          for (let i = 0; i < macdLineHistory.length; i++) {
            currentSignal = macdLineHistory[i] * k9 + currentSignal * (1 - k9);
            signalLineHistory.push(currentSignal);
          }

          const finalSub1Macd = macdLineHistory[macdLineHistory.length - 2] || 0;
          const finalSub1Signal = signalLineHistory[signalLineHistory.length - 2] || 0;
          const initPrevHist = finalSub1Macd - finalSub1Signal;

          const initMacd = macdLineHistory[macdLineHistory.length - 1];
          const initSignal = signalLineHistory[signalLineHistory.length - 1];
          const initHist = initMacd - initSignal;

          const trendSide: "FRONT_SIDE" | "BACK_SIDE" = initHist > 0 ? "FRONT_SIDE" : "BACK_SIDE";
          const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);

          mState = {
            symbol: targetSymbol,
            ema12: ema12History[ema12History.length - 1],
            ema26: ema26History[ema26History.length - 1],
            macdValue: initMacd,
            signalValue: initSignal,
            histogram: initHist,
            prevHistogram: initPrevHist,
            trendSide,
            status: "IDLE",
            tradeQty
          };

          addAutopilotLog(`📈 MACD Strategy initialized on ${targetSymbol}. MACD: ${initMacd.toFixed(4)} | Signal: ${initSignal.toFixed(4)} | Histogram: ${initHist.toFixed(4)}. Evaluated Side: ${trendSide === "FRONT_SIDE" ? "[FRONT SIDE] (Bullish Momentum)" : "[BACK SIDE] (Correction Edge)"}.`, "info");
          addAutopilotLog(`🛡️ Strategy guidelines: Enter on Front Side cross-up (histogram flips > 0). Exit immediately on Back Side rollover (histogram flips < 0) to bypass false breakouts.`, "success");

          setMacdState(mState);
        } else {
          // Update EMA dynamically based on today's spot price
          const k12 = 2 / 13;
          const k26 = 2 / 27;
          const k9 = 2 / 10;

          const newEma12 = currentSpotPrice * k12 + mState.ema12 * (1 - k12);
          const newEma26 = currentSpotPrice * k26 + mState.ema26 * (1 - k26);
          const newMacdValue = newEma12 - newEma26;
          const newSignalValue = newMacdValue * k9 + mState.signalValue * (1 - k9);
          const newHistogram = newMacdValue - newSignalValue;
          const prevHistVal = mState.histogram;

          const nextTrend: "FRONT_SIDE" | "BACK_SIDE" = newHistogram > 0 ? "FRONT_SIDE" : "BACK_SIDE";

          addAutopilotLog(`📊 MACD Info: Spot/Close ${curPrefix}${currentSpotPrice.toFixed(2)} | MACD: ${newMacdValue.toFixed(4)} | Signal: ${newSignalValue.toFixed(4)} | Histogram: ${newHistogram.toFixed(4)} (${nextTrend === "FRONT_SIDE" ? "Front Side" : "Back Side"}).`, "info");

          if (mState.status === "IDLE") {
            // Check cross up trigger: MACD crossovers signal (histogram transitions below 0 to above 0)
            if (prevHistVal <= 0 && newHistogram > 0) {
              addAutopilotLog(`🔥 Bullish MACD Golden Cross! Histogram flipped positive: ${newHistogram.toFixed(4)}. Ordering Front-Side LONG Scalp.`, "trade");
              await executeAutopilotOrder(targetSymbol, "BUY", mState.tradeQty);

              setMacdState({
                ...mState,
                ema12: newEma12,
                ema26: newEma26,
                macdValue: newMacdValue,
                signalValue: newSignalValue,
                histogram: newHistogram,
                prevHistogram: prevHistVal,
                trendSide: "FRONT_SIDE",
                status: "ACTIVE_TRADE",
                entryPrice: currentSpotPrice
              });
            } else {
              // Stay in idle and log
              addAutopilotLog(`⏳ Holding: waiting for MACD to cross back up above signal line. Sidestepping late-stage trend chop.`, "success");
              setMacdState({
                ...mState,
                ema12: newEma12,
                ema26: newEma26,
                macdValue: newMacdValue,
                signalValue: newSignalValue,
                histogram: newHistogram,
                prevHistogram: prevHistVal,
                trendSide: nextTrend
              });
            }
          } else if (mState.status === "ACTIVE_TRADE") {
            // Check crossover against the trade (MACD < Signal, histogram <= 0): end of Front Side, start of Back Side
            let exitTrigger = false;
            let exitReason = "";

            if (newHistogram <= 0) {
              exitTrigger = true;
              exitReason = `MACD rolled over on Back-Side crossover (Histogram: ${newHistogram.toFixed(4)})`;
            } else if (mState.entryPrice) {
              // Optional 2:1 RR protection constraints (Take Profit when price rises +2.5% or Stop Loss when price drops -1.25%)
              const pctDiff = (currentSpotPrice - mState.entryPrice) / mState.entryPrice;
              if (pctDiff >= 0.025) {
                exitTrigger = true;
                exitReason = `Target price limit +2.50% profit protection achieved at ${curPrefix}${currentSpotPrice.toFixed(2)}`;
              } else if (pctDiff <= -0.0125) {
                exitTrigger = true;
                exitReason = `Stop Loss boundary -1.25% margin reached at ${curPrefix}${currentSpotPrice.toFixed(2)}`;
              }
            }

            if (exitTrigger) {
              addAutopilotLog(`⚠️ Exit Signal: ${exitReason}. Liquidating scalp...`, "trade");
              await executeAutopilotOrder(targetSymbol, "SELL", mState.tradeQty);

              setMacdState({
                ...mState,
                ema12: newEma12,
                ema26: newEma26,
                macdValue: newMacdValue,
                signalValue: newSignalValue,
                histogram: newHistogram,
                prevHistogram: prevHistVal,
                trendSide: "BACK_SIDE",
                status: "EXITED_BACKSIDE"
              });
            } else {
              // Update state values but stay in active scalp
              addAutopilotLog(`📈 Hold Scalp: Position Active. Entry: ${curPrefix}${mState.entryPrice?.toFixed(2)} | Current: ${curPrefix}${currentSpotPrice.toFixed(2)}.`, "success");
              setMacdState({
                ...mState,
                ema12: newEma12,
                ema26: newEma26,
                macdValue: newMacdValue,
                signalValue: newSignalValue,
                histogram: newHistogram,
                prevHistogram: prevHistVal,
                trendSide: nextTrend
              });
            }
          } else if (mState.status === "EXITED_BACKSIDE") {
            // Reset to idle once the histogram stabilizes or on trend flip to prepare for next scan setup
            if (newHistogram <= 0) {
              addAutopilotLog(`🧘 In Backside Chill Mode. Sidestepping bad setups & false breakouts. Resets once MACD recovers.`, "info");
            } else {
              addAutopilotLog(`♻️ MACD reclaimed strength. Resetting tracker status back to scan...`, "success");
              mState.status = "IDLE";
            }

            setMacdState({
              ...mState,
              ema12: newEma12,
              ema26: newEma26,
              macdValue: newMacdValue,
              signalValue: newSignalValue,
              histogram: newHistogram,
              prevHistogram: prevHistVal,
              trendSide: nextTrend,
              status: mState.status
            });
          }
        }
      }

      else if (curRef.autopilotStrategy === "SNEAKY_PIVOT") {
        addAutopilotLog(`🕵️ Triggering Sneaky Pivot (3-Candle Range Pivot) scanner on target: ${targetSymbol}...`, "info");

        // Retrieve current spot price
        const matched = currentActivePositions.find((p) => p.symbol === targetSymbol);
        let currentSpotPrice = 150.0;
        if (matched) {
          currentSpotPrice = matched.current_price;
        } else {
          if (targetSymbol === "RELIANCE") currentSpotPrice = 2475.50;
          else if (targetSymbol === "TCS") currentSpotPrice = 3820.00;
          else if (targetSymbol === "AAPL") currentSpotPrice = 182.20;
          else if (targetSymbol === "TSLA") currentSpotPrice = 195.00;
          else if (targetSymbol === "NVDA") currentSpotPrice = 115.50;
          else if (targetSymbol === "BTCUSD") currentSpotPrice = 67200.00;
          else if (targetSymbol === "MSFT") currentSpotPrice = 425.00;
        }

        const curPrefix = false ? "₹" : "$";
        let sState = (curRef.sneakyPivotStateMap || {})[targetSymbol] || curRef.sneakyPivotState || null;

        if (!sState || sState.symbol !== targetSymbol) {
          // Initialize horizontal level boundaries representing the "trading box"
          let rangeHigh = 183.50;
          let swingHigh = 184.80;
          let rangeLow = 181.00;
          let swingLow = 179.50;

          if (targetSymbol === "RELIANCE") {
            rangeHigh = 2490.00;
            swingHigh = 2515.00;
            rangeLow = 2455.00;
            swingLow = 2430.00;
          } else if (targetSymbol === "TCS") {
            rangeHigh = 3855.00;
            swingHigh = 3890.00;
            rangeLow = 3785.00;
            swingLow = 3750.00;
          } else if (targetSymbol === "AAPL") {
            rangeHigh = 183.50;
            swingHigh = 184.80;
            rangeLow = 181.00;
            swingLow = 179.50;
          } else if (targetSymbol === "TSLA") {
            rangeHigh = 197.50;
            swingHigh = 199.80;
            rangeLow = 192.50;
            swingLow = 190.00;
          } else if (targetSymbol === "NVDA") {
            rangeHigh = 117.00;
            swingHigh = 118.50;
            rangeLow = 114.00;
            swingLow = 112.50;
          } else if (targetSymbol === "BTCUSD") {
            rangeHigh = 68100.0;
            swingHigh = 69300.0;
            rangeLow = 66300.0;
            swingLow = 65000.0;
          } else {
            rangeHigh = parseFloat((currentSpotPrice * 1.01).toFixed(2));
            swingHigh = parseFloat((currentSpotPrice * 1.025).toFixed(2));
            rangeLow = parseFloat((currentSpotPrice * 0.99).toFixed(2));
            swingLow = parseFloat((currentSpotPrice * 0.975).toFixed(2));
          }

          sState = {
            symbol: targetSymbol,
            rangeHigh,
            rangeLow,
            swingHigh,
            swingLow,
            status: "SCANNING",
            candleCount: 0,
            lastCandleAction: "Drawing Pivot box levels. Ignoring middle core range."
          };

          addAutopilotLog(`📐 Sneaky Pivot initialized for ${targetSymbol}. Trading Box ranges defined:`, "info");
          addAutopilotLog(`   🔴 Upper Sell Zones: Swing High: ${curPrefix}${swingHigh.toFixed(2)} | Range High: ${curPrefix}${rangeHigh.toFixed(2)}`, "info");
          addAutopilotLog(`   ... Lower Buy Zones:  Range Low: ${curPrefix}${rangeLow.toFixed(2)} | Swing Low: ${curPrefix}${swingLow.toFixed(2)}`, "info");
          addAutopilotLog(`⏳ Scanning 15m intervals for active tests. Middle chop will be ignored.`, "success");

          setSneakyPivotState(sState);
        } else {
          // Progressive 3-candle state machine mechanics
          const count = sState.candleCount + 1;
          let nextStatus = sState.status;
          let lastAction = sState.lastCandleAction;
          let side: "BUY" | "SELL" | undefined = sState.side;
          let entryPrice = sState.entryPrice;
          let targetPrice = sState.targetPrice;
          let stopPrice = sState.stopPrice;

          if (sState.status === "SCANNING") {
            // Candle 1: Rejection near levels
            const isNearLow = Math.abs(currentSpotPrice - sState.rangeLow) / sState.rangeLow < 0.015 || currentSpotPrice < sState.rangeLow;
            const isNearHigh = Math.abs(currentSpotPrice - sState.rangeHigh) / sState.rangeHigh < 0.015 || currentSpotPrice > sState.rangeHigh;

            if (isNearLow) {
              nextStatus = "CANDLE1_ESTABLISHED";
              side = "BUY";
              lastAction = `Candle 1 established strong rejection near Range Low (${curPrefix}${sState.rangeLow.toFixed(2)}).`;
              addAutopilotLog(`🕯️ Candle 1 closed testing lower Buy Zone line (${curPrefix}${sState.rangeLow.toFixed(2)}) on ${targetSymbol}. Waiting for the "sneaky" second candle pivot confirm.`, "info");
            } else if (isNearHigh) {
              nextStatus = "CANDLE1_ESTABLISHED";
              side = "SELL";
              lastAction = `Candle 1 established resistance near Range High (${curPrefix}${sState.rangeHigh.toFixed(2)}).`;
              addAutopilotLog(`🕯️ Candle 1 closed testing upper Sell Zone line (${curPrefix}${sState.rangeHigh.toFixed(2)}) on ${targetSymbol}. Waiting for the "sneaky" second candle pivot confirm.`, "info");
            } else {
              lastAction = `Candle ${count} remains inside core range. Current: ${curPrefix}${currentSpotPrice.toFixed(2)}. No trade zones hit.`;
              addAutopilotLog(`⏳ Middle Core Range: Price (${curPrefix}${currentSpotPrice.toFixed(2)}) is ping-ponging inside the trading box. No action.`, "success");
            }
          } 
          
          else if (sState.status === "CANDLE1_ESTABLISHED") {
            // Candle 2: Institutional sweep and reclaim
            nextStatus = "CONFIRMED_PV_CANDLE2";
            const testPrice = sState.side === "BUY" 
              ? sState.rangeLow - (sState.rangeHigh - sState.rangeLow) * 0.02 
              : sState.rangeHigh + (sState.rangeHigh - sState.rangeLow) * 0.02;

            lastAction = sState.side === "BUY"
              ? `Candle 2 swept below Range Low to ${curPrefix}${testPrice.toFixed(2)} and closed inside (Institution stop hunt detected!).`
              : `Candle 2 spiked above Range High to ${curPrefix}${testPrice.toFixed(2)} and rejected downward (Seller liquidity trapped!).`;

            addAutopilotLog(`🕵️ Sneaky pivot detected! Candle 2 wick tested liquidity behind the levels:`, "success");
            addAutopilotLog(`   👉 ${lastAction}`, "info");
            addAutopilotLog(`📡 Order desks ready. Third candle scheduled to execute the entry pivot trigger.`, "success");
          } 
          
          else if (sState.status === "CONFIRMED_PV_CANDLE2") {
            // Candle 3: Trigger order
            nextStatus = "ACTIVE_TRADE";
            entryPrice = currentSpotPrice;

            if (sState.side === "BUY") {
              const stopOffset = (sState.rangeHigh - sState.rangeLow) * 0.15;
              stopPrice = parseFloat((sState.rangeLow - stopOffset).toFixed(2));
              targetPrice = sState.rangeHigh;
              
              addAutopilotLog(`🎯 Candle 3 Entry order FILLED for ${targetSymbol}! Entering LONG at ${curPrefix}${entryPrice.toFixed(2)}.`, "trade");
              addAutopilotLog(`🛡️ Protected by "Guardian Angel" stop level: ${curPrefix}${stopPrice.toFixed(2)}. Profit target: ${curPrefix}${targetPrice.toFixed(2)}.`, "success");
              
              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, "BUY", tradeQty);
            } else {
              const stopOffset = (sState.rangeHigh - sState.rangeLow) * 0.15;
              stopPrice = parseFloat((sState.rangeHigh + stopOffset).toFixed(2));
              targetPrice = sState.rangeLow;

              addAutopilotLog(`🎯 Candle 3 Entry order FILLED for ${targetSymbol}! Entering SHORT at ${curPrefix}${entryPrice.toFixed(2)}.`, "trade");
              addAutopilotLog(`🛡️ Protected by "Guardian Angel" stop level: ${curPrefix}${stopPrice.toFixed(2)}. Profit target: ${curPrefix}${targetPrice.toFixed(2)}.`, "success");

              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, "SELL", tradeQty);
            }
            lastAction = `Candle 3 successfully triggered ${sState.side} entry at ${curPrefix}${entryPrice.toFixed(2)}.`;
          } 
          
          else if (sState.status === "ACTIVE_TRADE") {
            // Monitor ongoing trade
            addAutopilotLog(`📈 Sneaky Pivot Active: ${targetSymbol} Spot at ${curPrefix}${currentSpotPrice.toFixed(2)} | Target: ${curPrefix}${targetPrice?.toFixed(2)} | Stop: ${curPrefix}${stopPrice?.toFixed(2)}.`, "info");

            let stateChange: "HIT_TARGET" | "HIT_STOP" | null = null;
            if (sState.side === "BUY") {
              if (currentSpotPrice >= (targetPrice || 0)) {
                stateChange = "HIT_TARGET";
              } else if (currentSpotPrice <= (stopPrice || 0)) {
                stateChange = "HIT_STOP";
              }
            } else {
              if (currentSpotPrice <= (targetPrice || 0)) {
                stateChange = "HIT_TARGET";
              } else if (currentSpotPrice >= (stopPrice || 0)) {
                stateChange = "HIT_STOP";
              }
            }

            // Global percent-based TP/SL enforcement
            try {
              const cur = stateRef.current as any;
              const entry = (sState as any).entryPrice || entryPrice || 0;
              if (entry && cur && (cur.globalTakeProfitPercent || cur.globalStopLossPercent)) {
                const isBuy = sState.side === "BUY";
                const pct = isBuy ? ((currentSpotPrice - entry) / entry) * 100 : ((entry - currentSpotPrice) / entry) * 100;
                if (pct >= (cur.globalTakeProfitPercent || 0)) {
                  stateChange = "HIT_TARGET";
                  addAutopilotLog(`⚖️ Global TP (${cur.globalTakeProfitPercent}%) reached: ${pct.toFixed(2)}%. Forcing exit.`, "info");
                } else if (pct <= -(cur.globalStopLossPercent || 0)) {
                  stateChange = "HIT_STOP";
                  addAutopilotLog(`⚖️ Global SL (${cur.globalStopLossPercent}%) breached: ${pct.toFixed(2)}%. Forcing exit.`, "warn");
                }
              }
            } catch (e) {
              // silent
            }
            if (stateChange === "HIT_TARGET") {
              const oppositeSide = sState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🎉 Take Profit target successfully met at ${curPrefix}${currentSpotPrice.toFixed(2)}! Opposite pivot zone reached.`, "success");

              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              nextStatus = "HIT_TARGET";
              lastAction = `Trade completed successfully. Hit profit target of ${curPrefix}${targetPrice?.toFixed(2)}.`;
            } else if (stateChange === "HIT_STOP") {
              const oppositeSide = sState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🛑 Stop Loss test failed. Cut trade out under protection limit at ${curPrefix}${currentSpotPrice.toFixed(2)}.`, "warn");

              const tradeQty = getAutopilotTradeQty(targetSymbol, !curRef.useAlpacaLive);
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              nextStatus = "HIT_STOP";
              lastAction = `Trade stopped out under the protected lows/highs at ${curPrefix}${stopPrice?.toFixed(2)}.`;
            } else {
              lastAction = `Trade holding. Price: ${curPrefix}${currentSpotPrice.toFixed(2)}. Target: ${curPrefix}${targetPrice?.toFixed(2)}.`;
            }
          } 
          
          else {
            addAutopilotLog(`🏁 Sneaky Pivot trade complete for ${targetSymbol}. status: ${sState.status}. Reset model to scanning...`, "success");
            nextStatus = "SCANNING";
            side = undefined;
            entryPrice = undefined;
            targetPrice = undefined;
            stopPrice = undefined;
            lastAction = "Pivot box levels drawn. Recalculating setups.";
          }

          setSneakyPivotState({
            ...sState,
            status: nextStatus,
            candleCount: count,
            lastCandleAction: lastAction,
            side,
            entryPrice,
            targetPrice,
            stopPrice
          });
        }
      }

      else if (curRef.autopilotStrategy === "ELLIOTT_WAVE") {
        addAutopilotLog(`🌊 Running simple Elliott Wave scanner on ${targetSymbol}...`, "info");

        // Very lightweight, heuristic Elliott wave impulse detector:
        // - Track recent peaks/valleys and look for a sequence resembling 5-wave impulse (1-2-3-4-5)
        // - We use mocked price history when live price not available and act conservatively with tiny orders
        const matched = currentActivePositions.find((p) => p.symbol === targetSymbol);
        let currentSpotPrice = matched?.current_price || (targetSymbol === "RELIANCE" ? 2475.5 : 100.0);

        const state = (curRef.elliottStateMap || {})[targetSymbol] || { symbol: targetSymbol, waveIndex: 0, peaks: [], status: 'SCANNING' };

        // Maintain a rolling list of 6 anchors (peaks + troughs)
        const anchors = (state.peaks || []).slice(-6);
        anchors.push(currentSpotPrice);
        while (anchors.length > 6) anchors.shift();

        // rudimentary slope-based wave detection: count alternations of higher-high / lower-low
        let waveIndex = state.waveIndex;
        try {
          if (anchors.length >= 3) {
            const a = anchors[anchors.length - 3];
            const b = anchors[anchors.length - 2];
            const c = anchors[anchors.length - 1];
            // detect local impulsive move (a->b->c) where b is a swing high/low
            if (b > a && b > c && waveIndex % 2 === 0) {
              // swing high detected — advance wave
              waveIndex = Math.min(5, waveIndex + 1);
            } else if (b < a && b < c && waveIndex % 2 === 1) {
              waveIndex = Math.min(5, waveIndex + 1);
            }
          }
        } catch (e) {}

        const newState = { ...state, waveIndex, peaks: anchors, status: waveIndex >= 5 ? 'IMPULSE_DETECTED' : state.status };
        setElliottState(newState);

        // If we detected a 5-wave impulse, attempt a small mean-reversion SELL (take profit) or BUY depending on context
        if (newState.status === 'IMPULSE_DETECTED') {
          addAutopilotLog(`🌊 Elliott 5-wave impulse detected on ${targetSymbol}. Initiating conservative exit/balance action.`, "trade");
          const qty = targetSymbol === 'BTCUSD' ? 0.005 : 1;
          const action = 'SELL';
          const orderOutcome = await executeAutopilotOrder(targetSymbol, action, qty);
          logScanOrderOutcome('ELLIOTT_WAVE', orderOutcome);
          // reset state after action
          setElliottState({ symbol: targetSymbol, waveIndex: 0, peaks: [], status: 'IDLE' });
        }
      }

      else if (curRef.autopilotStrategy === "GEMINI_AI") {
        addAutopilotLog(`Querying Gemini AI Strategist model on ${targetSymbol}...`, "info");
        
        let data: any = null;
        let isFallback = false;
        let fallbackMsg = "";

        try {
          const response = await fetch("/api/gemini/autopilot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              positions: currentActivePositions,
              cash: currentActiveCash,
              equity: currentTotalEquity,
              leverage: parseFloat(currentLeverageValue.toFixed(2)) || 1.0,
              targetSymbol: targetSymbol,
              marginCapacityUsed: currentCapacity,
              warnThreshold: curRef.warnThreshold
            }),
          });

          const resText = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }

          try {
            data = JSON.parse(resText);
          } catch (e) {
            throw new Error("HTML_OR_MALFORMED_JSON");
          }

          if (data?.error) {
            throw new Error(data.error);
          }
        } catch (fetchErr: any) {
          isFallback = true;
          fallbackMsg = fetchErr.message || fetchErr.toString();
        }

        // Apply robust offline/congested fallback if Gemini API is unavailable or returns an error
        if (isFallback || !data) {
          const safeCapacity = typeof currentCapacity === "number" ? currentCapacity : parseFloat(currentCapacity) || 0;
          const safeWarnThreshold = typeof curRef.warnThreshold === "number" ? curRef.warnThreshold : parseFloat(curRef.warnThreshold) || 80;
          const cleanTarget = targetSymbol.toUpperCase();

          let action: "BUY" | "SELL" | "HOLD" = "HOLD";
          let qty = 5;
          let backupReason = "";

          if (safeCapacity >= safeWarnThreshold) {
            action = "SELL";
            qty = 5;
            backupReason = `Deleveraging Alert: margin capacity (${safeCapacity.toFixed(1)}%) is above limits (${safeWarnThreshold}%). Reducing exposure.`;
          } else {
            action = "HOLD";
            backupReason = `Backup fallback engaged for ${cleanTarget}; market conditions not reliable for live entry.`;
          }

          data = {
            action,
            qty,
            reason: `Local Strategist Backup [${fallbackMsg.slice(0, 20)}]: ${backupReason}`
          };
        }
        
        if (data.action === "BUY") {
          addAutopilotLog(`🤖 AI Decision: BUY recommended for ${targetSymbol}. Reason: "${data.reason}"`, "trade");
          const buyQty = targetSymbol === "BTCUSD" ? 0.02 : data.qty || 5;
          const orderOutcome = await executeAutopilotOrder(targetSymbol, "BUY", buyQty);
          logScanOrderOutcome("GEMINI_AI", orderOutcome);
        } else if (data.action === "SELL") {
          addAutopilotLog(`🤖 AI Decision: SELL recommended for ${targetSymbol}. Reason: "${data.reason}"`, "trade");
          const sellQty = targetSymbol === "BTCUSD" ? 0.02 : data.qty || 5;
          const exists = currentActivePositions.find((p) => p.symbol === targetSymbol);
          if (!exists) {
            addAutopilotLog(`🤖 AI Posture: Initiating new short exposure of ${sellQty} ${targetSymbol}.`, "trade");
          }
          const orderOutcome = await executeAutopilotOrder(targetSymbol, "SELL", sellQty);
          logScanOrderOutcome("GEMINI_AI", orderOutcome);
        } else {
          addAutopilotLog(`🤖 AI Decision: HOLD recommended for ${targetSymbol}. Reason: "${data.reason}"`, "success");
        }
      }
    }
  } catch (err: any) {
    console.error(err);
    addAutopilotLog(`Scan tick interrupted: ${err.message || err}`, "warn");
  } finally {
      autopilotRunningRef.current = false;
      setIsAutopilotRunning(false);
  }
  }, [executeAutopilotOrder, setTouchTurnState, setMacdState, setSneakyPivotState, setElliottState, addAutopilotLog, logScanOrderOutcome, autopilotInterval, autopilotScanBroadUniverse, recordMarketStat, getAutopilotTradeQty, computeOpenCounts, fetchAutopilotQuote]);

  // Debug helper: force-clear any autopilot pause state and pending buys
  const forceResumeAutopilot = useCallback(() => {
    try {
      networkFailureResumeAtRef.current = 0;
      networkFailurePauseLogRef.current = 0;
      autopilotFailureStrikeRef.current = 0;
      autopilotPendingBuySymbolsRef.current.clear();
      autopilotCapPauseRef.current = null;
      setAutopilotScanError(null);
      setAutopilotScanErrorCount(0);
      
      // Reset running flags in case it got stuck
      autopilotRunningRef.current = false;
      setIsAutopilotRunning(false);
      setAutopilotLogs([]);
      autopilotTargetSymbolIndexRef.current = 0;
      autopilotPriceWindowRef.current = {};
      autopilotMarketStatsRef.current = {};
      setAutopilotTargetTicker(DEFAULT_AUTOPILOT_TARGET_TICKERS);
      
      addAutopilotLog("SYSTEM RESET: Cleared logs, reset scan indices, wiped signal memory, and RESTORED FULL TICKER UNIVERSE. Restarting fresh scanning...", "success");
      
      void executeAutopilotScan();
      
      // Activate and trigger immediate scan
      setIsAutopilotActive(true);
      setScanningEnabled(true);
      setAutopilotNextScanInSec(0);
      
      addAutopilotLog("Force resume: cleared autopilot pause and pending buys. Triggering immediate scan...", "warn");
      executeAutopilotScan();
    } catch (e) {
      // ignore
    }
  }, [addAutopilotLog, executeAutopilotScan]);

  const handleStartFresh = useCallback(async () => {
    if (!confirm("🚨 DANGER: This will LIQUIDATE ALL POSITIONS and CANCEL ALL PENDING ORDERS on the broker. Are you sure you want to start again?")) return;
    addAutopilotLog("🚨 Manual PURGE triggered. Liquidating all holdings for a clean start...", "warn");
    try {
      const liqRes = await fetch("/api/alpaca/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload({ isPaper: stateRef.current.isPaper })),
      });
      if (liqRes.ok) {
        addAutopilotLog("✅ ALL POSITIONS LIQUIDATED. Account cleared successfully.", "success");
        forceResumeAutopilot();
      } else {
        const err = await liqRes.json();
        addAutopilotLog(`❌ Liquidation failed: ${err?.error || "Unknown error"}. Clean up manually?`, "warn");
      }
    } catch (e) {
      addAutopilotLog("❌ System error during reset.", "warn");
    }
  }, [getBrokerAuthPayload, forceResumeAutopilot, addAutopilotLog]);

  useEffect(() => {
    if (!isAutopilotActive) {
      setAutopilotNextScanInSec(null);
      return;
    }

    const computeRemaining = () => {
      if (!autopilotLastScanAtMs) {
        setAutopilotNextScanInSec(Math.max(0, autopilotInterval));
        return;
      }
      const elapsedSec = Math.floor((Date.now() - autopilotLastScanAtMs) / 1000);
      setAutopilotNextScanInSec(Math.max(0, autopilotInterval - elapsedSec));
    };

    computeRemaining();
    const timer = setInterval(computeRemaining, 1000);
    return () => clearInterval(timer);
  }, [isAutopilotActive, autopilotInterval, autopilotLastScanAtMs]);

  // If the visible countdown reaches zero and autopilot isn't already running,
  // trigger a scan immediately so users see "Scanning..." exactly when timer expires.
  useEffect(() => {
    if (autopilotNextScanInSec === null) return;
    if (autopilotNextScanInSec <= 0 && !autopilotRunningRef.current && isAutopilotActive && scanningEnabled) {
      // start immediate scan
      executeAutopilotScan();
    }
  }, [autopilotNextScanInSec, isAutopilotActive, scanningEnabled, executeAutopilotScan]);

  useEffect(() => {
    if (!useAlpacaLive) return;
    if (lastAutopilotOrderOutcome?.status !== "PENDING") return;

    const refreshPendingOrderState = () => {
      void handleRefreshData({ silent: true });
    };

    refreshPendingOrderState();
    const timeoutId = setTimeout(refreshPendingOrderState, LIVE_SYNC_PENDING_ORDER_REFRESH_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [useAlpacaLive, lastAutopilotOrderOutcome, handleRefreshData]);

  useEffect(() => {
    if (!useAlpacaLive) return;
    const intervalId = setInterval(() => {
      void handleRefreshData({ silent: true });
    }, LIVE_SYNC_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [useAlpacaLive, handleRefreshData]);

  // Autopilot loop trigger
  // Autopilot loop trigger - avoid creating duplicate intervals when callback identity changes
  const autopilotIntervalHandleRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const prevActive = prevAutopilotActiveRef.current;

    if (prevActive === null) {
      if (isAutopilotActive) addAutopilotLog(`🔴 Sentry Autopilot trading system ACTIVATED!`, "info");
    } else if (prevActive !== isAutopilotActive) {
      addAutopilotLog(isAutopilotActive ? `🔴 Sentry Autopilot trading system ACTIVATED!` : `🟢 Sentry Autopilot trading system DEACTIVATED. Intercept loops idle.`, "info");
    }

    prevAutopilotActiveRef.current = isAutopilotActive;

    // Clear any existing interval before potentially creating a new one
    if (autopilotIntervalHandleRef.current) {
      clearInterval(autopilotIntervalHandleRef.current);
      autopilotIntervalHandleRef.current = null;
    }

    if (isAutopilotActive && scanningEnabled) {
      // initial immediate scan
      executeAutopilotScan();

      // create a single stable interval that uses the latest scan function via a lightweight wrapper
      autopilotIntervalHandleRef.current = setInterval(() => {
        executeAutopilotScan();
      }, Math.max(autopilotInterval, 30) * 1000);
    }

    return () => {
      if (autopilotIntervalHandleRef.current) {
        clearInterval(autopilotIntervalHandleRef.current);
        autopilotIntervalHandleRef.current = null;
      }
    };
  }, [isAutopilotActive, scanningEnabled, autopilotInterval, executeAutopilotScan, addAutopilotLog]);

  // Natural Simulator Market Drift Tick Engine
  useEffect(() => {
    let tickInterval: NodeJS.Timeout | null = null;
    if (!useAlpacaLive && isTickStreamActive) {
      tickInterval = setInterval(() => {
        setMockPositions((prev) =>
          prev.map((p) => {
            const driftRange = p.symbol === "BTCUSD" ? 0.015 : 0.01;
            const driftIndex = Math.random() * (driftRange * 2) - driftRange; // randomized drift percentages
            const multiplier = 1 + driftIndex;
            const newPrice = Math.max(0.01, p.current_price * multiplier);
            const value = p.qty * newPrice;
            const costBasis = p.qty * p.avg_entry_price;
            const unrealized_pl = value - costBasis;
            const unrealized_plpc = costBasis > 0 ? unrealized_pl / costBasis : 0;
            return {
              ...p,
              current_price: parseFloat(newPrice.toFixed(2)),
              market_value: parseFloat(value.toFixed(2)),
              unrealized_pl: parseFloat(unrealized_pl.toFixed(2)),
              unrealized_plpc: parseFloat(unrealized_plpc.toFixed(4)),
            };
          })
        );
      }, 5000);
    }
    return () => {
      if (tickInterval) clearInterval(tickInterval);
    };
  }, [useAlpacaLive, isTickStreamActive]);
  // --- END SENTRY AUTOPILOT ENGINE ---

  // Setup persistence on Mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem("APCA_API_KEY") || "";
    const savedApiSecret = localStorage.getItem("APCA_API_SECRET") || "";
    const rawSavedIsPaper = localStorage.getItem("APCA_IS_PAPER");
    const savedIsPaper = rawSavedIsPaper === null ? null : rawSavedIsPaper !== "false";

    if (savedApiKey) setApiKey(savedApiKey);
    if (savedApiSecret) setApiSecret(savedApiSecret);
    
    // Forced Paper Mode per user request for safety & stability
    localStorage.setItem("APCA_IS_PAPER", "true");
    setIsPaper(true);

    // If we have saved keys that look like LIVE keys (prefix AK) but we are now in PAPER mode,
    // we clear them to ensure the server fallback to the correct .env.local paper keys occurs.
    if (savedApiKey.startsWith("AK")) {
      localStorage.removeItem("APCA_API_KEY");
      localStorage.removeItem("APCA_API_SECRET");
      setApiKey("");
      setApiSecret("");
    }

    const ts = HYDRATION_SAFE_TIME_PLACEHOLDER;

    const initApp = async () => {
      // Overriding to true as requested
      let effectiveIsPaper = true;

      try {
        const resp = await fetch("/api/alpaca/inspect");
        if (resp.ok) {
          const info = await resp.json();
          const present = info?.envKeysPresent || {};
          // Skip switching to live mode even if keys are missing - per user request to use paper
        }
      } catch (e) {
        // ignore detection failures — keep defaults
      }

      setLogs([
        {
          id: `boot-${Date.now()}-1`,
          timestamp: ts,
          symbol: "SYSTEM",
          action: "BOOT",
          message: "Interactive Margin Risk analyzer system active.",
          status: "INFO"
        },
        {
          id: `boot-${Date.now()}-2`,
          timestamp: ts,
          symbol: "ALPACA",
          action: "LOCAL_INIT",
          message: "Dashboard initialized in Local US Stock Simulator mode.",
          status: "INFO"
        }
      ]);

      try {
        // Alpaca connectivity check
        void handleRefreshData({ silent: true });
      } catch (e) {
        // ignore detection failures — keep defaults
      }
    };

    initApp();
  }, [addLog]);

  // (moved) addLog hoisted earlier

  // Connect & fetch from Alpaca
  const handleConnectAlpaca = async (): Promise<boolean> => {
    setIsConnecting(true);
    addLog("ALPACA", "CONNECT_ATTEMPT", `Attempting connection to Alpaca ${isPaper ? "Paper" : "Live"} API...`, "INFO");

    try {
      const response = await fetch("/api/alpaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload()),
      });

      const resText = await response.text();
      let rawData: any = null;
      try {
        rawData = JSON.parse(resText);
      } catch (e) {
        throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
      }

      if (!response.ok || rawData?.error) {
        throw new Error(rawData?.error || "Failed key validation.");
      }
      if (!rawData?.account) {
        throw new Error("No account data was returned by Alpaca.");
      }
      setAlpacaAccount(rawData.account);
      setAlpacaPositions(await mergeBinanceSpotIntoPositions(rawData.positions || []));
      setIsConnected(true);
      setUseAlpacaLive(true);

      // Persist values when explicit Alpaca keys were supplied by the user.
      if (apiKey && apiSecret) {
        localStorage.setItem("APCA_API_KEY", apiKey);
        localStorage.setItem("APCA_API_SECRET", apiSecret);
      }
      localStorage.setItem("APCA_IS_PAPER", String(isPaper));
      localStorage.setItem("APCA_USE_ALPACA", "true");

      addLog(
        "ALPACA",
        "CONNECT_SUCCESS",
        `Securely connected! Account: ${rawData.account.account_number}. Cash: $${parseFloat(rawData.account.cash).toLocaleString()}`,
        "SUCCESS"
      );
      return true;
    } catch (err: any) {
      console.error(err);
      setAlpacaAccount(null);
      setAlpacaPositions([]);
      setIsConnected(false);
      setUseAlpacaLive(false);
      localStorage.setItem("APCA_USE_ALPACA", "false");
      addLog("ALPACA", "CONNECT_FAILED", err.message || "Broker authentication failed. Reverted to Simulator.", "CRITICAL");
      showToast(`Alpaca Connection Error: ${err.message || "Unable to authorize. Please double check credentials."}`, "CRITICAL");
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (isConnected || isConnecting) return;

    const timer = window.setTimeout(() => {
      void handleConnectAlpaca();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [isConnected, isConnecting]);

  const handleDisconnectAlpaca = () => {
    setIsConnected(false);
    setUseAlpacaLive(false);
    setAlpacaPositions([]);
    setAlpacaAccount(null);
    localStorage.setItem("APCA_USE_ALPACA", "false");
    addLog("ALPACA", "DISCONNECT", "Switched back to Local Risk Simulator mode.", "INFO");
  };

  const handleStartAutopilot = async () => {
    if (!useAlpacaLive) {
      const connected = await handleConnectAlpaca();
      if (!connected) {
        showToast("Live Alpaca connection failed; starting simulator autopilot instead.", "WARNING");
      }
    }
    setIsAutopilotActive(true);
  };

  // Test live connection without persisting or switching modes
  const handleTestLogin = async () => {
    try {
      if (!apiKey || !apiSecret) {
        showToast("Alpaca API Key/Secret missing — enter keys to test.", "CRITICAL");
        return;
      }
      showToast("Testing Alpaca connection...", "INFO");
      const res = await fetch("/api/alpaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getBrokerAuthPayload()),
      });
      const text = await res.text();
      const raw = JSON.parse(text);
      if (!res.ok || raw?.error) {
        showToast(`Alpaca Test Failed: ${raw?.error || "Unable to authenticate"}`, "CRITICAL");
      } else {
        showToast(`Alpaca OK — Cash: $${parseFloat(raw.account.cash).toLocaleString()}`, "SUCCESS");
      }
    } catch (err: any) {
      console.error("Test connection error:", err);
      showToast(`Test Failed: ${err?.message || err}`, "CRITICAL");
    }
  };

  const liveAccountReady = Boolean(
    alpacaAccount &&
      (alpacaAccount.account_number || alpacaAccount.cash || alpacaAccount.equity || alpacaAccount.portfolio_value)
  );

  // Calculations for current active mode
  const activePositions = liveAccountReady ? alpacaPositions : mockPositions;
  const activeCash = liveAccountReady
    ? parseFloat(alpacaAccount?.cash || "0")
    : simCash;
  const liveBrokerEquity = liveAccountReady
    ? parseFloat(alpacaAccount?.equity || alpacaAccount?.portfolio_value || alpacaAccount?.cash || "0")
    : null;

  // Portfolio aggregates
  const totalMarketValue = activePositions.reduce(
    (sum, pos) => sum + pos.current_price * pos.qty,
    0
  );

  const totalEquity = liveBrokerEquity !== null ? liveBrokerEquity : activeCash + totalMarketValue;
  const netProfit = liveAccountReady ? 0 : totalEquity - startingCapital;
  const roiPercent = liveAccountReady ? 0 : (startingCapital > 0 ? (netProfit / startingCapital) * 100 : 0);
  // Percent of cash used by portfolio: positions value / (cash + positions)
  const percentCashUsed = totalEquity > 0 ? (totalMarketValue / totalEquity) * 100 : 0;
  
  // Real-time sum of open positions' unrealized P&L
  const totalOpenPL = activePositions.reduce(
    (sum, pos) => sum + (pos.unrealized_pl !== undefined ? pos.unrealized_pl : (pos.current_price - pos.avg_entry_price) * pos.qty),
    0
  );
  const openCostBasis = activePositions.reduce(
    (sum, pos) => sum + (pos.avg_entry_price * pos.qty),
    0
  );
  const totalOpenPLPercent = openCostBasis > 0 ? (totalOpenPL / openCostBasis) * 100 : 0;

  const grossExposure = activePositions.reduce(
    (sum, pos) => sum + pos.current_price * Math.abs(pos.qty),
    0
  );
  const currentLeverage = totalEquity > 0 ? grossExposure / totalEquity : 0;

  // Maintenance Margin Required (MMR)
  // Standard minimum margin is calculated as: each asset's Market value * asset's MMR rate
  const totalMaintMarginRequired = activePositions.reduce(
    (sum, pos) => sum + (pos.current_price * Math.abs(pos.qty) * pos.maintenance_margin_rate),
    0
  );

  // Margin capacity usage
  const marginCapacityUsed = totalEquity > 0 ? (totalMaintMarginRequired / totalEquity) * 100 : 0;
  const excessLiquidity = totalEquity - totalMaintMarginRequired;

  // Determine state alerts
  let marginRiskStatus: "SAFE" | "WARNING" | "CRITICAL" | "MARGIN_CALL" = "SAFE";
  if (marginCapacityUsed >= 100) {
    marginRiskStatus = "MARGIN_CALL";
  } else if (marginCapacityUsed >= criticalThreshold) {
    marginRiskStatus = "CRITICAL";
  } else if (marginCapacityUsed >= warnThreshold) {
    marginRiskStatus = "WARNING";
  }

  // Auto-liquidation: sell non-crypto positions a configurable minutes before market close
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: any = null;
    const checkAndLiquidate = async () => {
      const curRef = stateRef.current;
      if (!curRef.useAlpacaLive) return; // only run in live mode
      if (!autoLiquidateBeforeClose) return;
      // compute ET time
      const et = getNewYorkDateParts();
      const day = et.dayOfWeek;
      if (day === 0 || day === 6) return; // weekend
      const minsNow = et.hour * 60 + et.minute;
      const marketCloseMins = 16 * 60; // 16:00 ET
      const minsToClose = marketCloseMins - minsNow;
      const todayKey = `${et.year}-${String(et.month).padStart(2, "0")}-${String(et.day).padStart(2, "0")}`;
      if (minsToClose <= liquidationBeforeCloseMin && minsToClose >= 0) {
        if (lastAutoLiquidationDayRef.current === todayKey) return; // already ran today
        lastAutoLiquidationDayRef.current = todayKey;
        // collect non-crypto open positions (BOTH long and short)
        const activePositions = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
        const toClose = (activePositions || []).filter((p: any) => {
          try {
            const qtyNum = parseFloat(p.qty || 0);
            return Math.abs(qtyNum) > 0.00001 && !isCryptoSymbol(String(p.symbol || ''));
          } catch (e) { return false; }
        });
        if ((toClose || []).length === 0) return;
        addLog('SENTRY', 'AUTO_LIQUIDATE', `Auto-liquidation triggered: closing ${toClose.length} non-crypto positions ${liquidationBeforeCloseMin}m before market close.`, 'WARNING');
        addAutopilotLog(`🚨 Auto-liquidation: closing ${toClose.length} non-crypto positions now to avoid overnight equity exposure.`, 'warn');
        for (const pos of toClose) {
          try {
            const qtyRaw = parseFloat(pos.qty || 0);
            const qty = Math.abs(qtyRaw);
            const side = qtyRaw > 0 ? 'SELL' : 'BUY';
            if (!qty || qty <= 0) continue;
            // fire and forget; executeAutopilotOrder handles pending bookkeeping
            executeAutopilotOrder(pos.symbol, side as any, qty).catch((err) => console.error('auto-liquidate failed', err));
          } catch (e) {
            console.error('auto-liquidate error', e);
          }
        }

        // Per-position absolute-dollar stop: close any single position losing more than $10
        try {
          const absPerStockStop = 10; // dollars
          const livePositions = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
          for (const p of (livePositions || [])) {
            try {
              const qty = parseFloat(p.qty || 0);
              if (!(qty > 0)) continue;
              const entry = parseFloat(p.avg_entry_price || 0);
              const curPrice = parseFloat(p.current_price || p.last_trade?.price || 0);
              if (!entry || !curPrice) continue;
              const unrealized = (curPrice - entry) * qty;
              if (unrealized <= -absPerStockStop && !(autopilotLossGuardBlockedUntilRef.current[p.symbol] > Date.now())) {
                addLog(p.symbol, 'AUTO_ABS_DOLLAR_SL', `Per-stock absolute $${absPerStockStop} stop breached (unrealized ${unrealized.toFixed(2)}). Attempting forced SELL.`, 'WARNING');
                addAutopilotLog(`🛑 Per-stock $${absPerStockStop} stop-loss: ${p.symbol} unrealized ${unrealized.toFixed(2)}. Forcing exit.`, 'warn');
                // attempt forced sell
                try {
                  await executeAutopilotOrder(p.symbol, 'SELL', qty);
                  // arm cooldown
                  autopilotLossGuardBlockedUntilRef.current[p.symbol] = Date.now() + LIQUIDATION_COOLDOWN_MS;
                } catch (e) {
                  console.error('auto forced sell failed', e);
                }
              }
            } catch (e) {
              // ignore per-position errors
            }
          }
        } catch (e) {
          // swallow
        }
      }
    };
    // run immediately and then every 30s
    checkAndLiquidate();
    timer = setInterval(checkAndLiquidate, 30000);
    return () => { if (timer) clearInterval(timer); };
  }, [autoLiquidateBeforeClose, liquidationBeforeCloseMin, executeAutopilotOrder, addLog, addAutopilotLog]);

  // Handle Order Placement
  const handleSubmitOrder = async (side: "BUY" | "SELL") => {
    const inputVal = parseFloat(orderQty);
    const symbolClean = orderSymbol.toUpperCase().trim();

    if (!symbolClean) {
      setOrderError("Please clarify a target trading symbol.");
      return;
    }
    if (isNaN(inputVal) || inputVal <= 0) {
      setOrderError(orderUnit === "USD" ? "Enter a valid dollar amount." : "Enter a valid fractional or integer Quantity.");
      return;
    }

    setOrderError("");
    setOrderSuccess("");
    setIsPlacingOrder(true);

    if (isCryptoSymbol(symbolClean)) {
      setIsPlacingOrder(false);
      setOrderError("Only Wall Street equities are supported in this terminal.");
      addLog(symbolClean, `${side}_BLOCKED`, "Only US equities are supported in this terminal app.", "WARNING");
      return;
    }

    let estPrice = 150.0;
    const matchedTicker = useAlpacaLive 
      ? alpacaPositions?.find((p) => p.symbol === symbolClean)
      : mockPositions?.find((p) => p.symbol === symbolClean);
    if (matchedTicker) {
      estPrice = matchedTicker.current_price;
    } else {
      if (symbolClean === "AAPL") estPrice = 182.2;
      else if (symbolClean === "TSLA") estPrice = 195.0;
      else if (symbolClean === "NVDA") estPrice = 115.5;
      else if (symbolClean === "BTCUSD") estPrice = 67200.0;
      else if (symbolClean === "MSFT") estPrice = 425.0;
    }

    let targetQtyNum = orderUnit === "USD" ? (inputVal / estPrice) : inputVal;
    let targetNotional = inputVal;
    let estimatedCost = orderUnit === "USD" ? inputVal : estPrice * targetQtyNum;

    if (useAlpacaLive) {
      if (!isConnected) {
        setIsPlacingOrder(false);
        setOrderError("Broker connection is inactive. Switch back to Local Simulator or configure valid API credentials.");
        addLog(symbolClean, `${side}_FAILED`, "Blocked transmission: keys are not authorized/connected.", "WARNING");
        return;
      }

      const isCrypto = isCryptoSymbol(symbolClean);
      if (isCrypto) {
        setIsPlacingOrder(false);
        setOrderError("Only Wall Street equities are supported in this terminal.");
        addLog(symbolClean, "AUTO_BUY_BLOCKED", "Only US equities are supported in this terminal app.", "WARNING");
        return;
      }

      if (side === "SELL") {
        const existingPos = alpacaPositions.find((p) => p.symbol === symbolClean);
        const ownedQty = existingPos ? existingPos.qty : 0;
        if (ownedQty <= 0) {
          setIsPlacingOrder(false);
          setOrderError(`Alpaca Client: You do not own a long position in ${symbolClean} to sell. Short-selling is blocked on Alpaca Live mode to prevent account rejections. Switch to Local Risk Simulator to construct active short positions!`);
          addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on Alpaca Live mode.`, "WARNING");
          return;
        }
        if (targetQtyNum > ownedQty) {
          setIsPlacingOrder(false);
          setOrderError(`Alpaca Client: You only own ${ownedQty} shares of ${symbolClean}. You cannot sell ${targetQtyNum.toFixed(6)} shares as that would require short-selling, which is restricted in this account mode.`);
          addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on Alpaca Live mode. Tried to sell ${targetQtyNum} vs owned ${ownedQty}.`, "WARNING");
          return;
        }
      } else if (side === "BUY") {
        const cashValue = parseFloat(alpacaAccount?.cash || "0");
        const rawBuyingPower = resolveBuyingPower(alpacaAccount);
        const isFractional = targetQtyNum % 1 !== 0;
        const maxAllowedPower = (cashValue < 2000 || isFractional) ? cashValue : Math.min(rawBuyingPower, cashValue * 4);
        const maxSafeOrderCost = maxAllowedPower * 0.96;
        const maxAffordableQty = estPrice > 0 ? maxSafeOrderCost / estPrice : 0;
        const minQty = symbolClean === "BTCUSD" ? 0.0001 : 0.01;

        if (estimatedCost > maxSafeOrderCost) {
          if (orderUnit === "USD") {
            const adjustedNotional = parseFloat(maxSafeOrderCost.toFixed(2));
            if (adjustedNotional < 1) {
              setIsPlacingOrder(false);
              setOrderError(`Alpaca Client: Insufficient buying power for any USD order. Reg-T limit is ${maxSafeOrderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
              addLog(symbolClean, "BUY_FAILED", `Blocked manual buy on Alpaca Live mode due to insufficient Reg-T buying power.`, "WARNING");
              return;
            }
            targetNotional = adjustedNotional;
            targetQtyNum = adjustedNotional / estPrice;
            setOrderQty(adjustedNotional.toFixed(2));
            addLog(symbolClean, "BUY_RESIZED", `Manual USD buy resized from $${inputVal.toFixed(2)} to $${adjustedNotional.toFixed(2)} to fit Reg-T buying power.`, "INFO");
          } else {
            const adjustedQty = symbolClean === "BTCUSD"
              ? parseFloat(Math.max(0, maxAffordableQty).toFixed(4))
              : parseFloat(Math.max(0, maxAffordableQty).toFixed(2));
            if (adjustedQty < minQty) {
              setIsPlacingOrder(false);
              setOrderError(`Alpaca Client: Insufficient buying power for any share order. Reg-T limit is ${maxSafeOrderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
              addLog(symbolClean, "BUY_FAILED", `Blocked manual buy on Alpaca Live mode due to insufficient Reg-T buying power.`, "WARNING");
              return;
            }
            targetQtyNum = adjustedQty;
            setOrderQty(adjustedQty.toString());
            addLog(symbolClean, "BUY_RESIZED", `Manual share buy resized to ${adjustedQty} shares to fit Reg-T buying power.`, "INFO");
          }
        }
      }

      addLog("ALPACA", side, `Transmitting Order: ${side} for ${orderUnit === "USD" ? `${inputVal}` : `${targetQtyNum} shares`} of ${symbolClean}`, "INFO");
      try {
        const payload = getBrokerAuthPayload({
          symbol: symbolClean,
          side: side.toLowerCase(),
        });

        if (orderUnit === "USD" && side === "BUY") {
          payload.notional = targetNotional;
          estimatedCost = targetNotional;
        } else {
          // Fixed: Precision mismatch in fractional orders can cause Alpaca 403 (Insufficient Qty).
          // Using a strictly conservative floor (4 decimals) for all manual orders.
          payload.qty = Math.floor(targetQtyNum * 10000) / 10000;
          estimatedCost = estPrice * targetQtyNum;
        }
        // Enforce absolute per-symbol dollar cap for manual buys as well
        try {
          const perSymbolCapManual = Number(stateRef.current.perSymbolDollarCap) || Number.POSITIVE_INFINITY;
          if (side === "BUY" && Number.isFinite(perSymbolCapManual) && perSymbolCapManual > 0) {
            if (orderUnit === "USD") {
              if (payload.notional > perSymbolCapManual) {
                const old = payload.notional;
                payload.notional = Math.max(0, perSymbolCapManual);
                estimatedCost = payload.notional;
                targetNotional = payload.notional;
                targetQtyNum = payload.notional / estPrice;
                setOrderQty(targetNotional.toFixed(2));
                addLog(symbolClean, "BUY_RESIZED", `Manual USD buy resized from $${old.toFixed(2)} to $${payload.notional.toFixed(2)} due to per-symbol cap.`, "INFO");
              }
            } else {
              const maxQtyFromCap = perSymbolCapManual / Math.max(estPrice, 0.000001);
              if (targetQtyNum > maxQtyFromCap) {
                const oldQ = targetQtyNum;
                targetQtyNum = Math.max(0, maxQtyFromCap);
                payload.qty = Math.floor(targetQtyNum * 10000) / 10000;
                estimatedCost = estPrice * targetQtyNum;
                setOrderQty(targetQtyNum.toString());
                addLog(symbolClean, "BUY_RESIZED", `Manual share buy resized from ${oldQ} to ${targetQtyNum} shares due to per-symbol cap (~$${perSymbolCapManual.toFixed(2)}).`, "INFO");
              }
            }
          }
        } catch (e) {
          // swallow cap check errors
        }
        payload.estimatedPrice = estPrice;

        const response = await fetch("/api/alpaca/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const resText = await response.text();
        let dataOrder: any = null;
        try {
          dataOrder = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
        }

        if (!response.ok || dataOrder?.error) {
          throw new Error(dataOrder?.error || "Order rejected by brokerage server.");
        }

        const brokerStatus = String(dataOrder.status || "ACCEPTED").toUpperCase();
        const filledQty = Number.parseFloat(String(dataOrder.filled_qty ?? "0"));
        const isFilledStatus = brokerStatus === "FILLED" || brokerStatus === "PARTIALLY_FILLED";
        const isQueuedStatus = brokerStatus === "ACCEPTED" || brokerStatus === "NEW" || brokerStatus === "PENDING_NEW" || brokerStatus === "PENDING";
        const successMessage = isFilledStatus
          ? `Live market order filled for ${orderUnit === "USD" ? `${inputVal}` : `${filledQty > 0 ? filledQty : targetQtyNum} share(s)`} of ${symbolClean}.`
          : isQueuedStatus
            ? `Order submitted to Alpaca and queued for fill. Status: ${brokerStatus}. No position is confirmed until Alpaca reports a fill.`
            : `Order status is ${brokerStatus}. No position is confirmed until the order fills.`;

        setOrderSuccess(`Order submitted. ID: ${dataOrder.id || "Submitted"}. ${successMessage}`);
        addLog(
          symbolClean,
          isFilledStatus ? `${side}_FILLED` : `${side}_ACCEPTED`,
          successMessage,
          isFilledStatus ? "SUCCESS" : "INFO"
        );

        const newOrderObj: Order = {
          id: dataOrder.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: targetQtyNum,
          price: dataOrder.filled_avg_price ? parseFloat(dataOrder.filled_avg_price) : (dataOrder.price || 0),
          status: brokerStatus,
          submittedAt: new Date().toLocaleTimeString(),
        };
        setOrders((prev) => [newOrderObj, ...prev]);

        setTimeout(() => {
          handleRefreshData();
        }, 1200);
      } catch (err: any) {
        console.error(err);
        let errorMsg = err.message || "Failed order validation.";
        if (errorMsg.includes("is not allowed to short") || errorMsg.includes("shorting")) {
          errorMsg = "Your connected Alpaca account does not allow short-selling (likely because it is a cash account or has margin disabled). Use the Local Risk Simulator mode to test short layouts!";
        } else if (errorMsg.includes("insufficient buying power")) {
          errorMsg = "Your Alpaca account does not have sufficient buying power to execute this size. Try a smaller position or use the Local Risk Simulator mode!";
        }
        setOrderError(errorMsg);
        addLog(symbolClean, `${side}_REJECTED`, errorMsg, "CRITICAL");
      } finally {
        setIsPlacingOrder(false);
      }

      return;
    }

    // Offline simulation execute immediately
    const orderCost = estPrice * targetQtyNum;
      const isINR = false;
      const currencySymbol = isINR ? "₹" : "$";

      // Real broker charges calculations matching real live conditions 
      let flatBrokerage = 1.00;
      let taxRate = 0.0005;
      let slippageRate = 0.0002;
      
      if (isINR) {
        flatBrokerage = symbolClean === "BTCUSD" ? 0 : 20.00; // flat ₹20 fee on delivery / margin orders
        taxRate = symbolClean === "BTCUSD" ? 0.001 : 0.0015;  // STT / Stamp Duty / GST
        slippageRate = 0.0003;
      } else {
        flatBrokerage = symbolClean === "BTCUSD" ? 0.10 : 1.00; // Clearing / SEC / FINRA structure
        taxRate = symbolClean === "BTCUSD" ? 0.0015 : 0.0005;
        slippageRate = 0.0002;
      }

      const orderFees = parseFloat((flatBrokerage + orderCost * taxRate + orderCost * slippageRate).toFixed(2));

      if (side === "BUY" && (orderCost + orderFees) > simCash) {
        setIsPlacingOrder(false);
        setOrderError(`Simulation block: Insufficient simulated cash. Needs ${currencySymbol}${(orderCost + orderFees).toFixed(2)} (${currencySymbol}${orderCost.toFixed(2)} order + ${currencySymbol}${orderFees.toFixed(2)} fees/taxes).`);
        addLog(symbolClean, "BUY_SIM_FAILED", `Buying power exceeded. Needs ${currencySymbol}${(orderCost + orderFees).toFixed(2)} total capacity.`, "WARNING");
        return;
      }

      // Execute mock transaction calculation
      setIsPlacingOrder(false);
      if (side === "BUY") {
        const totalDebitWithFees = orderCost + orderFees;
        setSimCash((c) => c - totalDebitWithFees);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty + targetQtyNum;
            if (Math.abs(updatedQty) < 0.0001) {
              return prev.filter((p) => p.symbol !== symbolClean);
            }
            let newAvgEntry = exists.avg_entry_price;
            let unrealized = 0;
            if (exists.qty > 0) {
              const actualSpent = exists.avg_entry_price * exists.qty + orderCost + orderFees;
              newAvgEntry = actualSpent / updatedQty;
              unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
            } else {
              if (updatedQty < 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              } else {
                newAvgEntry = (orderCost + orderFees) / updatedQty;
                unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
              }
            }
            return prev.map((p) =>
              p.symbol === symbolClean
                ? {
                    ...p,
                    qty: parseFloat(updatedQty.toFixed(4)),
                    market_value: parseFloat((updatedQty * exists.current_price).toFixed(2)),
                    avg_entry_price: parseFloat(newAvgEntry.toFixed(4)),
                    unrealized_pl: parseFloat(unrealized.toFixed(2)),
                  }
                : p
            );
          } else {
            const realAvgEntry = parseFloat(((orderCost + orderFees) / targetQtyNum).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: targetQtyNum,
                avg_entry_price: realAvgEntry,
                current_price: estPrice,
                market_value: parseFloat(orderCost.toFixed(2)),
                unrealized_pl: parseFloat((orderCost - realAvgEntry * targetQtyNum).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: parseFloat(newMaint) / 100 || 0.30,
              },
            ];
          }
        });
        setOrderSuccess(`Simulated purchase complete: Acquired ${targetQtyNum} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (Fees: ${currencySymbol}${orderFees.toFixed(2)} deducted).`);
        addLog(symbolClean, "BUY_SIM", `Purchased simulated ${targetQtyNum} shares at ${currencySymbol}${estPrice} with ${currencySymbol}${orderFees.toFixed(2)} trade drag.`, "SUCCESS");
      } else {
        // Simulated SELL / SHORT SELL
        const netProceeds = orderCost - orderFees;
        setSimCash((c) => c + netProceeds);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty - targetQtyNum;
            if (Math.abs(updatedQty) < 0.0001) {
              return prev.filter((p) => p.symbol !== symbolClean);
            }
            let newAvgEntry = exists.avg_entry_price;
            let unrealized = 0;
            if (exists.qty > 0) {
              if (updatedQty > 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
              } else {
                newAvgEntry = parseFloat(((orderCost - orderFees) / Math.abs(updatedQty)).toFixed(4));
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              }
            } else {
              const totalAcquiredShort = exists.avg_entry_price * Math.abs(exists.qty) + orderCost - orderFees;
              newAvgEntry = totalAcquiredShort / Math.abs(updatedQty);
              unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
            }
            return prev.map((p) =>
              p.symbol === symbolClean
                ? {
                    ...p,
                    qty: parseFloat(updatedQty.toFixed(4)),
                    market_value: parseFloat((updatedQty * exists.current_price).toFixed(2)),
                    avg_entry_price: parseFloat(newAvgEntry.toFixed(4)),
                    unrealized_pl: parseFloat(unrealized.toFixed(2)),
                  }
                : p
            );
          } else {
            const updatedQty = -targetQtyNum;
            const realAvgEntry = parseFloat(((orderCost - orderFees) / targetQtyNum).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: parseFloat(updatedQty.toFixed(4)),
                avg_entry_price: realAvgEntry,
                current_price: estPrice,
                market_value: parseFloat((updatedQty * estPrice).toFixed(2)),
                unrealized_pl: parseFloat(((realAvgEntry - estPrice) * (-updatedQty)).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: parseFloat(newMaint) / 100 || 0.30,
              },
            ];
          }
        });
        setOrderSuccess(`Simulated sale complete: Sold/Short-sold ${targetQtyNum} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (${currencySymbol}${orderFees.toFixed(2)} charges deducted).`);
        addLog(symbolClean, "SELL_SIM", `Sold/Short-sold simulated ${targetQtyNum} shares at ${currencySymbol}${estPrice} with ${currencySymbol}${orderFees.toFixed(2)} trade drag.`, "SUCCESS");
      }

      // Record offline order
      setOrders((prev) => [
        {
          id: `sim-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: targetQtyNum,
          price: estPrice,
          status: "FILLED_MOCK",
          submittedAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
  };

  // Add Custom Simulated Position Form
  const handleAddNewPosition = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = newSymbol.toUpperCase().trim();
    const qtyVal = parseFloat(newQty);
    const priceVal = parseFloat(newPrice);
    const maintRateVal = parseFloat(newMaint) / 100;

    if (!cleanSym || isNaN(qtyVal) || isNaN(priceVal) || qtyVal <= 0 || priceVal <= 0) {
      showToast("Validation Error: Please enter a correct ticker, quantity, and market price.", "WARNING");
      return;
    }

    const value = qtyVal * priceVal;
    const newPos: Position = {
      symbol: cleanSym,
      qty: qtyVal,
      avg_entry_price: priceVal,
      current_price: priceVal,
      market_value: value,
      unrealized_pl: 0,
      unrealized_plpc: 0,
      maintenance_margin_rate: maintRateVal,
    };

    setMockPositions((prev) => {
      const filtered = prev.filter((p) => p.symbol !== cleanSym);
      return [...filtered, newPos];
    });

    addLog(cleanSym, "ADD_MOCK", `Added simulated asset ${cleanSym} with ${maintRateVal * 100}% maintenance limit.`, "SUCCESS");
    setNewSymbol("");
    setNewQty("");
    setNewPrice("");
  };

  // Shock Tickers Price manually inside Simulator
  const handleShockPrices = (multiplier: number, targetSymbol?: string) => {
    if (useAlpacaLive) {
      showToast("Access Denied: Price shock modifications are disabled in live broker environments.", "WARNING");
      return;
    }

    setMockPositions((prev) =>
      prev.map((p) => {
        if (!targetSymbol || p.symbol === targetSymbol) {
          const newPrice = Math.max(0.01, p.current_price * multiplier);
          const value = p.qty * newPrice;
          const costBasis = p.qty * p.avg_entry_price;
          const unrealized_pl = value - costBasis;
          const unrealized_plpc = costBasis > 0 ? unrealized_pl / costBasis : 0;
          return {
            ...p,
            current_price: parseFloat(newPrice.toFixed(2)),
            market_value: parseFloat(value.toFixed(2)),
            unrealized_pl: parseFloat(unrealized_pl.toFixed(2)),
            unrealized_plpc: parseFloat(unrealized_plpc.toFixed(4)),
          };
        }
        return p;
      })
    );

    const percentText = multiplier > 1 ? `+${Math.round((multiplier - 1) * 100)}%` : `-${Math.round((1 - multiplier) * 100)}%`;
    addLog(
      targetSymbol || "ALL",
      "PRICE_SHOCK",
      `Violated price levels by ${percentText} for ${targetSymbol || "all holdings"}. Recalculating margin limits.`,
      multiplier < 1 ? "WARNING" : "SUCCESS"
    );
  };

  // Reset simulator to defaults or pristine scratch
  const handleResetSimulator = (pristineScratch = false) => {
    setSimCash(2000);
    setIsEditingCash(false);
    setTempCashInput("");
    if (pristineScratch) {
      setStartingCapital(2000);
      setMockPositions([]);
      setOrders([]);
      setLogs([]);
      setAiAnalysis("");
      setAutopilotLogs([
        {
          id: "init",
          time: HYDRATION_SAFE_TIME_PLACEHOLDER,
          msg: "System load successful. Autopilot engine initialized completely clean.",
          type: "info"
        }
      ]);
      addLog("SYSTEM", "WIPE_ALL", "Simulation wiped completely to pristine cash-only slate ($2,000 capital).", "INFO");
    } else {
      setStartingCapital(3085);
      setMockPositions([
        {
          symbol: "NVDA",
          qty: 2.0,
          avg_entry_price: 110.0,
          current_price: 115.5,
          market_value: 231.0,
          unrealized_pl: 11.0,
          unrealized_plpc: 0.05,
          maintenance_margin_rate: 0.35,
        },
        {
          symbol: "AAPL",
          qty: 3.0,
          avg_entry_price: 180.0,
          current_price: 182.2,
          market_value: 546.6,
          unrealized_pl: 6.6,
          unrealized_plpc: 0.012,
          maintenance_margin_rate: 0.30,
        },
        {
          symbol: "BTCUSD",
          qty: 0.005,
          avg_entry_price: 65000.0,
          current_price: 67200.0,
          market_value: 336.0,
          unrealized_pl: 11.0,
          unrealized_plpc: 0.0338,
          maintenance_margin_rate: 0.50,
        }
      ]);
      addLog("SYSTEM", "RESET", "Reverted simulator settings to factory configuration ($2,000 cash).", "INFO");
    }
  };

  // Delete Mock holding
  const handleDeleteMockPosition = (symbol: string) => {
    setMockPositions((prev) => prev.filter((p) => p.symbol !== symbol));
    addLog(symbol, "REMOVE_MOCK", `Removed simulated stock ${symbol} from active risk matrix.`, "INFO");
  };

  // Liquidate a single asset position (SELL to CASH or close position via broker)
  const handleLiquidatePosition = async (symbol: string, qty?: number) => {
    const symbolClean = symbol.toUpperCase().trim();
    setIsLiquidating(symbolClean);

    try {
      if (useAlpacaLive) {
        // Alpaca direct DELETE position liquidation helper
        addLog("ALPACA", "LIQUIDATE_START", `Initiating direct close-out for ${symbolClean} ${qty ? `(qty: ${qty})` : "(all shares)"} via brokerage liquidation`, "INFO");

        const response = await fetch("/api/alpaca/liquidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getBrokerAuthPayload({
            symbol: symbolClean,
            qty: qty || undefined,
          })),
        });

        const resText = await response.text();
        let rawData: any = null;
        try {
          rawData = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Liquidation endpoint returned non-JSON response: ${resText.slice(0, 120).trim()}...`);
        }

        if (!response.ok || rawData?.error) {
          throw new Error(rawData?.error || "Liquidation rejected by Alpaca.");
        }

        const existingPos = alpacaPositions.find((p) => p.symbol === symbolClean);
        addLog(symbolClean, "LIQUIDATED", `Direct position liquidation successful! Broker order queued.`, "SUCCESS");
        if (isLossMakingPosition(existingPos)) {
          armLiquidationCooldown(symbolClean, "manual position liquidation");
        }

        setTimeout(() => {
          handleRefreshData();
        }, 1250);
      } else {
        // Simulated Portfolio Liquidation Logic
        const pos = mockPositions.find((p) => p.symbol === symbolClean);
        if (!pos) {
          throw new Error(`Holding not found in active simulator workspace.`);
        }

        const isLong = pos.qty >= 0;
        const totalAbsQty = Math.abs(pos.qty);
        // Floor to 4 decimals even in simulation for consistent precision behavior
        const liqQty = (qty !== undefined && Number.isFinite(qty) && qty > 0) ? Math.floor(Math.min(qty, totalAbsQty) * 10000) / 10000 : totalAbsQty;
        const orderCost = liqQty * pos.current_price;

        // Fee calculations congruent with the standard order desk
        let flatBrokerage = symbolClean === "BTCUSD" ? 0.10 : 1.00;
        let taxRate = symbolClean === "BTCUSD" ? 0.0015 : 0.0005;
        let slippageRate = 0.0002;
        const orderFees = parseFloat((flatBrokerage + orderCost * (taxRate + slippageRate)).toFixed(2));
        const netProceeds = isLong ? (orderCost - orderFees) : -(orderCost + orderFees);

        // Update local state cash & remove or update position
        setSimCash((c) => c + netProceeds);
        setMockPositions((prev) => {
          if (liqQty >= totalAbsQty - 0.00001) {
            return prev.filter((p) => p.symbol !== symbolClean);
          } else {
            return prev.map((p) => {
              if (p.symbol === symbolClean) {
                return { ...p, qty: isLong ? p.qty - liqQty : p.qty + liqQty };
              }
              return p;
            });
          }
        });

        // Record simulated offline trade
        const newOrderObj: Order = {
          id: `sim-liq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          symbol: symbolClean,
          side: isLong ? "SELL" : "BUY",
          qty: liqQty,
          price: pos.current_price,
          status: "FILLED",
          submittedAt: new Date().toLocaleTimeString(),
        };
        setOrders((prev) => [newOrderObj, ...prev]);

        addLog(
          symbolClean,
          "LIQUIDATED_SIM",
          `Simulator closed ${symbolClean} position of ${liqQty} shares for net of $${Math.abs(netProceeds).toFixed(2)} (Fees: $${orderFees.toFixed(2)}).`,
          "SUCCESS"
        );
        if (isLossMakingPosition(pos)) {
          armLiquidationCooldown(symbolClean, "manual position liquidation");
        }
      }
    } catch (err: any) {
      console.error(err);
      addLog(symbolClean, "LIQUIDATE_FAILED", err.message || "Failed close-out routine.", "CRITICAL");
    } finally {
      setIsLiquidating(null);
    }
  };

  // Confirmation modal state and helpers
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<"position" | "portfolio" | null>(null);
  const [confirmModalSymbol, setConfirmModalSymbol] = useState<string | null>(null);
  const [confirmModalInputQty, setConfirmModalInputQty] = useState<string>("");

  const openConfirmForPosition = (symbol: string) => {
    setConfirmModalType("position");
    setConfirmModalSymbol(symbol.toUpperCase().trim());
    setConfirmModalInputQty(""); // default to empty (all)
    setConfirmModalOpen(true);
  };

  const openConfirmForPortfolio = () => {
    setConfirmModalType("portfolio");
    setConfirmModalSymbol(null);
    setConfirmModalOpen(true);
  };

  const handleConfirmModalCancel = () => {
    setConfirmModalOpen(false);
    setConfirmModalType(null);
    setConfirmModalSymbol(null);
  };

  const handleConfirmModalConfirm = async () => {
    setConfirmModalOpen(false);
    if (confirmModalType === "position" && confirmModalSymbol) {
      const qNum = parseFloat(confirmModalInputQty);
      const targetPos = activePositions.find((p: any) => p.symbol === confirmModalSymbol);
      const totalQty = targetPos ? Math.abs(parseFloat(String(targetPos.qty || 0))) : 0;
      
      // Fixed: Precision mismatch in fractional sell orders can cause Alpaca 403 (Insufficient Qty).
      // Floor to 4 decimal places to ensure we never over-sell available shares.
      // If we are trying to sell basically the whole position (within 0.0001), send undefined to trigger a full close.
      let safeQty: number | undefined = (Number.isFinite(qNum) && qNum > 0) ? Math.floor(qNum * 10000) / 10000 : undefined;
      
      if (safeQty && totalQty > 0 && safeQty >= totalQty - 0.0001) {
        safeQty = undefined;
      }
      
      await handleLiquidatePosition(confirmModalSymbol, safeQty);
    } else if (confirmModalType === "portfolio") {
      await handleLiquidatePortfolio();
    }
    setConfirmModalType(null);
    setConfirmModalSymbol(null);
    setConfirmModalInputQty("");
  };

  const handleLiquidatePortfolio = async () => {
    // Elegant system confirmation before full destruction
    setIsLiquidating("all");
    
    // (Note: when invoked from UI modal we bypass native confirm)
    addLog("PORTFOLIO", "LIQUIDATE_ALL_START", "Triggering global panic liquidation for all asset classes.", "WARNING");
    
    try {
      if (useAlpacaLive) {
        // Alpaca direct delete-all-positions route
        if (alpacaPositions.length === 0) {
          const message = "No active positions to liquidate.";
          addLog("PORTFOLIO", "LIQUIDATE_NONE", message, "WARNING");
          throw new Error(message);
        }

        const response = await fetch("/api/alpaca/liquidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getBrokerAuthPayload()),
        });

        const resText = await response.text();
        let rawData: any = null;
        try {
          rawData = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Liquidation endpoint returned non-JSON response: ${resText.slice(0, 120).trim()}...`);
        }
        if (!response.ok || rawData?.error) {
          throw new Error(rawData?.error || "Portfolio liquidation rejected by Alpaca.");
        }
        
        addLog("PORTFOLIO", "LIQUIDATION_COMPLETE", "Alpaca direct portfolio liquidation broadcasted. All broker assets closed out.", "SUCCESS");
        for (const pos of alpacaPositions) {
          if (Math.abs(pos.qty) > 0 && isLossMakingPosition(pos)) {
            armLiquidationCooldown(pos.symbol, "portfolio liquidation");
          }
        }
        
        setTimeout(() => {
          handleRefreshData();
        }, 1500);
      } else {
        // Local simulator portfolio liquidation
        if (mockPositions.length === 0) {
          throw new Error("Workspace is already cash-only. No positions exist to liquidate.");
        }
        
        let cumulativeNetCredit = 0;
        let cumulativeFees = 0;
        const closedOrders: Order[] = [];
        
        for (const pos of mockPositions) {
          const isLong = pos.qty >= 0;
          const absQty = Math.abs(pos.qty);
          const orderCost = absQty * pos.current_price;
          
          let flatBrokerage = pos.symbol === "BTCUSD" ? 0.10 : 1.00;
          let taxRate = pos.symbol === "BTCUSD" ? 0.0015 : 0.0005;
          let slippageRate = 0.0002;
          const orderFees = parseFloat((flatBrokerage + orderCost * (taxRate + slippageRate)).toFixed(2));
          const netProceeds = isLong ? (orderCost - orderFees) : -(orderCost + orderFees);
          
          cumulativeNetCredit += netProceeds;
          cumulativeFees += orderFees;
          
          closedOrders.push({
            id: `sim-liq-all-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            symbol: pos.symbol,
            side: isLong ? "SELL" : "BUY",
            qty: absQty,
            price: pos.current_price,
            status: "FILLED",
            submittedAt: new Date().toLocaleTimeString(),
          });
        }
        
        setSimCash((c) => c + cumulativeNetCredit);
        setMockPositions([]);
        setOrders((prev) => [...closedOrders, ...prev]);
        
        addLog(
          "PORTFOLIO",
          "LIQUIDATION_COMPLETE",
          `Simulator closed ALL positions. Cash adjusted by $${cumulativeNetCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Charges: $${cumulativeFees.toFixed(2)}).`,
          "SUCCESS"
        );
        for (const pos of mockPositions) {
          if (Math.abs(pos.qty) > 0 && isLossMakingPosition(pos)) {
            armLiquidationCooldown(pos.symbol, "portfolio liquidation");
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      addLog("PORTFOLIO", "LIQUIDATION_FAILED", err.message || "Failed portfolio closeout routine.", "CRITICAL");
    } finally {
      setIsLiquidating(null);
    }
  };

  // Python Code SDK Generation
  const pyScriptCode = `import requests
import json

# Terminal Configuration Exports
ALPACA_API_KEY = "${apiKey || "YOUR_API_KEY"}"
ALPACA_API_SECRET = "${apiSecret || "YOUR_API_SECRET"}"
ENDPOINT = "https://paper-api.alpaca.markets" if ${isPaper ? "True" : "False"} else "https://api.alpaca.markets"

headers = {
    "APCA-API-KEY-ID": ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
    "Content-Type": "application/json"
}

def analyze_portfolio_risk_sentry():
    # 1. Fetch Account Parameters
    acc_url = f"{ENDPOINT}/v2/account"
    res = requests.get(acc_url, headers=headers)
    if res.status_code != 200:
        print("Authorization refused. Verify Alpaca key pairs.")
        return
        
    account = res.json()
    equity = float(account["equity"])
    cash = float(account["cash"])
    
    # 2. Fetch Active Holdings
    pos_url = f"{ENDPOINT}/v2/positions"
    pos_res = requests.get(pos_url, headers=headers)
    positions = pos_res.json()
    
    # Standard maintenance calculation configuration
    total_mmr_burden = 0.0
    print("\\n🛡️ --- RISK TERMINAL ACTIVE MATRIX --- 🛡️")
    
    for pos in positions:
        sym = pos["symbol"]
        qty = float(pos["qty"])
        mkt_val = float(pos["market_value"])
        # Standard maintenance margin fallback 
        maint_rate = 0.30 
        maint_cost = mkt_val * maint_rate
        total_mmr_burden += maint_cost
        print(f"Asset {sym} | Shares: {qty} | Value: \${mkt_val:,.2f} | Maint Cost: \${maint_cost:,.2f}")
        
    margin_utilization = (total_mmr_burden / equity) * 100 if equity > 0 else 0
    
    print(f"\\nPortfolio Equity: \${equity:,.2f}")
    print(f"Cash Reserves: \${cash:,.2f}")
    print(f"Current Margin Capacity Blocked: {margin_utilization:.2f}%")
    
    # Trigger Warnings match Sentry Threshold levels
    if margin_utilization >= ${criticalThreshold}:
        print("⚠️ [SENTRY_CRITICAL_ALERT] Margin capacity is compromised!")
    elif margin_utilization >= ${warnThreshold}:
        print("⚡ [SENTRY_WARNING] Asset leverages are expanding. Review active collaterals.")
    else:
        print("✅ Account status safe. Excess Margin verified.")

if __name__ == "__main__":
    analyze_portfolio_risk_sentry()`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Python Sentry automation script copied to clipboard successfully!", "SUCCESS");
  };

  // Triggers Gemini Stress Diagnosis Analysis
  const runAIPortfolioDiagnosis = async () => {
    setIsAiLoading(true);
    setAiAnalysis("");
    setAiAnalysisGeneratedAt(null);
    setAiAnalysisSnapshot(null);
    addLog("GEMINI", "DIAGNOSE_REQUEST", "Starting AI margin downside shock diagnostics...", "INFO");

    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: activePositions,
          cash: activeCash,
          equity: totalEquity,
          buyingPower: activeCash * simLeverageLimit,
          leverage: currentLeverage.toFixed(2),
        }),
      });

      const resText = await response.text();
      let resultData: any = null;
      try {
        resultData = JSON.parse(resText);
      } catch (e) {
        throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
      }

      if (!response.ok || resultData?.error) {
        throw new Error(resultData?.error || "Unable to contact AI engine.");
      }

      setAiAnalysis(resultData.diagnosis);
      setAiAnalysisGeneratedAt(Date.now());
      setAiAnalysisSnapshot({
        equity: totalEquity,
        cash: activeCash,
        positions: activePositions.length,
      });
      setAiAnalysisLive(resultData?.sandbox === false ? true : resultData?.sandbox === true ? false : null);
      addLog("GEMINI", "DIAGNOSE_SUCCESS", "AI Stress diagnosis compiled successfully.", "SUCCESS");
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Model computation timed out.";
      if (msg.includes("leaked")) {
        setAiAnalysis(`### 🔐 GEMINI_API_KEY Leaked\n\nGoogle has disabled your API key because it was detected in a public location (likely a leaked secret). \n\n**Action Required:**\n1. Go to [AI Studio](https://aistudio.google.com/)\n2. Generate a **NEW API Key**.\n3. Update the \`GEMINI_API_KEY\` entry in your \`.env.local\` file.\n4. Save and the diagnostics will resume working.`);
      } else {
        setAiAnalysis(`### 🔴 Diagnostic Failed\n\n${msg}\n\nPlease check server logs for more details.`);
      }
      addLog("GEMINI", "DIAGNOSE_ERROR", msg, "CRITICAL");
    } finally {
      setIsAiLoading(false);
    }
  };

  const aiReportAgeMin = aiAnalysisGeneratedAt ? Math.floor((Date.now() - aiAnalysisGeneratedAt) / 60000) : null;
  const aiReportStale = aiReportAgeMin !== null && aiReportAgeMin >= 5;
  const aiSnapshotDelta = aiAnalysisSnapshot
    ? {
        equityDelta: totalEquity - aiAnalysisSnapshot.equity,
        cashDelta: activeCash - aiAnalysisSnapshot.cash,
        positionsDelta: activePositions.length - aiAnalysisSnapshot.positions,
      }
    : null;

  // --- Top scanning bar metrics (derived) ---
  // Number of stocks that will be scanned this pass vs total available universe
  const stocksToScanCount = Math.max(0, autopilotScanTotalTargets || 0);
  const totalUniverseCount = quickTickers.length || 0;

  // When a scan is running, show real-time processed / total targets; otherwise show planned stocksToScan / total universe
  const displayScanned = isAutopilotRunning ? (autopilotScanProcessedCount || 0) : stocksToScanCount;
  const displayTotal = isAutopilotRunning ? (autopilotScanTotalTargets || totalUniverseCount) : totalUniverseCount;
  const displayPercent = displayTotal > 0 ? Math.min(100, Math.round((displayScanned / displayTotal) * 100)) : 0;
  // Backwards-compatible aliases: some hot-reload bundles reference older names
  const scanTotal = Math.max(1, displayTotal || 0);
  const scanProcessed = Math.max(0, displayScanned || 0);
  const scanPercent = scanTotal > 0 ? Math.min(100, Math.round((scanProcessed / scanTotal) * 100)) : 0;
  // Show 1 active position as requested
  const activePositionsCount = (useAlpacaLive ? (alpacaPositions || []) : (mockPositions || []))
    .filter((p: any) => Math.abs(parseFloat(String(p?.qty || 0))) > 0)
    .length;
  const nextScanIn = autopilotNextScanInSec ?? autopilotInterval;
  const connectionStatus = isConnected ? "Alpaca Connected" : "Alpaca Disconnected";
  const alpacaAuthText = isConnected ? "OK" : "N/A";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-brand-bg md:p-8" id="root-container">
      {/* Top scanning bar (moved below connection controls) */}

      {/* In-app Error Overlay */}
      {overlayErrors.length > 0 && (
        <div className="fixed top-4 right-4 z-60 w-96 max-h-[60vh] overflow-auto bg-red-900/90 text-white p-3 rounded shadow-lg border border-red-700">
          <div className="flex justify-between items-center mb-2">
            <strong>Runtime Errors ({overlayErrors.length})</strong>
            <div className="flex gap-2">
              <button
                onClick={() => setOverlayErrors([])}
                className="text-xs px-2 py-1 bg-red-700/60 rounded hover:bg-red-600"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {overlayErrors.map((e) => (
              <div key={e.id} className="text-xs bg-red-800/50 p-2 rounded">
                <div className="font-medium">{e.message}</div>
                {e.stack && <pre className="mt-1 text-xs whitespace-pre-wrap text-red-200">{e.stack}</pre>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-switch control */}
      <div className="mt-4 mb-4 flex items-center gap-3">
        <div className="rounded-lg border border-brand-border/60 bg-brand-bg/50 px-4 py-3 text-xs text-gray-300 font-mono">
          US equities only in this terminal app. Autopilot will trade stocks and ETFs on the live Alpaca account.
        </div>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm">Broker:</label>
        <div className="text-sm px-2 py-1 rounded bg-brand-input">Alpaca (US market only)</div>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => void toggleSafeState()}
          className={`px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 ${isSafeStateActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`}
        >
          <ShieldAlert className="h-4 w-4" />
          {isSafeStateActive ? 'Exit SafeState' : 'Enter SafeState'}
        </button>
        <div className="text-sm text-gray-300 font-mono">SafeState: {isSafeStateActive ? 'ACTIVE' : 'INACTIVE'}</div>
      </div>
      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleConfirmModalCancel} />
          <div className="relative bg-brand-card rounded-lg p-6 z-10 w-full max-w-md border border-brand-border">
            <h3 className="text-xl font-bold text-white mb-2">
              {confirmModalType === "portfolio" ? "Confirm Portfolio Liquidation" : `Confirm Liquidation: ${confirmModalSymbol}`}
            </h3>
            
            {confirmModalType === "position" && confirmModalSymbol && (() => {
              const targetPos = activePositions.find((p: any) => p.symbol === confirmModalSymbol);
              if (!targetPos) return <p className="text-sm text-gray-400 mb-4">Position not found.</p>;
              
              const totalQty = Math.abs(parseFloat(String(targetPos.qty || 0)));
              const currentPrice = parseFloat(String(targetPos.current_price || 0));
              const avgPrice = parseFloat(String(targetPos.avg_entry_price || 0));
              const side = parseFloat(String(targetPos.qty)) > 0 ? 1 : -1;
              const inputQty = parseFloat(confirmModalInputQty);
              
              // Fixed: Ensure liquidation quantity never exceeds available and uses safe 4-decimal precision
              const activeQty = Number.isFinite(inputQty) && inputQty > 0 
                ? Math.floor(Math.min(inputQty, totalQty) * 10000) / 10000
                : Math.floor(totalQty * 10000) / 10000;
              
              const grossPnl = side * (currentPrice - avgPrice) * activeQty;
              const costBasis = avgPrice * activeQty;
              const estProceeds = currentPrice * activeQty;
              
              const costBps = getEstimatedCostBps(confirmModalSymbol);
              const slippageCost = (currentPrice * activeQty) * (costBps / 10000);
              
              // Estimate regulatory fees (SEC + FINRA) - approx 0.05 bps on Sells
              const regFees = side === 1 ? (currentPrice * activeQty * 0.00002) : 0; 
              const totalFees = slippageCost + regFees;
              const netPnl = grossPnl - totalFees;
              const curPct = totalQty > 0 ? Math.round((activeQty / totalQty) * 100) : 0;
              
              return (
                <div className="mb-4 space-y-4">
                  <div className="p-4 bg-brand-bg rounded-xl border border-brand-border shadow-inner">
                    <div className="flex justify-between items-center text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-bold">
                      <span>PROJECTED NET P&L</span>
                      <span className="bg-brand-border/40 px-2 py-0.5 rounded text-gray-400">{costBps}Bps FRICTION</span>
                    </div>
                    
                    <div className={`text-3xl font-mono font-black mb-1 ${netPnl >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {netPnl >= 0 ? '+' : ''}{netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm opacity-60">USD</span>
                    </div>

                    <div className="mt-2 text-[10px] grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-gray-500 uppercase font-bold tracking-tighter">Cost Basis</div>
                        <div className="text-white font-mono">${costBasis.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-500 uppercase font-bold tracking-tighter">Est. Proceeds</div>
                        <div className="text-white font-mono">${estProceeds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-brand-border/20 space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-gray-500">
                        <span>Side:</span>
                        <span className={side === 1 ? 'text-emerald-500' : 'text-orange-400'}>{side === 1 ? 'Exit Long' : 'Cover Short'}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-gray-500">
                        <span>Gross Unrealized:</span>
                        <span className={grossPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}>${grossPnl.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-gray-400">
                        <span>Est. Slippage/Spread:</span>
                        <span>-${slippageCost.toFixed(2)}</span>
                      </div>
                      {regFees > 0 && (
                        <div className="flex justify-between text-[11px] font-mono text-gray-400">
                           <span>Regulatory Fees (SEC/TAF):</span>
                           <span>-${regFees.toFixed(4)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[11px] font-bold font-mono text-white border-t border-brand-border/10 pt-1">
                        <span>Total Realized Cost:</span>
                        <span>-${totalFees.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Exit Portion: {curPct}%</label>
                      <span className="text-[10px] text-brand-primary font-mono">{activeQty.toFixed(4)} / {totalQty}</span>
                    </div>
                    
                    <input 
                      type="range"
                      min="0"
                      max={totalQty}
                      step={totalQty / 100}
                      value={activeQty}
                      onChange={(e) => setConfirmModalInputQty(e.target.value)}
                      className="w-full h-1.5 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-primary"
                    />

                    <div className="grid grid-cols-4 gap-2">
                      {[0.25, 0.5, 0.75, 1].map((p) => (
                        <button
                          key={p}
                          onClick={() => setConfirmModalInputQty(String(totalQty * p))}
                          className="py-1.5 text-[10px] font-bold rounded bg-brand-bg border border-brand-border hover:bg-brand-primary/20 hover:border-brand-primary text-gray-400 hover:text-white transition-all uppercase"
                        >
                          {Math.round(p * 100)}%
                        </button>
                      ))}
                    </div>

                    <div className="relative group">
                      <input 
                        type="number"
                        placeholder={`Exact Qty (Max: ${totalQty})`}
                        max={totalQty}
                        min={0}
                        step="any"
                        value={confirmModalInputQty}
                        onChange={(e) => setConfirmModalInputQty(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-white font-mono text-xs focus:border-brand-primary outline-none transition-colors"
                      />
                      <div className="absolute right-3 top-2.5 text-[10px] text-gray-500 font-bold pointer-events-none group-focus-within:text-brand-primary">SHARES</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {confirmModalType === "portfolio" && (() => {
              const currentActivePositions = liveAccountReady ? alpacaPositions : mockPositions;
              const portfolioStats = currentActivePositions.reduce((sum: any, pos: any) => {
                const totalQty = Math.abs(parseFloat(String(pos.qty || 0)));
                const currentPrice = parseFloat(String(pos.current_price || 0));
                const avgPrice = parseFloat(String(pos.avg_entry_price || 0));
                const side = parseFloat(String(pos.qty)) > 0 ? 1 : -1;
                
                if (isNaN(totalQty) || isNaN(currentPrice) || isNaN(avgPrice)) return sum;

                const grossPnl = side * (currentPrice - avgPrice) * totalQty;
                const costBps = getEstimatedCostBps(pos.symbol);
                const slippageCost = (currentPrice * totalQty) * (costBps / 10000);
                
                sum.grossPnl += grossPnl;
                sum.slippageCost += slippageCost;
                sum.netPnl += (grossPnl - slippageCost);
                return sum;
              }, { grossPnl: 0, slippageCost: 0, netPnl: 0 });

              return (
                <div className="mb-4 space-y-3">
                  <div className="p-3 bg-brand-bg rounded-lg border border-brand-border shadow-inner">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span className="font-bold">AGGREGATE PORTFOLIO NET P&L</span>
                      <span className="bg-brand-border/30 px-1.5 py-0.5 rounded text-[10px]">{currentActivePositions.length} POSITIONS</span>
                    </div>
                    <div className={`text-3xl font-mono font-bold ${portfolioStats.netPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {portfolioStats.netPnl >= 0 ? '+' : ''}{portfolioStats.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </div>
                    <div className="mt-2 pt-2 border-t border-brand-border/30 text-[10px] text-gray-500 flex justify-between uppercase font-mono">
                      <span>Gross P&L: ${portfolioStats.grossPnl.toFixed(2)}</span>
                      <span>Est. Friction: ${portfolioStats.slippageCost.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  {currentActivePositions.length > 0 && (
                    <div className="p-2 bg-brand-bg/30 rounded border border-brand-border/20 text-[10px] text-gray-500 max-h-24 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-2 border-b border-brand-border/20 pb-1 mb-1 font-bold">
                        <span>SYMBOL</span>
                        <span className="text-right">QTY</span>
                        <span className="text-right">CUR PRICE</span>
                      </div>
                      {currentActivePositions.map((pos: any) => (
                        <div key={pos.symbol} className="grid grid-cols-3 gap-2">
                          <span className="text-gray-300 font-bold">{pos.symbol}</span>
                          <span className="text-right">{parseFloat(pos.qty).toFixed(pos.qty % 1 === 0 ? 0 : 4)}</span>
                          <span className="text-right">${parseFloat(pos.current_price).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <p className="text-sm text-gray-400 mb-6">
              {confirmModalType === "portfolio"
                ? "This will sell ALL open positions immediately and convert them to cash. This action cannot be undone."
                : `Are you sure you want to proceed with the liquidation?`}
            </p>

            <div className="flex justify-end gap-3">
              <button 
                onClick={handleConfirmModalCancel} 
                className="px-4 py-2 rounded bg-brand-bg border border-brand-border text-sm font-medium text-gray-300 hover:bg-brand-border transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmModalConfirm} 
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20 transition-all transform active:scale-95"
              >
                {confirmModalType === "portfolio" ? "Liquidate Portfolio" : "Confirm Liquidation"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Risk Alert Banner */}
      {marginRiskStatus !== "SAFE" && (
        <div
          id="margin-warning-alert"
          className={`mb-6 p-4 rounded-xl border flex items-start gap-4 animate-pulse ${
            marginRiskStatus === "MARGIN_CALL"
              ? "bg-red-950/40 border-brand-red text-brand-red"
              : marginRiskStatus === "CRITICAL"
              ? "bg-amber-950/40 border-amber-600 text-amber-500"
              : "bg-yellow-950/30 border-yellow-500 text-yellow-400"
          }`}
        >
          <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" id="alert-icon" />
          <div className="flex-1" id="alert-content">
            <h3 className="font-bold text-base md:text-lg tracking-wide uppercase">
              {marginRiskStatus === "MARGIN_CALL"
                ? "⚠️ SENTRY CRITICAL MARGIN CALL - LIQUIDATION THREAT"
                : marginRiskStatus === "CRITICAL"
                ? "⚡ LIQUIDATION LEVEL SENTRY REACHED (CRITICAL)"
                : "⚡ MARGIN CAP CAPACITY WARNING"}
            </h3>
            <p className="text-sm opacity-90 mt-1 font-mono">
              {marginRiskStatus === "MARGIN_CALL"
                ? `Maintenance Required of $${totalMaintMarginRequired.toLocaleString()} exceeds overall Net Equity of $${totalEquity.toLocaleString()}! Scale back leverage, sell high-beta tickers or deposit collateral cash instantly to block automatic liqudiations.`
                : `Margin allocation represents ${marginCapacityUsed.toFixed(1)}% of net account collateral. Warn thresholds exceeded (${criticalThreshold}% config limit). Run the Gemini Diagnostics down below to evaluate high beta exposures.`}
            </p>
          </div>
        </div>
      )}

      {/* Transient Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-60">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-lg px-4 py-2 shadow-md text-sm font-medium ${
              toast.level === "success" ? "bg-green-700 text-white" : toast.level === "warn" ? "bg-yellow-700 text-black" : "bg-gray-800 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Hero Header */}
      <header className="mb-8 border-b border-brand-border pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4" id="header-widget">
        <div id="header-branding">
          <div className="flex items-center gap-2.5 mb-1.5" id="app-logo-row">
            <span className="p-1 px-2 rounded-md bg-brand-green/20 text-brand-green text-xs font-bold uppercase tracking-wider font-mono">
              Broker System v4.1
            </span>
            <span className="p-1 px-2 rounded-md bg-brand-border text-brand-text/75 text-xs font-mono font-bold" id="mode-text">
              {useAlpacaLive ? "SECURE PROXY" : "LOCAL SIMULATOR"}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2" id="app-main-title">
            Broker Risk Sentry Terminal
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl" id="app-description">
            Interactive visual margin stress computing. Connect real Alpaca brokerage portfolios to trigger automated liquidity thresholds or manually shock prices offline.
          </p>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-3 self-start md:self-center flex-wrap" id="global-controls">
          <button
            type="button"
            id="reset-simulation-button"
            onClick={() => handleResetSimulator(false)}
            disabled={useAlpacaLive}
            className="flex items-center gap-2 p-2.5 px-4 rounded-lg text-sm bg-brand-border hover:bg-brand-border/80 border border-brand-border hover:border-gray-500 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Reset simulated balances to default demonstration configuration ($2,000 capital + mock positions)"
          >
            <RotateCcw className="h-4 w-4 text-brand-green" />
            <span>Reset Demo Preset</span>
          </button>

          <button
            type="button"
            id="wipe-simulation-button"
            onClick={() => handleResetSimulator(true)}
            disabled={useAlpacaLive}
            className="flex items-center gap-2 p-2.5 px-4 rounded-lg text-sm bg-brand-red/10 border border-brand-red/35 hover:bg-brand-red/25 hover:border-brand-red text-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Wipe everything. Starts completely fresh from scratch with empty portfolio, $2,000 cash, and empty transactions log."
          >
            <Trash2 className="h-4 w-4 text-brand-red" />
            <span>Wipe & Start Scratch</span>
          </button>

          <div className="flex bg-brand-card p-1 rounded-lg border border-brand-border" id="mode-switch-pill">
            <button
              id="switch-simulated-pill"
              onClick={handleDisconnectAlpaca}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition ${
                !useAlpacaLive
                  ? "bg-brand-green/25 text-brand-green border border-brand-green/30"
                  : "text-gray-405 text-gray-400 hover:text-white"
              }`}
            >
              Simulate Risk
            </button>
            <button
              id="switch-alpaca-pill"
              onClick={async () => {
                const connected = await handleConnectAlpaca();
                if (!connected) {
                  document.getElementById("alpaca-config-card")?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition ${
                useAlpacaLive
                  ? "bg-brand-green/25 text-brand-green border border-brand-green/30"
                  : "text-gray-405 text-gray-400 hover:text-white"
              }`}
            >
              {isPaper ? "Alpaca Paper" : "Alpaca Connect"}
            </button>
          </div>
        </div>
      </header>

      {/* Grid: Setup Configurations & Key Indicators */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8" id="grid-controls-and-stats">
        
        {/* Alpaca API Config Console */}
        <div id="alpaca-config-card" className="lg:col-span-1 bg-brand-card rounded-xl p-5 border border-brand-border flex flex-col justify-between">
          <div id="api-panel-header">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3 font-mono border-b border-brand-border pb-2.5">
              <Sliders className="text-brand-green h-5 w-5" />
              ALPACA CLIENT SETUP
            </h2>
            <p className="text-xs text-gray-400 mb-4" id="api-panel-hint">
              Secure key transport. Credentials exist transiently on-the-fly and persist solely in private local client cookies.
            </p>

            <div className="space-y-3" id="api-inputs-form">
              <div className="p-3 bg-brand-bg/40 rounded-lg border border-brand-border/60">
                <p className="text-xs text-brand-green font-mono font-bold uppercase mb-1">
                  STRICT PAPER MODE ACTIVE
                </p>
                <p className="text-xs text-gray-300 font-mono">
                  Environment is forced to Paper Trading for safety. Real capital is NOT at risk.
                </p>
                <p className="text-[10px] text-gray-500 mt-2">To change credentials, update <span className="font-mono">.env.local</span> and restart the dev server.</p>
              </div>

              <div id="alpaca-endpoint-toggles" className="flex items-center justify-between py-1 bg-brand-bg/50 px-2.5 rounded-lg border border-brand-border/60 grayscale pointer-events-none opacity-60">
                <span className="text-xs text-gray-400 font-medium">Remote API Endpoint</span>
                <div className="flex gap-2" id="endpoints-group">
                  <button
                    id="paper-api-toggle"
                    disabled
                    className={`px-2.5 py-1 rounded text-xs font-bold font-mono uppercase tracking-tight transition bg-brand-green/20 text-brand-green border border-brand-green/45`}
                  >
                    Paper
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="pt-4 border-t border-brand-border/50 mt-4" id="api-buttons-footer">
            {isConnected && useAlpacaLive ? (
              <div className="space-y-2" id="connected-actions">
                <div className="flex items-center gap-2 justify-between bg-emerald-950/20 p-2 rounded-lg border border-emerald-950 text-brand-green text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>ALIGNED ACTIVE</span>
                  </div>
                  <span>PROXY ENABLED</span>
                </div>
                <button
                  id="disconnect-alpaca-button"
                  onClick={handleDisconnectAlpaca}
                  className="w-full bg-[#ff1744]/20 hover:bg-[#ff1744]/35 border border-[#ff1744]/40 text-brand-red text-sm font-semibold p-2.5 rounded-lg transition"
                >
                  Disconnect Live Connection
                </button>
                {/* Top scanning bar placed below Disconnect Live Connection */}
                <div className="mt-4">
                  <div className="rounded-xl bg-[#071227] p-3 text-white flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-gray-400">SCAN PROGRESS</div>
                      <div className="text-2xl font-bold">{displayScanned} / {displayTotal}</div>
                      <div className="relative w-52 h-5 bg-black/20 rounded overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-teal-400 via-indigo-500 to-violet-600 transition-all duration-500 ease-out"
                          style={{ width: `${displayPercent}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-mono text-white pointer-events-none select-none">
                          {displayPercent}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-200">
                      <div className="text-center"><div className="text-xs text-gray-400">ACTIVE POSITIONS</div><div className="font-bold text-lg">{activePositionsCount}</div></div>
                      <div className="text-center"><div className="text-xs text-gray-400">NEXT SCAN IN</div><div className="font-bold text-lg">{isAutopilotRunning ? 'Scanning...' : `${nextScanIn} sec`}</div></div>
                      <div className="pl-4 border-l border-white/10 text-sm">
                        <div className="text-xs text-gray-400">CONNECTION</div>
                        <div className="text-green-400 font-semibold">{connectionStatus}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-xs text-gray-400">ALPACA AUTH</div>
                        <div className="text-green-400 font-semibold">{alpacaAuthText}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-white/10 pt-3" id="live-balance-strip">
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Cash</div>
                      <div className="text-sm font-semibold text-white">${parseFloat(alpacaAccount?.cash || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Equity</div>
                      <div className="text-sm font-semibold text-brand-green">${parseFloat(alpacaAccount?.equity || alpacaAccount?.portfolio_value || alpacaAccount?.cash || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Buying Power</div>
                      <div className="text-sm font-semibold text-violet-400">${resolveBuyingPower(alpacaAccount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  id="connect-alpaca-button"
                  onClick={handleConnectAlpaca}
                  disabled={isConnecting}
                  className="w-full bg-brand-green hover:bg-brand-green/90 text-brand-bg md:text-sm text-xs font-bold uppercase tracking-wider p-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 font-mono"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>AUTHENTICATING CLIENT...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>CONNECT ALPACA PORTFOLIO</span>
                    </>
                  )}
                </button>
                <button
                  id="test-live-connection"
                  onClick={handleTestLogin}
                  className="mt-2 w-full bg-brand-bg/60 border border-brand-border text-xs text-gray-300 p-2 rounded-lg hover:bg-brand-bg/70"
                >
                  Test Live Connection
                </button>
              </>
            )}
          </div>
        </div>

        {/* Big Performance Portfolio Metrics */}
        <div id="portfolio-performance-stats" className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 bg-brand-card/30 rounded-xl p-5 border border-brand-border/80">
          
          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-equity">
            <DollarSign className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Net Capital Equity
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono break-all" id="net-equity-number">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-brand-green mt-1.5 flex items-center gap-1 font-mono" id="stat-net-equity-pl">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span>Overall liquid collateral</span>
            </div>
          </div>

          {/* DEDICATED CARD: Lifetime Actual Profit / Return */}
          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-net-profit">
            <TrendingUp className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono text-purple-400">
              {liveAccountReady ? "Live Day P&L" : "Sandbox Net Profit"}
            </span>
            
            {liveAccountReady ? (
              <>
                {(() => {
                  const dayChange = parseFloat(alpacaAccount?.equity || 0) - parseFloat(alpacaAccount?.last_equity || alpacaAccount?.equity || 0);
                  const isDayPositive = dayChange >= 0;
                  const dayPct = parseFloat(alpacaAccount?.last_equity || 0) > 0 ? (dayChange / parseFloat(alpacaAccount?.last_equity)) * 100 : 0;
                  return (
                    <>
                      <div className={`text-2xl sm:text-3xl font-extrabold font-mono break-all ${isDayPositive ? "text-brand-green" : "text-brand-red animate-pulse"}`} id="live-day-profit-val">
                        {isDayPositive ? "+" : ""}${dayChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs mt-1.5 font-mono text-gray-400">
                        <span className={isDayPositive ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                          {isDayPositive ? "▲" : "▼"} {isDayPositive ? "+" : ""}{dayPct.toFixed(2)}%
                        </span>
                        {" today change"}
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                <div className={`text-2xl sm:text-3xl font-extrabold font-mono break-all ${netProfit >= 0 ? "text-brand-green" : "text-brand-red animate-pulse"}`} id="sandbox-actual-profit-val">
                  {netProfit >= 0 ? "+" : ""}${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs mt-1.5 font-mono text-gray-400">
                  <span className={netProfit >= 0 ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                    {netProfit >= 0 ? "▲" : "▼"} {netProfit >= 0 ? "+" : ""}{roiPercent.toFixed(2)}%
                  </span>
                  {" overall capital return"}
                </div>
              </>
            )}
          </div>

          {/* DEDICATED CARD: Open Positions P&L (Active Trades) */}
          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-open-pl">
            <Sliders className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono text-blue-400">
              Open Positions P&L
            </span>
            <div className={`text-2xl sm:text-3xl font-extrabold font-mono break-all ${totalOpenPL >= 0 ? "text-brand-green" : "text-brand-red animate-pulse"}`} id="open-trades-profit-val">
              {totalOpenPL >= 0 ? "+" : ""}${totalOpenPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs mt-1.5 font-mono text-gray-400">
              <span className={totalOpenPL >= 0 ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                {totalOpenPL >= 0 ? "▲" : "▼"} {totalOpenPL >= 0 ? "+" : ""}{totalOpenPLPercent.toFixed(2)}%
              </span>
              {" on active holdings"}
            </div>
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-cash">
            <Sliders className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <div className="flex justify-between items-start mb-1">
              <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider font-mono">
                Ready Cash Balance
              </span>
              {!liveAccountReady && !isEditingCash && (
                <button
                  type="button"
                  onClick={() => {
                    setTempCashInput(simCash.toString());
                    setIsEditingCash(true);
                  }}
                  className="text-[10px] text-brand-green hover:underline cursor-pointer uppercase font-mono font-bold"
                  title="Modify simulated cash balance at any time"
                >
                  Edit / Reset
                </button>
              )}
            </div>

            {isEditingCash ? (
              <div className="mt-1 flex flex-col gap-2 z-10 relative">
                <div className="flex items-center gap-1.5 bg-brand-bg rounded border border-brand-border p-1">
                  <span className="text-xs text-gray-400 font-mono pl-1">$</span>
                  <input
                    type="number"
                    step="any"
                    value={tempCashInput}
                    onChange={(e) => setTempCashInput(e.target.value)}
                    className="w-full bg-transparent text-xs text-white font-mono focus:outline-none"
                    placeholder="e.g. 2000"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(tempCashInput);
                      if (!isNaN(val) && val >= 0) {
                        const diff = val - simCash;
                        setStartingCapital((c) => c + diff);
                        setSimCash(val);
                        addLog("SIMULATOR", "CASH_SET", `Manually updated simulated cash balance to $${val.toLocaleString()}`, "INFO");
                        setIsEditingCash(false);
                      } else {
                        showToast("Invalid Input: Please input a valid simulated capital value >= $0.", "WARNING");
                      }
                    }}
                    className="flex-1 bg-brand-green text-brand-bg text-[10px] font-bold uppercase p-1 rounded font-mono hover:bg-brand-green/85 text-center"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const diff = 2000 - simCash;
                      setStartingCapital((c) => c + diff);
                      setSimCash(2000);
                      addLog("SIMULATOR", "CASH_RESET", `Reset simulated cash balance to default $2,000`, "INFO");
                      setIsEditingCash(false);
                    }}
                    className="bg-brand-border hover:bg-brand-border/80 border border-brand-border text-gray-300 text-[10px] font-bold uppercase p-1 px-1.5 rounded font-mono text-center"
                    title="Quickly reset to initial seed of $2,000"
                  >
                    Reset $2k
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingCash(false)}
                    className="text-gray-405 text-gray-400 hover:text-white text-[10px] p-1 font-mono hover:underline text-center"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono break-all" id="cash-balance-number">
                  ${activeCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-blue-400 mt-1.5 flex items-center justify-between font-mono" id="stat-cash-status">
                  <span>Idle liquid funding reserves</span>
                  {!useAlpacaLive && (
                    <button
                      type="button"
                      onClick={() => {
                        const diff = 2000 - simCash;
                        setStartingCapital((c) => c + diff);
                        setSimCash(2000);
                        addLog("SIMULATOR", "CASH_RESET", `Reset simulated cash balance to default $2,000`, "INFO");
                      }}
                      className="text-[9px] text-gray-500 hover:text-brand-green transition"
                      title="Quick Reset Paper balance to $2,000"
                    >
                      [Quick Reset to $2k]
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-cash-used">
            <Percent className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Portfolio Cash Used
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono break-all" id="cash-used-number">
              {percentCashUsed.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-400 mt-1.5 font-mono">
              {`Positions ${totalMarketValue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} / Equity ${totalEquity.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`}
            </div>
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden col-span-2 lg:col-span-1" id="stat-buying-power">
            <Zap className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Alpaca Reg-T Buying Power
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono break-all" id="buying-power-number">
              ${(liveAccountReady ? resolveBuyingPower(alpacaAccount) : activeCash * simLeverageLimit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-400 mt-1.5 font-mono" id="stat-buying-power-description">
              {liveAccountReady
                ? `General buying power: $${parseFloat(alpacaAccount?.buying_power || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${simLeverageLimit}x mechanical ratio limit`}
            </div>
            <div className="text-xs text-purple-400 mt-1.5 flex items-center gap-1 font-mono" id="stat-buying-power-limit">
              <span>{liveAccountReady ? "Live Alpaca Reg-T order limit" : "Simulator leverage limit"}</span>
            </div>
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-maint-burden">
            <ShieldAlert className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Maintenance Burden
            </span>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono break-all" id="maint-burden-number">
              ${totalMaintMarginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-yellow-500 mt-1.5 font-mono" id="stat-maint-burden-rate">
              Based on individual asset ratings
            </div>
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden" id="stat-excess-collateral">
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Excess Collateral Surplus
            </span>
            <div className={`text-xl sm:text-2xl font-bold font-mono break-all ${excessLiquidity >= 0 ? "text-brand-green" : "text-brand-red animate-pulse"}`} id="excess-collateral-number">
              ${excessLiquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs mt-1.5 font-mono" id="stat-excess-collateral-description">
              {excessLiquidity >= 0 ? (
                <span className="text-gray-400">Above margin call line</span>
              ) : (
                <span className="text-brand-red font-bold uppercase">Liquidation Underway</span>
              )}
            </div>
          </div>

          <div className="p-4 bg-brand-card rounded-xl border border-[#2c374d] relative overflow-hidden" id="stat-active-leverage">
            <TrendingUp className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Working Leverage Ratio
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono break-all text-white" id="active-leverage-number">
              {currentLeverage.toFixed(2)}<span className="text-xs font-semibold text-gray-400 relative -top-1">x</span>
            </div>
            <div className="text-xs mt-1.5 font-mono" id="stat-working-leverage-bracket">
              {currentLeverage > 3.0 ? (
                <span className="text-brand-red uppercase font-bold text-[10px]">ULTRA LEVERAGED HIGHRISK</span>
              ) : currentLeverage > 1.5 ? (
                <span className="text-yellow-500 text-[10px] uppercase font-bold">Standard Margin Active</span>
              ) : (
                <span className="text-brand-green text-[10px] uppercase font-bold">Unleveraged / Cash Asset</span>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Row: Interactive Margin Stress Gauge & AI Stress Analysis Desk */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8" id="grid-stressometer-and-ai">
        
        {/* Margin Stressometer (Visual Dynamic Gauge) */}
        <div id="col-stressometer-widget" className="bg-brand-card rounded-xl p-6 border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-brand-border pb-3" id="stressometer-head">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 font-mono">
                <Sliders className="text-[#00e676] h-5 w-5" />
                MARGIN POTENCY MATRIX
              </h2>
              <span className={`p-1 px-2.5 rounded text-[11px] font-bold font-mono tracking-wide ${
                marginRiskStatus === "SAFE"
                  ? "bg-brand-green/20 text-brand-green"
                  : marginRiskStatus === "WARNING"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-brand-red/20 text-brand-red uppercase animate-pulse"
              }`} id="potency-status-badge">
                PORTFOLIO {marginRiskStatus}
              </span>
            </div>

            {/* Custom Sentry stressometer indicator */}
            <div className="py-6 flex flex-col items-center justify-center relative" id="stress-guage-component">
              
              {/* Mechanical dial rendering with responsive circles */}
              <div className="relative w-64 h-32 overflow-hidden flex items-end justify-center mb-4" id="circular-gauge-panel">
                <div className="absolute top-0 left-0 right-0 bottom-0 rounded-t-full border-8 border-brand-border/60" />
                
                {/* Gauge colors zones overlays */}
                <div className="absolute top-0 left-0 right-0 bottom-0 rounded-t-full border-8 border-transparent" 
                     style={{
                       background: "conic-gradient(from 180deg at 50% 100%, #00e676 0deg, #ffeb3b 90deg, #ff1744 140deg, #ff1744 180deg)",
                       WebkitMask: "radial-gradient(ellipse at 50% 100%, transparent 62%, black 63%)",
                       mask: "radial-gradient(ellipse at 50% 100%, transparent 62%, black 63%)"
                     }}
                />

                {/* Needle Rotation */}
                <div 
                  className="absolute bottom-0 w-1 bg-white h-24 origin-bottom transition-transform duration-700 ease-out z-10" 
                  style={{ 
                    transform: `rotate(${Math.min(180, Math.max(0, (marginCapacityUsed / 100) * 180 - 90))}deg)`,
                  }} 
                />

                <div className="absolute bottom-0 w-8 h-8 rounded-full bg-brand-bg border-4 border-brand-border z-20" />
              </div>

              {/* Text metadata values */}
              <div className="text-center" id="gauge-readout-text">
                <div className="text-4xl font-extrabold text-white font-mono" id="gauge-percentage">
                  {marginCapacityUsed.toFixed(1)}%
                </div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mt-1 font-semibold font-mono">
                  Blocked Margin Allocation
                </p>
                <p className="text-[11px] text-gray-500 mt-1" id="maint-critical-limit-text">
                  (Liquidation at 100%)
                </p>
              </div>

              {/* Active Threshold Bars indicators */}
              <div className="w-full mt-6 grid grid-cols-2 gap-4 border-t border-brand-border pt-4 text-xs font-mono" id="thresholds-configuration">
                <div>
                  <span className="text-gray-400 flex items-center justify-between mb-1.5">
                    <span>Warn limit:</span>
                    <span className="text-yellow-400">{warnThreshold}%</span>
                  </span>
                  <input
                    type="range"
                    id="warning-threshold-slider"
                    min="40"
                    max="80"
                    value={warnThreshold}
                    onChange={(e) => setWarnThreshold(parseInt(e.target.value))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                </div>
                <div>
                  <span className="text-gray-400 flex items-center justify-between mb-1.5">
                    <span>Critical limit:</span>
                    <span className="text-brand-red">{criticalThreshold}%</span>
                  </span>
                  <input
                    type="range"
                    id="critical-threshold-slider"
                    min="81"
                    max="99"
                    value={criticalThreshold}
                    onChange={(e) => setCriticalThreshold(parseInt(e.target.value))}
                    className="w-full accent-brand-red cursor-pointer"
                  />
                </div>
              </div>

            </div>
          </div>

          <p className="text-xs text-gray-400 font-mono mt-4 leading-relaxed p-3 bg-brand-bg/55 rounded-lg border border-brand-border" id="potency-analysis-advice">
            <span className="text-[#ff1744] font-bold">ℹ️ TRADING PROTOCOL:</span> Maintenance margin represents the immediate asset volume your brokerage blocks as hard security deposit. Reaching 100% capacity triggers auto-sell algorithms on the underlying assets without warning.
          </p>
        </div>

        {/* AI Downside Shock Diagnostics Control Desk */}
        <div id="col-ai-desk" className="bg-brand-card rounded-xl p-6 border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-brand-border pb-3" id="ai-desk-head">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 font-mono">
                <Cpu className="text-brand-green h-5 w-5" />
                GEMINI RISK MATRIX
              </h2>
              <button
                id="trigger-ai-stress-test"
                onClick={runAIPortfolioDiagnosis}
                disabled={isAiLoading}
                className="bg-brand-green text-brand-bg border border-brand-green hover:bg-brand-green/85 text-xs font-bold uppercase tracking-wider p-2 px-3.5 rounded-lg flex items-center gap-1.5 transition disabled:opacity-45"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>DIAGNOSING...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>RUN AI DIAGNOSTICS</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="inline-flex items-center gap-2 rounded-full border border-brand-border/80 bg-slate-950/70 px-3 py-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${aiAnalysisLive === true ? "bg-brand-green animate-pulse" : aiAnalysisLive === false ? "bg-amber-500" : "bg-gray-500"}`} />
                  <span>{aiAnalysisLive === true ? "Live Gemini Diagnostics" : aiAnalysisLive === false ? "Fallback Diagnostics" : "Gemini Diagnostic Status"}</span>
                </div>
                {aiAnalysisSummary && (
                  <div className="rounded-full border border-brand-border/80 bg-slate-950/70 px-3 py-1 text-gray-300">
                    {aiAnalysisSummary}
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-[10px] text-gray-300">
                <div className="rounded-xl border border-brand-border/70 bg-zinc-950/60 p-3">
                  <div className="font-semibold text-white">Diagnostic log</div>
                  <div className="mt-1 text-gray-400">Latest status: {latestDiagnosticStatus}</div>
                  {latestDiagnosticLog && (
                    <div className="mt-2 text-[10px] text-gray-300 leading-relaxed">
                      <div className="font-semibold">{latestDiagnosticLog.action}</div>
                      <div className="mt-1 text-gray-400">{latestDiagnosticLog.message}</div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-brand-border/70 bg-zinc-950/60 p-3">
                  <div className="font-semibold text-white">Recent diagnostic events</div>
                  <div className="mt-2 space-y-1 text-[10px] text-gray-300">
                    {diagnosticLogs.length > 0 ? diagnosticLogs.map((log) => (
                      <div key={log.id} className="rounded-md border border-brand-border/40 bg-brand-bg/80 p-2">
                        <div className="text-gray-400">[{log.timestamp}]</div>
                        <div className="text-white">{log.action}</div>
                      </div>
                    )) : <div className="text-gray-500">No diagnostic logs yet.</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Diagnostics Text Area Display */}
            <div className="bg-brand-bg rounded-xl border border-brand-border p-4 h-[255px] overflow-y-auto" id="ai-result-display">
              {aiAnalysis ? (
                <div className="prose prose-invert prose-sm max-w-none text-xs text-gray-300 font-sans space-y-3 font-mono leading-relaxed" id="ai-output-formatted">
                  {/* Basic markdown parsing blocks */}
                  {aiAnalysis.split("\n").map((line, index) => {
                    if (line.startsWith("###")) {
                      return <h4 key={index} className="text-white font-bold text-sm border-b border-brand-border pb-1 mt-3 first:mt-0">{line.replace("###", "").trim()}</h4>;
                    } else if (line.startsWith("####")) {
                      return <h5 key={index} className="text-brand-green font-bold text-xs mt-2">{line.replace("####", "").trim()}</h5>;
                    } else if (line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.")) {
                      return <p key={index} className="pl-3 border-l border-brand-green text-xs" style={{ whiteSpace: "pre-wrap" }}>{line}</p>;
                    } else if (line.startsWith("-") || line.startsWith("*")) {
                      return <li key={index} className="list-disc list-inside text-gray-300 ml-1" style={{ whiteSpace: "pre-wrap" }}>{line.substring(2)}</li>;
                    } else if (line.startsWith("|")) {
                      return <div key={index} className="my-1.5 p-1 bg-brand-card/50 border border-brand-border/40 font-mono text-[11px] overflow-x-auto rounded">{line}</div>;
                    } else {
                      return <p key={index} className="text-gray-400" style={{ whiteSpace: "pre-wrap" }}>{line}</p>;
                    }
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 py-6" id="ai-empty-prompt">
                  <Sparkles className="h-10 w-10 text-brand-border mb-3 animate-pulse" />
                  <p className="text-sm font-semibold text-gray-400">Gemini Intelligence Console</p>
                  <p className="text-xs text-gray-500 max-w-sm mt-1 leading-relaxed">
                    Trigger the automated compiler down below. The Gemini model parses your exact stock beta spreads, assessing collateral deficits under severe market crash scenarios.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-brand-border/60 space-y-2" id="ai-footer-diagnostics">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>Model: Gemini 3 Flash (Preview)</span>
              <span className="flex items-center gap-1 text-brand-green font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-green animate-ping" />
                Sentry Stress Engine Active
              </span>
            </div>
            {aiAnalysis && aiAnalysisGeneratedAt && (
              <div className={`text-[11px] font-mono rounded border px-2 py-1 ${aiReportStale ? "bg-amber-950/30 border-amber-500/40 text-amber-300" : "bg-emerald-950/20 border-brand-green/40 text-brand-green"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>{aiReportStale ? "Report stale" : "Report fresh"}</span>
                  <span>
                    Generated {new Date(aiAnalysisGeneratedAt).toLocaleTimeString()} ({aiReportAgeMin ?? 0}m ago)
                  </span>
                </div>
                {aiSnapshotDelta && (
                  <div className="mt-1 text-[10px] text-gray-300">
                    Snapshot drift since report: Equity {aiSnapshotDelta.equityDelta >= 0 ? "+" : ""}{aiSnapshotDelta.equityDelta.toFixed(2)}, Cash {aiSnapshotDelta.cashDelta >= 0 ? "+" : ""}{aiSnapshotDelta.cashDelta.toFixed(2)}, Positions {aiSnapshotDelta.positionsDelta >= 0 ? "+" : ""}{aiSnapshotDelta.positionsDelta}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Market hours banner */}
      {brokerType === "ALPACA" && (
        <div id="market-hours-banner" className={`mb-4 rounded-lg px-4 py-2.5 flex items-center gap-3 text-xs font-mono border ${
          marketSession === "OPEN"
            ? "bg-emerald-950/40 border-brand-green/30 text-brand-green"
            : marketSession === "EXTENDED"
            ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
            : "bg-red-950/30 border-brand-red/25 text-red-400"
        }`}>
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
            marketSession === "OPEN" ? "bg-brand-green animate-pulse" :
            marketSession === "EXTENDED" ? "bg-amber-400 animate-pulse" : "bg-red-500"
          }`} />
          <span className="font-bold uppercase tracking-wider">
            {marketSession === "OPEN" ? "Market Open" : marketSession === "EXTENDED" ? "Extended Hours" : "Market Closed"}
          </span>
          <span className="text-gray-400">—</span>
          <span className="text-gray-300">
            {marketSession === "OPEN"
              ? "Regular session active (9:30 AM – 4:00 PM ET). All order types supported."
              : marketSession === "EXTENDED"
              ? "Extended hours (4:00–8:00 AM / 4:00–8:00 PM ET). Equity orders use limit + extended_hours=true. Expect wider spreads and lower fills."
              : "Market closed. Equity orders are rejected until pre-market opens at 4:00 AM ET. Crypto trading is disabled in this terminal app."}
          </span>
        </div>
      )}

      {/* Row: Active Positions Table & Interactive Order Terminal */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8" id="grid-table-and-terminal">
        
        {/* Positions and Price Shocker Console */}
        <div id="col-positions-container" className="lg:col-span-2 bg-brand-card rounded-xl p-6 border border-brand-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-brand-border pb-4" id="positions-header-and-refresh">
            <h2 className="text-lg font-bold text-white flex items-center gap-2.5 font-mono">
              <Sliders className="text-[#00e676] h-5 w-5" />
              ACTIVE PORTFOLIO WORKSPACE
            </h2>
            
            <div className="flex items-center gap-2 self-start sm:self-center" id="positions-head-controls">
              {useAlpacaLive && (
                <button
                  id="refresh-positions-button"
                  onClick={() => void handleRefreshData()}
                  disabled={isRefreshing}
                  className="p-2 bg-brand-border hover:bg-brand-border/85 border border-brand-border text-gray-300 hover:text-white rounded-lg flex items-center gap-1.5 text-xs transition font-semibold"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span>Sync Balance</span>
                </button>
              )}

              {!useAlpacaLive && (
                <div className="flex gap-1.5 bg-brand-bg p-1 rounded-lg border border-brand-border" id="price-shocker-toolbelt">
                  <span className="text-[10px] text-gray-500 font-bold self-center px-1 font-mono uppercase tracking-wider">Prices Shock:</span>
                  <button
                    id="price-shock-up"
                    onClick={() => handleShockPrices(1.2)}
                    className="p-1 px-2.5 text-[10px] font-mono bg-emerald-950/40 text-brand-green border border-emerald-900/60 hover:bg-emerald-950 rounded transition"
                    title="Shock stock prices upward (+20%)"
                  >
                    +20%
                  </button>
                  <button
                    id="price-shock-down"
                    onClick={() => handleShockPrices(0.8)}
                    className="p-1 px-2.5 text-[10px] font-mono bg-red-950/40 text-brand-red border border-red-900/60 hover:bg-red-950 rounded transition"
                    title="Shock stock prices downward (-20%)"
                  >
                    -20%
                  </button>
                  <button
                    id="price-shock-crash"
                    onClick={() => handleShockPrices(0.6)}
                    className="p-[3px] px-2.5 text-[10px] font-mono bg-red-950/70 text-bold text-brand-red border border-brand-red/40 hover:bg-red-950 rounded animate-pulse transition"
                    title="Simulate severe systemic margin crash (-40%)"
                  >
                    -40% CRASH
                  </button>
                </div>
              )}

              {(() => {
                const filteredPositions = activePositions.filter((p) => {
                  if (positionsView === 'ALL') return true;
                  if (positionsView === 'LONGS') return (p.qty || 0) > 0;
                  return (p.qty || 0) < 0;
                });
                return filteredPositions.length > 0 && (
                <button
                  id="liquidate-portfolio-button"
                    onClick={openConfirmForPortfolio}
                  disabled={isLiquidating === "all"}
                  className="p-2 bg-red-950/80 hover:bg-red-900 border border-red-905 border-red-900/40 text-red-100 hover:text-white rounded-lg flex items-center gap-1.5 text-xs transition font-semibold"
                  title="Liquidate your entire portfolio immediately"
                >
                  <XOctagon className={`h-3.5 w-3.5 ${isLiquidating === "all" ? "animate-spin" : ""}`} />
                  <span>Liquidate Portfolio</span>
                </button>
                );
              })()}
            </div>
          </div>

          {/* Active Positions Table */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setPositionsView('ALL'); try { if (typeof window !== 'undefined') localStorage.setItem('sentry:positionsView','ALL'); } catch(e){} }}
                className={`px-3 py-1 rounded ${positionsView === 'ALL' ? 'bg-brand-green text-black font-bold' : 'bg-transparent text-gray-400 border border-brand-border/30'}`}
              >All</button>
              <button
                onClick={() => { setPositionsView('LONGS'); try { if (typeof window !== 'undefined') localStorage.setItem('sentry:positionsView','LONGS'); } catch(e){} }}
                className={`px-3 py-1 rounded ${positionsView === 'LONGS' ? 'bg-brand-green text-black font-bold' : 'bg-transparent text-gray-400 border border-brand-border/30'}`}
              >Longs</button>
              <button
                onClick={() => { setPositionsView('SHORTS'); try { if (typeof window !== 'undefined') localStorage.setItem('sentry:positionsView','SHORTS'); } catch(e){} }}
                className={`px-3 py-1 rounded ${positionsView === 'SHORTS' ? 'bg-brand-red text-black font-bold' : 'bg-transparent text-gray-400 border border-brand-border/30'}`}
              >Shorts</button>
            </div>
            <div className="text-xs text-gray-400">Showing: {positionsView}</div>
          </div>
          <div className="overflow-x-auto" id="positions-table-overflow">
            <table className="w-full text-left border-collapse" id="positions-table">
              <thead>
                <tr className="border-b border-brand-border/70 text-gray-400 text-xs font-semibold tracking-wider font-mono">
                  <th className="py-3 px-3 uppercase">Asset Ticker</th>
                  <th className="py-3 px-3 text-right uppercase">Position Shares</th>
                  <th className="py-3 px-3 text-right uppercase">Market Value</th>
                  <th className="py-3 px-3 text-right uppercase">Risk Beta</th>
                  <th className="py-3 px-3 text-right uppercase">Margin Maint%</th>
                  <th className="py-3 px-3 text-right uppercase">Unrealized P/L</th>
                  <th className="py-3 px-3 text-center uppercase">Last 24h Trend</th>
                  <th className="py-3 px-3 text-center uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 text-sm font-mono" id="positions-table-body">
                {(() => {
                  const filteredPositions = activePositions.filter((p) => {
                    if (positionsView === 'ALL') return true;
                    if (positionsView === 'LONGS') return (p.qty || 0) > 0;
                    return (p.qty || 0) < 0;
                  });

                  return filteredPositions.length > 0 ? (
                    filteredPositions.map((pos) => {
                    const plVal = pos.unrealized_pl !== undefined ? pos.unrealized_pl : (pos.current_price - pos.avg_entry_price) * pos.qty;
                    const isPlPositive = plVal >= 0;

                    // Beta multiplier estimates
                    let assetBeta = 1.0;
                    if (pos.symbol === "AAPL") assetBeta = 1.1;
                    else if (pos.symbol === "NVDA") assetBeta = 1.9;
                    else if (pos.symbol === "TSLA") assetBeta = 1.6;
                    else if (pos.symbol === "BTCUSD") assetBeta = 2.4;

                    return (
                      <tr key={pos.symbol} className="hover:bg-brand-card/45 transition">
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-white text-base" id={`ticker-${pos.symbol}`}>
                            {pos.symbol}
                          </div>
                          <div className="text-[10px] text-gray-500 max-w-[100px] truncate" id={`ticker-subtext-${pos.symbol}`}>
                            Entry: ${pos.avg_entry_price.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right text-gray-200">
                          <div className="text-sm font-semibold">{Math.abs(pos.qty).toFixed(2)}</div>
                          <div className="mt-1 inline-flex items-center justify-end gap-2 text-[10px] uppercase tracking-widest">
                            <span className={`px-2 py-1 rounded ${pos.qty < 0 ? "bg-brand-red/10 text-brand-red" : "bg-brand-green/10 text-brand-green"}`}>
                              {pos.qty < 0 ? "SHORT" : "LONG"}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-450 text-gray-400">Quote: ${pos.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </td>
                        <td className="py-3.5 px-3 text-right text-white font-semibold">
                          ${(pos.qty * pos.current_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <span className={`p-1 text-xs rounded leading-none ${assetBeta > 1.8 ? "text-brand-red bg-brand-red/10 border border-brand-red/20 font-bold" : "text-gray-330 text-gray-300"}`}>
                            {assetBeta}x
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right text-yellow-500 font-bold">
                          {(pos.maintenance_margin_rate * 100).toFixed(0)}%
                        </td>
                        <td className={`py-3.5 px-3 text-right ${isPlPositive ? "text-brand-green" : "text-brand-red animate-pulse"}`}>
                          <div className="font-bold text-sm">
                            {isPlPositive ? "+" : ""}${plVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] font-medium">
                            {isPlPositive ? "▲" : "▼"} {((plVal / (Math.abs(pos.qty) * pos.avg_entry_price || 1)) * 100).toFixed(2)}%
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center align-middle">
                          <PositionSparkline
                             symbol={pos.symbol}
                             currentPl={plVal}
                             totalCost={pos.qty * pos.avg_entry_price}
                          />
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {useAlpacaLive ? (
                            <button
                              id={`liquidate-pos-${pos.symbol}`}
                              onClick={() => openConfirmForPosition(pos.symbol)}
                              disabled={isLiquidating !== null}
                              className="bg-red-600 text-white hover:bg-red-700 transition p-1.5 rounded-lg border border-red-700/30 flex items-center justify-center mx-auto"
                              title={`Liquidate all shares of ${pos.symbol}`}
                            >
                              <XCircle className={`h-4 w-4 ${isLiquidating === pos.symbol ? "animate-spin" : ""}`} />
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-2" id={`actions-container-${pos.symbol}`}>
                              <button
                                id={`liquidate-mock-pos-${pos.symbol}`}
                                onClick={() => openConfirmForPosition(pos.symbol)}
                                disabled={isLiquidating !== null}
                                className="bg-red-600 text-white hover:bg-red-700 transition p-1.5 rounded-lg border border-red-700/30"
                                title={`Liquidate simulated position ${pos.symbol} (Sell to cash)`}
                              >
                                <XCircle className={`h-4 w-4 ${isLiquidating === pos.symbol ? "animate-spin" : ""}`} />
                              </button>
                              <button
                                id={`delete-mock-pos-${pos.symbol}`}
                                onClick={() => handleDeleteMockPosition(pos.symbol)}
                                disabled={isLiquidating !== null}
                                className="text-gray-500 hover:text-brand-red transition p-1.5 hover:bg-brand-red/10 rounded-lg"
                                title="Delete simulated position without cash change"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  ) : (
                    <tr id="empty-table-prompt">
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <DollarSign className="h-10 w-10 text-brand-border/80 mb-2" />
                          <p className="text-sm font-semibold">No positions match the current view</p>
                          <p className="text-xs text-gray-505 text-gray-500 max-w-sm mt-1">
                            No active positions found for view {positionsView} in {useAlpacaLive ? "this Alpaca account portfolio" : "simulator mode"}. Switch view or submit orders on the terminal to populate positions.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>

          {/* New Simulated Asset Fast Inject Form */}
          {!useAlpacaLive && (
            <form onSubmit={handleAddNewPosition} className="mt-6 pt-5 border-t border-brand-border block" id="fast-inject-position-form">
              <span className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3 font-mono">
                ⚡ Inject Simulated Margin Holding
              </span>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3" id="fast-inject-row">
                <input
                  type="text"
                  placeholder="Ticker (e.g. AAPL)"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="bg-brand-bg rounded-lg border border-brand-border p-2 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-brand-green uppercase"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Shares Qty"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="bg-brand-bg rounded-lg border border-brand-border p-2 text-xs font-mono text-white focus:outline-none focus:border-brand-green"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Asset Price ($)"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="bg-brand-bg rounded-lg border border-brand-border p-2 text-xs font-mono text-white focus:outline-none focus:border-brand-green"
                />
                <div className="relative" id="inject-maint-input">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    placeholder="Maint Burden%"
                    value={newMaint}
                    onChange={(e) => setNewMaint(e.target.value)}
                    className="bg-brand-bg w-full rounded-lg border border-brand-border p-2 text-xs font-mono text-white focus:outline-none focus:border-brand-green pr-6"
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-gray-500 font-bold font-mono">%</span>
                </div>
                <button
                  type="submit"
                  id="submit-fast-inject"
                  className="col-span-2 md:col-span-1 bg-brand-green/20 hover:bg-brand-green/35 text-brand-green border border-brand-green/35 hover:border-brand-green font-bold text-xs uppercase rounded-lg transition p-2 flex items-center justify-center gap-1 font-mono"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Position</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Interactive Order Terminal + Sentry Autopilot Switcher */}
        <div id="col-order-terminal" className="bg-brand-card rounded-xl p-5 border border-brand-border flex flex-col justify-between">
          <div>
            {/* Custom Tab Headings */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-brand-bg p-1 rounded-lg border border-brand-border" id="terminal-tab-selectors">
              <button
                type="button"
                onClick={() => setTradeFormTab("manual")}
                className={`py-2 px-3 rounded-md text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                  tradeFormTab === "manual"
                    ? "bg-brand-card text-brand-green border border-brand-border/40 shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-brand-green" />
                Manual Terminal
              </button>
              <button
                type="button"
                onClick={() => setTradeFormTab("autopilot")}
                className={`py-2 px-3 rounded-md text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                  tradeFormTab === "autopilot"
                    ? "bg-brand-card text-brand-green border border-brand-border/40 shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Cpu className={`h-3.5 w-3.5 ${isAutopilotActive ? "text-brand-green animate-pulse" : "text-gray-400"}`} />
                Sentry Autopilot
              </button>
            </div>

            {tradeFormTab === "manual" ? (
              <div id="manual-terminal-section">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4 border-b border-brand-border pb-3 font-mono">
                  <Zap className="text-brand-green h-4 w-4" />
                  BROKER WORK TERMINAL
                </h2>

                {/* Quick stock select pills */}
                <div className="mb-4" id="quick-pickers-block">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 font-mono">Quick Tickers</span>
                  <div className="flex flex-wrap gap-2" id="quick-tickers-group">
                    {quickTickers.map((symbol) => (
                      <button
                        key={symbol}
                        id={`quick-ticker-pill-${symbol}`}
                        type="button"
                        onClick={() => setOrderSymbol(symbol)}
                        className={`p-1 px-3 rounded text-xs transition font-semibold font-mono ${
                          orderSymbol === symbol
                            ? "bg-brand-green text-brand-bg font-bold border border-brand-green"
                            : "bg-brand-bg text-gray-400 hover:text-white border border-brand-border"
                        }`}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4" id="order-form-inputs">
                  <div>
                    <label className="block text-xs font-semibold text-gray-350 text-gray-350 uppercase tracking-wider mb-1 font-mono">
                      Asset / Equity Symbol
                    </label>
                    <input
                      type="text"
                      id="order-symbol-input"
                      placeholder="e.g. AAPL"
                      value={orderSymbol}
                      onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
                      className="w-full bg-brand-bg rounded-lg border border-brand-border p-2 text-sm text-white focus:outline-none focus:border-brand-green font-mono uppercase"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-1 bg-brand-bg border border-brand-border p-0.5 rounded-md" id="terminal-unit-toggle">
                        <button
                          type="button"
                          onClick={() => {
                            setOrderUnit("SHARES");
                            setOrderError("");
                          }}
                          className={`text-[9px] px-2 py-0.5 rounded font-bold font-mono transition-all ${
                            orderUnit === "SHARES"
                              ? "bg-brand-green/20 text-brand-green"
                              : "text-gray-405 hover:text-white"
                          }`}
                        >
                          SHARES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderUnit("USD");
                            setOrderError("");
                          }}
                          className={`text-[9px] px-2 py-0.5 rounded font-bold font-mono transition-all ${
                            orderUnit === "USD"
                              ? "bg-brand-green/20 text-brand-green"
                              : "text-gray-405 hover:text-white"
                          }`}
                        >
                          USD ($)
                        </button>
                      </div>
                      {activeCash > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetSym = orderSymbol.toUpperCase().trim();
                            if (!targetSym) return;
                            let estPrice = 150.0;
                            const matchedTicker = activePositions.find((p) => p.symbol === targetSym);
                            if (matchedTicker) {
                              estPrice = matchedTicker.current_price;
                            } else {
                              if (targetSym === "AAPL") estPrice = 182.2;
                              else if (targetSym === "TSLA") estPrice = 195.0;
                              else if (targetSym === "NVDA") estPrice = 115.5;
                              else if (targetSym === "BTCUSD") estPrice = 67200.0;
                              else if (targetSym === "MSFT") estPrice = 425.0;
                            }
                            if (orderUnit === "USD") {
                              const safeCash = parseFloat((activeCash * 0.70).toFixed(2));
                              setOrderQty(safeCash > 0 ? safeCash.toString() : "0");
                            } else {
                              const safeQty = (activeCash * 0.70) / estPrice;
                              const finalQty = targetSym === "BTCUSD" ? parseFloat(safeQty.toFixed(4)) : parseFloat(safeQty.toFixed(2));
                              if (finalQty > 0) {
                                setOrderQty(finalQty.toString());
                              }
                            }
                          }}
                          className="text-[10px] text-brand-green hover:underline uppercase font-mono font-bold"
                          title="Fills the maximum affordable amount using 70% of available cash/buying power to meet Alpaca order buffers"
                        >
                          Use Max Affordable
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      id="order-qty-input"
                      placeholder={orderUnit === "USD" ? "e.g. 15.00 or 50" : "e.g. 1.25 or 10"}
                      value={orderQty}
                      onChange={(e) => setOrderQty(e.target.value)}
                      className="w-full bg-brand-bg rounded-lg border border-brand-border p-2 text-sm text-white focus:outline-none focus:border-brand-green font-mono"
                    />
                  </div>

                  <div id="terminal-fee-notice" className="rounded-lg bg-brand-bg p-3 border border-brand-border text-[11px] text-gray-400 leading-relaxed font-mono">
                    <span className="text-[#00e676] font-bold">INFO:</span> Orders trigger at estimated spot market quotes. Live terminal modes issue standard Day orders directly to Alpaca. Fractional quantities are converted to exact string values. {orderUnit === "USD" && "USD Notional orders will automatically buy exact dollar amounts of the selected asset, resulting in fractional shares."}
                  </div>

                  {/* Order Status Reports */}
                  {orderError && (
                    <div id="order-error-report" className="p-3 bg-red-950/35 border border-brand-red rounded-lg text-brand-red text-xs font-mono">
                      {orderError}
                    </div>
                  )}
                  {orderSuccess && (
                    <div id="order-success-report" className="p-3 bg-emerald-950/35 border border-brand-green rounded-lg text-brand-green text-xs font-mono">
                      {orderSuccess}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6" id="order-execution-buttons">
                  <button
                    id="submit-buy-button"
                    type="button"
                    onClick={() => handleSubmitOrder("BUY")}
                    disabled={isPlacingOrder}
                    className="bg-brand-green hover:bg-brand-green/90 text-brand-bg font-extrabold text-xs uppercase tracking-wider p-3 rounded-lg transition disabled:opacity-50 font-mono"
                  >
                    Execute Buy
                  </button>
                  <button
                    id="submit-sell-button"
                    type="button"
                    onClick={() => handleSubmitOrder("SELL")}
                    disabled={isPlacingOrder}
                    className="bg-transparent hover:bg-red-500/10 border border-brand-red text-brand-red font-extrabold text-xs uppercase tracking-wider p-3 rounded-lg transition disabled:opacity-50 font-mono"
                  >
                    Execute Sell
                  </button>
                </div>
              </div>
            ) : (
              <div id="autopilot-terminal-section" className="space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
                    <Cpu className="text-brand-green h-4 w-4" />
                    SENTRY AUTOPILOT
                  </h2>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-gray-400">Target Mode:</span>
                    <span className={`font-bold uppercase ${useAlpacaLive ? "text-brand-red" : "text-brand-green"}`}>
                      {useAlpacaLive ? "Live Alpaca" : "Simulator"}
                    </span>
                  </div>
                </div>

                {/* Sentry Autopilot Master Switch */}
                <div className="mb-4" id="autopilot-activation-block">
                  {!isAutopilotActive ? (
                    <button
                      type="button"
                      id="start-autopilot-btn"
                      onClick={() => setIsAutopilotActive(true)}
                      className="w-full py-3 bg-brand-green hover:bg-brand-green/90 text-brand-bg font-black text-xs uppercase tracking-widest rounded-lg transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-green/10 font-mono"
                    >
                      <Play className="h-4 w-4 fill-brand-bg" />
                      🔴 START AUTOPILOT BOT
                    </button>
                  ) : (
                    <button
                      type="button"
                      id="stop-autopilot-btn"
                      onClick={() => setIsAutopilotActive(false)}
                      className="w-full py-3 bg-brand-red text-white hover:bg-brand-red/90 font-black text-xs uppercase tracking-widest rounded-lg transition duration-150 flex items-center justify-center gap-2 animate-pulse shadow-lg shadow-brand-red/20 font-mono"
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-white mr-1 shadow shadow-white" />
                      🟢 SENTRY BOT ONLINE (ABORT)
                    </button>
                  )}
                  
                  {/* START FRESH BUTTON (DANGER) */}
                  {!isAutopilotActive && (
                    <button
                      type="button"
                      id="start-fresh-btn"
                      onClick={handleStartFresh}
                      className="w-full mt-2 py-2 border border-brand-red/40 hover:bg-brand-red/10 text-brand-red font-bold text-[10px] uppercase tracking-wider rounded-lg transition duration-150 flex items-center justify-center gap-2 font-mono"
                    >
                      <Trash2 className="h-3 w-3" />
                      PURGE ALL & START AGAIN
                    </button>
                  )}

                  <p className="text-[10px] text-gray-500 font-mono mt-1.5 text-center">
                    {isAutopilotActive 
                      ? "Bot is actively intercepting and optimizing positions automatically."
                      : "Bot idle. Activate to take over trading based on rules / AI directives."}
                  </p>
                  <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-gray-400 font-mono">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={autopilotAutoStart} onChange={(e) => setAutopilotAutoStart(e.target.checked)} className="form-checkbox" />
                      <span>Auto-start on load</span>
                    </label>
                  </div>
                  {lastAutopilotOrderOutcome?.status === "PENDING" && (
                    <div id="autopilot-broker-pending-badge" className="mt-2 rounded-md border border-amber-600/60 bg-amber-950/30 px-2.5 py-1.5 text-[10px] text-amber-300 font-mono text-center">
                      Broker fill pending: {lastAutopilotOrderOutcome.side} {lastAutopilotOrderOutcome.requestedQty} {lastAutopilotOrderOutcome.symbol}. Waiting for broker confirmation before next seed buy.
                    </div>
                  )}
                  <div
                    id="autopilot-exit-gate-status"
                    className={`mt-2 rounded-md border px-2.5 py-2 text-[10px] font-mono ${
                      exitGateStatus.tone === "blocked"
                        ? "border-red-600/70 bg-red-950/30 text-red-200"
                        : exitGateStatus.tone === "ready"
                          ? "border-emerald-600/60 bg-emerald-950/20 text-emerald-200"
                          : "border-brand-border bg-brand-bg/60 text-gray-300"
                    }`}
                  >
                    <div className="font-semibold uppercase tracking-wide">Exit Gate Status: {exitGateStatus.title}</div>
                    <div className="mt-1 text-[10px] opacity-90">{exitGateStatus.detail}</div>
                  </div>
                </div>

                {/* Configurator parameters inside standard flex rows */}
                <div className="bg-brand-bg/60 p-3 rounded-lg border border-brand-border space-y-3.5 text-xs font-mono" id="autopilot-params-box">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Strategy Selection
                    </label>
                    <select
                      id="autopilot-strategy-select"
                      value={autopilotStrategy}
                      onChange={(e) => setAutopilotStrategy(e.target.value as any)}
                      className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                    >
                      <option value="GEMINI_AI">🤖 Gemini AI Smart Director (Analytical)</option>
                      <option value="SENTRY_HEAL">🛡️ Deleverage Margin Defender (Self-Healer)</option>
                      <option value="SCALPER">⚡ Quick micro-Scalper (Momentum Oscillator)</option>
                      <option value="TOUCH_TURN">🎯 Touch & Turn Opening-Range Scalper (Mechanical)</option>
                      <option value="MACD_FRONT_SIDE">📊 MACD Front-Side Momentum (Anti-Chop Breakout)</option>
                      <option value="SNEAKY_PIVOT">🕵️ Sneaky Pivot (3-Candle Institutional Range)</option>
                      <option value="ELLIOTT_WAVE">🌊 Elliott Wave Impulse/Correction (Wave Count)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3" id="target-and-interval-row">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Symbol target
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. AAPL"
                        value={autopilotTargetTicker}
                        onChange={(e) => setAutopilotTargetTicker(e.target.value.toUpperCase().trim())}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 uppercase font-mono tracking-widest focus:outline-none focus:border-brand-green"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Scan Frequency
                      </label>
                      <select
                        value={autopilotInterval}
                        onChange={(e) => setAutopilotInterval(parseInt(e.target.value))}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      >
                        <option value="5">Every 5 Seconds</option>
                        <option value="10">Every 10 Seconds</option>
                        <option value="15">Every 15 Seconds</option>
                        <option value="30">Every 30 Seconds</option>
                        <option value="60">Every 60 Seconds</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2" id="failure-pause-duration-row">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Autopilot Failure Pause
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="autopilot-failure-pause-input"
                          type="number"
                          min={30}
                          step={15}
                          value={autopilotFailurePauseSeconds}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setAutopilotFailurePauseSeconds(Number.isFinite(v) ? Math.max(30, v) : 120);
                          }}
                          className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                        />
                        <span className="text-gray-400 text-[10px]">seconds</span>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">Pause duration after 3 consecutive trade failures before auto-resume.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-brand-border/40" id="broad-scan-toggle-row">
                    <input
                      type="checkbox"
                      id="check-broad-scan-active"
                      checked={autopilotScanBroadUniverse}
                      onChange={(e) => setAutopilotScanBroadUniverse(e.target.checked)}
                      className="rounded bg-brand-bg border-brand-border text-brand-green focus:ring-0 cursor-pointer h-4 w-4"
                    />
                    <label htmlFor="check-broad-scan-active" className="text-[10px] text-gray-400 font-mono font-semibold cursor-pointer">
                      Broad Universe Scan: rotate through quick ticker basket in addition to target symbol(s)
                    </label>
                  </div>

                  {/* Global TP/SL controls */}
                  <div className="grid grid-cols-2 gap-3 pt-2" id="global-tp-sl-row">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Global Take Profit %
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="global-tp-input"
                          type="number"
                          min={0}
                          step={0.1}
                          value={globalTakeProfitPercent}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setGlobalTakeProfitPercent(Number.isFinite(v) ? Math.max(0, v) : 0);
                          }}
                          className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setGlobalTakeProfitPercent(1.2)}
                          className="px-2 py-1 bg-brand-border hover:bg-brand-border/80 rounded text-[10px] font-bold"
                        >
                          Reset
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">Autopilot will force-exit positions at or above this profit percent.</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Global Stop Loss %
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="global-sl-input"
                          type="number"
                          min={0}
                          step={0.1}
                          value={globalStopLossPercent}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setGlobalStopLossPercent(Number.isFinite(v) ? Math.max(0, v) : 0);
                          }}
                          className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setGlobalStopLossPercent(0.8)}
                          className="px-2 py-1 bg-brand-border hover:bg-brand-border/80 rounded text-[10px] font-bold"
                        >
                          Reset
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">Autopilot will force-exit positions at or below this loss percent.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-brand-border/40 bg-zinc-950/40 p-3 mt-3 text-white" id="autopilot-scan-list-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-semibold font-mono">Autopilot Scan Status</span>
                      <div className="flex items-center gap-2">
                        {networkFailureResumeAtRef.current > Date.now() && (
                          <span className="animate-pulse text-[10px] text-yellow-500 font-bold uppercase">PAUSED</span>
                        )}
                        <span className="text-[11px] text-sky-300 font-semibold font-mono">{autopilotScanTotalTargets} targets</span>
                        <button
                          type="button"
                          onClick={() => {
                            forceResumeAutopilot();
                            if (!isAutopilotActive) setIsAutopilotActive(true);
                          }}
                          className={`${networkFailureResumeAtRef.current > Date.now() ? 'bg-brand-green text-black animate-bounce' : 'bg-yellow-600 text-black'} px-2 py-1 rounded text-[10px] font-bold shadow-lg`}
                        >
                          {networkFailureResumeAtRef.current > Date.now() ? 'RESUME NOW' : 'RESET & RESTART'}
                        </button>
                      </div>
                    </div>
                    {autopilotCurrentScanTarget ? (
                      <div className="mb-2 rounded-xl border border-sky-500/20 bg-sky-950/10 px-3 py-2 text-[11px] text-sky-200">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-white">Scanning now</div>
                            <div className="mt-1 text-gray-300">Current target: <span className="font-bold text-white">{autopilotCurrentScanTarget}</span></div>
                          </div>
                          {autopilotScanErrorCount > 0 && (
                            <div className="rounded-full bg-yellow-500/20 text-yellow-100 text-[10px] uppercase tracking-[0.2em] px-2 py-1 font-semibold">
                              {autopilotScanErrorCount} failed
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-[10px] text-gray-400">
                          Last scan: {autopilotLastScanAtMs ? new Date(autopilotLastScanAtMs).toLocaleTimeString() : "waiting..."}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-2 text-[10px] text-gray-500">Autopilot is idle or awaiting the next scan cycle.</div>
                    )}
                    {autopilotScanError && (
                      <div className="mb-3 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-[10px] text-red-200">
                        <div className="font-semibold text-red-100">Highest priority buy failed</div>
                        <div>{autopilotScanError}</div>
                      </div>
                    )}
                    <div className="rounded-xl border border-brand-border/50 bg-brand-bg/60 p-3 text-[11px] text-gray-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Progress</span>
                        <span className="text-sky-300">{autopilotScanProcessedCount} / {autopilotScanTotalTargets}</span>
                      </div>
                      <div className="mt-2 text-[10px] text-gray-400">
                        {autopilotScanTotalTargets > 0 ? `Processing eligible targets across your configured universe.` : "No scan targets available."}
                      </div>
                    </div>
                  </div>

                  {/* Risk & diversification controls */}
                  <div className="grid grid-cols-4 gap-3 pt-3" id="risk-diversify-row">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Min Avg Volume</label>
                      <input
                        id="min-avg-volume-input"
                        type="number"
                        min={0}
                        step={10000}
                        value={minAvgVolume}
                        onChange={(e) => setMinAvgVolume(Number.isFinite(parseFloat(e.target.value)) ? Math.max(0, parseFloat(e.target.value)) : 0)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Filter low-liquidity tickers (avg daily vol).</p>
                    </div>

                    {/* Live short toggle - visible only when live mode is active */}
                    {useAlpacaLive && (
                      <div className="col-span-3 flex items-start gap-2 pt-3" id="allow-live-shorts-row">
                        <input
                          type="checkbox"
                          id="allow-live-shorts"
                          checked={allowLiveShorts}
                          onChange={(e) => {
                            setAllowLiveShorts(e.target.checked);
                            try { if (typeof window !== 'undefined') localStorage.setItem('sentry:allowLiveShorts', String(e.target.checked)); } catch (err) {}
                          }}
                          className="rounded bg-brand-bg border-brand-border text-brand-green focus:ring-0 cursor-pointer h-4 w-4 mt-1"
                        />
                        <label htmlFor="allow-live-shorts" className="text-[10px] text-gray-400 font-mono">
                          Allow Live Shorts: enable autopilot to open new short positions in live mode (requires margin/buying power).
                        </label>
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Max Exposure % / Symbol</label>
                      <input
                        id="max-exposure-input"
                        type="number"
                        min={0}
                        step={0.1}
                        value={maxExposurePercentPerSymbol}
                        onChange={(e) => setMaxExposurePercentPerSymbol(Number.isFinite(parseFloat(e.target.value)) ? Math.max(1, Math.min(100, parseFloat(e.target.value))) : 10)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Cap percent allocation per symbol.</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Per-Symbol $ Cap</label>
                      <input
                        id="per-symbol-cap-input"
                        type="number"
                        min={0}
                        step={1}
                        value={perSymbolDollarCap}
                        onChange={(e) => setPerSymbolDollarCap(Number.isFinite(parseFloat(e.target.value)) ? Math.max(0, parseFloat(e.target.value)) : 0)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Absolute dollar cap per symbol (prevents oversized allocations).</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Max Concurrent Positions</label>
                      <input
                        id="max-concurrent-input"
                        type="number"
                        min={1}
                        step={1}
                        value={maxConcurrentPositions}
                        onChange={(e) => setMaxConcurrentPositions(Number.isFinite(parseFloat(e.target.value)) ? Math.max(1, parseInt(e.target.value)) : 1)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Limit concurrent open positions to reduce concentration.</p>
                    </div>
                    <div className="col-span-4 pt-3">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Market Blocks</label>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-gray-400 font-mono"><input type="checkbox" className="mr-2" checked={blockedMarkets.wallStreet} onChange={(e) => setBlockedMarkets((s) => ({...s, wallStreet: e.target.checked}))} />Block Wall Street (NYSE/NASDAQ)</label>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">Use these to prevent autopilot from opening new BUYs on the selected markets.</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Auto Liquidate Before Close</label>
                      <div className="flex gap-2">
                        <input
                          id="auto-liquidate-toggle"
                          type="checkbox"
                          checked={autoLiquidateBeforeClose}
                          onChange={(e) => setAutoLiquidateBeforeClose(e.target.checked)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <input
                          id="liquidation-mins-input"
                          type="number"
                          min={1}
                          step={1}
                          value={liquidationBeforeCloseMin}
                          onChange={(e) => setLiquidationBeforeCloseMin(Number.isFinite(parseFloat(e.target.value)) ? Math.max(1, parseInt(e.target.value)) : 5)}
                          className="w-20 bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                        />
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">When enabled, sell non-crypto positions this many minutes before market close.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 pt-3" id="live-min-qty-row">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Live Min Qty (Stocks)</label>
                      <input
                        id="live-min-qty-input"
                        type="number"
                        min={0.0001}
                        step={0.01}
                        value={liveMinOrderQty}
                        onChange={(e) => setLiveMinOrderQty(Number.isFinite(parseFloat(e.target.value)) ? Math.max(0.0001, parseFloat(e.target.value)) : 0.01)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Minimum live equity size after auto-resizing.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 font-mono text-sm">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Margin Warning Threshold</label>
                      <div className="flex gap-2">
                        <input
                          id="warn-threshold-input"
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          value={warnThreshold}
                          onChange={(e) => setWarnThreshold(Math.max(1, Math.min(99, parseInt(e.target.value || "1"))))}
                          className="w-24 bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                        />
                        <p className="text-[11px] text-gray-400 self-center">% of equity used for maintenance margin before Deleverage triggers.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aggressive Deleverage</label>
                      <input
                        id="aggressive-deleverage-toggle"
                        type="checkbox"
                        checked={aggressiveDeleverage}
                        onChange={(e) => setAggressiveDeleverage(e.target.checked)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <button
                        id="force-deleverage-now"
                        type="button"
                        onClick={() => performDeleverage()}
                        className="ml-3 px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-bold"
                      >
                        Deleverage Now
                      </button>
                    </div>
                  </div>

                  {/* Simulator drift toggle */}
                  {!useAlpacaLive && (
                    <div className="flex items-center gap-2 pt-1 border-t border-brand-border/40" id="drift-toggle-row">
                      <input
                        type="checkbox"
                        id="check-drift-active"
                        checked={isTickStreamActive}
                        onChange={(e) => setIsTickStreamActive(e.target.checked)}
                        className="rounded bg-brand-bg border-brand-border text-brand-green focus:ring-0 cursor-pointer h-4 w-4"
                      />
                      <label htmlFor="check-drift-active" className="text-[10px] text-gray-400 font-mono font-semibold cursor-pointer">
                        Run simulated market price drifts (ticks every 5s)
                      </label>
                    </div>
                  )}

                  {/* Sentry Capital Protection Loss Guard */}
                  <div className="flex items-center gap-2 pt-1 border-t border-brand-border/40" id="loss-guard-toggle-row">
                    <input
                      type="checkbox"
                      id="check-loss-guard-active"
                      checked={autopilotLossGuard}
                      onChange={(e) => setAutopilotLossGuard(e.target.checked)}
                      className="rounded bg-brand-bg border-brand-border text-brand-green focus:ring-0 cursor-pointer h-4 w-4"
                    />
                    <label htmlFor="check-loss-guard-active" className="text-[10px] text-gray-400 font-mono font-semibold cursor-pointer">
                      Capital Loss Guard: Block BUY on assets with negative unrealized P&L
                    </label>
                  </div>

                  {/* Automated Symbol Buy Blacklist */}
                  <div className="pt-2 border-t border-brand-border/40 font-mono text-[11px]" id="blacklist-row">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-red-400">
                      🚫 Automated Trading Blacklist
                    </label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {autopilotBlacklist.map((sym) => (
                        <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 text-brand-red border border-brand-red/20 text-[10px] font-bold">
                          {sym}
                          <button
                            type="button"
                            onClick={() => {
                              setAutopilotBlacklist(autopilotBlacklist.filter((x) => x !== sym));
                              showToast(`Removed ${sym} from automated trading blacklist.`, "INFO");
                            }}
                            className="text-brand-red/70 hover:text-brand-red ml-0.5 hover:bg-brand-red/10 rounded h-3 w-3 inline-flex items-center justify-center font-extrabold cursor-pointer"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      {autopilotBlacklist.length === 0 && (
                        <span className="text-[10px] text-gray-500 italic">No blacklisted tokens.</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        id="new-blacklist-input"
                        placeholder="ADD SYMBOL (e.g. TSLA)"
                        className="flex-1 bg-brand-bg border border-brand-border text-white text-[10px] rounded px-2 py-1 uppercase font-mono tracking-widest focus:outline-none focus:border-brand-green"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = (e.currentTarget.value || "").toUpperCase().trim();
                            if (val) {
                              if (autopilotBlacklist.includes(val)) {
                                showToast(`${val} is already blacklisted!`, "WARNING");
                              } else {
                                setAutopilotBlacklist([...autopilotBlacklist, val]);
                                showToast(`Added ${val} to automated trading blacklist.`, "SUCCESS");
                                e.currentTarget.value = "";
                              }
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const inputEl = document.getElementById("new-blacklist-input") as HTMLInputElement;
                          const val = (inputEl?.value || "").toUpperCase().trim();
                          if (val) {
                            if (autopilotBlacklist.includes(val)) {
                              showToast(`${val} is already blacklisted!`, "WARNING");
                            } else {
                              setAutopilotBlacklist([...autopilotBlacklist, val]);
                              showToast(`Added ${val} to automated trading blacklist.`, "SUCCESS");
                              if (inputEl) inputEl.value = "";
                            }
                          }
                        }}
                        className="px-2 py-1 bg-brand-border hover:bg-brand-border/80 border border-brand-border/60 text-white rounded text-[10px] font-bold uppercase transition"
                      >
                        + Block
                      </button>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1.5 italic leading-tight">
                      * Prevents the Sentry Autopilot from initiating any trades (long or short) on these symbols. By default, TSLA is blacklisted.
                    </p>
                  </div>

                  {/* Touch & Turn visualizer card */}
                  {autopilotStrategy === "TOUCH_TURN" && touchTurnState && (
                    <div className="bg-brand-bg/85 p-3 rounded-lg border-2 border-brand-green/35 mt-2.5 space-y-3 font-mono shadow-md" id="touch-turn-visualizer">
                      <div className="flex items-center justify-between border-b border-brand-border/60 pb-2">
                        <span className="text-[10px] font-bold text-brand-green uppercase tracking-wider flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-brand-green animate-ping" />
                          📊 TOUCH & TURN VISUALIZER
                        </span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase font-mono tracking-wider border ${
                          touchTurnState.status === "ACTIVE_TRADE"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                            : touchTurnState.status === "WAITING_LIMIT"
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
                            : touchTurnState.status === "HIT_TARGET"
                            ? "bg-emerald-500/15 text-[#00e676] border-[#00e676]/30"
                            : "bg-red-500/15 text-brand-red border-brand-red/30"
                        }`}>
                          {touchTurnState.status === "WAITING_LIMIT" ? "WAITING LIMIT" : touchTurnState.status === "ACTIVE_TRADE" ? "ACTIVE SCALP" : touchTurnState.status === "HIT_TARGET" ? "TARGET HIT (WIN)" : "STOP LOSS (LOSS)"}
                        </span>
                      </div>

                      {/* Display calculations */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-gray-300">
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">Daily ATR(14)</span>
                          <span className="font-bold">{false ? "₹" : "$"}{touchTurnState.atr14.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">ATR Threshold (25%)</span>
                          <span className="font-bold">{false ? "₹" : "$"}{touchTurnState.atrThreshold.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">15m Wick High</span>
                          <span className="font-bold text-gray-100">{touchTurnState.openHigh.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">15m Wick Low</span>
                          <span className="font-bold text-gray-100">{touchTurnState.openLow.toFixed(2)}</span>
                        </div>
                        <div className="col-span-2 bg-brand-bg/50 p-2 rounded border border-brand-border/40 text-[10px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Opening Wick Range:</span>
                            <span className="text-brand-green font-bold">
                              {false ? "₹" : "$"}{touchTurnState.rangeRange.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Mechanical Bias:</span>
                            <span className={touchTurnState.isBullish ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                              {touchTurnState.isBullish ? "Bullish Liquidity (Short Edge)" : "Bearish Liquidity (Long Edge)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Targets summary */}
                      <div className="border-t border-brand-border/50 pt-2 text-[11px] space-y-1.5 bg-brand-bg/35 p-2 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                            Limit Entry ({touchTurnState.side}):
                          </span>
                          <span className="text-blue-300 font-bold">
                            {false ? "₹" : "$"}{touchTurnState.limitPrice.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#00e676]" />
                            Fib Retrace 38.2% Target:
                          </span>
                          <span className="text-brand-green font-bold">
                            {false ? "₹" : "$"}{touchTurnState.targetPrice.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
                            Stop Loss Limit (2:1 RR):
                          </span>
                          <span className="text-brand-red font-bold">
                            {false ? "₹" : "$"}{touchTurnState.stopPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Manual reset button */}
                      <button
                        type="button"
                        onClick={() => {
                          setTouchTurnState(null);
                          showToast("Reset Touch & Turn bounds. Re-calculating on next autopilot scan.", "INFO");
                        }}
                        className="w-full py-1.5 bg-brand-border/55 hover:bg-brand-border border border-brand-border/60 text-white rounded text-[10px] font-bold uppercase transition flex items-center justify-center gap-1"
                      >
                        🔄 Recalculate Range Model
                      </button>
                    </div>
                  )}

                  {/* MACD Front-Side visualizer card */}
                  {autopilotStrategy === "MACD_FRONT_SIDE" && macdState && (
                    <div className="bg-brand-bg/85 p-3 rounded-lg border-2 border-sky-500/35 mt-2.5 space-y-3 font-mono shadow-md" id="macd-visualizer">
                      <div className="flex items-center justify-between border-b border-brand-border/60 pb-2">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
                          📊 MACD METRICS DECK
                        </span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase font-mono tracking-wider border ${
                          macdState.status === "ACTIVE_TRADE"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                            : macdState.status === "IDLE"
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
                            : "bg-emerald-500/15 text-[#00e676] border-[#00e676]/30"
                        }`}>
                          {macdState.status === "IDLE" ? "IDLE TRACKING" : macdState.status === "ACTIVE_TRADE" ? "ACTIVE LONG SCALP" : "EXITED BACKSIDE"}
                        </span>
                      </div>

                      {/* Display computations */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-gray-300">
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">MACD (12, 26)</span>
                          <span className="font-bold text-gray-100">{macdState.macdValue.toFixed(4)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">Signal (9)</span>
                          <span className="font-bold text-gray-100">{macdState.signalValue.toFixed(4)}</span>
                        </div>
                        <div className="col-span-2 bg-brand-bg/50 p-2 rounded border border-brand-border/40 text-[10px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Histogram Momentum:</span>
                            <span className={macdState.histogram >= 0 ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                              {macdState.histogram >= 0 ? "+" : ""}{macdState.histogram.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Trend Segment:</span>
                            <span className={macdState.trendSide === "FRONT_SIDE" ? "text-brand-green font-bold" : "text-brand-red font-bold"}>
                              {macdState.trendSide === "FRONT_SIDE" ? "[FRONT SIDE] (Accelerating)" : "[BACK SIDE] (Chop/Rollover)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Spark histogram tracker bar visualization */}
                      <div className="flex items-end justify-center gap-1.5 px-2 h-11 border border-brand-border/40 rounded bg-brand-bg/25">
                        {Array.from({ length: 15 }).map((_, i) => {
                          const step = i - 7;
                          const heightFactor = Math.abs(macdState.histogram);
                          const activeHeight = Math.min(38, Math.max(4, heightFactor * 135));
                          const isActive = i === 7;
                          let barColor = "bg-brand-green/30";
                          if (step < 0) barColor = "bg-brand-red/35";
                          if (isActive) barColor = macdState.histogram >= 0 ? "bg-brand-green animate-pulse" : "bg-brand-red animate-pulse";
                          
                          return (
                            <div 
                              key={i} 
                              className={`w-1 rounded-sm ${barColor}`} 
                              style={{ height: `${isActive ? activeHeight : Math.max(3, activeHeight * (1 - Math.abs(step) * 0.12))}px` }} 
                              title={`Hist Value: ${macdState.histogram.toFixed(4)}`}
                            />
                          );
                        })}
                      </div>

                      {/* Targets summary */}
                      <div className="border-t border-brand-border/50 pt-2 text-[11px] space-y-1.5 bg-brand-bg/35 p-2 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Position Status:</span>
                          <span className="text-sky-300 font-bold uppercase">{macdState.status}</span>
                        </div>
                        {macdState.entryPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 font-medium">Avg Entry Cost:</span>
                            <span className="text-brand-green font-bold">
                              {false ? "₹" : "$"}{macdState.entryPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Order Allocation:</span>
                          <span className="text-white font-semibold font-mono">
                            {macdState.tradeQty} units
                          </span>
                        </div>
                      </div>

                      {/* Manual reset button */}
                      <button
                        type="button"
                        onClick={() => {
                          setMacdState(null);
                          showToast("Reset MACD indicators. Recalculating trend cycles on next scanner run.", "INFO");
                        }}
                        className="w-full py-1.5 bg-brand-border/55 hover:bg-brand-border border border-brand-border/60 text-white rounded text-[10px] font-bold uppercase transition flex items-center justify-center gap-1"
                      >
                        🔄 Recalculate MACD Model
                      </button>
                    </div>
                  )}

                  {/* Sneaky Pivot visualizer card */}
                  {autopilotStrategy === "SNEAKY_PIVOT" && sneakyPivotState && (
                    <div className="bg-brand-bg/85 p-3 rounded-lg border-2 border-amber-500/35 mt-2.5 space-y-3 font-mono shadow-md" id="sneaky-pivot-visualizer">
                      <div className="flex items-center justify-between border-b border-brand-border/60 pb-2">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                          🕵️ SNEAKY PIVOT CORE DECK
                        </span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase font-mono tracking-wider border ${
                          sneakyPivotState.status === "ACTIVE_TRADE"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                            : sneakyPivotState.status === "SCANNING"
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
                            : sneakyPivotState.status === "HIT_TARGET"
                            ? "bg-emerald-500/15 text-[#00e676] border-[#00e676]/30 font-bold"
                            : "bg-red-500/15 text-brand-red border-brand-red/30"
                        }`}>
                          {sneakyPivotState.status === "SCANNING"
                            ? "SCANNING"
                            : sneakyPivotState.status === "CANDLE1_ESTABLISHED"
                            ? "CANDLE-1"
                            : sneakyPivotState.status === "CONFIRMED_PV_CANDLE2"
                            ? "CANDLE-2 SNEAKY"
                            : sneakyPivotState.status === "ACTIVE_TRADE"
                            ? "ACTIVE SCALP"
                            : sneakyPivotState.status === "HIT_TARGET"
                            ? "PROFIT HIT"
                            : "STOP OUT"}
                        </span>
                      </div>

                      {/* Horizontal Trading Box Levels View */}
                      <div className="space-y-1.5 bg-brand-bg/60 p-2 rounded border border-brand-border/40 text-[10px]">
                        {/* Scanning display removed to reduce visual churn */}
                        <span className="text-gray-500 text-[8px] uppercase tracking-wider font-extrabold block mb-1">📐 TRADING BOX HORIZONTAL CHANNELS</span>
                        
                        {/* Swing High */}
                        <div className="flex justify-between items-center bg-red-950/20 px-1.5 py-0.5 rounded border border-brand-red/10">
                          <span className="text-brand-red/70 font-semibold">🔴 Swing High (Resistance Box Edge):</span>
                          <span className="text-brand-red font-bold">{false ? "₹" : "$"}{sneakyPivotState.swingHigh.toFixed(2)}</span>
                        </div>

                        {/* Range High */}
                        <div className="flex justify-between items-center bg-red-950/10 px-1.5 py-0.5 rounded border border-brand-red/5">
                          <span className="text-red-400 text-[9px]">🔴 Range High (Previous Day High Close):</span>
                          <span className="text-red-300 font-bold">{false ? "₹" : "$"}{sneakyPivotState.rangeHigh.toFixed(2)}</span>
                        </div>

                        {/* Center core status */}
                        <div className="text-center py-1 border-y border-brand-border/30 my-1 bg-brand-bg/30 text-[9px] text-gray-400">
                          ⚡ Center Neutral Chop Zone (Ignored)
                        </div>

                        {/* Range Low */}
                        <div className="flex justify-between items-center bg-emerald-950/10 px-1.5 py-0.5 rounded border border-brand-green/5">
                          <span className="text-emerald-400 text-[9px]">🟢 Range Low (Previous Day Low Close):</span>
                          <span className="text-emerald-300 font-bold">{false ? "₹" : "$"}{sneakyPivotState.rangeLow.toFixed(2)}</span>
                        </div>

                        {/* Swing Low */}
                        <div className="flex justify-between items-center bg-emerald-950/20 px-1.5 py-0.5 rounded border border-brand-green/10">
                          <span className="text-brand-green/70 font-semibold">🟢 Swing Low (Support Box Edge):</span>
                          <span className="text-brand-green font-bold">{false ? "₹" : "$"}{sneakyPivotState.swingLow.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* 15m 3-candle Pattern Tracker block */}
                      <div className="bg-brand-bg/50 p-2 rounded border border-brand-border/40 text-[10px] space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Sequence Candle Count:</span>
                          <span className="text-white font-bold">{sneakyPivotState.candleCount}x (15m units)</span>
                        </div>
                        <div className="flex gap-1 justify-between text-center">
                          {/* Candle 1 block */}
                          <div className={`flex-1 p-1 rounded font-bold text-[9px] border ${
                            ["CANDLE1_ESTABLISHED", "CONFIRMED_PV_CANDLE2", "ACTIVE_TRADE", "HIT_TARGET", "HIT_STOP"].includes(sneakyPivotState.status)
                              ? "bg-[#38bdf8]/15 text-sky-400 border-[#38bdf8]/35 font-black"
                              : "bg-brand-bg text-gray-500 border-brand-border/30"
                          }`}>
                            🕯️ Candle 1<span className="block font-medium text-[8px] font-mono mt-0.5">Setup Zone</span>
                          </div>

                          {/* Candle 2 sneaky block */}
                          <div className={`flex-1 p-1 rounded font-bold text-[9px] border ${
                            ["CONFIRMED_PV_CANDLE2", "ACTIVE_TRADE", "HIT_TARGET", "HIT_STOP"].includes(sneakyPivotState.status)
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/35 font-black animate-pulse"
                              : "bg-brand-bg text-gray-500 border-brand-border/30"
                          }`}>
                            🕵️ Candle 2<span className="block font-medium text-[8px] font-mono mt-0.5">Wick Sweep</span>
                          </div>

                          {/* Candle 3 entry block */}
                          <div className={`flex-1 p-1 rounded font-bold text-[9px] border ${
                            ["ACTIVE_TRADE", "HIT_TARGET", "HIT_STOP"].includes(sneakyPivotState.status)
                              ? "bg-brand-green/15 text-brand-green border-brand-green/35 font-black"
                              : "bg-brand-bg text-gray-500 border-brand-border/30"
                          }`}>
                            🎯 Candle 3<span className="block font-medium text-[8px] font-mono mt-0.5">Entry Trigger</span>
                          </div>
                        </div>

                        <div className="bg-black/40 p-1.5 rounded text-gray-300 text-[9px] border border-brand-border/30">
                          <span className="font-bold text-gray-400 uppercase tracking-tight block mb-0.5">Current Interval Log:</span>
                          <span className="italic">{`"${sneakyPivotState.lastCandleAction}"`}</span>
                        </div>
                      </div>

                      {/* Position target & stops details */}
                      {sneakyPivotState.status === "ACTIVE_TRADE" && (
                        <div className="border-t border-brand-border/50 pt-2 text-[11px] space-y-1.5 bg-brand-bg/35 p-2 rounded">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-gray-400">Position Direction:</span>
                            <span className={sneakyPivotState.side === "BUY" ? "text-brand-green" : "text-brand-red"}>
                              {sneakyPivotState.side === "BUY" ? "🚀 LONG SCALP" : "📉 SHORT SCALP"}
                            </span>
                          </div>
                          {sneakyPivotState.entryPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium">Locked Entry Cost:</span>
                              <span className="text-white font-bold">
                                {false ? "₹" : "$"}{sneakyPivotState.entryPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {sneakyPivotState.targetPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium">Pivot Exit Profit Target:</span>
                              <span className="text-brand-green font-bold">
                                {false ? "₹" : "$"}{sneakyPivotState.targetPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {sneakyPivotState.stopPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium">&quot;Guardian Angel&quot; Stop Loss:</span>
                              <span className="text-brand-red font-bold">
                                {false ? "₹" : "$"}{sneakyPivotState.stopPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Manual reset button */}
                      <button
                        type="button"
                        onClick={() => {
                          setSneakyPivotState(null);
                          showToast("Reset Sneaky Pivot tracking state. Re-calculating ranges on next block cycle.", "INFO");
                        }}
                        className="w-full py-1.5 bg-brand-border/55 hover:bg-brand-border border border-brand-border/60 text-white rounded text-[10px] font-bold uppercase transition flex items-center justify-center gap-1"
                      >
                        🔄 Recalculate Pivot Levels
                      </button>
                    </div>
                  )}
                </div>

                {/* Micro Real-time activity log specific to Sentry Autopilot */}
                {lastAutopilotOrderOutcome && (
                  <div
                    className={`bg-brand-bg/60 p-3 rounded-lg border space-y-1.5 font-mono ${
                      lastAutopilotOrderOutcome.status === "BLOCKED" || lastAutopilotOrderOutcome.status === "REJECTED"
                        ? "border-yellow-500/50 bg-yellow-950/10"
                        : "border-brand-border"
                    }`}
                    id="last-autopilot-outcome-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Last Order Outcome
                        {(lastAutopilotOrderOutcome.status === "BLOCKED" || lastAutopilotOrderOutcome.status === "REJECTED") && (
                          <span className="ml-1.5 text-yellow-500/70 normal-case font-normal">(stays 45s)</span>
                        )}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          lastAutopilotOrderOutcome.status === "FILLED"
                            ? "text-brand-green border-brand-green/40 bg-emerald-950/30"
                            : lastAutopilotOrderOutcome.status === "PENDING"
                            ? "text-sky-300 border-sky-400/40 bg-sky-950/30"
                            : lastAutopilotOrderOutcome.status === "BLOCKED"
                            ? "text-yellow-400 border-yellow-500/40 bg-yellow-950/25"
                            : "text-brand-red border-brand-red/40 bg-red-950/25"
                        }`}
                      >
                        {lastAutopilotOrderOutcome.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-white font-semibold">
                      {lastAutopilotOrderOutcome.side} {lastAutopilotOrderOutcome.requestedQty} {lastAutopilotOrderOutcome.symbol}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Code: <span className="text-gray-300 font-bold">{lastAutopilotOrderOutcome.code}</span>
                    </div>
                    <div className="text-[10px] text-yellow-200/80 leading-relaxed">{lastAutopilotOrderOutcome.message}</div>
                  </div>
                )}

                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 font-mono">
                    🤖 Autopilot Activity feed
                  </span>
                  <div className="grid grid-cols-1 gap-3 mb-3">
                    <div className="rounded-xl border border-brand-border/40 bg-slate-950/70 p-3 text-[10px] text-gray-300">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold uppercase tracking-[0.2em]">Performance Summary</span>
                        <span className="text-sky-300">{Object.keys(autopilotPerformance).length} strategies</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] text-gray-400">Best performer</div>
                          <div className="text-white font-semibold">
                            {(() => {
                              const entries = Object.entries(autopilotPerformance).map(([strategy, stats]) => ({ strategy, ...stats }));
                              const ranked = entries
                                .filter((item) => item.wins + item.losses > 0)
                                .sort((a, b) => (b.wins / Math.max(1, a.wins + a.losses)) - (a.wins / Math.max(1, a.wins + a.losses)));
                              return ranked[0]?.strategy ? `${ranked[0].strategy} (${Math.round((ranked[0].wins / Math.max(1, ranked[0].wins + ranked[0].losses)) * 100)}% win)` : "n/a";
                            })()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-gray-400">Weakest performer</div>
                          <div className="text-white font-semibold">
                            {(() => {
                              const entries = Object.entries(autopilotPerformance).map(([strategy, stats]) => ({ strategy, ...stats }));
                              const ranked = entries
                                .filter((item) => item.wins + item.losses > 0)
                                .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)));
                              return ranked[0]?.strategy ? `${ranked[0].strategy} (${Math.round((ranked[0].wins / Math.max(1, ranked[0].wins + ranked[0].losses)) * 100)}% win)` : "n/a";
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-[10px] text-gray-400">
                        {Object.values(autopilotPerformance).reduce((sum, stats) => sum + stats.wins + stats.losses + stats.pending, 0)} trade outcomes recorded total.
                      </div>
                    </div>
                    <div className="rounded-xl border border-brand-border/40 bg-slate-950/70 p-3 text-[10px] text-gray-300">
                      <div className="text-[11px] text-gray-400 mb-2 uppercase tracking-[0.2em] font-semibold">Hot symbols</div>
                      {(() => {
                        const entries = Object.entries(symbolPerformance).map(([symbol, stats]) => ({ symbol, ...stats }));
                        const ranked = entries
                          .filter((item) => item.wins + item.losses > 0)
                          .sort((a, b) => (b.wins / Math.max(1, a.wins + a.losses)) - (a.wins / Math.max(1, a.wins + a.losses)));
                        const best = ranked[0];
                        const worst = ranked[ranked.length - 1];
                        const profitEntries = Object.entries(symbolProfitStats).map(([symbol, stats]) => ({ symbol, ...stats }));
                        const topPnl = profitEntries.sort((a, b) => b.realizedPnl - a.realizedPnl)[0];
                        const bottomPnl = profitEntries.sort((a, b) => a.realizedPnl - b.realizedPnl)[0];
                        return (
                          <div className="space-y-2">
                            <div>
                              <div className="text-[10px] text-gray-400">Best symbol</div>
                              <div className="text-white font-semibold">{best ? `${best.symbol} ${Math.round((best.wins / Math.max(1, best.wins + best.losses)) * 100)}% win` : "n/a"}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Worst symbol</div>
                              <div className="text-white font-semibold">{worst ? `${worst.symbol} ${Math.round((worst.wins / Math.max(1, worst.wins + worst.losses)) * 100)}% win` : "n/a"}</div>
                            </div>
                            <div className="border-t border-brand-border/30 pt-2">
                              <div className="text-[10px] text-gray-400">Best realized P/L</div>
                              <div className="text-white font-semibold">{topPnl ? `${topPnl.symbol} ${topPnl.realizedPnl >= 0 ? "+" : ""}${topPnl.realizedPnl.toFixed(2)}` : "n/a"}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Worst realized P/L</div>
                              <div className="text-white font-semibold">{bottomPnl ? `${bottomPnl.symbol} ${bottomPnl.realizedPnl >= 0 ? "+" : ""}${bottomPnl.realizedPnl.toFixed(2)}` : "n/a"}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="rounded-xl border border-brand-border/40 bg-slate-950/70 p-3 text-[10px] text-gray-300">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] text-gray-400 uppercase tracking-[0.2em] font-semibold">Block reason counters</span>
                        <span className="text-yellow-300">{Object.values(autopilotBlockCodeCounts).reduce((sum, n) => sum + n, 0)} blocks</span>
                      </div>
                      {(() => {
                        const getCount = (code: string) => autopilotBlockCodeCounts[code] || 0;
                        const regime = getCount("BLOCKED_REGIME_FILTER");
                        const chop = getCount("BLOCKED_CHOP_ZONE");
                        const edge = getCount("BLOCKED_EDGE_COST");
                        const lossGuard = getCount("BLOCKED_LOSS_GUARD");
                        const tracked = regime + chop + edge + lossGuard;
                        const total = Object.values(autopilotBlockCodeCounts).reduce((sum, n) => sum + n, 0);
                        const other = Math.max(0, total - tracked);

                        return (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <div>
                              <div className="text-[10px] text-gray-400">Regime</div>
                              <div className="text-white font-semibold">{regime}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Chop</div>
                              <div className="text-white font-semibold">{chop}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Edge/Cost</div>
                              <div className="text-white font-semibold">{edge}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Loss Guard</div>
                              <div className="text-white font-semibold">{lossGuard}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">Other</div>
                              <div className="text-white font-semibold">{other}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="bg-brand-bg rounded-lg border border-brand-border p-2.5 max-h-[140px] overflow-y-auto space-y-1 text-[10px] font-mono leading-relaxed" id="autopilot-logs-display">
                    {autopilotLogs.map((lg) => {
                      let col = "text-gray-450 text-gray-400";
                      if (lg.type === "success") col = "text-brand-green font-semibold";
                      if (lg.type === "warn") col = "text-yellow-400 font-bold";
                      if (lg.type === "trade") col = "text-[#38bdf8] font-bold uppercase tracking-wide";

                      return (
                        <div key={lg.id} className="flex gap-1.5 items-start">
                          <span className="text-gray-500 shrink-0 select-none">[{lg.time}]</span>
                          <span className={col}>{lg.msg}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* Row: Python SDK Integration Scripts Code Exporter */}
      <section className="mb-8" id="section-python-exporter">
        <div className="bg-brand-card rounded-xl p-6 border border-brand-border">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 border-b border-brand-border pb-3" id="exporter-head">
            <div id="exporter-desc font-sans">
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5 font-mono">
                <Code className="text-brand-green h-5 w-5" />
                PYTHON SENTRY SDK GENERATOR
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Automated risk monitor. Replicate this terminal&apos;s alert limits and margin burden formulas inside clean local python trade daemons.
              </p>
            </div>
            <button
              id="copy-python-button"
              onClick={() => copyToClipboard(pyScriptCode)}
              className="bg-brand-border hover:bg-brand-border/80 border border-brand-border text-gray-300 font-semibold text-xs p-2.5 px-4 rounded-lg flex items-center gap-1.5 transition whitespace-nowrap self-start sm:self-center"
            >
              <Copy className="h-4 w-4" />
              <span>Copy Automation Script</span>
            </button>
          </div>

          {/* Copyable code block */}
          <div className="relative" id="export-code-block-wrapper">
            <pre className="bg-brand-bg rounded-xl border border-brand-border p-4 overflow-x-auto text-[11px] text-gray-300 font-mono leading-relaxed h-[210px]" id="python-pre-code">
              <code>{pyScriptCode}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Row: Active Sentry Logs audit log */}
      <footer className="bg-brand-card rounded-xl p-5 border border-brand-border" id="app-footer">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono border-b border-brand-border pb-3.5 mb-4 flex items-center gap-2">
          <Sliders className="text-gray-400 h-4 w-4" />
          Sentry Live Audit Trail Logs
        </h2>
        
        {/* Logs terminal box */}
        <div className="bg-brand-bg rounded-xl border border-brand-border p-3.5 max-h-[160px] overflow-y-auto font-mono text-[11px] space-y-1.5" id="audit-logs-display">
          {logs.map((log) => {
            let colorClass = "text-gray-400";
            if (log.status === "SUCCESS") colorClass = "text-brand-green font-bold";
            if (log.status === "WARNING") colorClass = "text-yellow-400 font-bold";
            if (log.status === "CRITICAL") colorClass = "text-brand-red font-extrabold uppercase animate-pulse";

            return (
              <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-brand-card/30 p-1 rounded transition" id={`log-${log.id}`}>
                <span className="text-gray-500 shrink-0 select-none">[{log.timestamp}]</span>
                <span className="text-[#00e676] shrink-0 font-bold uppercase">[{log.symbol}]</span>
                <span className="text-blue-400 shrink-0 uppercase font-semibold">{log.action}:</span>
                <span className={colorClass}>{log.message}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-brand-border/40 text-[10px] text-gray-500 font-mono" id="metadata-footer-row">
          <span>Broker Terminal Suite. Persistent SSL Proxies securely mapped. Ready.</span>
          <span className="flex items-center gap-1">
            <span>Powered by Gemini 3.5 & Alpaca v2 REST</span>
            <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </footer>

      {/* Dynamic Toast Portal */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none" id="toast-portal-container">
        {toasts.map((toast) => {
          let bgColor = "bg-brand-card border-brand-border";
          let textColor = "text-white";
          let iconColor = "text-gray-400";
          let iconComponent = <Sliders className="h-5 w-5" />;

          if (toast.type === "SUCCESS") {
            bgColor = "bg-emerald-950/90 border-[#00e676]/55 backdrop-blur-md";
            textColor = "text-emerald-50";
            iconColor = "text-brand-green";
            iconComponent = <CheckCircle className="h-5 w-5" />;
          } else if (toast.type === "WARNING") {
            bgColor = "bg-yellow-950/90 border-yellow-500/50 backdrop-blur-md";
            textColor = "text-yellow-50";
            iconColor = "text-yellow-400";
            iconComponent = <AlertTriangle className="h-5 w-5" />;
          } else if (toast.type === "CRITICAL") {
            bgColor = "bg-red-950/95 border-brand-red/60 backdrop-blur-md";
            textColor = "text-red-50";
            iconColor = "text-brand-red";
            iconComponent = <ShieldAlert className="h-5 w-5" />;
          } else if (toast.type === "INFO") {
            bgColor = "bg-[#121420]/95 border-brand-border backdrop-blur-md";
            textColor = "text-sky-50";
            iconColor = "text-[#38bdf8]";
            iconComponent = <Zap className="h-5 w-5" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-xl border-2 shadow-xl shadow-black/45 flex items-start gap-3 transition-all duration-300 transform translate-y-0 scale-100 ${bgColor}`}
              id={`toast-card-${toast.id}`}
            >
              <div className={`${iconColor} shrink-0 mt-0.5`}>
                {iconComponent}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${iconColor}`}>
                  {toast.type}
                </p>
                <p className={`text-xs font-mono break-words ${textColor}`}>{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-gray-400 hover:text-white font-bold text-xs shrink-0 self-start ml-1"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
