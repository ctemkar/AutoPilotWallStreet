import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveAlpacaCredentials(body: any) {
  const { isPaper } = body || {};
  const apiKey = body?.apiKey
    || (isPaper
      ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_LIVE_API_KEY
      : process.env.ALPACA_KEY || process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_PAPER_API_KEY)
    || "";
  const apiSecret = body?.apiSecret
    || (isPaper
      ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_LIVE_API_SECRET
      : process.env.ALPACA_SECRET || process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_PAPER_API_SECRET)
    || "";
  return { apiKey, apiSecret, isPaper: !!isPaper };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body || {};
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "orderId is required." }, { status: 200 });
    }

    const { apiKey, apiSecret, isPaper } = resolveAlpacaCredentials(body);
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing Alpaca credentials on server." }, { status: 200 });
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

    if (orderId === "__all__") {
      const orderRes = await fetchWithTimeout(`${baseUrl}/v2/orders?status=open`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (!orderRes.ok) {
        const errorText = await orderRes.text();
        return NextResponse.json({ error: `Alpaca open orders rejected: ${errorText || orderRes.statusText}` }, { status: 200 });
      }

      const orders = await orderRes.json();
      return NextResponse.json({
        orders: Array.isArray(orders) ? orders.map((order: any) => ({
          id: order.id,
          symbol: order.symbol,
          status: String(order.status || "").toUpperCase(),
          filled_qty: Number.parseFloat(String(order.filled_qty ?? "0")),
          filled_avg_price: Number.parseFloat(String(order.filled_avg_price ?? "0")),
          side: String(order.side || "").toUpperCase(),
          raw: order,
        })) : [],
      });
    }

    const orderRes = await fetchWithTimeout(`${baseUrl}/v2/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!orderRes.ok) {
      const errorText = await orderRes.text();
      return NextResponse.json({ error: `Alpaca order status rejected: ${errorText || orderRes.statusText}` }, { status: 200 });
    }

    const order = await orderRes.json();
    return NextResponse.json({
      id: order.id,
      symbol: order.symbol,
      status: String(order.status || "").toUpperCase(),
      filled_qty: Number.parseFloat(String(order.filled_qty ?? "0")),
      filled_avg_price: Number.parseFloat(String(order.filled_avg_price ?? "0")),
      side: String(order.side || "").toUpperCase(),
      raw: order,
    });
  } catch (error: any) {
    console.error("Alpaca Order Status Proxy Error:", error);
    return NextResponse.json({ error: error?.message || "Internal status proxy error." }, { status: 200 });
  }
}
