import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
const FETCH_TIMEOUT_MS = 30000;

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
      ? process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_LIVE_API_KEY
      : process.env.ALPACA_KEY || process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_PAPER_KEY)
    || "";
  const apiSecret = body?.apiSecret
    || (isPaper
      ? process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_LIVE_API_SECRET
      : process.env.ALPACA_SECRET || process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_PAPER_SECRET)
    || "";
  return { apiKey, apiSecret, isPaper: !!isPaper };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { apiKey, apiSecret, isPaper } = resolveAlpacaCredentials(body as any);
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API credentials missing on server. Set Alpaca env vars." }, { status: 200 });
    }

    const baseUrl = isPaper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
    const headers = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
      "User-Agent": "Alpaca-Margin-Terminal/1.0",
    };

    // Fetch recent closed orders (limit to 500), then filter BUY+FILLED
    const url = `${baseUrl}/v2/orders?status=closed&limit=500`;
    const resp = await fetchWithTimeout(url, { method: 'GET', headers, cache: 'no-store' });
    if (!resp.ok) {
      const err = await resp.text();
      return NextResponse.json({ error: `Alpaca orders fetch failed: ${err}` }, { status: 200 });
    }

    const orders = await resp.json();
    if (!Array.isArray(orders)) return NextResponse.json({ error: 'No orders returned' }, { status: 200 });

    const matched = orders.filter((o: any) => String(o.side || '').toUpperCase() === 'BUY' && String(o.status || '').toUpperCase() === 'FILLED');

    const dir = path.resolve(process.cwd(), 'OPERATIONAL');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'buy_filled_alpaca.jsonl');

    let appended = 0;
    for (const m of matched) {
      try {
        fs.appendFileSync(file, JSON.stringify({ timestamp: Date.now(), order: m }) + '\n');
        appended += 1;
      } catch (e) {
        // continue
      }
    }

    return NextResponse.json({ ok: true, matched: matched.length, appended }, { status: 200 });
  } catch (e: any) {
    console.error('fetch-filled proxy error', e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 200 });
  }
}
