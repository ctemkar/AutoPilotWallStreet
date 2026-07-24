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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { isPaper, symbol, qty } = body;

    // resolve credentials from body or env
    let providedKey = body?.apiKey || "";
    let providedSecret = body?.apiSecret || "";
    const looksLikeLive = providedKey.startsWith("AK");
    const looksLikePaper = providedKey.startsWith("PK");
    if (isPaper && looksLikeLive) { providedKey = ""; providedSecret = ""; }
    else if (!isPaper && looksLikePaper) { providedKey = ""; providedSecret = ""; }

    const apiKey = providedKey || (isPaper
      ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY
      : process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_KEY) || "";

    const apiSecret = providedSecret || (isPaper
      ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET
      : process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET) || "";

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API credentials are missing." },
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

    const symbolClean = typeof symbol === "string" ? symbol.toUpperCase().trim() : "";
    const isSingleClose = !!symbolClean;

    let closeUrl = isSingleClose
      ? `${baseUrl}/v2/positions/${encodeURIComponent(symbolClean)}`
      : `${baseUrl}/v2/positions?cancel_orders=true`;

    if (isSingleClose && qty) {
      const q = parseFloat(String(qty));
      if (Number.isFinite(q) && q > 0) {
        closeUrl += `?qty=${q}`;
      }
    }

    let closeRes: Response;
    try {
      closeRes = await fetchWithTimeout(closeUrl, {
        method: "DELETE",
        headers,
      });
    } catch (error: any) {
      const errMsg = error?.name === "AbortError"
        ? `Alpaca request timed out after ${FETCH_TIMEOUT_MS}ms.`
        : error?.message || "Failed to reach Alpaca liquidation endpoint.";
      console.error("Alpaca liquidation fetch error:", errMsg);
      return NextResponse.json(
        { error: `Alpaca liquidation proxy error: ${errMsg}` },
        { status: 200 }
      );
    }

    if (!closeRes.ok) {
      const errorText = await closeRes.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errorText);
      } catch {
        parsedErr = null;
      }
      let message = parsedErr?.message || errorText || "Alpaca rejected liquidation request.";
      if (/insufficient qty available for order/i.test(String(message))) {
        message = "Alpaca cannot cover this short position because no borrowable shares are available right now.";
      }
      return NextResponse.json(
        { error: `Alpaca liquidation rejection: ${message}` },
        { status: 200 }
      );
    }

    let payload: any = null;
    try {
      payload = await closeRes.json();
    } catch {
      payload = null;
    }

    return NextResponse.json({
      ok: true,
      mode: isSingleClose ? "single" : "portfolio",
      symbol: isSingleClose ? symbolClean : null,
      brokerResponse: payload,
    });
  } catch (error: any) {
    console.error("Alpaca Liquidate Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal transmission failure to Alpaca liquidation endpoint." },
      { status: 200 }
    );
  }
}
