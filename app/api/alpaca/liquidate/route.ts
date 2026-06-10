import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, apiSecret, isPaper, symbol } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API credentials are missing." },
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

    const symbolClean = typeof symbol === "string" ? symbol.toUpperCase().trim() : "";
    const isSingleClose = !!symbolClean;

    const closeUrl = isSingleClose
      ? `${baseUrl}/v2/positions/${encodeURIComponent(symbolClean)}`
      : `${baseUrl}/v2/positions`;

    const closeRes = await fetch(closeUrl, {
      method: "DELETE",
      headers,
    });

    if (!closeRes.ok) {
      const errorText = await closeRes.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errorText);
      } catch {
        parsedErr = null;
      }
      const message = parsedErr?.message || errorText || "Alpaca rejected liquidation request.";
      return NextResponse.json(
        { error: `Alpaca liquidation rejection: ${message}` },
        { status: 200 }
      );
    }

    let payload: any = null;
    try {
      payload = await closeRes.json();
    } catch {
      payload = null;
    }

    return NextResponse.json({
      ok: true,
      mode: isSingleClose ? "single" : "portfolio",
      symbol: isSingleClose ? symbolClean : null,
      brokerResponse: payload,
    });
  } catch (error: any) {
    console.error("Alpaca Liquidate Proxy Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal transmission failure to Alpaca liquidation endpoint." },
      { status: 200 }
    );
  }
}
