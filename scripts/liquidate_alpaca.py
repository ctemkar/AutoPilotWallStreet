#!/usr/bin/env python3
"""
Interactive Alpaca position closer (supports longs and shorts).
- By default tries the local proxy at http://localhost:3005/api/alpaca and falls back
  to direct Alpaca API if `--no-proxy` is passed or proxy is unreachable.
- For each open position the script prints summary and asks for confirmation before
  attempting to close it. Closing is performed immediately after confirming.

Usage:
  python3 scripts/liquidate_alpaca.py            # uses local proxy, interactive
  python3 scripts/liquidate_alpaca.py --no-proxy --paper  # direct to Alpaca paper API

Environment variables (when using direct API):
  ALPACA_PAPER_API_KEY, ALPACA_PAPER_API_SECRET
  ALPACA_LIVE_API_KEY, ALPACA_LIVE_API_SECRET

Note: This script performs destructive actions when you confirm. Do not run against
live accounts unless you intend to close positions.
"""

from __future__ import annotations
import os
import sys
import argparse
import requests
import json
from typing import Any, Dict, List, Optional


def parse_args():
    p = argparse.ArgumentParser(description="Interactive Alpaca position closer")
    p.add_argument("--proxy-url", default="http://localhost:3005/api/alpaca",
                   help="Local proxy base URL (defaults to localhost dev server)")
    p.add_argument("--no-proxy", action="store_true",
                   help="Do not use local proxy; call Alpaca REST API directly")
    p.add_argument("--paper", action="store_true", default=True,
                   help="Use paper API when calling Alpaca directly (default: true)")
    p.add_argument("--live", action="store_true", default=False,
                   help="Use live Alpaca API (overrides --paper)")
    p.add_argument("--api-key", help="Alpaca API key (overrides env vars)")
    p.add_argument("--api-secret", help="Alpaca API secret (overrides env vars)")
    p.add_argument("--yes-all", action="store_true",
                   help="Auto-confirm all closes (still interactive output) — use with care")
    return p.parse_args()


def read_env_credentials(paper: bool, api_key_arg: Optional[str], api_secret_arg: Optional[str]):
    if api_key_arg and api_secret_arg:
        return api_key_arg, api_secret_arg
    if paper:
        return os.getenv("ALPACA_PAPER_API_KEY"), os.getenv("ALPACA_PAPER_API_SECRET")
    else:
        return os.getenv("ALPACA_LIVE_API_KEY"), os.getenv("ALPACA_LIVE_API_SECRET")


def pretty_position(pos: Dict[str, Any]) -> Dict[str, Any]:
    # Normalize various proxy/direct position shapes into a known form
    symbol = pos.get("symbol") or pos.get("ticker") or pos.get("asset_id") or pos.get("sym")
    qty = pos.get("qty") if pos.get("qty") is not None else pos.get("shares")
    try:
        qty = float(qty)
    except Exception:
        qty = pos.get("qty")
    side = pos.get("side")
    # Some proxies may encode short as negative qty; infer side if absent
    if side not in ("long", "short"):
        if isinstance(qty, (int, float)) and qty < 0:
            side = "short"
            qty = abs(qty)
        else:
            side = "long"
    current_price = pos.get("current_price") or pos.get("market_price") or pos.get("price")
    market_value = pos.get("market_value") or pos.get("market_value_usd")
    return {
        "symbol": symbol,
        "qty": qty,
        "side": side,
        "current_price": current_price,
        "market_value": market_value,
        "raw": pos,
    }


def fetch_positions_via_proxy(proxy_url: str, is_paper: bool) -> List[Dict[str, Any]]:
    url = proxy_url.rstrip("/")
    try:
        r = requests.post(url, json={"isPaper": is_paper}, timeout=15)
        r.raise_for_status()
        data = r.json()
        # proxy returns { account, positions }
        positions = data.get("positions") or data.get("data") or data.get("brokerResponse")
        if positions is None:
            # maybe the proxy returned raw Alpaca positions under brokerResponse
            if isinstance(data, list):
                positions = data
            else:
                positions = []
        return [pretty_position(p) for p in positions]
    except Exception as e:
        print(f"Proxy fetch failed: {e}")
        raise


def fetch_positions_direct(base_url: str, api_key: str, api_secret: str) -> List[Dict[str, Any]]:
    base = base_url.rstrip("/")
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }
    url = f"{base}/v2/positions"
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    data = r.json()
    return [pretty_position(p) for p in data]


def close_via_proxy(proxy_url: str, is_paper: bool, symbol: str, qty: float, side: str,
                    api_key: Optional[str], api_secret: Optional[str]) -> Dict[str, Any]:
    """Try proxy liquidation endpoint, on borrow-related rejection retry by
    submitting an explicit market order via the proxy trade endpoint."""
    base = proxy_url.rstrip("/")
    url = base + "/liquidate"
    payload = {"isPaper": is_paper, "symbol": symbol}
    if api_key and api_secret:
        payload.update({"apiKey": api_key, "apiSecret": api_secret})
    r = requests.post(url, json=payload, timeout=30)
    try:
        r.raise_for_status()
        return r.json()
    except requests.HTTPError:
        text = r.text or ""
        # Detect borrow/unavailable message and attempt a direct market order via proxy
        if "borrow" in text.lower() or "cannot cover" in text.lower() or "no borrowable" in text.lower():
            # build order payload: buy to cover shorts, sell to close longs
            order_side = "buy" if side == "short" else "sell"
            order_payload = {
                "isPaper": is_paper,
                "symbol": symbol,
                "side": order_side,
                "qty": qty,
                "type": "market",
                "time_in_force": "day",
            }
            trade_url = base + "/trade"
            try:
                rt = requests.post(trade_url, json=order_payload, timeout=30)
                rt.raise_for_status()
                return {"ok": True, "mode": "order_fallback", "symbol": symbol, "brokerResponse": rt.json()}
            except Exception as e:
                return {"error": f"proxy order fallback failed: {e}", "raw": text}
        try:
            return {"error": text, "status_code": r.status_code}
        except Exception:
            return {"error": "unknown", "status_code": r.status_code}


def close_direct(base_url: str, api_key: str, api_secret: str, symbol: str, qty: float, side: str) -> Dict[str, Any]:
    """Attempt DELETE on position; on borrow-related rejection retry by
    submitting a market order (buy to cover shorts, sell to close longs)."""
    base = base_url.rstrip("/")
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Content-Type": "application/json",
    }
    url = f"{base}/v2/positions/{symbol}"
    r = requests.delete(url, headers=headers, timeout=30)
    try:
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            return {"status": "closed", "http_status": r.status_code}
    except requests.HTTPError:
        text = r.text or ""
        if "borrow" in text.lower() or "cannot cover" in text.lower() or "no borrowable" in text.lower():
            # fallback to an explicit market order
            order_side = "buy" if side == "short" else "sell"
            order_payload = {
                "symbol": symbol,
                "side": order_side,
                "qty": str(qty),
                "type": "market",
                "time_in_force": "day",
            }
            ord_url = f"{base}/v2/orders"
            try:
                ro = requests.post(ord_url, headers=headers, json=order_payload, timeout=30)
                ro.raise_for_status()
                try:
                    return {"ok": True, "mode": "order_fallback", "symbol": symbol, "brokerResponse": ro.json()}
                except Exception:
                    return {"ok": True, "mode": "order_fallback", "symbol": symbol, "http_status": ro.status_code}
            except Exception as e:
                return {"error": f"direct order fallback failed: {e}", "raw": text}
        try:
            return {"error": text, "status_code": r.status_code}
        except Exception:
            return {"error": "unknown", "status_code": r.status_code}


def prompt_yes_no(prompt: str, default: bool = False) -> bool:
    default_str = "Y/n" if default else "y/N"
    answer = input(f"{prompt} [{default_str}] ").strip().lower()
    if answer == "":
        return default
    return answer in ("y", "yes")


def main():
    args = parse_args()
    use_proxy = not args.no_proxy
    is_paper = not args.live

    api_key_arg = args.api_key
    api_secret_arg = args.api_secret

    if use_proxy:
        print(f"Using proxy at {args.proxy_url} to fetch positions (paper={is_paper})")
        try:
            positions = fetch_positions_via_proxy(args.proxy_url, is_paper)
        except Exception:
            print("Falling back to direct Alpaca API. Use --no-proxy to force direct mode.")
            use_proxy = False

    if not use_proxy:
        base = "https://paper-api.alpaca.markets" if is_paper else "https://api.alpaca.markets"
        api_key, api_secret = read_env_credentials(is_paper, api_key_arg, api_secret_arg)
        if not api_key or not api_secret:
            print("API credentials not found in env and not provided via args. Exiting.")
            sys.exit(1)
        print(f"Using direct Alpaca API at {base} (paper={is_paper})")
        positions = fetch_positions_direct(base, api_key, api_secret)

    if not positions:
        print("No open positions found.")
        return

    print(f"Found {len(positions)} open positions:\n")
    for idx, p in enumerate(positions, start=1):
        sym = p.get("symbol")
        qty = p.get("qty")
        side = p.get("side")
        price = p.get("current_price")
        mv = p.get("market_value")
        print(f"{idx}. {sym} — qty: {qty} — side: {side} — price: {price} — market_value: {mv}")

    print("")

    for p in positions:
        sym = p.get("symbol")
        qty = p.get("qty")
        side = p.get("side")
        price = p.get("current_price")
        mv = p.get("market_value")
        prompt = f"Close {sym} (qty={qty}, side={side}, market_value={mv})?"
        confirm = args.yes_all or prompt_yes_no(prompt, default=False)
        if not confirm:
            print(f"Skipping {sym}\n")
            continue

        print(f"Closing {sym}...")
        if use_proxy:
            resp = close_via_proxy(args.proxy_url, is_paper, sym, qty, side, api_key_arg, api_secret_arg)
        else:
            resp = close_direct(base, api_key, api_secret, sym, qty, side)

        print("Result:", json.dumps(resp, indent=2))
        print("")

    print("Done.")


if __name__ == '__main__':
    main()
