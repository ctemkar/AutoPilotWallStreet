import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Prefer explicit request keys, but fallback to server environment (.env.local)
    const apiKey = body?.apiKey || process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_API_KEY || process.env.ALPACA_PAPER_API_KEY || "";
    const apiSecret = body?.apiSecret || process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_API_SECRET || process.env.ALPACA_PAPER_API_SECRET || "";
    const { isPaper } = body || {};

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API Key or Secret missing on server. Add ALPACA_* keys to .env.local and restart the dev server." },
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

    // Fetch account info and positions concurrently
    const [accountRes, positionsRes] = await Promise.all([
      fetch(`${baseUrl}/v2/account`, { headers, cache: "no-store" }),
      fetch(`${baseUrl}/v2/positions`, { headers, cache: "no-store" }),
    ]);

    if (!accountRes.ok) {
      const errorText = await accountRes.text();
      return NextResponse.json(
        { error: `Alpaca authenticating error: ${errorText || accountRes.statusText}` },
        { status: 200 }
      );
    }

    const accountData = await accountRes.json();
    let positionsData = [];
    if (positionsRes.ok) {
      positionsData = await positionsRes.json();
    } else {
      console.error("Alpaca positions fetch failed, defaulting to empty");
    }

    return NextResponse.json({
      account: {
        // Expose last_equity so front-end can compute day change (Live Day P&L)
        last_equity: accountData.last_equity,
        account_number: accountData.account_number,
        cash: accountData.cash,
        equity: accountData.equity,
        buying_power: accountData.buying_power,
        portfolio_value: accountData.portfolio_value,
        regt_buying_power: accountData.regt_buying_power,
        daytrading_buying_power: accountData.daytrading_buying_power,
        maintenance_margin: accountData.maintenance_margin,
        initial_margin: accountData.initial_margin,
        long_market_value: accountData.long_market_value,
        short_market_value: accountData.short_market_value,
        shorting_enabled: accountData.shorting_enabled,
      },
      positions: positionsData.map((pos: any) => ({
        symbol: pos.symbol,
        qty: parseFloat(pos.qty),
        side: pos.side,
        avg_entry_price: parseFloat(pos.avg_entry_price),
        current_price: parseFloat(pos.current_price),
        market_value: parseFloat(pos.market_value),
        unrealized_pl: parseFloat(pos.unrealized_pl),
        unrealized_plpc: parseFloat(pos.unrealized_plpc),
        maintenance_margin_rate: 0.30, // Default fallback margin rate for standard risk calculation
      })),
    });
  } catch (error: any) {
    console.error("Alpaca Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error connecting to Alpaca." },
      { status: 200 }
    );
  }
}
