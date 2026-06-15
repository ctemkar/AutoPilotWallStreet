import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: "Missing required query param: symbol" }, { status: 200 });
    }

    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "TradeTerminal/1.0" },
    });

    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {
      return NextResponse.json({ error: `Binance returned non-JSON: ${txt.slice(0, 200)}` }, { status: 200 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: data?.msg || "Binance ticker query rejected", raw: data }, { status: 200 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Binance ticker/24hr proxy error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 200 });
  }
}
