import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Safety: only expose presence (not values) and only in non-production environments
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 403 });
  }

  const keys = [
    "ALPACA_LIVE_API_KEY",
    "ALPACA_LIVE_API_SECRET",
    "ALPACA_PAPER_API_KEY",
    "ALPACA_PAPER_API_SECRET",
    "ALPACA_API_KEY",
    "ALPACA_API_SECRET",
    "ALPACA_KEY",
    "ALPACA_SECRET",
  ];

  const present: Record<string, boolean> = {};
  keys.forEach((k) => (present[k] = !!process.env[k]));

  return NextResponse.json({
    envKeysPresent: present,
    note: "This endpoint only reports which ALPACA_* env vars exist on the server (no secrets returned).",
  });
}
