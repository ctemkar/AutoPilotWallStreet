import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const FETCH_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetries(url: string, options: RequestInit = {}, retries = 3, timeoutMs = FETCH_TIMEOUT_MS) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (e: any) {
      if (i === retries) throw e;
      const backoff = Math.min(2000, 500 * Math.pow(2, i));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

function resolveAlpacaCredentials(body: any) {
  const { isPaper } = body || {};
  
  // Extract provided keys from request body
  let providedKey = body?.apiKey || "";
  let providedSecret = body?.apiSecret || "";

  // SAFETY: Validate that provided keys match the intended Paper/Live mode.
  // Live keys start with AK, Paper keys start with PK.
  const looksLikeLive = providedKey.startsWith("AK");
  const looksLikePaper = providedKey.startsWith("PK");

  if (isPaper && looksLikeLive) {
    providedKey = "";
    providedSecret = "";
  } else if (!isPaper && looksLikePaper) {
    providedKey = "";
    providedSecret = "";
  }

  const apiKey = providedKey
    || (isPaper
      ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY
      : process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_KEY)
    || "";
  const apiSecret = providedSecret
    || (isPaper
      ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET
      : process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET)
    || "";

  const source = (providedKey && providedKey === body?.apiKey)
    ? "request"
    : isPaper
      ? process.env.ALPACA_PAPER_API_KEY
        ? "ALPACA_PAPER_API_KEY"
        : process.env.ALPACA_PAPER_KEY
          ? "ALPACA_PAPER_KEY"
          : process.env.ALPACA_API_KEY
            ? "ALPACA_API_KEY"
            : "none"
      : process.env.ALPACA_KEY
        ? "ALPACA_KEY"
        : "none";
  return { apiKey, apiSecret, isPaper: !!isPaper, source };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, apiSecret, isPaper, source } = resolveAlpacaCredentials(body);

    console.log(`[ALPACA_CONNECT] isPaper=${isPaper} apiKey=${apiKey?.slice(0, 4)}... source=${source}`);

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error: "API Key or Secret missing on server. Add ALPACA_KEY/ALPACA_SECRET for the live API or ALPACA_PAPER_API_KEY/ALPACA_PAPER_API_SECRET for the paper API to .env.local, then restart the dev server.",
        },
        { status: 200 }
      );
    }

    const baseUrl = isPaper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

    const headers = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
      "User-Agent": "Alpaca-Margin-Terminal/1.0",
    };

    const [accountResult, positionsResult] = await Promise.allSettled([
      fetchWithRetries(`${baseUrl}/v2/account`, { headers, cache: "no-store" }),
      fetchWithRetries(`${baseUrl}/v2/positions`, { headers, cache: "no-store" }),
    ]);

    if (accountResult.status === "rejected") {
      const errMsg = accountResult.reason?.name === "AbortError"
        ? `Alpaca account request timed out after ${FETCH_TIMEOUT_MS}ms.`
        : accountResult.reason?.message || String(accountResult.reason || "Unknown Alpaca account fetch failure.");
      console.error("Alpaca account fetch error:", errMsg);
      return NextResponse.json(
        { error: `Unable to reach Alpaca account endpoint: ${errMsg}` },
        { status: 200 }
      );
    }

    const accountOutcome = accountResult as PromiseSettledResult<Response>;
    const accountRes = accountOutcome.status === "fulfilled" ? accountOutcome.value : undefined;
    if (accountOutcome.status === "rejected") {
      const reason = accountOutcome.reason instanceof Error ? accountOutcome.reason.message : String(accountOutcome.reason || "Unknown Alpaca account fetch failure");
      return NextResponse.json(
        { error: `Alpaca account request did not complete: ${reason}` },
        { status: 200 }
      );
    }

    if (!accountRes) {
      return NextResponse.json(
        { error: "Alpaca account request completed without a response body." },
        { status: 200 }
      );
    }

    if (!accountRes.ok) {
      const errorText = await accountRes.text();
      const guidance = accountRes.status === 401
        ? " This looks like a 401 Unauthorized from Alpaca. If you are using paper mode, verify your ALPACA_PAPER_API_KEY/ALPACA_PAPER_API_SECRET values. If you are using live mode, verify ALPACA_LIVE_API_KEY/ALPACA_LIVE_API_SECRET. If you are relying on generic ALPACA_KEY/ALPACA_SECRET, ensure those credentials match the selected mode."
        : "";
      return NextResponse.json(
        { error: `Alpaca authenticating error: ${errorText || accountRes.statusText}.${guidance}` },
        { status: 200 }
      );
    }

    const accountData = await accountRes.json();

    let positionsData: any[] = [];
    if (positionsResult.status === "fulfilled") {
      const positionsRes = positionsResult.value;
      if (positionsRes?.ok) {
        positionsData = await positionsRes.json();
      } else {
        console.warn("Alpaca positions fetch failed:", positionsRes?.status, positionsRes?.statusText);
      }
    } else {
      console.warn("Alpaca positions fetch error:", positionsResult.reason?.message || positionsResult.reason);
    }

    // Coerce numeric fields to numbers to avoid string-falsy bugs (e.g. "0")
    const safeNumber = (v: any) => {
      const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
      return Number.isFinite(n) ? n : 0;
    };

    return NextResponse.json({
      account: {
        // Expose last_equity so front-end can compute day change (Live Day P&L)
        last_equity: safeNumber(accountData.last_equity),
        account_number: accountData.account_number,
        cash: safeNumber(accountData.cash),
        equity: safeNumber(accountData.equity),
        buying_power: safeNumber(accountData.buying_power),
        portfolio_value: safeNumber(accountData.portfolio_value),
        regt_buying_power: safeNumber(accountData.regt_buying_power),
        daytrading_buying_power: safeNumber(accountData.daytrading_buying_power),
        maintenance_margin: safeNumber(accountData.maintenance_margin),
        initial_margin: safeNumber(accountData.initial_margin),
        long_market_value: safeNumber(accountData.long_market_value),
        short_market_value: safeNumber(accountData.short_market_value),
        shorting_enabled: accountData.shorting_enabled,
      },
      positions: positionsData.map((pos: any) => ({
        symbol: pos.symbol,
        qty: safeNumber(pos.qty),
        side: pos.side,
        avg_entry_price: safeNumber(pos.avg_entry_price),
        current_price: safeNumber(pos.current_price),
        market_value: safeNumber(pos.market_value),
        unrealized_pl: safeNumber(pos.unrealized_pl),
        unrealized_plpc: safeNumber(pos.unrealized_plpc),
        maintenance_margin_rate: 0.30, // Default fallback margin rate for standard risk calculation
      })),
    });
  } catch (error: any) {
    console.error("Alpaca Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error connecting to Alpaca." },
      { status: 200 }
    );
  }
}
