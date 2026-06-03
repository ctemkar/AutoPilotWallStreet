import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, apiSecret, isPaper, symbol, qty, side } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API credentials are missing." },
        { status: 200 }
      );
    }

    if (!symbol || !qty || parseFloat(qty) <= 0 || !["buy", "sell"].includes(side)) {
      return NextResponse.json(
        { error: "Invalid trading parameters. Verify symbol, Quantity, and Action." },
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

    const payload = {
      symbol: symbol.toUpperCase(),
      qty: qty.toString(), // Convert to string in order to support fractional quantities correctly
      side: side,
      type: "market",
      time_in_force: "day",
    };

    const orderRes = await fetch(`${baseUrl}/v2/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!orderRes.ok) {
      const errorText = await orderRes.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errorText);
      } catch (e) {
        parsedErr = null;
      }
      const message = parsedErr?.message || errorText || "Alpaca rejected order.";
      return NextResponse.json(
        { error: `Alpaca rejection: ${message}` },
        { status: 200 }
      );
    }

    const orderResponseData = await orderRes.json();
    return NextResponse.json(orderResponseData);
  } catch (error: any) {
    console.error("Alpaca Order Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal transmission failure to Alpaca broker." },
      { status: 200 }
    );
  }
}
