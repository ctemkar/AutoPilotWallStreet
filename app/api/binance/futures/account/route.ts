import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function sign(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.BINANCE_LIVE_API_KEY;
    const apiSecret = process.env.BINANCE_LIVE_API_SECRET;
    if (!apiKey || !apiSecret) {
      console.error('🔴 BINANCE API credentials missing');
      return NextResponse.json({ error: "BINANCE API credentials missing on server." }, { status: 200 });
    }

    const params: any = { timestamp: Date.now(), recvWindow: 5000 };
    const qs = new URLSearchParams();
    Object.keys(params).forEach((k) => qs.set(k, String(params[k])));
    const queryString = qs.toString();
    const signature = sign(queryString, apiSecret);

    const url = `https://fapi.binance.com/fapi/v2/balance?${queryString}&signature=${signature}`;
    console.log('📡 Fetching Binance futures account from:', url.split('?')[0]);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey },
      cache: 'no-store'
    });

    const txt = await res.text();
    console.log('📡 Binance response status:', res.status);
    console.log('📡 Binance response (first 500 chars):', txt.slice(0, 500));
    
    let data: any = null;
    try { data = JSON.parse(txt); } catch (e) { 
      console.error('🔴 Failed to parse Binance response:', e);
      return NextResponse.json({ error: `Binance futures returned non-JSON: ${txt.slice(0,200)}` }, { status: 200 }); 
    }

    if (!res.ok) {
      console.error('🔴 Binance API error:', data?.msg || 'unknown');
      return NextResponse.json({ error: data?.msg || 'Binance futures query rejected', raw: data }, { status: 200 });
    }

    // find USDT balance if present
    const usdt = Array.isArray(data) ? data.find((b: any) => b.asset === 'USDT' || b.asset === 'USD') : null;
    console.log('✅ USDT balance found:', usdt);
    return NextResponse.json({ balances: data, usdt });
  } catch (err: any) {
    console.error('🔴 Binance futures proxy error', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 200 });
  }
}
