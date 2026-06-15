import { NextResponse } from "next/server";
import { buildBinanceSignedQuery, isBinanceTimestampError } from "../../_lib/binanceSignedQuery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey =
      process.env.BINANCE_LIVE_API_KEY ||
      process.env.BINANCE_KEY ||
      process.env.EXCH_BINANCE_KEY;
    const apiSecret =
      process.env.BINANCE_LIVE_API_SECRET ||
      process.env.BINANCE_SECRET ||
      process.env.EXCH_BINANCE_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "BINANCE API credentials missing on server." }, { status: 200 });
    }

    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    let res: Response | null = null;
    let data: any = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { queryString, signature } = await buildBinanceSignedQuery(
        apiSecret,
        {
          incomeType: "REALIZED_PNL",
          startTime: dayStart.getTime(),
          endTime: now,
          limit: 1000,
        },
        { forceTimeSync: attempt > 0 }
      );

      res = await fetch(`https://fapi.binance.com/fapi/v1/income?${queryString}&signature=${signature}`, {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey },
        cache: "no-store",
      });

      const txt = await res.text();
      try {
        data = JSON.parse(txt);
      } catch {
        return NextResponse.json({ error: `Binance futures returned non-JSON: ${txt.slice(0, 200)}` }, { status: 200 });
      }

      if (res.ok) break;
      if (attempt === 0 && isBinanceTimestampError(data?.msg || txt)) continue;
      break;
    }

    if (!res) {
      return NextResponse.json({ error: "Binance realized PnL query failed before request dispatch." }, { status: 200 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: data?.msg || "Binance realized PnL query rejected", raw: data }, { status: 200 });
    }

    const rows = Array.isArray(data) ? data : [];
    const realizedPnlToday = rows.reduce((sum: number, row: any) => sum + Number(row?.income || 0), 0);

    return NextResponse.json({
      realizedPnlToday,
      currency: "USDT",
      rows,
    });
  } catch (err: any) {
    console.error("Binance realized-pnl/today proxy error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 200 });
  }
}
