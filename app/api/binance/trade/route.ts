import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
const MAX_CRYPTO_BUY_NOTIONAL_USD = 100;

function sign(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

function floorToStep(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function getQtyDecimals(symbol: string) {
  // Conservative defaults for common perpetual pairs.
  if (symbol.startsWith("BTC") || symbol.startsWith("ETH")) return 3;
  return 2;
}

async function safeParse(req: Request) {
  try {
    const txt = await req.text();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch (e) {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const body: any = await safeParse(req);

    const apiKey =
      process.env.BINANCE_LIVE_API_KEY ||
      process.env.BINANCE_KEY ||
      process.env.EXCH_BINANCE_KEY ||
      body.apiKey;
    const apiSecret =
      process.env.BINANCE_LIVE_API_SECRET ||
      process.env.BINANCE_SECRET ||
      process.env.EXCH_BINANCE_SECRET ||
      body.apiSecret;
    const isLive = body.isLive === true || body.isLive === "true";

    // Expected payload for live order: { symbol, side: 'BUY'|'SELL', type?: 'MARKET'|'LIMIT', quantity }
    let symbol = (body.symbol || body.ticker || "").toUpperCase();
    const side = (body.side || "BUY").toUpperCase();
    const type = (body.type || "MARKET").toUpperCase();
    const quantity = body.quantity || body.qty || body.amount;
    const requestedQty = parseFloat(String(quantity || 0));

    if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 200 });
    if (!quantity) return NextResponse.json({ error: "Missing quantity" }, { status: 200 });
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 200 });
    }

    // Normalize symbol: convert ETHUSD → ETHUSDT for Binance Futures
    if (symbol.endsWith("USD") && !symbol.endsWith("USDT")) {
      symbol = symbol.slice(0, -3) + "USDT";
    }

    if (!isLive) {
      // Simulator: return a mocked filled order record
      const fake = {
        symbol,
        side,
        type,
        origQty: quantity,
        executedQty: quantity,
        status: "FILLED",
        price: body.price || null,
        clientOrderId: `sim-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        fills: [],
      };
      return NextResponse.json({ order: fake });
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "BINANCE API credentials missing on server." }, { status: 200 });
    }

    // Prefer frontend-provided funding snapshot to avoid duplicate endpoint probing per order.
    // Fall back to preferred-usdt endpoint when the client does not send a balance hint.
    const BASE = process.env.BASE_URL || "http://localhost:3000";
    const getPreferredFunding = async (): Promise<{ usdt: number; source: "futures" | "spot" | "none" }> => {
      const hintedUsdt = parseFloat(String(body?.preferredUsdt ?? "0"));
      const hintedSourceRaw = String(body?.preferredSource || "").toLowerCase();
      const hintedSource: "futures" | "spot" | "none" = hintedSourceRaw === "futures"
        ? "futures"
        : hintedSourceRaw === "spot"
          ? "spot"
          : "none";
      if (Number.isFinite(hintedUsdt) && hintedUsdt > 0 && hintedSource !== "none") {
        return { usdt: hintedUsdt, source: hintedSource };
      }

      try {
        const res = await fetch(`${BASE}/api/binance/preferred-usdt`, { cache: "no-store" });
        const txt = await res.text();
        const d = JSON.parse(txt || "{}");
        const usdt = parseFloat(String(d?.usdt || 0)) || 0;
        const sourceRaw = String(d?.source || "none").toLowerCase();
        const source: "futures" | "spot" | "none" = sourceRaw === "futures"
          ? "futures"
          : sourceRaw === "spot"
            ? "spot"
            : "none";
        return { usdt, source };
      } catch (e) {
        return { usdt: 0, source: "none" };
      }
    };

    // Build parameters for MARKET order on FUTURES: symbol, side, type=MARKET, quantity, timestamp
    // Server-side buying-power enforcement: fetch preferred USDT and current futures price to estimate cost
    const preferred = await getPreferredFunding();
    const preferredUsdt = preferred.usdt;
    const preferredSource = preferred.source === "futures" ? "futures" : "none";
    const executionVenue: "futures" = "futures";
    
    if (!preferredUsdt || preferredUsdt <= 0 || preferredSource !== "futures") {
      return NextResponse.json({ error: `Binance futures funding unavailable. Live futures USDT required. preferred source=${preferred.source}, preferred balance=${preferredUsdt}` }, { status: 200 });
    }

    let finalQty = requestedQty;
    if (side === 'BUY') {
      try {
        const priceUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`;
        const priceRes = await fetch(priceUrl);
        const priceTxt = await priceRes.text();
        const priceObj = JSON.parse(priceTxt || '{}');
        const lastPrice = parseFloat(priceObj.lastPrice || priceObj.markPrice || priceObj.price || '0');
        const cost = lastPrice * requestedQty;
        const budgetCap = Math.min(preferredUsdt * 0.9, MAX_CRYPTO_BUY_NOTIONAL_USD);
        if (!isNaN(cost) && cost > budgetCap) {
          const qtyDecimals = getQtyDecimals(symbol);
          const resizedQty = floorToStep(budgetCap / Math.max(lastPrice, 0.0000001), qtyDecimals);
          if (!Number.isFinite(resizedQty) || resizedQty <= 0) {
            return NextResponse.json({ error: `BUY blocked. Budget cap is ${budgetCap.toFixed(2)} USDT (preferred=${preferredUsdt.toFixed(2)}, hard cap=${MAX_CRYPTO_BUY_NOTIONAL_USD}). Requested ~${cost.toFixed(2)}.` }, { status: 200 });
          }
          finalQty = resizedQty;
          console.warn(`⚠️ Auto-resized ${symbol} BUY from ${requestedQty} to ${finalQty} based on budget cap ${budgetCap.toFixed(2)} (preferred USDT ${preferredUsdt})`);
        }
      } catch (e) {
        // ignore price fetch error and continue — Binance will reject if insufficient
      }
    }

    const params: any = { symbol, side, type };
    if (type === "MARKET") {
      // Binance expects 'quantity' as base-asset amount for both spot/futures market orders.
      params.quantity = finalQty;
    } else if (type === "LIMIT") {
      params.timeInForce = body.timeInForce || "GTC";
      params.price = body.price;
      params.quantity = finalQty;
    }

    params.timestamp = Date.now();

    const qs = new URLSearchParams();
    Object.keys(params).forEach((k) => qs.set(k, String(params[k])));
    const queryString = qs.toString();
    const signature = sign(queryString, apiSecret);

    const orderUrl = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;
    const res = await fetch(orderUrl, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch (e) { return NextResponse.json({ error: `Binance returned non-JSON: ${txt.slice(0,200)}` }, { status: 200 }); }

    if (!res.ok) {
      return NextResponse.json({ error: data?.msg || 'Binance order rejected', raw: data }, { status: 200 });
    }

    return NextResponse.json({
      order: data,
      submission_meta: {
        requestedQty,
        submittedQty: finalQty,
        autoResized: finalQty !== requestedQty,
        balanceSource: "futures",
        executionVenue: "futures",
      }
    });
  } catch (err: any) {
    console.error('Binance trade proxy error', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 200 });
  }
}
