import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CachedQuote = {
  price: number;
  source: string;
  cachedAt: number;
};

const quoteCache = new Map<string, CachedQuote>();
const QUOTE_TTL_MS = 3000;
const QUOTE_STALE_MAX_MS = 20000;
const FETCH_TIMEOUT_MS = 2500;

async function fetchJsonWithTimeout(url: string, headers: Record<string, string>, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function resolveAlpacaCredentials() {
  const apiKey =
    process.env.ALPACA_LIVE_API_KEY ||
    process.env.ALPACA_API_KEY ||
    process.env.ALPACA_KEY ||
    process.env.ALPACA_PAPER_API_KEY ||
    process.env.ALPACA_PAPER_KEY ||
    "";
  const apiSecret =
    process.env.ALPACA_LIVE_API_SECRET ||
    process.env.ALPACA_API_SECRET ||
    process.env.ALPACA_SECRET ||
    process.env.ALPACA_PAPER_API_SECRET ||
    process.env.ALPACA_PAPER_SECRET ||
    "";

  return { apiKey, apiSecret };
}

function quoteToMid(quote: any): number | null {
  const ask = Number(quote?.ap);
  const bid = Number(quote?.bp);
  if (Number.isFinite(ask) && Number.isFinite(bid) && ask > 0 && bid > 0) {
    return (ask + bid) / 2;
  }
  if (Number.isFinite(ask) && ask > 0) return ask;
  if (Number.isFinite(bid) && bid > 0) return bid;
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbolRaw = (searchParams.get("symbol") || "").trim().toUpperCase();

    if (!symbolRaw) {
      return NextResponse.json({ error: "Missing symbol query parameter." }, { status: 200 });
    }

    const now = Date.now();
    const cached = quoteCache.get(symbolRaw);
    if (cached && now - cached.cachedAt <= QUOTE_TTL_MS) {
      return NextResponse.json({ symbol: symbolRaw, price: cached.price, source: `${cached.source}-cache` });
    }

    const { apiKey, apiSecret } = resolveAlpacaCredentials();

    const headers = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
      "User-Agent": "Alpaca-Margin-Terminal/1.0",
    };

    const isCryptoUsdPair = symbolRaw.endsWith("USD") && symbolRaw.length > 3;

    if (isCryptoUsdPair) {
      const base = symbolRaw.slice(0, -3);
      const pair = `${base}/USD`;

      const tradeData = await fetchJsonWithTimeout(
        `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(pair)}`,
        headers
      );

      if (tradeData) {
        const tradePrice = Number(tradeData?.trades?.[pair]?.p);
        if (Number.isFinite(tradePrice) && tradePrice > 0) {
          quoteCache.set(symbolRaw, { price: tradePrice, source: "alpaca-crypto-trade", cachedAt: now });
          return NextResponse.json({ symbol: symbolRaw, price: tradePrice, source: "alpaca-crypto-trade" });
        }
      }

      const quoteData = await fetchJsonWithTimeout(
        `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(pair)}`,
        headers
      );
      if (quoteData) {
        const mid = quoteToMid(quoteData?.quotes?.[pair]);
        if (Number.isFinite(mid) && (mid as number) > 0) {
          quoteCache.set(symbolRaw, { price: mid as number, source: "alpaca-crypto-quote", cachedAt: now });
          return NextResponse.json({ symbol: symbolRaw, price: mid, source: "alpaca-crypto-quote" });
        }
      }

      if (cached && now - cached.cachedAt <= QUOTE_STALE_MAX_MS) {
        return NextResponse.json({ symbol: symbolRaw, price: cached.price, source: `${cached.source}-stale` });
      }

      return NextResponse.json({ error: `No live quote available for ${symbolRaw}.` }, { status: 200 });
    }

    // Try Alpaca stock trade/quote endpoints if we have credentials
    if (apiKey && apiSecret) {
      const headers = {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
        "Content-Type": "application/json",
        "User-Agent": "Alpaca-Margin-Terminal/1.0",
      };

      const stockTradeData = await fetchJsonWithTimeout(
        `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbolRaw)}/trades/latest`,
        headers
      );
      if (stockTradeData) {
        const tradePrice = Number(stockTradeData?.trade?.p);
        if (Number.isFinite(tradePrice) && tradePrice > 0) {
          quoteCache.set(symbolRaw, { price: tradePrice, source: "alpaca-stock-trade", cachedAt: now });
          return NextResponse.json({ symbol: symbolRaw, price: tradePrice, source: "alpaca-stock-trade" });
        }
      }

      const stockQuoteData = await fetchJsonWithTimeout(
        `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbolRaw)}/quotes/latest`,
        headers
      );
      if (stockQuoteData) {
        const mid = quoteToMid(stockQuoteData?.quote);
        if (Number.isFinite(mid) && (mid as number) > 0) {
          quoteCache.set(symbolRaw, { price: mid as number, source: "alpaca-stock-quote", cachedAt: now });
          return NextResponse.json({ symbol: symbolRaw, price: mid, source: "alpaca-stock-quote" });
        }
      }
    }

    // If Alpaca credentials are missing or Alpaca endpoints failed, try public Yahoo Finance as a fallback.
    try {
      const yahooData = await fetchJsonWithTimeout(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolRaw)}`,
        {}
      );
      const yq = yahooData?.quoteResponse?.result?.[0];
      const yahooPrice = Number(yq?.regularMarketPrice ?? yq?.ask ?? yq?.bid ?? yq?.preMarketPrice ?? yq?.postMarketPrice);
      if (Number.isFinite(yahooPrice) && yahooPrice > 0) {
        quoteCache.set(symbolRaw, { price: yahooPrice, source: "yahoo", cachedAt: now });
        return NextResponse.json({ symbol: symbolRaw, price: yahooPrice, source: "yahoo" });
      }
    } catch (e) {
      // swallow and continue to stale/cached handling below
    }

    if (cached && now - cached.cachedAt <= QUOTE_STALE_MAX_MS) {
      return NextResponse.json({ symbol: symbolRaw, price: cached.price, source: `${cached.source}-stale` });
    }

    return NextResponse.json({ error: `No live quote available for ${symbolRaw}.` }, { status: 200 });
  } catch (error: any) {
    const { searchParams } = new URL(req.url);
    const symbolRaw = (searchParams.get("symbol") || "").trim().toUpperCase();
    const cached = quoteCache.get(symbolRaw);
    if (cached && Date.now() - cached.cachedAt <= QUOTE_STALE_MAX_MS) {
      return NextResponse.json({ symbol: symbolRaw, price: cached.price, source: `${cached.source}-stale` });
    }

    // Avoid noisy stack traces during intermittent upstream quote timeouts.
    console.warn("Alpaca Quote Error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Internal server error while fetching Alpaca quote." },
      { status: 200 }
    );
  }
}
