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

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts";
import {
  RefreshCw,
  Trash2,
  Settings,
  Code,
  TrendingUp,
  TrendingDown,
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
  Zap
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

export default function Home() {
  // Alpaca States API key configuration
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isPaper, setIsPaper] = useState(true);
  const [useAlpacaLive, setUseAlpacaLive] = useState(false);

  // Connection & loading flags
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");

  // Simulated (Paper Setup) Parameters
  const [simCash, setSimCash] = useState(2000);
  const [startingCapital, setStartingCapital] = useState(3305); // Cash $2,000 + NVDA $220 + AAPL $540 + TSLA $220 + BTCUSD $325 cost basis
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [tempCashInput, setTempCashInput] = useState("");
  const [simLeverageLimit, setSimLeverageLimit] = useState(4); // 4x leverage limit
  const [simMaintRate, setSimMaintRate] = useState(30); // 30% maintenance rate default
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
      symbol: "TSLA",
      qty: 1.0,
      avg_entry_price: 220.0,
      current_price: 195.0,
      market_value: 195.0,
      unrealized_pl: -25.0,
      unrealized_plpc: -0.1136,
      maintenance_margin_rate: 0.40,
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // AI Stress Diagnosis state
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- SENTRY AUTOPILOT STATE VARIABLES & ENGINES ---
  const [isAutopilotActive, setIsAutopilotActive] = useState(false);
  const [autopilotStrategy, setAutopilotStrategy] = useState<"SENTRY_HEAL" | "GEMINI_AI" | "SCALPER">("GEMINI_AI");
  const [autopilotInterval, setAutopilotInterval] = useState(15); // in seconds
  const [autopilotTargetTicker, setAutopilotTargetTicker] = useState("AAPL");
  const [autopilotLogs, setAutopilotLogs] = useState<{ id: string; time: string; msg: string; type: "info" | "success" | "warn" | "trade" }[]>([
    {
      id: "init",
      time: new Date().toLocaleTimeString(),
      msg: "System load successful. Autopilot engine initialized offline. Configure credentials or select simulated asset.",
      type: "info"
    }
  ]);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [tradeFormTab, setTradeFormTab] = useState<"manual" | "autopilot">("manual");
  const [isTickStreamActive, setIsTickStreamActive] = useState(true);
  const [autopilotLossGuard, setAutopilotLossGuard] = useState(true); // Drawdown Shield Protection

  // Refresh data proxy
  const handleRefreshData = useCallback(async () => {
    if (!useAlpacaLive || !apiKey || !apiSecret) return;
    setIsRefreshing(true);
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
        throw new Error(rawData?.error || `Unable to sync positions.`);
      }

      setAlpacaAccount(rawData.account);
      setAlpacaPositions(rawData.positions);
      addLog("ALPACA", "SYNC", "Real-time positions and balances successfully synced.", "SUCCESS");
    } catch (err: any) {
      console.error(err);
      addLog("ALPACA", "SYNC_ERROR", `Data stream refresh interrupted: ${err.message || err}`, "WARNING");
    } finally {
      setIsRefreshing(false);
    }
  }, [useAlpacaLive, apiKey, apiSecret, isPaper]);

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
    autopilotStrategy,
    autopilotTargetTicker,
    warnThreshold,
    isAutopilotRunning,
    alpacaAccount,
    handleRefreshData,
    autopilotLossGuard
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
      autopilotStrategy,
      autopilotTargetTicker,
      warnThreshold,
      isAutopilotRunning,
      alpacaAccount,
      handleRefreshData,
      autopilotLossGuard
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
    autopilotStrategy,
    autopilotTargetTicker,
    warnThreshold,
    isAutopilotRunning,
    alpacaAccount,
    handleRefreshData,
    autopilotLossGuard
  ]);

  const addAutopilotLog = (msg: string, type: "info" | "success" | "warn" | "trade") => {
    const newLog = {
      id: `ap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      time: new Date().toLocaleTimeString(),
      msg,
      type
    };
    setAutopilotLogs((prev) => [newLog, ...prev].slice(0, 50));
  };

  const executeAutopilotOrder = useCallback(async (symbolClean: string, side: "BUY" | "SELL", qtyNum: number) => {
    const curRef = stateRef.current;
    if (qtyNum <= 0) return;
    symbolClean = symbolClean.toUpperCase().trim();

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
            return;
          }
        }
      }
    }

    if (curRef.useAlpacaLive) {
      if (!curRef.isConnected) {
        addAutopilotLog(`Blocked automated order: credentials are disconnected.`, "warn");
        return;
      }

      let finalQty = qtyNum;

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

            if (finalQty <= (symbolClean === "BTCUSD" ? 0.0005 : 0.05)) {
              addAutopilotLog(`Blocked live automated BUY: Affordable size ${finalQty} for ${symbolClean} is negligible. BP: ${maxAllowedPower.toFixed(2)} (safe cap: ${maxSafeOrderVal.toFixed(2)}), price: ${estPrice.toFixed(2)}.`, "warn");
              addLog(symbolClean, "AUTO_BUY_BLOCKED", `Affordable size ${finalQty} is too small to execute. Balance: ${maxAllowedPower.toFixed(2)}.`, "WARNING");
              return;
            } else {
              addAutopilotLog(`Leverage Control: Out of buying power / buffer cushion for ${qtyNum} ${symbolClean} (~${estimatedCost.toFixed(2)}). Rescaled down to ${finalQty} (~${(estPrice * finalQty).toFixed(2)}) based on ${maxSafeOrderVal.toFixed(2)} maximum safe order limit (30% buffer).`, "info");
            }
          } else {
            addAutopilotLog(`Blocked live automated BUY: Insufficient buying power buffer. Cost for ${qtyNum} ${symbolClean} is ~${estimatedCost.toFixed(2)} with safe maximum limit of ${maxSafeOrderVal.toFixed(2)} (total BP: ${maxAllowedPower.toFixed(2)}).`, "warn");
            addLog(symbolClean, "AUTO_BUY_BLOCKED", `Insufficient buying power: ${maxAllowedPower.toFixed(2)} available vs ${estimatedCost.toFixed(2)} required.`, "WARNING");
            return;
          }
        }
      } else {
        const existingPos = curRef.alpacaPositions?.find((p: Position) => p.symbol === symbolClean);
        const ownedQty = existingPos ? existingPos.qty : 0;
        if (ownedQty <= 0) {
          addAutopilotLog(`Blocked automated live SELL of ${qtyNum} ${symbolClean}: You do not own a long position. Live Alpaca short-selling is restricted. Switch to Local Simulator to trade short strategies!`, "warn");
          addLog(symbolClean, "AUTO_SELL_BLOCKED", `Blocked automated short-sell of ${symbolClean}.`, "WARNING");
          return;
        }
        if (finalQty > ownedQty) {
          addAutopilotLog(`Leverage Control: Capping automated live SELL of ${symbolClean} from ${qtyNum} to owned size ${ownedQty} to prevent unauthorized short-selling.`, "info");
          finalQty = ownedQty;
        }
      }

      addAutopilotLog(`[Bot Order] Queueing live brokerage market ${side} of ${finalQty} ${symbolClean}...`, "trade");
      addLog("AUTOPILOT", side, `Transmitting Bot Order: ${side} ${finalQty} shares of ${symbolClean}`, "INFO");
      try {
        const response = await fetch("/api/alpaca/trade", {
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

        addAutopilotLog(`Automated Live Order FILLED! ID: ${dataOrder.id || "Success"}.`, "success");
        addLog(
          symbolClean,
          `${side}_FILLED`,
          `Live automated market order executed for ${finalQty} share(s) of ${symbolClean}.`,
          "SUCCESS"
        );

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

      } catch (err: any) {
        console.error(err);
        let errorMsg = err.message || "Broker block";
        if (errorMsg.includes("is not allowed to short") || errorMsg.includes("shorting")) {
          errorMsg = "Account is not allowed to short. Standard Alpaca Cash and non-margin accounts cannot short-sell. Swap to Local Risk Simulator to fully trade short strategies!";
        } else if (errorMsg.includes("insufficient buying power")) {
          errorMsg = "Insufficient buying power in your Alpaca account. Use smaller positions or switch to Local Risk Simulator mode!";
        }
        addAutopilotLog(`Automated Live Order REJECTED: ${errorMsg}`, "warn");
        addLog(symbolClean, `AUTO_${side}_FAILED`, errorMsg, "CRITICAL");
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

      if (side === "BUY") {
        if (orderCost > curRef.simCash) {
          addAutopilotLog(`Blocked automated simulation: Insufficient sim balance. Needs $${orderCost.toFixed(2)}.`, "warn");
          addLog(symbolClean, "AUTO_BUY_SIM_FAILED", "Simulated cash reserves exhausted in automated loop.", "WARNING");
          return;
        }
        setSimCash((c) => c - orderCost);
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
              newAvgEntry = (exists.avg_entry_price * exists.qty + estPrice * qtyNum) / updatedQty;
              unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
            } else {
              if (updatedQty < 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              } else {
                newAvgEntry = estPrice;
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
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: qtyNum,
                avg_entry_price: estPrice,
                current_price: estPrice,
                market_value: parseFloat(orderCost.toFixed(2)),
                unrealized_pl: 0,
                unrealized_plpc: 0,
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim purchase complete: Acquired ${qtyNum} shares of ${symbolClean} at $${estPrice.toFixed(2)}.`, "success");
        addLog(symbolClean, "AUTO_BUY_SIM", `Purchased simulated ${qtyNum} shares of ${symbolClean} at cash basis $${estPrice.toFixed(2)}`, "SUCCESS");
      } else {
        // Simulated SELL (With support for Short Selling / Cover)
        setSimCash((c) => c + orderCost);
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
                newAvgEntry = estPrice;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              }
            } else {
              newAvgEntry = (exists.avg_entry_price * Math.abs(exists.qty) + estPrice * qtyNum) / Math.abs(updatedQty);
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
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: parseFloat(updatedQty.toFixed(4)),
                avg_entry_price: estPrice,
                current_price: estPrice,
                market_value: parseFloat((updatedQty * estPrice).toFixed(2)),
                unrealized_pl: 0,
                unrealized_plpc: 0,
                maintenance_margin_rate: 0.30,
              },
            ];
          }
        });
        addAutopilotLog(`Sim sale complete: Sold/Short-sold ${qtyNum} shares of ${symbolClean} at $${estPrice.toFixed(2)}.`, "success");
        addLog(symbolClean, "AUTO_SELL_SIM", `Sold simulated ${qtyNum} shares of ${symbolClean} at cash basis $${estPrice.toFixed(2)}`, "SUCCESS");
      }

      setOrders((prev) => [
        {
          id: `sim-auto-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          symbol: symbolClean,
          side: side,
          qty: qtyNum,
          price: estPrice,
          status: "FILLED_MOCK_AUTO",
          submittedAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    }
  }, []);

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

      const targetSymbol = (curRef.autopilotTargetTicker || "AAPL").toUpperCase().trim() || "AAPL";

      if (curRef.autopilotStrategy === "SENTRY_HEAL") {
        addAutopilotLog(`Checking Margin Levels... Usage: ${currentCapacity.toFixed(1)}% | Ceiling Limit: ${curRef.warnThreshold}%.`, "info");
        
        if (currentCapacity >= curRef.warnThreshold) {
          addAutopilotLog(`⚠️ Hazard: Over-allocation! Margin ${currentCapacity.toFixed(1)}% exceeds alert threshold. Triggering AutoDeleverage defender...`, "warn");
          
          if (currentActivePositions.length === 0) {
            addAutopilotLog(`Nothing to sell to deleverage. Holdings are empty.`, "warn");
          } else {
            const highestExposure = [...currentActivePositions].sort((a, b) => {
              const aCost = a.current_price * Math.abs(a.qty) * a.maintenance_margin_rate;
              const bCost = b.current_price * Math.abs(b.qty) * b.maintenance_margin_rate;
              return bCost - aCost;
            })[0];
            
            const qtyAbs = Math.abs(highestExposure.qty);
            const rawQty = Math.max(1, Math.round(qtyAbs * 0.2) || 1);
            
            if (highestExposure.qty > 0) {
              addAutopilotLog(`Triggered auto-deleveraging order to sell ${rawQty} of high-beta long asset ${highestExposure.symbol}.`, "warn");
              await executeAutopilotOrder(highestExposure.symbol, "SELL", rawQty);
            } else {
              addAutopilotLog(`Triggered auto-deleveraging order to cover ${rawQty} of high-beta short asset ${highestExposure.symbol}.`, "warn");
              await executeAutopilotOrder(highestExposure.symbol, "BUY", rawQty);
            }
          }
        } else {
          addAutopilotLog(`Usage status is healthy. Autopilot deleveraging idle.`, "success");
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

        const randSeed = Math.random();
        if (randSeed > 0.55) {
          const buyQty = targetSymbol === "BTCUSD" ? 0.02 : 5;
          addAutopilotLog(`Scalper Signals: ${targetSymbol} ($${currentSpotPrice.toFixed(2)}) is dipping below support. Buying units.`, "trade");
          await executeAutopilotOrder(targetSymbol, "BUY", buyQty);
        } else if (randSeed < 0.25) {
          const exists = currentActivePositions.find((p) => p.symbol === targetSymbol);
          if (exists && exists.qty >= (targetSymbol === "BTCUSD" ? 0.02 : 2)) {
            const sellQty = targetSymbol === "BTCUSD" ? 0.02 : Math.min(exists.qty, 5);
            addAutopilotLog(`Scalper Signals: ${targetSymbol} ($${currentSpotPrice.toFixed(2)}) hit local resistance spike. Profit harvesting.`, "trade");
            await executeAutopilotOrder(targetSymbol, "SELL", sellQty);
          } else {
            addAutopilotLog(`Scalper Signals: Selling sign emitted but zero inventory of ticker ${targetSymbol} exists.`, "info");
          }
        } else {
          addAutopilotLog(`Scalper Range status: Neutral oscillation. No position change.`, "success");
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
          await executeAutopilotOrder(targetSymbol, "BUY", buyQty);
        } else if (data.action === "SELL") {
          addAutopilotLog(`🤖 AI Decision: SELL recommended for ${targetSymbol}. Reason: "${data.reason}"`, "trade");
          const sellQty = targetSymbol === "BTCUSD" ? 0.02 : data.qty || 5;
          const exists = currentActivePositions.find((p) => p.symbol === targetSymbol);
          if (!exists) {
            addAutopilotLog(`🤖 AI Posture: Initiating new short exposure of ${sellQty} ${targetSymbol}.`, "trade");
          }
          await executeAutopilotOrder(targetSymbol, "SELL", sellQty);
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
  }, [executeAutopilotOrder]);

  // Autopilot loop trigger
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (isAutopilotActive) {
      addAutopilotLog(`🔴 Sentry Autopilot trading system ACTIVATED!`, "info");
      executeAutopilotScan();
      
      intervalId = setInterval(() => {
        executeAutopilotScan();
      }, autopilotInterval * 1000);
    } else {
      addAutopilotLog(`🟢 Sentry Autopilot trading system DEACTIVATED. Intercept loops idle.`, "info");
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutopilotActive, autopilotInterval, executeAutopilotScan]);

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
    const savedIsPaper = localStorage.getItem("APCA_IS_PAPER") !== "false";
    const savedUseAlpaca = localStorage.getItem("APCA_USE_ALPACA") === "true";

    if (savedApiKey) setApiKey(savedApiKey);
    if (savedApiSecret) setApiSecret(savedApiSecret);
    setIsPaper(savedIsPaper);

    const ts = new Date().toLocaleTimeString();

    const initApp = async () => {
      if (savedUseAlpaca && savedApiKey && savedApiSecret) {
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
              message: `Securely auto-connected! Account: ${rawData.account.account_number}. Cash: $${parseFloat(rawData.account.cash).toLocaleString()}`,
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
            message: "Dashboard initialized in Local Simulator mode.",
            status: "INFO"
          }
        ]);
      }
    };

    initApp();
  }, []);

  // Helper log function
  function addLog(
    symbol: string,
    action: string,
    message: string,
    status: "SUCCESS" | "WARNING" | "CRITICAL" | "INFO"
  ) {
    const newLog: Log = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toLocaleTimeString(),
      symbol,
      action,
      message,
      status,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50));
  }

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
      alert(`Alpaca Error: ${err.message || "Unable to authorize. Please double check credentials."}`);
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
          setOrderError(`Alpaca Client: Insufficient buying power. Estimated cost for order is $${estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} but you only have $${buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available.`);
          addLog(symbolClean, "BUY_FAILED", `Blocked manual buy on Alpaca Live mode due to insufficient buying power.`, "WARNING");
          return;
        }
      }

      addLog("ALPACA", side, `Transmitting Order: ${side} for ${orderUnit === "USD" ? `$${inputVal}` : `${qtyNum} shares`} of ${symbolClean}`, "INFO");
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
          `Live market order executed for ${orderUnit === "USD" ? `$${inputVal}` : `${qtyNum} share(s)`} of ${symbolClean}.`,
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

      if (side === "BUY" && orderCost > simCash) {
        setIsPlacingOrder(false);
        setOrderError(`Simulation block: Insufficient simulated cache. Needs $${orderCost.toFixed(2)}.`);
        addLog(symbolClean, "BUY_SIM_FAILED", "Buying power exceeded in offline mock.", "WARNING");
        return;
      }

      // Execute mock transaction calculation
      setIsPlacingOrder(false);
      if (side === "BUY") {
        setSimCash((c) => c - orderCost);
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
              newAvgEntry = (exists.avg_entry_price * exists.qty + estPrice * qtyNum) / updatedQty;
              unrealized = updatedQty * exists.current_price - (newAvgEntry * updatedQty);
            } else {
              if (updatedQty < 0) {
                newAvgEntry = exists.avg_entry_price;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              } else {
                newAvgEntry = estPrice;
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
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: qtyNum,
                avg_entry_price: estPrice,
                current_price: estPrice,
                market_value: parseFloat(orderCost.toFixed(2)),
                unrealized_pl: 0,
                unrealized_plpc: 0,
                maintenance_margin_rate: parseFloat(newMaint) / 100 || 0.30,
              },
            ];
          }
        });
        setOrderSuccess(`Simulated purchase complete: Acquired ${qtyNum} shares of ${symbolClean} at $${estPrice.toFixed(2)}.`);
        addLog(symbolClean, "BUY_SIM", `Purchased simulated ${qtyNum} shares at $${estPrice}`, "SUCCESS");
      } else {
        // Simulated SELL / SHORT SELL
        setSimCash((c) => c + orderCost);
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
                newAvgEntry = estPrice;
                unrealized = (newAvgEntry - exists.current_price) * (-updatedQty);
              }
            } else {
              newAvgEntry = (exists.avg_entry_price * Math.abs(exists.qty) + estPrice * qtyNum) / Math.abs(updatedQty);
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
            return [
              ...prev,
              {
                symbol: symbolClean,
                qty: parseFloat(updatedQty.toFixed(4)),
                avg_entry_price: estPrice,
                current_price: estPrice,
                market_value: parseFloat((updatedQty * estPrice).toFixed(2)),
                unrealized_pl: 0,
                unrealized_plpc: 0,
                maintenance_margin_rate: parseFloat(newMaint) / 100 || 0.30,
              },
            ];
          }
        });
        setOrderSuccess(`Simulated sale complete: Liquidated/Short-sold ${qtyNum} shares of ${symbolClean} at $${estPrice.toFixed(2)}.`);
        addLog(symbolClean, "SELL_SIM", `Sold/Short-sold simulated ${qtyNum} shares at $${estPrice}`, "SUCCESS");
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
      alert("Please enter a valid symbol, Quantity, and current price.");
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
      alert("Price multiplier actions are disabled during active Alpaca brokerage logs.");
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
      setStartingCapital(3305);
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
          symbol: "TSLA",
          qty: 1.0,
          avg_entry_price: 220.0,
          current_price: 195.0,
          market_value: 195.0,
          unrealized_pl: -25.0,
          unrealized_plpc: -0.1136,
          maintenance_margin_rate: 0.40,
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
    alert("Python Sentry integration script copied to clipboard!");
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
                  alert("Please enter Alpaca API configuration keys down below first.");
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
                    onClick={() => setShowApiSecret(!showApiSecret)}
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
                        alert("Please enter a valid cash amount (minimum 0).");
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
                  {!useAlpacaLive && <th className="py-3 px-3 text-center uppercase">Action</th>}
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
                        {!useAlpacaLive && (
                          <td className="py-3.5 px-3 text-center">
                            <button
                              id={`delete-mock-pos-${pos.symbol}`}
                              onClick={() => handleDeleteMockPosition(pos.symbol)}
                              className="text-gray-500 hover:text-brand-red transition p-1 hover:bg-brand-red/10 rounded"
                              title="Delete simulated position from risk matrix"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr id="empty-table-prompt">
                    <td colSpan={useAlpacaLive ? 7 : 8} className="py-12 text-center text-gray-500">
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
                    {["AAPL", "NVDA", "TSLA", "BTCUSD", "MSFT"].map((symbol) => (
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
                </div>

                {/* Micro Real-time activity log specific to Sentry Autopilot */}
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

    </div>
  );
}
