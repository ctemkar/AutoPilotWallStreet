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
    const { isPaper, orderId } = body;
    const apiKey = body?.apiKey
      || (isPaper
        ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_KEY || process.env.ALPACA_LIVE_API_KEY
        : process.env.ALPACA_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY)
      || "";
    const apiSecret = body?.apiSecret
      || (isPaper
        ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET || process.env.ALPACA_LIVE_API_SECRET
        : process.env.ALPACA_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET)
      || "";

    if (!apiKey || !apiSecret || !orderId) {
      return NextResponse.json(
        { error: "Missing Alpaca credentials or order ID." },
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

    let cancelRes: Response;
    try {
      cancelRes = await fetchWithTimeout(`${baseUrl}/v2/orders/${encodeURIComponent(String(orderId))}`, {
        method: "DELETE",
        headers,
      });
    } catch (error: any) {
      const errMsg = error?.name === "AbortError"
        ? `Alpaca request timed out after ${FETCH_TIMEOUT_MS}ms.`
        : error?.message || "Failed to reach Alpaca cancel endpoint.";
      console.error("Alpaca order cancel fetch error:", errMsg);
      return NextResponse.json(
        { error: `Alpaca order cancel proxy error: ${errMsg}` },
        { status: 200 }
      );
    }

    if (!cancelRes.ok) {
      const errorText = await cancelRes.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errorText);
      } catch {
        parsedErr = null;
      }
      const message = parsedErr?.message || errorText || "Alpaca rejected order cancellation.";
      return NextResponse.json(
        { error: `Alpaca cancellation rejection: ${message}` },
        { status: 200 }
      );
    }

    let payload: any = null;
    try {
      payload = await cancelRes.json();
    } catch {
      payload = null;
    }

    return NextResponse.json({
      ok: true,
      orderId: String(orderId),
      status: payload?.status || "CANCELED",
      brokerResponse: payload,
    });
  } catch (error: any) {
    console.error("Alpaca Order Cancel Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal transmission failure to Alpaca order cancellation endpoint." },
      { status: 200 }
    );
  }
}
