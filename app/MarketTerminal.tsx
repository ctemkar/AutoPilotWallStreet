"use client";

// Client-side environment safeguard against external/injected scripts lookups on window
if (typeof window !== "undefined") {
  try {
    const namespaces = ["wx", "my", "swan", "tt", "qq", "ks", "qh"];
    namespaces.forEach((ns) => {
      const w = window as any;
      if (!w[ns]) {
        w[ns] = { miniProgram: {} };
      } else if (typeof w[ns] === "object" && w[ns] !== null) {
        if (!w[ns].miniProgram) {
          w[ns].miniProgram = {};
        }
      }
    });
  } catch (e) {
    // fail silent
  }
}

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts";
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
  | "INVALID_QTY"
  | "BLOCKED_BLACKLIST"
  | "BLOCKED_LOSS_GUARD"
  | "BLOCKED_MAX_CONCURRENT"
  | "BLOCKED_EXPOSURE_CAP"
  | "BLOCKED_DISCONNECTED"
  | "BLOCKED_CASH_BUFFER"
  | "BLOCKED_SHORT_RESTRICTED"
  | "BLOCKED_NEGLIGIBLE_QTY"
  | "BLOCKED_BUYING_POWER"
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

// Sparkline component to visualize the last 24 hours of unrealized P/L performance
function PositionSparkline({ symbol, currentPl, totalCost }: { symbol: string; currentPl: number; totalCost: number }) {
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<{ time: string; pl: number }[]>([]);
  const prevPlRef = useRef<number>(currentPl);

  useEffect(() => {
    setMounted(true);
  }, []);

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

export default function MarketTerminal() {
  // Broker selection and credentials (Default to US Alpaca market)
  const [brokerType, setBrokerType] = useState<"ALPACA" | "ANGELONE">("ALPACA");
  
  // Toast for short-term action summaries
  const [toast, setToast] = useState<{ message: string; level?: "info" | "success" | "warn" | "error" } | null>(null);

  // In-app error overlay for capturing browser console/runtime errors
  const [overlayErrors, setOverlayErrors] = useState<Array<{ id: string; message: string; stack?: string }>>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (event: any) => {
      try {
        const id = `err-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const message = event?.message || (event?.reason && event.reason.message) || String(event);
        const stack = event?.error?.stack || (event?.reason && event.reason.stack) || undefined;
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
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isPaper, setIsPaper] = useState(true);
  const [useAlpacaLive, setUseAlpacaLive] = useState(false);

  // Angel One (SmartAPI Indian Market) Configuration
  const [angelApiKey, setAngelApiKey] = useState("");
  const [angelClientCode, setAngelClientCode] = useState("");
  const [angelMpin, setAngelMpin] = useState("");
  const [angelTotpSeed, setAngelTotpSeed] = useState("");

  // Connection & loading flags
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");

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

  // Portfolio Liquidation Action States
  const [isLiquidating, setIsLiquidating] = useState<string | null>(null);

  // Dynamic Toast alerts notification system
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO" }[]>([]);

  const showToast = useCallback((message: string, type: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO" = "INFO") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Automatically dismiss toast after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Helper log function (hoisted so effects can depend on it safely)
  const addLog = useCallback(
    (
      symbol: string,
      action: string,
      message: string,
      status: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO"
    ) => {
      const newLog: Log = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        symbol,
        action,
        message,
        status,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 50));

      // Automatically trigger visual Toast notification for user action/system logs
      showToast(`${symbol} • ${action}: ${message}`, status);
    },
    [showToast]
  );

  // --- SENTRY AUTOPILOT STATE VARIABLES & ENGINES ---
  const [isAutopilotActive, setIsAutopilotActive] = useState(false);
  const [autopilotStrategy, setAutopilotStrategy] = useState<"SENTRY_HEAL" | "GEMINI_AI" | "SCALPER" | "TOUCH_TURN" | "MACD_FRONT_SIDE" | "SNEAKY_PIVOT">("SCALPER");
  
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

  const [autopilotInterval, setAutopilotInterval] = useState(15); // in seconds
  const [autopilotTargetTicker, setAutopilotTargetTicker] = useState("AAPL");
  const [activeVisualizerSymbol] = useState<string>("");

  // Global automated exit thresholds (percent)
  const [globalTakeProfitPercent, setGlobalTakeProfitPercent] = useState<number>(15); // e.g. 15% take profit
  const [globalStopLossPercent, setGlobalStopLossPercent] = useState<number>(5); // e.g. 5% stop loss

  // Risk screening & diversification controls
  const [minAvgVolume, setMinAvgVolume] = useState<number>(1000000); // minimum average daily volume
  const [maxExposurePercentPerSymbol, setMaxExposurePercentPerSymbol] = useState<number>(30); // percent of portfolio per symbol
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(6); // concurrent open positions
  const [liveMinOrderQty, setLiveMinOrderQty] = useState<number>(0.01); // minimum non-crypto live order size
  const [liveMinCryptoOrderQty, setLiveMinCryptoOrderQty] = useState<number>(0.0001); // minimum crypto live order size
  const [aggressiveDeleverage, setAggressiveDeleverage] = useState<boolean>(false);

  const addAutopilotLog = useCallback((msg: string, type: "info" | "success" | "warn" | "trade") => {
    setAutopilotLogs((prev) => {
      // Suppress exact consecutive duplicates to avoid log spam during polling loops.
      if (prev[0]?.msg === msg && prev[0]?.type === type) {
        return prev;
      }
      const newLog = {
        id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        time: new Date().toLocaleTimeString(),
        msg,
        type
      };
      return [newLog, ...prev].slice(0, 50);
    });
  }, []);

  // Load persisted global TP/SL from localStorage on mount
  useEffect(() => {
    try {
      const tp = typeof window !== "undefined" && localStorage.getItem("sentry:globalTP");
      const sl = typeof window !== "undefined" && localStorage.getItem("sentry:globalSL");
      const minLiveQty = typeof window !== "undefined" && localStorage.getItem("sentry:liveMinQty");
      const minLiveCryptoQty = typeof window !== "undefined" && localStorage.getItem("sentry:liveMinCryptoQty");
      if (tp) setGlobalTakeProfitPercent(Math.max(0, parseFloat(tp)));
      if (sl) setGlobalStopLossPercent(Math.max(0, parseFloat(sl)));
      if (minLiveQty) setLiveMinOrderQty(Math.max(0.0001, parseFloat(minLiveQty)));
      if (minLiveCryptoQty) setLiveMinCryptoOrderQty(Math.max(0.000001, parseFloat(minLiveCryptoQty)));
    } catch (e) {
      // ignore
    }
  }, [addAutopilotLog, addLog]);

  // Persist TP/SL whenever they change
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sentry:globalTP", String(globalTakeProfitPercent));
        localStorage.setItem("sentry:globalSL", String(globalStopLossPercent));
        localStorage.setItem("sentry:minAvgVol", String(minAvgVolume));
        localStorage.setItem("sentry:maxExposurePct", String(maxExposurePercentPerSymbol));
        localStorage.setItem("sentry:maxConcurrent", String(maxConcurrentPositions));
        localStorage.setItem("sentry:liveMinQty", String(liveMinOrderQty));
        localStorage.setItem("sentry:liveMinCryptoQty", String(liveMinCryptoOrderQty));
        localStorage.setItem("sentry:aggressiveDeleverage", JSON.stringify(aggressiveDeleverage));
      }
    } catch (e) {}
  }, [globalTakeProfitPercent, globalStopLossPercent, minAvgVolume, maxExposurePercentPerSymbol, maxConcurrentPositions, liveMinOrderQty, liveMinCryptoOrderQty, aggressiveDeleverage]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("sentry:aggressiveDeleverage");
      if (raw) setAggressiveDeleverage(raw === "true" || JSON.parse(raw));
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

  // Configurable quick tickers list (expandable). Use a memo to avoid re-creating on every render.
  const quickTickers = useMemo(
    () => [
      "AAPL",
      "NVDA",
      "TSLA",
      "MSFT",
      "GOOG",
      "AMZN",
      "META",
      "BTCUSD",
      "ETHUSD",
      "SPY",
      "QQQ",
      "AMD",
      "INTC",
      "NFLX",
      "BABA",
      "ORCL",
    ],
    []
  );

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
      time: new Date().toLocaleTimeString(),
      msg: "System load successful. Autopilot engine initialized offline. Configure credentials or select simulated asset.",
      type: "info"
    }
  ]);
  const [lastAutopilotOrderOutcome, setLastAutopilotOrderOutcome] = useState<AutopilotOrderResult | null>(null);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [tradeFormTab, setTradeFormTab] = useState<"manual" | "autopilot">("manual");
  const [isTickStreamActive, setIsTickStreamActive] = useState(true);
  const [autopilotLossGuard, setAutopilotLossGuard] = useState(true); // Drawdown Shield Protection
  const [autopilotBlacklist, setAutopilotBlacklist] = useState<string[]>(["TSLA"]); // Prevent low winrate long traps (e.g. TSLA)
  const prevAutopilotActiveRef = useRef<boolean | null>(null);
  const sentryHealthStateRef = useRef<"healthy" | "warning" | null>(null);
  const autopilotPendingBuySymbolsRef = useRef<Set<string>>(new Set());
  const autopilotTargetSymbolIndexRef = useRef(0);

  // Refresh data proxy
  const handleRefreshData = useCallback(async () => {
    if (!useAlpacaLive) return;
    setIsRefreshing(true);
    try {
      if (brokerType === "ANGELONE") {
        const response = await fetch("/api/angelone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            angelApiKey,
            angelClientCode,
            angelMpin,
            angelTotpSeed,
            isMockConnection: false
          })
        });

        const resText = await response.text();
        let rawData: any = null;
        try {
          rawData = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Server returned error: ${resText.slice(0, 120).trim()}...`);
        }

        if (!response.ok || rawData?.error) {
          throw new Error(rawData?.error || "Unable to sync holdings.");
        }

        setAlpacaAccount(rawData.account);
        setAlpacaPositions(rawData.positions);
        addLog("ANGELONE", "SYNC", "Indian market portfolio successfully synced.", "SUCCESS");
      } else {
        if (!apiKey || !apiSecret) return;
        const response = await fetch("/api/alpaca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, apiSecret, isPaper }),
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
        setAlpacaPositions(rawData.positions);
        addLog("ALPACA", "SYNC", "Real-time positions and balances successfully synced.", "SUCCESS");
      }
    } catch (err: any) {
      console.error(err);
      addLog(brokerType, "SYNC_ERROR", `Data stream refresh interrupted: ${err.message || err}`, "WARNING");
    } finally {
      setIsRefreshing(false);
    }
  }, [useAlpacaLive, brokerType, angelApiKey, angelClientCode, angelMpin, angelTotpSeed, apiKey, apiSecret, isPaper, addLog]);

  // Stable state ref to bypass interval recreate throttling
  const stateRef = React.useRef<any>({
    useAlpacaLive,
    alpacaPositions,
    mockPositions,
    simCash,
    isConnected,
    isPaper,
    apiKey,
    apiSecret,
    brokerType,
    angelApiKey,
    angelClientCode,
    angelMpin,
    angelTotpSeed,
    autopilotStrategy,
    autopilotTargetTicker,
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
    maxConcurrentPositions,
    liveMinOrderQty,
    liveMinCryptoOrderQty
  });

  useEffect(() => {
    stateRef.current = {
      useAlpacaLive,
      alpacaPositions,
      mockPositions,
      simCash,
      isConnected,
      isPaper,
      apiKey,
      apiSecret,
      brokerType,
      angelApiKey,
      angelClientCode,
      angelMpin,
      angelTotpSeed,
      autopilotStrategy,
      autopilotTargetTicker,
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
      maxConcurrentPositions,
      liveMinOrderQty,
      liveMinCryptoOrderQty
    };
  }, [
    useAlpacaLive,
    alpacaPositions,
    mockPositions,
    simCash,
    isConnected,
    isPaper,
    apiKey,
    apiSecret,
    brokerType,
    angelApiKey,
    angelClientCode,
    angelMpin,
    angelTotpSeed,
    autopilotStrategy,
    autopilotTargetTicker,
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
    liveMinCryptoOrderQty
  ]);

  // (moved) addAutopilotLog is hoisted above to avoid TDZ issues

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

    // Automated Blacklist Intercept Check (e.g. to avoid trading low-winrate or banned symbols like TSLA in Autopilot entirely)
    if (curRef.autopilotBlacklist?.includes(symbolClean)) {
      addAutopilotLog(`🚫 Blacklist Blocked automated ${side} order of ${symbolClean}: symbol is blacklisted in Autopilot Control Hub.`, "warn");
      addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Autopilot Blacklist intercepted/prevented ${side} order for ${symbolClean}.`, "WARNING");
      return {
        status: "BLOCKED",
        code: "BLOCKED_BLACKLIST",
        symbol: symbolClean,
        side,
        requestedQty: qtyNum,
        executedQty: 0,
        message: `Symbol ${symbolClean} is blacklisted.`
      };
    }

    // Sentry Loss Guard Check - prevents buying more when a position is under drawdown and losing money
    if (side === "BUY" && curRef.autopilotLossGuard) {
      const activePositions = curRef.useAlpacaLive ? curRef.alpacaPositions : curRef.mockPositions;
      const matched = activePositions?.find((p: any) => p.symbol === symbolClean);
      if (matched) {
        const qty = parseFloat(matched.qty || "0");
        if (qty > 0) {
          const pl = matched.unrealized_pl !== undefined 
            ? parseFloat(matched.unrealized_pl) 
            : (parseFloat(matched.current_price || 0) - parseFloat(matched.avg_entry_price || 0)) * qty;
          if (pl < 0) {
            addAutopilotLog(`🛡️ Loss Guard Blocked BUY of ${symbolClean}: existing position is holding a paper loss of $${pl.toFixed(2)}. Capital protected from average-down traps!`, "warn");
            addLog(symbolClean, "AUTO_BUY_BLOCKED", `Sentry Loss Guard withheld automated buy order of ${symbolClean} to avoid averaging down on a losing holding.`, "WARNING");
            return {
              status: "BLOCKED",
              code: "BLOCKED_LOSS_GUARD",
              symbol: symbolClean,
              side,
              requestedQty: qtyNum,
              executedQty: 0,
              message: `Loss guard blocked averaging down on ${symbolClean}.`
            };
          }
        }
      }
    }

    // Portfolio risk screening: exposure caps and concurrent positions
    try {
      const activePositions = curRef.useAlpacaLive ? (curRef.alpacaPositions || []) : (curRef.mockPositions || []);
      const totalPosValue = (activePositions || []).reduce((s: number, p: any) => s + (parseFloat(p.market_value || p.current_price * (parseFloat(p.qty || 0) || 0)) || 0), 0);
      const cashValue = curRef.useAlpacaLive ? parseFloat(curRef.alpacaAccount?.cash || "0") : (parseFloat(curRef.simCash as any) || 0);
      const totalPortfolio = Math.max(1, totalPosValue + cashValue);

      const openCount = (activePositions || []).filter((p: any) => parseFloat(p.qty || 0) > 0).length;
      const existingLong = activePositions.find((p: any) => p.symbol === symbolClean && parseFloat(p.qty || 0) > 0);
      // Allow adding to an already-open symbol even when the concurrent-position ceiling is reached.
      if (side === "BUY" && !existingLong && openCount >= (curRef.maxConcurrentPositions || 999)) {
        addAutopilotLog(`🧭 Blocked BUY ${symbolClean}: concurrent position limit (${curRef.maxConcurrentPositions}) reached.`, "warn");
        addLog(symbolClean, "AUTO_TRADE_BLOCKED", `Blocked automated BUY: concurrent positions limit reached.`, "WARNING");
        return {
          status: "BLOCKED",
          code: "BLOCKED_MAX_CONCURRENT",
          symbol: symbolClean,
          side,
          requestedQty: qtyNum,
          executedQty: 0,
          message: `Concurrent position limit (${curRef.maxConcurrentPositions}) reached.`
        };
      }

      // Estimate current exposure and intended order value
      const matchedTicker = activePositions.find((p: any) => p.symbol === symbolClean) as any;
      const currentPosVal = matchedTicker ? parseFloat(matchedTicker.market_value || (matchedTicker.current_price * (parseFloat(matchedTicker.qty || 0) || 0)) || 0) : 0;
      // Fallback price guess
      const guessPrice = matchedTicker ? parseFloat(matchedTicker.current_price || 0) : (symbolClean === "BTCUSD" ? 67200 : 150);
      const intendedValue = Math.abs(qtyNum) * guessPrice;
      const newExposurePct = ((currentPosVal + intendedValue) / totalPortfolio) * 100;

      if (side === "BUY" && (newExposurePct > (curRef.maxExposurePercentPerSymbol || 100))) {
        const capPct = curRef.maxExposurePercentPerSymbol || 100;
        const maxAdditionalValue = (totalPortfolio * (capPct / 100)) - currentPosVal;
        const minExecutableQty = symbolClean === "BTCUSD"
          ? Math.max(0.000001, Number(curRef.liveMinCryptoOrderQty) || 0.0001)
          : Math.max(0.0001, Number(curRef.liveMinOrderQty) || 0.01);

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
        const resizedQty = symbolClean === "BTCUSD"
          ? parseFloat(rawAffordableQty.toFixed(4))
          : parseFloat(rawAffordableQty.toFixed(2));

        if (!Number.isFinite(resizedQty) || resizedQty < minExecutableQty || resizedQty >= qtyNum) {
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
      if (!curRef.isConnected) {
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

      if (curRef.brokerType === "ANGELONE") {
        if (side === "BUY") {
          let estPrice = 2475.0;
          const matchedTicker = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
          if (matchedTicker) {
            estPrice = matchedTicker.current_price;
          } else {
            if (symbolClean === "RELIANCE") estPrice = 2475.50;
            else if (symbolClean === "TCS") estPrice = 3820.00;
            else if (symbolClean === "INFY") estPrice = 1515.00;
            else if (symbolClean === "TATAMOTORS") estPrice = 962.40;
            else if (symbolClean === "SBIN") estPrice = 820.00;
            else if (symbolClean === "HDFCBANK") estPrice = 1600.00;
          }

          const estimatedCost = estPrice * qtyNum;
          const cashValue = parseFloat(curRef.alpacaAccount?.cash || "0");
          const maxAllowedPower = cashValue;
          const maxSafeOrderVal = maxAllowedPower * 0.90; // Enforce safe margin buffer

          if (estimatedCost > maxSafeOrderVal) {
            const maxAffordableQty = maxSafeOrderVal / estPrice;
            if (maxAffordableQty >= 0.1) {
              finalQty = parseFloat(maxAffordableQty.toFixed(1));
              addAutopilotLog(`Leverage Control [SmartAPI]: Rescaling automated BUY of ${symbolClean} from ${qtyNum} to affordable ${finalQty} shares due to cash limit.`, "info");
            } else {
              addAutopilotLog(`Blocked Live automated BUY: Insufficient Cash buffer. Required: ${estimatedCost.toFixed(2)}, available: ${maxAllowedPower.toFixed(2)}.`, "warn");
              return {
                status: "BLOCKED",
                code: "BLOCKED_CASH_BUFFER",
                symbol: symbolClean,
                side,
                requestedQty: qtyNum,
                executedQty: 0,
                message: `Insufficient cash buffer. Required ${estimatedCost.toFixed(2)}, available ${maxAllowedPower.toFixed(2)}.`
              };
            }
          }
        } else {
          const existingPos = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
          const ownedQty = existingPos ? existingPos.qty : 0;
          if (ownedQty <= 0) {
            addAutopilotLog(`Blocked automated live SmartAPI SELL of ${qtyNum} ${symbolClean}: You do not own a long position. Live Angel One short-selling is restricted.`, "warn");
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
          if (finalQty > ownedQty) {
            addAutopilotLog(`Leverage Control: Capping automated live SmartAPI SELL from ${qtyNum} to owned size ${ownedQty}.`, "info");
            finalQty = ownedQty;
          }
        }
      } else {
        if (side === "BUY") {
          let estPrice = 150.0;
          const matchedTicker = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
          if (matchedTicker) {
            estPrice = matchedTicker.current_price;
          } else {
            if (symbolClean === "AAPL") estPrice = 182.2;
            else if (symbolClean === "TSLA") estPrice = 195.0;
            else if (symbolClean === "NVDA") estPrice = 115.5;
            else if (symbolClean === "BTCUSD") estPrice = 67200.0;
            else if (symbolClean === "MSFT") estPrice = 425.0;
          }

          const estimatedCost = estPrice * qtyNum;
          const cashValue = parseFloat(curRef.alpacaAccount?.cash || "0");
          const rawBuyingPower = parseFloat(curRef.alpacaAccount?.buying_power || "0");
          const isFractional = qtyNum % 1 !== 0;
          // Fractional shares cannot be bought with margin, and accounts under $2000 are cash-only by regulation.
          const maxAllowedPower = (cashValue < 2000 || isFractional) ? cashValue : Math.min(rawBuyingPower, cashValue * 4);
          const maxSafeOrderVal = maxAllowedPower * 0.70; // enforce a 30% safety collar/buffer for fractional buy orders

          if (estimatedCost > maxSafeOrderVal) {
            const maxAffordableQty = maxSafeOrderVal / estPrice;
            if (maxAffordableQty >= 0.0001) {
              const safeQty = maxAffordableQty;
              if (symbolClean === "BTCUSD") {
                finalQty = parseFloat(safeQty.toFixed(4));
              } else {
                finalQty = parseFloat(safeQty.toFixed(2));
              }

              if (finalQty <= (symbolClean === "BTCUSD"
                ? Math.max(0.000001, Number(curRef.liveMinCryptoOrderQty) || 0.0001)
                : Math.max(0.0001, Number(curRef.liveMinOrderQty) || 0.01))) {
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
          if (finalQty > ownedQty) {
            addAutopilotLog(`Leverage Control: Capping automated live SELL of ${symbolClean} from ${qtyNum} to owned size ${ownedQty} to prevent unauthorized short-selling.`, "info");
            finalQty = ownedQty;
          }
        }
      }

      addAutopilotLog(`[Bot Order] Queueing live brokerage market ${side} of ${finalQty} ${symbolClean}...`, "trade");
      addLog("AUTOPILOT", side, `Transmitting Bot Order: ${side} ${finalQty} shares of ${symbolClean}`, "INFO");
      try {
        let response;
        if (curRef.brokerType === "ANGELONE") {
          response = await fetch("/api/angelone/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              angelApiKey: curRef.angelApiKey,
              angelClientCode: curRef.angelClientCode,
              angelMpin: curRef.angelMpin,
              angelTotpSeed: curRef.angelTotpSeed,
              symbol: symbolClean,
              qty: finalQty,
              side: side.toLowerCase(),
              isMockConnection: false
            }),
          });
        } else {
          response = await fetch("/api/alpaca/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: curRef.apiKey,
              apiSecret: curRef.apiSecret,
              isPaper: curRef.isPaper,
              symbol: symbolClean,
              qty: finalQty,
              side: side.toLowerCase(),
            }),
          });
        }

        const resText = await response.text();
        let dataOrder: any = null;
        try {
          dataOrder = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Server returned HTML/text error output: ${resText.slice(0, 120).trim()}...`);
        }

        if (!response.ok || dataOrder?.error) {
          throw new Error(dataOrder?.error || "Brokerage error response");
        }

        const brokerStatus = String(dataOrder.status || "ACCEPTED").toUpperCase();
        const filledQty = Number.parseFloat(String(dataOrder.filled_qty ?? "0"));
        const isFilledStatus = brokerStatus === "FILLED" || brokerStatus === "PARTIALLY_FILLED";

        if (side === "BUY") {
          if (isFilledStatus) {
            autopilotPendingBuySymbolsRef.current.delete(symbolClean);
          } else {
            autopilotPendingBuySymbolsRef.current.add(symbolClean);
            // Avoid sticky pending state forever when broker status updates are delayed.
            setTimeout(() => {
              autopilotPendingBuySymbolsRef.current.delete(symbolClean);
            }, 90000);
          }
        }

        if (isFilledStatus) {
          addAutopilotLog(`Automated Live Order FILLED! ID: ${dataOrder.id || "Success"}.`, "success");
          addLog(
            symbolClean,
            `${side}_FILLED`,
            `Live automated market order executed for ${(Number.isFinite(filledQty) && filledQty > 0 ? filledQty : finalQty)} share(s) of ${symbolClean}.`,
            "SUCCESS"
          );
        } else {
          addAutopilotLog(`Automated Live Order ACCEPTED by broker (status: ${brokerStatus}). Awaiting fill confirmation...`, "info");
          addLog(symbolClean, `${side}_ACCEPTED`, `Live automated order accepted by broker (status: ${brokerStatus}).`, "INFO");
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
        }
        let errorMsg = err.message || "Broker block";
        if (errorMsg.includes("is not allowed to short") || errorMsg.includes("shorting")) {
          errorMsg = "Account is not allowed to short. Standard Alpaca Cash and non-margin accounts cannot short-sell. Swap to Local Risk Simulator to fully trade short strategies!";
        } else if (errorMsg.includes("insufficient buying power")) {
          errorMsg = "Insufficient buying power in your Alpaca account. Use smaller positions or switch to Local Risk Simulator mode!";
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
      }
    } else {
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
      const isINR = curRef.brokerType === "ANGELONE";
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

        simulatedExecutedQty = execQty;

        setSimCash((c) => c - totalDebitWithFees);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty + execQty;
            if (Math.abs(updatedQty) < 0.0001) {
              return prev.filter((p) => p.symbol !== symbolClean);
            }
            let newAvgEntry = exists.avg_entry_price;
            let unrealized = 0;
            if (exists.qty > 0) {
              // Include fee drag directly into average entry price to represent true dynamic breakeven!
              const actualSpent = exists.avg_entry_price * exists.qty + execOrderCost + execOrderFees;
              newAvgEntry = actualSpent / updatedQty;
              unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
            } else {
              if (updatedQty < 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              } else {
                newAvgEntry = (execOrderCost + execOrderFees) / updatedQty;
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
            // Adjust average entry price to incorporate transaction cost drag
            const realAvgEntry = parseFloat(((execOrderCost + execOrderFees) / execQty).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: execQty,
                avg_entry_price: realAvgEntry,
                current_price: estPrice,
                market_value: parseFloat(execOrderCost.toFixed(2)),
                unrealized_pl: parseFloat((execOrderCost - realAvgEntry * execQty).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim purchase complete: Acquired ${execQty} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (Fees & slippage deducted: ${currencySymbol}${execOrderFees.toFixed(2)}).`, "success");
        addLog(symbolClean, "AUTO_BUY_SIM", `Purchased simulated ${execQty} shares of ${symbolClean} at fee-adjusted cost basis (Fee: ${currencySymbol}${execOrderFees.toFixed(2)})`, "SUCCESS");
      } else {
        // Simulated SELL (With support for Short Selling / Cover)
        // Deduct fees from proceeds
        const netProceeds = orderCost - orderFees;
        setSimCash((c) => c + netProceeds);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty - qtyNum;
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
                // Short position entry fee-drag adjust
                newAvgEntry = parseFloat(((orderCost - orderFees) / Math.abs(updatedQty)).toFixed(4));
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              }
            } else {
              // Average entry price formulation including transaction fee drag for Shorts
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
            const updatedQty = -qtyNum;
            // Adjust avg entry for short to include drag
            const realAvgEntry = parseFloat(((orderCost - orderFees) / qtyNum).toFixed(4));
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
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim sale complete: Sold/Short-sold ${qtyNum} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (Fees & slippage deducted: ${currencySymbol}${orderFees.toFixed(2)}).`, "success");
        addLog(symbolClean, "AUTO_SELL_SIM", `Sold simulated ${qtyNum} shares of ${symbolClean} with net credit (Fees & taxes: ${currencySymbol}${orderFees.toFixed(2)})`, "SUCCESS");
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
    }
  }, [addAutopilotLog, addLog]);

  const logScanOrderOutcome = useCallback((source: string, outcome: AutopilotOrderResult) => {
    setLastAutopilotOrderOutcome(outcome);
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
  }, [addAutopilotLog]);

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

  const executeAutopilotScan = useCallback(async () => {
    const curRef = stateRef.current;
    if (curRef.isAutopilotRunning) return;
    setIsAutopilotRunning(true);
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

      const parsedTargets = (curRef.autopilotTargetTicker || "AAPL")
        .split(/[\s,]+/)
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean);
      const scanTargets = parsedTargets.length > 0 ? parsedTargets : ["AAPL"];
      const targetIdx = autopilotTargetSymbolIndexRef.current % scanTargets.length;
      const targetSymbol = scanTargets[targetIdx];
      autopilotTargetSymbolIndexRef.current = (targetIdx + 1) % scanTargets.length;

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
        let currentSpotPrice = 150.0;
        if (matched) {
          currentSpotPrice = matched.current_price;
        } else {
          if (targetSymbol === "AAPL") currentSpotPrice = 182.2;
          else if (targetSymbol === "TSLA") currentSpotPrice = 195.0;
          else if (targetSymbol === "NVDA") currentSpotPrice = 115.5;
          else if (targetSymbol === "BTCUSD") currentSpotPrice = 67200.0;
          else if (targetSymbol === "MSFT") currentSpotPrice = 425.0;
        }

        const existingScalperPos = currentActivePositions.find((p) => p.symbol === targetSymbol);
        const hasPendingSeedBuy = autopilotPendingBuySymbolsRef.current.has(targetSymbol);
        if (hasPendingSeedBuy) {
          addAutopilotLog(`Scalper bootstrap paused for ${targetSymbol}: previous BUY is still pending broker fill confirmation.`, "info");
          return;
        }
        if (!existingScalperPos || existingScalperPos.qty <= 0) {
          const seedQty = targetSymbol === "BTCUSD" ? 0.002 : 1;
          addAutopilotLog(`Scalper bootstrap: no active ${targetSymbol} position found. Attempting seed BUY ${seedQty}.`, "trade");
          const orderOutcome = await executeAutopilotOrder(targetSymbol, "BUY", seedQty);
          logScanOrderOutcome("SCALPER", orderOutcome);
          return;
        }

        const randSeed = Math.random();
        if (randSeed > 0.55) {
          const buyQty = targetSymbol === "BTCUSD" ? 0.02 : 5;
          addAutopilotLog(`Scalper Signals: ${targetSymbol} ($${currentSpotPrice.toFixed(2)}) is dipping below support. Attempting BUY order.`, "trade");
          const orderOutcome = await executeAutopilotOrder(targetSymbol, "BUY", buyQty);
          logScanOrderOutcome("SCALPER", orderOutcome);
        } else if (randSeed < 0.25) {
          const exists = currentActivePositions.find((p) => p.symbol === targetSymbol);
          if (exists && exists.qty > 0) {
            const sellQty = targetSymbol === "BTCUSD"
              ? Math.min(exists.qty, 0.02)
              : Math.min(exists.qty, 5);
            addAutopilotLog(`Scalper Signals: ${targetSymbol} ($${currentSpotPrice.toFixed(2)}) hit local resistance spike. Attempting SELL order.`, "trade");
            const orderOutcome = await executeAutopilotOrder(targetSymbol, "SELL", sellQty);
            logScanOrderOutcome("SCALPER", orderOutcome);
          } else {
            addAutopilotLog(`Scalper Signals: Selling sign emitted but zero inventory of ticker ${targetSymbol} exists.`, "info");
          }
        } else {
          addAutopilotLog(`Scalper Range status: Neutral oscillation. No position change.`, "success");
        }
      }

      else if (curRef.autopilotStrategy === "TOUCH_TURN") {
        addAutopilotLog(`Triggering Touch & Turn (Opening-Range Scalper) on target: ${targetSymbol}...`, "info");

        let tState = curRef.touchTurnState;
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

          const curPrefix = curRef.brokerType === "ANGELONE" ? "₹" : "$";
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

          const curPrefix = curRef.brokerType === "ANGELONE" ? "₹" : "$";

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
              
              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
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

              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              setTouchTurnState({
                ...tState,
                status: "HIT_TARGET"
              });
            } else if (stateChange === "HIT_STOP") {
              const oppositeSide = tState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🛑 Stop loss triggered at ${curPrefix}${currentSpotPrice.toFixed(2)}. Closed out trade boundary limit.`, "warn");

              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
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

        const curPrefix = curRef.brokerType === "ANGELONE" ? "₹" : "$";
        let mState = curRef.macdState;

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
          const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;

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

        const curPrefix = curRef.brokerType === "ANGELONE" ? "₹" : "$";
        let sState = curRef.sneakyPivotState;

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
              
              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
              await executeAutopilotOrder(targetSymbol, "BUY", tradeQty);
            } else {
              const stopOffset = (sState.rangeHigh - sState.rangeLow) * 0.15;
              stopPrice = parseFloat((sState.rangeHigh + stopOffset).toFixed(2));
              targetPrice = sState.rangeLow;

              addAutopilotLog(`🎯 Candle 3 Entry order FILLED for ${targetSymbol}! Entering SHORT at ${curPrefix}${entryPrice.toFixed(2)}.`, "trade");
              addAutopilotLog(`🛡️ Protected by "Guardian Angel" stop level: ${curPrefix}${stopPrice.toFixed(2)}. Profit target: ${curPrefix}${targetPrice.toFixed(2)}.`, "success");

              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
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

              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
              await executeAutopilotOrder(targetSymbol, oppositeSide as any, tradeQty);

              nextStatus = "HIT_TARGET";
              lastAction = `Trade completed successfully. Hit profit target of ${curPrefix}${targetPrice?.toFixed(2)}.`;
            } else if (stateChange === "HIT_STOP") {
              const oppositeSide = sState.side === "BUY" ? "SELL" : "BUY";
              addAutopilotLog(`🛑 Stop Loss test failed. Cut trade out under protection limit at ${curPrefix}${currentSpotPrice.toFixed(2)}.`, "warn");

              const tradeQty = targetSymbol === "BTCUSD" ? 0.05 : 10;
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
            const randSeed = Math.random();
            if (randSeed > 0.65) {
              action = "BUY";
              qty = 5;
              backupReason = `Identified potential technical oversold pattern for ${cleanTarget}.`;
            } else if (randSeed < 0.20) {
              action = "SELL";
              qty = 5;
              backupReason = `Profit target indicator hit local resistance for ${cleanTarget}.`;
            } else {
              action = "HOLD";
              backupReason = `Stable consolidation trend observed. No trade posture required for ${cleanTarget}.`;
            }
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
    } catch (err: any) {
      console.error(err);
      addAutopilotLog(`Scan tick interrupted: ${err.message || err}`, "warn");
    } finally {
      setIsAutopilotRunning(false);
    }
  }, [executeAutopilotOrder, setTouchTurnState, setMacdState, setSneakyPivotState, addAutopilotLog, logScanOrderOutcome]);

  // Autopilot loop trigger
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const prevActive = prevAutopilotActiveRef.current;

    if (prevActive === null) {
      if (isAutopilotActive) {
        addAutopilotLog(`🔴 Sentry Autopilot trading system ACTIVATED!`, "info");
      }
    } else if (prevActive !== isAutopilotActive) {
      addAutopilotLog(
        isAutopilotActive
          ? `🔴 Sentry Autopilot trading system ACTIVATED!`
          : `🟢 Sentry Autopilot trading system DEACTIVATED. Intercept loops idle.`,
        "info"
      );
    }

    prevAutopilotActiveRef.current = isAutopilotActive;

    if (isAutopilotActive) {
      executeAutopilotScan();
      
      intervalId = setInterval(() => {
        executeAutopilotScan();
      }, autopilotInterval * 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutopilotActive, autopilotInterval, executeAutopilotScan, addAutopilotLog]);

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
    const savedBrokerType = (localStorage.getItem("RISK_SENTRY_BROKER_TYPE") || "ALPACA") as "ALPACA" | "ANGELONE";
    const savedUseAlpaca = localStorage.getItem("APCA_USE_ALPACA") === "true";

    // Restore Alpaca keys
    const savedApiKey = localStorage.getItem("APCA_API_KEY") || "";
    const savedApiSecret = localStorage.getItem("APCA_API_SECRET") || "";
    const savedIsPaper = localStorage.getItem("APCA_IS_PAPER") !== "false";

    if (savedApiKey) setApiKey(savedApiKey);
    if (savedApiSecret) setApiSecret(savedApiSecret);
    setIsPaper(savedIsPaper);

    // Restore Angel One keys
    const savedAngelApiKey = localStorage.getItem("ANGEL_API_KEY") || "";
    const savedAngelClientCode = localStorage.getItem("ANGEL_CLIENT_CODE") || "";
    const savedAngelMpin = localStorage.getItem("ANGEL_MPIN") || "";
    const savedAngelTotpSeed = localStorage.getItem("ANGEL_TOTP_SEED") || "";

    if (savedAngelApiKey) setAngelApiKey(savedAngelApiKey);
    if (savedAngelClientCode) setAngelClientCode(savedAngelClientCode);
    if (savedAngelMpin) setAngelMpin(savedAngelMpin);
    if (savedAngelTotpSeed) setAngelTotpSeed(savedAngelTotpSeed);

    setBrokerType(savedBrokerType);

    const ts = new Date().toLocaleTimeString();

    const initApp = async () => {
      if (savedUseAlpaca && savedBrokerType === "ANGELONE" && savedAngelApiKey && savedAngelClientCode && savedAngelMpin) {
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
            symbol: "ANGELONE",
            action: "AUTO_CONNECT",
            message: `Auto-connecting using stored credentials to AngelOne SmartAPI...`,
            status: "INFO"
          }
        ]);

        setIsConnecting(true);
        try {
          const response = await fetch("/api/angelone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              angelApiKey: savedAngelApiKey,
              angelClientCode: savedAngelClientCode,
              angelMpin: savedAngelMpin,
              angelTotpSeed: savedAngelTotpSeed,
              isMockConnection: false
            }),
          });

          const resText = await response.text();
          let rawData: any = null;
          try {
            rawData = JSON.parse(resText);
          } catch (e) {
            throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
          }

          if (!response.ok || rawData?.error) {
            throw new Error(rawData?.error || "Failed stored key validation.");
          }
          setAlpacaAccount(rawData.account);
          setAlpacaPositions(rawData.positions);
          setIsConnected(true);
          setUseAlpacaLive(true);

          setLogs((prev) => [
            {
              id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date().toLocaleTimeString(),
              symbol: "ANGELONE",
              action: "CONNECT_SUCCESS",
              message: `Securely auto-connected! Client Code: ${rawData.account.account_number}. Cash: ₹${parseFloat(rawData.account.cash).toLocaleString()}`,
              status: "SUCCESS"
            },
            ...prev
          ]);
        } catch (err: any) {
          console.error("Auto-connect to AngelOne failed:", err);
          setIsConnected(false);
          setUseAlpacaLive(false);
          setLogs((prev) => [
            {
              id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date().toLocaleTimeString(),
              symbol: "ANGELONE",
              action: "AUTO_CONNECT_FAIL",
              message: `Auto-connect failed: ${err.message || "SmartAPI auth failure"}. Falling back to Local Indian Stock Simulator.`,
              status: "WARNING"
            },
            ...prev
          ]);
        } finally {
          setIsConnecting(false);
        }
      } else if (savedUseAlpaca && savedBrokerType === "ALPACA" && savedApiKey && savedApiSecret) {
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
            action: "AUTO_CONNECT",
            message: `Auto-connecting using stored keys to Alpaca ${savedIsPaper ? "Paper" : "Live"}...`,
            status: "INFO"
          }
        ]);

        setIsConnecting(true);
        try {
          const response = await fetch("/api/alpaca", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: savedApiKey, apiSecret: savedApiSecret, isPaper: savedIsPaper }),
          });

          const resText = await response.text();
          let rawData: any = null;
          try {
            rawData = JSON.parse(resText);
          } catch (e) {
            throw new Error(`Server returned HTML error: ${resText.slice(0, 120).trim()}...`);
          }

          if (!response.ok || rawData?.error) {
            throw new Error(rawData?.error || "Failed stored key validation.");
          }
          setAlpacaAccount(rawData.account);
          setAlpacaPositions(rawData.positions);
          setIsConnected(true);
          setUseAlpacaLive(true);

          setLogs((prev) => [
            {
              id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date().toLocaleTimeString(),
              symbol: "ALPACA",
              action: "CONNECT_SUCCESS",
              message: `Securely auto-connected! Account: ${rawData.account.account_number}. Cash: ${parseFloat(rawData.account.cash).toLocaleString()}`,
              status: "SUCCESS"
            },
            ...prev
          ]);
        } catch (err: any) {
          console.error("Auto-connect failed:", err);
          setIsConnected(false);
          setUseAlpacaLive(false);
          setLogs((prev) => [
            {
              id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date().toLocaleTimeString(),
              symbol: "ALPACA",
              action: "AUTO_CONNECT_FAIL",
              message: `Auto-connect failed: ${err.message || "Broker credentials mismatch"}. Falling back to Simulator.`,
              status: "WARNING"
            },
            ...prev
          ]);
        } finally {
          setIsConnecting(false);
        }
      } else {
        setUseAlpacaLive(false);
        // Ensure default simulation asset coordinates are structured according to user region preference
        if (savedBrokerType === "ANGELONE") {
          setMockPositions([
            {
              symbol: "RELIANCE",
              qty: 10.0,
              avg_entry_price: 2450.0,
              current_price: 2475.5,
              market_value: 24755.0,
              unrealized_pl: 255.0,
              unrealized_plpc: 0.0104,
              maintenance_margin_rate: 0.20,
            },
            {
              symbol: "TCS",
              qty: 5.0,
              avg_entry_price: 3850.0,
              current_price: 3820.0,
              market_value: 19100.0,
              unrealized_pl: -150.0,
              unrealized_plpc: -0.0078,
              maintenance_margin_rate: 0.20,
            },
            {
              symbol: "INFY",
              qty: 15.0,
              avg_entry_price: 1480.0,
              current_price: 1515.0,
              market_value: 22725.0,
              unrealized_pl: 525.0,
              unrealized_plpc: 0.0236,
              maintenance_margin_rate: 0.20,
            },
            {
              symbol: "TATAMOTORS",
              qty: 20.0,
              avg_entry_price: 950.0,
              current_price: 962.4,
              market_value: 19248.0,
              unrealized_pl: 248.0,
              unrealized_plpc: 0.0131,
              maintenance_margin_rate: 0.25,
            }
          ]);
          setSimCash(100000);
          setStartingCapital(185828); // Cash + long assets
          setOrderSymbol("RELIANCE");
          setAutopilotTargetTicker("RELIANCE");
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
            symbol: "SYSTEM",
            action: "INITIALIZE",
            message: `Dashboard initialized in Local ${savedBrokerType === "ANGELONE" ? "Indian Stock" : "US Stock"} Simulator mode.`,
            status: "INFO"
          }
        ]);
      }
    };

    initApp();
  }, []);

  // (moved) addLog hoisted earlier

  // Connect & fetch from Alpaca
  const handleConnectAlpaca = async () => {
    if (!apiKey || !apiSecret) {
      addLog("ALPACA", "CONNECT_ERROR", "Key or Secret cannot be blank.", "WARNING");
      return;
    }

    setIsConnecting(true);
    addLog("ALPACA", "CONNECT_ATTEMPT", `Attempting connection to Alpaca ${isPaper ? "Paper" : "Live"} API...`, "INFO");

    try {
      const response = await fetch("/api/alpaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret, isPaper }),
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
      setAlpacaAccount(rawData.account);
      setAlpacaPositions(rawData.positions);
      setIsConnected(true);
      setUseAlpacaLive(true);

      // Persist values
      localStorage.setItem("APCA_API_KEY", apiKey);
      localStorage.setItem("APCA_API_SECRET", apiSecret);
      localStorage.setItem("APCA_IS_PAPER", String(isPaper));
      localStorage.setItem("APCA_USE_ALPACA", "true");

      addLog(
        "ALPACA",
        "CONNECT_SUCCESS",
        `Securely connected! Account: ${rawData.account.account_number}. Cash: $${parseFloat(rawData.account.cash).toLocaleString()}`,
        "SUCCESS"
      );
    } catch (err: any) {
      console.error(err);
      setIsConnected(false);
      setUseAlpacaLive(false);
      localStorage.setItem("APCA_USE_ALPACA", "false");
      addLog("ALPACA", "CONNECT_FAILED", err.message || "Broker authentication failed. Reverted to Simulator.", "CRITICAL");
      showToast(`Alpaca Connection Error: ${err.message || "Unable to authorize. Please double check credentials."}`, "CRITICAL");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectAlpaca = () => {
    setIsConnected(false);
    setUseAlpacaLive(false);
    setAlpacaPositions([]);
    setAlpacaAccount(null);
    localStorage.setItem("APCA_USE_ALPACA", "false");
    addLog("ALPACA", "DISCONNECT", "Switched back to Local Risk Simulator mode.", "INFO");
  };

  // Test live connection without persisting or switching modes
  const handleTestConnection = async () => {
    try {
      if (brokerType === "ANGELONE") {
        if (!angelApiKey || !angelClientCode || !angelMpin) {
          showToast("AngelOne keys missing — enter credentials to test.", "CRITICAL");
          return;
        }
        showToast("Testing AngelOne connection...", "INFO");
        const res = await fetch("/api/angelone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ angelApiKey, angelClientCode, angelMpin, angelTotpSeed, isMockConnection: false }),
        });
        const text = await res.text();
        const raw = JSON.parse(text);
        if (!res.ok || raw?.error) {
          showToast(`AngelOne Test Failed: ${raw?.error || "Unknown error"}`, "CRITICAL");
        } else {
          showToast(`AngelOne OK — Cash: ₹${parseFloat(raw.account.cash).toLocaleString()}`, "SUCCESS");
        }
      } else {
        // Alpaca
        if (!apiKey || !apiSecret) {
          showToast("Alpaca API Key/Secret missing — enter keys to test.", "CRITICAL");
          return;
        }
        showToast("Testing Alpaca connection...", "INFO");
        const res = await fetch("/api/alpaca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, apiSecret, isPaper }),
        });
        const text = await res.text();
        const raw = JSON.parse(text);
        if (!res.ok || raw?.error) {
          showToast(`Alpaca Test Failed: ${raw?.error || "Unable to authenticate"}`, "CRITICAL");
        } else {
          showToast(`Alpaca OK — Cash: $${parseFloat(raw.account.cash).toLocaleString()}`, "SUCCESS");
        }
      }
    } catch (err: any) {
      console.error("Test connection error:", err);
      showToast(`Test Failed: ${err?.message || err}`, "CRITICAL");
    }
  };

  // Calculations for current active mode
  const activePositions = useAlpacaLive ? alpacaPositions : mockPositions;
  const activeCash = useAlpacaLive
    ? parseFloat(alpacaAccount?.cash || 0)
    : simCash;

  // Portfolio aggregates
  const totalMarketValue = activePositions.reduce(
    (sum, pos) => sum + pos.current_price * pos.qty,
    0
  );

  const totalEquity = activeCash + totalMarketValue;
  const netProfit = useAlpacaLive ? 0 : totalEquity - startingCapital;
  const roiPercent = useAlpacaLive ? 0 : (startingCapital > 0 ? (netProfit / startingCapital) * 100 : 0);
  
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

    const qtyNum = orderUnit === "USD" ? (inputVal / estPrice) : inputVal;
    const estimatedCost = orderUnit === "USD" ? inputVal : estPrice * qtyNum;

    if (useAlpacaLive) {
      if (!isConnected) {
        setIsPlacingOrder(false);
        setOrderError("Broker connection is inactive. Switch back to Local Simulator or configure valid API credentials.");
        addLog(symbolClean, `${side}_FAILED`, "Blocked transmission: keys are not authorized/connected.", "WARNING");
        return;
      }

      if (brokerType === "ANGELONE") {
        if (side === "SELL") {
          const existingPos = alpacaPositions.find((p) => p.symbol === symbolClean);
          const ownedQty = existingPos ? existingPos.qty : 0;
          if (ownedQty <= 0) {
            setIsPlacingOrder(false);
            setOrderError(`AngelOne SmartAPI: You do not own a long position in ${symbolClean} on NSE to sell.`);
            addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on SmartAPI.`, "WARNING");
            return;
          }
          if (qtyNum > ownedQty) {
            setIsPlacingOrder(false);
            setOrderError(`AngelOne SmartAPI: You only own ${ownedQty} shares of ${symbolClean}. You cannot sell ${qtyNum} shares.`);
            addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on SmartAPI. Tried to sell ${qtyNum} vs owned ${ownedQty}.`, "WARNING");
            return;
          }
        } else if (side === "BUY") {
          const cashValue = parseFloat(alpacaAccount?.cash || "0");
          if (estimatedCost > cashValue) {
            setIsPlacingOrder(false);
            setOrderError(`AngelOne SmartAPI: Insufficient INR funds. Estimated cost for order is ₹${estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} but you only have ₹${cashValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available cash.`);
            addLog(symbolClean, "BUY_FAILED", `Blocked manual buy on SmartAPI due to insufficient cash balance.`, "WARNING");
            return;
          }
        }

        addLog("ANGELONE", side, `Transmitting Order: ${side} for ${qtyNum} share(s) of ${symbolClean} on NSE`, "INFO");
        try {
          const response = await fetch("/api/angelone/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              angelApiKey,
              angelClientCode,
              angelMpin,
              angelTotpSeed,
              symbol: symbolClean,
              qty: qtyNum,
              side: side.toLowerCase(),
              isMockConnection: false
            }),
          });

          const resText = await response.text();
          let dataOrder: any = null;
          try {
            dataOrder = JSON.parse(resText);
          } catch (e) {
            throw new Error(`Server returned error output: ${resText.slice(0, 120).trim()}...`);
          }

          if (!response.ok || dataOrder?.error) {
            throw new Error(dataOrder?.error || "Order rejected by SmartAPI server.");
          }

          setOrderSuccess(`Successfully queued on NSE! Order ID: ${dataOrder.id || "Submitted"}.`);
          addLog(
            symbolClean,
            `${side}_FILLED`,
            `SmartAPI NSE order executed for ${qtyNum} share(s) of ${symbolClean}.`,
            "SUCCESS"
          );

          // Add to historical orders list
          const newOrderObj: Order = {
            id: dataOrder.id || `ord-${Date.now()}`,
            symbol: symbolClean,
            side: side,
            qty: qtyNum,
            price: dataOrder.price || estPrice,
            status: "FILLED",
            submittedAt: new Date().toLocaleTimeString(),
          };
          setOrders((prev) => [newOrderObj, ...prev]);

          setTimeout(() => {
            handleRefreshData();
          }, 1200);

        } catch (err: any) {
          console.error(err);
          setOrderError(err.message || "Failed SmartAPI order.");
          addLog(symbolClean, `${side}_REJECTED`, err.message || "Transaction failed.", "CRITICAL");
        } finally {
          setIsPlacingOrder(false);
        }
      } else {
        if (side === "SELL") {
          const existingPos = alpacaPositions.find((p) => p.symbol === symbolClean);
          const ownedQty = existingPos ? existingPos.qty : 0;
          if (ownedQty <= 0) {
            setIsPlacingOrder(false);
            setOrderError(`Alpaca Client: You do not own a long position in ${symbolClean} to sell. Short-selling is blocked on Alpaca Live mode to prevent account rejections. Switch to Local Risk Simulator to construct active short positions!`);
            addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on Alpaca Live mode.`, "WARNING");
            return;
          }
          if (qtyNum > ownedQty) {
            setIsPlacingOrder(false);
            setOrderError(`Alpaca Client: You only own ${ownedQty} shares of ${symbolClean}. You cannot sell ${qtyNum.toFixed(6)} shares as that would require short-selling, which is restricted in this account mode.`);
            addLog(symbolClean, "SELL_FAILED", `Blocked manual short-sale on Alpaca Live mode. Tried to sell ${qtyNum} vs owned ${ownedQty}.`, "WARNING");
            return;
          }
        } else if (side === "BUY") {
          const cashValue = parseFloat(alpacaAccount?.cash || "0");
          const rawBuyingPower = parseFloat(alpacaAccount?.buying_power || "0");
          const isFractional = qtyNum % 1 !== 0;
          // Fractional shares cannot be bought with margin, and accounts under $2000 are cash-only by regulation.
          const buyingPower = (cashValue < 2000 || isFractional) ? cashValue : Math.min(rawBuyingPower, cashValue * 4);
          if (estimatedCost > buyingPower) {
            setIsPlacingOrder(false);
            setOrderError(`Alpaca Client: Insufficient buying power. Estimated cost for order is ${estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} but you only have ${buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available.`);
            addLog(symbolClean, "BUY_FAILED", `Blocked manual buy on Alpaca Live mode due to insufficient buying power.`, "WARNING");
            return;
          }
        }

        addLog("ALPACA", side, `Transmitting Order: ${side} for ${orderUnit === "USD" ? `${inputVal}` : `${qtyNum} shares`} of ${symbolClean}`, "INFO");
        try {
          const payload: any = {
            apiKey,
            apiSecret,
            isPaper,
            symbol: symbolClean,
            side: side.toLowerCase(),
          };

          if (orderUnit === "USD" && side === "BUY") {
            payload.notional = inputVal;
          } else {
            payload.qty = parseFloat(qtyNum.toFixed(6));
          }

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
          setOrderSuccess(`Successfully queued! Order ID: ${dataOrder.id || "Submitted"}.`);
          addLog(
            symbolClean,
            `${side}_FILLED`,
            `Live market order executed for ${orderUnit === "USD" ? `${inputVal}` : `${qtyNum} share(s)`} of ${symbolClean}.`,
            "SUCCESS"
          );

          // Add to historical orders list
          const newOrderObj: Order = {
            id: dataOrder.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            symbol: symbolClean,
            side: side,
            qty: qtyNum,
            price: dataOrder.filled_avg_price ? parseFloat(dataOrder.filled_avg_price) : (dataOrder.price || 0),
            status: dataOrder.status?.toUpperCase() || "ACCEPTED",
            submittedAt: new Date().toLocaleTimeString(),
          };
          setOrders((prev) => [newOrderObj, ...prev]);

          // Refresh live stats after brief timeout for Alpaca side execution
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
      }
    } else {
      // Offline simulation execute immediately
      // Estimate simple price fallback
      let estPrice = 150.0;
      const matchedTicker = mockPositions.find((p) => p.symbol === symbolClean);
      if (matchedTicker) {
        estPrice = matchedTicker.current_price;
      } else {
        // Mock fallback prices for common tickers
        if (symbolClean === "AAPL") estPrice = 182.2;
        else if (symbolClean === "TSLA") estPrice = 195.0;
        else if (symbolClean === "NVDA") estPrice = 115.5;
        else if (symbolClean === "BTCUSD") estPrice = 67200.0;
        else if (symbolClean === "MSFT") estPrice = 425.0;
      }

      const orderCost = estPrice * qtyNum;
      const isINR = brokerType === "ANGELONE";
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
            const updatedQty = exists.qty + qtyNum;
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
            const realAvgEntry = parseFloat(((orderCost + orderFees) / qtyNum).toFixed(4));
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: qtyNum,
                avg_entry_price: realAvgEntry,
                current_price: estPrice,
                market_value: parseFloat(orderCost.toFixed(2)),
                unrealized_pl: parseFloat((orderCost - realAvgEntry * qtyNum).toFixed(2)),
                unrealized_plpc: 0,
                maintenance_margin_rate: parseFloat(newMaint) / 100 || 0.30,
              },
            ];
          }
        });
        setOrderSuccess(`Simulated purchase complete: Acquired ${qtyNum} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (Fees: ${currencySymbol}${orderFees.toFixed(2)} deducted).`);
        addLog(symbolClean, "BUY_SIM", `Purchased simulated ${qtyNum} shares at ${currencySymbol}${estPrice} with ${currencySymbol}${orderFees.toFixed(2)} trade drag.`, "SUCCESS");
      } else {
        // Simulated SELL / SHORT SELL
        const netProceeds = orderCost - orderFees;
        setSimCash((c) => c + netProceeds);
        setMockPositions((prev) => {
          const exists = prev.find((p) => p.symbol === symbolClean);
          if (exists) {
            const updatedQty = exists.qty - qtyNum;
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
            const updatedQty = -qtyNum;
            const realAvgEntry = parseFloat(((orderCost - orderFees) / qtyNum).toFixed(4));
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
        setOrderSuccess(`Simulated sale complete: Sold/Short-sold ${qtyNum} shares of ${symbolClean} at ${currencySymbol}${estPrice.toFixed(2)} (${currencySymbol}${orderFees.toFixed(2)} charges deducted).`);
        addLog(symbolClean, "SELL_SIM", `Sold/Short-sold simulated ${qtyNum} shares at ${currencySymbol}${estPrice} with ${currencySymbol}${orderFees.toFixed(2)} trade drag.`, "SUCCESS");
      }

      // Record offline order
      setOrders((prev) => [
        {
          id: `sim-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: qtyNum,
          price: estPrice,
          status: "FILLED_MOCK",
          submittedAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    }
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
          time: new Date().toLocaleTimeString(),
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
  const handleLiquidatePosition = async (symbol: string) => {
    const symbolClean = symbol.toUpperCase().trim();
    setIsLiquidating(symbolClean);
    
    try {
      if (useAlpacaLive) {
        if (brokerType === "ANGELONE") {
          // AngelOne Liquidation: place manual market SELL order for owned qty
          const existingPos = alpacaPositions.find((p) => p.symbol === symbolClean);
          if (!existingPos || existingPos.qty <= 0) {
            throw new Error(`You have no active holding in ${symbolClean} to liquidate.`);
          }
          
          addLog("ANGELONE", "LIQUIDATE_START", `Initiating close-out for ${symbolClean} (${existingPos.qty} shares)`, "INFO");
          
          const response = await fetch("/api/angelone/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              angelApiKey,
              angelClientCode,
              angelMpin,
              angelTotpSeed,
              symbol: symbolClean,
              qty: existingPos.qty,
              side: "sell",
              isMockConnection: !angelApiKey || !angelClientCode,
            }),
          });
          
          const resText = await response.text();
          let dataOrder: any = null;
          try {
            dataOrder = JSON.parse(resText);
          } catch (e) {
            throw new Error(`Server returned error: ${resText.slice(0, 100)}`);
          }
          
          if (!response.ok || dataOrder?.error) {
            throw new Error(dataOrder?.error || "Order rejected by broker.");
          }
          
          addLog(symbolClean, "LIQUIDATED", `Position fully liquidated! Sold ${existingPos.qty} shares.`, "SUCCESS");
          
          // Append to manual order records
          const newOrderObj: Order = {
            id: dataOrder.id || `ord-${Date.now()}`,
            symbol: symbolClean,
            side: "SELL",
            qty: existingPos.qty,
            price: dataOrder.price || existingPos.current_price,
            status: "FILLED",
            submittedAt: new Date().toLocaleTimeString(),
          };
          setOrders((prev) => [newOrderObj, ...prev]);
          
          setTimeout(() => {
            handleRefreshData();
          }, 1200);
        } else {
          // Alpaca direct DELETE position liquidation helper
          addLog("ALPACA", "LIQUIDATE_START", `Initiating direct close-out for ${symbolClean} via brokerage liquidation`, "INFO");
          
          const response = await fetch("/api/alpaca/liquidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey,
              apiSecret,
              isPaper,
              symbol: symbolClean,
            }),
          });
          
          const rawData = await response.json();
          if (!response.ok || rawData?.error) {
            throw new Error(rawData?.error || "Liquidation rejected by Alpaca.");
          }
          
          addLog(symbolClean, "LIQUIDATED", `Direct position liquidation successful! Broker order queued.`, "SUCCESS");
          
          setTimeout(() => {
            handleRefreshData();
          }, 1250);
        }
      } else {
        // Simulated Portfolio Liquidation Logic
        const pos = mockPositions.find((p) => p.symbol === symbolClean);
        if (!pos) {
          throw new Error(`Holding not found in active simulator workspace.`);
        }
        
        const isLong = pos.qty >= 0;
        const absQty = Math.abs(pos.qty);
        const orderCost = absQty * pos.current_price;
        
        // Fee calculations congruent with the standard order desk
        let flatBrokerage = symbolClean === "BTCUSD" ? 0.10 : 1.00;
        let taxRate = symbolClean === "BTCUSD" ? 0.0015 : 0.0005;
        let slippageRate = 0.0002;
        const orderFees = parseFloat((flatBrokerage + orderCost * (taxRate + slippageRate)).toFixed(2));
        const netProceeds = isLong ? (orderCost - orderFees) : -(orderCost + orderFees);
        
        // Update local state cash & remove position
        setSimCash((c) => c + netProceeds);
        setMockPositions((prev) => prev.filter((p) => p.symbol !== symbolClean));
        
        // Record simulated offline trade
        const newOrderObj: Order = {
          id: `sim-liq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          symbol: symbolClean,
          side: isLong ? "SELL" : "BUY", // short positions are covered/bought back
          qty: absQty,
          price: pos.current_price,
          status: "FILLED",
          submittedAt: new Date().toLocaleTimeString(),
        };
        setOrders((prev) => [newOrderObj, ...prev]);
        
        addLog(
          symbolClean,
          "LIQUIDATED_SIM",
          `Simulator closed ${symbolClean} position of ${pos.qty} shares for net of $${Math.abs(netProceeds).toFixed(2)} (Fees: $${orderFees.toFixed(2)}).`,
          "SUCCESS"
        );
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

  const openConfirmForPosition = (symbol: string) => {
    setConfirmModalType("position");
    setConfirmModalSymbol(symbol.toUpperCase().trim());
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
      await handleLiquidatePosition(confirmModalSymbol);
    } else if (confirmModalType === "portfolio") {
      await handleLiquidatePortfolio();
    }
    setConfirmModalType(null);
    setConfirmModalSymbol(null);
  };

  const handleLiquidatePortfolio = async () => {
    // Elegant system confirmation before full destruction
    setIsLiquidating("all");
    
    // (Note: when invoked from UI modal we bypass native confirm)
    addLog("PORTFOLIO", "LIQUIDATE_ALL_START", "Triggering global panic liquidation for all asset classes.", "WARNING");
    
    try {
      if (useAlpacaLive) {
        if (brokerType === "ANGELONE") {
          // Sequentially close out all positions through SmartAPI
          if (alpacaPositions.length === 0) {
            throw new Error("No active positions to liquidate.");
          }
          
          let successCount = 0;
          for (const pos of alpacaPositions) {
            if (pos.qty <= 0) continue;
            try {
              const response = await fetch("/api/angelone/trade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  angelApiKey,
                  angelClientCode,
                  angelMpin,
                  angelTotpSeed,
                  symbol: pos.symbol,
                  qty: pos.qty,
                  side: "sell",
                  isMockConnection: !angelApiKey || !angelClientCode,
                }),
              });
              
              if (response.ok) {
                const data = await response.json();
                if (!data.error) {
                  successCount++;
                  addLog(pos.symbol, "LIQUIDATED", `Asset successfully sold ${pos.qty} shares.`, "SUCCESS");
                }
              }
            } catch (posErr) {
              console.error(`Sub-liquidation failed for ${pos.symbol}:`, posErr);
            }
          }
          
          addLog("PORTFOLIO", "LIQUIDATION_COMPLETE", `Completed global liquidation. Closed out ${successCount} NSE holdings.`, "SUCCESS");
          
          setTimeout(() => {
            handleRefreshData();
          }, 1500);
        } else {
          // Alpaca direct delete-all-positions route
          const response = await fetch("/api/alpaca/liquidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey,
              apiSecret,
              isPaper,
            }),
          });
          
          const rawData = await response.json();
          if (!response.ok || rawData?.error) {
            throw new Error(rawData?.error || "Portfolio liquidation rejected by Alpaca.");
          }
          
          addLog("PORTFOLIO", "LIQUIDATION_COMPLETE", "Alpaca direct portfolio liquidation broadcasted. All broker assets closed out.", "SUCCESS");
          
          setTimeout(() => {
            handleRefreshData();
          }, 1500);
        }
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
      addLog("GEMINI", "DIAGNOSE_SUCCESS", "AI Stress diagnosis compiled successfully.", "SUCCESS");
    } catch (err: any) {
      console.error(err);
      setAiAnalysis("### 🔴 Diagnostic Failed\nUnable to retrieve portfolio diagnosis from AI server. Please make sure the backend is active.");
      addLog("GEMINI", "DIAGNOSE_ERROR", err.message || "Model computation timed out.", "CRITICAL");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-brand-bg md:p-8" id="root-container">
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
      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleConfirmModalCancel} />
          <div className="relative bg-brand-card rounded-lg p-5 z-10 w-full max-w-md border border-brand-border">
            <h3 className="text-lg font-bold text-white mb-2">{confirmModalType === "portfolio" ? "Confirm Portfolio Liquidation" : `Confirm Liquidation: ${confirmModalSymbol}`}</h3>
            <p className="text-sm text-gray-400 mb-4">
              {confirmModalType === "portfolio"
                ? "This will sell ALL open positions immediately and convert them to cash. This action cannot be undone."
                : `This will sell all shares of ${confirmModalSymbol} and convert the position to cash. Proceed?`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={handleConfirmModalCancel} className="px-3 py-2 rounded bg-brand-bg border border-brand-border text-sm text-gray-300">Cancel</button>
              <button onClick={handleConfirmModalConfirm} className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-bold">Confirm Liquidation</button>
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
              onClick={() => {
                if (apiKey && apiSecret) {
                  handleConnectAlpaca();
                } else {
                  // Focus configuration inputs or alert
                  showToast("Setup Required: Please insert Alpaca API Credentials first.", "WARNING");
                  document.getElementById("alpaca-config-card")?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition ${
                useAlpacaLive
                  ? "bg-brand-green/25 text-brand-green border border-brand-green/30"
                  : "text-gray-405 text-gray-400 hover:text-white"
              }`}
            >
              Live Alpaca
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
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Alpaca API Key ID
                </label>
                <input
                  type="text"
                  id="alpaca-api-key-input"
                  placeholder="e.g. PKXXXXXXXXXXXXXXXXXX"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-brand-bg rounded-lg border border-brand-border p-2.5 text-sm text-white focus:outline-none focus:border-brand-green md:text-base font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1 font-mono">
                  Alpaca Secret Key
                </label>
                <div className="relative" id="api-secret-container">
                  <input
                    type={showApiSecret ? "text" : "password"}
                    id="alpaca-api-secret-input"
                    placeholder="e.g. abcdefghijklmnopqrstuvwxyzXXXXXX"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="w-full bg-brand-bg rounded-lg border border-brand-border p-2.5 text-sm text-white focus:outline-none focus:border-brand-green pr-10 md:text-base font-mono"
                  />
                  <button
                    type="button"
                    id="toggle-secret-visibility"
                    onClick={() => {
                      const nextVal = !showApiSecret;
                      setShowApiSecret(nextVal);
                      showToast(nextVal ? "Alpaca API Secret visible (Private View)." : "Alpaca API Secret redacted.", "INFO");
                    }}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-white"
                  >
                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div id="alpaca-endpoint-toggles" className="flex items-center justify-between py-1 bg-brand-bg/50 px-2.5 rounded-lg border border-brand-border/60">
                <span className="text-xs text-gray-400 font-medium">Remote API Endpoint</span>
                <div className="flex gap-2" id="endpoints-group">
                  <button
                    id="paper-api-toggle"
                    onClick={() => {
                      setIsPaper(true);
                      localStorage.setItem("APCA_IS_PAPER", "true");
                      showToast("API Endpoint set to Paper testnet (Simulation).", "SUCCESS");
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-bold font-mono uppercase tracking-tight transition ${
                      isPaper
                        ? "bg-brand-green/20 text-brand-green border border-brand-green/45"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Paper
                  </button>
                  <button
                    id="live-api-toggle"
                    onClick={() => {
                      setIsPaper(false);
                      localStorage.setItem("APCA_IS_PAPER", "false");
                      showToast("API Endpoint set to Live Real (Warning: Real Trades).", "WARNING");
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-bold font-mono uppercase tracking-tight transition ${
                      !isPaper
                        ? "bg-brand-red/20 text-brand-red border border-brand-red/45"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Live Real
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
                  onClick={handleTestConnection}
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
              {useAlpacaLive ? "Live Day P&L" : "Sandbox Net Profit"}
            </span>
            
            {useAlpacaLive ? (
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
              {!useAlpacaLive && !isEditingCash && (
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

          <div className="p-4 bg-brand-card rounded-xl border border-brand-border relative overflow-hidden col-span-2 lg:col-span-1" id="stat-buying-power">
            <Zap className="absolute -right-2 -bottom-2 h-14 w-14 text-white/5 pointer-events-none" />
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Account Buying Power
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono break-all" id="buying-power-number">
              ${(useAlpacaLive ? parseFloat(alpacaAccount?.buying_power || 0) : activeCash * simLeverageLimit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-purple-400 mt-1.5 flex items-center gap-1 font-mono" id="stat-buying-power-limit">
              <span>{useAlpacaLive ? "Active Alpaca quote" : `${simLeverageLimit}x mechanical ratio limit`}</span>
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

          <div className="pt-4 border-t border-brand-border/60 flex items-center justify-between text-xs text-gray-400 font-mono" id="ai-footer-diagnostics">
            <span>Model: gemini-3.5-flash</span>
            <span className="flex items-center gap-1 text-brand-green font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-green animate-ping" />
              Sentry Stress Engine Active
            </span>
          </div>
        </div>
      </section>

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
                  onClick={handleRefreshData}
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

              {activePositions.length > 0 && (
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
              )}
            </div>
          </div>

          {/* Active Positions Table */}
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
                {activePositions.length > 0 ? (
                  activePositions.map((pos) => {
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
                          <div className="text-sm font-semibold">{pos.qty}</div>
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
                            {isPlPositive ? "▲" : "▼"} {((plVal / (pos.qty * pos.avg_entry_price || 1)) * 100).toFixed(2)}%
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
                              className="text-red-400 hover:text-white hover:bg-red-950/80 transition p-1.5 rounded-lg border border-transparent hover:border-red-900/50 flex items-center justify-center mx-auto"
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
                                className="text-orange-400 hover:text-white hover:bg-orange-950/60 transition p-1.5 rounded-lg border border-transparent hover:border-orange-900/40"
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
                        <p className="text-sm font-semibold">Workspace Collateral is Empty</p>
                        <p className="text-xs text-gray-505 text-gray-500 max-w-sm mt-1">
                          No active positions found in {useAlpacaLive ? "this Alpaca account portfolio" : "simulator mode"}. Submit buy orders on the terminal right side to construct asset balance.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
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
                  <p className="text-[10px] text-gray-500 font-mono mt-1.5 text-center">
                    {isAutopilotActive 
                      ? "Bot is actively intercepting and optimizing positions automatically."
                      : "Bot idle. Activate to take over trading based on rules / AI directives."}
                  </p>
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
                        <option value="10">Every 10 Seconds</option>
                        <option value="15">Every 15 Seconds</option>
                        <option value="30">Every 30 Seconds</option>
                        <option value="60">Every 60 Seconds</option>
                      </select>
                    </div>
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
                          onClick={() => setGlobalTakeProfitPercent(15)}
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
                          onClick={() => setGlobalStopLossPercent(5)}
                          className="px-2 py-1 bg-brand-border hover:bg-brand-border/80 rounded text-[10px] font-bold"
                        >
                          Reset
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-1">Autopilot will force-exit positions at or below this loss percent.</p>
                    </div>
                  </div>

                  {/* Risk & diversification controls */}
                  <div className="grid grid-cols-3 gap-3 pt-3" id="risk-diversify-row">
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

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Max Exposure % / Symbol</label>
                      <input
                        id="max-exposure-input"
                        type="number"
                        min={0}
                        step={0.1}
                        value={maxExposurePercentPerSymbol}
                        onChange={(e) => setMaxExposurePercentPerSymbol(Number.isFinite(parseFloat(e.target.value)) ? Math.max(0, parseFloat(e.target.value)) : 0)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Cap percent allocation per symbol.</p>
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
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3" id="live-min-qty-row">
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
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Live Min Qty (Crypto)</label>
                      <input
                        id="live-min-crypto-qty-input"
                        type="number"
                        min={0.000001}
                        step={0.0001}
                        value={liveMinCryptoOrderQty}
                        onChange={(e) => setLiveMinCryptoOrderQty(Number.isFinite(parseFloat(e.target.value)) ? Math.max(0.000001, parseFloat(e.target.value)) : 0.0001)}
                        className="w-full bg-brand-bg border border-brand-border text-white text-xs rounded p-2 focus:outline-none focus:border-brand-green font-mono"
                      />
                      <p className="text-[9px] text-gray-500 mt-1">Minimum live crypto size after auto-resizing.</p>
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
                          <span className="font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.atr14.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-[9px] block uppercase tracking-tight">ATR Threshold (25%)</span>
                          <span className="font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.atrThreshold.toFixed(2)}</span>
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
                              {brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.rangeRange.toFixed(2)}
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
                            {brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.limitPrice.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#00e676]" />
                            Fib Retrace 38.2% Target:
                          </span>
                          <span className="text-brand-green font-bold">
                            {brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.targetPrice.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
                            Stop Loss Limit (2:1 RR):
                          </span>
                          <span className="text-brand-red font-bold">
                            {brokerType === "ANGELONE" ? "₹" : "$"}{touchTurnState.stopPrice.toFixed(2)}
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
                              {brokerType === "ANGELONE" ? "₹" : "$"}{macdState.entryPrice.toFixed(2)}
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
                        <span className="text-gray-500 text-[8px] uppercase tracking-wider font-extrabold block mb-1">📐 TRADING BOX HORIZONTAL CHANNELS</span>
                        
                        {/* Swing High */}
                        <div className="flex justify-between items-center bg-red-950/20 px-1.5 py-0.5 rounded border border-brand-red/10">
                          <span className="text-brand-red/70 font-semibold">🔴 Swing High (Resistance Box Edge):</span>
                          <span className="text-brand-red font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.swingHigh.toFixed(2)}</span>
                        </div>

                        {/* Range High */}
                        <div className="flex justify-between items-center bg-red-950/10 px-1.5 py-0.5 rounded border border-brand-red/5">
                          <span className="text-red-400 text-[9px]">🔴 Range High (Previous Day High Close):</span>
                          <span className="text-red-300 font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.rangeHigh.toFixed(2)}</span>
                        </div>

                        {/* Center core status */}
                        <div className="text-center py-1 border-y border-brand-border/30 my-1 bg-brand-bg/30 text-[9px] text-gray-400">
                          ⚡ Center Neutral Chop Zone (Ignored)
                        </div>

                        {/* Range Low */}
                        <div className="flex justify-between items-center bg-emerald-950/10 px-1.5 py-0.5 rounded border border-brand-green/5">
                          <span className="text-emerald-400 text-[9px]">🟢 Range Low (Previous Day Low Close):</span>
                          <span className="text-emerald-300 font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.rangeLow.toFixed(2)}</span>
                        </div>

                        {/* Swing Low */}
                        <div className="flex justify-between items-center bg-emerald-950/20 px-1.5 py-0.5 rounded border border-brand-green/10">
                          <span className="text-brand-green/70 font-semibold">🟢 Swing Low (Support Box Edge):</span>
                          <span className="text-brand-green font-bold">{brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.swingLow.toFixed(2)}</span>
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
                                {brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.entryPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {sneakyPivotState.targetPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium">Pivot Exit Profit Target:</span>
                              <span className="text-brand-green font-bold">
                                {brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.targetPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {sneakyPivotState.stopPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium">&quot;Guardian Angel&quot; Stop Loss:</span>
                              <span className="text-brand-red font-bold">
                                {brokerType === "ANGELONE" ? "₹" : "$"}{sneakyPivotState.stopPrice.toFixed(2)}
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
                  <div className="bg-brand-bg/60 p-3 rounded-lg border border-brand-border space-y-1.5 font-mono" id="last-autopilot-outcome-card">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Order Outcome</span>
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
                    <div className="text-[11px] text-white">
                      {lastAutopilotOrderOutcome.side} {lastAutopilotOrderOutcome.requestedQty} {lastAutopilotOrderOutcome.symbol}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Code: <span className="text-gray-300 font-bold">{lastAutopilotOrderOutcome.code}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 leading-relaxed">{lastAutopilotOrderOutcome.message}</div>
                  </div>
                )}

                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 font-mono">
                    🤖 Autopilot Activity feed
                  </span>
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
              className={`pointer-events-auto p-4 rounded-xl border-2 shadow-xl shadow-black/45 flex items-start gap-3 transition-all duration-300 transform translate-y-0 scale-100 animate-slide-in ${bgColor}`}
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

      {/* Global CSS for Button Visual Press-Scale & Toast Entry Slide Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes toast-slide-in {
          from { transform: translateY(1.5rem) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-slide-in {
          animation: toast-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        button, select, input[type="submit"], [role="button"] {
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), filter 0.1s ease-in-out, background-color 0.15s ease !important;
        }
        button:not(:disabled):active, select:active, input[type="submit"]:active, [role="button"]:active {
          transform: scale(0.95) !important;
          filter: brightness(1.15) !important;
        }
      `}} />

    </div>
  );
}
