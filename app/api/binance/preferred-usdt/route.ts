import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function tryFetchJson(path: string) {
  try {
    const res = await fetch(path);
    const txt = await res.text();
    return JSON.parse(txt || '{}');
  } catch (e) {
    return null;
  }
}

export async function GET() {
  try {
    const base = process.env.BASE_URL || '';
    // Try futures first
    const fut = await tryFetchJson(`${base}/api/binance/futures/account`);
    if (fut && fut.usdt && (fut.usdt.free || fut.usdt.balance)) {
      const val = parseFloat(fut.usdt.free || fut.usdt.balance || '0');
      return NextResponse.json({ usdt: val, source: 'futures' });
    }

    // Fallback to spot
    const spot = await tryFetchJson(`${base}/api/binance/account`);
    if (spot && spot.account && Array.isArray(spot.account.balances)) {
      const usdt = spot.account.balances.find((b: any) => b.asset === 'USDT' || b.asset === 'USD');
      if (usdt) {
        const val = parseFloat(usdt.free || usdt.balance || '0');
        return NextResponse.json({ usdt: val, source: 'spot' });
      }
    }

    return NextResponse.json({ usdt: 0, source: 'none' });
  } catch (e: any) {
    return NextResponse.json({ usdt: 0, source: 'error', error: e?.message || String(e) });
  }
}
