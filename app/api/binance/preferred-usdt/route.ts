import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const FUTURES_AUTH_COOLDOWN_MS = 10 * 60 * 1000;
let futuresAuthBlockedUntil = 0;

function sign(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

function getBinanceCreds() {
  const apiKey =
    process.env.BINANCE_LIVE_API_KEY ||
    process.env.BINANCE_KEY ||
    process.env.EXCH_BINANCE_KEY ||
    "";
  const apiSecret =
    process.env.BINANCE_LIVE_API_SECRET ||
    process.env.BINANCE_SECRET ||
    process.env.EXCH_BINANCE_SECRET ||
    "";
  return { apiKey, apiSecret };
}

async function signedGetJson(baseUrl: string, path: string, apiKey: string, apiSecret: string) {
  const params: any = { timestamp: Date.now(), recvWindow: 5000 };
  const qs = new URLSearchParams();
  Object.keys(params).forEach((k) => qs.set(k, String(params[k])));
  const queryString = qs.toString();
  const signature = sign(queryString, apiSecret);
  const url = `${baseUrl}${path}?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey },
    cache: "no-store",
  });
  const txt = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(txt || "{}");
  } catch (e) {
    data = { error: `non-json response: ${txt.slice(0, 120)}` };
  }
  return { ok: res.ok, status: res.status, data };
}

function getUsdtFromSpotAccount(data: any) {
  if (!data || !Array.isArray(data?.balances)) return 0;
  const usdt = data.balances.find((b: any) => b.asset === "USDT" || b.asset === "USD");
  if (!usdt) return 0;
  const free = parseFloat(usdt.free || "0");
  const locked = parseFloat(usdt.locked || "0");
  const total = free + locked;
  return Number.isFinite(total) ? total : 0;
}

function getUsdtFromFuturesBalances(data: any) {
  if (!Array.isArray(data)) return 0;
  const usdt = data.find((b: any) => b.asset === "USDT" || b.asset === "USD");
  if (!usdt) return 0;
  const free = parseFloat(usdt.availableBalance || usdt.balance || usdt.crossWalletBalance || "0");
  return Number.isFinite(free) ? free : 0;
}

export async function GET() {
  try {
    const { apiKey, apiSecret } = getBinanceCreds();
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ usdt: 0, source: "none", reason: "missing_credentials" });
    }

    let futuresSource = "futures";
    const now = Date.now();
    if (now >= futuresAuthBlockedUntil) {
      const fut = await signedGetJson("https://fapi.binance.com", "/fapi/v2/balance", apiKey, apiSecret);
      const futMsg = String(fut?.data?.msg || "").toLowerCase();
      const isAuthBlocked = fut?.data?.code === -2015 || futMsg.includes("invalid api-key") || futMsg.includes("permissions for action");
      if (isAuthBlocked) {
        futuresAuthBlockedUntil = now + FUTURES_AUTH_COOLDOWN_MS;
        futuresSource = "futures_auth_blocked";
      } else if (fut.ok) {
        const futUsdt = getUsdtFromFuturesBalances(fut.data);
        if (futUsdt > 0) {
          return NextResponse.json({ usdt: futUsdt, source: "futures" });
        }
      }
    } else {
      futuresSource = "futures_auth_cooldown";
    }

    const spot = await signedGetJson("https://api.binance.com", "/api/v3/account", apiKey, apiSecret);
    if (spot.ok) {
      const spotUsdt = getUsdtFromSpotAccount(spot.data);
      if (spotUsdt > 0) {
        return NextResponse.json({ usdt: spotUsdt, source: "spot" });
      }
    }

    return NextResponse.json({ usdt: 0, source: "none", futuresSource });
  } catch (e: any) {
    return NextResponse.json({ usdt: 0, source: "error", error: e?.message || String(e) });
  }
}
