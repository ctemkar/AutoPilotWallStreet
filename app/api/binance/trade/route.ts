import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function sign(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
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

    const apiKey = process.env.BINANCE_LIVE_API_KEY || body.apiKey;
    const apiSecret = process.env.BINANCE_LIVE_API_SECRET || body.apiSecret;
    const isLive = body.isLive === true || body.isLive === "true";

    // Expected payload for live order: { symbol, side: 'BUY'|'SELL', type?: 'MARKET'|'LIMIT', quantity }
    const symbol = (body.symbol || body.ticker || "").toUpperCase();
    const side = (body.side || "BUY").toUpperCase();
    const type = (body.type || "MARKET").toUpperCase();
    const quantity = body.quantity || body.qty || body.amount;

    if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 200 });
    if (!quantity) return NextResponse.json({ error: "Missing quantity" }, { status: 200 });

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

    // Prefer futures USDT balance when deciding buying power. Attempt to query futures balance; if it fails, fall back to spot.
    async function getPreferredUsdt() {
      try {
        const res = await fetch(`${process.env.BASE_URL || ''}/api/binance/futures/account`);
        const txt = await res.text();
        const d = JSON.parse(txt || '{}');
        if (d && d.usdt && (d.usdt.free || d.usdt.balance)) {
          const val = parseFloat(d.usdt.free || d.usdt.balance || '0');
          if (!isNaN(val)) return val;
        }
      } catch (e) {
        // ignore and fallback
      }

      try {
        const res2 = await fetch(`${process.env.BASE_URL || ''}/api/binance/account`);
        const txt2 = await res2.text();
        const d2 = JSON.parse(txt2 || '{}');
        if (d2 && d2.account && Array.isArray(d2.account.balances)) {
          const usdt = d2.account.balances.find((b: any) => b.asset === 'USDT' || b.asset === 'USD');
          if (usdt) return parseFloat(usdt.free || usdt.balance || '0');
        }
      } catch (e) {
        // ignore
      }
      return 0;
    }

    // Build parameters for MARKET order on Spot: symbol, side, type=MARKET, quantity, timestamp
    // Server-side buying-power enforcement: fetch preferred USDT and current market price to estimate cost
    const preferredUsdt = await getPreferredUsdt();
    if (side === 'BUY') {
      // If no preferred USDT is available at all, block immediate live BUYs to avoid accidental orders.
      if (!preferredUsdt || preferredUsdt <= 0) {
        return NextResponse.json({ error: `Insufficient USDT available (preferred balance=${preferredUsdt}). Refusing to place live BUY order.` }, { status: 200 });
      }
      try {
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const priceTxt = await priceRes.text();
        const priceObj = JSON.parse(priceTxt || '{}');
        const lastPrice = parseFloat(priceObj.price || priceObj.lastPrice || '0');
        const cost = lastPrice * parseFloat(String(quantity));
        if (!isNaN(cost) && cost > preferredUsdt) {
          return NextResponse.json({ error: `Insufficient preferred USDT balance (${preferredUsdt}) for requested BUY (~${cost.toFixed(2)} required).` }, { status: 200 });
        }
      } catch (e) {
        // ignore price fetch error and continue — Binance will reject if insufficient
      }
    }

    const params: any = { symbol, side, type };
    if (type === "MARKET") {
      // Binance expects 'quantity' for base asset amount
      params.quantity = quantity;
    } else if (type === "LIMIT") {
      params.timeInForce = body.timeInForce || "GTC";
      params.price = body.price;
      params.quantity = quantity;
    }

    params.timestamp = Date.now();

    const qs = new URLSearchParams();
    Object.keys(params).forEach((k) => qs.set(k, String(params[k])));
    const queryString = qs.toString();
    const signature = sign(queryString, apiSecret);

    const res = await fetch(`https://api.binance.com/api/v3/order?${queryString}&signature=${signature}`, {
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

    return NextResponse.json({ order: data });
  } catch (err: any) {
    console.error('Binance trade proxy error', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 200 });
  }
}
