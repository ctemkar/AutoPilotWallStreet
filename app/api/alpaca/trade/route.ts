import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isCryptoSymbol(sym: string): boolean {
  return /(BTCUSD|ETHUSD|LTCUSD|BCHUSD|SOLUSD|DOGEUSD|AVAXUSD)$/i.test(sym);
}

function getEtDate(now = new Date()): Date {
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function isRegularUsSession(etNow: Date): boolean {
  const day = etNow.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = etNow.getHours() * 60 + etNow.getMinutes();
  return mins >= 570 && mins < 960; // 9:30 - 16:00 ET
}

function isExtendedUsSession(etNow: Date): boolean {
  const day = etNow.getDay();
  if (day === 0 || day === 6) return false;
  const mins = etNow.getHours() * 60 + etNow.getMinutes();
  return (mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200); // 4:00-9:30, 16:00-20:00
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { isPaper, symbol, qty, side, notional, estimatedPrice } = body;
    const apiKey = body.apiKey
      || (isPaper
        ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_KEY || process.env.ALPACA_LIVE_API_KEY
        : process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_KEY || process.env.ALPACA_PAPER_API_KEY)
      || "";
    const apiSecret = body.apiSecret
      || (isPaper
        ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET || process.env.ALPACA_LIVE_API_SECRET
        : process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET || process.env.ALPACA_PAPER_API_SECRET)
      || "";

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API credentials are missing." },
        { status: 200 }
      );
    }

    const hasQty = qty && parseFloat(qty) > 0;
    const hasNotional = notional && parseFloat(notional) > 0;

    if (!symbol || (!hasQty && !hasNotional) || !["buy", "sell"].includes(side)) {
      return NextResponse.json(
        { error: "Invalid trading parameters. Verify symbol, Quantity/USD, and Action." },
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

    const symbolUpper = symbol.toUpperCase();
    const payload: any = {
      symbol: symbolUpper,
      side: side,
      type: "market",
      time_in_force: "day",
    };

    if (hasNotional) {
      payload.notional = notional.toString();
    } else {
      payload.qty = qty.toString();
    }

    const etNow = getEtDate();
    const regularHours = isRegularUsSession(etNow);
    const extendedHours = isExtendedUsSession(etNow);
    const canUseExtendedEquityPath =
      !isCryptoSymbol(symbolUpper) &&
      !hasNotional &&
      hasQty &&
      !regularHours &&
      extendedHours &&
      Number.isFinite(parseFloat(String(estimatedPrice))) &&
      parseFloat(String(estimatedPrice)) > 0;

    if (canUseExtendedEquityPath) {
      const px = parseFloat(String(estimatedPrice));
      const adjustedLimit = side === "buy"
        ? px * 1.02
        : px * 0.98;

      payload.type = "limit";
      payload.limit_price = adjustedLimit.toFixed(2);
      payload.time_in_force = "day";
      payload.extended_hours = true;
    }

    let orderRes: Response;
    try {
      orderRes = await fetchWithTimeout(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      const errMsg = error?.name === "AbortError"
        ? `Alpaca request timed out after ${FETCH_TIMEOUT_MS}ms.`
        : error?.message || "Failed to reach Alpaca order endpoint.";
      console.error("Alpaca order fetch error:", errMsg);
      return NextResponse.json(
        { error: `Alpaca order proxy error: ${errMsg}` },
        { status: 200 }
      );
    }

    if (!orderRes.ok) {
      const status = orderRes.status;
      const errorText = await orderRes.text();
      let parsedErr = null;
      try {
        parsedErr = JSON.parse(errorText);
      } catch (e) {
        parsedErr = null;
      }
      const message = parsedErr?.message || errorText || "Alpaca rejected order.";
      let guidance = "";
      if (status === 401) {
        guidance = " This looks like a 401 Unauthorized from Alpaca — confirm you are using PAPER keys when `isPaper:true` or LIVE keys when `isPaper:false`. Add ALPACA_PAPER_API_KEY/ALPACA_PAPER_API_SECRET for paper testing or set `isPaper:false` to use live keys.";
      }
      return NextResponse.json(
        { error: `Alpaca rejection: ${message}${guidance}` },
        { status: 200 }
      );
    }

    const orderResponseData = await orderRes.json();
    return NextResponse.json({
      ...orderResponseData,
      submission_meta: {
        submitted_type: payload.type,
        submitted_tif: payload.time_in_force,
        submitted_extended_hours: !!payload.extended_hours,
        submitted_limit_price: payload.limit_price || null,
        server_path: canUseExtendedEquityPath ? "extended-hours-limit" : "default-market",
      },
    });
  } catch (error: any) {
    console.error("Alpaca Order Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal transmission failure to Alpaca broker." },
      { status: 200 }
    );
  }
}
