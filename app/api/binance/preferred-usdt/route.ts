import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function tryFetchJson(path: string) {
  try {
    console.log(`🔗 Fetching: ${path.split('?')[0]}`);
    const res = await fetch(path);
    const txt = await res.text();
    console.log(`📊 Response status: ${res.status}, body (first 300 chars): ${txt.slice(0, 300)}`);
    return JSON.parse(txt || '{}');
  } catch (e) {
    console.error(`❌ Fetch failed: ${e}`);
    return null;
  }
}

export async function GET() {
  try {
    const base = process.env.BASE_URL || 'http://localhost:3000';
    console.log('📡 Attempting to fetch Binance futures balance...');
    const fut = await tryFetchJson(`${base}/api/binance/futures/account`);
    console.log('📦 Futures response:', JSON.stringify(fut).slice(0, 200));
    
    if (fut && fut.usdt && (fut.usdt.free || fut.usdt.balance)) {
      const val = parseFloat(fut.usdt.free || fut.usdt.balance || '0');
      console.log(`✅ Futures USDT: ${val}`);
      return NextResponse.json({ usdt: val, source: 'futures' });
    }
    console.log('📡 Futures failed or empty, trying spot...');
    const spot = await tryFetchJson(`${base}/api/binance/account`);
    console.log('📦 Spot response:', JSON.stringify(spot).slice(0, 200));
    
    if (spot && spot.account && Array.isArray(spot.account.balances)) {
      const usdt = spot.account.balances.find((b: any) => b.asset === 'USDT' || b.asset === 'USD');
      if (usdt) {
        const val = parseFloat(usdt.free || usdt.balance || '0');
        console.log(`✅ Spot USDT: ${val}`);
        return NextResponse.json({ usdt: val, source: 'spot' });
      }
    }
    console.warn('⚠️ No USDT found in any account');
    return NextResponse.json({ usdt: 0, source: 'none' });
  } catch (e: any) {
    console.error('❌ Preferred USDT error:', e);
    return NextResponse.json({ usdt: 0, source: 'error', error: e?.message || String(e) });
  }
}
